// Public runtime config (the Supabase anon key is public by design; security comes from the RLS policies).
// Leave both values empty to run in "local mode" (no backend): data lives in localStorage and syncs between tabs.
// Optional free image-search keys: pexelsKey, pixabayKey, unsplashKey, googleKey, googleCx.
window.__CC_CONFIG__ = {
  supabaseUrl: '',
  supabaseAnonKey: '',
}
