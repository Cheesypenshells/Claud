// Varian & aksen bahasa Inggris dunia. tts/stt = kode bahasa untuk suara & pengenalan suara di browser
// (suara yang tersedia tergantung perangkat; kalau tidak ada, browser memakai suara Inggris lain).
export const ENGLISH_VARIETIES = {
  us: { label: "Amerika (General American)", flag: "🇺🇸", tts: "en-US", stt: "en-US",
    prompt: "General American English: American spelling and vocabulary (apartment, cookie, vacation, gonna/wanna), everyday US slang (awesome, hang out, my bad, for real)." },
  gb: { label: "British (London / RP)", flag: "🇬🇧", tts: "en-GB", stt: "en-GB",
    prompt: "British English (London / Southern England): British vocabulary and spelling (flat, biscuit, queue, mate, cheers, brilliant, knackered, fancy a cuppa?, innit in casual London speech), understatement and dry humour, question tags." },
  au: { label: "Australia", flag: "🇦🇺", tts: "en-AU", stt: "en-AU",
    prompt: "Australian English: Aussie slang and shortenings (arvo, brekkie, servo, maccas, reckon, heaps, no worries, how ya going?, mate), relaxed, cheeky banter (taking the mickey)." },
  ie: { label: "Irlandia", flag: "🇮🇪", tts: "en-IE", stt: "en-IE",
    prompt: "Irish English: Hiberno-English features (I'm after doing it = I just did it, so I am, grand, craic, giving out = complaining, eejit, yer man), warm storytelling rhythm." },
  sc: { label: "Skotlandia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", tts: "en-GB", stt: "en-GB",
    prompt: "Scottish English (light Scots): wee, aye, nae, cannae/dinnae, ken (know), braw, dreich (grey wet weather), lassie/laddie, used naturally and explained." },
  in: { label: "India", flag: "🇮🇳", tts: "en-IN", stt: "en-IN",
    prompt: "Indian English: features like 'only' and 'itself' for emphasis, 'prepone', 'do the needful', 'timepass', 'yaar', 'na?' as a tag, 'kindly', polite formality mixed with Hinglish words." },
  ng: { label: "Nigeria (+ Pidgin)", flag: "🇳🇬", tts: "en-NG", stt: "en-NG",
    prompt: "Nigerian English with natural Naija Pidgin mixed in: How far? (how are you), Abeg (please), Wahala (trouble) / No wahala, Oya (come on), Wetin (what), I dey (I'm fine/I'm here), Sha, Ehen, Chop (eat), 'I'm coming' (= hold on, be right back), 'well done' as a greeting to someone working, respectful 'Sir/Ma'. Explain Pidgin phrases the first time." },
  aave: { label: "African American English (AAVE)", flag: "🇺🇸", tts: "en-US", stt: "en-US",
    prompt: "African American English (AAVE), a full dialect with its own grammar: habitual 'be' (she be working = she usually works), copula deletion (he cool), 'finna' (about to), 'ain't', 'y'all', 'bet' (okay), 'no cap' (for real), 'on God', 'it's giving…', 'lowkey/highkey', 'fr'. Use it naturally and confidently, explain the grammar respectfully as a legitimate dialect (not 'bad English'), and show the Standard English equivalent. NEVER use slurs (including the n-word) and never caricature." },
  sg: { label: "Singapura (Singlish)", flag: "🇸🇬", tts: "en-SG", stt: "en-SG",
    prompt: "Singapore English with Singlish: discourse particles lah, leh, lor, meh, hor; 'can or not?', 'shiok', 'paiseh', 'chope', 'makan', 'alamak', 'kiasu' — note the Malay words Indonesians will recognise." },
  za: { label: "Afrika Selatan", flag: "🇿🇦", tts: "en-ZA", stt: "en-ZA",
    prompt: "South African English: 'now now' vs 'just now' (later), 'lekker' (great), 'braai' (barbecue), 'howzit', 'eish', 'shame' (aww), 'robot' (traffic light), 'ja/nee'." },
  jm: { label: "Jamaika (+ Patois)", flag: "🇯🇲", tts: "en-JM", stt: "en-US",
    prompt: "Jamaican English with some Jamaican Patois: Wah gwaan (what's up), mi deh yah (I'm here/fine), irie (good), likkle (little), yuh (you), soon come, nuh worry. Explain Patois phrases the first time." },
};

export function varietyPrompt(id) {
  const v = ENGLISH_VARIETIES[id] ?? ENGLISH_VARIETIES.us;
  return `# English variety: ${v.label}
Speak this variety of English: ${v.prompt}
- Be authentic and respectful — like a real local speaker, never a caricature or stereotype. Keep it understandable for the learner's level.
- When a distinctive word, phrase or grammar feature appears, briefly explain it in Indonesian and give the Standard English equivalent.
- If the learner asks about the accent, describe pronunciation features in words (e.g. dropped r, vowel sounds, rhythm), since they also hear it through a ${v.tts} voice.`;
}
