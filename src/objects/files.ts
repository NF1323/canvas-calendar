import { useEffect, useState } from 'react'
import { isLocal, supabase } from '../lib/supabase'

const BUCKET = 'canvas-files'
const LS = (id: string) => `cc_file_${id}`

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })

const safe = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'archivo'

/** Sube un archivo y devuelve su ruta. En modo local se guarda en el navegador. */
export async function uploadFile(blob: Blob, name: string): Promise<string> {
  const id = crypto.randomUUID()
  if (isLocal) {
    if (blob.size > 3_000_000) throw new Error('En modo local los archivos pueden pesar hasta 3 MB')
    try {
      localStorage.setItem(LS(id), await blobToDataUrl(blob))
    } catch {
      throw new Error('No hay lugar en el navegador para guardar este archivo')
    }
    return `local:${id}`
  }
  const path = `${id}/${safe(name)}`
  const { error } = await supabase!.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || undefined, upsert: false })
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
  return path
}

export async function removeFile(path?: string) {
  if (!path) return
  if (path.startsWith('local:')) return localStorage.removeItem(LS(path.slice(6)))
  if (!isLocal) await supabase!.storage.from(BUCKET).remove([path]).catch(() => undefined)
}

const cache = new Map<string, { url: string; exp: number }>()

/** URL temporal firmada del archivo (se renueva sola antes de vencer). */
export async function fileUrl(path: string, download?: string): Promise<string | null> {
  if (path.startsWith('local:')) return localStorage.getItem(LS(path.slice(6)))
  if (!download) {
    const hit = cache.get(path)
    if (hit && hit.exp > Date.now() + 60_000) return hit.url
  }
  const { data, error } = await supabase!.storage
    .from(BUCKET)
    .createSignedUrl(path, download ? 120 : 3600, download ? { download } : undefined)
  if (error || !data) return null
  if (!download) cache.set(path, { url: data.signedUrl, exp: Date.now() + 3600_000 })
  return data.signedUrl
}

export function useFileUrl(path?: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      if (!path) return
      const u = await fileUrl(path)
      if (!alive) return
      setUrl(u)
      if (!path.startsWith('local:')) timer = setTimeout(load, 50 * 60_000)
    }
    void load()
    return () => { alive = false; clearTimeout(timer) }
  }, [path])
  return url
}

/** Descarga con el nombre original. */
export async function downloadFile(path: string, name: string) {
  const u = await fileUrl(path, name)
  if (!u) return
  const a = document.createElement('a')
  a.href = u
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
