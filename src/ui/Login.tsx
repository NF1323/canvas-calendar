import { useState } from 'react'
import { motion } from 'framer-motion'
import { isLocal } from '../lib/supabase'
import { joinGroup, localJoin, LOCAL_PROFILES, localSignIn, signIn } from '../lib/api'

const COLORS = ['#4C8BF5', '#FF5C8A', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#EAB308']

export function Login({ onDone, denied }: { onDone: () => void; denied: boolean }) {
  const [mode, setMode] = useState<'login' | 'join'>('login')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('invite') ?? '')
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const r = mode === 'login' ? await signIn(email.trim(), pass) : await joinGroup({ email: email.trim(), password: pass, code, name, color })
    setBusy(false)
    if (r) setErr(r)
    else onDone()
  }

  const join = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    localJoin(name, color)
    onDone()
  }

  return (
    <div className="login">
      <div className="login-bg" aria-hidden>
        {[0, 1, 2].map((i) => <i key={i} style={{ ['--i' as string]: i }} />)}
      </div>
      <motion.div className="login-card glass" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1>Canvas Calendar</h1>
        <p>Un calendario compartido sobre un canvas infinito, para tu grupo.</p>
        {denied && <div className="err">Esta cuenta todavía no es parte del grupo. Unite con el código de invitación.</div>}
        {isLocal ? (
          <div className="local">
            <small>Modo demo (sin servidor). Los datos viven en este navegador; abrí varias pestañas, cada una como una persona distinta, para ver el tiempo real.</small>
            <button className="primary demo-btn" onClick={() => { localStorage.setItem('cc_demo_pending', '1'); localSignIn('alex'); onDone() }}>Explorar con datos de ejemplo</button>
            <div className="who">
              {LOCAL_PROFILES.map((p) => (
                <button key={p.person} style={{ ['--oc' as string]: p.color }} onClick={() => { localSignIn(p.person); onDone() }}>
                  <span className="avatar" style={{ background: p.color }}>{p.display_name[0]}</span>
                  Entrar como {p.display_name}
                </button>
              ))}
            </div>
            <form className="join-local" onSubmit={join}>
              <small>¿Otra persona? Sumala al grupo (sin límite de integrantes):</small>
              <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" />
              <div className="swatches">
                {COLORS.map((c) => <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setColor(c)} />)}
              </div>
              <button className="primary" disabled={!name.trim()}>Unirme al grupo</button>
            </form>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="seg login-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Entrar</button>
              <button type="button" role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'on' : ''} onClick={() => setMode('join')}>Unirme con código</button>
            </div>
            {mode === 'join' && (
              <>
                <label>Código de invitación<input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="off" /></label>
                <label>Tu nombre<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} required autoComplete="nickname" /></label>
                <div className="swatches" aria-label="Tu color">
                  {COLORS.map((c) => <button type="button" key={c} className={color === c ? 'on' : ''} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => setColor(c)} />)}
                </div>
              </>
            )}
            <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode === 'login'} /></label>
            <label>Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} value={pass} onChange={(e) => setPass(e.target.value)} required /></label>
            {err && <div className="err" role="alert">{err}</div>}
            <button className="primary" disabled={busy}>{busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Unirme al grupo'}</button>
          </form>
        )}
      </motion.div>
    </div>
  )
}
