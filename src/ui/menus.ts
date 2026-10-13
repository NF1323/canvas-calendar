import type { MenuItem } from '../store'
import { ui, useData, useUI, toast, ownerName, ownerKeys } from '../store'
import type { Occurrence, Owner } from '../types'
import {
  askScope, deleteOccurrence, duplicateTo, editOccurrence, moveToDay, moveToTray, softDelete, toggleDone,
} from '../actions'
import { addDaysStr, longDay, mondayOf, shortDate } from '../lib/dates'
import { flyHome, flyOverview, flyToDay, flyToDays, flyToWeek } from '../canvas/nav'
import { model } from '../calendar/model'
import { cam } from '../canvas/camera'

export async function requestDelete(occ: Occurrence) {
  if (!occ.recurring) return softDelete(occ.event.id)
  const scope = await askScope('Eliminar')
  if (scope) await deleteOccurrence(occ, scope)
}

export function newEvent(day: string | null, days?: string[], seed?: Partial<import('../types').EventRow>) {
  ui({ editor: { eventId: null, day, days, seed }, menu: null })
}

/** Doble clic / "+ Agregar": con zoom lejano vuela primero al día. */
export function createAt(day: string) {
  if (cam.cam.s < 0.55) {
    flyToDay(day, { duration: 450 })
    setTimeout(() => newEvent(day), 460)
  } else newEvent(day)
}

async function changeOwner(occ: Occurrence, owner: Owner) {
  if (occ.recurring) {
    const scope = await askScope('Cambiar dueño')
    if (!scope) return
    return editOccurrence(occ, { owner }, scope)
  }
  return editOccurrence(occ, { owner }, 'all')
}

export function openCardMenu(x: number, y: number, occ: Occurrence) {
  const today = useData.getState().today
  const items: MenuItem[] = [
    { label: 'Editar', onClick: () => ui({ editor: { eventId: occ.event.id, occKey: occ.key, day: occ.date || null } }) },
    { label: occ.done ? 'Marcar pendiente' : 'Marcar hecho', onClick: () => void toggleDone(occ) },
    { label: 'Duplicar', onClick: () => void duplicateTo(occ, occ.date || null) },
    {
      label: 'Mover a…',
      sub: [
        { label: 'Hoy', onClick: () => void moveToDay(occ, today) },
        { label: 'Mañana', onClick: () => void moveToDay(occ, addDaysStr(today, 1)) },
        { label: 'Próximo lunes', onClick: () => void moveToDay(occ, addDaysStr(mondayOf(today), 7)) },
        { label: 'Bandeja "Algún día"', onClick: () => void moveToTray(occ) },
      ],
    },
    {
      label: 'Cambiar dueño',
      sub: ownerKeys(useData.getState().profiles).map((o) => ({
        label: ownerName(o),
        onClick: () => void changeOwner(occ, o),
      })),
    },
    { sep: true, label: '' },
    { label: 'Eliminar', danger: true, onClick: () => void requestDelete(occ) },
  ]
  ui({ menu: { x, y, items } })
}

export function openDayMenu(x: number, y: number, day: string) {
  const m = model.current
  const week = m?.layout.weeks.find((w) => w.days.includes(day))
  const items: MenuItem[] = [
    { label: 'Nuevo plan', onClick: () => newEvent(day) },
    { label: 'Enfocar', onClick: () => flyToDay(day) },
    { label: 'Seleccionar semana', onClick: () => week && (ui({ selection: week.days }), flyToWeek(week.key)) },
    {
      label: 'Copiar fecha',
      onClick: () => {
        void navigator.clipboard?.writeText(`${longDay(day)} (${shortDate(day)})`)
        toast('Fecha copiada')
      },
    },
  ]
  ui({ menu: { x, y, items } })
}

export function openEmptyMenu(x: number, y: number) {
  const w = cam.screenToWorld(x, y)
  ui({
    menu: {
      x, y,
      items: [
        { label: 'Ir a hoy', onClick: () => flyHome() },
        { label: 'Vista general', onClick: () => flyOverview() },
        { label: 'Nuevo plan suelto aquí', onClick: () => newEvent(null, undefined, { canvas_x: Math.round(w.x - 102), canvas_y: Math.round(w.y - 20) }) },
      ],
    },
  })
}

export function openSelectionTargets() {
  const sel = useUI.getState().selection
  flyToDays(sel)
}
