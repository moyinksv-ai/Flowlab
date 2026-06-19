// supabase.js — Supabase client singleton.
// Replace placeholder values with your project credentials from
// dashboard.supabase.com → Project Settings → API.
// The anon/public key is safe to expose in frontend code by design.

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
// Replace with your Supabase project values from dashboard.supabase.com

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Expose as `window.supabase` for use across all page scripts.
window.supabase = supabaseClient;
