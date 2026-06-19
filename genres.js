// genres.js — Single source of truth for all genre data.
// Loaded as a plain <script> tag in the browser (sets window.GENRES)
// AND required() by /api/transform.js in Node (module.exports).
// Edit this file once; both paths stay in sync automatically.

const GENRES = {
  afrobeat: {
    label: 'Afrobeat', emoji: '🥁',
    slang: {
      'you': 'you', "don't know": 'no sabi', 'come': 'come now', 'what': 'wetin',
      'problem': 'wahala', 'understand': 'sabi', 'boss': 'oga', 'please': 'abeg',
      'they': 'dem', 'is': 'na', 'this': 'dis', 'that': 'dat', 'the': 'di',
      'are': 'dey', 'going': 'dey go', 'friend': 'paddy', 'money': 'owo',
      'woman': 'sisi', 'man': 'omo', 'god': 'olorun', 'yes': 'yes o'
    },
    exclamations: ['Ehn!', 'Chai!', 'Omo!', 'Aye!', 'Abeg!', 'E choke!'],
    rhymeScheme: 'AABB',
    syllableDensity: 6,
    aiPrompt: "Transform into authentic Afrobeat. Use Nigerian Pidgin English naturally (na, wetin, wahala, sabi, oga, abeg, dem, dis, dey). Sprinkle Yoruba/Igbo (omo, e choke, oya, chai, shey). Swung syncopated syllable flow. Short punchy hooks. Themes: love, hustle, dance, God, money. AABB rhyme or loose internal rhyme. Exclamations: ehn!, chai!, aye!. Call-and-response patterns."
  },
  hiphop: {
    label: 'Hip-Hop', emoji: '🎤',
    slang: {
      'money': 'bread', 'friend': 'homie', 'woman': 'shorty', 'man': 'dude',
      'going': 'finna', 'very': 'mad', 'good': 'hard', 'understand': 'feel me',
      'look': 'peep', 'tell': 'put on', 'amazing': 'crazy', 'yes': 'no cap',
      'really': 'deadass', 'cool': 'fresh', 'fight': 'beef', 'succeed': 'make it'
    },
    exclamations: ['Aye!', 'No cap!', 'Facts!', 'Deadass!', 'Lowkey!'],
    rhymeScheme: 'AABB',
    syllableDensity: 12,
    aiPrompt: "Transform into authentic Hip-Hop. Dense multisyllabic rhyme schemes. AAVE and urban American slang. Wordplay, punchlines, metaphors. On-beat punchy cadence. Strong narrative: hustle, identity, flex, social commentary. Anthemic or earworm hooks. Emphasis on lyrical cleverness."
  },
  rnb: {
    label: 'R&B / Soul', emoji: '🎵',
    slang: {
      'love': 'feel you', 'want': 'crave', 'need': 'ache for', 'leave': 'drift away',
      'stay': 'hold on', 'heart': 'soul', 'sad': 'broken', 'happy': 'whole',
      'kiss': 'taste', 'hold': 'wrap around', 'look': 'gaze', 'talk': 'whisper'
    },
    exclamations: ['Oh!', 'Baby!', 'Mmm!', 'Yeah!', 'Come on!'],
    rhymeScheme: 'ABAB',
    syllableDensity: 8,
    aiPrompt: "Transform into authentic R&B/Soul. Smooth melismatic phrasing, syllables feel stretched. Romantic, emotional, vulnerable language. Sensory metaphors (touch, taste, warmth, light). ABAB rhyme, never forced. Emotional climax hooks. Implied vocal runs. Themes: love, longing, heartbreak, desire, devotion."
  },
  reggae: {
    label: 'Reggae', emoji: '🌿',
    slang: {
      'yes': 'irie', 'good': 'ital', 'god': 'Jah', 'system': 'Babylon',
      'home': 'Zion', 'friend': 'bredren', 'woman': 'empress', 'man': 'dread',
      'music': 'riddim', "don't": 'nuh', 'my': 'mi', 'for': 'fi', 'the': 'di',
      'going': 'gwaan', 'love': 'love', 'fight': 'resist', 'free': 'liberate'
    },
    exclamations: ['Irie!', 'Jah!', 'Rastafari!', 'One love!', 'Seen!'],
    rhymeScheme: 'AABB',
    syllableDensity: 6,
    aiPrompt: "Transform into authentic Reggae. Jamaican Patois: irie, riddim, nuh, fi, mi, Jah, Babylon, ital, dread. Offbeat skanking rhythm in phrasing. Philosophical spiritual themes: liberation, Jah, unity, resistance. Chant-like uplifting hooks. Relaxed drawn-out delivery. References to Zion, Babylon, righteous living."
  },
  amapiano: {
    label: 'Amapiano', emoji: '🎹',
    slang: {
      'yes': 'yebo', 'good': 'lekker', 'amazing': 'ayoba', 'problem': 'eish',
      'okay': 'sharp sharp', 'friend': 'homie', 'dance': 'silapha', 'party': 'groove',
      'come': 'woza', 'look': 'bona', 'money': 'mali', 'beautiful': 'mnandii'
    },
    exclamations: ['Ayoba!', 'Eish!', 'Yoh!', 'Sharp!', 'Woo!'],
    rhymeScheme: 'free',
    syllableDensity: 4,
    aiPrompt: "Transform into authentic Amapiano. South African township slang: ayoba, eish, sharp, lekker, yebo, hai. Zulu/Sotho/Tsonga phrases naturally woven in. Very spacious phrasing — lines breathe, silence is part of the groove. Repetitive chant sections, dance call-outs. Themes: dance, joy, township life, party, unity. Short punchy lines, euphoric and communal."
  },
  pop: {
    label: 'Pop', emoji: '⭐',
    slang: {
      'love': 'love', 'heart': 'heart', 'feel': 'feel', 'know': 'know',
      'go': 'go', 'stay': 'stay', 'fight': 'stand up', 'sad': 'down',
      'happy': 'alive', 'want': 'want', 'need': 'need', 'lose': 'fall'
    },
    exclamations: ['Oh!', 'Yeah!', 'Hey!', 'Whoa!', 'Come on!'],
    rhymeScheme: 'ABAB',
    syllableDensity: 8,
    aiPrompt: "Transform into radio-ready Pop. Universal accessible vocabulary. Clear verse-pre-chorus-chorus structure. ABAB or AABB rhyme scheme, clean and satisfying. Hook drops the title or key phrase. Even singable syllable flow. Emotional directness. Themes: love, empowerment, growth, relationships, joy, resilience. Bridge shifts perspective before final chorus."
  }
};

// Dual-export: browser <script> tag sets window.GENRES;
// Node require() in /api/transform.js gets module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GENRES;
} else {
  window.GENRES = GENRES;
}
