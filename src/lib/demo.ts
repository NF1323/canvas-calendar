import { createMany, mkEvent } from '../actions'
import { addMark, createArrow, useItems } from '../canvasItems'
import type { EventRow, Owner } from '../types'

export const DEMO_FLAG = 'cc_demo_pending'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Portada generada en el navegador (degradé + emoji): sin imágenes con derechos ni descargas. */
function cover(h1: number, h2: number, emoji: string): string {
  const c = document.createElement('canvas')
  c.width = 720
  c.height = 400
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 720, 400)
  gr.addColorStop(0, `hsl(${h1} 70% 52%)`)
  gr.addColorStop(1, `hsl(${h2} 65% 28%)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 720, 400)
  g.globalAlpha = 0.16
  for (let i = 0; i < 7; i++) {
    g.beginPath()
    g.arc(80 + i * 105, 70 + ((i * 97) % 280), 60 + ((i * 41) % 70), 0, Math.PI * 2)
    g.fillStyle = '#fff'
    g.fill()
  }
  g.globalAlpha = 1
  g.font = '170px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(emoji, 360, 215)
  return c.toDataURL('image/jpeg', 0.82)
}

/** Datos de ejemplo (relativos a hoy) para explorar la app sin backend. */
export async function seedDemo() {
  const t = new Date()
  t.setHours(12, 0, 0, 0)
  const monday = new Date(t)
  monday.setDate(t.getDate() - ((t.getDay() + 6) % 7))
  const day = (week: number, dow: number) => { const d = new Date(monday); d.setDate(monday.getDate() + week * 7 + dow); return iso(d) }

  const E = (
    title: string, owner: Owner, date: string, from: string | null, to: string | null,
    extra: Partial<EventRow> = {},
  ): EventRow => mkEvent({ title, owner, start_date: date, end_date: date, all_day: !from, start_time: from, end_time: to, ...extra })

  const roadmap = E('Planificación del trimestre', 'ambos', day(0, 0), '10:00', '11:30', {
    emoji: '🗺️', cover: cover(215, 260, '🗺️'), is_meetup: true,
    description_md: '## Objetivos\n- Definir prioridades\n- Repartir responsabilidades\n\n- [ ] Preparar el resumen\n- [x] Reservar la sala',
  })
  const design = E('Revisión de diseño', 'sam', day(0, 1), '15:00', '16:00', { emoji: '🎨', cover: cover(320, 350, '🎨') })
  const demo = E('Demo para clientes', 'alex', day(0, 3), '11:00', '12:00', { emoji: '🚀', cover: cover(160, 200, '🚀') })
  const launch = E('Lanzamiento v1.0', 'ambos', day(1, 4), null, null, { emoji: '🎉', cover: cover(30, 10, '🎉'), is_meetup: true })
  const trip = E('Viaje a Córdoba', 'ambos', day(2, 4), null, null, { emoji: '✈️', cover: cover(190, 230, '✈️'), end_date: day(2, 6) })
  const events: EventRow[] = [
    roadmap, design, demo, launch, trip,
    E('Gimnasio', 'alex', day(0, 0), '07:00', '08:00', { emoji: '🏋️', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }),
    E('Clase de inglés', 'sam', day(0, 2), '18:30', '19:30', { emoji: '📚', rrule: 'FREQ=WEEKLY;BYDAY=WE' }),
    E('Ensayo de la demo', 'luz', day(0, 3), '11:30', '12:30', { emoji: '🎬' }),
    E('Café con proveedores', 'ambos', day(0, 3), '11:15', '11:45', { emoji: '☕' }),
    E('Revisar métricas', 'max', day(1, 2), '09:00', '09:30', { emoji: '📈' }),
    E('Standup', 'ambos', day(1, 2), '10:00', '10:15', { emoji: '🗣️' }),
    E('Llamada con cliente', 'externo', day(1, 2), '12:00', '13:00', { emoji: '📞' }),
    E('Cierre de tareas', 'luz', day(1, 2), '16:00', '17:00', { emoji: '✅' }),
    E('Almuerzo con el equipo', 'ambos', day(0, 4), '13:00', '14:30', { emoji: '🍝' }),
    E('Turno médico', 'max', day(1, 1), '09:30', '10:15', { emoji: '🩺' }),
    E('Entrega del informe', 'alex', day(1, 2), '17:00', '18:00', { emoji: '📊' }),
    E('Entrevista de candidatos', 'externo', day(1, 3), '14:00', '15:30', { emoji: '🧑‍💼' }),
    E('Cumpleaños de Lu', 'ambos', day(1, 5), '20:00', '23:30', { emoji: '🎂', cover: cover(300, 330, '🎂') }),
    E('Retro del grupo', 'ambos', day(2, 1), '16:00', '17:00', { emoji: '🔁' }),
    E('Hackathon', 'alex', day(3, 3), null, null, { emoji: '💻', end_date: day(3, 4) }),
    E('Cena de aniversario', 'ambos', day(3, 5), '21:00', '23:00', { emoji: '🍷', cover: cover(350, 20, '🍷') }),
    // planes sueltos (bandeja)
    mkEvent({ title: 'Leer "Hábitos atómicos"', owner: 'luz', emoji: '📖' }),
    mkEvent({ title: 'Probar el restaurante nuevo', owner: 'ambos', emoji: '🍣' }),
    mkEvent({ title: 'Renovar el pasaporte', owner: 'alex', emoji: '🛂' }),
  ]
  await createMany(events)

  createArrow({ k: 'card', id: `${roadmap.id}@${roadmap.start_date}` }, { k: 'card', id: `${demo.id}@${demo.start_date}` })
  createArrow({ k: 'card', id: `${demo.id}@${demo.start_date}` }, { k: 'card', id: `${launch.id}@${launch.start_date}` })
  const first = (e: EventRow) => e.start_date!
  await addMark({ days: [first(trip), day(2, 5), day(2, 6)], label: 'Vacaciones', color: '#22b8e6', owner: 'ambos' })
  await addMark({ days: [day(1, 4)], label: 'Día de lanzamiento', color: '#f5a524', owner: 'ambos' })
  useItems.setState({ arrowSel: null })
}
