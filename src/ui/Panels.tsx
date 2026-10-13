import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X, Search as SearchIcon, CornerDownLeft } from 'lucide-react'
import type { Model } from '../calendar/model'
import { ownerColor, ownerName, setPrefs, toast, ui, useData, useUI } from '../store'
import { saveProfile } from '../profile'
import { getInviteCode, regenerateInviteCode } from '../lib/api'
import { fileToAvatar } from '../lib/image'
import { beginCardDrag } from '../canvas/drag'
import { eventToOcc, softDelete } from '../actions'
import { input } from '../canvas/input'
import { shortDate, longDay, MONTHS, cap, parse, fmt } from '../lib/dates'
import { flyHome, flyOverview, flyToDay, flyToMonth } from '../canvas/nav'
import { newEvent, openCardMenu } from './menus'
import { Markdown } from '../events/Markdown'

/* ───────────── Bandeja "Algún día" ───────────── */

export function Tray({ model }: { model: Model }) {
  const open = useUI((s) => s.trayOpen)
  const drag = useUI((s) => s.drag)
  const profiles = useData((s) => s.profiles)
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className={`tray ${drag?.overTray ? 'over' : ''}`}
          initial={{ x: 380 }}
          animate={{ x: 0 }}
          exit={{ x: 380 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          data-tray
          data-hud
          data-nodrag
          data-scroll
          aria-label="Bandeja Algún día"
        >
          <header>
            <h2>Bandeja <small>"Algún día"</small></h2>
            <button className="icon" aria-label="Cerrar" onClick={() => ui({ trayOpen: false })}><X size={16} /></button>
          </header>
          <p className="hint">Planes sin fecha. Arrastralos al calendario para agendarlos, o desde el calendario hasta acá para desagendar.</p>
          <button className="new-note" onClick={() => newEvent(null, undefined, { canvas_x: null, canvas_y: null })}><Plus size={15} /> Nuevo plan en la bandeja</button>
          <div className="notes">
            <AnimatePresence initial={false}>
              {model.tray.map((e, i) => {
                const occ = eventToOcc(e)
                return (
                  <motion.div
                    key={e.id}
                    className="note"
                    style={{ ['--oc' as string]: ownerColor(e.owner, profiles), rotate: (i % 3) - 1 }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onPointerDown={(ev) => { if (!(ev.target as HTMLElement).closest('button')) beginCardDrag(ev, occ) }}
                    onClick={() => { if (!input.dragged) ui({ editor: { eventId: e.id, day: null } }) }}
                    onContextMenu={(ev) => { ev.preventDefault(); openCardMenu(ev.clientX, ev.clientY, occ) }}
                  >
                    <span className="who" style={{ background: ownerColor(e.owner, profiles) }} title={ownerName(e.owner)} />
                    {e.cover && <div className="note-cover" style={{ backgroundImage: `url(${e.cover})`, backgroundPosition: e.cover_pos ? e.cover_pos.split(' ').map((n) => `${n}%`).join(' ') : undefined }} />}
                    <h3>{e.emoji} {e.title}</h3>
                    {e.description_md && <Markdown text={e.description_md} />}
                    <div className="note-btns">
                      <button onClick={() => ui({ editor: { eventId: e.id, day: null } })}>Editar</button>
                      <button onClick={() => { if (!input.dragged) void softDelete(e.id) }}>Borrar</button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            {!model.tray.length && <p className="empty">Nada por acá. Doble clic en un plan para editarlo.</p>}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

/* ───────────── Buscar / paleta de comandos ───────────── */

interface Hit { id: string; title: string; sub: string; color: string; run: () => void }

export function SearchPalette({ model }: { model: Model }) {
  const open = useUI((s) => s.searchOpen)
  const profiles = useData((s) => s.profiles)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => ref.current?.focus(), 30) } }, [open])

  const hits: Hit[] = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out: Hit[] = []
    const close = () => ui({ searchOpen: false })
    const goDay = (d: string, key?: string) => {
      close()
      flyToDay(d)
      if (key) {
        ui({ highlight: key })
        setTimeout(() => ui({ highlight: null }), 2200)
      }
    }
    if (!s) {
      out.push({ id: 'c-hoy', title: 'Ir a hoy', sub: 'Comando', color: '#8A8379', run: () => { close(); flyHome() } })
      out.push({ id: 'c-all', title: 'Vista general', sub: 'Comando', color: '#8A8379', run: () => { close(); flyOverview() } })
      return out
    }
    if ('hoy'.startsWith(s)) out.push({ id: 'c-hoy', title: 'Ir a hoy', sub: 'Comando', color: '#8A8379', run: () => { close(); flyHome() } })
    if ('vista general'.startsWith(s) || s === 'todo') out.push({ id: 'c-all', title: 'Vista general', sub: 'Comando', color: '#8A8379', run: () => { close(); flyOverview() } })
    const dm = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
    if (dm) {
      const now = new Date()
      let y = dm[3] ? +dm[3] : now.getFullYear()
      if (y < 100) y += 2000
      let d = new Date(y, +dm[2] - 1, +dm[1])
      if (!dm[3] && fmt(d) < model.winStart) d = new Date(y + 1, +dm[2] - 1, +dm[1])
      const ds = fmt(d)
      if (model.layout.dayRects[ds]) out.push({ id: 'c-d', title: longDay(ds), sub: 'Ir a la fecha', color: '#8A8379', run: () => goDay(ds) })
    }
    const mm = s.replace(/^ir a\s+/, '')
    MONTHS.forEach((m, idx) => {
      if (m.startsWith(mm) && mm.length >= 3) {
        const cand = model.layout.months.find((x) => +x.key.slice(5) === idx + 1)
        if (cand) out.push({ id: 'm' + cand.key, title: `Ir a ${m}`, sub: cand.key.slice(0, 4), color: '#8A8379', run: () => { close(); flyToMonth(cand.key) } })
      }
    })
    const seen = new Set<string>()
    const all = [
      ...model.allOccs.map((o) => ({ o, e: o.event, date: o.date, title: o.title, desc: o.description_md ?? '', owner: o.owner, key: o.key })),
      ...useData.getState().events && Object.values(useData.getState().events)
        .filter((e) => !e.start_date && !e.deleted_at)
        .map((e) => ({ o: null, e, date: '', title: e.title, desc: e.description_md ?? '', owner: e.owner, key: e.id })),
    ]
    for (const x of all) {
      if (!(x.title.toLowerCase().includes(s) || x.desc.toLowerCase().includes(s))) continue
      const k = x.e.id + (x.o?.recurring ? '' : x.date)
      if (seen.has(k)) continue
      seen.add(k)
      out.push({
        id: x.key,
        title: x.title,
        sub: `${x.date ? shortDate(x.date) : 'Bandeja'} · ${ownerName(x.owner)}`,
        color: ownerColor(x.owner, profiles),
        run: () => (x.date ? goDay(x.date, x.key) : (ui({ searchOpen: false, trayOpen: true })), undefined),
      })
      if (out.length > 30) break
    }
    return out
  }, [q, model, profiles])

  const go = (h?: Hit) => h?.run()

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-wrap top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={() => ui({ searchOpen: false })} />
          <motion.div className="palette glass" initial={{ y: -10, scale: 0.97 }} animate={{ y: 0, scale: 1 }} role="dialog" aria-label="Buscar">
            <div className="p-in">
              <SearchIcon size={16} />
              <input
                ref={ref}
                value={q}
                placeholder="Buscar planes, 'ir a diciembre', 'hoy', '24/12'…"
                onChange={(e) => { setQ(e.target.value); setI(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(hits.length - 1, v + 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)) }
                  if (e.key === 'Enter') go(hits[i])
                  if (e.key === 'Escape') { e.stopPropagation(); ui({ searchOpen: false }) }
                }}
                aria-label="Buscar"
              />
              <kbd>esc</kbd>
            </div>
            <ul role="listbox" data-scroll>
              {hits.map((h, idx) => (
                <li key={h.id + idx} role="option" aria-selected={idx === i} className={idx === i ? 'on' : ''} onMouseEnter={() => setI(idx)} onClick={() => go(h)}>
                  <i style={{ background: h.color }} />
                  <span>{h.title}</span>
                  <small>{h.sub}</small>
                  {idx === i && <CornerDownLeft size={13} />}
                </li>
              ))}
              {!hits.length && <li className="none">Sin resultados</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ───────────── Ayuda y ajustes ───────────── */

const KEYS: [string, [string, string][]][] = [
  ['Navegación', [
    ['Arrastrar · Espacio + arrastrar', 'Paneo'], ['Rueda / pinch', 'Zoom (en el cursor)'], ['T', 'Ir a hoy'], ['0', 'Vista general'],
    ['Esc', 'Volver / salir de foco'], ['← → ↑ ↓', 'Día / semana adyacente (en foco)'], ['Ctrl/⌘ + K', 'Buscar'],
  ]],
  ['Planes', [
    ['Doble clic · N', 'Nuevo plan'], ['Ctrl/⌘ + Enter', 'Guardar'], ['1 2 3 4 (editor)', 'Dueño'], ['Alt + arrastrar', 'Duplicar'],
    ['Ctrl/⌘ + Z · + Shift', 'Deshacer / rehacer'], ['B', 'Bandeja'], ['V', 'Calendario ↔ mi vista'],
  ]],
  ['Selección', [
    ['Arrastrar en vacío', 'Cuadro de selección de días'], ['Ctrl + arrastrar', 'Sumar al cuadro'], ['Arrastrar un día elegido', 'Mueve todos los elegidos'], ['Espacio + arrastrar', 'Mover el canvas'], ['Shift + clic', 'Rango / sumar / restar'], ['F', 'Enfocar selección'],
  ]],
  ['Filtro', [
    ['Alt + 1 … 9', 'Mostrar / ocultar a cada integrante, Todos y Externo'], ['Alt + 0', 'Mostrar todo'], ['Alt + clic en chip', 'Solo ese'],
  ]],
]

export function HelpOverlay() {
  const open = useUI((s) => s.helpOpen)
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={() => ui({ helpOpen: false })} />
          <motion.div className="dialog help glass" initial={{ scale: 0.96 }} animate={{ scale: 1 }} role="dialog" aria-label="Atajos" data-scroll>
            <div className="dh"><h3>Atajos de teclado</h3><button className="icon" onClick={() => ui({ helpOpen: false })} aria-label="Cerrar"><X size={16} /></button></div>
            <div className="grid">
              {KEYS.map(([g, rows]) => (
                <section key={g}>
                  <h4>{g}</h4>
                  {rows.map(([k, d]) => (<div key={k} className="kr"><kbd>{k}</kbd><span>{d}</span></div>))}
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Solo admins en modo servidor: link y código para invitar gente al grupo. */
function InviteBox() {
  const me = useData((s) => s.me)!
  const [code, setCode] = useState<string | null>(null)
  useEffect(() => { if (me.is_admin) void getInviteCode().then(setCode) }, [me.is_admin])
  if (!me.is_admin || !code) return null
  const link = `${location.origin}/?invite=${code}`
  return (
    <div className="invite-box">
      <b>Invitar al grupo</b>
      <small>Cualquiera con este link puede crear su cuenta y sumarse. Regenerá el código para invalidar el anterior.</small>
      <div className="invite-row">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de invitación" />
        <button onClick={() => { void navigator.clipboard?.writeText(link); toast('Link copiado') }}>Copiar</button>
        <button onClick={async () => { const c = await regenerateInviteCode(); if (c) { setCode(c); toast('Código nuevo generado') } }}>Regenerar</button>
      </div>
    </div>
  )
}

const PROFILE_COLORS = ['#ff5c8a', '#4c8bf5', '#8b5cf6', '#22b8e6', '#2fb35a', '#f59e0b', '#ef4444', '#e879f9']

function ProfileEditor() {
  const me = useData((s) => s.me)!
  const [name, setName] = useState(me.display_name)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pick = async (f?: File | null) => {
    if (!f) return
    setBusy(true)
    try {
      await saveProfile({ avatar: await fileToAvatar(f) })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo usar esa imagen')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  return (
    <div className="profile-ed">
      <div className="pe-top">
        <div className="pe-av" style={{ background: me.color }}>
          {me.avatar ? <img src={me.avatar} alt="Tu foto" /> : me.display_name[0]}
        </div>
        <div className="pe-btns">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <button className="primary" disabled={busy} onClick={() => fileRef.current?.click()}>{me.avatar ? 'Cambiar foto' : 'Elegir foto'}</button>
          {me.avatar && <button onClick={() => void saveProfile({ avatar: null })}>Quitar</button>}
        </div>
      </div>
      <label className="pe-field">Nombre visible
        <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={() => { const v = name.trim(); if (v && v !== me.display_name) void saveProfile({ display_name: v }); else setName(me.display_name) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </label>
      <div className="pe-field">Color
        <div className="swatches">
          {PROFILE_COLORS.map((c) => (
            <button key={c} className={me.color === c ? 'on' : ''} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => void saveProfile({ color: c })} />
          ))}
          <label className="custom-color" title="Otro color"><input type="color" value={me.color} onChange={(e) => void saveProfile({ color: e.target.value })} aria-label="Color personalizado" /></label>
        </div>
      </div>
    </div>
  )
}

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen)
  const prefs = useUI((s) => s.prefs)
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={() => ui({ settingsOpen: false })} />
          <motion.div className="dialog glass" initial={{ scale: 0.96 }} animate={{ scale: 1 }} role="dialog" aria-label="Ajustes">
            <div className="dh"><h3>Ajustes</h3><button className="icon" onClick={() => ui({ settingsOpen: false })} aria-label="Cerrar"><X size={16} /></button></div>
            <ProfileEditor />
            <InviteBox />
            <div className="set-row"><span>Tema</span>
              <div className="seg">
                {(['light', 'dark', 'auto'] as const).map((t) => (
                  <button key={t} className={prefs.theme === t ? 'on' : ''} onClick={() => setPrefs({ theme: t })}>{t === 'light' ? 'Claro' : t === 'dark' ? 'Oscuro' : 'Automático'}</button>
                ))}
              </div>
            </div>
            <div className="set-row"><span>La rueda…</span>
              <div className="seg">
                <button className={prefs.wheel === 'zoom' ? 'on' : ''} onClick={() => setPrefs({ wheel: 'zoom' })}>hace zoom</button>
                <button className={prefs.wheel === 'pan' ? 'on' : ''} onClick={() => setPrefs({ wheel: 'pan' })}>desplaza</button>
              </div>
            </div>
            <div className="set-row"><span>Arrastrar en vacío</span>
              <div className="seg">
                <button className={prefs.dragEmpty === 'select' ? 'on' : ''} onClick={() => setPrefs({ dragEmpty: 'select' })}>selecciona</button>
                <button className={prefs.dragEmpty === 'pan' ? 'on' : ''} onClick={() => setPrefs({ dragEmpty: 'pan' })}>mueve</button>
              </div>
            </div>
            <label className="set-row"><span>Reducir animaciones</span><label className="switch"><input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /><span /></label></label>
            <label className="set-row"><span>Mostrar feriados</span><label className="switch"><input type="checkbox" checked={prefs.holidays} onChange={(e) => setPrefs({ holidays: e.target.checked })} /><span /></label></label>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export { cap, parse }
