import { useEffect, useRef } from 'react'
import type { Model } from '../calendar/model'
import { cam } from '../canvas/camera'
import { ownerColor, useData, useUI } from '../store'
import { anchorToWorld } from '../realtime/anchor'

const W = 200
const H = 140

export function Minimap({ model }: { model: Model }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const profiles = useData((s) => s.profiles)
  const peers = useUI((s) => s.peers)
  const peersRef = useRef(peers)
  peersRef.current = peers

  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    c.width = W * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    const b = model.layout.bounds
    const k = Math.min((W - 8) / b.w, (H - 8) / b.h)
    const ox = (W - b.w * k) / 2
    const oy = (H - b.h * k) / 2
    const css = getComputedStyle(document.documentElement)
    const island = css.getPropertyValue('--island').trim() || '#1D1A16'
    const dayBg = css.getPropertyValue('--day').trim() || '#26221C'

    // color dominante por día
    const dom: Record<string, string> = {}
    for (const [d, list] of Object.entries(model.occsByDay)) {
      const cnt: Record<string, number> = {}
      list.forEach((o) => (cnt[o.owner] = (cnt[o.owner] ?? 0) + 1))
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]
      if (top) dom[d] = ownerColor(top[0], profiles)
    }

    let raf = 0
    const draw = () => {
      raf = 0
      g.clearRect(0, 0, W, H)
      for (const mo of model.layout.months) {
        g.fillStyle = island
        g.fillRect(ox + mo.rect.x * k, oy + mo.rect.y * k, mo.rect.w * k, mo.rect.h * k)
      }
      for (const [d, r] of Object.entries(model.layout.dayRects)) {
        g.fillStyle = dom[d] ?? dayBg
        g.globalAlpha = dom[d] ? 0.95 : 0.6
        g.fillRect(ox + r.x * k, oy + r.y * k, Math.max(1.2, r.w * k - 0.6), Math.max(1.2, r.h * k - 0.6))
      }
      g.globalAlpha = 1
      const vr = cam.viewRect()
      g.strokeStyle = '#fff'
      g.lineWidth = 1.5
      g.strokeRect(ox + vr.x * k, oy + vr.y * k, vr.w * k, vr.h * k)
      // viewport del otro: centro anclado
      for (const [who, rm] of Object.entries(peersRef.current)) {
        if (!rm.online || !rm.cursor) continue
        const w = anchorToWorld(rm.cursor, model.layout)
        if (!w) continue
        g.fillStyle = ownerColor(who, profiles)
        g.beginPath()
        g.arc(ox + w.x * k, oy + w.y * k, 3, 0, Math.PI * 2)
        g.fill()
      }
    }
    const sched = () => { if (!raf) raf = requestAnimationFrame(draw) }
    sched()
    const un = cam.subscribe(sched)
    const iv = setInterval(sched, 600)

    const move = (e: PointerEvent) => {
      const r = c.getBoundingClientRect()
      const wx = (e.clientX - r.left - ox) / k
      const wy = (e.clientY - r.top - oy) / k
      cam.jump({ ...cam.cam, x: cam.vw / 2 - wx * cam.cam.s, y: cam.vh / 2 - wy * cam.cam.s })
    }
    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId)
      move(e)
      c.addEventListener('pointermove', move)
    }
    const up = (e: PointerEvent) => {
      c.releasePointerCapture(e.pointerId)
      c.removeEventListener('pointermove', move)
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointerup', up)
    return () => {
      un()
      clearInterval(iv)
      if (raf) cancelAnimationFrame(raf)
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointermove', move)
    }
  }, [model, profiles])

  return <canvas ref={ref} className="minimap" style={{ width: W, height: H }} aria-label="Minimapa" />
}
