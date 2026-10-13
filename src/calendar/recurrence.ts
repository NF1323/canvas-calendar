import { RRule } from 'rrule'
import type { EventRow, ExceptionRow, Occurrence } from '../types'
import { addDaysStr, DOW_FULL, eachDay, fmt, parse, weekdayIdx } from '../lib/dates'

const CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const CODE_MONDAY_FIRST = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

const utc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const utcStr = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/* ───────────── Presets de repetición ───────────── */

export type Preset =
  | 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthday' | 'monthnth' | 'yearly' | 'weekdays' | 'custom'

export interface CustomRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  /** 0 = lunes … 6 = domingo */
  days: number[]
  monthMode: 'day' | 'nth'
  endType: 'never' | 'date' | 'count'
  until: string
  count: number
}

export interface RuleSpec {
  preset: Preset
  custom: CustomRule
}

export const defaultCustom = (start: string): CustomRule => ({
  freq: 'WEEKLY',
  interval: 1,
  days: [weekdayIdx(start)],
  monthMode: 'day',
  endType: 'never',
  until: start,
  count: 10,
})

export const nthOf = (start: string) => {
  const d = parse(start)
  const n = Math.ceil(d.getDate() / 7)
  const last = d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return last && n >= 4 ? -1 : n
}

export function presetRule(p: Preset, start: string): string | null {
  const wd = CODE_MONDAY_FIRST[weekdayIdx(start)]
  const day = parse(start).getDate()
  switch (p) {
    case 'daily': return 'FREQ=DAILY'
    case 'weekly': return `FREQ=WEEKLY;BYDAY=${wd}`
    case 'biweekly': return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${wd}`
    case 'monthday': return `FREQ=MONTHLY;BYMONTHDAY=${day}`
    case 'monthnth': return `FREQ=MONTHLY;BYDAY=${nthOf(start)}${wd}`
    case 'yearly': return 'FREQ=YEARLY'
    case 'weekdays': return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    default: return null
  }
}

export function buildCustom(c: CustomRule, start: string): string {
  const parts = [`FREQ=${c.freq}`]
  if (c.interval > 1) parts.push(`INTERVAL=${c.interval}`)
  if (c.freq === 'WEEKLY') {
    const days = c.days.length ? c.days : [weekdayIdx(start)]
    parts.push(`BYDAY=${[...days].sort().map((i) => CODE_MONDAY_FIRST[i]).join(',')}`)
  }
  if (c.freq === 'MONTHLY') {
    const wd = CODE_MONDAY_FIRST[weekdayIdx(start)]
    parts.push(c.monthMode === 'day' ? `BYMONTHDAY=${parse(start).getDate()}` : `BYDAY=${nthOf(start)}${wd}`)
  }
  return parts.join(';')
}

export const stripEnd = (rule: string) =>
  rule.split(';').filter((p) => !p.startsWith('UNTIL=') && !p.startsWith('COUNT=')).join(';')

export function withEnd(rule: string, until: string | null, count: number | null) {
  const parts = [rule]
  if (count) parts.push(`COUNT=${count}`)
  else if (until) parts.push(`UNTIL=${until.replace(/-/g, '')}`)
  return parts.join(';')
}

export function parseRuleSpec(rule: string | null, until: string | null, start: string): RuleSpec {
  const custom = defaultCustom(start)
  if (!rule) return { preset: 'none', custom }
  const base = stripEnd(rule)
  const hasEnd = base !== rule
  if (!hasEnd) {
    for (const p of ['daily', 'weekly', 'biweekly', 'monthday', 'monthnth', 'yearly', 'weekdays'] as Preset[]) {
      if (presetRule(p, start) === base) return { preset: p, custom }
    }
  }
  const o = RRule.parseString(rule)
  const freqMap: Record<number, CustomRule['freq']> = {
    [RRule.DAILY]: 'DAILY', [RRule.WEEKLY]: 'WEEKLY', [RRule.MONTHLY]: 'MONTHLY', [RRule.YEARLY]: 'YEARLY',
  }
  custom.freq = freqMap[o.freq as number] ?? 'WEEKLY'
  custom.interval = o.interval ?? 1
  if (o.byweekday && custom.freq === 'WEEKLY') {
    custom.days = (o.byweekday as unknown[]).map((w) =>
      typeof w === 'number' ? w : (w as { weekday: number }).weekday,
    )
  }
  if (custom.freq === 'MONTHLY') custom.monthMode = o.bymonthday ? 'day' : 'nth'
  if (o.count) { custom.endType = 'count'; custom.count = o.count }
  else if (until || o.until) { custom.endType = 'date'; custom.until = until ?? utcStr(o.until as Date) }
  return { preset: 'custom', custom }
}

/* ───────────── Texto en lenguaje natural ───────────── */

export function describeRule(rule: string | null, until: string | null, start: string): string {
  if (!rule) return 'No se repite'
  const o = RRule.parseString(rule)
  const n = o.interval ?? 1
  const wds = ((o.byweekday as unknown[]) ?? []).map((w) =>
    typeof w === 'number' ? { weekday: w, n: undefined as number | undefined } : (w as { weekday: number; n?: number }),
  )
  const name = (i: number) => DOW_FULL[(i + 1) % 7]
  let s = ''
  switch (o.freq) {
    case RRule.DAILY:
      s = n === 1 ? 'Todos los días' : `Cada ${n} días`
      break
    case RRule.WEEKLY: {
      const isWeekdays = wds.length === 5 && wds.every((w) => w.weekday <= 4)
      const list = wds.map((w) => name(w.weekday))
      const l = list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}` : list[0]
      if (isWeekdays) s = n === 1 ? 'Días de semana' : `Cada ${n} semanas, de lunes a viernes`
      else if (!l) s = n === 1 ? 'Todas las semanas' : `Cada ${n} semanas`
      else s = n === 1 ? `Todos los ${l}` : `Cada ${n} semanas: ${l}`
      break
    }
    case RRule.MONTHLY:
      if (o.bymonthday) s = `${n === 1 ? 'Todos los meses' : `Cada ${n} meses`} el día ${o.bymonthday}`
      else if (wds[0]) {
        const k = wds[0].n
        s = `${n === 1 ? 'Todos los meses' : `Cada ${n} meses`} el ${k === -1 ? 'último' : `${k}º`} ${name(wds[0].weekday)}`
      } else s = 'Todos los meses'
      break
    case RRule.YEARLY:
      s = n === 1 ? 'Todos los años' : `Cada ${n} años`
      break
    default:
      s = 'Se repite'
  }
  if (o.count) s += `, ${o.count} veces`
  else if (until) s += `, hasta el ${parse(until).getDate()}/${parse(until).getMonth() + 1}`
  else s += ', sin fin'
  return s
}

/* ───────────── Expansión de ocurrencias ───────────── */

function ruleFor(e: EventRow): RRule | null {
  if (!e.rrule || !e.start_date) return null
  try {
    const o = RRule.parseString(e.rrule)
    o.dtstart = utc(e.start_date)
    if (e.rrule_until && !o.count) o.until = utc(e.rrule_until)
    return new RRule(o)
  } catch {
    return null
  }
}

export function occurrenceDates(e: EventRow, from: string, to: string, limit = 400): string[] {
  const r = ruleFor(e)
  if (!r) return []
  return r.between(utc(from), utc(to), true).slice(0, limit).map(utcStr)
}

export function nextDates(e: Pick<EventRow, 'rrule' | 'rrule_until' | 'start_date'>, count: number): string[] {
  const r = ruleFor(e as EventRow)
  if (!r || !e.start_date) return []
  const today = utc(fmt(new Date()))
  const base = utc(e.start_date) > today ? utc(e.start_date) : today
  const far = new Date(base.getTime() + 366 * 5 * 86400000)
  return r.between(base, far, true).slice(0, count).map(utcStr)
}

export function expandOccurrences(
  events: EventRow[],
  exceptions: ExceptionRow[],
  winStart: string,
  winEnd: string,
): Occurrence[] {
  const excMap = new Map<string, ExceptionRow>()
  for (const x of exceptions) excMap.set(`${x.event_id}@${x.occurrence_date}`, x)
  const out: Occurrence[] = []

  for (const e of events) {
    if (e.deleted_at || !e.start_date) continue

    if (e.rrule) {
      // las ocurrencias movidas por override pueden caer en la ventana viniendo de afuera: ampliamos 60 días
      const dates = occurrenceDates(e, addDaysStr(winStart, -60), addDaysStr(winEnd, 60))
      for (const d of dates) {
        const x = excMap.get(`${e.id}@${d}`)
        if (x?.kind === 'skip') continue
        const ov = x?.override ?? {}
        const date = ov.start_date ?? d
        if (date < winStart || date > winEnd) continue
        out.push({
          key: `${e.id}@${d}`,
          event: e,
          date,
          origDate: d,
          owner: ov.owner ?? e.owner,
          title: ov.title ?? e.title,
          description_md: ov.description_md !== undefined ? ov.description_md : e.description_md,
          all_day: ov.all_day ?? e.all_day,
          start_time: ov.start_time !== undefined ? ov.start_time : e.start_time,
          end_time: ov.end_time !== undefined ? ov.end_time : e.end_time,
          done: ov.done ?? false,
          emoji: ov.emoji !== undefined ? ov.emoji : e.emoji,
          cover: e.cover ?? null,
          cover_pos: e.cover_pos ?? null,
          is_meetup: e.is_meetup,
          recurring: true,
          dayIndex: 1,
          dayCount: 1,
          sort: e.sort_order,
        })
      }
      continue
    }

    const end = e.end_date && e.end_date > e.start_date ? e.end_date : e.start_date
    if (end < winStart || e.start_date > winEnd) continue
    const days = eachDay(e.start_date, end)
    days.forEach((d, i) => {
      if (d < winStart || d > winEnd) return
      out.push({
        key: `${e.id}@${d}`,
        event: e,
        date: d,
        origDate: e.start_date!,
        owner: e.owner,
        title: e.title,
        description_md: e.description_md,
        all_day: e.all_day,
        start_time: e.start_time,
        end_time: e.end_time,
        done: e.done,
        emoji: e.emoji,
        cover: e.cover ?? null,
          cover_pos: e.cover_pos ?? null,
        is_meetup: e.is_meetup,
        recurring: false,
        dayIndex: i + 1,
        dayCount: days.length,
        sort: e.sort_order,
      })
    })
  }
  return out
}

export const bySortOrder = (a: Occurrence, b: Occurrence) => {
  const at = !a.all_day && a.start_time
  const bt = !b.all_day && b.start_time
  if (at && bt) return a.start_time! < b.start_time! ? -1 : a.start_time! > b.start_time! ? 1 : a.sort - b.sort
  if (at) return -1
  if (bt) return 1
  return a.sort - b.sort
}

export const dayBefore = (s: string) => addDaysStr(s, -1)
export { CODES }
