import { setPrefs, useUI, toast } from '../store'
import { flyOverview } from './nav'

/** Alterna entre la cuadrícula de calendario (3 filas × 4 columnas) y la vista personalizada. */
export function toggleView() {
  const next = useUI.getState().prefs.view === 'grid' ? 'custom' : 'grid'
  setPrefs({ view: next })
  toast(next === 'grid' ? 'Vista calendario: cuadrícula ordenada' : 'Vista personalizada: tus posiciones')
  setTimeout(() => flyOverview(), 120)
}
