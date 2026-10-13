import { memo } from 'react'
import { motion } from 'framer-motion'
import { Check, Pencil, MoreHorizontal, Repeat, Star, Paperclip } from 'lucide-react'
import type { Occurrence, Profile } from '../types'
import type { Lod } from '../store'
import { ownerColor, ui, useData, useUI } from '../store'
import { hhmm } from '../lib/dates'
import { Markdown, toggleCheckbox } from './Markdown'
import { beginCardDrag } from '../canvas/drag'
import { lite } from '../lib/blobUrl'
import { input } from '../canvas/input'
import { editOccurrence, toggleDone } from '../actions'
import { openCardMenu } from '../ui/menus'

interface Props {
  occ: Occurrence
  lod: Lod
  h: number
  /** ancho en px (planes lado a lado); si falta ocupa todo el ancho */
  w?: number
  expanded: boolean
  highlight: boolean
  inFocus: boolean
  profiles: Profile[]
  tint: boolean
}

const posCss = (p?: string | null) => (p ? p.split(' ').map((n) => `${n}%`).join(' ') : '50% 50%')

function EventCardBase({ occ, lod, h, w, expanded, highlight, inFocus, profiles }: Props) {
  const color = ownerColor(occ.owner, profiles)
  const creator = profiles.find((p) => p.id === occ.event.created_by)
  const showCreator = creator && occ.owner !== 'ambos' && creator.person !== occ.owner
  const near = lod === 'near'
  // tarjeta muy baja (p. ej. un plan corto en la línea de horarios): la portada pasa a ser el fondo y el título siempre se ve
  const compact = h < 76
  const hover = useUI((s) => s.attachHover === occ.key)
  const nAtt = occ.event.attachments?.length ?? 0
  const multi = occ.dayCount > 1

  const onClick = () => {
    if (input.dragged) return
    if (inFocus) {
      useUI.setState((s) => ({
        expanded: s.expanded.includes(occ.key) ? s.expanded.filter((k) => k !== occ.key) : [...s.expanded, occ.key],
      }))
    } else edit()
  }

  const edit = () =>
    ui({ editor: { eventId: occ.event.id, occKey: occ.key, day: occ.date || null } })

  const stripe =
    occ.owner === 'ambos'
      ? { background: 'linear-gradient(180deg, #FF5C8A, #4C8BF5)' }
      : { background: color }

  return (
    <motion.article
      className={`card ${occ.done ? 'done' : ''} ${occ.owner === 'ambos' ? 'ambos' : ''} ${occ.is_meetup ? 'meetup' : ''} ${highlight ? 'hl' : ''} ${hover ? 'attach-hover' : ''} ${compact ? 'compact' : ''} ${compact && occ.cover ? 'bgcover' : ''}`}
      data-card={occ.key}
      data-nodrag
      style={{
        height: h,
        width: w,
        ['--oc' as string]: color,
        ...(compact && occ.cover
          ? { backgroundImage: `linear-gradient(rgba(0,0,0,.5), rgba(0,0,0,.7)), url(${lite(occ.cover)})`, backgroundSize: 'cover', backgroundPosition: `center, ${posCss(occ.cover_pos)}` }
          : {}),
      }}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: occ.done ? 0.55 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      transition={{ duration: 0.18 }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button,input,a,textarea')) return
        beginCardDrag(e, occ)
      }}
      onClick={onClick}
      aria-label={`${occ.title}, ${occ.date}`}
    >
      <span className="stripe" style={stripe} />
      <div className="card-main">
        {occ.cover && !compact && <div className="cover" style={{ backgroundImage: `url(${lite(occ.cover)})`, backgroundPosition: posCss(occ.cover_pos) }} role="img" aria-label={`Portada de ${occ.title}`} />}
        <div className="card-top">
          <button
            className={`chk ${occ.done ? 'on' : ''}`}
            aria-label={occ.done ? 'Marcar como pendiente' : 'Marcar como hecho'}
            onClick={(e) => { e.stopPropagation(); void toggleDone(occ) }}
          >
            <Check size={12} strokeWidth={3} />
          </button>
          <h1 className={`title ${near || expanded ? '' : 'one'}`} style={expanded ? { WebkitLineClamp: 99 } : undefined}>
            {occ.emoji && <span className="emo">{occ.emoji} </span>}
            <span className="title-text">{occ.title}</span>
          </h1>
          <div className="card-btns">
            <button aria-label="Editar" onClick={(e) => { e.stopPropagation(); edit() }}><Pencil size={13} /></button>
            <button aria-label="Más opciones" onClick={(e) => { e.stopPropagation(); openCardMenu(e.clientX, e.clientY, occ) }}>
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>
        {near && !compact && (occ.recurring || !occ.all_day || multi || occ.is_meetup || showCreator || nAtt > 0) && (
          <div className="meta">
            {occ.is_meetup && <Star size={11} fill="currentColor" />}
            {!occ.all_day && occ.start_time && (
              <span>{hhmm(occ.start_time)}{occ.end_time ? ` – ${hhmm(occ.end_time)}` : ''}</span>
            )}
            {occ.recurring && <Repeat size={11} aria-label="Se repite" />}
            {nAtt > 0 && <span className="att-count" title={`${nAtt} adjunto${nAtt > 1 ? 's' : ''}`}><Paperclip size={11} /> {nAtt}</span>}
            {multi && <span>día {occ.dayIndex} de {occ.dayCount}</span>}
            {showCreator && <span className="by" title={`Cargado por ${creator!.display_name}`}>{creator!.display_name[0]}</span>}
          </div>
        )}
        {near && !compact && occ.description_md?.trim() && (
          <div className={`desc ${expanded ? 'full' : ''}`}>
            <Markdown
              text={occ.description_md}
              onToggle={(i) =>
                void editOccurrence(occ, { description_md: toggleCheckbox(occ.description_md!, i) }, 'all')
              }
            />
          </div>
        )}
      </div>
    </motion.article>
  )
}

export const EventCard = memo(EventCardBase)
export { useData }
