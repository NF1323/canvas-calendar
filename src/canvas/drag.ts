import type { Occurrence } from '../types'
import { cam } from './camera'
import { input } from './input'
import { model } from '../calendar/model'
import { ui, useUI } from '../store'
import { duplicateTo, moveToCanvas, moveToDay, moveToTray, patchEvent, sortBetween } from '../actions'
import { sendMsg } from '../realtime/net'
import { throttle } from '../lib/util'

const sendDrag = throttle((occ: Occurrence | null, day: string | null) => {
  sendMsg({
    type: 'drag',
    d: occ ? { id: occ.event.id, day, title: occ.title, owner: occ.owner, kind: 'drag' } : null,
  })
}, 60)

function hit(x: number, y: number) {
  const m = model.current
  const canvas = document.querySelector('[data-canvas]') as HTMLElement | null
  const el = document.elementFromPoint(x, y)
  const overTray = !!el?.closest('[data-tray]')
  if (!m || !canvas || overTray || el?.closest('[data-hud]')) return { day: null as string | null, overTray, wx: 0, wy: 0, hud: true }
  const r = canvas.getBoundingClientRect()
  const w = cam.screenToWorld(x - r.left, y - r.top)
  for (const [d, rc] of Object.entries(m.layout.dayRects)) {
    if (w.x >= rc.x && w.x <= rc.x + rc.w && w.y >= rc.y && w.y <= rc.y + rc.h) return { day: d, overTray, wx: w.x, wy: w.y, hud: false }
  }
  return { day: null, overTray, wx: w.x, wy: w.y, hud: false }
}

/** Orden fraccionario para soltar una tarjeta en `day` a la altura `wy`. */
function sortAt(occ: Occurrence, day: string, wy: number) {
  const m = model.current!
  const list = m.occsByDay[day] ?? []
  const mids: { sort: number; mid: number }[] = []
  for (const o of list) {
    const r = m.cardRects[o.key]
    if (o.all_day && o.event.id !== occ.event.id && r) mids.push({ sort: o.sort, mid: r.y + r.h / 2 })
  }
  mids.sort((a, b) => a.sort - b.sort)
  const idx = mids.filter((x) => x.mid < wy).length
  return sortBetween(mids.map((x) => x.sort), idx)
}

/** Arranca el seguimiento de un posible arrastre de tarjeta. Devuelve nada; todo va por window. */
export function beginCardDrag(e: React.PointerEvent, occ: Occurrence) {
  if (e.button !== 0) return
  const start = { x: e.clientX, y: e.clientY }
  let dragging = false
  let edge = 0

  const move = (ev: PointerEvent) => {
    if (!dragging) {
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return
      dragging = true
      input.dragged = true
      cam.stop()
    }
    const h = hit(ev.clientX, ev.clientY)
    ui({ drag: { occ, x: ev.clientX, y: ev.clientY, dup: ev.altKey, overDay: h.day, overTray: h.overTray } })
    sendDrag(occ, h.day)
    const m = 48
    const dx = ev.clientX < m ? 14 : ev.clientX > cam.vw - m ? -14 : 0
    const dy = ev.clientY < m + 40 ? 14 : ev.clientY > cam.vh - m ? -14 : 0
    edge = dx || dy ? 1 : 0
    if (edge) cam.panBy(dx, dy)
  }

  const up = async (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    if (!dragging) return
    ui({ drag: null })
    sendMsg({ type: 'drag', d: null })
    const h = hit(ev.clientX, ev.clientY)
    const loose = !occ.event.start_date
    if (h.overTray) {
      if (!loose || occ.event.canvas_x !== null) await moveToTray(occ)
    } else if (h.day) {
      const sort = sortAt(occ, h.day, h.wy)
      if (ev.altKey) await duplicateTo(occ, h.day, sort)
      else await moveToDay(occ, h.day, sort)
    } else if (!h.hud) {
      // soltado en espacio vacío: queda como plan suelto en ese punto
      const x = h.wx - 102
      const y = h.wy - 20
      if (ev.altKey) {
        const row = await duplicateTo(occ, null)
        await patchEvent(row.id, { canvas_x: Math.round(x), canvas_y: Math.round(y) })
      } else await moveToCanvas(occ, x, y)
    }
    setTimeout(() => { input.dragged = false }, 0)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
