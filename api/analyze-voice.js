// /api/analyze-voice.js — Vercel serverless function, CommonJS.
// Calls Google Gemini 2.5 Flash for the ONE part of voice analysis that
// genuinely needs judgment: themes, motifs, emotional register. Everything
// countable (syllables, rhyme endings, word frequency) is computed
// client-side in artist.html and passed in as `stats` — this endpoint
// never re-derives or overrides those numbers.
// Mirrors the auth/tier/error pattern in transform.js, complete.js, rhythm-fit.js.

const { createClient } = require('@supabase/supabase-js');

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
  const { data: producer, error: producerErr } = await supabase
    .from('producers')
    .select('tier')
    .eq('id', userData.user.id)
    .single();

  if (producerErr || !producer || producer.tier === 'free') {
    return res.status(403).json({ error: 'Voice analysis requires Pro or Studio tier' });
  }

  // ── 5. Validate request body ────────────────────────────────
  const { sampleLyrics, stats } = req.body || {};

  if (!sampleLyrics || !sampleLyrics.trim()) {
    return res.status(400).json({ error: 'Missing required field: sampleLyrics' });
  }

  const MAX_CHARS = 20000;
  if (sampleLyrics.length > MAX_CHARS) {
    return res.status(400).json({ error: `sampleLyrics too long — max ${MAX_CHARS} characters` });
  }

  // ── 6. Build prompt ─────────────────────────────────────────
  const statsContext = stats
    ? `\n\nAlready computed (do not contradict these): avg ${stats.avgSyllablesPerLine} syllables/line, ` +
      `recurring rhyme endings: ${(stats.commonRhymeEndings || []).map(r => r.ending).join(', ') || 'none flagged'}.`
    : '';

  const systemPrompt =
    `You are analyzing an artist's own lyric samples to build a voice profile that will guide ` +
    `future lyric generation in their style. This is their own writing, provided by their producer. ` +
    `Identify: recurring themes and subject matter, emotional register (e.g. vulnerable, boastful, ` +
    `narrative, abstract), and any distinctive verbal tics or ad-libs that literally appear in the ` +
    `text. Do not invent phrases that aren't in the source — only quote what's actually there.` +
    `${statsContext}\n\n` +
    `Return ONLY valid JSON, no markdown, no preamble: ` +
    `{"themes":"2-3 sentence summary of themes and emotional register",` +
    `"notablePhrases":["short phrases or ad-libs that literally recur in the text, empty array if none"]}`;

  const userPrompt = `Sample lyrics:\n\n${sampleLyrics}`;

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
            temperature: 0.4,
            maxOutputTokens: 1024
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
    return res.status(500).json({ error: 'Voice analysis failed', detail: err.message });
  }
};
