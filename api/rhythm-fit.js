// /api/rhythm-fit.js — Vercel serverless function, CommonJS.
// Calls Google Gemini 2.5 Flash to rewrite lyric lines so their syllable
// count sits close to a target (derived from BPM/genre on the client).
// Mirrors the auth/tier/error pattern in transform.js and complete.js.
//
// IMPORTANT: this endpoint does NOT do audio analysis or BPM detection.
// The producer supplies BPM manually; the client computes real syllable
// counts per line via countSyllables() (nlp.js) BEFORE calling this, and
// sends those counts as ground truth. The model never has to guess a
// syllable count — it's given the real one and asked to hit a target.

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
    return res.status(403).json({ error: 'Rhythm Fit requires Pro or Studio tier' });
  }

  // ── 5. Validate request body ────────────────────────────────
  // lines: array of { text, syllables, target } — syllables and target
  //   are computed CLIENT-SIDE and passed in as real numbers, not guessed
  //   here. bpm/genre are context for the model's phrasing choices only,
  //   they are never used to compute a syllable count server-side.
  const { lines, bpm, genre, voiceProfile } = req.body || {};

  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Missing required field: lines (non-empty array)' });
  }

  // Cap line count and total text size — same cost-abuse reasoning as
  // complete.js. A huge lines array is a cheap way to force a huge prompt.
  const MAX_LINES = 200;
  const MAX_CHARS = 20000;
  if (lines.length > MAX_LINES) {
    return res.status(400).json({ error: `Too many lines — max ${MAX_LINES}` });
  }
  const totalChars = lines.reduce((sum, l) => sum + (l?.text?.length || 0), 0);
  if (totalChars > MAX_CHARS) {
    return res.status(400).json({ error: `Total text too long — max ${MAX_CHARS} characters` });
  }

  for (const l of lines) {
    if (typeof l.text !== 'string' || typeof l.syllables !== 'number' || typeof l.target !== 'number') {
      return res.status(400).json({
        error: 'Each line must be { text: string, syllables: number, target: number }'
      });
    }
  }

  if (genre && !GENRES[genre]) {
    return res.status(400).json({ error: `Invalid genre. Valid genres: ${Object.keys(GENRES).join(', ')}` });
  }

  // ── 6. Build prompts ────────────────────────────────────────
  const voiceContext = voiceProfile
    ? `\n\nARTIST VOICE PROFILE (preserve these patterns):\n${voiceProfile}`
    : '';

  const genreContext = genre
    ? `\n\nGENRE FEEL: ${GENRES[genre].label}. ${GENRES[genre].aiPrompt}`
    : '';

  const bpmContext = bpm
    ? `\n\nThis will be sung/rapped over a beat at ${bpm} BPM. Faster BPM favors shorter, punchier ` +
      `syllable clusters; slower BPM allows more stretched, held syllables. Use this only to guide phrasing feel.`
    : '';

  const linesManifest = lines
    .map((l, i) => `${i + 1}. [${l.syllables} syll, target ${l.target}] "${l.text}"`)
    .join('\n');

  const systemPrompt =
    `You are a songwriter fitting lyrics to a rhythmic pocket. You are given real, ` +
    `already-counted syllable counts per line and a target count per line. ` +
    `For each line where syllables !== target, rewrite ONLY that line so its syllable ` +
    `count is as close to target as possible (exact match preferred, ±1 acceptable), ` +
    `while preserving the line's meaning, its rhyme with adjacent lines, and its emotional register. ` +
    `Lines already at target: return them completely unchanged. ` +
    `Do not merge or split lines — the number of lines in your output must equal the input.` +
    `${genreContext}${bpmContext}${voiceContext}\n\n` +
    `Return ONLY valid JSON, no markdown, no preamble: ` +
    `{"lines":["rewritten or unchanged line 1","line 2",...],` +
    `"notes":[{"line":1,"detail":"what changed and why, or 'unchanged, already at target'"}]}`;

  const userPrompt = `Fit these lines to their syllable targets:\n\n${linesManifest}`;

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
    // Gemini 3.x can return multiple parts, including internal "thought"
    // reasoning parts mixed with the real answer (sometimes with empty
    // text). Grabbing parts[0] unconditionally breaks when the first part
    // is a thought, not the answer — filter those out and join what's left.
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const raw = responseParts.filter(p => !p.thought).map(p => p.text || '').join('');
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

    // Defensive check: line count must match. If the model merged/split
    // lines despite instructions, don't silently return misaligned data.
    if (!Array.isArray(parsed.lines) || parsed.lines.length !== lines.length) {
      return res.status(502).json({
        error: 'AI returned a mismatched number of lines',
        detail: `Expected ${lines.length}, got ${parsed.lines?.length ?? 0}`
      });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    return res.status(500).json({ error: 'Rhythm fit failed', detail: err.message });
  }
};
