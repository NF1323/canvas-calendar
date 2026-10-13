import { useEffect, useRef, useState } from 'react'

/** Vista previa de la portada tal como se ve en el plan; se arrastra para elegir qué parte queda centrada. */
export function CoverPositioner({ src, pos, onChange }: { src: string; pos: string; onChange: (p: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)
  const [px, py] = (pos || '50 50').split(' ').map(Number)

  useEffect(() => {
    const i = new Image()
    i.onload = () => setNat({ w: i.naturalWidth, h: i.naturalHeight })
    i.src = src
  }, [src])

  const move = (e: React.PointerEvent) => {
    const d = drag.current
    const b = box.current
    if (!d || !b || !nat) return
    const r = b.getBoundingClientRect()
    const k = Math.max(r.width / nat.w, r.height / nat.h)
    const ox = nat.w * k - r.width
    const oy = nat.h * k - r.height
    const clamp = (v: number) => Math.min(100, Math.max(0, v))
    const nx = ox > 1 ? clamp(d.px - ((e.clientX - d.sx) / ox) * 100) : 50
    const ny = oy > 1 ? clamp(d.py - ((e.clientY - d.sy) / oy) * 100) : 50
    onChange(`${Math.round(nx)} ${Math.round(ny)}`)
  }

  return (
    <div>
      <div
        ref={box}
        className="cover-pos"
        style={{ backgroundImage: `url(${src})`, backgroundPosition: `${px}% ${py}%` }}
        onPointerDown={(e) => { drag.current = { sx: e.clientX, sy: e.clientY, px, py }; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* sin captura */ } }}
        onPointerMove={move}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        role="img"
        aria-label="Encuadre de la portada: arrastrá para mover la imagen"
      >
        <span>Arrastrá la imagen para elegir qué parte se ve</span>
      </div>
      {pos && pos !== '50 50' && <button type="button" className="cover-reset" onClick={() => onChange('')}>Centrar</button>}
    </div>
  )
}
