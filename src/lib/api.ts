import type { CanvasItem, EventRow, ExceptionRow, Person, Profile } from '../types'
import { isLocal, supabase } from './supabase'
import { addDaysStr } from './dates'

/** Grupo de ejemplo del modo local. Cualquiera puede sumarse con `localJoin`. */
export const LOCAL_PROFILES: Profile[] = [
  { id: 'local-alex', person: 'alex', display_name: 'Alex', color: '#4C8BF5' },
  { id: 'local-sam', person: 'sam', display_name: 'Sam', color: '#FF5C8A' },
  { id: 'local-luz', person: 'luz', display_name: 'Luz', color: '#22C55E' },
  { id: 'local-max', person: 'max', display_name: 'Max', color: '#F59E0B' },
]
const LS_MEMBERS = 'cc_members'

const LS_EVENTS = 'cc_events'
const LS_EXC = 'cc_exceptions'
const SS_ME = 'cc_local_me'

const readLS = <T,>(k: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(k) || '[]')
  } catch {
    return []
  }
}
const writeLS = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))

export type SessionResult =
  | { kind: 'none' }
  | { kind: 'noaccess' }
  | { kind: 'ok'; me: Profile; profiles: Profile[] }

export async function getSession(): Promise<SessionResult> {
  if (isLocal) {
    const p = sessionStorage.getItem(SS_ME) as Person | null
    const all = localProfiles()
    const me = all.find((x) => x.person === p)
    return me ? { kind: 'ok', me, profiles: all } : { kind: 'none' }
  }
  const { data } = await supabase!.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) return { kind: 'none' }
  const { data: profiles, error } = await supabase!.from('profiles').select('*')
  if (error || !profiles) return { kind: 'noaccess' }
  const me = (profiles as Profile[]).find((p) => p.id === uid)
  if (!me) return { kind: 'noaccess' }
  return { kind: 'ok', me, profiles: profiles as Profile[] }
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  return error ? 'Email o contraseña incorrectos' : null
}
export function localSignIn(p: Person) {
  sessionStorage.setItem(SS_ME, p)
}
export async function signOut() {
  if (isLocal) sessionStorage.removeItem(SS_ME)
  else await supabase!.auth.signOut()
}

export async function loadAll(winStart: string): Promise<{ events: EventRow[]; exceptions: ExceptionRow[] }> {
  if (isLocal) {
    return {
      events: readLS<EventRow>(LS_EVENTS).filter((e) => !e.deleted_at),
      exceptions: readLS<ExceptionRow>(LS_EXC),
    }
  }
  const ws = winStart
  const we = addDaysStr(winStart, 400)
  const or = [
    'start_date.is.null',
    `and(start_date.gte.${ws},start_date.lte.${we})`,
    `and(end_date.gte.${ws},end_date.lte.${we})`,
    `and(start_date.lt.${ws},end_date.gt.${we})`,
    `and(rrule.not.is.null,or(rrule_until.is.null,rrule_until.gte.${ws}))`,
  ].join(',')
  const [ev, ex] = await Promise.all([
    supabase!.from('events').select('*').is('deleted_at', null).or(or),
    supabase!.from('event_exceptions').select('*').gte('occurrence_date', addDaysStr(ws, -60)),
  ])
  if (ev.error) throw ev.error
  if (ex.error) throw ex.error
  return { events: ev.data as EventRow[], exceptions: ex.data as ExceptionRow[] }
}

const LS_PROFILES = 'cc_profiles'
type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'color' | 'avatar'>>

export function localProfiles(): Profile[] {
  let o: Record<string, ProfilePatch> = {}
  try { o = JSON.parse(localStorage.getItem(LS_PROFILES) || '{}') } catch { /* sin overrides */ }
  let extra: Profile[] = []
  try { extra = JSON.parse(localStorage.getItem(LS_MEMBERS) || '[]') } catch { /* sin integrantes extra */ }
  return [...LOCAL_PROFILES, ...extra].map((p) => ({ ...p, ...(o[p.id] ?? {}) }))
}

const slugify = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'integrante'

/** Modo local: suma a alguien nuevo al grupo (sin límite de integrantes) y lo deja con la sesión iniciada. */
export function localJoin(name: string, color: string): string {
  const all = localProfiles()
  const base = ['ambos', 'externo'].includes(slugify(name)) ? 'integrante' : slugify(name)
  let slug = base
  for (let i = 2; all.some((p) => p.person === slug); i++) slug = `${base}-${i}`
  const extra: Profile[] = (() => { try { return JSON.parse(localStorage.getItem(LS_MEMBERS) || '[]') } catch { return [] } })()
  extra.push({ id: `local-${slug}`, person: slug, display_name: name.trim().slice(0, 24), color })
  localStorage.setItem(LS_MEMBERS, JSON.stringify(extra))
  sessionStorage.setItem(SS_ME, slug)
  return slug
}

/** Supabase: crea la cuenta y entra al grupo con el código de invitación. */
export async function joinGroup(p: { email: string; password: string; code: string; name: string; color: string }): Promise<string | null> {
  const sb = supabase!
  const up = await sb.auth.signUp({ email: p.email, password: p.password })
  if (up.error) return up.error.message
  if (!up.data.session) {
    const si = await sb.auth.signInWithPassword({ email: p.email, password: p.password })
    if (si.error) return 'Revisá tu mail para confirmar la cuenta y después iniciá sesión.'
  }
  const { error } = await sb.rpc('join_group', { p_code: p.code.trim(), p_name: p.name.trim(), p_color: p.color })
  if (error) {
    await sb.auth.signOut()
    return /invalid invite/i.test(error.message) ? 'El código de invitación no es válido.' : /full/i.test(error.message) ? 'El grupo está completo.' : error.message
  }
  return null
}

/** Solo admins: código vigente para invitar gente. */
export async function getInviteCode(): Promise<string | null> {
  if (isLocal) return null
  const { data } = await supabase!.from('group_settings').select('invite_code').maybeSingle()
  return (data as { invite_code?: string } | null)?.invite_code ?? null
}
export async function regenerateInviteCode(): Promise<string | null> {
  const { data, error } = await supabase!.rpc('regenerate_invite_code')
  return error ? null : (data as string)
}

export async function updateProfile(id: string, patch: ProfilePatch) {
  if (isLocal) {
    let o: Record<string, ProfilePatch> = {}
    try { o = JSON.parse(localStorage.getItem(LS_PROFILES) || '{}') } catch { /* nuevo */ }
    o[id] = { ...(o[id] ?? {}), ...patch }
    localStorage.setItem(LS_PROFILES, JSON.stringify(o))
    return
  }
  const { error } = await supabase!.from('profiles').update(patch).eq('id', id)
  if (error) throw error
}

const LS_ITEMS = 'cc_items'

export async function loadItems(): Promise<CanvasItem[]> {
  if (isLocal) return readLS<CanvasItem>(LS_ITEMS)
  const { data, error } = await supabase!.from('canvas_items').select('*')
  if (error) throw error
  return data as CanvasItem[]
}
export async function upsertItem(row: CanvasItem) {
  if (isLocal) {
    const all = readLS<CanvasItem>(LS_ITEMS)
    const i = all.findIndex((e) => e.id === row.id)
    if (i >= 0) all[i] = row
    else all.push(row)
    writeLS(LS_ITEMS, all)
    return
  }
  const { error } = await supabase!.from('canvas_items').upsert(row)
  if (error) throw error
}
export async function deleteItem(id: string) {
  if (isLocal) {
    writeLS(LS_ITEMS, readLS<CanvasItem>(LS_ITEMS).filter((x) => x.id !== id))
    return
  }
  const { error } = await supabase!.from('canvas_items').delete().eq('id', id)
  if (error) throw error
}

export async function upsertEvent(row: EventRow) {
  if (isLocal) {
    const all = readLS<EventRow>(LS_EVENTS)
    const i = all.findIndex((e) => e.id === row.id)
    if (i >= 0) all[i] = row
    else all.push(row)
    writeLS(LS_EVENTS, all)
    return
  }
  const { error } = await supabase!.from('events').upsert(row)
  if (error) throw error
}
export async function deleteEvent(id: string) {
  if (isLocal) {
    writeLS(LS_EVENTS, readLS<EventRow>(LS_EVENTS).filter((e) => e.id !== id))
    writeLS(LS_EXC, readLS<ExceptionRow>(LS_EXC).filter((x) => x.event_id !== id))
    return
  }
  const { error } = await supabase!.from('events').delete().eq('id', id)
  if (error) throw error
}
export async function upsertException(row: ExceptionRow) {
  if (isLocal) {
    const all = readLS<ExceptionRow>(LS_EXC)
    const i = all.findIndex((e) => e.id === row.id)
    if (i >= 0) all[i] = row
    else all.push(row)
    writeLS(LS_EXC, all)
    return
  }
  const { error } = await supabase!.from('event_exceptions').upsert(row, { onConflict: 'event_id,occurrence_date' })
  if (error) throw error
}
export async function deleteException(id: string) {
  if (isLocal) {
    writeLS(LS_EXC, readLS<ExceptionRow>(LS_EXC).filter((x) => x.id !== id))
    return
  }
  const { error } = await supabase!.from('event_exceptions').delete().eq('id', id)
  if (error) throw error
}
