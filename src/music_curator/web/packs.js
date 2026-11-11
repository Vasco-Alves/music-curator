"use strict";
/* Everything a pack can change lives here: the jokes and genre moods that come with the app, the packs added on top of them, and the rules a pack has to pass.
   A pack is only data: words, numbers and colors. Nothing in one is ever run, or shown as anything but plain text. */
window.Packs = (() => {
  const VERSION = 1, FILE_LIMIT = 256 * 1024, STORE = "curator-packs", MOODS = ["euphoric", "acid", "hard", "psy"], NEWS_GROUPS = ["", ...MOODS];
  const BUILT_IN = {
    banter: {
      "": ["ARE WE THERE YET", "COFFEE LOW", "CHECK ENGINE. OR DON'T", "PLEASE KEEP YOUR ARMS INSIDE THE SHIP", "DO NOT FEED THE JELLYFISH", "LAST SERVICED: NEVER"],
      euphoric: ["HANDS UP IN SECTOR 7", "BREAKDOWN AHEAD. HOLD ON", "FEELINGS AT 140 BPM", "THE WHALES APPROVE"],
      acid: ["SQUELCH LEVELS RISING", "303 ON THE STARBOARD SIDE", "RESONANCE: YES", "SMILEYS OFF THE BOW"],
      hard: ["BASS SHIELDS FAILING", "EARPLUGS RECOMMENDED", "HULL RATTLING AS INTENDED", "THEY ARE SHOOTING AT US. TURN IT UP"],
      psy: ["THIRD EYE: OPEN", "FRACTALS ON THE HORIZON", "THE TOADSTOOLS ARE DANCING", "KALEIDOSCOPE AHEAD. KEEP LOOKING", "SUNRISE IN 3 HOURS", "THE COLORS ARE LOUDER OUT HERE"],
    },
    signs: [{ bg: "#f2f2ea", ink: "#121212", lines: ["SPEED", "LIMIT", "303"] }, { bg: "#0e6b3c", ink: "#ffffff", lines: ["NEXT RAVE", "2 LIGHT YEARS"] }, { bg: "#b3141a", ink: "#ffffff", lines: ["WRONG", "WAY"] }, { bg: "#f2c10e", ink: "#121212", lines: ["CAUTION", "BLACK HOLES"] }, { bg: "#f2f2ea", ink: "#b3141a", lines: ["NO PARKING", "ON THE EVENT", "HORIZON"] }],
    told: { jump: "JUMPING", stop: "HANDBRAKE ON", trail: "LEAVING A TRAIL", exposure: "HOLD STILL. TAKING A PHOTO", glass: "SOMETHING HIT THE GLASS", cow: "WAS THAT A COW", sign: "OBEY THE SIGNS", vinyl: "VERY LARGE RECORD AHEAD", astronaut: "IS THAT STEVE", gas: "GAS GIANT AHEAD. HOLD ON", sea: "WATER WORLD. BRING A TOWEL", lava: "THAT ONE IS ON FIRE. GOING IN", tuned: "THIS PLANET KNOWS THE SONG", ice: "LOOKS COLD DOWN THERE", toxic: "DO NOT OPEN THE WINDOWS", climb: "PULLING UP" },
    empty: { songs: "Nothing. Not even on a white label.", shelves: "Nothing by that name in the crates.", check: "Nothing left to check. Your ears can rest.", answered: "All answered. Your ears can rest." },
    notes: { late: "3 a.m. Excellent choice.", again: "Still this one? Good." },
  };
  const GENRES = new Map([
    ["euphoric", ["Trance", "Hard Trance", "Progressive Trance", "Nightcore", "Happy Hardcore", "Euro House", "Eurodance", "Italodance", "Progressive House", "Hard House"]],
    ["psy", ["Goa Trance", "Psy-Trance"]],
    ["acid", ["Acid", "Acid Techno", "Acid House"]],
    ["hard", ["Hardcore", "Gabber", "Speedcore", "Frenchcore", "Terror", "Hardstyle", "Jumpstyle", "J-Core", "Breakcore", "Industrial", "Hard Techno", "Freetekno"]],
  ].flatMap(([mood, genres]) => genres.map((genre) => [genre, mood])));

  /* ---------- the rules: anything that doesn't fit is left out ---------- */
  const STRANGE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g; // control characters, and the invisible ones that can make text read differently
  const text = (v, most) => (typeof v === "string" ? v.replace(STRANGE, " ").replace(/\s+/g, " ").trim().slice(0, most).trim() : "");
  const texts = (v, count, most) => (Array.isArray(v) ? [...new Set(v.slice(0, count).map((x) => text(x, most)).filter(Boolean))] : []);
  const color = (v, otherwise) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : otherwise);
  const object = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  const number = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const flag = (v) => (typeof v === "boolean" ? v : undefined);
  function singles(raw, group, most) {
    const given = object(raw);
    return Object.fromEntries(Object.keys(BUILT_IN[group]).map((key) => [key, text(given[key], most)]).filter(([, v]) => v));
  }
  function cleanWords(raw) {
    const w = object(raw), banter = object(w.banter), out = {}, news = Object.fromEntries(NEWS_GROUPS.map((mood) => [mood, texts(banter[mood === "" ? (banter.any ? "any" : "") : mood], 40, 70)]).filter(([, list]) => list.length));
    const signs = Array.isArray(w.signs) ? w.signs.slice(0, 20).map((s) => ({ bg: color(object(s).bg, "#f2f2ea"), ink: color(object(s).ink, "#121212"), lines: texts(object(s).lines, 3, 18) })).filter((s) => s.lines.length) : [];
    if (Object.keys(news).length) out.banter = news;
    if (signs.length) out.signs = signs;
    for (const [group, most] of [["told", 70], ["empty", 80], ["notes", 80]]) { const kept = singles(w[group], group, most); if (Object.keys(kept).length) out[group] = kept; }
    return out;
  }
  function cleanGenres(raw) {
    return Object.fromEntries(Object.entries(object(raw)).slice(0, 400).map(([genre, mood]) => [text(genre, 60), mood]).filter(([genre, mood]) => genre && (MOODS.includes(mood) || mood === "none")));
  }
  const KNOBS = new Set(["light", "react", "speed", "drag", "spark", "nod", "turns", "moves", "shots", "folk", "acid", "band", "pit", "tilt", "vary", "dream", "falls", "color", "echo", "breathe", "sounds"]);
  function cleanSurprise(raw, sized) {
    const s = object(raw), out = {};
    if (["off", "rare", "some", "often", "always"].includes(s.often)) out.often = s.often;
    if (sized) { if (number(s.strength) !== undefined) out.strength = s.strength; if (number(s.secs) !== undefined) out.secs = s.secs; }
    return out;
  }
  function cleanSettings(raw) { // the numbers still get limited where they're used. This only decides what's allowed in at all
    const s = object(raw), out = {}, surprises = object(s.surprises), tuning = object(s.tuning);
    if (Object.keys(surprises).length) {
      out.surprises = { dance: cleanSurprise(surprises.dance, true), bob: cleanSurprise(surprises.bob, true), logo: cleanSurprise(surprises.logo, false), visitors: cleanSurprise(surprises.visitors, false) };
      for (const key of ["clock", "notes", "falling"]) if (flag(surprises[key]) !== undefined) out.surprises[key] = surprises[key];
    }
    const styles = Object.entries(tuning).slice(0, 60).filter(([style]) => /^[a-z]{2,20}$/.test(style)).map(([style, knobs]) => [style, Object.fromEntries(Object.entries(object(knobs)).filter(([k, v]) => KNOBS.has(k) && number(v) !== undefined))]).filter(([, knobs]) => Object.keys(knobs).length);
    if (styles.length) out.tuning = Object.fromEntries(styles);
    if (s.accent === "" || s.accent === "cover" || color(s.accent, "")) out.accent = s.accent;
    if (number(s.moodStrength) !== undefined) out.moodStrength = Math.min(1, Math.max(0, s.moodStrength));
    for (const key of ["vibes", "glow", "flash", "sparkle", "morph"]) if (flag(s[key]) !== undefined) out[key] = s[key];
    if (s.effect === "" || (typeof s.effect === "string" && /^[a-z]{2,20}$/.test(s.effect))) out.effect = s.effect;
    return out;
  }
  function clean(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.curatorPack !== VERSION) return { error: "That file isn't a Pressling pack, or it's for a newer version of the app." }; // the files still say curatorPack inside, so packs made before the name keep working
    const name = text(raw.name, 60);
    if (!name) return { error: "That pack has no name." };
    const pack = { name, by: text(raw.by, 60), about: text(raw.about, 200), words: cleanWords(raw.words), genres: cleanGenres(raw.genres), settings: cleanSettings(raw.settings) };
    if (!Object.keys(pack.words).length && !Object.keys(pack.genres).length && !Object.keys(pack.settings).length) return { error: "There's nothing in that pack the app can use." };
    return { pack };
  }

  /* ---------- what's installed, kept in this browser ---------- */
  function read() {
    let got = {};
    try { got = object(JSON.parse(localStorage.getItem(STORE) || "{}")); } catch { got = {}; }
    const mine = object(got.mine);
    const added = (Array.isArray(got.added) ? got.added : []).map((p) => ({ raw: object(p), made: clean({ ...object(p), curatorPack: VERSION }) })).filter((x) => x.made.pack).map((x) => ({ ...x.made.pack, id: text(x.raw.id, 40) || newId(), on: x.raw.on !== false }));
    return { mine: { words: cleanWords(mine.words), genres: cleanGenres(mine.genres) }, added };
  }
  function newId() { return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`; }
  let saved = read(), merged = null;
  function keep() {
    merged = null;
    try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* it still works until the page is closed */ }
  }
  function compute() { // what comes with the app, then each pack that's on, then your own, which has the last word
    const words = JSON.parse(JSON.stringify(BUILT_IN)), genres = new Map(GENRES);
    for (const layer of [...saved.added.filter((p) => p.on), saved.mine]) {
      for (const [mood, list] of Object.entries(layer.words.banter || {})) words.banter[mood] = [...words.banter[mood], ...list];
      words.signs.push(...(layer.words.signs || []));
      for (const group of ["told", "empty", "notes"]) Object.assign(words[group], layer.words[group] || {});
      for (const [genre, mood] of Object.entries(layer.genres)) genres.set(genre, mood === "none" ? "" : mood);
    }
    merged = { words, genres };
    return merged;
  }
  const now = () => merged || compute();
  function summary(pack) {
    const count = (n, word) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : ""), w = pack.words;
    return [count(Object.values(w.banter || {}).flat().length, "line"), count((w.signs || []).length, "sign"), count(Object.keys(w.told || {}).length + Object.keys(w.empty || {}).length + Object.keys(w.notes || {}).length, "message"), count(Object.keys(pack.genres).length, "genre"), Object.keys(pack.settings).length ? "settings" : ""].filter(Boolean).join(", ");
  }
  return {
    VERSION, MOODS, FILE_LIMIT,
    words: () => now().words,
    moodOf: (genre) => now().genres.get(genre) || "",
    builtInMood: (genre) => GENRES.get(genre) || "",
    added: () => saved.added,
    mine: () => saved.mine,
    summary,
    setMine(next) { saved.mine = { words: cleanWords(next.words), genres: cleanGenres(next.genres) }; keep(); },
    add(fileText) {
      if (fileText.length > FILE_LIMIT) return { error: "That file is too big to be a pack." };
      let raw;
      try { raw = JSON.parse(fileText); } catch { return { error: "That file isn't a Pressling pack." }; }
      const made = clean(raw);
      if (made.error) return made;
      const same = saved.added.findIndex((p) => p.name.toLowerCase() === made.pack.name.toLowerCase()), pack = { ...made.pack, id: same >= 0 ? saved.added[same].id : newId(), on: true }; // a new version of one you have replaces it
      if (same >= 0) saved.added[same] = pack; else saved.added.push(pack);
      keep();
      return { pack };
    },
    toggle(id, on) { const p = saved.added.find((x) => x.id === id); if (p) { p.on = on; keep(); } },
    remove(id) { saved.added = saved.added.filter((x) => x.id !== id); keep(); },
    make: (name, by, settings) => ({ curatorPack: VERSION, name: text(name, 60), by: text(by, 60), words: saved.mine.words, genres: saved.mine.genres, settings: cleanSettings(settings) }), // what goes in a file to share
  };
})();
