// /api/suggest-tags.js — Vercel serverless function, CommonJS.
// Suggests 3-6 short mood/theme tags for a lyric session. These are
// PROPOSALS ONLY — the client always shows them for the producer to
// accept/edit/remove before saving. Never written to the DB by this
// endpoint directly; this only returns suggestions.
// Mirrors the auth/tier/error pattern used across the other endpoints.

const { createClient } = require('@supabase/supabase-js');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace('Bearer ', '').trim();
  if (!accessToken) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const { data: producer, error: producerErr } = await supabase
    .from('producers')
    .select('tier')
    .eq('id', userData.user.id)
    .single();

  if (producerErr || !producer || producer.tier === 'free') {
    return res.status(403).json({ error: 'Tag suggestions require Pro or Studio tier' });
  }

  const { lyrics } = req.body || {};
  if (!lyrics || !lyrics.trim()) {
    return res.status(400).json({ error: 'Missing required field: lyrics' });
  }

  const MAX_CHARS = 20000;
  if (lyrics.length > MAX_CHARS) {
    return res.status(400).json({ error: `lyrics too long — max ${MAX_CHARS} characters` });
  }

  const systemPrompt =
    `You are tagging a lyric draft for a searchable idea bank. Suggest 3-6 short tags ` +
    `(1-3 words each) covering mood (e.g. "heartbreak", "confident", "nostalgic") and ` +
    `theme/subject matter (e.g. "money", "betrayal", "new love"). Lowercase, no hashtags, ` +
    `no punctuation beyond spaces. These are suggestions a human will review and edit — ` +
    `favor precision over creativity.\n\n` +
    `Return ONLY valid JSON, no markdown, no preamble: {"tags":["tag1","tag2",...]}`;

  try {
    const response = await fetch(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: lyrics }] }],
          generationConfig: { maxOutputTokens: 256 }
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
      return res.status(500).json({ error: 'Failed to parse AI response as JSON', detail: parseErr.message });
    }

    if (!Array.isArray(parsed.tags)) {
      return res.status(502).json({ error: 'AI returned malformed tags' });
    }

    return res.status(200).json({ tags: parsed.tags.slice(0, 6) });

  } catch (err) {
    return res.status(500).json({ error: 'Tag suggestion failed', detail: err.message });
  }
};
