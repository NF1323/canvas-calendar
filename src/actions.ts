import { differenceInCalendarDays } from 'date-fns'
import type { EventRow, ExceptionRow, Occurrence, OverrideFields } from './types'
import { dataActions, toast, ui, useData, useUI } from './store'
import * as api from './lib/api'
import { addDaysStr, parse } from './lib/dates'
import { stripEnd } from './calendar/recurrence'

interface Pair<T> { before: T | null; after: T | null }
export interface Action {
  events: Pair<EventRow>[]
  exceptions: Pair<ExceptionRow>[]
}

const undoStack: Action[] = []
const redoStack: Action[] = []
const nowIso = () => new Date().toISOString()
const uid = () => crypto.randomUUID()
const me = () => useData.getState().me!

/* ───────────── núcleo: aplicar + persistir ───────────── */

interface Resolved {
  upsertEvents: EventRow[]
  deleteEvents: string[]
  upsertExc: ExceptionRow[]
  deleteExc: string[]
}

function resolve(a: Action, dir: 'do' | 'undo'): Resolved {
  const r: Resolved = { upsertEvents: [], deleteEvents: [], upsertExc: [], deleteExc: [] }
  const stamp = { updated_by: me().id, updated_at: nowIso() }
  for (const p of a.events) {
    const t = dir === 'do' ? p.after : p.before
    if (t) r.upsertEvents.push({ ...t, ...stamp })
    else r.deleteEvents.push((p.after ?? p.before)!.id)
  }
  for (const p of a.exceptions) {
    const t = dir === 'do' ? p.after : p.before
    if (t) r.upsertExc.push({ ...t, ...stamp })
    else r.deleteExc.push((p.after ?? p.before)!.id)
  }
  return r
}

async function run(a: Action, dir: 'do' | 'undo') {
  if (!navigator.onLine) {
    toast('Sin conexión a internet · no se pudo guardar')
    return false
  }
  const r = resolve(a, dir)
  const snap = { events: useData.getState().events, exceptions: useData.getState().exceptions }
  r.upsertEvents.forEach(dataActions.putEvent)
  r.deleteEvents.forEach(dataActions.removeEvent)
  r.upsertExc.forEach(dataActions.putException)
  r.deleteExc.forEach(dataActions.removeException)
  try {
    for (const e of r.upsertEvents) await api.upsertEvent(e)
    for (const id of r.deleteEvents) await api.deleteEvent(id)
    for (const x of r.upsertExc) await api.upsertException(x)
    for (const id of r.deleteExc) await api.deleteException(id)
    return true
  } catch (err) {
    console.error(err)
    useData.setState(snap)
    toast('No se pudo guardar. Se revirtió el cambio.')
    return false
  }
}

export async function commit(a: Action, record = true) {
  const ok = await run(a, 'do')
  if (ok && record) {
    undoStack.push(a)
    if (undoStack.length > 50) undoStack.shift()
    redoStack.length = 0
  }
  return ok
}

export async function undo() {
  const a = undoStack.pop()
  if (!a) return toast('Nada para deshacer')
  if (await run(a, 'undo')) redoStack.push(a)
}
export async function redo() {
  const a = redoStack.pop()
  if (!a) return toast('Nada para rehacer')
  if (await run(a, 'do')) undoStack.push(a)
}

/* ───────────── diálogos ───────────── */

export const askScope = (verb: string, noOne = false) =>
  new Promise<'one' | 'following' | 'all' | null>((resolve) => ui({ scopeAsk: { verb, noOne, resolve } }))
export const askConfirm = (text: string, ok = 'Confirmar') =>
  new Promise<boolean>((resolve) => ui({ confirm: { text, ok, resolve } }))

/* ───────────── constructores ───────────── */

export function mkEvent(p: Partial<EventRow> & Pick<EventRow, 'title' | 'owner'>): EventRow {
  const m = me()
  return {
    id: uid(),
    description_md: null,
    start_date: null,
    end_date: null,
    all_day: true,
    start_time: null,
    end_time: null,
    rrule: null,
    rrule_until: null,
    done: false,
    is_meetup: false,
    emoji: null,
    cover: null,
    cover_pos: null,
    attachments: [],
    sort_order: 0,
    canvas_x: null,
    canvas_y: null,
    created_by: m.id,
    updated_by: m.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
    ...p,
  }
}

/** Plan de la bandeja como pseudo-ocurrencia (sin día). */
export function eventToOcc(e: EventRow, suffix: 'tray' | 'free' = 'tray'): Occurrence {
  return {
    key: `${e.id}@${suffix}`, event: e, date: '', origDate: '', owner: e.owner, title: e.title,
    description_md: e.description_md, all_day: true, start_time: null, end_time: null, done: e.done,
    emoji: e.emoji, cover: e.cover ?? null, cover_pos: e.cover_pos ?? null, is_meetup: false, recurring: false, dayIndex: 1, dayCount: 1, sort: e.sort_order,
  }
}

export const sortBetween = (sorted: number[], index: number) => {
  const prev = sorted[index - 1]
  const next = sorted[index]
  if (prev !== undefined && next !== undefined) return prev === next ? prev + 0.0001 : (prev + next) / 2
  if (prev !== undefined) return prev + 1
  if (next !== undefined) return next - 1
  return 1
}

/* ───────────── operaciones sobre planes ───────────── */

export async function createEvent(p: Partial<EventRow> & Pick<EventRow, 'title' | 'owner'>) {
  const row = mkEvent(p)
  await commit({ events: [{ before: null, after: row }], exceptions: [] })
  return row
}

export async function createMany(rows: EventRow[]) {
  await commit({ events: rows.map((r) => ({ before: null, after: r })), exceptions: [] })
}

export async function patchEvent(id: string, patch: Partial<EventRow>) {
  const before = useData.getState().events[id]
  if (!before) return
  await commit({ events: [{ before, after: { ...before, ...patch } }], exceptions: [] })
}

export async function softDelete(id: string, withToast = true) {
  const before = useData.getState().events[id]
  if (!before) return
  await commit({ events: [{ before, after: { ...before, deleted_at: nowIso() } }], exceptions: [] })
  if (withToast) toast('Plan eliminado', { label: 'Deshacer', fn: () => void undo() }, 6000)
}

function findExc(eventId: string, date: string) {
  return Object.values(useData.getState().exceptions).find(
    (x) => x.event_id === eventId && x.occurrence_date === date,
  )
}

function overridePair(eventId: string, date: string, patch: OverrideFields): Pair<ExceptionRow> {
  const ex = findExc(eventId, date)
  const after: ExceptionRow = ex
    ? { ...ex, kind: 'override', override: { ...(ex.override ?? {}), ...patch } }
    : { id: uid(), event_id: eventId, occurrence_date: date, kind: 'override', override: patch, updated_by: me().id, updated_at: nowIso() }
  return { before: ex ?? null, after }
}
function skipPair(eventId: string, date: string): Pair<ExceptionRow> {
  const ex = findExc(eventId, date)
  const after: ExceptionRow = ex
    ? { ...ex, kind: 'skip', override: null }
    : { id: uid(), event_id: eventId, occurrence_date: date, kind: 'skip', override: null, updated_by: me().id, updated_at: nowIso() }
  return { before: ex ?? null, after }
}

export async function toggleDone(occ: Occurrence) {
  if (!occ.recurring) return patchEvent(occ.event.id, { done: !occ.done })
  await commit({ events: [], exceptions: [overridePair(occ.event.id, occ.origDate, { done: !occ.done })] })
}

/** Corta una serie: la regla original termina el día anterior a `date`. */
function cutSeries(e: EventRow, date: string): Pair<EventRow> {
  if (e.start_date && date <= e.start_date) return { before: e, after: { ...e, deleted_at: nowIso() } }
  const until = addDaysStr(date, -1)
  const rule = stripEnd(e.rrule ?? '')
  return { before: e, after: { ...e, rrule: `${rule};UNTIL=${until.replace(/-/g, '')}`, rrule_until: until } }
}

export async function deleteOccurrence(occ: Occurrence, scope: 'one' | 'following' | 'all') {
  const e = occ.event
  if (!occ.recurring || scope === 'all') return softDelete(e.id)
  if (scope === 'one') {
    await commit({ events: [], exceptions: [skipPair(e.id, occ.origDate)] })
  } else {
    await commit({ events: [cutSeries(e, occ.origDate)], exceptions: [] })
  }
  toast('Plan eliminado', { label: 'Deshacer', fn: () => void undo() }, 6000)
}

export interface OccEdit {
  title?: string
  description_md?: string | null
  owner?: EventRow['owner']
  all_day?: boolean
  start_time?: string | null
  end_time?: string | null
  emoji?: string | null
  cover?: string | null
  cover_pos?: string | null
  attachments?: EventRow['attachments']
  is_meetup?: boolean
  sort_order?: number
  /** nueva fecha de la ocurrencia */
  date?: string
  rrule?: string | null
  rrule_until?: string | null
}

const OVERRIDE_KEYS = ['title', 'description_md', 'owner', 'all_day', 'start_time', 'end_time', 'emoji'] as const

export async function editOccurrence(occ: Occurrence, ed: OccEdit, scope: 'one' | 'following' | 'all') {
  const e = occ.event
  const { date, ...rest } = ed
  const fields: Partial<EventRow> = { ...rest } as Partial<EventRow>

  if (!occ.recurring) {
    const patch: Partial<EventRow> = { ...fields }
    if (date && date !== occ.date) {
      const delta = differenceInCalendarDays(parse(date), parse(occ.date))
      patch.start_date = addDaysStr(e.start_date!, delta)
      patch.end_date = e.end_date ? addDaysStr(e.end_date, delta) : null
    }
    return patchEvent(e.id, patch)
  }

  if (scope === 'one') {
    const ov: OverrideFields = {}
    for (const k of OVERRIDE_KEYS) if (k in fields) (ov as Record<string, unknown>)[k] = (fields as Record<string, unknown>)[k]
    if (date && date !== occ.date) ov.start_date = date
    return commit({ events: [], exceptions: [overridePair(e.id, occ.origDate, ov)] })
  }

  if (scope === 'following') {
    const start = date ?? occ.origDate
    const cut = cutSeries(e, occ.origDate)
    const next = mkEvent({
      ...e,
      ...fields,
      id: uid(),
      title: fields.title ?? e.title,
      owner: fields.owner ?? e.owner,
      start_date: start,
      end_date: null,
      created_at: nowIso(),
      done: false,
    })
    return commit({ events: [cut, { before: null, after: next }], exceptions: [] })
  }

  // all
  const patch: Partial<EventRow> = { ...fields }
  if (date && date !== occ.date) {
    const delta = differenceInCalendarDays(parse(date), parse(occ.date))
    patch.start_date = addDaysStr(e.start_date!, delta)
  }
  return patchEvent(e.id, patch)
}

export async function moveToDay(occ: Occurrence, day: string, sort?: number) {
  if (occ.recurring) {
    if (day === occ.date && sort === undefined) return
    const scope = await askScope('Mover')
    if (!scope) return
    return editOccurrence(occ, { date: day, ...(sort !== undefined ? { sort_order: sort } : {}) }, scope)
  }
  const e = occ.event
  const patch: Partial<EventRow> = {}
  if (!e.start_date) {
    patch.start_date = day
    patch.end_date = null
    patch.canvas_x = null
    patch.canvas_y = null
  } else if (day !== occ.date) {
    const delta = differenceInCalendarDays(parse(day), parse(occ.date))
    patch.start_date = addDaysStr(e.start_date, delta)
    patch.end_date = e.end_date ? addDaysStr(e.end_date, delta) : null
  }
  if (sort !== undefined) patch.sort_order = sort
  if (Object.keys(patch).length) await patchEvent(e.id, patch)
}

export async function moveToTray(occ: Occurrence) {
  if (occ.recurring) return toast('Un plan repetitivo no se puede mandar a la bandeja')
  await patchEvent(occ.event.id, { start_date: null, end_date: null, canvas_x: null, canvas_y: null, sort_order: Date.now() / 1e9 })
  toast('Plan movido a la bandeja', { label: 'Deshacer', fn: () => void undo() })
}

/** Suelta el plan en un punto libre del canvas (sin día). */
export async function moveToCanvas(occ: Occurrence, wx: number, wy: number) {
  if (occ.recurring) return toast('Un plan repetitivo no puede quedar suelto')
  const patch: Partial<EventRow> = { start_date: null, end_date: null, canvas_x: Math.round(wx), canvas_y: Math.round(wy) }
  if (occ.event.canvas_x !== null && !occ.event.start_date) delete patch.start_date
  await patchEvent(occ.event.id, patch)
}

export async function duplicateTo(occ: Occurrence, day: string | null, sort?: number) {
  const e = occ.event
  const row = mkEvent({
    owner: occ.owner, title: occ.title, description_md: occ.description_md, emoji: occ.emoji, cover: occ.cover ?? null, cover_pos: occ.cover_pos ?? null,
    all_day: occ.all_day, start_time: occ.start_time, end_time: occ.end_time, is_meetup: e.is_meetup,
    start_date: day, sort_order: sort ?? e.sort_order + 0.5,
  })
  await commit({ events: [{ before: null, after: row }], exceptions: [] })
  return row
}

export const clearEditorIfGone = () => {
  const ed = useUI.getState().editor
  if (ed?.eventId && !useData.getState().events[ed.eventId]) ui({ editor: null })
}
