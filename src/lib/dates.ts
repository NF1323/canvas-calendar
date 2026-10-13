import { addDays, addMonths, endOfMonth, format, parseISO, startOfWeek } from 'date-fns'

export const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const DOW_FULL = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
export const parse = (s: string) => parseISO(s)
export const todayStr = () => fmt(new Date())
export const addDaysStr = (s: string, n: number) => fmt(addDays(parse(s), n))
export const monthKeyOf = (s: string) => s.slice(0, 7)
export const monthTitle = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${cap(MONTHS[m - 1])} ${y}`
}
export const longDay = (s: string) => {
  const d = parse(s)
  return `${cap(DOW_FULL[d.getDay()])} ${d.getDate()} de ${MONTHS[d.getMonth()]}`
}
export const shortDate = (s: string) => {
  const d = parse(s)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Ventana temporal: lunes de la semana pasada → fin del mes de hoy + 12 meses. */
export function computeWindow(today: string) {
  const t = parse(today)
  const start = addDays(startOfWeek(t, { weekStartsOn: 1 }), -7)
  const end = endOfMonth(addMonths(t, 12))
  return { start: fmt(start), end: fmt(end) }
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  let d = parse(start)
  const e = parse(end)
  while (d <= e) {
    out.push(fmt(d))
    d = addDays(d, 1)
  }
  return out
}

/** Lunes = 0 … domingo = 6 */
export const weekdayIdx = (s: string) => (parse(s).getDay() + 6) % 7
export const isWeekend = (s: string) => weekdayIdx(s) >= 5
export const mondayOf = (s: string) => fmt(startOfWeek(parse(s), { weekStartsOn: 1 }))

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')
