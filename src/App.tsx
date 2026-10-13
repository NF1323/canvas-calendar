import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { Canvas } from './canvas/Canvas'
import { cam } from './canvas/camera'
import { input } from './canvas/input'
import { World } from './calendar/World'
import { model, useModel } from './calendar/model'
import { resetMeasureCache } from './calendar/layout'
import { Editor } from './events/Editor'
import { Login } from './ui/Login'
import {
  ArrowTool, BottomLeft, BottomRight, ConnBanner, DragGhost, FilterBar, FollowBorder, LocationBar, Presence, SelectionPanel,
} from './ui/Hud'
import { HelpOverlay, SearchPalette, SettingsDialog, Tray } from './ui/Panels'
import { ConfirmDialog, ContextMenu, ScopeDialog, Toasts } from './ui/Dialogs'
import { newEvent, openCardMenu, openDayMenu, openEmptyMenu } from './ui/menus'
import { RemoteCursor, useBroadcasts } from './realtime/Cursors'
import { reloadAll, startRealtime } from './realtime/net'
import { DEMO_FLAG, seedDemo } from './lib/demo'
import { getSession, signOut } from './lib/api'
import { dataActions, ownerKeys, setFilter, shows, toast, ui, useData, useUI } from './store'
import { redo, undo } from './actions'
import { removeItem, useItems } from './canvasItems'
import { toggleView } from './canvas/view'
import { exitFocus, safeInsets, flyHome, flyOverview, flyToDays, focusStep } from './canvas/nav'
import { fitCamOverview } from './canvas/intro'
import { todayStr } from './lib/dates'
import { ingestFiles, ingestText, trackPointer } from './objects/ingest'
import { setHolidays as setHolidayStore } from './lib/holidays'
import { YoutubeAsk } from './objects/Objects'
import { AttachmentViewer } from './objects/Attachments'

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.error('UI error', err) }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="login">
        <div className="login-card glass">
          <h1>Algo se rompió</h1>
          <p>Tus datos están a salvo. Recargá para seguir.</p>
          <button className="primary" onClick={() => location.reload()}>Recargar</button>
        </div>
      </div>
    )
  }
}

function Workspace() {
  const me = useData((s) => s.me)!
  const prefs = useUI((s) => s.prefs)
  const editor = useUI((s) => s.editor)
  const focusDay = useUI((s) => s.focusDay)
  const ready = useData((s) => s.ready)
  const [, bump] = useState(0)
  const [mpr, setMpr] = useState(() => (window.innerWidth < 640 ? 1 : 4))
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const m = useModel(mpr)
  const intro = useRef<'pending' | 'done'>('pending')

  /* datos + tiempo real */
  useEffect(() => {
    let alive = true
    const load = (tries = 0) =>
      reloadAll().then(async () => {
        if (localStorage.getItem(DEMO_FLAG) && Object.keys(useData.getState().events).length === 0) await seedDemo()
        localStorage.removeItem(DEMO_FLAG)
      }).catch((e) => {
        console.error(e)
        if (!alive) return
        if (tries === 0) toast('No se pudieron cargar los datos. Reintentando…')
        setTimeout(() => alive && load(tries + 1), Math.min(30000, 3000 * (tries + 1)))
      })
    void load()
    const stop = startRealtime(me)
    return () => { alive = false; stop() }
  }, [me])
  useBroadcasts()

  /* escala de la interfaz: el zoom del navegador no cambia el tamaño "físico" de los controles.
     Al 100 % (ventana ~1920 px) los controles chicos (filtros, barras) quedan más compactos;
     al alejar el zoom (más px CSS de ancho) los paneles grandes (editor, panel derecho, diálogos) crecen para seguir legibles. */
  useEffect(() => {
    const apply = () => {
      const w = window.innerWidth
      const hud = w < 900 ? 1 : Math.min(1, Math.max(0.7, (0.7 * w) / 1920))
      const ed = w < 900 ? 1 : Math.min(1.8, Math.max(1, w / 1920))
      const r = document.documentElement.style
      r.setProperty('--ui-hud', hud.toFixed(3))
      r.setProperty('--ui-ed', ed.toFixed(3))
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [])

  /* tema, movimiento reducido */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = prefs.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : prefs.theme
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs.theme])
  const reduce = prefs.reduceMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    cam.reduce = reduce
    document.documentElement.classList.toggle('reduce', reduce)
  }, [reduce])

  /* fuentes → re-medir alturas */
  useEffect(() => {
    void document.fonts?.ready.then(() => { resetMeasureCache(); bump((v) => v + 1) })
  }, [])

  /* resize → islas por fila */
  useEffect(() => {
    const f = () => setMpr(window.innerWidth < 640 ? 1 : 4)
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])

  /* la ventana avanza sola */
  useEffect(() => {
    const check = () => {
      const t = todayStr()
      if (t !== useData.getState().today) useData.setState({ today: t })
    }
    const iv = setInterval(check, 60000)
    document.addEventListener('visibilitychange', check)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', check) }
  }, [])

  /* feriados */
  useEffect(() => {
    const years = [...new Set([m.winStart.slice(0, 4), m.winEnd.slice(0, 4)])]
    void Promise.all(
      years.map((y) => fetch(`/feriados/${y}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))),
    ).then((rs) => {
      const map = Object.assign({}, ...rs)
      setHolidays(map)
      setHolidayStore(map, m.winStart, m.winEnd)
    })
  }, [m.winStart, m.winEnd])

  /* límites de cámara + intro */
  useEffect(() => {
    cam.setBounds(m.layout.bounds)
  }, [m.layout.bounds.w, m.layout.bounds.h])
  useEffect(() => {
    fitCamOverview()
    let skipped = false
    const skip = () => { skipped = true }
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('wheel', skip, { once: true })
    window.addEventListener('keydown', skip, { once: true })
    const t = setTimeout(() => { if (!skipped) flyHome(900, false) }, 300)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => { ui({ lod: useUI.getState().lod }) }, [])

  /* modo foco: re-encuadrar si el día crece */
  const fh = focusDay ? m.layout.dayRects[focusDay]?.h : 0
  useEffect(() => {
    if (!focusDay) return
    const r = m.layout.dayRects[focusDay]
    if (r && !cam.moving) cam.flyTo(cam.fitCam(r, 48, 3, safeInsets()), { duration: 300, push: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fh])

  /* pegar / soltar: imágenes, PDF, textos, links y videos de YouTube */
  useEffect(() => {
    const stop = trackPointer()
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest?.('input,textarea,select,[contenteditable="true"]')) return
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.length) {
        e.preventDefault()
        void ingestFiles(files)
        return
      }
      const text = e.clipboardData?.getData('text/plain')
      if (text?.trim()) {
        e.preventDefault()
        void ingestText(text)
      }
    }
    const onOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])]
      if (!files.length) return
      e.preventDefault()
      void ingestFiles(files, cam.screenToWorld(e.clientX, e.clientY))
    }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      stop()
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  /* teclado */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = !!t.closest?.('input,textarea,select,[contenteditable="true"]')
      const mod = e.ctrlKey || e.metaKey
      const st = useUI.getState()
      if (e.code === 'Space' && !typing) { input.space = true; if (!st.editor) e.preventDefault() }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); ui({ searchOpen: true }); return }
      if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); void (e.shiftKey ? redo() : undo()); return }
      if (e.key === 'Escape') {
        if (st.searchOpen) return ui({ searchOpen: false })
        if (st.helpOpen) return ui({ helpOpen: false })
        if (st.settingsOpen) return ui({ settingsOpen: false })
        if (st.menu) return ui({ menu: null })
        if (st.rangePick) return ui({ rangePick: null })
        if (useItems.getState().arrowMode) return useItems.setState({ arrowMode: null })
        if (useItems.getState().arrowSel) return useItems.setState({ arrowSel: null })
        if (st.editor) return ui({ editor: null })
        if (st.focusDay) return exitFocus()
        if (st.selection.length) return ui({ selection: [], selAnchor: null })
        if (st.following) return ui({ following: null })
        cam.back()
        return
      }
      if (e.altKey && /^Digit[0-9]$/.test(e.code)) {
        e.preventDefault()
        const f = st.filter
        const k = e.code.slice(5)
        if (k === '0') setFilter({})
        else {
          const key = ownerKeys(useData.getState().profiles)[+k - 1]
          if (key) setFilter({ ...f, [key]: !shows(f, key) })
        }
        return
      }
      if (typing || mod || e.altKey || st.editor) return
      switch (e.key) {
        case 'n': case 'N': {
          e.preventDefault()
          const sel = st.selection
          newEvent(st.focusDay ?? sel[0] ?? useData.getState().today, sel.length > 1 ? sel : undefined)
          break
        }
        case 't': case 'T': flyHome(); break
        case '0': flyOverview(); break
        case 'f': case 'F': if (st.selection.length) flyToDays(st.selection); break
        case 'a': case 'A': useItems.setState((s) => ({ arrowMode: s.arrowMode ? null : { from: null } })); break
        case 'Delete': case 'Backspace': { const id = useItems.getState().arrowSel; if (id) void removeItem(id); break }
        case 'v': case 'V': toggleView(); break
        case 'b': case 'B': ui({ trayOpen: !st.trayOpen }); break
        case '?': ui({ helpOpen: true }); break
        case 'ArrowLeft': if (st.focusDay) { e.preventDefault(); focusStep(-1) } break
        case 'ArrowRight': if (st.focusDay) { e.preventDefault(); focusStep(1) } break
        case 'ArrowUp': if (st.focusDay) { e.preventDefault(); focusStep(-7) } break
        case 'ArrowDown': if (st.focusDay) { e.preventDefault(); focusStep(7) } break
      }
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') input.space = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const onContext = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-hud]')) return
    e.preventDefault()
    const arrow = (t.closest('[data-arrow]') as SVGElement | null)?.getAttribute('data-arrow')
    if (arrow) return ui({ menu: { x: e.clientX, y: e.clientY, items: [{ label: 'Eliminar flecha', danger: true, onClick: () => void removeItem(arrow) }] } })
    const card = t.closest('[data-card]') as HTMLElement | null
    if (card) {
      const occ = model.current?.allOccs.find((o) => o.key === card.dataset.card)
      if (occ) return openCardMenu(e.clientX, e.clientY, occ)
    }
    const day = (t.closest('[data-day]') as HTMLElement | null)?.dataset.day
    if (day) return openDayMenu(e.clientX, e.clientY, day)
    openEmptyMenu(e.clientX, e.clientY)
  }

  const onClick = (e: React.MouseEvent) => {
    const st = useUI.getState()
    if (input.dragged) return
    if (st.focusDay && !(e.target as HTMLElement).closest('[data-day],[data-hud]')) exitFocus()
    if (useItems.getState().arrowSel && !(e.target as HTMLElement).closest('.arrows')) useItems.setState({ arrowSel: null })
  }

  return (
    <div className={`app ${focusDay ? 'focus' : ''}`} onContextMenu={onContext} onClick={onClick}>
      <Canvas>
        <World model={m} holidays={holidays} instant={reduce} />
      </Canvas>
      {!ready && <div className="loading glass" data-hud>Cargando…</div>}
      <div className="topbar">
        <Presence />
        <LocationBar model={m} />
        <FilterBar model={m} />
      </div>
      <BottomLeft />
      <BottomRight model={m} />
      <ArrowTool />
      <Tray model={m} />
      <SelectionPanel model={m} />
      <RemoteCursor />
      <DragGhost />
      {editor && <Editor key={`${editor.eventId ?? 'new'}|${editor.occKey ?? ''}|${editor.day ?? ''}`} />}
      <ContextMenu />
      <YoutubeAsk />
      <AttachmentViewer />
      <ScopeDialog />
      <ConfirmDialog />
      <SearchPalette model={m} />
      <HelpOverlay />
      <SettingsDialog />
      <Toasts />
      <ConnBanner />
      <FollowBorder />
    </div>
  )
}

export default function App() {
  const me = useData((s) => s.me)
  const [phase, setPhase] = useState<'boot' | 'login' | 'denied'>('boot')

  const boot = async () => {
    const r = await getSession()
    if (r.kind === 'ok') {
      useData.setState({ me: r.me, profiles: r.profiles })
    } else if (r.kind === 'noaccess') {
      await signOut()
      setPhase('denied')
    } else setPhase('login')
  }
  useEffect(() => { void boot() }, [])
  useEffect(() => { if (!me) dataActions.replaceAll([], []) }, [me])
  useEffect(() => { if (!me && phase === 'boot') return; if (!me && phase !== 'denied') setPhase('login') }, [me, phase])

  if (!me) {
    if (phase === 'boot') return <div className="boot" />
    return <Login onDone={() => void boot()} denied={phase === 'denied'} />
  }
  return (
    <ErrorBoundary>
      <Workspace />
    </ErrorBoundary>
  )
}
