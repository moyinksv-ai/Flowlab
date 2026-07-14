// app.js — Core application logic shared across pages.
// Depends on: genres.js, supabase.js, auth.js (all loaded before this).

/* ============================================================
   INSTALL PROMPT (index.html only)
   ============================================================ */

let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  const banner = document.getElementById('install-prompt');
  if (banner) banner.classList.add('visible');
});

function triggerInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(() => {
    _deferredInstallPrompt = null;
    const banner = document.getElementById('install-prompt');
    if (banner) banner.classList.remove('visible');
  });
}

/* ============================================================
   LOGOUT BUTTON — wire up any element with data-logout
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-logout]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      signOut();
    });
  });
});

/* ============================================================
   POPULATE TOP NAV producer name + tier badge
   ============================================================ */

async function populateTopNav(producer) {
  const nameEl = document.getElementById('nav-producer-name');
  const tierEl = document.getElementById('nav-producer-tier');
  if (nameEl && producer) nameEl.textContent = producer.name;
  if (tierEl && producer) tierEl.innerHTML = tierBadgeHTML(producer.tier);
}

/* ============================================================
   GENRE TILE SELECTOR
   Build a genre picker grid inside a container element.
   onSelect(genreKey) is called when the user taps a tile.
   ============================================================ */

function buildGenreGrid(containerId, selectedKey, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  container.className = 'genre-grid';
  Object.entries(GENRES).forEach(([key, g]) => {
    const tile = document.createElement('button');
    tile.className = 'genre-tile' + (key === selectedKey ? ' selected' : '');
    tile.type = 'button';
    tile.dataset.genre = key;
    tile.innerHTML = `<span class="emoji">${g.emoji}</span><span class="label">${g.label}</span>`;
    tile.addEventListener('click', () => {
      container.querySelectorAll('.genre-tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      onSelect(key);
    });
    container.appendChild(tile);
  });
}

/* ============================================================
   SESSION BUNDLE EXPORT (JSZip v3)
   ============================================================ */

async function exportSessionBundle(session) {
  const zip = new JSZip();

  const meta = {
    id:          session.id,
    artist:      session.artists?.name || 'Unknown',
    sourceGenre: session.source_genre,
    targetGenre: session.target_genre,
    tierUsed:    session.tier_used,
    createdAt:   session.created_at,
    notes:       session.session_notes || ''
  };

  zip.file('meta.json', JSON.stringify(meta, null, 2));
  zip.file('input.txt',  session.input_lyrics  || '');
  zip.file('output.txt', session.output_lyrics || '');
  if (session.session_notes) zip.file('notes.txt', session.session_notes);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `flowlab-session-${session.id?.slice(0, 8) || 'export'}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   TIER MAPPING — producers.tier → sessions.tier_used
   Free          → 'free'
   pro / studio  → 'ai'
   ============================================================ */

function tierUsedValue(producerTier) {
  if (producerTier === 'pro' || producerTier === 'studio') return 'ai';
  return 'free';
}

/* ============================================================
   AVATAR FALLBACK — render emoji if no image available
   ============================================================ */

async function renderAvatar(containerEl, path, fallbackEmoji) {
  if (!containerEl) return;
  if (path) {
    const url = await getAvatarUrl(path);
    if (url) {
      containerEl.innerHTML = `<img src="${url}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">`;
      return;
    }
  }
  containerEl.textContent = fallbackEmoji || '🎤';
}

/* ============================================================
   GENERIC ASYNC BUTTON — shows spinner, re-enables on finish
   ============================================================ */

function withButtonLoading(btn, label) {
  // Guard against a second call firing while this button is already
  // mid-request (e.g. Enter pressed twice) — without this, the second
  // call would save the spinner markup itself as the "original" HTML,
  // and the button would get stuck spinning forever once the first
  // call's restore() re-applies that corrupted value.
  if (btn.dataset.loading === 'true') {
    return () => {};
  }
  btn.dataset.loading = 'true';
  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span>${label ? ` ${label}` : ''}`;
  return () => {
    btn.dataset.loading = 'false';
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  };
}
