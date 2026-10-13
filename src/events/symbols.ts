/** Más allá de los emojis oficiales: símbolos Unicode con onda de emoji y caritas de texto (kaomoji). */

export interface SymItem { e: string; l: string; t: string }
export interface SymSection { key: string; name: string; icon: string; list: SymItem[]; wide?: boolean }

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const KAOMOJI = String.raw`¯\_(ツ)_/¯|me encojo de hombros
(╯°□°）╯︵ ┻━┻|voltear la mesa
┬─┬ ノ( ゜-゜ノ)|poner la mesa
┻━┻ ︵ヽ(\`Д´)ﾉ︵ ┻━┻|mesa doble
(┛◉Д◉)┛彡┻━┻|volcar
(ﾉಥ益ಥ）ﾉ ┻━┻|furia
( ͡° ͜ʖ ͡°)|lenny pícaro
( ͡~ ͜ʖ ͡°)|guiño lenny
(☞ ͡° ͜ʖ ͡°)☞|picardía
ಠ_ಠ|desaprobación
ಠ‿ಠ|travieso
ಥ_ಥ|llorando
(ಥ﹏ಥ)|llanto
ლ(ಠ益ಠლ)|furia
щ(ಠ益ಠщ)|rabia
(╬ಠ益ಠ)|enojo
(҂\`_´)|enojado
(ง'̀-'́)ง|pelea
(ง •̀_•́)ง|a pelear
(҂◡_◡) ᕤ|fuerza
ʕ•ᴥ•ʔ|osito
(づ｡◕‿‿◕｡)づ|abrazo
(つ≧▽≦)つ|abrazo
(◕‿◕✿)|flor
(｡◕‿◕｡)|ojitos
(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧|magia
٩(◕‿◕｡)۶|feliz
(⌐■_■)|cool
(•_•) ( •_•)>⌐■-■ (⌐■_■)|deal with it
ヽ(´▽\`)/|alegría
(´･ω･\`)|tímido
(︶︹︺)|triste
(｡•́︿•̀｡)|pucheros
(≧◡≦)|sonrisa
(｡♥‿♥｡)|enamorado
(❤ω❤)|amor
(*^‿^*)|contento
(¬_¬)|sospecha
(¬‿¬)|picardía
(≖_≖ )|mirada
(ʘ‿ʘ)|ojos locos
(☞ﾟヮﾟ)☞|señalar
☜(ﾟヮﾟ☜)|señalar
ᕕ( ᐛ )ᕗ|corriendo
ε=ε=ε=┌(;*´Д\`)ﾉ|huyendo
(._.)|meh
(-_-)|aburrido
(；一_一)|cansado
(×_×)|muerto
(✖╭╮✖)|k.o.
☠(ò_ó)☠|calavera
(°ロ°)☝|idea
(☉_☉)|sorpresa
Σ(°△°|||)︴|horror
(⊙_⊙)|asombro
(O_O)|ojos grandes
(ﾟдﾟ)|shock
(๑•̀ㅂ•́)و✧|determinación
(ノ^_^)ノ|saludo
(＾▽＾)|risa
(＾◡＾)|sonrisa suave
(๑˃ᴗ˂)ﻭ|ánimo
(´,,•ω•,,)♡|cariño
(◍•ᴗ•◍)❤|amor
(⁄ ⁄•⁄ω⁄•⁄ ⁄)|vergüenza
(//▽//)|sonrojo
(〃▽〃)|sonrojo
(* ̄▽ ̄)b|bien
d(^o^)b|genial
(b ᵔ▽ᵔ)b|genial
(ᵔᴥᵔ)|perrito
U・ᴥ・U|perrito
(=^･ω･^=)|gatito
(=^‥^=)|gato
≧◉ᴥ◉≦|animal
ᓚᘏᗢ|gato
(ᵔ◡ᵔ)|dulce
(ᗒᗣᗕ)՞|miedo
(╥﹏╥)|llorando
(T_T)|llorando
(;_;)|lágrimas
orz|derrota
m(_ _)m|disculpas
(_ _)|reverencia
ヽ(°〇°)ﾉ|alboroto
( ´_ゝ\`)|indiferente
(￣ー￣)|serio
(￣^￣)|orgulloso
(¬､¬)|desconfianza
(눈_눈)|fulminar
(・ω・)|simple
(・_・)|neutral
(・∀・)|alegre
(≧∇≦)/|hurra
＼(^o^)／|hurra
( ˘ ³˘)♥|beso
(´∩｡• ᵕ •｡∩\`)|tierno
(ღ˘⌣˘ღ)|dulzura
(˘▾˘)~♪|música
♪♫•*¨*•.¸¸♪|música
┌(┌ ^o^)┐|baile
└(^o^ )Ｘ( ^o^)┘|baile
♪┏(・o･)┛♪┗ ( ･o･) ┓♪|baile
(~˘▾˘)~|baile
(ﾉ≧∀≦)ﾉ|festejo
ヾ(⌐■_■)ノ♪|cool bailando
(҂⌣̀_⌣́)|desafío
(ﾉ\`□´)ﾉ|reclamo
(;´Д\`)|agobio
(ﾟ∀ﾟ)|locura
(☉。☉)!|susto
(°◇°)|choque
w(ﾟДﾟ)w|horror
(╯✧∇✧)╯|festejo
(♡´▽\`♡)|amor
(´• ω •\`)ﾉ|hola
(´ε｀ )♡|beso
(－_－) zzZ|durmiendo
(-ω-)zzz|siesta
(҂⌣̀_⌣́)ᕤ|poderoso
(ノಠ益ಠ)ノ彡┻━┻|rabia mesa
(ಠ_ಠ)ノ|mala onda
(☉_☉) ︵ ┻━┻|susto mesa
(⊙﹏⊙)|nervioso
(≧﹏≦)|angustia
(｡•̀ᴗ-)✧|guiño
(๑>◡<๑)|guiño dulce
(｡ì _ í｡)|enfado
(ꐦ ಠ皿ಠ)|ira extrema
(╯︵╰,)|pena
(´；ω；\`)|tristeza
(´-ω-\`)|resignado
(・_・;)|sudor frío
(^_^;)|nervios
(^^ゞ|apenado
(*´▽\`*)|ternura
(◔_◔)|mirando
👁👄👁|cursed
(⸝⸝•‿•⸝⸝)|tímido
( ˙▿˙ )|alegre
(◕ᴗ◕✿)|flor
(✿◠‿◠)|flor
✧*｡٩(ˊᗜˋ*)و✧*｡|brillos
(ﾉ´ヮ\`)ﾉ*: ･ﾟ|ilusión
٩(ˊᗜˋ*)و|ánimo
٩(๛ ˘ ³˘)۶♥|beso
( • ᴗ - ) ✧|guiño`

const RANGES: { key: string; name: string; icon: string; ranges: [number, number][] }[] = [
  { key: 'pict', name: 'Símbolos y pictogramas', icon: '☠', ranges: [[0x2300, 0x23ff], [0x2600, 0x26ff], [0x2700, 0x27bf], [0x1f300, 0x1faff]] },
  { key: 'arrows', name: 'Flechas', icon: '➤', ranges: [[0x2190, 0x21ff], [0x27f0, 0x27ff], [0x2900, 0x297f], [0x2b00, 0x2bff]] },
  { key: 'shapes', name: 'Formas, bloques y líneas', icon: '◆', ranges: [[0x25a0, 0x25ff], [0x2580, 0x259f], [0x2500, 0x257f]] },
  { key: 'math', name: 'Matemática, letras y monedas', icon: '∞', ranges: [[0x2200, 0x22ff], [0x2100, 0x214f], [0x2150, 0x218f], [0x2460, 0x24ff], [0x20a0, 0x20cf], [0x1f100, 0x1f1e5]] },
  { key: 'games', name: 'Juegos: naipes, dominó, mahjong y ajedrez', icon: '🂡', ranges: [[0x1f000, 0x1f0ff], [0x1fa00, 0x1fa6f]] },
  { key: 'music', name: 'Música', icon: '𝄞', ranges: [[0x1d100, 0x1d1ff]] },
  { key: 'braille', name: 'Braille', icon: '⠿', ranges: [[0x2800, 0x28ff]] },
]

/** Firma de pixeles de un símbolo; si coincide con la del "cuadradito" de glifo faltante, el sistema no lo puede dibujar. */
function makeSupport() {
  const cv = document.createElement('canvas')
  cv.width = 40
  cv.height = 40
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.font = '28px "Segoe UI Emoji","Segoe UI Symbol","Noto Sans Symbols","Noto Sans Symbols 2","Noto Emoji",sans-serif'
  g.textBaseline = 'middle'
  const sig = (ch: string) => {
    g.clearRect(0, 0, 40, 40)
    g.fillStyle = '#000'
    g.fillText(ch, 4, 20)
    const d = g.getImageData(0, 0, 40, 40).data
    let n = 0
    let h = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]) { n++; h = (h * 31 + i * d[i]) >>> 0 }
    return `${n}:${h}`
  }
  const tofu = sig(String.fromCodePoint(0xffff))
  return (ch: string) => {
    const s = sig(ch)
    return s !== tofu && !s.startsWith('0:')
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

export function kaomojiSection(): SymSection {
  const list = KAOMOJI.split('\n')
    .map((l) => l.replace(/\\`/g, '`'))
    .map((l) => {
      const i = l.lastIndexOf('|')
      const e = l.slice(0, i).trim()
      const label = l.slice(i + 1).trim()
      return { e, l: label, t: norm(`kaomoji cara texto ${label}`) }
    })
    .filter((x) => x.e)
  return { key: 'kaomoji', name: 'Caritas de texto (kaomoji) y cursed', icon: '(ツ)', list, wide: true }
}

/** Todos los símbolos Unicode asignados que este dispositivo sabe dibujar y que no son emojis oficiales. */
export async function loadSymbols(emojiBase: Set<number>): Promise<SymSection[]> {
  const ok = makeSupport()
  const out: SymSection[] = []
  let count = 0
  for (const cat of RANGES) {
    const list: SymItem[] = []
    for (const [a, b] of cat.ranges) {
      for (let cp = a; cp <= b; cp++) {
        if (emojiBase.has(cp)) continue
        const ch = String.fromCodePoint(cp)
        if (/\p{Cn}|\p{Cc}|\p{Cs}/u.test(ch) || (cp >= 0x1f1e6 && cp <= 0x1f1ff)) continue
        if (!ok(ch)) continue
        list.push({ e: ch, l: `U+${cp.toString(16).toUpperCase()}`, t: norm(`${cat.name} u+${cp.toString(16)} ${cat.key}`) })
        if (++count % 400 === 0) await tick()
      }
    }
    if (list.length) out.push({ key: cat.key, name: cat.name, icon: list.find((x) => x.e === cat.icon)?.e ?? list[0].e, list })
  }
  out.push(kaomojiSection())
  return out
}
