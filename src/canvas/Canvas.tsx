import { useEffect, useRef, type ReactNode } from 'react'
import { cam } from './camera'
import { input } from './input'
import { ui, useUI, type Lod } from '../store'
import { model } from '../calendar/model'
import { intersects } from '../calendar/layout'
import { startGroupMove, startMove, startObjMove } from './move'

export const lodOf = (s: number): Lod => (s < 0.1 ? 'far' : s < 0.55 ? 'mid' : 'near')

export function Canvas({ children }: { children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrap.current!
    const w = world.current!
    const bx = box.current!

    let lastZoom = 0
    const apply = () => {
      const { x, y, s } = cam.cam
      w.style.transform = cam.moving
        ? `translate3d(${x}px,${y}px,0) scale(${s})`
        : `translate(${x}px,${y}px) scale(${s})`
      el.classList.toggle('moving', cam.moving)
      let st = 40 * s
      if (!(st > 0) || !Number.isFinite(st)) st = 40
      for (let i = 0; i < 24 && st < 14; i++) st *= 2
      if (Math.abs(s - lastZoom) / s > 0.02) {
        lastZoom = s
        w.style.setProperty('--zoom', String(s))
      }
      el.style.backgroundSize = `${st}px ${st}px`
      el.style.backgroundPosition = `${x}px ${y}px`
    }
    let vrTimer: ReturnType<typeof setTimeout> | undefined
    const unsub = cam.subscribe(() => {
      apply()
      if (!vrTimer) {
        vrTimer = setTimeout(() => {
          vrTimer = undefined
          ui({ viewRect: cam.viewRect(0.5) })
        }, 100)
      }
    })
    const unIdle = cam.onIdle(() => {
      apply()
      ui({ lod: lodOf(cam.cam.s), scale: cam.cam.s, viewRect: cam.viewRect(0.5) })
    })

    const ro = new ResizeObserver(() => cam.setSize(el.clientWidth, el.clientHeight))
    ro.observe(el)
    cam.setSize(el.clientWidth, el.clientHeight)
    apply()

    /* ── rueda / trackpad ── */
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('[data-scroll]')) return
      e.preventDefault()
      if (useUI.getState().following) useUI.setState({ following: null })
      let dx = e.deltaX
      let dy = e.deltaY
      if (e.deltaMode === 1) { dx *= 16; dy *= 16 }
      const mode = useUI.getState().prefs.wheel
      const trackpad = !e.ctrlKey && (dx !== 0 || !Number.isInteger(dy))
      if (e.ctrlKey) {
        // pinch de trackpad = deltas chicas (sensible); Ctrl + rueda de mouse = saltos de ~100 (suave)
        const k = Math.abs(dy) >= 40 || e.deltaMode === 1 ? 0.0015 : 0.01
        cam.zoomAt(e.clientX, e.clientY, Math.min(1.25, Math.max(0.8, Math.exp(-dy * k))))
      }
      else if (mode === 'pan' || trackpad) cam.panBy(-dx, -dy)
      else cam.zoomAt(e.clientX, e.clientY, Math.min(1.25, Math.max(0.8, Math.exp(-dy * 0.0015))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })

    /* ── punteros ── */
    const ptrs = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'pan' | 'select' | 'pinch' = 'none'
    let start = { x: 0, y: 0 }
    let last = { x: 0, y: 0, t: 0 }
    let vel = { x: 0, y: 0 }
    let captured = false
    let pinchPrev = { d: 1, mx: 0, my: 0 }
    let baseSel: string[] = []

    const mid = () => {
      const [a, b] = [...ptrs.values()]
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button === 2) return
      const t = e.target as HTMLElement
      const obj = t.closest('[data-obj]') as HTMLElement | null
      if (obj) {
        if (e.button === 0 && !input.space && !t.closest('button,input,textarea,iframe,a,select,.obj-rz')) {
          cam.stop()
          startObjMove(obj.dataset.obj!, e.clientX, e.clientY)
        }
        return
      }
      if (e.button === 0 && !input.space && !e.shiftKey && useUI.getState().prefs.view === 'custom' && !t.closest('[data-card],[data-free],[data-hud],.rz,input,textarea,select,a')) {
        // día desagrupado: se arrastra desde cualquier lado; si no, el mes (fondo, título, márgenes)
        // varios días seleccionados: se arrastran juntos desde cualquiera de ellos
        const anyDay = t.closest('.day') as HTMLElement | null
        const selNow = useUI.getState().selection
        if (anyDay && selNow.length > 1 && selNow.includes(anyDay.dataset.day!)) {
          cam.stop()
          startGroupMove(selNow, e.clientX, e.clientY)
          return
        }
        const ungDay = t.closest('.day.ungrouped') as HTMLElement | null
        if (ungDay) {
          cam.stop()
          startMove(`day:${ungDay.dataset.day}`, e.clientX, e.clientY)
          return
        }
        const isl = t.closest('[data-month]') as HTMLElement | null
        if (isl && !t.closest('[data-day],.island-ctl,.week-handle')) {
          cam.stop()
          startMove(`month:${isl.dataset.month}`, e.clientX, e.clientY)
          return
        }
      }
      if (t.closest('[data-nodrag]') && !input.space) return
      cam.stop()
      if (useUI.getState().following) useUI.setState({ following: null })
      input.dragged = false
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size === 2) {
        mode = 'pinch'
        pinchPrev = mid()
        cam.dragging = true
        input.dragged = true
        return
      }
      const emptyBg = !t.closest('[data-month],[data-day],[data-free],[data-obj]')
      const wantSelect =
        e.button === 0 && !input.space && e.pointerType === 'mouse' &&
        (e.shiftKey || (emptyBg && useUI.getState().prefs.dragEmpty === 'select'))
      mode = wantSelect ? 'select' : 'pan'
      baseSel = e.ctrlKey || e.metaKey ? useUI.getState().selection : []
      start = { x: e.clientX, y: e.clientY }
      last = { x: e.clientX, y: e.clientY, t: performance.now() }
      vel = { x: 0, y: 0 }
      captured = false
      cam.dragging = mode === 'pan'
    }

    const onMove = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (mode === 'pinch' && ptrs.size >= 2) {
        const m = mid()
        cam.pinch(m.mx, m.my, m.d / pinchPrev.d, m.mx - pinchPrev.mx, m.my - pinchPrev.my)
        pinchPrev = m
        return
      }
      if (mode === 'none') return
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      if (!captured && dist > 4) {
        captured = true
        input.dragged = true
        el.setPointerCapture(e.pointerId)
      }
      if (!captured) return
      if (mode === 'pan') {
        const now = performance.now()
        const dt = Math.max(1, now - last.t)
        const dx = e.clientX - last.x
        const dy = e.clientY - last.y
        vel = { x: 0.7 * vel.x + 0.3 * (dx / dt), y: 0.7 * vel.y + 0.3 * (dy / dt) }
        last = { x: e.clientX, y: e.clientY, t: now }
        cam.panBy(dx, dy)
      } else if (mode === 'select') {
        const r = el.getBoundingClientRect()
        const x0 = Math.min(start.x, e.clientX) - r.left
        const y0 = Math.min(start.y, e.clientY) - r.top
        bx.style.display = 'block'
        bx.style.left = `${x0}px`
        bx.style.top = `${y0}px`
        bx.style.width = `${Math.abs(e.clientX - start.x)}px`
        bx.style.height = `${Math.abs(e.clientY - start.y)}px`
        const a = cam.screenToWorld(Math.min(start.x, e.clientX) - r.left, Math.min(start.y, e.clientY) - r.top)
        const b = cam.screenToWorld(Math.max(start.x, e.clientX) - r.left, Math.max(start.y, e.clientY) - r.top)
        const sel = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }
        const m = model.current
        if (m) {
          const days = Object.entries(m.layout.dayRects)
            .filter(([, rc]) => intersects(rc, sel))
            .map(([d]) => d)
            .sort()
          const all = baseSel.length ? [...new Set([...baseSel, ...days])].sort() : days
          ui({ selection: all, selAnchor: all[0] ?? null, selPanel: true })
        }
      }
    }

    const onUp = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) return
      ptrs.delete(e.pointerId)
      if (captured) {
        try { el.releasePointerCapture(e.pointerId) } catch { /* ya liberado */ }
      }
      if (mode === 'pinch') {
        if (ptrs.size < 2) { mode = 'none'; cam.dragging = false }
        return
      }
      if (mode === 'pan' && captured) {
        const fresh = performance.now() - last.t < 80
        cam.dragging = false
        if (fresh) cam.release(vel.x, vel.y)
      }
      // clic en vacío (sin arrastrar) deselecciona, como en el explorador
      if (mode === 'select' && !captured && !e.shiftKey && !e.ctrlKey && !e.metaKey) ui({ selection: [], selAnchor: null })
      bx.style.display = 'none'
      cam.dragging = false
      mode = 'none'
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)

    return () => {
      unsub()
      unIdle()
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [])

  return (
    <div ref={wrap} className="canvas" data-canvas>
      <div ref={world} className="world" data-world>
        {children}
      </div>
      <div ref={box} className="select-box" />
    </div>
  )
}
