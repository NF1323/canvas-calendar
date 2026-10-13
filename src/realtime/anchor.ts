import type { Anchor } from '../types'
import type { Layout } from '../calendar/layout'

const inside = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** Convierte un punto del mundo en una posición anclada a un día / mes, estable aunque los filtros cambien las alturas. */
export function worldToAnchor(wx: number, wy: number, layout: Layout): Anchor {
  for (const mo of layout.months) {
    if (!inside(mo.rect, wx, wy)) continue
    for (const d of mo.days) {
      const r = layout.dayRects[d]
      if (r && inside(r, wx, wy)) return { d, rx: (wx - r.x) / r.w, ry: (wy - r.y) / r.h }
    }
    return { m: mo.key, rx: (wx - mo.rect.x) / mo.rect.w, ry: (wy - mo.rect.y) / mo.rect.h }
  }
  return { wx, wy }
}

export function anchorToWorld(a: Anchor, layout: Layout): { x: number; y: number } | null {
  if ('d' in a) {
    const r = layout.dayRects[a.d]
    return r ? { x: r.x + a.rx * r.w, y: r.y + a.ry * r.h } : null
  }
  if ('m' in a) {
    const mo = layout.months.find((m) => m.key === a.m)
    return mo ? { x: mo.rect.x + a.rx * mo.rect.w, y: mo.rect.y + a.ry * mo.rect.h } : null
  }
  return { x: a.wx, y: a.wy }
}
