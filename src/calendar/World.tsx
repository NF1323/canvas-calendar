import { memo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Group, Minimize2, Plus, Ungroup } from 'lucide-react'
import type { Model } from './model'
import { GHOST_H } from './model'
import { C, endMin, intersects, isTimed, startMin, type DayItem } from './layout'
import type { Occurrence, Profile } from '../types'
import { ownerColor, setPrefs, shows, ui, useData, useUI, type Draft, type Lod } from '../store'
import { DOW, isWeekend, monthTitle, parse, cap, MONTHS } from '../lib/dates'
import { EventCard } from '../events/EventCard'
import { input } from '../canvas/input'
import { flyToDay, flyToMonth, flyToWeek, selectRange } from '../canvas/nav'
import { createAt } from '../ui/menus'
import { resetMonthSizes, setDaySize, toggleUngroup, useItems } from '../canvasItems'
import { useHolidays } from '../lib/holidays'
import { startResize } from '../canvas/move'
import { Arrows } from './Arrows'
import { ObjectsLayer } from '../objects/Objects'

const SPRING = { type: 'spring' as const, stiffness: 260, damping: 30 }
const EMPTY: { id: string; label: string; color: string }[] = []
const NO_ITEMS: DayItem[] = []
const WEEK_HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

interface DayProps {
  day: string
  x: number
  y: number
  w: number
  h: number
  arr: DayItem[]
  occs: Occurrence[]
  lod: Lod
  today: boolean
  past: boolean
  holiday?: string
  selColor?: string
  remoteSel: boolean
  focused: boolean
  focusMode: boolean
  expanded: string[]
  highlight: string | null
  pulseColor?: string
  drop: boolean
  ghost: 'none' | 'mine' | 'theirs' | 'both'
  draft: Draft | null
  profiles: Profile[]
  instant: boolean
  nowLine: number | null
  ungrouped: boolean
  mlabel: string
  mcolor: string
  marks: { id: string; label: string; color: string }[]
  glow: boolean
  rest: boolean
}

/** Línea de horarios: aparece cuando el día se agranda lo suficiente. */
function DayTimeline({ p, expSet }: { p: DayProps; expSet: Set<string> }) {
  const { occs, w, h, lod } = p
  const GUT = 50
  const ROW = 40
  const timed = occs.filter(isTimed).sort((a, b) => startMin(a) - startMin(b))
  const allday = occs.filter((o) => !isTimed(o))
  const stripH = allday.length ? allday.length * (ROW + 4) + 4 : 0
  const lo = Math.min(7 * 60, ...timed.map((o) => Math.floor(startMin(o) / 60) * 60))
  const hi = 24 * 60 // la línea llega hasta las 00:00
  const bodyTop = C.HEAD_H + stripH + 16 // deja lugar al encabezado: la primera hora no pisa el número del día
  const bodyH = Math.max(120, h - bodyTop - 14)
  const pph = bodyH / ((hi - lo) / 60)
  const yOf = (min: number) => bodyTop + ((min - lo) / 60) * pph

  // columnas dentro de cada grupo de planes que se pisan
  const placed: { o: Occurrence; col: number; cols: number }[] = []
  let cluster: { o: Occurrence; col: number }[] = []
  let ends: number[] = []
  let clusterEnd = -1
  const flush = () => {
    cluster.forEach((c) => placed.push({ ...c, cols: Math.max(1, ends.length) }))
    cluster = []
    ends = []
  }
  for (const o of timed) {
    if (cluster.length && startMin(o) >= clusterEnd) flush()
    let c = ends.findIndex((e) => e <= startMin(o))
    if (c < 0) { c = ends.length; ends.push(0) }
    ends[c] = endMin(o)
    cluster.push({ o, col: c })
    clusterEnd = Math.max(clusterEnd, endMin(o))
  }
  flush()

  const step = pph < 22 ? 2 : 1
  const hours: number[] = []
  for (let m = lo; m <= hi; m += 60 * step) hours.push(m)
  const areaW = w - GUT - 8

  return (
    <div className="tl" data-tl>
      {hours.map((m) => (
        <div key={m} className="tl-hour" style={{ top: yOf(m) }}>
          <span>{String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</span>
          <i />
        </div>
      ))}
      {allday.map((o, i) => (
        <div key={o.key} className="tl-pos" style={{ left: GUT, top: C.HEAD_H + 2 + i * (ROW + 4) }}>
          <EventCard occ={o} lod={lod} h={ROW} w={areaW} expanded={false} highlight={p.highlight === o.key} inFocus={p.focused} profiles={p.profiles} tint={false} />
        </div>
      ))}
      {placed.map(({ o, col, cols }) => {
        const cw = areaW / cols
        const top = yOf(startMin(o))
        const hh = Math.max(28, ((endMin(o) - startMin(o)) / 60) * pph - 3)
        return (
          <div key={o.key} className="tl-pos" style={{ left: GUT + col * cw, top }}>
            <EventCard occ={o} lod={lod} h={hh} w={cw - 4} expanded={expSet.has(o.key)} highlight={p.highlight === o.key} inFocus={p.focused} profiles={p.profiles} tint={false} />
          </div>
        )
      })}
    </div>
  )
}

const DayCell = memo(function DayCell(p: DayProps) {
  const { day, lod, occs } = p
  const d = parse(day)
  const counts: Record<string, number> = {}
  occs.forEach((o) => { counts[o.owner] = (counts[o.owner] ?? 0) + 1 })

  const onHeader = (e: React.MouseEvent) => {
    if (input.dragged) return
    const st = useUI.getState()
    if (st.rangePick) {
      if (!st.rangePick.from) ui({ rangePick: { from: day }, selection: [day], selAnchor: day })
      else {
        selectRange(st.rangePick.from, day)
        ui({ rangePick: null, selPanel: true })
      }
      return
    }
    if (e.shiftKey && st.selAnchor) {
      selectRange(st.selAnchor, day)
    } else if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const has = st.selection.includes(day)
      ui({ selection: has ? st.selection.filter((x) => x !== day) : [...st.selection, day], selAnchor: day })
    } else {
      ui({ selAnchor: day, selection: [day], selPanel: true })
      flyToDay(day)
    }
  }

  const expSet = new Set(p.expanded)
  const dashed = (title: string, color: string, key: string, label?: string) => (
    <motion.div
      key={key}
      className="card ghost"
      style={{ height: GHOST_H, width: p.w - 16, ['--oc' as string]: color }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
    >
      <span className="stripe" style={{ background: color }} />
      <div className="card-main">
        <h1 className="title one">{title || 'Nuevo plan…'}</h1>
        {label && <div className="meta">{label}</div>}
      </div>
    </motion.div>
  )

  const me = useData.getState().me
  const myColor = me ? ownerColor(me.person, p.profiles) : '#fff'
  const theirs = p.draft
  const theirName = theirs && p.profiles.find((x) => x.person !== me?.person)?.display_name

  return (
    <motion.div
      className={[
        'day',
        p.today && 'today',
        p.holiday && 'holiday',
        p.glow && 'glow',
        p.marks.length > 0 && 'marked',
        p.ungrouped && 'ungrouped',
        p.past && 'past',
        isWeekend(day) && 'weekend',
        p.rest && 'rest',
        p.selColor && 'selected',
        p.focused && 'focused',
        p.pulseColor && 'pulse',
        p.drop && 'drop',
        `lod-${lod}`,
      ].filter(Boolean).join(' ')}
      data-day={day}
      style={{
        position: 'absolute', left: 0, top: 0,
        ['--sel' as string]: p.selColor, ['--pc' as string]: p.pulseColor, ['--mc' as string]: p.mcolor, ['--mk' as string]: p.marks[0]?.color,
      }}
      initial={false}
      animate={{ x: p.x, y: p.y, width: p.w, height: p.h }}
      transition={p.instant ? { duration: 0 } : { default: SPRING, width: { duration: 0 } }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('[data-card],.day-head,button,.rz,[data-nodrag]')) return
        onHeader(e)
      }}
    >
      <header className="day-head" onClick={onHeader}>
        <span className="num">{d.getDate()}</span>
        <span className="dow">{DOW[d.getDay()]}</span>
        {p.ungrouped && <span className="mchip">{p.mlabel}</span>}
        {p.marks.length > 0 && (
          <span className="markchip" style={{ background: p.marks[0].color }} title={p.marks.map((m) => m.label).join(' · ')}>
            {p.marks[0].label}{p.marks.length > 1 ? ` +${p.marks.length - 1}` : ''}
          </span>
        )}
        {p.holiday && <span className="holiday-name" title={p.holiday}>{p.holiday}</span>}
        {p.today && <span className="hoy">HOY</span>}
        {lod !== 'near' && (
          <span className="dots">
            {Object.keys(counts).slice(0, 6).map((o) =>
              counts[o] ? (
                <i key={o} style={{ background: ownerColor(o, p.profiles) }}>{counts[o] > 1 ? counts[o] : ''}</i>
              ) : null,
            )}
          </span>
        )}
        {p.selColor && <span className="sel-badge" style={{ background: p.selColor }}>{p.remoteSel ? (theirName?.[0] ?? '·') : (me?.display_name[0] ?? '·')}</span>}
      </header>

      {lod === 'far' ? (
        <div className="bars">
          {occs.map((o) => (
            <i key={o.key} style={{ background: ownerColor(o.owner, p.profiles), opacity: o.done ? 0.4 : 1 }} />
          ))}
        </div>
      ) : (
        p.w >= C.TL_W && p.h >= C.TL_H ? (
          <DayTimeline p={p} expSet={expSet} />
        ) : (
          <div className="day-body">
            {p.nowLine !== null && <div className="now-line" style={{ top: p.nowLine }} />}
            <div className="cards">
              <AnimatePresence initial={false}>
                {p.arr.map((it) => (
                  <EventCard
                    key={it.occ.key}
                    occ={it.occ}
                    lod={lod}
                    h={it.h}
                    w={it.w}
                    expanded={expSet.has(it.occ.key)}
                    highlight={p.highlight === it.occ.key || p.highlight === it.occ.event.id}
                    inFocus={p.focused}
                    profiles={p.profiles}
                    tint={false}
                  />
                ))}
                {(p.ghost === 'mine' || p.ghost === 'both') &&
                  dashed(useUI.getState().editor && !useUI.getState().editor?.eventId ? 'Nuevo plan…' : '', myColor, 'g-mine')}
                {(p.ghost === 'theirs' || p.ghost === 'both') && theirs &&
                  dashed(
                    theirs.title,
                    ownerColor(theirs.owner, p.profiles),
                    'g-theirs',
                    theirs.kind === 'drag' ? `${theirName} lo está moviendo` : `${theirName} · escribiendo…`,
                  )}
              </AnimatePresence>
            </div>
            <button className="add" onClick={() => { if (!input.dragged) createAt(day) }}>
              <Plus size={14} /> Agregar
            </button>
          </div>
        )
      )}
      {lod !== 'far' && (
        <>
          <div className="rz rz-r" data-nodrag title="Arrastrá para ensanchar" onPointerDown={(e) => startResize(e, day, 'r')} onDoubleClick={(e) => { e.stopPropagation(); void setDaySize(day, null) }} />
          <div className="rz rz-b" data-nodrag title="Arrastrá para alargar" onPointerDown={(e) => startResize(e, day, 'b')} onDoubleClick={(e) => { e.stopPropagation(); void setDaySize(day, null) }} />
          <div className="rz rz-c" data-nodrag title="Arrastrá para redimensionar (doble clic: tamaño automático)" onPointerDown={(e) => startResize(e, day, 'rb')} onDoubleClick={(e) => { e.stopPropagation(); void setDaySize(day, null) }} />
        </>
      )}
    </motion.div>
  )
})

export function World({ model, holidays, instant }: { model: Model; holidays: Record<string, string>; instant: boolean }) {
  const lod = useUI((s) => s.lod)
  const viewRect = useUI((s) => s.viewRect)
  const focusDay = useUI((s) => s.focusDay)
  const selection = useUI((s) => s.selection)
  const peers = useUI((s) => s.peers)
  const pulses = useUI((s) => s.pulses)
  const pulseColors = useUI((s) => s.pulseColors)
  const highlight = useUI((s) => s.highlight)
  const expanded = useUI((s) => s.expanded)
  const drag = useUI((s) => s.drag)
  const showHolidays = useUI((s) => s.prefs.holidays)
  const view = useUI((s) => s.prefs.view)
  const profiles = useData((s) => s.profiles)
  const me = useData((s) => s.me)
  const today = useData((s) => s.today)

  const myColor = me ? ownerColor(me.person, profiles) : '#fff'
  const selSet = new Set(selection)
  // días seleccionados por otras personas → color de quien los eligió
  const remSel: Record<string, string> = {}
  for (const [who, st] of Object.entries(peers)) for (const d of st.selection) remSel[d] ??= ownerColor(who, profiles)
  const remDraft = Object.values(peers).find((p) => p.draft)?.draft ?? null
  const [curMonth] = [today.slice(0, 7)]
  const nextMonth = (() => {
    const [y, m] = curMonth.split('-').map(Number)
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  })()

  const items = useItems((s) => s.items)
  const filter = useUI((s) => s.filter)
  const marksByDay = (() => {
    const out: Record<string, { id: string; label: string; color: string }[]> = {}
    for (const it of Object.values(items)) {
      if (it.kind !== 'mark') continue
      const d = it.data as { days: string[]; label: string; color: string; owner?: 'sam' | 'alex' | 'ambos' | 'externo' }
      if (!shows(filter, d.owner ?? 'ambos')) continue
      for (const day of d.days) (out[day] ??= []).push({ id: it.id, label: d.label, color: d.color })
    }
    return out
  })()
  const glowSet = new Set(useUI((s) => s.glow))
  const restH = useHolidays((s) => s.restHolidays)
  const sizedCount: Record<string, number> = {}
  for (const [k, it] of Object.entries(items)) {
    if (it.kind === 'day' && (it.data as { w?: number }).w) sizedCount[k.slice(4, 11)] = (sizedCount[k.slice(4, 11)] ?? 0) + 1
  }
  const moving = useItems((s) => Object.keys(s.live).length > 0)
  const inst = instant || moving
  const monthColor = (key: string) => `hsl(${(Number(key.slice(5)) * 47 + Number(key.slice(2, 4)) * 13) % 360} 62% 58%)`

  return (
    <div className={`world-inner ${focusDay ? 'dim' : ''}`}>
      {model.layout.months.map((mo) => {
        if (!intersects(mo.rect, viewRect)) return null
        const rel = mo.key < curMonth ? 'past' : mo.key === curMonth ? 'current' : mo.key === nextMonth ? 'next' : ''
        const [yy, mm] = mo.key.split('-').map(Number)
        const label =
          rel === 'past' ? 'Pasado y recuerdos' : rel === 'current' ? `Mes actual: ${monthTitle(mo.key)}` : rel === 'next' ? `Próximos pasos: ${monthTitle(mo.key)}` : ''
        const partial = mo.days.length <= 7 && mo.key < curMonth
        if (mo.ungrouped && mo.halo) {
          return (
            <motion.section
              key={mo.key}
              className={`halo ${lod === 'far' ? 'far' : ''}`}
              style={{ position: 'absolute', left: 0, top: 0, ['--mc' as string]: monthColor(mo.key) }}
              initial={false}
              animate={{ x: mo.rect.x, y: mo.rect.y, width: mo.rect.w, height: mo.rect.h }}
              transition={inst ? { duration: 0 } : SPRING}
              data-month={mo.key}
            >
              <div className={`poster ${lod === 'far' ? 'show' : ''}`} aria-hidden>
                {cap(MONTHS[mm - 1])}
                <small>{yy}</small>
              </div>
              <h2 className="halo-title" onClick={() => !input.dragged && flyToMonth(mo.key, true)}>
                {cap(MONTHS[mm - 1]).toUpperCase()} {yy}
                <small>desagrupado</small>
              </h2>
              <div className="island-ctl" data-nodrag>
                {sizedCount[mo.key] > 0 && (
                  <button title="Restablecer el tamaño de los días" aria-label="Restablecer el tamaño de los días" onClick={() => void resetMonthSizes(mo.key)}><Minimize2 size={18} /></button>
                )}
                <button
                  title="Reagrupar los días"
                  aria-label="Reagrupar los días"
                  onClick={() => void toggleUngroup(mo.key)}
                >
                  <Group size={18} />
                </button>
              </div>
            </motion.section>
          )
        }
        return (
          <motion.section
            key={mo.key}
            className={`island ${rel} ${mo.ungrouped ? 'ungrouped' : ''} ${lod === 'far' ? 'far' : ''}`}
            style={{ position: 'absolute', left: 0, top: 0, width: mo.rect.w }}
            initial={false}
            animate={{ x: mo.rect.x, y: mo.rect.y, height: mo.rect.h }}
            transition={inst ? { duration: 0 } : SPRING}
            data-month={mo.key}
          >
            {label && (
              <div className={`island-tag ${rel}`}>
                <span className="tg-long">{label}</span>
                <span className="tg-short">{rel === 'past' ? 'Pasado' : rel === 'current' ? 'Actual' : 'Próximo'}</span>
              </div>
            )}
            <div className={`poster ${lod === 'far' ? 'show' : ''}`} aria-hidden>
              {cap(MONTHS[mm - 1])}
              <small>{yy}</small>
            </div>
            <h2 className="month-title" onClick={() => !input.dragged && flyToMonth(mo.key, true)}>
              {cap(MONTHS[mm - 1]).toUpperCase()} {yy}
            </h2>
            {partial && <div className="month-sub">semana pasada</div>}
            {mo.ungrouped && <div className="month-sub">desagrupado · los días se mueven solos</div>}
            <div className="island-ctl" data-nodrag>
              {sizedCount[mo.key] > 0 && (
                <button title="Restablecer el tamaño de los días" aria-label="Restablecer el tamaño de los días" onClick={() => void resetMonthSizes(mo.key)}><Minimize2 size={18} /></button>
              )}
              <button
                title={mo.ungrouped ? 'Reagrupar los días' : 'Desagrupar los días'}
                aria-label={mo.ungrouped ? 'Reagrupar los días' : 'Desagrupar los días'}
                onClick={() => { if (view === 'grid') setPrefs({ view: 'custom' }); void toggleUngroup(mo.key) }}
              >
                {mo.ungrouped ? <Group size={18} /> : <Ungroup size={18} />}
              </button>
            </div>
            <div className="weekdays">
              {WEEK_HEAD.map((w, i) => (
                <span key={w} style={{ left: C.MONTH_PAD + i * (C.DAY_W + C.DAY_GAP), width: C.DAY_W }}>{w}</span>
              ))}
            </div>
            {!mo.ungrouped && mo.rows.map((r) => (
              <button
                key={r.monday}
                className="week-handle"
                aria-label="Volar a la semana"
                style={{ top: r.y, height: r.h }}
                onClick={() => !input.dragged && flyToWeek(`${mo.key}|${r.monday}`, true)}
              />
            ))}
          </motion.section>
        )
      })}
      {model.days.map((d) => {
        const r = model.layout.dayRects[d]
        if (lod === 'far' || !r || !intersects(r, viewRect)) return null
        const mine = selSet.has(d)
        const theirsSel = !!remSel[d]
        const ghostKind = model.ghostDays[d] as 'mine' | 'theirs' | 'both' | undefined
        return (
          <DayCell
            key={d}
            day={d}
            x={r.x}
            y={r.y}
            w={r.w}
            h={r.h}
            arr={model.arr[d]?.items ?? NO_ITEMS}
            occs={model.occsByDay[d] ?? []}
            lod={lod}
            today={d === today}
            past={d < today}
            holiday={showHolidays ? holidays[d] : undefined}
            selColor={mine ? myColor : theirsSel ? remSel[d] : undefined}
            remoteSel={!mine && theirsSel}
            focused={focusDay === d}
            focusMode={!!focusDay}
            expanded={expanded}
            highlight={highlight}
            pulseColor={pulses[d] ? (pulseColors[d] ?? '#8B5CF6') : undefined}
            drop={drag?.overDay === d}
            ghost={ghostKind ?? 'none'}
            draft={remDraft}
            profiles={profiles}
            instant={inst}
            nowLine={null}
            ungrouped={!!model.layout.months.find((m) => m.key === d.slice(0, 7))?.ungrouped}
            mlabel={cap(MONTHS[Number(d.slice(5, 7)) - 1]).slice(0, 3).toUpperCase()}
            mcolor={monthColor(d.slice(0, 7))}
            marks={marksByDay[d] ?? EMPTY}
            glow={glowSet.has(d)}
            rest={isWeekend(d) || restH.has(d)}
          />
        )
      })}
      {model.free.map((f) => (
        <div
          key={f.e.id}
          className="free-card"
          data-free={f.e.id}
          style={{ position: 'absolute', left: f.rect.x, top: f.rect.y, width: f.rect.w, zIndex: 5 }}
        >
          <EventCard
            occ={f.occ}
            lod={lod === 'far' ? 'mid' : lod}
            h={f.rect.h}
            expanded={expanded.includes(f.occ.key)}
            highlight={highlight === f.e.id}
            inFocus={false}
            profiles={profiles}
            tint={false}
          />
        </div>
      ))}
      <ObjectsLayer />
      <Arrows model={model} />
    </div>
  )
}
