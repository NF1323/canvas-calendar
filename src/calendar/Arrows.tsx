import { useEffect, useRef, useState } from 'react'
import type { ElRef, Rect } from '../types'
import type { Model } from './model'
import { useUI } from '../store'
import { objsOf, removeItem, saveItem, useItems } from '../canvasItems'
import { cam } from '../canvas/camera'

interface Pt { x: number; y: number }
interface ArrowData { from: ElRef; to: ElRef; label?: string; via?: Pt }

const cx = (r: Rect) => r.x + r.w / 2
const cy = (r: Rect) => r.y + r.h / 2

/** Punto donde la recta centro→destino cruza el borde del rectángulo. */
function edge(r: Rect, tx: number, ty: number): Pt {
  const dx = tx - cx(r)
  const dy = ty - cy(r)
  if (!dx && !dy) return { x: cx(r), y: cy(r) }
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity)
  return { x: cx(r) + dx * t, y: cy(r) + dy * t }
}

export function resolveRef(model: Model, ref: ElRef): Rect | null {
  if (ref.k === 'month') return model.layout.months.find((m) => m.key === ref.id)?.rect ?? null
  if (ref.k === 'day') return model.layout.dayRects[ref.id] ?? null
  return model.cardRects[ref.id] ?? null
}

/** Mes que contiene al elemento (no cuenta como obstáculo para su propia flecha). */
function monthOf(ref: ElRef): string | null {
  if (ref.k === 'month') return ref.id
  if (ref.k === 'day') return ref.id.slice(0, 7)
  const m = ref.id.match(/@(\d{4}-\d{2})-\d{2}$/)
  return m ? m[1] : null
}

/* ───────── ruteo: la flecha va completamente curva, por arriba y alejada de los meses ───────── */

interface Obs { r: Rect; tag: boolean }
type Seg = [Pt, Pt, Pt, Pt] // curva cúbica: inicio, control 1, control 2, fin

/** Espacio sobre cada mes ocupado por su etiqueta ("Mes actual…", "Pasado"…). */
const TAG = 150

const inflate = (o: Obs, m: number): Rect => ({ x: o.r.x - m, y: o.r.y - m - (o.tag ? TAG : 0), w: o.r.w + 2 * m, h: o.r.h + 2 * m + (o.tag ? TAG : 0) })

function hits(a: Pt, b: Pt, r: Rect): boolean {
  const e = 0.5
  const x0 = r.x + e, x1 = r.x + r.w - e, y0 = r.y + e, y1 = r.y + r.h - e
  const dx = b.x - a.x
  const dy = b.y - a.y
  const p = [-dx, dx, -dy, dy]
  const q = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y]
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t }
    }
  }
  return t1 > t0
}

/** Camino más corto S→T por las esquinas de los obstáculos inflados; prefiere pasar por arriba (esquinas de abajo cuestan más). */
function route(S: Pt, T: Pt, inf: Rect[]): Pt[] {
  const clear = (a: Pt, b: Pt) => !inf.some((r) => hits(a, b, r))
  if (clear(S, T)) return [S, T]
  const nodes: Pt[] = [S, T]
  const bottom: boolean[] = [false, false]
  for (const r of inf) {
    nodes.push({ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h })
    bottom.push(false, false, true, true)
  }
  const n = nodes.length
  const dist = new Array<number>(n).fill(Infinity)
  const prev = new Array<number>(n).fill(-1)
  const done = new Array<boolean>(n).fill(false)
  dist[0] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i
    if (u < 0 || u === 1) break
    done[u] = true
    for (let j = 0; j < n; j++) {
      if (done[j]) continue
      const d = dist[u] + Math.hypot(nodes[u].x - nodes[j].x, nodes[u].y - nodes[j].y) * (bottom[j] ? 1.7 : 1)
      if (d < dist[j] && clear(nodes[u], nodes[j])) { dist[j] = d; prev[j] = u }
    }
  }
  if (dist[1] === Infinity) return [S, T]
  const out: Pt[] = []
  for (let i = 1; i >= 0; i = prev[i]) { out.push(nodes[i]); if (i === 0) break }
  return out.reverse()
}

/** Spline Catmull-Rom → curvas cúbicas: pasa suavemente por todos los puntos, sin tramos rectos ni esquinas. */
function spline(P: Pt[]): Seg[] {
  const segs: Seg[] = []
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]
    segs.push([
      p1,
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    ])
  }
  return segs
}

/** Arco suave entre dos puntos, abombado hacia arriba. */
function arc(a: Pt, b: Pt): Seg[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  let nx = -dy / len
  let ny = dx / len
  if (ny > 0) { nx = -nx; ny = -ny }
  const bend = Math.min(Math.max(len * 0.22, 60), 520)
  const c = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend }
  return [[a, { x: a.x + (2 / 3) * (c.x - a.x), y: a.y + (2 / 3) * (c.y - a.y) }, { x: b.x + (2 / 3) * (c.x - b.x), y: b.y + (2 / 3) * (c.y - b.y) }, b]]
}

const bez = (s: Seg, t: number): Pt => {
  const u = 1 - t
  return {
    x: u * u * u * s[0].x + 3 * u * u * t * s[1].x + 3 * u * t * t * s[2].x + t * t * t * s[3].x,
    y: u * u * u * s[0].y + 3 * u * u * t * s[1].y + 3 * u * t * t * s[2].y + t * t * t * s[3].y,
  }
}
const sample = (segs: Seg[], n = 14): Pt[] => {
  const out: Pt[] = [segs[0][0]]
  for (const s of segs) for (let i = 1; i <= n; i++) out.push(bez(s, i / n))
  return out
}
const distTo = (p: Pt, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)))

/** Curva completa de a→b que mantiene distancia de los obstáculos; si no alcanza, se aleja más (hasta 4 intentos). */
function smoothRoute(a: Rect, b: Rect, obs: Obs[]): { segs: Seg[]; p1: Pt; p2: Pt } {
  const S = { x: cx(a), y: cy(a) }
  const T = { x: cx(b), y: cy(b) }
  let best: { segs: Seg[]; p1: Pt; p2: Pt } | null = null
  for (const m of [120, 190, 270, 380]) {
    const W = route(S, T, obs.map((o) => inflate(o, m)))
    const first = W[1]
    const last = W[W.length - 2]
    const p1 = edge(a, first.x, first.y)
    const p2 = edge(b, last.x, last.y)
    const segs = W.length === 2 ? arc(p1, p2) : spline([p1, ...W.slice(1, -1), p2])
    best = { segs, p1, p2 }
    // ¿la curva queda a más de 55 de cada mes (incluida su etiqueta) y de los objetos?
    const pts = sample(segs)
    const ok = obs.every((o) => {
      const r: Rect = o.tag ? { x: o.r.x, y: o.r.y - 90, w: o.r.w, h: o.r.h + 90 } : o.r
      return pts.every((p) => distTo(p, r) > 55)
    })
    if (ok) break
  }
  return best!
}

const segsPath = (segs: Seg[]) => `M ${segs[0][0].x} ${segs[0][0].y} ` + segs.map((s) => `C ${s[1].x} ${s[1].y} ${s[2].x} ${s[2].y} ${s[3].x} ${s[3].y}`).join(' ')

/** Punto a la mitad del largo de la polilínea. */
function midOf(pts: Pt[]): Pt {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (acc + l >= total / 2) {
      const t = (total / 2 - acc) / (l || 1)
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t }
    }
    acc += l
  }
  return pts[0]
}

function ArrowLabel({ id, data, on }: { id: string; data: ArrowData; on: boolean }) {
  const [v, setV] = useState(data.label ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setV(data.label ?? '') }, [data.label])
  useEffect(() => { if (on && !data.label) ref.current?.focus() }, [on])
  const save = () => {
    const t = v.trim()
    if (t !== (data.label ?? '')) void saveItem(id, 'arrow', { ...data, label: t || undefined })
  }
  if (!on && !data.label) return null
  return (
    <div className={`arrow-label ${on ? 'edit' : ''}`} data-nodrag onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (!on) useItems.setState({ arrowSel: id }) }}>
      {on ? (
        <>
          <input
            ref={ref}
            value={v}
            maxLength={60}
            placeholder="Rótulo de la conexión…"
            aria-label="Rótulo de la flecha"
            onChange={(e) => setV(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur() }
              if (e.key === 'Escape') { e.stopPropagation(); setV(data.label ?? ''); (e.target as HTMLInputElement).blur() }
            }}
          />
          <button aria-label="Borrar flecha" title="Borrar flecha" onClick={(e) => { e.stopPropagation(); void removeItem(id) }}>✕</button>
        </>
      ) : (
        <span>{data.label}</span>
      )}
    </div>
  )
}

export function Arrows({ model }: { model: Model }) {
  const items = useItems((s) => s.items)
  const liveObj = useItems((s) => s.liveObj)
  const sel = useItems((s) => s.arrowSel)
  const scale = useUI((s) => s.scale)
  const lod = useUI((s) => s.lod)
  // curva en edición (se ve en vivo y se guarda al soltar)
  const [drag, setDrag] = useState<{ id: string; via: Pt } | null>(null)
  const hs = Math.max(14, 16 / Math.max(scale, 0.04))
  const k = 1 / Math.max(scale, 0.04)

  // al alejar el zoom las flechas desaparecen (igual que los días), para que se lea el nombre de cada mes
  if (lod === 'far') return null

  const arrows = Object.values(items).filter((i) => i.kind === 'arrow')
  const objRects: Rect[] = objsOf(items).map((o) => { const d = liveObj[o.id] ?? o.data; return { x: d.x, y: d.y, w: d.w, h: d.h } })

  const startDrag = (e: React.PointerEvent, id: string, data: ArrowData, from: Pt) => {
    e.stopPropagation()
    e.preventDefault()
    useItems.setState({ arrowSel: id })
    const toWorld = (ev: PointerEvent) => cam.screenToWorld(ev.clientX, ev.clientY)
    let last = from
    setDrag({ id, via: from })
    const move = (ev: PointerEvent) => { last = toWorld(ev); setDrag({ id, via: last }) }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDrag(null)
      void saveItem(id, 'arrow', { ...data, via: { x: Math.round(last.x), y: Math.round(last.y) } })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <svg className="arrows" width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 8 }}>
      {arrows.map((it) => {
        const data = it.data as ArrowData
        const { from, to } = data
        const a = resolveRef(model, from)
        const b = resolveRef(model, to)
        if (!a || !b) return null
        const via = drag?.id === it.id ? drag.via : data.via

        let d: string
        let p2: Pt
        let tail: Pt // hacia dónde mira la punta
        let mid: Pt

        if (via) {
          // curva moldeada a mano: pasa por `via`
          const p1 = edge(a, via.x, via.y)
          p2 = edge(b, via.x, via.y)
          const c = { x: 2 * via.x - (p1.x + p2.x) / 2, y: 2 * via.y - (p1.y + p2.y) / 2 }
          d = `M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`
          tail = c
          mid = via
        } else {
          // curva automática: por arriba y alejada de los meses que no son origen ni destino
          const skip = new Set([monthOf(from), monthOf(to)])
          const obs: Obs[] = [
            ...model.layout.months.filter((m) => !skip.has(m.key)).map((m) => ({ r: m.rect, tag: true })),
            ...objRects.map((r) => ({ r, tag: false })),
          ]
          const sr = smoothRoute(a, b, obs)
          d = segsPath(sr.segs)
          p2 = sr.p2
          tail = sr.segs[sr.segs.length - 1][2]
          mid = midOf(sample(sr.segs, 8))
        }

        const tx = p2.x - tail.x
        const ty = p2.y - tail.y
        const tl = Math.hypot(tx, ty) || 1
        const ux = tx / tl
        const uy = ty / tl
        const head = [
          [p2.x, p2.y],
          [p2.x - ux * hs + -uy * hs * 0.5, p2.y - uy * hs + ux * hs * 0.5],
          [p2.x - ux * hs - -uy * hs * 0.5, p2.y - uy * hs - ux * hs * 0.5],
        ].map((p) => p.join(',')).join(' ')
        const on = sel === it.id

        return (
          <g key={it.id} data-arrow={it.id} className={`arrow ${on ? 'on' : ''}`}>
            <clipPath id={`ac-${it.id}`}>
              <path clipRule="evenodd" d={`M -1e7 -1e7 H 1e7 V 1e7 H -1e7 Z ${[a, b].map((r) => `M ${r.x} ${r.y} h ${r.w} v ${r.h} h ${-r.w} Z`).join(' ')}`} />
            </clipPath>
            <path d={d} fill="none" stroke="transparent" strokeWidth={18} vectorEffect="non-scaling-stroke" clipPath={`url(#ac-${it.id})`} style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); useItems.setState({ arrowSel: on ? null : it.id }) }} />
            <path d={d} fill="none" strokeWidth={on ? 3.5 : 2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" className="arrow-line" />
            <polygon points={head} className="arrow-head" />
            {on && (
              <g
                data-nodrag
                transform={`translate(${mid.x} ${mid.y}) scale(${k})`}
                style={{ pointerEvents: 'all', cursor: 'grab' }}
                onPointerDown={(e) => startDrag(e, it.id, data, mid)}
                onDoubleClick={(e) => { e.stopPropagation(); void saveItem(it.id, 'arrow', { from: data.from, to: data.to, label: data.label }) }}
              >
                <title>Arrastrá para moldear la curva · doble clic: vuelve al recorrido automático</title>
                <circle r={11} className="arrow-handle" />
                <circle r={4} fill="#fff" />
              </g>
            )}
            <g transform={`translate(${mid.x} ${mid.y}) scale(${k})`}>
              <foreignObject x={-130} y={-56} width={260} height={34} style={{ overflow: 'visible', pointerEvents: 'none' }}>
                <div className="arrow-label-wrap">
                  <ArrowLabel id={it.id} data={data} on={on} />
                </div>
              </foreignObject>
            </g>
          </g>
        )
      })}
    </svg>
  )
}
