import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Anchor, CanvasItem, EventRow, ExceptionRow, Profile } from '../types'
import { itemStore } from '../canvasItems'
import { isLocal, supabase } from '../lib/supabase'
import * as api from '../lib/api'
import { dataActions, ownerColor, pulse, setPeer, toast, ui, useData, useUI, type Draft } from '../store'
import { model } from '../calendar/model'
import { anchorToWorld } from './anchor'
import { cam } from '../canvas/camera'
import { monthTitle } from '../lib/dates'
import { computeWindow } from '../lib/dates'

type Msg =
  | { type: 'cursor'; a: Anchor }
  | { type: 'viewport'; a: Anchor; s: number; focus: string | null }
  | { type: 'selection'; days: string[] }
  | { type: 'draft'; d: Draft | null }
  | { type: 'drag'; d: Draft | null }
  | { type: 'profile'; p: Pick<Profile, 'person' | 'display_name' | 'color' | 'avatar'> }

let sender: ((m: Msg) => void) | null = null
/** Cuántas otras personas están conectadas ahora (si no hay nadie, no se transmite nada). */
export const onlinePeers = () => Object.values(useUI.getState().peers).filter((p) => p.online).length
export const sendMsg = (m: Msg) => {
  if (m.type !== 'profile' && onlinePeers() === 0) return
  sender?.(m)
}
/** Con más gente conectada, los mensajes efímeros (cursor, cámara) se espacian para no saturar el canal. */
export const throttleMs = (base: number) => Math.min(base * 6, base + 22 * onlinePeers())

/** Le manda mi nombre / color / foto al otro. */
export function sendProfile() {
  const me = useData.getState().me
  if (!me) return
  sendMsg({ type: 'profile', p: { person: me.person, display_name: me.display_name, color: me.color, avatar: me.avatar ?? null } })
}

let idle = false
let setIdleFn: ((v: boolean) => void) | null = null

function handle(m: Msg, from: string) {
  const set = (p: Parameters<typeof setPeer>[1]) => setPeer(from, p)
  switch (m.type) {
    case 'cursor':
      set({ cursor: m.a, cursorAt: Date.now() })
      break
    case 'viewport': {
      const lay = model.current?.layout
      let viewing: string | null = null
      if (lay && 'd' in m.a) viewing = monthTitle(m.a.d.slice(0, 7))
      else if (lay && 'm' in m.a) viewing = monthTitle(m.a.m)
      set({ viewing })
      if (useUI.getState().following === from && lay) {
        const w = anchorToWorld(m.a, lay)
        if (w) {
          ui({ focusDay: m.focus && lay.dayRects[m.focus] ? m.focus : null })
          cam.flyTo(
            { s: m.s, x: cam.vw / 2 - w.x * m.s, y: cam.vh / 2 - w.y * m.s },
            { duration: 420, push: false },
          )
        }
      }
      break
    }
    case 'selection':
      set({ selection: m.days })
      break
    case 'profile':
      useData.setState((s) => ({
        profiles: s.profiles.map((p) => (p.person === from && p.person !== s.me?.person ? { ...p, ...m.p, person: p.person } : p)),
      }))
      break
    case 'draft':
    case 'drag':
      set({ draft: m.d, typing: m.type === 'draft' && !!m.d })
      break
  }
}

/* ───────────── cambios de la base ───────────── */

const ownerColorOf = (profileId: string) => {
  const p = useData.getState().profiles.find((x) => x.id === profileId)
  return p ? ownerColor(p.person) : undefined
}

function onEventChange(kind: string, row: EventRow, old: Partial<EventRow>) {
  const me = useData.getState().me!
  if (kind === 'DELETE') {
    dataActions.removeEvent(old.id!)
    return
  }
  dataActions.putEvent(row)
  if (row.updated_by !== me.id) {
    if (row.start_date) pulse(row.start_date, ownerColorOf(row.updated_by))
    const ed = useUI.getState().editor
    if (ed?.eventId === row.id) {
      const who = useData.getState().profiles.find((p) => p.id === row.updated_by)
      ui({ conflict: { eventId: row.id, by: who?.display_name ?? 'Otra persona' } })
    }
  }
}
function onExceptionChange(kind: string, row: ExceptionRow, old: Partial<ExceptionRow>) {
  if (kind === 'DELETE') dataActions.removeException(old.id!)
  else {
    dataActions.putException(row)
    if (row.updated_by !== useData.getState().me!.id) pulse(row.occurrence_date, ownerColorOf(row.updated_by))
  }
}

export async function reloadAll(withPulse = false) {
  const before = useData.getState().events
  const [{ events, exceptions }, items] = await Promise.all([
    api.loadAll(computeWindow(useData.getState().today).start),
    api.loadItems().catch((e) => {
      console.warn('canvas_items no disponible (¿falta correr 0002/0003?)', e)
      return null
    }),
  ])
  dataActions.replaceAll(events, exceptions)
  if (items) itemStore.replaceAll(items)
  if (withPulse) {
    const me = useData.getState().me!
    for (const e of events) {
      const b = before[e.id]
      if (e.updated_by !== me.id && (!b || b.updated_at !== e.updated_at) && e.start_date) pulse(e.start_date, ownerColorOf(e.updated_by))
    }
  }
}

/* ───────────── arranque ───────────── */

export function startRealtime(me: Profile): () => void {
  const stops: (() => void)[] = []

  // actividad → idle
  let lastAct = Date.now()
  const act = () => {
    lastAct = Date.now()
    if (idle) setIdle(false)
  }
  const setIdle = (v: boolean) => {
    idle = v
    setIdleFn?.(v)
  }
  const idleTimer = setInterval(() => {
    if (!idle && Date.now() - lastAct > 60000) setIdle(true)
  }, 5000)
  const vis = () => (document.hidden ? setIdle(true) : act())
  window.addEventListener('pointermove', act, { passive: true })
  window.addEventListener('keydown', act)
  document.addEventListener('visibilitychange', vis)
  stops.push(() => {
    clearInterval(idleTimer)
    window.removeEventListener('pointermove', act)
    window.removeEventListener('keydown', act)
    document.removeEventListener('visibilitychange', vis)
  })

  const nameOf = (person: string) => useData.getState().profiles.find((p) => p.person === person)?.display_name ?? person
  const markOnline = (person: string, on: boolean, idleNow: boolean) => {
    if (person === me.person) return
    const prev = useUI.getState().peers[person]?.online ?? false
    setPeer(person, { online: on, idle: idleNow })
    if (on && !prev) {
      sendProfile()
      toast(`${nameOf(person)} se conectó`, undefined, 3500)
    }
    if (!on && prev) setPeer(person, { lastSeen: new Date().toISOString() })
    if (!on) {
      setPeer(person, { cursor: null, draft: null, typing: false })
      if (useUI.getState().following === person) ui({ following: null })
    }
  }

  if (isLocal) {
    /* modo local: BroadcastChannel + storage */
    const bc = new BroadcastChannel('cc_room')
    const heard: Record<string, number> = {}
    const hello = () => bc.postMessage({ from: me.person, kind: 'hello', idle })
    const iv = setInterval(() => {
      hello()
      for (const [who, at] of Object.entries(heard)) {
        if (Date.now() - at > 6500) { delete heard[who]; markOnline(who, false, false) }
      }
    }, 2000)
    bc.onmessage = (ev) => {
      const d = ev.data
      if (d.from === me.person) return
      if (d.kind === 'hello') {
        const first = !heard[d.from]
        heard[d.from] = Date.now()
        markOnline(d.from, true, !!d.idle)
        if (first) hello()
      } else if (d.kind === 'bye') {
        delete heard[d.from]
        markOnline(d.from, false, false)
      } else if (d.kind === 'msg') handle(d.msg as Msg, d.from)
    }
    sender = (m) => bc.postMessage({ from: me.person, kind: 'msg', msg: m })
    setIdleFn = hello
    hello()
    let t: ReturnType<typeof setTimeout> | undefined
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'cc_profiles') {
        const all = api.localProfiles()
        useData.setState((s) => ({ profiles: all, me: all.find((p) => p.id === s.me?.id) ?? s.me }))
        return
      }
      if (e.key !== 'cc_events' && e.key !== 'cc_exceptions' && e.key !== 'cc_items') return
      clearTimeout(t)
      t = setTimeout(() => void reloadAll(true), 60)
    }
    const bye = () => bc.postMessage({ from: me.person, kind: 'bye' })
    window.addEventListener('storage', onStorage)
    window.addEventListener('beforeunload', bye)
    stops.push(() => {
      clearInterval(iv)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('beforeunload', bye)
      bye()
      bc.close()
      sender = null
      setIdleFn = null
    })
    return () => stops.forEach((f) => f())
  }

  /* modo Supabase */
  const sb = supabase!
  let ch: RealtimeChannel
  let everConnected = false
  let dropped = false

  const track = () => ch.track({ person: me.person, online_at: new Date().toISOString(), idle })
  const syncPresence = () => {
    const st = ch.presenceState() as Record<string, { idle?: boolean }[]>
    const known = new Set([...Object.keys(useUI.getState().peers), ...Object.keys(st)])
    for (const who of known) {
      const o = st[who]?.[0]
      markOnline(who, !!o, !!o?.idle)
    }
  }

  ch = sb.channel('room:main', { config: { broadcast: { self: false }, presence: { key: me.person } } })
  for (const t of ['cursor', 'viewport', 'selection', 'draft', 'drag', 'profile'] as const) {
    ch.on('broadcast', { event: t }, ({ payload }) => handle({ type: t, ...payload } as Msg, (payload as { from?: string }).from ?? ''))
  }
  ch.on('presence', { event: 'sync' }, syncPresence)
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (p) =>
    onEventChange(p.eventType, p.new as EventRow, p.old as Partial<EventRow>),
  )
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'event_exceptions' }, (p) =>
    onExceptionChange(p.eventType, p.new as ExceptionRow, p.old as Partial<ExceptionRow>),
  )
  // canal aparte: si la tabla canvas_items no existe todavía, el canal principal no se rompe
  const itemsCh = sb
    .channel('room:items')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'canvas_items' }, (p) => {
      if (p.eventType === 'DELETE') itemStore.remove((p.old as CanvasItem).id)
      else itemStore.put(p.new as CanvasItem)
    })
    .subscribe((st) => {
      if (st === 'CHANNEL_ERROR') console.warn('Realtime de canvas_items no disponible')
    })
  ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      if (everConnected && dropped) {
        await reloadAll(true).catch(() => undefined)
        ui({ conn: 'back' })
        setTimeout(() => useUI.getState().conn === 'back' && ui({ conn: 'online' }), 2000)
      } else ui({ conn: 'online' })
      everConnected = true
      dropped = false
      track()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      dropped = true
      ui({ conn: 'offline' })
      for (const who of Object.keys(useUI.getState().peers)) markOnline(who, false, false)
    }
  })
  sender = (m) => {
    const { type, ...payload } = m
    void ch.send({ type: 'broadcast', event: type, payload: { ...payload, from: me.person } })
  }
  setIdleFn = () => void track()
  const goOffline = () => { dropped = true; ui({ conn: 'offline' }) }
  const goOnline = () => {
    if (useUI.getState().conn === 'offline') {
      void reloadAll(true).then(() => {
        ui({ conn: 'back' })
        setTimeout(() => useUI.getState().conn === 'back' && ui({ conn: 'online' }), 2000)
      })
    }
  }
  const retry = setInterval(() => {
    if (useUI.getState().conn !== 'offline') return
    reloadAll(true).then(() => ui({ conn: 'online' })).catch(() => undefined)
  }, 12000)
  window.addEventListener('offline', goOffline)
  window.addEventListener('online', goOnline)
  stops.push(() => {
    window.removeEventListener('offline', goOffline)
    window.removeEventListener('online', goOnline)
    void sb.removeChannel(ch)
    void sb.removeChannel(itemsCh)
    clearInterval(retry)
    sender = null
    setIdleFn = null
  })
  return () => stops.forEach((f) => f())
}
