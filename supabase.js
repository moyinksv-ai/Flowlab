// supabase.js — Supabase client singleton.
// The anon/public key is safe to expose in frontend code by design.

const SUPABASE_URL = 'https://inkqekkziejasygiqeqi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_D4a6wpF4eW19zI42SRmgwg_DkJubQQ1';

// Guard: if supabase.umd.js ever fails to load (bad deploy, corrupted
// cache, blocked request) `supabase` won't exist as a global. Fail loudly with
// a clear message instead of throwing an unhelpful "Cannot read properties of
// undefined (reading 'auth')" deep inside some later call site.
if (typeof supabase === 'undefined' || !supabase.createClient) {
  console.error('[supabase.js] Supabase client library did not load. Check that supabase.umd.js is present and loaded before this script.');
  window.supabase = null;
} else {
  const { createClient } = supabase;
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Expose as `window.supabase` for all page scripts.
  window.supabase = supabaseClient;
}
