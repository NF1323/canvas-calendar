/**
 * Búsqueda de imágenes para portadas. Fuentes SIN clave: Wikipedia (es + en), Wikimedia Commons (es + en) y Openverse.
 * Fuentes OPCIONALES con clave gratuita (más variedad): Pexels, Pixabay, Unsplash y Google Imágenes (Programmable Search).
 * Las claves se guardan en este navegador o se ponen en public/config.js.
 */

export interface StockImg {
  id: string
  thumb: string
  /** imagen grande, si la fuente la da (se usa de respaldo para descargar) */
  full?: string
  title: string
  credit: string
  source: string
}

export interface StockKeys { pexels?: string; pixabay?: string; unsplash?: string; googleKey?: string; googleCx?: string }

const LS = 'cc_stock_keys'
type Cfg = { pexelsKey?: string; pixabayKey?: string; unsplashKey?: string; googleKey?: string; googleCx?: string }

export function loadKeys(): StockKeys {
  const c = ((window as unknown as { __CC_CONFIG__?: Cfg }).__CC_CONFIG__ ?? {}) as Cfg
  let l: StockKeys = {}
  try { l = JSON.parse(localStorage.getItem(LS) || '{}') } catch { /* sin claves */ }
  return {
    pexels: l.pexels || c.pexelsKey || '',
    pixabay: l.pixabay || c.pixabayKey || '',
    unsplash: l.unsplash || c.unsplashKey || '',
    googleKey: l.googleKey || c.googleKey || '',
    googleCx: l.googleCx || c.googleCx || '',
  }
}
export function saveKeys(k: StockKeys) {
  localStorage.setItem(LS, JSON.stringify(k))
}

const strip = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const isBitmap = (u: string) => /\.(jpe?g|png|webp)(\?|$)/i.test(u)

interface Q { es: string; en: string }
type Source = { name: string; run: (q: Q, page: number, signal: AbortSignal) => Promise<StockImg[]> }

/* ───────── sin clave ───────── */

const wikipedia = (lang: 'es' | 'en'): Source => ({
  name: lang === 'es' ? 'Wikipedia (es)' : 'Wikipedia (en)',
  async run(q, page, signal) {
    const term = lang === 'es' ? q.es : q.en
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=16&gsroffset=${(page - 1) * 16}&gsrsearch=${encodeURIComponent(term)}&prop=pageimages&piprop=thumbnail&pithumbsize=700`
    const j = (await (await fetch(url, { signal })).json()) as { query?: { pages?: Record<string, { pageid: number; title: string; thumbnail?: { source: string } }> } }
    return Object.values(j.query?.pages ?? {})
      .filter((p) => p.thumbnail?.source)
      .map((p) => ({ id: `wp${lang}-${p.pageid}`, thumb: p.thumbnail!.source, title: p.title, credit: 'Wikipedia', source: `Wikipedia ${lang}` }))
  },
})

const commons = (lang: 'es' | 'en'): Source => ({
  name: lang === 'es' ? 'Commons (es)' : 'Commons (en)',
  async run(q, page, signal) {
    const term = lang === 'es' ? q.es : q.en
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=16' +
      `&gsroffset=${(page - 1) * 16}&gsrsearch=${encodeURIComponent(`intitle:${term.split(/\s+/).join(' intitle:')} filetype:bitmap`)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640`
    const j = (await (await fetch(url, { signal })).json()) as { query?: { pages?: Record<string, { pageid: number; title: string; imageinfo?: { thumburl?: string; extmetadata?: { Artist?: { value: string }; LicenseShortName?: { value: string } } }[] }> } }
    return Object.values(j.query?.pages ?? {})
      .map((p): StockImg | null => {
        const ii = p.imageinfo?.[0]
        if (!ii?.thumburl || !isBitmap(ii.thumburl)) return null
        const artist = ii.extmetadata?.Artist?.value ? strip(ii.extmetadata.Artist.value) : ''
        return {
          id: `wm${lang}-${p.pageid}`,
          thumb: ii.thumburl,
          title: p.title.replace(/^Archivo:|^File:/, '').replace(/\.[a-z]+$/i, ''),
          credit: `${artist ? artist.slice(0, 60) + ' · ' : ''}${ii.extmetadata?.LicenseShortName?.value ?? ''}`.trim(),
          source: 'Wikimedia Commons',
        }
      })
      .filter((x): x is StockImg => !!x)
  },
})

const openverse: Source = {
  name: 'Openverse',
  async run(q, page, signal) {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q.en)}&page=${page}&page_size=16&mature=false&extension=jpg,png,webp`
    const r = await fetch(url, { signal })
    if (!r.ok) throw new Error(`Openverse ${r.status}`)
    const j = (await r.json()) as { results?: { id: string; thumbnail?: string; url: string; title?: string; creator?: string; license?: string; license_version?: string }[] }
    return (j.results ?? []).map((x) => ({
      id: `ov-${x.id}`,
      thumb: x.thumbnail || x.url,
      full: x.url,
      title: x.title || q.en,
      credit: `${x.creator ? x.creator + ' · ' : ''}${(x.license ?? '').toUpperCase()} ${x.license_version ?? ''}`.trim(),
      source: 'Openverse',
    }))
  },
}

/* ───────── con clave gratuita (opcionales) ───────── */

const pexels = (key: string): Source => ({
  name: 'Pexels',
  async run(q, page, signal) {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q.es)}&per_page=16&page=${page}&locale=es-ES`, { signal, headers: { Authorization: key } })
    if (!r.ok) throw new Error(`Pexels ${r.status}`)
    const j = (await r.json()) as { photos?: { id: number; alt?: string; photographer: string; src: { medium: string; large: string } }[] }
    return (j.photos ?? []).map((p) => ({ id: `px-${p.id}`, thumb: p.src.medium, full: p.src.large, title: p.alt || q.es, credit: `${p.photographer} · Pexels`, source: 'Pexels' }))
  },
})

const pixabay = (key: string): Source => ({
  name: 'Pixabay',
  async run(q, page, signal) {
    const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q.es)}&lang=es&image_type=photo&safesearch=true&per_page=16&page=${page}`, { signal })
    if (!r.ok) throw new Error(`Pixabay ${r.status}`)
    const j = (await r.json()) as { hits?: { id: number; tags: string; user: string; webformatURL: string; largeImageURL: string }[] }
    return (j.hits ?? []).map((h) => ({ id: `pb-${h.id}`, thumb: h.webformatURL, full: h.largeImageURL, title: h.tags, credit: `${h.user} · Pixabay`, source: 'Pixabay' }))
  },
})

const unsplash = (key: string): Source => ({
  name: 'Unsplash',
  async run(q, page, signal) {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q.en)}&per_page=16&page=${page}&client_id=${encodeURIComponent(key)}`, { signal })
    if (!r.ok) throw new Error(`Unsplash ${r.status}`)
    const j = (await r.json()) as { results?: { id: string; alt_description?: string; user: { name: string }; urls: { small: string; regular: string } }[] }
    return (j.results ?? []).map((p) => ({ id: `us-${p.id}`, thumb: p.urls.small, full: p.urls.regular, title: p.alt_description || q.en, credit: `${p.user.name} · Unsplash`, source: 'Unsplash' }))
  },
})

const google = (key: string, cx: string): Source => ({
  name: 'Google Imágenes',
  async run(q, page, signal) {
    const r = await fetch(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(q.es)}&searchType=image&num=10&start=${(page - 1) * 10 + 1}&safe=active`, { signal })
    if (!r.ok) throw new Error(`Google ${r.status}`)
    const j = (await r.json()) as { items?: { link: string; title?: string; displayLink?: string; image?: { thumbnailLink?: string } }[] }
    return (j.items ?? []).map((x, i) => ({ id: `gg-${page}-${i}-${x.link.slice(-24)}`, thumb: x.image?.thumbnailLink || x.link, full: x.link, title: x.title || q.es, credit: x.displayLink ?? 'Google', source: 'Google Imágenes' }))
  },
})

export function activeSources(): Source[] {
  const k = loadKeys()
  const out: Source[] = [wikipedia('es'), commons('es'), wikipedia('en'), commons('en'), openverse]
  if (k.googleKey && k.googleCx) out.unshift(google(k.googleKey, k.googleCx))
  if (k.pexels) out.unshift(pexels(k.pexels))
  if (k.pixabay) out.unshift(pixabay(k.pixabay))
  if (k.unsplash) out.unshift(unsplash(k.unsplash))
  return out
}

/** Traducción gratuita (MyMemory) para buscar también en inglés, donde hay muchísimas más fotos. */
const trCache = new Map<string, string>()
async function toEnglish(text: string, signal: AbortSignal): Promise<string> {
  if (trCache.has(text)) return trCache.get(text)!
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=es|en`, { signal })
    const j = (await r.json()) as { responseData?: { translatedText?: string } }
    const t = j.responseData?.translatedText?.trim()
    if (t && !/MYMEMORY|QUERY LENGTH/i.test(t)) { trCache.set(text, t); return t }
  } catch { /* se usa el texto original */ }
  return text
}

/** Raíces de las palabras buscadas (sin tildes, 5 letras) en español e inglés, para medir qué tan relacionada está cada imagen. */
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const stems = (q: Q) =>
  [...new Set(`${q.es} ${q.en}`.split(/[^\p{L}\p{N}]+/u).map(norm).filter((w) => w.length >= 3).map((w) => w.slice(0, 5)))]

/** Ordena primero lo que menciona lo buscado en el título; descarta lo que no tiene relación si ya hay suficientes buenas. */
function relevant(list: StockImg[], q: Q): StockImg[] {
  const st = stems(q)
  if (!st.length) return list
  const score = (x: StockImg) => { const t = norm(x.title); return st.filter((w) => t.includes(w)).length }
  const scored = list.map((x) => ({ x, n: score(x) }))
  const good = scored.filter((r) => r.n > 0).sort((a, b) => b.n - a.n).map((r) => r.x)
  return good.length >= 2 ? good : [...good, ...scored.filter((r) => r.n === 0).map((r) => r.x)]
}

const withTimeout = (signal: AbortSignal | undefined, ms: number) => {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  signal?.addEventListener('abort', () => c.abort())
  return { signal: c.signal, done: () => clearTimeout(t) }
}

/**
 * Busca en todas las fuentes a la vez y va entregando lo que llega (intercalado, sin repetidos).
 * `page` pide la página siguiente de cada fuente ("Cargar más").
 */
export async function searchStock(
  term: string,
  signal: AbortSignal | undefined,
  onPartial: (r: StockImg[]) => void,
  page = 1,
  seen: Set<string> = new Set(),
): Promise<StockImg[]> {
  const sources = activeSources()
  const results: StockImg[][] = sources.map(() => [])
  let failed = 0
  const merge = () => {
    const out: StockImg[] = []
    const rows = Math.max(0, ...results.map((r) => r.length))
    for (let i = 0; i < rows; i++) for (const r of results) if (r[i] && !seen.has(r[i].id) && !out.some((o) => o.thumb === r[i].thumb)) out.push(r[i])
    return out
  }
  const tr = withTimeout(signal, 3500)
  const en = await toEnglish(term, tr.signal)
  tr.done()
  const q: Q = { es: term, en }
  await Promise.all(
    sources.map(async (src, i) => {
      const t = withTimeout(signal, 11000)
      try {
        results[i] = relevant(await src.run(q, page, t.signal), q)
        if (!signal?.aborted) onPartial(merge())
      } catch {
        failed++
      } finally {
        t.done()
      }
    }),
  )
  if (failed === sources.length) throw new Error('No se pudo conectar con los servicios de imágenes')
  return merge()
}

/**
 * Descarga la imagen elegida. Si el sitio no permite descargarla desde acá (CORS), se pide a través de wsrv.nl,
 * un servicio gratuito que la reenvía ya reducida.
 */
export async function fetchStockFile(img: StockImg): Promise<File> {
  const tryUrl = async (u: string) => {
    const r = await fetch(u)
    if (!r.ok) throw new Error(String(r.status))
    const b = await r.blob()
    if (!b.type.startsWith('image/')) throw new Error('no es imagen')
    return new File([b], 'portada.jpg', { type: b.type })
  }
  const proxied = (u: string) => `https://wsrv.nl/?url=${encodeURIComponent(u)}&w=1000&output=jpg&q=85`
  const attempts = [img.thumb, proxied(img.thumb), ...(img.full ? [proxied(img.full)] : [])]
  for (const u of attempts) {
    try { return await tryUrl(u) } catch { /* siguiente intento */ }
  }
  throw new Error('No se pudo descargar esa imagen. Probá con otra.')
}
