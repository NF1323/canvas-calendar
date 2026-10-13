import { useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Search, Settings2, X } from 'lucide-react'
import { activeSources, fetchStockFile, loadKeys, saveKeys, searchStock, type StockImg, type StockKeys } from '../lib/stock'
import { fileToCover } from '../lib/image'
import { toast } from '../store'

/** Fuentes que se pueden activar con una clave gratuita. */
function KeysPanel({ onDone }: { onDone: () => void }) {
  const [k, setK] = useState<StockKeys>(loadKeys())
  const set = (p: Partial<StockKeys>) => setK((s) => ({ ...s, ...p }))
  const row = (label: string, value: string | undefined, onChange: (v: string) => void, link: string, hint: string) => (
    <label className="key-row">
      <span>{label} <a href={link} target="_blank" rel="noopener noreferrer" title={hint}><ExternalLink size={11} /> conseguir clave</a></span>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value.trim())} placeholder="Pegá la clave" spellCheck={false} autoComplete="off" />
    </label>
  )
  return (
    <div className="keys">
      <p>Sumá más fuentes con claves <b>gratuitas</b> (se guardan solo en este navegador). Con ellas aparecen muchas más fotos de stock.</p>
      {row('Pexels', k.pexels, (v) => set({ pexels: v }), 'https://www.pexels.com/api/new/', 'Gratis, un minuto')}
      {row('Pixabay', k.pixabay, (v) => set({ pixabay: v }), 'https://pixabay.com/api/docs/', 'Gratis al registrarte')}
      {row('Unsplash', k.unsplash, (v) => set({ unsplash: v }), 'https://unsplash.com/oauth/applications', 'Access Key de una app gratuita')}
      {row('Google Imágenes · clave de API', k.googleKey, (v) => set({ googleKey: v }), 'https://developers.google.com/custom-search/v1/introduction', 'Custom Search JSON API: 100 búsquedas gratis por día')}
      {row('Google Imágenes · ID del buscador (cx)', k.googleCx, (v) => set({ googleCx: v }), 'https://programmablesearchengine.google.com/controlpanel/create', 'Crear buscador con "Búsqueda de imágenes" activada y "Buscar en toda la web"')}
      <div className="stock-foot">
        <small>Google: 100 búsquedas gratis por día.</small>
        <button type="button" className="primary" onClick={() => { saveKeys(k); toast('Fuentes guardadas'); onDone() }}>Guardar</button>
      </div>
    </div>
  )
}

/** Busca imágenes de stock gratuitas a partir del título y deja elegir una como portada. */
export function StockPicker({ initial, onAccept, onClose }: { initial: string; onAccept: (dataUrl: string) => void; onClose: () => void }) {
  const [q, setQ] = useState(initial)
  const [res, setRes] = useState<StockImg[] | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState<StockImg | null>(null)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  const [keys, setKeys] = useState(false)
  const [page, setPage] = useState(1)
  const ctl = useRef<AbortController | null>(null)
  const term = useRef(initial)

  const run = async (t: string, p: number) => {
    if (!t.trim()) return
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    term.current = t.trim()
    const prev = p === 1 ? [] : (res ?? [])
    const seen = new Set(prev.map((x) => x.id))
    if (p === 1) { setRes(null); setSel(null) } else setMore(true)
    setErr('')
    setPage(p)
    try {
      const r = await searchStock(t.trim(), c.signal, (part) => { if (!c.signal.aborted) setRes([...prev, ...part]) }, p, seen)
      if (c.signal.aborted) return
      setRes([...prev, ...r])
      if (!prev.length && !r.length) setErr('No se encontraron imágenes. Probá con otra palabra, o sumá más fuentes con el botón de arriba.')
    } catch (e) {
      if (!c.signal.aborted) setErr(e instanceof Error ? e.message : 'Falló la búsqueda')
    } finally {
      if (!c.signal.aborted) setMore(false)
    }
  }
  useEffect(() => {
    void run(initial, 1)
    return () => ctl.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const accept = async () => {
    if (!sel) return
    setBusy(true)
    try {
      const file = await fetchStockFile(sel)
      onAccept(await fileToCover(file))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo usar esa imagen')
    } finally {
      setBusy(false)
    }
  }
  const nSources = activeSources().length

  return (
    <div className="stock" data-scroll>
      <form className="stock-q" onSubmit={(e) => { e.preventDefault(); void run(q, 1) }}>
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar imágenes…" aria-label="Buscar imágenes de portada" />
        <button type="submit">Buscar</button>
        <button type="button" className={`icon ${keys ? 'on' : ''}`} aria-label="Más fuentes de imágenes" title="Más fuentes (Google, Pexels, Pixabay, Unsplash)" onClick={() => setKeys((v) => !v)}><Settings2 size={14} /></button>
        <button type="button" className="icon" aria-label="Cerrar" onClick={onClose}><X size={14} /></button>
      </form>
      {keys ? (
        <KeysPanel onDone={() => { setKeys(false); void run(q, 1) }} />
      ) : (
        <>
          {!res && !err && <p className="stock-msg">Buscando en {nSources} fuentes…</p>}
          {err && <p className="stock-msg">{err}</p>}
          {res && res.length > 0 && (
            <div className="stock-grid">
              {res.map((im) => (
                <button type="button" key={im.id} className={sel?.id === im.id ? 'on' : ''} title={`${im.title} — ${im.credit} (${im.source})`} onClick={() => setSel(im)}>
                  <img src={im.thumb} alt={im.title} loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.currentTarget.parentElement as HTMLElement).style.display = 'none')} />
                  <em>{im.source}</em>
                  {sel?.id === im.id && <span className="chk"><Check size={14} /></span>}
                </button>
              ))}
              <button type="button" className="more" disabled={more} onClick={() => void run(term.current, page + 1)}>{more ? 'Buscando…' : 'Cargar más'}</button>
            </div>
          )}
          <div className="stock-foot">
            <small>{sel ? `${sel.credit || sel.title} · ${sel.source}` : `${res?.length ?? 0} imágenes · ${nSources} fuentes`}</small>
            <button type="button" onClick={onClose}>Cancelar</button>
            <button type="button" className="primary" disabled={!sel || busy} onClick={() => void accept()}>{busy ? 'Descargando…' : 'Aceptar'}</button>
          </div>
        </>
      )}
    </div>
  )
}
