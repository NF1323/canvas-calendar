import { useEffect, useRef, useState } from 'react'
import { loadSymbols, type SymSection } from './symbols'

interface Item { e: string; l: string; t: string }
const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
interface Section { key: string; name: string; icon: string; list: Item[]; wide?: boolean }

let loading: Promise<{ sections: Section[]; base: Set<number> }> | null = null
let loadingSyms: Promise<SymSection[]> | null = null

/** Carga TODOS los emojis de Unicode (con sus variantes de tono de piel) la primera vez que se abre el selector. */
function loadAll(): Promise<{ sections: Section[]; base: Set<number> }> {
  loading ??= Promise.all([import('emojibase-data/es/data.json'), import('emojibase-data/es/messages.json')]).then(([d, m]) => {
    const data = (d.default as unknown) as { emoji: string; label: string; tags?: string[]; group?: number; order?: number; skins?: { emoji: string; label: string }[] }[]
    const groups = ((m.default as unknown) as { groups: { key: string; message: string; order: number }[] }).groups
    const base = new Set<number>(data.map((x) => x.emoji.codePointAt(0)!))
    const sections = groups
      .map((g) => {
        const list: Item[] = []
        data
          .filter((x) => x.group === g.order)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .forEach((x) => {
            const t = norm(`${x.label} ${(x.tags ?? []).join(' ')}`)
            list.push({ e: x.emoji, l: x.label, t })
            x.skins?.forEach((s) => list.push({ e: s.emoji, l: s.label, t: norm(`${s.label} ${(x.tags ?? []).join(' ')}`) }))
          })
        const name = g.message.charAt(0).toUpperCase() + g.message.slice(1)
        return { key: g.key, name, icon: list[0]?.e ?? '•', list }
      })
      .filter((s) => s.list.length)
    return { sections, base }
  })
  return loading
}

/** Selector de emojis: la lista completa de Unicode, sin buscador, con scroll interminable y atajos por categoría. */
export function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  const [emoji, setEmoji] = useState<Section[] | null>(null)
  const [extra, setExtra] = useState<Section[]>([])
  const [loadingExtra, setLoadingExtra] = useState(true)
  const sections = emoji ? [...emoji, ...extra] : null
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    let alive = true
    void loadAll().then(async ({ sections: s, base }) => {
      if (!alive) return
      setEmoji(s)
      loadingSyms ??= loadSymbols(base)
      const ex = await loadingSyms
      if (alive) { setExtra(ex); setLoadingExtra(false) }
    })
    return () => { alive = false }
  }, [])

  const jump = (key: string) => {
    const el = refs.current[key]
    const c = box.current
    if (!el || !c) return
    // content-visibility reacomoda los tamaños mientras se baja: se corrige un par de veces hasta clavar la categoría
    const go = () => { c.scrollTop = el.offsetTop - c.offsetTop }
    go()
    requestAnimationFrame(() => { go(); setTimeout(go, 80) })
  }
  const nq = norm(q.trim())
  const shown = (sections ?? [])
    .map((s) => (nq ? { ...s, list: s.list.filter((it) => nq.split(/\s+/).every((w) => it.t.includes(w))) } : s))
    .filter((s) => s.list.length)
  const total = (sections ?? []).reduce((a, s) => a + s.list.length, 0)
  const found = shown.reduce((a, s) => a + s.list.length, 0)

  return (
    <div className="emoji-picker">
      <input
        className="ep-search"
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); if (box.current) box.current.scrollTop = 0 }}
        placeholder="Buscar emoji: calavera, corazón, pizza, bandera…"
        aria-label="Buscar emoji"
      />
      <div className="ep-tabs" role="tablist">
        {!nq && (sections ?? []).map((s) => (
          <button key={s.key} role="tab" title={s.name} onClick={() => jump(s.key)}>{s.icon}</button>
        ))}
        {sections && loadingExtra && <small className="ep-count">Sumando símbolos…</small>}
        {sections && !loadingExtra && <small className="ep-count">{nq ? `${found.toLocaleString('es')} de ` : ''}{total.toLocaleString('es')} emojis</small>}
      </div>
      <div className="ep-grid" ref={box} data-scroll>
        {!sections && <p className="ep-loading">Cargando todos los emojis…</p>}
        {!!nq && sections && !found && <p className="ep-loading">Ningún emoji coincide con «{q}»</p>}
        {shown.map((s) => (
          <section key={s.key} className="ep-sec" ref={(el) => { refs.current[s.key] = el }}>
            <h4>{s.name}</h4>
            <div className={`ep-items ${s.wide ? 'wide' : ''}`}>
              {s.list.map((it, i) => (
                <button key={`${it.e}-${i}`} title={it.l} className={value === it.e ? 'on' : ''} onClick={() => onChange(value === it.e ? '' : it.e)} aria-label={it.l}>
                  {it.e}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="ep-custom">
        <span className="ep-sel">{value || '—'}</span>
        <input value={value} maxLength={32} placeholder="Elegido (podés pegar otro acá)" aria-label="Emoji elegido" onChange={(e) => onChange(e.target.value.trim())} />
        {value && <button onClick={() => onChange('')}>Quitar</button>}
      </div>
    </div>
  )
}
