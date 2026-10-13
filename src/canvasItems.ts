import { create } from 'zustand'
import type { CanvasData, CanvasItem, ElRef, MarkData, ObjData } from './types'
import * as api from './lib/api'
import { toast, useData } from './store'

interface ItemsState {
  items: Record<string, CanvasItem>
  /** posiciones provisorias mientras se arrastra */
  live: Record<string, { x: number; y: number }>
  /** tamaños provisorios de días mientras se redimensionan */
  liveSize: Record<string, { w: number; h: number }>
  /** objetos pegados mientras se mueven / redimensionan */
  liveObj: Record<string, { x: number; y: number; w: number; h: number }>
  arrowSel: string | null
  /** modo flecha: null = apagado */
  arrowMode: { from: ElRef | null; label?: string } | null
}

export const useItems = create<ItemsState>(() => ({ items: {}, live: {}, liveSize: {}, liveObj: {}, arrowSel: null, arrowMode: null }))

export const itemStore = {
  replaceAll(list: CanvasItem[]) {
    useItems.setState({ items: Object.fromEntries(list.map((i) => [i.id, i])) })
  },
  put(i: CanvasItem) {
    useItems.setState((s) => ({ items: { ...s.items, [i.id]: i } }))
  },
  remove(id: string) {
    useItems.setState((s) => {
      const items = { ...s.items }
      delete items[id]
      return { items, arrowSel: s.arrowSel === id ? null : s.arrowSel }
    })
  },
}

export async function saveItem(id: string, kind: CanvasItem['kind'], data: CanvasData) {
  const me = useData.getState().me!
  const row: CanvasItem = { id, kind, data, updated_by: me.id, updated_at: new Date().toISOString() }
  const prev = useItems.getState().items[id]
  itemStore.put(row)
  try {
    await api.upsertItem(row)
  } catch (e) {
    console.error(e)
    if (prev) itemStore.put(prev)
    else itemStore.remove(id)
    toast('No se pudo guardar la posición')
  }
}

export async function removeItem(id: string) {
  const prev = useItems.getState().items[id]
  itemStore.remove(id)
  try {
    await api.deleteItem(id)
  } catch (e) {
    console.error(e)
    if (prev) itemStore.put(prev)
    toast('No se pudo borrar')
  }
}

export const monthItemId = (key: string) => `month:${key}`
export const dayItemId = (day: string) => `day:${day}`

export function setMonthPos(key: string, x: number, y: number) {
  const prev = useItems.getState().items[monthItemId(key)]?.data as { ungrouped?: boolean } | undefined
  return saveItem(monthItemId(key), 'month', { x, y, ungrouped: prev?.ungrouped })
}
type DayData = { x: number; y: number; w?: number; h?: number }
const dayData = (day: string) => useItems.getState().items[dayItemId(day)]?.data as DayData | undefined

export function setDayPos(day: string, x: number, y: number) {
  const cur = dayData(day)
  return saveItem(dayItemId(day), 'day', { x, y, ...(cur?.w ? { w: cur.w, h: cur.h } : {}) })
}

/** Tamaño propio de un día (redimensionado a mano). Sin w/h vuelve al tamaño automático. */
export function setDaySize(day: string, size: { w: number; h: number } | null) {
  const cur = dayData(day)
  const base = { x: cur?.x ?? 0, y: cur?.y ?? 0 }
  if (!size && !cur?.x && !cur?.y) return removeItem(dayItemId(day))
  return saveItem(dayItemId(day), 'day', size ? { ...base, w: Math.round(size.w), h: Math.round(size.h) } : base)
}

/** Desagrupa un mes (sus días pasan a poder moverse solos) o lo vuelve a agrupar. */
export async function toggleUngroup(key: string) {
  const id = monthItemId(key)
  const cur = useItems.getState().items[id]?.data as { x: number; y: number; ungrouped?: boolean } | undefined
  const ungrouped = !cur?.ungrouped
  await saveItem(id, 'month', { x: cur?.x ?? 0, y: cur?.y ?? 0, ungrouped })
  if (!ungrouped) {
    const days = Object.keys(useItems.getState().items).filter((k) => k.startsWith(`day:${key}-`))
    // al reagrupar se pierden las posiciones, pero se conservan los tamaños propios de cada día
    await Promise.all(
      days.map((k) => {
        const d = useItems.getState().items[k]?.data as DayData | undefined
        return d?.w ? saveItem(k, 'day', { x: 0, y: 0, w: d.w, h: d.h }) : removeItem(k)
      }),
    )
  }
}

export function createArrow(from: ElRef, to: ElRef) {
  const id = crypto.randomUUID()
  void saveItem(id, 'arrow', { from, to })
  useItems.setState({ arrowSel: id })
}

export const sameRef = (a: ElRef, b: ElRef) => a.k === b.k && a.id === b.id

/** Aplica una etiqueta + color (+ comentario) a un conjunto de días. */
export function addMark(m: MarkData) {
  const id = `mark:${crypto.randomUUID()}`
  return saveItem(id, 'mark', { ...m, days: [...m.days].sort() })
}
export const removeMark = (id: string) => removeItem(id)

export function marksOnDays(items: Record<string, CanvasItem>, days: string[]) {
  const set = new Set(days)
  return Object.values(items).filter((i) => i.kind === 'mark' && (i.data as MarkData).days.some((d) => set.has(d)))
}


/* ───────── objetos pegados ───────── */
export const objItemId = () => `obj:${crypto.randomUUID()}`
export const saveObj = (id: string, d: ObjData) => saveItem(id, 'obj', d)
export const objsOf = (items: Record<string, CanvasItem>) =>
  Object.values(items).filter((i) => i.kind === 'obj') as (CanvasItem & { data: ObjData })[]


/** Vuelve al tamaño automático todos los días redimensionados de un mes. */
export async function resetMonthSizes(monthKey: string) {
  const items = useItems.getState().items
  const days = Object.keys(items).filter((k) => k.startsWith(`day:${monthKey}-`) && (items[k].data as { w?: number }).w)
  await Promise.all(days.map((k) => setDaySize(k.slice(4), null)))
}
