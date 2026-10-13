import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, ExternalLink, FileText, Link2, Pencil, Play, Trash2, Video, StickyNote, Image as ImageIcon, X } from 'lucide-react'
import type { ObjData } from '../types'
import { objsOf, removeItem, useItems } from '../canvasItems'
import { startObjResize } from '../canvas/move'
import { downloadFile, fileUrl, removeFile, useFileUrl } from './files'
import { addYoutube, updateObj } from './ingest'
import { ui, useUI } from '../store'

const fmtSize = (n?: number) => (!n ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

function remove(id: string, d: ObjData) {
  void removeItem(id)
  void removeFile(d.path)
}

function Shell({ id, d, lock, bar, children }: { id: string; d: ObjData; lock?: boolean; bar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={`obj obj-${d.type}`}
      data-obj={id}
      data-nodrag
      style={{ position: 'absolute', left: d.x, top: d.y, width: d.w, height: d.h, zIndex: 7 }}
    >
      <div className="obj-bar">
        <span className="obj-grip" aria-hidden>⠿</span>
        {bar}
        <button aria-label="Eliminar" title="Eliminar" onClick={() => remove(id, d)}><Trash2 size={14} /></button>
      </div>
      {children}
      <div className="obj-rz" title="Arrastrá para redimensionar" onPointerDown={(e) => startObjResize(e, id, lock)} />
    </div>
  )
}

function ImageObj({ id, d }: { id: string; d: ObjData }) {
  const url = useFileUrl(d.path)
  return (
    <Shell id={id} d={d} lock bar={<button aria-label="Descargar" title="Descargar" onClick={() => d.path && void downloadFile(d.path, d.name || 'imagen.jpg')}><Download size={14} /></button>}>
      {url ? <img className="obj-img" src={url} alt={d.name || 'Imagen'} draggable={false} /> : <div className="obj-load">Cargando…</div>}
    </Shell>
  )
}

function TextObj({ id, d }: { id: string; d: ObjData }) {
  const [v, setV] = useState(d.text ?? '')
  return (
    <Shell id={id} d={d} bar={<StickyNote size={14} />}>
      <textarea
        className="obj-text"
        value={v}
        placeholder="Escribí algo…"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (d.text ?? '') && updateObj(id, { text: v })}
        aria-label="Texto"
      />
    </Shell>
  )
}

function LinkObj({ id, d }: { id: string; d: ObjData }) {
  const [edit, setEdit] = useState(false)
  const [t, setT] = useState(d.title ?? '')
  const host = (() => { try { return new URL(d.url!).hostname.replace(/^www\./, '') } catch { return d.url } })()
  return (
    <Shell id={id} d={d} bar={<button aria-label="Editar título" title="Editar título" onClick={() => setEdit((x) => !x)}><Pencil size={14} /></button>}>
      <div className="obj-link">
        <Link2 size={20} />
        {edit ? (
          <input
            autoFocus
            value={t}
            onChange={(e) => setT(e.target.value)}
            onBlur={() => { setEdit(false); if (t.trim() && t !== d.title) updateObj(id, { title: t.trim() }) }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            aria-label="Título del link"
          />
        ) : (
          <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.url}>
            <b>{d.title || host}</b>
            <small>{host} <ExternalLink size={11} /></small>
          </a>
        )}
      </div>
    </Shell>
  )
}

function YoutubeObj({ id, d }: { id: string; d: ObjData }) {
  const toggle = () => {
    const embed = !d.embed
    const w = embed ? Math.max(d.w, 420) : 320
    updateObj(id, embed ? { embed, w, h: Math.round((w * 9) / 16) } : { embed, w, h: 238 })
  }
  return (
    <Shell
      id={id}
      d={d}
      lock={!!d.embed}
      bar={
        <>
          <button aria-label={d.embed ? 'Dejar solo el link' : 'Incrustar video'} title={d.embed ? 'Dejar solo el link' : 'Incrustar el video'} onClick={toggle}>
            {d.embed ? <Link2 size={14} /> : <Video size={14} />}
          </button>
          <a href={d.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir en YouTube" title="Abrir en YouTube"><ExternalLink size={14} /></a>
        </>
      }
    >
      {d.embed ? (
        <iframe
          className="obj-yt"
          src={`https://www.youtube-nocookie.com/embed/${d.videoId}?rel=0&playsinline=1`}
          title={d.title || 'Video de YouTube'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="obj-ytlink">
          <a className="thumb" href={d.url} target="_blank" rel="noopener noreferrer" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${d.videoId}/hqdefault.jpg)` }} aria-label="Abrir el video">
            <span><Play size={22} fill="currentColor" /></span>
          </a>
          <a className="ttl" href={d.url} target="_blank" rel="noopener noreferrer" title={d.url}>{d.title || 'Video de YouTube'}</a>
        </div>
      )}
    </Shell>
  )
}

function PdfObj({ id, d }: { id: string; d: ObjData }) {
  const url = useFileUrl(d.embed ? d.path : undefined)
  return (
    <Shell
      id={id}
      d={d}
      bar={
        <>
          <button aria-label="Vista previa" title={d.embed ? 'Cerrar vista previa' : 'Vista previa'} onClick={() => { const embed = !d.embed; updateObj(id, embed ? { embed, h: Math.max(d.h, 420), w: Math.max(d.w, 340) } : { embed, h: 132 }) }}>
            <FileText size={14} />
          </button>
          <button aria-label="Abrir" title="Abrir en otra pestaña" onClick={async () => { const u = d.path && (await fileUrl(d.path)); if (u) window.open(u, '_blank', 'noopener') }}><ExternalLink size={14} /></button>
          <button aria-label="Descargar" title="Descargar" onClick={() => d.path && void downloadFile(d.path, d.name || 'documento.pdf')}><Download size={14} /></button>
        </>
      }
    >
      <div className="obj-pdf">
        <div className="pdf-head"><FileText size={26} /><div><b title={d.name}>{d.name}</b><small>PDF · {fmtSize(d.size)}</small></div></div>
        {d.embed && (url ? <iframe className="pdf-frame" src={url} title={d.name} /> : <div className="obj-load">Cargando…</div>)}
      </div>
    </Shell>
  )
}

/** Objetos pegados en el canvas (se dibujan dentro del mundo, se mueven y redimensionan libremente). */
export function ObjectsLayer() {
  const items = useItems((s) => s.items)
  const live = useItems((s) => s.liveObj)
  return (
    <>
      {objsOf(items).map((it) => {
        const d = live[it.id] ? { ...it.data, ...live[it.id] } : it.data
        switch (d.type) {
          case 'image': return <ImageObj key={it.id} id={it.id} d={d} />
          case 'text': return <TextObj key={it.id} id={it.id} d={d} />
          case 'link': return <LinkObj key={it.id} id={it.id} d={d} />
          case 'youtube': return <YoutubeObj key={it.id} id={it.id} d={d} />
          case 'pdf': return <PdfObj key={it.id} id={it.id} d={d} />
        }
      })}
    </>
  )
}

/** Al pegar un link de YouTube: ¿solo link con título o video incrustado? */
export function YoutubeAsk() {
  const ask = useUI((s) => s.ytAsk)
  const done = (mode: 'link' | 'embed' | null) => {
    if (ask && mode) void addYoutube(ask.url, ask.id, mode, ask.at)
    ui({ ytAsk: null })
  }
  return (
    <AnimatePresence>
      {ask && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={() => done(null)} />
          <motion.div className="dialog glass" initial={{ scale: 0.96 }} animate={{ scale: 1 }} role="dialog" aria-label="Video de YouTube">
            <div className="dh"><h3>Video de YouTube</h3><button className="icon" onClick={() => done(null)} aria-label="Cerrar"><X size={16} /></button></div>
            <div className="yt-thumb" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${ask.id}/hqdefault.jpg)` }} />
            <p>¿Cómo querés dejarlo en el canvas?</p>
            <div className="stack">
              <button onClick={() => done('embed')}><Video size={15} /> Video incrustado (se reproduce acá)</button>
              <button onClick={() => done('link')}><Link2 size={15} /> Solo el título con el link</button>
              <button className="ghost" onClick={() => done(null)}>Cancelar</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { ImageIcon }
