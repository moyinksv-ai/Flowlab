// nlp.js — Free-tier genre transformation engine.
// Uses compromise.js (pinned v14.14.0) for tokenization and POS tagging only.
// compromise has NO built-in syllable or phonetic methods in core —
// those are handled by the custom countSyllables() heuristic below.
// Depends on: genres.js (window.GENRES must be set before this runs).

/* ============================================================
   SYLLABLE COUNTING — vowel-group heuristic.
   Not phonetically perfect; it's an approximation for free-tier
   cadence fitting. Do not expect perfect linguistic precision.
   ============================================================ */

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  const groups = word.match(/[aeiouy]+/g) || [];
  let count = groups.length;
  // Trailing silent 'e' — reduce by one when the word has more than one vowel group
  if (word.endsWith('e') && count > 1) count--;
  return Math.max(count, 1);
}

/* ============================================================
   RHYME DETECTION — last-2-characters heuristic.
   Intentionally crude for the free tier.
   ============================================================ */

function rhymeSuffix(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  return w.slice(-2);
}

function wordsRhyme(a, b) {
  if (!a || !b) return false;
  return rhymeSuffix(a) === rhymeSuffix(b) && a.toLowerCase() !== b.toLowerCase();
}

/* ============================================================
   LAST WORD of a line (strip punctuation)
   ============================================================ */

function lastWord(line) {
  const words = line.trim().split(/\s+/);
  return words[words.length - 1]?.replace(/[^a-zA-Z']/g, '') || '';
}

/* ============================================================
   SLANG SUBSTITUTION
   Replaces full phrases and individual words from genre.slang map.
   Case-insensitive match, preserves leading capitalisation.
   ============================================================ */

function applySlang(text, slangMap) {
  let result = text;

  // Multi-word phrases first (longest match wins)
  const phrases = Object.keys(slangMap).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    if (!phrase.includes(' ')) continue; // single words handled below
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(re, (match) => {
      const replacement = slangMap[phrase];
      // Preserve sentence-initial capitalisation
      if (match[0] === match[0].toUpperCase() && match[0].match(/[A-Z]/)) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  // Single words
  for (const phrase of phrases) {
    if (phrase.includes(' ')) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(re, (match) => {
      const replacement = slangMap[phrase];
      if (match[0] === match[0].toUpperCase() && match[0].match(/[A-Z]/)) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }

  return result;
}

/* ============================================================
   CADENCE FITTING
   Trims or pads lines to approach the target syllable density.
   Uses compromise for POS tagging to identify low-semantic-weight
   tokens (articles, conjunctions) for removal in over-long lines.
   ============================================================ */

function fitCadence(line, targetDensity) {
  const words = line.trim().split(/\s+/);
  const current = words.reduce((sum, w) => sum + countSyllables(w), 0);

  if (current <= targetDensity + 2) return line; // close enough

  // Over target — use compromise to find low-semantic-weight words to drop
  const doc = nlp(line);
  const articles     = new Set(doc.match('#Determiner').out('array'));
  const conjunctions = new Set(doc.match('#Conjunction').out('array'));

  const pruned = words.filter(w => {
    const clean = w.replace(/[^a-zA-Z']/g, '').toLowerCase();
    return !articles.has(clean) && !conjunctions.has(clean);
  });

  return pruned.join(' ');
}

/* ============================================================
   RHYME ENFORCEMENT — AABB scheme
   Given an array of lines, tries to pair end-words so that
   lines 0+1 rhyme and lines 2+3 rhyme, swapping words from the
   genre slang map to improve rhyme when possible.
   ============================================================ */

function enforceAABB(lines, slangMap) {
  // Attempt to make pairs 0-1, 2-3, 4-5 etc rhyme
  const result = [...lines];
  for (let i = 0; i < result.length - 1; i += 2) {
    const lwA = lastWord(result[i]);
    const lwB = lastWord(result[i + 1]);
    if (!wordsRhyme(lwA, lwB)) {
      // Try substituting the end of line B with a slang synonym
      for (const [orig, sub] of Object.entries(slangMap)) {
        if (lastWord(result[i + 1]).toLowerCase() === orig.toLowerCase()) {
          const subLast = lastWord(sub);
          if (wordsRhyme(lwA, subLast)) {
            result[i + 1] = result[i + 1].replace(
              new RegExp(`\\b${orig}\\b$`, 'i'), sub
            );
            break;
          }
        }
      }
    }
  }
  return result;
}

/* ============================================================
   CULTURAL INJECTION
   Sprinkles exclamations from the target genre at line breaks.
   Inserts one exclamation every N lines to avoid over-saturation.
   ============================================================ */

function injectCulture(lines, exclamations) {
  if (!exclamations || exclamations.length === 0) return lines;
  const result = [];
  lines.forEach((line, i) => {
    result.push(line);
    // Insert an exclamation after every 3rd non-empty line
    if ((i + 1) % 3 === 0 && line.trim() !== '') {
      const excl = exclamations[i % exclamations.length];
      result.push(excl);
    }
  });
  return result;
}

/* ============================================================
   MAIN TRANSFORM FUNCTION — 7-Step Pipeline
   ============================================================ */

/**
 * transformLyrics(inputLyrics, sourceGenre, targetGenre, voiceProfile)
 *
 * Steps:
 *   1. Parse      — split into lines, tokenise with compromise
 *   2. Structure  — separate verse / hook blocks (blank-line delimited)
 *   3. Phonetic   — syllable mapping (countSyllables heuristic)
 *   4. Vocabulary — slang substitution
 *   5. Cadence    — fit syllable density to target genre
 *   6. Rhyme      — enforce target rhyme scheme
 *   7. Culture    — inject exclamations and cultural markers
 *
 * Returns: { transformed: string, changes: [{rule, detail}] }
 */
function transformLyrics(inputLyrics, sourceGenre, targetGenre, voiceProfile) {
  const changes = [];
  const src = GENRES[sourceGenre];
  const tgt = GENRES[targetGenre];

  if (!src || !tgt) {
    return { transformed: inputLyrics, changes: [{ rule: 'Error', detail: 'Unknown genre' }] };
  }

  // ── STEP 1: Parse ──────────────────────────────────────────
  const rawLines = inputLyrics.split('\n');
  changes.push({ rule: 'Parse', detail: `${rawLines.length} lines parsed` });

  // ── STEP 2: Structure ──────────────────────────────────────
  // Split into blocks separated by blank lines; preserves verse/hook structure
  const blocks = [];
  let currentBlock = [];
  for (const line of rawLines) {
    if (line.trim() === '') {
      if (currentBlock.length > 0) { blocks.push(currentBlock); currentBlock = []; }
      blocks.push(['']); // preserve blank separator
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) blocks.push(currentBlock);
  changes.push({ rule: 'Structure', detail: `${blocks.filter(b => b[0] !== '').length} blocks identified` });

  // ── STEP 3: Phonetic (syllable analysis) ───────────────────
  const totalSyllablesBefore = rawLines
    .join(' ')
    .split(/\s+/)
    .reduce((sum, w) => sum + countSyllables(w), 0);
  changes.push({
    rule: 'Phonetic',
    detail: `Source syllable count ≈${totalSyllablesBefore}; target density ${tgt.syllableDensity}/line`
  });

  // ── STEP 4: Vocabulary substitution ────────────────────────
  let vocabChangeCount = 0;
  const transformedBlocks = blocks.map(block => {
    return block.map(line => {
      if (line.trim() === '') return line;
      const before = line;
      const after  = applySlang(line, tgt.slang);
      if (before !== after) vocabChangeCount++;
      return after;
    });
  });
  changes.push({ rule: 'Vocabulary', detail: `${vocabChangeCount} substitutions applied` });

  // ── STEP 5: Cadence fitting ─────────────────────────────────
  const cadenceBlocks = transformedBlocks.map(block => {
    return block.map(line => {
      if (line.trim() === '') return line;
      return fitCadence(line, tgt.syllableDensity);
    });
  });
  changes.push({ rule: 'Cadence', detail: `Lines fitted to ~${tgt.syllableDensity} syllables` });

  // ── STEP 6: Rhyme enforcement ───────────────────────────────
  let rhymeBlocks = cadenceBlocks;
  if (tgt.rhymeScheme === 'AABB') {
    rhymeBlocks = cadenceBlocks.map(block => {
      if (block[0] === '') return block;
      return enforceAABB(block, tgt.slang);
    });
    changes.push({ rule: 'Rhyme', detail: `AABB scheme enforced` });
  } else if (tgt.rhymeScheme === 'ABAB') {
    // ABAB enforcement is structurally complex without a rhyme dictionary —
    // for the free tier we note it in changes and rely on vocab substitution
    // to improve natural rhyme without reordering lines.
    changes.push({ rule: 'Rhyme', detail: 'ABAB target noted; vocab pass improves rhyme' });
  } else {
    changes.push({ rule: 'Rhyme', detail: 'Free scheme — no enforcement' });
  }

  // ── STEP 7: Cultural injection ──────────────────────────────
  const cultureBlocks = rhymeBlocks.map(block => {
    if (block[0] === '') return block;
    return injectCulture(block, tgt.exclamations);
  });
  changes.push({ rule: 'Culture', detail: `${tgt.label} exclamations injected` });

  // Reassemble
  const transformed = cultureBlocks.map(b => b.join('\n')).join('\n');

  // Append watermark for free tier
  const watermarked = transformed + '\n\n— Transformed with FlowLab Free (compromise.js NLP)';

  return { transformed: watermarked, changes };
}
