import { create } from 'zustand'
import { eachDay, isWeekend } from './dates'

export interface Run {
  days: string[]
  /** nombres de los feriados incluidos */
  names: string[]
}

interface HolidayState {
  map: Record<string, string>
  /** feriados / no laborables que forman parte de un fin de semana largo (se pintan como el fin de semana) */
  restHolidays: Set<string>
  /** fines de semana largos: 3 o más días seguidos sin trabajo que incluyen un sábado o domingo */
  runs: Run[]
}

export const useHolidays = create<HolidayState>(() => ({ map: {}, restHolidays: new Set(), runs: [] }))

// los no laborables de culto o de una sola provincia no cortan la semana para todos
const workFree = (name: string) => !/culto|Córdoba|Prov\./i.test(name)

export function setHolidays(map: Record<string, string>, start: string, end: string) {
  const free = (d: string) => isWeekend(d) || (!!map[d] && workFree(map[d]))
  const runs: Run[] = []
  const restHolidays = new Set<string>()
  let cur: string[] = []
  const flush = () => {
    if (cur.length >= 3 && cur.some(isWeekend)) {
      const hol = cur.filter((d) => !isWeekend(d))
      hol.forEach((d) => restHolidays.add(d))
      runs.push({ days: cur, names: [...new Set(hol.map((d) => map[d]).filter(Boolean))] })
    }
    cur = []
  }
  for (const d of eachDay(start, end)) {
    if (free(d)) cur.push(d)
    else flush()
  }
  flush()
  useHolidays.setState({ map, restHolidays, runs })
}
