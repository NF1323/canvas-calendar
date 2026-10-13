import { interpolateZoom } from 'd3-interpolate'
import type { Rect } from '../types'

export const MIN_S = 0.04
export const MAX_S = 3

export interface Cam {
  x: number
  y: number
  s: number
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export interface Insets { t: number; b: number; l: number; r: number }

interface FlyOpts {
  insets?: Insets
  padding?: number
  duration?: number
  push?: boolean
  maxScale?: number
  onDone?: () => void
}

/** Cámara imperativa: vive fuera de React y escribe el transform directo. */
class CameraController {
  cam: Cam = { x: 0, y: 0, s: 0.1 }
  vw = 1280
  vh = 800
  bounds: Rect = { x: 0, y: 0, w: 1000, h: 1000 }
  reduce = false
  history: Cam[] = []
  moving = false
  dragging = false

  private subs = new Set<() => void>()
  private idleSubs = new Set<() => void>()
  private vx = 0
  private vy = 0
  private zt: { s: number; sx: number; sy: number } | null = null
  private fly: { t0: number; dur: number; fn: (t: number) => number[]; done?: () => void } | null = null
  private raf = 0
  private last = 0
  private idleT: ReturnType<typeof setTimeout> | undefined

  subscribe(f: () => void) {
    this.subs.add(f)
    return () => { this.subs.delete(f) }
  }
  onIdle(f: () => void) {
    this.idleSubs.add(f)
    return () => { this.idleSubs.delete(f) }
  }

  private emit() {
    this.subs.forEach((f) => f())
    this.moving = true
    clearTimeout(this.idleT)
    this.idleT = setTimeout(() => {
      this.moving = false
      this.idleSubs.forEach((f) => f())
    }, 120)
  }

  setSize(w: number, h: number) {
    this.vw = w
    this.vh = h
    this.emit()
  }
  setBounds(b: Rect) {
    this.bounds = b
  }

  screenToWorld(sx: number, sy: number) {
    return { x: (sx - this.cam.x) / this.cam.s, y: (sy - this.cam.y) / this.cam.s }
  }
  worldToScreen(wx: number, wy: number) {
    return { x: wx * this.cam.s + this.cam.x, y: wy * this.cam.s + this.cam.y }
  }
  center() {
    return this.screenToWorld(this.vw / 2, this.vh / 2)
  }
  viewRect(expand = 0): Rect {
    const a = this.screenToWorld(0, 0)
    const w = this.vw / this.cam.s
    const h = this.vh / this.cam.s
    return { x: a.x - w * expand, y: a.y - h * expand, w: w * (1 + 2 * expand), h: h * (1 + 2 * expand) }
  }

  private clampCam(c: Cam): Cam {
    const b = this.bounds
    const ex = b.w * 0.3
    const ey = b.h * 0.3
    const cx = clamp((this.vw / 2 - c.x) / c.s, b.x - ex, b.x + b.w + ex)
    const cy = clamp((this.vh / 2 - c.y) / c.s, b.y - ey, b.y + b.h + ey)
    return { s: c.s, x: this.vw / 2 - cx * c.s, y: this.vh / 2 - cy * c.s }
  }

  private stopMotion() {
    this.fly = null
    this.zt = null
    this.vx = 0
    this.vy = 0
  }

  /** Cancela cualquier vuelo/inercia por input del usuario. */
  stop() {
    this.stopMotion()
  }

  jump(c: Cam) {
    this.stopMotion()
    this.cam = this.clampCam({ ...c, s: clamp(c.s, MIN_S, MAX_S) })
    this.emit()
  }

  panBy(dx: number, dy: number) {
    this.stopMotion()
    this.cam = this.clampCam({ ...this.cam, x: this.cam.x + dx, y: this.cam.y + dy })
    this.emit()
  }

  release(vx: number, vy: number) {
    if (this.reduce) return
    this.vx = vx
    this.vy = vy
    if (Math.abs(vx) + Math.abs(vy) > 0.02) this.kick()
  }

  zoomAt(sx: number, sy: number, factor: number) {
    this.fly = null
    this.vx = this.vy = 0
    const base = this.zt ? this.zt.s : this.cam.s
    const s = clamp(base * factor, MIN_S, MAX_S)
    if (this.reduce) return this.setScaleAt(s, sx, sy)
    this.zt = { s, sx, sy }
    this.kick()
  }

  private setScaleAt(s: number, sx: number, sy: number) {
    const w = this.screenToWorld(sx, sy)
    this.cam = this.clampCam({ s, x: sx - w.x * s, y: sy - w.y * s })
    this.emit()
  }

  /** Pinch: escala y desplazamiento inmediatos. */
  pinch(sx: number, sy: number, factor: number, dx: number, dy: number) {
    this.stopMotion()
    const s = clamp(this.cam.s * factor, MIN_S, MAX_S)
    const w = this.screenToWorld(sx - dx, sy - dy)
    this.cam = this.clampCam({ s, x: sx - w.x * s, y: sy - w.y * s })
    this.emit()
  }

  /** Encuadra `rect` dentro del área libre (viewport menos `insets`, que reservan la interfaz). */
  fitCam(rect: Rect, padding = 48, maxScale = MAX_S, insets?: Insets): Cam {
    const { t, b, l, r } = insets ?? { t: padding, b: padding, l: padding, r: padding }
    const aw = Math.max(50, this.vw - l - r)
    const ah = Math.max(50, this.vh - t - b)
    const s = clamp(Math.min(aw / rect.w, ah / rect.h), MIN_S, maxScale)
    const cx = rect.x + rect.w / 2
    const cy = rect.y + rect.h / 2
    return { s, x: l + aw / 2 - cx * s, y: t + ah / 2 - cy * s }
  }

  flyToRect(rect: Rect, o: FlyOpts = {}): Cam {
    const target = this.fitCam(rect, o.padding ?? 48, o.maxScale ?? MAX_S, o.insets)
    this.flyTo(target, o)
    return target
  }

  flyTo(target: Cam, o: FlyOpts = {}) {
    if (o.push !== false) {
      this.history.push({ ...this.cam })
      if (this.history.length > 30) this.history.shift()
    }
    this.stopMotion()
    if (this.reduce) {
      this.cam = { ...target }
      this.emit()
      o.onDone?.()
      return
    }
    const from = this.cam
    const a = [(this.vw / 2 - from.x) / from.s, (this.vh / 2 - from.y) / from.s, this.vw / from.s]
    const b = [(this.vw / 2 - target.x) / target.s, (this.vh / 2 - target.y) / target.s, this.vw / target.s]
    const interp = interpolateZoom(a as [number, number, number], b as [number, number, number])
    const dur = o.duration ?? clamp((interp.duration || 0) * 0.9, 450, 1200)
    this.fly = {
      t0: performance.now(),
      dur,
      fn: (t) => interp(t),
      done: o.onDone,
    }
    this.kick()
  }

  back() {
    const prev = this.history.pop()
    if (!prev) return false
    this.flyTo(prev, { push: false })
    return true
  }

  private kick() {
    if (this.raf) return
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  private tick = (now: number) => {
    this.raf = 0
    const dt = Math.min(now - this.last, 50)
    this.last = now
    let again = false

    if (this.fly) {
      const f = this.fly
      const t = Math.min(1, (now - f.t0) / f.dur)
      const [cx, cy, w] = f.fn(easeInOutCubic(t))
      const s = clamp(this.vw / w, MIN_S, MAX_S)
      this.cam = { s, x: this.vw / 2 - cx * s, y: this.vh / 2 - cy * s }
      this.emit()
      if (t >= 1) {
        this.fly = null
        f.done?.()
      } else again = true
    } else {
      if (this.zt) {
        const z = this.zt
        const k = 1 - Math.exp(-dt / 30)
        const s = this.cam.s + (z.s - this.cam.s) * k
        const done = Math.abs(z.s - s) < z.s * 0.0008
        this.setScaleAt(done ? z.s : s, z.sx, z.sy)
        if (done) this.zt = null
        else again = true
      }
      if (!this.dragging && (Math.abs(this.vx) > 0.01 || Math.abs(this.vy) > 0.01)) {
        const f = Math.pow(0.92, dt / 16.667)
        this.cam = this.clampCam({ ...this.cam, x: this.cam.x + this.vx * dt, y: this.cam.y + this.vy * dt })
        this.vx *= f
        this.vy *= f
        this.emit()
        again = true
      }
    }
    if (again) this.raf = requestAnimationFrame(this.tick)
  }
}

export const cam = new CameraController()
