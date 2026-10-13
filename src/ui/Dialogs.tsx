import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { ui, useUI, type MenuItem } from '../store'

export function ScopeDialog() {
  const ask = useUI((s) => s.scopeAsk)
  const done = (v: 'one' | 'following' | 'all' | null) => {
    ask?.resolve(v)
    ui({ scopeAsk: null })
  }
  useEffect(() => {
    if (!ask) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(null) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })
  return (
    <AnimatePresence>
      {ask && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={() => done(null)} />
          <motion.div className="dialog glass" initial={{ scale: 0.96 }} animate={{ scale: 1 }} role="dialog" aria-label={ask.verb}>
            <h3>{ask.verb}: es un plan repetitivo</h3>
            <p>¿A cuáles afecta?</p>
            <div className="stack">
              {!ask.noOne && <button onClick={() => done('one')}>Solo este</button>}
              <button onClick={() => done('following')}>Este y los siguientes</button>
              <button onClick={() => done('all')}>Todos</button>
              <button className="ghost" onClick={() => done(null)}>Cancelar</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog() {
  const c = useUI((s) => s.confirm)
  const done = (b: boolean) => { c?.resolve(b); ui({ confirm: null }) }
  useEffect(() => {
    if (!c) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(false) } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  })
  return (
    <AnimatePresence>
      {c && (
        <motion.div className="modal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-hud data-nodrag>
          <div className="scrim solid" onClick={() => done(false)} />
          <motion.div className="dialog glass" initial={{ scale: 0.96 }} animate={{ scale: 1 }} role="alertdialog">
            <h3>{c.text}</h3>
            <div className="row">
              <button className="ghost" onClick={() => done(false)}>Volver</button>
              <button className="primary" onClick={() => done(true)}>{c.ok}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ContextMenu() {
  const menu = useUI((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<number | null>(null)

  useEffect(() => {
    if (!menu) return
    setOpenSub(null)
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) ui({ menu: null })
    }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); ui({ menu: null }) } }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', k, true)
    window.addEventListener('wheel', () => ui({ menu: null }), { once: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', k, true)
    }
  }, [menu])

  if (!menu) return null
  const x = Math.min(menu.x, window.innerWidth - 200)
  const y = Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 12)
  const run = (it: MenuItem) => {
    ui({ menu: null })
    it.onClick?.()
  }
  return (
    <motion.div
      ref={ref}
      className="ctx glass"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.14 }}
      role="menu"
      data-hud
      data-nodrag
    >
      {menu.items.map((it, i) =>
        it.sep ? (
          <hr key={i} />
        ) : (
          <div key={i} className="ctx-item-wrap" onMouseEnter={() => setOpenSub(it.sub ? i : null)}>
            <button role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => !it.sub && run(it)}>
              {it.label}
              {it.sub && <ChevronRight size={14} />}
            </button>
            {it.sub && openSub === i && (
              <div className="ctx sub glass" role="menu">
                {it.sub.map((s, j) => (
                  <button key={j} role="menuitem" onClick={() => run(s)}>{s.label}</button>
                ))}
              </div>
            )}
          </div>
        ),
      )}
    </motion.div>
  )
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite" data-hud>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast glass"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            layout
          >
            {t.text}
            {t.action && (
              <button
                onClick={() => {
                  t.action!.fn()
                  useUI.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }))
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
