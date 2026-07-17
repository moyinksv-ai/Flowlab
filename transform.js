// /api/transform.js — Vercel serverless function, CommonJS.
// Calls Google Gemini 2.5 Flash for AI-tier genre transformation.
// Auth is verified server-side — the client's tier claim is never trusted.

const { createClient } = require('@supabase/supabase-js');
const GENRES = require('../genres.js');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
  const { data: producer, error: producerErr } = await supabase
    .from('producers')
    .select('tier')
    .eq('id', userData.user.id)
    .single();

  if (producerErr || !producer || producer.tier === 'free') {
    return res.status(403).json({ error: 'AI transform requires Pro or Studio tier' });
  }

  // ── 5. Validate request body ────────────────────────────────
  const { inputLyrics, sourceGenre, targetGenre, voiceProfile } = req.body || {};

  if (!inputLyrics || !sourceGenre || !targetGenre) {
    return res.status(400).json({ error: 'Missing required fields: inputLyrics, sourceGenre, targetGenre' });
  }

  if (!GENRES[sourceGenre] || !GENRES[targetGenre]) {
    return res.status(400).json({ error: `Invalid genre. Valid genres: ${Object.keys(GENRES).join(', ')}` });
  }

  // ── 6. Build prompts ────────────────────────────────────────
  const voiceContext = voiceProfile
    ? `\n\nARTIST VOICE PROFILE (preserve these patterns in output):\n${voiceProfile}`
    : '';

  const systemPrompt =
    `You are a world-class musicologist and songwriter specializing in genre transformation. ` +
    `Apply this 7-step algorithm: ` +
    `1) Semantic Parse — preserve core meaning, ` +
    `2) Structure Map — maintain verse/hook/chorus, ` +
    `3) Phonetic Mapping — adapt syllable stress, ` +
    `4) Vocabulary Substitution — target genre lexicon, ` +
    `5) Cadence Fitting — match syllable density, ` +
    `6) Rhyme Enforcement — apply target rhyme scheme, ` +
    `7) Cultural Injection — authentic idioms and markers. ` +
    `${GENRES[targetGenre].aiPrompt}. ` +
    `Return ONLY valid JSON, no markdown, no preamble: ` +
    `{"transformed":"full lyrics here","changes":[{"rule":"step name","detail":"what changed"}],` +
    `"genreScore":{"rhythm":0-10,"vocab":0-10,"authenticity":0-10}}`;

  const userPrompt =
    `Transform these lyrics FROM ${sourceGenre.toUpperCase()} TO ${targetGenre.toUpperCase()}.` +
    `${voiceContext}\n\nSOURCE LYRICS:\n${inputLyrics}\n\n` +
    `Make every line feel genuinely native to ${targetGenre}. Preserve the emotion and story.`;

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
    return res.status(500).json({ error: 'Transformation failed', detail: err.message });
  }
};
