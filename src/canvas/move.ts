import type React from 'react'
import { cam } from './camera'
import { input } from './input'
import { useUI } from '../store'
import { useItems, setDayPos, setDaySize, setMonthPos, saveItem, saveObj } from '../canvasItems'
import type { ObjData } from '../types'
import { ui } from '../store'
import { attachToEvent, cardUnder } from '../objects/attachmentOps'
import { model } from '../calendar/model'
import { C } from '../calendar/layout'

/** Arrastra un mes o un día (desagrupado) por el canvas; guarda la posición al soltar. Se dispara desde el canvas al arrastrar el fondo de un mes. */
export function startMove(id: string, clientX: number, clientY: number) {
  const start = { x: clientX, y: clientY }
  const cur = useItems.getState().items[id]?.data as { x: number; y: number } | undefined
  const base = { x: cur?.x ?? 0, y: cur?.y ?? 0 }
  let moved = false

  const move = (ev: PointerEvent) => {
    const dx = (ev.clientX - start.x) / cam.cam.s
    const dy = (ev.clientY - start.y) / cam.cam.s
    if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return
    moved = true
    input.dragged = true
    useItems.setState((s) => ({ live: { ...s.live, [id]: { x: Math.round(base.x + dx), y: Math.round(base.y + dy) } } }))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const p = useItems.getState().live[id]
    useItems.setState((s) => {
      const live = { ...s.live }
      delete live[id]
      return { live }
    })
    if (moved && p) {
      if (id.startsWith('month:')) void setMonthPos(id.slice(6), p.x, p.y)
      else void setDayPos(id.slice(4), p.x, p.y)
    }
    setTimeout(() => { input.dragged = false }, 0)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}


/** Mueve en conjunto los días seleccionados (desagrupa sus meses si hace falta). Solo días: ni meses ni planes. */
export function startGroupMove(days: string[], clientX: number, clientY: number) {
  const items = useItems.getState().items
  for (const m of new Set(days.map((d) => d.slice(0, 7)))) {
    const it = items[`month:${m}`]?.data as { x: number; y: number; ungrouped?: boolean } | undefined
    if (!it?.ungrouped) void saveItem(`month:${m}`, 'month', { x: it?.x ?? 0, y: it?.y ?? 0, ungrouped: true })
  }
  const base: Record<string, { x: number; y: number }> = {}
  for (const d of days) {
    const c = items[`day:${d}`]?.data as { x: number; y: number } | undefined
    base[d] = { x: c?.x ?? 0, y: c?.y ?? 0 }
  }
  let moved = false
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - clientX, ev.clientY - clientY) < 4) return
    moved = true
    input.dragged = true
    const dx = (ev.clientX - clientX) / cam.cam.s
    const dy = (ev.clientY - clientY) / cam.cam.s
    useItems.setState((s) => {
      const live = { ...s.live }
      for (const d of days) live[`day:${d}`] = { x: Math.round(base[d].x + dx), y: Math.round(base[d].y + dy) }
      return { live }
    })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const live = useItems.getState().live
    const final = days.map((d) => [d, live[`day:${d}`]] as const)
    useItems.setState((s) => {
      const l = { ...s.live }
      for (const d of days) delete l[`day:${d}`]
      return { live: l }
    })
    if (moved) for (const [d, p] of final) if (p) void setDayPos(d, p.x, p.y)
    setTimeout(() => { input.dragged = false }, 0)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}


/** Redimensiona un día arrastrando sus bordes: 'r' derecha, 'b' abajo, 'rb' esquina. */
export function startResize(e: React.PointerEvent, day: string, axis: 'r' | 'b' | 'rb') {
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  const r = model.current?.layout.dayRects[day]
  if (!r) return
  const sx = e.clientX
  const sy = e.clientY
  let moved = false
  const move = (ev: PointerEvent) => {
    moved = true
    input.dragged = true
    const dx = (ev.clientX - sx) / cam.cam.s
    const dy = (ev.clientY - sy) / cam.cam.s
    const w = axis.includes('r') ? Math.max(C.MIN_W, r.w + dx) : r.w
    const h = axis.includes('b') ? Math.max(C.MIN_H, r.h + dy) : r.h
    useItems.setState((s) => ({ liveSize: { ...s.liveSize, [day]: { w, h } } }))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const sz = useItems.getState().liveSize[day]
    useItems.setState((s) => {
      const l = { ...s.liveSize }
      delete l[day]
      return { liveSize: l }
    })
    if (moved && sz) void setDaySize(day, sz)
    setTimeout(() => { input.dragged = false }, 0)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}


const objData = (id: string) => useItems.getState().items[id]?.data as ObjData | undefined

/** Mueve un objeto pegado (imagen, texto, link, video, PDF). */
export function startObjMove(id: string, clientX: number, clientY: number) {
  const base = objData(id)
  if (!base) return
  let moved = false
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - clientX, ev.clientY - clientY) < 4) return
    moved = true
    input.dragged = true
    const dx = (ev.clientX - clientX) / cam.cam.s
    const dy = (ev.clientY - clientY) / cam.cam.s
    useItems.setState((s) => ({ liveObj: { ...s.liveObj, [id]: { x: Math.round(base.x + dx), y: Math.round(base.y + dy), w: base.w, h: base.h } } }))
    // sobre un plan: se resalta para soltar y adjuntar
    const key = cardUnder(ev.clientX, ev.clientY)
    if (useUI.getState().attachHover !== key) ui({ attachHover: key })
  }
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const p = useItems.getState().liveObj[id]
    useItems.setState((s) => { const l = { ...s.liveObj }; delete l[id]; return { liveObj: l } })
    const target = moved ? cardUnder(ev.clientX, ev.clientY) : null
    ui({ attachHover: null })
    if (target) void attachToEvent(id, target)
    else if (moved && p) void saveObj(id, { ...base, ...p })
    setTimeout(() => { input.dragged = false }, 0)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

/** Redimensiona un objeto desde su esquina; con `lock` conserva la proporción. */
export function startObjResize(e: React.PointerEvent, id: string, lock = false) {
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  const base = objData(id)
  if (!base) return
  const sx = e.clientX
  const sy = e.clientY
  const ar = base.ar || base.w / base.h
  let moved = false
  const move = (ev: PointerEvent) => {
    moved = true
    input.dragged = true
    const dx = (ev.clientX - sx) / cam.cam.s
    const dy = (ev.clientY - sy) / cam.cam.s
    let w = Math.max(120, base.w + dx)
    let h = Math.max(60, base.h + dy)
    if (lock) h = Math.round(w / ar)
    useItems.setState((s) => ({ liveObj: { ...s.liveObj, [id]: { x: base.x, y: base.y, w: Math.round(w), h: Math.round(h) } } }))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    const p = useItems.getState().liveObj[id]
    useItems.setState((s) => { const l = { ...s.liveObj }; delete l[id]; return { liveObj: l } })
    if (moved && p) void saveObj(id, { ...base, ...p })
    setTimeout(() => { input.dragged = false }, 0)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
