// auth.js — Auth guards and helpers used by all authenticated pages.
// Depends on: supabase.js (loaded first).

/**
 * requireAuth()
 * Redirects to login.html if there is no active session.
 * Returns { session, user } on success.
 * Call this at the top of every authenticated page's init function.
 */
async function requireAuth() {
  const { data: { session }, error } = await window.supabase.auth.getSession();
  if (error || !session) {
    location.href = 'login.html';
    return null;
  }
  return { session, user: session.user };
}

/**
 * getProducer(userId)
 * Fetches the producer row for the given auth user id.
 * Returns the producer object or null on failure.
 */
async function getProducer(userId) {
  const { data, error } = await window.supabase
    .from('producers')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error('getProducer error:', error.message); return null; }
  return data;
}

/**
 * signOut()
 * Signs the user out and redirects to login.html.
 */
async function signOut() {
  await window.supabase.auth.signOut();
  location.href = 'login.html';
}

/**
 * getAvatarUrl(path)
 * Resolves a storage path from the 'stems' bucket into a 1-hour signed URL.
 * Returns null if no path is provided or signed URL creation fails.
 */
async function getAvatarUrl(path) {
  if (!path) return null;
  const { data } = await window.supabase.storage
    .from('stems')
    .createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

/**
 * showError(elId, message)
 * Shows an inline error element by id with the given message.
 */
function showError(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
}

/**
 * clearError(elId)
 */
function clearError(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('visible');
}

/**
 * showSuccess(elId, message)
 */
function showSuccess(elId, message) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
}

/**
 * formatRelativeTime(dateString)
 * Returns a human-readable relative time string (e.g. "2 days ago").
 */
function formatRelativeTime(dateString) {
  if (!dateString) return 'never';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)   return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 30)  return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

/**
 * tierLabel(tier)
 * Returns badge HTML for a producer tier.
 */
function tierBadgeHTML(tier) {
  const map = {
    free:   '<span class="badge badge-free">Free</span>',
    pro:    '<span class="badge badge-pro">Pro</span>',
    studio: '<span class="badge badge-studio">Studio</span>'
  };
  return map[tier] || map.free;
}
