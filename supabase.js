// supabase.js — Supabase client singleton.
// The anon/public key is safe to expose in frontend code by design.

const SUPABASE_URL = 'https://inkqekkziejasygiqeqi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_D4a6wpF4eW19zI42SRmgwg_DkJubQQ1';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose as `window.supabase` for all page scripts.
window.supabase = supabaseClient;
