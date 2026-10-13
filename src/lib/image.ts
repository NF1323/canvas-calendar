/** Utilidades de imagen: compatibles con fotos de iPhone (HEIC/HEIF), Android (JPEG/WebP/HEIF) y orientación EXIF. */

export const isHeic = (f: Blob & { name?: string }) =>
  /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name ?? '')

async function heicToJpeg(file: Blob): Promise<Blob> {
  const { default: heic2any } = await import('heic2any')
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 })
  return Array.isArray(out) ? out[0] : out
}

function loadImg(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

export interface Decoded {
  canvas: HTMLCanvasElement
  w: number
  h: number
}

/**
 * Decodifica cualquier foto: convierte HEIC, respeta la orientación EXIF y la reduce a `maxSide`
 * (las fotos de celular de 12–50 MP no se cargan enteras en memoria).
 */
export async function decodeImage(file: Blob & { name?: string }, maxSide = 1600): Promise<Decoded> {
  let src: Blob = file
  if (isHeic(file)) {
    try {
      src = await heicToJpeg(file)
    } catch {
      throw new Error('No se pudo convertir la foto HEIC. Probá exportarla como JPEG.')
    }
  }
  let source: CanvasImageSource
  let sw: number
  let sh: number
  try {
    const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' })
    source = bmp
    sw = bmp.width
    sh = bmp.height
  } catch {
    const img = await loadImg(src)
    source = img
    sw = img.naturalWidth
    sh = img.naturalHeight
  }
  if (!sw || !sh) throw new Error('Imagen vacía o no soportada')
  const k = Math.min(1, maxSide / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * k))
  const h = Math.max(1, Math.round(sh * k))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(source, 0, 0, w, h)
  if ('close' in source) (source as ImageBitmap).close()
  return { canvas, w, h }
}

const toBlob = (c: HTMLCanvasElement, type: string, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo comprimir'))), type, q))

/** Foto de perfil: recorte cuadrado centrado, jpeg chico (data URL). */
export async function fileToAvatar(file: File, size = 160): Promise<string> {
  if (!file.type.startsWith('image/') && !isHeic(file)) throw new Error('El archivo no es una imagen')
  const { canvas, w, h } = await decodeImage(file, 1200)
  const side = Math.min(w, h)
  const out = document.createElement('canvas')
  out.width = out.height = size
  const g = out.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(canvas, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size)
  return out.toDataURL('image/jpeg', 0.85)
}

/** Portada de un plan: se conserva la imagen completa (reducida) para poder elegir qué parte se ve. */
export async function fileToCover(file: File, maxSide = 900): Promise<string> {
  if (!file.type.startsWith('image/') && !isHeic(file)) throw new Error('El archivo no es una imagen')
  const { canvas } = await decodeImage(file, maxSide)
  return canvas.toDataURL('image/jpeg', 0.8)
}

export interface CanvasImage {
  blob: Blob
  w: number
  h: number
  name: string
}

/** Imagen para pegar en el canvas: máx. 1600 px, jpeg (o se conserva si ya es liviana y no es foto). */
export async function fileToCanvasImage(file: File): Promise<CanvasImage> {
  if (!file.type.startsWith('image/') && !isHeic(file)) throw new Error('El archivo no es una imagen')
  const base = (file.name || 'imagen').replace(/\.[^.]+$/, '') || 'imagen'
  const { canvas, w, h } = await decodeImage(file, 1600)
  const keepAlpha = /png|gif|webp|svg/i.test(file.type)
  const blob = keepAlpha && file.size < 400_000 && !isHeic(file) ? file : await toBlob(canvas, 'image/jpeg', 0.85)
  const ext = blob.type === 'image/jpeg' ? 'jpg' : (blob.type.split('/')[1] || 'png').replace('svg+xml', 'svg')
  return { blob, w, h, name: `${base}.${ext}` }
}
