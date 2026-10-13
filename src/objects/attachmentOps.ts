import type { Attachment, ObjData } from '../types'
import { patchEvent } from '../actions'
import { removeItem, useItems } from '../canvasItems'
import { toast, useData } from '../store'

/** Clave de la tarjeta (`eventId@fecha`, `@free`…) → id del plan. */
export const eventIdOf = (cardKey: string) => cardKey.split('@')[0]

/** Tarjeta de plan que está debajo del puntero (ignorando el objeto que se arrastra). */
export function cardUnder(x: number, y: number): string | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const card = (el as HTMLElement).closest?.('[data-card]') as HTMLElement | null
    if (card?.dataset.card) return card.dataset.card
  }
  return null
}

/** Convierte un objeto del canvas en adjunto de un plan y lo saca del canvas (el archivo se conserva). */
export async function attachToEvent(objId: string, cardKey: string) {
  const d = useItems.getState().items[objId]?.data as ObjData | undefined
  const ev = useData.getState().events[eventIdOf(cardKey)]
  if (!d || !ev) return
  const att: Attachment = {
    id: crypto.randomUUID(),
    type: d.type,
    text: d.text,
    url: d.url,
    title: d.title,
    videoId: d.videoId,
    path: d.path,
    name: d.name,
    size: d.size,
    ar: d.ar,
  }
  await patchEvent(ev.id, { attachments: [...(ev.attachments ?? []), att] })
  await removeItem(objId)
  toast(`Adjuntado a «${ev.title}»`)
}

/** Adjuntos de los planes que apuntan (con una flecha) a este plan: "del evento anterior". */
export function inheritedFor(eventId: string): { title: string; atts: Attachment[] }[] {
  const items = useItems.getState().items
  const events = useData.getState().events
  const out: { title: string; atts: Attachment[] }[] = []
  const seen = new Set<string>()
  for (const it of Object.values(items)) {
    if (it.kind !== 'arrow') continue
    const d = it.data as { from: { k: string; id: string }; to: { k: string; id: string } }
    if (d.to.k !== 'card' || d.from.k !== 'card' || eventIdOf(d.to.id) !== eventId) continue
    const src = events[eventIdOf(d.from.id)]
    if (!src || seen.has(src.id) || !src.attachments?.length) continue
    seen.add(src.id)
    out.push({ title: src.title, atts: src.attachments })
  }
  return out
}
