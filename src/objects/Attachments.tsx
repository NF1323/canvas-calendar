import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, ExternalLink, FileText, Image as ImageIcon, Link2, Paperclip, StickyNote, Trash2, Video, X } from 'lucide-react'
import type { Attachment, Occurrence } from '../types'
import { toast, ui, useData, useUI } from '../store'
import { useItems } from '../canvasItems'
import { downloadFile, removeFile, useFileUrl } from './files'
import { fileToAttachment } from './ingest'
import { inheritedFor } from './attachmentOps'

const label = (a: Attachment) => a.name || a.title || (a.type === 'text' ? (a.text ?? 'Nota').slice(0, 30) : a.url) || 'Adjunto'
const icon = (a: Attachment) =>
  a.type === 'image' ? <ImageIcon size={13} /> : a.type === 'pdf' ? <FileText size={13} /> : a.type === 'youtube' ? <Video size={13} /> : a.type === 'link' ? <Link2 size={13} /> : <StickyNote size={13} />
const isFile = (a: Attachment) => !!a.path && (a.type === 'image' || a.type === 'pdf')

/** Chips clicables (abren el visor) con descarga siempre que sea un archivo. */
export function AttachmentChips({ atts, onRemove }: { atts: Attachment[]; onRemove?: (a: Attachment) => void }) {
  return (
    <div className="att-chips">
      {atts.map((a) => (
        <span key={a.id} className="att-chip">
          <button type="button" title={label(a)} onClick={() => ui({ viewAtt: a })}>
            {icon(a)}
            <span>{label(a)}</span>
          </button>
          {isFile(a) && (
            <button type="button" aria-label="Descargar" title="Descargar" onClick={() => void downloadFile(a.path!, a.name || 'archivo')}>
              <Download size={13} />
            </button>
          )}
          {onRemove && (
            <button type="button" aria-label="Quitar adjunto" title="Quitar" onClick={() => onRemove(a)}>
              <Trash2 size={13} />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}

/** Adjuntos de un plan + los del plan anterior (conectado con una flecha). */
export function AttachmentsFor({ occ }: { occ: Occurrence }) {
  useItems((s) => s.items) // se actualiza si se agregan/quitan flechas
  const events = useData((s) => s.events)
  const own = events[occ.event.id]?.attachments ?? occ.event.attachments ?? []
  const prev = inheritedFor(occ.event.id)
  if (!own.length && !prev.length) return null
  return (
    <div className="att-group">
      {own.length > 0 && (
        <>
          <div className="att-label"><Paperclip size={11} /> Adjuntos</div>
          <AttachmentChips atts={own} />
        </>
      )}
      {prev.map((g) => (
        <div key={g.title}>
          <div className="att-label prev"><Paperclip size={11} /> Adjuntos del evento anterior · {g.title}</div>
          <AttachmentChips atts={g.atts} />
        </div>
      ))}
    </div>
  )
}

/** Campo del editor: ver, agregar (imagen/PDF) y quitar adjuntos del plan; también muestra los del evento anterior. */
export function AttachmentsEditor({ value, eventId, onChange }: { value: Attachment[]; eventId: string | null; onChange: (a: Attachment[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const prev = eventId ? inheritedFor(eventId) : []
  const add = async (files: File[]) => {
    setBusy(true)
    const added: Attachment[] = []
    for (const f of files) {
      try { added.push(await fileToAttachment(f)) } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo adjuntar') }
    }
    setBusy(false)
    if (added.length) onChange([...value, ...added])
  }
  return (
    <>
      {value.length > 0 && (
        <AttachmentChips
          atts={value}
          onRemove={(a) => {
            onChange(value.filter((x) => x.id !== a.id))
            void removeFile(a.path)
          }}
        />
      )}
      <input ref={ref} type="file" hidden multiple accept="image/*,.heic,.heif,application/pdf,.pdf" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void add(fs) }} />
      <button type="button" className="att-add" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? 'Subiendo…' : value.length ? 'Agregar otro adjunto' : 'Agregar imagen o PDF'}
      </button>
      {prev.map((g) => (
        <div key={g.title}>
          <div className="att-label prev"><Paperclip size={11} /> Adjuntos del evento anterior · {g.title}</div>
          <AttachmentChips atts={g.atts} />
        </div>
      ))}
    </>
  )
}

function Body({ a }: { a: Attachment }) {
  const url = useFileUrl(isFile(a) ? a.path : undefined)
  if (a.type === 'image') return url ? <img src={url} alt={label(a)} /> : <p>Cargando…</p>
  if (a.type === 'pdf') return url ? <iframe src={url} title={label(a)} /> : <p>Cargando…</p>
  if (a.type === 'text') return <pre>{a.text}</pre>
  if (a.type === 'youtube')
    return <iframe src={`https://www.youtube-nocookie.com/embed/${a.videoId}?rel=0&playsinline=1`} title={label(a)} allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
  return <p style={{ padding: 24 }}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.url}</a></p>
}

/** Visor de adjuntos: vista previa + descargar / abrir. */
export function AttachmentViewer() {
  const a = useUI((s) => s.viewAtt)
  const close = () => ui({ viewAtt: null })
  return (
    <AnimatePresence>
      {a && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={close} />
          <motion.div className="att-view glass" initial={{ scale: 0.97 }} animate={{ scale: 1 }} role="dialog" aria-label={label(a)}>
            <div className="row">
              <b title={label(a)}>{label(a)}</b>
              <span style={{ display: 'flex', gap: 8 }}>
                {isFile(a) && <button className="primary" onClick={() => void downloadFile(a.path!, a.name || 'archivo')}><Download size={14} /> Descargar</button>}
                {(a.url || a.type === 'youtube') && <a href={a.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Abrir</a>}
                <button onClick={close} aria-label="Cerrar"><X size={14} /></button>
              </span>
            </div>
            <div className="body"><Body a={a} /></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
