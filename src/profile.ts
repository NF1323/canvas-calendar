import type { Profile } from './types'
import { toast, useData } from './store'
import * as api from './lib/api'
import { sendProfile } from './realtime/net'

type Patch = Partial<Pick<Profile, 'display_name' | 'color' | 'avatar'>>

/** Guarda cambios del propio perfil: se ven al instante, se persisten y le llegan al otro en vivo. */
export async function saveProfile(patch: Patch) {
  const me = useData.getState().me
  if (!me) return
  const next = { ...me, ...patch }
  useData.setState((s) => ({ me: next, profiles: s.profiles.map((p) => (p.id === me.id ? next : p)) }))
  sendProfile()
  try {
    await api.updateProfile(me.id, patch)
  } catch (e) {
    console.error(e)
    toast('No se pudo guardar el perfil en el servidor (¿falta correr 0004_profile_avatar.sql?)')
  }
}
