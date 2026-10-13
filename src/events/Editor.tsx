import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ImagePlus, Bold, CheckSquare, Italic, Link2, List, Trash2, X } from 'lucide-react'
import type { Attachment, EventRow, Occurrence, Owner } from '../types'
import { ui, useData, useUI, ownerColor, ownerKeys, ownerName, shows, toast } from '../store'
import { model } from '../calendar/model'
import { cam } from '../canvas/camera'
import { Markdown } from './Markdown'
import {
  askConfirm, askScope, createEvent, createMany, editOccurrence, mkEvent, patchEvent, sortBetween,
} from '../actions'
import {
  buildCustom, defaultCustom, describeRule, nextDates, parseRuleSpec, presetRule, withEnd,
  type CustomRule, type Preset,
} from '../calendar/recurrence'
import { addDaysStr, DOW_FULL, shortDate, weekdayIdx, parse, MONTHS } from '../lib/dates'
import { sendMsg } from '../realtime/net'
import { fileToCover } from '../lib/image'
import { EmojiPicker } from './EmojiPicker'
import { CoverPositioner } from './CoverPositioner'
import { StockPicker } from './StockPicker'
import { AttachmentsEditor } from '../objects/Attachments'
import { throttle } from '../lib/util'
import { requestDelete } from '../ui/menus'

const WD_CHIPS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** Punto libre del canvas (centro de la pantalla, con pequeño desfase) para planes sin día. */
function freeSpot() {
  const c = cam.center()
  const j = () => Math.round((Math.random() - 0.5) * 80)
  return { x: Math.round(c.x - 102 + j()), y: Math.round(c.y - 40 + j()) }
}

const sendDraft = throttle((d: Parameters<typeof sendMsg>[0]) => sendMsg(d), 150)

function findOcc(key?: string, eventId?: string | null): Occurrence | null {
  const m = model.current
  if (!m) return null
  if (key) {
    const o = m.allOccs.find((x) => x.key === key)
    if (o) return o
  }
  return eventId ? (m.allOccs.find((x) => x.event.id === eventId) ?? null) : null
}

export function Editor() {
  const editor = useUI((s) => s.editor)!
  const me = useData((s) => s.me)!
  const profiles = useData((s) => s.profiles)
  const owners = ownerKeys(profiles).map((v) => ({ v, label: ownerName(v, profiles) }))
  const conflict = useUI((s) => s.conflict)
  const ev = useData((s) => (editor.eventId ? s.events[editor.eventId] : null))
  const root = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)
  const coverRef = useRef<HTMLInputElement>(null)

  const occ = useMemo(() => (editor.eventId ? findOcc(editor.occKey, editor.eventId) : null), [editor.eventId, editor.occKey])
  const isNew = !editor.eventId
  const seed = editor.seed
  const baseDate = editor.day ?? occ?.date ?? null
  const win = model.current

  const init = (src: EventRow | null, o: Occurrence | null) => {
    const e = src
    const date = o?.origDate && o.recurring ? o.date : (o?.date ?? baseDate ?? '')
    const startDate = e?.start_date ?? (isNew ? baseDate : null)
    const spec = parseRuleSpec(e?.rrule ?? seed?.rrule ?? null, e?.rrule_until ?? null, startDate ?? date ?? '2026-01-01')
    return {
      title: o?.title ?? e?.title ?? seed?.title ?? '',
      desc: (o ? o.description_md : e?.description_md) ?? seed?.description_md ?? '',
      owner: (o?.owner ?? e?.owner ?? seed?.owner ?? me.person) as Owner,
      noDate: isNew ? !baseDate : !e?.start_date,
      date: (o?.recurring ? o.date : (e?.start_date ?? baseDate ?? '')) || '',
      multi: !!(e?.end_date && e.start_date && e.end_date > e.start_date),
      endDate: e?.end_date ?? '',
      allDay: o?.all_day ?? e?.all_day ?? true,
      start: o?.start_time?.slice(0, 5) ?? e?.start_time?.slice(0, 5) ?? '19:00',
      end: o?.end_time?.slice(0, 5) ?? e?.end_time?.slice(0, 5) ?? '20:00',
      preset: spec.preset as Preset,
      custom: spec.custom as CustomRule,
      meetup: e?.is_meetup ?? false,
      emoji: o?.emoji ?? e?.emoji ?? '',
      cover: (o?.cover ?? e?.cover ?? seed?.cover ?? '') as string,
      coverPos: (o?.cover_pos ?? e?.cover_pos ?? '') as string,
      attachments: (e?.attachments ?? []) as Attachment[],
      eachMode: 'each' as 'each' | 'one',
      _date0: date,
    }
  }

  const [f, setF] = useState(() => init(ev, occ))
  const [tab, setTab] = useState<'w' | 'p'>('w')
  const [busy, setBusy] = useState(false)
  const [showStock, setShowStock] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  const dateKey = f.date || '2026-01-01'
  const rule = (() => {
    if (f.preset === 'none') return { rrule: null as string | null, until: null as string | null }
    if (f.preset === 'custom') {
      const base = buildCustom(f.custom, dateKey)
      if (f.custom.endType === 'count') return { rrule: withEnd(base, null, f.custom.count), until: null }
      if (f.custom.endType === 'date') return { rrule: withEnd(base, f.custom.until, null), until: f.custom.until }
      return { rrule: base, until: null }
    }
    return { rrule: presetRule(f.preset, dateKey), until: null }
  })()

  /* foco inicial */
  useEffect(() => { titleRef.current?.focus() }, [])

  /* posicionamiento junto al día */
  const place = () => {
    const el = root.current
    if (!el) return
    if (window.innerWidth < 640) { el.style.left = el.style.top = ''; return }
    const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-ed')) || 1
    const W = 420 * z
    const H = el.getBoundingClientRect().height
    const day = editor.day ?? f.date
    const anchor = day ? document.querySelector(`[data-day="${day}"]`) : null
    let left = (window.innerWidth - W) / 2
    let top = Math.max(16, (window.innerHeight - H) / 2)
    if (anchor) {
      const r = anchor.getBoundingClientRect()
      if (window.innerWidth - r.right >= W + 16) left = r.right + 12
      else if (r.left >= W + 16) left = r.left - W - 12
      else left = Math.min(Math.max(8, r.left), window.innerWidth - W - 8)
      top = Math.min(Math.max(8, r.top), window.innerHeight - H - 8)
      if (r.right < 0 || r.left > window.innerWidth || r.bottom < 0 || r.top > window.innerHeight) {
        left = (window.innerWidth - W) / 2
        top = Math.max(16, (window.innerHeight - H) / 2)
      }
    }
    el.style.left = `${Math.max(8, left) / z}px`
    el.style.top = `${Math.max(8, top) / z}px`
  }
  useLayoutEffect(place)
  useEffect(() => cam.subscribe(place), [editor.day, f.date])

  /* borrador en vivo */
  const draftId = useRef(crypto.randomUUID())
  useEffect(() => {
    sendDraft({ type: 'draft', d: { id: draftId.current, day: f.noDate ? null : f.date || editor.day, title: f.title, owner: f.owner, kind: 'draft', editing: editor.eventId } })
  }, [f.title, f.owner, f.date, f.noDate])
  useEffect(() => () => { sendMsg({ type: 'draft', d: null }) }, [])

  const dirty = f.title.trim() !== '' || f.desc.trim() !== ''
  const close = () => ui({ editor: null, conflict: null })
  const cancel = async () => {
    if (isNew && dirty && !(await askConfirm('¿Descartar este plan?', 'Descartar'))) return
    close()
  }

  const wrapSel = (pre: string, post = pre) => {
    const t = descRef.current
    if (!t) return
    const { selectionStart: a, selectionEnd: b, value } = t
    const next = value.slice(0, a) + pre + value.slice(a, b) + post + value.slice(b)
    set('desc', next)
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(a + pre.length, b + pre.length) })
  }
  const linePrefix = (p: string) => {
    const t = descRef.current
    if (!t) return
    const a = t.selectionStart
    const ls = t.value.lastIndexOf('\n', a - 1) + 1
    set('desc', t.value.slice(0, ls) + p + t.value.slice(ls))
    requestAnimationFrame(() => t.focus())
  }

  const save = async () => {
    if (busy) return
    let title = f.title.trim().replace(/^#+\s*/, '')
    if (!title) { titleRef.current?.focus(); return toast('Poné un título') }
    if (title.length > 140) title = title.slice(0, 140)
    if (!f.allDay && f.end <= f.start) return toast('El fin tiene que ser después del inicio')
    if (!f.noDate && !f.date) return toast('Elegí una fecha')
    setBusy(true)
    const desc = f.desc.trim() ? f.desc : null
    const common = {
      title, description_md: desc, owner: f.owner, all_day: f.allDay,
      start_time: f.allDay ? null : f.start, end_time: f.allDay ? null : f.end,
      emoji: f.emoji || null, cover: f.cover || null, cover_pos: f.cover ? f.coverPos || null : null, attachments: f.attachments, is_meetup: f.owner === 'ambos' && f.meetup,
    }
    const endDate = f.multi && f.endDate && f.endDate > f.date ? f.endDate : null
    try {
      if (isNew) {
        const m = model.current
        const mk = (day: string | null, end: string | null) => {
          const list = day ? (m?.occsByDay[day] ?? []) : []
          const sorted = list.filter((o) => o.all_day).map((o) => o.sort).sort((a, b) => a - b)
          return mk2(day, end, sortBetween(sorted, sorted.length))
        }
        const mk2 = (day: string | null, end: string | null, sort: number) => {
          const free = freeSpot()
          return mkEvent({
            ...common, start_date: day, end_date: end, rrule: day ? rule.rrule : null, rrule_until: day ? rule.until : null,
            sort_order: sort,
            canvas_x: day ? null : editor.seed && 'canvas_x' in editor.seed ? (editor.seed.canvas_x ?? null) : free.x,
            canvas_y: day ? null : editor.seed && 'canvas_y' in editor.seed ? (editor.seed.canvas_y ?? null) : free.y,
          })
        }
        const days = editor.days && editor.days.length > 1 ? editor.days : null
        if (days) {
          const consecutive = days.every((d, i) => i === 0 || addDaysStr(days[i - 1], 1) === d)
          if (consecutive && f.eachMode === 'one') await createMany([mk(days[0], days[days.length - 1])])
          else await createMany(days.map((d) => mk(d, null)))
        } else {
          const row = mk(f.noDate ? null : f.date, f.noDate ? null : endDate)
          await createEvent(row)
          if (!shows(useUI.getState().filter, f.owner)) {
            ui({ hiddenNotice: { id: row.id, until: Date.now() + 2000 } })
            setTimeout(() => ui({ hiddenNotice: null }), 2000)
            toast('Este plan está oculto por el filtro', {
              label: 'Mostrar',
              fn: () => {
                const cur = useUI.getState().filter
                ui({ filter: { ...cur, [f.owner]: true } })
              },
            })
          }
        }
        close()
        return
      }

      const e = ev!
      if (!occ || !occ.recurring) {
        const patch: Partial<EventRow> = {
          ...common,
          start_date: f.noDate ? null : f.date,
          end_date: f.noDate ? null : endDate,
          rrule: f.noDate ? null : rule.rrule,
          rrule_until: f.noDate ? null : rule.until,
        }
        if (f.noDate && e.canvas_x === null && e.start_date) {
          const free = freeSpot()
          patch.canvas_x = free.x
          patch.canvas_y = free.y
        } else if (!f.noDate) {
          patch.canvas_x = null
          patch.canvas_y = null
        }
        await patchEvent(e.id, patch)
        close()
        return
      }

      // repetitivo: qué cambió
      const ruleChanged = (rule.rrule ?? null) !== (e.rrule ?? null) || (rule.until ?? null) !== (e.rrule_until ?? null)
      const edits: Parameters<typeof editOccurrence>[1] = {}
      if (title !== occ.title) edits.title = title
      if (desc !== occ.description_md) edits.description_md = desc
      if (f.owner !== occ.owner) edits.owner = f.owner
      if (f.allDay !== occ.all_day) edits.all_day = f.allDay
      if (common.start_time !== occ.start_time) edits.start_time = common.start_time
      if (common.end_time !== occ.end_time) edits.end_time = common.end_time
      if ((f.emoji || null) !== occ.emoji) edits.emoji = f.emoji || null
      if ((f.cover || null) !== (occ.cover ?? null)) edits.cover = f.cover || null
      if (JSON.stringify(f.attachments) !== JSON.stringify(e.attachments ?? [])) edits.attachments = f.attachments
      if ((f.cover ? f.coverPos || null : null) !== (occ.cover_pos ?? null)) edits.cover_pos = f.cover ? f.coverPos || null : null
      if (common.is_meetup !== e.is_meetup) edits.is_meetup = common.is_meetup
      if (f.date && f.date !== occ.date) edits.date = f.date
      if (ruleChanged) { edits.rrule = rule.rrule; edits.rrule_until = rule.until }
      if (!Object.keys(edits).length) { close(); return }
      const scope = await askScope('Guardar cambios', ruleChanged)
      if (!scope) { setBusy(false); return }
      await editOccurrence(occ, edits, scope)
      close()
    } finally {
      setBusy(false)
    }
  }

  /* teclado */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save(); return }
    if (e.key === 'Escape') { e.stopPropagation(); void cancel(); return }
    const t = e.target as HTMLElement
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const i = ['1', '2', '3', '4'].indexOf(e.key)
      if (i >= 0 && owners[i]) set('owner', owners[i].v)
    }
    if ((e.ctrlKey || e.metaKey) && t === descRef.current) {
      if (e.key === 'b') { e.preventDefault(); wrapSel('**') }
      if (e.key === 'i') { e.preventDefault(); wrapSel('*') }
      if (e.key === 'k') { e.preventDefault(); wrapSel('[', '](https://)') }
    }
  }

  const conflictHere = conflict && conflict.eventId === editor.eventId
  const reloadTheirs = () => {
    if (ev) setF(init(ev, findOcc(editor.occKey, editor.eventId)))
    ui({ conflict: null })
  }

  const dateOpts = { min: win?.winStart, max: win?.winEnd }
  const nextList = rule.rrule && f.date ? nextDates({ rrule: rule.rrule, rrule_until: rule.until, start_date: f.date }, 3) : []
  const sel = (o: Owner) => ownerColor(o, profiles)

  const presets: [Preset, string][] = [
    ['none', 'No se repite'],
    ['daily', 'Todos los días'],
    ['weekly', `Todas las semanas el ${DOW_FULL[parse(dateKey).getDay()]}`],
    ['biweekly', 'Cada 2 semanas'],
    ['monthday', `Todos los meses el día ${parse(dateKey).getDate()}`],
    ['monthnth', `Todos los meses el ${Math.ceil(parse(dateKey).getDate() / 7) > 4 ? 'último' : Math.ceil(parse(dateKey).getDate() / 7) + 'º'} ${DOW_FULL[parse(dateKey).getDay()]}`],
    ['yearly', `Todos los años (${parse(dateKey).getDate()} de ${MONTHS[parse(dateKey).getMonth()]})`],
    ['weekdays', 'Días de semana'],
    ['custom', 'Personalizado…'],
  ]
  const C2 = f.custom
  const setC = (p: Partial<CustomRule>) => set('custom', { ...C2, ...p })

  return (
    <>
      <div className="scrim" onPointerDown={() => void cancel()} />
      <motion.div
        ref={root}
        className="editor glass"
        role="dialog"
        aria-label={isNew ? 'Nuevo plan' : 'Editar plan'}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        onKeyDown={onKeyDown}
        data-scroll
        data-nodrag
        data-hud
      >
        {conflictHere && (
          <div className="conflict">
            <b>{conflict!.by}</b> cambió este plan.
            <button onClick={reloadTheirs}>Ver su versión</button>
            <button onClick={() => ui({ conflict: null })}>Mantener la mía</button>
          </div>
        )}
        <div className="ed-title-row">
        <input
          ref={titleRef}
          className="ed-title"
          placeholder="¿Qué plan?"
          value={f.title}
          maxLength={140}
          onChange={(e) => set('title', e.target.value.replace(/^#+\s+/, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); descRef.current?.focus() } }}
          aria-label="Título"
        />
          <button
            type="button"
            className={`stock-btn ${showStock ? 'on' : ''}`}
            title="Buscar una portada en internet con este título"
            aria-label="Buscar portada en internet"
            disabled={!f.title.trim()}
            onClick={() => setShowStock((v) => !v)}
          >
            <ImagePlus size={18} />
          </button>
        </div>
        {showStock && (
          <StockPicker
            key={f.title}
            initial={f.title.trim()}
            onClose={() => setShowStock(false)}
            onAccept={(url) => { set('cover', url); set('coverPos', ''); setShowStock(false) }}
          />
        )}
        <div className="ed-tabs">
          <button className={tab === 'w' ? 'on' : ''} onClick={() => setTab('w')}>Escribir</button>
          <button className={tab === 'p' ? 'on' : ''} onClick={() => setTab('p')}>Vista previa</button>
          <span className="sp" />
          {tab === 'w' && (
            <span className="tools">
              <button aria-label="Negrita" onClick={() => wrapSel('**')}><Bold size={14} /></button>
              <button aria-label="Cursiva" onClick={() => wrapSel('*')}><Italic size={14} /></button>
              <button aria-label="Lista" onClick={() => linePrefix('- ')}><List size={14} /></button>
              <button aria-label="Checkbox" onClick={() => linePrefix('- [ ] ')}><CheckSquare size={14} /></button>
              <button aria-label="Link" onClick={() => wrapSel('[', '](https://)')}><Link2 size={14} /></button>
            </span>
          )}
        </div>
        {tab === 'w' ? (
          <textarea
            ref={descRef}
            className="ed-desc"
            placeholder="Detalles (markdown)…"
            value={f.desc}
            rows={3}
            onChange={(e) => {
              set('desc', e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`
            }}
            aria-label="Descripción"
          />
        ) : (
          <div className="ed-preview">{f.desc.trim() ? <Markdown text={f.desc} /> : <em>Sin descripción</em>}</div>
        )}

        <div className="ed-row">
          <label>De quién</label>
          <div className="seg wrap" role="radiogroup">
            {owners.map((o, i) => (
              <button
                key={o.v}
                role="radio"
                aria-checked={f.owner === o.v}
                className={f.owner === o.v ? 'on' : ''}
                style={{ ['--oc' as string]: sel(o.v) }}
                onClick={() => set('owner', o.v)}
                title={`Tecla ${i + 1}`}
              >
                <i style={{ background: sel(o.v) }} />{o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ed-row">
          <label>Fecha</label>
          <div className="ed-inline">
            {!f.noDate && (
              <input type="date" value={f.date} {...dateOpts} onChange={(e) => set('date', e.target.value)} aria-label="Fecha" />
            )}
            {!f.noDate && f.multi && (
              <input type="date" value={f.endDate} min={f.date} max={win?.winEnd} onChange={(e) => set('endDate', e.target.value)} aria-label="Hasta" />
            )}
          </div>
        </div>
        <div className="ed-row sub">
          <label className="chk-l"><input type="checkbox" checked={f.multi} disabled={f.noDate || f.preset !== 'none'} onChange={(e) => set('multi', e.target.checked)} /> Varios días</label>
          <label className="chk-l"><input type="checkbox" checked={f.noDate} onChange={(e) => set('noDate', e.target.checked)} /> Sin fecha (bandeja)</label>
        </div>

        {editor.days && editor.days.length > 1 && (
          <div className="ed-row sub">
            <label className="chk-l"><input type="radio" checked={f.eachMode === 'each'} onChange={() => set('eachMode', 'each')} /> Un plan por día ({editor.days.length})</label>
            <label className="chk-l"><input type="radio" checked={f.eachMode === 'one'} onChange={() => set('eachMode', 'one')} /> Un solo plan de varios días</label>
          </div>
        )}

        <div className="ed-row">
          <label>Horario</label>
          <div className="ed-inline">
            <label className="chk-l"><input type="checkbox" checked={f.allDay} onChange={(e) => set('allDay', e.target.checked)} /> Todo el día</label>
            {!f.allDay && (
              <>
                <input type="time" step={900} value={f.start} onChange={(e) => set('start', e.target.value)} aria-label="Inicio" />
                <span>–</span>
                <input type="time" step={900} value={f.end} onChange={(e) => set('end', e.target.value)} aria-label="Fin" />
              </>
            )}
          </div>
        </div>

        {!f.noDate && (
          <div className="ed-row">
            <label>Repetir</label>
            <select value={f.preset} onChange={(e) => set('preset', e.target.value as Preset)} aria-label="Repetir">
              {presets.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}

        {!f.noDate && f.preset === 'custom' && (
          <div className="custom">
            <div className="ed-inline">
              <span>Cada</span>
              <input type="number" min={1} max={99} value={C2.interval} onChange={(e) => setC({ interval: Math.max(1, +e.target.value || 1) })} aria-label="Intervalo" />
              <select value={C2.freq} onChange={(e) => setC({ freq: e.target.value as CustomRule['freq'] })}>
                <option value="DAILY">días</option>
                <option value="WEEKLY">semanas</option>
                <option value="MONTHLY">meses</option>
                <option value="YEARLY">años</option>
              </select>
            </div>
            {C2.freq === 'WEEKLY' && (
              <div className="chips">
                {WD_CHIPS.map((l, i) => (
                  <button
                    key={i}
                    className={C2.days.includes(i) ? 'on' : ''}
                    aria-label={DOW_FULL[(i + 1) % 7]}
                    onClick={() => setC({ days: C2.days.includes(i) ? C2.days.filter((x) => x !== i) : [...C2.days, i] })}
                  >{l}</button>
                ))}
              </div>
            )}
            {C2.freq === 'MONTHLY' && (
              <select value={C2.monthMode} onChange={(e) => setC({ monthMode: e.target.value as 'day' | 'nth' })}>
                <option value="day">el día {parse(dateKey).getDate()}</option>
                <option value="nth">el {Math.ceil(parse(dateKey).getDate() / 7)}º {DOW_FULL[parse(dateKey).getDay()]}</option>
              </select>
            )}
            <div className="ed-inline">
              <span>Termina</span>
              <select value={C2.endType} onChange={(e) => setC({ endType: e.target.value as CustomRule['endType'] })}>
                <option value="never">nunca</option>
                <option value="date">el…</option>
                <option value="count">después de…</option>
              </select>
              {C2.endType === 'date' && <input type="date" value={C2.until} min={f.date} onChange={(e) => setC({ until: e.target.value })} />}
              {C2.endType === 'count' && (<><input type="number" min={1} max={999} value={C2.count} onChange={(e) => setC({ count: Math.max(1, +e.target.value || 1) })} /><span>veces</span></>)}
            </div>
          </div>
        )}
        {!f.noDate && rule.rrule && (
          <div className="rule-sum">
            {describeRule(rule.rrule, rule.until, dateKey)}
            {nextList.length > 0 && <> · próximos: {nextList.map(shortDate).join(', ')}</>}
          </div>
        )}

        {f.owner === 'ambos' && (
          <div className="ed-row">
            <label>Destacado</label>
            <label className="switch"><input type="checkbox" checked={f.meetup} onChange={(e) => set('meetup', e.target.checked)} /><span /></label>
          </div>
        )}

        <div className="ed-row block">
          <label>Emoji</label>
          <div className="emo-line">
            <button type="button" className="emo-cur" onClick={() => setShowEmoji((v) => !v)} aria-expanded={showEmoji}>
              <span>{f.emoji || '🙂'}</span>{showEmoji ? 'Cerrar' : f.emoji ? 'Cambiar' : 'Elegir emoji'}
            </button>
            {f.emoji && <button type="button" onClick={() => set('emoji', '')}>Quitar</button>}
          </div>
          {showEmoji && <EmojiPicker value={f.emoji} onChange={(e) => { set('emoji', e); setShowEmoji(false) }} />}
        </div>

        <div className="ed-row block">
          <label>Portada</label>
          <div className="cover-pick">
            {f.cover && <CoverPositioner src={f.cover} pos={f.coverPos} onChange={(p) => set('coverPos', p)} />}
            <input
              ref={coverRef}
              type="file"
              accept="image/*,.heic,.heif"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try { set('cover', await fileToCover(file)); set('coverPos', '') } catch (err) { toast(err instanceof Error ? err.message : 'No se pudo usar esa imagen') }
                e.target.value = ''
              }}
            />
            <div className="cover-btns">
              <button type="button" onClick={() => coverRef.current?.click()}>{f.cover ? 'Cambiar imagen' : 'Agregar imagen'}</button>
              {f.cover && <button type="button" onClick={() => set('cover', '')}>Quitar</button>}
              {!f.cover && <small>opcional</small>}
            </div>
          </div>
        </div>

        <div className="ed-row block">
          <label>Adjuntos</label>
          <div className="att-edit">
            <AttachmentsEditor
              value={f.attachments}
              eventId={editor.eventId}
              onChange={(a) => set('attachments', a)}
            />
          </div>
        </div>

        <footer className="ed-foot">
          {!isNew && occ && (
            <button className="danger" onClick={() => { close(); void requestDelete(occ) }}>
              <Trash2 size={14} /> Eliminar
            </button>
          )}
          <span className="sp" />
          <button onClick={() => void cancel()}><X size={14} /> Cancelar</button>
          <button className="primary" onClick={() => void save()} disabled={busy}>Guardar</button>
        </footer>
      </motion.div>
    </>
  )
}

export { weekdayIdx, defaultCustom }
