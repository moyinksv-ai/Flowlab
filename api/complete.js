// /api/complete.js — Vercel serverless function, CommonJS.
// Calls Google Gemini 2.5 Flash to complete/continue a brainstormed lyric draft.
// Mirrors the auth, tier-gating, and error-handling pattern in transform.js exactly.
// Auth is verified server-side — the client's tier claim is never trusted.

const { createClient } = require('@supabase/supabase-js');
const GENRES = require('../genres.js');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── 1. Extract and validate the caller's JWT ───────────────
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace('Bearer ', '').trim();
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  // ── 2. Create a Supabase client scoped to the caller's JWT ──
  // RLS naturally restricts all queries to the caller's own data.
  // No service-role key is required or used anywhere.
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  // ── 3. Verify the session and retrieve the user ─────────────
  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  // ── 4. Verify producer exists and is on a paid tier ─────────
  // Completion requires generation, not substitution — the free-tier
  // engine (nlp.js/compromise.js) can only rewrite existing words, it
  // cannot generate new lines. So this feature is AI-tier only, same
  // gate as transform.js.
  const { data: producer, error: producerErr } = await supabase
    .from('producers')
    .select('tier')
    .eq('id', userData.user.id)
    .single();

  if (producerErr || !producer || producer.tier === 'free') {
    return res.status(403).json({ error: 'Lyric completion requires Pro or Studio tier' });
  }

  // ── 5. Validate request body ────────────────────────────────
  // draftLyrics: the producer's partial/brainstormed lyrics — may contain
  //   gaps, single lines, a hook with no verses, etc.
  // genre: OPTIONAL style/vibe to complete toward. Unlike transform.js,
  //   there is no source→target pair here — completion has one genre
  //   at most, used for tone, not conversion.
  // voiceProfile: OPTIONAL, same shape as transform.js — pulled from
  //   voice_profiles.sample_lyrics when the session has an artist attached.
  const { draftLyrics, genre, voiceProfile } = req.body || {};

  if (!draftLyrics || !draftLyrics.trim()) {
    return res.status(400).json({ error: 'Missing required field: draftLyrics' });
  }

  // Cap input size — without this, any authenticated Pro/Studio account
  // (or a leaked token) could send arbitrarily large text and run up
  // Gemini API cost with no server-side stop.
  const MAX_CHARS = 20000;
  if (draftLyrics.length > MAX_CHARS) {
    return res.status(400).json({ error: `draftLyrics too long — max ${MAX_CHARS} characters` });
  }

  if (genre && !GENRES[genre]) {
    return res.status(400).json({ error: `Invalid genre. Valid genres: ${Object.keys(GENRES).join(', ')}` });
  }

  // ── 6. Build prompts ────────────────────────────────────────
  const voiceContext = voiceProfile
    ? `\n\nARTIST VOICE PROFILE (write additions in this voice, not a generic one):\n${voiceProfile}`
    : '';

  const genreContext = genre
    ? `\n\nSTYLE TARGET: Write completions that fit ${GENRES[genre].label}. ${GENRES[genre].aiPrompt}`
    : '';

  const systemPrompt =
    `You are a co-writer helping a songwriter finish a lyric draft they got stuck on. ` +
    `The draft may have gaps between sections, an unfinished verse, or just a hook with nothing else. ` +
    `Your job: ` +
    `1) Identify what's actually written vs. what's missing (empty verses, unfinished lines, a hook with no second verse), ` +
    `2) Write ONLY the missing/incomplete parts — never rewrite lines the writer already finished, ` +
    `3) Match the existing rhyme scheme, syllable rhythm, and emotional register already established in the draft, ` +
    `4) Avoid repeating words, phrases, or rhyme pairs already used elsewhere in the draft — each new line should ` +
    `say something the draft hasn't already said, ` +
    `5) Preserve every word the writer already wrote, exactly, in its original position.` +
    `${genreContext}${voiceContext}\n\n` +
    `Return ONLY valid JSON, no markdown, no preamble: ` +
    `{"completed":"the full draft with your additions merged in, in final order",` +
    `"additions":[{"section":"e.g. Verse 2 line 3","detail":"what you added and why it fits"}],` +
    `"repetitionFlags":["any word/phrase from the ORIGINAL draft that repeats too often, if any"]}`;

  const userPrompt =
    `Complete this lyric draft. Fill the gaps and finish what's unfinished — do not rewrite what's already there:\n\n` +
    `${draftLyrics}`;

  // ── 7. Call Gemini 2.5 Flash ─────────────────────────────────
  try {
    const response = await fetch(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 2048
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Gemini API error', detail: errText });
    }

    const data = await response.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(500).json({
        error: 'Failed to parse AI response as JSON',
        detail: parseErr.message,
        raw: clean.slice(0, 500)
      });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'Completion failed', detail: err.message });
  }
};
