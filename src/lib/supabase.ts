import { createClient } from '@supabase/supabase-js'

// Prioridad: variables de build (Netlify con git) → /config.js (arrastrar la carpeta dist)
const runtime = typeof window !== 'undefined' ? window.__CC_CONFIG__ : undefined
const url = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || runtime?.supabaseUrl || '').trim() || undefined
const key = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || runtime?.supabaseAnonKey || '').trim() || undefined

/** Sin variables de entorno la app corre en "modo local" (localStorage + BroadcastChannel). */
// ?local en la URL fuerza el modo local (pruebas sin tocar la base real)
const forceLocal = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('local')
export const isLocal = forceLocal || !url || !key

export const supabase = isLocal
  ? null
  : createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 30 } },
    })
