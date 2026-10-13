import { create } from 'zustand'
import type { Attachment, Anchor, EventRow, ExceptionRow, Occurrence, Owner, Person, Profile } from './types'
import { todayStr } from './lib/dates'

/* ───────────── datos ───────────── */

interface DataState {
  events: Record<string, EventRow>
  exceptions: Record<string, ExceptionRow>
  profiles: Profile[]
  me: Profile | null
  ready: boolean
  today: string
}
export const useData = create<DataState>(() => ({
  events: {},
  exceptions: {},
  profiles: [],
  me: null,
  ready: false,
  today: todayStr(),
}))

const norm = (e: EventRow): EventRow => ({ ...e, canvas_x: e.canvas_x ?? null, canvas_y: e.canvas_y ?? null, cover: e.cover ?? null, cover_pos: e.cover_pos ?? null, attachments: e.attachments ?? [] })

export const dataActions = {
  replaceAll(events: EventRow[], exceptions: ExceptionRow[]) {
    useData.setState({
      events: Object.fromEntries(events.map((e) => [e.id, norm(e)])),
      exceptions: Object.fromEntries(exceptions.map((x) => [x.id, x])),
      ready: true,
    })
  },
  putEvent(e: EventRow) {
    useData.setState((s) => ({ events: { ...s.events, [e.id]: norm(e) } }))
  },
  removeEvent(id: string) {
    useData.setState((s) => {
      const events = { ...s.events }
      delete events[id]
      const exceptions = Object.fromEntries(Object.entries(s.exceptions).filter(([, x]) => x.event_id !== id))
      return { events, exceptions }
    })
  },
  putException(x: ExceptionRow) {
    useData.setState((s) => {
      // la unicidad es (event_id, occurrence_date): si llega con otro id, reemplaza
      const exceptions = Object.fromEntries(
        Object.entries(s.exceptions).filter(
          ([id, y]) => id === x.id || !(y.event_id === x.event_id && y.occurrence_date === x.occurrence_date),
        ),
      )
      exceptions[x.id] = x
      return { exceptions }
    })
  },
  removeException(id: string) {
    useData.setState((s) => {
      const exceptions = { ...s.exceptions }
      delete exceptions[id]
      return { exceptions }
    })
  },
}

/* ───────────── UI ───────────── */

export type Lod = 'far' | 'mid' | 'near'
/** Solo se guardan los dueños ocultos (false); lo que falta se ve. Así funciona con cualquier cantidad de integrantes. */
export type Filter = Record<string, boolean>
export const shows = (f: Filter, o: string) => f[o] !== false
/** Todos los posibles dueños: integrantes + el grupo + externos. */
export const ownerKeys = (profiles: Profile[]): string[] => [...profiles.map((p) => p.person), 'ambos', 'externo']
export interface Prefs {
  theme: 'light' | 'dark' | 'auto'
  wheel: 'zoom' | 'pan'
  reduceMotion: boolean
  holidays: boolean
  /** 'grid' = cuadrícula de calendario por defecto; 'custom' = posiciones personalizadas */
  view: 'grid' | 'custom'
  /** arrastrar en espacio vacío: cuadro de selección (a lo Windows) o mover el canvas */
  dragEmpty: 'select' | 'pan'
}

export interface EditorState {
  /** id de evento al editar; null al crear */
  eventId: string | null
  /** clave de la ocurrencia (si es repetitivo) */
  occKey?: string
  day: string | null
  days?: string[]
  /** owner inicial al crear (p. ej. al duplicar) */
  seed?: Partial<EventRow>
}

export interface MenuItem { label: string; onClick?: () => void; danger?: boolean; sep?: boolean; sub?: MenuItem[] }
export interface Toast { id: number; text: string; action?: { label: string; fn: () => void } }

export interface Draft { day: string | null; title: string; owner: Owner; id: string; kind: 'draft' | 'drag'; editing?: string | null }

export interface DragState {
  occ: Occurrence
  x: number
  y: number
  dup: boolean
  overDay: string | null
  overTray: boolean
}

/** Estado en vivo de CADA otra persona conectada. */
export interface PeerState {
  online: boolean
  idle: boolean
  lastSeen: string | null
  viewing: string | null
  cursor: Anchor | null
  cursorAt: number
  selection: string[]
  draft: Draft | null
  typing: boolean
}
export const newPeer = (lastSeen: string | null = null): PeerState => ({
  online: false, idle: false, lastSeen, viewing: null, cursor: null, cursorAt: 0, selection: [], draft: null, typing: false,
})

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v ? { ...d, ...JSON.parse(v) } : d
  } catch {
    return d
  }
}
const save = (k: string, v: unknown) => {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin storage */ }
}

interface UIState {
  lod: Lod
  scale: number
  viewRect: { x: number; y: number; w: number; h: number }
  focusDay: string | null
  selection: string[]
  selAnchor: string | null
  editor: EditorState | null
  trayOpen: boolean
  searchOpen: boolean
  helpOpen: boolean
  settingsOpen: boolean
  menu: { x: number; y: number; items: MenuItem[] } | null
  expanded: string[]
  toasts: Toast[]
  highlight: string | null
  pulses: Record<string, number>
  /** color de quien hizo el cambio que provocó el pulso, por día */
  pulseColors: Record<string, string>
  filter: Filter
  shake: number
  prefs: Prefs
  scopeAsk: { verb: string; noOne: boolean; resolve: (s: 'one' | 'following' | 'all' | null) => void } | null
  confirm: { text: string; ok: string; resolve: (b: boolean) => void } | null
  drag: DragState | null
  conn: 'online' | 'offline' | 'back'
  /** otras personas del grupo, por slug */
  peers: Record<string, PeerState>
  /** a quién estoy siguiendo (su cámara), si a alguien */
  following: string | null
  hiddenNotice: { id: string; until: number } | null
  conflict: { eventId: string; by: string } | null
  /** selector de rango: se toca el primer día y después el último */
  rangePick: { from: string | null } | null
  selPanel: boolean
  /** días que se iluminan un momento (ej. la semana actual) */
  glow: string[]
  /** link de YouTube pegado: se pregunta si va como link o incrustado */
  ytAsk: { url: string; id: string; at: { x: number; y: number } } | null
  /** tarjeta sobre la que se está arrastrando un objeto (para adjuntarlo) */
  attachHover: string | null
  /** adjunto abierto en el visor */
  viewAtt: Attachment | null
}

export const useUI = create<UIState>(() => ({
  lod: 'mid',
  scale: 0.1,
  viewRect: { x: 0, y: 0, w: 1, h: 1 },
  focusDay: null,
  selection: [],
  selAnchor: null,
  editor: null,
  trayOpen: false,
  searchOpen: false,
  helpOpen: false,
  settingsOpen: false,
  menu: null,
  expanded: [],
  toasts: [],
  highlight: null,
  pulses: {},
  pulseColors: {},
  filter: load<Filter>('cc_filter', {}),
  shake: 0,
  prefs: load<Prefs>('cc_prefs', { theme: 'dark', wheel: 'zoom', reduceMotion: false, holidays: true, view: 'custom', dragEmpty: 'select' }),
  scopeAsk: null,
  confirm: null,
  drag: null,
  conn: 'online',
  peers: {},
  following: null,
  hiddenNotice: null,
  conflict: null,
  rangePick: null,
  selPanel: true,
  glow: [],
  ytAsk: null,
  attachHover: null,
  viewAtt: null,
}))

export const ui = (p: Partial<ReturnType<typeof useUI.getState>>) => useUI.setState(p)

export function setFilter(f: Filter) {
  const keys = ownerKeys(useData.getState().profiles)
  if (keys.every((k) => !shows(f, k))) {
    ui({ shake: Date.now() })
    return
  }
  save('cc_filter', f)
  ui({ filter: f })
}
/** Deja visibles solo estos dueños. */
export const onlyOwners = (keep: string[]): Filter =>
  Object.fromEntries(ownerKeys(useData.getState().profiles).map((k) => [k, keep.includes(k)]))
export function setPrefs(p: Partial<Prefs>) {
  const next = { ...useUI.getState().prefs, ...p }
  save('cc_prefs', next)
  ui({ prefs: next })
}
export function setPeer(person: string, patch: Partial<PeerState>) {
  useUI.setState((s) => ({ peers: { ...s.peers, [person]: { ...(s.peers[person] ?? newPeer()), ...patch } } }))
}

let toastId = 1
export function toast(text: string, action?: Toast['action'], ms = 5000) {
  const id = toastId++
  useUI.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, action }] }))
  setTimeout(() => useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms)
}
export function pulse(day: string, color?: string) {
  useUI.setState((s) => ({ pulses: { ...s.pulses, [day]: Date.now() }, pulseColors: color ? { ...s.pulseColors, [day]: color } : s.pulseColors }))
  setTimeout(
    () =>
      useUI.setState((s) => {
        const p = { ...s.pulses }
        if (Date.now() - (p[day] ?? 0) >= 590) delete p[day]
        return { pulses: p }
      }),
    650,
  )
}

const PALETTE = ['#4C8BF5', '#FF5C8A', '#F59E0B', '#22C55E', '#06B6D4', '#EF4444', '#A855F7', '#EAB308', '#14B8A6', '#F97316']
/** Color de reserva estable para alguien sin color propio. */
export const hashColor = (s: string) => PALETTE[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length]
export const othersOf = (me: Profile | null, profiles: Profile[]) => profiles.filter((p) => p.person !== me?.person)
export const ownerColor = (o: Owner, profiles?: Profile[]) => {
  if (o === 'ambos') return '#8B5CF6'
  if (o === 'externo') return '#14B8A6'
  const p = (profiles ?? useData.getState().profiles).find((x) => x.person === o)
  return p?.color ?? hashColor(o)
}
export const ownerName = (o: Owner, profiles?: Profile[]) => {
  if (o === 'ambos') return 'Todos'
  if (o === 'externo') return 'Externo'
  return (profiles ?? useData.getState().profiles).find((x) => x.person === o)?.display_name ?? o
}
