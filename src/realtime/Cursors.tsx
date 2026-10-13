import { useEffect, useRef } from 'react'
import { cam } from '../canvas/camera'
import { model } from '../calendar/model'
import { ownerColor, othersOf, useData, useUI } from '../store'
import { anchorToWorld, worldToAnchor } from './anchor'
import { sendMsg, throttleMs } from './net'
import { throttle } from '../lib/util'
import { flyToRect } from '../canvas/nav'

/** Envía mi cursor, viewport y selección al otro. */
export function useBroadcasts() {
  useEffect(() => {
    const canvas = () => document.querySelector('[data-canvas]') as HTMLElement | null
    let lastX = -99
    let lastY = -99
    const sendCursor = throttle((x: number, y: number) => {
      const m = model.current
      const c = canvas()
      if (!m || !c) return
      const r = c.getBoundingClientRect()
      const w = cam.screenToWorld(x - r.left, y - r.top)
      sendMsg({ type: 'cursor', a: worldToAnchor(w.x, w.y, m.layout) })
    }, () => throttleMs(40))
    const onMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - lastX, e.clientY - lastY) < 2) return
      lastX = e.clientX
      lastY = e.clientY
      sendCursor(e.clientX, e.clientY)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onMove, { passive: true })

    const sendViewport = throttle(() => {
      const m = model.current
      if (!m) return
      const c = cam.center()
      sendMsg({ type: 'viewport', a: worldToAnchor(c.x, c.y, m.layout), s: cam.cam.s, focus: useUI.getState().focusDay })
    }, () => throttleMs(250))
    const unCam = cam.subscribe(sendViewport)
    const unIdle = cam.onIdle(sendViewport)

    const unSel = useUI.subscribe((s, p) => {
      if (s.selection !== p.selection) sendMsg({ type: 'selection', days: s.selection })
    })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onMove)
      unCam(); unIdle(); unSel()
    }
  }, [])
}

/** Un cursor (flecha tipo Figma) + indicador de borde por cada persona conectada. */
export function RemoteCursor() {
  const me = useData((s) => s.me)
  const profiles = useData((s) => s.profiles)
  return (
    <>
      {othersOf(me, profiles).map((p) => (
        <PeerCursor key={p.person} person={p.person} />
      ))}
    </>
  )
}

function PeerCursor({ person }: { person: string }) {
  const el = useRef<HTMLDivElement>(null)
  const edge = useRef<HTMLButtonElement>(null)
  const profiles = useData((s) => s.profiles)
  const other = profiles.find((p) => p.person === person)
  const color = ownerColor(person, profiles)
  const pos = useRef({ x: 0, y: 0, init: false })

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const r = useUI.getState().peers[person]
      const node = el.current
      const eg = edge.current
      if (!node || !eg) return
      const m = model.current
      // visible si está conectado, o si mandó su cursor hace poco (la presencia puede tardar en sincronizar)
      const live = !!r && (r.online || Date.now() - r.cursorAt < 15000)
      const w = live && r.cursor && m ? anchorToWorld(r.cursor, m.layout) : null
      if (!w) { node.style.opacity = '0'; eg.style.opacity = '0'; pos.current.init = false; return }
      // lerp en coordenadas de mundo para que siga la cámara
      const p = pos.current
      if (!p.init) { p.x = w.x; p.y = w.y; p.init = true }
      p.x += (w.x - p.x) * 0.25
      p.y += (w.y - p.y) * 0.25
      const c = document.querySelector('[data-canvas]') as HTMLElement | null
      const rc = c?.getBoundingClientRect()
      const s = cam.worldToScreen(p.x, p.y)
      const sx = s.x + (rc?.left ?? 0)
      const sy = s.y + (rc?.top ?? 0)
      // solo se oculta si está inactivo o con la pestaña oculta
      const quiet = r.idle
      const vw = cam.vw
      const vh = cam.vh
      const inside = s.x >= 0 && s.y >= 0 && s.x <= vw && s.y <= vh
      node.style.opacity = inside && !quiet ? '1' : '0'
      node.style.transform = `translate(${sx}px,${sy}px)`
      if (!inside && !quiet) {
        const cx = vw / 2
        const cy = vh / 2
        const dx = s.x - cx
        const dy = s.y - cy
        const k = Math.min((vw / 2 - 28) / Math.abs(dx || 1e-6), (vh / 2 - 28) / Math.abs(dy || 1e-6))
        eg.style.opacity = '1'
        eg.style.transform = `translate(${cx + dx * k - 14}px,${cy + dy * k - 14}px)`
      } else eg.style.opacity = '0'
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [person])

  const goTo = () => {
    const r = useUI.getState().peers[person]
    const m = model.current
    if (!r?.cursor || !m) return
    const w = anchorToWorld(r.cursor, m.layout)
    if (w) flyToRect({ x: w.x - 300, y: w.y - 200, w: 600, h: 400 })
  }
  const typing = useUI((s) => !!s.peers[person]?.typing)

  return (
    <>
      <div ref={el} className="rcursor" style={{ ['--cc' as string]: color, opacity: 0 }} aria-hidden>
        <span className="rc-av" style={{ borderColor: color, background: color }}>
          {other?.avatar ? <img src={other.avatar} alt="" draggable={false} /> : other?.display_name[0]}
        </span>
        <svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 2l14 7-6 2-2 6z" fill={color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>
        <span className="rc-name" style={{ background: color }}>{other?.display_name}{typing ? ' · escribiendo…' : ''}</span>
      </div>
      <button ref={edge} className="redge" style={{ background: color, opacity: 0 }} onClick={goTo} aria-label={`Ir a ${other?.display_name}`}>
        {other?.avatar ? <img className="av-img" src={other.avatar} alt="" draggable={false} /> : other?.display_name[0]}
      </button>
    </>
  )
}
