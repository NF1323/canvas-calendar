import { useMemo } from 'react'
import type { EventRow, Occurrence, Owner, Rect } from '../types'
import { shows, useData, useUI } from '../store'
import { objsOf, useItems } from '../canvasItems'
import { eventToOcc } from '../actions'
import { computeWindow, eachDay } from '../lib/dates'
import { bySortOrder, expandOccurrences } from './recurrence'
import { arrangeDay, C, cardHeight, computeLayout, fontEpoch, type DayArrangement, type Layout, type Positions } from './layout'

export interface Model {
  winStart: string
  winEnd: string
  days: string[]
  layout: Layout
  /** ocurrencias visibles (después del filtro), ordenadas por día */
  occsByDay: Record<string, Occurrence[]>
  /** todas las ocurrencias de la ventana (sin filtro) — para buscar y minimapa */
  allOccs: Occurrence[]
  /** cómo se acomodan los planes de cada día (lado a lado si se solapan) */
  arr: Record<string, DayArrangement>
  heights: Record<string, number>
  tray: EventRow[]
  /** planes sueltos sobre el canvas */
  free: { e: EventRow; occ: Occurrence; rect: Rect }[]
  /** rectángulo en el mundo de cada tarjeta (clave de ocurrencia), para flechas */
  cardRects: Record<string, Rect>
  counts: Record<Owner, number>
  ghostDays: Record<string, string>
}

/** Último modelo calculado, para consumidores fuera de React (cursores, hit-testing). */
export const model: { current: Model | null } = { current: null }

export const GHOST_H = 56

export function useModel(monthsPerRow: number): Model {
  const events = useData((s) => s.events)
  const exceptions = useData((s) => s.exceptions)
  const today = useData((s) => s.today)
  const filter = useUI((s) => s.filter)
  const expanded = useUI((s) => s.expanded)
  const editor = useUI((s) => s.editor)
  const draft = useUI((s) => Object.values(s.peers).find((p) => p.draft)?.draft ?? null)
  const hidden = useUI((s) => s.hiddenNotice)
  const items = useItems((s) => s.items)
  const liveMoves = useItems((s) => s.live)
  const liveSize = useItems((s) => s.liveSize)
  const liveObj = useItems((s) => s.liveObj)
  const view = useUI((s) => s.prefs.view)
  const epoch = fontEpoch

  // tamaños propios de días (redimensionados a mano), estables mientras no cambien
  const sizesKey = Object.values(items)
    .filter((i) => i.kind === 'day' && (i.data as { w?: number }).w)
    .map((i) => { const d = i.data as { w?: number; h?: number }; return `${i.id}:${d.w}x${d.h}` })
    .sort()
    .join('|')
  const sizes = useMemo(() => {
    const out: Record<string, { w: number; h: number }> = {}
    for (const i of Object.values(items)) {
      const d = i.data as { w?: number; h?: number }
      if (i.kind === 'day' && d.w && d.h) out[i.id.slice(4)] = { w: d.w, h: d.h }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizesKey])

  // 0) ocurrencias (lo más caro): solo depende de los datos
  const base = useMemo(() => {
    const { start, end } = computeWindow(today)
    const days = eachDay(start, end)
    const live = Object.values(events).filter((e) => !e.deleted_at)
    const allOccs = expandOccurrences(live, Object.values(exceptions), start, end)
    const counts: Record<Owner, number> = {}
    for (const e of live) counts[e.owner] = (counts[e.owner] ?? 0) + 1
    return { start, end, days, live, allOccs, counts }
  }, [events, exceptions, today])

  // 1) filtro + acomodo de cada día
  const core = useMemo(() => {
    const { days, live, allOccs } = base
    const show = (o: Occurrence) => shows(filter, o.owner) || hidden?.id === o.event.id
    const occsByDay: Record<string, Occurrence[]> = {}
    for (const o of allOccs) {
      if (!show(o)) continue
      ;(occsByDay[o.date] ??= []).push(o)
    }
    const expSet = new Set(expanded)
    const ghostDays: Record<string, string> = {}
    if (editor && !editor.eventId && editor.day) ghostDays[editor.day] = 'mine'
    if (draft?.day) ghostDays[draft.day] = ghostDays[draft.day] ? 'both' : 'theirs'
    const arr: Record<string, DayArrangement> = {}
    const heights: Record<string, number> = {}
    for (const d of days) {
      const list = occsByDay[d] ?? []
      list.sort(bySortOrder)
      const gh: number[] = []
      if (ghostDays[d]) gh.push(GHOST_H)
      if (ghostDays[d] === 'both') gh.push(GHOST_H)
      arr[d] = arrangeDay(list, expSet, gh, sizes[d]?.w)
      heights[d] = arr[d].h
    }
    const free = live
      .filter((e) => !e.start_date && e.canvas_x !== null && e.canvas_y !== null && (shows(filter, e.owner) || hidden?.id === e.id))
      .map((e) => {
        const occ = eventToOcc(e, 'free')
        const h = cardHeight(occ, expSet.has(occ.key), C.DAY_W - 16)
        return { e, occ, rect: { x: e.canvas_x!, y: e.canvas_y!, w: C.DAY_W - 16, h } }
      })
    const tray = live
      .filter((e) => !e.start_date && e.canvas_x === null && (shows(filter, e.owner) || hidden?.id === e.id))
      .sort((a, b) => a.sort_order - b.sort_order)
    return { occsByDay, arr, heights, free, tray, ghostDays }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, filter, expanded, editor, draft, hidden, sizes, epoch])

  // 2) layout: barato, se recalcula en cada movimiento / redimensión
  const m = useMemo(() => {
    const pos: Positions = { month: {}, day: {}, ungrouped: new Set() }
    for (const it of view === 'grid' ? [] : Object.values(items)) {
      const d = it.data as { x: number; y: number; ungrouped?: boolean }
      if (it.kind === 'month') {
        const k = it.id.slice(6)
        pos.month[k] = { x: d.x, y: d.y }
        if (d.ungrouped) pos.ungrouped.add(k)
      } else if (it.kind === 'day') pos.day[it.id.slice(4)] = { x: d.x ?? 0, y: d.y ?? 0 }
    }
    for (const [id, p] of view === 'grid' ? [] : Object.entries(liveMoves)) {
      if (id.startsWith('month:')) pos.month[id.slice(6)] = p
      else if (id.startsWith('day:')) pos.day[id.slice(4)] = p
    }
    const dims: Record<string, { w: number; h: number }> = {}
    for (const d of base.days) {
      const a = core.arr[d]
      const s = liveSize[d] ?? sizes[d]
      dims[d] = { w: s?.w ?? a.w, h: Math.max(C.MIN_H, s?.h ?? a.h) }
    }
    const objRects = objsOf(items).map((o) => { const d = liveObj[o.id] ?? o.data; return { x: d.x, y: d.y, w: d.w, h: d.h } })
    const layout = computeLayout(base.days, dims, monthsPerRow, pos, [...core.free.map((f) => f.rect), ...objRects])
    const cardRects: Record<string, Rect> = {}
    for (const d of base.days) {
      const r = layout.dayRects[d]
      const a = core.arr[d]
      if (!r || !a) continue
      for (const it of a.items) cardRects[it.occ.key] = { x: r.x + it.x, y: r.y + it.y, w: it.w, h: it.h }
    }
    for (const f of core.free) cardRects[f.occ.key] = f.rect
    return {
      winStart: base.start, winEnd: base.end, days: base.days, layout, occsByDay: core.occsByDay, allOccs: base.allOccs,
      arr: core.arr, heights: core.heights, tray: core.tray, free: core.free, cardRects, counts: base.counts, ghostDays: core.ghostDays,
    } as Model
  }, [base, core, items, liveMoves, liveSize, liveObj, sizes, monthsPerRow, view])

  model.current = m
  return m
}
