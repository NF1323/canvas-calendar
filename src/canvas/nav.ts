import { cam, MAX_S, type Insets } from './camera'
import { model } from '../calendar/model'
import { unionRects } from '../calendar/layout'
import { ui, useUI } from '../store'
import { addDaysStr, eachDay, mondayOf } from '../lib/dates'
import type { Rect } from '../types'
import { useData, toast } from '../store'
import { useHolidays } from '../lib/holidays'

/** Área reservada por la interfaz: el elemento se encuadra siempre limpio, sin tocar controles. */
export function safeInsets(pad = 12): Insets {
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0
  const st = useUI.getState()
  const trayEd = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-ed')) || 1
  const tray = st.trayOpen ? 360 * trayEd : 0
  const ed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-ed')) || 1
  const panel = st.selection.length && st.selPanel ? 392 * ed : 0
  return { t: top + pad + 4, b: 120 + pad, l: 16 + pad, r: 16 + pad + Math.max(tray, panel) }
}

export function flyToDay(day: string, opts: { focus?: boolean; duration?: number; push?: boolean } = {}) {
  const r = model.current?.layout.dayRects[day]
  if (!r) return
  const target = cam.fitCam(r, 48, MAX_S, safeInsets())
  const focus = opts.focus ?? true
  ui({ focusDay: focus ? day : null })
  cam.flyTo(target, { duration: opts.duration, push: opts.push })
}

export function flyToRect(r: Rect, padding = 48) {
  ui({ focusDay: null })
  return cam.flyToRect(r, { padding, insets: safeInsets() })
}

export function flyToWeek(key: string, select = false) {
  const w = model.current?.layout.weeks.find((x) => x.key === key)
  if (!w) return
  if (select) ui({ selection: w.days, selAnchor: w.days[0], selPanel: true })
  // encuadra el ancho del mes entero (se ven sus márgenes) centrado en la semana
  const mo = model.current?.layout.months.find((x) => x.key === w.month)
  const x = mo ? mo.rect.x : w.rect.x
  const width = mo ? mo.rect.w : w.rect.w
  flyToRect({ x, y: w.rect.y - 150, w: width, h: w.rect.h + 300 }, 8)
}

export function flyToMonth(key: string, select = false) {
  const mo = model.current?.layout.months.find((x) => x.key === key)
  if (mo && select) ui({ selection: mo.days, selAnchor: mo.days[0], selPanel: true })
  if (mo) flyToRect({ x: mo.rect.x, y: mo.rect.y - 40, w: mo.rect.w, h: mo.rect.h + 40 }, 8)
}

export function flyToDays(days: string[]) {
  const m = model.current
  if (!m || !days.length) return
  const rs = days.map((d) => m.layout.dayRects[d]).filter(Boolean)
  if (!rs.length) return
  if (rs.length === 1) return flyToDay(days[0])
  flyToRect(unionRects(rs), 56)
}

/** Ilumina unos días durante un rato (los bordes brillan). */
export function glowDays(days: string[], ms = 1200) {
  ui({ glow: days })
  setTimeout(() => {
    const cur = useUI.getState().glow
    if (cur === days) ui({ glow: [] })
  }, ms)
}

/** Botón "Esta semana": muestra el mes actual completo y, al estabilizarse, ilumina la semana de hoy. */
export function flyToThisWeek() {
  const m = model.current
  if (!m) return
  const today = useData.getState().today
  const monday = mondayOf(today)
  const week = eachDay(monday, addDaysStr(monday, 6)).filter((d) => m.layout.dayRects[d])
  const mo = m.layout.months.find((x) => today.startsWith(x.key))
  if (!mo) return
  ui({ focusDay: null, glow: [] })
  const days = week
  cam.flyToRect(
    { x: mo.rect.x, y: mo.rect.y - 40, w: mo.rect.w, h: mo.rect.h + 40 },
    { padding: 8, insets: safeInsets(), onDone: () => glowDays(days) },
  )
}

/** Vista del mes actual con la semana de hoy centrada. */
export function flyHome(duration = 900, push = true) {
  const m = model.current
  if (!m) return
  const today = useData.getState().today
  const dr = m.layout.dayRects[today]
  const mo = m.layout.months.find((x) => today.startsWith(x.key))
  if (!dr || !mo) return
  const ins = safeInsets()
  const aw = cam.vw - ins.l - ins.r
  const s = Math.min(1, aw / mo.rect.w)
  const cx = mo.rect.x + mo.rect.w / 2
  const cy = dr.y + dr.h / 2
  ui({ focusDay: null })
  cam.flyTo({ s, x: ins.l + aw / 2 - cx * s, y: ins.t + (cam.vh - ins.t - ins.b) / 2 - cy * s }, { duration, push })
}

export function flyOverview() {
  const m = model.current
  if (!m) return
  ui({ focusDay: null })
  cam.flyToRect(m.layout.bounds, { padding: 40, maxScale: 0.3, insets: safeInsets() })
}

export function focusStep(delta: number) {
  const cur = useUI.getState().focusDay
  const m = model.current
  if (!cur || !m) return
  let next = addDaysStr(cur, delta)
  // saltar días fuera de la ventana
  if (!m.layout.dayRects[next]) return
  flyToDay(next, { duration: 450, push: false })
  ui({ focusDay: next })
}

/** Sale del foco: deselecciona y hace zoom out a la vista del mes de ese día. */
export function exitFocus() {
  const d = useUI.getState().focusDay
  ui({ focusDay: null, selection: [], selAnchor: null })
  if (d) flyToMonth(d.slice(0, 7))
}

export function flyToDayCentered(day: string) {
  const r = model.current?.layout.dayRects[day]
  if (!r) return
  flyToDay(day, { focus: true })
}

export function selectRange(a: string, b: string) {
  const [x, y] = a < b ? [a, b] : [b, a]
  const m = model.current
  const days = eachDay(x, y).filter((d) => m?.layout.dayRects[d])
  ui({ selection: days })
}

export const MAXS = MAX_S


/** Botón "Finde largo": muestra el próximo fin de semana largo (el que está en curso o el que sigue) y lo destella.
 *  Recién cuando termina por completo pasa al siguiente. */
export function flyToNextLongWeekend() {
  const m = model.current
  const { runs } = useHolidays.getState()
  if (!m || !runs.length) return toast('No hay fines de semana largos en la ventana')
  const today = useData.getState().today
  const run = runs.find((r) => r.days[r.days.length - 1] >= today)
  if (!run) return toast('No quedan fines de semana largos en la ventana')
  const rects = run.days.map((d) => m.layout.dayRects[d]).filter(Boolean)
  if (!rects.length) return
  ui({ focusDay: null, glow: [] })
  cam.flyToRect(unionRects(rects), { padding: 56, insets: safeInsets(), maxScale: 1.1, onDone: () => glowDays(run.days) })
}
