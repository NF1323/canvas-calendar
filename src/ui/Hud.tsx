import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutGrid, Shapes, Paperclip, Crosshair, CalendarRange, Pencil, Eraser, Check, ChevronDown, ChevronLeft, SquareCheckBig, ScanLine, Tag, Trash2, CalendarPlus, Repeat, ChevronRight, Inbox, Keyboard, LogOut, MapPin, Minus, Plus, Search, Settings, Sun, Maximize2,
  Eye, X, Calendar as CalIcon, Map as MapIcon, Wifi, WifiOff, MoveUpRight,
} from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import type { Model } from '../calendar/model'
import { cam } from '../canvas/camera'
import { dataActions, onlyOwners, othersOf, ownerColor, ownerKeys, ownerName, setFilter, shows, toast, ui, useData, useUI } from '../store'
import { cap, longDay, MONTHS, monthTitle, parse, mondayOf, shortDate } from '../lib/dates'
import {
  exitFocus, flyToThisWeek, flyToNextLongWeekend, flyHome, flyOverview, flyToDays, flyToMonth, flyToWeek, focusStep,
} from '../canvas/nav'
import { Minimap } from './Minimap'
import { signOut } from '../lib/api'
import { toggleView } from '../canvas/view'
import { addTextNote, ingestFiles, ingestText } from '../objects/ingest'
import { newEvent } from './menus'
import { requestDelete } from './menus'
import type { ElRef, Owner } from '../types'
import { addMark, createArrow, removeMark, saveItem, sameRef, useItems } from '../canvasItems'
import { bySortOrder } from '../calendar/recurrence'
import { toggleDone } from '../actions'
import type { MarkData, Profile } from '../types'
import { presetRule } from '../calendar/recurrence'
import { useHolidays } from '../lib/holidays'
import { AttachmentsFor } from '../objects/Attachments'

/* ───────────── presencia ───────────── */

export function Presence() {
  const me = useData((s) => s.me)!
  const profiles = useData((s) => s.profiles)
  const peers = useUI((s) => s.peers)
  const following = useUI((s) => s.following)
  const [menu, setMenu] = useState(false)
  const [all, setAll] = useState(false)
  const color = ownerColor(me.person, profiles)
  const others = othersOf(me, profiles).sort((a, b) => Number(!!peers[b.person]?.online) - Number(!!peers[a.person]?.online) || a.display_name.localeCompare(b.display_name))
  const shown = others.slice(0, 5)
  const hiddenN = others.length - shown.length
  const onlineN = others.filter((p) => peers[p.person]?.online).length
  const stateOf = (person: string) => { const r = peers[person]; return r?.online ? (r.idle ? 'idle' : 'on') : 'off' }
  const sinceOf = (person: string) => {
    const t = peers[person]?.lastSeen
    if (!t) return 'desconectado'
    const mins = Math.round((Date.now() - new Date(t).getTime()) / 60000)
    if (mins < 2) return 'visto hace un momento'
    if (mins < 60) return `visto hace ${mins} min`
    const h = Math.round(mins / 60)
    return h < 24 ? `visto hace ${h} h` : `visto hace ${Math.round(h / 24)} d`
  }
  const labelOf = (person: string) => { const st = stateOf(person); return st === 'on' ? 'en línea' : st === 'idle' ? 'inactivo' : sinceOf(person) }
  const toggleFollow = (person: string) => {
    if (!peers[person]?.online) return
    useUI.setState((s) => ({ following: s.following === person ? null : person }))
  }

  useEffect(() => {
    if (!menu && !all) return
    const c = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.pres-menu,.pres-more,.me-av,.pres-all,.pres-list')) { setMenu(false); setAll(false) } }
    window.addEventListener('pointerdown', c)
    return () => window.removeEventListener('pointerdown', c)
  }, [menu, all])

  const avatarOf = (p: Profile, cls = 'avatar sm') => (
    <span className={cls} style={{ background: ownerColor(p.person, profiles) }}>
      {p.avatar ? <img className="av-img" src={p.avatar} alt="" draggable={false} /> : p.display_name[0]}
      <i className={`dot ${stateOf(p.person)}`} />
    </span>
  )

  return (
    <div className="presence" data-hud data-nodrag>
      <div className="me-wrap">
        <button className="avatar me-av" style={{ background: color }} onClick={() => setMenu((v) => !v)} aria-label="Mi menú">
          {me.avatar ? <img className="av-img" src={me.avatar} alt="" draggable={false} /> : me.display_name[0]}
        </button>
        <span className="me-name">{me.display_name}</span>
      </div>
      {others.length > 0 && (
        <div className={`other glass peers ${following ? 'following' : ''}`}>
          {shown.length === 1 ? (
            <button
              className="other-main"
              onClick={() => toggleFollow(shown[0].person)}
              title={peers[shown[0].person]?.online ? `${peers[shown[0].person].idle ? 'Inactivo' : 'En línea'}${peers[shown[0].person].viewing ? ` · mirando ${peers[shown[0].person].viewing!.toLowerCase()}` : ''} · clic para seguir` : sinceOf(shown[0].person)}
              aria-label={`Seguir a ${shown[0].display_name}`}
            >
              {avatarOf(shown[0])}
              <span className="o-txt">
                <b>{shown[0].display_name}</b>
                <small className={stateOf(shown[0].person)}>{following === shown[0].person ? 'siguiendo…' : labelOf(shown[0].person)}</small>
              </span>
            </button>
          ) : (
            <>
              <div className="peer-stack">
                {shown.map((p) => (
                  <button
                    key={p.person}
                    className={`peer-av ${following === p.person ? 'following' : ''}`}
                    onClick={() => toggleFollow(p.person)}
                    title={`${p.display_name} · ${following === p.person ? 'siguiendo…' : labelOf(p.person)}${peers[p.person]?.online ? ' · clic para seguir' : ''}`}
                    aria-label={`Seguir a ${p.display_name}`}
                  >
                    {avatarOf(p)}
                  </button>
                ))}
                {hiddenN > 0 && (
                  <button className="peer-av more pres-all" onClick={() => setAll((v) => !v)} aria-label={`${hiddenN} más`} title={`${hiddenN} más`}>+{hiddenN}</button>
                )}
              </div>
              <small className="peer-count" title={`${onlineN} de ${others.length} conectados`}>{onlineN}/{others.length}</small>
            </>
          )}
          <button className="pres-more icon" onClick={() => setMenu((v) => !v)} aria-label="Más">⋯</button>
        </div>
      )}
      <AnimatePresence>
        {all && (
          <motion.div className="pres-list glass" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {others.map((p) => (
              <button key={p.person} onClick={() => toggleFollow(p.person)} disabled={!peers[p.person]?.online}>
                {avatarOf(p)}
                <span className="o-txt"><b>{p.display_name}</b><small className={stateOf(p.person)}>{following === p.person ? 'siguiendo…' : labelOf(p.person)}</small></span>
              </button>
            ))}
          </motion.div>
        )}
        {menu && (
          <motion.div className="pres-menu glass" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <button onClick={() => { setMenu(false); ui({ settingsOpen: true }) }}><Settings size={15} /> Ajustes</button>
            <button onClick={() => { setMenu(false); ui({ helpOpen: true }) }}><Keyboard size={15} /> Atajos <kbd>?</kbd></button>
            {following && <button onClick={() => { setMenu(false); ui({ following: null }) }}><Eye size={15} /> Dejar de seguir</button>}
            <button
              onClick={async () => {
                await signOut()
                dataActions.replaceAll([], [])
                useData.setState({ me: null, ready: false })
              }}
            ><LogOut size={15} /> Cerrar sesión</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ───────────── ubicación / foco / contador ───────────── */

export function LocationBar({ model }: { model: Model }) {
  const focusDay = useUI((s) => s.focusDay)
  const lod = useUI((s) => s.lod)
  const today = useData((s) => s.today)
  const [loc, setLoc] = useState<{ month: string; week: string | null; weekKey: string | null }>({ month: today.slice(0, 7), week: null, weekKey: null })
  const [open, setOpen] = useState<'month' | 'week' | null>(null)
  const rangePick = useUI((s) => s.rangePick)
  const runs = useHolidays((s) => s.runs)
  const nextLong = (() => {
    const r = runs.find((x) => x.days[x.days.length - 1] >= today)
    if (!r) return ''
    const a = parse(r.days[0])
    const b = parse(r.days[r.days.length - 1])
    const f = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`
    return `${f(a)} al ${f(b)}${r.names.length ? ' · ' + r.names.join(' + ') : ''}`
  })()
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const c = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(null) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(null) } }
    window.addEventListener('pointerdown', c)
    window.addEventListener('keydown', k, true)
    return () => { window.removeEventListener('pointerdown', c); window.removeEventListener('keydown', k, true) }
  }, [open])

  useEffect(() => {
    const calc = () => {
      const c = cam.center()
      let month = model.layout.months[0]?.key ?? today.slice(0, 7)
      let best = Infinity
      for (const mo of model.layout.months) {
        const r = mo.rect
        const dx = Math.max(r.x - c.x, 0, c.x - (r.x + r.w))
        const dy = Math.max(r.y - c.y, 0, c.y - (r.y + r.h))
        const d = Math.hypot(dx, dy)
        if (d < best) { best = d; month = mo.key }
      }
      const mo = model.layout.months.find((m) => m.key === month)
      let week: string | null = null
      let weekKey: string | null = null
      if (mo) {
        const w = model.layout.weeks.filter((x) => x.month === month).find((x) => c.y >= x.rect.y - 4 && c.y <= x.rect.y + x.rect.h + 4)
        const ww = w ?? model.layout.weeks.find((x) => x.month === month)
        if (ww) {
          weekKey = ww.key
          week = `Semana del ${parse(mondayOf(ww.days[0])).getDate()}`
        }
      }
      setLoc({ month, week, weekKey })
    }
    calc()
    return cam.onIdle(calc)
  }, [model])

  const upcoming = model.allOccs
    .filter((o) => o.is_meetup && o.owner === 'ambos' && o.date >= today && !o.done)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  const left = upcoming ? differenceInCalendarDays(parse(upcoming.date), parse(today)) : null

  if (focusDay) {
    return (
      <div className="loc-wrap" data-hud data-nodrag>
        <motion.div className="loc glass focus" initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <button className="icon" aria-label="Día anterior" onClick={() => focusStep(-1)}><ChevronLeft size={18} /></button>
          <b className="focus-date">{longDay(focusDay)}</b>
          <button className="icon" aria-label="Día siguiente" onClick={() => focusStep(1)}><ChevronRight size={18} /></button>
          <button className="exit" onClick={exitFocus}><X size={14} /> Salir</button>
        </motion.div>
      </div>
    )
  }

  const weeks = model.layout.weeks.filter((w) => w.month === loc.month)
  const wlabel = (w: (typeof weeks)[number]) => {
    const a = parse(w.days[0]).getDate()
    const b = parse(w.days[w.days.length - 1]).getDate()
    return a === b ? `Semana del ${a}` : `Semana del ${a} al ${b}`
  }
  const pick = (fn: () => void) => { setOpen(null); fn() }

  return (
    <div className="loc-wrap" data-hud data-nodrag ref={wrapRef}>
      <div className="loc glass">
        <MapPin size={16} />
        <button className={`crumb ${open === 'month' ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open === 'month'} onClick={() => setOpen(open === 'month' ? null : 'month')}>
          {monthTitle(loc.month)} <ChevronDown size={14} />
        </button>
        {(lod === 'near' || open === 'week') && loc.week && (
          <>
            <ChevronRight size={14} className="sep" />
            <button className={`crumb ${open === 'week' ? 'open' : ''}`} aria-haspopup="listbox" aria-expanded={open === 'week'} onClick={() => setOpen(open === 'week' ? null : 'week')}>
              {loc.week} <ChevronDown size={14} />
            </button>
          </>
        )}
        <button
          className={`crumb range-btn ${rangePick ? 'on' : ''}`}
          title="Seleccionar de un día a otro"
          aria-pressed={!!rangePick}
          onClick={() => { setOpen(null); ui({ rangePick: rangePick ? null : { from: null }, selPanel: true }) }}
        >
          <ScanLine size={15} /> Rango
        </button>
        <button
          className="today-btn"
          title="Volver a la semana actual"
          aria-label="Volver a la semana actual"
          onClick={() => {
            setOpen(null)
            flyToThisWeek()
          }}
        >
          <Crosshair size={15} /> <span>Esta semana</span>
        </button>
        <button className="today-btn" title={nextLong ? `Próximo finde largo: ${nextLong}` : 'Próximo finde largo'} aria-label="Ir al próximo fin de semana largo" onClick={() => { setOpen(null); flyToNextLongWeekend() }}>
          <CalendarRange size={15} /> <span>Finde largo</span>
        </button>
      </div>
      {rangePick && (
        <div className="loc glass hint">
          {rangePick.from ? 'Ahora tocá el último día del rango' : 'Tocá el primer día del rango'}
          <button onClick={() => ui({ rangePick: null })}>Cancelar</button>
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.ul
            key={open}
            className="loc-drop glass"
            role="listbox"
            data-scroll
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
          >
            {open === 'month' &&
              model.layout.months.map((mo, i) => {
                const y = mo.key.slice(0, 4)
                const newYear = i === 0 || model.layout.months[i - 1].key.slice(0, 4) !== y
                return (
                  <li key={mo.key} role="presentation">
                    {newYear && <div className="yr">{y}</div>}
                    <div className="row">
                      <button role="option" aria-selected={mo.key === loc.month} className={mo.key === loc.month ? 'on' : ''} onClick={() => pick(() => flyToMonth(mo.key))}>
                        {cap(MONTHS[Number(mo.key.slice(5)) - 1])}
                        {mo.key === today.slice(0, 7) && <small>actual</small>}
                      </button>
                      <button className="sel" title="Seleccionar todo el mes" aria-label="Seleccionar todo el mes" onClick={() => pick(() => { ui({ selection: mo.days, selAnchor: mo.days[0], selPanel: true }); flyToMonth(mo.key) })}>
                        <SquareCheckBig size={15} />
                      </button>
                    </div>
                  </li>
                )
              })}
            {open === 'week' &&
              weeks.map((w) => (
                <li key={w.key} role="presentation">
                  <div className="row">
                    <button role="option" aria-selected={w.key === loc.weekKey} className={w.key === loc.weekKey ? 'on' : ''} onClick={() => pick(() => flyToWeek(w.key))}>
                      {wlabel(w)}
                      {w.days.includes(today) && <small>esta semana</small>}
                    </button>
                    <button className="sel" title="Seleccionar la semana" aria-label="Seleccionar la semana" onClick={() => pick(() => { ui({ selection: w.days, selAnchor: w.days[0], selPanel: true }); flyToWeek(w.key) })}>
                      <SquareCheckBig size={15} />
                    </button>
                  </div>
                </li>
              ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {left !== null && (
        <motion.div className="loc glass count" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {left === 0 ? '¡Hoy es el día!' : left === 1 ? 'Falta 1 día para el próximo encuentro' : `Faltan ${left} días para el próximo encuentro`} <span>✨</span>
        </motion.div>
      )}
    </div>
  )
}

/* ───────────── filtro ───────────── */

export function FilterBar({ model }: { model: Model }) {
  const filter = useUI((s) => s.filter)
  const shake = useUI((s) => s.shake)
  const me = useData((s) => s.me)!
  const profiles = useData((s) => s.profiles)
  const [views, setViews] = useState(false)
  const chips: { k: Owner; label: string }[] = [
    ...profiles.map((p) => ({ k: p.person, label: p.display_name })),
    { k: 'ambos', label: 'Todos' },
    { k: 'externo', label: 'Externo' },
  ]
  const toggle = (k: Owner, solo: boolean) => {
    if (solo) return setFilter(onlyOwners([k]))
    setFilter({ ...filter, [k]: !shows(filter, k) })
  }
  const others = othersOf(me, profiles).map((p) => p.person)
  const views_: [string, () => void][] = [
    ['Todo', () => setFilter({})],
    ['Solo lo mío', () => setFilter(onlyOwners([me.person, 'ambos']))],
    ...(others.length ? [['Solo lo de los demás', () => setFilter(onlyOwners(others))] as [string, () => void]] : []),
    ['Solo del grupo', () => setFilter(onlyOwners(['ambos']))],
    ['Solo externos', () => setFilter(onlyOwners(['externo']))],
  ]
  return (
    <div className="filters glass" data-hud data-nodrag>
      {chips.map((c) => {
        const col = ownerColor(c.k, profiles)
        const on = shows(filter, c.k)
        return (
          <motion.button
            key={c.k}
            className={`chip ${on ? 'on' : ''}`}
            style={{ ['--oc' as string]: col }}
            animate={shake && Date.now() - shake < 500 && on ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
            key-shake={shake}
            aria-pressed={on}
            aria-label={`Planes de ${ownerName(c.k, profiles)}`}
            onClick={(e) => toggle(c.k, e.altKey)}
          >
            <i />
            {c.label} <span>({model.counts[c.k] ?? 0})</span>
          </motion.button>
        )
      })}
      <div className="views-wrap">
        <button className="icon" aria-label="Vistas" onClick={() => setViews((v) => !v)}><Eye size={16} /></button>
        {views && (
          <div className="views glass" onMouseLeave={() => setViews(false)}>
            {views_.map(([l, f]) => (
              <button key={l} onClick={() => { f(); setViews(false) }}>{l}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────────── acciones, zoom, selección, estado ───────────── */

export function BottomLeft() {
  const tray = useUI((s) => s.trayOpen)
  const view = useUI((s) => s.prefs.view)
  const arrow = useItems((s) => !!s.arrowMode)
  return (
    <div className="bl" data-hud data-nodrag>
      <button className="glass pill" onClick={() => ui({ searchOpen: true })}><Search size={16} /><span className="t">Buscar</span> <kbd>⌘K</kbd></button>
      <button className="glass pill" onClick={() => flyHome()}><CalIcon size={16} /><span className="t">Hoy</span> <kbd>T</kbd></button>
      <button className={`glass pill ${tray ? 'active' : ''}`} onClick={() => ui({ trayOpen: !tray })}><Inbox size={16} /><span className="t">Bandeja</span> <kbd>B</kbd></button>
      <button
        className={`glass pill ${view === 'grid' ? 'active' : ''}`}
        title={view === 'grid' ? 'Volver a mi vista personalizada (V)' : 'Ordenar en cuadrícula de calendario (V)'}
        aria-pressed={view === 'grid'}
        onClick={toggleView}
      >
        {view === 'grid' ? <Shapes size={16} /> : <LayoutGrid size={16} />}<span className="t">{view === 'grid' ? 'Mi vista' : 'Calendario'}</span> <kbd>V</kbd>
      </button>
      <AddMenu />
      <button className={`glass pill ${arrow ? 'active' : ''}`} onClick={() => useItems.setState({ arrowMode: arrow ? null : { from: null } })}><MoveUpRight size={16} /><span className="t">Flecha</span> <kbd>A</kbd></button>
    </div>
  )
}

export function BottomRight({ model }: { model: Model }) {
  const [pct, setPct] = useState(Math.round(cam.cam.s * 100))
  const [mini, setMini] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    return cam.subscribe(() => {
      if (t) return
      t = setTimeout(() => { t = undefined; setPct(Math.round(cam.cam.s * 100)) }, 80)
    })
  }, [])
  const zoomBtn = (f: number) => cam.zoomAt(cam.vw / 2, cam.vh / 2, f)
  return (
    <div className="br" data-hud data-nodrag>
      <AnimatePresence>{mini && <motion.div className="mini-wrap glass" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}><Minimap model={model} /></motion.div>}</AnimatePresence>
      <div className="zoom glass">
        <button className="icon" aria-label="Alejar" onClick={() => zoomBtn(1 / 1.5)}><Minus size={16} /></button>
        <button className="pct" onClick={() => cam.zoomAt(cam.vw / 2, cam.vh / 2, 1 / cam.cam.s)} aria-label="Zoom 100%">{pct}%</button>
        <button className="icon" aria-label="Acercar" onClick={() => zoomBtn(1.5)}><Plus size={16} /></button>
        <button className="icon" aria-label="Ver todo" title="Ver todo (0)" onClick={flyOverview}><Maximize2 size={15} /></button>
        <button className={`icon ${mini ? 'on' : ''}`} aria-label="Minimapa" onClick={() => setMini((v) => !v)}><MapIcon size={15} /></button>
      </div>
    </div>
  )
}

export function SelectionBar() {
  const sel = useUI((s) => s.selection)
  return (
    <AnimatePresence>
      {sel.length > 0 && (
        <motion.div className="selbar glass" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} data-hud data-nodrag>
          <b>{sel.length} {sel.length === 1 ? 'día seleccionado' : 'días seleccionados'}</b>
          <button onClick={() => flyToDays(sel)}>Enfocar <kbd>F</kbd></button>
          <button onClick={() => newEvent(sel[0], sel)}>Nuevo plan en todos</button>
          <button onClick={() => ui({ selection: [], selAnchor: null })}>Limpiar</button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConnBanner() {
  const conn = useUI((s) => s.conn)
  return (
    <AnimatePresence>
      {conn !== 'online' && (
        <motion.div className={`conn ${conn}`} initial={{ y: -40 }} animate={{ y: 0 }} exit={{ y: -40 }} data-hud>
          {conn === 'offline' ? <><WifiOff size={14} /> Sin conexión · reintentando…</> : <><Wifi size={14} /> Conectado</>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function FollowBorder() {
  const following = useUI((s) => s.following)
  const profiles = useData((s) => s.profiles)
  if (!following) return null
  return <div className="follow-border" style={{ borderColor: ownerColor(following, profiles) }} />
}

export function DragGhost() {
  const drag = useUI((s) => s.drag)
  const profiles = useData((s) => s.profiles)
  if (!drag) return null
  const col = ownerColor(drag.occ.owner, profiles)
  return (
    <div className="drag-ghost" style={{ left: drag.x, top: drag.y, ['--oc' as string]: col }}>
      <span className="stripe" style={{ background: col }} />
      <h1>{drag.occ.emoji} {drag.occ.title}</h1>
      {drag.dup && <small>Duplicar</small>}
    </div>
  )
}

export { Sun, cap, MONTHS, requestDelete }

/* ───────────── herramienta de flechas ───────────── */

const refOf = (t: HTMLElement): ElRef | null => {
  const card = t.closest('[data-card]') as HTMLElement | null
  if (card) return { k: 'card', id: card.dataset.card! }
  const day = t.closest('[data-day]') as HTMLElement | null
  if (day) return { k: 'day', id: day.dataset.day! }
  const month = t.closest('[data-month]') as HTMLElement | null
  if (month) return { k: 'month', id: month.dataset.month! }
  return null
}

export function ArrowTool() {
  const mode = useItems((s) => s.arrowMode)
  useEffect(() => {
    if (!mode) return
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hud]') || t.closest('.arrows')) return
      const ref = refOf(t)
      if (!ref) return
      e.preventDefault()
      e.stopPropagation()
      const cur = useItems.getState().arrowMode
      if (!cur?.from) useItems.setState({ arrowMode: { from: ref } })
      else if (!sameRef(cur.from, ref)) {
        createArrow(cur.from, ref)
        useItems.setState({ arrowMode: null })
        // el clic que cierra la flecha no debe abrir el plan de destino
        const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
        window.addEventListener('click', eat, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', eat, true), 600)
      }
    }
    const swallow = (e: Event) => {
      const t = e.target as HTMLElement
      if (t.closest('[data-hud]') || t.closest('.arrows')) return
      if (refOf(t)) { e.stopPropagation(); e.preventDefault() }
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('click', swallow, true)
    window.addEventListener('dblclick', swallow, true)
    document.body.classList.add('arrow-mode')
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('click', swallow, true)
      window.removeEventListener('dblclick', swallow, true)
      document.body.classList.remove('arrow-mode')
    }
  }, [mode])
  return (
    <AnimatePresence>
      {mode && (
        <motion.div className="arrow-banner glass" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} data-hud data-nodrag>
          <MoveUpRight size={16} />
          {mode.from ? 'Ahora tocá el elemento de destino' : 'Tocá el elemento de origen: un mes, un día o un plan'}
          <button onClick={() => useItems.setState({ arrowMode: null })}>Cancelar <kbd>Esc</kbd></button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}


/* ───────────── inspector de la derecha: planes + etiquetas de lo que se toca ───────────── */

const SWATCHES = ['#ff5c8a', '#4c8bf5', '#8b5cf6', '#22b8e6', '#2fb35a', '#f59e0b', '#ef4444', '#a3a3a3']

export function SelectionPanel({ model }: { model: Model }) {
  const sel = useUI((s) => s.selection)
  const show = useUI((s) => s.selPanel)
  const items = useItems((s) => s.items)
  const profiles = useData((s) => s.profiles)
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [color, setColor] = useState(SWATCHES[1])
  const meP = useData((s) => s.me)
  const [owner, setOwner] = useState<Owner | null>(null)
  const curOwner: Owner = owner ?? meP?.person ?? 'ambos'
  if (!sel.length) return null

  const sorted = [...sel].sort()
  const selSet = new Set(sorted)
  const title = sorted.length === 1 ? longDay(sorted[0]) : `${shortDate(sorted[0])} → ${shortDate(sorted[sorted.length - 1])}`
  const occs = model.allOccs
    .filter((o) => selSet.has(o.date))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : bySortOrder(a, b)))
  const marks = Object.values(items).filter((i) => i.kind === 'mark' && (i.data as MarkData).days.some((d) => selSet.has(d)))

  const apply = async () => {
    const l = label.trim()
    if (!l) return toast('Escribí una etiqueta, por ejemplo "Viaje a Buenos Aires"')
    await addMark({ days: sorted, label: l, color, note: note.trim() || undefined, owner: curOwner })
    setLabel('')
    setNote('')
    toast(`Etiqueta aplicada a ${sorted.length} ${sorted.length === 1 ? 'día' : 'días'}`)
  }
  const glow = (key: string) => {
    ui({ highlight: key })
    setTimeout(() => useUI.getState().highlight === key && ui({ highlight: null }), 2200)
  }
  let lastDay = ''

  return (
    <motion.div
      className="selpanel glass"
      style={{ top: ((document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 80) + 8) / (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-ed')) || 1) }}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      data-hud
      data-nodrag
      data-scroll
    >
      <div className="sp-head">
        <b>{sorted.length === 1 ? 'Día' : `${sorted.length} días`}</b>
        <span>{title}</span>
        <button className="icon" onClick={() => ui({ selPanel: !show })} aria-label={show ? 'Plegar' : 'Desplegar'}>
          <ChevronDown size={16} style={{ transform: show ? 'none' : 'rotate(180deg)' }} />
        </button>
        <button className="icon" onClick={() => (useUI.getState().focusDay ? exitFocus() : ui({ selection: [], selAnchor: null }))} aria-label="Cerrar"><X size={16} /></button>
      </div>

      {show && (
        <>
          <div className="sp-section">
            <label className="sp-lbl">Planes ({occs.length})</label>
            <div className="sp-plans">
              {occs.length === 0 && <div className="sp-empty">No hay planes en {sorted.length === 1 ? 'este día' : 'estos días'}.</div>}
              {occs.map((o) => {
                const head = sorted.length > 1 && o.date !== lastDay ? <div className="sp-day">{longDay(o.date)}</div> : null
                lastDay = o.date
                return (
                  <div key={o.key}>
                    {head}
                    {o.cover && <div className="plan-cover" style={{ backgroundImage: `url(${o.cover})`, backgroundPosition: o.cover_pos ? o.cover_pos.split(' ').map((n) => `${n}%`).join(' ') : undefined, ['--oc' as string]: ownerColor(o.owner, profiles) }} role="img" aria-label={`Portada de ${o.title}`} onClick={() => glow(o.key)} />}
                    <div className={`plan-row ${o.done ? 'done' : ''} ${o.cover ? 'has-cover' : ''}`} style={{ ['--oc' as string]: ownerColor(o.owner, profiles) }}>
                      <button className={`pchk ${o.done ? 'on' : ''}`} aria-label={o.done ? 'Marcar pendiente' : 'Marcar hecho'} onClick={() => void toggleDone(o)}>
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <span className="pt" title={o.title} onClick={() => glow(o.key)}>{o.emoji} {o.title}</span>
                      {!o.all_day && o.start_time && <small>{o.start_time.slice(0, 5)}</small>}
                      {o.recurring && <Repeat size={12} aria-label="Se repite" />}
                      <button className="icon" aria-label="Editar plan" onClick={() => ui({ editor: { eventId: o.event.id, occKey: o.key, day: o.date } })}><Pencil size={14} /></button>
                      <button className="icon" aria-label="Eliminar plan" onClick={() => void requestDelete(o)}><Trash2 size={14} /></button>
                    </div>
                    <AttachmentsFor occ={o} />
                  </div>
                )
              })}
            </div>
            <div className="sp-actions">
              <button onClick={() => newEvent(sorted[0], sorted.length > 1 ? sorted : undefined)}><CalendarPlus size={14} /> Nuevo plan</button>
              <button onClick={() => newEvent(sorted[0], undefined, { rrule: presetRule('weekly', sorted[0]) })}><Repeat size={14} /> Repetitivo</button>
            </div>
          </div>

          {marks.length > 0 && (
            <div className="sp-marks">
              <label className="sp-lbl"><Tag size={13} /> Etiquetas</label>
              {marks.map((m) => {
                const d = m.data as MarkData
                return (
                  <div key={m.id} className="mark-row" title={d.note}>
                    <select className="mk-owner" value={d.owner ?? 'ambos'} aria-label="Dueño de la etiqueta" onChange={(e) => void saveItem(m.id, 'mark', { ...d, owner: e.target.value as Owner })}>
                      {ownerKeys(profiles).map((o) => <option key={o} value={o}>{ownerName(o, profiles)}</option>)}
                    </select>
                    <input type="color" className="mk-col" value={d.color} aria-label="Color de la etiqueta" onChange={(e) => void saveItem(m.id, 'mark', { ...d, color: e.target.value })} />
                    <input
                      key={d.label}
                      defaultValue={d.label}
                      aria-label="Nombre de la etiqueta"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.label) void saveItem(m.id, 'mark', { ...d, label: v }) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    />
                    <small>{d.days.length}d</small>
                    <button
                      className="icon"
                      title="Quitar solo de los días tocados"
                      aria-label="Quitar de los días seleccionados"
                      onClick={() => {
                        const rest = d.days.filter((x) => !selSet.has(x))
                        if (rest.length) void saveItem(m.id, 'mark', { ...d, days: rest })
                        else void removeMark(m.id)
                      }}
                    ><Eraser size={14} /></button>
                    <button className="icon" title="Borrar la etiqueta completa" aria-label="Borrar etiqueta" onClick={() => void removeMark(m.id)}><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="sp-tag">
            <label className="sp-lbl"><Tag size={13} /> Nueva etiqueta para {sorted.length === 1 ? 'este día' : 'estos días'}</label>
            <OwnerPick value={curOwner} onChange={(o) => { setOwner(o); setColor(ownerColor(o, profiles)) }} />
            <input value={label} maxLength={60} placeholder="Ej: Viaje a Buenos Aires" onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void apply() }} aria-label="Etiqueta" />
            <div className="swatches" role="radiogroup" aria-label="Color">
              {SWATCHES.map((c) => (
                <button key={c} role="radio" aria-checked={color === c} className={color === c ? 'on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} />
              ))}
              <label className={`custom-color ${SWATCHES.includes(color) ? '' : 'on'}`} title="Otro color" style={{ background: SWATCHES.includes(color) ? undefined : color }}>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color personalizado" />
              </label>
            </div>
            <textarea value={note} rows={2} placeholder="Comentario (opcional)" onChange={(e) => setNote(e.target.value)} aria-label="Comentario" />
            <button className="primary apply" onClick={() => void apply()}>Aplicar a los días</button>
          </div>
        </>
      )}
    </motion.div>
  )
}


/** Selector segmentado de dueño: cada integrante · Todos · Externo. */
export function OwnerPick({ value, onChange }: { value: Owner; onChange: (o: Owner) => void }) {
  const profiles = useData((s) => s.profiles)
  return (
    <div className="seg owner-pick" role="radiogroup" aria-label="De quién">
      {ownerKeys(profiles).map((o) => (
        <button key={o} role="radio" aria-checked={value === o} className={value === o ? 'on' : ''} style={{ ['--oc' as string]: ownerColor(o, profiles) }} onClick={() => onChange(o)}>
          <i style={{ background: ownerColor(o, profiles) }} />{ownerName(o, profiles)}
        </button>
      ))}
    </div>
  )
}


/** Agregar al canvas sin teclado: foto/PDF (cámara o galería), nota de texto o link. */
export function AddMenu() {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    const c = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.add-menu,.add-pill')) setOpen(false) }
    window.addEventListener('pointerdown', c)
    return () => window.removeEventListener('pointerdown', c)
  }, [open])
  return (
    <div className="add-wrap">
      <button className={`glass pill add-pill ${open ? 'active' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Paperclip size={16} /><span className="t">Agregar</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="add-menu glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} role="menu" data-hud data-nodrag>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept="image/*,.heic,.heif,application/pdf,.pdf"
              onChange={(e) => {
                const fs = [...(e.target.files ?? [])]
                e.target.value = ''
                setOpen(false)
                if (fs.length) void ingestFiles(fs)
              }}
            />
            <button role="menuitem" onClick={() => fileRef.current?.click()}>Imagen o PDF…</button>
            <button role="menuitem" onClick={() => { addTextNote(); setOpen(false) }}>Nota de texto</button>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (link.trim()) void ingestText(link)
                setLink('')
                setOpen(false)
              }}
            >
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Pegá un link o video de YouTube" aria-label="Link" />
              <button type="submit">Agregar</button>
            </form>
            <small>También podés pegar con Ctrl/⌘ + V o arrastrar archivos al canvas.</small>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
