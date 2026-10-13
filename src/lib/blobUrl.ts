/** Las portadas viven como data: URL (cientos de KB). Meterlas en el estilo de cada tarjeta en cada render es caro:
 *  se convierten una sola vez en un blob: URL corto y se reutilizan. */
const cache = new Map<string, string>()

export function lite(src: string | null | undefined): string | undefined {
  if (!src) return undefined
  if (!src.startsWith('data:')) return src
  const hit = cache.get(src)
  if (hit) return hit
  try {
    const comma = src.indexOf(',')
    const mime = /^data:([^;,]+)/.exec(src)?.[1] ?? 'image/jpeg'
    const bin = atob(src.slice(comma + 1))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
    cache.set(src, url)
    return url
  } catch {
    return src
  }
}
