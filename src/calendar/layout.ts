import type { Occurrence, Rect } from '../types'
import { monthKeyOf, mondayOf, weekdayIdx } from '../lib/dates'

export const C = {
  DAY_W: 220,
  DAY_MIN_H: 168,
  DAY_GAP: 8,
  MONTH_PAD: 32,
  MONTH_HEADER_H: 210,
  MONTH_GAP: 380,
  HEAD_H: 40,
  CARD_GAP: 6,
  ADD_H: 40,
  /** tamaño mínimo al redimensionar un día a mano */
  MIN_W: 160,
  MIN_H: 120,
  /** a partir de este tamaño el día muestra la línea de horarios */
  TL_W: 380,
  TL_H: 480,
}
export const ISLAND_W = C.MONTH_PAD * 2 + 7 * C.DAY_W + 6 * C.DAY_GAP
export const CARD_TEXT_W = C.DAY_W - 16 - 4 - 24

/* ───────────── medición de texto ───────────── */

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()
export let fontEpoch = 0
export function resetMeasureCache() {
  cache.clear()
  fontEpoch++
}

function width(text: string, font: string) {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * 8
  ctx.font = font
  return ctx.measureText(text).width
}

/** Cantidad de líneas de un texto con corte por palabras. */
export function wrapLines(text: string, font: string, maxW: number): number {
  const k = `${font}|${maxW}|${text}`
  const hit = cache.get(k)
  if (hit !== undefined) return hit
  let lines = 0
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { lines += 1; continue }
    let cur = ''
    let n = 1
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w
      if (width(t, font) > maxW && cur) { n++; cur = w } else cur = t
    }
    lines += n
  }
  cache.set(k, lines)
  return lines
}

const TITLE_FONT = '650 17px Inter, system-ui, sans-serif'
const DESC_FONT = '400 12.5px Inter, system-ui, sans-serif'
export const COVER_H = 96
export const TITLE_LH = 22
export const DESC_LH = 17

const plain = (md: string) =>
  md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\s]+/gm, '')
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/gm, '• ')
    .replace(/[*_`~]/g, '')
    .trim()

/** Alto de una tarjeta de ancho `cardW` (el texto se acomoda al ancho disponible). */
export function cardHeight(o: Occurrence, expanded: boolean, cardW = C.DAY_W - 16): number {
  const textW = Math.max(40, cardW - 4 - 24)
  const title = `${o.emoji ? o.emoji + ' ' : ''}${o.title}`
  const tl = Math.min(expanded ? 99 : 2, wrapLines(title, TITLE_FONT, textW))
  const meta = !o.all_day || o.recurring || o.dayCount > 1 || o.is_meetup || (o.event.attachments?.length ?? 0) > 0 ? 18 : 0
  let desc = 0
  if (o.description_md && o.description_md.trim()) {
    const dl = Math.min(expanded ? 40 : 3, wrapLines(plain(o.description_md), DESC_FONT, textW))
    desc = dl * DESC_LH + 4
  }
  const cover = o.cover ? COVER_H + 8 - 10 : 0
  return Math.max(44, 20 + tl * TITLE_LH + meta + desc + cover)
}

/* ───────────── orden del día: planes simultáneos lado a lado ───────────── */

const toMin = (t: string | null) => {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}
export const endMin = (o: Occurrence) => {
  const s = toMin(o.start_time)
  const e = o.end_time ? toMin(o.end_time) : s + 60
  return e > s ? e : s + 60
}
export const startMin = (o: Occurrence) => toMin(o.start_time)
export const isTimed = (o: Occurrence) => !o.all_day && !!o.start_time

export interface DayItem {
  occ: Occurrence
  /** ancho / alto de la tarjeta y su posición dentro del día (modo lista) */
  w: number
  h: number
  x: number
  y: number
}
export interface DayArrangement {
  items: DayItem[]
  /** tamaño automático según la carga del día */
  w: number
  h: number
}

/**
 * Acomoda los planes de un día: los que se solapan en horario van uno al lado del otro,
 * y el día crece (en ancho y alto) cuanto más cargado está. `customW` fuerza un ancho (día redimensionado).
 */
export function arrangeDay(
  occs: Occurrence[],
  expanded: Set<string>,
  ghostHeights: number[],
  customW?: number,
): DayArrangement {
  const timed = occs.filter(isTimed)
  const rest = occs.filter((o) => !isTimed(o))
  const clusters: Occurrence[][] = []
  let cur: Occurrence[] = []
  let curEnd = -1
  for (const o of timed) {
    if (cur.length && startMin(o) < curEnd) {
      cur.push(o)
      curEnd = Math.max(curEnd, endMin(o))
    } else {
      if (cur.length) clusters.push(cur)
      cur = [o]
      curEnd = endMin(o)
    }
  }
  if (cur.length) clusters.push(cur)

  const maxCols = Math.max(1, ...clusters.map((c) => c.length))
  const loadW = Math.min(360, C.DAY_W + 18 * Math.max(0, occs.length - 2))
  const needW = maxCols > 1 ? 18 + maxCols * 150 + (maxCols - 1) * C.CARD_GAP : 0
  const W = Math.max(C.MIN_W, customW ?? Math.max(loadW, needW))
  const inner = W - 18 // 16 de padding + 2 del borde del día: así los planes simultáneos nunca se desbordan a otra fila

  const items: DayItem[] = []
  let y = C.HEAD_H
  let rows = 0
  const addRow = (group: Occurrence[]) => {
    const k = group.length
    const cw = Math.floor((inner - (k - 1) * C.CARD_GAP) / k)
    const rowH = Math.max(...group.map((o) => cardHeight(o, expanded.has(o.key), cw)))
    group.forEach((o, i) => items.push({ occ: o, w: cw, h: rowH, x: 8 + i * (cw + C.CARD_GAP), y }))
    y += rowH + C.CARD_GAP
    rows++
  }
  clusters.forEach(addRow)
  rest.forEach((o) => addRow([o]))
  for (const gh of ghostHeights) {
    y += gh + C.CARD_GAP
    rows++
  }
  const content = rows ? y - C.CARD_GAP + C.ADD_H + 12 : 0
  const h = rows ? Math.max(C.DAY_MIN_H, content) : C.DAY_MIN_H
  return { items, w: W, h }
}

/* ───────────── layout puro ───────────── */

export interface MonthLayout {
  key: string
  rect: Rect
  days: string[]
  rows: { monday: string; y: number; h: number; days: string[] }[]
  ungrouped: boolean
  /** mes desagrupado: halo que engloba todos sus días, vayan donde vayan */
  halo?: Rect
}

export interface Layout {
  dayRects: Record<string, Rect>
  months: MonthLayout[]
  weeks: { key: string; month: string; rect: Rect; days: string[] }[]
  bounds: Rect
}

export interface Positions {
  month: Record<string, { x: number; y: number }>
  /** desplazamiento relativo al origen del mes (solo meses desagrupados) */
  day: Record<string, { x: number; y: number }>
  ungrouped: Set<string>
}
const ZERO = { x: 0, y: 0 }

export function computeLayout(
  days: string[],
  dims: Record<string, { w: number; h: number }>,
  monthsPerRow: number,
  pos: Positions = { month: {}, day: {}, ungrouped: new Set() },
  extra: Rect[] = [],
): Layout {
  const dim = (d: string) => dims[d] ?? { w: C.DAY_W, h: C.DAY_MIN_H }
  const byMonth = new Map<string, string[]>()
  for (const d of days) {
    const k = monthKeyOf(d)
    if (!byMonth.has(k)) byMonth.set(k, [])
    byMonth.get(k)!.push(d)
  }

  const prelim = [...byMonth.entries()].map(([key, ds]) => {
    const rowsMap = new Map<string, string[]>()
    for (const d of ds) {
      const m = mondayOf(d)
      if (!rowsMap.has(m)) rowsMap.set(m, [])
      rowsMap.get(m)!.push(d)
    }
    const rows = [...rowsMap.entries()].map(([monday, rd]) => ({
      monday,
      days: rd,
      h: Math.max(...rd.map((d) => dim(d).h)),
    }))
    // el ancho de cada columna lo marca el día más ancho de esa columna
    const colW = Array.from({ length: 7 }, () => C.DAY_W)
    for (const d of ds) colW[weekdayIdx(d)] = Math.max(colW[weekdayIdx(d)], dim(d).w)
    const colX: number[] = []
    let cx = C.MONTH_PAD
    for (let c = 0; c < 7; c++) {
      colX.push(cx)
      cx += colW[c] + C.DAY_GAP
    }
    const w = cx - C.DAY_GAP + C.MONTH_PAD
    const h = C.MONTH_HEADER_H + rows.reduce((a, r) => a + r.h, 0) + C.DAY_GAP * (rows.length - 1) + C.MONTH_PAD
    return { key, days: ds, rows, h, w, colW, colX }
  })

  // columnas de la grilla de meses: ancho = el mes más ancho de esa columna
  const gcolW: number[] = []
  prelim.forEach((m, i) => {
    const gc = i % monthsPerRow
    gcolW[gc] = Math.max(gcolW[gc] ?? 0, m.w)
  })
  const gx: number[] = []
  let gacc = 0
  for (let c = 0; c < gcolW.length; c++) {
    gx.push(gacc)
    gacc += gcolW[c] + C.MONTH_GAP
  }

  const dayRects: Record<string, Rect> = {}
  const months: MonthLayout[] = []
  const weeks: Layout['weeks'] = []
  let y = 0
  for (let i = 0; i < prelim.length; i += monthsPerRow) {
    const slice = prelim.slice(i, i + monthsPerRow)
    const rowH = Math.max(...slice.map((m) => m.h))
    slice.forEach((m, c) => {
      const mp = pos.month[m.key] ?? ZERO
      const ung = pos.ungrouped.has(m.key)
      const x = gx[c] + mp.x
      const my = y + mp.y
      const rect = { x, y: my, w: m.w, h: m.h }
      let ry = C.MONTH_HEADER_H
      const rows = m.rows.map((r) => {
        r.days.forEach((d) => {
          const o = ung ? (pos.day[d] ?? ZERO) : ZERO
          const dm = dim(d)
          dayRects[d] = { x: x + m.colX[weekdayIdx(d)] + o.x, y: my + ry + o.y, w: dm.w, h: dm.h }
        })
        const row = { monday: r.monday, y: ry, h: r.h, days: r.days }
        weeks.push({
          key: `${m.key}|${r.monday}`,
          month: m.key,
          rect: { x: x + C.MONTH_PAD, y: my + ry, w: m.w - C.MONTH_PAD * 2, h: r.h },
          days: r.days,
        })
        ry += r.h + C.DAY_GAP
        return row
      })
      months.push({ key: m.key, rect, days: m.days, rows, ungrouped: ung })
    })
    y += rowH + C.MONTH_GAP
  }

  // meses desagrupados: el halo siempre engloba a todos sus días (rect = halo)
  for (const mo of months) {
    if (!mo.ungrouped) continue
    const u = unionRects(mo.days.map((d) => dayRects[d]).filter(Boolean))
    const pad = 28
    mo.halo = { x: u.x - pad, y: u.y - pad - 130, w: u.w + pad * 2, h: u.h + pad * 2 + 130 }
    mo.rect = mo.halo
  }
  const all = [...months.map((m) => m.rect), ...Object.values(dayRects), ...extra]
  const bounds = all.length ? unionRects(all) : { x: 0, y: 0, w: 1, h: 1 }
  return { dayRects, months, weeks, bounds }
}

export const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

export const unionRects = (rs: Rect[]): Rect => {
  const x0 = Math.min(...rs.map((r) => r.x))
  const y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w))
  const y1 = Math.max(...rs.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
