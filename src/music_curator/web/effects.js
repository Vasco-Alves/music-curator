"use strict";
/* Pictures made from the sound, for the Now Playing page: the old media player idea, drawn fresh here.
   Kept soft on purpose. A kick comes two or three times a second, so nothing ever flashes the whole screen. */
window.Effects = (() => {
  const TAU = Math.PI * 2, BANDS = 64, POINTS = 256, STARS = 380, PLAIN = [[212, 240, 60], [70, 200, 170], [120, 130, 255]];
  const canvas = Object.assign(document.createElement("canvas"), { id: "fx", hidden: true });
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const stage = canvas.getContext("2d", { alpha: false }), spare = document.createElement("canvas"), back = spare.getContext("2d", { alpha: false });
  let g = stage; // what's being drawn on: the picture, or for a moment the visitors' own layer over the app
  const sound = { bands: new Float32Array(BANDS), wave: new Float32Array(POINTS), bass: 0, mid: 0, treble: 0, level: 0, kick: 0, hat: 0, kickHit: 0, hatHit: 0, t: 0, dt: 0.016 };
  const T = { light: 1, react: 1, speed: 1, drag: 1, spark: 1, nod: 1, turns: 1, moves: 1, shots: 1, folk: 1, pit: 1, tilt: 1, vary: 1, dream: 1, falls: 1 }; // what's been adjusted for the effect showing: 1 is how it was designed
  const STYLES = { // each effect and its styles, by the name a style goes by
    ribbon: [["ribbon", "Classic"], ["silk", "Silk"], ["helix", "Helix"], ["strings", "Strings"]],
    bars: [["bars", "Classic"], ["mirror", "Mirror"], ["leds", "LEDs"], ["terrain", "Landscape"], ["scope", "Scope"]],
    trails: [["trails", "Classic"], ["tunnel", "Tunnel"], ["vortex", "Vortex"], ["prism", "Prism"], ["ripple", "Ripple"], ["comets", "Comets"]],
    stars: [["stars", "Classic"], ["whirl", "Whirl"], ["dust", "Dust"], ["links", "Constellations"], ["fireworks", "Fireworks"]],
    halo: [["halo", "Classic"], ["sun", "Sun"], ["rings", "Rings"], ["mandala", "Mandala"], ["rays", "Rays"]],
    space: [["space", "Voyage"], ["warp", "Warp"], ["drift", "Drift"], ["orbit", "Orbit"], ["well", "Black hole"], ["visitors", "Visitors"]],
    trip: [["kaleido", "Kaleidoscope"], ["plasma", "Plasma"], ["fractal", "Fractal"], ["julia", "Julia"], ["mandel", "Mandelbrot"], ["newton", "Newton"]],
    journey: [["ocean", "Under the sea"], ["neonroad", "Neon road"], ["aurora", "Northern lights"]],
    worlds: [["tube", "Energy tube"], ["heads", "Neon heads"], ["sphere", "Sound sphere"], ["solids", "Shapes in space"], ["city", "Neon city"]],
  };
  const FOLK_OF = { ocean: ["jelly", "whale", "jelly", "shapes"], neonroad: ["neon", "shapes", "saucer", "neon"], aurora: ["saucer", "astronaut", "neon", "saucer"], // some places have their own visitors
    tube: ["shapes", "neon", "eye", "saucer"], heads: ["saucer", "eye", "shapes", "neon"], sphere: ["astronaut", "saucer", "shapes", "jelly"], solids: ["shapes", "saucer", "neon", "astronaut"], city: ["saucer", "neon", "saucer", "shapes"] };
  const FAMILY = Object.fromEntries(Object.entries(STYLES).flatMap(([family, list]) => list.map(([style]) => [style, family])));
  const KNOBS = { light: ["Brightness", 0.3, 1.7], react: ["Reacts to the music", 0.2, 1.8], speed: ["Speed", 0.3, 2], spark: ["Glints on the hi-hats", 0, 2], drag: ["Length of the trails", 0.4, 2.5], nod: ["Nodding to the beat", 0, 2], turns: ["Changes of course", 0, 3], moves: ["Jumps and stops", 0, 3], pit: ["Cockpit", 0, 1], shots: ["Shooting stars", 0, 3], folk: ["Visitors", 0, 3], tilt: ["Turning now and then", 0, 3], vary: ["Changes by itself", 0, 3], dream: ["Dreamy lights", 0, 2], falls: ["Falling into planets", 0, 3] };
  const LEAVES_TRAILS = new Set(["trails", "tunnel", "vortex", "prism", "ripple", "comets", "stars", "whirl", "fireworks", "scope"]);
  const raw = new Float32Array(BANDS), leadHold = new Float32Array(BANDS), leadMid = new Float32Array(512), leadSum = new Float32Array(513), peaks = new Float32Array(160), stars = new Float32Array(STARS * 3), HEADS = 9, past = new Float32Array(HEADS * 2).fill(NaN), orbits = new Float32Array(HEADS);
  let nowSong = "", mood = "", name = "", alone = false, w = 0, h = 0, quality = 1, colors = PLAIN, picture = null, last = 0, slowTime = 0, slowFrames = 0, top = 0.3, waveTop = 0.1, freq = null, time = null, binHz = 23.4;
  let pending = "", morph = null, slowNext = false, quiet = false, dirty = false, clean = null, realNow = 0, hearing = false; // changing from one effect to another: see blend()
  let base = PLAIN, V = {}; // the record's own colors (colors is them as this version of the effect has them), and the version's dials: see VERSIONS
  for (let i = 0; i < STARS; i++) { stars[i * 3] = Math.random() * 2 - 1; stars[i * 3 + 1] = Math.random() * 2 - 1; stars[i * 3 + 2] = Math.random(); }

  function vividColors(img) { // up to three clearly different colors from a picture, the strongest first
    const small = Object.assign(document.createElement("canvas"), { width: 16, height: 16 }).getContext("2d", { willReadFrequently: true });
    small.drawImage(img, 0, 0, 16, 16);
    const d = small.getImageData(0, 0, 16, 16).data, seen = [];
    for (let i = 0; i < d.length; i += 4) {
      const most = Math.max(d[i], d[i + 1], d[i + 2]), least = Math.min(d[i], d[i + 1], d[i + 2]), spread = most - least;
      if (!spread) continue;
      const hue = (most === d[i] ? (d[i + 1] - d[i + 2]) / spread : most === d[i + 1] ? 2 + (d[i + 2] - d[i]) / spread : 4 + (d[i] - d[i + 1]) / spread) * 60;
      seen.push({ rgb: [d[i], d[i + 1], d[i + 2]].map((x) => (x * 255) / most), hue: (hue + 360) % 360, score: (spread / most) * (most / 255) });
    }
    seen.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of seen) {
      if (c.score < 0.25) break; // grey and black labels have no color worth taking
      if (picked.every((p) => Math.min(Math.abs(p.hue - c.hue), 360 - Math.abs(p.hue - c.hue)) > 40)) picked.push(c);
      if (picked.length === 3) break;
    }
    return picked.map((c) => c.rgb);
  }
  const rgba = ([r, gr, b], a) => `rgba(${r | 0},${gr | 0},${b | 0},${a.toFixed(3)})`;
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const around = (part) => { const at = (((part % 1) + 1) % 1) * colors.length, i = Math.floor(at); return mix(colors[i], colors[(i + 1) % colors.length], at - i); }; // a color from anywhere round the palette
  const mean = (from, to) => { let all = 0; for (let b = from; b < to; b++) all += sound.bands[b]; return all / (to - from); };
  function turnHue([r, gr, b], degrees) { // the same color turned round the color wheel, about the grey in the middle, so it stays as light as it was
    if (!degrees) return [r, gr, b];
    const k = (degrees * Math.PI) / 180, c = Math.cos(k), m = (1 - c) / 3, q = Math.sin(k) / Math.sqrt(3), same = c + m, back = m - q, on = m + q;
    return [r * same + gr * back + b * on, r * on + gr * same + b * back, r * back + gr * on + b * same].map((x) => Math.max(0, Math.min(255, x)));
  }

  function fit() { // the picture is soft, so it needs far fewer pixels than the window has
    const across = Math.round(Math.min(innerWidth, 1600) * quality), down = Math.round((across * innerHeight) / innerWidth);
    if (across === w && down === h) return;
    w = canvas.width = spare.width = across;
    h = canvas.height = spare.height = down;
    wipe();
  }
  function wipe() {
    for (const c of [stage, back]) { c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.fillStyle = "#05060a"; c.fillRect(0, 0, w, h); }
    past.fill(NaN);
    twinkles.length = 0;
    shells = [];
    pools.length = 0; // Ripple's own squares: made again when it's next shown
    dirty = false;
    clean = null;
  }
  function keepUp(dt) { // a machine that can't keep up gets fewer pixels, not a stuttering picture
    slowTime += dt;
    if (++slowFrames < 90) return;
    if (slowTime / slowFrames > 0.036 && quality > 0.4) { quality = Math.max(0.4, quality - 0.2); fit(); }
    slowTime = slowFrames = 0;
  }

  function listen(analyser, hit, tick, dt, low) {
    const s = sound;
    if (analyser) {
      if (!freq) { freq = new Uint8Array(analyser.frequencyBinCount); time = new Uint8Array(analyser.fftSize); }
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      const perBin = (binHz = analyser.context.sampleRate / analyser.fftSize), at = (b) => (30 * (16000 / 30) ** (b / BANDS)) / perBin;
      let loudest = 0;
      for (let b = 0; b < BANDS; b++) {
        let v = 0;
        for (let k = Math.floor(at(b)); k <= Math.max(Math.floor(at(b)), Math.ceil(at(b + 1)) - 1); k++) v = Math.max(v, freq[k] || 0);
        raw[b] = v / 255;
        loudest = Math.max(loudest, raw[b]);
      }
      top = Math.max(top * 0.997, loudest, 0.3); // so it looks the same at any volume
      for (let b = 0; b < BANDS; b++) { const v = Math.min(1, clamp(raw[b] / top) ** 2.4 * T.react); s.bands[b] += (v - s.bands[b]) * (v > s.bands[b] ? 0.6 : 0.22); }
      let widest = 0;
      for (let p = 0; p < POINTS; p++) { s.wave[p] = (time[Math.floor((p * time.length) / POINTS)] - 128) / 128; widest = Math.max(widest, Math.abs(s.wave[p])); }
      waveTop = Math.max(waveTop * 0.995, widest, 0.02);
      for (let p = 0; p < POINTS; p++) s.wave[p] *= T.react / waveTop;
    } else { // paused: everything settles
      for (let b = 0; b < BANDS; b++) s.bands[b] *= 0.92;
      for (let p = 0; p < POINTS; p++) s.wave[p] *= 0.9;
    }
    s.bass = mean(0, 10);
    s.mid = mean(10, 36);
    s.treble = mean(50, 64);
    s.level = mean(0, BANDS);
    s.kickHit = hit >= 0 ? (0.55 + 0.45 * hit) * T.react : 0; // these two only on the frame it lands
    s.hatHit = tick >= 0 ? 0.5 + 0.5 * tick : 0;
    s.kick = hit >= 0 ? Math.max(s.kick, s.kickHit) : s.kick * Math.exp(-dt / 0.14);
    s.hat = tick >= 0 ? Math.max(s.hat, s.hatHit) : s.hat * Math.exp(-dt / 0.06);
    follow(!!analyser, hit, dt, low);
  }

  /* How the song is going, from the sound: in its groove, calm (no kick for a while), building (holding back while the highs climb) or dropping (the kick back after a break),
     and how intense this moment is next to the rest of the song. Every effect follows it: calm slows things down, a build sends sparks up faster and faster, and a drop lands with a flash and a wave. */
  const flow = { part: "groove", intensity: 0.5, build: 0, calm: 0, drop: 0, dropHit: 0, since: 9, fast: 0, slow: 0, hiFast: 0, hiSlow: 0, pace: 1, bpm: 0, gaps: [], clock: 0, kickAt: 0, steady: 0, lead: 0, leadHit: 0, leadArmed: true, tune: 0, tuneHit: 0, tuneArmed: true, tone: 0, flux: 0, floor: 0.19, bare: 0.13,
    thump: 0, gone: 9, asked: 9, watch: 0, peak: 0, counted: false, due: 0, run: 0, spare: 0, beat: 0, under: 0 }; // this line is kickBack's
  sound.flow = flow;
  /* The kick coming back after a break, which is what a drop is. A break is seldom empty: toms, a bass note or a soft kick thump along in it, and the first of them used to be taken for the kick, so the drop came early.
     So a hit only counts as the kick once it gets as big as this song's kick: six tenths of what's usual (thump), which is learned from the hits that count. How big a hit gets is watched for a moment after it starts.
     A hit that counts after 2.6 seconds with none is the drop. A lone boom may have taken that for itself, so until the kick is running two more may follow it. And a hit twice the usual size is one too: the real kick after an intro of small ones.
     low is how big the low end is just now. While it isn't known (0) every hit counts, which is how it always was. */
  function kickBack(hit, dt, low) {
    let back = false;
    flow.gone += dt;
    flow.asked += dt;
    if (flow.gone > 120) { flow.thump = 0; flow.gone = 9; } // two minutes with nothing counting: what's usual was learned wrong, so it's learned again
    if (hit >= 0) { flow.watch = 0.07; flow.peak = 0; flow.counted = false; flow.due = 0; if (flow.since > 1.25) flow.beat = 0; }
    if (flow.watch <= 0) return false;
    flow.peak = Math.max(flow.peak, low);
    const jump = flow.thump > 0 && flow.peak >= 2 * flow.thump;
    if (!flow.counted && (!(low > 0) || flow.peak >= Math.max(0.03, 0.6 * flow.thump))) {
      flow.counted = true;
      flow.run = flow.gone < 1.25 ? flow.run + 1 : 1;
      if (flow.run >= 3) flow.spare = 0; // the kick is running: the break is over
      flow.due = flow.gone > 2.6 ? 2 : flow.spare > 0 && flow.gone > 1.1 ? 1 : 0;
      flow.gone = 0;
    }
    if (flow.due && !(low > 0 && flow.beat >= 4 && flow.peak < 1.3 * flow.under)) { back = true; flow.spare = flow.due > 1 ? (low > 0 ? 2 : 0) : flow.spare - 1; flow.due = 0; } // not at the end of a steady run of smaller hits that this one is no bigger than: then it's what's usual that drifted, and nothing dropped
    if (flow.counted && jump && flow.asked > 2.6) back = true;
    flow.watch -= dt;
    if (flow.watch <= 0 && flow.peak > 0) { // the moment is over, and what's usual takes it in: quickly from a bigger kick, slowly from a smaller one, and hardly at all from a hit that didn't count
      if (flow.counted) { flow.thump += (flow.peak - flow.thump) * (!flow.thump ? 1 : flow.peak > flow.thump ? 0.3 : 0.05); flow.beat = 0; }
      else { if (flow.thump) flow.thump += (flow.peak - flow.thump) * 0.003; flow.under = flow.beat ? flow.under + (flow.peak - flow.under) * 0.3 : flow.peak; flow.beat++; }
    }
    if (back) flow.asked = 0;
    return back;
  }
  function follow(heard, hit, dt, low) {
    flow.dropHit = 0;
    flow.leadHit = flow.tuneHit = 0;
    if (!heard) return; // paused: it stays as it was
    let all = 0, high = 0;
    for (let b = 0; b < BANDS; b++) all += raw[b];
    for (let b = 50; b < BANDS; b++) high += raw[b];
    all /= BANDS;
    high /= BANDS - 50;
    const ease = (to, from, tau) => from + (to - from) * Math.min(1, dt / tau), back = kickBack(hit, dt, low); // before since is set again: it wants the time since the hit before this one
    flow.since = hit >= 0 ? 0 : flow.since + dt;
    flow.clock += dt;
    if (hit >= 0) { // the tempo, from the gaps between the last kicks
      const gap = flow.clock - flow.kickAt;
      if (gap > 0.25 && gap < 1.2) { flow.gaps.push(gap); if (flow.gaps.length > 16) flow.gaps.shift(); }
      flow.kickAt = flow.clock;
    }
    if (flow.gaps.length >= 6) flow.bpm = Math.round(60 / [...flow.gaps].sort((a, b) => a - b)[flow.gaps.length >> 1]);
    flow.fast = ease(all, flow.fast, 1.2);
    const heardFor = Math.max(1, flow.clock); // the very first readings come in low, and with the slow easing alone they held "usual" down for a minute: everything looked intense, and the highs looked like they were climbing. So at the start, usual is simply all that's been heard so far
    flow.slow = flow.slow ? ease(all, flow.slow, Math.min(24, heardFor)) : all; // the song's usual level, over the last half a minute or so
    flow.hiFast = ease(high, flow.hiFast, 0.8);
    flow.hiSlow = flow.hiSlow ? ease(high, flow.hiSlow, Math.min(6, heardFor)) : high;
    const kicking = flow.since < 1.4, rising = flow.hiFast - flow.hiSlow;
    flow.steady = flow.gone < 1.4 ? flow.steady + dt : 0; // how long the song's own kick has been running. Past eight seconds it's in its groove, and highs that climb there (a hat coming in, a filter opening) aren't a build: nothing is being held back
    if (back) { flow.drop = 1; flow.dropHit = 1; flow.build = 0; }
    flow.drop = Math.max(0, flow.drop - dt / (flow.gone > 1.4 ? 2 : 12)); // a drop is felt for about twelve seconds, or two once the kick has stopped again: a lone boom isn't one
    flow.build = kicking && flow.drop > 0.2 ? Math.max(0, flow.build - dt) : clamp(flow.build + dt * (rising > 0.015 && flow.steady < 8 ? 0.14 + rising * 4 : flow.since > 2 ? (flow.build < 0.25 ? 0.01 : -0.03) : -0.2)); // with no kick it creeps up, but only to just under where a "build" starts: music without a kick isn't one long build. And a build that has stopped climbing ebbs away slowly, so a held top before the drop still counts
    flow.calm = ease(!kicking && rising <= 0.015 ? 1 : 0, flow.calm, 1.5);
    flow.intensity = ease(clamp(0.5 + (flow.fast - flow.slow) * 4 + (kicking ? 0.15 : -0.15) + 0.3 * flow.drop), flow.intensity, 0.8);
    flow.part = flow.drop > 0.35 ? "drop" : flow.build > 0.3 ? "build" : flow.calm > 0.6 ? "calm" : "groove";
    /* The lead: the big melody of a trance or hardstyle track. Held notes stand up out of the spectrum like the teeth of a comb, where drums and noise leave it smooth, however loud they are.
       So it's how jagged the middle of the spectrum is (tone), next to how jagged this song usually is (floor), and only while what's up there stays put from one moment to the next (flux).
       All three come from differences between loudnesses, so the volume it's played at makes no difference. A singer or a pad counts as well, which suits what it's for. */
    const from = Math.round(470 / binHz), n = Math.max(1, Math.min(512, Math.round(4500 / binHz), freq.length - from)), half = Math.max(2, Math.round(187 / binHz));
    let comb = 0, moved = 0;
    for (let k = 0; k < n; k++) { leadMid[k] += (freq[from + k] / 255 - leadMid[k]) * Math.min(1, dt / 0.12); leadSum[k + 1] = leadSum[k] + leadMid[k]; }
    for (let k = 0; k < n; k++) { const a = Math.max(0, k - half), b = Math.min(n, k + half + 1); comb += Math.abs(leadMid[k] - (leadSum[b] - leadSum[a]) / (b - a)); } // each one against the ones around it
    for (let b = 26; b < 52; b++) { moved += Math.abs(raw[b] - leadHold[b]); leadHold[b] += (raw[b] - leadHold[b]) * Math.min(1, dt / 0.15); }
    flow.tone = ease((comb / n) * 10, flow.tone, 0.5);
    flow.flux = ease((moved / 26) * 10, flow.flux, 0.6);
    flow.floor = ease(flow.tone, flow.floor, flow.tone < flow.floor ? 4 : 240); // the song's usual: down in a few seconds, up over minutes
    const want = clamp((flow.tone - Math.max(0.22, flow.floor + 0.03)) / 0.1) * clamp((0.62 - flow.flux) / 0.14);
    flow.lead = ease(want, flow.lead, want > flow.lead ? 1 : 2.5); // it comes up quicker than it goes
    if (flow.lead > 0.55 && flow.leadArmed) { flow.leadHit = 1; flow.leadArmed = false; } else if (flow.lead < 0.3) flow.leadArmed = true; // once as it comes in, and again only after it's gone
    /* And the tune: anything with notes in it at all, held or not. An acid line, a techno stab, chords, a voice. One low voice makes a shallow comb, so there's no bar it must reach:
       only more of it than this song has with nothing but its drums (bare), which is the usual again, but so slow to rise that a line playing all the way through still counts at the end.
       It only comes down while the kick runs: a silence or a quiet passage has less in it than the drums do, and isn't what a tune is measured against. */
    if (kicking || flow.tone > flow.bare) flow.bare = Math.max(0.08, ease(flow.tone, flow.bare, flow.tone < flow.bare ? 4 : 600));
    const some = clamp((flow.tone - flow.bare - 0.03) / 0.09);
    flow.tune = ease(some, flow.tune, some > flow.tune ? 1 : 2.5);
    if (flow.tune > 0.55 && flow.tuneArmed) { flow.tuneHit = 1; flow.tuneArmed = false; } else if (flow.tune < 0.3) flow.tuneArmed = true;
    const tempo = flow.bpm ? Math.min(1.25, Math.max(0.8, (flow.bpm / 130) ** 0.6)) : 1; // a fast track runs a little quicker, a slow one a little slower
    flow.pace = ease(tempo * (flow.part === "drop" ? 1.2 + 0.3 * flow.drop : flow.part === "build" ? 1 + 0.3 * flow.build : flow.part === "calm" ? 0.75 : 1), flow.pace, 0.6); // how fast the picture runs
  }
  /* The melody's own lights. While a big lead plays, beams of light come down from above, circles of light out of focus drift up, motes rise and glint, and every color goes a little paler:
     over whatever effect is showing, coming and going slowly, never a flash. Any other tune (an acid line, a stab, chords) brings the same lights part of the way, without the paler colors,
     and the beams keep time with it: slow for held notes, quick for a quick line. How much of it there is goes by the mood of what's playing, and by the Dreamy lights slider. */
  const DREAMS = { euphoric: 1, hard: 1, psy: 0.9 }; // how much of it each mood gets: anything else gets 0.8
  const TUNES = { acid: 1, psy: 0.7, euphoric: 0.45, hard: 0.45 }; // and how far a tune that isn't a big lead brings them: all the way where the line is the song, less where a real lead is still to come, 0.6 for anything else
  const dream = { on: 0, held: 0, bloom: 0, t: 0, dt: 0, done: false, orbs: null, motes: [], glow: new Float32Array(6), sheet: null, ink: null, art: null, inked: "" };
  const dreamShare = () => T.dream * (DREAMS[mood] ?? 0.8);
  const dreaming = () => dream.on > 0.004 || dream.bloom > 0 || dream.motes.length > 0;
  const mote = (x, y, fast = 1) => ({ x, y, vy: -rnd(0.02, 0.07) * fast, sway: rnd(0, TAU), life: rnd(2.5, 5), age: 0, size: rnd(0.012, 0.03) }); // all as parts of the picture, so a change of its size doesn't move them
  function dreamNow(dt) { // how much of it there is this frame, before anything is drawn: the colors and the pictures that fade in place need to know
    const share = dreamShare(), part = Math.min(1, dt / 0.6), flight = (n) => { for (let i = Math.round(n * Math.min(1.5, share)); i > 0; i--) dream.motes.push(mote(rnd(0.2, 0.8), rnd(0.6, 1), 2.2)); };
    dream.on += ((hearing ? Math.max(flow.lead, flow.tune * (TUNES[mood] ?? 0.6)) * share : 0) - dream.on) * part;
    dream.held += ((hearing ? flow.lead * share : 0) - dream.held) * part; // the big lead by itself: the paler colors are for that alone
    dream.dt = dt;
    dream.t += dt;
    if (flow.leadHit && T.dream) { // as the lead comes in: a bloom of light, and a flight of motes going up
      dream.bloom = 1;
      flight(24);
    }
    if (flow.tuneHit && T.dream) flight(10); // and a smaller flight for any tune
  }
  function dreamBehind() { // for a picture with something in front of it (the cockpit): the lights go in now, out beyond the glass, and not again over everything
    if (dream.done || morph || !dreaming()) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    drawDream(dream.dt, Math.max(w, h));
    g.restore();
    dream.done = true;
  }
  function dreamArt() { // painted once, in white: a beam with soft edges, wider and fainter as it goes, and under it a circle of light out of focus, brighter round its rim
    const W = 128, L = 384, [c, p] = paper(W, L + W);
    for (let y = 0; y < L; y++) {
      const part = y / L, half = W * (0.08 + 0.42 * part), a = Math.min(1, part / 0.05) * (1 - part) ** 1.5, across = p.createLinearGradient(W / 2 - half, 0, W / 2 + half, 0);
      for (const [at, much] of [[0, 0], [0.2, 0.1], [0.35, 0.5], [0.5, 1], [0.65, 0.5], [0.8, 0.1], [1, 0]]) across.addColorStop(at, `rgba(255,255,255,${(a * much).toFixed(3)})`);
      p.fillStyle = across;
      p.fillRect(0, y, W, 1);
    }
    const disc = p.createRadialGradient(W / 2, L + W / 2, 0, W / 2, L + W / 2, W / 2);
    for (const [at, much] of [[0, 0.5], [0.7, 0.45], [0.86, 0.8], [0.93, 0.45], [1, 0]]) disc.addColorStop(at, `rgba(255,255,255,${much})`);
    p.fillStyle = disc;
    p.fillRect(0, L, W, W);
    return c;
  }
  function drawDream(dt, most) {
    const lit = dream.on, size = Math.min(w, h), set = mood ? moodColors(3) : colors, tones = [0, 1, 2].map((i) => mix(set[i % set.length], [255, 255, 255], 0.2)), ink = tones.map((c) => c.map(Math.round).join()).join(";"); // in the mood's colors or the record's, a little paler: colored light, not fog
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (!dream.art) { dream.art = dreamArt(); [dream.sheet, dream.ink] = paper(384, 512); }
    if (ink !== dream.inked) { // the white art three times side by side, each in one of the colors
      const p = dream.ink;
      dream.inked = ink;
      p.globalCompositeOperation = "source-over";
      p.clearRect(0, 0, 384, 512);
      for (let i = 0; i < 3; i++) p.drawImage(dream.art, i * 128, 0);
      p.globalCompositeOperation = "source-atop";
      for (let i = 0; i < 3; i++) { p.fillStyle = rgba(tones[i], 1); p.fillRect(i * 128, 0, 128, 512); }
    }
    if (lit > 0.004) {
      const breath = 0.75 + 0.25 * Math.sin(dream.t * 0.5) + 0.3 * sound.mid, sx = w / 2 + Math.sin(dream.t * 0.07) * w * 0.12, sy = -h * 0.2, veil = g.createRadialGradient(sx, sy, 0, sx, sy, h * 1.15), haze = g.createLinearGradient(0, h, 0, h * 0.72);
      veil.addColorStop(0, rgba(tones[0], Math.min(1, 0.22 * lit * breath))); // a glow where the beams come from, breathing: the middle of the picture stays dark
      veil.addColorStop(0.4, rgba(tones[1], Math.min(1, 0.05 * lit * breath)));
      veil.addColorStop(1, rgba(tones[1], 0));
      g.fillStyle = veil;
      g.fillRect(0, 0, w, h);
      haze.addColorStop(0, rgba(tones[2], Math.min(1, 0.07 * lit))); // and a little haze along the bottom
      haze.addColorStop(1, rgba(tones[2], 0));
      g.fillStyle = haze;
      g.fillRect(0, h * 0.72, w, h * 0.28);
      const long = h * 1.55, fan = Math.atan2(w * 0.55, h * 1.2) / 2.5, keeps = 0.25 - 0.18 * clamp((flow.flux - 0.4) / 0.3); // the beams fan out as wide as the screen is
      for (let i = 0; i < 6; i++) { // each one's light follows its own part of the melody's range: slowly while the notes are held, quicker for a quick line
        dream.glow[i] += (sound.bands[28 + i * 4] - dream.glow[i]) * Math.min(1, dt / keeps);
        const lean = (i - 2.5) * fan + 0.45 * fan * Math.sin(dream.t * 0.13 + i * 1.7), wide = long * fan * (1.1 + 0.35 * Math.sin(dream.t * 0.09 + i)), c = Math.cos(lean), s = Math.sin(lean);
        g.globalAlpha = Math.min(1, 0.32 * lit * (0.35 + 0.65 * dream.glow[i]));
        g.setTransform(c, s, -s, c, sx, sy);
        g.drawImage(dream.sheet, (i % 3) * 128, 0, 128, 384, -wide / 2, 0, wide, long);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (!dream.orbs) dream.orbs = Array.from({ length: 18 }, (_, i) => ({ x: rnd(0, 1), y: rnd(-0.1, 1.1), r: rnd(0.03, 0.11), rise: rnd(0.006, 0.02), sway: rnd(0, TAU), tone: i % 3, breath: rnd(0, TAU) }));
      for (const o of dream.orbs) { // the larger ones are fainter, as if nearer and further out of focus
        o.y -= o.rise * dt;
        if (o.y < -0.15) { o.y = 1.15; o.x = rnd(0, 1); }
        const r = o.r * size * (1 + 0.08 * Math.sin(dream.t * 0.3 + o.breath) + 0.06 * sound.kick), x = (o.x + 0.03 * Math.sin(dream.t * 0.21 + o.sway)) * w;
        g.globalAlpha = Math.min(1, 0.16 * lit * (0.06 / o.r) ** 0.5 * (0.6 + 0.4 * Math.sin(dream.t * 0.37 + o.breath)));
        g.drawImage(dream.sheet, o.tone * 128, 384, 128, 128, x - r, o.y * h - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      for (let n = 14 * Math.min(1.5, lit) * dt; n > Math.random() && dream.motes.length < 70; n--) dream.motes.push(mote(rnd(0, 1), rnd(0.35, 1.05)));
    }
    for (let i = dream.motes.length - 1; i >= 0; i--) { // the motes live out their own time, also once the lead has gone
      const m = dream.motes[i], part = (m.age += dt) / m.life;
      if (part > 1) { dream.motes.splice(i, 1); continue; }
      m.y += m.vy * dt;
      glint((m.x + 0.012 * Math.sin(dream.t * 0.9 + m.sway)) * w, m.y * h, m.size * size * (1 + 0.5 * sound.hat), Math.sin(part * Math.PI) ** 1.5 * (0.55 + 0.45 * Math.sin(dream.t * 3 + m.sway)) * 0.8);
    }
    if (dream.bloom > 0) { // the bloom: up in a third of a second, away over two
      const p = 1 - dream.bloom, much = (p < 0.15 ? p / 0.15 : (1 - (p - 0.15) / 0.85) ** 1.6) * Math.min(1, dreamShare()), glow = g.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, most * (0.25 + 0.65 * p));
      glow.addColorStop(0, rgba(mix(tones[0], [255, 255, 255], 0.5), 0.28 * much));
      glow.addColorStop(0.4, rgba(tones[0], 0.12 * much));
      glow.addColorStop(1, rgba(tones[0], 0));
      g.fillStyle = glow;
      g.fillRect(0, 0, w, h);
      dream.bloom = Math.max(0, dream.bloom - dt / 2.5);
    }
  }
  const sparks = []; // rising through a build, thrown out by a drop
  let wave = 0; // the drop's ring and flash, from 1 down to 0
  function drawFlow(dt) {
    const most = Math.max(w, h), lights = dreaming() && !dream.done; // the melody's lights, unless the picture has put them behind something of its own
    dream.done = false;
    if (flow.dropHit) {
      wave = 1;
      if (T.folk && !crowd.folk.some((o) => o.kind === "confetti" || o.kind === "lasers" || o.kind === "disco")) { // and now and then something for the drop
        const r = Math.random() / T.folk;
        if (r < 0.75) meet(mood === "hard" ? (r < 0.5 ? "lasers" : "confetti") : mood === "euphoric" ? (r < 0.35 ? "confetti" : r < 0.6 ? "disco" : "lasers") : r < 0.3 ? "confetti" : r < 0.55 ? "lasers" : "disco");
      }
      for (let i = 0, n = Math.round(60 * T.shots); i < n; i++) { const a = rnd(0, TAU), v = rnd(0.25, 0.9) * most; sparks.push({ x: w / 2, y: h / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.7, 1.4), age: 0, tone: around(rnd(0, 1)) }); }
    }
    if (flow.part === "build" && sparks.length < 160) for (let n = flow.build * T.shots * dt * 60; n > Math.random(); n--) sparks.push({ x: rnd(0, w), y: h + 5, vx: rnd(-0.02, 0.02) * w, vy: -h * (0.25 + 0.9 * flow.build), life: rnd(1.2, 2.2), age: 0, tone: around(rnd(0, 1)), rise: true });
    if (!sparks.length && !wave && !lights) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    if (lights) drawDream(dt, most); // under the sparks and the wave
    g.lineCap = "round";
    g.lineWidth = Math.max(1, most * 0.0025);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age > p.life || p.y < -20) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.rise) { p.vx *= 0.97; p.vy *= 0.97; }
      g.strokeStyle = rgba(mix(p.tone, [255, 255, 255], 0.4), 0.8 * (1 - p.age / p.life));
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); // a short streak along its way
      g.stroke();
    }
    if (wave > 0) {
      g.globalAlpha = wave * 0.9;
      g.strokeStyle = rgba(mix(colors[0], [255, 255, 255], 0.6), 1);
      g.lineWidth = most * 0.012 * wave;
      g.beginPath();
      g.arc(w / 2, h / 2, (1 - wave) * most * 0.8, 0, TAU);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = `rgba(255,255,255,${(0.3 * wave ** 3 * T.light).toFixed(3)})`;
      g.fillRect(0, 0, w, h);
      wave = Math.max(0, wave - dt / 0.9);
    }
    g.restore();
  }

  function backdrop() {
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    const shade = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.max(w, h) * 0.7);
    shade.addColorStop(0, rgba(mix(colors[0], [5, 6, 10], 0.78 - 0.14 * sound.level), 1));
    shade.addColorStop(1, "rgb(5,6,10)");
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
  }

  /* The highs: hi-hats and claps come far quicker than kicks, so all they ever get is a small glint. */
  let glintArt = null;
  function glint(x, y, size, light) { // a small four-pointed star
    if (!glintArt) {
      const S = 64, mid = S / 2, [c, p] = paper(S), arm = (dx, dy) => {
        const fade = p.createLinearGradient(mid - dx, mid - dy, mid + dx, mid + dy);
        fade.addColorStop(0, "rgba(255,255,255,0)");
        fade.addColorStop(0.5, "rgba(255,255,255,1)");
        fade.addColorStop(1, "rgba(255,255,255,0)");
        p.strokeStyle = fade;
        p.beginPath();
        p.moveTo(mid - dx, mid - dy);
        p.lineTo(mid + dx, mid + dy);
        p.stroke();
      };
      p.globalCompositeOperation = "lighter";
      softBlob(p, mid, mid, S * 0.24, [255, 255, 255], 0.8);
      p.lineWidth = 1.7;
      arm(mid, 0);
      arm(0, mid);
      glintArt = c;
    }
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = light;
    g.drawImage(glintArt, x - size / 2, y - size / 2, size, size);
    g.globalAlpha = 1;
  }
  const twinkles = [];
  const twinkle = (x, y, size, life = 0.26) => { if (twinkles.length < 48 && Math.random() < T.spark) twinkles.push({ x, y, size: size * 0.66 * Math.max(1, 0.5 + T.spark / 2), left: life, life }); };
  function drawTwinkles() { // on top of whatever was drawn, and gone in a moment
    if (!twinkles.length) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = twinkles.length - 1; i >= 0; i--) {
      const it = twinkles[i];
      it.left -= sound.dt;
      if (it.left <= 0) { twinkles.splice(i, 1); continue; }
      const part = it.left / it.life;
      glint(it.x, it.y, it.size * (0.45 + 0.55 * part), part);
    }
  }
  function spray(count, at, size) { // for the pictures that are echoed: a few glints drawn into them stream away with everything else
    if (!sound.hatHit) return;
    for (let i = 0, n = Math.round(count * T.spark); i < n; i++) { const [x, y] = at(Math.random()); glint(x, y, size * (0.6 + 0.7 * sound.hatHit), 1); }
  }

  const smooth = (at) => { // the sound at a place along the bands, without steps from one band to the next, so a line stays a curve
    const b = Math.max(1, Math.min(BANDS - 3, Math.floor(at))), part = at - Math.floor(at), s = sound.bands;
    return ((s[b - 1] + 2 * s[b] + s[b + 1]) * (1 - part) + (s[b] + 2 * s[b + 1] + s[b + 2]) * part) / 4;
  };
  function ribbon() { // bundles of threads drifting across, like a waving cloth
    const { t, bass, mid, kick, hatHit } = sound, LINES = 14, step = Math.max(6, w / 150), N = V.bundles, k = V.waves;
    const yAt = (u, r, spread) => h * (0.5 + (r - (N - 1) / 2) * (0.32 / Math.max(1, N - 1))) + Math.sin(u * 3.4 * k + t * 0.55 + r * 2.1 + spread * 1.6) * h * (0.07 + 0.1 * bass)
      + Math.sin(u * 8.2 * k - t * 0.9 + r * 2.1 + spread * 4) * h * (0.012 + 0.03 * mid)
      + spread * h * (0.09 + 0.16 * smooth(u * BANDS * 0.7 + r * 6)) * Math.sin(u * 2.6 * k + t * 0.4 + r);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineWidth = Math.max(1, h / 540);
    for (let r = 0; r < N; r++) {
      for (let l = 0; l < LINES; l++) {
        const spread = l / (LINES - 1) - 0.5;
        g.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          const y = yAt(x / w, r, spread);
          if (x) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.strokeStyle = rgba(colors[r % 3], (0.16 + 0.22 * kick) * (1 - Math.abs(spread) * 1.1));
        g.stroke();
      }
    }
    if (hatHit) for (let i = 0; i < 3; i++) { const u = Math.random(); twinkle(u * w, yAt(u, i % N, rnd(-0.5, 0.5)), h * 0.06); }
  }

  function silk() { // broad sheets of light folding over each other, like the old glass desktop wallpapers
    const { t, bass, kick, hatHit } = sound, step = Math.max(8, w / 120), SHEETS = V.sheets, k = V.waves;
    backdrop();
    g.globalCompositeOperation = "lighter";
    for (let r = 0; r < 3; r++) {
      const paint = g.createLinearGradient(0, 0, w, 0), a = colors[r], b = colors[(r + 1) % 3], phase = r * 2.3, base = h * (0.33 + r * 0.17);
      paint.addColorStop(0, rgba(a, 0.2));
      paint.addColorStop(0.3, rgba(a, 1));
      paint.addColorStop(0.7, rgba(mix(a, b, 0.7), 1));
      paint.addColorStop(1, rgba(b, 0.2));
      for (let f = 0; f < SHEETS; f++) {
        const fold = f / (SHEETS - 1) - 0.5, sheet = new Path2D(), edge = new Path2D(), under = [];
        for (let x = 0; x <= w + step; x += step) {
          const u = x / w, y = base + fold * h * 0.05 + Math.sin(u * 2.4 * k + t * 0.32 + phase + fold) * h * (0.1 + 0.07 * bass) + Math.sin(u * 5.7 * k - t * 0.46 + phase * 2) * h * 0.024, thick = h * (0.016 + 0.1 * smooth(u * BANDS * 0.7 + r * 7) + 0.035 * bass) * (1.15 + Math.sin(u * 3.3 + t * 0.26 + r + fold * 3));
          if (x) { sheet.lineTo(x, y - thick); edge.lineTo(x, y - thick); } else { sheet.moveTo(x, y - thick); edge.moveTo(x, y - thick); }
          under.push(x, y + thick * 0.4);
          if (hatHit && f === SHEETS >> 1 && Math.random() < 0.008) twinkle(x, y - thick, h * 0.06);
        }
        for (let i = under.length - 2; i >= 0; i -= 2) sheet.lineTo(under[i], under[i + 1]);
        sheet.closePath();
        g.fillStyle = paint;
        g.globalAlpha = 0.07 + 0.09 * kick;
        g.fill(sheet);
        g.strokeStyle = paint;
        g.lineWidth = Math.max(1, h / 620);
        g.globalAlpha = 0.34 + 0.4 * kick;
        g.stroke(edge);
      }
    }
    g.globalAlpha = 1;
  }

  function helix() { // strands wound round each other, with the sound strung between them
    const { t, bass, kick, hatHit } = sound, n = 90, N = V.strands, amp = h * (0.17 + 0.08 * bass), lines = Array.from({ length: N }, () => new Path2D()), width = Math.max(1.6, h / 340) * (1 + kick);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = u * w, phase = u * TAU * V.twists + t * 0.8, y = h / 2 + Math.sin(u * 2.1 + t * 0.2) * h * 0.06, at = (k) => y + Math.sin(phase + (k * TAU) / N) * amp;
      for (let k = 0; k < N; k++) { if (i) lines[k].lineTo(x, at(k)); else lines[k].moveTo(x, at(k)); }
      if (i % 2) continue;
      const v = smooth(u * BANDS * 0.85), pair = (i / 2) % N, a = at(pair), b = at((pair + 1) % N); // with more than two strands the rungs go between each pair in turn
      g.strokeStyle = rgba(around(u * 0.9 + t * 0.03), 0.18 + 0.75 * v);
      g.lineWidth = Math.max(1, h / 450) * (1 + 2.4 * v);
      g.beginPath();
      g.moveTo(x, a);
      g.lineTo(x, b);
      g.stroke();
      if (hatHit && Math.random() < 0.07) twinkle(x, Math.random() < 0.5 ? a : b, h * 0.055);
    }
    lines.forEach((line, k) => neon(line, rgba(colors[k % 3], 1), width, 0.9));
  }

  function strings() { // a row of strings, each plucked by its own part of the sound
    const { t, kick, hatHit } = sound, N = V.count, pad = h * 0.14, gapY = (h - pad * 2) / (N - 1), step = Math.max(6, w / 130), width = Math.max(1, h / 620);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let s = 0; s < N; s++) {
      const v = smooth(((N - 1 - s) / N) * BANDS * 0.9 + 1), y0 = pad + s * gapY, shake = Math.sin(t * (13 + s * 1.9)) * gapY * 3.4 * v * (24 / N) ** 0.5, loops = (1 + (s % 3)) * V.loops, path = new Path2D();
      for (let x = 0; x <= w + step; x += step) { const y = y0 + Math.sin((x / w) * Math.PI * loops) * shake; if (x) path.lineTo(x, y); else path.moveTo(x, y); }
      neon(path, rgba(around(s / N + t * 0.02), 1), width * (1 + 1.6 * v), 0.3 + 0.7 * v + 0.2 * kick, 0.6);
    }
    if (hatHit) for (let i = 0; i < 3; i++) twinkle(rnd(0, w), pad + Math.floor(rnd(0, N * 0.4)) * gapY, h * 0.05);
  }

  function bars() { // the spectrum, with little caps that fall back slowly: standing on the floor, out both ways from the middle, up from the floor and down from the ceiling, or round in a ring
    const n = V.count, layout = V.layout, level = (i) => sound.bands[Math.floor((i / n) * BANDS * 0.92)];
    backdrop();
    for (let i = 0; i < n; i++) peaks[i] = Math.max(level(i), peaks[i] - sound.dt * 0.5);
    if (layout === "circle") {
      const cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.15 + 0.012 * sound.kick), tall = size * 0.3, caps = new Path2D(), ray = (a, from, to) => [cx + Math.cos(a) * from, cy + Math.sin(a) * from, cx + Math.cos(a) * to, cy + Math.sin(a) * to];
      g.lineCap = "butt";
      g.lineWidth = Math.max(1.5, ((TAU * r) / (n * 2)) * 0.62);
      for (let i = 0; i < n * 2; i++) { // both halves, the left the mirror image of the right
        const b = i < n ? i : n * 2 - 1 - i, a = (i / (n * 2)) * TAU - Math.PI / 2, [x0, y0, x1, y1] = ray(a, r, r + Math.max(2, level(b) * tall)), [c0, d0, c1, d1] = ray(a, r + peaks[b] * tall + 4, r + peaks[b] * tall + 6.5);
        g.strokeStyle = rgba(around((b / n) * 0.9), 0.85);
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        caps.moveTo(c0, d0);
        caps.lineTo(c1, d1);
        if (sound.hatHit && b > n * 0.45 && Math.random() < 0.02) twinkle(c1, d1, h * 0.06);
      }
      g.strokeStyle = rgba(mix(colors[0], [255, 255, 255], 0.6), 0.9);
      g.stroke(caps);
      return;
    }
    const side = w * 0.05, gap = w * (n > 90 ? 0.0018 : 0.0035), wide = (w - side * 2 - gap * (n - 1)) / n, split = layout === "split", middle = layout === "middle";
    const floor = middle ? h * 0.5 : split ? h * 0.93 : h * 0.8, tall = middle ? h * 0.62 : split ? h * 0.4 : h * 0.6, ceiling = h * 0.07, capAt = [];
    for (let i = 0; i < n; i++) {
      const x = side + i * (wide + gap), high = Math.max(2, level(i) * tall), c = around((i / n) * 0.9), top = mix(c, [255, 255, 255], 0.55);
      g.fillStyle = rgba(c, 0.82);
      if (middle) { // out both ways from a line across the middle, with a cap at each end
        g.fillRect(x, floor - high / 2, wide, high);
        g.fillStyle = rgba(top, 0.9);
        g.fillRect(x, floor - (peaks[i] * tall) / 2 - 5, wide, 2.5);
        g.fillRect(x, floor + (peaks[i] * tall) / 2 + 2.5, wide, 2.5);
        capAt.push([x + wide / 2, floor - (peaks[i] * tall) / 2 - 5]);
        continue;
      }
      g.fillRect(x, floor - high, wide, high);
      if (split) { // and the spectrum the other way round hanging from the ceiling
        const j = n - 1 - i, down = Math.max(2, level(j) * tall);
        g.fillStyle = rgba(around((j / n) * 0.9), 0.82);
        g.fillRect(x, ceiling, wide, down);
        g.fillStyle = rgba(top, 0.9);
        g.fillRect(x, ceiling + peaks[j] * tall + 2.5, wide, 2.5);
      } else {
        g.fillStyle = rgba(c, 0.14);
        g.fillRect(x, floor + 3, wide, high * 0.32);
      }
      g.fillStyle = rgba(top, 0.9);
      g.fillRect(x, floor - peaks[i] * tall - 5, wide, 2.5);
      capAt.push([x + wide / 2, floor - peaks[i] * tall - 5]);
    }
    if (sound.hatHit) for (let k = 0; k < 3; k++) twinkle(...capAt[Math.floor(rnd(n * 0.45, n))], h * 0.06);
  }

  function mirror() { // the spectrum folded about the middle and standing on black glass
    const { t, dt, hatHit } = sound, n = V.count, side = w * 0.03, gap = w * 0.003, wide = (w / 2 - side - gap * n) / n, floor = h * V.floor, tall = h * Math.min(0.52, V.floor * 0.78);
    backdrop();
    for (let i = 0; i < n; i++) {
      const v = sound.bands[Math.floor((i / n) * BANDS * 0.92)], high = Math.max(2, v * tall), c = around((i / n) * 0.9 + t * 0.02), out = i * (wide + gap) + gap / 2, cap = floor - peaks[i] * tall - 5;
      peaks[i] = Math.max(v, peaks[i] - dt * 0.5);
      for (const x of [w / 2 + out, w / 2 - out - wide]) {
        g.fillStyle = rgba(c, 0.86);
        g.fillRect(x, floor - high, wide, high);
        g.fillStyle = "rgba(255,255,255,.26)"; // the shine down one side
        g.fillRect(x, floor - high, wide * 0.3, high);
        g.fillStyle = rgba(c, 0.2);
        g.fillRect(x, floor + 3, wide, high * 0.5);
        g.fillStyle = rgba(c, 0.09);
        g.fillRect(x, floor + 3 + high * 0.5, wide, high * 0.2);
        g.fillStyle = rgba(mix(c, [255, 255, 255], 0.55), 0.9);
        g.fillRect(x, cap, wide, 2.5);
      }
      if (hatHit && i > n * 0.5 && Math.random() < 0.08) twinkle(w / 2 + (Math.random() < 0.5 ? out : -out), cap, h * 0.06);
    }
    g.fillStyle = "rgba(255,255,255,.22)";
    g.fillRect(side, floor, w - side * 2, 1.5);
  }

  function leds() { // a hi-fi's columns of little lamps, the top ones warming to red
    const { dt, hatHit } = sound, COLS = V.cols, ROWS = Math.round(COLS * 0.67), side = w * 0.09, floor = h * 0.86, tall = h * 0.7, stepX = (w - side * 2) / COLS, stepY = tall / ROWS, lamp = stepX * 0.8, thin = stepY * 0.64, lit = [new Path2D(), new Path2D(), new Path2D()], off = new Path2D(), caps = new Path2D();
    const round = Math.min(lamp, stepY) * 0.4, put = V.lamp === "round" ? (p, x, y) => { p.moveTo(x + lamp / 2 + round, y + thin / 2); p.arc(x + lamp / 2, y + thin / 2, round, 0, TAU); } : V.lamp === "thin" ? (p, x, y) => p.rect(x, y + thin * 0.36, lamp, thin * 0.28) : (p, x, y) => p.rect(x, y, lamp, thin); // little square lamps, round ones, or thin bars of light
    backdrop();
    for (let c = 0; c < COLS; c++) {
      const v = sound.bands[Math.floor((c / COLS) * BANDS * 0.92)], level = Math.round(v * ROWS), x = side + c * stepX;
      peaks[c] = Math.max(v, peaks[c] - dt * 0.35);
      const cap = Math.min(ROWS - 1, Math.round(peaks[c] * ROWS));
      for (let r = 0; r < ROWS; r++) put(r < level ? lit[r < ROWS * 0.62 ? 0 : r < ROWS * 0.85 ? 1 : 2] : r === cap ? caps : off, x, floor - (r + 1) * stepY);
      if (hatHit && c > COLS * 0.55 && Math.random() < 0.1) twinkle(x + lamp / 2, floor - (cap + 0.6) * stepY, h * 0.05);
    }
    g.fillStyle = "rgba(255,255,255,.04)";
    g.fill(off);
    [colors[0], [255, 196, 60], [255, 72, 50]].forEach((tone, k) => { g.fillStyle = rgba(tone, 0.95); g.fill(lit[k]); });
    g.fillStyle = rgba(mix(colors[0], [255, 255, 255], 0.6), 0.95);
    g.fill(caps);
  }

  const RIDGES = 34, ACROSS = 56, land = new Float32Array(RIDGES * ACROSS), landX = new Float32Array(ACROSS), landY = new Float32Array(ACROSS);
  let landAt = 0, landClock = 0;
  function terrain() { // the sound as a landscape: the newest line is the nearest, and it rolls away to the horizon
    const { t, dt, kick, hatHit } = sound, horizon = h * 0.4, WAIT = 0.05;
    landClock += dt;
    if (landClock >= WAIT) {
      landClock %= WAIT;
      landAt = (landAt + RIDGES - 1) % RIDGES;
      for (let a = 0; a < ACROSS; a++) land[landAt * ACROSS + a] = smooth((1 - Math.abs(a / (ACROSS - 1) - 0.5) * 2) * BANDS * 0.7 + 0.5); // the bass up both sides, so it's a valley
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, w, h);
    const dawn = g.createRadialGradient(w / 2, horizon, 0, w / 2, horizon, w * 0.42);
    dawn.addColorStop(0, rgba(colors[0], 0.34 + 0.25 * kick));
    dawn.addColorStop(1, rgba(colors[0], 0));
    g.fillStyle = dawn;
    g.fillRect(0, 0, w, h);
    const R = h * (0.21 + 0.014 * kick) * V.glow, heat = g.createLinearGradient(0, horizon - R, 0, horizon);
    heat.addColorStop(0, rgba(mix(colors[0], [255, 255, 255], 0.4), 1));
    heat.addColorStop(1, rgba(colors[1], 1));
    if (R > 1) {
      g.save();
      g.beginPath();
      g.arc(w / 2, horizon, R, Math.PI, 0);
      g.clip();
      g.fillStyle = heat;
      for (let i = 0; i < 9; i++) g.fillRect(0, horizon - R + (R * i) / 9, w, (R / 9) * (1 - (i / 9) * 0.68));
      g.restore();
    }
    g.lineJoin = "round";
    for (let r = RIDGES - 1; r >= 0; r--) { // the far ones first, so the near ones hide them
      const depth = Math.min(1, (r + landClock / WAIT) / (RIDGES - 1)), near = (1 - depth) ** 2.6, y0 = horizon + (h * 1.04 - horizon) * near, half = w * (0.3 + 0.4 * near), lift = h * (0.012 + 0.3 * near) * V.height, row = (landAt + r) % RIDGES, line = new Path2D(), mesh = V.mesh && r < RIDGES - 1 ? new Path2D() : null;
      for (let a = 0; a < ACROSS; a++) {
        const x = w / 2 + (a / (ACROSS - 1) - 0.5) * 2 * half, y = y0 - land[row * ACROSS + a] * lift;
        if (a) line.lineTo(x, y); else line.moveTo(x, y);
        if (mesh && a % 3 === 0) { mesh.moveTo(x, y); mesh.lineTo(landX[a], landY[a]); } // a line back to the ridge behind, so it's a mesh
        landX[a] = x;
        landY[a] = y;
        if (!r && hatHit && Math.random() < 0.05) twinkle(x, y, h * 0.06);
      }
      const solid = new Path2D(line);
      solid.lineTo(w / 2 + half, h);
      solid.lineTo(w / 2 - half, h);
      solid.closePath();
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "#05060a";
      g.fill(solid);
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = rgba(around(depth * 0.8 + t * 0.03), 0.25 + 0.75 * (1 - depth));
      g.lineWidth = Math.max(1, h / 700) * (1 + 2 * near);
      g.stroke(line);
      if (mesh) g.stroke(mesh);
    }
  }

  function scope() { // an oscilloscope: a glowing trace on a dark green screen, fading slowly like the real thing
    const { wave, kick, hatHit } = sound, tone = mix(colors[0], [130, 255, 180], 0.5), mid = h / 2, left = w * 0.08, wide = w * 0.84, trace = new Path2D();
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = `rgba(3,9,7,${(0.3 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = rgba(tone, 0.055);
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 10; i++) { const x = left + (wide * i) / 10; g.moveTo(x, h * 0.16); g.lineTo(x, h * 0.84); }
    for (let i = 0; i <= 8; i++) { const y = h * 0.16 + (h * 0.68 * i) / 8; g.moveTo(left, y); g.lineTo(left + wide, y); }
    g.stroke();
    const traceAt = V.trace === "xy" ? (p) => [w / 2 + wave[p % POINTS] * h * 0.3, mid + wave[(p + 23) % POINTS] * h * 0.3] // the sound against itself a moment later, which draws loops and figures
      : V.trace === "ring" ? (p) => { const a = (p / POINTS) * TAU - Math.PI / 2, r = h * (0.22 + 0.11 * wave[p % POINTS]); return [w / 2 + Math.cos(a) * r, mid + Math.sin(a) * r]; } // wrapped round into a circle
      : (p) => [left + (wide * p) / (POINTS - 1), mid + wave[p] * h * 0.3];
    for (let p = 0, end = V.trace === "line" ? POINTS - 1 : POINTS; p <= end; p++) { const [x, y] = traceAt(p); if (p) trace.lineTo(x, y); else trace.moveTo(x, y); }
    g.globalCompositeOperation = "lighter";
    g.lineJoin = "round";
    neon(trace, rgba(tone, 1), Math.max(1.4, h / 460), 0.8 + 0.2 * kick);
    if (hatHit) twinkle(...traceAt(Math.floor(rnd(0, POINTS))), h * 0.07);
  }

  /* The trails family: the last frame comes back changed a little and what's new goes on top, so everything streams away from where it was drawn. Speeds go by the clock, so a slow machine sees the same picture. */
  let clearing = 0;
  function echo(zoom, turn, fade, dx = 0, dy = 0, zoomDown = zoom, clear = 1, from = spare) {
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = "#05060a";
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2 + dx, h / 2 + dy);
    g.rotate(turn);
    g.scale(zoom, zoomDown);
    g.globalAlpha = fade ** (1 / T.drag);
    g.drawImage(from, -w / 2, -h / 2, w, h);
    g.restore();
    g.globalAlpha = 1;
    clearing += (clear / T.drag) * sound.dt * 60; // fading by a percentage stalls just above black and leaves a grey ghost, so a little is taken off outright too. The more that is, the shorter the tail
    const take = Math.floor(clearing);
    if (take) {
      clearing -= take;
      g.globalCompositeOperation = "difference";
      g.fillStyle = `rgb(${take},${take},${take})`;
      g.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = "lighter";
    g.lineCap = g.lineJoin = "round";
  }
  function remember() { // this frame is what the next one comes back from
    back.globalCompositeOperation = "source-over";
    back.globalAlpha = 1;
    back.drawImage(canvas, 0, 0);
  }
  function neon(path, paint, width, strength, soft = 1) { // a bright line inside two fainter, wider ones, so it glows instead of looking outlined
    g.strokeStyle = paint;
    for (const [wide, light] of [[5, 0.05 * soft], [2.6, 0.11 * soft], [1, 1]]) {
      g.globalAlpha = light * strength;
      g.lineWidth = width * wide;
      g.stroke(path);
    }
    g.globalAlpha = 1;
  }
  function reachOf(a, form) { // how far out a ring of this shape goes at an angle, where a circle goes 1
    if (form === "star") return 0.76 + 0.26 * Math.cos(5 * a);
    if (form === "flower") return 0.8 + 0.22 * Math.abs(Math.cos(3 * a));
    const n = form === "triangle" ? 3 : form === "square" ? 4 : form === "hexagon" ? 6 : 0, side = TAU / n;
    return n ? ((Math.cos(Math.PI / n) / Math.cos((((a % side) + side) % side) - side / 2)) * (n === 3 ? 1.2 : 1.06)) : 1; // a polygon's corners reach 1 and its sides less
  }
  function soundLoop(cx, cy, rx, ry, spin, depth, every = 1) { // the waveform bent into a closed ring, or into the version's shape, or partway between two shapes while one becomes the other
    const path = new Path2D(), form = V.form && V.form !== "circle" ? V.form : "", over = vary.over.form, part = over === undefined ? 1 : eased(over);
    for (let p = 0; p <= POINTS; p += every) {
      const at = (p / POINTS) * TAU, a = at + spin, shape = (form ? reachOf(at, form) : 1) * part + (part < 1 ? reachOf(at, vary.was.form) * (1 - part) : 0);
      const swell = (1 + sound.wave[p % POINTS] * depth * Math.sin((p / POINTS) * Math.PI)) * shape, x = cx + Math.cos(a) * rx * swell, y = cy + Math.sin(a) * ry * swell;
      if (p) path.lineTo(x, y); else path.moveTo(x, y);
    }
    return path;
  }
  function sweep(cx, cy, spin) { // the record's colors, going round
    if (!g.createConicGradient) return rgba(around(spin / TAU), 1);
    const paint = g.createConicGradient(spin, cx, cy);
    for (let i = 0; i <= 6; i++) paint.addColorStop(i / 6, rgba(around(i / 6), 1));
    return paint;
  }

  function trails() { // the sound as a ring in the middle, streaming outward
    const { t, bass, kick, dt } = sound, pace = dt * 60, spin = turned("trails", 0.15), cx = w / 2, cy = h / 2, r = Math.min(w, h) * (0.13 + 0.08 * bass);
    echo(1 + (0.012 + 0.02 * bass + 0.012 * kick) * pace, (0.0025 + 0.0045 * Math.sin(t * 0.23)) * pace * V.spin, 0.955 ** pace, Math.sin(t * 0.31) * w * 0.0012 * pace, Math.cos(t * 0.27) * h * 0.0016 * pace, undefined, 0.5);
    neon(soundLoop(cx, cy, r, r, spin, 0.42), sweep(cx, cy, spin * 1.4), Math.max(1.5, h / 360) * (1 + kick), 0.65 + 0.35 * kick, 0.55);
    spray(5, (u) => [cx + Math.cos(u * TAU) * r * 1.1, cy + Math.sin(u * TAU) * r * 1.1], h * 0.05);
    remember();
  }

  function tunnel() { // the other way: rings born at the edge sink away into the middle
    const { t, bass, kick, dt } = sound, pace = dt * 60, spin = -turned("tunnel", 0.2), cx = w / 2, cy = h / 2, swell = 0.46 * (1 + 0.05 * bass);
    echo(1 - (0.014 + 0.028 * bass + 0.014 * kick) * pace, (0.004 + 0.007 * Math.sin(t * 0.19)) * pace * V.spin, 0.972 ** pace);
    neon(soundLoop(cx, cy, w * swell, h * swell, spin, 0.07, 2), sweep(cx, cy, spin), Math.max(2, h / 280) * (1 + 0.6 * kick), 0.6 + 0.4 * kick);
    spray(5, (u) => [cx + Math.cos(u * TAU) * w * swell, cy + Math.sin(u * TAU) * h * swell], h * 0.06);
    remember();
  }

  function vortex() { // arms of sound wound into a spiral
    const { t, wave, bass, kick, dt } = sound, pace = dt * 60, reach = Math.hypot(w, h) * 0.5, ARMS = V.arms, spin = turned("vortex", 0.3);
    echo(1 + (0.007 + 0.012 * bass) * pace, (0.03 + 0.03 * bass) * pace * V.spin, 0.955 ** pace);
    for (let arm = 0; arm < ARMS; arm++) {
      const a = (arm / ARMS) * TAU + spin, path = new Path2D(), nx = -Math.sin(a), ny = Math.cos(a);
      for (let p = 0; p < POINTS; p += 2) {
        const part = p / POINTS, along = reach * (0.04 + 0.62 * part), off = wave[p] * reach * 0.06 * Math.sin(part * Math.PI), x = w / 2 + Math.cos(a) * along + nx * off, y = h / 2 + Math.sin(a) * along + ny * off;
        if (p) path.lineTo(x, y); else path.moveTo(x, y);
      }
      neon(path, rgba(around(arm / ARMS + t * 0.05), 1), Math.max(1.5, h / 400) * (1 + kick), 0.5 + 0.4 * kick, 0.5);
      spray(2, (u) => [w / 2 + Math.cos(a) * reach * (0.08 + 0.58 * u), h / 2 + Math.sin(a) * reach * (0.08 + 0.58 * u)], h * 0.05);
    }
    remember();
  }

  function prism() { // a ring wandering about, folded into four like a kaleidoscope
    const { t, bass, kick, dt } = sound, pace = dt * 60, spin = turned("prism", 0.25), cx = w * (0.39 + 0.08 * Math.cos(t * 0.37)), cy = h * (0.37 + 0.1 * Math.sin(t * 0.29)), r = Math.min(w, h) * (0.13 + 0.07 * bass);
    echo(1 + (0.01 + 0.016 * bass + 0.01 * kick) * pace, (0.006 + 0.006 * Math.sin(t * 0.17)) * pace * V.spin, 0.955 ** pace);
    neon(soundLoop(cx, cy, r, r, spin, 0.5), sweep(cx, cy, spin), Math.max(1.5, h / 380) * (1 + kick), 0.65 + 0.35 * kick, 0.55);
    spray(4, (u) => [cx + Math.cos(u * TAU) * r * 1.1, cy + Math.sin(u * TAU) * r * 1.1], h * 0.05);
    g.globalCompositeOperation = "source-over";
    g.setTransform(-1, 0, 0, 1, w, 0);
    g.drawImage(canvas, 0, 0, w / 2, h, 0, 0, w / 2, h);
    g.setTransform(1, 0, 0, -1, 0, h);
    g.drawImage(canvas, 0, 0, w, h / 2, 0, 0, w, h / 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    remember();
  }

  /* Ripple turns now and then, slowly, and settles at a new angle. It's drawn level on a square big enough to be turned any way without the corners showing, and shown turned. */
  const turning = { angle: 0, from: 0, to: 0, start: 0, long: 1, at: 0 }, pools = [];
  function ripple() { // the waveform across the middle, its echoes rolling away up and down like water
    const { t, wave, bass, kick, kickHit, dt } = sound, pace = dt * 60, B = Math.ceil(Math.hypot(w, h)) + 2, W = w, H = h, mid = B / 2;
    if (!turning.at) turning.at = t + rnd(14, 30);
    if (T.tilt && t > turning.at && (kickHit || t > turning.at + 5)) Object.assign(turning, { from: turning.angle, to: turning.angle + (Math.random() < 0.5 ? -1 : 1) * rnd(0.5, 1.6), start: t, long: rnd(7, 12), at: t + 12 + rnd(18, 40) / T.tilt });
    const angle = turning.from + (turning.to - turning.from) * eased(clamp((t - turning.start) / turning.long)), reach = (W / 2) * Math.abs(Math.cos(angle)) + (H / 2) * Math.abs(Math.sin(angle)); // as far as the line has to go for the window to be covered, at this angle
    turning.angle = angle;
    if (!pools.length || pools[0].width !== B) pools.splice(0, 2, paper(B)[0], paper(B)[0]);
    const [now, was] = pools, along = (p) => mid + (p / (POINTS - 1) - 0.5) * 2 * reach, swell = (p, k = 0) => mid + (k - (V.lines - 1) / 2) * H * 0.15 + wave[(p + k * 41) % POINTS] * H * 0.11 * Math.sin((p / (POINTS - 1)) * Math.PI) ** 0.6, keep = [g, w, h];
    [g, w, h] = [now.getContext("2d"), B, B];
    try {
      echo(1 + 0.002 * pace, 0, 0.972 ** pace, 0, 0, 1 + (0.012 + 0.04 * bass + 0.025 * kick) * pace, 0.5, was);
      const paint = g.createLinearGradient(mid - reach, 0, mid + reach, 0);
      for (let i = 0; i <= 6; i++) paint.addColorStop(i / 6, rgba(around(i / 6 + t * 0.06), 1));
      for (let k = 0; k < V.lines; k++) { // one line of the waveform, or a few side by side, each a little later in the sound
        const path = new Path2D();
        for (let p = 0; p < POINTS; p++) { if (p) path.lineTo(along(p), swell(p, k)); else path.moveTo(along(p), swell(p, k)); }
        neon(path, paint, Math.max(1.3, H / 430) * (1 + 0.7 * kick), (0.36 + 0.26 * kick) / Math.sqrt(V.lines), 0.7);
      }
      spray(5, (u) => { const p = Math.floor(u * (POINTS - 1)); return [along(p), swell(p)]; }, H * 0.05);
    } finally { [g, w, h] = keep; }
    pools.reverse(); // this one is what the next comes back from
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.setTransform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), w / 2, h / 2);
    g.drawImage(now, -mid, -mid);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  function comets() { // points of light on looping paths, each quicker when its part of the sound is busy
    const { t, kick, dt } = sound, pace = dt * 60, size = Math.min(w, h);
    echo(1 + 0.0015 * pace, 0.0015 * pace, 0.935 ** pace);
    g.lineCap = "butt"; // round ends would overlap from one frame to the next and show up as beads
    for (let i = 0, n = V.heads; i < n; i++) {
      const share = i / n, v = smooth((share + 0.05) * BANDS * 0.85);
      orbits[i] += dt * (0.3 + 1.6 * v + 1.2 * kick);
      const turn = orbits[i] + share * TAU, x = w / 2 + Math.cos(turn * (1 + share)) * w * (0.16 + 0.26 * share), y = h / 2 + Math.sin(turn * (1.6 - share * 0.4) * V.loop) * h * (0.16 + 0.24 * share);
      if (!Number.isNaN(past[i * 2])) {
        const path = new Path2D();
        path.moveTo(past[i * 2], past[i * 2 + 1]);
        path.lineTo(x, y);
        neon(path, rgba(around(share + t * 0.04), 1), size * (0.004 + 0.012 * v), 0.7 + 0.3 * v);
        const r = size * (0.018 + 0.03 * v + 0.012 * kick), head = g.createRadialGradient(x, y, 0, x, y, r);
        head.addColorStop(0, rgba(mix(around(share + t * 0.04), [255, 255, 255], 0.6), 0.5));
        head.addColorStop(1, rgba(around(share + t * 0.04), 0));
        g.fillStyle = head;
        g.fillRect(x - r, y - r, r * 2, r * 2);
        if (sound.hatHit && Math.random() < 0.4) glint(x, y, size * 0.09, 1);
      }
      past[i * 2] = x;
      past[i * 2 + 1] = y;
    }
    remember();
  }

  function starfield() { // flying through stars, faster when the music is busier
    const { t, dt, level, kick } = sound, cx = w / 2 + Math.sin(t * 0.13) * w * 0.16 * V.drift, cy = h / 2 + Math.sin(t * 0.09 + 1) * h * 0.13 * V.drift, speed = (0.1 + 0.8 * level + 0.7 * kick) * dt, GROUPS = colors.length * 3, paths = Array.from({ length: GROUPS }, () => new Path2D());
    const roll = turned("stars", 1, V.roll), c = Math.cos(roll), s = Math.sin(roll), sx = w * 0.275, sy = h * 0.275, at = (x, y) => [cx + (x * c - y * s) * sx, cy + (x * s + y * c) * sy]; // the way we're going wanders, and the stars can roll round it
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(5,6,10,${(0.32 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < STARS; i++) {
      const x = stars[i * 3], y = stars[i * 3 + 1], z = stars[i * 3 + 2], next = z - speed;
      if (next <= 0.03) { stars[i * 3] = Math.random() * 2 - 1; stars[i * 3 + 1] = Math.random() * 2 - 1; stars[i * 3 + 2] = 1 - Math.random() * Math.min(0.97, Math.max(0, speed)); continue; } // back at the far end, somewhere in the stretch this frame covered: all put at the very end, the ones that came back together stayed together for good, and after a few fast moments the stars were a few flat sheets
      stars[i * 3 + 2] = next;
      const near = Math.min(2, Math.floor((1 - next) * 3)), path = paths[(i % colors.length) * 3 + near], to = at(x / next, y / next);
      path.moveTo(...at(x / z, y / z));
      path.lineTo(...to);
      if (sound.hatHit && i % 90 === 0) twinkle(...to, h * 0.05);
    }
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let p = 0; p < GROUPS; p++) {
      const near = p % 3;
      g.lineWidth = Math.max(1, (h / 540) * (1 + near));
      g.strokeStyle = rgba(colors[Math.floor(p / 3)], 0.3 + near * 0.3);
      g.stroke(paths[p]);
    }
  }

  function whirl() { // a whirlpool of stars, thrown outward by the kicks
    const { dt, level, kick, hatHit } = sound, cx = w / 2, cy = h / 2, reach = Math.hypot(w, h) * 0.52, flat = V.flat, GROUPS = colors.length * 3, paths = Array.from({ length: GROUPS }, () => new Path2D());
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(5,6,10,${(0.26 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < STARS; i++) {
      const out = (stars[i * 3 + 1] + 1) / 2, was = stars[i * 3] * Math.PI, now = was + ((0.2 + 1.5 * level + 1.6 * kick) * dt * V.spin) / (0.12 + out), r = reach * (0.04 + 0.96 * out ** 0.7) * (1 + 0.07 * kick * out), near = Math.min(2, Math.floor(stars[i * 3 + 2] * 3)), path = paths[(i % colors.length) * 3 + near], x = cx + Math.cos(now) * r, y = cy + Math.sin(now) * r * flat;
      stars[i * 3] = ((now / Math.PI + 1) % 2) - 1;
      path.moveTo(cx + Math.cos(was) * r, cy + Math.sin(was) * r * flat);
      path.lineTo(x, y);
      if (hatHit && i % 95 === 0) twinkle(x, y, h * 0.05);
    }
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let p = 0; p < GROUPS; p++) {
      const near = p % 3;
      g.lineWidth = Math.max(1, (h / 540) * (1 + near));
      g.strokeStyle = rgba(colors[Math.floor(p / 3)], 0.3 + near * 0.3);
      g.stroke(paths[p]);
    }
  }

  function dust() { // specks floating up through the light
    const { t, dt, level, kick, hat, hatHit } = sound, cx = w / 2, cy = h / 2, rise = (0.03 + 0.2 * level + 0.25 * kick) * dt, groups = colors.map(() => [new Path2D(), new Path2D(), new Path2D()]);
    backdrop();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < STARS; i++) {
      const z = stars[i * 3 + 2], layer = Math.min(2, Math.floor(z * 3)), grow = 1 + 0.06 * kick * (layer + 1), by = rise * (0.4 + z);
      let x = stars[i * 3], y = stars[i * 3 + 1];
      if (V.way === "down") y += by; // falling like snow
      else if (V.way === "wind") { x += by * 1.6; y += Math.sin(t * 0.6 + i) * by * 0.4; } // blown along
      else if (V.way === "out") { x *= 1 + by * 2.4; y *= 1 + by * 2.4; if (Math.abs(x) > 1.05 || Math.abs(y) > 1.05) { x = rnd(-0.06, 0.06); y = rnd(-0.06, 0.06); } } // going through it
      else y -= by;
      x = x > 1 ? x - 2 : x < -1 ? x + 2 : x;
      y = y > 1 ? y - 2 : y < -1 ? y + 2 : y;
      stars[i * 3] = x;
      stars[i * 3 + 1] = y;
      const px = cx + (x + Math.sin(t * 0.21 + i) * 0.03) * cx * 1.05 * grow, py = cy + y * cy * 1.05 * grow, r = (0.7 + layer * 0.9) * Math.max(1, h / 720) * V.size * (V.way === "out" ? 0.6 + Math.hypot(x, y) : 1), path = groups[i % colors.length][layer];
      path.moveTo(px + r, py);
      path.arc(px, py, r, 0, TAU);
      if (hatHit && i % 60 === 0) twinkle(px, py, h * (0.03 + 0.05 * z));
    }
    colors.forEach((tone, c) => groups[c].forEach((path, layer) => { g.fillStyle = rgba(tone, 0.22 + layer * 0.2 + 0.3 * hat); g.fill(path); }));
  }

  const LINKS = 84, linkX = new Float32Array(LINKS), linkY = new Float32Array(LINKS);
  function links() { // points of light drifting about, joined up whenever they come close
    const { t, dt, level, kick, hatHit } = sound, close = Math.min(w, h) * 0.25 * V.reach, faint = new Path2D(), bright = new Path2D(), wrap = (v) => (v > 1 ? v - 2 : v < -1 ? v + 2 : v), LINKS = V.count;
    backdrop();
    for (let i = 0; i < LINKS; i++) {
      const way = stars[i * 3 + 2] * TAU + t * 0.04 * (i % 2 ? 1 : -1), pace = (0.012 + 0.09 * level) * dt, grow = 1 + 0.22 * smooth((i / LINKS) * BANDS * 0.9) + 0.05 * kick;
      stars[i * 3] = wrap(stars[i * 3] + Math.cos(way) * pace);
      stars[i * 3 + 1] = wrap(stars[i * 3 + 1] + Math.sin(way) * pace);
      linkX[i] = w / 2 + stars[i * 3] * w * 0.54 * grow;
      linkY[i] = h / 2 + stars[i * 3 + 1] * h * 0.54 * grow;
    }
    for (let i = 0; i < LINKS; i++) for (let j = i + 1; j < LINKS; j++) {
      const apart = Math.hypot(linkX[i] - linkX[j], linkY[i] - linkY[j]);
      if (apart > close) continue;
      const path = apart < close * 0.55 ? bright : faint;
      path.moveTo(linkX[i], linkY[i]);
      path.lineTo(linkX[j], linkY[j]);
    }
    g.globalCompositeOperation = "lighter";
    g.lineWidth = Math.max(1, h / 800);
    g.strokeStyle = rgba(colors[1], 0.14 + 0.3 * kick);
    g.stroke(faint);
    g.lineWidth = Math.max(1, h / 620);
    g.strokeStyle = rgba(colors[0], 0.36 + 0.5 * kick);
    g.stroke(bright);
    for (let i = 0; i < LINKS; i++) glint(linkX[i], linkY[i], h * (0.018 + 0.018 * kick), 0.9);
    if (hatHit) for (let k = 0; k < 4; k++) { const i = Math.floor(rnd(0, LINKS)); twinkle(linkX[i], linkY[i], h * 0.07); }
  }

  let shells = [], lastShell = null;
  function shell(x, y, count, tone, speed, life, kind = "round") { // one burst of sparks, each with where it is and where it's going: a ball of them, a ring, a willow that droops, or a palm of a few heavy ones
    const n = kind === "palm" ? Math.ceil(count / 3) : count, parts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const a = kind === "ring" ? (i / n) * TAU + rnd(-0.03, 0.03) : rnd(0, TAU), v = speed * (kind === "ring" ? rnd(0.94, 1) : kind === "palm" ? rnd(0.85, 1.15) : Math.sqrt(Math.random())); parts.set([x, y, Math.cos(a) * v, Math.sin(a) * v], i * 4); }
    shells.push({ tone, parts, left: life, life, x, y, kind });
  }
  function fireworks() { // a shell goes off on every kick, and crackles on the hi-hats
    const { dt, kickHit, hatHit } = sound, size = Math.min(w, h), drag = Math.exp(-dt * 1.7), fall = size * 0.42 * dt;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = `rgba(5,6,10,${(0.16 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    if (kickHit) {
      lastShell = [rnd(0.16, 0.84) * w, rnd(0.14, 0.62) * h];
      shell(...lastShell, Math.round(42 + 46 * kickHit), around(rnd(0, 1)), size * (0.34 + 0.46 * kickHit), rnd(1, 1.4) * (V.burst === "willow" ? 1.7 : 1), V.burst);
      twinkle(...lastShell, size * 0.16, 0.2);
    }
    if (hatHit && lastShell) shell(lastShell[0] + rnd(-0.14, 0.14) * size, lastShell[1] + rnd(-0.14, 0.14) * size, 6, [255, 240, 210], size * 0.14, 0.45);
    if (shells.length > 22) shells.shift();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    shells = shells.filter((s) => (s.left -= dt) > 0);
    for (const s of shells) {
      const path = new Path2D(), p = s.parts, part = s.left / s.life, slow = s.kind === "willow" ? Math.exp(-dt * 0.8) : drag, down = s.kind === "willow" ? fall * 0.55 : fall;
      for (let i = 0; i < p.length; i += 4) {
        path.moveTo(p[i], p[i + 1]);
        p[i + 2] *= slow;
        p[i + 3] = p[i + 3] * slow + down;
        p[i] += p[i + 2] * dt;
        p[i + 1] += p[i + 3] * dt;
        path.lineTo(p[i], p[i + 1]);
      }
      g.strokeStyle = rgba(mix(s.tone, [255, 255, 255], 0.2), part ** 0.7);
      g.lineWidth = Math.max(1.3, h / 380) * (0.6 + part) * (s.kind === "palm" ? 1.8 : 1);
      g.stroke(path);
    }
  }

  function middle(cx, cy, r) { // the hole for the record. Behind the page the real one is already showing
    g.globalCompositeOperation = "source-over";
    g.save();
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.clip();
    if (picture && alone) g.drawImage(picture, cx - r, cy - r, r * 2, r * 2);
    else { g.fillStyle = "#05060a"; g.fill(); }
    g.restore();
  }

  function halo() { // the record in the middle, with the sound standing out all round it
    const cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * sound.kick), n = V.count, spin = turned("halo", 1);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineWidth = Math.max(2, ((TAU * r) / (n * 2)) * 0.55);
    for (let i = 0; i < n * 2; i++) {
      const b = i < n ? i : n * 2 - 1 - i, v = sound.bands[Math.floor((b / n) * BANDS * 0.82)], a = (i / (n * 2)) * TAU - Math.PI / 2 + spin, from = r * 1.05, to = from + size * (0.012 + 0.24 * v) * V.reach;
      g.strokeStyle = rgba(around((b / n) * 0.9 + sound.t * 0.02), 0.55 + 0.4 * v);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * from, cy + Math.sin(a) * from);
      g.lineTo(cx + Math.cos(a) * to, cy + Math.sin(a) * to);
      g.stroke();
      if (sound.hatHit && Math.random() < 0.025) twinkle(cx + Math.cos(a) * to, cy + Math.sin(a) * to, h * 0.055);
    }
    middle(cx, cy, r);
  }

  function sun() { // a soft corona round the record. Its outline is drawn several times, shrinking inward, so the light dies away along the shape and never stops at an edge
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * kick), n = 96, CONTOURS = 14;
    backdrop();
    g.globalCompositeOperation = "lighter";
    for (let layer = 1; layer >= 0; layer--) {
      const lift = size * (0.06 + 0.05 * layer) * (1 + 0.6 * kick), swing = size * (0.17 + 0.1 * layer), turn = t * (0.07 + 0.05 * layer) * (layer ? -1 : 1), out = new Float32Array(n + 1);
      for (let i = 0; i <= n; i++) out[i] = lift + swing * smooth(Math.abs((i / n) * 2 - 1) * BANDS * 0.62 + 1) + size * 0.012 * Math.sin((i / n) * TAU * V.petals + t * 1.3 + layer);
      g.fillStyle = rgba(around(layer * 0.4 + t * 0.02), 0.05);
      for (let c = CONTOURS; c >= 1; c--) {
        const part = (c / CONTOURS) ** 1.4, edge = new Path2D();
        for (let i = 0; i <= n; i++) { const a = (i / n) * TAU + turn, far = r + out[i] * part, x = cx + Math.cos(a) * far, y = cy + Math.sin(a) * far; if (i) edge.lineTo(x, y); else edge.moveTo(x, y); }
        edge.closePath();
        g.fill(edge);
      }
      if (hatHit && !layer) for (let k = 0; k < 4; k++) { const i = Math.floor(rnd(0, n)), a = (i / n) * TAU + turn, far = r + out[i]; twinkle(cx + Math.cos(a) * far, cy + Math.sin(a) * far, h * 0.055); }
    }
    middle(cx, cy, r);
  }

  function rings() { // tracks round the record, one for each part of the sound, each turning at its own speed
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * kick), N = V.count, gap = size * 0.021 * Math.min(1, 15 / N), arcs = V.arcs;
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineWidth = gap * 0.46;
    for (let i = 0; i < N; i++) {
      const v = smooth(((i + 0.5) / N) * BANDS * 0.9), at = r + gap * (i + 1), spin = t * (0.25 + i * 0.06) * (i % 2 ? -1 : 1), long = 0.08 + 1.9 * v;
      g.strokeStyle = rgba(colors[i % 3], 0.07);
      g.beginPath();
      g.arc(cx, cy, at, 0, TAU);
      g.stroke();
      g.strokeStyle = rgba(around(i / N + t * 0.03), 0.4 + 0.6 * v);
      for (let k = 0; k < arcs; k++) { // the lit part of the track in one piece, or two or more spread round it
        const from = spin + (k * TAU) / arcs;
        g.beginPath();
        g.arc(cx, cy, at, from, from + (long * 2) / arcs);
        g.stroke();
      }
      if (hatHit && i > N * 0.5 && Math.random() < 0.3) twinkle(cx + Math.cos(spin + long) * at, cy + Math.sin(spin + long) * at, h * 0.05);
    }
    middle(cx, cy, r);
  }

  function mandala() { // the sound folded into a flower round the record, like stained glass
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * kick), FOLDS = V.folds, STEPS = 20, span = Math.PI / FOLDS, soft = (at) => (smooth(at - 2.5) + smooth(at) + smooth(at + 2.5)) / 3;
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineJoin = "round";
    for (let layer = 0; layer < 3; layer++) {
      const line = new Path2D(), lift = size * (0.05 + layer * 0.07), swing = size * (0.24 - layer * 0.02), tone = around(layer * 0.33 + t * 0.03), spin = t * (0.07 + layer * 0.03) * (layer % 2 ? -1 : 1);
      for (let i = 0; i <= STEPS; i++) { const u = i / STEPS, a = u * span, far = r + lift + swing * soft(u * BANDS * 0.7 + layer * 8 + 3), x = Math.cos(a) * far, y = Math.sin(a) * far; if (i) line.lineTo(x, y); else line.moveTo(x, y); }
      const pane = new Path2D(line);
      pane.lineTo(Math.cos(span) * r, Math.sin(span) * r);
      pane.lineTo(r, 0);
      pane.closePath();
      for (let f = 0; f < FOLDS * 2; f++) { // every other piece is a mirror image, so the ends meet
        const a = spin + f * span + (f % 2 ? span : 0), c = Math.cos(a), s = Math.sin(a);
        if (f % 2) g.setTransform(c, s, s, -c, cx, cy); else g.setTransform(c, s, -s, c, cx, cy);
        g.fillStyle = rgba(tone, 0.06 + 0.08 * kick);
        g.fill(pane);
        neon(line, rgba(tone, 1), Math.max(1.2, h / 480) * (1 + kick), 0.7 + 0.3 * kick, 0.55);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (hatHit) for (let k = 0; k < 4; k++) { const a = rnd(0, TAU), far = r + size * rnd(0.08, 0.3); twinkle(cx + Math.cos(a) * far, cy + Math.sin(a) * far, h * 0.05); }
    middle(cx, cy, r);
  }

  function rays() { // light coming from behind the record, each ray one part of the sound and fading out by itself
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), reach = Math.hypot(w, h) * 0.56, r = size * (0.2 + 0.014 * kick), n = V.count, spin = turned("rays", 0.05);
    backdrop();
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < n * 2; i++) {
      const b = i < n ? i : n * 2 - 1 - i, v = sound.bands[Math.floor((b / n) * BANDS * 0.82)], a = (i / (n * 2)) * TAU + spin, wide = (TAU / (n * 2)) * (0.14 + 0.3 * v), end = r + (reach - r) * (0.14 + 0.86 * v), tone = around((b / n) * 0.9 + t * 0.02), fade = g.createRadialGradient(cx, cy, r, cx, cy, end);
      fade.addColorStop(0, rgba(mix(tone, [255, 255, 255], 0.25), 0.8 + 0.2 * kick));
      fade.addColorStop(0.5, rgba(tone, 0.28));
      fade.addColorStop(1, rgba(tone, 0));
      g.fillStyle = fade;
      g.beginPath();
      g.moveTo(cx + Math.cos(a - wide * 0.4) * r, cy + Math.sin(a - wide * 0.4) * r);
      g.lineTo(cx + Math.cos(a - wide) * end, cy + Math.sin(a - wide) * end);
      g.lineTo(cx + Math.cos(a + wide) * end, cy + Math.sin(a + wide) * end);
      g.lineTo(cx + Math.cos(a + wide * 0.4) * r, cy + Math.sin(a + wide * 0.4) * r);
      g.closePath();
      g.fill();
      if (hatHit && Math.random() < 0.025) twinkle(cx + Math.cos(a) * end * 0.8, cy + Math.sin(a) * end * 0.8, h * 0.06);
    }
    middle(cx, cy, r);
  }

  /* Space: floating through it, past nebulas, galaxies, planets and black holes. Each thing is painted once onto its own small picture, which is slow, and after that only moved and scaled, which is fast, so it runs without a graphics card.
     Now and then the ship changes course and leans into the turn, everything nods to the kicks, stars shoot past on the hi-hats, and somebody comes by to have a look. */
  const FAR = 44, rnd = (a, b) => a + Math.random() * (b - a);
  const TRIPS = { // what's on the way, how fast, how much it turns, how often somebody comes by and how many at once, how often a star shoots
    space: { plan: ["nebula", "galaxy", "gas", "nebula", "hole", "gas", "nebula", "galaxy", "gas", "hole"], pace: 1, steer: 1, folk: [24, 55], crowd: 1, shots: 1, moves: 1, cockpit: true, falls: 1, odd: ["sign", "cow", "astronaut", "sign", "vinyl"] },
    warp: { plan: ["nebula", "galaxy", "nebula"], pace: 2.8, steer: 0.7, streak: 6, rings: true, folk: [50, 90], crowd: 1, shots: 0.4, moves: 0.6, odd: ["sign", "cow", "sign"] },
    drift: { plan: ["nebula", "gas", "galaxy", "nebula"], pace: 0.26, steer: 0.5, folk: [30, 60], crowd: 1, shots: 0.6, odd: ["astronaut", "cow", "vinyl"] },
    orbit: { plan: ["galaxy", "nebula"], pace: 0.14, steer: 0.22, orbit: true, folk: [30, 60], crowd: 1, shots: 1.6, odd: ["astronaut"] },
    visitors: { plan: ["nebula", "gas", "nebula", "galaxy"], pace: 0.5, steer: 0.7, folk: [2.5, 7], crowd: 5, shots: 1, moves: 0.6, odd: ["sign", "astronaut", "cow", "vinyl"] },
    well: { plan: [], pace: 0, steer: 0, folk: [40, 80], crowd: 1, shots: 0.8 },
  };
  const HEADINGS = [[0, 0], [0.6, -0.14], [-0.6, 0.12], [0.32, 0.36], [-0.32, -0.36], [0.9, 0.08], [-0.9, -0.08], [0, 0.5], [0, -0.5]];
  const sky = { far: null, things: [], gone: 0, nextAt: 0, step: 0, aurora: -1, whirl: 0, bob: 0, bobSpeed: 0, clear: 1, fall: null };
  /* The visitors aren't only for Space: one comes by now and then in any effect, and stays when it changes into another. In Space they're part of the scene, behind the cockpit; anywhere else, and while one effect changes into the next, they go on top. */
  const crowd = { folk: [], at: Infinity, step: 0, oddAt: Infinity, oddStep: 0 };
  const ROAM = { folk: [40, 90], first: [15, 35], crowd: 1, odd: ["astronaut", "cow"] }; // the effects outside Space: how often, who's first, and once in a while something odder
  const folkInScene = () => !!TRIPS[name] && !morph && !quiet;
  const paper = (across, down = across) => { const c = Object.assign(document.createElement("canvas"), { width: across, height: down }); return [c, c.getContext("2d")]; };
  function softBlob(x, px, py, r, tone, strength) {
    const blob = x.createRadialGradient(px, py, 0, px, py, r);
    blob.addColorStop(0, rgba(tone, strength));
    blob.addColorStop(1, rgba(tone, 0));
    x.fillStyle = blob;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  function paintFar() { // the distant stars and a faint band of the Milky Way
    const S = 1400, [c, x] = paper(S);
    x.fillStyle = "#03040a";
    x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = "lighter";
    x.save();
    x.translate(S / 2, S / 2);
    x.rotate(rnd(-0.6, 0.6));
    for (let i = 0; i < 90; i++) softBlob(x, rnd(-S * 0.7, S * 0.7), rnd(-S * 0.11, S * 0.11), rnd(S * 0.05, S * 0.16), i % 3 ? [70, 80, 150] : [150, 90, 160], 0.05);
    x.restore();
    for (let i = 0; i < 2600; i++) {
      const b = Math.random() ** 3, size = b > 0.9 ? 2 : 1;
      x.fillStyle = rgba(i % 7 ? [225, 232, 255] : [255, 220, 190], 0.25 + 0.75 * b);
      x.fillRect(rnd(0, S), rnd(0, S), size, size);
    }
    return c;
  }
  function paintCloud(hues) { // one puff of a nebula: soft light, with dark lanes of dust taken out of it
    const S = 256, mid = S / 2, [c, x] = paper(S), spot = () => { const a = rnd(0, TAU), d = S * 0.28 * Math.sqrt(Math.random()); return [mid + Math.cos(a) * d, mid + Math.sin(a) * d * 0.8]; };
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 80; i++) softBlob(x, ...spot(), S * rnd(0.04, 0.19), hues[i % hues.length], rnd(0.04, 0.13));
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 26; i++) softBlob(x, ...spot(), S * rnd(0.03, 0.12), [0, 0, 0], 0.42);
    return c;
  }
  function paintGalaxy(hue) { // seen from straight above: it gets tilted when it's drawn
    const S = 512, mid = S / 2, [c, x] = paper(S), ARMS = 2 + Math.floor(rnd(0, 3)), place = (out, arm, scatter) => { const along = (arm / ARMS) * TAU + out * 6.2 + (Math.random() - 0.5) * scatter, reach = out * S * 0.47; return [mid + Math.cos(along) * reach, mid + Math.sin(along) * reach]; };
    x.globalCompositeOperation = "lighter";
    softBlob(x, mid, mid, S * 0.48, mix(hue, [255, 255, 255], 0.2), 0.16);
    for (let i = 0; i < 170; i++) { // the soft glow along each arm
      const out = 0.08 + 0.9 * Math.random();
      softBlob(x, ...place(out, i % ARMS, 0.4), S * rnd(0.03, 0.07) * (1.2 - out * 0.5), mix(hue, [255, 255, 255], 0.15), 0.1);
    }
    for (let i = 0; i < 9000; i++) { // and its stars, thicker towards the middle
      const out = Math.random() ** 1.5, b = Math.random(), size = b > 0.94 ? 2 : 1.1;
      x.fillStyle = rgba(b > 0.82 ? [255, 235, 210] : mix(hue, [255, 255, 255], 0.2 + b * 0.6), 0.14 + 0.55 * b * (1 - out * 0.6));
      x.fillRect(...place(out, i % ARMS, 0.62 - out * 0.34), size, size);
    }
    softBlob(x, mid, mid, S * 0.16, [255, 240, 215], 0.75);
    softBlob(x, mid, mid, S * 0.06, [255, 252, 245], 0.95);
    return c;
  }
  function paintDisc(hue) { // the glowing ring of matter round a black hole, from straight above: it gets flattened when it's drawn, and turned, so it spins
    const S = 512, mid = S / 2, [c, x] = paper(S), base = x.createRadialGradient(mid, mid, S * 0.15, mid, mid, S * 0.49);
    x.globalCompositeOperation = "lighter";
    x.lineCap = "round";
    base.addColorStop(0, rgba([255, 240, 215], 0));
    base.addColorStop(0.06, rgba([255, 240, 215], 0.6));
    base.addColorStop(0.3, rgba(mix(hue, [255, 240, 215], 0.45), 0.3));
    base.addColorStop(0.7, rgba(hue, 0.1));
    base.addColorStop(1, rgba(hue, 0));
    x.fillStyle = base;
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1500; i++) { // fine streaks, so that it can be seen to turn
      const r = S * rnd(0.16, 0.48), heat = 1 - (r / S - 0.16) / 0.32, from = rnd(0, TAU);
      x.strokeStyle = rgba(mix(hue, [255, 240, 215], heat * heat), (0.03 + 0.11 * heat) * rnd(0.3, 1));
      x.lineWidth = rnd(1, 3);
      x.beginPath();
      x.arc(mid, mid, r, from, from + rnd(0.3, 1.6));
      x.stroke();
    }
    return c;
  }
  function paintHole(hue) { // the hole itself: black, with the light bent into a thin bright ring around it
    const S = 512, mid = S / 2, edge = S * 0.13, [c, x] = paper(S), pale = mix(hue, [255, 245, 230], 0.7), dark = x.createRadialGradient(mid, mid, edge * 0.9, mid, mid, edge * 1.13);
    x.globalCompositeOperation = "lighter";
    softBlob(x, mid, mid, S * 0.5, mix(hue, [255, 255, 255], 0.3), 0.3);
    x.lineCap = "round";
    for (let i = 0; i < 26; i++) { // the far side of the disc, seen over the top and under the bottom of the hole: brighter on the side turning towards you
      const r = edge * (1.16 + i * 0.03), fall = 1 - i / 26, lean = x.createLinearGradient(mid - r, 0, mid + r, 0);
      lean.addColorStop(0, rgba(pale, 0.3 * fall));
      lean.addColorStop(1, rgba(hue, 0.07 * fall));
      x.strokeStyle = lean;
      x.lineWidth = 3;
      x.beginPath();
      x.arc(mid, mid, r, 0, TAU);
      x.stroke();
    }
    x.lineWidth = edge * 0.05;
    x.strokeStyle = rgba(pale, 1);
    x.beginPath();
    x.arc(mid, mid, edge * 1.14, 0, TAU);
    x.stroke();
    x.globalCompositeOperation = "source-over";
    dark.addColorStop(0, "rgba(0,0,0,1)");
    dark.addColorStop(0.8, "rgba(0,0,0,1)");
    dark.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = dark;
    x.fillRect(0, 0, S, S);
    return c;
  }
  function paintGas(hue) { // a banded planet, lit from one side
    const S = 512, mid = S / 2, R = S * 0.3, [c, x] = paper(S), shade = x.createRadialGradient(mid - R * 0.45, mid - R * 0.4, R * 0.1, mid - R * 0.1, mid - R * 0.1, R * 1.25);
    x.save();
    x.beginPath();
    x.arc(mid, mid, R, 0, TAU);
    x.clip();
    x.fillStyle = rgba(mix(hue, [30, 30, 50], 0.35), 1);
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      x.fillStyle = rgba(i % 2 ? mix(hue, [255, 240, 220], 0.45) : mix(hue, [10, 10, 30], 0.6), rnd(0.08, 0.28));
      x.beginPath();
      x.ellipse(mid, mid + rnd(-R, R), R * 1.2, rnd(3, R * 0.24), rnd(-0.04, 0.04), 0, TAU);
      x.fill();
    }
    shade.addColorStop(0, "rgba(255,255,255,.22)");
    shade.addColorStop(0.4, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,8,.93)");
    x.fillStyle = shade;
    x.fillRect(0, 0, S, S);
    x.restore();
    return c;
  }
  function paintRing(hue) { // seen from straight above: it gets flattened when it's drawn
    const S = 512, mid = S / 2, [c, x] = paper(S);
    for (let r = S * 0.34; r < S * 0.49; r += 2) {
      x.strokeStyle = rgba(mix(hue, [255, 245, 230], rnd(0, 0.6)), rnd(0.05, 0.42));
      x.lineWidth = 2;
      x.beginPath();
      x.arc(mid, mid, r, 0, TAU);
      x.stroke();
    }
    return c;
  }
  /* Falling into a planet. Now and then one comes up dead ahead: the ship goes in through the fire of the entry, sinks through three decks of cloud to whatever is underneath, and climbs back out to the stars, at once if a drop lands on the way.
     Each world has its own air: its colors seen from space, its sky from the top down to the horizon, three decks of cloud and a floor as a lit and a shaded tone each, how far its clouds are stretched, how often it thunders and in what color, and what's falling through it. */
  const WORLDS = {
    gas: { body: [[224, 170, 104], [110, 62, 38]], bands: 1, sky: [[30, 20, 44], [164, 92, 62], [250, 204, 138]], layers: [[[255, 230, 184], [158, 96, 64]], [[232, 158, 100], [100, 48, 42]], [[160, 98, 124], [48, 24, 54]], [[70, 40, 70], [14, 8, 22]]], wide: 3.4, bolts: 0.6, bolt: [255, 238, 205], bits: "" },
    sea: { body: [[40, 110, 190], [12, 40, 90]], blots: [236, 244, 250], sky: [[18, 60, 140], [84, 160, 226], [206, 234, 250]], layers: [[[255, 255, 255], [150, 170, 200]], [[226, 232, 240], [100, 116, 146]], [[150, 160, 178], [56, 66, 90]], [[30, 84, 130], [6, 24, 52]]], wide: 2.2, bolts: 0.25, bolt: [235, 240, 255], bits: "rain", glow: [200, 232, 255] },
    lava: { body: [[70, 28, 22], [20, 8, 8]], veins: [255, 120, 30], sky: [[10, 4, 6], [70, 16, 10], [226, 84, 26]], layers: [[[120, 70, 56], [34, 16, 14]], [[150, 62, 36], [30, 10, 8]], [[196, 80, 30], [40, 10, 6]], [[90, 26, 10], [22, 6, 4]]], wide: 2.4, bolts: 0.35, bolt: [255, 190, 120], bits: "embers", glow: [255, 120, 32] },
    ice: { body: [[196, 226, 246], [70, 110, 160]], veins: [235, 250, 255], sky: [[10, 22, 52], [70, 130, 190], [214, 240, 250]], layers: [[[250, 253, 255], [150, 180, 214]], [[214, 232, 246], [104, 134, 176]], [[170, 200, 226], [70, 96, 140]], [[130, 190, 230], [26, 48, 84]]], wide: 2, bolts: 0, bolt: [200, 240, 255], bits: "snow", glow: [170, 232, 255] },
    toxic: { body: [[196, 206, 60], [70, 84, 16]], bands: 1, sky: [[22, 30, 6], [110, 130, 22], [232, 240, 110]], layers: [[[240, 246, 150], [120, 136, 40]], [[196, 214, 70], [70, 90, 20]], [[130, 160, 40], [36, 54, 12]], [[60, 80, 14], [10, 18, 4]]], wide: 2.8, bolts: 1, bolt: [200, 255, 120], bits: "rain", glow: [190, 255, 70] },
  };
  const WORLD_ORDER = ["gas", "sea", "lava", "tuned", "ice", "toxic"], FALL = { near: 9, entry: 3.2, flight: 26, climb: 4.6, depths: [2.5, 6.5, 10.5, 14], low: 12.4 }; // how long each part of a fall takes, how far down each deck and the floor are, and how low the ship goes
  function tunedWorld() { // and one in the colors of the song
    const a = around(0), b = around(0.33), c = around(0.66), dark = [6, 6, 16], white = [255, 255, 255];
    return { body: [a, mix(b, dark, 0.7)], bands: 1, sky: [mix(c, dark, 0.86), mix(b, dark, 0.45), mix(a, white, 0.45)], layers: [[mix(a, white, 0.55), mix(a, dark, 0.5)], [mix(b, white, 0.35), mix(b, dark, 0.6)], [mix(c, white, 0.2), mix(c, dark, 0.7)], [mix(a, dark, 0.6), mix(b, dark, 0.9)]], wide: 2.6, bolts: 0.8, bolt: mix(c, white, 0.5), bits: "embers", glow: mix(a, white, 0.3) };
  }
  function paintWorld(world) { // the planet from space, lit from one side, with a rim of air round it
    const S = 768, mid = S / 2, R = S * 0.3, [c, x] = paper(S), [lit, deep] = world.body, rim = x.createRadialGradient(mid, mid, R * 0.9, mid, mid, R * 1.2), shade = x.createRadialGradient(mid - R * 0.45, mid - R * 0.4, R * 0.1, mid - R * 0.1, mid - R * 0.1, R * 1.25);
    rim.addColorStop(0, rgba(world.sky[2], 0.6));
    rim.addColorStop(0.4, rgba(world.sky[2], 0.28));
    rim.addColorStop(1, rgba(world.sky[2], 0));
    x.fillStyle = rim;
    x.fillRect(0, 0, S, S);
    x.save();
    x.beginPath();
    x.arc(mid, mid, R, 0, TAU);
    x.clip();
    x.fillStyle = rgba(mix(lit, deep, 0.5), 1);
    x.fillRect(0, 0, S, S);
    if (world.bands) {
      for (let i = 0; i < 52; i++) {
        x.fillStyle = rgba(i % 2 ? mix(lit, [255, 246, 228], 0.4) : deep, rnd(0.1, 0.32));
        x.beginPath();
        x.ellipse(mid, mid + rnd(-R, R), R * 1.2, rnd(3, R * 0.2), rnd(-0.04, 0.04), 0, TAU);
        x.fill();
      }
    } else for (let i = 0; i < 70; i++) softBlob(x, mid + rnd(-R, R), mid + rnd(-R, R), rnd(R * 0.08, R * 0.36), i % 3 === 0 ? world.blots || lit : i % 3 === 1 ? lit : deep, rnd(0.2, 0.6));
    if (world.veins) { // cracks that glow
      x.globalCompositeOperation = "lighter";
      x.strokeStyle = rgba(world.veins, 0.5);
      for (let i = 0; i < 30; i++) {
        let px = mid + rnd(-R, R), py = mid + rnd(-R, R), turn = rnd(0, TAU);
        x.lineWidth = rnd(0.8, 2.8);
        x.beginPath();
        x.moveTo(px, py);
        for (let k = 0; k < 9; k++) { turn += rnd(-0.9, 0.9); px += Math.cos(turn) * R * 0.09; py += Math.sin(turn) * R * 0.09; x.lineTo(px, py); }
        x.stroke();
      }
      x.globalCompositeOperation = "source-over";
    }
    shade.addColorStop(0, "rgba(255,255,255,.2)");
    shade.addColorStop(0.4, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(0,0,8,.9)");
    x.fillStyle = shade;
    x.fillRect(0, 0, S, S);
    x.restore();
    return c;
  }
  function paintPuff(lit, shade) { // a heap of cloud: the shaded parts first and lower down, the lit ones on top
    const S = 256, [c, x] = paper(S), heap = Array.from({ length: 30 }, () => { const px = rnd(0.22, 0.78); return [px * S, (0.58 - rnd(0.02, 0.24) * (1 - Math.abs(px - 0.5) * 2.6)) * S, S * rnd(0.09, 0.19)]; });
    for (const [px, py, r] of heap) softBlob(x, px, py + r * 0.45, r * 1.15, shade, 0.55);
    for (const [px, py, r] of heap) softBlob(x, px, py - r * 0.05, r * 0.9, lit, 0.6);
    return c;
  }
  function startFall() {
    const key = WORLD_ORDER[sky.fallStep++ % WORLD_ORDER.length], world = key === "tuned" ? tunedWorld() : WORLDS[key];
    sky.fall = { key, world, art: paintWorld(world), puffs: world.layers.map(([lit, shade], i) => [paintPuff(i === 3 && world.glow ? world.glow : lit, shade), paintPuff(i === 3 && world.glow ? world.glow : mix(lit, shade, 0.25), shade), paintPuff(shade, mix(shade, [4, 4, 10], 0.5))]),
      at: 0, depth: 0, air: 0, heat: 0, out: -1, left: 0, hy: 0, level: 0, view: 0.5, from: [rnd(-0.16, 0.16), rnd(-0.1, 0.06)], lean: rnd(-0.4, 0.4), sun: rnd(-0.3, 0.3), bolt: null,
      clouds: Array.from({ length: 64 }, (_, i) => ({ layer: i % 4, art: i % 8 < 4 ? 0 : 1, x: rnd(-34, 34), z: rnd(1.2, FAR), off: rnd(-0.3, 0.3), size: rnd(3, 6.5), flip: Math.random() < 0.5 ? -1 : 1 })), bits: Array.from({ length: 70 }, () => [rnd(-1, 1), rnd(-1, 1), rnd(0.5, 1.5)]) };
    sky.told = Packs.words().told[key];
  }
  function falling(trip) { // where the fall has got to: closing in, going in, sinking through the decks, and climbing back out
    const { dt, kickHit } = sound, f = sky.fall;
    if (!f) {
      sky.fallClock += dt * T.falls;
      if (sky.fallClock > sky.fallWait && !sky.move && sky.aurora < 0 && (kickHit || sky.fallClock > sky.fallWait + 4)) startFall();
      return sky.fall;
    }
    f.at += dt;
    const p = clamp(f.at / FALL.near), into = f.at - FALL.near, flown = into - FALL.entry, level = h * (trip.cockpit && T.pit ? -0.14 : -0.02) + sky.bob * h * 0.02, warm = (f.at - FALL.near + 1.2) / (FALL.entry + 1.2);
    if (f.out < 0 && flown > 0) {
      f.depth = FALL.low * clamp(flown / FALL.flight) ** 0.85;
      if (flown > FALL.flight || (flow.dropHit && flown > 6)) { f.out = 0; f.left = f.depth; sky.told = Packs.words().told.climb; } // a drop on the way down, and it's straight back out
    }
    if (f.out >= 0) {
      f.out += dt;
      f.depth = f.left - (f.left + 4) * eased(clamp(f.out / (FALL.climb * 0.7)));
    }
    const up = f.out < 0 ? 0 : clamp(f.out / FALL.climb);
    f.air = f.out < 0 ? eased(clamp(into / (FALL.entry * 0.55))) : 1 - eased(clamp((up - 0.55) / 0.45));
    f.heat = warm > 0 && warm < 1 ? Math.sin(Math.PI * warm) : 0;
    f.level = level;
    f.view = trip.cockpit && T.pit ? 0.34 : 0.56; // how much of the height there is to see through: the glass, or all of it
    f.hy = level - (1 - eased(clamp(into / FALL.entry))) * h * 0.75 + eased(clamp(up / 0.8)) * h; // looking down at it on the way in, levelling out, and nose up to leave
    sky.clear = f.out < 0 ? 1 - clamp((p - 0.35) / 0.4) : clamp((up - 0.7) / 0.3);
    sky.aimSpeed = f.out >= 0 ? 3 : flown > 0 ? 1.3 : into > 0 ? 2.2 : 1 + 1.6 * p * p;
    sky.aimStreak = f.out >= 0 ? 5 : flown > 0 ? 2.2 : into > 0 ? 3 : 1 + 2.5 * p * p;
    sky.nextAt = Math.max(sky.nextAt, sky.gone + 3); // nothing new comes along while it's in there
    if (up >= 1) Object.assign(sky, { fall: null, fallClock: 0, fallWait: rnd(60, 130), clear: 1, aimSpeed: 1, aimStreak: 1 });
    return sky.fall;
  }
  function spawn(kind) { // something new, far ahead on the line we're flying
    const hues = [...colors, mix(colors[0], [110, 70, 230], 0.55)], hue = hues[Math.floor(rnd(0, hues.length))], side = Math.random() < 0.5 ? -1 : 1, ahead = (o) => { o.x += sky.x + sky.vx * FAR; o.y += sky.y + sky.vy * FAR; o.nod = rnd(0.6, 1) * (Math.random() < 0.5 ? -1 : 1); sky.things.push(o); };
    if (kind === "aurora") { if (sky.aurora < 0) sky.aurora = 0; return; }
    if (kind === "nebula") {
      const arts = [paintCloud(hues), paintCloud(hues), paintCloud([...hues].reverse())], cx = rnd(-3, 3), cy = rnd(-2, 2);
      for (let i = 0; i < 9; i++) ahead({ kind, art: arts[i % 3], x: cx + rnd(-10, 10), y: cy + rnd(-5.5, 5.5), z: FAR + rnd(0, 9), size: rnd(10, 22), turn: rnd(0, TAU), spin: rnd(-0.03, 0.03), light: rnd(0.26, 0.55), stretch: rnd(0.5, 1), near: 3.2 });
    } else if (kind === "galaxy") ahead({ kind, art: paintGalaxy(hue), x: side * rnd(5, 12), y: rnd(-5, 5), z: FAR, size: rnd(11, 19), turn: rnd(0, TAU), spin: side * rnd(0.03, 0.08), lean: rnd(-1, 1), squash: rnd(0.35, 0.8), light: 0.95, near: 4 });
    else if (kind === "gas") ahead({ kind, art: paintGas(hue), disc: Math.random() < 0.7 ? paintRing(mix(hue, [255, 240, 215], 0.4)) : null, x: side * rnd(4.5, 10), y: rnd(-4, 4), z: FAR, size: rnd(9, 15), lean: rnd(-0.45, 0.45), near: 3.4 });
    else ahead({ kind, art: paintHole(hue), disc: paintDisc(hue), x: side * rnd(3.5, 6.5), y: rnd(-2.2, 2.2), z: FAR, size: rnd(8, 11), lean: rnd(-0.5, 0.5), near: 3.4 });
  }
  function startSky() {
    const t = sound.t;
    Object.assign(sky, { far: paintFar(), veil: paper(256, 144), things: [], gone: 0, nextAt: 8, step: 2, aurora: -1, x: 0, y: 0, vx: 0, vy: 0, aimX: 0, aimY: 0, bank: 0, course: 0, bob: 0, bobSpeed: 0, surge: 0, turnAt: t + rnd(9, 20), shots: [], shotAt: t + rnd(1, 4), rings: [], pit: null,
      speedNow: 1, streakNow: 1, aimSpeed: 1, aimStreak: 1, move: "", steps: [], stepEnd: 0, waitKick: false, moveAt: t + rnd(14, 26), moveStep: 0, spin: 0, rollWas: 0, ink: null, inkLeft: 0, oddAt: t + rnd(16, 34), fallers: [],
      deck: null, told: "", tick: null, tickStep: 0, neck: 0, neckSpeed: 0, swing: 0, swingSpeed: 0, splats: [], splatAt: t + rnd(35, 90), wipeAt: 0, wipe: -1, fall: null, fallClock: 0, fallWait: rnd(40, 90), fallStep: Math.floor(rnd(0, WORLD_ORDER.length)), clear: 1 });
    if (name === "well") return;
    spawn("nebula");
    sky.things.forEach((o) => { o.z -= 22; });
    spawn("galaxy");
    sky.things[sky.things.length - 1].z -= 12;
  }
  function drawThing(o, focal, camX, camY, reach) {
    const { t, bass, kick } = sound, k = focal / o.z, x = (o.x - camX) * k, size = o.size * k * (1 + 0.075 * kick * T.nod), y = (o.y - camY) * k + sky.bob * (k * 0.5 + o.nod * Math.min(size, h * 0.7) * 0.42), seen = clamp((FAR + 6 - o.z) / 10) * clamp((o.z - o.near) / (o.near * 1.4)) * sky.clear;
    if (seen <= 0 || Math.abs(x) - size > reach || Math.abs(y) - size > reach) return;
    g.save();
    g.translate(x, y);
    if (o.kind === "hole" || o.kind === "gas") {
      g.rotate(o.lean + sky.bob * o.nod * 0.25);
      const disc = (from) => {
        if (!o.disc) return;
        g.save();
        g.beginPath();
        g.rect(-size, from, size * 2, size);
        g.clip();
        g.scale(1, o.kind === "hole" ? 0.27 : 0.2);
        if (o.kind === "hole") g.rotate(sky.whirl);
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = seen * clamp(0.75 + 0.3 * bass + 0.3 * kick);
        g.drawImage(o.disc, -size / 2, -size / 2, size, size);
        g.restore();
      };
      disc(-size); // the far side of the ring, behind it
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = seen;
      g.drawImage(o.art, -size / 2, -size / 2, size, size);
      disc(0); // and the near side, in front
    } else if (o.solid) {
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = seen;
      if (o.squash !== 1) g.scale(1, o.squash);
      g.rotate(o.turn + t * o.spin + sky.bob * o.nod * 0.1);
      g.drawImage(o.art, -size / 2, (-size * o.tall) / 2, size, size * o.tall);
    } else {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = seen * o.light * clamp(0.72 + 0.45 * bass + 0.3 * kick);
      if (o.kind === "galaxy") { g.rotate(o.lean + sky.bob * o.nod * 0.21); g.scale(1, o.squash); }
      g.rotate(o.turn + t * o.spin + sky.bob * o.nod * 0.1);
      if (o.stretch) g.scale(1, o.stretch);
      g.drawImage(o.art, -size / 2, -size / 2, size, size);
    }
    g.restore();
  }

  /* The ship: every so often it changes course, on a kick, and leans into the turn. When the beat comes back after a break, everything goes. */
  function newCourse(trip) {
    sky.course = (sky.course + 1 + Math.floor(rnd(0, HEADINGS.length - 1))) % HEADINGS.length;
    sky.aimX = HEADINGS[sky.course][0] * trip.steer;
    sky.aimY = HEADINGS[sky.course][1] * trip.steer;
    sky.turnAt = sound.t + rnd(12, 32) / Math.max(T.turns, 0.05);
  }
  function steer(trip) {
    const { t, dt, kickHit } = sound;
    if (flow.dropHit) { sky.surge = 1; if (T.turns) newCourse(trip); for (let i = 0, n = Math.round(7 * T.shots); i < n; i++) launch(); } // the drop: off it goes, on a new heading
    if (T.turns && ((t > sky.turnAt && kickHit) || t > sky.turnAt + 5)) newCourse(trip);
    const ease = 1 - Math.exp(-dt / 1.5);
    sky.vx += (sky.aimX - sky.vx) * ease;
    sky.vy += (sky.aimY - sky.vy) * ease;
    sky.bank += (-sky.vx * 0.5 - sky.bank) * (1 - Math.exp(-dt / 1.1));
    sky.surge *= Math.exp(-dt / 0.7);
    nodAlong();
  }
  function nodAlong() { // a nod: down with the kick, and back up with a little overshoot. The ship and everything in Space does it, and the visitors anywhere
    const { dt, kickHit } = sound;
    if (kickHit) sky.bobSpeed += 3.8 * kickHit * T.nod;
    spring(sky, "bob", "bobSpeed", 135, 11, dt);
  }
  function spring(o, at, speed, stiff, damp, dt, lean = 0) { // a weight on a spring, moved on in steps no longer than a sixtieth of a second: taken in one go, a long frame (a slow machine, a drop at full speed) throws it further each time instead of letting it settle
    for (let left = dt; left > 1e-9; left -= 1 / 60) {
      const step = Math.min(left, 1 / 60);
      o[speed] += (-(o[at] + lean) * stiff - o[speed] * damp) * step;
      o[at] += o[speed] * step;
    }
    if (!Number.isFinite(o[at] + o[speed])) o[at] = o[speed] = 0;
  }
  /* Every so often the ship does something: jumps ahead with the stars drawn out long, stops dead and floats, leaves trails, or holds still and turns while the stars draw circles, like a long exposure. Each step is a speed, a length of streak and how long it lasts; the last can wait for a kick. */
  const MOVES = { jump: [[3.8, 4.5, 1.8], [4.8, 6, 2.4], [1, 1, 1.5]], stop: [[0.02, 0.3, 1.4], [0.02, 0.3, 3.2, true], [4, 6, 0.6], [1, 1, 1.2]], trail: [[1, 3, 9], [1, 1, 1]], exposure: [[0.05, 0.3, 1.2], [0.05, 0.3, 8], [1, 1, 1.4]] };
  const MOVE_ORDER = ["jump", "trail", "stop", "jump", "exposure", "trail"];
  function nextStep() {
    const [speedAim, streakAim, secs, waits] = sky.steps.shift();
    Object.assign(sky, { aimSpeed: speedAim, aimStreak: streakAim, stepEnd: sound.t + secs, waitKick: !!waits });
  }
  function startMove(move) {
    sky.move = move;
    sky.steps = [...MOVES[move]];
    nextStep();
    sky.told = Packs.words().told[move];
  }
  function moves(trip) {
    const { t, dt, kickHit } = sound, ease = 1 - Math.exp(-dt / 0.4);
    if (sky.move) {
      if (t >= sky.stepEnd && (!sky.waitKick || kickHit || t > sky.stepEnd + 2.5)) {
        if (sky.steps.length) nextStep();
        else { sky.move = ""; sky.moveAt = t + rnd(16, 42) / Math.max((trip.moves || 1) * T.moves, 0.05); }
      }
    } else if (!sky.fall && trip.moves && T.moves && t > sky.moveAt && (kickHit || t > sky.moveAt + 4)) startMove(MOVE_ORDER[sky.moveStep++ % MOVE_ORDER.length]);
    sky.speedNow += (sky.aimSpeed - sky.speedNow) * ease;
    sky.streakNow += (sky.aimStreak - sky.streakNow) * ease;
    if (sky.move === "exposure" && sky.steps.length === 1) sky.spin += dt * 0.22;
    if (sky.move === "trail" || sky.move === "exposure") sky.inkLeft = 2.4; else sky.inkLeft = Math.max(0, sky.inkLeft - dt);
  }
  function launch() { // a shooting star
    const most = Math.max(w, h), across = Math.random() < 0.5 ? -1 : 1, fall = rnd(0.22, 0.8), run = most * rnd(0.85, 1.6), life = rnd(0.45, 0.85);
    sky.shots.push({ x: rnd(-0.55, 0.55) * w, y: rnd(-0.55, 0.25) * h, dx: across * Math.cos(fall) * run, dy: Math.sin(fall) * run, left: life, life, tail: most * rnd(0.12, 0.3), width: Math.max(1.2, h / 480) * rnd(0.9, 1.7), tone: around(rnd(0, 1)) });
  }
  function shootingStars(trip) { // the better hi-hats set one off, and not too many of them
    const { t, dt, hatHit } = sound, most = Math.max(w, h);
    if (T.shots && ((hatHit > 0.7 && t > sky.shotAt) || t > sky.shotAt + 13)) { launch(); sky.shotAt = t + rnd(1.5, 7) / (trip.shots * T.shots); }
    g.lineCap = "round";
    sky.shots = sky.shots.filter((s) => (s.left -= dt) > 0);
    for (const s of sky.shots) {
      s.x += s.dx * dt;
      s.y += s.dy * dt;
      const light = Math.sin((s.left / s.life) * Math.PI) ** 0.6, run = Math.hypot(s.dx, s.dy), tx = s.x - (s.dx / run) * s.tail, ty = s.y - (s.dy / run) * s.tail, fade = g.createLinearGradient(s.x, s.y, tx, ty);
      fade.addColorStop(0, rgba([255, 255, 255], light));
      fade.addColorStop(0.18, rgba(s.tone, 0.7 * light));
      fade.addColorStop(1, rgba(s.tone, 0));
      g.globalCompositeOperation = "lighter";
      g.strokeStyle = fade;
      g.lineWidth = s.width;
      g.beginPath();
      g.moveTo(s.x, s.y);
      g.lineTo(tx, ty);
      g.stroke();
      glint(s.x, s.y, most * 0.03, light);
    }
  }

  /* Who comes by depends on what's playing. Saucers with a pilot nodding along and a big face peering up from below, as a rule; pale visitors with jellyfish and whales for the euphoric songs; smileys for acid; and angry red ones that shoot back for hardcore. Each is painted the first time it's needed. */
  const LOOKS = {
    "": { skin: [126, 255, 150], hull: ["#eef3fa", "#aab4c4", "#3a4250", "#8590a2", "#2a3038"], belly: "#1c2129", rim: "rgba(255,255,255,.75)" },
    euphoric: { skin: [190, 224, 255], hull: ["#ffffff", "#e6dcf5", "#8d86b8", "#d8cdf0", "#6a648f"], belly: "#3a3558", rim: "rgba(255,240,255,.9)" },
    acid: { skin: [247, 225, 30], smiley: true, hull: ["#fbfdb0", "#d8e23c", "#5a6410", "#b9c52c", "#3d4408"], belly: "#23280a", rim: "rgba(255,255,190,.85)" },
    hard: { skin: [232, 58, 44], angry: true, hull: ["#6b6f78", "#2f3238", "#0c0d10", "#3a1a1a", "#060607"], belly: "#0a0606", rim: "rgba(255,70,50,.9)" },
    psy: { skin: [176, 112, 255], hull: ["#f6e9ff", "#c9a6ff", "#5a2a8a", "#7fe8ff", "#2a1244"], belly: "#1d0f30", rim: "rgba(255,150,255,.9)" },
  };
  const FOLK = { "": ["saucer", "jelly", "neon", "saucer", "peek", "shapes", "jelly", "sea", "saucer"], euphoric: ["jelly", "whale", "sea", "saucer", "jelly", "neon", "peek", "whale"],
    acid: ["smiley", "saucer", "neon", "smiley", "peek", "shapes", "smiley", "saucer"], hard: ["saucer", "neon", "saucer", "peek", "shapes", "saucer", "saucer", "peek"],
    psy: ["eye", "mandala", "shapes", "saucer", "toadstool", "jelly", "eye", "sea", "mandala", "peek"] }; // psychedelic: a great eye, kaleidoscope flowers, toadstools hopping to the kick, and violet visitors. Neon, shapes and the sea come by in all of them
  const painted = {};
  const artOf = (look) => painted[look] || (painted[look] = { hull: paintHull(LOOKS[look]), dome: paintDome(), pilot: paintFace(96, false, LOOKS[look]), head: paintFace(420, true, LOOKS[look]) });
  function alienFace(x, cx, cy, r, look) { // a big head, a small chin and huge tilted black eyes
    x.save();
    x.translate(cx, cy);
    const tone = look.skin, skin = x.createRadialGradient(-r * 0.25, -r * 0.5, r * 0.08, 0, 0, r * 1.3);
    skin.addColorStop(0, rgba(mix(tone, [255, 255, 255], 0.55), 1));
    skin.addColorStop(0.55, rgba(tone, 1));
    skin.addColorStop(1, rgba(mix(tone, [0, 50, 40], 0.7), 1));
    x.fillStyle = skin;
    x.beginPath();
    x.moveTo(0, r * 1.05);
    x.bezierCurveTo(r * 0.38, r * 0.92, r * 1.02, r * 0.22, r * 0.98, -r * 0.3);
    x.bezierCurveTo(r * 0.95, -r * 0.86, r * 0.42, -r * 1.06, 0, -r * 1.06);
    x.bezierCurveTo(-r * 0.42, -r * 1.06, -r * 0.95, -r * 0.86, -r * 0.98, -r * 0.3);
    x.bezierCurveTo(-r * 1.02, r * 0.22, -r * 0.38, r * 0.92, 0, r * 1.05);
    x.fill();
    for (const side of [-1, 1]) {
      x.save();
      x.translate(side * r * 0.44, -r * 0.02);
      x.rotate(side * 0.6);
      if (look.angry) { const burn = x.createRadialGradient(0, 0, 0, 0, 0, r * 0.44); burn.addColorStop(0, "#ffd9a0"); burn.addColorStop(0.3, "#ff3a20"); burn.addColorStop(1, "#140202"); x.fillStyle = burn; } else x.fillStyle = "#03050a";
      x.beginPath();
      x.ellipse(0, 0, r * 0.44, r * 0.25, 0, 0, TAU);
      x.fill();
      x.restore();
    }
    x.strokeStyle = rgba(mix(tone, [0, 40, 30], 0.8), 1);
    x.lineWidth = Math.max(1, r * 0.045);
    x.lineCap = "round";
    x.beginPath();
    if (look.angry) { // brows down and teeth showing
      x.moveTo(-r * 0.26, r * 0.62);
      for (let i = 1; i <= 4; i++) x.lineTo(-r * 0.26 + (i * r * 0.52) / 4, r * (i % 2 ? 0.52 : 0.62));
      x.stroke();
      x.strokeStyle = "#1a0505";
      x.lineWidth = r * 0.12;
      for (const side of [-1, 1]) { x.beginPath(); x.moveTo(side * r * 0.84, -r * 0.62); x.lineTo(side * r * 0.16, -r * 0.26); x.stroke(); }
    } else {
      x.arc(0, r * 0.62, r * 0.14, 0.35, Math.PI - 0.35); // a small smile
      x.stroke();
    }
    x.restore();
  }
  function smileyFace(x, cx, cy, r, tone) { // tone: the face's color, when it isn't the usual yellow
    const skin = x.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    skin.addColorStop(0, tone ? rgba(mix(tone, [255, 255, 255], 0.55), 1) : "#fff6a0");
    skin.addColorStop(0.6, tone ? rgba(tone, 1) : "#f7e11e");
    skin.addColorStop(1, tone ? rgba(mix(tone, [0, 0, 0], 0.16), 1) : "#d6b900");
    x.fillStyle = skin;
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
    x.strokeStyle = "#16140a";
    x.lineWidth = r * 0.07;
    x.stroke();
    x.fillStyle = "#16140a";
    for (const side of [-1, 1]) { x.beginPath(); x.ellipse(cx + side * r * 0.34, cy - r * 0.2, r * 0.13, r * 0.27, 0, 0, TAU); x.fill(); }
    x.lineWidth = r * 0.12;
    x.lineCap = "round";
    x.beginPath();
    x.arc(cx, cy + r * 0.02, r * 0.62, 0.22 * Math.PI, 0.78 * Math.PI);
    x.stroke();
  }
  /* Now and then a smiley trips: its tongue comes out, it melts and drips, or it runs through every color of the rainbow. Which one, if any, is settled when it arrives. */
  const SMILEY = [247, 225, 30], TRICKS = ["tongue", "melt", "rainbow"];
  function smileyTrick(chance, peek) { // the trick, and when it starts and ends, as parts of the visit
    const trick = Math.random() < chance ? TRICKS[Math.floor(Math.random() * TRICKS.length)] : "";
    if (!trick) return { trick };
    if (peek) return trick === "tongue" ? { trick, from: 0.5, to: 0.72 } : trick === "melt" ? { trick, from: 0.68, to: 1 } : { trick, from: 0.1, to: 0.92 }; // a big face sticks it out as it winks, and melts as it sinks back
    const from = rnd(0.2, 0.45);
    return trick === "tongue" ? { trick, from, to: from + 0.3 } : trick === "melt" ? { trick, from: Math.max(0.4, from), to: 1 } : { trick, from, to: from + 0.45 };
  }
  function rainbowTone(t, seed) { // all the way round the colors in about three seconds
    const at = ((((t * 0.33 + seed / TAU) % 1) + 1) % 1) * 6, i = Math.floor(at) % 6, f = at - Math.floor(at);
    return [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i].map((v) => 60 + v * 195);
  }
  function trickNow(o, part) { // how far into its trick a smiley is: up to 1 and back to 0, except melting, which only goes on
    if (!o.trick || part < o.from) return null;
    const k = clamp((part - o.from) / (o.to - o.from)), amount = o.trick === "melt" ? k ** 1.3 : Math.sin(Math.PI * k) ** 0.5;
    if (amount <= 0.001) return null;
    return { [o.trick]: amount, tone: o.trick === "rainbow" ? mix(SMILEY, rainbowTone(sound.t, o.seed), amount) : SMILEY };
  }
  function tongueOut(r, out, wag) { // from under the smile, a little to one side, wagging
    const wide = r * 0.3, len = r * (0.15 + 0.38 * out);
    g.save();
    g.beginPath(); // only below the line of the smile, so it comes out of the mouth
    g.rect(-r * 2, -r * 2, r * 4, r * 4);
    g.moveTo(r * 0.62, r * 0.02);
    g.arc(0, r * 0.02, r * 0.62, 0, TAU, true);
    g.clip("evenodd");
    g.translate(r * 0.17, r * 0.56);
    g.rotate(-0.12 + wag * 0.2 * out);
    g.beginPath();
    g.moveTo(-wide / 2, 0);
    g.lineTo(-wide / 2, len - wide / 2);
    g.arc(0, len - wide / 2, wide / 2, Math.PI, 0, true);
    g.lineTo(wide / 2, 0);
    g.fillStyle = "#ff5c8d";
    g.fill();
    g.strokeStyle = "#16140a";
    g.lineWidth = r * 0.06;
    g.stroke();
    g.strokeStyle = "rgba(170,24,72,.7)"; // the line down the middle
    g.lineWidth = r * 0.035;
    g.beginPath();
    g.moveTo(0, len * 0.14);
    g.lineTo(0, len * 0.6);
    g.stroke();
    g.restore();
    g.strokeStyle = "#16140a"; // the lip over its root
    g.lineWidth = r * 0.12;
    g.lineCap = "round";
    g.beginPath();
    g.arc(0, r * 0.02, r * 0.62, 0.3 * Math.PI, 0.52 * Math.PI);
    g.stroke();
  }
  function meltedSmiley(size, melt, seed) { // sliding down in slices, wider and wobblier the lower they are, with drops running off the bottom
    const { t } = sound, art = artOf("acid").head, n = 30, sw = art.width, sh = art.height, slide = size * 0.55 * melt, r = size * 0.4;
    const yAt = (a) => -size / 2 + a * size + slide * a ** 2.2, widen = (a) => 1 + melt * 0.3 * a ** 3;
    g.lineCap = "round";
    for (const [d, k] of [[-0.5, 0.8], [0.06, 1.3], [0.46, 1]]) { // three drops, the middle one the longest, drawn first so they come from under its edge
      const edge = 0.5 + Math.sqrt(1 - d * d) * 0.4, x0 = d * r * widen(edge), y0 = yAt(edge) - r * 0.12, len = melt ** 1.5 * r * 0.8 * k, fat = r * (0.09 + 0.03 * k);
      for (const [color, more] of [["#16140a", r * 0.07], ["#e8cb12", 0]]) {
        g.strokeStyle = g.fillStyle = color;
        g.lineWidth = fat + more;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x0, y0 + len);
        g.stroke();
        g.beginPath();
        g.arc(x0, y0 + len, fat * 0.8 + more / 2, 0, TAU);
        g.fill();
      }
      g.fillStyle = "rgba(255,255,225,.6)"; // a glint on the drop
      g.beginPath();
      g.arc(x0 - fat * 0.25, y0 + len - fat * 0.25, fat * 0.24, 0, TAU);
      g.fill();
    }
    for (let i = 0; i < n; i++) {
      const a = i / n, top = yAt(a), wide = size * widen(a), wob = Math.sin(t * 2.3 + i * 0.55 + seed) * melt * a * size * 0.025;
      g.drawImage(art, 0, a * sh, sw, sh / n, -wide / 2 + wob, top, wide, yAt((i + 1) / n) - top + 0.8);
    }
  }
  function smileyNow(size, o, at) { // a smiley as its trick has it just now, round 0,0
    const r = size * 0.4;
    if (at.melt) meltedSmiley(size, at.melt, o.seed);
    else if (at.rainbow) { softBlob(g, 0, 0, size * 0.5, at.tone, 0.3 + 0.2 * at.rainbow); smileyFace(g, 0, 0, r, at.tone); }
    else g.drawImage(artOf("acid").head, -size / 2, -size / 2, size, size);
    if (at.tongue) tongueOut(r, at.tongue, Math.sin(sound.t * 9 + o.seed));
  }
  function paintFace(S, glow, look) {
    const [c, x] = paper(S);
    if (glow) softBlob(x, S / 2, S / 2, S * 0.5, look.skin, 0.3);
    if (look.smiley) { smileyFace(x, S / 2, S / 2, S * 0.4); return c; }
    alienFace(x, S / 2, S / 2, S * 0.4, look);
    if (!glow && !look.angry) { // a face this small can't look around, so its eyes are painted on
      x.fillStyle = "rgba(255,255,255,.9)";
      for (const side of [-1, 1]) { x.beginPath(); x.ellipse(S / 2 + side * S * 0.176 - S * 0.04, S / 2 - S * 0.052, S * 0.036, S * 0.024, 0, 0, TAU); x.fill(); }
    }
    return c;
  }
  function paintHull(look) { // the rim runs along y = 112 of the picture
    const W = 360, H = 200, mid = W / 2, rim = 112, [c, x] = paper(W, H), metal = x.createLinearGradient(0, rim - 40, 0, rim + 38);
    [0, 0.35, 0.52, 0.62, 1].forEach((at, i) => metal.addColorStop(at, look.hull[i]));
    x.fillStyle = look.belly;
    x.beginPath();
    x.ellipse(mid, rim + 16, 86, 26, 0, 0, TAU);
    x.fill();
    x.fillStyle = metal;
    x.beginPath();
    x.ellipse(mid, rim, 168, 36, 0, 0, TAU);
    x.fill();
    x.strokeStyle = look.rim;
    x.lineWidth = 2;
    x.beginPath();
    x.ellipse(mid, rim - 2, 160, 30, 0, Math.PI * 1.08, Math.PI * 1.92);
    x.stroke();
    return c;
  }
  function paintDome() { // the same glass as the play button
    const S = 180, mid = S / 2, R = 62, [c, x] = paper(S), glass = x.createRadialGradient(mid - 18, mid - 30, 6, mid, mid, R);
    glass.addColorStop(0, "rgba(220,245,255,.26)");
    glass.addColorStop(0.6, "rgba(120,200,255,.1)");
    glass.addColorStop(1, "rgba(120,200,255,.32)");
    x.fillStyle = glass;
    x.beginPath();
    x.arc(mid, mid, R, Math.PI, 0);
    x.ellipse(mid, mid, R, 14, 0, 0, Math.PI);
    x.closePath();
    x.fill();
    x.strokeStyle = "rgba(220,240,255,.6)";
    x.lineWidth = 1.5;
    x.stroke();
    x.fillStyle = "rgba(255,255,255,.62)";
    x.beginPath();
    x.ellipse(mid - 24, mid - 38, 19, 9, -0.6, 0, TAU);
    x.fill();
    return c;
  }
  function paintJelly(tone) {
    const S = 256, mid = S / 2, R = 104, rim = 144, N = 8, [c, x] = paper(S), bell = new Path2D(), paint = x.createRadialGradient(mid, rim - R * 0.5, R * 0.1, mid, rim, R * 1.05);
    bell.moveTo(mid - R, rim);
    bell.bezierCurveTo(mid - R, rim - R * 1.25, mid + R, rim - R * 1.25, mid + R, rim);
    for (let i = 0; i < N; i++) bell.quadraticCurveTo(mid + R - ((i + 0.5) * 2 * R) / N, rim + 20, mid + R - ((i + 1) * 2 * R) / N, rim);
    paint.addColorStop(0, rgba(mix(tone, [255, 255, 255], 0.6), 0.55));
    paint.addColorStop(0.6, rgba(tone, 0.22));
    paint.addColorStop(1, rgba(tone, 0.5));
    x.globalCompositeOperation = "lighter";
    x.fillStyle = paint;
    x.fill(bell);
    x.strokeStyle = rgba(mix(tone, [255, 255, 255], 0.5), 0.85);
    x.lineWidth = 2;
    x.stroke(bell);
    for (let i = 0; i < 4; i++) softBlob(x, mid + (i - 1.5) * 34, rim - 46 + (i % 2) * 18, 30, mix(tone, [255, 255, 255], 0.5), 0.34);
    return c;
  }
  function paintWhale(tone) { // made of light, facing left, with its tail joined on at (470, 118)
    const W = 512, H = 256, [c, x] = paper(W, H), body = new Path2D(), pale = mix(tone, [255, 255, 255], 0.6), paint = x.createLinearGradient(0, 44, 0, 194);
    body.moveTo(46, 128);
    body.bezierCurveTo(70, 66, 190, 44, 290, 70);
    body.bezierCurveTo(360, 88, 420, 116, 470, 118);
    body.bezierCurveTo(420, 150, 330, 186, 230, 190);
    body.bezierCurveTo(140, 194, 66, 176, 46, 128);
    paint.addColorStop(0, rgba(tone, 0.55));
    paint.addColorStop(0.55, rgba(tone, 0.22));
    paint.addColorStop(1, rgba(pale, 0.5));
    x.globalCompositeOperation = "lighter";
    x.fillStyle = paint;
    x.fill(body);
    x.strokeStyle = rgba(pale, 0.8);
    x.lineWidth = 2;
    x.stroke(body);
    x.lineWidth = 1.2;
    x.strokeStyle = rgba([255, 255, 255], 0.2);
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(70 + i * 10, 150 + i * 3); x.quadraticCurveTo(140 + i * 18, 190, 240 + i * 12, 178 - i * 3); x.stroke(); } // the grooves under its throat
    x.save();
    x.clip(body);
    for (let i = 0; i < 70; i++) softBlob(x, rnd(50, 460), rnd(50, 190), rnd(2, 5), [255, 255, 255], rnd(0.3, 0.9)); // full of stars
    x.restore();
    softBlob(x, 112, 126, 11, [255, 255, 255], 0.95);
    return c;
  }
  const toneOf = (look) => (look === "hard" ? [255, 60, 44] : look === "acid" ? [246, 230, 50] : look === "euphoric" ? mix(around(rnd(0, 1)), [255, 255, 255], 0.35) : look === "psy" ? rainbowTone(rnd(0, 3), 0) : around(rnd(0, 1))); // a saucer's lights
  function meet(kind) {
    const { t } = sound, side = Math.random() < 0.5 ? -1 : 1, most = Math.max(w, h), look = mood, come = (o) => crowd.folk.push(o);
    if (kind === "neon") {
      const shapes = look === "acid" ? ["ring", "bolt", "star"] : look === "hard" ? ["bolt", "triangle", "zigzag"] : look === "euphoric" ? ["heart", "star", "ring"] : ["ring", "triangle", "star", "heart", "bolt", "zigzag"];
      for (let i = 0, n = 1 + Math.floor(rnd(0, 2.5)); i < n; i++) come({ kind, born: t + i * 0.7, life: rnd(10, 16), x: rnd(0.15, 0.85) * w, y: rnd(0.2, 0.7) * h, size: Math.min(w, h) * rnd(0.08, 0.16), shape: shapes[Math.floor(rnd(0, shapes.length))], tone: look === "psy" ? rainbowTone(rnd(0, 3), 0) : mix(toneOf(look), [255, 255, 255], 0.1), seed: rnd(0, TAU) });
      return;
    }
    if (kind === "snow" || kind === "petals" || kind === "leaves" || kind === "fireflies") {
      const s = Math.min(w, h), leaf = ["#d9822b", "#c4521f", "#e0b03a", "#8a5a2b"], bugs = kind === "fireflies";
      come({ kind: "fall", style: kind, born: t, life: rnd(22, 32), bits: Array.from({ length: bugs ? 30 : 70 }, () => ({ x: rnd(0, w), y: bugs ? rnd(0.3, 0.95) * h : rnd(-h, 0), v: bugs ? rnd(0.3, 0.9) : rnd(0.04, 0.1) * h, phase: rnd(0, TAU), size: s * (kind === "snow" ? rnd(0.003, 0.007) : rnd(0.006, 0.011)), rot: rnd(0, TAU), spin: rnd(-1.5, 1.5), tone: leaf[Math.floor(rnd(0, leaf.length))] })) });
      return;
    }
    if (kind === "lasers") { come({ kind, born: t, life: rnd(7, 11), beams: 3 + Math.floor(rnd(0, 3)), speed: rnd(0.6, 1.3), tone: toneOf(look), seed: rnd(0, TAU) }); return; }
    if (kind === "sea") { come({ kind, born: t, life: rnd(18, 26), tone: look === "psy" ? rainbowTone(rnd(0, 3), 0) : toneOf(look), seed: rnd(0, TAU) }); return; }
    if (kind === "shapes") { const forms = Object.keys(FORMS); for (let i = 0; i < 3; i++) come({ kind: "shape", born: t + i * 0.8, life: rnd(12, 18), x: rnd(0.15, 0.85) * w, y: rnd(0.2, 0.75) * h, size: Math.min(w, h) * rnd(0.06, 0.12), form: forms[Math.floor(rnd(0, forms.length))], ax: rnd(0, TAU), ay: rnd(0, TAU), spin: [rnd(0.3, 0.9), rnd(0.3, 0.9)], drift: rnd(-0.02, 0.02) * w, tone: toneOf(look), seed: rnd(0, TAU) }); return; }
    if (kind === "disco") { come({ kind, born: t, life: rnd(12, 16), x: rnd(0.35, 0.65) * w, size: Math.min(w, h) * 0.09 }); return; }
    if (kind === "confetti") {
      const tones = [[255, 80, 120], [255, 210, 60], [80, 220, 160], [90, 160, 255], [200, 110, 255], [255, 255, 255]];
      come({ kind, born: t, life: 9, bits: Array.from({ length: 150 }, () => { const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), v = rnd(0.5, 1.4) * h; return { x: w / 2 + rnd(-0.15, 0.15) * w, y: h * 0.7, vx: Math.cos(a) * v, vy: Math.sin(a) * v, turn: rnd(0, TAU), spin: rnd(-8, 8), size: Math.min(w, h) * rnd(0.008, 0.015), tone: tones[Math.floor(rnd(0, tones.length))] }; }) });
      return;
    }
    if (kind === "eye") { come({ kind, born: t, life: rnd(11, 16), x: rnd(0.2, 0.8) * w, y: rnd(0.28, 0.6) * h, size: Math.min(w, h) * rnd(0.2, 0.3), blink: t + rnd(1.5, 3), shut: 0, seed: rnd(0, TAU), drift: side * rnd(0.004, 0.012) * w }); return; }
    if (kind === "mandala") { for (let i = 0; i < 2; i++) come({ kind, born: t + i * 2.5, life: rnd(10, 15), x: rnd(0.15, 0.85) * w, y: rnd(0.2, 0.75) * h, size: Math.min(w, h) * rnd(0.16, 0.3), petals: 6 + 2 * Math.floor(rnd(0, 4)), spin: rnd(0.15, 0.4) * (Math.random() < 0.5 ? -1 : 1), seed: rnd(0, TAU) }); return; }
    if (kind === "toadstool") { const s = Math.min(w, h) * rnd(0.07, 0.11); for (let i = 0; i < 3; i++) come({ kind, born: t + i * 0.45, life: rnd(14, 18), side, x: side < 0 ? w + s * (1 + i * 1.6) : -s * (1 + i * 1.6), ground: h * rnd(0.86, 0.92), up: 0, vy: 0, size: s * rnd(0.85, 1.15), walk: w * rnd(0.05, 0.08), seed: rnd(0, TAU) }); return; }
    if (kind === "jelly") { const tone = mix(look === "psy" ? rainbowTone(rnd(0, 3), 0) : around(rnd(0, 1)), look === "euphoric" ? [230, 215, 255] : look === "psy" ? [255, 255, 255] : [120, 210, 255], look === "psy" ? 0.15 : 0.35); come({ kind, born: t, life: rnd(15, 24), x: rnd(0.12, 0.88) * w, y: h * 1.15, drift: side * rnd(0.004, 0.02) * w, rise: h * rnd(0.055, 0.09), size: most * rnd(0.12, 0.2), art: paintJelly(tone), tone, pulse: 0, seed: rnd(0, TAU) }); return; }
    if (kind === "whale") { const tone = mix(around(rnd(0, 1)), [150, 200, 255], 0.5); come({ kind, born: t, life: rnd(18, 26), side, y: rnd(0.2, 0.55) * h, size: most * rnd(0.3, 0.45), art: paintWhale(tone), tone, seed: rnd(0, TAU) }); return; }
    if (kind === "smiley") { for (let i = 0; i < 3; i++) come({ kind, ...smileyTrick(0.45), born: t + i * 1.2, life: rnd(9, 14), x: rnd(0.1, 0.9) * w, y: h * 1.2, vx: rnd(-0.05, 0.05) * w, vy: -rnd(0.1, 0.16) * h, size: most * rnd(0.07, 0.13), turn: rnd(0, TAU), spin: rnd(-0.7, 0.7), nod: Math.random() < 0.5 ? -1 : 1, seed: rnd(0, TAU) }); return; }
    if (kind === "peek") { come({ kind, born: t, life: rnd(7, 11), x: rnd(0.16, 0.84) * w, size: Math.min(w, h) * rnd(0.34, 0.48), lean: side, blink: t + rnd(1, 3), shut: 0, seed: rnd(0, TAU), look, ...(look === "acid" ? smileyTrick(0.6, true) : {}) }); return; }
    if (kind === "astronaut") { come({ kind, born: t, life: rnd(15, 22), side, y: rnd(0.16, 0.5) * h, size: Math.min(w, h) * rnd(0.09, 0.14), seed: rnd(0, TAU), beat: 0, arm: 0 }); return; }
    if (kind === "cow") { come({ kind, born: t, life: rnd(16, 22), side, y: rnd(0.18, 0.55) * h, size: Math.min(w, h) * rnd(0.13, 0.18), seed: rnd(0, TAU), turn: rnd(0, TAU), spin: rnd(-0.5, 0.5) }); return; }
    const angry = look === "hard";
    come({ kind, born: t, life: angry ? rnd(4.5, 8) : rnd(7, 12), side, x: rnd(0.24, 0.76) * w, y: rnd(0.2, 0.5) * h, size: most * rnd(0.12, 0.21), hover: Math.random() < (angry ? 0.35 : 0.7), beam: !angry && Math.random() < 0.6, lamp: 0, seed: rnd(0, TAU), tone: toneOf(look), look, zap: angry, laser: 0, aim: 0, cow: Math.random() < 0.25 });
  }
  function drawSaucer(o, part) {
    const { t, dt, hat, kickHit } = sound, arrive = 1 - (1 - Math.min(1, part / 0.2)) ** 3, leave = clamp((part - 0.84) / 0.16) ** 2, fromX = o.x + o.side * w * 0.9, fromY = o.y - h * 0.22, toX = o.x - o.side * w * 1.05, toY = o.y - h * 0.4;
    let x, y;
    if (o.hover) { x = fromX + (o.x - fromX) * arrive; y = fromY + (o.y - fromY) * arrive; x += (toX - x) * leave; y += (toY - y) * leave; }
    else { x = fromX + (toX - fromX) * part; y = o.y + Math.sin(part * 7 + o.seed) * h * 0.06; }
    x += Math.sin(t * 1.1 + o.seed) * w * 0.016;
    y += Math.sin(t * 1.7 + o.seed) * h * 0.012 + sky.bob * o.size * 0.42;
    const tilt = (o.hover ? -(1 - arrive) * o.side * 0.32 - leave * o.side * 0.4 : -o.side * 0.14) + Math.sin(t * 1.3 + o.seed) * 0.05 + sky.bob * 0.18, size = o.size * (o.hover ? (0.5 + 0.5 * arrive) * (1 - 0.82 * leave) : 1), u = size / 360;
    g.translate(x, y);
    g.rotate(tilt);
    if (o.hover && o.beam && arrive >= 1 && !leave) { // and it's taking your record
      const on = clamp((part - 0.3) / 0.08) * clamp((0.8 - part) / 0.05), long = size * 1.9, paint = g.createLinearGradient(0, 0, 0, long), up = 1 - clamp((part - 0.34) / 0.44), at = long * 0.95 * up + size * 0.1, disk = size * 0.17 * (0.6 + 0.4 * up);
      paint.addColorStop(0, rgba(o.tone, 0.5));
      paint.addColorStop(1, rgba(o.tone, 0));
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = on * (0.7 + 0.3 * hat);
      g.fillStyle = paint;
      g.beginPath();
      g.moveTo(-size * 0.08, 0);
      g.lineTo(size * 0.08, 0);
      g.lineTo(size * 0.42, long);
      g.lineTo(-size * 0.42, long);
      g.closePath();
      g.fill();
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = on;
      g.save();
      g.translate(Math.sin(t * 2) * size * 0.02, at);
      if (o.cow) { // not always a record
        g.rotate(Math.sin(t * 1.4) * 0.5);
        g.drawImage(cowPicture(), -disk * 1.5, -disk, disk * 3, disk * 2.06);
      } else {
        g.rotate(t * 2.4);
        g.fillStyle = "#0a0a0a";
        g.beginPath();
        g.arc(0, 0, disk, 0, TAU);
        g.fill();
        g.beginPath();
        g.arc(0, 0, disk * 0.42, 0, TAU);
        g.fillStyle = rgba(o.tone, 1);
        g.fill();
        if (picture) { g.clip(); g.drawImage(picture, -disk * 0.42, -disk * 0.42, disk * 0.84, disk * 0.84); }
      }
      g.restore();
    }
    if (o.zap) { // the hardcore ones fire on the kick
      if (kickHit) { o.laser = 1; o.aim = rnd(0.2, 0.8) * Math.PI; }
      if (o.laser > 0.03) {
        o.laser *= Math.exp(-dt / 0.07);
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = o.laser;
        g.strokeStyle = "rgb(255,70,50)";
        g.lineWidth = Math.max(1.5, size * 0.012);
        g.lineCap = "round";
        for (const end of [-1, 1]) { g.beginPath(); g.moveTo(end * size * 0.18, 12 * u); g.lineTo(end * size * 0.18 + Math.cos(o.aim) * Math.max(w, h), 12 * u + Math.sin(o.aim) * Math.max(w, h)); g.stroke(); }
      }
    }
    saucerBody(o, size);
  }
  function saucerBody(o, size) { // the ship itself, round the middle of its rim: the pilot nodding along under the dome, and the lamps going round with the hi-hats
    const art = artOf(o.look), u = size / 360;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.drawImage(art.hull, -size / 2, -112 * u, size, 200 * u);
    g.drawImage(art.pilot, -44 * u, -91 * u + sky.bob * size * 0.06, 88 * u, 88 * u);
    g.drawImage(art.dome, -90 * u, -110 * u, 180 * u, 180 * u);
    if (sound.hatHit) o.lamp++;
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.1 + (i / 8) * 0.8), on = (i + o.lamp) % 3 === 0;
      g.globalAlpha = on ? 1 : 0.25;
      g.fillStyle = rgba(on ? mix(o.tone, [255, 255, 255], 0.4) : o.tone, 1);
      g.beginPath();
      g.arc(Math.cos(a) * 148 * u, 8 * u + Math.sin(a) * 26 * u, (on ? 6 : 4.2) * u, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  function drawJelly(o, part) { // every kick is a stroke of the bell
    const { t, dt, kickHit } = sound;
    if (kickHit) o.pulse = Math.max(o.pulse, kickHit);
    o.pulse *= Math.exp(-dt / 0.24);
    o.y -= o.rise * dt * (1 + 5 * o.pulse);
    o.x += o.drift * dt;
    const size = o.size, thin = 1 - 0.16 * o.pulse, long = 1 + 0.13 * o.pulse, fall = g.createLinearGradient(0, 0, 0, size * 1.25);
    fall.addColorStop(0, rgba(o.tone, 0.85));
    fall.addColorStop(1, rgba(o.tone, 0));
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = clamp(part / 0.1) * clamp((1 - part) / 0.16);
    g.translate(o.x, o.y + sky.bob * size * 0.22);
    g.rotate(Math.sin(t * 0.5 + o.seed) * 0.16);
    g.strokeStyle = fall;
    g.lineCap = "round";
    g.lineWidth = Math.max(1, size / 130);
    for (let k = 0; k < 9; k++) {
      const root = ((k + 0.5) / 9 - 0.5) * size * 0.62 * thin, tentacle = new Path2D();
      tentacle.moveTo(root, -size * 0.03);
      for (let j = 1; j <= 11; j++) { const u = j / 11; tentacle.lineTo(root * (1 - 0.42 * u * (1 - o.pulse)) + Math.sin(u * 5 + t * 2.2 + k * 1.4) * size * 0.06 * u, -size * 0.03 + u * size * (1.16 - 0.24 * o.pulse)); }
      g.stroke(tentacle);
    }
    g.scale(thin, long);
    g.drawImage(o.art, -size / 2, -size * 0.6, size, size);
  }
  function drawWhale(o, part) { // slowly across, with a sweep of the tail
    const { t } = sound, size = o.size, flap = Math.sin(t * 1.3 + o.seed) * 0.22 + sky.bob * 1.2, fromX = o.side > 0 ? w * 1.25 : -w * 0.25;
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = clamp(part / 0.1) * clamp((1 - part) / 0.12);
    g.translate(fromX + (w - 2 * fromX) * part, o.y + Math.sin(t * 0.45 + o.seed) * h * 0.02 + sky.bob * size * 0.12);
    g.scale(o.side, 1);
    g.rotate(Math.sin(t * 0.45 + o.seed + 1) * 0.05);
    g.drawImage(o.art, -size / 2, -size / 4, size, size / 2);
    g.translate(size * 0.418, -size * 0.0195);
    g.rotate(flap);
    g.scale(size, size);
    g.fillStyle = rgba(o.tone, 0.45);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(0.06, -0.1, 0.16, -0.12);
    g.quadraticCurveTo(0.12, -0.05, 0.1, 0);
    g.quadraticCurveTo(0.12, 0.05, 0.16, 0.12);
    g.quadraticCurveTo(0.06, 0.1, 0, 0);
    g.fill();
  }
  function drawSmiley(o, part) {
    const { t, dt, kick } = sound, size = o.size * (1 + 0.1 * kick), at = trickNow(o, part), melt = (at && at.melt) || 0;
    o.x += o.vx * dt * (1 - melt);
    o.y += o.vy * dt * (1 - 0.85 * melt); // a melting one stops rising
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(part / 0.08) * clamp((1 - part) / 0.12);
    g.translate(o.x, o.y + sky.bob * o.size * 0.5 * o.nod * (1 - melt));
    const turn = o.turn + t * o.spin + sky.bob * 0.3 * o.nod;
    if (melt && o.upright === undefined) { o.tilt = turn; o.upright = Math.round(turn / TAU) * TAU; }
    g.rotate(melt ? o.tilt + (o.upright - o.tilt) * clamp(melt * 4) : turn); // it rights itself first, so the drops run down
    if (at) smileyNow(size, o, at); else g.drawImage(artOf("acid").head, -size / 2, -size / 2, size, size);
  }
  function drawPeek(o, part) { // a big face comes up from below, looks around, nods along, winks once and goes. The hardcore one only stares, and shakes
    const { t, kick } = sound, look = LOOKS[o.look], up = part < 0.14 ? 1 - (1 - part / 0.14) ** 3 : part > 0.86 ? 1 - ((part - 0.86) / 0.14) ** 2 : 1, size = o.size, r = size * 0.4, skin = rgba(mix(look.skin, [0, 50, 40], 0.12), 1), lookX = Math.sin(t * 0.9 + o.seed) * 0.1, wink = part > 0.58 && part < 0.65, shake = look.angry ? Math.sin(t * 41) * kick * size * 0.018 : 0;
    if (t > o.blink) { o.blink = t + rnd(1.4, 3.6); o.shut = t + 0.14; }
    const floor = o.floor !== undefined ? o.floor : TRIPS[name] && TRIPS[name].cockpit && T.pit ? dashAt(o.x) : h; // in the cockpit it peers over the dashboard, and on the app over the play bar
    if (o.floor !== undefined) { g.beginPath(); g.rect(0, 0, w, o.floor); g.clip(); }
    g.translate(o.x + shake + Math.sin(t * 0.7 + o.seed) * w * 0.006, floor + size * 0.6 - up * size * 1.02 + sky.bob * size * 0.09);
    g.rotate(Math.sin(t * 0.8 + o.seed) * 0.05 + sky.bob * 0.1 * o.lean);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    const at = look.smiley ? trickNow(o, part) : null;
    if (at) smileyNow(size, o, at); else g.drawImage(artOf(o.look).head, -size / 2, -size / 2, size, size);
    if (look.angry) return;
    if (look.smiley) {
      if (!wink || (at && at.melt)) return; // a melting face's eyes have slid away
      g.fillStyle = rgba(at ? at.tone : SMILEY, 1);
      g.beginPath();
      g.ellipse(r * 0.34, -r * 0.2, r * 0.17, r * 0.31, 0, 0, TAU);
      g.fill();
      g.strokeStyle = "#16140a";
      g.lineWidth = r * 0.09;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(r * 0.16, -r * 0.2);
      g.quadraticCurveTo(r * 0.34, -r * 0.38, r * 0.52, -r * 0.2);
      g.stroke();
      return;
    }
    for (const side of [-1, 1]) {
      if (t < o.shut || (wink && side > 0)) { // shut for a moment
        g.save();
        g.translate(side * r * 0.44, -r * 0.02);
        g.rotate(side * 0.6);
        g.fillStyle = skin;
        g.beginPath();
        g.ellipse(0, 0, r * 0.47, r * 0.28, 0, 0, TAU);
        g.fill();
        g.strokeStyle = "rgba(10,40,30,.85)";
        g.lineWidth = r * 0.035;
        g.beginPath();
        g.moveTo(-r * 0.36, 0);
        g.lineTo(r * 0.36, 0);
        g.stroke();
        g.restore();
      } else {
        g.fillStyle = "rgba(255,255,255,.9)";
        g.beginPath();
        g.ellipse(side * r * 0.44 + lookX * r - r * 0.1, -r * 0.13, r * 0.09, r * 0.06, 0, 0, TAU);
        g.fill();
      }
    }
  }
  let cowArt = null;
  const cowPicture = () => cowArt || (cowArt = paintCow());
  function paintCow() {
    const W = 320, H = 220, [c, x] = paper(W, H);
    x.lineCap = "round";
    x.strokeStyle = "#f1ece2";
    x.lineWidth = 16;
    for (const [a, b] of [[92, 150], [122, 156], [182, 156], [212, 150]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(a + (a < 150 ? -8 : 8), 204); x.stroke(); }
    x.lineWidth = 6;
    x.beginPath();
    x.moveTo(62, 96);
    x.quadraticCurveTo(26, 96, 30, 150);
    x.stroke();
    x.fillStyle = "#f1ece2";
    x.beginPath();
    x.ellipse(148, 112, 98, 56, 0, 0, TAU);
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = "#17171c";
    for (const [a, b, e, f] of [[100, 86, 38, 30], [176, 130, 42, 28], [214, 86, 22, 26], [78, 142, 26, 18]]) { x.beginPath(); x.ellipse(a, b, e, f, 0.4, 0, TAU); x.fill(); }
    x.restore();
    x.fillStyle = "#f1ece2";
    x.beginPath();
    x.ellipse(266, 84, 40, 34, 0.2, 0, TAU);
    x.fill();
    x.fillStyle = "#eeb4b4";
    x.beginPath();
    x.ellipse(286, 100, 25, 18, 0.2, 0, TAU);
    x.fill();
    x.fillStyle = "#17171c";
    for (const [a, b, r] of [[258, 74, 5], [280, 72, 5], [282, 100, 3], [296, 102, 3]]) { x.beginPath(); x.arc(a, b, r, 0, TAU); x.fill(); }
    x.strokeStyle = "#d9c8a0";
    x.lineWidth = 7;
    for (const [a, b] of [[250, 56], [284, 54]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(a + (a < 266 ? -8 : 10), b - 22); x.stroke(); }
    return c;
  }
  function paintVinyl() { // a record the size of a moon, with what's playing on its label
    const S = 512, mid = S / 2, [c, x] = paper(S);
    x.fillStyle = "#0c0c0e";
    x.beginPath();
    x.arc(mid, mid, S * 0.49, 0, TAU);
    x.fill();
    x.lineWidth = 1;
    for (let r = S * 0.2; r < S * 0.48; r += 3) { x.strokeStyle = `rgba(255,255,255,${rnd(0.03, 0.11).toFixed(3)})`; x.beginPath(); x.arc(mid, mid, r, 0, TAU); x.stroke(); }
    x.strokeStyle = "rgba(255,255,255,.14)";
    x.lineWidth = S * 0.06;
    for (const from of [0.4, 3.5]) { x.beginPath(); x.arc(mid, mid, S * 0.34, from, from + 0.45); x.stroke(); }
    x.save();
    x.beginPath();
    x.arc(mid, mid, S * 0.18, 0, TAU);
    x.fillStyle = rgba(colors[0], 1);
    x.fill();
    x.clip();
    if (picture) { try { x.drawImage(picture, mid - S * 0.18, mid - S * 0.18, S * 0.36, S * 0.36); } catch { /* the plain label will do */ } }
    x.restore();
    x.fillStyle = "#0c0c0e";
    x.beginPath();
    x.arc(mid, mid, S * 0.02, 0, TAU);
    x.fill();
    return c;
  }
  function paintSign() {
    const W = 360, H = 280, signs = Packs.words().signs, sign = signs[Math.floor(rnd(0, signs.length))], [c, x] = paper(W, H), n = sign.lines.length, big = n === 3 ? 58 : 66;
    x.fillStyle = "#9aa0a8";
    x.fillRect(W / 2 - 8, H * 0.62, 16, H * 0.38);
    x.fillStyle = sign.bg;
    x.strokeStyle = sign.ink;
    x.lineWidth = 7;
    x.beginPath();
    x.roundRect(10, 10, W - 20, H * 0.68, 18);
    x.fill();
    x.stroke();
    x.fillStyle = sign.ink;
    x.textAlign = "center";
    x.font = `800 ${big}px ui-sans-serif, system-ui, sans-serif`;
    sign.lines.map((line) => line.toUpperCase()).forEach((line, i) => { let size = big; while (x.measureText(line).width > W - 56 && size > 20) { size -= 2; x.font = `800 ${size}px ui-sans-serif, system-ui, sans-serif`; } x.fillText(line, W / 2, 10 + (H * 0.68 * (i + 0.72)) / n + (n === 3 ? 0 : 6)); x.font = `800 ${big}px ui-sans-serif, system-ui, sans-serif`; });
    return c;
  }
  function oddity(kind, soon) {
    sky.told = Packs.words().told[kind];
    if (kind === "astronaut") { meet(kind); return; }
    const side = Math.random() < 0.5 ? -1 : 1, art = kind === "cow" ? cowPicture() : kind === "vinyl" ? paintVinyl() : paintSign(), z = soon ? 16 : TRIPS[name] && TRIPS[name].pace < 0.6 ? 20 : FAR;
    sky.things.push({ kind, solid: true, art, tall: art.height / art.width, x: sky.x + sky.vx * z + side * rnd(2.2, 4.5), y: sky.y + sky.vy * z + rnd(-1.6, 1.6), z, size: kind === "vinyl" ? rnd(7, 10) : kind === "cow" ? rnd(2.6, 3.4) : rnd(3.6, 4.6), turn: kind === "sign" ? rnd(-0.18, 0.18) : rnd(0, TAU), spin: kind === "vinyl" ? 2.4 : kind === "cow" ? rnd(-0.7, 0.7) : rnd(-0.05, 0.05), squash: kind === "vinyl" ? rnd(0.55, 0.85) : 1, near: 2.2, nod: rnd(0.6, 1) * side });
  }
  function drawAstronaut(o, part) { // floating past and dancing, with nobody to tell it to stop
    const { t, dt, kickHit } = sound, S = o.size, fromX = o.side > 0 ? w * 1.15 : -w * 0.15, limb = (a, b, e, f) => { g.beginPath(); g.moveTo(a * S, b * S); g.lineTo(e * S, f * S); g.stroke(); };
    if (kickHit) o.beat++;
    o.arm += ((o.beat % 2 ? 1 : -1) - o.arm) * (1 - Math.exp(-dt / 0.06));
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(part / 0.06) * clamp((1 - part) / 0.06);
    g.translate(fromX + (w - 2 * fromX) * part, o.y + sky.bob * S * 0.3 + Math.sin(t * 0.6 + o.seed) * h * 0.02);
    g.rotate(Math.sin(t * 0.35 + o.seed) * 0.5 + t * 0.06 * o.side);
    g.lineCap = "round";
    g.strokeStyle = "#e6eaf0";
    g.lineWidth = S * 0.16;
    limb(-0.2, -0.05, -0.52, -0.05 - 0.38 * o.arm);
    limb(0.2, -0.05, 0.52, -0.05 + 0.38 * o.arm);
    limb(-0.12, 0.38, -0.2 - 0.07 * o.arm, 0.74);
    limb(0.12, 0.38, 0.2 - 0.07 * o.arm, 0.74);
    g.fillStyle = "#f3f5f8";
    g.beginPath();
    g.roundRect(-0.25 * S, -0.2 * S, 0.5 * S, 0.62 * S, 0.12 * S);
    g.fill();
    g.fillStyle = rgba(colors[0], 1);
    g.beginPath();
    g.arc(0.1 * S, 0.02 * S, 0.05 * S, 0, TAU);
    g.fill();
    g.fillStyle = "#f3f5f8";
    g.beginPath();
    g.arc(0, -0.42 * S, 0.3 * S, 0, TAU);
    g.fill();
    g.fillStyle = "#11141c";
    g.beginPath();
    g.ellipse(0, -0.41 * S, 0.21 * S, 0.17 * S, 0, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.8)";
    g.beginPath();
    g.ellipse(-0.08 * S, -0.47 * S, 0.06 * S, 0.035 * S, -0.5, 0, TAU);
    g.fill();
  }
  function drawCow(o, part) { // outside Space a cow can't come from far ahead, so it floats across, turning slowly
    const { t } = sound, S = o.size, art = cowPicture(), tall = (S * art.height) / art.width, fromX = o.side > 0 ? w * 1.15 : -w * 0.15;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(part / 0.06) * clamp((1 - part) / 0.06);
    g.translate(fromX + (w - 2 * fromX) * part, o.y + sky.bob * S * 0.3 + Math.sin(t * 0.6 + o.seed) * h * 0.02);
    g.rotate(o.turn + t * o.spin);
    g.drawImage(art, -S / 2, -tall / 2, S, tall);
  }
  /* The psychedelic visitors, for goa and psytrance. */
  function drawEye(o, part) { // a great eye opens in the sky, looks about, blinks, opens its pupil wide on the kick and closes again. Its iris runs through every color
    const { t, kick } = sound, open = 1 - (1 - clamp(Math.min(part / 0.14, (1 - part) / 0.12))) ** 3;
    if (t > o.blink) { o.blink = t + rnd(1.8, 4.5); o.shut = t + 0.14; }
    if (o.drift) o.x += o.drift * sound.dt;
    const W = o.size, lid = t < o.shut ? 0.05 : open, H = Math.max(W * 0.02, W * 0.5 * lid), R = W * 0.4, hue = rainbowTone(t * 0.4, o.seed);
    const look = [Math.sin(t * 0.6 + o.seed) * W * 0.32, Math.sin(t * 0.43 + o.seed * 2) * W * 0.06];
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(part / 0.05) * clamp((1 - part) / 0.05);
    g.translate(o.x, o.y + sky.bob * W * 0.05);
    softBlob(g, 0, 0, W * 1.7, hue, (0.22 + 0.25 * kick) * open);
    g.lineCap = "round";
    g.lineWidth = W * 0.035;
    for (let i = 0; i < 14; i++) { // rays all round it, longer on a kick
      const a = (i / 14) * TAU + t * 0.15, long = W * (1.12 + 0.25 * kick + 0.08 * Math.sin(t * 3 + i));
      g.strokeStyle = rgba(rainbowTone(t * 0.4 + i / 14, o.seed), 0.35 * open);
      g.beginPath();
      g.moveTo(Math.cos(a) * W * 1.02, Math.sin(a) * W * 0.62);
      g.lineTo(Math.cos(a) * long, Math.sin(a) * long * 0.62);
      g.stroke();
    }
    const almond = () => { g.beginPath(); g.moveTo(-W, 0); g.quadraticCurveTo(0, -H * 2, W, 0); g.quadraticCurveTo(0, H * 2, -W, 0); g.closePath(); };
    almond();
    g.fillStyle = "#f6f2ea";
    g.fill();
    g.save();
    almond();
    g.clip();
    let iris = null;
    if (g.createConicGradient) { iris = g.createConicGradient(t * 0.7, look[0], look[1]); for (let i = 0; i <= 6; i++) iris.addColorStop(i / 6, rgba(rainbowTone(i / 2 + t * 0.15, 0), 1)); }
    g.fillStyle = iris || rgba(hue, 1);
    g.beginPath();
    g.arc(look[0], look[1], R, 0, TAU);
    g.fill();
    g.strokeStyle = "rgba(20,8,30,.3)";
    g.lineWidth = R * 0.06;
    for (const k of [0.62, 0.86]) { g.beginPath(); g.arc(look[0], look[1], R * k, 0, TAU); g.stroke(); }
    g.fillStyle = "#07040b";
    g.beginPath();
    g.arc(look[0], look[1], R * (0.3 + 0.24 * kick), 0, TAU); // the pupil opens wide on a kick
    g.fill();
    g.fillStyle = "rgba(255,255,255,.85)";
    g.beginPath();
    g.arc(look[0] - R * 0.28, look[1] - R * 0.3, R * 0.13, 0, TAU);
    g.fill();
    g.restore();
    almond();
    g.strokeStyle = "#1a0d26";
    g.lineWidth = W * 0.045;
    g.stroke();
  }
  function drawMandala(o, part) { // a kaleidoscope flower: it opens, its rings turn against each other, it breathes with the kick and folds away again
    const { t, kick } = sound, R = o.size * Math.sin(Math.PI * clamp(part)) ** 0.7 * (1 + 0.1 * kick);
    if (R < 1) return;
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.8;
    g.translate(o.x, o.y + sky.bob * o.size * 0.05);
    for (let ring = 0; ring < 4; ring++) {
      const n = o.petals + ring * 4, r = R * (1 - ring * 0.21), turn = t * o.spin * (ring % 2 ? -1.3 : 1) + ring * 0.4;
      g.fillStyle = rgba(rainbowTone(t * 0.2 + ring * 0.22, o.seed), 0.5 - ring * 0.07);
      for (let i = 0; i < n; i++) {
        g.save();
        g.rotate(turn + (i / n) * TAU);
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(r * 0.32, -r * 0.2, r, 0);
        g.quadraticCurveTo(r * 0.32, r * 0.2, 0, 0);
        g.fill();
        g.restore();
      }
    }
    softBlob(g, 0, 0, R * 0.32, [255, 255, 255], 0.45 + 0.4 * kick); // a bright heart
  }
  function drawToadstool(o, part) { // a toadstool walking along the bottom: it hops on the kick and squashes as it lands
    const { t, dt, kickHit } = sound, s = o.size;
    o.x += o.side * o.walk * dt;
    if (kickHit && o.up <= 0.001) o.vy = s * rnd(5, 7);
    o.vy -= s * 26 * dt;
    o.up = Math.max(0, o.up + o.vy * dt);
    if (o.up === 0 && o.vy < 0) { o.vy = 0; o.land = t; }
    const squash = o.land ? Math.max(0, 1 - (t - o.land) / 0.18) : 0, sx = 1 + 0.2 * squash, sy = 1 - 0.2 * squash + Math.min(0.14, Math.max(0, o.vy) / (s * 50)), cap = rainbowTone(t * 0.25, o.seed);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(part / 0.04) * clamp((1 - part) / 0.06);
    g.translate(o.x, o.ground - o.up);
    g.scale(sx * (o.side < 0 ? -1 : 1), sy);
    g.lineWidth = s * 0.06;
    g.strokeStyle = "#1c1424";
    g.fillStyle = "#f3ead6"; // the stem, with its face
    g.beginPath();
    g.moveTo(-s * 0.24, 0);
    g.quadraticCurveTo(-s * 0.3, -s * 0.5, -s * 0.2, -s * 0.78);
    g.lineTo(s * 0.2, -s * 0.78);
    g.quadraticCurveTo(s * 0.3, -s * 0.5, s * 0.24, 0);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "#1c1424";
    for (const side of [-1, 1]) { g.beginPath(); g.ellipse(side * s * 0.09 + s * 0.03, -s * 0.45, s * 0.035, s * 0.06, 0, 0, TAU); g.fill(); }
    g.beginPath();
    g.arc(s * 0.03, -s * 0.33, s * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    const shine = g.createRadialGradient(-s * 0.2, -s * 1.1, s * 0.05, 0, -s * 0.85, s * 0.7); // the cap, in whatever color it's in just now, with white spots
    shine.addColorStop(0, rgba(mix(cap, [255, 255, 255], 0.5), 1));
    shine.addColorStop(1, rgba(mix(cap, [0, 0, 0], 0.25), 1));
    g.fillStyle = shine;
    g.beginPath();
    g.moveTo(-s * 0.62, -s * 0.72);
    g.bezierCurveTo(-s * 0.62, -s * 1.38, s * 0.62, -s * 1.38, s * 0.62, -s * 0.72);
    g.quadraticCurveTo(0, -s * 0.84, -s * 0.62, -s * 0.72);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = "rgba(255,255,250,.92)";
    for (const [x, y, r] of [[-0.3, -1.0, 0.09], [0.05, -1.17, 0.11], [0.36, -0.96, 0.08], [-0.05, -0.9, 0.06]]) { g.beginPath(); g.arc(s * x, s * y, s * r, 0, TAU); g.fill(); }
  }
  /* Things that come by, not only people: neon tubes, lasers, a glowing sea, wireframe shapes, and at a drop a disco ball or confetti. */
  const glowLine = (tone, wide, light) => { // a stroke of light: a wide faint glow under a bright core
    for (const [width, alpha] of [[wide * 4, 0.1], [wide * 2, 0.26], [wide, 0.75]]) { g.strokeStyle = rgba(tone, alpha * light); g.lineWidth = width; g.stroke(); }
    g.strokeStyle = rgba(mix(tone, [255, 255, 255], 0.7), 0.95 * light); g.lineWidth = Math.max(1, wide * 0.45); g.stroke();
  };
  function neonPath(shape, s) {
    g.beginPath();
    if (shape === "ring") g.arc(0, 0, s, 0, TAU);
    else if (shape === "triangle") { for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i * TAU) / 3; g[i ? "lineTo" : "moveTo"](Math.cos(a) * s, Math.sin(a) * s); } }
    else if (shape === "star") { for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? s * 0.45 : s; g[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } }
    else if (shape === "heart") { g.moveTo(0, s * 0.8); g.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.45); g.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.8); }
    else if (shape === "bolt") { g.moveTo(s * 0.2, -s); g.lineTo(-s * 0.45, s * 0.1); g.lineTo(s * 0.05, s * 0.1); g.lineTo(-s * 0.2, s); g.lineTo(s * 0.45, -s * 0.1); g.lineTo(-s * 0.05, -s * 0.1); g.closePath(); }
    else { g.moveTo(-s, 0); for (let i = 1; i <= 6; i++) g.lineTo(-s + (i * 2 * s) / 6, i % 2 ? -s * 0.4 : s * 0.4); } // a zigzag
  }
  function drawNeon(o, part) { // a neon tube that buzzes on, glows with the kick and buzzes off again
    const { t, kick } = sound, age = part * o.life, left = (1 - part) * o.life, lit = age < 1.1 || left < 0.6 ? (Math.random() < 0.5 ? 1 : 0.12) : 1;
    g.globalCompositeOperation = "lighter";
    g.lineJoin = g.lineCap = "round";
    g.translate(o.x, o.y + Math.sin(t * 0.7 + o.seed) * o.size * 0.06);
    g.rotate(Math.sin(t * 0.3 + o.seed) * 0.12);
    neonPath(o.shape, o.size);
    glowLine(o.tone, o.size * 0.05 * (1 + 0.6 * kick), lit);
  }
  function drawLasers(o, part) { // beams from the floor, sweeping across, brightest on the kick
    const { t, kick } = sound, fade = clamp(part / 0.08) * clamp((1 - part) / 0.15), most = Math.max(w, h);
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (const [ox, dir] of [[w * 0.12, 1], [w * 0.88, -1]]) {
      for (let i = 0; i < o.beams; i++) {
        const a = -Math.PI / 2 + dir * (0.25 + 0.5 * (i / o.beams)) + Math.sin(t * o.speed + i * 0.9 + o.seed) * 0.45 * dir;
        g.beginPath();
        g.moveTo(ox, h * 1.02);
        g.lineTo(ox + Math.cos(a) * most * 1.4, h * 1.02 + Math.sin(a) * most * 1.4);
        glowLine(mood === "psy" ? rainbowTone(t * 0.3 + i / o.beams, o.seed) : o.tone, most * 0.0035, fade * (0.45 + 0.55 * kick));
      }
    }
  }
  function drawSea(o, part) { // a sea of light rises along the bottom, swells with the bass and sinks again
    const { t, bass, hatHit } = sound, rise = Math.sin(Math.PI * clamp(part)) ** 0.5, base = h * (1.02 - 0.2 * rise);
    g.globalCompositeOperation = "lighter";
    for (let layer = 0; layer < 4; layer++) {
      const amp = h * (0.018 + 0.03 * bass) * (1 + layer * 0.35), speed = 0.6 + layer * 0.25, tone = mix(o.tone, [255, 255, 255], layer * 0.12), y0 = base + layer * h * 0.035;
      const fill = g.createLinearGradient(0, y0 - amp * 2, 0, h);
      fill.addColorStop(0, rgba(tone, 0.24 * rise));
      fill.addColorStop(1, rgba(tone, 0));
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 8) g.lineTo(x, y0 + Math.sin(x / w * TAU * (1.3 + layer * 0.4) + t * speed * (layer % 2 ? -1 : 1) + o.seed) * amp);
      g.lineTo(w, h);
      g.closePath();
      g.fill();
    }
    if (hatHit) for (let i = 0; i < 3; i++) { const x = rnd(0, w); glint(x, base + Math.sin(x / w * TAU * 1.3 + t * 0.6 + o.seed) * h * 0.02, h * 0.02, 0.8 * rise); } // light catching the crests
  }
  const FORMS = { // wireframe shapes: corners and the edges between them
    cube: { at: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], edges: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] },
    octa: { at: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], edges: [[0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2]] },
    tetra: { at: [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]], edges: [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]] },
  };
  function drawShape(o, part) { // a turning wireframe, a little bigger on each kick
    const { t, dt, kick } = sound, form = FORMS[o.form], s = o.size * Math.sin(Math.PI * clamp(part)) ** 0.4 * (1 + 0.12 * kick);
    o.ax += dt * o.spin[0] * (1 + kick);
    o.ay += dt * o.spin[1] * (1 + kick);
    o.x += o.drift * dt;
    const [ca, sa, cb, sb] = [Math.cos(o.ax), Math.sin(o.ax), Math.cos(o.ay), Math.sin(o.ay)];
    const flat = form.at.map(([x, y, z]) => { const y1 = y * ca - z * sa, z1 = y * sa + z * ca, x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb, d = 3 / (3 + z2); return [o.x + x2 * s * d, o.y + y1 * s * d]; });
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.beginPath();
    for (const [a, b] of form.edges) { g.moveTo(...flat[a]); g.lineTo(...flat[b]); }
    glowLine(mood === "psy" ? rainbowTone(t * 0.3, o.seed) : o.tone, Math.max(1, s * 0.03), 0.8 * clamp(part / 0.05) * clamp((1 - part) / 0.08));
  }
  function drawDisco(o, part) { // a mirror ball comes down at the drop, turns, and throws spots of light all round
    const { t, kick } = sound, down = part < 0.12 ? 1 - (1 - part / 0.12) ** 3 : part > 0.88 ? 1 - ((part - 0.88) / 0.12) ** 2 : 1, R = o.size, y = -R * 1.4 + down * (h * 0.22 + R * 1.4), turn = t * 0.8;
    g.globalCompositeOperation = "source-over";
    g.strokeStyle = "rgba(200,200,210,.6)";
    g.lineWidth = Math.max(1, R * 0.03);
    g.beginPath();
    g.moveTo(o.x, 0);
    g.lineTo(o.x, y - R);
    g.stroke();
    const shine = g.createRadialGradient(o.x - R * 0.35, y - R * 0.35, R * 0.1, o.x, y, R);
    shine.addColorStop(0, "#f4f6fa");
    shine.addColorStop(1, "#5d6370");
    g.fillStyle = shine;
    g.beginPath();
    g.arc(o.x, y, R, 0, TAU);
    g.fill();
    for (let row = -4; row <= 4; row++) for (let col = 0; col < 12; col++) { // its little mirrors, catching the light as it turns
      const lat = (row / 5) * (Math.PI / 2), lon = (col / 12) * TAU + turn, z = Math.cos(lat) * Math.cos(lon);
      if (z < 0) continue;
      const fx = o.x + Math.cos(lat) * Math.sin(lon) * R * 0.94, fy = y + Math.sin(lat) * R * 0.94, flash = (Math.sin(lon * 3 + row + t * 4) + 1) / 2;
      g.fillStyle = `rgba(255,255,255,${(0.15 + 0.6 * flash * z).toFixed(3)})`;
      g.fillRect(fx - R * 0.06, fy - R * 0.06, R * 0.12 * z, R * 0.12);
    }
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 18; i++) { // the spots it throws, sweeping round the room
      const a = (i / 18) * TAU + turn * 0.6, reach = Math.max(w, h) * (0.3 + 0.5 * ((i * 0.37) % 1));
      softBlob(g, o.x + Math.cos(a) * reach, y + Math.sin(a) * reach * 0.6, Math.max(w, h) * 0.022, mood === "psy" ? rainbowTone(i / 18 + t * 0.2, 0) : [255, 255, 255], (0.4 + 0.45 * kick) * down);
    }
  }
  function drawConfetti(o, part) { // a burst of paper at the drop, fluttering down
    const { dt } = sound, fade = clamp((1 - part) / 0.25);
    g.globalCompositeOperation = "source-over";
    for (const p of o.bits) {
      p.vy += h * 0.32 * dt; // paper: it floats down rather than falling
      p.vx *= 0.975;
      p.vy *= 0.975;
      p.x += (p.vx + Math.sin(p.turn * 2) * w * 0.02) * dt;
      p.y += p.vy * dt;
      p.turn += p.spin * dt;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.turn);
      g.scale(1, Math.cos(p.turn * 1.7)); // turning over as it falls
      g.fillStyle = rgba(p.tone, fade);
      g.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      g.restore();
    }
  }
  function drawFall(o, part) { // the season: snow, petals or leaves drifting down, or fireflies wandering on a summer night
    const { t, dt, kick } = sound, fade = clamp(part / 0.1) * clamp((1 - part) / 0.15), s = Math.min(w, h);
    g.globalCompositeOperation = o.style === "fireflies" ? "lighter" : "source-over";
    for (const p of o.bits) {
      if (o.style === "fireflies") {
        p.x += Math.cos(t * p.v + p.phase) * s * 0.03 * dt;
        p.y += Math.sin(t * p.v * 1.3 + p.phase) * s * 0.025 * dt;
        softBlob(g, p.x, p.y, s * 0.012 * (1 + kick * 0.5), [220, 255, 120], 0.6 * ((Math.sin(t * 2.2 + p.phase * 5) + 1) / 2) * fade);
        continue;
      }
      p.y += p.v * dt;
      p.x += Math.sin(t * 0.8 + p.phase) * s * 0.03 * dt;
      p.rot += p.spin * dt;
      if (p.y > h + 20) { p.y = -20; p.x = rnd(0, w); }
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.globalAlpha = fade;
      g.beginPath();
      if (o.style === "snow") { g.fillStyle = "rgba(255,255,255,.85)"; g.arc(0, 0, p.size, 0, TAU); }
      else if (o.style === "petals") { g.fillStyle = "rgba(255,182,205,.9)"; g.ellipse(0, 0, p.size * 1.6, p.size * 0.8, 0, 0, TAU); }
      else { g.fillStyle = p.tone; g.moveTo(0, -p.size * 1.6); g.quadraticCurveTo(p.size * 1.2, 0, 0, p.size * 1.6); g.quadraticCurveTo(-p.size * 1.2, 0, 0, -p.size * 1.6); }
      g.fill();
      g.restore();
    }
  }
  /* Everyone is drawn a little off their own path, by how the song is going and by the effect behind them: a build draws them in towards the middle,
     the drop throws them out, the bars bounce them, the ribbon's wave carries them, the trails swirl them, and a kick in the round effects nudges them out. */
  function moved(o, dt) {
    const family = FAMILY[name] || "", px = o.x ?? w / 2, py = o.y ?? o.ground ?? h / 2;
    if (o.pushX === undefined) Object.assign(o, { pushX: 0, pushY: 0, pushVX: 0, pushVY: 0 });
    let tx = (w / 2 - px) * 0.22 * flow.build, ty = (h / 2 - py) * 0.22 * flow.build;
    if (family === "bars") ty -= (sound.bands[Math.max(0, Math.min(BANDS - 1, Math.floor((px / w) * BANDS)))] || 0) * h * 0.07;
    else if (family === "ribbon") ty += Math.sin((px / w) * TAU * 1.5 + sound.t * 1.8) * h * 0.03 * (0.5 + sound.bass);
    else if (family === "trails") tx += Math.cos(sound.t * 0.5 + (py / h) * 3) * w * 0.015;
    if (flow.dropHit || ((family === "halo" || family === "stars") && sound.kickHit)) {
      const ax = px + o.pushX - w / 2, ay = py + o.pushY - h / 2, d = Math.hypot(ax, ay) || 1, push = Math.max(w, h) * (flow.dropHit ? 0.8 : 0.12 * sound.kickHit) * T.react;
      o.pushVX += (ax / d) * push;
      o.pushVY += (ay / d) * push;
    }
    spring(o, "pushX", "pushVX", 9, 4.5, dt, -tx); // and a spring brings them back to where they were going
    spring(o, "pushY", "pushVY", 9, 4.5, dt, -ty);
    return [o.pushX, o.pushY];
  }
  const DRAWN_BY = { astronaut: drawAstronaut, saucer: drawSaucer, jelly: drawJelly, whale: drawWhale, smiley: drawSmiley, peek: drawPeek, cow: drawCow, eye: drawEye, mandala: drawMandala, toadstool: drawToadstool,
    neon: drawNeon, lasers: drawLasers, sea: drawSea, shape: drawShape, disco: drawDisco, confetti: drawConfetti, fall: drawFall };
  const STILL = new Set(["lasers", "sea", "confetti", "disco", "fall"]); // they fill the picture, so they aren't pushed around
  let when = { hour: "", season: "", era: "", party: 0 }; // the time of day and the season, the record's era, and how long the music's been going (set by the app)
  function invite(trip) { // somebody new, when it's time: who depends on what's playing, now and then on the season, and a long session brings more of them
    const { t } = sound, list = FOLK_OF[name] || FOLK[mood] || FOLK[""], season = when.season === "winter" ? "snow" : when.season === "spring" ? "petals" : when.season === "autumn" ? "leaves" : when.season === "summer" && when.hour === "night" ? "fireflies" : "";
    if (T.folk && t > crowd.at && crowd.folk.length < trip.crowd + when.party) { meet(season && crowd.step % 5 === 4 ? season : list[crowd.step % list.length]); crowd.step++; crowd.at = t + rnd(...trip.folk) / T.folk / (1 + 0.6 * when.party); }
    if (T.folk && trip.odd && t > crowd.oddAt) { const kind = trip.odd[crowd.oddStep++ % trip.odd.length]; if (TRIPS[name]) oddity(kind); else meet(kind); crowd.oddAt = t + rnd(40, 110) / T.folk; }
  }
  function drawFolk() {
    const { t } = sound;
    crowd.folk = crowd.folk.filter((o) => {
      const part = (t - o.born) / o.life;
      if (part >= 1) return false;
      if (part < 0) return true; // one of a group, not quite here yet
      g.save();
      if (!STILL.has(o.kind)) { const [dx, dy] = moved(o, sound.dt); g.translate(dx, dy); }
      DRAWN_BY[o.kind](o, part);
      g.restore();
      return true;
    });
    g.globalAlpha = 1;
  }

  /* A planet rising from below with curtains of light along its edge, moving to the music. The curtains are drawn very small and stretched up, which melts them together. */
  function planetShape(seen) {
    const R = w * 0.95, top = h * (1.02 - 0.34 * seen) + sky.bob * h * 0.017, px = w / 2, py = top + R;
    return { R, top, px, py, limb: (x) => py - Math.sqrt(Math.max(0, R * R - (x - px) * (x - px))) };
  }
  function curtains(seen) {
    const { t, kick } = sound, [c, x] = sky.veil, W = c.width, H = c.height, down = H / h, right = w / W, { limb } = planetShape(seen);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "source-over";
    x.clearRect(0, 0, W, H);
    x.globalCompositeOperation = "lighter";
    for (let k = 0; k < 2; k++) {
      const low = around(k * 0.33 + t * 0.03), high = around(k * 0.33 + 0.4 + t * 0.03), paint = x.createLinearGradient(0, 0, 0, 1);
      paint.addColorStop(0, rgba(low, 0.95));
      paint.addColorStop(0.25, rgba(low, 0.6));
      paint.addColorStop(0.6, rgba(high, 0.22));
      paint.addColorStop(1, rgba(high, 0));
      x.fillStyle = paint;
      for (let i = 0; i < W; i++) {
        const u = i / W, band = smooth(u * BANDS * 0.75), tall = H * (0.2 + 0.24 * Math.sin(u * 4.3 + t * 0.33 + k * 2) ** 2 + 0.26 * band), foot = (limb(i * right) - h * 0.015) * down + Math.sin(u * 9 + t * 0.6 + k) * H * 0.012;
        x.globalAlpha = seen * (0.14 + 0.36 * band + 0.14 * kick) * (0.45 + 0.55 * Math.sin(u * 23 + t * 1.1 + k * 5) ** 2);
        x.setTransform(1, 0, 0, -tall, i, foot);
        x.fillRect(0, 0, 1, 1);
      }
    }
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    g.drawImage(c, 0, 0, w, h);
  }
  function planet(seen) {
    const { t } = sound, { R, top, px, py } = planetShape(seen), body = g.createRadialGradient(px, top, R * 0.02, px, top + R * 0.25, R * 0.9);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    body.addColorStop(0, "#0c1322");
    body.addColorStop(0.35, "#050811");
    body.addColorStop(1, "#020308");
    g.fillStyle = body;
    g.beginPath();
    g.arc(px, py, R, 0, TAU);
    g.fill();
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = rgba(around(t * 0.02), 1);
    for (const [wide, light] of [[h * 0.05, 0.05], [h * 0.02, 0.15], [Math.max(1.5, h / 420), 0.75]]) {
      g.globalAlpha = light * seen;
      g.lineWidth = wide;
      g.beginPath();
      g.arc(px, py, R, 0, TAU);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  function inkStars(path) { // the stars' trails go on a sheet of their own, which only fades slowly
    if (!sky.ink || sky.ink[0].width !== Math.round(w / 2) || sky.ink[0].height !== Math.round(h / 2)) sky.ink = paper(Math.round(w / 2), Math.round(h / 2));
    const [c, x] = sky.ink;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = "destination-out";
    x.fillStyle = `rgba(0,0,0,${(0.022 + 0.022 * Math.min(1, sound.dt * 30)).toFixed(3)})`;
    x.fillRect(0, 0, c.width, c.height);
    if (path) {
      x.globalCompositeOperation = "lighter";
      x.setTransform(0.5, 0, 0, 0.5, c.width / 2, c.height / 2);
      x.strokeStyle = "rgba(205,222,255,.8)";
      x.lineWidth = Math.max(1.6, h / 380);
      x.lineCap = "round";
      x.stroke(path);
    }
    const before = g.getTransform();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.drawImage(c, 0, 0, w, h);
    g.setTransform(before);
  }
  function flightStars(amount, reach, streak, roll) { // the near stars, drawn as streaks as long as the speed. When the ship turns they go past to one side
    const TONES = [[255, 255, 255], [170, 200, 255], [255, 220, 180]], paths = Array.from({ length: 9 }, () => new Path2D()), sideX = sky.vx * amount, sideY = sky.vy * amount, inking = sky.inkLeft > 0, trail = inking && (sky.move === "trail" || sky.move === "exposure") ? new Path2D() : null, c = Math.cos(roll), sn = Math.sin(roll), c0 = Math.cos(sky.rollWas), s0 = Math.sin(sky.rollWas);
    const stretch = Math.min(streak, 0.2 / Math.max(amount, 1e-6)); // however fast it goes and however hard it turns, a streak reaches back no more than a fifth of the way
    for (let i = 0; i < STARS; i++) {
      const z = stars[i * 3 + 2], next = z - amount, x = stars[i * 3] - sideX, y = stars[i * 3 + 1] - sideY;
      if (next <= 0.03) { stars[i * 3] = Math.random() * 2 - 1; stars[i * 3 + 1] = Math.random() * 2 - 1; stars[i * 3 + 2] = 1 - Math.random() * Math.min(0.97, Math.max(0, amount)); continue; } // spread over the stretch this frame covered, as in starfield, so they never bunch into sheets
      stars[i * 3 + 2] = next;
      if (Math.abs(x) > 1 || Math.abs(y) > 1) { stars[i * 3] = x - Math.sign(x) * (Math.abs(x) > 1 ? 2 : 0); stars[i * 3 + 1] = y - Math.sign(y) * (Math.abs(y) > 1 ? 2 : 0); continue; } // round to the other side, with nothing drawn across the middle
      stars[i * 3] = x;
      stars[i * 3 + 1] = y;
      const path = paths[(i % 3) * 3 + Math.min(2, Math.floor((1 - next) * 3))], was = Math.min(1, next + amount * stretch), fromX = ((x + sideX * stretch) / was) * reach, fromY = ((y + sideY * stretch) / was) * reach, toX = (x / next) * reach, toY = (y / next) * reach;
      path.moveTo(fromX, fromY);
      path.lineTo(toX, toY);
      if (trail) { trail.moveTo(toX * c0 - toY * s0, toX * s0 + toY * c0); trail.lineTo(toX * c - toY * sn, toX * sn + toY * c); }
    }
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let p = 0; p < 9; p++) {
      g.lineWidth = Math.max(1, (h / 540) * (1 + (p % 3) * 0.7));
      g.strokeStyle = rgba(TONES[Math.floor(p / 3)], 0.35 + (p % 3) * 0.3);
      g.stroke(paths[p]);
    }
    if (inking) inkStars(trail);
    sky.rollWas = roll;
  }
  function warpRings(speed, focal) { // going so fast that the kicks go past as rings of light
    const { dt, kickHit } = sound;
    if (kickHit) sky.rings.push(1);
    sky.rings = sky.rings.map((z) => z - (speed * dt) / 26).filter((z) => z > 0.05);
    g.globalCompositeOperation = "lighter";
    for (const z of sky.rings) {
      g.strokeStyle = rgba(around(z + sound.t * 0.05), Math.min(1, (1 - z) * 2) * Math.min(1, z * 4) * 0.7);
      g.lineWidth = Math.max(1, (h / 300) * (1.2 - z));
      g.beginPath();
      g.ellipse(sky.vx * focal, sky.vy * focal, (w * 0.16) / z, (h * 0.16) / z, 0, 0, TAU);
      g.stroke();
    }
  }
  /* The cockpit in Voyage: the frame is painted once for the size of the window, and only the instruments are drawn each frame. */
  const windscreen = () => {
    const X = (u) => u * w, Y = (v) => v * h, win = new Path2D();
    win.moveTo(X(0.13), Y(0.055));
    win.lineTo(X(0.87), Y(0.055));
    win.quadraticCurveTo(X(0.905), Y(0.058), X(0.915), Y(0.1));
    win.lineTo(X(0.992), Y(0.6));
    win.quadraticCurveTo(X(0.996), Y(0.665), X(0.955), Y(0.68));
    win.quadraticCurveTo(X(0.5), Y(0.86), X(0.045), Y(0.68));
    win.quadraticCurveTo(X(0.004), Y(0.665), X(0.008), Y(0.6));
    win.lineTo(X(0.085), Y(0.1));
    win.quadraticCurveTo(X(0.095), Y(0.058), X(0.13), Y(0.055));
    win.closePath();
    return win;
  };
  const dashAt = (px) => { const along = Math.min(1, Math.max(0, (px / w - 0.045) / 0.91)); return h * (0.68 + 2 * along * (1 - along) * 0.18); }; // where the top of the dashboard is
  function paintDie() {
    const S = 96, [c, x] = paper(S), mid = S / 2, side = S * 0.62;
    x.strokeStyle = "rgba(245,245,250,.9)";
    x.lineCap = "round";
    x.lineWidth = 1.6;
    for (let i = 0; i < 260; i++) { // fuzz
      const a = rnd(0, TAU), box = side / 2 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))), from = box - rnd(0, 3), to = box + rnd(1, 7);
      x.beginPath();
      x.moveTo(mid + Math.cos(a) * from, mid + Math.sin(a) * from);
      x.lineTo(mid + Math.cos(a) * to, mid + Math.sin(a) * to);
      x.stroke();
    }
    x.fillStyle = "#f4f4f8";
    x.beginPath();
    x.roundRect(mid - side / 2, mid - side / 2, side, side, S * 0.08);
    x.fill();
    x.fillStyle = "#15151c";
    for (const [px, py] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) { x.beginPath(); x.arc(mid + px * side * 0.27, mid + py * side * 0.27, S * 0.06, 0, TAU); x.fill(); }
    return c;
  }
  function paintSplat() { // something hit the glass
    const S = 128, mid = S / 2, [c, x] = paper(S), tone = LOOKS[""].skin;
    x.fillStyle = rgba(tone, 0.92);
    x.beginPath();
    for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU, r = S * (i % 2 ? rnd(0.12, 0.19) : rnd(0.24, 0.42)); x.lineTo(mid + Math.cos(a) * r, mid * 0.8 + Math.sin(a) * r); }
    x.closePath();
    x.fill();
    x.strokeStyle = rgba(tone, 0.92);
    x.lineCap = "round";
    for (let i = 0; i < 3; i++) { x.lineWidth = rnd(3, 6); const px = mid + rnd(-24, 24); x.beginPath(); x.moveTo(px, mid); x.lineTo(px, S - rnd(4, 26)); x.stroke(); }
    x.strokeStyle = "#0b1a10";
    x.lineWidth = 3;
    for (const side of [-1, 1]) { const ex = mid + side * 11, ey = mid * 0.72; x.beginPath(); x.moveTo(ex - 4, ey - 4); x.lineTo(ex + 4, ey + 4); x.moveTo(ex + 4, ey - 4); x.lineTo(ex - 4, ey + 4); x.stroke(); } // it's seen better days
    return c;
  }
  function makeDeck() {
    const u = Math.min(w / 1600, h / 1000), mid = w / 2, M = 8, [c, x] = paper(w + M * 2, h + M * 2), win = windscreen(), hull = x.createLinearGradient(0, 0, 0, h);
    const radar = { x: mid - 480 * u, y: h - 112 * u, r: 78 * u }, screen = { x: mid - 235 * u, y: h - 186 * u, w: 470 * u, h: 150 * u }, panel = { x: mid + 370 * u, y: h - 186 * u, w: 220 * u, h: 150 * u }, banks = mid - 770 * u > 8 ? [{ x: mid - 770 * u, y: h - 150 * u }, { x: mid + 630 * u, y: h - 150 * u }] : [];
    x.translate(M, M);
    hull.addColorStop(0, "#07090e");
    hull.addColorStop(0.62, "#10141c");
    hull.addColorStop(0.8, "#1b212b");
    hull.addColorStop(1, "#0a0d12");
    x.fillStyle = hull;
    x.fillRect(-M, -M, w + M * 2, h + M * 2);
    x.lineWidth = Math.max(1, 1.2 * u);
    x.strokeStyle = "rgba(255,255,255,.05)";
    for (const [a, b, e, f] of [[0.04, 0.72, 0.3, 1], [0.96, 0.72, 0.7, 1], [0.3, 0.8, 0.3, 1], [0.7, 0.8, 0.7, 1], [0.13, 0, 0.13, 0.055], [0.87, 0, 0.87, 0.055]]) { x.beginPath(); x.moveTo(a * w, b * h); x.lineTo(e * w, f * h); x.stroke(); }
    x.fillStyle = "rgba(255,255,255,.1)";
    for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(((i + 0.5) / 26) * w, h * 0.028, 1.8 * u, 0, TAU); x.fill(); }
    const bezel = (bx, by, bw, bh, r) => { x.fillStyle = "#04070b"; x.strokeStyle = "rgba(255,255,255,.15)"; x.lineWidth = Math.max(1, 1.5 * u); x.beginPath(); x.roundRect(bx, by, bw, bh, r); x.fill(); x.stroke(); };
    bezel(radar.x - radar.r - 8 * u, radar.y - radar.r - 8 * u, (radar.r + 8 * u) * 2, (radar.r + 8 * u) * 2, radar.r + 8 * u);
    bezel(screen.x, screen.y, screen.w, screen.h, 10 * u);
    bezel(panel.x, panel.y, panel.w, panel.h, 10 * u);
    for (const b of banks) bezel(b.x, b.y, 140 * u, 62 * u, 8 * u);
    x.font = `600 ${Math.max(9, 11 * u)}px ui-sans-serif, system-ui, sans-serif`;
    x.fillStyle = "rgba(255,255,255,.38)";
    x.fillText("RADAR", radar.x - 18 * u, radar.y + radar.r + 22 * u);
    x.fillText("SOUND", screen.x + 12 * u, screen.y - 7 * u);
    x.fillText("WARP", panel.x + 12 * u, panel.y - 7 * u);
    x.fillText("BPM", panel.x + panel.w - 34 * u, panel.y - 7 * u);
    for (const [i, b] of banks.entries()) x.fillText(i ? "DO NOT PRESS" : "BASS SHIELDS", b.x + 8 * u, b.y - 6 * u);
    x.save(); // a bumper sticker
    x.translate(mid - 300 * u, h - 22 * u);
    x.rotate(-0.04);
    x.fillStyle = "#e8c62a";
    x.fillRect(-98 * u, -11 * u, 196 * u, 20 * u);
    x.fillStyle = "#15130a";
    x.font = `700 ${Math.max(7, 9.5 * u)}px ui-sans-serif, system-ui, sans-serif`;
    x.textAlign = "center";
    x.fillText("MY OTHER SHIP IS A TURNTABLE", 0, 3 * u);
    x.restore();
    x.globalCompositeOperation = "destination-out";
    x.fill(win);
    x.globalCompositeOperation = "source-over";
    x.save();
    x.clip(win);
    const glare = x.createLinearGradient(w * 0.1, 0, w * 0.55, h * 0.7), floorLight = x.createLinearGradient(0, h * 0.5, 0, h * 0.8);
    glare.addColorStop(0, "rgba(255,255,255,.07)");
    glare.addColorStop(0.35, "rgba(255,255,255,.012)");
    glare.addColorStop(0.43, "rgba(255,255,255,.055)");
    glare.addColorStop(0.5, "rgba(255,255,255,0)");
    x.fillStyle = glare;
    x.fillRect(0, 0, w, h);
    floorLight.addColorStop(0, "rgba(160,190,255,0)");
    floorLight.addColorStop(1, "rgba(160,190,255,.05)");
    x.fillStyle = floorLight;
    x.fillRect(0, 0, w, h);
    x.restore();
    return { w, h, u, M, art: c, win, radar, screen, panel, banks, lamps: new Uint8Array(40).map(() => Math.random() * 3), die: paintDie(), splat: paintSplat(), bobbleX: mid + 290 * u, diceX: w * 0.66 };
  }
  function splats(d) { // now and then something hits the glass, and a moment later the wiper deals with it
    const { t, dt, kickHit } = sound, u = d.u, P = { x: w / 2, y: dashAt(w / 2) + 14 * u }, L = h * 0.66;
    if (T.folk && !sky.splats.length && sky.wipe < 0 && t > sky.splatAt && kickHit) {
      for (let i = Math.floor(rnd(1, 4)); i > 0; i--) sky.splats.push({ x: rnd(0.2, 0.8) * w, y: rnd(0.14, 0.6) * h, size: rnd(70, 130) * u, turn: rnd(-0.5, 0.5), gone: false });
      sky.wipeAt = t + rnd(2.5, 5);
      sky.told = Packs.words().told.glass;
      sky.splatAt = t + rnd(60, 150) / T.folk;
    }
    if (sky.wipeAt && t > sky.wipeAt) { sky.wipeAt = 0; sky.wipe = 0; }
    let angle = 0;
    if (sky.wipe >= 0) {
      sky.wipe += dt / 1.7;
      if (sky.wipe >= 1) { sky.wipe = -1; sky.splats = []; }
      else angle = -1.3 + 2.6 * Math.sin(sky.wipe * Math.PI) ** 0.8 * (sky.wipe < 0.5 ? 1 : 1);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    for (const o of sky.splats) {
      if (sky.wipe >= 0 && Math.atan2(o.x - P.x, P.y - o.y) < angle) o.gone = true;
      if (o.gone) continue;
      g.globalAlpha = T.pit;
      g.save();
      g.translate(o.x, o.y);
      g.rotate(o.turn);
      g.drawImage(d.splat, -o.size / 2, -o.size / 2, o.size, o.size);
      g.restore();
    }
    if (sky.wipe >= 0) {
      const ex = P.x + Math.sin(angle) * L, ey = P.y - Math.cos(angle) * L;
      g.globalAlpha = T.pit;
      g.lineCap = "round";
      g.strokeStyle = "#0c0f14";
      g.lineWidth = 9 * u;
      g.beginPath();
      g.moveTo(P.x, P.y);
      g.lineTo(ex, ey);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,.3)";
      g.lineWidth = 1.5 * u;
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  function ticker(d, A) {
    const { t, dt } = sound, s = d.screen, u = d.u, size = Math.max(11, 17 * u), floorY = s.y + s.h - 12 * u;
    g.font = `700 ${size}px ui-monospace, Consolas, monospace`;
    if (!sky.tick || sky.tick.x + sky.tick.width < s.x) {
      const news = Packs.words().banter, list = mood ? [...news[mood], ...news[""]] : news[""], text = sky.told || (sky.tickStep++ % 2 && nowSong ? `NOW PLAYING: ${nowSong.toUpperCase()}` : list[Math.floor(rnd(0, list.length))]);
      sky.told = "";
      sky.tick = { text: text.toUpperCase(), x: s.x + s.w, width: g.measureText(text.toUpperCase()).width + 12 * u };
    }
    sky.tick.x -= dt * 150 * u;
    g.save();
    g.beginPath();
    g.rect(s.x + 6 * u, s.y, s.w - 12 * u, s.h);
    g.clip();
    g.fillStyle = rgba(mix(around(t * 0.02), [255, 255, 255], 0.35), A);
    g.fillText(sky.tick.text, sky.tick.x, floorY);
    g.restore();
  }
  function cockpit(camX) {
    const { t, dt, kick, hatHit, kickHit, bands } = sound;
    if (!sky.deck || sky.deck.w !== w || sky.deck.h !== h) sky.deck = makeDeck();
    const d = sky.deck, u = d.u, A = T.pit, rattle = Math.max(0, sky.speedNow - 3) * 0.6 + sky.surge * 2 + (sky.fall ? sky.fall.heat * 4 : 0), ox = rnd(-1, 1) * rattle, oy = sky.bob * h * 0.006 + rnd(-1, 1) * rattle, tone = around(t * 0.02);
    splats(d);
    g.setTransform(1, 0, 0, 1, ox, oy);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = A;
    g.drawImage(d.art, -d.M, -d.M);
    g.globalCompositeOperation = "lighter";
    neon(d.win, rgba(tone, 1), Math.max(1.2, 2 * u), (0.5 + 0.5 * kick) * A, 0.7);
    // the radar: what's really out there, seen from above
    const R = d.radar;
    g.save();
    g.beginPath();
    g.arc(R.x, R.y, R.r, 0, TAU);
    g.clip();
    g.strokeStyle = rgba(tone, 0.16 * A);
    g.lineWidth = 1;
    for (const part of [0.34, 0.67]) { g.beginPath(); g.arc(R.x, R.y, R.r * part, 0, TAU); g.stroke(); }
    const sweep = t * 1.6;
    g.lineWidth = Math.max(1, 1.6 * u);
    for (let k = 0; k < 9; k++) { g.strokeStyle = rgba(tone, (0.7 * A * (9 - k)) / 9); g.beginPath(); g.moveTo(R.x, R.y); g.lineTo(R.x + Math.cos(sweep - k * 0.075) * R.r, R.y + Math.sin(sweep - k * 0.075) * R.r); g.stroke(); }
    for (const o of sky.things) {
      if (o.kind === "nebula") continue;
      const bx = ((o.x - camX) / 14) * R.r, by = R.r - (o.z / FAR) * R.r * 2;
      g.fillStyle = rgba(o.solid ? [255, 200, 60] : [190, 225, 255], A);
      g.beginPath();
      g.arc(R.x + bx, R.y + by, (o.solid ? 3.4 : 2.6) * u, 0, TAU);
      g.fill();
    }
    if (crowd.folk.length && Math.sin(t * 7) > 0) { g.fillStyle = rgba([255, 70, 50], A); g.beginPath(); g.arc(R.x + Math.sin(t * 0.7) * R.r * 0.6, R.y - R.r * 0.3, 4 * u, 0, TAU); g.fill(); }
    g.restore();
    // the sound, and a line of news under it
    const S = d.screen, N = 34, room = (S.w - 24 * u) / N, tall = S.h * 0.58;
    for (let i = 0; i < N; i++) {
      const v = bands[Math.floor((i / N) * BANDS * 0.9)], high = Math.max(1, v * tall);
      g.fillStyle = rgba(around(i / N + t * 0.02), 0.9 * A);
      g.fillRect(S.x + 12 * u + i * room, S.y + 10 * u + tall - high, room * 0.72, high);
    }
    ticker(d, A);
    // how fast, and how fast the music is
    const Q = d.panel, CELLS = 12, lit = Math.round(clamp(Math.log2(1 + sky.speedNow) / Math.log2(9)) * CELLS), wide = (Q.w * 0.5) / CELLS;
    for (let i = 0; i < CELLS; i++) {
      g.fillStyle = i < lit ? rgba(i > CELLS * 0.75 ? [255, 80, 60] : i > CELLS * 0.5 ? [255, 196, 60] : tone, 0.95 * A) : `rgba(255,255,255,${(0.05 * A).toFixed(3)})`;
      g.fillRect(Q.x + 12 * u + i * wide, Q.y + 16 * u, wide * 0.68, Q.h * 0.36);
    }
    const bpm = flow.bpm; // the tempo the listening already worked out, on the real clock: counted on this one, which runs faster through a build and a drop, the dial read slow just when the music was at its fullest
    g.font = `700 ${Math.max(13, 30 * u)}px ui-monospace, Consolas, monospace`;
    g.fillStyle = rgba(tone, A);
    g.textAlign = "right";
    g.fillText(bpm ? String(bpm) : "---", Q.x + Q.w - 12 * u, Q.y + Q.h * 0.46);
    g.textAlign = "left";
    g.font = `700 ${Math.max(10, 14 * u)}px ui-monospace, Consolas, monospace`;
    const inAir = sky.fall && sky.fall.air > 0.5 ? (sky.fall.out < 0 ? "FALLING" : "CLIMBING") : ""; // inside a planet, that's the news
    g.fillStyle = rgba(inAir ? [255, 196, 60] : sky.speedNow > 3 ? [255, 90, 70] : sky.speedNow < 0.2 ? [255, 196, 60] : [255, 255, 255], (sky.speedNow > 3 && Math.sin(t * 16) < 0 ? 0.3 : 0.85) * A);
    g.fillText(inAir || (sky.speedNow > 3 ? "TOO FAST" : sky.speedNow < 0.2 ? "PARKED" : "CRUISING"), Q.x + 12 * u, Q.y + Q.h - 18 * u);
    // lamps that follow the hi-hats
    if (hatHit) for (let i = 0; i < 6; i++) d.lamps[Math.floor(rnd(0, 40))] = Math.floor(rnd(0, 4));
    d.banks.forEach((b, side) => {
      for (let i = 0; i < 20; i++) {
        const on = d.lamps[i + side * 20], px = b.x + 12 * u + (i % 10) * 12 * u, py = b.y + 14 * u + Math.floor(i / 10) * 20 * u;
        g.fillStyle = on ? rgba([tone, [255, 196, 60], [255, 80, 60]][on - 1], 0.95 * A) : `rgba(255,255,255,${(0.06 * A).toFixed(3)})`;
        g.fillRect(px, py, 8 * u, 10 * u);
      }
    });
    // on the dashboard: somebody nodding along
    if (kickHit) sky.neckSpeed += 7 * kickHit * T.nod;
    spring(sky, "neck", "neckSpeed", 170, 5, dt);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = A;
    const bx = d.bobbleX, by = dashAt(bx) - 3 * u, S2 = 76 * u, art = artOf(LOOKS[mood] ? mood : "").pilot;
    g.fillStyle = "#14171d";
    g.beginPath();
    g.roundRect(bx - 18 * u, by - 12 * u, 36 * u, 14 * u, 4 * u);
    g.fill();
    g.fillStyle = rgba((LOOKS[mood] || LOOKS[""]).skin, 1);
    g.beginPath();
    g.roundRect(bx - 9 * u, by - 34 * u, 18 * u, 24 * u, 6 * u);
    g.fill();
    g.save();
    g.translate(bx, by - 40 * u);
    g.rotate(sky.neck * 0.5);
    g.drawImage(art, -S2 / 2, -S2 * 0.72 + sky.neck * 14 * u, S2, S2);
    g.restore();
    // and fuzzy dice, swinging with the turns
    if (kickHit) sky.swingSpeed += (sky.swing >= 0 ? 1 : -1) * 0.9 * kickHit;
    spring(sky, "swing", "swingSpeed", 15, 0.9, dt, sky.bank * 1.5);
    const topY = h * 0.055, long = h * 0.17, endX = d.diceX + Math.sin(sky.swing) * long, endY = topY + Math.cos(sky.swing) * long, D = 50 * u;
    g.strokeStyle = "#cfd3da";
    g.lineWidth = Math.max(1, 1.4 * u);
    g.beginPath();
    g.moveTo(d.diceX, topY);
    g.lineTo(endX, endY);
    g.stroke();
    for (const [gapX, gapY, turn] of [[-0.52, 0.5, -0.25], [0.5, 0.78, 0.3]]) {
      g.save();
      g.translate(endX + gapX * D, endY + gapY * D);
      g.rotate(turn + sky.swing * 1.4);
      g.drawImage(d.die, -D / 2, -D / 2, D, D);
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
  }

  function worldSky(f, roll, reach) { // the air of the planet it's in: the sky overhead, or the underside of the deck that's up there by now, the haze at the horizon, and the deck underneath
    const { world, depth, air, hy } = f, at = FALL.depths.findIndex((d) => depth < d), i = at < 0 ? 3 : at, [lit, shade] = world.layers[i], over = i ? world.layers[i - 1][1] : null, under = i === 3 && world.glow ? shade : mix(lit, shade, 0.75), dim = (c) => rgba(mix(c, [5, 5, 12], 0.5 * clamp(depth / 14)), 1), paint = g.createLinearGradient(0, hy - h * 0.5, 0, hy + h * 0.5), sun = 0.4 * air * clamp(1 - (depth - 1.6) / 1.4);
    paint.addColorStop(0, dim(over || world.sky[0]));
    paint.addColorStop(0.3, dim(over ? mix(over, world.sky[1], 0.5) : world.sky[1]));
    paint.addColorStop(0.5, dim(world.sky[2]));
    paint.addColorStop(0.53, dim(mix(world.sky[2], under, 0.5))); // the deck underneath fades into the haze far off, and is dark enough close by for the lit tops of its clouds to stand out
    paint.addColorStop(1, dim(under));
    g.setTransform(1, 0, 0, 1, w / 2, h / 2);
    g.rotate(roll);
    g.globalAlpha = air;
    g.fillStyle = paint;
    g.fillRect(-reach, -reach, reach * 2, reach * 2);
    g.globalAlpha = 1;
    if (sun > 0.01) { // the sun, until the first deck closes over it
      g.globalCompositeOperation = "lighter";
      softBlob(g, f.sun * w, hy - h * 0.1, h * 0.55, mix(world.sky[2], [255, 255, 255], 0.5), sun);
      g.globalCompositeOperation = "source-over";
    }
  }
  function worldFar(f, roll) { // the planet coming up dead ahead, until it's all there is to see
    const p = clamp(f.at / FALL.near), across = (h * 0.07 * (2.9 / 0.07) ** (p ** 1.25)) / 0.6, shake = f.heat * h * 0.004;
    g.setTransform(1, 0, 0, 1, w / 2, h / 2);
    g.rotate(roll);
    g.translate(f.from[0] * w * (1 - p) + rnd(-1, 1) * shake, f.level + f.from[1] * h * (1 - p) + rnd(-1, 1) * shake);
    g.rotate(f.lean);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(f.at / 1.6) * (1 - f.air);
    g.drawImage(f.art, -across / 2, -across / 2, across, across);
    g.globalAlpha = 1;
  }
  function worldNear(f, roll, focal, reach, speed) { // what's in the air: the clouds of the deck underneath and of the one overhead, lightning, the fog on the way through a deck, whatever is falling, and the fire of going in
    const { t, dt, kick, kickHit } = sound, { world, depth, air, hy } = f, D = FALL.depths, at = D.findIndex((d) => depth < d), i = at < 0 ? 3 : at, step = speed * dt * 0.8, dark = 0.5 * clamp(depth / 14);
    for (const o of f.clouds) { // they come past like everything else out here, and start again far ahead
      o.z -= step;
      o.x -= sky.vx * step;
      if (o.z < 1.2) { o.z += FAR - 1.2; o.x = rnd(-34, 34); }
      if (Math.abs(o.x) > 34) o.x -= Math.sign(o.x) * 68;
    }
    if (air > 0) {
      f.clouds.sort((a, b) => b.z - a.z);
      g.setTransform(1, 0, 0, 1, w / 2, h / 2);
      g.rotate(roll);
      for (const o of f.clouds) {
        if (o.layer !== i && o.layer !== i - 1) continue;
        const k = focal / o.z, dy = D[o.layer] - depth + o.off, glow = o.layer === 3 && !!world.glow, wide = o.size * k * world.wide, tall = o.size * k * (glow ? 0.16 : 0.42), x = o.x * k, y = hy + dy * k, seen = air * clamp((FAR - o.z) / 16) * clamp((o.z - 1.2) / 2.2);
        if (seen <= 0 || Math.abs(x) - wide / 2 > reach || Math.abs(y) - tall > reach) continue;
        g.globalCompositeOperation = glow ? "lighter" : "source-over"; // what glows on the ground glows with the kick
        g.globalAlpha = seen * (glow ? 0.65 + 0.35 * kick : 0.92);
        g.save();
        g.translate(x, y);
        g.scale(o.flip, dy < 0 ? -1 : 1); // the ones overhead hang down, and show their undersides
        g.drawImage(f.puffs[o.layer][dy < 0 ? 2 : o.art], -wide / 2, -tall * 0.6, wide, tall);
        g.restore();
      }
      if (!f.bolt && kickHit && air > 0.9 && Math.random() < world.bolts * 0.14) { // lightning, on a kick
        let px = rnd(-0.45, 0.45) * w;
        const top = hy - h * rnd(0.5, 0.75), end = hy + h * rnd(0.02, 0.16), path = new Path2D();
        for (let n = 0; n <= 10; n++) { px += n ? rnd(-1, 1) * h * 0.035 : 0; if (n) path.lineTo(px, top + ((end - top) * n) / 10); else path.moveTo(px, top); }
        f.bolt = { path, life: 1 };
      }
      if (f.bolt) {
        const life = f.bolt.life;
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 1;
        g.fillStyle = rgba(world.bolt, 0.2 * life * life * air);
        g.fillRect(-reach, -reach, reach * 2, reach * 2);
        neon(f.bolt.path, rgba(world.bolt, 1), Math.max(1.5, h / 360), life * air);
        if ((f.bolt.life -= dt / 0.28) <= 0) f.bolt = null;
      }
      g.globalCompositeOperation = "source-over";
      for (let j = 0; j < 3; j++) { // going through a deck, there's nothing to see but the deck
        const near = 1 - Math.abs(depth - D[j]) / 0.7;
        if (near <= 0) continue;
        g.globalAlpha = eased(near) * air;
        g.fillStyle = rgba(mix(mix(world.layers[j][0], world.layers[j][1], 0.45), [5, 5, 12], dark), 1);
        g.fillRect(-reach, -reach, reach * 2, reach * 2);
      }
      g.globalAlpha = 1;
      if (world.bits && air > 0.5 && depth > 1) { // rain comes down, snow comes down slowly, embers go up, and all of it comes past
        const rain = world.bits === "rain", embers = world.bits === "embers", down = rain ? 1.5 : embers ? -0.3 : 0.22, out = rain ? 0.5 : 0.9, path = new Path2D();
        for (const b of f.bits) {
          const vx = b[0] * out * b[2], vy = (b[1] * out + down) * b[2];
          b[0] += vx * dt;
          b[1] += vy * dt;
          if (Math.abs(b[0]) > 1 || Math.abs(b[1]) > 1) { b[0] = rnd(-0.9, 0.9); b[1] = rain ? rnd(-1, -0.2) : rnd(-0.9, 0.9); }
          path.moveTo(b[0] * w * 0.6, b[1] * h * 0.6);
          path.lineTo((b[0] - vx * 0.05) * w * 0.6 - 0.5, (b[1] - vy * 0.05) * h * 0.6 - 0.5);
        }
        g.globalCompositeOperation = embers ? "lighter" : "source-over";
        g.lineCap = "round";
        g.lineWidth = rain ? Math.max(1, h / 800) : Math.max(1.5, h / 300);
        g.strokeStyle = rgba(embers ? world.glow || world.bolt : mix(world.sky[2], [255, 255, 255], 0.6), (rain ? 0.4 : 0.8) * clamp(air * 2 - 1));
        g.stroke(path);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (f.heat > 0.01) { // going in: fire round the edge of what can be seen (the glass, or the whole screen), and streaks of it going past
      const cx = w / 2, cy = h / 2 + f.level, rx = w * 0.54, ry = h * f.view, burn = f.heat * (0.75 + 0.25 * Math.sin(t * 41) * Math.sin(t * 17.3)), fire = g.createRadialGradient(0, 0, 0.15, 0, 0, 1);
      fire.addColorStop(0, "rgba(255,170,90,0)");
      fire.addColorStop(0.55, rgba([255, 140, 56], 0.16 * burn));
      fire.addColorStop(1, rgba([255, 84, 28], 0.85 * burn));
      g.globalCompositeOperation = "source-over"; // laid over rather than added, so it stays the color of fire on a bright sky too
      g.globalAlpha = 1;
      g.translate(cx, cy);
      g.scale(rx, ry);
      g.fillStyle = fire;
      g.fillRect(-4, -4, 8, 8);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "lighter";
      for (const [many, wide, light] of [[34, 1, 0.4], [12, 3.2, 0.16]]) {
        g.beginPath();
        for (let n = 0; n < many; n++) { const a = rnd(0, TAU), from = rnd(0.2, 0.8), to = from + rnd(0.1, 0.4); g.moveTo(cx + Math.cos(a) * rx * from, cy + Math.sin(a) * ry * from); g.lineTo(cx + Math.cos(a) * rx * to, cy + Math.sin(a) * ry * to); }
        g.strokeStyle = rgba([255, 196, 120], light * burn);
        g.lineWidth = Math.max(1, h / 420) * wide;
        g.stroke();
      }
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }

  function space() {
    if (!sky.far) startSky();
    const trip = TRIPS[name], { t, dt, level, kick, hatHit } = sound;
    steer(trip);
    moves(trip);
    const f = trip.falls ? falling(trip) : null, speed = (0.9 + 4.2 * level + 5 * kick + 15 * sky.surge) * trip.pace * sky.speedNow, focal = Math.max(w, h) * 0.62, reach = Math.hypot(w, h) * 0.6, size = Math.hypot(w, h) * 1.2;
    sky.x += sky.vx * speed * dt;
    sky.y += sky.vy * speed * dt;
    const camX = sky.x + Math.sin(t * 0.07) * 1.4 + Math.sin(t * 0.031), camY = sky.y + Math.cos(t * 0.053) * 0.9, roll = Math.sin(t * 0.041) * 0.2 + sky.bank + sky.spin;
    sky.gone += speed * dt;
    sky.whirl += dt * (0.5 + 2.5 * level);
    for (const o of sky.things) o.z -= speed * dt;
    sky.things = sky.things.filter((o) => o.z > o.near);
    while (sky.gone >= sky.nextAt) {
      spawn(trip.plan[sky.step++ % trip.plan.length]);
      sky.nextAt = sky.gone + rnd(8, 13);
    }
    sky.things.sort((a, b) => b.z - a.z);
    g.setTransform(1, 0, 0, 1, w / 2 - sky.vx * w * 0.11, h / 2 - sky.vy * h * 0.11 + sky.bob * h * 0.01);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.rotate(roll + t * 0.004);
    if (!f || f.air < 1) g.drawImage(sky.far, -size / 2, -size / 2, size, size);
    if (f && f.air > 0) worldSky(f, roll, reach); // inside a planet, its sky is the sky
    g.setTransform(1, 0, 0, 1, w / 2, h / 2 + sky.bob * h * 0.03);
    g.rotate(roll + t * 0.004);
    flightStars((speed * dt) / 26, focal, (trip.streak || 1) * sky.streakNow, roll + t * 0.004);
    if (trip.rings) warpRings(speed, focal);
    shootingStars(trip);
    if (f && f.out < 0 && f.air < 1) worldFar(f, roll);
    if (!trip.orbit) {
      if (sky.aurora >= 0) sky.aurora += dt / 34;
      if (sky.aurora >= 1) sky.aurora = -1;
    }
    const seen = trip.orbit ? 1 : sky.aurora >= 0 ? Math.min(1, Math.sin(sky.aurora * Math.PI) * 1.6) : 0;
    if (seen) { // the curtains go behind everything else, and the planet in front
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      curtains(seen);
      g.restore();
    }
    g.setTransform(1, 0, 0, 1, w / 2, h / 2);
    g.rotate(roll);
    if (sky.clear > 0) for (const o of sky.things) drawThing(o, focal, camX, camY, reach);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (seen) planet(seen);
    if (f) worldNear(f, roll, focal, reach, speed);
    if (folkInScene()) { invite(trip); drawFolk(); }
    const inside = trip.cockpit && T.pit;
    if (inside) { dreamBehind(); cockpit(camX); }
    if (hatHit) for (let i = 0; i < 2; i++) twinkle(rnd(0, w), rnd(0, inside ? h * 0.62 : h), h * (0.03 + 0.06 * hatHit));
  }

  function well() { // hanging over a black hole, with everything going round it and falling in
    if (!sky.far) startSky();
    const trip = TRIPS.well, { t, dt, bass, level, kick, hatHit } = sound, S = Math.min(w, h), size = S * (1.9 + 0.075 * kick * T.nod), cover = Math.hypot(w, h) * 1.2, behind = new Path2D(), before = new Path2D();
    steer(trip);
    const tone = colors[0];
    if (!sky.pit || Math.abs(sky.pit.tone[0] - tone[0]) + Math.abs(sky.pit.tone[1] - tone[1]) + Math.abs(sky.pit.tone[2] - tone[2]) > 60) sky.pit = { tone: [...tone], art: paintHole(tone), disc: paintDisc(tone) }; // painted again when the colour has really changed (the next record, another version), not for the slow drift: it used to keep the first record's colour for as long as the trip went on
    const pit = sky.pit, lean = -0.2 + Math.sin(t * 0.06) * 0.06 + sky.bob * 0.1;
    sky.whirl += dt * (0.5 + 3 * level + 3 * kick + 6 * sky.surge);
    g.setTransform(1, 0, 0, 1, w / 2, h / 2 + sky.bob * S * 0.015);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.rotate(t * 0.012);
    g.drawImage(sky.far, -cover / 2, -cover / 2, cover, cover);
    g.rotate(-t * 0.012 + lean);
    for (let i = 0; i < STARS; i++) {
      let out = (stars[i * 3 + 1] + 1) / 2 - (0.02 + 0.1 * level + 0.25 * sky.surge) * dt * (1.15 - ((stars[i * 3 + 1] + 1) / 2));
      if (out <= 0.02) { stars[i * 3] = Math.random() * 2 - 1; stars[i * 3 + 1] = 1; continue; }
      stars[i * 3 + 1] = out * 2 - 1;
      const was = stars[i * 3] * Math.PI, now = was + ((0.5 + 2.4 * level + 2 * kick) * dt) / (0.12 + out ** 1.4), r = size * (0.15 + 0.47 * out), path = Math.sin(now) < 0 ? behind : before;
      stars[i * 3] = ((now / Math.PI + 1) % 2) - 1;
      path.moveTo(Math.cos(was) * r, Math.sin(was) * r * 0.27);
      path.lineTo(Math.cos(now) * r, Math.sin(now) * r * 0.27);
    }
    const side = (from, dust) => {
      g.save();
      g.beginPath();
      g.rect(-size, from, size * 2, size);
      g.clip();
      g.scale(1, 0.27);
      g.rotate(sky.whirl);
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = clamp(0.75 + 0.3 * bass + 0.3 * kick);
      g.drawImage(pit.disc, -size / 2, -size / 2, size, size);
      g.restore();
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      g.lineWidth = Math.max(1, h / 520);
      g.strokeStyle = rgba(mix(colors[0], [255, 240, 215], 0.5), 0.5);
      g.stroke(dust);
    };
    side(-size, behind);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.drawImage(pit.art, -size / 2, -size / 2, size, size);
    side(0, before);
    if (T.folk && t > sky.oddAt) { sky.fallers.push({ art: Math.random() < 0.6 ? cowPicture() : paintSign(), born: t, life: rnd(8, 12), from: rnd(0, TAU) }); sky.oddAt = t + rnd(30, 70) / T.folk; } // now and then something falls in, stretching on the way
    sky.fallers = sky.fallers.filter((o) => (t - o.born) / o.life < 1);
    for (const o of sky.fallers) {
      const part = (t - o.born) / o.life, turned = o.from + part * part * 14, far = size * 0.55 * (1 - part) ** 1.4 + size * 0.08, wide = size * 0.1 * (1 - part * 0.75), tall = wide * (o.art.height / o.art.width);
      g.save();
      g.translate(Math.cos(turned) * far, Math.sin(turned) * far * 0.27);
      g.rotate(turned + Math.PI / 2);
      g.scale(1 - part * 0.5, 1 + part * 2.6);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = clamp(part / 0.05) * clamp((1 - part) / 0.12);
      g.drawImage(o.art, -wide / 2, -tall / 2, wide, tall);
      g.restore();
    }
    g.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, w / 2, h / 2);
    shootingStars(trip);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (folkInScene()) { invite(trip); drawFolk(); }
    if (hatHit) for (let i = 0; i < 3; i++) { const a = rnd(0, TAU), r = size * rnd(0.16, 0.5); twinkle(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.27, h * 0.06); }
  }

  /* ---------- Psychedelic: a kaleidoscope, a plasma, an endless zoom, and three fractals proper (Julia, Mandelbrot, Newton). Journeys: under the sea, a neon road, the northern lights.
     All of them take their colors from the mood (every color for psytrance, yellow for acid, red for hardcore, pale for trance) or else the record, and follow how the song is going. ---------- */
  function moodColors(n) { // the version's turn of the colors reaches these too, a little for acid and hardcore so they stay yellow and red
    const hue = V.hue || 0;
    if (mood === "psy") return Array.from({ length: n }, (_, i) => rainbowTone(sound.t * 0.08, (i / n) * TAU + (hue * Math.PI) / 180)); // spread evenly round the wheel, all turning together
    const set = mood === "acid" ? [[246, 230, 50], [150, 240, 60], [255, 140, 30]] : mood === "hard" ? [[255, 50, 40], [170, 20, 30], [255, 140, 60]] : mood === "euphoric" ? [mix(colors[0], [255, 255, 255], 0.35), [170, 210, 255], [255, 190, 235]] : colors, turn = set === colors ? 0 : hue * (mood === "euphoric" ? 0.5 : 0.12);
    return Array.from({ length: n }, (_, i) => turnHue(set[i % set.length], turn));
  }
  function skyStars(n, bottom, seed = 1) { // a fixed scatter of stars, twinkling a little
    const { t } = sound;
    for (let i = 0; i < n; i++) {
      const x = (((i + 1) * 0.6180339 * seed) % 1) * w, y = (((i + 1) * 0.3819661 * (seed + 1)) % 1) * bottom, twinkle = 0.35 + 0.65 * ((Math.sin(t * (1 + (i % 5) * 0.4) + i) + 1) / 2);
      g.fillStyle = `rgba(255,255,255,${(0.55 * twinkle).toFixed(3)})`;
      g.fillRect(x, y, 1.3, 1.3);
    }
  }
  let kal = null;
  function kaleido() { // the music drawn in one wedge, mirrored all the way round and turning; the drop changes how many times
    const { t, dt, kick, bass, wave } = sound, S = Math.max(64, Math.round(Math.min(w, h) * 0.55));
    if (!kal || kal.S !== S) kal = { S, art: paper(S, S), parts: 8, turn: 0 };
    if (flow.dropHit) kal.parts = [6, 8, 10, 12, 16][Math.floor(rnd(0, 5))];
    const [, x] = kal.art, tones = moodColors(3);
    x.globalCompositeOperation = "source-over";
    x.fillStyle = "rgba(0,0,0,0.32)";
    x.fillRect(0, 0, S, S);
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < V.blobs; i++) { const a = t * (0.2 + i * 0.07) + i * 1.7, r = S * (0.18 + 0.16 * Math.sin(t * 0.3 + i)); softBlob(x, S * 0.45 + Math.cos(a) * r, S * 0.5 + Math.sin(a) * r * 0.8, S * (0.07 + 0.07 * bass) * (5 / V.blobs) ** 0.4, tones[i % 3], 0.22 + 0.15 * kick); }
    if (V.line !== "none") { // the waveform across the wedge, or wound into a ring in it
      x.beginPath();
      for (let p = 0; p <= POINTS; p += 4) {
        const ring = V.line === "ring", a = (p / POINTS) * TAU, r = S * (0.16 + 0.07 * wave[p % POINTS]), px = ring ? S * 0.55 + Math.cos(a) * r : (p / POINTS) * S, py = ring ? S * 0.5 + Math.sin(a) * r : S * 0.5 + wave[p % POINTS] * S * 0.3;
        if (p) x.lineTo(px, py); else x.moveTo(px, py);
      }
      x.strokeStyle = rgba(mix(tones[1], [255, 255, 255], 0.2), 0.6);
      x.lineWidth = Math.max(1, S * 0.01);
      x.stroke();
    }
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(3,3,8,0.35)";
    g.fillRect(0, 0, w, h);
    kal.turn += dt * (0.12 + 0.3 * flow.intensity) * V.spin;
    const N = kal.parts, zoom = 1 + 0.12 * kick + 0.15 * flow.build, reach = Math.hypot(w, h) * 0.6;
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(zoom, zoom);
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < N; i++) {
      g.save();
      g.rotate(kal.turn + (i * TAU) / N);
      if (i % 2) g.scale(1, -1); // every other one the mirror image
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, reach, -Math.PI / N, Math.PI / N);
      g.closePath();
      g.clip();
      g.drawImage(kal.art[0], 0, -S / 2, reach, S);
      g.restore();
    }
    g.restore();
  }
  let plasmaArt = null;
  function plasma() { // old-school plasma: colors flowing into each other, warped by the bass and lit by the kick
    const { t, bass, kick } = sound, W = 112, H = Math.max(28, Math.round((112 * h) / w));
    if (!plasmaArt || plasmaArt.W !== W || plasmaArt.H !== H) { const [c, x] = paper(W, H); plasmaArt = { W, H, c, x, img: x.createImageData(W, H) }; }
    const tones = moodColors(3), d = plasmaArt.img.data, warp = (1 + 0.9 * bass) * V.scale, tt = t * 0.55, light = 0.6 + 0.5 * kick + 0.2 * flow.drop, sw = V.swirl, mid = 3 * warp, bands = V.stripes * Math.PI;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const u = (i / W) * 6 * warp, v = (j / H) * 6 * warp, round = sw > 0.01 ? sw * Math.sin(Math.atan2(v - mid, u - mid) * 3 + Math.hypot(u - mid, v - mid) * 0.8 - tt * 1.5) : 0; // the swirl winds it round the middle
      const k = (Math.sin(u + tt) + Math.sin((v + tt) * 0.7) + Math.sin((u + v + tt * 1.3) * 0.5) + Math.sin(Math.hypot(u - 3 - Math.sin(tt * 0.4) * 2, v - 3) + tt) + round + 4 + sw) / (8 + 2 * sw);
      const pos = (k * 3 + t * 0.04) % 3, a = Math.floor(pos), f = pos - a, c1 = tones[a % 3], c2 = tones[(a + 1) % 3], shade = light * (0.25 + 0.75 * Math.abs(Math.sin(k * bands)));
      const o = (j * W + i) * 4;
      d[o] = (c1[0] + (c2[0] - c1[0]) * f) * shade;
      d[o + 1] = (c1[1] + (c2[1] - c1[1]) * f) * shade;
      d[o + 2] = (c1[2] + (c2[2] - c1[2]) * f) * shade;
      d[o + 3] = 255;
    }
    plasmaArt.x.putImageData(plasmaArt.img, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = true;
    g.drawImage(plasmaArt.c, 0, 0, w, h);
  }
  let deeper = 0;
  function fractal() { // an endless fall into turning shapes, each with smaller ones on its corners; quicker through a build
    const { t, dt, kick, bass } = sound, tones = moodColors(3), sides = V.sides || (mood === "hard" ? 3 : mood === "acid" ? 4 : mood === "euphoric" ? 6 : 5), R = Math.hypot(w, h) * 0.62, spin = turned("fractal", 0.18);
    deeper = (deeper + dt * (0.25 + 0.45 * flow.intensity) * (1 + flow.build)) % 1;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(2,2,6,0.38)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    g.lineJoin = "round";
    const shape = (cx, cy, r, turn) => { g.beginPath(); for (let i = 0; i <= sides; i++) { const a = turn + (i / sides) * TAU; if (i) g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } };
    for (let k = 0; k < 16; k++) {
      const depth = (k + deeper) / 16, r = R * depth ** 2.3 * (1 + 0.06 * kick), turn = spin + depth * 4.2 + Math.sin(t * 0.3) * 0.5, tone = tones[k % 3], alpha = 0.2 + 0.55 * depth;
      shape(w / 2, h / 2, r, turn);
      g.strokeStyle = rgba(tone, alpha);
      g.lineWidth = Math.max(1, r * 0.01 * (1 + bass));
      g.stroke();
      if (r > R * 0.05) for (let i = 0; i < sides; i++) { // the same shape again on each corner, smaller
        const a = turn + (i / sides) * TAU;
        shape(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, r * V.child, -turn * 1.5);
        g.strokeStyle = rgba(mix(tone, [255, 255, 255], 0.3), alpha * 0.6);
        g.lineWidth = Math.max(1, r * 0.005);
        g.stroke();
      }
    }
    softBlob(g, w / 2, h / 2, R * 0.08 * (1 + kick), mix(tones[0], [255, 255, 255], 0.5), 0.6);
  }

  /* ---------- Fractals proper: a Julia set, Newton's method and the Mandelbrot set. Each is a sum worked out for every dot of the picture, so the graphics card does it
     where there is one (WebGL 2); where there isn't, a small coarse picture is worked out here and stretched to fit, as the plasma is. Both ways do the same sums. ---------- */
  const card = { c: null, gl: null, made: {}, off: false, lost: false, art: null };
  const CARD_CORNERS = `#version 300 es
    void main() { gl_Position = vec4(float(gl_VertexID & 1) * 4.0 - 1.0, float(gl_VertexID >> 1) * 4.0 - 1.0, 0.0, 1.0); }
`;
  const CARD_TOP = `#version 300 es
    precision highp float;
    uniform vec2 size; uniform vec3 toneA, toneB, toneC; uniform float light, time, glow;
    out vec4 color;
    vec2 mul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
    vec2 spot() { return (gl_FragCoord.xy * 2.0 - size) / size.y; }
    vec3 pal(float x) { x = fract(x) * 3.0; float f = smoothstep(0.0, 1.0, fract(x)); return x < 1.0 ? mix(toneA, toneB, f) : x < 2.0 ? mix(toneB, toneC, f) : mix(toneC, toneA, f); }
    vec4 lit(float x, float shade, float edge) { vec3 p = pal(x); return vec4((p * shade + mix(p, vec3(1.0), 0.6) * edge) * light, 1.0); }
    vec4 outside(float x, float nu, float far, float e) { float soft = smoothstep(1.0, 6.0, e * size.y * 0.5); return lit(x + time * 0.03, mix(0.7, 0.3 + 0.7 * abs(sin(nu * 3.14159265)), soft) * (1.0 - exp(-far * 0.15)), glow / (1.0 + e * e * 4900.0)); }
    vec4 inside(float near, float wild) { return lit(near * 0.9 + time * 0.03, 0.12 + 0.2 * abs(sin(near * 10.0 - time * 0.8)), glow * wild); }
    float wildness(vec2 dz, float big) { return smoothstep(4.0, 14.0, 0.5 * log(dot(dz, dz) + 1e-30) + big); }
`;
  function cardProgram(gl, key, body) { // one of the sums made into a program for the card, or null when the card won't take it
    const part = (kind, text) => { const s = gl.createShader(kind); gl.shaderSource(s, text); gl.compileShader(s); return s; };
    const program = gl.createProgram(), corners = part(gl.VERTEX_SHADER, CARD_CORNERS), sum = part(gl.FRAGMENT_SHADER, CARD_TOP + body);
    gl.attachShader(program, corners);
    gl.attachShader(program, sum);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return { program, at: {} };
    if (!gl.isContextLost()) console.warn("Effects: the graphics card wouldn't take " + key + ":", gl.getShaderInfoLog(sum) || gl.getProgramInfoLog(program));
    return null;
  }
  function onCard(key, body, values) { // draws one of them with the graphics card, a triangle over the whole picture; false when it can't, and then it's worked out by hand
    if (card.off) return false;
    if (!card.gl) {
      card.c = document.createElement("canvas");
      card.gl = card.c.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); // not a card made up in software: by hand is quicker than that
      if (!card.gl) { card.off = true; return false; }
      card.c.addEventListener("webglcontextlost", (e) => { e.preventDefault(); card.lost = true; });
      card.c.addEventListener("webglcontextrestored", () => { card.lost = false; card.made = {}; });
    }
    const gl = card.gl;
    if (card.lost || gl.isContextLost()) return false;
    if (card.made[key] === undefined) card.made[key] = cardProgram(gl, key, body);
    const made = card.made[key];
    if (!made) return false;
    const across = Math.max(2, Math.min(w, 1280)), down = Math.max(2, Math.round((across * h) / w)), tones = moodColors(3);
    if (card.c.width !== across || card.c.height !== down) { card.c.width = across; card.c.height = down; }
    gl.viewport(0, 0, across, down);
    gl.useProgram(made.program);
    const all = { size: [2, [across, down]], light: [1, [0.6 + 0.5 * sound.kick + 0.2 * flow.drop]], time: [1, [sound.t]], glow: [1, [V.glow ?? 1]], toneA: [3, tones[0].map((v) => v / 255)], toneB: [3, tones[1].map((v) => v / 255)], toneC: [3, tones[2].map((v) => v / 255)], ...values };
    for (const k in all) { const at = k in made.at ? made.at[k] : (made.at[k] = gl.getUniformLocation(made.program, k)); if (at) gl["uniform" + all[k][0] + "fv"](at, all[k][1]); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = true;
    g.drawImage(card.c, 0, 0, w, h);
    return true;
  }
  function byHand(sum, light = 0.6 + 0.5 * sound.kick + 0.2 * flow.drop) { // the same sum worked out here for a small picture: sum(across, up, dot) says how far round the colors a dot is, how bright, and how much of the edge's glow it has
    const W = 128, H = Math.max(32, Math.round((128 * h) / w));
    if (!card.art || card.art.W !== W || card.art.H !== H) { const [c, x] = paper(W, H); card.art = { W, H, c, x, img: x.createImageData(W, H) }; }
    const tones = moodColors(3), d = card.art.img.data, dot = { x: 0, shade: 0, edge: 0, half: H / 2, t: sound.t, glow: V.glow ?? 1 };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      sum(((i + 0.5) * 2 - W) / H, (H - (j + 0.5) * 2) / H, dot);
      const pos = (dot.x - Math.floor(dot.x)) * 3, a = Math.floor(pos) % 3, f = eased(pos - Math.floor(pos)), c1 = tones[a], c2 = tones[(a + 1) % 3], o = (j * W + i) * 4;
      for (let k = 0; k < 3; k++) { const p = c1[k] + (c2[k] - c1[k]) * f; d[o + k] = (p * dot.shade + (p + (255 - p) * 0.6) * dot.edge) * light; }
      d[o + 3] = 255;
    }
    card.art.x.putImageData(card.art.img, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = true;
    g.drawImage(card.art.c, 0, 0, w, h);
  }
  const dotOutside = (dot, x, nu, far, e) => { const soft = eased(clamp((e * dot.half - 1) / 5)); dot.x = x + dot.t * 0.03; dot.shade = (0.7 + (0.7 * Math.abs(Math.sin(nu * Math.PI)) - 0.4) * soft) * (1 - Math.exp(-far * 0.15)); dot.edge = dot.glow / (1 + e * e * 4900); }; // off the set: bands that count the steps it took to get away, and a glow where the set is near
  const dotInside = (dot, near, wild) => { dot.x = near * 0.9 + dot.t * 0.03; dot.shade = 0.12 + 0.2 * Math.abs(Math.sin(near * 10 - dot.t * 0.8)); dot.edge = dot.glow * eased(clamp((Math.log(wild + 1e-30) - 4) / 10)); }; // never got away: dim rings by how near the middle it ever came, and the edge's glow where its neighbours were flying apart (wild is how fast), which is the set's edge and not its body
  const JULIA_SUM = `
    uniform vec2 c, turn; uniform float span, power;
    void main() {
      vec2 z = mul(spot() * span, turn), dz = vec2(1.0, 0.0);
      float trap = 1e9, n = -1.0, m2 = 0.0, big = 0.0;
      for (int i = 0; i < 96; i++) {
        vec2 z2 = mul(z, z), p = power < 2.5 ? z : power < 3.5 ? z2 : mul(z2, z);
        dz = power * mul(p, dz);
        if (dot(dz, dz) > 1e20) { dz *= 1e-10; big += 23.02585; }
        z = mul(p, z) + c;
        m2 = dot(z, z);
        trap = min(trap, m2);
        if (m2 > 1e4) { n = float(i); break; }
      }
      if (n < 0.0) { color = inside(sqrt(trap), wildness(dz, big)); return; }
      float nu = n + 1.0 - log(log(m2) / 9.2103) / log(power);
      color = outside(nu * 0.045, nu, nu, exp(log(sqrt(m2) * 0.5 * log(m2)) - log(length(dz)) - big) / span);
    }
`;
  let juliaAt = Math.random() * TAU;
  function julia() { // the Julia set of a point going round the edge of the Mandelbrot set's heart: islands and spirals that grow together and come apart, puffed towards dust by the bass and the kick; a drop jumps somewhere else on the way round
    const { dt, kick, bass } = sound, n = V.power || 2;
    juliaAt += dt * (0.02 + 0.05 * flow.intensity) * (1 + flow.build) + (flow.dropHit ? rnd(1, 5) : 0);
    const r = 1.01 + 0.07 * bass + 0.09 * kick, m = (r / n) ** (1 / (n - 1)), a = juliaAt / (n - 1), zx = m * Math.cos(a), zy = m * Math.sin(a), kx = 1 - (r / n) * Math.cos(juliaAt), ky = -(r / n) * Math.sin(juliaAt), cx = zx * kx - zy * ky, cy = zx * ky + zy * kx; // the point whose resting place only just fails to hold: mu = r e^(i at), z0 = (mu / n)^(1 / (n - 1)), c = z0 (1 - mu / n)
    const spin = turned("julia", 0.05), cos = Math.cos(spin), sin = Math.sin(spin), span = (n > 3 ? 1.3 : n > 2 ? 1.4 : 1.7) * (1 - 0.05 * kick);
    if (onCard("julia", JULIA_SUM, { c: [2, [cx, cy]], turn: [2, [cos, sin]], span: [1, [span]], power: [1, [n]] })) return;
    byHand((u, v, dot) => {
      let x = (u * cos - v * sin) * span, y = (u * sin + v * cos) * span, dx = 1, dy = 0, trap = 1e9, count = -1, m2 = 0;
      for (let i = 0; i < 96; i++) {
        const x2 = x * x - y * y, y2 = 2 * x * y, px = n < 3 ? x : n < 4 ? x2 : x2 * x - y2 * y, py = n < 3 ? y : n < 4 ? y2 : x2 * y + y2 * x, ex = n * (px * dx - py * dy), nx = px * x - py * y + cx; // p is z to the power less one
        dy = n * (px * dy + py * dx); dx = ex;
        y = px * y + py * x + cy; x = nx;
        m2 = x * x + y * y;
        if (m2 < trap) trap = m2;
        if (m2 > 1e4) { count = i; break; }
      }
      if (count < 0) return dotInside(dot, Math.sqrt(trap), Math.hypot(dx, dy));
      const nu = count + 1 - Math.log(Math.log(m2) / 9.2103) / Math.log(n);
      dotOutside(dot, nu * 0.045, nu, nu, (Math.sqrt(m2) * 0.5 * Math.log(m2)) / Math.hypot(dx, dy) / span);
    });
  }
  const DIVES = [ // places on the edge of the Mandelbrot set where the same picture comes round again and again on the way in: across, up, how many steps the sum takes there before it starts going round, how long its round is, and how many rounds bring the picture back the same way up
    [-0.10109636384562216, 0.9562865108091415, 4, 1, 3], // three arms meeting
    [0.3663629834227643, 0.5915337732614452, 5, 1, 4], // four
    [0.4379242413594628, 0.3418920843381161, 6, 1, 5], // five
    [-0.5622026215230372, 0.6428171490727752, 6, 1, 5], // five, wound the other way
    [0.4245127190500396, 0.2075302281667453, 7, 1, 6], // six
    [-1.2228637871299002, 0.3168822638871363, 5, 1, 2], // a spiral
    [-1.2603629819786144, 0.35532647572323955, 6, 2, 3], // a spiral of pairs
  ];
  const MANDEL_SUM = `
    uniform vec2 orbit[16], view, shift; uniform float wrapAt, backTo, limit, ahead, tall;
    void main() {
      vec2 d = shift + mul(spot(), view), e = vec2(0.0), dz = vec2(0.0), z = vec2(0.0);
      float trap = 1e9, n = -1.0, m2 = 0.0, big = 0.0;
      int at = 0, last = int(wrapAt), back = int(backTo);
      for (int i = 0; i < 240; i++) {
        if (float(i) >= limit) break;
        vec2 Z = orbit[at];
        dz = 2.0 * mul(Z + e, dz) + vec2(big > 0.0 ? 0.0 : 1.0, 0.0);
        if (dot(dz, dz) > 1e20) { dz *= 1e-10; big += 23.02585; }
        e = mul(2.0 * Z + e, e) + d;
        at++;
        if (at == last) at = back;
        z = orbit[at] + e;
        m2 = dot(z, z);
        trap = min(trap, m2);
        if (m2 > 1e4) { n = float(i); break; }
      }
      vec4 on = inside(sqrt(trap), wildness(dz, big));
      if (n < 0.0) { color = on; return; }
      float nu = n + 1.0 - log2(log(m2) / 9.2103), away = exp(log(sqrt(m2) * 0.5 * log(m2)) - log(length(dz)) - big) / tall;
      color = mix(outside((nu + ahead) * 0.045, nu, max(-log2(max(away, 1e-12)), 0.0), away), on, clamp(nu - limit + 1.0, 0.0, 1.0));
    }
`;
  const dive = { place: -1, x: 0, orbit: new Float32Array(32), k: 0, p: 1, per: 1, step: 1, level: 1, around: 0, cx: 0, cy: 0 };
  function diveAt(i) { // the sum's own path at one of those places (the same for every dot, so a dot only works out how far it strays from it, which stays exact however near the picture goes), and from the size and the turn of its round, how much nearer brings the same picture back and how far round it has turned by then
    const [cx, cy, k, p, rounds] = DIVES[i];
    let x = 0, y = 0, lx = 1, ly = 0;
    for (let n = 0; n < k + p; n++) {
      dive.orbit[n * 2] = x; dive.orbit[n * 2 + 1] = y;
      if (n >= k) { const tx = 2 * (lx * x - ly * y); ly = 2 * (lx * y + ly * x); lx = tx; }
      const nx = x * x - y * y + cx; y = 2 * x * y + cy; x = nx;
    }
    const size = Math.log(Math.hypot(lx, ly)), turn = Math.atan2(ly, lx) * rounds;
    Object.assign(dive, { place: i, x: 0, k, p, per: p * rounds, step: size / p, level: size * rounds, around: Math.atan2(Math.sin(turn), Math.cos(turn)), cx, cy });
  }
  function mandel() { // an endless dive into the Mandelbrot set: the whole of it first, then in towards a place on its edge where arms meet, where the same picture comes round again for as long as you like. Quicker with the song and through a build; a drop goes back out to the whole set
    const { dt, kick } = sound, place = DIVES[V.place] ? V.place : 0;
    if (dive.place !== place) diveAt(place);
    if (flow.dropHit) dive.x = 0;
    dive.x += dt * ((0.25 + 0.45 * flow.intensity) * (1 + flow.build) + 0.9 * Math.max(0, 1 - dive.x / 8));
    const spin = turned("mandel", 0.04), pan = Math.exp(-dive.x) * Math.max(0, 1 - dive.x / 3) ** 2, sx = (-0.6 - dive.cx) * pan, sy = -dive.cy * pan, stop = dive.k + dive.p, orbit = dive.orbit, light = 0.6 + 0.2 * kick + 0.2 * flow.drop; // the edge fills far more of this picture than of the Julia set's, so the kick lights it less
    const seen = (nearest, more) => { // what the picture shows now: once it's nearer than `nearest` the picture a size up is drawn in its place, being the same one
      const whole = Math.log(1.5 / nearest), s = (dive.x - whole) / dive.level, part = s > 0 ? s - Math.floor(s) : s, tall = nearest * Math.exp(-part * dive.level) * (1 - 0.04 * kick), a = spin - (whole / dive.level + part) * dive.around;
      return { vx: tall * Math.cos(a), vy: tall * Math.sin(a), tall, limit: Math.min(236, Math.max(56, dive.k + Math.log(1 / tall) / dive.step + more)), ahead: s > 0 ? Math.floor(s) * dive.per : 0 }; // limit: the sum gives up `more` steps after the count at which dots this near begin to get away. ahead: the steps the pictures already gone by would have added, so the colors carry on round and don't start again with each
    };
    const fine = seen(1e-4, 45);
    if (onCard("mandel", MANDEL_SUM, { light: [1, [light]], orbit: [2, orbit], view: [2, [fine.vx, fine.vy]], shift: [2, [sx, sy]], wrapAt: [1, [stop]], backTo: [1, [dive.k]], limit: [1, [fine.limit]], ahead: [1, [fine.ahead]], tall: [1, [fine.tall]] })) return;
    const { vx, vy, tall, limit, ahead } = seen(1e-2, 30); // by hand it turns back sooner, which saves most of the steps and can't be told apart on a picture this coarse
    byHand((u, v, dot) => {
      const ax = sx + u * vx - v * vy, ay = sy + u * vy + v * vx;
      let ex = 0, ey = 0, gx = 0, gy = 0, at = 0, trap = 1e9, count = -1, m2 = 0;
      for (let i = 0; i < limit; i++) {
        const X = orbit[at * 2], Y = orbit[at * 2 + 1], zx = X + ex, zy = Y + ey, hx = 2 * (zx * gx - zy * gy) + 1, bx = 2 * X + ex, by = 2 * Y + ey, nx = bx * ex - by * ey + ax;
        gy = 2 * (zx * gy + zy * gx); gx = hx;
        ey = bx * ey + by * ex + ay; ex = nx;
        if (++at === stop) at = dive.k;
        const x = orbit[at * 2] + ex, y = orbit[at * 2 + 1] + ey;
        m2 = x * x + y * y;
        if (m2 < trap) trap = m2;
        if (m2 > 1e4) { count = i; break; }
      }
      if (count < 0) return dotInside(dot, Math.sqrt(trap), Math.hypot(gx, gy));
      const nu = count + 1 - Math.log2(Math.log(m2) / 9.2103), away = (Math.sqrt(m2) * 0.5 * Math.log(m2)) / Math.hypot(gx, gy) / tall; // away: about how far off the set is, in half pictures. The further, the darker, so the set glows out of the dark at every place and every depth alike
      dotOutside(dot, (nu + ahead) * 0.045, nu, Math.max(0, -Math.log2(away)), away);
    }, light);
  }
  const NEWTON_SUM = `
    uniform vec2 view, lean; uniform float roots, rate, ahead, calm;
    void main() {
      vec2 w = mul(spot(), view), z = vec2(w.x, -w.y) / max(dot(w, w), 1e-9), p = z;
      float was = 1e9, now = 1e9, n = -1.0;
      int count = int(roots);
      for (int i = 0; i < 64; i++) {
        p = z;
        for (int j = 2; j < 5; j++) { if (j >= count) break; p = mul(p, z); }
        vec2 f = mul(p, z) - vec2(1.0, 0.0);
        was = now; now = dot(f, f);
        if (now < 1e-4) { n = float(i); break; }
        z += mul(lean, vec2(p.x, -p.y) / max(dot(p, p), 1e-12) - z);
      }
      float nu = n < 0.0 ? 64.0 : n - 1.0 + log(was / 1e-4) / log(was / max(now, 1e-30));
      float soft = smoothstep(1.5, 5.0, length(spot()) * size.y * 0.5 * rate), rel = nu + log(max(length(w), 1e-9)) / rate - calm;
      float root = floor(mod(atan(z.y, z.x) / 6.2831853 * roots + 0.5, roots));
      color = lit(root / roots + (nu + ahead) * 0.03125 + time * 0.03, mix(0.25, mix(0.7, 0.3 + 0.7 * abs(sin(nu * 3.14159265)), 1.0 - smoothstep(2.0, 5.0, rel)), soft), glow * 0.8 * mix(1.0, smoothstep(1.5, 6.0, rel), soft));
    }
`;
  let newtonAt = 0;
  function newton() { // Newton's method hunting the roots of z^n = 1, seen from far outside looking in: a well of rings with a color for each root, and chains of beads where their lands meet. It never ends, because far out one step of the method only shrinks the picture and turns it, so each ring is the last one a size smaller
    const { dt, kick } = sound, n = V.roots || 3, twist = V.twist || 0, bx = 1 / n, by = twist / n, rate = -Math.log(Math.hypot(1 - bx, by)), turn = Math.atan2(by, 1 - bx), calm = 1.65 + 12 * twist * twist; // rate and turn: how much one step shrinks and turns the far picture. calm: the steps a dot out between the chains takes on top of that; dots that take more are near where the lands meet, and glow
    newtonAt += (dt * (0.25 + 0.45 * flow.intensity) * (1 + flow.build)) / rate;
    const part = newtonAt - Math.floor(newtonAt), ahead = Math.floor(newtonAt) % 32, tall = 0.05 * Math.exp(-part * rate) * (1 - 0.04 * kick), a = turned("newton", 0.05) - part * turn, vx = tall * Math.cos(a), vy = tall * Math.sin(a), light = 0.6 + 0.2 * kick + 0.2 * flow.drop; // the chains fill a good part of the picture, so the kick lights it less than it does the Julia set. part: how far through this ring's worth of falling. ahead: the rings gone by, so the colors carry on round (32 rings take them once round)
    if (onCard("newton", NEWTON_SUM, { light: [1, [light]], view: [2, [vx, vy]], lean: [2, [bx, by]], roots: [1, [n]], rate: [1, [rate]], ahead: [1, [ahead]], calm: [1, [calm]] })) return;
    byHand((u, v, dot) => {
      const wx = u * vx - v * vy, wy = u * vy + v * vx, r2 = Math.max(wx * wx + wy * wy, 1e-9);
      let x = wx / r2, y = -wy / r2, was = 1e9, now = 1e9, count = -1; // the sum starts from one over the dot, which puts far away in the middle
      for (let i = 0; i < 48; i++) {
        let px = x, py = y;
        for (let j = 2; j < n; j++) { const q = px * x - py * y; py = px * y + py * x; px = q; } // p is z to the power less one
        const fx = px * x - py * y - 1, fy = px * y + py * x;
        was = now; now = fx * fx + fy * fy;
        if (now < 1e-4) { count = i; break; }
        const p2 = Math.max(px * px + py * py, 1e-12), qx = px / p2 - x, qy = -py / p2 - y, nx = x + bx * qx - by * qy;
        y += bx * qy + by * qx; x = nx;
      }
      const nu = count < 0 ? 48 : count - 1 + Math.log(was / 1e-4) / Math.log(was / Math.max(now, 1e-30)), soft = eased(clamp((Math.hypot(u, v) * dot.half * rate - 1.5) / 3.5)), rel = nu + Math.log(r2) / (2 * rate) - calm, root = (Math.round((Math.atan2(y, x) * n) / TAU) + n) % n;
      dot.x = root / n + (nu + ahead) * 0.03125 + dot.t * 0.03;
      dot.shade = 0.25 + (0.45 + (0.7 * Math.abs(Math.sin(nu * Math.PI)) - 0.4) * (1 - eased(clamp((rel - 2) / 3)))) * soft; // rings that count the steps, going flat where they'd be finer than the picture can show and where the lands meet
      dot.edge = dot.glow * 0.8 * (1 + (eased(clamp((rel - 1.5) / 4.5)) - 1) * soft);
    }, light);
  }
  const bubbles = [];
  function ocean() { // swimming along under the sea: light coming down from the surface, the seabed going by, bubbles rising faster as the song lifts
    const { t, dt, kick, bass, hatHit } = sound, tones = moodColors(3), night = V.night, deep = mood === "hard" ? [18, 4, 8] : mix(night ? [1, 3, 10] : [2, 18, 38], tones[0], night ? 0.04 : 0.12), shallow = mood === "hard" ? [70, 16, 24] : mix(night ? [3, 14, 34] : [20, 96, 140], tones[0], night ? 0.08 : 0.25);
    const water = g.createLinearGradient(0, 0, 0, h);
    water.addColorStop(0, rgba(shallow, 1));
    water.addColorStop(1, rgba(deep, 1));
    g.globalCompositeOperation = "source-over";
    g.fillStyle = water;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    if (night) for (let i = 0; i < 90; i++) { // deep down at night nothing comes from above, and the sea lights itself: specks of plankton glowing and fading, brighter on the hi-hats
      const x = ((((i * 0.618034 + t * 0.006 * (1 + (i % 3))) % 1) + 1) % 1) * w, y = (((i * 0.381966 + Math.sin(t * 0.21 + i) * 0.015) % 1) * 0.92) * h, on = (0.5 + 0.5 * Math.sin(t * (0.9 + (i % 4) * 0.3) + i * 2.3)) ** 2 * (0.6 + 0.9 * sound.hat), r = Math.max(1.6, h / 300) * (1 + (i % 3)), glow = mix(tones[i % 3], [120, 255, 220], 0.6);
      if (i % 5 === 0) softBlob(g, x, y, r * 5, glow, 0.25 * on);
      g.fillStyle = rgba(glow, Math.min(1, on));
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    for (let i = 0; i < (night ? 0 : 7); i++) {
      const x0 = ((i / 7 + Math.sin(t * 0.07 + i) * 0.05) * 1.4 - 0.2) * w, spread = w * (0.06 + 0.03 * Math.sin(t * 0.5 + i)), ray = g.createLinearGradient(0, 0, 0, h * 0.9);
      ray.addColorStop(0, `rgba(180,230,255,${(0.12 + 0.1 * bass).toFixed(3)})`);
      ray.addColorStop(1, "rgba(180,230,255,0)");
      g.fillStyle = ray;
      g.beginPath();
      g.moveTo(x0 - spread * 0.3, 0);
      g.lineTo(x0 + spread * 0.3, 0);
      g.lineTo(x0 + spread * 2 + w * 0.1, h * 0.9);
      g.lineTo(x0 - spread * 2 + w * 0.1, h * 0.9);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
    for (const [layer, speed] of [[0, 0.4], [1, 0.7], [2, 1]]) { // the seabed, nearer hills going by faster
      g.fillStyle = rgba(mix(deep, [0, 0, 0], 0.15 + layer * 0.2), 1);
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w + 10; x += 10) { const u = (x + t * w * 0.05 * speed) / w; g.lineTo(x, h * (0.8 + layer * 0.06) - Math.sin(u * 5 + layer) * h * 0.04 - Math.sin(u * 13 + layer * 2) * h * 0.015); }
      g.lineTo(w, h);
      g.fill();
    }
    if (bubbles.length < 90) for (let n = (0.5 + 2 * flow.intensity) * dt * 30 + (flow.dropHit ? 45 : 0); n > Math.random(); n--) bubbles.push({ x: rnd(0, w), y: h + 10, r: rnd(0.003, 0.012) * Math.min(w, h), v: rnd(0.08, 0.2) * h, phase: rnd(0, TAU) });
    g.globalCompositeOperation = "lighter";
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.y -= b.v * dt * (1 + kick * 0.5);
      b.x += Math.sin(t * 2 + b.phase) * w * 0.0008;
      if (b.y < -20) { bubbles.splice(i, 1); continue; }
      g.strokeStyle = "rgba(200,240,255,.5)";
      g.lineWidth = Math.max(1, b.r * 0.18);
      g.beginPath();
      g.arc(b.x, b.y, b.r, 0, TAU);
      g.stroke();
    }
    if (hatHit) for (let i = 0; i < 3; i++) glint(rnd(0, w), rnd(0.2, 0.8) * h, Math.min(w, h) * 0.02, 0.7); // plankton catching the light
    softBlob(g, w * 0.5, 0, w * 0.45, tones[1], (0.06 + 0.1 * kick) * (night ? 0.35 : 1));
  }
  let roadAt = 0;
  function neonroad() { // driving into a striped sun along a glowing grid, quicker the more the song is going. Some versions have a moon or a ringed planet instead, a city on the skyline or nothing at all, and a road that bends
    const { t, dt, kick, bass } = sound, tones = moodColors(3), horizon = h * 0.56, sunTone = mood === "psy" ? rainbowTone(t * 0.05, 0) : mood === "hard" ? [255, 60, 40] : mood === "acid" ? [240, 230, 60] : [255, 120, 80], dusk = rgba(mix([120, 20, 110], tones[0], 0.25), 1), moon = V.sun === "moon";
    const sky = g.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#0a0418");
    sky.addColorStop(1, dusk);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = sky;
    g.fillRect(0, 0, w, horizon);
    skyStars(moon ? 140 : 70, horizon * 0.7, 3);
    const R = Math.min(w, h) * (0.22 + 0.02 * bass) * (moon ? 0.8 : 1), cx = w / 2, cy = horizon - R * (moon ? 0.9 : 0.35), sun = g.createLinearGradient(0, cy - R, 0, cy + R);
    const ring = (from, to) => { g.beginPath(); g.ellipse(cx, cy, R * 1.85, R * 0.38, -0.2, from, to); g.lineWidth = Math.max(2, R * 0.08); g.strokeStyle = rgba(mix(tones[2], [255, 255, 255], 0.25), 0.8); g.stroke(); g.lineWidth = Math.max(1, R * 0.02); g.strokeStyle = rgba(mix(tones[1], [255, 255, 255], 0.5), 0.95); g.stroke(); }; // a planet's ring, in two halves: one behind it and one in front
    sun.addColorStop(0, moon ? "rgb(236,238,255)" : rgba(mix(sunTone, [255, 240, 120], 0.5), 1));
    sun.addColorStop(1, moon ? "rgb(140,150,205)" : rgba(mix(sunTone, [255, 0, 120], 0.5), 1));
    g.save();
    g.beginPath();
    g.rect(0, 0, w, horizon);
    g.clip();
    g.globalCompositeOperation = "lighter";
    softBlob(g, cx, cy, R * 1.9, moon ? [160, 180, 255] : sunTone, (moon ? 0.12 : 0.22) + 0.2 * kick);
    g.globalCompositeOperation = "source-over";
    if (V.sun === "planet") ring(Math.PI, TAU);
    g.fillStyle = sun;
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.fill();
    g.beginPath();
    g.arc(cx, cy, R, 0, TAU);
    g.clip(); // the stripes, or the moon's seas, only on it
    if (moon) {
      g.fillStyle = "rgba(80,90,150,.33)";
      for (const [dx, dy, r] of [[-0.32, -0.18, 0.2], [0.26, 0.12, 0.13], [-0.04, 0.38, 0.11], [0.42, -0.36, 0.08], [-0.5, 0.3, 0.07]]) { g.beginPath(); g.arc(cx + dx * R, cy + dy * R, r * R, 0, TAU); g.fill(); }
    } else {
      g.fillStyle = dusk; // the stripes across it, the colour of the sky behind
      for (let i = 0; i < 6; i++) g.fillRect(cx - R, cy - R * 0.62 + i * R * 0.12, R * 2, R * (0.018 + i * 0.013)); // across the half above the hills: thin at the top, thicker towards them
    }
    g.restore();
    if (V.sun === "planet") { g.save(); g.beginPath(); g.rect(0, 0, w, horizon); g.clip(); ring(0, Math.PI); g.restore(); }
    if (V.hills === "city") { // a skyline of blocks, with lights in their windows
      const blocks = 30, bw = w / blocks, tops = [], lights = new Path2D();
      g.fillStyle = "#07020f";
      for (let k = 0; k < blocks; k++) {
        const r = Math.sin((k + 1) * 12.9898) * 43758.5453, f = r - Math.floor(r), top = horizon - h * (0.025 + 0.12 * f * f + (Math.abs(k - blocks / 2) < 3 ? 0.04 : 0));
        tops.push(top);
        g.fillRect(k * bw, top, bw + 0.5, horizon - top);
        for (let y = top + h * 0.012; y < horizon - h * 0.01; y += h * 0.016) for (let x = k * bw + bw * 0.18; x < (k + 1) * bw - bw * 0.2; x += bw * 0.28) { const q = Math.sin(x * 7.13 + y * 3.71) * 43758.5; if (q - Math.floor(q) > 0.66) lights.rect(x, y, Math.max(1, bw * 0.1), Math.max(1, h * 0.005)); }
      }
      g.beginPath();
      for (let k = 0; k < blocks; k++) { if (k) g.lineTo(k * bw, tops[k]); else g.moveTo(0, tops[0]); g.lineTo((k + 1) * bw, tops[k]); }
      g.globalCompositeOperation = "lighter";
      glowLine(tones[1], Math.max(1, h / 500), 0.5);
      g.fillStyle = rgba(mix(tones[2], [255, 220, 150], 0.55), 0.45 + 0.4 * sound.hat);
      g.fill(lights);
    } else if (V.hills === "hills") {
      const ridge = (x) => horizon - h * (0.05 + 0.05 * Math.abs(Math.sin((x / w) * 7.3)) + 0.025 * Math.sin((x / w) * 19));
      g.fillStyle = "#07020f";
      g.beginPath();
      g.moveTo(0, horizon);
      for (let x = 0; x <= w; x += w / 32) g.lineTo(x, ridge(x));
      g.lineTo(w, horizon);
      g.fill();
      g.beginPath();
      for (let x = 0; x <= w; x += w / 32) { if (x) g.lineTo(x, ridge(x)); else g.moveTo(x, ridge(x)); }
      g.globalCompositeOperation = "lighter";
      glowLine(tones[1], Math.max(1, h / 500), 0.6);
    } else { // nothing between us and the sky but the line of the horizon
      g.beginPath();
      g.moveTo(0, horizon);
      g.lineTo(w, horizon);
      g.globalCompositeOperation = "lighter";
      glowLine(tones[1], Math.max(1, h / 420), 0.8);
    }
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#06010c";
    g.fillRect(0, horizon, w, h - horizon);
    roadAt = (roadAt + dt * (0.7 + 0.9 * flow.intensity)) % 1;
    g.globalCompositeOperation = "lighter";
    const grid = mix(tones[2], [255, 60, 200], 0.4), lit = 0.4 + 0.6 * kick, bend = V.curve * w * 0.16 * Math.sin(turned("road", 0.12, 1)); // where the road goes off to, far ahead
    for (let k = 0; k < 16; k++) { const z = (k + roadAt) / 16, y = horizon + (h - horizon) * z ** 2.5; g.strokeStyle = rgba(grid, lit * z); g.lineWidth = Math.max(1, 3 * z); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = Math.max(1, h / 700);
    for (let i = -12; i <= 12; i++) { const far = w / 2 + i * w * 0.02 + bend, near = w / 2 + i * w * 0.25; g.strokeStyle = rgba(grid, lit * 0.7); g.beginPath(); g.moveTo(near, h); g.quadraticCurveTo((near + far) / 2 + bend * 0.1, (h + horizon) / 2, far, horizon); g.stroke(); }
  }
  function aurora() { // the northern lights over dark mountains, their curtains rising with the bass and lit by the bands
    const { t, kick, bass, bands } = sound, tones = mood ? moodColors(3) : [[60, 255, 160], [120, 140, 255], [255, 90, 200]];
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#020611");
    sky.addColorStop(1, "#071526");
    g.globalCompositeOperation = "source-over";
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    skyStars(120, h * 0.75, 5);
    g.globalCompositeOperation = "lighter";
    for (let band = 0, N = V.curtains; band < N; band++) {
      const tone = tones[band % 3], base = h * (0.34 + band * (0.24 / N) - (V.lake ? 0.05 : 0)), top = (u) => base + Math.sin(u * 4 + t * (0.3 + band * 0.1)) * h * 0.06 + Math.sin(u * 11 - t * 0.5 + band) * h * 0.02 - h * (0.12 + 0.12 * bass + 0.05 * Math.sin(u * 7 + t));
      const curtain = g.createLinearGradient(0, base - h * 0.3, 0, base + h * 0.2);
      curtain.addColorStop(0, rgba(tone, 0));
      curtain.addColorStop(0.5, rgba(tone, 0.26 + 0.2 * kick));
      curtain.addColorStop(1, rgba(tone, 0));
      g.fillStyle = curtain;
      g.beginPath();
      g.moveTo(0, base + h * 0.2);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, top(x / w));
      g.lineTo(w, base + h * 0.2);
      g.closePath();
      g.fill();
      g.lineWidth = Math.max(1, w / 600);
      for (let x = 0; x <= w; x += 7) { const u = x / w, y0 = top(u), level = bands[Math.floor(u * 48)] || 0, sway = Math.sin(x * 0.37 + t * 0.8 + band) * 3; g.strokeStyle = rgba(mix(tone, [255, 255, 255], 0.25), (0.02 + 0.14 * level) * (0.6 + 0.4 * Math.sin(x * 1.7 + band))); g.beginPath(); g.moveTo(x + sway, y0); g.lineTo(x, y0 + h * (0.06 + 0.16 * level)); g.stroke(); } // the rays in the curtain, brighter where its band is loud
    }
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#01030a";
    const shore = V.lake ? h * 0.74 : h, lift = V.lake ? 0.06 : 0; // with a lake, the mountains stand along its far shore and everything shows in the water
    g.beginPath();
    g.moveTo(0, shore);
    for (let k = 0; k <= 40; k++) g.lineTo((k / 40) * w, h * (0.78 - lift - 0.08 * Math.abs(Math.sin((k / 40) * 5.1)) - 0.04 * Math.sin((k / 40) * 17))); // counted, not added up: adding a fortieth of the width forty times falls just past the edge at some widths, and the last point went missing
    g.lineTo(w, shore);
    g.fill();
    if (!V.lake) return;
    g.save();
    g.globalAlpha = 0.5;
    g.setTransform(1, 0, 0, -1, 0, shore * 2);
    g.drawImage(canvas, 0, shore * 2 - h, w, h - shore, 0, shore * 2 - h, w, h - shore);
    g.restore();
    const water = g.createLinearGradient(0, shore, 0, h);
    water.addColorStop(0, "rgba(1,4,12,.25)");
    water.addColorStop(1, "rgba(1,3,10,.85)");
    g.fillStyle = water;
    g.fillRect(0, shore, w, h - shore);
    g.globalCompositeOperation = "lighter";
    g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const y = shore + (h - shore) * ((i + 0.5) / 14) ** 1.6, x = (Math.sin(t * 0.3 + i * 2.1) * 0.3 + 0.5) * w, long = w * (0.08 + 0.1 * ((i * 0.618) % 1)); g.strokeStyle = `rgba(200,225,255,${(0.05 + 0.08 * bass).toFixed(3)})`; g.beginPath(); g.moveTo(x - long, y); g.lineTo(x + long, y); g.stroke(); } // ripples catching the light
  }

  /* ---------- 3D: falling down an endless tube of light, big heads drawn in neon, a sphere of sound, shapes floating in space and a city of the spectrum.
     All of it lines and points from a little 3D of its own (x across, y up, z away from you), drawn by hand, so it needs no graphics card. ---------- */
  const turner = (yaw, pitch, roll) => { // the matrix that turns something about its up, then across, then about the way you're looking
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    return [cr * cy - sr * sp * sy, -sr * cp, cr * sy + sr * sp * cy, sr * cy + cr * sp * sy, cr * cp, sr * sy - cr * sp * cy, -cp * sy, sp, cp * cy];
  };

  const TUBE_RINGS = 40, TUBE_GAP = 0.5, tube = { s: 0, roll: 0, spin: 0, pulses: [] }, tubePts = new Float32Array(TUBE_RINGS * 25 * 3), spot = new Float32Array(3);
  const tubeFrame = () => ({ C: [0, 0, 0], F: [0, 0, 1], R: [1, 0, 0], U: [0, 1, 0] }), tubeHere = tubeFrame(), tubeAhead = tubeFrame(), tubeRing = tubeFrame();
  function tubeAt(s, o) { // the middle of the tube s along it, which way it goes there, and two ways across it. It winds about for ever and never comes back the same
    const A = V.bends, F = o.F, R = o.R, U = o.U;
    o.C[0] = A * (3.2 * Math.sin(s * 0.11) + 5.1 * Math.sin(s * 0.047 + 1.3));
    o.C[1] = A * (2.6 * Math.sin(s * 0.083 + 0.7) + 4.4 * Math.sin(s * 0.031 + 2.1));
    o.C[2] = s;
    let fx = A * (0.352 * Math.cos(s * 0.11) + 0.2397 * Math.cos(s * 0.047 + 1.3)), fy = A * (0.2158 * Math.cos(s * 0.083 + 0.7) + 0.1364 * Math.cos(s * 0.031 + 2.1)), fz = 1;
    const k = 1 / Math.hypot(fx, fy, fz);
    fx *= k;
    fy *= k;
    fz *= k;
    F[0] = fx;
    F[1] = fy;
    F[2] = fz;
    const q = 1 / Math.hypot(fz, fx);
    R[0] = fz * q;
    R[1] = 0;
    R[2] = -fx * q;
    U[0] = fy * R[2] - fz * R[1];
    U[1] = fz * R[0] - fx * R[2];
    U[2] = fx * R[1] - fy * R[0];
    return o;
  }
  function tubeFx() { // falling down a tube of light that never ends: it bends one way and another and we lean into the bends, its rings swell with the sound from the bass by us to the highs far down, and every kick sends a ring of light on ahead
    const { t, dt, kick, kickHit, hatHit, bass } = sound, tones = moodColors(3), M = V.sides, N = TUBE_RINGS, f = Math.min(w, h) * 0.95, cx = w / 2, cy = h / 2;
    tube.s += dt * (2.2 + 3.4 * flow.intensity + 2.6 * kick + 3 * flow.drop);
    tubeAt(tube.s, tubeHere);
    tubeAt(tube.s + 5, tubeAhead);
    const { C, F, R, U } = tubeHere, lean = -(tubeAhead.F[0] * R[0] + tubeAhead.F[1] * R[1] + tubeAhead.F[2] * R[2]) * 1.8;
    tube.spin += dt * V.twirl * 0.5;
    tube.roll += (lean - tube.roll) * Math.min(1, dt * 1.5);
    const roll = tube.roll + tube.spin, cr = Math.cos(roll), sr = Math.sin(roll);
    const view = (px, py, pz, into, o) => { // where a point is seen from: across, up and how far ahead, and so where it is on the screen
      const qx = px - C[0], qy = py - C[1], qz = pz - C[2], x = qx * R[0] + qy * R[1] + qz * R[2], y = qx * U[0] + qy * U[1] + qz * U[2], z = qx * F[0] + qy * F[1] + qz * F[2];
      into[o] = cx + ((x * cr + y * sr) / z) * f;
      into[o + 1] = cy - ((y * cr - x * sr) / z) * f;
      into[o + 2] = z;
    };
    const first = Math.ceil(tube.s / TUBE_GAP), ringAt = (s, swell, j, of, into, o) => { const a = (j / of) * TAU + (s - tube.s) * V.twist, ca = Math.cos(a) * swell, sa = Math.sin(a) * swell, r = tubeRing; view(r.C[0] + ca * r.R[0] + sa * r.U[0], r.C[1] + ca * r.R[1] + sa * r.U[1], r.C[2] + ca * r.R[2] + sa * r.U[2], into, o); };
    for (let k = 0; k < N; k++) {
      const s = (first + k) * TUBE_GAP, swell = 1 + V.swell * 0.3 * smooth(((s - tube.s) / (N * TUBE_GAP)) * BANDS * 0.85) + 0.05 * kick;
      tubeAt(s, tubeRing);
      for (let j = 0; j <= M; j++) ringAt(s, swell, j, M, tubePts, (k * (M + 1) + j) * 3);
    }
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(2,2,8,0.6)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    g.lineCap = g.lineJoin = "round";
    tubeAt(tube.s + N * TUBE_GAP * 0.8, tubeRing);
    view(tubeRing.C[0], tubeRing.C[1], tubeRing.C[2], spot, 0);
    if (spot[2] > 0) softBlob(g, spot[0], spot[1], Math.min(w, h) * 0.3, tones[1], 0.12 + 0.22 * bass); // the light far down it
    const groups = [0, 1, 2, 3].map(() => [new Path2D(), new Path2D(), new Path2D()]), seen = (o) => tubePts[o + 2] > 0.12, dots = V.look === "dots";
    for (let k = 0; k < N; k++) {
      const [rings, walls, lit] = groups[Math.min(3, Math.floor((k / N) * 4))], s = (first + k) * TUBE_GAP;
      for (let j = 0; j < M; j++) {
        const a = (k * (M + 1) + j) * 3, b = a + 3, c = a + (M + 1) * 3;
        if (dots) { if (seen(a)) { const r = Math.min(6, Math.max(1, (f * 0.012) / tubePts[a + 2])); rings.rect(tubePts[a] - r / 2, tubePts[a + 1] - r / 2, r, r); } continue; }
        if (V.look !== "lines" && seen(a) && seen(b)) { rings.moveTo(tubePts[a], tubePts[a + 1]); rings.lineTo(tubePts[b], tubePts[b + 1]); }
        if (V.look !== "rings" && k < N - 1 && seen(a) && seen(c)) { const path = V.stripes && Math.sin((j / M) * TAU * V.stripes + s * 0.9 - t * 4) > 0.8 ? lit : walls; path.moveTo(tubePts[a], tubePts[a + 1]); path.lineTo(tubePts[c], tubePts[c + 1]); } // lines along the walls, some lit and running past
      }
    }
    for (let q = 3; q >= 0; q--) { // the far end first, fading into the dark
      const fog = [1, 0.62, 0.34, 0.15][q], tone = mix(tones[0], tones[1], q / 3), wide = Math.max(1, (h / 400) * [2.6, 1.6, 1.1, 0.8][q]), [rings, walls, lit] = groups[q];
      if (dots) { g.fillStyle = rgba(mix(tone, [255, 255, 255], 0.2), (0.6 + 0.4 * kick) * fog); g.fill(rings); continue; }
      g.lineWidth = wide;
      g.strokeStyle = rgba(tone, (0.5 + 0.45 * kick) * fog);
      g.stroke(rings);
      g.strokeStyle = rgba(tone, 0.3 * fog);
      g.stroke(walls);
      g.lineWidth = wide * 1.8;
      g.strokeStyle = rgba(mix(tones[2], [255, 255, 255], 0.35), 0.85 * fog);
      g.stroke(lit);
    }
    if (kickHit) tube.pulses.push({ s: tube.s + 1.2, light: 0.6 + 0.4 * kickHit });
    if (flow.dropHit) for (let i = 0; i < 4; i++) tube.pulses.push({ s: tube.s + 1 + i * 1.5, light: 1 });
    tube.pulses = tube.pulses.filter((p) => (p.s += dt * 14) < tube.s + N * TUBE_GAP * 0.9 && (p.light *= Math.exp(-dt * 0.8)) > 0.04).slice(-10);
    for (const p of tube.pulses) { // a ring of light going on down the tube
      const path = new Path2D();
      let on = false;
      tubeAt(p.s, tubeRing);
      for (let j = 0; j <= 36; j++) {
        ringAt(p.s, 1.02, j, 36, spot, 0);
        if (spot[2] < 0.12) { on = false; continue; }
        if (on) path.lineTo(spot[0], spot[1]); else path.moveTo(spot[0], spot[1]);
        on = true;
      }
      neon(path, rgba(mix(tones[2], [255, 255, 255], 0.4), 1), Math.max(1.5, h / 300), p.light);
    }
    if (hatHit) for (let i = 0; i < 3; i++) { const o = (Math.floor(rnd(3, 14)) * (M + 1) + Math.floor(rnd(0, M))) * 3; if (seen(o)) twinkle(tubePts[o], tubePts[o + 1], h * 0.05); }
  }

  /* The heads: slices round a head from the neck up, with the shape of a face on the front, worked out once. Each frame they're turned, nodded and seen from in front, and the slices facing away are drawn faintly behind. */
  const HEAD = { slices: 34, around: 48, model: null, open: 0, turn: 0, ring: 0, floor: 0 }, headPts = new Float32Array(34 * 48 * 3), headFront = new Uint8Array(34 * 48);
  const curveAt = (table, y) => { // a smooth line through a table of [y, value]
    if (y <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) if (y <= table[i][0]) { const [y0, v0] = table[i - 1], [y1, v1] = table[i], u = (y - y0) / (y1 - y0); return v0 + (v1 - v0) * u * u * (3 - 2 * u); }
    return table[table.length - 1][1];
  };
  const bumpOf = (u) => Math.exp(-u * u);
  const HEAD_WIDE = [[-1.5, 0.42], [-1.05, 0.43], [-0.8, 0.5], [-0.55, 0.62], [-0.15, 0.7], [0.3, 0.76], [0.62, 0.72], [0.85, 0.6], [1.0, 0.42], [1.08, 0.24], [1.12, 0.02]];
  const HEAD_FRONT = [[-1.5, 0.36], [-1.1, 0.38], [-1.0, 0.6], [-0.88, 0.84], [-0.6, 0.86], [-0.3, 0.86], [0.0, 0.84], [0.22, 0.9], [0.55, 0.84], [0.85, 0.64], [1.0, 0.45], [1.08, 0.25], [1.12, 0.02]];
  const HEAD_BACK = [[-1.5, 0.4], [-1.1, 0.42], [-0.85, 0.52], [-0.5, 0.8], [0.0, 0.95], [0.35, 0.98], [0.7, 0.85], [0.95, 0.6], [1.06, 0.36], [1.12, 0.02]];
  function headPoint(y, th) { // a point on the head at a height, and an angle round it from the front: the skull, and the face on it
    const s = Math.sin(th), c = Math.cos(th), side = Math.abs(th);
    const nose = y < 0.16 && y > -0.38 ? 0.3 * bumpOf(th / 0.15) * (y > -0.28 ? (0.16 - y) / 0.44 : (y + 0.38) / 0.1) : 0;
    const face = nose - 0.085 * bumpOf((side - 0.38) / 0.15) * bumpOf((y - 0.07) / 0.08) + 0.03 * bumpOf(th / 0.75) * bumpOf((y - 0.21) / 0.05) + 0.035 * bumpOf((side - 0.75) / 0.25) * bumpOf((y + 0.12) / 0.12)
      + 0.045 * bumpOf(th / 0.32) * (bumpOf((y + 0.53) / 0.035) + 0.8 * bumpOf((y + 0.67) / 0.04)) + 0.03 * bumpOf(th / 0.35) * bumpOf((y + 0.88) / 0.06) + 0.12 * bumpOf((side - Math.PI / 2) / 0.1) * bumpOf(y / 0.17); // eyes set in, the brow, cheekbones, lips, the chin and the ears
    const deep = (c > 0 ? curveAt(HEAD_FRONT, y) : curveAt(HEAD_BACK, y)) + face, wide = curveAt(HEAD_WIDE, y) + face;
    return [wide * s, y, -deep * c];
  }
  const jawOf = (y, th) => { const c = Math.cos(th); return y < -0.6 && y > -1.2 && c > 0.1 ? clamp((c - 0.1) / 0.6) * clamp((-0.6 - y) / 0.05) * clamp((y + 1.2) / 0.3) : 0; }; // how much of the jaw's drop a point takes, when the mouth opens
  function makeHead() {
    const S = HEAD.slices, A = HEAD.around, at = new Float32Array(S * A * 3), out = new Float32Array(S * A * 2), jaw = new Float32Array(S * A), feature = (y, th) => ({ at: headPoint(y, th), out: [Math.sin(th), -Math.cos(th)], jaw: jawOf(y, th) });
    for (let i = 0; i < S; i++) for (let j = 0; j < A; j++) {
      const y = -1.5 + (i / (S - 1)) * 2.6, th = (j / A) * TAU - Math.PI, p = i * A + j;
      at.set(headPoint(y, th), p * 3);
      out[p * 2] = Math.sin(th);
      out[p * 2 + 1] = -Math.cos(th);
      jaw[p] = jawOf(y, th);
    }
    const lip = (y) => Array.from({ length: 11 }, (_, k) => feature(y, -0.45 + k * 0.09));
    return { at, out, jaw, eyes: [feature(0.07, -0.38), feature(0.07, 0.38)], lips: [lip(-0.555), lip(-0.645)] };
  }
  /* Glasses for the heads, in the head's own space: the outline of each lens, a bridge over the nose and an arm back over each ear, all sitting just in front of the face. */
  const WORN = ["shades", "", "round", "stars", "visor"], specs = {}; // "mixed": each head wears its own, and one goes without
  function glassesOf(kind) {
    if (specs[kind]) return specs[kind];
    const on = (x, y, z) => { const r = Math.hypot(x, z); return { at: [x, y, z], out: [x / r, z / r], jaw: 0 }; }; // a point faces the way out from the middle of the head, as the head's own points do
    const front = (x, y) => on(x, y, (kind === "visor" ? -1 : -0.97) + 0.8 * x * x); // the front bends round the face
    const loop = (n, reach) => Array.from({ length: n }, (_, k) => reach((k / n) * TAU, k));
    const edge = (a, wide, tall, square) => { const c = Math.cos(a), s = Math.sin(a); return [wide * Math.sign(c) * Math.abs(c) ** square, tall * Math.sign(s) * Math.abs(s) ** square]; }; // square 1 is round, and less is more of a box
    const shape = kind === "round" ? loop(20, (a) => edge(a, 0.165, 0.165, 1))
      : kind === "stars" ? loop(10, (a, k) => edge(a + Math.PI / 2, k % 2 ? 0.1 : 0.23, k % 2 ? 0.1 : 0.23, 1))
      : kind === "visor" ? loop(28, (a) => edge(a, 0.5, 0.115, 0.4)) // one band right across
      : loop(20, (a) => { const [u, v] = edge(a, 0.19, 0.135, 0.6); return [u * (1 + 0.75 * v), v]; }); // shades: square with round corners, and wider at the top
    const lenses = kind === "visor" ? [shape.map(([u, v]) => front(u, 0.075 + v))] : [-1, 1].map((side) => shape.map(([u, v]) => front(side * (0.25 + u), 0.06 + v)));
    const lines = [];
    for (const side of [-1, 1]) { // an arm from the outer edge of the front back over the ear, bowed out round the side of the head
      const hinge = lenses.flat().reduce((far, p) => (p.at[0] * side > far.at[0] * side ? p : far)), hy = hinge.at[1];
      lines.push([hinge, ...[[0.58, -0.63], [0.69, -0.45], [0.77, -0.22], [0.84, 0]].map(([x, z], i) => on(side * x, hy + ((0.11 - hy) * (i + 1)) / 4, z))]);
    }
    if (kind !== "visor") { const reach = kind === "round" ? 0.096 : kind === "stars" ? 0.031 : 0.088; lines.push([front(-reach, 0.125), front(0, 0.15), front(reach, 0.125)]); } // the bridge over the nose
    return (specs[kind] = { lenses, lines, dark: kind === "shades" || kind === "visor", middle: lenses.map((lens) => front(lens.reduce((sum, p) => sum + p.at[0], 0) / lens.length, 0.07)),
      tint: { shades: [0.04, 0.22], visor: [0.03, 0.08], round: [0.07, 0.12], stars: [0.14, 0.4] }[kind], // how much of the head's color is in the glass, and how much more on a kick
      sheen: kind === "shades" && [-1, 1].map((side) => [[front(side * 0.25 - 0.1, 0.14), front(side * 0.25 - 0.01, 0)], [front(side * 0.25 - 0.03, 0.14), front(side * 0.25 + 0.03, 0.05)]]), // two slanting lines, as glass is drawn
      bars: kind === "visor" && Array.from({ length: 17 }, (_, i) => [front(-0.4 + 0.05 * i, -0.015), front(-0.4 + 0.05 * i, 0.165)]) });
  }
  function wear(pair, see, strength, wide, tone) { // a pair as one head wears it: the glass over the eyes, what shows in it, then the frame in neon. A lens shows when its side of the face does, and an arm as far as it comes round the head
    const { kick } = sound, glass = new Path2D(), frame = new Path2D(), trace = (path, points, closed) => { points.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); if (closed) path.closePath(); };
    const shown = pair.lenses.map((lens, n) => see(pair.middle[n])[3] && lens.map(see));
    for (const lens of shown) if (lens) { trace(glass, lens, true); trace(frame, lens, true); }
    for (const line of pair.lines) { let last = null; for (const p of line) { const at = see(p); if (at[3] && last) { frame.moveTo(last[0], last[1]); frame.lineTo(at[0], at[1]); } last = at[3] ? at : null; } }
    if (pair.dark) { g.globalCompositeOperation = "source-over"; g.fillStyle = `rgba(3,2,10,${0.84 * Math.min(1, strength)})`; g.fill(glass); } // dark glass: the eyes behind it only just show
    g.globalCompositeOperation = "lighter";
    g.fillStyle = rgba(tone(0), (pair.tint[0] + pair.tint[1] * kick) * strength);
    g.fill(glass);
    if (pair.sheen) { // the shine on dark glass, brighter on the kick
      const shine = new Path2D();
      pair.sheen.forEach((lines, n) => { if (shown[n]) for (const line of lines) trace(shine, line.map(see)); });
      g.strokeStyle = rgba([255, 255, 255], (0.14 + 0.3 * kick) * strength);
      g.lineWidth = wide * 1.3;
      g.stroke(shine);
    }
    if (pair.bars && shown[0]) { // the sound along a visor: the lows in the middle and the highs out at the sides
      const bars = new Path2D();
      pair.bars.forEach(([low, high], i) => { const a = see(low), b = see(high), level = 0.08 + 0.92 * smooth(1 + Math.abs(i - 8) * 5.5); bars.moveTo(a[0], a[1]); bars.lineTo(a[0] + (b[0] - a[0]) * level, a[1] + (b[1] - a[1]) * level); });
      g.strokeStyle = rgba(mix(tone(0), [255, 255, 255], 0.3), 0.85 * strength);
      g.lineWidth = wide * 3.5;
      g.stroke(bars);
    }
    neon(frame, rgba(mix(tone(1), [255, 255, 255], 0.35), 1), wide * 1.6, strength * (0.8 + 0.2 * kick), 0.9);
  }
  function headStage(tones) { // what's behind the heads: the dark and a few stars, a striped sun, or a floor of light going by
    const { dt, kick } = sound;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(3,2,10,0.5)";
    g.fillRect(0, 0, w, h);
    if (V.stage === "void") { skyStars(90, h, 7); return; }
    if (V.stage === "sun") {
      const R = Math.min(w, h) * 0.34, sx = w / 2, sy = h * 0.42, paint = g.createLinearGradient(0, sy - R, 0, sy + R);
      paint.addColorStop(0, rgba(mix(tones[0], [255, 230, 120], 0.5), 1));
      paint.addColorStop(1, rgba(mix(tones[1], [255, 0, 120], 0.5), 1));
      g.globalCompositeOperation = "lighter";
      softBlob(g, sx, sy, R * 1.7, tones[0], 0.1 + 0.12 * kick);
      g.globalCompositeOperation = "source-over";
      g.save();
      g.beginPath();
      g.arc(sx, sy, R, 0, TAU);
      g.clip();
      g.globalAlpha = 0.5;
      g.fillStyle = paint;
      g.fillRect(sx - R, sy - R, R * 2, R * 2);
      g.globalAlpha = 1;
      g.fillStyle = "rgb(3,2,10)";
      for (let i = 0; i < 7; i++) g.fillRect(sx - R, sy + R * (0.04 + i * 0.13), R * 2, R * (0.02 + i * 0.013));
      g.restore();
      return;
    }
    const horizon = h * 0.64, grid = mix(tones[2], [255, 60, 200], 0.4);
    HEAD.floor = (HEAD.floor + dt * (0.5 + 0.8 * flow.intensity)) % 1;
    g.globalCompositeOperation = "lighter";
    g.lineWidth = Math.max(1, h / 700);
    for (let k = 0; k < 12; k++) { const z = (k + HEAD.floor) / 12, y = horizon + (h - horizon) * z ** 2.5; g.strokeStyle = rgba(grid, (0.2 + 0.4 * kick) * z); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = rgba(grid, 0.22 + 0.2 * kick);
    g.beginPath();
    for (let i = -10; i <= 10; i++) { g.moveTo(w / 2 + i * w * 0.03, horizon); g.lineTo(w / 2 + i * w * 0.3, h); }
    g.stroke();
    g.beginPath();
    g.moveTo(0, horizon);
    g.lineTo(w, horizon);
    glowLine(tones[1], Math.max(1, h / 450), 0.7);
  }
  function headsFx() { // big heads drawn in neon: slices of light from the neck up, lit from the bass at the bottom to the highs at the top. They nod to the kick and harder in a drop, look about, sing along, their eyes light up on the beat, and some versions wear glasses
    const { t, dt, kick, mid, hatHit } = sound, tones = moodColors(3), model = HEAD.model || (HEAD.model = makeHead()), f = h * 0.95, cx = w / 2, cy = h / 2, S = HEAD.slices, A = HEAD.around;
    HEAD.mid = HEAD.mid === undefined ? mid : HEAD.mid + (mid - HEAD.mid) * Math.min(1, dt / 1.2);
    HEAD.open += (clamp((mid - HEAD.mid) * 6 + 0.25 * kick) - HEAD.open) * Math.min(1, dt * 14); // the mouth goes with the rises and falls of the voice, not how loud it is all along
    HEAD.turn += V.move === "spin" ? dt * 0.45 : (Math.round(HEAD.turn / TAU) * TAU - HEAD.turn) * Math.min(1, dt * 1.3); // turning round and round; once that's over it comes back to face us, the short way
    HEAD.ring += dt * 0.22;
    headStage(tones);
    const heads = V.layout === "two" ? [{ x: -1.45, y: -0.2, z: 3.6, yaw: -1.2 }, { x: 1.45, y: -0.2, z: 3.6, yaw: 1.2 }]
      : V.layout === "three" ? [{ x: -2.3, y: -0.25, z: 4.8, yaw: -0.55 }, { x: 0, y: -0.25, z: 4.4, yaw: 0 }, { x: 2.3, y: -0.25, z: 4.8, yaw: 0.55 }]
      : V.layout === "ring" ? Array.from({ length: 5 }, (_, k) => { const a = HEAD.ring + (k * TAU) / 5; return { x: Math.sin(a) * 2.6, y: -0.3, z: 6.4 - Math.cos(a) * 2.6, yaw: -a }; }) // round and round, each looking out
      : [{ x: 0, y: -0.42, z: 3.5, yaw: 0.42 }]; // turned a little, so the face shows in the slices
    heads.forEach((one, n) => (one.n = n)); // each keeps its own number, so its colors, its sway and its glasses stay its own as they pass one another
    heads.sort((a, b) => b.z - a.z); // the far ones first
    g.lineCap = g.lineJoin = "round";
    const tips = [], over = vary.over.glasses, wearing = (kind, n) => (kind === "mixed" ? WORN[n % WORN.length] : kind) || "";
    heads.forEach((one) => {
      const k = one.n, sway = V.move === "sway" ? 0.55 * Math.sin(t * 0.23 + k * 1.7) + 0.18 * Math.sin(t * 0.57 + k) : 0, m = turner(one.yaw + sway + HEAD.turn, -(0.06 + sky.bob * 0.55 * T.nod) * (1 + flow.drop * 0.8) + 0.05 * Math.sin(t * 0.3 + k), 0.07 * Math.sin(t * 0.17 + k * 2));
      const look = (p, drop) => { // a point of the head as seen, and whether that side of the head faces us
        const x = p.at[0], y = p.at[1] - drop, z = p.at[2], X = m[0] * x + m[1] * y + m[2] * z + one.x, Y = m[3] * x + m[4] * y + m[5] * z + one.y, Z = m[6] * x + m[7] * y + m[8] * z + one.z;
        return [cx + (X / Z) * f, cy - (Y / Z) * f, Z, (m[0] * p.out[0] + m[2] * p.out[1]) * X + (m[3] * p.out[0] + m[5] * p.out[1]) * Y + (m[6] * p.out[0] + m[8] * p.out[1]) * Z < 0];
      };
      const { at, out, jaw } = model, open = HEAD.open * 0.11;
      for (let p = 0; p < S * A; p++) {
        const o = p * 3, x = at[o], y = at[o + 1] - jaw[p] * open, z = at[o + 2], X = m[0] * x + m[1] * y + m[2] * z + one.x, Y = m[3] * x + m[4] * y + m[5] * z + one.y, Z = m[6] * x + m[7] * y + m[8] * z + one.z, nx = out[p * 2], nz = out[p * 2 + 1];
        headFront[p] = (m[0] * nx + m[2] * nz) * X + (m[3] * nx + m[5] * nz) * Y + (m[6] * nx + m[8] * nz) * Z < 0 ? 1 : 0;
        headPts[o] = cx + (X / Z) * f;
        headPts[o + 1] = cy - (Y / Z) * f;
        headPts[o + 2] = Z;
      }
      const LEVELS = 4, lit = Array.from({ length: LEVELS * 2 }, () => new Path2D()), dim = new Path2D(), dots = V.look === "dots", line = (path, a, b) => { path.moveTo(headPts[a * 3], headPts[a * 3 + 1]); path.lineTo(headPts[b * 3], headPts[b * 3 + 1]); };
      for (let i = 0; i < S; i++) {
        const level = Math.min(LEVELS - 1, Math.floor(smooth((i / (S - 1)) * BANDS * 0.8 + 1) * LEVELS)), path = lit[level * 2 + (i > S * 0.55 ? 1 : 0)];
        for (let j = 0; j < A; j++) {
          const a = i * A + j, b = i * A + ((j + 1) % A);
          if (dots) { if (headFront[a]) { const r = Math.max(1.2, f * 0.007 / headPts[a * 3 + 2]); path.rect(headPts[a * 3] - r / 2, headPts[a * 3 + 1] - r / 2, r, r); } continue; }
          line(headFront[a] && headFront[b] ? path : dim, a, b);
          if (V.look === "mesh" && j % 4 === 0 && i < S - 1) line(headFront[a] && headFront[a + A] ? path : dim, a, a + A); // and lines down the head, so it's a mesh
        }
      }
      const wide = Math.max(1, (f * 0.006) / one.z), shade = heads.length > 3 ? clamp(1.25 - (one.z - 3.8) / 5.2) : 1, tone = (n) => tones[(n + k) % 3];
      const left = [], right = [];
      for (let i = 0; i < S; i++) { // the outline: the furthest point of each slice to either side, up one side and down the other
        let lo = i * A, hi = i * A;
        for (let j = 1; j < A; j++) { const p = i * A + j; if (headPts[p * 3] < headPts[lo * 3]) lo = p; if (headPts[p * 3] > headPts[hi * 3]) hi = p; }
        left.push([headPts[lo * 3], headPts[lo * 3 + 1]]);
        right.push([headPts[hi * 3], headPts[hi * 3 + 1]]);
      }
      g.globalCompositeOperation = "source-over";
      g.fillStyle = "rgba(3,2,10,0.92)"; // filled in dark, so the head is solid: what's behind it, and its own far side, stay hidden
      g.beginPath();
      [...left, ...right.reverse()].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.fill();
      g.globalCompositeOperation = "lighter";
      g.lineWidth = wide;
      g.strokeStyle = rgba(tone(2), 0.05 * shade);
      g.stroke(dim);
      lit.forEach((path, n) => { const level = n >> 1, light = (0.3 + 0.7 * ((level + 1) / LEVELS)) * shade; if (dots) { g.fillStyle = rgba(tone(n & 1), light); g.fill(path); return; } g.strokeStyle = rgba(tone(n & 1), light * 0.25); g.lineWidth = wide * 3; g.stroke(path); g.strokeStyle = rgba(mix(tone(n & 1), [255, 255, 255], 0.15), light); g.lineWidth = wide; g.stroke(path); });
      if (HEAD.open > 0.08) for (const [n, lip] of model.lips.entries()) { // the lips, apart as it sings
        const path = new Path2D();
        let on = false;
        for (const p of lip) { const [x, y, , front] = look(p, n ? p.jaw * open : 0); if (!front) { on = false; continue; } if (on) path.lineTo(x, y); else path.moveTo(x, y); on = true; }
        neon(path, rgba(mix(tone(1), [255, 255, 255], 0.3), 1), wide * 1.4, (0.4 + 0.6 * HEAD.open) * shade, 0.8);
      }
      for (const eye of model.eyes) { // the eyes, lit by the kick and blazing in a drop
        const [x, y, Z, front] = look(eye, 0);
        if (!front) continue;
        const r = (0.12 * f) / Z;
        softBlob(g, x, y, r * (1.3 + kick), mix(tone(0), [255, 255, 255], 0.5), (0.22 + 0.5 * kick + 0.4 * flow.drop) * shade);
        glint(x, y, r * (1 + 2.5 * flow.drop), (0.35 + 0.65 * kick) * shade);
        tips.push([x, y]);
      }
      const now = wearing(V.glasses, k), was = over === undefined ? now : wearing(vary.was.glasses, k), kind = now === was || over >= 0.5 ? now : was, on = now === was ? 1 : Math.abs(over * 2 - 1); // changing: the old pair lifts off, then the new one comes down onto the nose
      if (kind && on > 0.02) wear(glassesOf(kind), (p) => look(p, (eased(on) - 1) * 0.75), on * shade, wide, tone);
    });
    if (hatHit && tips.length) twinkle(...tips[Math.floor(rnd(0, tips.length))], h * 0.05);
  }

  /* The sound sphere: a ball of points, each pushed out by its part of the sound. */
  const SPHERE = { lat: 22, lon: 40, yaw: 0 }, spherePts = new Float32Array(22 * 40 * 6);
  function sphereFx() { // a ball of points that the sound pushes out: the bass round its middle and the highs at its poles. It wobbles, turns, and grows on every kick
    const { t, dt, kick, bass, hatHit } = sound, tones = moodColors(3), LAT = SPHERE.lat, LON = SPHERE.lon, f = Math.min(w, h) * 1.05, Z = 3.6, cx = w / 2, cy = h / 2, grow = 1 + 0.1 * kick + 0.08 * flow.drop;
    SPHERE.yaw += dt * (0.25 + 0.5 * flow.intensity) * V.spin;
    const m = turner(SPHERE.yaw, 0.4 + 0.25 * Math.sin(t * 0.1), 0.12 * Math.sin(t * 0.13)), P = spherePts;
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(3,3,10,0.5)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    softBlob(g, cx, cy, (f / Z) * 1.3, tones[0], 0.08 + 0.2 * bass);
    for (let i = 0; i < LAT; i++) {
      const phi = -Math.PI / 2 + ((i + 0.5) / LAT) * Math.PI, cp = Math.cos(phi), sp = Math.sin(phi);
      for (let j = 0; j < LON; j++) {
        const lam = (j / LON) * TAU, ux = cp * Math.cos(lam), uy = sp, uz = cp * Math.sin(lam), v = smooth(Math.abs(sp) * BANDS * 0.8 + (j % 5) * 0.7);
        const wob = V.wobble * 0.24 * Math.sin(3 * ux + t * 1.1) * Math.sin(3 * uy - t * 0.9) * Math.sin(3 * uz + t * 0.7), r = (1 + V.depth * 0.5 * v + wob) * grow, o = (i * LON + j) * 6;
        const X = m[0] * ux + m[1] * uy + m[2] * uz, Y = m[3] * ux + m[4] * uy + m[5] * uz, D = m[6] * ux + m[7] * uy + m[8] * uz; // turned, on the bare ball
        P[o] = cx + ((X * r) / (D * r + Z)) * f;
        P[o + 1] = cy - ((Y * r) / (D * r + Z)) * f;
        P[o + 2] = D * r + Z;
        P[o + 3] = v;
        P[o + 4] = cx + ((X * grow) / (D * grow + Z)) * f;
        P[o + 5] = cy - ((Y * grow) / (D * grow + Z)) * f;
      }
    }
    const paths = Array.from({ length: 6 }, () => new Path2D()), look = V.look, line = (path, a, b) => { path.moveTo(P[a], P[a + 1]); path.lineTo(P[b], P[b + 1]); };
    for (let i = 0; i < LAT; i++) for (let j = 0; j < LON; j++) {
      const o = (i * LON + j) * 6, path = paths[Math.min(2, Math.floor((i / LAT) * 3)) * 2 + (P[o + 2] < Z ? 0 : 1)];
      if (look === "dots") { const r = Math.max(1, ((f * 0.011) / P[o + 2]) * (1 + 2 * P[o + 3])); path.rect(P[o] - r / 2, P[o + 1] - r / 2, r, r); }
      else if (look === "spikes") { path.moveTo(P[o + 4], P[o + 5]); path.lineTo(P[o], P[o + 1]); }
      else {
        line(path, o, (i * LON + ((j + 1) % LON)) * 6); // round the ball
        if (look === "mesh" && i < LAT - 1) line(path, o, o + LON * 6); // and from pole to pole
      }
    }
    g.lineCap = "round";
    paths.forEach((path, n) => { const tone = tones[n >> 1], light = n & 1 ? 0.3 : 0.85 + 0.15 * kick; if (look === "dots") { g.fillStyle = rgba(mix(tone, [255, 255, 255], 0.2), light); g.fill(path); return; } g.lineWidth = Math.max(1, h / (look === "spikes" ? 420 : 560)); g.strokeStyle = rgba(tone, light); g.stroke(path); });
    if (hatHit) for (let k = 0; k < 3; k++) { const o = Math.floor(rnd(0, LAT * LON)) * 6; if (P[o + 2] < Z) twinkle(P[o], P[o + 1], h * 0.05); }
  }

  /* Shapes in space: the five regular solids, as wireframes. */
  const PHI = (1 + Math.sqrt(5)) / 2;
  function solidOf(corners) { // a solid from its corners: the edges join the corners nearest each other, and it's made the same size as the others
    const far = Math.max(...corners.map((c) => Math.hypot(...c))), at = corners.map((c) => c.map((v) => v / far)), apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let near = Infinity;
    for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) near = Math.min(near, apart(at[a], at[b]));
    const edges = [];
    for (let a = 0; a < at.length; a++) for (let b = a + 1; b < at.length; b++) if (apart(at[a], at[b]) < near * 1.01) edges.push([a, b]);
    return { at, edges };
  }
  let SOLIDS = null;
  const solids = () => SOLIDS || (SOLIDS = { cube: solidOf(FORMS.cube.at), octa: solidOf(FORMS.octa.at), tetra: solidOf(FORMS.tetra.at),
    icosa: solidOf([[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI], [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]]),
    dodeca: solidOf([[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1], [0, 1 / PHI, PHI], [0, 1 / PHI, -PHI], [0, -1 / PHI, PHI], [0, -1 / PHI, -PHI],
      [1 / PHI, PHI, 0], [1 / PHI, -PHI, 0], [-1 / PHI, PHI, 0], [-1 / PHI, -PHI, 0], [PHI, 0, 1 / PHI], [PHI, 0, -1 / PHI], [-PHI, 0, 1 / PHI], [-PHI, 0, -1 / PHI]]) });
  const field = [];
  const newSolid = (z, kinds) => ({ x: rnd(-7, 7), y: rnd(-4.2, 4.2), z, ax: rnd(0, TAU), ay: rnd(0, TAU), sx: rnd(-1.2, 1.2), sy: rnd(-1.2, 1.2), size: rnd(0.35, 0.85), kind: kinds[Math.floor(rnd(0, kinds.length))], tone: Math.floor(rnd(0, 3)), band: Math.floor(rnd(0, BANDS * 0.85)) });
  function solidsFx() { // shapes floating through space towards us, turning, each as big as its part of the sound; or one great nest of them, one inside another; or a few going round like the parts of an atom
    const { t, dt, kick, hatHit } = sound, tones = moodColors(3), all = solids(), kinds = all[V.forms] ? [V.forms] : Object.keys(all), f = Math.min(w, h), cx = w / 2, cy = h / 2, near = [];
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(3,3,10,0.45)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    g.lineJoin = g.lineCap = "round";
    const paths = Array.from({ length: 9 }, () => new Path2D()), put = (form, size, ax, ay, X, Y, Z, path) => { // one shape into a path, turned and seen from here
      const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay), seen = form.at.map(([x, y, z]) => { const y1 = y * ca - z * sa, z1 = y * sa + z * ca, x2 = x * cb + z1 * sb, z2 = -x * sb + z1 * cb, D = Z + z2 * size; return D > 0.2 ? [cx + ((X + x2 * size) / D) * f, cy - ((Y + y1 * size) / D) * f] : null; });
      for (const [a, b] of form.edges) if (seen[a] && seen[b]) { path.moveTo(...seen[a]); path.lineTo(...seen[b]); }
    };
    if (V.mode === "nested") ["dodeca", "icosa", "cube", "octa", "tetra"].forEach((kind, k) => { // each inside the last, turning its own way, the outside with the highs and the middle with the bass
      const v = smooth((1 - k / 4) * BANDS * 0.75 + 1), size = (1.75 - k * 0.32) * (1 + 0.18 * v + 0.1 * kick), turn = turned(`nest${k}`, (0.25 + k * 0.12) * (k % 2 ? -1 : 1));
      put(all[kind], size, turn * 0.7 + k, turn + k * 0.5, 0, 0, 4.6, paths[(k % 3) * 3 + (k < 2 ? 1 : 0)]);
    });
    else if (V.mode === "orbit") {
      const spin = turned("orbitSpin", 0.7);
      for (let ring = 0, along = 0; ring < 3; ring++) for (let k = 0; k < 4; k++) { // three tilted rings of four, going round at their own speeds
        if (!k) along = turned(`orbit${ring}`, 0.35 + ring * 0.12) + ring;
        const a = along + (k * TAU) / 4, tilt = 0.5 + ring * 0.9, r = 1.7 + ring * 0.55, x = Math.cos(a) * r, y = Math.sin(a) * r * Math.sin(tilt), z = Math.sin(a) * r * Math.cos(tilt), b = ring * 1.1, X = x * Math.cos(b) + z * Math.sin(b), Zr = -x * Math.sin(b) + z * Math.cos(b), n = ring * 4 + k, v = sound.bands[Math.floor((n / 12) * BANDS * 0.85)];
        put(all[kinds[n % kinds.length]], 0.32 * (1 + 0.6 * v + 0.2 * kick), spin + n, spin * 0.8 + n * 0.7, X, y, 5.5 + Zr, paths[ring * 3 + (Zr < 0 ? 0 : 1)]);
        if (Zr < 0) near.push([cx + (X / (5.5 + Zr)) * f, cy - (y / (5.5 + Zr)) * f]);
      }
    } else {
      while (field.length < 44) field.push(newSolid(rnd(3, 40), kinds));
      const speed = 3 + 6 * flow.intensity + 5 * kick + 6 * flow.drop;
      for (const o of field) {
        o.z -= dt * speed;
        if (o.z < 0.6) Object.assign(o, newSolid(rnd(36, 42), kinds));
        o.ax += dt * o.sx * V.spin * (1 + kick);
        o.ay += dt * o.sy * V.spin * (1 + kick);
        if (o.z > 41) continue;
        put(all[o.kind] || all.cube, o.size * (1 + 0.5 * sound.bands[o.band] + 0.15 * kick), o.ax, o.ay, o.x, o.y, o.z, paths[o.tone * 3 + (o.z < 8 ? 0 : o.z < 20 ? 1 : 2)]);
        if (o.z < 10) near.push([cx + (o.x / o.z) * f, cy - (o.y / o.z) * f]);
      }
    }
    if (V.mode !== "field") softBlob(g, cx, cy, f * 0.12, mix(tones[0], [255, 255, 255], 0.4), 0.2 + 0.4 * kick);
    paths.forEach((path, n) => { const tone = tones[Math.floor(n / 3)], depth = n % 3, light = [0.9, 0.55, 0.22][depth] * (0.75 + 0.25 * kick), wide = Math.max(1, (h / 520) * [2, 1.3, 0.8][depth]); g.strokeStyle = rgba(tone, light * 0.22); g.lineWidth = wide * 3.2; g.stroke(path); g.strokeStyle = rgba(mix(tone, [255, 255, 255], 0.2), light); g.lineWidth = wide; g.stroke(path); });
    if (hatHit && near.length) twinkle(...near[Math.floor(rnd(0, near.length))], h * 0.05);
  }

  /* The neon city: flying down an avenue between towers of light. */
  const CITY = { z: 0 }, CITY_ROWS = 13, CITY_GAP = 2.4;
  function cityFx() { // flying low down an avenue of towers made of light, each as tall as its part of the sound: the bass along the road and the highs further out, and a moon at the end of it
    const { t, dt, kick, hatHit, bass } = sound, tones = moodColors(3), f = Math.min(w, h) * 0.95, cx = w / 2, cy = h * 0.46, glass = V.look === "glass", tops = [];
    CITY.z += dt * (3 + 5 * flow.intensity + 4 * kick + 5 * flow.drop);
    const camX = Math.sin(t * 0.11) * Math.min(1.3, 0.9 * V.weave), camY = 1.9 + 0.45 * Math.sin(t * 0.17) + 0.8 * flow.build, roll = -Math.cos(t * 0.11) * 0.1 * V.weave, cr = Math.cos(roll), sr = Math.sin(roll);
    const see = (x, y, z) => { const X = x - camX, Y = y - camY; return [cx + ((X * cr + Y * sr) / z) * f, cy - ((Y * cr - X * sr) / z) * f]; };
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#04020c");
    sky.addColorStop(0.46, rgba(mix([60, 10, 70], tones[0], 0.3), 1));
    sky.addColorStop(0.5, "#05020c");
    sky.addColorStop(1, "#030108");
    g.globalCompositeOperation = "source-over";
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    skyStars(80, cy * 0.8, 9);
    const [mx, my] = see(0, 9, 70), moon = h * 0.07;
    g.globalCompositeOperation = "lighter";
    softBlob(g, mx, my, h * 0.36, tones[1], 0.18 + 0.18 * bass);
    softBlob(g, mx, my, moon * 1.6, mix(tones[1], [255, 255, 255], 0.5), 0.5);
    g.fillStyle = rgba(mix(tones[1], [255, 255, 255], 0.7), 0.9);
    g.beginPath();
    g.arc(mx, my, moon, 0, TAU);
    g.fill();
    const far = CITY_ROWS * CITY_GAP, first = Math.floor(CITY.z / CITY_GAP), frac = CITY.z - first * CITY_GAP, ground = new Path2D(), [lx, ly] = see(-90, 0, 90), [rx, ry] = see(90, 0, 90);
    ground.moveTo(lx, ly);
    ground.lineTo(rx, ry);
    ground.lineTo(w + 60, h + 60);
    ground.lineTo(-60, h + 60);
    ground.closePath();
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#04020a";
    g.fill(ground);
    g.globalCompositeOperation = "lighter";
    const grid = new Path2D(), road = new Path2D();
    for (let k = 0; k <= CITY_ROWS; k++) { const z = (k + 1) * CITY_GAP - frac; if (z < 0.5) continue; grid.moveTo(...see(-8, 0, z)); grid.lineTo(...see(8, 0, z)); } // across the road, going by
    for (const x of [-7.4, -5.1, -3.2, 3.2, 5.1, 7.4]) { grid.moveTo(...see(x, 0, 0.6)); grid.lineTo(...see(x, 0, far)); }
    for (const x of [-1.5, 1.5]) { road.moveTo(...see(x, 0, 0.6)); road.lineTo(...see(x, 0, far)); }
    for (let k = 0; k <= CITY_ROWS * 2; k++) { const z = ((k + 1) * CITY_GAP) / 2 - (CITY.z * 2 % CITY_GAP) / 2; if (z < 0.6) continue; road.moveTo(...see(0, 0, z)); road.lineTo(...see(0, 0, z + 0.5)); } // the lights down the middle of the road
    g.lineWidth = Math.max(1, h / 700);
    g.strokeStyle = rgba(tones[2], 0.25 + 0.25 * kick);
    g.stroke(grid);
    g.lineWidth = Math.max(1, h / 360);
    g.strokeStyle = rgba(mix(tones[2], [255, 255, 255], 0.3), 0.6 + 0.3 * kick);
    g.stroke(road);
    const tower = (xa, xb, H, za, zb, tone, light, fog) => { // its sides we can see, then its roof, then its front, each dark inside and outlined in light
      const faces = [];
      if (camX < xa) faces.push([[xa, 0, za], [xa, 0, zb], [xa, H, zb], [xa, H, za]]);
      if (camX > xb) faces.push([[xb, 0, za], [xb, 0, zb], [xb, H, zb], [xb, H, za]]);
      if (camY > H) faces.push([[xa, H, za], [xb, H, za], [xb, H, zb], [xa, H, zb]]);
      faces.push([[xa, 0, za], [xb, 0, za], [xb, H, za], [xa, H, za]]);
      const wide = Math.max(1, (f / za) * 0.007), edge = rgba(tone, (0.3 + 0.7 * light) * fog), glow = rgba(tone, (0.08 + 0.2 * light) * fog);
      for (const face of faces) {
        const path = new Path2D();
        face.forEach(([x, y, z], i) => { const [sx, sy] = see(x, y, z); if (i) path.lineTo(sx, sy); else path.moveTo(sx, sy); });
        path.closePath();
        g.globalCompositeOperation = "source-over";
        g.fillStyle = glass ? rgba(mix(tone, [0, 0, 0], 0.78), 0.5) : "#05030b";
        g.fill(path);
        g.globalCompositeOperation = "lighter";
        g.strokeStyle = glow;
        g.lineWidth = wide * 4;
        g.stroke(path);
        g.strokeStyle = edge;
        g.lineWidth = wide;
        g.stroke(path);
      }
      if (za < 18) { // little windows on the front, some lit, twinkling with the hi-hats
        const lights = new Path2D(), floors = Math.floor((H - 0.15) / 0.3), across = Math.max(1, Math.floor((xb - xa - 0.1) / 0.24));
        for (let fl = 0; fl < floors; fl++) for (let c = 0; c < across; c++) {
          const q = Math.sin((xa + c) * 91.7 + fl * 17.3 + Math.floor(za / CITY_GAP + first) * 5.1) * 43758.5;
          if (q - Math.floor(q) < 0.6) continue;
          const [x0, y0] = see(xa + 0.1 + c * 0.24, 0.15 + fl * 0.3, za), [x1, y1] = see(xa + 0.22 + c * 0.24, 0.27 + fl * 0.3, za);
          lights.rect(x0, y1, x1 - x0, y0 - y1);
        }
        g.fillStyle = rgba(mix(tone, [255, 225, 170], 0.55), (0.45 + 0.4 * sound.hat) * fog);
        g.fill(lights);
      }
      if (za < 12) tops.push(see((xa + xb) / 2, H, za));
    };
    const COLS = [[2.1, 0.9], [3.7, 1.1], [5.6, 1.4]]; // where each row of towers stands out from the road, and how wide
    for (let k = CITY_ROWS - 1; k >= 0; k--) { // the far rows first, so the near ones stand in front
      const za = (k + 1) * CITY_GAP - frac, id = first + k + 1, fog = clamp((far - za) / 10);
      if (za < 0.7) continue;
      for (const side of [-1, 1]) for (let c = 2; c >= 0; c--) {
        const hash = Math.sin(id * 12.9898 + c * 78.233 + side * 37.719) * 43758.5453, rr = hash - Math.floor(hash), band = Math.min(BANDS - 1, Math.floor(c * 18 + rr * 14)), H = (0.3 + c * 0.5 + (1 + c) * rr + (2.4 + c * 0.6) * sound.bands[band] * V.heights);
        const [out, wide] = COLS[c], xa = side > 0 ? out : -out - wide;
        tower(xa, xa + wide, H, za, za + 1.1, tones[c], sound.bands[band], fog);
      }
    }
    if (hatHit && tops.length) twinkle(...tops[Math.floor(rnd(0, tops.length))], h * 0.05);
  }

  /* ---------- Recipes: effects anyone can write, as data. A recipe is a few layers, each drawing some number of shapes, and where each one goes, how big it is, which way it turns
     and what color it is are little formulas over the time, the sound and which one it is. They're read by this file's own small reader, which knows numbers, the names and
     functions below, + - * / % ^, < and >, and brackets, and nothing else: a recipe can't run anything. ---------- */
  const RECIPE_VARS = new Set(["t", "i", "n", "u", "bass", "mid", "treble", "kick", "hat", "level", "intensity", "build", "drop", "calm", "lead", "tune", "beat", "bpm", "aspect"]);
  const hashOf = (k) => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const RECIPE_FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs, sqrt: (x) => Math.sqrt(Math.max(0, x)), floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, exp: (x) => Math.exp(Math.min(50, x)), log: (x) => Math.log(Math.max(1e-9, x)),
    min: Math.min, max: Math.max, pow: (a, b) => Math.pow(a, b), atan2: Math.atan2, fract: (x) => x - Math.floor(x), mix: (a, b, k) => a + (b - a) * k, clamp: (x, a = 0, b = 1) => Math.max(a, Math.min(b, x)),
    step: (edge, x) => (x >= edge ? 1 : 0), smoothstep: (a, b, x) => { const k = clamp((x - a) / (b - a || 1)); return k * k * (3 - 2 * k); }, rand: (x) => hashOf(x),
    noise: (x) => { const k = Math.floor(x), f = x - k; return hashOf(k) + (hashOf(k + 1) - hashOf(k)) * f * f * (3 - 2 * f); }, // smooth, between 0 and 1
    band: (x) => smooth(clamp(x) * (BANDS - 2)), wave: (x) => sound.wave[Math.min(POINTS - 1, Math.max(0, Math.floor(clamp(x) * (POINTS - 1))))] || 0, // the sound at a place along the spectrum, or along the waveform
  };
  function formula(text) { // a formula read into a function of the names it's given. Anything it doesn't know is a mistake, said in words
    if (typeof text === "number") { if (!Number.isFinite(text)) throw new Error("isn't a number"); return () => text; }
    if (typeof text !== "string") throw new Error("should be a number or a formula, like 0.5 + 0.2 * bass");
    if (text.length > 400) throw new Error("is longer than 400 characters");
    const list = (text.match(/\s+|\d*\.?\d+(?:e[+-]?\d+)?|[a-z_][a-z0-9_]*|[-+*/%^(),<>]|./gi) || []).filter((x) => !/^\s+$/.test(x));
    let at = 0, nodes = 0;
    const peek = () => list[at], take = () => list[at++], fail = (what) => { throw new Error(what); };
    const atom = () => {
      const tok = take();
      if (++nodes > 300) fail("is too long to work out");
      if (tok === undefined) fail("ends too soon");
      if (/^\d*\.?\d/.test(tok)) { const v = Number(tok); if (!Number.isFinite(v)) fail(`has a number it can't read: ${tok}`); return () => v; }
      if (tok === "(") { const inner = expr(); if (take() !== ")") fail("has a ( that isn't closed"); return inner; }
      if (/^[a-z_]/i.test(tok)) {
        const key = tok.toLowerCase();
        if (peek() === "(") {
          take();
          const fn = Object.hasOwn(RECIPE_FUNCS, key) ? RECIPE_FUNCS[key] : null, args = [];
          if (!fn) fail(`doesn't know the function ${tok}`);
          if (peek() !== ")") do args.push(expr()); while (peek() === "," && take());
          if (take() !== ")") fail(`has ${tok}( that isn't closed`);
          const [a, b, c] = args;
          return args.length === 1 ? (v) => fn(a(v)) : args.length === 2 ? (v) => fn(a(v), b(v)) : args.length === 3 ? (v) => fn(a(v), b(v), c(v)) : (v) => fn(...args.map((x) => x(v)));
        }
        if (key === "pi") return () => Math.PI;
        if (key === "tau") return () => TAU;
        if (!RECIPE_VARS.has(key)) fail(`doesn't know the name ${tok}`);
        return (v) => v[key];
      }
      return fail(`doesn't know what "${tok}" is`);
    };
    const power = () => { const base = atom(); if (peek() !== "^") return base; take(); const up = unary(); return (v) => Math.pow(base(v), up(v)); };
    const unary = () => { if (peek() === "-") { take(); const x = unary(); return (v) => -x(v); } if (peek() === "+") { take(); return unary(); } return power(); };
    const product = () => { let left = unary(); while (["*", "/", "%"].includes(peek())) { const op = take(), a = left, b = unary(); left = op === "*" ? (v) => a(v) * b(v) : op === "/" ? (v) => { const d = b(v); return d ? a(v) / d : 0; } : (v) => { const d = b(v); return d ? a(v) % d : 0; }; } return left; };
    const total = () => { let left = product(); while (peek() === "+" || peek() === "-") { const op = take(), a = left, b = product(); left = op === "+" ? (v) => a(v) + b(v) : (v) => a(v) - b(v); } return left; };
    const expr = () => { const left = total(); if (peek() !== "<" && peek() !== ">") return left; const op = take(), right = total(); return op === "<" ? (v) => (left(v) < right(v) ? 1 : 0) : (v) => (left(v) > right(v) ? 1 : 0); };
    const out = expr();
    if (at < list.length) fail(`has something left over at "${list[at]}"`);
    return out;
  }
  const RECIPE_SHAPES = ["circle", "ring", "polygon", "star", "line", "dot", "glint", "wave"];
  const RECIPE_PARTS = { count: 1, x: 0.5, y: 0.5, size: 0.05, spin: 0, sides: 5, hue: 0, light: 0.8, white: 0, width: 1.5, x2: 0.5, y2: 0.5, amount: 0.3 }; // what each layer can have, and what it is when it's left out
  function readRecipe(raw) { // a recipe checked over: {recipe} ready to draw, or {problems} in words
    const problems = [], odd = (k) => k < 32 || (k >= 127 && k < 160) || (k >= 0x200b && k <= 0x200f) || (k >= 0x2028 && k <= 0x202e) || (k >= 0x2066 && k <= 0x2069) || k === 0xfeff; // control characters, and the invisible ones that can make text read differently
    const text = (v, most) => (typeof v === "string" ? [...v].map((c) => (odd(c.codePointAt(0)) ? " " : c)).join("").replace(/\s+/g, " ").trim().slice(0, most) : "");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { problems: ["A recipe is a set of {…} with its layers in it."] };
    const read = (where, key, value, otherwise) => { if (value === undefined || value === "") return () => otherwise; try { return formula(value); } catch (ex) { problems.push(`${where}: ${key} ${ex.message}.`); return () => otherwise; } };
    const fade = typeof raw.fade === "number" && Number.isFinite(raw.fade) ? Math.min(0.98, Math.max(0, raw.fade)) : 0.3;
    if (!Array.isArray(raw.layers) || !raw.layers.length) problems.push("It needs layers: a list of one or more, each with a shape.");
    const layers = (Array.isArray(raw.layers) ? raw.layers.slice(0, 8) : []).map((layer, k) => {
      const where = `Layer ${k + 1}`, L = layer && typeof layer === "object" ? layer : {};
      if (!RECIPE_SHAPES.includes(L.shape)) problems.push(`${where}: the shape should be one of ${RECIPE_SHAPES.join(", ")}.`);
      return Object.fromEntries([["shape", RECIPE_SHAPES.includes(L.shape) ? L.shape : "circle"], ...Object.entries(RECIPE_PARTS).map(([key, otherwise]) => [key, read(where, key, L[key], otherwise)])]);
    });
    if (Array.isArray(raw.layers) && raw.layers.length > 8) problems.push("Only the first 8 layers are used.");
    const recipe = { name: text(raw.name, 40) || "Untitled", by: text(raw.by, 40), fade, zoom: read("The picture", "zoom", raw.zoom, 0), turn: read("The picture", "turn", raw.turn, 0), echo: raw.zoom !== undefined || raw.turn !== undefined, layers };
    return problems.length ? { problems, recipe } : { recipe };
  }
  const EXAMPLES = { // a few to start from, and to show how they're made
    "recipe-rings": { name: "Breathing rings", fade: 0.25, layers: [{ shape: "ring", count: 14, size: "0.04 + u * 0.46 + 0.05 * kick * u", width: "1 + 3 * band(u)", hue: "u + t * 0.03", light: "0.15 + 0.7 * band(u)" }] },
    "recipe-galaxy": { name: "Golden spiral", fade: 0.6, zoom: "0.004 + 0.01 * bass", turn: "0.002", layers: [{ shape: "dot", count: 320, x: "0.5 + cos(i * 2.39996 + t * 0.2) * sqrt(u) * 0.45 / aspect", y: "0.5 + sin(i * 2.39996 + t * 0.2) * sqrt(u) * 0.45 * (1 + 0.15 * bass)", size: "0.004 + 0.012 * band(u)", hue: "u * 0.6 + t * 0.02", light: "0.5 + 0.5 * kick" }] },
    "recipe-figures": { name: "Lissajous", fade: 0.5, layers: [ // three points tracing figures, each with a tail of where it was a moment ago: i % 90 is how far back, floor(i / 90) which of the three
      { shape: "dot", count: 270, x: "0.5 + 0.38 * sin((t - (i % 90) * 0.025) * (0.7 + floor(i / 90) * 0.23) + floor(i / 90) * 2) / aspect", y: "0.5 + 0.38 * sin((t - (i % 90) * 0.025) * (1.1 + floor(i / 90) * 0.17) + 0.8 * bass)", size: "(0.012 - (i % 90) * 0.0001) * (1 + kick)", hue: "floor(i / 90) / 3 + t * 0.02", light: "(1 - (i % 90) / 90) ^ 1.5" },
      { shape: "glint", count: 3, x: "0.5 + 0.38 * sin(t * (0.7 + i * 0.23) + i * 2) / aspect", y: "0.5 + 0.38 * sin(t * (1.1 + i * 0.17) + 0.8 * bass)", size: "0.035 + 0.05 * kick", hue: "i / 3", light: 1 }] },
    "recipe-tunnel": { name: "Polygon tunnel", fade: 0.35, layers: [{ shape: "polygon", count: 18, sides: "3 + floor(rand(floor(t / 8)) * 5)", size: "0.02 + fract(u + t * 0.18) ^ 2 * 0.9", spin: "t * 0.3 + u * 2 * (1 + kick)", width: "1 + 2 * fract(u + t * 0.18)", hue: "u + t * 0.05", light: "fract(u + t * 0.18) * (0.5 + 0.5 * band(1 - fract(u + t * 0.18)))" }] },
    "recipe-burst": { name: "Starburst", fade: 0.45, zoom: "0.01 + 0.03 * kick", layers: [{ shape: "line", count: 72, x: 0.5, y: 0.5, x2: "0.5 + cos(u * tau + t * 0.1) * (0.08 + 0.42 * band(abs(u * 2 - 1))) / aspect", y2: "0.5 + sin(u * tau + t * 0.1) * (0.08 + 0.42 * band(abs(u * 2 - 1)))", width: "1 + 2 * kick", hue: "abs(u * 2 - 1) * 0.8 + t * 0.03", light: "0.3 + 0.7 * band(abs(u * 2 - 1))" },
      { shape: "circle", count: 1, size: "0.03 + 0.05 * kick", hue: 0, white: 0.6, light: "0.4 + 0.6 * kick" }] },
    "recipe-waves": { name: "Stacked waves", fade: 0.5, layers: [{ shape: "wave", count: 7, y: "0.2 + u * 0.6", size: "0.55 / aspect + 0.02 * i", amount: "0.08 + 0.25 * band(u)", spin: "sin(t * 0.2 + i) * 0.15", width: "1 + 2 * kick", hue: "u * 0.7 + t * 0.04", light: "0.4 + 0.5 * band(u)" }] },
    "recipe-daydream": { name: "Daydream", fade: 0.86, zoom: "0.003 + 0.006 * lead", turn: "0.0006", layers: [ // made round the melody: soft lights drifting up, rays from above that follow its notes, and glints while a big lead plays. What's drawn stays a while, so every light is small
      { shape: "circle", count: 22, x: "0.5 + (rand(i) - 0.5) * 1.1 + 0.03 * sin(t * 0.2 + i)", y: "1.1 - fract(rand(i + 40) + t * (0.01 + 0.02 * rand(i + 80))) * 1.2", size: "(0.01 + 0.035 * rand(i + 7)) * (0.7 + 0.5 * tune)", hue: "rand(i + 3) * 0.4 + t * 0.01", white: "0.1 + 0.25 * lead", light: "(0.008 + 0.022 * tune) * (0.6 + 0.4 * sin(t * 0.5 + i))" },
      { shape: "line", count: 13, x: "0.5 + 0.1 * sin(t * 0.07)", y: -0.1, x2: "0.5 + (u - 0.5) * 1.5 + 0.06 * sin(t * 0.13 + i * 1.7)", y2: 1.1, width: "2 + 10 * band(0.42 + u * 0.36)", hue: "u * 0.4 + t * 0.01", white: "0.1 + 0.2 * lead", light: "0.003 + 0.05 * max(lead, 0.6 * tune) * band(0.42 + u * 0.36)" },
      { shape: "glint", count: 40, x: "rand(i + floor(t * 0.3 + rand(i)) * 13)", y: "rand(i * 3 + floor(t * 0.3 + rand(i)) * 7)", size: "0.01 + 0.02 * hat", light: "0.5 * lead * sin(fract(t * 0.3 + rand(i)) * pi) ^ 2" }] },
  };
  const recipeBook = new Map(), recipeRaw = new Map(), recipeEnv = Object.fromEntries([...RECIPE_VARS].map((k) => [k, 0]));
  STYLES.recipes = [];
  function keepRecipe(key, raw) { // a recipe under the name of a style, in the Recipes list: says what's wrong, or nothing
    const { recipe, problems } = readRecipe(raw);
    if (!recipe) return problems;
    recipeBook.set(key, recipe);
    recipeRaw.set(key, raw);
    FAMILY[key] = "recipes";
    const listed = STYLES.recipes.find(([k]) => k === key);
    if (listed) listed[1] = recipe.name; else STYLES.recipes.push([key, recipe.name]);
    return problems || null;
  }
  for (const [key, raw] of Object.entries(EXAMPLES)) keepRecipe(key, raw);
  const num = (x, otherwise) => (Number.isFinite(x) ? x : otherwise);
  function recipeFx() { // a recipe, drawn: the last frame fades (or comes back larger and turned), and every layer draws its shapes over it
    const r = recipeBook.get(name), { t, dt } = sound, env = recipeEnv, pace = dt * 60, size = Math.min(w, h);
    if (!r) return backdrop();
    Object.assign(env, { t, bass: sound.bass, mid: sound.mid, treble: sound.treble, kick: sound.kick, hat: sound.hat, level: sound.level, intensity: flow.intensity, build: flow.build, drop: flow.drop, calm: flow.calm, lead: flow.lead, tune: flow.tune, bpm: flow.bpm || 120, aspect: w / h, beat: clamp(((flow.clock - flow.kickAt) * (flow.bpm || 120)) / 60), i: 0, n: 1, u: 0 });
    if (r.echo) echo(1 + num(r.zoom(env), 0) * pace, num(r.turn(env), 0) * pace, r.fade ** pace, 0, 0, undefined, 0.4);
    else {
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.fillStyle = `rgba(5,6,10,${(1 - r.fade ** pace).toFixed(3)})`;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
    }
    g.lineCap = g.lineJoin = "round";
    for (const L of r.layers) {
      env.i = 0;
      env.u = 0;
      env.n = 1;
      const n = Math.max(0, Math.min(400, Math.round(num(L.count(env), 1))));
      env.n = n;
      for (let k = 0; k < n; k++) {
        env.i = k;
        env.u = n > 1 ? k / (n - 1) : 0;
        const light = clamp(num(L.light(env), 0.8));
        if (light < 0.004) continue;
        const x = num(L.x(env), 0.5) * w, y = num(L.y(env), 0.5) * h, s = Math.max(0, num(L.size(env), 0.05)) * size, hue = num(L.hue(env), 0), tone = mix(mood === "psy" ? rainbowTone(0, hue * TAU) : around(hue), [255, 255, 255], clamp(num(L.white(env), 0))), paint = rgba(tone, 1);
        g.globalAlpha = light;
        g.fillStyle = g.strokeStyle = paint;
        g.lineWidth = Math.max(0.5, num(L.width(env), 1.5));
        const spin = num(L.spin(env), 0);
        if (L.shape === "circle" || L.shape === "ring") { g.beginPath(); g.arc(x, y, s, 0, TAU); if (L.shape === "circle") g.fill(); else g.stroke(); }
        else if (L.shape === "dot") { const d = Math.max(1, s); g.fillRect(x - d / 2, y - d / 2, d, d); }
        else if (L.shape === "glint") glint(x, y, Math.max(2, s * 2), light);
        else if (L.shape === "line") { g.beginPath(); g.moveTo(x, y); g.lineTo(num(L.x2(env), 0.5) * w, num(L.y2(env), 0.5) * h); g.stroke(); }
        else if (L.shape === "polygon" || L.shape === "star") {
          const sides = Math.max(3, Math.min(12, Math.round(num(L.sides(env), 5)))), corners = L.shape === "star" ? sides * 2 : sides;
          g.beginPath();
          for (let c = 0; c <= corners; c++) { const a = spin + (c / corners) * TAU, r2 = L.shape === "star" && c % 2 ? s * 0.45 : s; if (c) g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); else g.moveTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); }
          g.stroke();
        } else if (L.shape === "wave") { // the waveform, across from one side of the size to the other, as tall as the amount
          const tall = num(L.amount(env), 0.3) * size, c = Math.cos(spin), si = Math.sin(spin);
          g.beginPath();
          for (let p = 0; p < POINTS; p += 3) { const along = (p / (POINTS - 1) - 0.5) * 2 * s, up = sound.wave[p] * tall * Math.sin((p / (POINTS - 1)) * Math.PI); if (p) g.lineTo(x + along * c - up * si, y + along * si + up * c); else g.moveTo(x + along * c - up * si, y + along * si + up * c); }
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
    if (r.echo) remember();
  }

  /* Versions: every effect keeps changing a little by itself, so it never looks quite the same twice. Each has a few dials (how many, what shape, which way round, folded how, and the colors),
     picked at random when it starts, all picked again when a drop lands, and one or two now and then in the groove, on a kick. A dial of numbers glides to its new place, a fold or a shape
     goes over in the picture itself, and any other changes behind a quick fade. Sometimes the change in the groove is a slow one instead: over eight bars or more the effect becomes another version of itself,
     everything that can glide moving together and the rest a step at a time, a count through the sizes in between.
     The first choice on each dial is how it was designed, and "Changes by itself" in Adjust sets how often it changes: at 0 it stays as designed. */
  const FOLD = ["", "", "mirror", "flip", "quad", "kal6", "kal8"], SHAPES = ["circle", "circle", "triangle", "square", "star", "flower", "hexagon"], HUES = [0, 0, 0, 25, -25, 50, -50, 110, 180];
  const VERSIONS = {
    ribbon: { fold: FOLD, bundles: [3, 2, 4, 5], waves: [1, 0.6, 1.5, 2.2] },
    silk: { fold: FOLD, sheets: [5, 3, 7], waves: [1, 0.7, 1.6] },
    helix: { fold: FOLD, strands: [2, 3, 4], twists: [2.4, 1.3, 3.6, 5] },
    strings: { fold: FOLD, count: [24, 14, 34], loops: [1, 2, 0.5] },
    bars: { layout: ["floor", "middle", "split", "circle"], count: [56, 32, 80, 120] },
    mirror: { count: [44, 24, 64], floor: [0.66, 0.52, 0.78] },
    leds: { cols: [30, 18, 44], lamp: ["square", "round", "thin"] },
    terrain: { mesh: [false, true], height: [1, 0.6, 1.6], glow: [1, 0, 1.4] },
    scope: { fold: ["", "", "mirror", "kal6"], trace: ["line", "xy", "ring", "xy"] },
    trails: { fold: FOLD, form: SHAPES, spin: [1, -1, 2] },
    tunnel: { form: SHAPES, spin: [1, -1, 1.8] },
    vortex: { fold: FOLD, arms: [3, 2, 5, 7], spin: [1, -1, 1.6] },
    prism: { form: SHAPES, spin: [1, -1] },
    ripple: { fold: ["", "", "mirror", "quad", "kal6"], lines: [1, 2, 3] },
    comets: { fold: FOLD, heads: [9, 5, 7], loop: [1, 1.5, 0.6, 2.2] },
    stars: { fold: ["", "", "kal6", "kal8", "quad"], roll: [0, 0.4, -0.4, 1], drift: [0, 1] },
    whirl: { fold: ["", "", "kal6", "mirror"], flat: [0.66, 0.35, 1], spin: [1, -1] },
    dust: { fold: ["", "", "mirror", "kal8"], way: ["up", "down", "wind", "out"], size: [1, 0.6, 1.8] },
    links: { fold: ["", "", "mirror", "quad", "kal6"], count: [84, 50, 66], reach: [1, 0.7, 1.35] },
    fireworks: { fold: ["", "", "mirror", "kal6"], burst: ["round", "ring", "willow", "palm"] },
    halo: { count: [72, 36, 110], reach: [1, 0.7, 1.4], spin: [0, 0.25, -0.25] },
    sun: { petals: [5, 3, 8, 12] },
    rings: { count: [13, 8, 18], arcs: [2, 1, 3, 4] },
    mandala: { folds: [8, 5, 6, 12] },
    rays: { count: [60, 30, 90], spin: [1, -1, 3] },
    kaleido: { blobs: [5, 3, 8], line: ["wave", "ring", "none"], spin: [1, -1, 2] },
    plasma: { scale: [1, 0.55, 1.7], stripes: [2, 1, 4], swirl: [0, 1, 2] },
    fractal: { sides: [0, 3, 4, 5, 6, 8], child: [0.22, 0.32, 0.15], spin: [1, -1] },
    julia: { power: [2, 2, 3, 4], glow: [1, 0.6, 1.5], spin: [1, -1, 0], fold: ["", "", "", "mirror", "kal6"] },
    mandel: { place: [0, 1, 2, 3, 4, 5, 6], glow: [1, 0.6, 1.5], spin: [1, -1, 0], fold: ["", "", "", "mirror", "kal6"] },
    newton: { roots: [3, 4, 5], twist: [0, 0.35, -0.35], glow: [1, 0.6, 1.5], spin: [1, -1, 0], fold: ["", "", "", "mirror", "kal6"] },
    ocean: { night: [false, true] },
    neonroad: { sun: ["sun", "moon", "planet"], hills: ["hills", "city", "flat"], curve: [0, 1, -1, 1.6] },
    aurora: { lake: [false, true], curtains: [3, 2, 4] },
    tube: { sides: [24, 6, 8, 12, 4], look: ["mesh", "rings", "lines", "dots", "mesh"], twist: [0, 0.12, -0.12, 0.35], bends: [1, 0.55, 1.45], stripes: [3, 0, 6, 1], twirl: [0, 0.5, -0.5, 1.2], swell: [1, 0.5, 1.8] },
    heads: { layout: ["one", "two", "three", "ring", "one"], move: ["sway", "spin", "still"], look: ["slices", "mesh", "slices", "dots"], stage: ["void", "sun", "grid"], glasses: ["", "", "shades", "round", "visor", "stars", "mixed"] }, // bare-faced about half the time
    sphere: { look: ["dots", "spikes", "rings", "mesh"], depth: [1, 0.6, 1.5], wobble: [1, 0, 2], spin: [1, -1, 2] },
    solids: { mode: ["field", "nested", "orbit", "field"], forms: ["mixed", "cube", "icosa", "tetra", "dodeca"], spin: [1, 2, 0.5] },
    city: { heights: [1, 0.6, 1.5], weave: [1, 0, 2], look: ["neon", "glass", "neon"] },
  };
  const GLIDES = new Set(["hue", "order", "waves", "twists", "loops", "floor", "height", "glow", "spin", "roll", "drift", "flat", "size", "reach", "scale", "swirl", "child", "curve", "twist", "bends", "twirl", "swell", "depth", "wobble", "heights", "weave"]);
  const dialsOf = (style) => VERSIONS[style] && { hue: HUES, order: [0, 0, 1, 2], ...VERSIONS[style] };
  const LIVE = new Set(["fold", "form", "glasses"]), TAKES = { fold: 0.45, form: 1, glasses: 0.16 }; // these go over in the picture itself: the old fold lets go as the new one takes hold, a ring bends from one shape into the other, and a head takes its glasses off and puts others on. Each takes this much of a slow change
  const vary = { aim: {}, on: 0, due: 40, turned: {}, was: {}, over: {}, trip: null }; // where each dial is going, what a fold or a shape was and how far over it is, and the slow change that's on
  const anyOf = (list) => (Math.random() < 0.3 ? list[0] : list[Math.floor(Math.random() * list.length)]); // as designed now and then, otherwise any of them
  const otherThan = (list, now) => { const rest = list.filter((v) => v !== now); return rest.length ? rest[Math.floor(Math.random() * rest.length)] : now; };
  const glides = (key) => GLIDES.has(key) || (key === "stripes" && name === "plasma"); // the tube's stripes are a count, the plasma's how many bands of color
  const turned = (key, rate, by = V.spin ?? 1) => (vary.turned[key] = (vary.turned[key] || 0) + sound.dt * rate * by); // how far something has turned so far, at a rate the version can slow, stop or turn round
  const phrase = () => ((flow.bpm ? (64 * 60) / flow.bpm : 30) * rnd(1, 2)) / Math.max(0.2, T.vary); // sixteen bars or so, or up to twice that
  function setVersion(next, way, trip) { // the dials that change, and how the picture goes over to them: what glides starts on its way, a fold or a shape goes over in the picture, anything else changes behind the old picture going away
    const live = (key) => LIVE.has(key) && way === "fade" && vary.over[key] === undefined; // (not on a drop, where it all changes on the beat, and not one that's still on its way from the last time)
    const jumps = Object.keys(next).filter((key) => !glides(key) && next[key] !== V[key] && !live(key));
    if (jumps.length && way && name && !quiet) {
      quiet = true;
      drawScene();
      if (morph) blend();
      quiet = false;
      snap = copyOf(snap);
      morph = { from: realNow, long: trip ? 2200 : way === "fade" ? 1500 : 900, way, seeds: Array.from({ length: 64 }, Math.random), x: rnd(0.3, 0.7), y: rnd(0.3, 0.7) };
    }
    vary.trip = trip || null; // anything but a step of the slow change that's on ends it there
    for (const [key, value] of Object.entries(next)) {
      vary.aim[key] = value;
      if (glides(key)) { if (!way) V[key] = value; continue; }
      if (value !== V[key] && live(key)) { vary.was[key] = V[key]; vary.over[key] = 0; } // from here it goes over by itself
      else if (value !== V[key] || !way) { delete vary.was[key]; delete vary.over[key]; } // and this one is there at once
      V[key] = value;
    }
    if (jumps.length && way) wipe(); // a fresh start for what streams and fades, behind the old picture
    if (name === "solids" && jumps.length) field.length = 0;
  }
  function freshVersion(designed) { // every dial at once: picked, or as designed
    const dials = dialsOf(name);
    V = {};
    Object.assign(vary, { aim: {}, was: {}, over: {}, trip: null });
    if (dials) setVersion(Object.fromEntries(Object.entries(dials).map(([key, list]) => [key, designed || !T.vary ? list[0] : anyOf(list)])));
    vary.on = 0;
    vary.due = phrase();
  }
  function walk(list, now, next) { // from one count to another through the sizes in between, three steps at most. Anything that isn't a count goes straight there
    if (typeof now !== "number" || typeof next !== "number" || !now || !next) return [next];
    const sizes = [...new Set(list)].sort((a, b) => a - b), a = sizes.indexOf(now), b = sizes.indexOf(next);
    if (a < 0) return [next];
    const path = a < b ? sizes.slice(a + 1, b + 1) : sizes.slice(b, a).reverse();
    while (path.length > 3) path.splice(Math.floor(Math.random() * (path.length - 1)), 1);
    return path;
  }
  function drift(dials) { // a slow change sets off: most of the dials get a new place, and the effect takes eight bars or more to get there
    const trip = { at: 0, long: 0, from: {}, to: {}, live: {}, steps: [] }, hops = [];
    let dialsStepping = 0;
    for (const key of Object.keys(dials).sort(() => Math.random() - 0.5)) {
      const now = vary.aim[key] ?? V[key], next = otherThan(dials[key], now);
      if (next === now || Math.random() > 0.75) continue;
      if (glides(key)) { trip.from[key] = V[key]; trip.to[key] = next; }
      else if (LIVE.has(key)) { if (vary.over[key] === undefined) { const from = rnd(0, 1 - TAKES[key]); trip.live[key] = [from, from + TAKES[key], next]; } } // a ring changes shape all the way through, a fold takes hold over part of it
      else if (dialsStepping < 2 && hops.length < 4) {
        const path = walk(dials[key], now, next), mine = path.length > 4 - hops.length ? path.slice(-1) : path;
        mine.forEach((value, i) => hops.push({ key, value, at: (i + 1) / (mine.length + 1) }));
        dialsStepping++;
      }
    }
    if (Object.keys(trip.to).length + Object.keys(trip.live).length + dialsStepping < 2) return false; // too little to call a change
    trip.steps = hops.sort((a, b) => a.at - b.at).map((hop, i) => ({ at: (i + 1) / (hops.length + 1), pick: { [hop.key]: hop.value } }));
    trip.long = (flow.bpm ? 240 / flow.bpm : 1.8) * (8 + 2 * trip.steps.length) * rnd(1, 1.4);
    for (const key in trip.to) vary.aim[key] = trip.to[key];
    for (const key in trip.live) { vary.was[key] = V[key]; vary.over[key] = 0; V[key] = vary.aim[key] = trip.live[key][2]; }
    vary.trip = trip;
    return true;
  }
  function evolve(real) { // the dials on their way move on, a drop changes them all, and now and then in the groove one or two change on a kick, or a slow change sets off
    const dials = dialsOf(name), trip = vary.trip;
    if (trip && hearing) trip.at = Math.min(1, trip.at + real / trip.long);
    for (const key in vary.aim) if (glides(key) && V[key] !== vary.aim[key]) {
      const d = vary.aim[key] - V[key];
      if (trip && key in trip.to) V[key] = trip.at < 1 ? trip.from[key] + (trip.to[key] - trip.from[key]) * eased(trip.at) : trip.to[key]; // in a slow change they all arrive together
      else V[key] = Math.abs(d) < 1e-3 ? vary.aim[key] : V[key] + d * Math.min(1, real / 1.6);
    }
    for (const key in vary.over) {
      const span = trip && trip.live[key];
      vary.over[key] = span ? clamp((trip.at - span[0]) / (span[1] - span[0])) : vary.over[key] + real / 1.8;
      if (vary.over[key] >= 1) { delete vary.over[key]; delete vary.was[key]; }
    }
    if (!dials || !T.vary || !hearing || pending || morph) return;
    if (flow.dropHit) {
      vary.on = 0;
      vary.due = phrase();
      setVersion(Object.fromEntries(Object.entries(dials).map(([key, list]) => [key, anyOf(list)])), Math.random() < 0.5 ? "zoom" : "iris");
    } else if (trip) { // its next step waits for a kick; with none left and everything arrived, it's over
      const step = trip.steps[0];
      if (step && trip.at >= step.at && (sound.kickHit || trip.at >= step.at + 0.06)) { trip.steps.shift(); setVersion(step.pick, "fade", trip); }
      else if (!step && trip.at >= 1) { vary.trip = null; vary.on = 0; vary.due = phrase(); }
    } else if ((vary.on += real) > vary.due && sound.kickHit) {
      vary.on = 0;
      vary.due = phrase();
      if (Math.random() < 0.45 && drift(dials)) return;
      const keys = Object.keys(dials), pick = {};
      for (let n = Math.random() < 0.4 ? 2 : 1; n > 0; n--) { const key = keys[Math.floor(Math.random() * keys.length)]; pick[key] = otherThan(dials[key], vary.aim[key] ?? V[key]); }
      setVersion(pick, "fade");
    }
  }
  function tint() { // the record's colors as the version has them: turned round the color wheel, and in another order (or between two orders, on the way from one to the other). While it changes by itself they also drift a little, all the time
    const turn = (V.hue || 0) + (VERSIONS[name] && T.vary ? 10 * Math.sin(sound.t * 0.04) : 0), order = V.order || 0, first = Math.floor(order), part = order - first, n = base.length;
    colors = turn || order ? base.map((_, i) => turnHue(part ? mix(base[(i + first) % n], base[(i + first + 1) % n], part) : base[(i + first) % n], turn)) : base;
    const pale = Math.min(0.4, dream.held * 0.25); // and paler while a big lead plays
    if (pale > 0.004) colors = colors.map((c) => mix(c, [255, 255, 255], pale));
  }
  function fold(kind, amount = 1) { // the picture folded on itself: mirrored down the middle, top to bottom, both ways, or round and round like a kaleidoscope, slowly turning. Less than all of it shows while one fold goes over to another
    if (amount < 0.004) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = amount;
    if (kind === "mirror" || kind === "quad") { g.setTransform(-1, 0, 0, 1, w, 0); g.drawImage(canvas, 0, 0, w / 2, h, 0, 0, w / 2, h); }
    if (kind === "flip" || kind === "quad") { g.setTransform(1, 0, 0, -1, 0, h); g.drawImage(canvas, 0, 0, w, h / 2, 0, 0, w, h / 2); }
    if (kind === "kal6" || kind === "kal8") {
      const N = kind === "kal6" ? 6 : 8, from = turned("fold", 0.04, amount), reach = Math.hypot(w, h); // (two folds showing at once turn it as far as one would)
      for (let i = 1; i < N; i++) { // the wedge round the turning angle is copied into each of the others, every other one a mirror image, so the edges meet
        g.setTransform(1, 0, 0, 1, w / 2, h / 2);
        g.rotate((i * TAU) / N + from);
        if (i % 2) g.scale(1, -1);
        g.rotate(-from);
        g.save();
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, reach, from - Math.PI / N, from + Math.PI / N);
        g.closePath();
        g.clip();
        g.drawImage(canvas, -w / 2, -h / 2);
        g.restore();
      }
    }
    g.restore();
  }

  const DRAW = { ribbon, silk, helix, strings, bars, mirror, leds, terrain, scope, trails, tunnel, vortex, prism, ripple, comets, stars: starfield, whirl, dust, links, fireworks, halo, sun, rings, mandala, rays, space, warp: space, drift: space, orbit: space, visitors: space, well,
    kaleido, plasma, fractal, julia, mandel, newton, ocean, neonroad, aurora, tube: tubeFx, heads: headsFx, sphere: sphereFx, solids: solidsFx, city: cityFx };

  /* From one effect to another. The change waits for the next frame, which draws the old picture once more with nobody visiting and keeps it.
     Then the new effect starts underneath and the old picture goes away over it, in one of several ways: quickly when you pick one, slowly when it changes by itself. */
  const FADES_IN_PLACE = new Set(["scope", "stars", "whirl", "fireworks"]); // these fade their own last frame, so whatever went over it would leave a trail
  const fadesInPlace = () => FADES_IN_PLACE.has(name) || (recipeBook.has(name) && !recipeBook.get(name).echo); // and so does a recipe that neither zooms nor turns
  const eased = (p) => p * p * (3 - 2 * p);
  const copyOf = (was) => { const c = was && was.width === w && was.height === h ? was : paper(w, h)[0]; c.getContext("2d").drawImage(canvas, 0, 0); return c; }; // the picture as it is now
  let snap = null, tiny = null, wayWas = "";
  const WAYS = {
    fade(p) { // it fades as it comes a little closer
      const s = 1 + 0.12 * p;
      g.globalAlpha = 1 - eased(p);
      g.setTransform(s, 0, 0, s, (w - w * s) / 2, (h - h * s) / 2);
      g.drawImage(snap, 0, 0, w, h);
    },
    zoom(p) { // straight through it and out into the new one
      const s = 1 + 2.6 * p * p;
      g.globalAlpha = (1 - p) ** 1.3;
      g.setTransform(s, 0, 0, s, (w - w * s) / 2, (h - h * s) / 2);
      g.drawImage(snap, 0, 0, w, h);
    },
    record(p) { // it turns into a record and spins away into the middle
      const r = (1 - eased(p)) * Math.hypot(w, h) * 0.52, turn = 3.4 * p * p, c = Math.cos(turn), s = Math.sin(turn), edge = new Path2D();
      if (r < 2) return;
      edge.arc(w / 2, h / 2, r, 0, TAU);
      g.save();
      g.clip(edge);
      g.setTransform(c, s, -s, c, w / 2, h / 2);
      g.drawImage(snap, -w / 2, -h / 2, w, h);
      g.restore();
      g.globalCompositeOperation = "lighter";
      neon(edge, rgba(mix(colors[0], [255, 255, 255], 0.4), 1), Math.max(1.2, h / 420), 0.9 * (1 - p));
    },
    melt(p, m) { // it runs down like wet paint, a strip at a time
      const N = 32, wide = w / N, step = snap.width / N;
      for (let i = 0; i < N; i++) {
        const wait = m.seeds[i] * 0.5, q = clamp((p - wait) / (1 - wait)), drop = h * 1.1 * q * q;
        if (drop >= h) continue;
        g.globalAlpha = 1 - 0.35 * q;
        g.drawImage(snap, i * step, 0, step, snap.height, i * wide, drop, wide + 1, h);
      }
    },
    tiles(p, m) { // it comes apart in tiles that turn over one after another, out from one place
      const C = 12, R = Math.max(3, Math.round((C * h) / w)), tw = w / C, th = h / R, sw = snap.width / C, sh = snap.height / R;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const far = Math.hypot((c + 0.5) / C - m.x, (r + 0.5) / R - m.y) / Math.SQRT2, turn = Math.cos((clamp((p - far * 0.6) / 0.4) * Math.PI) / 2);
        if (turn < 0.02) continue;
        g.globalAlpha = 0.35 + 0.65 * turn;
        g.setTransform(turn, 0, 0, 1, (c + 0.5) * tw, (r + 0.5) * th);
        g.drawImage(snap, c * sw, r * sh, sw, sh, -tw / 2 - 0.5, -th / 2 - 0.5, tw + 1, th + 1);
      }
    },
    iris(p, m) { // a ring of light opens out from near the middle, with the new picture inside it
      const cx = w * m.x, cy = h * m.y, r = eased(p) * Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.02, hole = new Path2D(), ring = new Path2D();
      hole.rect(0, 0, w, h);
      hole.arc(cx, cy, r, 0, TAU);
      g.save();
      g.clip(hole, "evenodd");
      g.drawImage(snap, 0, 0, w, h);
      g.restore();
      if (r < 2) return;
      ring.arc(cx, cy, r, 0, TAU);
      g.globalCompositeOperation = "lighter";
      neon(ring, rgba(around(p * 0.6), 1), Math.max(1.5, h / 300), 1 - 0.6 * p);
    },
    tv(p) { // an old television switched off: it folds into a line of light and the line into a dot, with the new picture behind it all along
      const fold = eased(clamp(p / 0.5)), tall = Math.max(2, h * (1 - fold)), wide = w * (1 - eased(clamp((p - 0.5) / 0.3))) + 8, light = clamp((fold - 0.55) / 0.45) * (1 - clamp((p - 0.8) / 0.2));
      if (p < 0.5) {
        g.drawImage(snap, 0, (h - tall) / 2, w, tall);
        g.globalCompositeOperation = "lighter";
        g.globalAlpha = 0.7 * fold; // brighter as it folds
        g.drawImage(snap, 0, (h - tall) / 2, w, tall);
      }
      g.globalCompositeOperation = "lighter";
      g.fillStyle = "#fff";
      for (const [thick, glow] of [[h * 0.03, 0.12], [h * 0.009, 0.35], [2, 1]]) {
        g.globalAlpha = glow * light;
        g.fillRect((w - wide) / 2, h / 2 - thick / 2, wide, thick);
      }
    },
    pixels(p) { // it breaks up into bigger and bigger squares, and fades
      const size = Math.max(1, Math.round(1 + 64 * eased(p) ** 1.6 * Math.max(0.5, w / 1600))), across = Math.ceil(w / size), down = Math.ceil(h / size);
      if (!tiny || tiny.width < w || tiny.height < h) tiny = paper(w, h)[0];
      tiny.getContext("2d").drawImage(snap, 0, 0, across, down);
      g.imageSmoothingEnabled = false;
      g.globalAlpha = 1 - clamp((p - 0.4) / 0.6) ** 1.5;
      g.drawImage(tiny, 0, 0, across, down, 0, 0, across * size, down * size);
    },
  };
  function pickWay() { const ways = Object.keys(WAYS).filter((k) => k !== wayWas); wayWas = ways[Math.floor(Math.random() * ways.length)]; return wayWas; }
  function blend() { // the old picture over the new one, on its way out
    const p = (realNow - morph.from) / morph.long;
    if (p >= 1) { morph = snap = tiny = null; return; }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    WAYS[morph.way](Math.max(0, p), morph);
    g.restore();
    g.globalAlpha = 1;
  }
  function beginEffect(next) { // an effect from its first frame, in a version of its own
    name = next;
    if (TRIPS[name]) sky.far = null; // a new journey each time
    fit();
    wipe();
    freshVersion();
    tint();
    crowd.at = Math.min(crowd.at, sound.t + rnd(...((TRIPS[name] || ROAM).first || [7, 16]))); // somebody comes by fairly soon, unless they were coming sooner anyway
    if (crowd.oddAt === Infinity) crowd.oddAt = sound.t + rnd(16, 34);
    roam.on = 0;
    roam.due = rnd(40, 80);
  }
  function drawScene() { // the effect itself
    if (dirty) { // one that fades its own last frame gets it back as it was, without what went over it
      stage.setTransform(1, 0, 0, 1, 0, 0);
      stage.globalCompositeOperation = "source-over";
      stage.globalAlpha = 1;
      stage.drawImage(clean, 0, 0);
      dirty = false;
    }
    (DRAW[name] || recipeFx)(); // anything not built in is a recipe
    g.setTransform(1, 0, 0, 1, 0, 0);
    const p = vary.over.fold === undefined ? 1 : eased(vary.over.fold); // on the way from one fold to another, the old one lets go as the new one takes hold
    if (p < 1 && vary.was.fold) fold(vary.was.fold, 1 - p);
    if (V.fold) fold(V.fold, p);
  }
  function changeOver() {
    quiet = true;
    drawScene();
    if (morph) blend(); // a change in the middle of another one goes on from what was showing
    quiet = false;
    snap = copyOf(snap);
    const slow = slowNext;
    slowNext = false;
    beginEffect(pending);
    pending = "";
    morph = { from: realNow, long: slow ? 2600 : 1100, way: pickWay(), seeds: Array.from({ length: 64 }, Math.random), x: rnd(0.3, 0.7), y: rnd(0.3, 0.7) };
  }
  function drawFrame() {
    const inScene = folkInScene();
    drawScene();
    drawTwinkles();
    if (!inScene) invite(TRIPS[name] || ROAM);
    if (fadesInPlace() && (morph || (!inScene && crowd.folk.length) || dreaming())) { clean = copyOf(clean); dirty = true; }
    if (morph) blend();
    if (!inScene) drawFolk();
  }

  /* Morph: the effect changes into another by itself now and then. It waits for a kick, and best of all for the beat coming back after a break. */
  let wanders = null;
  const roam = { on: 0, due: 60 };
  function wander(real) {
    const kick = sound.kickHit, back = flow.dropHit;
    if (!wanders || pending || morph || !hearing) return; // only while the music plays
    roam.on += real;
    if ((back && roam.on > 25) || (kick && roam.on > roam.due) || roam.on > roam.due + 20) { roam.on = 0; roam.due = rnd(40, 80); wanders(); }
  }

  /* Visitors on the app itself, now and then: a saucer borrows a cover and gives it back, a face peeks over the play bar, a cow gets taken from it,
     somebody hangs on a thread from the top, an astronaut or a jellyfish goes by. They have a layer of their own over the page, shown only while one is there, and clicks go straight through it. */
  const guestCanvas = Object.assign(document.createElement("canvas"), { id: "guests", hidden: true }), guestPaint = guestCanvas.getContext("2d"), guest = { list: [], t: 0 };
  guestCanvas.setAttribute("aria-hidden", "true");
  document.body.append(guestCanvas);
  function liftCover(o) { // the cover itself goes up into the light, and comes back down when it's let go
    const it = o.el, up = Math.max(16, Math.min(200, (o.top - (o.y + o.size * 0.24)) * 0.75)), at = (y, turn, scale, offset, easing) => ({ translate: `0 ${y.toFixed(1)}px`, rotate: `${turn}deg`, scale: String(scale), offset, ...(easing ? { easing } : {}) });
    if (!it.isConnected || !it.animate) return;
    it.animate([at(0, 0, 1, 0, "ease-in-out"), at(-up, -7, 0.84, 0.42, "ease-in-out"), at(-up * 1.05, 6, 0.84, 0.6, "ease-in-out"), at(-up, -3, 0.86, 0.76, "cubic-bezier(.55,0,1,.45)"), at(0, 0, 1, 0.88, "ease-out"), at(-8, 0, 1, 0.94, "ease-in"), at(0, 0, 1, 1)], { duration: o.life * 360 });
  }
  function beam(fromX, fromY, toX, toY, top, wide, light, tone) { // a saucer's light, from under it down to whatever it's after
    const paint = g.createLinearGradient(0, fromY, 0, toY);
    paint.addColorStop(0, rgba(tone, 0.55));
    paint.addColorStop(1, rgba(tone, 0.14));
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = light * (0.75 + 0.25 * sound.hat);
    g.fillStyle = paint;
    g.beginPath();
    g.moveTo(fromX - top, fromY);
    g.lineTo(fromX + top, fromY);
    g.lineTo(toX + wide / 2, toY);
    g.lineTo(toX - wide / 2, toY);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }
  function flying(o, part, hoverX, hoverY, come, go, fromSide) { // where a saucer is: in from one side, over the spot, and away up the other
    const { t } = sound, arrive = 1 - (1 - clamp((part - come[0]) / (come[1] - come[0]))) ** 3, leave = clamp((part - go) / (1 - go)) ** 2, fromX = hoverX + fromSide * w * 0.7, fromY = hoverY - h * 0.3, toX = hoverX - fromSide * w * 0.8, toY = hoverY - h * 0.5;
    let x = fromX + (hoverX - fromX) * arrive, y = fromY + (hoverY - fromY) * arrive;
    x += (toX - x) * leave + Math.sin(t * 1.1 + o.seed) * o.size * 0.03;
    y += (toY - y) * leave + Math.sin(t * 1.7 + o.seed) * o.size * 0.02 + sky.bob * o.size * 0.3;
    return { x, y, arrive, tilt: -(1 - arrive) * fromSide * 0.3 - leave * fromSide * 0.4 + Math.sin(t * 1.3 + o.seed) * 0.05 + sky.bob * 0.15 };
  }
  function drawBorrow(o, part) { // a saucer comes over a cover, takes it up in its beam, thinks better of it and drops it back
    const at = flying(o, part, o.x, o.y, [0, 0.2], 0.84, o.side), light = clamp((part - 0.26) / 0.04) * clamp((0.585 - part) / 0.02), shrug = part > 0.64 && part < 0.8 ? Math.sin((part - 0.64) * 70) * 0.09 : 0;
    if (!o.lifted && part > 0.3) { o.lifted = true; liftCover(o); }
    if (light > 0) beam(at.x, at.y + o.size * 0.05, o.middle, o.bottom + 8, o.size * 0.08, Math.max(o.wide * 1.25, o.size * 0.6), light, o.tone);
    g.translate(at.x, at.y);
    g.rotate(at.tilt + shrug);
    saucerBody(o, o.size);
  }
  function drawAbduct(o, part) { // a cow strolls along the top of the play bar, and a saucer comes for it
    const { t } = sound, art = cowPicture(), hover = o.floor - o.high, at = flying(o, part, o.x, hover, [0.22, 0.36], 0.8, -o.side), walk = 1 - (1 - clamp(part / 0.24)) ** 2, start = o.side > 0 ? w + o.cow : -o.cow;
    const light = clamp((part - 0.34) / 0.04) * clamp((0.66 - part) / 0.04), up = eased(clamp((part - 0.38) / 0.24)), gone = clamp((part - 0.6) / 0.05), wide = o.cow * (1 - 0.85 * gone), tall = (wide * art.height) / art.width, stand = o.floor - tall * 0.43;
    const cowX = start + (o.x - start) * walk + (at.x - o.x) * up, cowY = stand + (at.y + o.size * 0.1 - stand) * up - (walk < 1 ? Math.abs(Math.sin(t * 10)) * o.cow * 0.06 : 0);
    if (light > 0) beam(at.x, at.y + o.size * 0.05, o.x, o.floor, o.size * 0.08, o.cow * 1.5, light, o.tone);
    if (gone < 1) {
      g.save();
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1 - gone;
      g.translate(cowX, cowY);
      g.rotate(up * Math.sin(t * 2.2 + o.seed) * 0.45);
      g.scale(o.side > 0 ? -1 : 1, 1); // facing the way it walked
      g.drawImage(art, -wide / 2, -tall / 2, wide, tall);
      g.restore();
    }
    if (at.arrive <= 0) return;
    g.translate(at.x, at.y);
    g.rotate(at.tilt);
    saucerBody(o, o.size);
  }
  function drawDangle(o, part) { // let down on a thread from the top of the window: it swings, nods along, waves once, and is pulled back up
    const { t, dt, kickHit } = sound, S = o.size, down = part < 0.18 ? 1 - (1 - part / 0.18) ** 3 : part > 0.84 ? 1 - ((part - 0.84) / 0.16) ** 2 : 1, long = o.reach * down, look = LOOKS[o.look] || LOOKS[""];
    if (kickHit) { o.neckSpeed += 7 * kickHit * T.nod; o.swingSpeed += (o.swing >= 0 ? 1 : -1) * 0.3 * kickHit; }
    spring(o, "neck", "neckSpeed", 170, 5, dt);
    spring(o, "swing", "swingSpeed", 4, 0.5, dt);
    const hx = o.x + Math.sin(o.swing) * long, hy = Math.cos(o.swing) * long, waving = part > o.wave && part < o.wave + 0.18, skin = rgba(look.skin, 1), suit = rgba(mix(look.skin, [10, 30, 25], 0.55), 1);
    const arm = (side, hand) => { g.beginPath(); g.moveTo(side * S * 0.12, S * 0.86); g.lineTo(side * S * 0.42, S * 0.48); g.lineTo(...hand); g.stroke(); };
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(225,230,240,.75)";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(o.x, -4);
    g.lineTo(hx, hy);
    g.stroke();
    g.translate(hx, hy);
    g.rotate(-o.swing);
    g.lineCap = "round";
    g.strokeStyle = skin;
    g.lineWidth = S * 0.1;
    arm(-1, [-S * 0.05, 0]);
    if (waving) { const a = -1.6 + Math.sin(((part - o.wave) / 0.18) * Math.PI * 8) * 0.55; arm(1, [S * 0.42 + Math.cos(a) * S * 0.34, S * 0.48 + Math.sin(a) * S * 0.34]); } else arm(1, [S * 0.05, 0]);
    g.strokeStyle = suit;
    g.lineWidth = S * 0.11;
    for (const side of [-1, 1]) { g.beginPath(); g.moveTo(side * S * 0.07, S * 1.14); g.lineTo(side * S * 0.1 + Math.sin(t * 2.3 + o.seed + side) * S * 0.06, S * 1.48); g.stroke(); }
    g.fillStyle = suit;
    g.beginPath();
    g.roundRect(-S * 0.16, S * 0.76, S * 0.32, S * 0.44, S * 0.12);
    g.fill();
    g.translate(0, S * 0.8); // the head nods from the neck
    g.rotate(o.neck * 0.5);
    g.drawImage(artOf(o.look).pilot, -S * 0.5, -S * 0.86, S, S);
  }
  const GUESTS = { borrow: drawBorrow, abduct: drawAbduct, dangle: drawDangle, peek: drawPeek, astronaut: drawAstronaut, eye: drawEye, jelly: (o, part) => { drawJelly(o, part); if (o.y < -o.size * 1.4) o.done = true; } };
  function guests(real) {
    if (!guest.list.length) return;
    const W = innerWidth, H = innerHeight, k = document.body.classList.contains("gentle") ? 1 : Math.min(2, devicePixelRatio || 1), was = [g, w, h, sound.t, sound.dt];
    if (guestCanvas.width !== Math.round(W * k) || guestCanvas.height !== Math.round(H * k)) { guestCanvas.width = Math.round(W * k); guestCanvas.height = Math.round(H * k); }
    guestCanvas.hidden = false;
    guest.t += real;
    [g, w, h, sound.t, sound.dt] = [guestPaint, W, H, guest.t, real]; // the same drawing as in the pictures, on this layer and by the clock
    try {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 1;
      g.clearRect(0, 0, guestCanvas.width, guestCanvas.height);
      guest.list = guest.list.filter((o) => {
        const part = (guest.t - o.born) / o.life;
        if (part >= 1 || o.done) return false;
        g.setTransform(k, 0, 0, k, 0, 0);
        g.save();
        GUESTS[o.kind](o, Math.max(0, part));
        g.restore();
        return true;
      });
    } finally { [g, w, h, sound.t, sound.dt] = was; }
    if (!guest.list.length) { guestCanvas.hidden = true; guestCanvas.width = guestCanvas.height = 1; } // and its memory goes until somebody else comes
  }
  addEventListener("resize", () => { if (name) fit(); });
  return {
    names: [["ribbon", "Ribbon"], ["bars", "Bars"], ["trails", "Trails"], ["stars", "Stars"], ["halo", "Halo"], ["space", "Space"], ["trip", "Psychedelic"], ["journey", "Journeys"], ["worlds", "3D"], ["recipes", "Recipes"]],
    styles: STYLES,
    show(next) {
      if (!canvas.hidden && name) { pending = next === name ? "" : next; return; } // already showing one: it changes on the next frame, from how it looks then
      canvas.hidden = false;
      slowNext = false; // from nothing there's nothing to change from
      beginEffect(next);
      last = 0;
    },
    hide() {
      name = pending = "";
      slowNext = false;
      morph = null;
      crowd.folk = [];
      dream.on = dream.held = dream.bloom = 0;
      dream.motes.length = 0;
      canvas.hidden = true;
    },
    slow() { slowNext = true; }, // the next change takes its time, for when it changes by itself
    wander(pick) { wanders = pick || null; roam.on = 0; roam.due = rnd(40, 80); }, // Morph: what to call for the next effect now and then, or nothing to stay on this one
    full(on) { alone = on; },
    mood(next) { mood = next || ""; }, // what's playing decides who comes by
    song(text) { if ((text || "") !== nowSong) { flow.floor = 0.19; flow.bare = 0.13; flow.since = Math.max(flow.since, 1.4); flow.thump = 0; flow.spare = 0; } nowSong = text || ""; }, // for the cockpit's news, and a new song's usual is learned afresh: the last song's kick isn't this one's
    words: ["warp", "stop", "moo", "aliens"],
    word(what) { // typed on the keyboard, while a picture is showing
      if (!name) return;
      const aboard = TRIPS[name] && sky.far;
      if (what === "aliens") { meet("saucer"); meet("saucer"); }
      else if (what === "acid") meet("smiley"); // typed while a picture is showing: smileys float up through it
      else if (what === "moo") { if (aboard) oddity("cow", true); else meet("cow"); }
      else if (aboard && (TRIPS[name].moves !== undefined || name === "space")) startMove(what === "warp" ? "jump" : "stop");
    },
    visit(kind, place = {}) { // somebody on the app itself, where the page says there's room. Says whether they came
      if (guest.list.length || !GUESTS[kind]) return false;
      const W = innerWidth, H = innerHeight, t = guest.t, side = Math.random() < 0.5 ? -1 : 1, look = LOOKS[mood] ? mood : "", left = place.left ?? 0, right = place.right ?? W, o = { kind, born: t, side, look, seed: rnd(0, TAU), lamp: 0, tone: toneOf(look) };
      if (kind === "borrow") {
        const r = place.element && place.element.getBoundingClientRect();
        if (!r || !r.width) return false;
        const size = Math.max(120, Math.min(220, r.width * 1.25)), y = Math.max(size * 0.35, r.top - size * 0.24 - Math.max(40, Math.min(170, r.height * 0.8)));
        Object.assign(o, { life: 11, el: place.element, size, x: Math.max(size * 0.55, Math.min(W - size * 0.55, r.left + r.width / 2)), y, top: r.top, bottom: r.bottom, middle: r.left + r.width / 2, wide: r.width, lifted: false });
      } else if (kind === "abduct") Object.assign(o, { life: 13, floor: place.floor ?? H, cow: Math.max(56, Math.min(96, W * 0.05)), size: Math.max(120, Math.min(190, W * 0.09)), x: left + (right - left) * rnd(0.3, 0.7), high: Math.max(150, Math.min(300, H * 0.32)) });
      else if (kind === "dangle") Object.assign(o, { life: rnd(10, 13), x: left + (right - left) * rnd(0.2, 0.8), reach: Math.max(130, Math.min(280, H * 0.28)), size: Math.max(46, Math.min(72, H * 0.07)), neck: 0, neckSpeed: 0, swing: rnd(-0.25, 0.25), swingSpeed: 0, wave: rnd(0.38, 0.55) });
      else if (kind === "peek") { const size = Math.max(130, Math.min(220, Math.min(W, H) * 0.22)); Object.assign(o, { life: rnd(7, 10), floor: place.floor ?? H, size, x: left + size * 0.6 + Math.max(0, right - left - size * 1.2) * Math.random(), lean: side, blink: t + rnd(1, 3), shut: 0 }, look === "acid" ? smileyTrick(0.6, true) : {}); }
      else if (kind === "eye") { const size = Math.max(60, Math.min(120, Math.min(W, H) * 0.1)), floor = place.floor ?? H; Object.assign(o, { life: rnd(8, 11), size, x: left + size * 1.5 + Math.max(0, right - left - size * 3) * Math.random(), y: floor - size * 1.15, blink: t + rnd(1.2, 2.5), shut: 0 }); } // it opens just over the play bar
      else if (kind === "astronaut") Object.assign(o, { life: rnd(14, 18), y: rnd(0.15, 0.5) * H, size: Math.max(56, Math.min(96, Math.min(W, H) * 0.085)), beat: 0, arm: 0 });
      else { const tone = look === "psy" ? mix(rainbowTone(rnd(0, 3), 0), [255, 255, 255], 0.15) : mix(around(rnd(0, 1)), look === "euphoric" ? [230, 215, 255] : [120, 210, 255], 0.35); Object.assign(o, { life: rnd(12, 16), x: rnd(0.15, 0.85) * W, y: H * 1.12, drift: side * rnd(0.004, 0.012) * W, rise: H * rnd(0.05, 0.065), size: Math.max(90, Math.min(160, Math.max(W, H) * 0.075)), art: paintJelly(tone), tone, pulse: 0 }); }
      guest.list.push(o);
      return true;
    },
    visiting: () => guest.list.length > 0,
    knobs: (style) => { const trip = TRIPS[style]; return ["light", "react", "speed", "spark", ...(LEAVES_TRAILS.has(style) ? ["drag"] : []), ...(style === "ripple" ? ["tilt"] : []), ...(trip ? ["nod", ...(trip.steer ? ["turns"] : []), ...(trip.moves ? ["moves"] : []), "shots"] : []), ...(VERSIONS[style] ? ["vary"] : []), "dream", "folk", ...(trip && trip.falls ? ["falls"] : []), ...(trip && trip.cockpit ? ["pit"] : [])].map((key) => [key, ...KNOBS[key]]); },
    tuning(values) { // adjustments for the effect showing. Anything left out is back to how it was designed
      const was = T.vary;
      for (const key of Object.keys(T)) { const [, low, high] = KNOBS[key], v = Number(values[key]); T[key] = Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : 1; }
      canvas.style.filter = T.light === 1 ? "" : `brightness(${T.light})`;
      if (!T.turns && sky.far) sky.aimX = sky.aimY = 0;
      if (name && dialsOf(name) && !was !== !T.vary) { // turned off it goes back to how it was designed; turned on, it's away again
        const dials = dialsOf(name);
        setVersion(Object.fromEntries(Object.entries(dials).map(([key, list]) => [key, T.vary ? anyOf(list) : list[0]])), canvas.hidden ? undefined : "fade");
      }
    },
    versions: (style) => !!VERSIONS[style], // whether it has versions to change between
    recipes: { // effects written as data: see readRecipe. Their names start "recipe-"; the app keeps your own and brings them back when it starts
      check: (raw) => readRecipe(raw).problems || [],
      keep: (key, raw) => (/^recipe-[a-z0-9-]{1,60}$/.test(key) ? keepRecipe(key, raw) : ["That isn't a name a recipe can go by."]), // what's wrong with it, or null
      raw: (key) => recipeRaw.get(key) || null,
      example: (key) => (EXAMPLES[key] ? JSON.parse(JSON.stringify(EXAMPLES[key])) : null), // as it came with the app
      drop(key) { // yours goes; an example goes back to how it came
        if (EXAMPLES[key]) return keepRecipe(key, EXAMPLES[key]);
        recipeBook.delete(key);
        recipeRaw.delete(key);
        delete FAMILY[key];
        const at = STYLES.recipes.findIndex(([k]) => k === key);
        if (at >= 0) STYLES.recipes.splice(at, 1);
        return null;
      },
      names: [...RECIPE_VARS], functions: Object.keys(RECIPE_FUNCS), shapes: RECIPE_SHAPES, parts: Object.keys(RECIPE_PARTS),
    },
    another() { // a new version of the effect showing, now: every dial picked again, and at least one that shows changed
      const dials = dialsOf(name);
      if (!dials || pending || morph) return false;
      const pick = Object.fromEntries(Object.entries(dials).map(([key, list]) => [key, anyOf(list)])), jumps = Object.keys(VERSIONS[name]).filter((key) => !glides(key) && VERSIONS[name][key].length > 1);
      if (jumps.length && jumps.every((key) => pick[key] === V[key])) { const key = jumps[Math.floor(Math.random() * jumps.length)]; pick[key] = otherThan(dials[key], V[key]); }
      setVersion(pick, "fade");
      vary.on = 0;
      return true;
    },
    light: () => T.light,
    cover(img) { // the colors come from the record
      picture = img;
      base = PLAIN;
      try {
        const picked = img ? vividColors(img) : [];
        if (picked.length) base = [...picked, ...PLAIN].slice(0, 3);
        return picked.length ? picked[0] : null; // its strongest color, for whoever else wants it
      } catch { base = PLAIN; return null; } finally { tint(); }
    },
    vivid(img) { try { return vividColors(img)[0] || null; } catch { return null; } }, // the strongest color on any picture, without touching what's on screen
    frame(now, analyser, hit, tick, drawing = true, low = 0) { // drawing: whether the picture moves on this frame. The visitors on the app move either way. low: how big the low end is just now, for telling the kick from smaller thumps, or 0 if that isn't known
      const real = Math.min(0.1, last ? (now - last) / 1000 : 0.016), dt = real * T.speed * flow.pace, showing = !!name && drawing; // slower in a calm part, quicker through a build and a drop
      last = now;
      realNow = now;
      hearing = !!analyser;
      if (showing) sound.t += dt;
      sound.dt = dt;
      listen(analyser, hit, tick, real, low);
      if (!(showing && TRIPS[name])) nodAlong(); // the visitors nod to the kick anywhere. In Space the ship's own nod does it
      if (showing) {
        keepUp(real);
        if (pending) changeOver();
        evolve(real);
        dreamNow(real);
        tint();
        drawFrame();
        drawFlow(real);
        wander(real);
      }
      guests(real);
    },
    flow: () => flow, // how the song is going, for the rest of the app: part (groove, calm, build or drop), intensity, bpm, and dropHit on the frame a drop lands
    when(next) { when = { ...when, ...next }; }, // the time of day, the season, the record's era and the party, from the app
  };
})();
