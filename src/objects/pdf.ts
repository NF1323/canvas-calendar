/** Límite del almacenamiento: 15 MB. Los PDF más pesados se comprimen en el navegador hasta entrar. */
export const MAX_PDF = 15 * 1024 * 1024
const TARGET = Math.round(14.2 * 1024 * 1024)

const PASSES = [
  { scale: 1.6, q: 0.72 },
  { scale: 1.25, q: 0.6 },
  { scale: 1.0, q: 0.5 },
  { scale: 0.8, q: 0.42 },
  { scale: 0.65, q: 0.35 },
]

async function rasterize(buf: ArrayBuffer, scale: number, q: number, onPage?: (i: number, n: number) => void): Promise<Blob> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const { PDFDocument } = await import('pdf-lib')
  const src = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise
  const out = await PDFDocument.create()
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')!
  for (let i = 1; i <= src.numPages; i++) {
    onPage?.(i, src.numPages)
    const page = await src.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale })
    canvas.width = Math.ceil(vp.width)
    canvas.height = Math.ceil(vp.height)
    g.fillStyle = '#fff'
    g.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: g, viewport: vp, canvas }).promise
    const jpg = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('jpeg'))), 'image/jpeg', q))
    const img = await out.embedJpg(await jpg.arrayBuffer())
    const p = out.addPage([base.width, base.height])
    p.drawImage(img, { x: 0, y: 0, width: base.width, height: base.height })
    page.cleanup()
  }
  const bytes = await out.save({ useObjectStreams: true })
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

/**
 * Devuelve un PDF de hasta ~15 MB. Primero intenta reordenar el archivo sin perder calidad;
 * si no alcanza, lo vuelve a armar página por página con imágenes cada vez más livianas
 * (el texto deja de ser seleccionable en ese caso).
 */
export async function fitPdf(file: File, onStatus?: (s: string) => void): Promise<{ blob: Blob; compressed: boolean }> {
  if (file.size <= MAX_PDF) return { blob: file, compressed: false }
  const buf = await file.arrayBuffer()
  onStatus?.('Optimizando el PDF…')
  try {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true })
    const bytes = await doc.save({ useObjectStreams: true })
    if (bytes.byteLength <= TARGET) return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), compressed: true }
  } catch {
    /* sigue con la compresión fuerte */
  }
  for (const [n, { scale, q }] of PASSES.entries()) {
    onStatus?.(`Comprimiendo el PDF (intento ${n + 1} de ${PASSES.length})…`)
    const out = await rasterize(buf, scale, q, (i, total) => onStatus?.(`Comprimiendo el PDF… página ${i}/${total} (intento ${n + 1})`))
    if (out.size <= TARGET) return { blob: out, compressed: true }
  }
  throw new Error('No se pudo comprimir el PDF por debajo de 15 MB')
}
