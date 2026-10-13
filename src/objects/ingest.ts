import { cam } from '../canvas/camera'
import { objItemId, saveObj, useItems } from '../canvasItems'
import { fileToCanvasImage, isHeic } from '../lib/image'
import { uploadFile } from './files'
import { toast, ui } from '../store'
import type { Attachment, ObjData } from '../types'
import { fitPdf, MAX_PDF } from './pdf'

/* ───────── dónde cae lo que se pega: bajo el último puntero, o al centro de la pantalla ───────── */
const last = { x: 0, y: 0, has: false }
export function trackPointer() {
  const f = (e: PointerEvent) => { last.x = e.clientX; last.y = e.clientY; last.has = true }
  window.addEventListener('pointermove', f, { passive: true })
  return () => window.removeEventListener('pointermove', f)
}
const dropPoint = () => (last.has ? cam.screenToWorld(last.x, last.y) : cam.center())

let cascade = 0
function place(w: number, h: number, at?: { x: number; y: number }) {
  const p = at ?? dropPoint()
  const o = (cascade++ % 5) * 24
  return { x: Math.round(p.x - w / 2 + o), y: Math.round(p.y - h / 2 + o) }
}

export function updateObj(id: string, patch: Partial<ObjData>) {
  const cur = useItems.getState().items[id]?.data as ObjData | undefined
  if (cur) void saveObj(id, { ...cur, ...patch })
}

/* ───────── archivos ───────── */
export async function ingestFiles(files: File[], at?: { x: number; y: number }) {
  for (const f of files) {
    try {
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) await addPdf(f, at)
      else if (f.type.startsWith('image/') || isHeic(f)) await addImage(f, at)
      else toast(`"${f.name}": solo se pueden pegar imágenes y PDF`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo agregar el archivo')
    }
  }
}

/** Sube un archivo (imagen o PDF) y devuelve sus datos; los PDF de más de 15 MB se comprimen. */
export async function fileToAttachment(f: File): Promise<Attachment> {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    const { blob, compressed } = await fitPdf(f, (m) => toast(m, undefined, 2500))
    if (blob.size > MAX_PDF) throw new Error('El PDF sigue pesando más de 15 MB')
    toast(compressed ? `PDF comprimido: ${(f.size / 1048576).toFixed(1)} MB → ${(blob.size / 1048576).toFixed(1)} MB` : 'Subiendo PDF…', undefined, 2500)
    const path = await uploadFile(blob, f.name || 'documento.pdf')
    return { id: crypto.randomUUID(), type: 'pdf', path, name: f.name || 'documento.pdf', size: blob.size }
  }
  if (f.type.startsWith('image/') || isHeic(f)) {
    toast('Subiendo imagen…', undefined, 1800)
    const im = await fileToCanvasImage(f)
    const path = await uploadFile(im.blob, im.name)
    return { id: crypto.randomUUID(), type: 'image', path, name: im.name, size: im.blob.size, ar: im.w / im.h }
  }
  throw new Error(`"${f.name}": solo se pueden adjuntar imágenes y PDF`)
}

async function addImage(f: File, at?: { x: number; y: number }) {
  const a = await fileToAttachment(f)
  const w = 360
  const h = Math.round(w / (a.ar || 1.5))
  await saveObj(objItemId(), { type: 'image', ...place(w, h, at), w, h, path: a.path, name: a.name, size: a.size, ar: a.ar })
}

async function addPdf(f: File, at?: { x: number; y: number }) {
  const a = await fileToAttachment(f)
  await saveObj(objItemId(), { type: 'pdf', ...place(320, 132, at), w: 320, h: 132, path: a.path, name: a.name, size: a.size })
}

/* ───────── texto, links y YouTube ───────── */
const YT = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i
export const youtubeId = (u: string) => u.match(YT)?.[1] ?? null

const singleUrl = (t: string) => {
  if (/\s/.test(t)) return null
  if (/^https?:\/\/\S+$/i.test(t)) return t
  if (/^www\.\S+\.\S+$/i.test(t)) return `https://${t}`
  return null
}

async function fetchTitle(url: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
    const j = (await r.json()) as { title?: string }
    return j.title
  } catch {
    return undefined
  }
}

export async function ingestText(raw: string, at?: { x: number; y: number }) {
  const text = raw.trim()
  if (!text) return
  const url = singleUrl(text)
  if (!url) return void saveObj(objItemId(), { type: 'text', ...place(300, 150, at), w: 300, h: 150, text })
  const vid = youtubeId(url)
  // un link de YouTube pregunta cómo dejarlo: solo link con título o video incrustado
  if (vid) return ui({ ytAsk: { url, id: vid, at: at ?? dropPoint() } })
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } })()
  const id = objItemId()
  await saveObj(id, { type: 'link', ...place(300, 96, at), w: 300, h: 96, url, title: host })
  const t = await fetchTitle(url)
  if (t) updateObj(id, { title: t })
}

export async function addYoutube(url: string, videoId: string, mode: 'link' | 'embed', at: { x: number; y: number }) {
  const embed = mode === 'embed'
  const w = embed ? 480 : 320
  const h = embed ? Math.round((w * 9) / 16) : 238
  const id = objItemId()
  await saveObj(id, { type: 'youtube', ...place(w, h, at), w, h, url, videoId, embed, title: 'Video de YouTube', ar: 16 / 9 })
  const t = await fetchTitle(url)
  if (t) updateObj(id, { title: t })
}

export function addTextNote() {
  void saveObj(objItemId(), { type: 'text', ...place(280, 140), w: 280, h: 140, text: '' })
}
