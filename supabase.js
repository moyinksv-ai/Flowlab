// supabase.js — Supabase client singleton.
// The anon/public key is safe to expose in frontend code by design.

const SUPABASE_URL = 'https://inkqekkziejasygiqeqi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_D4a6wpF4eW19zI42SRmgwg_DkJubQQ1';

// The UMD bundle from unpkg sets window.supabase.
// Guard against the CDN not having finished loading (e.g. slow local network).
if (typeof supabase === 'undefined') {
  console.error(
    '[FlowLab] Supabase CDN script did not load. ' +
    'Check your internet connection. The app requires the Supabase library to function.'
  );
  // Surface a visible error so the user knows what happened instead of silent failure
  document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    if (body) {
      const banner = document.createElement('div');
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;padding:16px;background:#EF4444;' +
        'color:#fff;font-size:14px;text-align:center;z-index:9999;font-family:sans-serif;';
      banner.textContent =
        'Network error: required library failed to load. Check your connection and reload.';
      body.prepend(banner);
    }
  });
} else {
  const { createClient } = supabase;
  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  // Expose as `window.supabase` for use across all page scripts.
  window.supabase = supabaseClient;
}
