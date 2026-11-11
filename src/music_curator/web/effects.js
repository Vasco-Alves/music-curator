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
  const pointer = { on: false, x: 0, y: 0, at: -1e9, tap: null, tapped: null, taken: false, rings: [] }; // the mouse over the picture, in the picture's own dots: on while it is over the picture itself (not the page's buttons or words), at when it last moved (the clock, in ms), and tapped, a click, there for the one frame after it lands, as kickHit is for a kick. An effect that answers a click in its own way sets taken in that frame, and then no ring goes out. rings: the soft rings that clicks send out
  const T = { light: 1, react: 1, speed: 1, drag: 1, spark: 1, nod: 1, turns: 1, moves: 1, shots: 1, folk: 1, acid: 1, band: 1, pit: 1, tilt: 1, vary: 1, dream: 1, falls: 1, color: 1, echo: 1, breathe: 1, sounds: 1 }; // what's been adjusted for the effect showing: 1 is how it was designed
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
    pixel: [["runner", "Runner"], ["arcade", "Arcade"], ["places", "Places"], ["life", "Living grid"]],
    visions: [["faces", "Faces"], ["forms", "Forms"], ["beings", "Beings"]],
  };
  const FOLK_OF = { arcade: ["astronaut", "shapes", "neon", "jelly"], ocean: ["jelly", "whale", "jelly", "shapes"], neonroad: ["neon", "shapes", "saucer", "neon"], aurora: ["saucer", "astronaut", "neon", "saucer"], // some places have their own visitors
    tube: ["shapes", "neon", "eye", "saucer"], heads: ["saucer", "eye", "shapes", "neon"], sphere: ["astronaut", "saucer", "shapes", "jelly"], solids: ["shapes", "saucer", "neon", "astronaut"], city: ["saucer", "neon", "saucer", "shapes"] };
  const FAMILY = Object.fromEntries(Object.entries(STYLES).flatMap(([family, list]) => list.map(([style]) => [style, family])));
  const KNOBS = { light: ["Brightness", 0.3, 1.7], react: ["Reacts to the music", 0.2, 1.8], speed: ["Speed", 0.3, 2], spark: ["Glints on the hi-hats", 0, 2], drag: ["Length of the trails", 0.4, 2.5], nod: ["Nodding to the beat", 0, 2], turns: ["Changes of course", 0, 3], moves: ["Jumps and stops", 0, 3], band: ["Crowd and dancers", 0, 2], pit: ["Cockpit", 0, 1], shots: ["Shooting stars", 0, 3], folk: ["Visitors", 0, 3], acid: ["Singing to the 303", 0, 2], tilt: ["Turning now and then", 0, 3], vary: ["Changes by itself", 0, 3], dream: ["Dreamy lights", 0, 2], falls: ["Falling into planets", 0, 3], color: ["Colors that travel", 0, 1.5], echo: ["After-images", 0, 2], breathe: ["Breathing", 0, 2], sounds: ["Answers to sounds", 0, 2] };
  const LEAVES_TRAILS = new Set(["trails", "tunnel", "vortex", "prism", "ripple", "comets", "stars", "whirl", "fireworks", "scope"]);
  const raw = new Float32Array(BANDS), leadHold = new Float32Array(BANDS), leadMid = new Float32Array(512), leadSum = new Float32Array(513), peaks = new Float32Array(160), stars = new Float32Array(STARS * 3), HEADS = 9, past = new Float32Array(HEADS * 2).fill(NaN), orbits = new Float32Array(HEADS);
  let nowSong = "", genre = "", mood = "", name = "", alone = false, w = 0, h = 0, quality = 1, colors = PLAIN, picture = null, last = 0, slowTime = 0, slowFrames = 0, top = 0.3, waveTop = 0.1, freq = null, time = null, binHz = 23.4;
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
  const flow = { grooved: false, part: "groove", intensity: 0.5, build: 0, calm: 0, drop: 0, dropHit: 0, since: 9, fast: 0, slow: 0, hiFast: 0, hiSlow: 0, pace: 1, bpm: 0, gaps: [], clock: 0, kickAt: 0, steady: 0, lead: 0, leadHit: 0, leadArmed: true, tune: 0, tuneHit: 0, tuneArmed: true, tone: 0, flux: 0, floor: 0.19, bare: 0.13,
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
      const earned = flow.grooved || flow.build > 0.35; // a drop is earned within the song: once it has been in its groove, or through a build. The gap between two songs, or a song that starts on its kick, is not a break
      flow.due = earned && flow.gone > 2.6 ? 2 : flow.spare > 0 && flow.gone > 1.1 ? 1 : 0;
      flow.gone = 0;
    }
    if (flow.due && !(low > 0 && flow.beat >= 4 && flow.peak < 1.3 * flow.under)) { back = true; flow.spare = flow.due > 1 ? (low > 0 ? 2 : 0) : flow.spare - 1; flow.due = 0; } // not at the end of a steady run of smaller hits that this one is no bigger than: then it's what's usual that drifted, and nothing dropped
    if (flow.counted && jump && flow.asked > 2.6 && (flow.grooved || flow.build > 0.35)) back = true;
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
    flow.clap = flow.rollHit = flow.riserGone = 0; // the band's three answers that are only there on the frame they land, beside the lead's and the tune's
    flow.leadHit = flow.tuneHit = flow.acidHit = 0;
    if (!heard) return; // paused: it stays as it was
    acidHear(dt); // whether a 303 line is squelching just now: flow.acid, acidAt and acidHit
    bandHear(dt, hit); // the ears for claps and rolls and for risers: flow.clap, clapOn, clapEvery, roll, rollRate, rollHit, riser, riserAt, riserGone and riserFor
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
    flow.steady = flow.gone < 1.4 ? flow.steady + dt : 0;
    if (flow.steady > 8) flow.grooved = true; // this song has been in its groove: from now on the kick coming back after a break is a drop // how long the song's own kick has been running. Past eight seconds it's in its groove, and highs that climb there (a hat coming in, a filter opening) aren't a build: nothing is being held back
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
  const FRACTALS = new Set(["julia", "mandel", "newton"]); // the three that share the card's top below, and with it colors that travel, after-images, breathing and a fold in the breaks
  const CARD_TOP = `#version 300 es
    precision highp float;
    uniform vec2 size; uniform vec3 toneA, toneB, toneC; uniform float light, time, glow;
    uniform vec4 roam;   // the colors that travel. x: how far along their way they are (rounds, 0..1), y: how far from home they may go (degrees), z: rounds of the way per round of the bands (so deeper is further on), w: how far the far colors have grown in along the stripes (0 none)
    uniform vec4 roam2;  // x: how far round the far colors are (degrees), y: how far the stripes push the bands along (rounds), z: how much the stripes shade, w: how much a turned color is brought back to the lightness it had (0..1)
    uniform vec4 breath; // x: the lens (over 0 the middle swells), y: the sway's size, z and w: where the sway is, across and up
    uniform vec4 folds;  // x: how far in the mirror has come (0 none, 1 through the middle), y: half the fan's opening (pi: open), z: how far the fold is turned, w: how far out the mirror starts
    uniform vec4 snap;   // what claps and a snare roll do: x, how far a clap has turned the picture (radians); y, how much it shivers; z, where the shiver is
    uniform vec4 thump;  // two rings going out from the middle, one for each of the last two hard kicks. x and z: how far out each has got, y and w: how far each pushes the picture where it is (0 none)
    out vec4 color;
    float stripe = 0.5; // set by a sum before it calls outside(): 0..1, which way round the middle the dot's last steps went
    vec2 mul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
    float way(vec2 z) { return 0.5 + z.x * z.y / max(dot(z, z), 1e-20); } // which way round the middle a step went: half the sine of twice its angle, 0..1
    void stripes(vec2 z, vec2 was, float part) { stripe = mix(way(z), way(was), clamp(part, 0.0, 1.0)); } // from the last place a dot's sum went through and the one before, by how far past the line the dot got: so there is no seam where the count changes
    vec2 spot() {
      vec2 p = (gl_FragCoord.xy * 2.0 - size) / size.y;
      if (snap.x != 0.0) { float c = cos(snap.x), s = sin(snap.x); p = vec2(p.x * c - p.y * s, p.x * s + p.y * c); } // a clap: the whole picture turned a little, folds and all
      if (folds.x > 0.0) { // a mirror that slides in from the edge, and then a fan of mirrors that closes: the picture is whole and sharp all the way
        float co = cos(folds.z), si = sin(folds.z), slide = (1.0 - folds.x) * folds.w;
        p = vec2(p.x * co + p.y * si, p.y * co - p.x * si);
        p.y = abs(p.y + slide) - slide;
        if (folds.y > 0.0 && folds.y < 3.14159) { float a = atan(p.y, p.x); a = abs(mod(a + folds.y, 2.0 * folds.y) - folds.y); p = length(p) * vec2(cos(a), sin(a)); }
        p = vec2(p.x * co - p.y * si, p.y * co + p.x * si);
      }
      if (thump.y + thump.w > 0.0) { float far = max(length(p), 1e-4), k1 = (far - thump.x) / 0.11, k2 = (far - thump.z) / 0.11; p -= p / far * (thump.y * exp(-k1 * k1) + thump.w * exp(-k2 * k2)); } // a hard kick's ring: the picture is pushed outward where the ring is, and falls back behind it
      p *= 1.0 - breath.x / (1.0 + 2.0 * dot(p, p)); // the breath: the middle swells and sinks with the bass, the edges nearly stay
      p += breath.y * sin(p.yx * 2.2 + breath.zw); // and a slow sway
      p += snap.y * sin(p.yx * 9.0 + snap.z); // and through a snare roll a shiver, finer and quicker
      return p;
    }
    vec3 turnHue(vec3 c, float degrees) { // round the color wheel about the grey in the middle, as turnHue() in the page does, and then most of the way back to the lightness it had: turned yellow would be a dark blue otherwise, and the picture would dim and brighten as the colors travel
      float k = radians(degrees), co = cos(k), m = (1.0 - co) / 3.0, q = sin(k) * 0.57735027; vec3 t = vec3(co + m, m - q, m + q), to = clamp(vec3(dot(c, t), dot(c, t.zxy), dot(c, t.yzx)), 0.0, 1.0), W = vec3(0.2126, 0.7152, 0.0722);
      return min(to * mix(1.0, min(dot(c, W) / max(dot(to, W), 0.04), 2.2), roam2.w), 1.0);
    }
    vec3 pal(float x) {
      float at = fract(x) * 3.0, f = smoothstep(0.0, 1.0, fract(at));
      vec3 p = at < 1.0 ? mix(toneA, toneB, f) : at < 2.0 ? mix(toneB, toneC, f) : mix(toneC, toneA, f);
      if (roam.y == 0.0 && roam.w == 0.0) return p;
      float turn = roam.y * sin(6.2831853 * (roam.x + roam.z * x)), far = roam.w > 0.0 ? smoothstep(0.95 - 0.6 * roam.w, 1.07 - 0.6 * roam.w, stripe) : 0.0; // on a leash round home; and the far colors grow in along the stripes like veins, whole where they are and not a grey half-way mix
      vec3 home = turnHue(p, turn);
      return far > 0.0 ? mix(home, turnHue(p, turn + roam2.x), far) : home;
    }
    vec4 lit(float x, float shade, float edge) { vec3 p = pal(x + roam2.y * (stripe - 0.5)); return vec4((p * shade * (1.0 + roam2.z * (2.0 * stripe - 1.0)) + mix(p, vec3(1.0), 0.6) * edge) * light, 1.0); } // the stripes push the bands along a little and shade them, lighter and darker about the middle so the picture is no darker over all
    vec4 outside(float x, float nu, float far, float e) { float soft = smoothstep(1.0, 6.0, e * size.y * 0.5), deep = 1.0 - exp(-far * 0.15); stripe = mix(0.5, stripe, smoothstep(0.25, 0.75, deep) * soft); return lit(x + time * 0.03, mix(0.7, 0.3 + 0.7 * abs(sin(nu * 3.14159265)), soft) * deep, glow / (1.0 + e * e * 4900.0)); } // (no stripes far from the set, where a stripe is a wedge across the picture, or where the bands are finer than a dot)
    vec4 inside(float near, float wild) { return lit(near * 0.9 + time * 0.03, 0.12 + 0.2 * abs(sin(near * 10.0 - time * 0.8)), glow * wild); }
    float wildness(vec2 dz, float big) { return smoothstep(4.0, 14.0, 0.5 * log(dot(dz, dz) + 1e-30) + big); }
`;
  /* Colors that travel, after-images, breathing, and a fold in the breaks: shared by the three fractals, worked out once a frame by trippyOn() and handed to the card (and to byHand).
     The colors: each mood's three tones swing round the color wheel on a leash about home, further along the deeper a band is, and a second set of far colors grows in along the stripes like
     veins and goes again; a drop throws them along. The breath: the middle of the picture swells and sinks with the bass, and it sways a little. The fold: through a break and a build a mirror
     slides in from the edge and then a fan of mirrors closes to a flower; the drop opens it again. The after-images: on each kick the picture leaves a copy of itself that swells, turns and fades. */
  const COLOR_ROAM = { // how far each mood's colors may go from home (degrees either side), seconds for there and back in a steady groove, rounds of the way per round of the bands, the far colors (degrees round from home) and how much of them may show, and how far a drop throws them along (a quarter of a round is from home to the end of the leash)
    "": { reach: 150, round: 120, deep: 0.3, far: 140, most: 0.7, jump: 0.25 }, // a record's own colors, or none: nearly the whole wheel
    psy: { reach: 60, round: 90, deep: 0.3, far: 120, most: 0.7, jump: 0.25 }, // already turning through the rainbow: this is on top
    euphoric: { reach: 70, round: 100, deep: 0.3, far: 110, most: 0.5, jump: 0.25 },
    acid: { reach: 26, round: 70, deep: 0.45, far: 200, most: 0.6, jump: 0.25 }, // yellow from orange to green, with violet let in along the stripes
    hard: { reach: 24, round: 70, deep: 0.45, far: 215, most: 0.5, jump: 0.25 }, // red from crimson to orange, with cold blue-green let in along the stripes
  };
  const trippy = { at: Math.random(), owed: 0, far: Math.random(), grown: 0, breath: 0.4, own: 0, seen: 0, wave: 0, fold: 0, turn: 0, kind: "", shutFor: 0, kickLight: 1, values: {}, stepped: -1, rings: [9, 0, 9, 0], ring: 0, acid: 0, sq: 0, sqMid: 0, rise: 0, snap: 0, snapTo: 0, shiver: 0, shake: 0 }; // acid to shake: what the 303, a riser, claps and a snare roll are doing to the picture just now // rings: for each of the last two hard kicks, the seconds since it and how hard it was
  const TRIPPY_OFF = { roam: [4, [0, 0, 0, 0]], roam2: [4, [0, 0, 0, 0]], breath: [4, [0, 0, 0, 0]], folds: [4, [0, Math.PI, 0, 0]], thump: [4, [0, 0, 0, 0]], snap: [4, [0, 0, 0, 0]] }; // what a picture is told when it did not ask for the trip this frame: nothing of it
  function trippyOn() { // once a frame, before a fractal is drawn: moves the colors, the breath and the fold on by the clock, and leaves what the card is told in trippy.values
    if (trippy.stepped === sound.t && trippy.values.roam) return; // (a frame can draw the picture twice, when the effect changes: once is enough)
    trippy.stepped = sound.t;
    const dt = Math.min(Math.max(sound.dt, 0), 0.1), R = COLOR_ROAM[mood] || COLOR_ROAM[""], K = T.color, B = T.breathe, pace = (0.35 + flow.intensity) * (1 + flow.build); // 1 in a steady groove, 0.6 in a break, up to 2.5 at the top of a build
    if (flow.dropHit) trippy.owed += R.jump; // a drop throws the colors along, over a second or so and not at once
    const pay = trippy.owed * (1 - Math.exp(-dt / 1.3));
    trippy.owed -= pay;
    trippy.at = (trippy.at + (dt * pace) / R.round + pay) % 1;
    trippy.far = (trippy.far + (dt * pace) / 47) % 1; // the far colors come and go on a round of their own, so the two never line up the same way twice running
    trippy.grown += (R.most * clamp(0.5 - 0.5 * Math.cos(TAU * trippy.far) + 0.6 * flow.drop + 0.5 * trippy.acid * T.sounds) - trippy.grown) * (1 - Math.exp(-dt / 0.7)); // (a 303 line brings the far colors in along their veins too)
    trippy.breath += (sound.bass - trippy.breath) * (1 - Math.exp(-dt / 0.4)); // the bass, followed slowly, and a slow breath of its own so a break is not still
    trippy.wave = (trippy.wave + dt * (0.2 + 0.5 * flow.intensity)) % TAU;
    const real = Math.min(0.1, Math.max(0, (realNow - (trippy.seen || realNow)) / 1000)); // the clock on the wall, which is what the song keeps time by (sound.dt runs slower in a calm part)
    const S = T.sounds, hear = Math.min(0.1, real), building = flow.part === "build" || flow.build > 0.35; // how much the picture answers particular sounds, and the wall clock they keep time by
    trippy.acid += ((flow.acid || 0) - trippy.acid) * (1 - Math.exp(-hear / 0.5)); // a 303 line: how surely one is playing, and where its squelch is, followed quickly, and its own middle, followed slowly
    trippy.sq += ((flow.acidAt || 0) - trippy.sq) * (1 - Math.exp(-hear / 0.08));
    trippy.sqMid += (trippy.sq - trippy.sqMid) * (1 - Math.exp(-hear / 1.5));
    const rising = (flow.riser || 0) > 0.5 && (flow.riserFor || 0) > 0.35; // a riser the ear is sure of: the picture swells toward you as it climbs, and lets go when it ends
    trippy.rise += ((rising ? flow.riserAt || 0 : 0) - trippy.rise) * (1 - Math.exp(-hear / (rising ? 0.3 : 0.4)));
    if ((flow.clap || 0) > 0 && (flow.clapOn || 0) >= 0.75) trippy.snapTo = (trippy.snapTo > 0 ? -0.075 : 0.075) * S; // a clap of a steady pattern: the picture's turn snaps a few degrees, one way and then the other, and eases back
    trippy.snap += (trippy.snapTo - trippy.snap) * (1 - Math.exp(-hear / 0.03));
    trippy.snapTo *= Math.exp(-hear / 0.22);
    trippy.shiver += ((building ? flow.roll || 0 : 0) - trippy.shiver) * (1 - Math.exp(-hear / 0.2)); // a snare roll, believed only through a build: the picture shivers, quicker as the roll speeds up
    trippy.shake = (trippy.shake + hear * Math.PI * Math.min(9, flow.rollRate || 6)) % TAU;
    const rings = trippy.rings, hard = mood === "hard" ? S : 0; // hardcore, gabber and their kin: every kick sends a ring out from the middle, which bends the picture as it passes
    rings[0] += real; rings[2] += real;
    if (hard > 0 && sound.kickHit > 0) { const i = (trippy.ring ^= 1) * 2; rings[i] = 0; rings[i + 1] = Math.min(1, sound.kickHit) * Math.min(1.5, hard); }
    const left1 = Math.max(0, 1 - rings[0] / 0.9), left2 = Math.max(0, 1 - rings[2] / 0.9); // a ring is gone in nine tenths of a second, by when it has passed the corners
    trippy.seen = realNow;
    trippy.own = (trippy.own + real * (flow.bpm ? (TAU * flow.bpm) / 480 : 0.8)) % TAU; // a breath of its own, one every two bars of the song: a steady bass gives the breath above nothing to follow
    const lens = Math.max(-0.3, Math.min(0.45, B * (0.55 * (trippy.breath - 0.4) + 0.13 * Math.sin(trippy.own)) + S * (0.3 * trippy.acid * (trippy.sq - trippy.sqMid) + 0.3 * trippy.rise))); // (the squelch opens and shuts the middle with the filter, a riser swells it; never so far that the middle turns inside out)
    if (trippy.fold === 0) trippy.kind = V.fold || ""; // the version's fold, taken only while none is showing
    const kind = trippy.kind, held = kind && (flow.part === "calm" || flow.part === "build");
    trippy.shutFor = held ? trippy.shutFor + dt : 0;
    const closing = held && trippy.shutFor < 45; // (music with no kick at all is one long break: there it opens again after three quarters of a minute, and stays open)
    trippy.fold = clamp(trippy.fold + (closing ? dt / 10 : -dt / 1.6)); // closes over ten seconds through a break and a build (the calm part: quicker, and the fan sweeps the picture round faster than anything else in it), opens in a second and a half when the drop lands
    trippy.turn += dt * 0.04 * trippy.fold;
    const upright = kind === "mirror" || kind === "quad", turn = upright ? Math.PI / 2 : trippy.turn, fanTo = { quad: 2, kal6: 3, kal8: 4 }[kind] || 1, mirror = eased(clamp(trippy.fold / 0.4)), fan = eased(clamp((trippy.fold - 0.4) / 0.6));
    trippy.kickLight = (1 - 0.55 * trippy.fold) * (1 - 0.25 * clamp(T.echo)) * (1 - 0.1 * clamp(B)); // the kick lights it less to pay for what the fold, the after-images and the breath add
    trippy.values = {
      roam: [4, [trippy.at, R.reach * K, R.deep, Math.min(0.75, trippy.grown * K)]], roam2: [4, [R.far, 0.1 * K, 0.35 * K, 0.7]], // (far colors never past 0.75, where they would cover a picture with no stripes)
      breath: [4, [lens, 0.03 * B, trippy.wave, trippy.wave * 0.73 + 1.3]],
      folds: [4, [mirror, Math.PI * Math.pow(fanTo, -fan), turn, Math.abs(Math.cos(turn)) + (w / h) * Math.abs(Math.sin(turn))]],
      snap: [4, [trippy.snap, 0.012 * S * trippy.shiver, trippy.shake, 0]],
      thump: [4, [rings[0] * 2.4, 0.1 * rings[1] * left1 * left1 * Math.min(1, rings[0] / 0.06), rings[2] * 2.4, 0.1 * rings[3] * left2 * left2 * Math.min(1, rings[2] / 0.06)]], // (a ring swells up over its first moments: at full strength from nothing it is a bubble popping up in the middle)
    };
  }
  const afterImages = { ghosts: [], last: -9, rate: 0, span: 0, mid: null, due: false }; // up to four small copies of the picture as it was when a kick landed, when the last was taken, and how fast the picture flows outwards
  function echoes(span, hand) { // after a fractal is drawn. Just after a kick the picture leaves a copy of itself (in a break, one every second and a half), drawn over the canvas a little bigger and further round the older it is,
    // and fainter, with "lighten": the new picture is never dulled or blurred, an after-image only shows where it is brighter than what is there now, and at the moment one is left nothing changes (it is the same picture).
    // Nothing is fed back into itself. span: how big the view is now, from which comes how fast the picture flows outwards, for the after-images to ride on. hand: no graphics card, so it is put together small and stretched once
    const A = afterImages, dt = Math.min(Math.max(sound.dt, 0), 0.1), t = sound.t, fast = clamp(Math.max(0, A.rate) / 1.5), show = 0.5 * T.echo * (1 - 0.5 * fast); // (fast: the picture itself is flowing by quickly, and after-images on top of that are a smear: they show less and push ahead less)
    if (span > 0) { if (A.span > 0 && dt > 0) { const d = Math.log(A.span / span); if (Math.abs(d) < Math.max(0.03, 3.5 * dt)) A.rate = Math.max(-3, Math.min(3, A.rate + (d / dt - A.rate) * (1 - Math.exp(-dt / 0.5)))); } A.span = span; } // (a wrap or a swap changes the numbers and not the picture: let go)
    if (!(show > 0)) { A.ghosts.length = 0; return; }
    let onto = g, W = w, H = h;
    if (hand) { const MW = 256, MH = Math.max(2, Math.round((256 * h) / w)); if (!A.mid || A.mid.width !== MW || A.mid.height !== MH) A.mid = paper(MW, MH)[0]; onto = A.mid.getContext("2d"); onto.setTransform(1, 0, 0, 1, 0, 0); onto.globalCompositeOperation = "source-over"; onto.globalAlpha = 1; onto.drawImage(g.canvas, 0, 0, MW, MH); W = MW; H = MH; }
    const calm = clamp(1.4 - 2 * flow.intensity), life = 1.5 * (1 + 0.8 * calm), ew = Math.max(2, Math.round(W * 0.5)), eh = Math.max(2, Math.round(H * 0.5));
    if (t < A.last) A.last = -9; // the clock went back
    const oldest = A.ghosts[0], free = A.ghosts.length < 4 || t - oldest.born > 0.9 * oldest.life || t < oldest.born; // a new one only when there is a paper spare or the oldest has faded right out, so none is cut off while it shows
    if (sound.kickHit > 0) A.due = true; // a kick asks for a copy, and it is taken once the kick has died down: on the hit the picture is at its brightest and most swollen, and a copy of that held over the resting picture is a haze, not an echo
    if (free && ((A.due && sound.kick < 0.3 && t - A.last > life / 4) || t - A.last > 1.4)) {
      A.due = false;
      let ghost = A.ghosts.length < 4 ? null : A.ghosts.shift();
      if (!ghost || ghost.c.width !== ew || ghost.c.height !== eh) { const [c, x] = paper(ew, eh); ghost = { c, x }; }
      ghost.x.globalCompositeOperation = "source-over"; ghost.x.globalAlpha = 1;
      ghost.x.drawImage(onto.canvas, 0, 0, ew, eh);
      ghost.x.globalCompositeOperation = "destination-in"; // its edges fade out, so a copy that has turned a little never shows a straight edge across the picture
      for (const [x1, y1] of [[ew, 0], [0, eh]]) { const soft = ghost.x.createLinearGradient(0, 0, x1, y1); soft.addColorStop(0, "rgba(0,0,0,0)"); soft.addColorStop(0.14, "#000"); soft.addColorStop(0.86, "#000"); soft.addColorStop(1, "rgba(0,0,0,0)"); ghost.x.fillStyle = soft; ghost.x.fillRect(0, 0, ew, eh); }
      ghost.x.globalCompositeOperation = "source-over";
      Object.assign(ghost, { born: t, life, grow: 0, turn: 0, cut: false, fade: 1 }); // (it keeps the life it was born with: a break lengthens the next ones, not this one)
      A.ghosts.push(ghost);
      A.last = t;
    }
    if (flow.dropHit) for (const ghost of A.ghosts) ghost.cut = true; // a drop is a new picture: the old one's after-images are let go within half a second, or they would lie over it like fog
    onto.save();
    onto.globalCompositeOperation = "lighten"; onto.imageSmoothingEnabled = true;
    for (const ghost of A.ghosts) {
      if (ghost.cut) ghost.fade *= Math.exp(-dt / 0.2);
      ghost.grow += (Math.max(0, A.rate) + 0.3 * (1 - 0.7 * fast) * (0.5 + flow.intensity + 1.2 * flow.drop)) * dt; // with the picture's own flow outwards, and a little ahead of it; quicker just after a drop. (While the journey backs out they keep growing slowly: a copy shrinking into the middle is a picture in a picture)
      ghost.turn += 0.12 * dt;
      const left = 1 - (t - ghost.born) / ghost.life;
      if (left <= 0 || left > 1) continue;
      const k = Math.exp(Math.max(-4, Math.min(4, ghost.grow))), co = k * Math.cos(ghost.turn), si = k * Math.sin(ghost.turn);
      onto.globalAlpha = Math.min(1, show * left * left * ghost.fade);
      onto.setTransform(co, si, -si, co, W / 2, H / 2);
      onto.drawImage(ghost.c, -W / 2, -H / 2, W, H);
    }
    onto.restore();
    if (hand) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.imageSmoothingEnabled = true; g.drawImage(A.mid, 0, 0, w, h); g.restore(); }
  }
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
  function onCard(key, body, values, alpha = 1, wide = 1280) { // draws one of them with the graphics card, a triangle over the whole picture; false when it can't, and then it's worked out by hand. alpha: how solid, for one picture fading into another. wide: the most dots across, less for a sum that costs more than it shows
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
    const across = Math.max(2, Math.round(Math.min(w, wide))), down = Math.max(2, Math.round((across * h) / w)), tones = moodColors(3);
    if (card.c.width !== across || card.c.height !== down) { card.c.width = across; card.c.height = down; }
    gl.viewport(0, 0, across, down);
    gl.useProgram(made.program);
    const all = { size: [2, [across, down]], light: [1, [0.6 + 0.5 * sound.kick * trippy.kickLight + 0.2 * flow.drop]], time: [1, [sound.t]], glow: [1, [V.glow ?? 1]], toneA: [3, tones[0].map((v) => v / 255)], toneB: [3, tones[1].map((v) => v / 255)], toneC: [3, tones[2].map((v) => v / 255)], ...(trippy.stepped === sound.t ? trippy.values : TRIPPY_OFF), ...values }; // (the trip's numbers only for a picture that asked for them this frame)
    for (const k in all) { const at = k in made.at ? made.at[k] : (made.at[k] = gl.getUniformLocation(made.program, k)); if (at) gl["uniform" + all[k][0] + "fv"](at, all[k][1]); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = true;
    g.globalAlpha = alpha;
    g.drawImage(card.c, 0, 0, w, h);
    g.globalAlpha = 1;
    return true;
  }
  const hueHome = [0, 0, 0], HUE_ROUNDS = 20, HUE_STEPS = 64, hueTable = new Float32Array(HUE_ROUNDS * HUE_STEPS * 6); // by hand the travelling colors are looked up: the home color and the far color for every 64th of a round of the bands, over twenty rounds, which is where the bands and the colors' way round both come back to where they started (so a mood's "deep" has to be a twentieth of something)
  function turnedHue(r, gr, b, degrees, sameLight, out) { // the card's turnHue(): round the wheel about grey, then most of the way back to the lightness it had. Colors here are 0..255, and the answer goes into out (nothing is made anew for every dot)
    const k = (degrees * Math.PI) / 180, co = Math.cos(k), m = (1 - co) / 3, q = Math.sin(k) * 0.57735027, same = co + m, back = m - q, on = m + q;
    const t0 = clamp((r * same + gr * back + b * on) / 255) * 255, t1 = clamp((r * on + gr * same + b * back) / 255) * 255, t2 = clamp((r * back + gr * on + b * same) / 255) * 255;
    const was = 0.2126 * r + 0.7152 * gr + 0.0722 * b, now = 0.2126 * t0 + 0.7152 * t1 + 0.0722 * t2, f = 1 + (Math.min(was / Math.max(now, 0.04 * 255), 2.2) - 1) * sameLight;
    out[0] = Math.min(255, t0 * f); out[1] = Math.min(255, t1 * f); out[2] = Math.min(255, t2 * f);
  }
  function byHand(sum, light = 0.6 + 0.5 * sound.kick * trippy.kickLight + 0.2 * flow.drop, tones = moodColors(3), alpha = 1) { // the same sum worked out here for a small picture: sum(across, up, dot) says how far round the colors a dot is, how bright, and how much of the edge's glow it has. The fold, the breath and the colors that travel are done here per dot as the card does them
    const W = 128, H = Math.max(32, Math.round((128 * h) / w));
    if (!card.art || card.art.W !== W || card.art.H !== H) { const [c, x] = paper(W, H); card.art = { W, H, c, x, img: x.createImageData(W, H) }; }
    const d = card.art.img.data, dot = { x: 0, shade: 0, edge: 0, stripe: 0.5, half: H / 2, t: sound.t, glow: V.glow ?? 1 }, z4 = [0, 0, 0, 0], tv = trippy.stepped === sound.t ? trippy.values : TRIPPY_OFF;
    const [hueAt, reach, deep, grownTo] = (tv.roam || [0, z4])[1], [farTurn, pullBy, shadeAs, sameLight] = (tv.roam2 || [0, z4])[1], grown = grownTo * 0.5, pull = pullBy * 0.5, shadeBy = shadeAs * 0.5, // (the stripes do half as much here: on a picture this coarse they are finer than a dot, and came out as speckle)
      [lens, wave, waveX, waveY] = (tv.breath || [0, z4])[1], [mirror, fan, turn, far] = (tv.folds || [0, z4])[1], [ring1, push1, ring2, push2] = (tv.thump || [0, z4])[1], [snapTurn, shiver, shake] = (tv.snap || [0, z4])[1], snapCo = Math.cos(snapTurn), snapSi = Math.sin(snapTurn);
    const co = Math.cos(turn), si = Math.sin(turn), slide = (1 - mirror) * far, plain = !reach && !grown;
    if (!plain) for (let i = 0, o = 0; i < HUE_ROUNDS * HUE_STEPS; i++, o += 6) { // the card's pal(), once for each place round the bands: on a leash round home, and the far colors beside it
      const X = (i + 0.5) / HUE_STEPS, pos = (X - Math.floor(X)) * 3, a = Math.floor(pos) % 3, f = eased(pos - Math.floor(pos)), c1 = tones[a], c2 = tones[(a + 1) % 3], home = reach * Math.sin(TAU * (hueAt + deep * X));
      const p0 = c1[0] + (c2[0] - c1[0]) * f, p1 = c1[1] + (c2[1] - c1[1]) * f, p2 = c1[2] + (c2[2] - c1[2]) * f;
      turnedHue(p0, p1, p2, home, sameLight, hueHome);
      hueTable[o] = hueHome[0]; hueTable[o + 1] = hueHome[1]; hueTable[o + 2] = hueHome[2];
      if (grown > 0) turnedHue(p0, p1, p2, home + farTurn, sameLight, hueHome);
      hueTable[o + 3] = hueHome[0]; hueTable[o + 4] = hueHome[1]; hueTable[o + 5] = hueHome[2];
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let u = ((i + 0.5) * 2 - W) / H, v = (H - (j + 0.5) * 2) / H;
      if (snapTurn) { const su = u * snapCo - v * snapSi; v = u * snapSi + v * snapCo; u = su; } // a clap's turn, as the card does it
      if (mirror > 0) { // the card's spot(): the mirror that slides in, then the fan
        let a = u * co + v * si, b = Math.abs(v * co - u * si + slide) - slide;
        if (fan > 0 && fan < 3.14159) { const r = Math.hypot(a, b), at = Math.atan2(b, a) + fan, ang = Math.abs(at - 2 * fan * Math.floor(at / (2 * fan)) - fan); a = r * Math.cos(ang); b = r * Math.sin(ang); }
        u = a * co - b * si; v = b * co + a * si;
      }
      if (push1 + push2 > 0) { const out = Math.hypot(u, v) || 1e-4, k1 = (out - ring1) / 0.11, k2 = (out - ring2) / 0.11, push = (push1 * Math.exp(-k1 * k1) + push2 * Math.exp(-k2 * k2)) / out; u -= u * push; v -= v * push; } // a hard kick's ring, as the card does it
      const lensed = 1 - lens / (1 + 2 * (u * u + v * v)), lu = u * lensed, lv = v * lensed; // the breath, then the sway
      dot.stripe = 0.5;
      const su = lu + wave * Math.sin(lv * 2.2 + waveX), sv = lv + wave * Math.sin(lu * 2.2 + waveY);
      sum(shiver ? su + shiver * Math.sin(sv * 9 + shake) : su, shiver ? sv + shiver * Math.sin(su * 9 + shake) : sv, dot); // (and a snare roll's shiver)
      const X = dot.x + pull * (dot.stripe - 0.5), pos = (X - Math.floor(X)) * 3, a = Math.floor(pos) % 3, f = eased(pos - Math.floor(pos)), c1 = tones[a], c2 = tones[(a + 1) % 3], o = (j * W + i) * 4;
      let p0 = c1[0] + (c2[0] - c1[0]) * f, p1 = c1[1] + (c2[1] - c1[1]) * f, p2 = c1[2] + (c2[2] - c1[2]) * f;
      if (!plain) { // the colors as they are just now at this place round the bands, with the far colors grown in along the stripes
        const at = (Math.floor((X - HUE_ROUNDS * Math.floor(X / HUE_ROUNDS)) * HUE_STEPS) % (HUE_ROUNDS * HUE_STEPS)) * 6, into = grown > 0 ? eased(clamp((dot.stripe - (0.95 - 0.6 * grown)) / 0.12)) : 0;
        p0 = hueTable[at] + (hueTable[at + 3] - hueTable[at]) * into; p1 = hueTable[at + 1] + (hueTable[at + 4] - hueTable[at + 1]) * into; p2 = hueTable[at + 2] + (hueTable[at + 5] - hueTable[at + 2]) * into;
      }
      const shade = dot.shade * (1 + shadeBy * (2 * dot.stripe - 1)), edge = dot.edge;
      d[o] = (p0 * shade + (p0 + (255 - p0) * 0.6) * edge) * light; d[o + 1] = (p1 * shade + (p1 + (255 - p1) * 0.6) * edge) * light; d[o + 2] = (p2 * shade + (p2 + (255 - p2) * 0.6) * edge) * light;
      d[o + 3] = 255;
    }
    card.art.x.putImageData(card.art.img, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = true;
    g.globalAlpha = alpha;
    g.drawImage(card.art.c, 0, 0, w, h);
    g.globalAlpha = 1;
  }
  const wayRound = (x, y) => 0.5 + (x * y) / Math.max(x * x + y * y, 1e-20); // the card's way(): which way round the middle a step went
  const dotOutside = (dot, x, nu, far, e) => { const soft = eased(clamp((e * dot.half - 1) / 5)), deep = 1 - Math.exp(-far * 0.15); dot.stripe = 0.5 + (dot.stripe - 0.5) * eased(clamp((deep - 0.25) / 0.5)) * soft; dot.x = x + dot.t * 0.03; dot.shade = (0.7 + (0.7 * Math.abs(Math.sin(nu * Math.PI)) - 0.4) * soft) * (1 - Math.exp(-far * 0.15)); dot.edge = dot.glow / (1 + e * e * 4900); }; // off the set: bands that count the steps it took to get away, and a glow where the set is near
  const dotInside = (dot, near, wild) => { dot.x = near * 0.9 + dot.t * 0.03; dot.shade = 0.12 + 0.2 * Math.abs(Math.sin(near * 10 - dot.t * 0.8)); dot.edge = dot.glow * eased(clamp((Math.log(wild + 1e-30) - 4) / 10)); }; // never got away: dim rings by how near the middle it ever came, and the edge's glow where its neighbours were flying apart (wild is how fast), which is the set's edge and not its body
  /* The Julia set that travels. The camera never rests: in from the whole set to the middle of its spirals, and before that middle turns into a blob, across to another spiral off to one side
     and into that one. That spiral is a small copy of the one it left, so when it fills the picture the same view is there again and the next is picked: for as long as the song lasts.
     A drop pulls the camera back out to the whole set, which puffs to dust, slides round to another shape, and the journey starts again from there.
     Words used below. z0 is the resting place of the sum that only just fails to hold: the middle of the spirals. Every other spiral middle p is a point the sum sends onto z0 after k steps,
     and near p those k steps are nearly a plain scale-and-turn by D, their slope at p. "Nearly" would show as a jump, so the card is given a dial, blend: at 0 it draws the true picture about p,
     at 1 the picture about z0 through that plain scale-and-turn, which is number for number what a view about z0 itself draws. A flight turns the dial up over its last part and then swaps one
     for the other with nothing to see. Lengths are kept as they will be after the swap ("eq" lengths: true lengths times the size of D), so the swap changes none of the camera's numbers. */
  const JULIA_PATH = 64, JULIA_REACH = 60; // how much of a target's own path the card is handed, and the most steps a flight's target may be from z0
  const JULIA_SUM = `
    uniform vec2 orbit[${JULIA_PATH}], c, view, shift, jump; uniform float power, reach, blend, ahead, tall, pen, limit, wide;
    void main() {
      vec2 e = shift + mul(spot(), view), lin = mul(jump, e), dz = vec2(1.0, 0.0), z = orbit[0] + e;
      float trap = 1e9, n = -1.0, m2 = 0.0, big = 0.0;
      int k = int(reach);
      vec2 was = z; // (the place before the last, for the stripes)
      for (int i = 0; i < 200; i++) {
        if (float(i) >= limit) break;
        was = z;
        if (i < k) {
          vec2 Z = orbit[i], w = Z + e, w2 = mul(w, w), Z2 = mul(Z, Z);
          dz = power * mul(power < 2.5 ? w : power < 3.5 ? w2 : mul(w2, w), dz);
          e = mul(power < 2.5 ? 2.0 * Z + e : power < 3.5 ? 3.0 * Z2 + mul(3.0 * Z + e, e) : 4.0 * mul(Z2, Z) + mul(6.0 * Z2 + mul(4.0 * Z + e, e), e), e);
          if (i == k - 1 && big == 0.0) { e = mix(e, lin, blend); dz = mix(dz, jump, blend); }
          z = orbit[i + 1] + e;
        } else {
          vec2 z2 = mul(z, z), p = power < 2.5 ? z : power < 3.5 ? z2 : mul(z2, z);
          dz = power * mul(p, dz);
          z = mul(p, z) + c;
        }
        if (dot(dz, dz) > 1e20) { dz *= 1e-10; big += 23.02585; }
        m2 = dot(z, z);
        trap = min(trap, i < k ? m2 + pen : m2);
        if (m2 > 1e4) { n = float(i); break; }
      }
      vec4 on = inside(sqrt(trap), wildness(dz, big + log(tall / 1.7)));
      if (n < 0.0) { color = on; return; }
      float part = log(log(m2) / 9.2103) / log(power), nu = n + 1.0 - part;
      stripes(z, was, part);
      color = mix(outside((nu + ahead) * 0.045, nu, nu - blend * reach + 8.0 * wide, exp(log(sqrt(m2) * 0.5 * log(m2)) - log(length(dz)) - big) / tall), on, clamp(nu - limit + 1.0, 0.0, 1.0)); // (+ wide: seen from far off the dots that get away at once are most of the picture, and are not left nearly black)
    }
`;
  const juliaWays = (() => {
    function nums(at, r, n = 2) { // as julia() in effects.js: mu = r e^(i at), z0 = (mu / n)^(1 / (n - 1)), c = z0 (1 - mu / n)
      const m = (r / n) ** (1 / (n - 1)), a = at / (n - 1), zx = m * Math.cos(a), zy = m * Math.sin(a), kx = 1 - (r / n) * Math.cos(at), ky = -(r / n) * Math.sin(at);
      return { n, r, at, zx, zy, cx: zx * kx - zy * ky, cy: zx * ky + zy * kx };
    }
    function power(x, y, n) { let px = x, py = y; for (let j = 1; j < n; j++) { const t = px * x - py * y; py = px * y + py * x; px = t; } return [px, py]; } // z^n
    function forward(x, y, q) { const [px, py] = power(x, y, q.n); return [px + q.cx, py + q.cy]; }
    function roots(x, y, q) { // every w with w^n + c = (x, y)
      const dx = x - q.cx, dy = y - q.cy, m = Math.hypot(dx, dy) ** (1 / q.n), a = Math.atan2(dy, dx) / q.n, out = [];
      for (let j = 0; j < q.n; j++) out.push([m * Math.cos(a + (j * TAU) / q.n), m * Math.sin(a + (j * TAU) / q.n)]);
      return out;
    }
    function back(x, y, q, gx, gy) { let best = null, far = 1e99; for (const w of roots(x, y, q)) { const d = (w[0] - gx) ** 2 + (w[1] - gy) ** 2; if (d < far) { far = d; best = w; } } return best; } // the one of them nearest (gx, gy)
    function slope(orbit, k, n) { // D = (f^k)'(p) = product of n z^(n-1) along the orbit
      let dx = 1, dy = 0;
      for (let j = 0; j < k; j++) { const [px, py] = n > 2 ? power(orbit[j * 2], orbit[j * 2 + 1], n - 1) : [orbit[j * 2], orbit[j * 2 + 1]], t = n * (px * dx - py * dy); dy = n * (px * dy + py * dx); dx = t; }
      return [dx, dy];
    }
    function orbitFrom(px, py, k, q, orbit) { let x = px, y = py; for (let j = 0; j < k; j++) { orbit[j * 2] = x; orbit[j * 2 + 1] = y; [x, y] = forward(x, y, q); } orbit[k * 2] = q.zx; orbit[k * 2 + 1] = q.zy; return Math.hypot(x - q.zx, y - q.zy); } // p's path to z0; returns how far the k-th point missed z0 by
    function retrack(orbit, k, q) { // c has moved a little: the same target for the new c, found by running the sum backwards from the new z0, each time taking the root nearest where that point was
      let x = q.zx, y = q.zy; orbit[k * 2] = x; orbit[k * 2 + 1] = y;
      for (let j = k - 1; j >= 0; j--) { [x, y] = back(x, y, q, orbit[j * 2], orbit[j * 2 + 1]); orbit[j * 2] = x; orbit[j * 2 + 1] = y; }
    }
    function targets(q, depth = q.n > 3 ? 2 : q.n > 2 ? 3 : 4) { // spiral middles: points the sum sends onto z0. A few from far away (every choice of root, `depth` steps back), and each of those carried in towards z0 by the root nearest z0, step after step
      const far = [];
      let level = roots(q.zx, q.zy, q).filter((w) => Math.hypot(w[0] - q.zx, w[1] - q.zy) > 1e-9).map((w) => ({ x: w[0], y: w[1], k: 1 }));
      far.push(...level);
      for (let d = 2; d <= depth; d++) { const next = []; for (const p of level) for (const w of roots(p.x, p.y, q)) next.push({ x: w[0], y: w[1], k: p.k + 1 }); far.push(...next); level = next; }
      const all = [];
      for (const f of far) { let x = f.x, y = f.y; for (let k = f.k; k <= JULIA_REACH; k++) { all.push({ x, y, k }); [x, y] = back(x, y, q, q.zx, q.zy); } }
      return all;
    }
    const TUNE = { r: 1.09, wide: [0, 0, 1.25, 1.1, 1.0], arrive: [0.13, 0.2], morphFrom: 0.3, steps: 100, stepsByHand: 64, swirl: 0.15, pull: 2.4, glide: 1.2, bass: 0.06, dust: [0, 0, 0.56, 0.72, 0.88], cusp: [0, 0, 0.6, 0.85, 0.95], breath: 0.03, clear: [0, 0, 0.12, 0.25, 0.3] };
    function travel(n) { // the journey for one power of the set: what it keeps between frames, and step(), which moves it on and says what this frame shows
      const U = { ...TUNE, dust: TUNE.dust[n], cusp: TUNE.cusp[n], clear: TUNE.clear[n] }, between = rnd, wideSpan = U.wide[n];
      const J = { n, at: rnd(0, TAU), r: U.r, mode: "wide", wait: 2.5, anchor: 0, k: 0, orbit: new Float64Array(JULIA_PATH * 2), sent: new Float32Array(JULIA_PATH * 2), jx: 1, jy: 0, ox: 0, oy: 0, ls: Math.log(wideSpan), turn: 0, a: 0, pen: 0, soft: 0, ahead: 0, fl: null, pl: null, rSlow: U.r + U.dust, touchy: 0, puff: 0, deep: 3, glide: 0, way: 1, asked: -9, still: false, pulse: 0, glow: 0, hue: 0, hueTo: 0, clock: 0, pulledAt: -99, glidAt: 0, gentle: false, next: null };
      let q = nums(J.at, J.r, n);
      const open = (at) => { if (at < U.cusp || at > TAU - U.cusp) return false; for (let j = 0; j < 68; j++) { const c = nums(at, j < 28 ? U.r - 0.035 + 0.065 * (j / 27) : U.r + 0.03 + (U.dust - 0.03) * ((j - 27) / 40), n); let x = 0, y = 0, away = false; for (let i = 0; i < 45 && !away; i++) { [x, y] = forward(x, y, c); away = x * x + y * y > 16; } if (!away) return false; } return true; }; // is the set dust there (the middle point gets away within 45 steps), even when r is at its least?
      J.at = Math.max(U.cusp, Math.min(TAU - U.cusp, ((J.at % TAU) + TAU) % TAU));
      const elsewhere = () => { let spare = J.at; for (let i = 0; i < 200; i++) { const to = between(U.cusp, TAU - U.cusp), far = Math.abs(to - J.at); if (far < 0.3 || !open(to)) continue; if (far > 0.8 && far < 2.4) return to - J.at; spare = to; } return spare - J.at; }; // how far to glide to get to another shape
      for (let i = 0; i < 300 && !open(J.at); i++) J.at = between(U.cusp, TAU - U.cusp);
      const leave = (gentle) => { J.mode = "pull"; J.pl = null; J.pullFor = 0; J.glide = elsewhere(); J.gentle = gentle; J.pulledAt = J.glidAt = J.clock; J.next = null; }; // out to the whole set and round to another shape: hard on a drop, gently when the scenery has been the same for a minute
      const view = () => { const s = Math.exp(J.ls); return [s * Math.cos(J.turn), s * Math.sin(J.turn)]; };
      const over = (ax, ay, bx, by) => { const d = bx * bx + by * by; return [(ax * bx + ay * by) / d, (ay * bx - ax * by) / d]; }; // a / b
      const anchorAt = () => (J.anchor === 0 ? [0, 0] : J.anchor === 1 ? [q.zx, q.zy] : [J.orbit[0], J.orbit[1]]);

      const nudged = new Float64Array(JULIA_PATH * 2);
      function touchy(orbit, k) { // |d log D| per unit of dr / r and per unit of d(at), the larger
        const [dx, dy] = slope(orbit, k, n), e = 1e-5; let most = 0;
        for (const q2 of [nums(J.at, J.r + e * J.r, n), nums(J.at + e, J.r, n)]) { nudged.set(orbit); retrack(nudged, k, q2); const [ex, ey] = slope(nudged, k, n), [qx, qy] = over(ex, ey, dx, dy); most = Math.max(most, Math.hypot(Math.log(Math.hypot(qx, qy)), Math.atan2(qy, qx)) / e); }
        return most;
      }
      function pick(aspect, ls = J.ls, ox = J.ox, oy = J.oy) { // the next place to fly to: a spiral middle that is in the picture (as it is now, or as it will be: ls is the size of the view asked about, ox and oy its middle from z0), off to one side, and between 6 and 45 times smaller than the one in the middle
        const size0 = Math.exp(ls), vx = size0 * Math.cos(J.turn), vy = size0 * Math.sin(J.turn), cx = q.zx + ox, cy = q.zy + oy, wide = 0.85 * Math.min(aspect, 1.5), spare = new Float64Array(JULIA_PATH * 2), good = [], fair = [];
        for (const p of targets(q)) {
          const [sx, sy] = over(p.x - cx, p.y - cy, vx, vy), d = Math.hypot(sx, sy);
          if (d < 0.3 || Math.abs(sx) > wide || Math.abs(sy) > 0.85) continue;
          if (orbitFrom(p.x, p.y, p.k, q, spare) > 1e-6) continue;
          let least = 9; for (let j = 0; j < p.k; j++) least = Math.min(least, Math.hypot(spare[j * 2], spare[j * 2 + 1]));
          if (least < U.clear) continue;
          const [dx, dy] = slope(spare, p.k, n), size = Math.hypot(dx, dy);
          if (touchy(spare, p.k) > 3 * p.k + 15) continue; // thrown about by the least change of c
          if (size >= 6 && size <= 45) good.push(p); else if (size >= 3 && size <= 150) fair.push(p);
        }
        const from = good.length ? good : fair;
        if (from.length) return from[Math.floor(Math.random() * from.length)];
        return { x: q.zx, y: q.zy, k: Math.min(JULIA_REACH, Math.round(Math.log(12) / Math.log(q.r))) }; // none: straight down the middle of this spiral, which comes round the same every step
      }
      function begin(p) { // from a view about z0 to a flight towards p: the camera's numbers are turned into eq lengths, which the picture does not notice
        const zx = q.zx + J.ox - p.x, zy = q.zy + J.oy - p.y; // the middle of the picture, from p
        orbitFrom(p.x, p.y, p.k, q, J.orbit);
        const [dx, dy] = slope(J.orbit, p.k, n), size = Math.hypot(dx, dy);
        J.anchor = 2; J.k = p.k; J.jx = dx; J.jy = dy;
        J.ox = dx * zx - dy * zy; J.oy = dx * zy + dy * zx; J.ls += Math.log(size); J.turn += Math.atan2(dy, dx);
        const [vx, vy] = view(), [ux, uy] = over(J.ox, J.oy, vx, vy), ls1 = Math.log(between(U.arrive[0], U.arrive[1])), lsA = Math.min(Math.log(U.morphFrom), J.ls - 0.5);
        J.fl = { ls0: J.ls, ls1, lsA, ux, uy, uc: (J.ls - lsA) / (J.ls - ls1), deep0: Math.log(1.6 / Math.exp(J.ls - Math.log(size))) / Math.log(J.r) };
        J.touchy = touchy(J.orbit, p.k);
        J.hueTo = Math.max(-22, Math.min(22, J.hueTo + between(-22, 22))); // every flight turns the colors a little
      }
      function ahead(aspect, ls) { // the next place, chosen a second or so before the swap (it takes several thousandths of a second, which would be a late frame right on the seam): its own path is kept, and followed as c moves on
        const p = pick(aspect, ls, 0, 0), orbit = new Float64Array(JULIA_PATH * 2);
        orbitFrom(p.x, p.y, p.k, q, orbit);
        return { k: p.k, orbit };
      }
      function arrive(aspect) { // the swap: by now the picture is drawn wholly from the straightened view (a = 1), which is exactly the view about z0 with the same camera numbers
        if (J.anchor === 2) J.ahead = (J.ahead + J.k) % 200;
        J.anchor = 1; J.k = 0; J.jx = 1; J.jy = 0; J.a = 0; J.pen = 0; J.soft = 0;
        const next = J.next; J.next = null;
        if (next) retrack(next.orbit, next.k, q); // the same spiral for c as it is now
        begin(next ? { x: next.orbit[0], y: next.orbit[1], k: next.k } : pick(aspect));
      }
      function toWhole() { // any view to the same view measured from the origin in true lengths (only ever done where the picture is drawn truly: a = 0)
        const [ax, ay] = anchorAt(), [ex, ey] = over(J.ox, J.oy, J.jx, J.jy), size = Math.hypot(J.jx, J.jy);
        J.ox = ax + ex; J.oy = ay + ey; J.ls -= Math.log(size); J.turn -= Math.atan2(J.jy, J.jx);
        J.anchor = 0; J.k = 0; J.jx = 1; J.jy = 0; J.a = 0; J.pen = 0; J.soft = 0; J.fl = null;
      }

      function step(sound, flow, aspect, byHand, spin) {
        const dt = Math.min(Math.max(sound.dt, 0), 0.1), kick = sound.kick, calm = flow.calm, wideSpan = U.wide[n] * Math.min(1.6, Math.max(1, 0.9 / aspect));
        if (!J.clock) J.ls = Math.log(wideSpan);
        J.clock += dt;
        // the set's shape: r nearer 1 through a build (finer, more arms), a little over in a break (airier); the bass puffs it a little; the kick no longer does
        const wideNow = clamp((Math.exp(J.ls) / Math.hypot(J.jx, J.jy) - 0.3) / 0.6), puffed = J.mode === "wide" && J.glide ? 1 : J.mode === "pull" && J.anchor === 0 ? wideNow * wideNow : 0, rTo = U.r - 0.025 * flow.build + 0.02 * calm + U.dust * puffed;
        const rStep = (rTo - J.rSlow) * (1 - Math.exp(-dt / (puffed || J.mode === "wide" ? 0.35 : 0.8))), rMost = puffed || J.mode === "wide" ? 9 : ((J.anchor === 2 ? 0.35 : 1) * J.rSlow * dt) / J.deep;
        J.rSlow += Math.max(-rMost, Math.min(rMost, rStep));
        J.puff += (sound.bass - 0.5 - J.puff) * (1 - Math.exp(-dt / 0.25));
        J.r = J.rSlow + (U.bass * J.rSlow * J.puff) / J.deep;
        // how many steps a dot of this view takes to leave: each of them turns the dot's surroundings by however much "at" moved, so "at" moves that many times slower
        const deep = J.deep = Math.max(1.5, J.anchor === 2 ? Math.max(J.fl.deep0, (1 - J.a) * J.touchy) : 0, (1 - J.a) * J.k + Math.log(1.6 / Math.exp(J.ls)) / Math.log(J.r));
        if (Math.abs(J.at - J.asked) > 0.002) { J.asked = J.at; if (!open(J.at + J.way * 0.02)) { J.way = -J.way; J.still = !open(J.at + J.way * 0.02); } else J.still = false; } // asked again only when it has moved
        if (!J.still) J.at += (J.way * dt * U.swirl * (0.4 + flow.intensity) * (1 + flow.build)) / deep;
        if (J.mode === "wide" && J.glide) { const g = Math.sign(J.glide) * Math.min(Math.abs(J.glide), U.glide * dt * clamp((J.rSlow - U.r - 0.92 * U.dust) / (0.06 * U.dust))); J.at += g; J.glide -= g; if (Math.abs(J.glide) < 1e-9) { J.glide = 0; J.asked = -9; } } // after a drop: on round the heart's edge to another shape, while the whole set is in view
        q = nums(J.at, J.r, n);
        if (J.anchor === 2) { retrack(J.orbit, J.k, q); [J.jx, J.jy] = slope(J.orbit, J.k, n); J.touchy = touchy(J.orbit, J.k); }
        const size = Math.hypot(J.jx, J.jy), trueSpan = Math.exp(J.ls) / size, wideness = clamp((trueSpan - 0.3) / 0.6);
        J.turn += dt * 0.05 * spin;
        J.hue += (J.hueTo - J.hue) * (1 - Math.exp(-dt / 3));

        if (flow.dropHit && J.mode === "fly") { // a drop: out to the whole set and on to another shape. Not if it was out there in the last 24 s (a song can drop three times in a burst, and a flight needs half a minute to get anywhere): then the drop only turns the colors
          J.hueTo = -Math.sign(J.hueTo || 1) * between(10, 22);
          if (J.clock - J.pulledAt > 24) leave(false);
        } else if (flow.dropHit && J.mode === "wide" && !J.glide) { J.glide = elsewhere(); J.glidAt = J.clock; }

        if (J.mode === "wide") {
          J.wait -= dt; J.ls -= dt * 0.03;
          if (J.wait <= 0 && !J.glide) { // in towards the middle of the spirals
            J.anchor = 1; J.ox -= q.zx; J.oy -= q.zy;
            const [vx, vy] = view(), [ux, uy] = over(J.ox, J.oy, vx, vy), ls1 = Math.log(between(U.arrive[0], U.arrive[1]));
            J.fl = { ls0: J.ls, ls1, lsA: ls1, ux, uy, uc: 0.8 }; J.mode = "fly";
          }
        } else if (J.mode === "fly") {
          const F = J.fl, speed = (0.07 + 0.36 * flow.intensity ** 2) * (1 + 1.2 * flow.build) * (1 + 1.5 * wideness + 1.5 * flow.drop * wideness);
          J.ls -= dt * speed;
          if (!J.next && J.ls > F.ls1 && J.ls - F.ls1 < speed) J.next = ahead(aspect, F.ls1); // about a second from the swap
          if (J.ls <= F.ls1) { J.ox = 0; J.oy = 0; arrive(aspect); if (J.clock - J.glidAt > 60) leave(true); } // every arrival is the same kind of picture: after a minute of them, gently out and round to another shape, as a drop does hard
        } else { // pull
          if (J.anchor === 1 || (J.anchor === 2 && J.ls >= J.fl.ls0)) toWhole();
          const [ax, ay] = anchorAt(), size = Math.hypot(J.jx, J.jy), trueSpan = Math.exp(J.ls) / size, end = Math.log(wideSpan * size);
          if (!J.pl) { const [ex, ey] = over(J.ox, J.oy, J.jx, J.jy); J.pl = { span: trueSpan, x: ax + ex, y: ay + ey }; }
          J.ls = Math.max(J.ls, Math.min(end, J.ls + dt * U.pull * (n > 2 ? 0.625 : 1) * (J.gentle ? 0.33 : 1) * (0.35 + 0.65 * clamp(J.pullFor / 0.5)))); J.pullFor += dt; // it gets going over half a second. Slower for the sets of three and four arms, whose brightness would halve in a quarter second; and a third as fast when no drop sent it
          const left = 1 - clamp((Math.exp(J.ls) / size - J.pl.span) / Math.max(1e-6, wideSpan - J.pl.span)), mx = J.pl.x * left - ax, my = J.pl.y * left - ay;
          J.ox = mx * J.jx - my * J.jy; J.oy = mx * J.jy + my * J.jx;
          if (J.anchor === 0 && J.ls >= end - 1e-9) { J.mode = "wide"; J.wait = 0.6; J.ox = 0; J.oy = 0; }
        }
        if (J.fl && J.mode !== "wide" && J.anchor !== 0) { // where along the flight the camera is (by how far in it is, not by the clock, so a pull-back runs the same film backwards)
          const F = J.fl, u = clamp((F.ls0 - J.ls) / (F.ls0 - F.ls1));
          if (J.mode === "fly") { const left = 1 - eased(clamp(u / F.uc)), [vx, vy] = view(); J.ox = (F.ux * vx - F.uy * vy) * left; J.oy = (F.ux * vy + F.uy * vx) * left; } // the target comes to the middle of the picture as the picture closes in on it
          J.a = J.anchor === 2 ? eased(clamp((F.lsA - J.ls) / (F.lsA - F.ls1))) : 0; // the straightening of the view, done over the last of the flight
          J.pen = J.anchor === 2 ? 4 * u * u : 0; J.soft = J.anchor === 2 ? J.k * eased(clamp(u / 0.3)) : 0;
        }

        // ---- the numbers for this frame ----
        J.pulse += (kick - J.pulse) * (1 - Math.exp(-dt / 0.05));
        const s = Math.exp(J.ls) * (1 - U.breath * J.pulse), drift = [0.1 * Math.sin(J.clock * 0.11), 0.08 * Math.sin(J.clock * 0.17 + 1)];
        const Vx = s * Math.cos(J.turn), Vy = s * Math.sin(J.turn), [vx, vy] = over(Vx, Vy, J.jx, J.jy), [sx, sy] = over(J.ox + drift[0] * Vx - drift[1] * Vy, J.oy + drift[0] * Vy + drift[1] * Vx, J.jx, J.jy);
        const orbit = J.sent; // what the view is measured from: a target's own path, or the resting place, or the middle of the whole set
        if (J.anchor === 2) orbit.set(J.orbit.subarray(0, J.k * 2 + 2)); else { orbit[0] = J.anchor ? q.zx : 0; orbit[1] = J.anchor ? q.zy : 0; }
        return { n, cx: q.cx, cy: q.cy, zx: q.zx, zy: q.zy, orbit, k: J.k, vx, vy, sx, sy, jx: J.jx, jy: J.jy, blend: J.a, ahead: J.ahead, tall: Math.hypot(vx, vy), pen: J.pen, limit: Math.min(byHand ? 120 : 200, (byHand ? U.stepsByHand : U.steps) * Math.min(1.5, Math.log(U.r) / Math.log(Math.min(J.r, U.r))) + J.soft),
          light: 0.62 + 0.25 * wideness + (0.1 + 0.25 * wideness) * J.pulse + 0.2 * (J.glow += (flow.drop - J.glow) * (1 - Math.exp(-dt / 0.15))), kicked: (0.1 + 0.25 * wideness) * J.pulse, wide: wideness, edge: n > 2 ? 0.5 : 1, hue: J.hue, // lighter while the whole set is in view, which is mostly dark; close in, where the edge fills the picture, the kick lights it half as much. edge: the sets of three and four arms have twice the edge in the picture, so it glows half as much
          eqSpan: Math.exp(J.ls), trueSpan: Math.exp(J.ls) / Math.hypot(J.jx, J.jy), mode: J.mode, anchor: J.anchor, deep, r: J.r, at: J.at };
      }
      return { n, step };
    }
    function sumOf(P) { // the same sum worked out by hand, for a computer with no graphics card to do it: P is what step() gave for this frame
      const { n, cx, cy, orbit, k, vx, vy, sx, sy, jx, jy, blend, ahead, tall, pen, limit, wide, edge } = P;
      return (u, v, dot) => {
        let ex = sx + u * vx - v * vy, ey = sy + u * vy + v * vx, dx = 1, dy = 0, x = orbit[0] + ex, y = orbit[1] + ey, trap = 1e9, count = -1, m2 = 0, i = 0, lastX = x, lastY = y; // (last: the place before, for the stripes)
        const lx = jx * ex - jy * ey, ly = jx * ey + jy * ex;
        for (; i < limit; i++) {
          lastX = x; lastY = y;
          if (i < k) { // beside the target's own path: only how far the dot strays from it is worked out, which stays exact however near the picture is
            const X = orbit[i * 2], Y = orbit[i * 2 + 1], wx = X + ex, wy = Y + ey;
            let px = wx, py = wy, qx, qy; // p = w^(n-1) for the slope; q = ((Z + e)^n - Z^n) / e
            if (n < 3) { qx = 2 * X + ex; qy = 2 * Y + ey; }
            else {
              const X2 = X * X - Y * Y, Y2 = 2 * X * Y;
              px = wx * wx - wy * wy; py = 2 * wx * wy;
              if (n < 4) { const ax = 3 * X + ex, ay = 3 * Y + ey; qx = 3 * X2 + ax * ex - ay * ey; qy = 3 * Y2 + ax * ey + ay * ex; }
              else {
                const tx = px * wx - py * wy; py = px * wy + py * wx; px = tx;
                const ax = 4 * X + ex, ay = 4 * Y + ey, bx = 6 * X2 + ax * ex - ay * ey, by = 6 * Y2 + ax * ey + ay * ex;
                qx = 4 * (X2 * X - Y2 * Y) + bx * ex - by * ey; qy = 4 * (X2 * Y + Y2 * X) + bx * ey + by * ex;
              }
            }
            const hx = n * (px * dx - py * dy); dy = n * (px * dy + py * dx); dx = hx;
            const nx = qx * ex - qy * ey; ey = qx * ey + qy * ex; ex = nx;
            if (i === k - 1 && blend > 0) { ex += (lx - ex) * blend; ey += (ly - ey) * blend; dx += (jx - dx) * blend; dy += (jy - dy) * blend; } // the straightening: from where the dot truly lands to where a plain scale-and-turn would land it
            x = orbit[i * 2 + 2] + ex; y = orbit[i * 2 + 3] + ey;
          } else {
            const x2 = x * x - y * y, y2 = 2 * x * y, px = n < 3 ? x : n < 4 ? x2 : x2 * x - y2 * y, py = n < 3 ? y : n < 4 ? y2 : x2 * y + y2 * x, hx = n * (px * dx - py * dy), nx = px * x - py * y + cx;
            dy = n * (px * dy + py * dx); dx = hx;
            y = px * y + py * x + cy; x = nx;
          }
          m2 = x * x + y * y;
          const t = i < k ? m2 + pen : m2;
          if (t < trap) trap = t;
          if (m2 > 1e4) { count = i; break; }
        }
        if (count < 0) { dotInside(dot, Math.sqrt(trap), (Math.hypot(dx, dy) * tall) / 1.7); dot.edge *= edge; return; }
        const part = Math.log(Math.log(m2) / 9.2103) / Math.log(n), nu = count + 1 - part, late = clamp(nu - limit + 1), now = wayRound(x, y);
        dot.stripe = now + (wayRound(lastX, lastY) - now) * clamp(part);
        dotOutside(dot, (nu + ahead) * 0.045, nu, nu - blend * k + 8 * wide, (Math.sqrt(m2) * 0.5 * Math.log(m2)) / Math.hypot(dx, dy) / tall);
        if (late > 0) { const shade = dot.shade, glow = dot.edge; dotInside(dot, Math.sqrt(trap), (Math.hypot(dx, dy) * tall) / 1.7); dot.shade = shade + (dot.shade - shade) * late; dot.edge = glow + (dot.edge - glow) * late; }
        dot.edge *= edge;
      };
    }
    return { travel, sumOf };
  })();
  let juliaTrip = null, juliaPale = 0.2;
  const juliaSeen = { x: 0, shade: 0, edge: 0, stripe: 0.5, half: 36, t: 0, glow: 1 };
  function julia() { // the Julia set of a point on the edge of the Mandelbrot set's heart, a dust of spirals, flown through for as long as the song lasts: quicker through a build, slow and airy in a break, back out to the whole set on a drop
    const n = V.power || 2, hand = card.off || card.lost || card.made.julia === null;
    trippyOn();
    if (!juliaTrip || juliaTrip.n !== n) juliaTrip = juliaWays.travel(n); // another power is another set: its journey starts from the whole of it
    const F = juliaTrip.step(sound, flow, w / h, hand, V.spin ?? 1), light = F.light - (1 - trippy.kickLight) * F.kicked, probe = juliaWays.sumOf(F), share = mood === "acid" || mood === "hard" ? 0.12 : mood === "euphoric" ? 0.5 : 1, tones = moodColors(3).map((tone) => turnHue(tone, F.hue * share)); // the flight's turn of the colors goes as far as the mood lets a version's turn go, so acid stays yellow and hardcore red
    let pale = 0; // how much of the picture lies right on the set's edge, from forty dots worked out here. Where that is most of it (a shape that is a dust of fine branches) the edge glows less, or the whole picture goes pale
    for (let i = 0; i < 40; i++) { probe((((i % 8) - 3.5) / 4) * Math.min(w / h, 1.6), ((Math.floor(i / 8) - 2) / 2.5) * 0.9, juliaSeen); pale += juliaSeen.edge / 40; }
    juliaPale += (pale - juliaPale) * (1 - Math.exp(-Math.min(0.1, Math.max(0, sound.dt)) / 0.7));
    F.edge *= Math.min(1, 0.2 / Math.max(0.2, juliaPale));
    if (!onCard("julia", JULIA_SUM, { orbit: [2, F.orbit], c: [2, [F.cx, F.cy]], view: [2, [F.vx, F.vy]], shift: [2, [F.sx, F.sy]], jump: [2, [F.jx, F.jy]], power: [1, [n]], reach: [1, [F.k]], blend: [1, [F.blend]], ahead: [1, [F.ahead]], tall: [1, [F.tall]], pen: [1, [F.pen]], limit: [1, [F.limit]], wide: [1, [F.wide]],
      light: [1, [light]], glow: [1, [(V.glow ?? 1) * F.edge]], toneA: [3, tones[0].map((v) => v / 255)], toneB: [3, tones[1].map((v) => v / 255)], toneC: [3, tones[2].map((v) => v / 255)] })) byHand(juliaWays.sumOf(F), light, tones);
    echoes(F.trueSpan, hand);
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
    uniform vec2 orbit[16], view, shift, bend; uniform float wrapAt, backTo, limit, ahead, tall, gain, own, calm, hue;
    void main() {
      vec2 d = shift + mul(spot(), view), e = vec2(0.0), dz = vec2(0.0), z = vec2(0.0);
      d += mul(bend, mul(d, d));
      float trap = 1e9, mine = 1e9, n = -1.0, m2 = 0.0, big = 0.0;
      int at = 0, last = int(wrapAt), back = int(backTo);
      vec2 was = z; // (the place before the last, for the stripes)
      for (int i = 0; i < 320; i++) {
        if (float(i) >= limit) break;
        vec2 Z = orbit[at];
        was = z;
        dz = 2.0 * mul(Z + e, dz) + vec2(big > 0.0 ? 0.0 : 1.0, 0.0);
        if (dot(dz, dz) > 1e20) { dz *= 1e-10; big += 23.02585; }
        e = mul(2.0 * Z + e, e) + d;
        at++;
        if (at == last) at = back;
        z = orbit[at] + e;
        m2 = dot(z, z);
        trap = min(trap, m2);
        if (at == 0) mine = min(mine, m2);
        if (m2 > 1e4) { n = float(i); break; }
      }
      float near = mix(sqrt(trap), sqrt(min(mine, 4.0) * gain), own);
      vec4 on = lit(near * 0.9 + hue + time * 0.03, 0.12 + 0.2 * abs(sin(near * 10.0 - time * 0.8)), glow * wildness(dz, big - calm));
      if (n < 0.0) { color = on; return; }
      float part = log2(log(m2) / 9.2103), nu = n + 1.0 - part, away = exp(log(sqrt(m2) * 0.5 * log(m2)) - log(length(dz)) - big) / tall;
      stripes(z, was, part);
      color = mix(outside((nu + ahead) * 0.045 + hue, nu, max(-log2(max(away, 1e-12)), 0.0), away), on, clamp(nu - limit + 1.0, 0.0, 1.0));
    }
`;
  /* The Mandelbrot journey. One lap: the whole set; a fall towards one of the places above; a stay there, the same picture coming round and round; then the dive turns and backs out until a
     tiny copy of the whole set on one of the place's arms is in the picture, swings over to it and goes in. The copy grows out of a star of arms until it fills the picture exactly as the whole
     set fills the first one, its hair fades, and it is the real whole set, already on its way to the next place. Each place has two copies, taken turn about, so fourteen laps go by before one
     comes again. A drop cuts to the whole set and another place. Through a build a stay isn't left: the place's picture spins in faster and faster until the drop. */
  const mandelWays = (() => {
    const COPIES = [ // two tiny copies of the whole set on the arms of each place: across, up (its middle: the point whose path comes back to 0), after how many steps, and its bend (see copyPath). From find_copies.js, shape.js and table.js
      [[-0.074470451380031735, 0.97054213689920987, 8, 0.0000024983861298636268, 0.000018026933301582915], [-0.11396965502340839, 0.96916041911241468, 10, 6.1166535727955138e-8, 0.000003835753088380576]],
      [[0.38653917659615805, 0.5693247113031028, 7, 0.000062947008834974302, -0.000017467840313517297], [0.36040230538631673, 0.61490698107520536, 9, 0.000024191258734428209, 0.000043209378791460762]],
      [[0.45682328582331666, 0.34775870088348193, 7, -0.000035784032170774476, -0.000008622994230357995], [0.43670943694043307, 0.32504731299543793, 9, -4.7250323319703458e-7, -0.000030701767648593254]],
      [[-0.56396729573493265, 0.66719020725101963, 9, -0.000016319779068946742, -0.000014190472331981549], [-0.5804250995479967, 0.65233297150049607, 11, 0.000014654562018323928, 0.0000051250052940242277]],
      [[0.43728392949717315, 0.21038120059847942, 8, -0.000022837218667840669, -0.000010065952788708478], [0.43286411943482361, 0.20179240578025323, 9, 9.0637551973688239e-7, 0.0000085139946513447453]],
      [[-1.2417651915241865, 0.32363630683360478, 9, -0.0000022570489165511234, -0.0000039666943475623524], [-1.2064100208256765, 0.31642223808429698, 10, -0.0000024074649753313016, 0.0000069452945420398014]],
      [[-1.2527358840120379, 0.34247064788975096, 7, -0.000024404100018322731, -0.0000066560966767940238], [-1.2674433668560492, 0.35548937661823732, 9, -0.0000010192046112315477, 0.0000020488955857513838]],
    ];
    const NEAREST = 1e-4, MORE = 45, CAP = 316, STAY = 4.5; // the size at which a place's picture is swapped for the same one a round up; steps past the count at which dots begin to get away; the most steps; how long a stay at a place is, in e-folds of the dive
    function placePath(i) { // the sum's own path at one of the places (the same for every dot, so a dot only works out how far it strays from it, which stays exact however near the picture goes), and from the size and the turn of its round, how much nearer brings the same picture back and how far round it has turned by then
      const [cx, cy, k, p, rounds] = DIVES[i], orbit = new Float32Array(32);
      let x = 0, y = 0, lx = 1, ly = 0;
      for (let n = 0; n < k + p; n++) {
        orbit[n * 2] = x; orbit[n * 2 + 1] = y;
        if (n >= k) { const tx = 2 * (lx * x - ly * y); ly = 2 * (lx * y + ly * x); lx = tx; }
        const nx = x * x - y * y + cx; y = 2 * x * y + cy; x = nx;
      }
      const size = Math.log(Math.hypot(lx, ly)), turn = Math.atan2(ly, lx) * rounds;
      return { copy: false, i, cx, cy, k, stop: k + p, orbit, per: p * rounds, step: size / p, level: size * rounds, around: Math.atan2(Math.sin(turn), Math.cos(turn)) };
    }
    function copyPath(place, which) { // a tiny copy: its path goes round for ever from the start. Its size and turn s = 1 / (beta L^2) from the derivatives along the path; the real set's number m sits in the copy at  c + s m + b m^2
      const [cx, cy, P, bx, by] = COPIES[place][which], orbit = new Float32Array(32);
      let x = 0, y = 0, lx = 1, ly = 0, ex = 1, ey = 0;
      for (let n = 0; n < P; n++) {
        orbit[n * 2] = x; orbit[n * 2 + 1] = y;
        if (n > 0) { const tx = 2 * (x * lx - y * ly); ly = 2 * (x * ly + y * lx); lx = tx; const m = lx * lx + ly * ly; ex += lx / m; ey -= ly / m; }
        const nx = x * x - y * y + cx; y = 2 * x * y + cy; x = nx;
      }
      const l2x = lx * lx - ly * ly, l2y = 2 * lx * ly, qx = ex * l2x - ey * l2y, qy = ex * l2y + ey * l2x, q2 = qx * qx + qy * qy, sx = qx / q2, sy = -qy / q2, s2 = sx * sx + sy * sy;
      const tx = sx * sx - sy * sy, ty = 2 * sx * sy, t2 = tx * tx + ty * ty; // bend / s^2: what the shader multiplies d^2 by
      // (the path is kept to 7 digits on the card, but that moves nothing: a dot at the middle strays 0 from the path at every step whatever the path's digits, so the copy sits at exactly d = 0)
      const A = DIVES[place], swell = Math.hypot(lx, ly);
      return { copy: true, i: place, which, cx, cy, k: 0, stop: P, P, orbit, sx, sy, size: Math.sqrt(s2), turn: Math.atan2(sy, sx), gain: swell * swell, calm: -Math.log(swell * Math.sqrt(s2)), bendX: (bx * tx + by * ty) / t2, bendY: (by * tx - bx * ty) / t2,
        fromX: A[0] - cx, fromY: A[1] - cy, far: Math.hypot(A[0] - cx, A[1] - cy) }; // from: the place, measured from the copy
    }
    function makeTrip(place) { // the journey: what it keeps between frames, and step(), which moves it on and says what to draw
      const T = { phase: "fall", A: placePath(place), B: null, L: 0, dir: 1, held: 0, ahead: 0, L0: 0, a0: 0, since: 0, slow: 0, hue: 0, laps: 0, fade: null, drawn: false };
      function start(i, cut) { // the top of a lap: the whole set, on the way to place i. cut: on a drop (the old picture goes, and the fall starts a little way in, where the set's edge already fills the picture: from the brightest picture to a small set on black would be the one hard change in the journey); otherwise from a copy just arrived at (it fades into the real set, lined up)
        T.fade = cut ? (T.drawn ? { cut: true, t: 0, len: 0.8, fresh: true } : null) : { cut: false, t: 0, len: 1.5, path: T.B, ahead: T.ahead, fresh: true };
        Object.assign(T, { phase: "fall", A: placePath(i), B: null, L: cut && T.drawn ? 1.2 : 0, dir: 1, held: 0, ahead: 0, since: 0, slow: cut ? 0 : 2.5, laps: T.laps + 1 });
      }
      const limitAt = (path, tall, more) => Math.min(236, Math.max(56, path.k + Math.log(1 / tall) / path.step + more));
      function step(sound, flow, aspect, spin, byHand) { // moves the journey on and says what to draw: one picture, or two while one fades into the other. byHand: no graphics card, so the stay is drawn from less near, which saves most of the steps and can't be told apart on a picture that coarse
        const dt = Math.min(sound.dt, 0.1), kick = sound.kick, more = byHand ? 30 : MORE;
        if (flow.dropHit && !(T.cutAt < 0.5)) { start((T.A.i + 3) % 7, true); T.cutAt = 0; } // (a drop is one frame; said twice running, the second is let go)
        const A = T.A, rate = (0.25 + 0.45 * flow.intensity) * (1 + flow.build), breath = 1 - 0.04 * kick;
        T.since += dt; T.cutAt = (T.cutAt ?? 9) + dt; T.hue += dt * rate * 0.02;
        const wrapL = Math.log(1.5 / (byHand ? 1e-2 : NEAREST));
        let draw;
        if (T.phase === "fall" || T.phase === "hold" || T.phase === "back") {
          if (T.phase === "back") {
            T.dir += (-(2 + 2 * flow.intensity) - T.dir) * (1 - Math.exp(-dt / 0.35));
            T.L += dt * rate * T.dir;
            if (T.L <= T.Lturn) { T.phase = "in"; T.L0 = T.L; T.a0 = -(T.L / A.level) * A.around; }
          } else {
            const from = T.slow ? eased(clamp(T.since / T.slow)) : 1; // a lap that began at a copy starts from rest
            const move = dt * (rate + 0.9 * Math.max(0, 1 - T.L / 8)) * from;
            T.L += move;
            if (T.phase === "fall" && T.L >= wrapL) T.phase = "hold";
            if (T.phase === "hold") {
              T.held += move;
              if (T.held >= (A.i > 4 ? 0.55 * STAY : STAY) && flow.build < 0.3 && !T.fade) { // (the two spirals are thin lines on black: a shorter stay) // time to go: one of this place's two copies, turn about. From here L is the true depth again, which a round or more of "the same picture a size up" had left behind
                const s = (T.L - wrapL) / A.level;
                T.B = copyPath(A.i, (T.laps + A.i) % 2); T.ahead = Math.floor(s) * A.per; T.L = wrapL + (s - Math.floor(s)) * A.level; T.phase = "back"; T.dir = 1;
                T.Lturn = Math.log(1.5 / ((1.3 * T.B.far) / Math.min(1, aspect))); // back out until the copy is in the picture
              }
            }
          }
        }
        if (T.phase === "in") {
          const B = T.B, Larr = Math.log(1 / B.size); // arrived when the picture is 1.5 times the copy's size: the copy fills it as the whole set fills the first picture
          T.dir += (1 - T.dir) * (1 - Math.exp(-dt / 0.35));
          T.L += dt * rate * T.dir;
          if (T.L >= Larr) start((A.i + 3) % 7, false);
        }
        const now = T.A;
        if (T.phase === "in") {
          const B = T.B, Larr = Math.log(1 / B.size), q = clamp((T.L - T.L0) / (Larr - T.L0)), e = eased(q), tall = 1.5 * Math.exp(-T.L) * breath;
          const gx = -0.6 * B.sx, gy = -0.6 * B.sy, keep = Math.min(1, Math.exp(-(T.L - T.L0))) * (1 - q) * (1 - q); // the copy's own middle of the picture, and how much of the way from the place is still to go
          let da = B.turn - T.a0; da = Math.atan2(Math.sin(da), Math.cos(da));
          const a = spin + T.a0 + da * e, w = Math.min(1, Math.exp(-2 * (Larr - T.L))), own = eased(clamp((q - 0.45) / 0.4));
          const limTurn = limitAt(A, 1.5 * Math.exp(-T.L0), more), limArr = Math.min(CAP, 12 + 30 * B.P);
          draw = { path: B, mx: gx + (B.fromX - gx) * keep, my: gy + (B.fromY - gy) * keep, vx: tall * Math.cos(a), vy: tall * Math.sin(a), tall, limit: limTurn + (limArr - limTurn) * q * q, ahead: T.ahead, bend: w, own };
        } else {
          const A = now, deep = T.phase === "hold", s = (T.L - wrapL) / A.level, part = deep ? s - Math.floor(s) : 0, Ltrue = deep ? wrapL + part * A.level : T.L; // in a hold the picture a size up is drawn in its place, being the same one
          const tall = 1.5 * Math.exp(-Ltrue) * breath, a = spin - (Ltrue / A.level) * A.around, pan = T.phase === "back" ? 0 : Math.exp(-Ltrue) * Math.max(0, 1 - Ltrue / 3) ** 2; // (on the way back out the middle stays on the place)
          draw = { path: A, mx: (-0.6 - A.cx) * pan, my: -A.cy * pan, vx: tall * Math.cos(a), vy: tall * Math.sin(a), tall, limit: limitAt(A, tall, more), ahead: deep ? Math.floor(s) * A.per : T.ahead, bend: 0, own: 0 };
        }
        draw.hue = T.hue; draw.alpha = 1;
        const draws = [draw];
        if (T.fade) {
          const F = T.fade; F.t += dt / F.len;
          if (F.t >= 1) T.fade = null;
          else if (F.cut || byHand) draws.push({ old: true, fresh: F.fresh, alpha: 1 - eased(F.t) }); // what was on the picture when the drop landed, going away: kept as a picture, which costs nothing, where working it out again every frame cost more than anything else in the journey
          else { // the copy drawn over the real set: the same picture through  c + s m + b m^2, so the two stay lined up while the new lap gets going. Its steps are let go as it fades
            const B = F.path, mx = draw.mx + draw.path.cx, my = draw.my + draw.path.cy;
            draws.push({ path: B, mx: B.sx * mx - B.sy * my, my: B.sx * my + B.sy * mx, vx: B.sx * draw.vx - B.sy * draw.vy, vy: B.sx * draw.vy + B.sy * draw.vx, tall: draw.tall * B.size, limit: Math.min(CAP, 12 + (14 + 16 * (1 - eased(F.t))) * B.P), ahead: F.ahead, bend: 1, own: 1, hue: T.hue, alpha: 1 - eased(F.t) });
          }
          F.fresh = false;
        }
        T.drawn = true;
        return draws;
      }
      return { step };
    }
    // what the card is told for one picture
    const told = (d, light) => { const p = d.path, c = p.copy; return { light: [1, [light]], orbit: [2, p.orbit], view: [2, [d.vx, d.vy]], shift: [2, [d.mx, d.my]], bend: [2, c ? [p.bendX * d.bend, p.bendY * d.bend] : [0, 0]], wrapAt: [1, [p.stop]], backTo: [1, [p.k]],
      limit: [1, [d.limit]], ahead: [1, [d.ahead]], tall: [1, [d.tall]], gain: [1, [c ? p.gain : 0]], own: [1, [c ? d.own : 0]], calm: [1, [c ? p.calm * d.own : 0]], hue: [1, [d.hue]] }; };
    function sumOf(d) { // the same sum worked out by hand for one picture, for a computer with no graphics card to do it
      const p = d.path, c = p.copy, orbit = p.orbit, stop = p.stop, back = p.k, sx = d.mx, sy = d.my, bx = c ? p.bendX * d.bend : 0, by = c ? p.bendY * d.bend : 0, gain = c ? p.gain : 0, own = c ? d.own : 0, calm = c ? p.calm * d.own : 0;
      const { vx, vy, tall, limit, ahead, hue } = d;
      return (u, v, dot) => {
        let ax = sx + u * vx - v * vy, ay = sy + u * vy + v * vx;
        { const qx = ax * ax - ay * ay, qy = 2 * ax * ay; ax += bx * qx - by * qy; ay += bx * qy + by * qx; }
        let ex = 0, ey = 0, gx = 0, gy = 0, at = 0, trap = 1e9, mine = 1e9, n = -1, m2 = 0, big = 0, i = 0, px = 0, py = 0, lastX = 0, lastY = 0; // (p: the place now, last: the one before, for the stripes)
        for (; i < limit; i++) {
          const X = orbit[at * 2], Y = orbit[at * 2 + 1], zx = X + ex, zy = Y + ey, hx = 2 * (zx * gx - zy * gy) + (big > 0 ? 0 : 1), ux = 2 * X + ex, uy = 2 * Y + ey, nx = ux * ex - uy * ey + ax;
          gy = 2 * (zx * gy + zy * gx); gx = hx;
          if (gx * gx + gy * gy > 1e20) { gx *= 1e-10; gy *= 1e-10; big += 23.02585; }
          ey = ux * ey + uy * ex + ay; ex = nx;
          if (++at === stop) at = back;
          const x = orbit[at * 2] + ex, y = orbit[at * 2 + 1] + ey;
          lastX = px; lastY = py; px = x; py = y;
          m2 = x * x + y * y;
          if (m2 < trap) trap = m2;
          if (at === 0 && m2 < mine) mine = m2;
          if (m2 > 1e4) { n = i; break; }
        }
        const near = Math.sqrt(trap) + (Math.sqrt(Math.min(mine, 4) * gain) - Math.sqrt(trap)) * own, wild = 0.5 * Math.log(gx * gx + gy * gy + 1e-30) + big - calm;
        const inX = near * 0.9 + hue + dot.t * 0.03, inShade = 0.12 + 0.2 * Math.abs(Math.sin(near * 10 - dot.t * 0.8)), inEdge = dot.glow * eased(clamp((wild - 4) / 10));
        if (n < 0) { dot.x = inX; dot.shade = inShade; dot.edge = inEdge; return; }
        const part = Math.log2(Math.log(m2) / 9.2103), nu = n + 1 - part, away = Math.exp(Math.log(Math.sqrt(m2) * 0.5 * Math.log(m2)) - 0.5 * Math.log(gx * gx + gy * gy) - big) / tall, far = Math.max(0, -Math.log2(Math.max(away, 1e-12)));
        const soft = eased(clamp((away * dot.half - 1) / 5)), on = clamp(nu - limit + 1), now = wayRound(px, py);
        dot.stripe = 0.5 + (now + (wayRound(lastX, lastY) - now) * clamp(part) - 0.5) * eased(clamp((1 - Math.exp(-far * 0.15) - 0.25) / 0.5)) * soft; // (no stripes far from the set, or where the bands are finer than a dot)
        dot.x = (nu + ahead) * 0.045 + hue + dot.t * 0.03; // (the card mixes the two colors where a dot only just got away; by hand the nearer one is taken)
        dot.shade = (0.7 + (0.7 * Math.abs(Math.sin(nu * Math.PI)) - 0.4) * soft) * (1 - Math.exp(-far * 0.15)); dot.edge = dot.glow / (1 + away * away * 4900);
        if (on > 0) { dot.shade += (inShade - dot.shade) * on; dot.edge += (inEdge - dot.edge) * on; if (on > 0.5) dot.x = inX; }
      };
    }
    return { makeTrip, told, sumOf };
  })();
  let mandelTrip = null, mandelWas = null;
  function mandel() { // a journey through the Mandelbrot set that keeps finding new places: in to where arms meet, round and round there, out and over to a tiny copy of the whole set, and in through that to the next place. Quicker with the song and through a build; a drop cuts back out to the set and somewhere else
    trippyOn();
    const hand = card.off || card.lost || card.made.mandel === null, light = Math.min(0.9, 0.6 + 0.2 * sound.kick * trippy.kickLight + 0.2 * flow.drop); // the edge fills far more of this picture than of the Julia set's, so the kick lights it less, and never to where the arms burn out white
    if (!mandelTrip) mandelTrip = mandelWays.makeTrip(Math.floor(rnd(0, DIVES.length)));
    const draws = mandelTrip.step(sound, flow, w / h, turned("mandel", 0.04), hand), old = draws.find((d) => d.old);
    if (old && old.fresh) mandelWas = copyOf(mandelWas); // the picture as it stands, taken before the new one is drawn over it
    for (const d of draws) {
      if (d.old) { g.globalAlpha = d.alpha; g.drawImage(mandelWas, 0, 0, w, h); g.globalAlpha = 1; }
      else if (!onCard("mandel", MANDEL_SUM, mandelWays.told(d, light), d.alpha)) byHand(mandelWays.sumOf(d), light, undefined, d.alpha);
    }
    echoes(draws[0].tall, hand);
  }
  const NEWTON_SUM = `
    uniform vec2 view, mid, lean, bendQ, bendK; uniform float roots, rate, turn, ahead, world;
    void main() {
      vec2 u = mid + mul(spot(), view), z, dz, mu = vec2(1.0, 0.0) - lean; // dz: how the dot's z moves when the dot moves, kept along with the sum; from it comes how fast the step count changes across the picture
      float tall = length(view);
      if (world > 0.5) { vec2 ku = mul(bendK, u); z = mul(u, vec2(1.0, 0.0) + mul(u, bendQ + ku)); dz = (vec2(1.0, 0.0) + mul(u, 2.0 * bendQ + 3.0 * ku)) * tall; } // a bead's inside: the pole straight on, with what is left of the bend it was handed over with
      else { z = vec2(u.x, -u.y) / max(dot(u, u), 1e-30); dz = -mul(z, z) * tall; } // the well: one over the dot, which puts far away in the middle
      vec2 p = z, f = vec2(1.0, 0.0), pWas = p, fWas = f, dWas = dz;
      float was = 1e9, now = 1e9, n = -1.0, skipped = 0.0;
      int count = int(roots);
      for (int i = 0; i < 64; i++) {
        float m2 = dot(z, z);
        if (m2 > 4096.0) { float j = floor(0.5 * log(m2 / 1024.0) / rate); vec2 r = exp(-j * rate) * vec2(cos(j * turn), sin(j * turn)); z = mul(z, r); dz = mul(dz, r); skipped += j; } // far out a step only shrinks and turns: all of those at once
        pWas = p; fWas = f;
        p = z;
        for (int j = 2; j < 5; j++) { if (j >= count) break; p = mul(p, z); }
        f = mul(p, z) - vec2(1.0, 0.0);
        was = now; now = dot(f, f);
        if (now < 1e-4) { n = float(i); break; }
        dWas = dz;
        vec2 ip = vec2(p.x, -p.y) / max(dot(p, p), 1e-36), iz = vec2(z.x, -z.y) / max(dot(z, z), 1e-36);
        dz = mul(dz, mu - (roots - 1.0) * mul(lean, mul(ip, iz)));
        z += mul(lean, ip - z);
      }
      float nu = skipped + 64.0, fine = 1.0; // fine: how many steps the count changes from one dot to the next. A dot that never arrived counts as too fine to show
      if (n >= 0.0) {
        float L1 = log(was), L2 = log(max(now, 1e-30)), D = L1 - L2;
        nu = skipped + n - 1.0 + (L1 + 9.2103404) / D;
        vec2 h2 = mul(mul(p, dz), vec2(f.x, -f.y)) / max(now, 1e-30), h1 = mul(mul(pWas, dWas), vec2(fWas.x, -fWas.y)) / max(dot(fWas, fWas), 1e-30);
        fine = 4.0 * roots * length(h1 * (-9.2103404 - L2) + h2 * (L1 + 9.2103404)) / (D * D * size.y);
        fine = fine < 1.0 ? fine : 1.0; // (also when it came out as no number at all)
      }
      float root = floor(mod(atan(z.y, z.x) / 6.2831853 * roots + 0.5, roots));
      color = lit(root / roots + (nu + ahead) * 0.03125 + time * 0.03, mix(0.5, 0.3 + 0.7 * abs(sin(nu * 3.14159265)), 1.0 - smoothstep(0.2, 0.67, fine)), glow * 0.8 * smoothstep(0.06, 0.6, fine));
    }
`;
  /* Newton's method that travels. Hunting the roots of z^n = 1, relaxed a little, each dot is colored by the root it ends at and banded by how many steps it took. Two "worlds", one sum.
     The well is the far field seen inside out, so far away is the middle: each ring is the last one a size smaller, and it never ends. A bead world looks straight at one of the beads on the
     chains where the lands meet: every bead is a point the method sends onto the pole, and the pole is sent far away in one step, so the inside of a bead is the well again seen through
     z^(n-1), with n(n-1) arms in place of n. The journey: fall down the middle; now and then pick a bead on one of the arms, glide it to the middle of the picture while still falling, fall
     into it, and well inside hand the picture over to a bead world drawn from its own middle, so it is never short of digits. From there the next bead is a bead world again: endless.
     Meanwhile the shapes move: the twist swings slowly and is wound up by a build, the relaxing follows the bass, and the middle of things wanders about the picture. In a build it closes in
     on a bead and all but waits at its mouth for the drop, which sends it plunging in. Another number of roots opens as a ring of light from where the eye is looking. */
  const newtonWays = (() => {
    const ZERO = [0, 0];
    // ---- complex numbers as [re, im] ----
    const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]], mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    const abs = (a) => Math.hypot(a[0], a[1]), arg = (a) => Math.atan2(a[1], a[0]), scale = (a, k) => [a[0] * k, a[1] * k];
    const cpow = (a, e) => { const r = abs(a) ** e, t = arg(a) * e; return [r * Math.cos(t), r * Math.sin(t)]; };
    const polar = (r, t) => [r * Math.cos(t), r * Math.sin(t)];

    // ---- the method ----
    function numbers(n, twist = 0, relax = 1) {
      const a = [relax, twist], lean = [relax / n, twist / n], mu = [1 - lean[0], -lean[1]];
      return { n, a, lean, mu, rate: -Math.log(abs(mu)), bend: arg(mu), twist, relax, mu1: cpow(mu, 1 / (n - 1)) }; // mu1: what one step is worth in a bead world, where the well is seen through z^(n-1)
    }
    const step = (P, z) => add(mul(P.mu, z), mul(P.lean, cpow(z, 1 - P.n))); // N(z) = mu z + (a/n) z^(1-n)
    const step1 = (P, z) => add(P.mu, scale(mul(P.lean, cpow(z, -P.n)), 1 - P.n)); // N'
    const step2 = (P, z) => scale(mul(P.lean, cpow(z, -P.n - 1)), (1 - P.n) * -P.n); // N''
    const step3 = (P, z) => scale(mul(P.lean, cpow(z, -P.n - 2)), (1 - P.n) * -P.n * (-P.n - 1)); // N'''

    // ---- the sum for one dot. u = C + S * spot. world 0: the well (z = 1/u). world 1: a bead's inside (z = u (1 + u (q + k u))) ----
    const FAR2 = 4096, HOME2 = 1024; // further out than 64 the method only shrinks and turns, so those steps are taken in one go, down to 32. (Where the number of steps taken at once changes the picture is out by (|a/n| / |mu|) (32 / |mu|)^-n of its distance: under 0.2 of a dot even deep in a bead. Down to 16 it would be over a dot.)
    function trace(P, cam, ux, uy, out, steps = 64) { // cam: { world, q, k, tall } with tall the view's height (|view|). Gives out.nu (the smooth step count), out.root, out.ok, and out.grad: how fast nu changes across the picture, per half picture height
      const { n } = P, bx = P.lean[0], by = P.lean[1], mx = P.mu[0], my = P.mu[1], tall = cam.tall || 0;
      let x, y, dx, dy, skipped = 0; // dx, dy: how the dot's z moves when the dot moves (only its size and its turn against itself two steps apart matter, so the view's own turn is left out)
      if (cam.world) {
        const q = cam.q, k = cam.k, kx = k[0] * ux - k[1] * uy, ky = k[0] * uy + k[1] * ux, ax = q[0] + kx, ay = q[1] + ky, cx = 1 + ax * ux - ay * uy, cy = ax * uy + ay * ux; x = ux * cx - uy * cy; y = ux * cy + uy * cx;
        const ex = 2 * q[0] + 3 * kx, ey = 2 * q[1] + 3 * ky; dx = (1 + ex * ux - ey * uy) * tall; dy = (ex * uy + ey * ux) * tall; // z = u (1 + u (q + k u)), dz = 1 + u (2 q + 3 k u)
      } else { const r2 = Math.max(ux * ux + uy * uy, 1e-30); x = ux / r2; y = -uy / r2; dx = -(x * x - y * y) * tall; dy = -2 * x * y * tall; } // z = 1/u, dz = -z^2
      let was = 1e9, now = 1e9, count = -1, px = 0, py = 0, fx = 1, fy = 0, wpx = 0, wpy = 0, wfx = 1, wfy = 0, wdx = 0, wdy = 0;
      for (let i = 0; i < steps; i++) {
        const m2 = x * x + y * y;
        if (m2 > FAR2) { const j = Math.floor((0.5 * Math.log(m2 / HOME2)) / P.rate), s = Math.exp(-j * P.rate), c = Math.cos(j * P.bend) * s, d = Math.sin(j * P.bend) * s; let t = x * c - y * d; y = x * d + y * c; x = t; t = dx * c - dy * d; dy = dx * d + dy * c; dx = t; skipped += j; }
        wpx = px; wpy = py; wfx = fx; wfy = fy; // the step before's, for the slope at the end
        px = x; py = y;
        for (let j = 2; j < n; j++) { const t = px * x - py * y; py = px * y + py * x; px = t; }
        fx = px * x - py * y - 1; fy = px * y + py * x;
        was = now; now = fx * fx + fy * fy;
        if (now < 1e-4) { count = i; break; }
        wdx = dx; wdy = dy;
        const p2 = Math.max(px * px + py * py, 1e-36), ipx = px / p2, ipy = -py / p2, z2 = Math.max(x * x + y * y, 1e-36), izx = x / z2, izy = -y / z2;
        const gx = ipx * izx - ipy * izy, gy = ipx * izy + ipy * izx, hx = mx - (n - 1) * (bx * gx - by * gy), hy = my - (n - 1) * (bx * gy + by * gx), t = dx * hx - dy * hy; // N'(z) = mu - (n-1) (a/n) z^-n
        dy = dx * hy + dy * hx; dx = t;
        const qx = ipx - x, qy = ipy - y, u = x + bx * qx - by * qy;
        y += bx * qy + by * qx; x = u;
      }
      out.ok = count >= 0; out.steps = count < 0 ? steps : count + 1; // (steps: how many times round the loop, for counting the cost)
      out.root = (Math.round((Math.atan2(y, x) * n) / TAU) + n) % n;
      if (count < 0) { out.nu = skipped + steps; out.grad = 1e9; return; }
      const L1 = Math.log(was), L2 = Math.log(Math.max(now, 1e-30)), D = L1 - L2, T = -9.2103404; // T: log of the 1e-4 that counts as arrived
      out.nu = skipped + count - 1 + (L1 - T) / D;
      // the slope of that: log |f|^2 changes by 2 |n p dz / f| per unit, for this step and the one before, each weighed by how much it counts in nu
      const f2 = Math.max(now, 1e-30), ax = px * dx - py * dy, ay = px * dy + py * dx, h2x = (ax * fx + ay * fy) / f2, h2y = (ay * fx - ax * fy) / f2;
      const g2 = Math.max(wfx * wfx + wfy * wfy, 1e-30), cx = wpx * wdx - wpy * wdy, cy = wpx * wdy + wpy * wdx, h1x = (cx * wfx + cy * wfy) / g2, h1y = (cy * wfx - cx * wfy) / g2;
      const w1 = T - L2, w2 = L1 - T, grad = (2 * n * Math.hypot(h1x * w1 + h2x * w2, h1y * w1 + h2y * w2)) / (D * D);
      out.grad = grad < 1e9 ? grad : 1e9;
    }
    const smooth = (lo, hi, x) => eased(clamp((x - lo) / (hi - lo)));
    function shadeOf(nu, fine, glow, out) { // fine: how many steps the count changes from one dot to the next. Bands where they are wide enough to see, a glow where they are not
      const band = 0.3 + 0.7 * Math.abs(Math.sin(nu * Math.PI)), soft = 1 - smooth(0.2, 0.67, fine);
      out.shade = 0.5 + (band - 0.5) * soft; out.edge = glow * 0.8 * smooth(0.06, 0.6, fine);
    }

    // ---- beads ----
    function solveStep(P, target, z, rounds = 8) { for (let i = 0; i < rounds; i++) z = sub(z, div(sub(step(P, z), target), step1(P, z))); return z; } // the z near the start with N(z) = target
    function chainBead(P, ray, depth) { // in z: the bead "depth" steps from the pole on chain number ray (0..n-1). The first is N(z) = 0; each next one is the far solution of N(z) = the one before
      const first = div(P.a, [P.n - P.a[0], -P.a[1]]); // z^n = -a / (n - a), written so that the same chain keeps the same number as the twist goes through nothing
      let z = polar(abs(first) ** (1 / P.n), (Math.PI + arg(first) + TAU * ray) / P.n);
      for (let k = 1; k < depth; k++) z = solveStep(P, z, div(z, P.mu));
      return z;
    }
    function bead(P, cam, ray, depth, last) { // last: where it was a frame ago (bead.v), so that it is the same bead when the twist has moved it // in the picture's own numbers. In a bead world every chain shows n-1 times, so ray runs 0..n(n-1)-1
      if (!cam.world) return div([1, 0], chainBead(P, ray, depth));
      const far = chainBead(P, ray % P.n, depth), turn = polar(1, (TAU * Math.floor(ray / P.n)) / (P.n - 1));
      const v = solveStep(P, far, last || mul(cpow(div(P.lean, far), 1 / (P.n - 1)), turn)); // the near solution of N(z) = far
      let u = v; // and back through what is left of the bend: u (1 + u (q + k u)) = v
      for (let i = 0; i < 6; i++) { const u2 = mul(u, u); u = sub(u, div(sub(add(u, add(mul(cam.q, u2), mul(cam.k, mul(u2, u)))), v), add([1, 0], add(scale(mul(cam.q, u), 2), scale(mul(cam.k, u2), 3))))); }
      u.v = v;
      return u;
    }
    const beadSteps = (world, depth) => (world ? depth + 1 : depth); // the steps that bring it onto the pole
    function inside(P, cam, at, steps) { // the map from the picture's numbers near a bead onto the pole's neighbourhood, by the chain rule three deep: value, slope d1, and the bends q and k
      let z, d1, d2, d3;
      if (cam.world) { const k = cam.k, at2 = mul(at, at); z = add(at, add(mul(cam.q, at2), mul(k, mul(at2, at)))); d1 = add([1, 0], add(scale(mul(cam.q, at), 2), scale(mul(k, at2), 3))); d2 = add(scale(cam.q, 2), scale(mul(k, at), 6)); d3 = scale(k, 6); }
      else { z = div([1, 0], at); d1 = scale(mul(z, z), -1); d2 = scale(mul(z, mul(z, z)), 2); d3 = scale(mul(mul(z, z), mul(z, z)), -6); }
      for (let i = 0; i < steps; i++) {
        const a1 = step1(P, z), a2 = step2(P, z), a3 = step3(P, z);
        d3 = add(add(mul(a3, mul(d1, mul(d1, d1))), scale(mul(a2, mul(d1, d2)), 3)), mul(a1, d3)); d2 = add(mul(a2, mul(d1, d1)), mul(a1, d2)); d1 = mul(a1, d1); z = step(P, z);
      }
      return { z, d1, q: scale(div(d2, mul(d1, d1)), 0.5), k: scale(div(d3, mul(d1, mul(d1, d1))), 1 / 6) }; // with v = d1 (u - at): the pole's number is v + q v^2 + k v^3
    }

    // ---- the journey ----
    const T0 = 0.05, SWAP = 0.07, HOLD = 0.55; // T0: the view's height when falling down the middle (as today). SWAP: how far into a bead the picture is handed over to the bead world. HOLD: how near a build is allowed to come before the drop
    function newJourney(n, world = 0) { return { n, world, S: [T0, 0], off: [0, 0], q: [0, 0], k: [0, 0], ahead: 0, extra: [0, 0], aim: null, wait: 5, twist: 0, relax: 1, bassSlow: 0.4, plunge: 0, pace: 1, carry: [0, 0], clock: 0, inner: null, ring: 0 }; }
    function pickAim(J, P, aspect) { // the bead to go for: on any arm, the one that is in the picture now and about half way out
      const arms = J.world ? P.n * (P.n - 1) : P.n, per = J.world ? P.rate / (P.n - 1) : P.rate, want = 0.62 * Math.min(1, aspect * 1.15), size = abs(J.S), cam = { world: J.world, q: J.q, k: J.k };
      let best = null;
      for (let ray = 0; ray < arms; ray++) {
        const b0 = bead(P, cam, ray, 6), depth = Math.max(4, Math.min(160, 6 + Math.round(Math.log(abs(b0) / (want * size)) / per)));
        const b = bead(P, cam, ray, depth), at = add(div(b, J.S), J.off), edge = Math.max(Math.abs(at[0]) / (0.8 * aspect), Math.abs(at[1]) / 0.8), fit = edge + Math.random() * 0.25; // edge: how near the picture's edge it is: under 1 is well inside. A little chance, so it is not always the same arm
        if (!best || fit < best.fit) best = { ray, depth, fit, edge, at };
      }
      return best;
    }
    function advance(J, dt, song, dials = {}, aspect = 16 / 9) { // song: { t, kick, bass, flow: { part, intensity, build, drop, dropHit } }. dials: { twist, spin } from the version. Gives back what the shader needs
      dt = Math.min(dt, 0.1);
      const flow = song.flow, quiet = flow.part === "break" || flow.part === "calm";
      J.clock += dt;
      // the twist: the version's own, swinging slowly, wound up by a build, leaning on the bass; never faster than 0.12 a second, so the picture turns and curls but does not shake
      J.bassSlow += (song.bass - J.bassSlow) * (1 - Math.exp(-dt / 0.6));
      const wantTwist = dials.still ? dials.twist || 0 : (dials.twist || 0) + (0.3 + 0.15 * (quiet ? 1 : 0)) * Math.sin(J.clock * 0.11) + 0.12 * Math.sin(J.clock * 0.043 + 2) + 0.25 * flow.build + 0.15 * (J.bassSlow - 0.4);
      J.twist += Math.max(-0.12 * dt, Math.min(0.12 * dt, (0.62 * Math.tanh(wantTwist / 0.62) - J.twist) * (1 - Math.exp(-dt / 0.8)))); // past 0.65 the chains froth over; at 1 the method stops finding roots at all
      J.relax += Math.max(-0.06 * dt, Math.min(0.06 * dt, ((dials.still ? 1 : 0.92 + 0.3 * J.bassSlow) - J.relax) * (1 - Math.exp(-dt / 0.8)))); // the plain part of the relaxing: over 1 and "eyes" open along the lands, so they open with the bass
      const P = numbers(J.n, J.twist, J.relax), cam = { world: J.world, q: J.q, k: J.k };
      const logMu = [-P.rate, P.bend], moved = J.logMu ? sub(logMu, J.logMu) : ZERO; J.logMu = logMu; // how much one step's shrink and turn changed since the last frame (the twist and the relaxing move it)
      // how fast it falls (the view's height shrinks by e that many times a second): as today, times a pace that glides, plus a plunge that the drop sets off and that dies away
      if (flow.dropHit) J.plunging = 0.12; // (it gets going over a tenth of a second: set off at a stroke, it was the one step in speed anywhere in the journey)
      if (J.plunging > 0) { J.plunging -= dt; J.plunge += (1 - J.plunge) * (1 - Math.exp(-dt / 0.04)); } else J.plunge *= Math.exp(-dt / 0.9);
      let pace = 1; // how much faster or slower than plain falling: glides, so the picture never changes speed at a stroke
      const turn = polar(1, dt * 0.05 * (dials.spin ?? 1));
      const wander = (J.wander = [0.22 * Math.min(1, aspect) * Math.sin(J.clock * 0.23 + 1), 0.2 * Math.sin(J.clock * 0.31)]); // where on the picture the middle of things is held: never nailed to the centre
      let b = ZERO, f = null, steps = 0;
      if (J.aim) {
        steps = beadSteps(J.world, J.aim.depth); b = bead(P, cam, J.aim.ray, J.aim.depth, J.aim.v); J.aim.v = b.v; f = inside(P, cam, b, steps);
        const tall = abs(f.d1) * abs(J.S), slope = [Math.log(abs(f.d1)), arg(f.d1)]; // tall: the view's height in the bead's own numbers: 1 is the bead about filling the picture, SWAP is well inside
        if (J.aim.slope && dt > 0) { const around = slope[1] - J.aim.slope[1], now = [(slope[0] - J.aim.slope[0]) / dt, Math.atan2(Math.sin(around), Math.cos(around)) / dt], mix = 1 - Math.exp(-dt / 0.15); J.aim.drift = add(J.aim.drift, scale(sub(now, J.aim.drift), mix)); } // drift: how fast the twist is growing and turning the bead's inside, which the eye is following
        J.aim.slope = slope;
        pace = tall < 1.5 && tall > 0.3 ? 0.5 : 1.5; // once it has a bead to go to it goes a little faster, and slower through the bead's mouth, where the picture is least like anywhere else
        if (flow.part === "build" && J.aim.free === undefined) J.aim.free = tall < HOLD * 1.5; // a build that finds it already inside the bead lets it carry on
        if (flow.part === "build" && !J.aim.free && J.plunge < 0.05) { // in a build it closes in on the bead and all but waits at its mouth for the drop. Not for ever: a build that never ends lets it go again
          J.aim.held = (J.aim.held || 0) + dt;
          const hold = Math.max(0.1, smooth(0, 0.7, Math.log(tall / HOLD)));
          pace *= hold + (1 - hold) * (1 - Math.exp(-J.aim.held / 10));
        }
      }
      J.pace += (pace - J.pace) * (1 - Math.exp(-dt / 0.4));
      const speed = ((0.25 + 0.45 * flow.intensity) * (1 + flow.build) * J.pace + 1.6 * J.plunge) * (J.world ? 2 / (P.n - 1) : 1); // counted in bands going by, not in view heights: inside a bead the well is seen through z^(n-1), which would send n-1 times as many past every dot
      if (J.aim) {
        J.aim.gone += speed * dt;
        const e = eased(clamp(J.aim.gone / J.aim.pan)); J.off = add(scale(J.aim.from, 1 - e), scale(wander, e)); // the bead glides to the middle of the picture over the first part of the way in
        b = add(J.aim.first, scale(sub(b, J.aim.first), e)); // and the eye, fixed at first on where the bead was, takes up the bead's own movement as it goes
      } else { J.extra = scale(J.extra, Math.exp(-dt / 0.7)); J.off = add(wander, J.extra); } // (extra: only a world that opened off the middle has any)
      // A view that is w steps further in than the picture it is tied to is carried round by w times that change. Falling down the middle the picture is tied at the height T0, so that the wrap, which puts the view back a step, changes nothing about how it moves
      const tied = J.aim ? J.aim.tied * (1 - eased(clamp(J.aim.gone / J.aim.pan))) : Math.log(T0 / abs(J.S)) / P.rate;
      J.S = mul(J.S, polar(Math.exp(moved[0] * tied), moved[1] * tied));
      J.carry = scale(J.carry, Math.exp(-dt / 0.8));
      J.S = mul(J.S, polar(Math.exp(J.carry[0] * dt), J.carry[1] * dt)); // (after a swap: the bead's drift, dying away, so the picture does not check its turning)
      J.S = scale(mul(J.S, turn), Math.exp(-speed * dt));
      if (J.aim && abs(f.d1) * abs(J.S) < SWAP && J.aim.gone >= J.aim.pan) { // far enough in: the same picture is now drawn as a bead world, from its own middle
        J.S = mul(f.d1, J.S); J.q = f.q; J.k = f.k; J.world = 1; J.ahead = (J.ahead + steps) % 32; J.carry = dt > 0 ? sub(J.aim.drift, scale(moved, Math.log(T0 / abs(J.S)) / P.rate / dt)) : ZERO; J.aim = null; J.extra = [0, 0]; b = ZERO;
        J.wait = 1 + 2 * Math.random(); // (not long: the way to a bead and through its mouth is where the picture differs, the middle of a world is the same star each time)
      }
      if (!J.aim) {
        const m = J.world ? P.mu1 : P.mu, edge = T0 * abs(m);
        for (let i = 0; i < 400 && abs(J.S) < edge; i++) { J.S = div(J.S, m); J.q = mul(J.q, m); J.k = mul(J.k, mul(m, m)); J.ahead = (J.ahead + 1) % 32; } // the wrap: a step's worth further in is the same picture, so it never runs out of numbers (after a long sleep it wraps many times at once)
        const fade = Math.exp(-dt / 1.5); J.q = scale(J.q, fade); J.k = scale(J.k, fade); // the last of the bend eases out
        J.wait -= dt * (quiet ? 0.3 : 1);
        if ((J.wait < 0 || (flow.part === "build" && flow.build < 0.6)) && abs(J.S) < T0 * 1.3 && abs(J.extra) < 0.02 && J.plunge < 0.05) { // time to go somewhere: at once when a build begins, so the bead is reached as it ends
          const aim = pickAim(J, P, aspect);
          if (aim.edge < 1.1) { const to = bead(P, cam, aim.ray, aim.depth), far = inside(P, cam, to, beadSteps(J.world, aim.depth)); J.aim = { ray: aim.ray, depth: aim.depth, v: to.v, first: to.slice(0, 2), drift: [0, 0], slope: null, tied: Math.log(T0 / abs(J.S)) / P.rate, from: aim.at, gone: 0, pan: 0.45 * Math.log((abs(far.d1) * abs(J.S)) / SWAP) }; J.off = aim.at; J.extra = [0, 0]; b = to; }
          else J.wait = 1;
        }
      }
      const mid = sub(J.aim ? b : ZERO, mul(J.off, J.S)), pulse = 1 - 0.04 * song.kick * (J.world ? 1 / (P.n - 1) : 1) * (P.rate / 0.405); // a kick nudges the view by about a tenth of a band, in whichever world and with however many roots
      return { P, world: J.world, mid, view: scale(J.S, pulse), q: J.q, k: J.k, ahead: J.ahead, light: Math.min(0.9, 0.6 + 0.2 * song.kick + 0.2 * flow.drop), eye: J.off };
    }
    // ---- another number of roots cannot glide. The new picture opens as a ring from where the eye is looking (the middle, or the bead it is going to) and the old one is left behind outside it ----
    function changeRoots(J, n) {
      if (J.inner || n === J.n || J.clock - (J.ringAt ?? -9) < 4) return; // (a change that comes while a ring is still opening waits for it, and for a few seconds more: frame() asks again every frame)
      J.inner = Object.assign(newJourney(n, 1), { S: polar(T0, arg(J.S)), extra: sub(J.off, J.wander || ZERO), twist: J.twist, relax: J.relax, bassSlow: J.bassSlow, clock: J.clock, wait: 4 }); J.ring = 0; }
    function frame(J, dt, song, dials, aspect) { // one frame of the whole thing: the picture, and while a ring is opening the picture inside it
      if (dials && dials.roots) changeRoots(J, dials.roots);
      const outer = advance(J, dt, song, dials, aspect);
      if (!J.inner) return { outer, inner: null, ring: 0 };
      const inner = advance(J.inner, dt, song, dials, aspect), ring = (J.ring += Math.min(dt, 0.1) * (0.5 + 1.6 * J.ring)); // slow to open, then quicker: about a second and a half to pass the corners
      if (ring > Math.hypot(aspect, 1) + abs(inner.eye) + 0.15) { const next = J.inner; for (const key in next) J[key] = next[key]; J.ring = 0; J.ringAt = J.clock; return { outer: inner, inner: null, ring: 0 }; }
      return { outer, inner, ring };
    }
    return { newJourney, frame, trace, shadeOf };
  })();
  let newtonTrip = null;
  function newton() { // Newton's method hunting the roots of z^n = 1: down a well of rings with a color for each root, over to the chains of beads where their lands meet, into a bead, and on from inside it, for as long as the song lasts
    trippyOn();
    if (!newtonTrip) newtonTrip = newtonWays.newJourney(V.roots || 3);
    const R = newtonWays.frame(newtonTrip, sound.dt, sound, { twist: V.twist || 0, spin: V.spin ?? 1, roots: V.roots || 3 }, w / h), hand = card.off || card.lost || card.made.newton === null;
    const light = Math.min(0.9, 0.6 + 0.2 * sound.kick * trippy.kickLight + 0.2 * flow.drop); // (as the journey has it, with the kick's share turned down to pay for the trip)
    const world = (F) => { // one world over the whole picture, or over as much of it as the canvas is clipped to
      const n = F.P.n, glow = (V.glow ?? 1) * (F.world ? 2 / (n - 1) : 1), wide = (R.inner ? 900 : 1280) * (n > 4 ? 0.75 : n > 3 ? 0.875 : 1); // a bead world with more roots is all fine lines: less glow, or it goes pale, and fewer dots, which it has no use for and which cost the most there. Two pictures at once, while a ring opens, are drawn smaller too
      if (onCard("newton", NEWTON_SUM, { light: [1, [light]], glow: [1, [glow]], view: [2, F.view], mid: [2, F.mid], lean: [2, F.P.lean], bendQ: [2, F.q], bendK: [2, F.k], roots: [1, [n]], rate: [1, [F.P.rate]], turn: [1, [F.P.bend]], ahead: [1, [F.ahead]], world: [1, [F.world]] }, 1, wide)) return;
      const cam = { world: F.world, q: F.q, k: F.k, tall: Math.hypot(F.view[0], F.view[1]) }, out = {};
      byHand((u, v, dot) => {
        newtonWays.trace(F.P, cam, F.mid[0] + u * F.view[0] - v * F.view[1], F.mid[1] + u * F.view[1] + v * F.view[0], out, 48);
        newtonWays.shadeOf(out.nu, out.ok ? Math.min(1, (out.grad * 0.45) / dot.half) : 1, glow, out); // (its dots are big and are smoothed when the small picture is drawn large, so bands half as wide still read)
        dot.x = out.root / F.P.n + (out.nu + F.ahead) * 0.03125 + dot.t * 0.03; dot.shade = out.shade; dot.edge = out.edge;
      }, light);
    };
    world(R.outer);
    if (!R.inner) { echoes(Math.hypot(R.outer.view[0], R.outer.view[1]), hand); return; }
    const half = h / 2, x = w / 2 + R.inner.eye[0] * half, y = half - R.inner.eye[1] * half, r = R.ring * half, tone = mix(moodColors(3)[0], [255, 255, 255], 0.5); // another number of roots can't glide: the new picture opens as a ring from where the eye is looking, the old one left outside it
    g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip(); world(R.inner); g.restore();
    g.save(); g.globalCompositeOperation = "lighter"; // the ring itself: a soft band of light over the join, never the whole picture
    for (const [wide, a] of [[0.07, 0.1], [0.035, 0.18], [0.012, 0.35]]) { g.strokeStyle = rgba(tone, a); g.lineWidth = wide * h * (0.5 + Math.min(1, R.ring)); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
    g.restore();
    echoes(Math.hypot(R.outer.view[0], R.outer.view[1]), hand);
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
    faces: { stack: [0, 0.4, 0.8], bands: [5, 4, 7], glow: [1, 0.6, 1.5] },
    forms: { form: ["tunnel", "tunnel", "spiral", "rays", "honeycomb", "lattice", "cobweb"], arms: [6, 8, 5, 12, 4], twist: [0, 0, 1, -1, 2, 3], drift: [1, 1, -1, 0.5], bends: [1, 0, 2], veil: [0, 0, 0, 0.5], glow: [1, 0.6, 1.5], spin: [1, -1, 0] },
    runner: { gait: [1, 0.85, 1.12], kin: [0.5, 0, 1], wings: [2, 3, 4, 1], flair: [1, 0, 1], course: [0, 1, 2, 3] },
    arcade: { spin: [1, -1, 0, 1.8], rails: [1, 0.4, 0], hops: [0, 1, -1], foes: [16, 12, 20], scroll: [1, 0.6, 1.5] },
    places: { land: ["a", "b", "c", "d"], hour: [0, 0, 0.25, 0.5, 0.75], going: [1, 1, -1], weather: [1, 0.3, 1.8] },
    life: { rule: [0, 0, 0, 1, 2], sym: [0, 0, 2, 4, 8], trail: [1, 0.7, 1.5], pace: [1, 1, 0.5, 2], bead: [1, 1, 0] },
    beings: { body: ["mixed", "tess", "cell24", "cage", "web", "cell16", "star"], eyes: ["mixed", "mixed", "two", "one"], spin: [1, 0.6, 1.6] },
    kaleido: { blobs: [5, 3, 8], line: ["wave", "ring", "none"], spin: [1, -1, 2] },
    plasma: { scale: [1, 0.55, 1.7], stripes: [2, 1, 4], swirl: [0, 1, 2] },
    fractal: { sides: [0, 3, 4, 5, 6, 8], child: [0.22, 0.32, 0.15], spin: [1, -1] },
    julia: { power: [2, 2, 3, 4], glow: [1, 0.6, 1.5], spin: [1, -1, 0], fold: ["kal6", "kal6", "mirror", "quad", "kal8", ""] }, // (the fractals' fold is the one that closes in the next break: see trippyOn)
    mandel: { glow: [1, 0.6, 1.5], spin: [1, -1, 0], fold: ["kal6", "kal6", "mirror", "quad", "kal8", ""] }, // (where it goes is the journey's own business: see mandelWays)
    newton: { roots: [3, 4, 5], twist: [0, 0.35, -0.35], glow: [1, 0.6, 1.5], spin: [1, -1, 0], fold: ["kal6", "kal6", "mirror", "quad", "kal8", ""] },
    ocean: { night: [false, true] },
    neonroad: { sun: ["sun", "moon", "planet"], hills: ["hills", "city", "flat"], curve: [0, 1, -1, 1.6] },
    aurora: { lake: [false, true], curtains: [3, 2, 4] },
    tube: { sides: [24, 6, 8, 12, 4], look: ["mesh", "rings", "lines", "dots", "mesh"], twist: [0, 0.12, -0.12, 0.35], bends: [1, 0.55, 1.45], stripes: [3, 0, 6, 1], twirl: [0, 0.5, -0.5, 1.2], swell: [1, 0.5, 1.8] },
    heads: { layout: ["one", "two", "three", "ring", "one"], move: ["sway", "spin", "still"], look: ["slices", "mesh", "slices", "dots"], stage: ["void", "sun", "grid"], glasses: ["", "", "shades", "round", "visor", "stars", "mixed"] }, // bare-faced about half the time
    sphere: { look: ["dots", "spikes", "rings", "mesh"], depth: [1, 0.6, 1.5], wobble: [1, 0, 2], spin: [1, -1, 2] },
    solids: { mode: ["field", "nested", "orbit", "field"], forms: ["mixed", "cube", "icosa", "tetra", "dodeca"], spin: [1, 2, 0.5] },
    city: { heights: [1, 0.6, 1.5], weave: [1, 0, 2], look: ["neon", "glass", "neon"] },
  };
  const GLIDES = new Set(["hour", "going", "weather", "rails", "hops", "foes", "scroll", "gait", "kin", "wings", "flair", "course", "veil", "stack", "hue", "order", "waves", "twists", "loops", "floor", "height", "glow", "spin", "roll", "drift", "flat", "size", "reach", "scale", "swirl", "child", "curve", "twist", "bends", "twirl", "swell", "depth", "wobble", "heights", "weave"]);
  const dialsOf = (style) => VERSIONS[style] && { hue: HUES, order: [0, 0, 1, 2], ...VERSIONS[style] };
  const LIVE = new Set(["fold", "form", "glasses", "roots"]), TAKES = { fold: 0.45, form: 1, glasses: 0.16, roots: 0.5 }; // these go over in the picture itself: the old fold lets go as the new one takes hold, a ring bends from one shape into the other, a head takes its glasses off and puts others on, and Newton's new roots open as a ring of light. Each takes this much of a slow change
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
    colors = acidTint(colors); // and a little toward acid's yellow while the 303's singer sings
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

  /* ==== pixel: begin ==== */
  /* ---------- Pixel worlds: what the pixel-art effects share. A small screen of big square dots, the way old consoles and arcade machines drew: everything is drawn on it in whole dots, never smoothed,
     and show() puts it on the picture with every dot a clean square. And one place that says which kind of world the music playing belongs to. ---------- */
  const pixelCss = (col, a = 1) => (typeof col === "string" ? col : `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${a})`);
  function pixelSprite(rows, tones) { // a little picture written as rows of characters, one character a dot: tones says which color each character is ({ a: [r, g, b] }), and any character not in it is see-through
    const sw = rows[0].length, sh = rows.length, [sc, sx] = paper(sw, sh), img = sx.createImageData(sw, sh);
    rows.forEach((row, j) => { for (let i = 0; i < sw; i++) { const col = tones[row[i]]; if (col) { const o = (j * sw + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255; } } });
    sx.putImageData(img, 0, 0);
    return sc;
  }
  const PIXEL_DIGITS = { 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111" }; // each figure in 3 by 5 dots, for a score
  const pixelScreens = new Map();
  let pixelLast = null; // the small screen the pixel effect showing asked for last: its visitors are drawn in its dots
  function pixelScreen(across = 320) { // the small screen for the picture's shape as it is now: so many dots across, and as many down as keeps the dots square. Made once for each size and kept, so what is drawn on it stays from frame to frame; ask for it again every frame (the window can change shape)
    across = Math.max(32, Math.min(Math.round(across), Math.floor(w / 2))); // (a dot is never smaller than two of the picture's own)
    const down = Math.max(2, Math.round((across * h) / w / 2) * 2), key = across + "x" + down;
    let S = pixelScreens.get(key);
    if (S) return (pixelLast = S);
    if (pixelScreens.size > 8) pixelScreens.clear(); // (a window dragged through many shapes)
    const [c, x] = paper(across, down);
    x.imageSmoothingEnabled = false;
    function put(s, px, py, { flip = false, alpha = 1, lighter = false } = {}) { // a sprite (or any small canvas) with its top left corner at px, py, on whole dots
      x.globalAlpha = alpha; x.globalCompositeOperation = lighter ? "lighter" : "source-over";
      if (flip) { x.save(); x.scale(-1, 1); x.drawImage(s, -Math.round(px) - s.width, Math.round(py)); x.restore(); } else x.drawImage(s, Math.round(px), Math.round(py));
      x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    }
    const rect = (col, px, py, wide, tall, a = 1) => { x.fillStyle = pixelCss(col, a); x.fillRect(Math.round(px), Math.round(py), Math.round(wide), Math.round(tall)); };
    const dot = (col, px, py, a = 1) => rect(col, px, py, 1, 1, a);
    function digits(n, px, py, col) { String(Math.max(0, Math.floor(n))).split("").forEach((d, k) => { for (let i = 0; i < 15; i++) if (PIXEL_DIGITS[d][i] === "1") dot(col, px + k * 4 + (i % 3), py + Math.floor(i / 3)); }); } // a number, each figure 3 dots wide and 5 tall
    function show(alpha = 1) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.globalCompositeOperation = "source-over"; g.globalAlpha = alpha; g.drawImage(c, 0, 0, w, h); g.restore(); g.imageSmoothingEnabled = true; } // onto the picture, every dot a clean square
    S = { c, x, across, down, sprite: pixelSprite, put, rect, dot, digits, show, css: pixelCss };
    pixelScreens.set(key, S);
    return (pixelLast = S);
  }
  function musicWorld() { // which kind of world the music playing belongs to: "acid", "psy", "hard", "trance", "techno", "house", "jungle", "ambient", "game", or "" when nothing says. The four the app has moods for go by the mood, which a pack can teach new genres; the rest, and everything while moods are switched off, go by words in the song's genres
    const byMood = { acid: "acid", psy: "psy", hard: "hard", euphoric: "trance" }[mood];
    if (byMood) return byMood;
    const words = " " + genre.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ", has = (...list) => list.some((word) => words.includes(word));
    if (has("acid")) return "acid";
    if (has(" psy", " goa", "full on")) return "psy";
    if (has(" ost ", "soundtrack", " score ", "chiptune", " chip ", "8 bit", "game", "vgm")) return "game";
    if (has("happy hard", "nightcore")) return "trance";
    if (/[^s]core /.test(words) || has("gabber", "terror", "hardstyle", "rawstyle", "jumpstyle", "industrial", "hard techno", "schranz", "makina", "tekno")) return "hard"; // ("core" but not "score")
    if (has("drum", "jungle", "dnb", " d n b ", "break", "liquid", "neuro", "dubstep")) return "jungle";
    if (has("ambient", "chill", "downtempo", "new age", "drone", "lounge")) return "ambient";
    if (has("house", "disco", "funk", "hi nrg", "italo", "euro", "synth pop", "synthpop", "electro pop")) return "house";
    if (has("trance")) return "trance";
    if (has("techno", "minimal", "electro", "ebm", "idm", "detroit")) return "techno";
    return "";
  }
  const pixelFolk = { big: null, bigX: null, small: null, smallX: null, was: null }; // the visitors' own layer over a pixel world: at the picture's size, and at the world's (its dots are averaged from the big one, so an edge is a dot part see-through, never a fine line. Making every dot either there or not would mean reading the small one back from the graphics card every frame, which cost ten times as much)
  function pixelOver() { // over a pixel world, what is laid over the picture (the visitors, the 303's singer) is drawn on a layer of its own, and pixelDone() puts it on in the world's own dots. Says whether it did
    if (FAMILY[name] !== "pixel" || !pixelLast || !(crowd.folk.length || acidShows() || bandShows() || pointer.rings.length)) return false;
    const P = pixelFolk;
    if (!P.big || P.big.width !== w || P.big.height !== h) [P.big, P.bigX] = paper(w, h);
    P.bigX.setTransform(1, 0, 0, 1, 0, 0); P.bigX.globalAlpha = 1; P.bigX.globalCompositeOperation = "source-over"; P.bigX.clearRect(0, 0, w, h);
    P.was = g; g = P.bigX;
    return true;
  }
  function pixelDone(on) { // the layer, shrunk to the world's small screen and shown with every dot a clean square
    if (!on) return;
    const P = pixelFolk, S = pixelLast;
    g = P.was; P.was = null;
    if (!P.small || P.small.width !== S.across || P.small.height !== S.down) [P.small, P.smallX] = paper(S.across, S.down);
    const x = P.smallX, A = S.across, D = S.down;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.clearRect(0, 0, A, D); x.imageSmoothingEnabled = true; x.drawImage(P.big, 0, 0, A, D);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.imageSmoothingEnabled = false; g.drawImage(P.small, 0, 0, w, h); g.restore();
    g.imageSmoothingEnabled = true;
  }
  /* ==== pixel: end ==== */
  /* ==== faces: begin ==== */
  /* Faces: seeing faces in things. One picture, folded about its upright middle line, made of three things laid on each other. Flowing stuff: every dot is carried about by a few rounds
     of sines, and how high the stuff is where it ends up is drawn as glowing contour lines, like a map's. Four beings: each a low hill in that same land with the lie of a face (a rounded head,
     a bump for each eye socket, a ridge down the middle, a dip where a mouth goes, sometimes ears), so the lines ring the sockets the way wood grain rings a knot. And eyes that open over the
     sockets. Each being is 3.3 times the size of the one inside it, the newest is born small in the middle and each grows until it is past the picture, so the picture travels inwards through
     a face inside a face inside a face for as long as the song lasts. One number, clarity, says how much of it can be made out: an inkblot with its eyes shut in a break, one pair of eyes
     opening after another through a build, every pair wide open and looking at you when the drop lands. The card works it out; where there is none the same sum is done by hand below. */
  const FACES_SUM = `
    uniform vec4 bA[4], bB[4], bC[4], bD[4]; // each being: (how far up it sits, its size, how much it is there, eyes apart) (eye size, lid, tilt, eyes up) (how long the head, mouth, ears, the iris's color) (round eyes, the brow pair's lid, the wing pair's lid, the brow pair's tilt)
    uniform vec4 flowIs;                     // the two layers of flowing stuff: (the size of one, how much of it, the size of the other, how much of it)
    uniform vec3 gaze;                       // where the eyes look (across, up) and how big the dark middle is
    uniform float clear, melt, mid, flowAt, swell, bandsN, crawl, rush;
    float px, side, eMask, eX, eShade, eEdge, rim, dark, form;
    vec3 flowed(vec2 p, float at) { // stuff that folds over itself: where a dot is carried (xy) and how high the stuff is there (z)
      vec2 q = p;
      for (int i = 1; i <= 4; i++) { float k = float(i); q += (0.62 / k) * sin(q.yx * (1.25 * k) + vec2(1.7, 4.1) * k + at * vec2(0.9, 0.7) * (1.0 + 0.2 * k)); }
      return vec3(q - p, 0.5 * (sin(q.x * 1.7) + sin(q.y * 1.3)));
    }
    void eye(vec2 v, float er, float lid, float tilt, float roundness, float S, float there, float hue) { // one eye of a pair: v is the dot from the eye's middle, in the being's own measure
      float d2 = dot(v, v) / (er * er);
      if (d2 > 9.0 || there < 0.004) return;
      float fade = 1.0 - d2 / 9.0;
      form += there * (0.35 + 0.65 * min(lid * 3.0, 1.0)) * exp(-d2 / 2.6) * fade * fade; // its socket: the land rises round it, so the lines ring it (and it is level again three eye sizes out, where this sum stops)
      float ct = cos(tilt), st = sin(tilt);
      vec2 w = vec2(v.x * ct + v.y * st, v.y * ct - v.x * st); // turned, so the outer corner lifts
      float X = w.x / (er * mix(1.6, 1.0, roundness)), in1 = max(0.0, 1.0 - X * X), arch = mix(in1, sqrt(in1), roundness);
      float lo = -er * mix(0.42, 0.98, roundness) * arch, hi = mix(lo, er * 0.98 * arch, lid);
      float din = min(w.y - lo, hi - w.y) * S, soft = px * 1.5, fine = soft / (S * er); // din: how far inside the open eye the dot is, in the picture's own measure
      float m = smoothstep(0.0, soft, din) * step(0.0001, in1) * smoothstep(0.25, 0.7, there);
      rim = max(rim, exp(-(din * din) / (soft * soft * 2.5 + S * S * er * er * 0.004)) * smoothstep(0.0, 0.08, in1) * there); // the lids' bright rim; a shut eye is this line alone
      dark = max(dark, there * exp(-d2 / 2.4) * fade * (0.15 + 0.5 * lid));
      if (m <= eMask) return;
      vec2 iw = (w - vec2(gaze.x * side, gaze.y) * er * 0.22) / er;
      float rr = length(iw), ir = 0.84 * (1.0 + 0.1 * swell), pr = ir * gaze.z;
      float fibre = 0.5 + 0.5 * sin(atan(iw.y, iw.x + 1e-6) * 22.0 + sin(rr * 26.0) * 1.2);
      float inIris = 1.0 - smoothstep(ir - fine, ir + fine, rr), inPupil = 1.0 - smoothstep(pr - fine, pr + fine, rr);
      float t01 = clamp((rr - pr) / max(ir - pr, 0.001), 0.0, 1.0);
      float sh = (0.5 + 0.55 * (1.0 - t01) + 0.3 * fibre * t01) * (1.0 - 0.8 * smoothstep(0.8, 1.0, t01));
      sh = mix(mix(0.13, sh, inIris), 0.012, inPupil) * mix(1.0, 0.6, inIris * (1.0 - inPupil));
      float ed = mix(0.07, 0.3 + 0.25 * fibre * (1.0 - t01), inIris) * (1.0 - inPupil); // a good deal of white in the iris: a pale jewel in any mood's colors, rose and gold in the reds and never a plain red eye
      ed += 1.5 * (1.0 - smoothstep(0.11, 0.15 + fine, length(iw - vec2(0.27 * side, 0.3)))); // the glint, on the same side in every eye
      ed += 0.5 * (1.0 - smoothstep(0.04, 0.07 + fine, length(iw + vec2(0.3 * side, 0.3))));
      sh *= 0.4 + 0.6 * smoothstep(0.0, er * 0.55, hi - w.y); // the upper lid's shadow
      eMask = m; eShade = sh; eEdge = ed; eX = hue + 0.3 * t01;
    }
    void main() {
      vec2 s0 = spot(); side = s0.x < 0.0 ? -1.0 : 1.0; px = 2.0 / size.y;
      eMask = 0.0; eX = 0.0; eShade = 0.0; eEdge = 0.0; rim = 0.0; dark = 0.0; form = 0.0;
      vec2 p = vec2(abs(s0.x), s0.y - mid); // folded about the upright middle line; mid is the point everything grows out of
      vec3 f0 = flowed(p / flowIs.x + vec2(0.0, 3.0), flowAt), f1 = flowed(p / flowIs.z + vec2(5.0, 9.0), flowAt + 7.0);
      float still = smoothstep(0.0, 0.22, p.x); // nothing is carried across the middle line, so shapes on it close up whole
      vec2 carried = (f0.xy * flowIs.x * flowIs.y + f1.xy * flowIs.z * flowIs.w) * vec2(still, 1.0);
      float stuff = f0.z * flowIs.y + f1.z * flowIs.w, hold = 0.0;
      vec2 pw = p + carried * melt;
      for (int i = 0; i < 4; i++) {
        vec4 A = bA[i], B = bB[i], C = bC[i], D = bD[i];
        if (A.z < 0.004) continue;
        float S = A.y;
        vec2 u = vec2(pw.x, pw.y - A.x) / S, ue = vec2(p.x, p.y - A.x) / S; // the land melts with the flow; the eyes are not carried by it (ue), or in a break they would be bent into slanted wedges
        if (dot(u, u) > 16.0) continue; // too far from this one for it to matter (its head is under a thousandth there)
        float head = exp(-(u.x * u.x + u.y * u.y / (C.x * C.x)) * 0.9); // the lie of the land: a head, a ridge down the middle, a mouth, ears (the sockets come with the eyes)
        float nose = exp(-(u.x * u.x * 38.0 + (u.y + 0.16) * (u.y + 0.16) * 7.0));
        float my = u.y + 0.6 - 0.45 * u.x * u.x;
        float mouth = exp(-(my * my * 70.0 + u.x * u.x * 6.0));
        vec2 ev = u - vec2(0.6, 0.86 * C.x);
        float ear = exp(-(ev.x * ev.x * 14.0 + ev.y * ev.y * 5.0));
        form += A.z * (0.55 * head + 0.45 * nose - 0.75 * C.y * mouth + 0.7 * C.z * ear);
        hold = max(hold, A.z * exp(-dot(u, u) * 0.55));
        rim = max(rim, 0.8 * clear * C.y * A.z * exp(-(my * my * S * S) / (px * px * 5.0 + S * S * 0.00008)) * (1.0 - smoothstep(0.17, 0.3, u.x))); // the line of the mouth
        for (int e = 0; e < 3; e++) { // its own pair of eyes, a smaller pair on the brow, and a round pair far out at the sides like the eye spots on a moth's wings (one loop and not three calls: the card is ready with the sum much sooner)
          vec2 at = e == 0 ? vec2(A.w, B.w) : e == 1 ? vec2(A.w * 0.5, B.w + 0.47) : vec2(1.32, -0.08);
          vec4 how = e == 0 ? vec4(B.x, B.y, B.z, D.x) : e == 1 ? vec4(B.x * 0.5, D.y, D.w, 0.6) : vec4(B.x * 1.25, D.z, 0.0, 1.0); // eye size, lid, tilt, how round
          eye(ue - at, how.x, how.y, how.z, how.w, S, e == 0 ? A.z : A.z * step(0.02, how.y), C.w + 0.33 * float(e));
        }
      }
      float calmed = hold * clear; // the flow is calmed near a face that is clear, so its lines are clean
      float H = stuff * (1.0 - 0.7 * calmed) + form * (0.35 + 1.25 * clear);
      float wave = 0.5 + 0.5 * cos((H * bandsN - crawl) * 6.2831853);
      float keep = (1.0 - smoothstep(0.3, 0.7, (abs(dFdx(H)) + abs(dFdy(H))) * bandsN)) * (1.0 - rush); // lines too fine for the dots they are drawn with go over to their even grey and never shimmer; so do all of them, part of the way, while the picture rushes inwards after a drop (lines sweeping past would make the whole picture flutter)
      float relief = 1.0 - clamp(dFdy(H) / px * 0.18, -0.45, 0.45); // lit from above, so the land looks carved
      float shade = (0.2 + 0.8 * mix(0.375, wave * wave, keep)) * (0.55 + 0.45 * smoothstep(-0.9, 0.9, H)) * (1.0 - dark * clear) * relief;
      float edge = glow * 0.5 * mix(0.1, pow(wave, 12.0), keep) * (0.3 + 0.7 * calmed);
      shade = mix(shade, eShade, eMask); edge = mix(edge, eEdge, eMask) + rim * (0.25 + 0.5 * clear) * glow * (1.0 - eMask * 0.6);
      color = lit((eMask > 0.5 ? eX : H * 0.21) + time * 0.03, shade, edge);
    }
`;
  const FACES_COUNT = 4, FACES_LEVEL = Math.log(3.3), FACES_SMALL = 0.07; // four beings alive at once, each 3.3 times the size of the one inside it; the newest is born 0.07 of half the picture's height across (less in an upright picture)
  let facesIs = null, facesSum = null; // what is kept from frame to frame, and the sum by hand: both made the first time they are wanted
  function facesLooks(b) { // a new being's own proportions: every one comes out a different mask or creature
    b.apart = rnd(0.34, 0.5); b.eye = rnd(0.13, 0.2); b.tilt = rnd(-0.14, 0.14); b.eyesUp = rnd(0.04, 0.32); b.long = rnd(0.78, 1.55);
    b.mouth = rnd(0, 1) < 0.7 ? rnd(0.5, 1) : 0; b.ears = rnd(0, 1) < 0.5 ? rnd(0.5, 1) : 0; b.hue = rnd(0, 1); b.blink = rnd(1, 6);
    b.round = rnd(0, 1) < 0.3 ? 1 : rnd(0, 0.3);
    if (b.round === 1) b.tilt = 0; else b.eye = Math.min(b.eye, (b.apart - 0.07) / 1.6); // (almond eyes are 1.6 eye sizes from middle to corner: the pair must not meet over the nose)
    b.brow = rnd(0, 1) < 0.6 ? 1 : 0; b.wing = rnd(0, 1) < 0.7 ? 1 : 0; b.lid = b.browLid = b.wingLid = b.open = b.more = b.most = 0;
  }
  function facesStep() { // once a frame: moves everything on by the clock, and leaves in "told" the numbers the card and the sum by hand are both given
    if (!facesIs) {
      const none = [0, 0, 0, 0], one = () => [1, [0]], four = () => [4, new Float32Array(16)];
      facesIs = { z: 0, clarity: 0.3, flowAt: rnd(0, 50), crawl: 0, swell: 0, lit: 0, gx: 0, gy: 0, lookX: 1, lookY: 0, peek: 0, hush: 0, stepped: -1, beings: [],
        told: { bA: four(), bB: four(), bC: four(), bD: four(), flowIs: [4, [0, 0, 0, 0]], gaze: [3, [0, 0, 0]], clear: one(), melt: one(), mid: one(), flowAt: one(), swell: one(), bandsN: one(), crawl: one(), rush: one(), light: one(),
          roam: [4, none], roam2: [4, none], breath: [4, none], folds: [4, none], thump: [4, none], snap: [4, none] } }; // (the fractals' breath, their fold and a hard kick's ring are told to keep out: this picture has a fold of its own, and a face that is bent stops being one)
      for (let k = 0; k < FACES_COUNT; k++) { const b = { age: 0 }; facesLooks(b); facesIs.beings.push(b); }
    }
    const F = facesIs, told = F.told;
    if (F.stepped === sound.t) return F; // (a frame can draw the picture twice, when the effect or its version changes: one step is enough)
    F.stepped = sound.t;
    const dt = Math.min(Math.max(sound.dt, 0) || 0, 0.1), aspect = w / h, narrow = Math.min(1, aspect), towards = (rate) => 1 - Math.exp(-dt * rate), ramp = (a, b, x) => eased(clamp((x - a) / (b - a)));
    const drop = clamp(3 * flow.drop - 2), plunge = drop * drop * (1 - drop); // the drop as this picture feels it: all there as it lands and gone four seconds on (the song's own lingers for twelve). The plunge inwards starts a moment after it lands, not on it
    // the one number: how clear the forms are
    F.hush = flow.part === "calm" ? F.hush + dt : 0; // how long it has been quiet. Music with no kick at all is one long break: after the first quarter of a minute of it the faces surface by themselves and sink again, like a slow tide
    if (F.hush > 16 + 40) F.hush -= 40; // (one tide on, the count starts the next: it never grows without end)
    const tide = F.hush > 16 ? 0.5 - 0.5 * Math.cos((TAU * (F.hush - 16)) / 40) : 0;
    const aim = Math.max(flow.drop, flow.part === "calm" ? 0.08 + 0.2 * flow.intensity + 0.42 * tide : flow.part === "build" ? 0.3 + 0.6 * flow.build : 0.4 + 0.45 * flow.intensity);
    if (flow.part === "build" && aim > F.clarity) F.clarity += Math.min(aim - F.clarity, dt * 0.1); // through a build it climbs steadily, so one pair of eyes opens after another all the way up to the drop (the song follower's own "build" is full within two seconds)
    else F.clarity += (aim - F.clarity) * towards(aim > F.clarity ? 1.4 : 0.45); // otherwise quickly clearer, slowly back: a break lets the faces melt over four seconds or so
    const c = F.clarity;
    // travel inwards: a face's worth every fourteen seconds or so in the groove, slower in a break, quicker through a build, a plunge after the drop; it lingers when a face is at its best size
    F.z = (F.z + dt * ((0.035 + 0.11 * flow.intensity) * (1 + 0.8 * flow.build) * (1 - 0.75 * Math.cos(TAU * (F.z - 0.6))) + 1.8 * plunge)) % FACES_COUNT;
    F.flowAt = (F.flowAt + dt * (0.12 + 0.2 * flow.intensity + 0.25 * sound.bass)) % (100 * Math.PI); // every speed in the flow is a whole number of fiftieths, so it comes round whole at 100 pi and the number stays small enough for the card
    F.crawl = (F.crawl + dt * (0.1 + 0.35 * flow.intensity)) % 1; // the lines crawl outwards
    F.swell += (sound.kick - F.swell) * towards(14); // the kick, softened: the iris swells with it
    F.lit += (drop - F.lit) * towards(drop > F.lit ? 8 : 30); // the drop, coming up over a quarter of a second: its light, the softening of the lines and the wide pupils are an event, not a flash
    F.lookX = (F.lookX + dt * 0.23) % TAU; F.lookY = (F.lookY + dt * 0.31) % TAU; F.peek = (F.peek + dt * 0.4) % TAU;
    const lock = ramp(0.45, 0.9, c); // the gaze wanders while the faces are dim, and settles straight on you as they clear
    F.gx += ((1 - lock) * 0.9 * Math.sin(F.lookX) - F.gx) * towards(3); F.gy += ((1 - lock) * 0.6 * Math.sin(F.lookY) - F.gy) * towards(3);
    const fit = Math.max(0.4, Math.min(1, 0.8 * aspect)), stack = V.stack ?? 0, mid = 0.69 * stack, below = stack / (1 - Math.exp(-FACES_LEVEL)); // fit: in an upright picture every face is smaller, so the pair of eyes a face lingers at still fits across it. stack 0: each face inside the last, about the middle. 0.8: each on the last one's crown, a totem that narrows to a point above the middle (mid: how far above; below: how far under that point a being sits, in its own sizes)
    const inside = (S, across, up, size) => ((across + size) * S < aspect && Math.abs(mid + (up - below) * S) + size * S < 1 ? 1 : 0); // whether an eye of a being of size S is whole inside the picture: how far it is from the middle line, how far up the face, and how big
    const A = told.bA[1], B = told.bB[1], C = told.bC[1], D = told.bD[1];
    for (let k = 0; k < FACES_COUNT; k++) {
      const b = F.beings[k], age = (((F.z - k) % FACES_COUNT) + FACES_COUNT) % FACES_COUNT, o = k * 4; // 0 when born, 4 when it has grown out of sight
      if (age < b.age) facesLooks(b); // born again, as somebody else
      b.age = age;
      const S = FACES_SMALL * fit * Math.exp(FACES_LEVEL * age), there = ramp(0, 0.7, age) * (1 - ramp(2.85, 3.5, age));
      const awake = age > 0.35 && age < 2.8 + 0.25 * F.lit ? inside(S, b.apart, b.eyesUp, 0.9 * b.eye) : 0; // a face that has grown so far that an iris would reach the edge of the picture shuts its eyes (as quickly as a blink) and then fades; the biggest one holds them open a little longer while the drop's light is up
      const opens = 0.26 + 0.06 * (k % 3); // one pair first, then the next: never a half-shut stare, an eye is open or it is shut
      if (c > opens + 0.03) b.open = 1; else if (c < opens - 0.03) b.open = 0;
      const peek = c > 0.1 && Math.sin(F.peek + k * 2.1) > 0.88; // in the quiet one peeks now and then: about two and a half seconds in every sixteen
      let lid = (b.open || peek ? 1 + 0.12 * F.lit : 0) * awake;
      b.blink -= dt; // a blink takes a third of a second and comes every few seconds, each being in its own time
      if (flow.dropHit) b.blink = rnd(1.5, 4); // nobody blinks as the drop lands
      if (b.blink < -0.34) b.blink = rnd(2.5, 7); else if (b.blink < 0) lid *= 1 - Math.sin((Math.PI * -b.blink) / 0.34) ** 2;
      b.lid += (lid - b.lid) * towards(lid > b.lid ? 5 : 10);
      if (c > 0.76) b.more = 1; else if (c < 0.68) b.more = 0; // the further pairs open when it is clearer still: the brow pair first, the wing pair near the height. Open or shut, as the first pair is
      if (c > 0.88) b.most = 1; else if (c < 0.8) b.most = 0;
      const prime = age > 0.9 && age < 2.6 ? Math.min(1, lid) : 0, shut = Math.min(1, b.lid); // the further eyes are for the faces of a good size, and only while the first pair is open
      const brow = b.brow * b.more * prime * (stack < 0.3 ? 1 : 0) * inside(S, b.apart * 0.5, b.eyesUp + 0.47, 0.5 * b.eye), wing = b.wing * b.most * prime * inside(S, 1.32, -0.08, 1.3 * b.eye); // (in a totem the next face sits where the brow pair would; and each pair only while it is whole inside the picture)
      b.browLid += (brow - b.browLid) * towards(brow > b.browLid ? 5 : 10);
      b.wingLid += (wing - b.wingLid) * towards(wing > b.wingLid ? 4 : 10);
      A[o] = -below * S; A[o + 1] = S; A[o + 2] = there; A[o + 3] = b.apart;
      B[o] = b.eye * (1 + 0.04 * F.swell * narrow); B[o + 1] = b.lid; B[o + 2] = b.tilt * shut - 0.16 * (1 - shut); B[o + 3] = b.eyesUp; // a half-shut eye's outer corner droops: sleepy, never a glare
      C[o] = b.long; C[o + 1] = b.mouth; C[o + 2] = b.ears; C[o + 3] = b.hue;
      D[o] = b.round; D[o + 1] = b.browLid; D[o + 2] = b.wingLid; D[o + 3] = (0.5 * b.tilt + 0.2) * Math.min(1, b.browLid) - 0.16 * (1 - Math.min(1, b.browLid)); // (the brow pair's own tilt: it droops as it shuts, like the first pair)
    }
    for (let l = 0; l < 2; l++) { const f = (F.z + l * 0.5) % 1; told.flowIs[1][l * 2] = 0.55 * Math.exp(FACES_LEVEL * (f - 0.5)); told.flowIs[1][l * 2 + 1] = Math.sin(Math.PI * f) ** 2; } // two layers of the stuff, one fading in small as the other fades out big, so the travel has no seam
    told.gaze[1][0] = F.gx; told.gaze[1][1] = F.gy; told.gaze[1][2] = 0.42 + 0.16 * F.lit - 0.1 * F.swell; // the dark middle: wide on the drop, a little smaller on each kick
    told.clear[1][0] = c; told.melt[1][0] = 0.03 + 0.4 * (1 - ramp(0, 0.55, c)); told.mid[1][0] = mid; told.flowAt[1][0] = F.flowAt; told.swell[1][0] = F.swell * narrow; told.bandsN[1][0] = Math.round(V.bands ?? 5); told.crawl[1][0] = F.crawl;
    told.rush[1][0] = 0.6 * Math.max(F.lit * F.lit, Math.min(1, 6.75 * plunge));
    told.light[1][0] = 0.78 + 0.1 * F.swell * narrow + 0.14 * F.lit; // the kick through the same soft follower as the iris: a breath of light on the beat, a twentieth or so, not a flash; and less of it in an upright picture, where a face fills more of what there is
    return F;
  }
  function facesByHand() { // the same sum by hand, line for line with the card's. Gives back a function that takes this frame's numbers and hands byHand() its sum: (across, up, dot) fills dot.x (how far round the colors), dot.shade and dot.edge
    const ROW = 128, row = new Float32Array(ROW), keptX = new Float64Array(ROW / 2), keptShade = new Float32Array(ROW / 2), keptEdge = new Float32Array(ROW / 2), turns = new Float32Array(16); // (byHand asks for the dots in reading order, 128 to a row: this counts on it)
    let bA, bB, bC, bD, flowIs, gaze, clear = 0, melt = 0, mid = 0, flowAt = 0, swell = 0, bandsN = 5, crawl = 0, rush = 0, count = 0, before = 0, calmed = 0;
    let px = 0, eMask = 0, eX = 0, eShade = 0, eEdge = 0, rim = 0, dark = 0, form = 0, fx = 0, fy = 0, fz = 0;
    const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }, blend = (a, b, t) => a + (b - a) * t, small = (a) => (a > 14 ? 0 : Math.exp(-a)); // small: e to the minus a, not worked out where it is under a millionth
    const sine = (x) => { x *= 0.15915494309189535; x -= Math.floor(x + 0.5); const y = x * (8 - 16 * Math.abs(x)); return y * (0.775 + 0.225 * Math.abs(y)); }; // the sine to a thousandth, five times quicker than the real one: the flow takes twenty a dot
    const flowed = (x, y, at) => {
      let qx = x, qy = y;
      for (let k = 1; k <= 4; k++) { const a = 0.62 / k, r = 1.25 * k, s = 1 + 0.2 * k, nx = qx + a * sine(qy * r + 1.7 * k + at * 0.9 * s); qy += a * sine(qx * r + 4.1 * k + at * 0.7 * s); qx = nx; }
      fx = qx - x; fy = qy - y; fz = 0.5 * (sine(qx * 1.7) + sine(qy * 1.3));
    };
    const eye = (vx, vy, er, lid, ct, st, roundness, S, there, hue) => {
      const d2 = (vx * vx + vy * vy) / (er * er);
      if (d2 > 9 || there < 0.004) return;
      const fade = 1 - d2 / 9;
      form += there * (0.35 + 0.65 * Math.min(lid * 3, 1)) * Math.exp(-d2 / 2.6) * fade * fade;
      const wx = vx * ct + vy * st, wy = vy * ct - vx * st;
      const X = wx / (er * blend(1.6, 1, roundness)), in1 = Math.max(0, 1 - X * X), arch = blend(in1, Math.sqrt(in1), roundness);
      const lo = -er * blend(0.42, 0.98, roundness) * arch, hi = blend(lo, er * 0.98 * arch, lid);
      const din = Math.min(wy - lo, hi - wy) * S, soft = px * 1.5, fine = soft / (S * er);
      const m = sstep(0, soft, din) * (in1 >= 0.0001 ? 1 : 0) * sstep(0.25, 0.7, there);
      if (in1 > 0) rim = Math.max(rim, small((din * din) / (soft * soft * 2.5 + S * S * er * er * 0.004)) * sstep(0, 0.08, in1) * there);
      dark = Math.max(dark, there * Math.exp(-d2 / 2.4) * fade * (0.15 + 0.5 * lid));
      if (m <= eMask) return;
      const ix = wx / er, iy = (wy - gaze[1] * er * 0.22) / er; // (by hand the eyes do not glance sideways: see below)
      const rr = Math.hypot(ix, iy), ir = 0.84 * (1 + 0.1 * swell), pr = ir * gaze[2];
      const fibre = 0.5 + 0.5 * Math.sin(Math.atan2(iy, ix) * 22 + Math.sin(rr * 26) * 1.2);
      const inIris = 1 - sstep(ir - fine, ir + fine, rr), inPupil = 1 - sstep(pr - fine, pr + fine, rr);
      const t01 = clamp((rr - pr) / Math.max(ir - pr, 0.001));
      let sh = (0.5 + 0.55 * (1 - t01) + 0.3 * fibre * t01) * (1 - 0.8 * sstep(0.8, 1, t01));
      sh = blend(blend(0.13, sh, inIris), 0.012, inPupil) * blend(1, 0.6, inIris * (1 - inPupil));
      let ed = blend(0.07, 0.3 + 0.25 * fibre * (1 - t01), inIris) * (1 - inPupil);
      ed += 1.5 * (1 - sstep(0.11, 0.15 + fine, Math.hypot(ix + 0.27, iy - 0.3)));
      ed += 0.5 * (1 - sstep(0.04, 0.07 + fine, Math.hypot(ix - 0.3, iy + 0.3)));
      sh *= 0.4 + 0.6 * sstep(0, er * 0.55, hi - wy);
      eMask = m; eShade = sh; eEdge = ed; eX = hue + 0.3 * t01;
    };
    const land = (x, y) => { // how high the land is at a dot; what an eye there looks like is left in eMask, eX, eShade and eEdge, and the lids' rim and the sockets' shadow in rim and dark
      eMask = eX = eShade = eEdge = rim = dark = form = 0;
      flowed(x / flowIs[0], y / flowIs[0] + 3, flowAt);
      let cx = fx * flowIs[0] * flowIs[1], cy = fy * flowIs[0] * flowIs[1], stuff = fz * flowIs[1], hold = 0;
      flowed(x / flowIs[2] + 5, y / flowIs[2] + 9, flowAt + 7);
      cx += fx * flowIs[2] * flowIs[3]; cy += fy * flowIs[2] * flowIs[3]; stuff += fz * flowIs[3];
      const wx = x + cx * sstep(0, 0.22, x) * melt, wy = y + cy * melt;
      for (let i = 0; i < 16; i += 4) {
        const there = bA[i + 2];
        if (there < 0.004) continue;
        const S = bA[i + 1], ux = wx / S, uy = (wy - bA[i]) / S, vx = x / S, vy = (y - bA[i]) / S, long = bC[i], mouthIs = bC[i + 1];
        if (ux * ux + uy * uy > 16) continue;
        const head = small((ux * ux + (uy * uy) / (long * long)) * 0.9), nose = small(ux * ux * 38 + (uy + 0.16) * (uy + 0.16) * 7);
        const my = uy + 0.6 - 0.45 * ux * ux, mouth = small(my * my * 70 + ux * ux * 6), ex = ux - 0.6, ey = uy - 0.86 * long, ear = small(ex * ex * 14 + ey * ey * 5);
        form += there * (0.55 * head + 0.45 * nose - 0.75 * mouthIs * mouth + 0.7 * bC[i + 2] * ear);
        hold = Math.max(hold, there * small((ux * ux + uy * uy) * 0.55));
        if (ux < 0.3 && mouthIs > 0) rim = Math.max(rim, 0.8 * clear * mouthIs * there * small((my * my * S * S) / (px * px * 5 + S * S * 0.00008)) * (1 - sstep(0.17, 0.3, ux)));
        eye(vx - bA[i + 3], vy - bB[i + 3], bB[i], bB[i + 1], turns[i], turns[i + 1], bD[i], S, there, bC[i + 3]);
        if (bD[i + 1] >= 0.02) eye(vx - bA[i + 3] * 0.5, vy - bB[i + 3] - 0.47, bB[i] * 0.5, bD[i + 1], turns[i + 2], turns[i + 3], 0.6, S, there, bC[i + 3] + 0.33);
        if (bD[i + 2] >= 0.02) eye(vx - 1.32, vy + 0.08, bB[i] * 1.25, bD[i + 2], 1, 0, 1, S, there, bC[i + 3] + 0.66);
      }
      calmed = hold * clear;
      return stuff * (1 - 0.7 * calmed) + form * (0.35 + 1.25 * clear);
    };
    const sum = (across, up, dot) => {
      const at = count % ROW, line = (count++ - at) / ROW, sparse = dot.half > 48 ? 2 : 1; // sparse: an upright picture has several times the rows of a wide one, so there every other row is the row above once more, which halves the work again
      if (at >= ROW / 2) { const m = ROW - 1 - at; dot.x = keptX[m]; dot.shade = keptShade[m]; dot.edge = keptEdge[m]; return; } // the right half is the left half in a mirror, which halves the work (so by hand the eyes look up and down but never sideways)
      if (line % sparse) { dot.x = keptX[at]; dot.shade = keptShade[at]; dot.edge = keptEdge[at]; return; }
      px = 1 / dot.half;
      const x = Math.abs(across), y = up - mid;
      if (!line) row[at] = land(x, y + px * sparse); // the slope comes from the dot before and the dot above; the top row and the first dot of a row have none, so there the land is worked out once more a dot away
      if (!at) before = land(x + px, y);
      const H = land(x, y), wave = 0.5 + 0.5 * Math.cos((H * bandsN - crawl) * TAU), across1 = H - before, up1 = (row[at] - H) / sparse;
      row[at] = before = H;
      const keep = (1 - sstep(0.3, 0.7, (Math.abs(across1) + Math.abs(up1)) * bandsN)) * (1 - rush), relief = 1 - Math.max(-0.45, Math.min(0.45, (up1 / px) * 0.18));
      const shade = (0.2 + 0.8 * blend(0.375, wave * wave, keep)) * (0.55 + 0.45 * sstep(-0.9, 0.9, H)) * (1 - dark * clear) * relief, edge = dot.glow * 0.5 * blend(0.1, wave ** 12, keep) * (0.3 + 0.7 * calmed);
      dot.x = (eMask > 0.5 ? eX : H * 0.21) + dot.t * 0.03;
      dot.shade = blend(shade, eShade, eMask);
      dot.edge = blend(edge, eEdge, eMask) + rim * (0.25 + 0.5 * clear) * dot.glow * (1 - eMask * 0.6);
      keptX[at] = dot.x; keptShade[at] = dot.shade; keptEdge[at] = dot.edge;
    };
    return (told) => {
      bA = told.bA[1]; bB = told.bB[1]; bC = told.bC[1]; bD = told.bD[1]; flowIs = told.flowIs[1]; gaze = told.gaze[1];
      clear = told.clear[1][0]; melt = told.melt[1][0]; mid = told.mid[1][0]; flowAt = told.flowAt[1][0]; swell = told.swell[1][0]; bandsN = told.bandsN[1][0]; crawl = told.crawl[1][0]; rush = told.rush[1][0]; count = 0;
      for (let i = 0; i < 16; i += 4) { turns[i] = Math.cos(bB[i + 2]); turns[i + 1] = Math.sin(bB[i + 2]); turns[i + 2] = Math.cos(bD[i + 3]); turns[i + 3] = Math.sin(bD[i + 3]); } // the cosine and sine of each being's two tilted pairs of eyes, worked out once and not at every dot
      return sum;
    };
  }
  function faces() { // faces in things: a face inside a face inside a face, growing out of flowing stuff, with eyes that open as the song gathers
    const told = facesStep().told;
    trippyOn(); // the fractals' travelling colors come along (their breath and their fold do not)
    told.roam = trippy.values.roam; told.roam2 = trippy.values.roam2;
    if (onCard("faces", FACES_SUM, told)) return;
    const theirs = trippy.values;
    trippy.values = told; // byHand takes the travelling colors, the breath and the fold from here, so for this one picture it is handed ours (no breath, no fold) and then the fractals' own are put back
    byHand((facesSum ??= facesByHand())(told), told.light[1][0]);
    trippy.values = theirs;
  }
  /* ==== faces: end ==== */
  /* ==== forms: begin ==== */
  /* Forms: the shapes people see with their eyes shut early in a trip, much the same for everybody: tunnels, spirals, rays, honeycombs, lattices and cobwebs, each flowing into the next.
     They are all one sum. Every dot is taken to a place where a ring round the middle is a straight line and so is a ray out of it (how far out, as a logarithm, and how far round), and up to
     four plain waves are laid there. A glowing line runs where the waves' sum crosses a level, and the cells between the lines are softly lit. One wave is stripes: rings, a spiral or rays, by
     which way it lies. Two at right angles are a lattice of squares, three a third of a turn apart a honeycomb, and the sum and the difference of two are a cobweb of rings and rays. So any
     pattern becomes any other by gliding the numbers, with no cut. Only the count of arms round the middle can't glide: it has to be a whole number or the picture tears along a ray. It changes
     by a front, a ring of forks that sweeps through the picture with the old count on one side of it and the new one on the other. Drifting outwards is flying down the tunnel, and since the
     tunnel has no far end nothing ever has to start again. The card does the sum (FORMS_SUM); where there is no card the same sum is done here for a small picture (formsDot). */
  const FORMS_SUM = `
    uniform vec2 turn;            // the picture's turn (cos, sin)
    uniform vec4 wave;            // for the two waves: rings per step outwards, and how far along each has drifted
    uniform vec2 arms;            // arms round the middle for the two waves (whole numbers)
    uniform vec4 frontA, frontB;  // for each wave a front on its way: which side of it is new (-1, 0 for no front, 1), how many arms it adds, how far out it is, how sharp
    uniform vec4 lit4;            // how strongly each of the four waves is lit
    uniform vec4 look;            // the level the lines run along, the third wave's shift, the lines' half width, how bright the cells are
    uniform vec4 grow;            // how bent, the bend's two clocks, and the kick's push outwards
    uniform vec3 hue;             // where the colors are, how fast they go round with depth, and how much with the pattern
    uniform vec4 veil;            // a second layer over the first: how strong, how many times finer, its own drift, its turn
    const float U0 = -1.0;        // the rings stretch and tighten about this depth, a third of the way out, so a change of spacing doesn't sweep the whole picture
    vec3 form(vec2 p, vec2 bendBy, float scale, float drift) {   // one layer: x is the lines' glow, y the cells' light, z how far round the colors
      float r = max(length(p), 1e-5), px = 2.0 / (size.y * r);
      float u = log(r) - grow.w + bendBy.x, v = atan(p.y, p.x) + bendBy.y;
      vec2 g1 = vec2(wave.x, arms.x) * scale, g2 = vec2(wave.y, arms.y) * scale;
      float f1 = g1.x * (u - U0) + g1.y * v + wave.z * scale + drift, f2 = g2.x * (u - U0) + g2.y * v + wave.w * scale;
      float cap1 = 2.0 * max(length(g1), 3.0), cap2 = 2.0 * max(length(g2), 3.0);
      if (frontA.x != 0.0) { float a = exp(clamp(frontA.w * (u - frontA.z), -30.0, 30.0)), th = frontA.y * scale * v; vec2 w = a * vec2(cos(th), sin(th)), d = vec2(1.0 + w.x, w.y), q = vec2(dot(w, d), w.y) / max(dot(d, d), 1e-6);
        f1 += frontA.x * atan(w.y, 1.0 + w.x); g1 += frontA.x * vec2(frontA.w * q.y, frontA.y * scale * q.x); }   // inside the front's ring the wave is left alone, outside it gains the arms, and on the ring are the forks where one stripe becomes two
      if (frontB.x != 0.0) { float a = exp(clamp(frontB.w * (u - frontB.z), -30.0, 30.0)), th = frontB.y * scale * v; vec2 w = a * vec2(cos(th), sin(th)), d = vec2(1.0 + w.x, w.y), q = vec2(dot(w, d), w.y) / max(dot(d, d), 1e-6);
        f2 += frontB.x * atan(w.y, 1.0 + w.x); g2 += frontB.x * vec2(frontB.w * q.y, frontB.y * scale * q.x); }
      vec2 g3 = g1 + g2, g4 = g1 - g2;
      float f3 = f1 + f2 + look.y, f4 = f1 - f2;
      vec4 a = lit4 * (1.0 - smoothstep(0.5, 1.6, vec4(length(g1), length(g2), length(g3), length(g4)) * px));   // a wave finer than the picture can show goes flat: down at the far end of the tunnel, and in the two or three dots at the heart of a fork
      float whole = lit4.x + lit4.y + lit4.z + lit4.w + 1e-4, there = (a.x + a.y + a.z + a.w) / whole;
      float s = a.x * cos(f1) + a.y * cos(f2) + a.z * cos(f3) + a.w * cos(f4);
      g1 *= min(1.0, cap1 / max(length(g1), 1e-4)); g2 *= min(1.0, cap2 / max(length(g2), 1e-4)); g3 = g1 + g2; g4 = g1 - g2;   // for the lines a wave's slope counts no more than twice what it is away from a front, so a line keeps its body into a fork instead of thinning to a hair
      vec4 plain = lit4 * (1.0 - smoothstep(0.5, 1.6, vec4(length(g1), length(g2), length(g3), length(g4)) * px));
      float lines = (plain.x + plain.y + plain.z + plain.w) / whole;   // how much of the lines is left: like there, but not dying in the heart of a fork, so a line runs on through it
      vec2 gs = a.x * sin(f1) * g1 + a.y * sin(f2) * g2 + a.z * sin(f3) * g3 + a.w * sin(f4) * g4;
      float off = s - look.x * there, bowl = a.x * dot(g1, g1) + a.y * dot(g2, g2) + a.z * dot(g3, g3) + a.w * dot(g4, g4);   // bowl: how fast the slope itself changes, which is what tells the distance where the slope is nothing (a crossing of lines, the middle of a cell)
      float d = abs(off) / sqrt(dot(gs, gs) + 0.5 * bowl * abs(off) + 1e-6), wide = max(look.z / scale, 1.2 * px);
      float edge = lines / (1.0 + d * d / (wide * wide));
      float cell = look.w * (0.25 + 0.75 * smoothstep(-0.35, 1.1, off / whole * 2.0)) * there + 0.3 * (1.0 - there);   // where the waves have gone flat, their middle light
      return vec3(edge, cell, hue.x + hue.y * u + hue.z * s / whole);
    }
    void main() {
      vec2 p0 = spot(), p = mul(p0, turn);
      vec2 bendBy = grow.x * vec2(sin(1.9 * p0.x + 1.3 * p0.y + grow.y) + 0.6 * sin(2.3 * p0.y - 1.1 * p0.x + 1.7 * grow.z + 2.0) + 0.4 * sin(2.9 * p0.x - 0.7 * p0.y - 0.6 * grow.y + 4.0),
                                  sin(1.6 * p0.y - 1.4 * p0.x + grow.z + 1.0) + 0.6 * sin(2.6 * p0.x + 0.9 * p0.y - 1.3 * grow.y + 3.0) + 0.4 * sin(3.1 * p0.y + 0.5 * p0.x + 0.7 * grow.z + 5.0));   // bent a little, slowly, by where the dot is in the picture, so it looks grown and not ruled
      vec3 one = form(p, bendBy, 1.0, 0.0);
      float far = 0.45 + 0.55 * smoothstep(0.0, 0.7, length(p0));   // a little darker down the tunnel
      vec4 c = lit(one.z, one.y * far, glow * one.x * (0.35 + 0.65 * far));
      if (veil.x > 0.0) { vec3 two = form(mul(p, vec2(cos(veil.w), sin(veil.w))), bendBy * 0.5, veil.y, veil.z); c.rgb += veil.x * 0.8 * glow * two.x * light * pal(two.z + 0.33); }   // the second layer: lines only, a third of the way round the colors from the first, added so the first shows through
      color = c;
    }
`;
  const FORM_PATTERNS = { // for each pattern: which of the four waves are lit, the level its lines run along, how wide the lines are (as a share of the pattern's fineness) and how bright the cells. The three made of stripes also say how many rings there are to an arm, whether there are arms at all, and how fast they roll round
    tunnel: { lit: [1, 0, 0, 0], level: 0, line: 0.3, cell: 0.55, rings: 1.7, armed: 0, roll: 0 },
    spiral: { lit: [1, 0, 0, 0], level: 0, line: 0.3, cell: 0.55, rings: 0.8, armed: 1, roll: 0 },
    rays: { lit: [1, 0, 0, 0], level: 0, line: 0.3, cell: 0.55, rings: 0, armed: 1, roll: 0.9 },
    honeycomb: { lit: [1, 1, 1, 0], level: -0.68, line: 0.27, cell: 0.6, six: true },
    lattice: { lit: [1, 1, 0, 0], level: 0, line: 0.24, cell: 0.55 },
    cobweb: { lit: [0, 0, 1, 1], level: 0, line: 0.17, cell: 0.3 },
  };
  const FORM_NAMES = Object.keys(FORM_PATTERNS), FORM_SHARP = 3, FORM_ROOT3 = Math.sqrt(3); // (how sharp a front is: its forks take about a third of a step outwards to heal on either side)
  const formsKept = { started: false, stepped: -1, pattern: "tunnel", before: "", dial: "", since: 0, sinceDrop: 9, tight: 0, loose: 0, burst: 0, // what it keeps between frames: which pattern, the one before it, what the version's dial last said, how long this pattern has been showing, and how wound up the song has it
    rings: [10, 0], arms: [0, 6], fine: 10, fine4: [10, 6, 12, 12], lit: [1, 0, 0, 0], level: 0, line: 0.3, cell: 0.55, roll: 0, way: 1, bend: 0.5, veil: 0, spin: 0, hue: 0, swell: 0, lift: 0, clockA: 0, clockB: 0, // the two waves as they are now, how fine the pattern is (and each of the four waves), and everything that glides
    fronts: [{ side: 0, adds: 0, gone: 0, takes: 2.6 }, { side: 0, adds: 0, gone: 0, takes: 2.6 }] }; // a front for each wave: which side of it is new (0: none on its way), how many arms it adds, how far through the picture it has got (0..1) and how long it takes
  const formsNow = { light: [0.64], turn: [1, 0], wave: [10, 0, 0, 0], arms: [0, 6], frontA: [0, 0, 0, FORM_SHARP], frontB: [0, 0, 0, FORM_SHARP], lit4: [1, 0, 0, 0], look: [0, 0, 0.03, 0.55], grow: [0, 0, 0, 0], hue: [0, 0.26, 0.12], veil: [0, 3, 0, 0] }; // what the sum is given this frame: the card's values, as FORMS_SUM names them
  const FORMS_STILL = { roam: [4, [0, 0, 0, 0]], roam2: [4, [0, 0, 0, 0]], breath: [4, [0, 0, 0, 0]], folds: [4, [0, 0, 0, 0]], thump: [4, [0, 0, 0, 0]], snap: [4, [0, 0, 0, 0]] }; // what the fractals' shared top is told so that it leaves this picture alone: no travelling colors, no breath, no fold and no ring from a hard kick. The pattern drifts, bends and breathes by itself
  const formsGive = { ...FORMS_STILL, ...Object.fromEntries(Object.entries(formsNow).map(([key, value]) => [key, [value.length, value]])) }; // the same lists as onCard wants them, and those zeros with them
  const formsToward = (now, aim, dt, takes) => now + (aim - now) * (1 - Math.exp(-dt / takes)); // gliding by the clock: a late frame only arrives, it never overshoots
  const formsRound = (x, round) => ((x % round) + round) % round; // an angle or a phase kept within its round, so nothing grows without end
  function formsTurn(pattern) { // over to another pattern, remembering the one it leaves
    const S = formsKept;
    if (S.since > 0.5) S.before = S.pattern;
    else for (let i = 0; i < 2; i++) { const f = S.fronts[i]; if (f.side && !f.gone) { if (f.side < 0) S.arms[i] -= f.adds; f.side = f.adds = 0; } } // unless it never really showed. When a version changes on a drop, the drop picks a pattern and one frame later the version's dial picks another: the one-frame pattern is not remembered, and a front it has only just sent (still out of sight) is called back
    S.pattern = pattern; S.since = 0;
  }
  function formsStep() { // moves everything on by the clock: once a frame, however often the picture is drawn
    const S = formsKept, N = formsNow, dt = Math.max(0, sound.dt), dial = FORM_PATTERNS[V.form] ? V.form : "tunnel", building = flow.part === "build" || flow.build > 0.35;
    if (!S.started) { S.pattern = S.dial = dial; S.before = ""; S.since = S.sinceDrop = 0; S.tight = S.loose = 0; } // (it starts as the version has it, and a drop in its first seconds leaves it be)
    S.since += dt; S.sinceDrop += dt;
    if (dial !== S.dial) { // the version has picked another pattern: over to it, unless a drop has only just left that very one
      S.dial = dial;
      if (dial !== S.pattern && !(S.since < 2 && dial === S.before)) formsTurn(dial);
    } else if (S.started && ((flow.dropHit && S.sinceDrop > 4) || (S.since > 30 && (!building || S.since > 60) && (sound.kickHit > 0 || S.since > 34)))) { // on to another pattern at every drop (one drop can land two or three times: once is enough), and after half a minute without one: on a kick if there is a kick, and not in the middle of a build, which a drop is about to end. Never the one showing, nor the one before it, and never three of plain stripes running: so from the tunnel it starts as, the first change is to a honeycomb, a lattice or a cobweb
      const stripes = (key) => !key || FORM_PATTERNS[key].rings !== undefined, others = FORM_NAMES.filter((key) => key !== S.pattern && key !== S.before && !(stripes(key) && stripes(S.pattern) && stripes(S.before)));
      if (flow.dropHit) S.sinceDrop = 0;
      formsTurn(others[Math.floor(Math.random() * others.length)]);
    }
    // Where the dials and the song want the two waves. The arms are whole numbers: they go up in two steps through a build and down one in a calm part, each step a front of several forks (a lone fork looks like a flaw). The rings glide, so they follow the song smoothly.
    // A build has to be well on before it counts (with no kick at all the follower's "build" sits at a quarter for ever), and each step lets go a little lower than it took hold, so a song hovering on the line doesn't send fronts to and fro
    const F = FORM_PATTERNS[S.pattern], count = Math.max(2, Math.round(V.arms || 6)), by = Math.max(2, Math.round(count / 3)), twist = Math.round(vary.aim.twist ?? V.twist ?? 0), build = flow.build; // (the twist dial glides through fractions on its way and only whole arms will do, so it is read where it is going: a change of three is then one front of three forks, not three lone forks one after another)
    S.tight = build > 0.7 ? 2 : build > 0.6 ? Math.max(S.tight, 1) : build > 0.35 ? 1 : build >= 0.3 ? Math.min(S.tight, 1) : 0;
    S.loose = flow.calm > 0.5 ? 1 : flow.calm < 0.35 ? 0 : S.loose;
    const most = Math.max(2, count + by * (S.tight - S.loose)), smooth = count * (1 + 0.67 * build - 0.3 * flow.calm);
    let rings1, rings2, arms1;
    if (F.six) { const a = (2 * smooth + twist) / FORM_ROOT3; rings1 = a; rings2 = -(a + twist * FORM_ROOT3) / 2; arms1 = twist; } // three waves a third of a turn apart: the second is the first turned, and has exactly the full count of arms
    else if (F.rings === undefined) { rings1 = smooth; rings2 = -twist; arms1 = twist; } // two waves at right angles and of the same length. The twist gives the first wave arms of its own, which winds the cells into spirals as the seeds sit in a sunflower
    else { arms1 = F.armed * (twist < 0 ? -1 : 1) * most; rings1 = F.rings * smooth; rings2 = -arms1; } // stripes: rings, or arms wound one way or the other, or rays
    const fine = Math.hypot(rings1, arms1);
    if (!S.started) { // from its first frame it is simply there
      S.started = true;
      Object.assign(S, { rings: [rings1, rings2], arms: [arms1, most], fine, lit: F.lit.slice(), level: F.level, line: F.line, cell: F.cell, roll: F.roll || 0, way: V.drift ?? 1, bend: 0.5 * (V.bends ?? 1), veil: V.veil || 0, burst: 0, swell: 0, lift: flow.drop });
      for (const f of S.fronts) f.side = f.adds = f.gone = 0;
    }
    if (flow.dropHit) { S.burst = 1.6; for (const f of S.fronts) if (f.side) f.takes = Math.min(f.takes, 0.5); } // a drop: a front already on its way is hurried through, and for a moment new ones go outwards and fast, so the wound-up pattern lets go from the middle
    S.burst = Math.max(0, S.burst - dt);
    S.way = formsToward(S.way, V.drift ?? 1, dt, 1.5); S.bend = formsToward(S.bend, 0.5 * (V.bends ?? 1), dt, 2); S.veil = formsToward(S.veil, V.veil || 0, dt, 2);
    for (let i = 0; i < 4; i++) S.lit[i] = formsToward(S.lit[i], F.lit[i], dt, 0.9);
    S.level = formsToward(S.level, F.level, dt, 0.9); S.line = formsToward(S.line, F.line, dt, 0.9); S.roll = formsToward(S.roll, F.roll || 0, dt, 1.5);
    S.cell = formsToward(S.cell, mood === "hard" ? Math.min(F.cell, 0.3) : F.cell, dt, 0.9); // red and black: there the lines carry the picture, and the cells stay dark
    const waits = (S.fronts[0].side || S.arms[0] !== arms1) && Math.abs(rings1) < 2; // going to rays from rings, the rings may not go flat before the arms have come through, or the part the front hasn't reached is left with no pattern at all
    S.rings[0] = formsToward(S.rings[0], waits ? (S.rings[0] < 0 ? -2 : 2) : rings1, dt, 2.5); S.rings[1] = formsToward(S.rings[1], rings2, dt, 2.5); // slower than the rest: a change of spacing moves every line in the picture
    S.fine = formsToward(S.fine, fine, dt, 0.9);
    const far = Math.log(Math.hypot(w / h, 1)) + 3 / FORM_SHARP, near = -4.2 - 3 / FORM_SHARP; // where a front is out of sight: past the picture's corner, and down at the tunnel's far end where the waves have gone flat
    for (let i = 0; i < 2; i++) { // the arms, which can only change by a front going through
      const f = S.fronts[i], want = i ? most : arms1, at = i ? N.frontB : N.frontA, held = !i && Math.abs(want) < Math.abs(S.arms[0]) && Math.abs(S.rings[0]) < 0.4 * Math.abs(rings1); // (and the other way, from rays to rings: the arms may not leave before the rings have come, or the picture stands nearly empty for a moment. So it winds into a spiral first)
      if (f.side) { f.gone += dt / f.takes; if (f.gone >= 1) { if (f.side > 0) S.arms[i] += f.adds; f.side = f.adds = 0; } }
      if (!f.side && S.arms[i] !== want && !held) { // send one: outwards when the picture is flowing outwards or a drop has just landed (the new count is behind it), otherwise inwards (the new count comes in from the edges). A front of one or two forks goes through quickly, or its forks read as flaws in the picture
        const out = S.burst > 0 || S.way >= 0;
        f.adds = want - S.arms[i]; f.side = out ? -1 : 1; f.gone = 0; f.takes = S.burst > 0 || Math.abs(f.adds) < 3 ? 1.3 : 2.6;
        if (out) S.arms[i] += f.adds;
      }
      at[0] = f.side; at[1] = f.adds; at[2] = f.side > 0 ? far + (near - far) * f.gone : near + (far - near) * f.gone;
    }
    const fastest = Math.max(1, S.lit[0] * Math.abs(S.rings[0]), S.lit[1] * Math.abs(S.rings[1]), S.lit[2] * Math.abs(S.rings[0] + S.rings[1]), S.lit[3] * Math.abs(S.rings[0] - S.rings[1])); // the closest-set rings of any wave that shows
    const speed = S.way * (0.1 + 0.42 * flow.intensity) * (1 + 0.5 * flow.build + 1.2 * flow.drop), quick = Math.max(1, T.speed * flow.pace), rolls = S.roll * (0.4 + flow.intensity), gone = dt * Math.sign(speed) * Math.min(Math.abs(speed), Math.max(0, (2 * TAU) / quick - rolls) / fastest); // how far it drifts this frame: quicker with the song, but never so quick that more than two stripes pass any one dot in a second, however tight the rings and however hard the drop (the rays' own slow roll is counted in). That is a second by the clock on the wall: the picture's own clock runs up to half as fast again at a drop, and the Speed knob can double it
    N.wave[0] = S.rings[0]; N.wave[1] = S.rings[1];
    N.wave[2] = formsRound(N.wave[2] - S.rings[0] * gone + dt * rolls, TAU); N.wave[3] = formsRound(N.wave[3] - S.rings[1] * gone, TAU);
    S.hue = formsRound(S.hue - 0.26 * gone + 0.03 * dt, 1); // the colors go with depth, so they travel with the drift, and turn slowly by themselves besides
    S.spin = formsRound(S.spin + dt * 0.05 * (V.spin ?? 1), TAU);
    S.clockA = formsRound(S.clockA + dt * (0.1 + 0.15 * flow.intensity), TAU * 10); S.clockB = formsRound(S.clockB + dt * (0.08 + 0.1 * flow.intensity), TAU * 10); // (ten rounds: the bend reads these clocks at several speeds, all in tenths)
    N.veil[2] = formsRound(N.veil[2] + gone * 1.7, TAU);
    S.swell = formsToward(S.swell, sound.kick, dt, sound.kick > S.swell ? 0.03 : 0.12); // the kick, softened: up in a blink but not in one frame, down in an eighth of a second
    S.lift = formsToward(S.lift, flow.drop, dt, flow.drop > S.lift ? 0.5 : 0.1); // the drop's own light comes up over half a second, not on the frame it lands: the page already flashes there
    const breathe = Math.sin(sound.t * 0.5), cells = Math.min(1, 8 / Math.max(S.fine, 1)); // (the bend and the kick's push are measured in cells: a fine lattice is bent and pushed no more cells than a coarse one, or it folds over itself)
    S.fine4[0] = Math.hypot(S.rings[0], S.arms[0]); S.fine4[1] = Math.hypot(S.rings[1], S.arms[1]); S.fine4[2] = Math.hypot(S.rings[0] + S.rings[1], S.arms[0] + S.arms[1]); S.fine4[3] = Math.hypot(S.rings[0] - S.rings[1], S.arms[0] - S.arms[1]); // how fine each of the four waves is away from any front, for the sum by hand
    N.turn[0] = Math.cos(S.spin); N.turn[1] = Math.sin(S.spin); N.arms[0] = S.arms[0]; N.arms[1] = S.arms[1];
    for (let i = 0; i < 4; i++) N.lit4[i] = S.lit[i];
    N.look[0] = S.level - 0.15 * S.swell + 0.08 * breathe; N.look[1] = 0.5 * Math.sin(sound.t * 0.23); N.look[2] = (S.line / Math.max(S.fine, 2)) * (1 + 0.5 * flow.calm + 0.25 * breathe); N.look[3] = S.cell; // on a kick the level drops, so the cells swell; in a calm part the lines are half as wide again
    N.grow[0] = 0.2 * S.bend * (1 + 0.3 * flow.calm) * cells; N.grow[1] = S.clockA; N.grow[2] = S.clockB; N.grow[3] = 0.035 * S.swell * cells;
    N.hue[0] = S.hue; N.veil[0] = S.veil; N.veil[3] = -2 * S.spin + 0.3;
    N.light[0] = 0.64 + 0.1 * S.swell + 0.12 * S.lift - 0.08 * flow.calm; // the pattern fills the picture, so the kick lights it far less than it does the Julia set, and by the softened kick
  }
  const formsLong = (x, y) => Math.sqrt(x * x + y * y); // (not Math.hypot, which is many times slower and is wanted for every dot)
  const formsFlat = (lit, fine) => { if (lit < 0.002) return 0; const k = clamp((fine - 0.5) / 1.1); return lit * (1 - k * k * (3 - 2 * k)); }; // how much of a wave is left where it is this fine (in dots); a wave that isn't lit costs nothing
  function formsDot(x, y, dot) { // the same sum by hand, for byHand: fills in how far round the colors the dot is, how bright its cell and how much of a line's glow it has. One layer only: the second would double the cost
    const N = formsNow, G = N.grow, L = N.lit4, K = formsKept.fine4, px0 = x * N.turn[0] - y * N.turn[1], py0 = x * N.turn[1] + y * N.turn[0];
    const bx = G[0] * (Math.sin(1.9 * x + 1.3 * y + G[1]) + 0.6 * Math.sin(2.3 * y - 1.1 * x + 1.7 * G[2] + 2) + 0.4 * Math.sin(2.9 * x - 0.7 * y - 0.6 * G[1] + 4));
    const by = G[0] * (Math.sin(1.6 * y - 1.4 * x + G[2] + 1) + 0.6 * Math.sin(2.6 * x + 0.9 * y - 1.3 * G[1] + 3) + 0.4 * Math.sin(3.1 * y + 0.5 * x + 0.7 * G[2] + 5));
    const r = Math.max(Math.sqrt(x * x + y * y), 1e-5), px = 1 / (dot.half * r), u = Math.log(r) - G[3] + bx, v = Math.atan2(py0, px0) + by, all = L[0] + L[1] + L[2] + L[3] + 1e-4;
    let g1x = N.wave[0], g1y = N.arms[0], g2x = N.wave[1], g2y = N.arms[1], f1 = g1x * (u + 1) + g1y * v + N.wave[2], f2 = g2x * (u + 1) + g2y * v + N.wave[3];
    let a1 = formsFlat(L[0], K[0] * px), a2 = formsFlat(L[1], K[1] * px), a3 = formsFlat(L[2], K[2] * px), a4 = formsFlat(L[3], K[3] * px), lines = (a1 + a2 + a3 + a4) / all; // with no front on its way the waves lie the same way at every dot, and how fine they are was worked out once for the frame
    for (let i = 0; i < 2; i++) {
      const f = i ? N.frontB : N.frontA;
      if (!f[0]) continue;
      const a = Math.exp(Math.max(-30, Math.min(30, f[3] * (u - f[2])))), th = f[1] * v, wx = a * Math.cos(th), wy = a * Math.sin(th), dx = 1 + wx, d2 = Math.max(dx * dx + wy * wy, 1e-6), qx = (wx * dx + wy * wy) / d2, qy = wy / d2, psi = f[0] * Math.atan2(wy, dx);
      if (i) { f2 += psi; g2x += f[0] * f[3] * qy; g2y += f[0] * f[1] * qx; } else { f1 += psi; g1x += f[0] * f[3] * qy; g1y += f[0] * f[1] * qx; }
    }
    if (N.frontA[0] || N.frontB[0]) { // a front bends the waves near its forks, so there they are measured dot by dot: once as they are, for the cells, and once with their slope held to twice what it is away from the front, for the lines (see FORMS_SUM)
      const k1 = formsLong(g1x, g1y), k2 = formsLong(g2x, g2y), c1 = Math.min(1, (2 * Math.max(K[0], 3)) / Math.max(k1, 1e-4)), c2 = Math.min(1, (2 * Math.max(K[1], 3)) / Math.max(k2, 1e-4));
      a1 = formsFlat(L[0], k1 * px); a2 = formsFlat(L[1], k2 * px); a3 = formsFlat(L[2], formsLong(g1x + g2x, g1y + g2y) * px); a4 = formsFlat(L[3], formsLong(g1x - g2x, g1y - g2y) * px);
      g1x *= c1; g1y *= c1; g2x *= c2; g2y *= c2;
      lines = (formsFlat(L[0], k1 * c1 * px) + formsFlat(L[1], k2 * c2 * px) + formsFlat(L[2], formsLong(g1x + g2x, g1y + g2y) * px) + formsFlat(L[3], formsLong(g1x - g2x, g1y - g2y) * px)) / all;
    }
    const f3 = f1 + f2 + N.look[1], f4 = f1 - f2, g3x = g1x + g2x, g3y = g1y + g2y, g4x = g1x - g2x, g4y = g1y - g2y, there = (a1 + a2 + a3 + a4) / all;
    let s = 0, gx = 0, gy = 0, bowl = 0;
    if (a1) { const k = a1 * Math.sin(f1); s += a1 * Math.cos(f1); gx += k * g1x; gy += k * g1y; bowl += a1 * (g1x * g1x + g1y * g1y); }
    if (a2) { const k = a2 * Math.sin(f2); s += a2 * Math.cos(f2); gx += k * g2x; gy += k * g2y; bowl += a2 * (g2x * g2x + g2y * g2y); }
    if (a3) { const k = a3 * Math.sin(f3); s += a3 * Math.cos(f3); gx += k * g3x; gy += k * g3y; bowl += a3 * (g3x * g3x + g3y * g3y); }
    if (a4) { const k = a4 * Math.sin(f4); s += a4 * Math.cos(f4); gx += k * g4x; gy += k * g4y; bowl += a4 * (g4x * g4x + g4y * g4y); }
    const off = s - N.look[0] * there, d = Math.abs(off) / Math.sqrt(gx * gx + gy * gy + 0.5 * bowl * Math.abs(off) + 1e-6), wide = Math.max(N.look[2], 1.2 * px), far = 0.45 + 0.55 * eased(clamp(r / 0.7));
    dot.x = N.hue[0] + N.hue[1] * u + (N.hue[2] * s) / all;
    dot.shade = (N.look[3] * (0.25 + 0.75 * eased(clamp(((off / all) * 2 + 0.35) / 1.45))) * there + 0.3 * (1 - there)) * far;
    dot.edge = ((dot.glow * lines) / (1 + (d * d) / (wide * wide))) * (0.35 + 0.65 * far);
  }
  function formsFx() { // the forms seen with closed eyes: one pattern over the whole picture, drifting down its own tunnel and turning into the next
    if (!formsKept.started || formsKept.stepped !== sound.t) { formsKept.stepped = sound.t; formsStep(); } // (a frame can draw the picture twice, when the effect changes: one step is enough)
    if (onCard("forms", FORMS_SUM, formsGive)) return;
    const lent = trippy.values;
    trippy.values = FORMS_STILL; // byHand reads the trip's numbers for itself and can't be handed others: it is lent the zeros for this one picture, so that what a fractal drawn in the same frame left does not lie on it
    byHand(formsDot, formsNow.light[0]);
    trippy.values = lent;
  }
  /* ==== forms: end ==== */
  /* ==== runner: begin ==== */
  /* ---------- Runner: a little game that plays itself in time with the song. A small cream figure with headphones and a scarf runs through a world picked by the kind of music. A beat clock, kept in step
     by the kick, lays the course a few beats ahead, so every hop lands on a kick and every pickup is taken on the off-beat, and a counter rings up. A break drops the path away and the figure floats along
     a line of pickups; a build tilts the path into stairs towards a great gate; on the drop the gate bursts and the world's other sky opens out of it as a growing circle. All of it is drawn on the pixel
     screen, and every figure and place in it is our own drawing. ---------- */
  const RUNNER_DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // the order in which the dots of a patch of four by four come on, so one color goes over to the next in a pattern and not a blur
  const runnerGrain = (x, y) => (RUNNER_DITHER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const runnerChance = (n, k = 0) => { const v = Math.sin(n * 127.1 + k * 311.7 + 74.7) * 43758.5453; return v - Math.floor(v); }; // the same number from 0 to 1 every time for the same two numbers: where things stand is worked out, not kept
  const runnerMix = (a, b, f) => a + (b - a) * f;
  const RUNNER_PHRASES = [[1, 1, 1, 1], [1, 0, 1, 1], [1, 1, 1, 0], [1, 0, 1, 0]], RUNNER_ONE = [0.5], RUNNER_THREE = [0.75, 0.5, 0.25]; // on which beats of a bar something stands, and how far before a beat the pickups hang (three over a gap)
  const RUNNER_WORLD_OF = { acid: "sump", psy: "mycel", hard: "foundry", trance: "aerie", techno: "city", house: "city", jungle: "city", ambient: "aerie", game: "board", "": "board" }; // which of the six worlds each answer of musicWorld() gets
  const RUNNER_WEARS = { O: [22, 16, 40], C: [252, 242, 218], S: [255, 84, 70], T: [176, 40, 66], B: [255, 170, 60], D: [190, 96, 40] }; // the figure's outline and cream, its scarf in two reds, its boots in two oranges
  const RUNNER_BODY = [["....oooooooo....", "..oohhhhhhbboo..", ".ohhhbbbbhhbbbo.", ".ohhbbbbbbbbbbo.", "oaaaobbbbbbbbbbo", "oadaobbbbwwbwwbo", "oadaobbbbwkbwkbo", "oaaaobbbbwkbwkbo", ".ooobbbbbbbbbbso", ".obbbbbbbbbbbbso", ".osbbbbbbbmmbsso", "..osbbbbbbbssso.", "...oossssssoo...", ".....oooooo....."],
    { o: [22, 16, 40], b: [252, 242, 218], s: [198, 178, 196], h: [60, 222, 212], a: [60, 222, 212], d: [18, 104, 116], w: [255, 255, 255], k: [22, 16, 40], m: [226, 110, 120] }]; // the figure itself, the same in every world; its feet and scarf are drawn as it moves

  /* The six worlds. Each has its colors by letter (k the outline, a b c the three bright ones, s the shade of a, l the lightest, h m n what the path is made of from light to dark, g what grows on top,
     F E the far scenery and its lit edge, M I the nearer scenery and its lit edge, X Y Z what lies under the path from its surface down), two skies with a sun or moon each, what drifts in the air,
     two things to hop over, two who live there (each in two poses), what there is to pick up, who flies by, the scenery, and one dot-wide slice of the path. */
  const RUNNER_WORLDS = {
    sump: { // acid: a flooded chemical works at night, a catwalk over green sludge
      pal: { k: [10, 18, 22], a: [170, 240, 60], s: [86, 168, 44], b: [246, 230, 50], c: [255, 140, 30], l: [236, 255, 200], h: [120, 170, 160], m: [58, 96, 100], n: [30, 56, 62], g: [120, 170, 160], F: [22, 54, 50], E: [53, 114, 93], M: [10, 28, 32], I: [44, 84, 84], X: [170, 240, 60], Y: [60, 150, 50], Z: [20, 70, 36] },
      skies: [[[8, 20, 26], [12, 36, 40], [29, 80, 69], [69, 128, 66]], [[20, 26, 14], [52, 62, 22], [110, 116, 34], [190, 180, 60]]],
      orb: [{ kind: "moon", x: 0.74, y: 0.3, r: 13, col: [200, 236, 120], dark: [16, 44, 46] }, { kind: "sun", x: 0.7, y: 0.52, r: 17, col: [250, 246, 170], halo: [226, 214, 90] }],
      swell: "wave", float: "bubble", weather: { up: 9, side: 2, tones: "as" },
      low: [["..kkkkkkk..", ".kaalaaaak.", "kaaaaaaaaak", "kkaakkkakkk", "khmammmamnk", "khmammmmmnk", "kkkkkkkkkkk", "khmmmmmmnnk", "khmmmmmmnnk", "kkkkkkkkkkk", ".kkkkkkkkk."],
        [".....k.....", "....kbk....", "...kbbbk...", "...kbkbk...", "..kbbkbbk..", "..kbbbbbk..", ".kbbbkbbbk.", ".kkkkkkkkk.", "....khk....", "....khk....", "...kkhkk..."]],
      creature: [[["....kkkkkk....", "...kaaaaaak...", "..kalaaaaask..", "..kaalllaask..", ".kaaalkklaask.", ".kaaalkklaask.", ".kaaaalllassk.", "kaaaaaaaaasssk", "kaasaaaasasssk", ".kkkkkkkkkkkk."],
        ["..............", "..............", "....kkkkkk....", "..kkaaaaaakk..", ".kalalllaaask.", ".kaaalkklaask.", "kaaaalkklaassk", "kaaaaalllasssk", "kaasaaaasasssk", ".kkkkkkkkkkkk."]],
        [["............", "..kk...kk...", ".klakkkalk..", ".kaaaaaaakk.", "kaaaaaaaaask", "kabbbaaaassk", "kkabbaakkssk", ".kkkkkk.kkk."],
          ["..kk...kk...", ".klakkkalk..", ".kaaaaaaakk.", "kaaaaaaaaask", "kabbbbaaassk", "kabbbbaaassk", "kkabbaakkssk", ".kkkkkk.kkk."]]],
      gem: ["..k..", ".kbk.", ".kbk.", "klbbk", "kbbbk", "kbbck", ".kkk."],
      flyer: [["....kkkkk...", "b..khhhhhk..", "bbkhhhhlkhk.", "bbkmmmmmmmk.", "b..kmmmmmk..", "....kkkkk..."], ["....kkkkk...", "...khhhhhk..", ".bkhhhhlkhk.", ".bkmmmmmmmk.", "...kmmmmmk..", "....kkkkk..."]],
      layers({ GY, DN, WL, HS }, far, mid, hot) {
        const rd = Math.round, ch = runnerChance, base = GY - 8;
        far.R("F", 0, base, WL, DN);
        for (let i = 0; i * 43 < WL - 20; i++) {
          const x = rd(i * 43 + ch(i, 1) * 18), kind = ch(i, 2);
          if (kind < 0.4) { const wd = rd(18 + ch(i, 3) * 14), ht = rd((18 + ch(i, 4) * 26) * HS); far.R("F", x, base - ht, wd, ht); far.dome("F", x + wd / 2, base - ht, wd / 2, 6, "E"); far.R("E", x, base - ht, 2, ht); for (let j = 4; j < ht - 4; j += 7) far.R("E", x + 3, base - ht + j, wd - 3, 1); } // tanks with domed tops
          else if (kind < 0.78) { const ht = rd((42 + ch(i, 3) * 46) * HS); far.R("F", x, base - ht, 5, ht); far.R("E", x, base - ht, 1, ht); far.R("F", x - 1, base - ht, 7, 2); far.R("F", x - 1, base - ht + 9, 7, 2); hot.push({ x: x + 2, y: base - ht - 3, sp: 0.1, kind: "lamp" }); } // stacks, each with a lamp that winks
          else { const ht = rd(40 * HS); for (let j = 0; j < ht; j++) { const half = rd(9 + 6 * ((j / ht) * 2 - 0.9) ** 2); far.R("F", x - half, base - j - 1, half * 2, 1); far.R("E", x - half, base - j - 1, 2, 1); } } // cooling towers, waisted
        }
        mid.R("M", 0, GY - 2, WL, DN);
        for (const [py, tall, from, to] of [[GY - rd(30 * HS), 6, 0, WL], [GY - rd(54 * HS), 4, 60, 250], [GY - rd(46 * HS), 4, 440, 690]]) { // runs of pipe on legs, with flanges, and valves that drip on the kick
          mid.R("M", from, py, to - from, tall); mid.R("I", from, py, to - from, 1);
          for (let x = from + 6; x < to; x += 32) { mid.R("M", x, py - 1, 3, tall + 2); mid.R("I", x, py - 1, 1, tall + 2); }
          for (let x = from + 20; x < to; x += 64) { mid.R("M", x, py, 4, GY - py); mid.R("I", x, py + tall, 1, GY - py); }
          for (let x = from + 44; x < to; x += 96) { mid.R("M", x - 2, py + tall, 5, 4); mid.R("I", x - 3, py + tall + 4, 7, 1); hot.push({ x, y: py + tall + 6, sp: 0.3, kind: "drip" }); }
        }
        for (let i = 0; i < 8; i++) { const x = 30 + i * 96 + rd(ch(i, 8) * 30), ht = rd((22 + ch(i, 9) * 12) * HS); mid.R("M", x, GY - ht, 26, ht); mid.dome("M", x + 13, GY - ht, 13, 5, "I"); mid.R("I", x, GY - ht, 2, ht); mid.R("k", x + 9, GY - ht + 6, 8, 5); hot.push({ x: x + 10, y: GY - ht + 7, sp: 0.3, kind: "gauge", n: i }); } // vats, each with a gauge that shows its band of the spectrum
      },
      column(R, x, y, wx, DN) { // a catwalk with warning stripes, on thin legs braced crosswise
        R("h", x, y, 1, 1); R("m", x, y + 1, 1, 2);
        for (let r = 0; r < 3; r++) R((wx + r) % 8 < 4 ? "b" : "k", x, y + 3 + r, 1, 1);
        R("n", x, y + 6, 1, 2);
        const u = wx % 48;
        if (u < 3) R(u === 1 ? "m" : "n", x, y + 8, 1, DN); else { const d = Math.round((u - 3) * 0.5); R("n", x, y + 8 + d, 1, 1); R("n", x, y + 30 - d, 1, 1); }
      },
    },
    mycel: { // psy and goa: a mushroom forest at night that glows
      pal: { k: [14, 8, 30], a: [255, 70, 190], s: [168, 40, 150], b: [60, 230, 230], c: [255, 160, 50], l: [240, 230, 255], h: [170, 140, 240], m: [96, 64, 170], n: [44, 26, 96], g: [170, 255, 90], F: [30, 14, 66], E: [62, 32, 112], M: [22, 10, 50], I: [96, 56, 156], X: [60, 230, 230], Y: [24, 70, 110], Z: [14, 24, 60], u: [190, 96, 40], v: [30, 140, 170], w: [70, 150, 70], d: [30, 16, 70], t: [20, 90, 110] },
      skies: [[[14, 8, 40], [36, 16, 76], [76, 28, 116], [140, 44, 136]], [[6, 16, 36], [8, 44, 70], [16, 90, 100], [40, 150, 130]]],
      orb: [{ kind: "rings", x: 0.72, y: 0.3, r: 16, col: [255, 160, 50], dark: [255, 70, 190], stars: 1 }, { kind: "rings", x: 0.3, y: 0.34, r: 14, col: [170, 255, 90], dark: [60, 230, 230], stars: 1 }],
      swell: "wave", float: "seed", weather: { up: 3, side: 7, tones: "abc" }, bob: 3, // bob: the middle distance, its mushrooms and ferns, goes up and down by this many dots on the kick
      low: [["...kkkkkk...", ".kkaalaaakk.", "kaalaaaalaak", "kaaaaalaaask", "kslaaaaaassk", ".kkkkkkkkkk.", "...khllnk...", "...khllnk...", "...khllnk...", "..khlllnnk..", "..kkkkkkkk.."],
        ["....k....", "...kck...", "..kcclk..", "..kccck..", "...kck...", "g...m...g", "mg..m..gm", ".mg.m.gm.", "..mgmgm..", "...mmm..."]],
      creature: [[["......kkkkk..", ".a.a.kbbbbbk.", ".l.lkbblbbmbk", ".llkkbbkkbbmk", "kllkkbbkbbmmk", "klllkkbbbbmkk", "khlllllllllhk", ".kkkkkkkkkkk."],
        ["......kkkkk..", "a.a..kbbbbbk.", "l.l.kbblbbmbk", "lll.kbbkkbbmk", "kllkkbbkbbmmk", "kllllkbbbbmkk", "khlllllllllhk", ".kkkkkkkkkkk."]],
        [["..............", "..kk...kk.....", ".kggk.kggkkk..", "kglgkkgggkggk.", "kgkggggggggggk", "kgggkggkgggkgk", ".kkk.kk.kkk.k."],
          ["..............", "..............", ".kkk..........", "kglgkkkkkkkkk.", "kgkggggggggggk", "kgggkggkgggkgk", ".kkk.kk.kkk.k."]]],
      gem: ["..bbb..", ".bbtbb.", "bbtltbb", "btlcltb", "bbtltbb", ".bbtbb.", "..bbb.."],
      flyer: [["aa.......aa", "ala.....ala", ".aaak.kaaa.", "..asklksa..", "....klk....", "....klk....", ".....k....."], ["...........", "...........", "....k.k....", "..asklksa..", ".aaaklkaaa.", "ala..k..ala", "aa.......aa"]],
      layers({ GY, DN, WL, HS }, far, mid, hot) {
        const rd = Math.round, ch = runnerChance, caps = "acb", shades = "suv";
        far.R("F", 0, GY - 6, WL, DN);
        for (let i = 0; i * 48 < WL - 20; i++) { const x = rd(i * 48 + ch(i, 1) * 26), ht = rd((34 + ch(i, 2) * 60) * HS), rx = rd(13 + ch(i, 3) * 14), sw = 3 + (rx > 20 ? 2 : 0); // giant mushrooms far off
          far.R("F", x - sw / 2, GY - 6 - ht, sw, ht); far.R("E", x - sw / 2, GY - 6 - ht, 1, ht); far.dome("F", x, GY - 6 - ht + 3, rx, rd(rx * 0.55), "E"); far.R("M", x - rx + 3, GY - 6 - ht + 2, rx * 2 - 6, 1); }
        mid.R("M", 0, GY - 2, WL, DN);
        for (let i = 0; i * 55 < WL - 30; i++) { const x = rd(14 + i * 55 + ch(i, 5) * 24), ht = rd((16 + ch(i, 6) * 34) * HS), rx = rd(9 + ch(i, 7) * 9), ry = rd(rx * 0.6), top = GY - ht, tone = i % 3; // nearer ones with spotted caps: a ring of light answers the kick over each
          mid.R("I", x - 2, top, 4, ht); mid.R("l", x - 2, top, 1, ht); mid.R("M", x + 1, top, 1, ht);
          mid.dome(shades[tone], x, top + 2, rx, ry); mid.dome(caps[tone], x - 1, top + 1, rx - 2, ry - 1); mid.R("k", x - rx + 2, top + 2, rx * 2 - 4, 1);
          for (let sp = 0; sp < 3; sp++) mid.R("l", x - rd(rx * 0.55) + sp * rd(rx * 0.5), top + 1 - rd(ry * (sp === 1 ? 0.7 : 0.4)), 2, 2);
          hot.push({ x, y: top + 2 - ry, sp: 0.3, kind: "pulse", rx, n: i }); }
        for (let i = 0; i * 21.3 < WL - 8; i++) { const x = rd(i * 21.3 + ch(i, 11) * 12), ht = 3 + rd(ch(i, 12) * 6); for (let j = 0; j < ht; j++) mid.R(j % 2 ? "I" : "m", x + rd(Math.sin(j * 0.9 + i) * 1.5), GY - 2 - j, 1 + (j < ht - 2), 1); } // ferns
      },
      column(R, x, y, wx, DN) { // turf over dark soil, with roots and a few specks that glow
        const ch = runnerChance, tuft = ch(wx, 5) < 0.28 ? 2 : ch(wx, 6) < 0.5 ? 1 : 0, root = wx % 48;
        R("g", x, y - tuft, 1, tuft + 1); R("w", x, y + 1, 1, 1); R("n", x, y + 2, 1, 5); R("d", x, y + 7, 1, DN);
        if (wx & 1) R("d", x, y + 5 + ((wx >> 1) & 1), 1, 1);
        if (ch(wx, 7) < 0.07) R(ch(wx, 8) < 0.5 ? "b" : "a", x, y + 6 + Math.round(ch(wx, 9) * 26), 1, 1);
        if (root < 9) R("m", x, y + 9 + Math.round(root * 1.6 + Math.sin(root) * 2), 1, 1);
      },
    },
    foundry: { // hard trance, hardcore, hardstyle: a steelworks, black and red, with drop hammers
      pal: { k: [10, 8, 10], a: [255, 140, 40], s: [190, 80, 20], b: [255, 226, 150], c: [230, 50, 30], l: [255, 244, 220], h: [140, 144, 160], m: [74, 76, 90], n: [38, 36, 46], g: [140, 144, 160], F: [34, 13, 15], E: [78, 28, 20], M: [16, 10, 12], I: [84, 52, 46], X: [255, 226, 150], Y: [255, 140, 40], Z: [116, 24, 18], d: [104, 36, 18] },
      skies: [[[12, 8, 12], [36, 12, 16], [84, 22, 18], [160, 52, 20]], [[8, 10, 22], [20, 26, 54], [60, 40, 70], [150, 70, 50]]],
      orb: [{ kind: "sun", x: 0.76, y: 0.62, r: 20, col: [255, 170, 60], halo: [200, 70, 24] }, { kind: "moon", x: 0.26, y: 0.26, r: 11, col: [220, 220, 240], dark: [20, 26, 54], stars: 1 }],
      swell: "wave", float: "chute", weather: { up: 26, side: 5, tones: "abc" },
      low: [["kkkkkkkkkkkk.", "khhhhhhhhhmkk", ".kmmmmmmmmnk.", "..kkkmmnkkk..", "....kmmnk....", "....kmmnk....", "...kkmmnkk...", "..khmmmmnnk..", "..kkkkkkkkk.."],
        [".kkkkkkk.", "khhhhhmmk", "kkkkkkkkk", "khmmmmmnk", "kakkakkak", "kkakkakkk", "khmmmmmnk", "kkkkkkkkk", "khmmmmmnk", "khmmmmmnk", ".kkkkkkk."]],
      creature: [[["....kkkk....", "..kkkhhkkk..", ".khhhhhhhmk.", ".khkkkkkkmk.", ".khkcckkkmk.", ".khkkkkkkmk.", ".khmmmmmmnk.", ".kmmbmmbmnk.", ".kkkkkkkkkk.", "..kmk..kmk..", "..kmk..kmk..", ".kkmk..kmkk.", ".kkkk..kkkk."],
        ["............", "....kkkk....", "..kkkhhkkk..", ".khhhhhhhmk.", ".khkkkkkkmk.", ".khkkcckkmk.", ".khkkkkkkmk.", ".khmmmmmmnk.", ".kmmbmmbmnk.", ".kkkkkkkkkk.", "..kmk..kmk..", ".kkmk..kmkk.", ".kkkk..kkkk."]],
        [["..b.....b....", ".kkkkkkkkkkk.", ".kabbbbbbbak.", ".kmaaaaaaank.", "..kmmmmmmnk..", "..kmmmmmmnk..", ".kkkkkkkkkkk.", ".khk.....khk.", "..k.......k.."],
          ["....b....b...", ".kkkkkkkkkkk.", ".kbabbbbabbk.", ".kmaaaaaaank.", "..kmmmmmmnk..", "..kmmmmmmnk..", ".kkkkkkkkkkk.", ".kkh.....kkh.", "..k.......k.."]]],
      gem: ["..kkk..", ".kblbk.", "kbbbbbk", "kbbabbk", "kbaaabk", ".kaaak.", "..kkk.."],
      flyer: [["hhhhh.hhhhh.", ".....k......", "..kkkkkkk...", ".kmhhhmmck..", ".knmmmmmmk..", "..kkkkkkk...", "...k...k...."], ["..hhh.hhh...", ".....k......", "..kkkkkkk...", ".kmhhhmmck..", ".knmmmmmmk..", "..kkkkkkk...", "...k...k...."]],
      layers({ GY, DN, WL, HS }, far, mid, hot) {
        const rd = Math.round, ch = runnerChance, base = GY - 8, gy = GY - rd(52 * HS);
        far.R("F", 0, base, WL, DN);
        for (let i = 0; i * 48 < WL - 20; i++) { const x = rd(i * 48 + ch(i, 1) * 16);
          if (ch(i, 2) < 0.45) { const ht = rd((46 + ch(i, 3) * 48) * HS); far.R("F", x, base - ht, 6, ht); far.R("E", x, base - ht, 1, ht); far.R("E", x, base - ht + 5, 6, 1); far.R("E", x, base - ht + 9, 6, 1); hot.push({ x: x + 3, y: base - ht - 1, sp: 0.1, kind: "flame", n: i }); } // chimneys, each with a flame that stands as high as its band of the spectrum
          else { const wd = 40, ht = rd((14 + ch(i, 3) * 12) * HS); far.R("F", x, base - ht, wd, ht); for (let r = 0; r < 4; r++) far.tri("F", x + 5 + r * 10, base - ht, 5, 6, "E"); for (let j = 3; j < wd - 3; j += 6) far.R("E", x + j, base - ht + 5, 3, 2); } // sheds with saw-tooth roofs
        }
        mid.R("M", 0, GY - 2, WL, DN);
        mid.R("M", 0, gy, WL, 6); mid.R("I", 0, gy, WL, 1); mid.R("I", 0, gy + 5, WL, 1); // a gantry of lattice girder on legs
        for (let x = 0; x < WL; x += 8) for (let j = 0; j < 4; j++) mid.R("I", x + j, gy + 1 + j, 1, 1);
        for (let x = 12; x < WL; x += 96) { mid.R("M", x, gy, 7, GY - gy); mid.R("I", x, gy, 1, GY - gy); for (let j = gy + 8; j < GY - 4; j += 8) mid.R("I", x + 2, j, 3, 1); }
        for (let i = 0; i < 8; i++) { const x = 52 + i * 96; hot.push({ x, y: gy + 6, sp: 0.3, kind: "hammer", n: i, reach: Math.max(4, GY - gy - 22) }); mid.R("M", x - 9, GY - 10, 18, 10); mid.R("I", x - 9, GY - 10, 18, 1); mid.R("s", x - 5, GY - 6, 10, 2); } // hammers that fall on the kick, each over its block
        for (let i = 0; i < 8; i++) { const x = 84 + i * 96, len = rd(10 + ch(i, 4) * 16); for (let j = 0; j < len; j += 2) mid.R("I", x, gy + 6 + j, 1, 1); mid.R("I", x - 1, gy + 6 + len, 3, 1); mid.R("I", x - 1, gy + 7 + len, 1, 2); } // chains with hooks
      },
      column(R, x, y, wx, DN) { // a deck of plate with warning stripes over a wall of trestle, and a row of lights let into it (dark here: lights() below lights them by the spectrum)
        const u = wx % 24, v = wx % 48;
        R("h", x, y, 1, 1); R("m", x, y + 1, 1, 3); if (u % 6 === 2) R("h", x, y + 2, 1, 1);
        for (let r = 0; r < 4; r++) R((wx + r) % 8 < 4 ? "c" : "k", x, y + 4 + r, 1, 1);
        R("n", x, y + 8, 1, DN); R("m", x, y + 9, 1, 1); R("k", x, y + 20, 1, 1); R("m", x, y + 21, 1, 1);
        if (v < 4) R(v === 3 ? "k" : "m", x, y + 22, 1, DN); else { const d = Math.round((v - 4) * 0.8); R("k", x, y + 22 + d, 1, 1); R("k", x, y + 57 - d, 1, 1); }
        if (u >= 8 && u < 16) { R("d", x, y + 12, 1, 4); R("c", x, y + 16, 1, 1); } else if (u === 7 || u === 16) R("k", x, y + 12, 1, 5);
      },
      lights: { every: 3, at: 1, draw(R, x, y, v) { if (v > 0.3) R("a", x, y + 12, 8, 4); if (v > 0.65) R("b", x, y + 12, 8, 2); } },
    },
    aerie: { // trance, and ambient: a stone bridge above the clouds at dusk, peaks and islands that float
      pal: { k: [28, 22, 58], a: [255, 214, 90], s: [224, 150, 70], b: [120, 224, 255], c: [255, 130, 180], l: [250, 248, 255], h: [176, 166, 220], m: [112, 100, 160], n: [70, 60, 116], g: [80, 206, 170], F: [128, 100, 176], E: [244, 226, 240], M: [86, 72, 146], I: [200, 190, 240], X: [250, 248, 255], Y: [200, 190, 240], Z: [140, 124, 200], u: [152, 124, 198], v: [214, 196, 232], w: [186, 166, 222] },
      skies: [[[44, 44, 120], [100, 76, 170], [206, 116, 176], [255, 184, 150]], [[12, 12, 46], [28, 28, 86], [66, 56, 136], [140, 100, 180]]],
      orb: [{ kind: "sun", x: 0.7, y: 0.74, r: 22, col: [255, 244, 200], halo: [255, 214, 150] }, { kind: "moon", x: 0.74, y: 0.3, r: 14, col: [250, 248, 255], dark: [28, 28, 86], stars: 1 }],
      swell: "puffs", float: "chute", weather: { up: 2, side: 12, tones: "cl" },
      low: [[".....kk....", "....klbk...", "....klbk.k.", ".k..klbkklk", "klk.klbkkbk", "klbkklbklbk", "klbkllbklbk", "klbbklbbbbk", "kkkkkkkkkkk"],
        ["....k....", "...khk...", "..khhhk..", ".kkkkkkk.", "..kaalk..", "..kaaak..", ".kkkkkkk.", "...khk...", "...kmk...", "..kkmkk..", ".kmmmmnk."]],
      creature: [[["...kkkkkkk...", "..klllllllk..", ".kkllllllllk.", "knnnklllllllk", "knlnkhllllllk", "knnnkhhllllhk", ".kkkkhhhhhhk.", "....kkkkkkk..", "....nk...nk..", "....nk...nk.."],
        [".............", "...kkkkkkk...", "..klllllllk..", ".kkllllllllk.", "knnnklllllllk", "knlnkhllllllk", "knnnkhhllllhk", ".kkkkhhhhhhk.", "....kkkkkkk..", ".....nk.nk..."]],
        [["..kk.kk.....", "..klkklk....", "..klkklk....", ".kkllllkkkk.", "klkllllllllk", "kllllllllllk", ".kclllllhhhk", "..kkllhhhhk.", "...klk.klk..", "...kkk.kkk.."],
          ["............", "...kkkkk....", "..kllkllk...", ".kkllllkkkk.", "klkllllllllk", "kllllllllllk", ".kclllllhhhk", "..kkllhhhhk.", "..klk...klk.", "..kk.....kk."]]],
      gem: ["...a...", "...a...", "..ala..", "aalllaa", "..ala..", "...a...", "...a..."],
      flyer: [["..ll.......", "..lll......", "...lll.....", "kkllllllla.", "..hllllh...", "....hh....."], ["...........", "...........", "kkllllllla.", "..lllllh...", "..lll......", "..ll......."]],
      layers({ GY, DN, WL, HS }, far, mid, hot) {
        const rd = Math.round, ch = runnerChance;
        for (let i = 0; i * 64 < WL - 30; i++) { const x = rd(i * 64 + ch(i, 1) * 30), half = rd(30 + ch(i, 2) * 22), ht = rd((40 + ch(i, 3) * 44) * HS), cap = rd(ht * 0.3); far.tri("F", x, GY + 4, half, ht, "u"); // peaks, lit from the left, each with a cap of snow
          for (let j = 0; j < cap + 4; j++) { const hw = rd(half * (j / ht)); for (let xx = -hw; xx <= hw; xx++) if (j < cap - 2 + (((xx + 400) >> 1) % 3) * 2) far.R(xx > hw * 0.3 ? "v" : "E", x + xx, GY + 4 - ht + j, 1, 1); } }
        for (let i = 0; i * 32 < WL - 10; i++) far.dome("w", rd(i * 32 + ch(i, 4) * 20), GY + 8, rd(14 + ch(i, 5) * 12), rd(6 + ch(i, 6) * 6), "v");
        far.R("w", 0, GY + 8, WL, DN);
        for (let i = 0; i < 8; i++) { const x = rd(40 + i * 96 + ch(i, 7) * 30), top = GY - rd((34 + ch(i, 8) * 40) * HS), half = rd(14 + ch(i, 9) * 10); // islands that float, each with a tower whose lamp answers the spectrum
          for (let j = 0; j < half; j++) { const hw = rd(half * (1 - (j / half) ** 1.4)); mid.R(j < 3 ? "I" : "M", x - hw, top + j, hw * 2, 1); mid.R("I", x - hw, top + j, Math.max(1, rd(hw * 0.3)), 1); if (j > 2 && j & 1) mid.R("n", x + rd(hw * 0.4), top + j, rd(hw * 0.6), 1); }
          mid.R("g", x - half, top - 1, half * 2, 2); mid.R("M", x + 3, top - 13, 4, 12); mid.R("I", x + 3, top - 13, 1, 12); mid.tri("c", x + 5, top - 13, 3, 4); hot.push({ x: x + 4, y: top - 9, sp: 0.3, kind: "beacon", n: i });
          for (let j = 0; j < 18; j += 2) mid.R("b", x - half + 4, top + 2 + j, 1, 1); }
        for (let i = 0; i * 77 < WL - 40; i++) { const x = rd(i * 77 + ch(i, 10) * 40), y = GY - rd((8 + ch(i, 11) * 70) * HS); for (let k = 0; k < 3; k++) { mid.dome("h", x + k * 9 + 1, y + 2, 8 - k, 5 - (k & 1)); mid.dome("l", x + k * 9, y, 8 - k, 5 - (k & 1)); } mid.R("h", x - 8, y, 34, 2); } // clouds
      },
      column(R, x, y, wx, DN) { // a bridge of stone with grass on top, on piers with round arches between
        const u = (wx % 48) - 24, tuft = runnerChance(wx, 5) < 0.25 ? 1 : 0;
        R("g", x, y - tuft, 1, 2 + tuft); R("h", x, y + 2, 1, 1); R("m", x, y + 3, 1, 5); if (wx % 8 === 4) R("n", x, y + 4, 1, 3);
        if (u >= 19 || u < -19) R(u >= 19 ? "m" : "n", x, y + 8, 1, DN); else { const dip = 19 - Math.round(Math.sqrt(361 - u * u)); R(u < 0 ? "n" : "m", x, y + 8, 1, dip + 1); R("k", x, y + 9 + dip, 1, 1); }
      },
    },
    board: { // game music, and whatever nothing else claims: the inside of the machine, a land of circuit board
      pal: { k: [10, 16, 34], a: [255, 206, 70], s: [200, 136, 40], b: [90, 240, 190], c: [255, 90, 120], l: [240, 255, 236], h: [80, 196, 128], m: [34, 124, 92], n: [16, 72, 64], g: [150, 240, 130], F: [16, 44, 66], E: [36, 84, 96], M: [12, 28, 48], I: [50, 110, 110], X: [90, 240, 190], Y: [30, 120, 130], Z: [14, 50, 70] },
      skies: [[[10, 18, 44], [16, 40, 74], [26, 84, 104], [70, 160, 130]], [[26, 10, 44], [60, 20, 80], [130, 40, 110], [230, 100, 120]]],
      orb: [{ kind: "tile", x: 0.72, y: 0.5, r: 15, col: [250, 244, 170], halo: [150, 214, 140] }, { kind: "moon", x: 0.26, y: 0.3, r: 12, col: [255, 226, 232], dark: [60, 20, 80], stars: 1 }],
      swell: "wave", float: "chute", weather: { up: 6, side: 3, tones: "bl" },
      low: [[".kkkkk.", "khhhhmk", "kkkkkkk", "kbbbbck", "kbbbbck", "kbbbbck", "kbbbbck", "kkkkkkk", ".h...h.", ".h...h."],
        [".kkkkkkkkkkk.", "kmmmmmmmmmmmk", "kmlmmmbbbbmmk", "kmmmmmmmmmmmk", ".kkkkkkkkkkk.", ".h.h.h.h.h.h.", ".h.h.h.h.h.h."]],
      creature: [[["l..l........", ".kk.kkkkkk..", ".kkkcccaccck", "klkkccccccck", "kkkkcaccccak", ".kkkkkkkkkk.", ".h.h..h..h..", "h..h..h...h."],
        [".l.l........", ".kk.kkkkkk..", ".kkkcccaccck", "klkkccccccck", "kkkkcaccccak", ".kkkkkkkkkk.", "..h.h..h.h..", "..h..h.h..h."]],
        [[".kkkkkkkk.", "kbbbbbbbbk", "kblkbblkbk", "kblkbblkbk", "kbbbbbbbbk", "kbbkkkkbbk", "kbbbbbbbmk", ".kkkkkkkk.", "..h....h..", ".hh...hh.."],
          ["..........", ".kkkkkkkk.", "kbbbbbbbbk", "kblkbblkbk", "kbbbbbbbbk", "kbbkkkkbbk", "kbbbbbbbmk", ".kkkkkkkk.", ".h......h.", "hh......hh"]]],
      gem: ["...kkkk", "...kaak", "...kakk", "...kak.", ".kkkak.", "kaaaak.", "kaaaak.", ".kkkk.."],
      flyer: [["ll.......ll", "lhl..k..lhl", ".lhlklklhl.", "..llklkll..", "....klk....", "....k.k...."], ["...........", "....k.k....", "..llklkll..", ".lhlklklhl.", "lhl.klk.lhl", "ll.......ll"]],
      layers({ GY, DN, WL, HS }, far, mid, hot) {
        const rd = Math.round, ch = runnerChance, base = GY - 6;
        far.R("F", 0, base, WL, DN);
        for (let i = 0; i * 56 < WL - 30; i++) { const x = rd(i * 56 + ch(i, 1) * 22), kind = ch(i, 2);
          if (kind < 0.5) { const wd = rd(26 + ch(i, 3) * 20), ht = rd((16 + ch(i, 4) * 22) * HS), top = base - ht - 5; far.R("F", x, top, wd, ht); far.R("E", x, top, wd, 1); far.R("E", x + 3, top + 3, 2, 2); for (let j = 2; j < wd - 1; j += 4) far.R("F", x + j, top + ht, 1, 5); } // great chips standing on their legs, each with its mark in one corner
          else if (kind < 0.8) { const ht = rd((40 + ch(i, 3) * 40) * HS); for (let j = 0; j < ht; j += 4) far.R(j % 8 ? "F" : "E", x - (j % 8 ? 4 : 5), base - j - 3, j % 8 ? 8 : 10, 3); far.R("F", x - 1, base - ht - 6, 2, 8); hot.push({ x, y: base - ht - 8, sp: 0.1, kind: "lamp" }); } // coils wound up a core, a lamp on top
          else { const ht = rd(24 * HS); far.R("F", x, base - 4, 30, 4); for (let j = 0; j < 30; j += 4) far.R("F", x + j, base - ht, 2, ht); far.R("E", x, base - ht, 1, ht); } // cooling fins
        }
        mid.R("M", 0, GY - 2, WL, DN);
        for (let i = 0; i * 64 < WL - 30; i++) { const x = rd(20 + i * 64 + ch(i, 5) * 26), kind = i % 3;
          if (kind === 0) { const ht = rd((22 + ch(i, 6) * 18) * HS); mid.R("M", x, GY - ht, 14, ht); mid.dome("M", x + 7, GY - ht, 7, 3, "I"); mid.R("I", x, GY - ht, 2, ht); mid.R("c", x + 10, GY - ht + 2, 3, ht - 4); } // capacitors, each with its stripe
          else if (kind === 1) { const ht = rd((30 + ch(i, 6) * 16) * HS), rows = Math.max(3, Math.min(6, Math.floor((ht - 6) / 4))); mid.R("M", x, GY - ht, 9, ht); mid.R("I", x, GY - ht, 9, 1); mid.R("I", x, GY - ht, 1, ht); hot.push({ x: x + 3, y: GY - ht + 3, sp: 0.3, kind: "meter", n: i, rows }); } // a tower of lights that stands as high as its band of the spectrum
          else { const ht = rd(10 * HS) + 4; mid.R("I", x, GY - ht, 1, ht); mid.R("I", x + 21, GY - ht, 1, ht); mid.R("M", x + 3, GY - ht - 3, 16, 7); mid.R("I", x + 3, GY - ht - 3, 16, 1); for (let j = 0; j < 4; j++) mid.R("abca"[j], x + 5 + j * 3, GY - ht - 2, 2, 5); } // a resistor lying across two posts, with its colored bands
        }
        for (let x = 6; x < WL; x += 48) { mid.R("I", x, GY - 3, 30, 1); mid.R("I", x + 30, GY - 6, 1, 4); } // tracks along the ground
      },
      column(R, x, y, wx, DN) { // a slab of board with a gold track along it and a small light let in every so often, standing on pins
        const u = wx % 24, v = wx % 48;
        R("g", x, y, 1, 1); R("h", x, y + 1, 1, 1); R("m", x, y + 2, 1, 6); R("n", x, y + 8, 1, 2);
        if (u >= 8 && u < 16) { R("a", x, y + 7, 1, 1); if (u >= 10 && u < 14) R("n", x, y + 4, 1, 2); } else R("a", x, y + 6, 1, 1);
        if (v < 4) R(v === 0 || v === 3 ? "n" : "m", x, y + 10, 1, DN); else { R("n", x, y + 18, 1, 1); if (v % 6 < 3) R("n", x, y + 24, 1, 1); }
      },
      lights: { every: 3, at: 1, draw(R, x, y, v) { if (v > 0.3) R("b", x + 2, y + 4, 4, 2); if (v > 0.65) R("l", x + 3, y + 4, 2, 1); } },
    },
    city: { // techno, house, drum and bass: over the roofs of a city at night, on a railway carried high above the street
      pal: { k: [8, 10, 26], a: [255, 84, 170], s: [164, 44, 130], b: [90, 220, 255], c: [255, 184, 70], l: [238, 240, 255], h: [132, 142, 176], m: [72, 80, 116], n: [38, 42, 72], g: [132, 142, 176], F: [22, 22, 56], E: [64, 61, 128], M: [12, 14, 36], I: [62, 66, 112], X: [255, 184, 70], Y: [58, 34, 76], Z: [16, 14, 40], r: [230, 60, 70] },
      skies: [[[8, 8, 28], [18, 18, 54], [44, 30, 92], [104, 52, 124]], [[26, 34, 84], [70, 66, 140], [190, 104, 140], [255, 176, 124]]],
      orb: [{ kind: "moon", x: 0.24, y: 0.26, r: 12, col: [238, 240, 255], dark: [18, 18, 54], stars: 1 }, { kind: "sun", x: 0.7, y: 0.8, r: 20, col: [255, 236, 180], halo: [255, 190, 130] }],
      swell: "street", float: "balloons", weather: { up: -40, side: 6, tones: "hb" },
      low: [[".kkkkkkkkk.", "khhhhhhhhmk", "kmkkkkkkknk", "kmkbkbkbknk", "kmkkkkkkknk", "kmmmmmmmmnk", "kkkkkkkkkkk", ".kn.....nk."],
        ["......kk..", "....kkhk..", "..kkhhhk.c", ".khhhhmk..", ".khhhmmk..", "..khmmk...", "...kkkk...", "....km....", "....km....", "..kkkkkk.."]],
      creature: [[["..kkk......", ".khhhk.....", "ckkhhk.....", ".khhhkkkk..", "..khhhhhhk.", "..khllllhhk", "...khlllkk.", "....kkkk...", "....a.a...."],
        ["...........", ".kkk.......", "khhhk......", "ckkhhkkkk..", ".kkhhhhhhk.", "..khllllhhk", "...khlllkk.", "....kkkk...", "...a...a..."]],
        [["l..l......", "llll....l.", "lklkl...l.", "lllll..hl.", ".aaaalll..", ".llllllll.", ".lhllllll.", ".lhllllll.", ".lll.llll.", ".l.l.l..l."],
          ["l..l......", "llll......", "lklkl.....", "lllll.....", ".aaaalll..", ".llllllll.", ".lhlllllll", ".lhlllllll", ".lll.llll.", ".l.l.l..l."]]],
      gem: ["..hhh..", ".hnnnh.", "hnnannh", "hnalanh", "hnnannh", ".hnnnh.", "..hhh.."],
      flyer: [["...kkkkkkk...", ".khhhhhhhhhkm", "khhbbhhhhhmmm", ".kmmmmmmmmkm.", "...kkkkkkk...", ".....kak....."], ["...kkkkkkk...", ".khhhhhhhhhkm", "khhbbhhhhhmmm", ".kmmmmmmmmkm.", "...kkkkkkk...", ".....kck....."]],
      layers({ GY, DN, WL, HS }, far, mid, hot) {
        const rd = Math.round, ch = runnerChance, base = GY - 6;
        far.R("F", 0, base, WL, DN);
        for (let x = 0, i = 0; x < WL - 14; i++) { const wd = rd(14 + ch(i, 1) * 18), ht = rd((24 + ch(i, 2) ** 2 * 70) * HS), top = base - ht; far.R("F", x, top, wd, ht); far.R("E", x, top, 1, ht); far.R("E", x, top, wd, 1); // the skyline: tower blocks with one edge and the roof line a little lighter (so they still read against the night sky), a few windows lit, a mast with a lamp on the tall ones
          for (let j = 0; j < 7; j++) far.R(j % 3 ? "E" : "c", x + 2 + rd(ch(i, 20 + j) * (wd - 5)), top + 3 + rd(ch(i, 10 + j) * Math.max(0, ht - 8)), 2, 1);
          if (ht > 66 * HS) { far.R("F", x + (wd >> 1), top - 9, 1, 9); hot.push({ x: x + (wd >> 1), y: top - 11, sp: 0.1, kind: "lamp" }); }
          x += wd + rd(ch(i, 3) * 8); }
        mid.R("M", 0, GY - 2, WL, DN);
        for (let i = 0; i * 96 < WL - 40; i++) { const x = rd(10 + i * 96 + ch(i, 5) * 30), wd = rd(34 + ch(i, 6) * 16), ht = rd((30 + ch(i, 7) * 34) * HS), top = GY - ht; // nearer blocks with rows of windows, and on each roof a water tank or a sign whose bars are the spectrum
          mid.R("M", x, top, wd, ht); mid.R("I", x, top, wd, 1); mid.R("I", x, top, 1, ht);
          for (let wy = top + 4; wy < GY - 6; wy += 6) for (let wx = x + 3; wx < x + wd - 3; wx += 5) { const lit = ch(wx, wy); if (lit < 0.3) mid.R(lit < 0.07 ? "b" : lit < 0.17 ? "c" : "n", wx, wy, 3, 3); }
          if (i % 2) { mid.R("M", x + 5, top - 9, 9, 7); mid.R("I", x + 5, top - 9, 1, 7); mid.R("M", x + 6, top - 2, 1, 2); mid.R("M", x + 12, top - 2, 1, 2); mid.tri("M", x + 9, top - 9, 5, 3, "I"); }
          else { mid.R("I", x + 4, top - 14, 22, 12); mid.R("k", x + 5, top - 13, 20, 10); mid.R("M", x + 8, top - 2, 1, 2); mid.R("M", x + 21, top - 2, 1, 2); hot.push({ x: x + 7, y: top - 5, sp: 0.3, kind: "sign", n: i }); } }
        for (let x = 30; x < WL; x += 96) { const top = GY - rd(22 * HS); mid.R("I", x, top, 1, GY - top); mid.R("I", x, top, 5, 1); mid.R("c", x + 4, top + 1, 2, 1); } // street lamps
      },
      column(R, x, y, wx, DN) { // a deck of concrete with a row of studs, on a girder that zigzags between square piers
        const v = wx % 64;
        R("h", x, y, 1, 1); R("m", x, y + 1, 1, 3); R("n", x, y + 4, 1, 4); if (wx % 4 === 0) R("m", x, y + 5, 1, 1);
        if (v < 8) R(v < 4 ? "m" : "n", x, y + 8, 1, DN); else { R("n", x, y + 8, 1, 2); R("n", x, y + 10 + Math.abs(((v - 8) % 28) - 14), 1, 1); R("n", x, y + 24, 1, 1); }
      },
      lights: { every: 4, at: 2, draw(R, x, y, v) { R(v > 0.65 ? "l" : v > 0.3 ? "b" : "s", x + 3, y + 5, 2, 2); } },
    },
  };

  const runner = { fresh: true, seen: 0, bands: new Float32Array(16), tops: new Int16Array(800), past: new Float32Array(18), body: null }, runnerBits = [], runnerLooks = new Map(); // the game as it stands, the sparks in the air, and what has been drawn ready for each world
  const runnerCourse = Array.from({ length: 128 }, () => ({ n: -99, kind: 0, which: 0, taken: 0 })), RUNNER_BLANK = { n: -99, kind: 0, which: 0, taken: 7 }; // what stands at each of the beats near by: 0 nothing, 1 something low, 2 someone who lives here, 3 a gap in the path, 4 nothing but three pickups; which of the two it is, and which of its pickups are taken (128 places: more than the widest picture shows at the slowest pace)
  const runnerItem = (n) => { const it = runnerCourse[n & 127]; return it.n === n ? it : RUNNER_BLANK; };
  function runnerBegin() { // a new game: nothing on the course, nothing counted, the first sky
    Object.assign(runner, { fresh: false, beat: 0, period: 60 / 128, owe: 0, heard: false, sinceHit: 0, lastErr: 0, inStep: 0, off: 0, sure: 0, gaps: 0, pastN: 0, own: 0, ownFor: 0, cycle: 0, astray: 0, calmFor: 9, along: 0, dpb: 0, air: 0, gust: 0, fly: 0, swell: 0,
      gone: 0, floating: false, step: 0, lift: 0, sink: 0, laid: -1, noThings: 0, score: 0, due: 0, dueWait: 0, ring: 0, cheer: 0, zone: 0, iris: 0, irisAt: 0, turn: 0, skyFor: 32, gate: null, leap: null, stumble: 0, skip: 0, land: 0, inAir: false,
      scarf: 0, feetWas: 0, fliers: -1, blink: 0, glint: 0, pound: 0, world: "", was: "", fade: 0, want: "", wantFor: 0 });
    runner.bands.fill(0);
    runnerBits.length = 0;
    for (const it of runnerCourse) it.n = -99;
  }
  const runnerSpark = (x, y, vx, vy, life, tone, size = 1, fall = 0) => { if (runnerBits.length < 70) runnerBits.push({ x, y, vx, vy, life, all: life, tone, size, fall }); };

  function runnerLook(key, S) { // everything that is drawn once for one world on one shape of screen and then only copied: its two skies, the two strips of scenery that slide by, a strip of the path, its sprites and its colors
    const id = key + " " + S.across + "x" + S.down, had = runnerLooks.get(id);
    if (had) { runnerLooks.delete(id); runnerLooks.set(id, had); return had; } // (asked for again, so it is the last to go)
    if (runnerLooks.size > 3) runnerLooks.delete(runnerLooks.keys().next().value); // four are kept at most: the one asked for longest ago goes
    const W = RUNNER_WORLDS[key], A = S.across, DN = S.down, TALL = DN > A * 1.2, HS = (TALL ? 1.35 : 1) * Math.min(1, DN / 180), rd = Math.round; // HS: how tall things stand: taller on a phone held upright, lower on a screen that is short of dots
    const K = { A, DN, TALL, HS, GY: rd(DN * (TALL ? 0.74 : 0.72)), HX: rd(A * (TALL ? 0.3 : 0.28)), DPB: TALL ? 30 : 40, WL: 768, PW: 384, DEEP: DN - rd(DN * 0.09) }; // where the path lies, where the figure runs, how many dots a beat carries it, how wide the strips are, where the surface under the path lies
    const css = W.css || (W.css = Object.fromEntries(Object.entries({ ...W.pal, ...RUNNER_WEARS }).map(([letter, tone]) => [letter, pixelCss(tone)])));
    const art = W.art || (W.art = { low: W.low.map((rows) => pixelSprite(rows, W.pal)), creature: W.creature.map((poses) => poses.map((rows) => pixelSprite(rows, W.pal))), gem: pixelSprite(W.gem, W.pal), flyer: W.flyer.map((rows) => pixelSprite(rows, W.pal)) });
    function sky(z) { // bands of color with a patterned edge between them, the sun or moon, and stars
      const ramp = W.skies[z], orb = W.orb[z], [c, x] = paper(A, DN), img = x.createImageData(A, DN), ink = img.data, hz = K.GY + 8, n = ramp.length - 1, ox = rd(A * orb.x), oy = rd(K.GY * orb.y), r = rd(orb.r * (TALL ? 1.1 : 1) * Math.max(0.6, Math.min(1, DN / 180))), reach = r * 2.1 + 2;
      const dot = (xx, y, col) => { const o = (y * A + xx) * 4; ink[o] = col[0]; ink[o + 1] = col[1]; ink[o + 2] = col[2]; ink[o + 3] = 255; };
      for (let y = 0; y < DN; y++) {
        const f = Math.min(n - 0.001, (y / hz) * n), i = Math.floor(f), edge = (f - i - 0.36) / 0.28, near = Math.abs(y - oy) < reach;
        for (let xx = 0; xx < A; xx++) {
          let col = edge > runnerGrain(xx, y) ? ramp[i + 1] : ramp[i];
          if (near && Math.abs(xx - ox) < reach) { // (only the dots near the sun or moon are asked how far from it they are)
            const dx = xx - ox, dy = y - oy, d = orb.kind === "tile" ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
            if (orb.kind === "moon") { if (d < r) col = Math.hypot(dx - r * 0.45, dy + r * 0.3) < r * 0.85 ? orb.dark : orb.col; }
            else if (orb.kind === "rings") { if (d < r) col = (Math.floor(d / 3) + Math.floor(((Math.atan2(dy, dx) / TAU + 1) % 1) * 12)) & 1 ? orb.col : orb.dark; else if (d < r + 1.2) col = W.pal.l; } // a disc of rings and wedges
            else if (d < r) col = orb.col; else if ((1 - (d - r) / (r * 1.1)) * 0.75 > runnerGrain(xx, y)) col = orb.halo; // a round sun, or a square one, in its haze
          }
          dot(xx, y, col);
        }
      }
      if (orb.stars) for (let k = 0; k < A * hz * 0.0045; k++) { const sx = Math.floor(runnerChance(k, 4 + z) * A), sy = Math.floor(runnerChance(k, 6 + z) * hz * 0.75); if (Math.hypot(sx - ox, sy - oy) > r + 2) dot(sx, sy, runnerChance(k, 8) < 0.4 ? W.pal.l : ramp[Math.min(n, Math.floor((sy / hz) * n) + 2)]); }
      x.putImageData(img, 0, 0);
      return c;
    }
    function strip() { // a strip of scenery that joins up with itself, and the three shapes the worlds are built from: a block, a dome and a peak, each with a lit edge if wanted
      const [c, x] = paper(K.WL, DN);
      const R = (tone, px, py, wide, tall) => { px = rd(px); wide = rd(wide); x.fillStyle = css[tone]; x.fillRect(px, rd(py), wide, rd(tall)); if (px < 0) x.fillRect(px + K.WL, rd(py), wide, rd(tall)); else if (px + wide > K.WL) x.fillRect(px - K.WL, rd(py), wide, rd(tall)); }; // (what runs off one end comes in at the other)
      const dome = (tone, cx, base, rx, ry, lit) => { for (let j = 1; j <= ry; j++) { const half = rd(rx * Math.sqrt(1 - ((j - 0.5) / ry) ** 2)); R(tone, cx - half, base - j, half * 2, 1); if (lit) R(lit, cx - half, base - j, Math.max(1, rd(half * 0.35)), 1); } };
      const tri = (tone, cx, base, half, tall, lit) => { for (let j = 0; j < tall; j++) { const hw = rd(half * (1 - j / tall)); R(tone, cx - hw, base - j - 1, hw * 2 + 1, 1); if (lit) R(lit, cx - hw, base - j - 1, Math.max(1, rd(hw * 0.4)), 1); } };
      return { c, R, dome, tri };
    }
    const far = strip(), mid = strip(), hot = [], [path, px] = paper(K.PW, DN + 4), [dots, dx] = paper(A, 1);
    W.layers(K, far, mid, hot);
    for (let wx = 0; wx < K.PW; wx++) W.column((tone, x, y, wide, tall) => { px.fillStyle = css[tone]; px.fillRect(x, y, wide, tall); }, wx, 4, wx, DN); // the path, drawn once along a strip that joins up with itself (four dots of room above it for what grows on top)
    dx.fillStyle = css.Y; for (let x = 0; x < A; x += 2) dx.fillRect(x, 0, 1, 1); // a row of every other dot, for the edge between two bands under the path
    const L = { K, W, css, art, sky, skies: [null, null], far: far.c, mid: mid.c, hot, path, dots, made: realNow }; // (each sky is drawn when it is first wanted: see runnerFx)
    runnerLooks.set(id, L);
    return L;
  }

  function runnerTrack(pos, K) { // where its feet are at a place along the beat, in dots above the level path, and how it is in the air: 0 on the ground, 1 a hop, 2 the great leap of a drop. A hop runs from the off-beat to the kick; a gap is cleared from kick to kick
    const st = runner, n = Math.ceil(pos), it = runnerItem(n), ph = pos - (n - 1), tread = (p) => (Math.floor(p + 0.25) - st.beat) * st.step, leap = st.leap;
    if (leap && pos > leap.a && pos < leap.b) { const u = (pos - leap.a) / (leap.b - leap.a); return { y: runnerMix(tread(leap.a), tread(leap.b), u) + leap.high * 4 * u * (1 - u), air: 2, u, flip: false }; }
    const u = it.kind === 3 ? ph : (ph - 0.5) * 2, high = it.kind === 3 ? Math.max(16, 26 * K.HS) : it.kind === 2 ? Math.max(19, 24 * K.HS) : it.kind === 1 ? Math.max(16, 18 * K.HS) : st.step > 1.5 ? 7 + st.step : 0;
    if (high && u > 0 && u < 1) return { y: runnerMix(tread(n - 1), tread(n), u) + high * (1 + 0.3 * flow.drop) * 4 * u * (1 - u), air: 1, u, flip: (V.flair ?? 1) > 0.5 && (n % 4 === 0 || it.kind === 3) };
    return { y: tread(pos), air: 0, u: 0, flip: false };
  }
  const runnerFloat = (pos, K) => Math.max(K.DN * 0.4, 40 + K.DN * 0.105) + Math.sin(pos * 0.8) * K.DN * 0.075 + Math.sin(pos * 0.31) * K.DN * 0.03; // the line it drifts along in a break (kept low enough on a short screen for what carries it to stay in the picture)
  const runnerFeet = (pos, K) => runnerMix(K.GY - runner.lift - runnerTrack(pos, K).y, runnerFloat(pos, K), eased(runner.gone));
  const runnerX = (pos, K) => K.HX + (pos - runner.beat) * runner.dpb;
  const runnerFlierX = (i, A) => { const span = A + 60; return span - ((((runner.fly * (1 + (i % 3) * 0.5) + runnerChance(i, 61) * 900) % span) + span) % span) - 30; }; // where the flier with this number is: each crosses from right to left at its own pace, and is out of the picture for a little on either side
  function runnerLay(n, building) { // what is laid at beat n, decided when it is laid from how the song is going just then
    const st = runner, it = runnerCourse[n & 127], bar = n & 3, r = runnerChance(n, 20), busy = flow.intensity + 0.5 * flow.drop, rhythm = RUNNER_PHRASES[(Math.round(V.course ?? 0) + (n >> 5)) & 3];
    it.n = n; it.taken = 0; it.kind = 0;
    if (st.floating) { if ((n & 7) === 7) it.kind = 4; return; } // afloat there is nothing to hop over, but every eighth beat carries three pickups in a row (kind 4)
    if (n < st.noThings || building || (st.period < 0.36 && n & 1)) return; // (a very fast song gets something on every other beat at most, or there would be no room to land)
    if (busy < 0.4 ? bar % 2 === 0 : busy > 0.8 || rhythm[bar]) it.kind = bar === 3 && r < 0.3 ? 3 : r > 0.72 ? 2 : 1;
    it.which = runnerChance(n, 21) < (it.kind === 2 ? V.kin ?? 0.5 : 0.4) ? 1 : 0;
  }

  function runnerPattern(gap) { // broken beats. Kicks that do not fall one to a beat (two or three a bar, as in drum and bass) fool the follower, whose tempo is the usual gap between kicks. But they come round the same every bar: so when the last gaps repeat in a cycle of two to six kicks, three times over, and fit a bar, the tempo (runner.own) is worked out from the bar. It is given the gap since the kick before
    const st = runner, P = st.past, same = (a, b) => Math.abs(a - b) < 0.045;
    if (gap > 3) { st.pastN = 0; return; } // after a silence the gaps are gathered afresh; the tempo is kept, a song does not change its own in a break
    P.copyWithin(0, 1); P[17] = gap; st.pastN = Math.min(18, st.pastN + 1); // the last eighteen gaps, the newest last
    if (st.pastN >= 4 && same(P[17], P[16]) && same(P[16], P[15]) && same(P[15], P[14])) st.ownFor += 4; // evenly spaced kicks: the follower has those right, and a tempo of our own is soon let go
    else for (let k = 2; k <= 6 && k * 3 <= st.pastN; k++) {
      let fits = true, bar = 0;
      for (let i = 0; i < 2 * k && fits; i++) fits = same(P[17 - i], P[17 - i - k]);
      if (!fits) continue;
      for (let i = 0; i < 3 * k; i++) bar += P[17 - i] / 3;
      for (const beats of [4, 8, 2, 1]) { // a bar of four beats if that gives a tempo music has, between 86 and 200 beats a minute; if not, of eight, two or one. And every gap in it must be a whole number of half beats: a likeness by chance seldom is
        const half = bar / beats / 2; let even = half >= 0.15 && half < 0.35;
        for (let i = 0; i < k && even; i++) even = Math.abs(P[17 - i] / half - Math.round(P[17 - i] / half)) * half < 0.045;
        if (even) { st.own = half * 2; st.cycle = k; st.ownFor = 0; return; }
      }
    }
    if (++st.ownFor > 20) st.own = 0; // twenty kicks with no such pattern: back to the follower's tempo
  }

  function runnerStep(K, real, wanted) { // the game moves on by one frame. real is the time by the clock on the wall, which is what the song keeps its beat by; everything that only moves in the picture goes by sound.dt
    const st = runner, { A, DN, GY, HX, HS } = K, dt = sound.dt, ease = (from, to, tau, by = dt) => from + (to - from) * Math.min(1, by / tau);
    const building = flow.part === "build" || flow.build > 0.35, climb = building ? clamp((flow.build - 0.25) / 0.6) : 0; // (with no kick at all the follower's build creeps up to a quarter and stays: that is not a build)
    if (st.fade) { st.fade += dt / 1.6; if (st.fade >= 1) { st.fade = 0; st.was = ""; } } // another kind of music came on: the new world fades in over the old one, and the game goes on
    else if (wanted !== st.world) { st.wantFor = wanted === st.want ? st.wantFor + real : 0; st.want = wanted; if (st.wantFor > 0.4) { st.was = st.world; st.world = wanted; st.fade = 0.001; } } // (once the answer has stood still a moment: the song's name and its mood do not arrive together)

    // The beat clock. It runs at the song's tempo and each kick near the beat pulls it into step. A kick off the beat is let pass while the clock is not yet sure of itself (broken beats have many);
    // only after eight kicks running were in step does a stray one make the figure skip, and a second at the same place move the beat there with a tumble
    const tempo = st.own || (flow.bpm > 40 ? 60 / flow.bpm : 0); // (the tempo worked out from a pattern of broken beats, while there is one, is truer than the follower's)
    if (tempo) st.period = ease(st.period, tempo, 0.5, real);
    st.sinceHit += real;
    if (sound.kickHit > 0) {
      const at = st.beat + st.owe, err = Math.round(at) - at, gap = st.sinceHit, grounded = !st.floating && !st.stumble && !runnerTrack(st.beat, K).air;
      runnerPattern(gap);
      if (!tempo && gap > 0.25 && gap < 1.2) st.period = st.gaps++ ? st.period + (gap - st.period) * 0.3 : gap; // until the follower knows the tempo, the first gap between two kicks is taken as it is
      if (!st.heard || gap > (st.own ? 4.5 : 2.5) * st.period) { st.owe += err; st.inStep = 1; st.off = st.sure = st.astray = 0; } // the first kick after a silence says where the beat is (in broken beats two kicks of one bar can stand well over two beats apart: a silence is then more than a bar)
      else if (Math.abs(err) < (st.own ? 0.15 : 0.2)) { st.owe += err * 0.7; st.inStep++; st.off = st.astray = 0; } // (in broken beats a kick can fall a quarter of a beat off: it must not tug the clock, so in step is then a narrower thing)
      else {
        const sure = st.inStep >= 8 || st.sure > 0;
        st.off = Math.abs(err - st.lastErr) < 0.12 ? st.off + 1 : 1;
        if (st.inStep >= 8) st.sure = 2; // (so the next kick still counts as coming after a sure beat)
        st.inStep = 0;
        if (st.off >= (sure ? 2 : 3)) { st.owe += err; st.off = 0; st.inStep = 1; if (sure && grounded && st.calmFor > 6) { st.stumble = 1; st.calmFor = 0; } } // the song moved its beat
        else if (sure && st.off === 1 && grounded) st.skip = 0.18; // a stray kick: a little skip
        if (st.own && !st.inStep && ++st.astray >= st.cycle) { st.owe += err; st.astray = st.off = 0; st.inStep = 1; } // broken beats, and a whole bar's kicks have gone by with none on the beat: the beat is moved to this one, quietly
      }
      st.sure = Math.max(0, st.sure - 1); st.lastErr = err; st.sinceHit = 0; st.heard = true;
      st.pound = flow.bpm > 150 && Math.round(at) & 1 ? st.pound : 1; // the hammers of the steelworks: on every kick, or every other one in a fast song
    } else st.pound *= Math.exp(-dt / 0.14);
    st.calmFor += real;
    const give = st.owe * Math.min(1, real / 0.2), before = st.beat, fast = T.speed * flow.pace; // (fast: how much quicker than the clock the picture runs just now, by the Speed knob and the song's pace)
    st.owe -= give; st.beat += Math.max(0, real / st.period + give);
    st.skyFor += st.beat - before;
    if (!st.iris && (st.turn || st.skyFor > 96)) { st.turn += (st.beat - before) / 8; if (st.turn >= 1) { st.turn = st.skyFor = 0; st.zone = 1 - st.zone; } } // a song that runs on with no drop still gets to see the other sky: after 96 beats under one it goes over to the other by itself, slowly, over eight beats
    const carry = Math.min(K.DPB, 85 * (V.gait ?? 1) * st.period) * (fast < 1 ? Math.max(0.6, fast) : 1 + (fast - 1) * 0.4) * (st.floating ? 0.8 : 1); // how many dots one beat carries it: never much more than 85 dots a second, so a fast song hops more often and scrolls no faster; and never under six tenths of its pace however low the Speed knob, or a beat would have less room than the things that stand on it
    st.dpb = st.dpb ? ease(st.dpb, carry, 1.2) : carry;
    const went = (st.beat - before) * st.dpb, gust = dt * (1 + 3 * climb + flow.drop);
    st.along = (st.along + went) % 7680; st.swell = (st.swell + went * 0.7) % (TAU * 1000); st.air = (st.air + went * 0.5) % (4 * A); st.gust = (st.gust + gust) % (4 * A * DN); st.fly = (st.fly + went * 0.5 + dt * 7) % (2 * (A + 60)); // (each wrapped where what it moves comes round to the same place)
    const wings = Math.min(6, Math.round(V.wings ?? 2) + Math.round(2 * flow.drop + flow.calm)); // who flies by: more of them after a drop and in a break. One joins or leaves only while it is out of the picture, so none appears or is gone in mid-air
    if (st.fliers < 0) st.fliers = wings;
    else if (wings !== st.fliers) { const more = wings > st.fliers, x = runnerFlierX(more ? st.fliers : st.fliers - 1, A); if (x < -20 || x > A) st.fliers += more ? 1 : -1; }

    // a break: the path falls away and it floats (it starts when calm is well up and ends when calm is well down, so a song hovering between the two does not flap; or when a whole bar has gone by without a kick:
    // a shorter gap is a fill, or a kick the listening missed, and real songs are full of those). A build: the path tilts into stairs, the scenery sinks
    const hushed = st.sinceHit > Math.max(1.6, 4.4 * st.period), floating = st.floating ? !(flow.calm < 0.4 && (building || !hushed)) : flow.calm > 0.6 || (hushed && !building);
    if (floating !== st.floating) { st.floating = floating; st.noThings = Math.ceil(st.beat) + (floating ? 0 : 4); for (let n = Math.ceil(st.beat) + 1; n <= st.laid; n++) { const got = runnerItem(n).taken; runnerLay(n, building); runnerItem(n).taken = got; } }
    st.gone = clamp(st.gone + (floating ? dt / 1.6 : -dt / 1.1));
    st.step = ease(st.step, building && !floating ? Math.min((2 + 8 * climb) * HS, ((GY * 0.8 - 26 * HS * climb) * st.dpb) / (A - HX)) : 0, building ? 1.2 : 0.5); // (never so steep that the stairs climb out of the top of the picture before they reach its right edge, as they would in a very flat window or at a slow pace)
    st.lift = ease(st.lift, 26 * HS * climb * (1 - st.gone), 1.2); st.sink = ease(st.sink, 60 * HS * climb, 1.5);
    while (st.laid < st.beat + Math.min(100, Math.ceil((A - HX) / st.dpb)) + 2) runnerLay(++st.laid, building); // the course is laid as far ahead as the picture shows at the pace it runs at now, so everything comes in from the right edge

    // the gate: it draws near through a build, and on the drop it bursts, the other sky pours out of it, and the figure leaps through to land on a kick
    const reach = (A - HX) / st.dpb + 1.2;
    let G = st.gate;
    if (!G && building) G = st.gate = { ahead: reach + 2, at: 0, slip: 0, open: 0, locked: false, quiet: 0, up: 1 };
    if (G && !G.locked) { G.ahead = ease(G.ahead, 1.6 + (reach - 1.6) * (1 - climb) ** 1.3, 0.8); G.quiet = building ? 0 : G.quiet + dt; if (G.quiet > 3) { G.ahead += dt * 4; if (G.ahead > reach + 2) G = st.gate = null; } } // (a build that came to nothing: it draws off again)
    if (flow.dropHit && !st.iris && !(G && G.locked) && st.skyFor >= 32) { // (a second drop while the sky is still opening, or the last gate still stands, or under a sky not yet 32 beats old, is let pass: a song that fools the follower must not swap the sky every few seconds)
      const b = Math.round(st.beat + st.owe);
      if (!G) G = st.gate = { ahead: Math.min(4, reach - 1.5), at: 0, slip: 0, open: 0, locked: false, quiet: 0, up: 0 }; // no build came before this drop: the gate rises out of the ground
      G.at = Math.min(b + 3, Math.max(b + 1, Math.round(st.beat + G.ahead))); G.slip = st.beat + G.ahead - G.at; G.locked = true; G.open = 0.001; // it stands at most three beats off: if it was farther it slides in over a moment
      st.leap = { a: st.beat, b: Math.max(b + 2, G.at + 1), high: DN * 0.3 }; st.noThings = st.leap.b + 2; st.iris = 0.001; st.irisAt = G.at; st.due += 12; st.stumble = 0;
      for (let n = Math.ceil(st.beat); n <= st.laid; n++) if (n <= st.leap.b + 1) runnerItem(n).kind = 0;
      for (let i = 0; i < 26; i++) runnerSpark(runnerX(G.at + G.slip, K) + (runnerChance(i, 31) - 0.5) * 24, GY - st.lift - 20 - runnerChance(i, 32) * DN * 0.35, (runnerChance(i, 33) - 0.5) * 170, -30 - runnerChance(i, 34) * 110, 0.9 + runnerChance(i, 35) * 0.8, "nmhab"[i % 5], i % 3 ? 2 : 3, 220);
    }
    if (G && G.up < 1) G.up = Math.min(1, G.up + dt / 0.3);
    if (G && G.locked) { G.open = Math.min(1, G.open + dt / 0.4); G.slip *= Math.exp(-dt / 0.2); if (st.beat - G.at > (HX + 60) / st.dpb) st.gate = null; }
    if (st.iris) { const cx = runnerX(st.irisAt, K); st.iris += (dt * Math.hypot(A, DN)) / 1.8; if (st.iris > Math.hypot(Math.max(cx, A - cx), DN) + 2) { st.iris = st.turn = st.skyFor = 0; st.zone = 1 - st.zone; } } // the circle of the other sky grows until it is the whole sky
    if (st.leap && st.beat >= st.leap.b) { st.leap = null; st.land = 0.25; }

    // taking what there is to take as it passes, and the counter ringing up: every hundred sends a ring of pickups flying
    const had = st.score;
    for (let n = Math.floor(before); n <= Math.ceil(st.beat) + 1; n++) { const it = runnerItem(n); if (it === RUNNER_BLANK) continue;
      (it.kind >= 3 ? RUNNER_THREE : RUNNER_ONE).forEach((back, k) => { if (!(it.taken & (1 << k)) && st.beat >= n - back) { it.taken |= 1 << k; st.score++; st.ring = 0.12; const y = runnerFeet(n - back, K) - 9; for (let i = 0; i < 4; i++) runnerSpark(HX + 2, y, [-34, 34, 0, 0][i], [0, 0, -34, 34][i], 0.16, "l"); } }); }
    if (st.due > 0 && (st.dueWait -= dt) <= 0) { st.due--; st.score++; st.ring = 0.12; st.dueWait = 0.07; }
    if (Math.floor(st.score / 100) > Math.floor(had / 100)) st.cheer = 1;
    st.score %= 100000;
    st.ring = Math.max(0, st.ring - dt); st.land = Math.max(0, st.land - dt); st.skip = Math.max(0, st.skip - dt); st.cheer = Math.max(0, st.cheer - dt / 1.3); st.stumble = Math.max(0, st.stumble - real / st.period / 1.5);
    const now = runnerTrack(st.beat, K), wasAir = st.inAir;
    st.inAir = now.air > 0;
    if (wasAir && !st.inAir && st.gone < 0.3) { st.land = Math.max(st.land, 0.1); for (let i = 0; i < 4; i++) runnerSpark(HX - 5 + i * 3, GY - st.lift - now.y - 1, (i - 1.5) * 26, -14 - 8 * (i % 2), 0.22, "h"); } // dust where it lands: on the kick
    st.glint = Math.max(-1, st.glint - dt); if (sound.hatHit && T.spark > 0 && st.glint < -0.16) st.glint = 0.09; // a glint on the pickups for a hi-hat, four times a second at most
    st.blink = (st.blink + dt) % 3.7;
    for (let i = 0; i < 16; i++) st.bands[i] += ((sound.bands[i * 4] + sound.bands[i * 4 + 1] + sound.bands[i * 4 + 2] + sound.bands[i * 4 + 3]) / 4 - st.bands[i]) * Math.min(1, dt / 0.3); // the spectrum in sixteen parts, followed slowly: what the lights and gauges show, so none of them blinks
    for (let i = runnerBits.length - 1; i >= 0; i--) { const b = runnerBits[i]; b.life -= dt; if (b.life <= 0) { runnerBits.splice(i, 1); continue; } b.vy += b.fall * dt; b.x += b.vx * dt - went * 0.6; b.y += b.vy * dt; }
    if (st.beat > 4096 && !st.gone && !st.leap && !st.gate && !st.iris) { st.beat -= 4096; st.laid -= 4096; st.noThings -= 4096; for (const it of runnerCourse) it.n -= 4096; } // the count of beats starts again now and then, where nothing shows it
  }

  function runnerDraw(S, L) { // one frame of the game as it stands, in one world's look
    const st = runner, { K, W, css, art } = L, { A, DN, GY, HX, HS, WL } = K, X = S.x, t = sound.t, kick = clamp(sound.kick), gone = eased(st.gone), rd = Math.round, beatIn = st.beat - Math.floor(st.beat);
    const R = (tone, px, py, wide, tall) => { X.fillStyle = css[tone]; X.fillRect(rd(px), rd(py), rd(wide), rd(tall)); };
    const slide = (c, speed, down) => { const off = -rd((st.along * speed) % WL); X.drawImage(c, off, rd(down)); if (off + WL < A) X.drawImage(c, off + WL, rd(down)); };
    X.globalAlpha = 1; X.globalCompositeOperation = "source-over";
    // the sky, and the other sky opening out of the gate after a drop, a row of dots at a time so its edge is a clean circle of dots
    const skyOf = (z) => L.skies[z] || (L.skies[z] = L.sky(z));
    X.drawImage(skyOf(st.zone), 0, 0);
    if (st.turn) { X.globalAlpha = eased(st.turn); X.drawImage(skyOf(1 - st.zone), 0, 0); X.globalAlpha = 1; }
    if (st.iris) { const cx = rd(runnerX(st.irisAt + (st.gate && st.gate.locked ? st.gate.slip : 0), K)), cy = rd(GY - st.lift - DN * 0.25), r = st.iris, other = skyOf(1 - st.zone);
      for (let y = Math.max(0, Math.ceil(cy - r)); y < Math.min(DN, cy + r); y++) { const half = Math.floor(Math.sqrt(r * r - (y - cy) ** 2)), x0 = Math.max(0, cx - half), x1 = Math.min(A, cx + half); if (x1 > x0) { X.drawImage(other, x0, y, x1 - x0, 1, x0, y, x1 - x0, 1); R("l", cx - half, y, 1, 1); R("l", cx + half - 1, y, 1, 1); } } }
    // the distance: two strips at a tenth and three tenths of the pace, sinking as it climbs; and the things in them that answer the music
    const bob = W.bob ? rd(kick * W.bob) : 0;
    slide(L.far, 0.1, st.sink * 0.25); slide(L.mid, 0.3, st.sink * 0.6 - bob);
    for (const thing of L.hot) { let x = rd((((thing.x - st.along * thing.sp) % WL) + WL) % WL); const y = rd(thing.y + st.sink * (thing.sp < 0.2 ? 0.25 : 0.6) - (thing.sp < 0.2 ? 0 : bob)), level = st.bands[((thing.n || 0) * 5 + 2) & 15];
      if (x > WL - 40) x -= WL;
      if (x > A + 40) continue;
      if (thing.kind === "lamp") { if ((t * 0.7 + thing.x) % 2 < 1) R("c", x, y, 2, 2); }
      else if (thing.kind === "drip") { if (kick > 0.12) { const fall = (1 - kick) * 22; R("a", x, y + fall, 1, 2); R("l", x, y + fall, 1, 1); } }
      else if (thing.kind === "gauge") { const v = rd(level * 5); R("s", x, y + 3 - v, 6, v); R("a", x, y + 3 - v, 6, 1); }
      else if (thing.kind === "pulse") { const r = thing.rx + 2 + (1 - kick) * 5; if (kick > 0.25) for (let k = 0; k < 9; k++) { const a = Math.PI * (1 + k / 8); R(k & 1 ? "l" : "b", x + Math.cos(a) * r, y + 6 + Math.sin(a) * r * 0.8, 1, 1); } }
      else if (thing.kind === "flame") { const v = 2 + rd(level * 9 + runnerChance(thing.n, Math.floor(t * 6) % 64) * 2); R("c", x - 2, y - v + 2, 4, v - 1); R("a", x - 1, y - v, 2, v); R("b", x - 1, y - 1, 1, 1); }
      else if (thing.kind === "hammer") { const fall = rd(thing.reach * eased(clamp(st.pound * 1.3))); R("m", x - 1, y, 2, fall + 2); R("n", x - 6, y + fall + 2, 12, 10); R("h", x - 6, y + fall + 2, 12, 1); R("h", x - 6, y + fall + 2, 1, 10); R("c", x - 4, y + fall + 9, 8, 1); if (st.pound > 0.8) { R("b", x - 9, GY - 12, 1, 1); R("b", x + 8, GY - 13, 1, 1); R("a", x - 11, GY - 14, 1, 1); R("a", x + 10, GY - 12, 1, 1); } }
      else if (thing.kind === "beacon") { const v = rd(level * 22 * HS); for (let j = 0; j < v; j++) if ((j + x) & 1 || j < 4) R(j < 4 ? "l" : "a", x + (j > 8 && j % 3 === 0 ? 1 : 0), y - 5 - j, 1, 1); R("a", x - 1, y - 1, 3, 2); }
      else if (thing.kind === "meter") { const v = rd(level * thing.rows); for (let j = 0; j < thing.rows; j++) R(j >= v ? "n" : j > thing.rows - 2 ? "c" : j > thing.rows - 4 ? "a" : "b", x, y + (thing.rows - 1 - j) * 4, 3, 2); }
      else if (thing.kind === "sign") for (let j = 0; j < 6; j++) { const v = 1 + rd(st.bands[(thing.n * 3 + j * 2) & 15] * 7); R(j & 1 ? "b" : "a", x + j * 3, y + 1 - v, 2, v); }
    }
    // what lies under the path: sludge, a pond, molten steel, a sea of cloud, a street. Bands of color right across, and a surface that swells with the bass
    const dy = K.DEEP + rd(st.sink * 0.15 - gone * DN * 0.11);
    R("Y", 0, dy + 4, A, 4); R("Z", 0, dy + 8, A, DN); X.drawImage(L.dots, 0, dy + 8); X.drawImage(L.dots, 1, dy + 9);
    if (W.swell === "street") { R("Y", 0, dy, A, 4); R("m", 0, dy, A, 1); for (let i = 0; i < 12; i++) { const back = i & 1, span = A + 60, x = ((((runnerChance(i, 70) * span + (back ? 1 : -1) * st.fly * (1 + (i % 3) * 0.5)) % span) + span) % span) - 30; R(back ? "r" : "X", x, dy + 3 + (back ? 0 : 3) + (i % 2), 3, 1); } } // head lamps one way and tail lamps the other
    else { X.fillStyle = css.Y; X.beginPath();
      for (let sx = 0; sx < A; sx++) { const wx = sx + st.swell, y = dy + rd(W.swell === "puffs" ? -Math.abs(Math.sin(wx * 0.07)) * 5 - Math.abs(Math.sin(wx * 0.023 + 1)) * 4 : Math.sin(wx * 0.13 + t * 1.7) * (0.8 + 2 * sound.bass) + Math.sin(wx * 0.045 - t * 0.8) * 1.5); st.tops[sx] = y; X.rect(sx, y + 2, 1, dy + 4 - y - 2); }
      X.fill(); X.fillStyle = css.X; X.beginPath(); for (let sx = 0; sx < A; sx++) X.rect(sx, st.tops[sx], 1, 2); X.fill(); }
    // the gate, behind the path
    if (st.gate) runnerGate(R, K, rd(runnerX(st.gate.locked ? st.gate.at + st.gate.slip : st.beat + st.gate.ahead, K)));
    // the path: copied from its strip in pieces eight dots wide, so each piece can fall on its own in a break, stand a step higher in a build, or be left out where a gap was laid
    const fallen = DN - GY + 24, whole = Math.floor(st.along), base = GY - st.lift, high = DN + 4, lights = W.lights;
    const dropOf = (chunk) => eased(clamp(st.gone * 1.9 - runnerChance(chunk % 960, 40) * 0.9)) ** 2 * fallen;
    for (let sx = -(whole % 8); sx < A; sx += 8) {
      const chunk = (sx + whole) >> 3, drop = dropOf(chunk), x1 = Math.min(A, sx + 8);
      if (drop >= fallen - 1) continue;
      let from = Math.max(0, sx), was = NaN, parts = 0;
      for (let c = from; c <= x1; c++) { // (the dots of one piece mostly share one height: where they do not, at the edge of a step or of a gap, it is copied in two parts; -999 stands for a gap)
        let y = NaN;
        if (c < x1) { const pos = st.beat + (c - HX) / st.dpb, n = Math.ceil(pos), ph = pos - (n - 1); y = runnerItem(n).kind === 3 && ph > 0.24 && ph < 0.78 ? -999 : rd(base - (Math.floor(pos + 0.25) - st.beat) * st.step + drop); }
        if (c > from && y !== was) { if (was !== -999) X.drawImage(L.path, (from + whole) % K.PW, 0, c - from, high, from, was - 4, c - from, high); parts++; from = c; }
        if (c < x1) was = y;
      }
      if (lights && parts === 1 && x1 - sx === 8 && sx >= 0 && was !== -999 && chunk % lights.every === lights.at) lights.draw(R, sx, was, st.bands[Math.floor(chunk / lights.every) & 15]); // the lights let into the path, each showing its own part of the spectrum
    }
    // the things on it: what to hop over, who lives here, what to take
    for (let n = Math.floor(st.beat - HX / st.dpb) - 1; n <= st.laid; n++) { const it = runnerItem(n); if (it === RUNNER_BLANK) continue;
      const x = runnerX(n - 0.25, K) - rd(clamp(st.step / 3) * 8), top = base - (n - 1 - st.beat) * st.step + dropOf(Math.floor((x + st.along) / 8));
      if (x > -20 && x < A + 20 && top < DN + 20) {
        if (it.kind === 1) { const s = art.low[it.which]; S.put(s, x - s.width / 2, top - s.height + 1); }
        if (it.kind === 2) { const s = art.creature[it.which][Math.floor(st.beat * 2 + n) & 1]; S.put(s, x - s.width / 2, top - s.height + 1); }
      }
      (it.kind >= 3 ? RUNNER_THREE : RUNNER_ONE).forEach((back, k) => { if (it.taken & (1 << k)) return; const gx = runnerX(n - back, K), gy = runnerFeet(n - back, K) - 9 + rd(Math.sin(t * 4 + n) * 1.2);
        if (gx > -8 && gx < A + 8) { S.put(art.gem, gx - (art.gem.width >> 1), gy - (art.gem.height >> 1)); if (st.glint > 0 && (n + k) % 2 === 0) { R("l", gx - 4, gy, 9, 1); R("l", gx, gy - 4, 1, 9); } } });
    }
    const here = runnerTrack(st.beat, K);
    if (kick > 0.3 && gone < 0.3 && !here.air) { const out = rd((1 - kick) * 30) + 8, y = base - here.y; R("l", HX - out, y, 1, 1); R("l", HX + out, y, 1, 1); R("l", HX - out + 2, y, 1, 1); R("l", HX + out - 2, y, 1, 1); } // each kick it lands on runs out along the path as four dots
    for (let i = st.fliers - 1; i >= 0; i--) S.put(art.flyer[Math.floor(st.beat * 2 + i) & 1], runnerFlierX(i, A), DN * (0.1 + 0.34 * runnerChance(i, 62)) + Math.sin(t * 1.1 + i * 2.4) * 5 + st.sink * 0.3); // who flies by (how many is settled in runnerStep)
    runnerFigure(S, L, here, gone, beatIn);
    for (const b of runnerBits) if (b.life > b.all * 0.25 || Math.floor(b.life * 30) % 2) R(b.tone, b.x, b.y, b.size, b.size);
    // what drifts in the air: bubbles, spores, embers, petals, rain. Each is placed by a sum, so nothing is kept for them
    const wth = W.weather, count = rd((K.TALL ? 14 : 22) * (0.4 + 0.6 * flow.intensity + 0.5 * clamp((flow.build - 0.25) / 0.6)));
    for (let i = 0; i < count; i++) { const f = (2 + (i % 5)) / 4; R(wth.tones[i % wth.tones.length], (((runnerChance(i, 50) * A - (st.air + st.gust * wth.side) * f) % A) + A) % A, (((runnerChance(i, 53) * DN - st.gust * wth.up * f + Math.sin(t * 0.7 + i) * 4) % DN) + DN) % DN, 1, wth.up < 0 ? 3 : 1); }
    if (st.cheer > 0) { const out = 1 - st.cheer, feet = runnerFeet(st.beat, K); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + out * 2; S.put(art.gem, HX + Math.cos(a) * (8 + out * 44 * HS) - (art.gem.width >> 1), feet - 12 - out * 46 * HS + Math.sin(a) * (6 + out * 30 * HS) - (art.gem.height >> 1)); } } // a hundred more on the counter: a ring of pickups flies up and away
    // the counter: what it has taken so far, top left, in small figures that hop when it rings
    S.put(art.gem, 4, 4); S.digits(st.score, 6 + art.gem.width, 5 - (st.ring > 0 ? 1 : 0), css[st.ring > 0 ? "l" : "h"]);
  }
  function runnerGate(R, K, gx) { // two posts, a beam across with the world's sign on it, and a door of two leaves that slide apart
    const G = runner.gate, { A, DN, GY } = K, rd = Math.round, wide = K.TALL ? 38 : 48, tall = rd(DN * 0.6), base = GY + 10 - rd(runner.lift * 0.8), top = base - tall + rd((1 - eased(G.up)) * (tall + 14)), post = 8, open = eased(clamp(G.open)), leaf = rd(((wide - post * 2) / 2) * (1 - open)), x0 = rd(gx - wide / 2);
    if (x0 > A + 4 || x0 + wide < -4) return;
    for (const side of [0, 1]) { const px = side ? x0 + wide - post : x0, lx = side ? x0 + wide - post - leaf : x0 + post;
      if (leaf > 0) { R("n", lx, top + 12, leaf, DN); R("m", lx, top + 12, leaf, 1); for (let y = top + 18; y < DN; y += 14) { R("m", lx + 1, y, leaf - 2, 1); if (leaf > 6) R("a", lx + (side ? 2 : leaf - 4), y + 6, 2, 2); } R("k", side ? lx : lx + leaf - 1, top + 12, 1, DN); }
      R("m", px, top + 4, post, DN); R("h", px, top + 4, 2, DN); R("n", px + post - 2, top + 4, 2, DN); for (let y = top + 16; y < DN; y += 12) R("n", px, y, post, 1); }
    R("m", x0 - 3, top, wide + 6, 12); R("h", x0 - 3, top, wide + 6, 2); R("n", x0 - 3, top + 10, wide + 6, 2); R("h", x0 - 3, top, 2, 12);
    R("k", gx - 4, top + 3, 8, 6); R(open ? "b" : "a", gx - 3, top + 4, 6, 4); R("k", gx - 1, top + 5, 2, 2);
    if (!open && flow.build > 0.45) for (let y = top + 13; y < DN; y++) if (runnerGrain(gx, y) < flow.build) R("b", gx - ((y >> 1) & 1 ? 0 : 1), y, 1, 1); // light through the crack as the build tops out
  }
  function runnerFigure(S, L, k, gone, beatIn) { // the figure: its body is one small picture, turned over in a somersault; its two feet, its scarf and what carries it over a break are drawn dot by dot
    const st = runner, { K, W, css } = L, { HX, HS } = K, X = S.x, t = sound.t, rd = Math.round, floatish = gone > 0.35, feet = runnerFeet(st.beat, K) - (st.skip > 0 ? rd(Math.sin((st.skip / 0.18) * Math.PI) * 5) : 0);
    const R = (tone, px, py, wide, tall) => { X.fillStyle = css[tone]; X.fillRect(rd(px), rd(py), rd(wide), rd(tall)); };
    const body = st.body || (st.body = pixelSprite(...RUNNER_BODY));
    if (st.drawn !== st.seen) { st.drawn = st.seen; st.scarf += (clamp((st.feetWas - feet) / Math.max(sound.dt, 1e-3) / 90 + 0.5) * 2 - 1 - st.scarf) * Math.min(1, sound.dt / 0.08); st.feetWas = feet; } // the scarf lifts as it falls and hangs as it rises (worked out once a frame, though this may be drawn twice)
    let turn = 0, tuck = false, bob = 0, f1 = [-4, 0], f2 = [2, 0];
    if (st.stumble > 0) { const u = 1 - st.stumble; turn = Math.floor(u * 6) % 4; bob = -rd(Math.sin(u * Math.PI) * 14 * HS + Math.abs(Math.sin(u * TAU * 1.5)) * 3); tuck = true; } // a tumble: head over heels, one and a half times
    else if (k.air === 2) { turn = Math.floor(k.u * 8) % 4; tuck = true; }
    else if (k.air && !floatish) { if (k.flip) { turn = Math.floor(clamp(k.u * 1.15) * 3.999) % 4; tuck = true; } else if (k.u < 0.5) { f1 = [-4, -1]; f2 = [1, -2]; } else { f1 = [-5, -1]; f2 = [3, 0]; } }
    else if (floatish) { const sway = rd(Math.sin(t * 2.2)); f1 = [-4, sway]; f2 = [1, -sway]; }
    else { const th = beatIn * TAU; f1 = [rd(3.4 * Math.cos(th)) - 2, -rd(Math.max(0, Math.sin(th)) * 3)]; f2 = [rd(3.4 * Math.cos(th + Math.PI)) - 2, -rd(Math.max(0, Math.sin(th + Math.PI)) * 3)]; bob = st.land > 0.04 ? 1 : -rd(Math.abs(Math.sin(th)) * 1.2); } // running: one stride to the beat
    const fy = rd(feet) + bob, bx = HX - 8, by = fy - 17 + (st.land > 0.04 && !k.air ? 1 : 0);
    if (floatish) { // what carries it over a break: a bubble, a seed head, a little canopy or a bunch of balloons
      if (W.float === "bubble") { for (let j = 0; j < 40; j++) { const a = (j / 40) * TAU; if (gone > 0.6 || j % 2) R(j > 22 && j < 30 ? "l" : "a", HX + Math.cos(a) * 14, by + 8 + Math.sin(a) * 14, 1, 1); } R("l", HX - 8, by - 2, 2, 1); R("l", HX - 10, by, 1, 2); }
      else if (W.float === "seed") { const top = by - 13, sway = Math.sin(t * 1.6) * 0.8; R("l", HX, top + 2, 1, 12); for (let j = 0; j < 9; j++) { const a = Math.PI * (1.05 + (j / 8) * 0.9); for (let d = 2; d < 9; d += 2) R(d > 6 ? "b" : "l", HX + Math.cos(a) * d + sway * d * 0.2, top + 2 + Math.sin(a) * d, 1, 1); R("a", HX + Math.cos(a) * 10 + sway * 2, top + 2 + Math.sin(a) * 10, 1, 1); } }
      else if (W.float === "balloons") { for (let j = 0; j < 3; j++) { const cx = HX - 7 + j * 7 + rd(Math.sin(t * 1.3 + j) * 1.2), cy = by - 15 - (j === 1 ? 4 : 0); for (let d = 1; d < 14 + (j === 1 ? 4 : 0); d += 2) R("h", runnerMix(cx, HX, d / 16), cy + 5 + d, 1, 1); R("abc"[j], cx - 2, cy - 3, 5, 7); R("abc"[j], cx - 3, cy - 2, 7, 5); R("l", cx - 1, cy - 2, 1, 2); } }
      else { const top = by - 15; for (let j = 0; j < 6; j++) { const half = rd(11 * Math.sqrt(1 - ((5 - j) / 6.5) ** 2)); for (let xx = -half; xx < half; xx++) R("alcla"[Math.floor(((xx + 11) / 22) * 5)], HX + xx, top + j, 1, 1); } R("k", HX - 11, top + 6, 22, 1); for (let j = 0; j < 8; j++) { R("h", HX - 10 + j, top + 7 + j, 1, 1); R("h", HX + 9 - j, top + 7 + j, 1, 1); } }
    }
    for (let i = 1; i <= 5; i++) R(i > 3 ? "T" : "S", bx - i * 2 + 1, by + 8 + rd(Math.sin(t * 9 - i * 0.9) * (0.4 + i * 0.25) + st.scarf * i * 0.9), 2, 2); // the scarf: five bits that trail and lag
    if (turn) { const [c, s] = [[1, 0], [0, 1], [-1, 0], [0, -1]][turn]; X.setTransform(c, s, -s, c, HX, by + 7); X.drawImage(body, -8, -7); X.setTransform(1, 0, 0, 1, 0, 0); }
    else { S.put(body, bx, by); if (st.blink < 0.12) { R("C", bx + 9, by + 5, 6, 2); R("O", bx + 9, by + 7, 2, 1); R("O", bx + 12, by + 7, 2, 1); } } // (it blinks now and then)
    if (!tuck) for (const [f, tone] of [[f2, "D"], [f1, "B"]]) { R("O", HX + f[0] - 1, fy - 3 + f[1], 5, 3); R(tone, HX + f[0], fy - 3 + f[1], 3, 2); }
  }
  function runnerFx() {
    const st = runner, S = pixelScreen(Math.round(w / Math.max(2, Math.round(Math.sqrt(w * h) / 240)))), wanted = RUNNER_WORLD_OF[musicWorld()] || "board"; // dots of about a 240th of the picture's size, so a wide screen is some 320 across and a phone some 150
    if (st.fresh) { runnerBegin(); st.seen = 0; }
    if (!st.world) st.world = wanted;
    let L = runnerLook(st.world, S);
    if (st.seen !== realNow) { // (asked for twice in one frame while the effect is being changed: the game moves on only once)
      const real = Math.min(0.1, Math.max(0, (realNow - (st.seen || realNow)) / 1000));
      st.seen = realNow;
      runnerStep(L.K, real, wanted);
      if (L.W !== RUNNER_WORLDS[st.world]) L = runnerLook(st.world, S);
    }
    if (st.fade) { runnerDraw(S, runnerLook(st.was, S)); S.show(); runnerDraw(S, L); S.show(eased(st.fade)); } // going over to another world: the old one, and the new one over it more and more
    else { runnerDraw(S, L); S.show(); }
    if (!L.skies[1 - st.zone] && L.made !== realNow) L.skies[1 - st.zone] = L.sky(1 - st.zone); // the other sky is drawn a frame after the rest, well before a drop can want it, so that starting is spread over two frames
  }
  /* ==== runner: end ==== */
  /* ==== arcade: begin ==== */
  /* ---------- Arcade: an arcade machine that plays itself to the song, on the pixel screen. One small ship at the foot of a field that scrolls down. Foes come in a wave at a time and settle into a figure
     (a clock face, a ring inside a ring, a spiral, a fan); the ship slides under one, a bolt leaves on the hi-hat and lands on the next kick: one foe a beat, and a count that climbs. In a break the foes
     leave and the ship drifts through a ribbon of lights; through a build a great foe comes down and is shot once, then twice, then four times a beat; on the drop it splits and bursts, the stage goes up
     and the ship flies a loop. The kind of music picks the world: its scenery, its foes and its great foe. Every figure here is our own drawing, made for this effect. ---------- */
  const arcadeFx = (() => {
    const WHITE = [255, 255, 255], BLACK = [0, 0, 0], STRIP = 256, lerp = (a, b, p) => a + (b - a) * p; // STRIP: how many dots tall a strip of scenery is before it comes round again
    const GRAIN = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], grain = (x, y) => (GRAIN[(x & 3) + (y & 3) * 4] + 0.5) / 16; // the old way to blend two colors: a pattern of dots, four by four
    const chance = (x, y, s = 0) => { let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s + 1, 1274126177); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }; // the same number from 0 to 1 every time for the same place, so scenery can be worked out and need not be kept
    const WORLD_OF = { acid: "acid", psy: "psy", hard: "hard", trance: "trance", techno: "techno", house: "house", jungle: "jungle", ambient: "ambient", game: "toys", "": "toys" }; // which world each answer of musicWorld() gets

    /* The worlds. Each has its scenery, its pace, the figures its foes settle into, the ways they fly in, how fast a round figure turns, whether the ship takes the nearest foe next or leaps to the farthest,
       which foes it has (the second kind, or the first in other colors, comes every other wave), its great foe, and its colors: bg behind everything, k for the scenery, then the ship (hull, shade, fins, glass),
       the foes (body, shade, mark, eye), the second foes (body, shade), the great foe, the ship's bolt, the four colors a burst goes through, and the lamps. */
    const WORLDS = {
      toys: { scene: "space", pace: 1, forms: ["clock", "rings", "spiral", "petals"], enter: ["top", "sides", "swirl"], spin: 0.15, sweep: "near", foes: ["kite", "top"], boss: "lantern", // kites and spinning tops under a great paper lantern: for game music, and for when nothing says what kind of music it is
        bg: [8, 8, 20], k: [[26, 22, 58], [50, 30, 86], [64, 72, 112], [150, 160, 200], [236, 240, 255], [34, 58, 96], [66, 112, 150], [150, 204, 216]],
        ship: [[244, 236, 214], [146, 136, 160], [255, 140, 60], [90, 220, 200]], foe: [[255, 116, 112], [176, 60, 92], [255, 236, 170], [255, 255, 255]], foe2: [[250, 200, 80], [176, 112, 40]],
        great: [[236, 96, 80], [150, 44, 70], [255, 214, 120], [255, 246, 200]], shot: [255, 244, 170], burst: [[255, 255, 255], [255, 224, 96], [255, 124, 60], [150, 50, 76]], lamp: [110, 224, 255] },
      acid: { scene: "vats", pace: 1, forms: ["snake", "helix", "rings", "diamond"], enter: ["squig", "top"], spin: 0, sweep: "near", foes: ["drop"], boss: "vat", // one-eyed drops over runs of acid
        bg: [14, 8, 22], k: [[22, 14, 36], [32, 20, 48], [44, 28, 62], [24, 58, 22], [44, 96, 26], [96, 160, 34], [60, 52, 82], [108, 98, 132], [226, 240, 96]],
        ship: [[240, 236, 204], [134, 124, 96], [255, 150, 40], [190, 255, 90]], foe: [[240, 232, 60], [160, 150, 30], [255, 255, 255], [20, 12, 30]], foe2: [[255, 164, 50], [176, 92, 30]],
        great: [[200, 210, 60], [98, 128, 40], [255, 140, 40], [255, 255, 255]], shot: [210, 255, 130], burst: [[255, 255, 255], [240, 246, 100], [150, 220, 40], [58, 110, 40]], lamp: [190, 255, 90] },
      psy: { scene: "garden", pace: 1.1, forms: ["petals", "spiral", "rings", "diamond"], enter: ["swirl", "sides"], spin: 0.3, sweep: "near", foes: ["bloom"], boss: "flower", // flowers with an eye, over a wheel of lights
        bg: [14, 6, 34], k: [[34, 14, 64], [62, 22, 96], [255, 70, 160], [60, 220, 230], [255, 160, 40], [170, 240, 70], [255, 244, 220]],
        ship: [[240, 230, 255], [132, 104, 196], [255, 70, 160], [60, 220, 230]], foe: [[255, 150, 40], [150, 60, 110], [255, 70, 160], [240, 255, 130]], foe2: [[60, 220, 230], [40, 70, 150]],
        great: [[255, 70, 160], [120, 40, 140], [240, 220, 190], [170, 240, 70]], shot: [130, 255, 232], burst: [[255, 255, 255], [60, 220, 230], [255, 70, 160], [110, 40, 150]], lamp: [255, 70, 160] },
      hard: { scene: "foundry", pace: 1.6, forms: ["cross", "fan", "arrows", "diamond"], enter: ["drop", "top"], spin: 0, sweep: "far", foes: ["skull"], boss: "engine", // horned skulls over molten metal
        bg: [10, 4, 6], k: [[16, 4, 6], [40, 8, 8], [84, 14, 10], [150, 40, 14], [226, 110, 30], [50, 48, 58], [24, 22, 30], [255, 120, 40]],
        ship: [[228, 228, 234], [112, 110, 128], [255, 52, 40], [255, 204, 90]], foe: [[216, 210, 198], [124, 110, 108], [255, 60, 40], [255, 220, 120]], foe2: [[170, 176, 190], [84, 88, 108]],
        great: [[120, 116, 130], [62, 60, 74], [255, 150, 40], [255, 60, 40]], shot: [255, 232, 150], burst: [[255, 255, 255], [255, 220, 110], [255, 110, 30], [140, 24, 24]], lamp: [255, 60, 40] },
      trance: { scene: "clouds", pace: 0.9, forms: ["arcs", "fan", "rings", "helix"], enter: ["sides", "swirl"], spin: 0.12, sweep: "near", foes: ["bell"], boss: "crystal", // ringing glass bells over a sea of cloud at first light
        bg: [10, 12, 44], k: [[10, 12, 44], [30, 28, 92], [84, 52, 134], [156, 84, 146], [24, 24, 76], [34, 30, 92], [52, 44, 116], [96, 76, 150], [150, 130, 150], [226, 204, 190], [255, 244, 220]],
        ship: [[255, 255, 255], [146, 156, 208], [255, 132, 190], [124, 232, 255]], foe: [[124, 232, 255], [58, 116, 204], [255, 250, 190], [255, 255, 255]], foe2: [[255, 170, 214], [170, 84, 170]],
        great: [[170, 220, 255], [84, 110, 204], [255, 232, 170], [255, 250, 200]], shot: [255, 255, 224], burst: [[255, 255, 255], [255, 240, 170], [255, 150, 204], [110, 96, 190]], lamp: [255, 170, 214] },
    };
    // the other kinds of music borrow a scenery, and bring their own colors, pace and foes
    WORLDS.techno = { ...WORLDS.hard, pace: 1.2, forms: ["clock", "arrows", "diamond", "cross"], enter: ["drop", "squig"], spin: 0.1, sweep: "near", foes: ["cog"], bg: [6, 8, 10], k: [[6, 12, 16], [8, 20, 26], [12, 34, 40], [18, 58, 64], [36, 104, 104], [44, 48, 54], [20, 22, 26], [120, 240, 230]], // turning cogs over a cold works
      foe: [[200, 206, 212], [100, 108, 120], [255, 150, 40], [255, 230, 150]], foe2: [[150, 160, 170], [70, 78, 92]], great: [[110, 116, 124], [56, 60, 70], [120, 240, 230], [255, 150, 40]],
      ship: [[230, 234, 236], [110, 120, 130], [255, 150, 40], [120, 240, 230]], burst: [[255, 255, 255], [150, 236, 226], [40, 150, 160], [30, 60, 80]], lamp: [120, 240, 230], shot: [200, 255, 244] };
    WORLDS.house = { ...WORLDS.toys, pace: 0.95, forms: ["rings", "petals", "arcs", "clock"], enter: ["swirl", "top"], spin: 0.2, foes: ["ball"], bg: [18, 8, 26], k: [[44, 16, 56], [78, 24, 80], [110, 70, 120], [220, 150, 190], [255, 236, 200], [150, 70, 40], [236, 150, 50], [255, 226, 140]], // mirror balls in a warm night
      ship: [[255, 244, 230], [170, 130, 160], [255, 110, 170], [255, 226, 140]], foe: [[255, 110, 170], [150, 44, 110], [255, 226, 140], [255, 255, 255]], foe2: [[255, 190, 70], [170, 96, 30]], great: [[236, 96, 150], [130, 44, 110], [255, 210, 110], [255, 250, 190]], lamp: [255, 190, 70] };
    WORLDS.jungle = { ...WORLDS.psy, pace: 1.5, forms: ["snake", "cross", "helix", "spiral"], enter: ["drop", "swirl"], spin: 0, sweep: "far", bg: [6, 16, 14], k: [[10, 34, 26], [18, 58, 36], [236, 190, 50], [90, 200, 90], [240, 110, 50], [170, 230, 90], [250, 246, 210]], // the garden gone green and quick
      ship: [[244, 240, 214], [120, 140, 110], [240, 110, 50], [170, 230, 90]], foe: [[240, 190, 50], [150, 96, 40], [240, 110, 50], [255, 255, 200]], foe2: [[110, 220, 110], [30, 110, 70]], great: [[90, 190, 90], [34, 96, 60], [240, 230, 190], [240, 110, 50]], burst: [[255, 255, 255], [240, 230, 110], [240, 110, 50], [40, 110, 60]], shot: [220, 255, 170], lamp: [170, 230, 90] };
    WORLDS.ambient = { ...WORLDS.trance, pace: 0.55, forms: ["arcs", "rings", "petals"], enter: ["sides"], spin: 0.08, bg: [4, 8, 22], k: [[4, 8, 22], [8, 20, 44], [14, 40, 66], [26, 70, 90], [16, 36, 60], [20, 44, 70], [44, 84, 110], [150, 210, 210], [110, 130, 150], [190, 210, 220], [240, 250, 250]], // the clouds by night, slow
      foe: [[150, 230, 220], [50, 120, 140], [250, 250, 210], [255, 255, 255]], foe2: [[170, 190, 250], [80, 96, 180]], lamp: [150, 230, 220] };

    /* The drawings. A sprite is written as rows of characters, and only its left half when both sides are the same. The light is then put on by rule, from the upper left: the body colors (a to d) come out
       paler where the dot above or to the left is empty and darker where the dot below or to the right is, and a dark line goes all the way round. */
    const SHIP = [".......a", ".......a", "......aa", "......aa", ".....aab", ".....aww", "....aaww", "....abww", "...aaabw", "...aaaba", "..caaaba", ".ccaaaaa", "cccaabaa", "cc..abba", "c....abb", "......cc"]; // a dart: one long nose with the gun in it, a round glass, two fins swept back
    const FOES = { // each in two poses, which change on every beat
      kite: [[".......aa.......", ".....aabbaa.....", "...aaaabbaaaa...", ".cccccccccccccc.", "..aaaaabbaaaaa..", "...aaaabbaaaa...", "....aaabbaaa....", ".....aabbaa.....", "......abba......", ".......bb.......", "........e.......", ".........e......", "........ee......", ".......e........"], // a paper kite on its two sticks, its tail swinging from side to side (written at full width, as its two sides differ)
        [".......aa.......", ".....aabbaa.....", "...aaaabbaaaa...", ".cccccccccccccc.", "..aaaaabbaaaaa..", "...aaaabbaaaa...", "....aaabbaaa....", ".....aabbaa.....", "......abba......", ".......bb.......", ".......e........", "......e.........", "......ee........", "........e......."]],
      top: [[".......b", ".......b", "......bb", "...aaaaa", ".aaaaaaa", "acacacac", "aaaaaaaa", ".aaaaaaa", "...aaaaa", ".....aaa", "......aa", ".......e", ".......e"], // a spinning top: its stripe goes round
        [".......b", ".......b", "......bb", "...aaaaa", ".aaaaaaa", "cacacaca", "aaaaaaaa", ".aaaaaaa", "...aaaaa", ".....aaa", "......aa", ".......e", ".......e"]],
      drop: [[".......a", "......aa", "......aa", ".....aaa", "....aaaa", "...aaccc", "..aacccc", "..aaccee", "..aaccee", "..aaaccc", "...aaaaa", "...baaab", "..bb..b."], // a drop with one eye, on two short feet
        ["........", ".......a", "......aa", ".....aaa", "...aaaaa", "..aaaccc", ".aaacccc", ".aaaccee", ".aaaccce", ".aaaaccc", "..aaaaaa", "..baaaab", ".bb...b."]],
      bloom: [["......aa", ".....aaa", ".....aab", "......ac", ".aaa.ccc", "aaaaccee", "aabaccek", "aaaaccee", ".aaa.ccc", "......ac", ".....aab", ".....aaa", "......aa"], // a flower with an eye in it: its petals stand square, then cornerwise
        ["........", ".aa.....", "aaaa....", "aaba..ac", ".aaa.ccc", "...accee", "....ccek", "...accee", ".aaa.ccc", "aaba..ac", "aaaa....", ".aa.....", "........"]],
      skull: [["a.......", "aa......", "aaa.aaaa", ".aaaaaaa", ".aaaaaaa", ".aacccaa", ".aaaccba", "..aaaaba", "..baaaaa", "...ababa", "...ababa", "........"], // a horned skull that chews
        ["a.......", "aa......", "aaa.aaaa", ".aaaaaaa", ".aaaaaaa", ".aacccaa", ".aaaccba", "..aaaaba", "..baaaaa", "........", "...ababa", "....aaaa"]],
      cog: [["......aa", ".a..aaaa", ".aaaaaaa", "..aaaaaa", "..aabbba", "aaaabccb", "aaaabccb", "..aabbba", "..aaaaaa", ".aaaaaaa", ".a..aaaa", "......aa"], // a cog with a hot middle, turning a tooth at a time
        ["....aa..", "...aaaaa", "aa.aaaaa", "aaaaaaaa", "..aabbba", "..aabccb", "..aabccb", "..aabbba", "aaaaaaaa", "aa.aaaaa", "...aaaaa", "....aa.."]],
      bell: [["......bbbb......", "......b..b......", ".....aaaaaa.....", "....aaaaaaaa....", "...aaaaaaaaaa...", "...aacaaaaaaa...", "...aacaaaaaaa...", "...aaaaaaaaaa...", "..aaaaaaaaaaaa..", "..aaaaaaaaaaaa..", ".aaaaaaaaaaaaaa.", "bbbbbbbbbbbbbbbb", ".....ee.........", ".....ee........."], // a glass bell on its loop, with a streak of light down it and a wide lip: its clapper swings from side to side (written at full width, as its two sides differ)
        ["......bbbb......", "......b..b......", ".....aaaaaa.....", "....aaaaaaaa....", "...aaaaaaaaaa...", "...aacaaaaaaa...", "...aacaaaaaaa...", "...aaaaaaaaaa...", "..aaaaaaaaaaaa..", "..aaaaaaaaaaaa..", ".aaaaaaaaaaaaaa.", "bbbbbbbbbbbbbbbb", ".........ee.....", ".........ee....."]],
      ball: [[".......b.......", ".......b.......", ".......b.......", ".....aabaa.....", "...abaabaaba...", "..bbbbbbbbbbb..", ".aabeebaabccba.", ".aabeebaabccba.", ".bbbbbbbbbbbbb.", ".abccbaabaabaa.", ".abccbaabaabaa.", ".bbbbbbbbbbbbb.", ".aabaabccbaaba.", "..abaabccbaab..", "...bbbbbbbbb...", ".....abaab....."], // a mirror ball hanging on its thread: rows of square tiles, some of them catching the light, that go round a tile at a time (written at full width)
        [".......b.......", ".......b.......", ".......b.......", ".....abaab.....", "...baabaabaa...", "..bbbbbbbbbbb..", ".abaabeebaabcc.", ".abaabeebaabcc.", ".bbbbbbbbbbbbb.", ".bccbaabaabaab.", ".bccbaabaabaab.", ".bbbbbbbbbbbbb.", ".abaabccbaabaa.", "..baabccbaaba..", "...bbbbbbbbb...", ".....baaba....."]],
    };
    const PRIZE = [".....a", ".....a", "....aa", "....ac", "..aacc", "aaaccw", "..aacc", "....ac", "....aa", ".....a", ".....a"]; // a four-pointed star that drifts through now and then, worth a good deal
    /* The great foes, 64 dots by 40, facing down. Each is a list of shapes, drawn on both sides of the middle: ["o", color, x, y, half width, half height] a round, ["r", color, x, y, width, height] a box,
       ["t", color, and three corners] a triangle; the color "." cuts a hole. pts: where the ship's bolts land on it, counted from its middle. */
    const BOSSES = {
      lantern: { list: [["r", "c", 30, 0, 2, 4], ["r", "c", 24, 3, 8, 3], ["t", "b", 13, 17, 3, 25, 12, 24], ["o", "c", 4, 27, 2, 2], ["o", "a", 31.5, 19, 20, 13], ["o", "b", 31.5, 19, 14, 13], ["o", "a", 31.5, 19, 13, 13], ["o", "b", 31.5, 19, 7, 13], ["o", "a", 31.5, 19, 6, 13],
        ["o", "e", 22, 17, 4, 3], ["o", "k", 23, 18, 2, 2], ["o", "e", 31.5, 26, 6, 3], ["r", "k", 28, 26, 4, 1], ["r", "c", 25, 31, 7, 3], ["t", "c", 26, 34, 30, 34, 28, 39], ["r", "e", 31, 34, 1, 5]], pts: [[-18, 6], [18, 6], [0, 14]] }, // a paper lantern with a face, a tassel under it
      vat: { list: [["r", "b", 27, 0, 5, 7], ["r", "b", 2, 12, 12, 5], ["o", "b", 5, 22, 5, 6], ["r", "c", 3, 27, 5, 4], ["o", "a", 31.5, 18, 20, 14], ["o", "b", 17, 9, 3, 2], ["o", "e", 31.5, 20, 10, 9], ["o", "c", 31.5, 22, 5, 5], ["o", "k", 31.5, 23, 2, 3], ["r", "e", 29, 19, 1, 1],
        ["t", "a", 18, 29, 25, 31, 21, 39], ["t", "a", 28, 31, 32, 31, 30, 37]], pts: [[-27, 12], [27, 12], [0, 14]] }, // a vat with one great eye and two grabs, dripping
      flower: { list: [["o", "a", 31.5, 7, 6, 7], ["o", "a", 18, 10, 7, 6], ["o", "a", 11, 21, 8, 6], ["o", "a", 18, 31, 7, 6], ["o", "a", 31.5, 33, 6, 6], ["o", "b", 31.5, 5, 2, 3], ["o", "b", 16, 9, 3, 2], ["o", "b", 8, 21, 4, 2], ["o", "b", 16, 32, 3, 2], ["o", "b", 31.5, 36, 2, 2],
        ["o", "c", 31.5, 20, 12, 10], ["o", "w", 31.5, 20, 9, 6], ["o", "e", 31.5, 20, 5, 5], ["o", "k", 31.5, 21, 2, 3], ["r", "w", 29, 17, 2, 2]], pts: [[-20, 0], [20, 0], [0, 12]] }, // a great flower round one eye
      engine: { list: [["r", "b", 17, 0, 5, 6], ["t", "b", 12, 16, 1, 36, 16, 24], ["r", "a", 10, 4, 22, 24], ["t", ".", 9, 3, 18, 3, 9, 12], ["t", ".", 9, 28, 16, 28, 9, 21], ["t", "c", 15, 13, 28, 18, 15, 19], ["r", "b", 16, 23, 16, 3], ["r", "k", 19, 26, 13, 8], ["r", "c", 20, 26, 2, 8], ["r", "c", 25, 26, 2, 8],
        ["r", "c", 30, 26, 2, 8], ["r", "b", 18, 34, 14, 4], ["r", "b", 27, 8, 5, 2]], pts: [[-18, 6], [18, 6], [0, 16]] }, // an engine block with a furnace for a mouth
      crystal: { list: [["o", "c", 31.5, 4, 11, 4], ["o", ".", 31.5, 4, 8, 2], ["t", "b", 22, 14, 0, 2, 16, 22], ["t", "b", 22, 19, 2, 18, 16, 26], ["t", "b", 22, 24, 6, 34, 20, 28], ["t", "a", 31.5, 3, 19, 18, 31.5, 39], ["t", "e", 31.5, 9, 25, 18, 31.5, 29], ["r", "w", 28, 15, 2, 2]], pts: [[-20, 2], [20, 2], [0, 18]] }, // a crystal with wings of glass under a ring of light
    };
    function paint(wide, high, f) { // a small picture from a rule: f says the color of each dot, or nothing where it is see-through
      const [c, x] = paper(wide, high), img = x.createImageData(wide, high);
      for (let j = 0, at = 0; j < high; j++) for (let i = 0; i < wide; i++, at += 4) { const col = f(i, j); if (col) { img.data[at] = col[0]; img.data[at + 1] = col[1]; img.data[at + 2] = col[2]; img.data[at + 3] = 255; } }
      x.putImageData(img, 0, 0);
      return c;
    }
    function art(rows, tones, edge, mirror = true, squeeze = false) { // a sprite from its rows: mirror writes the other half, squeeze takes two columns out of each half (the ship seen leaning into a turn)
      if (mirror) rows = rows.map((r) => (squeeze ? r.slice(0, 1) + r.slice(2, 4) + r.slice(5) : r)).map((r) => r + [...r].reverse().join(""));
      const at = (i, j) => tones[(rows[j - 1] || "")[i - 1]];
      return paint(rows[0].length + 2, rows.length + 2, (i, j) => {
        const col = at(i, j), ch = (rows[j - 1] || "")[i - 1];
        if (!col) return at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1) ? edge : null;
        if (ch > "d") return col;
        const lit = !at(i - 1, j) || !at(i, j - 1), dark = !at(i + 1, j) || !at(i, j + 1);
        return lit && !dark ? mix(col, WHITE, 0.42) : dark && !lit ? mix(col, edge, 0.45) : col;
      });
    }
    function shapes(wide, high, list) { // a great foe's list of shapes, turned into rows of characters
      const m = Array.from({ length: high }, () => Array(wide).fill(".")), side = (ax, ay, bx, by, x, y) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
      for (const [kind, ch, ...a] of list) for (let y = 0; y < high; y++) for (let x = 0; x < wide; x++) {
        let inside;
        if (kind === "o") inside = ((x - a[0]) / a[2]) ** 2 + ((y - a[1]) / a[3]) ** 2 <= 1;
        else if (kind === "r") inside = x >= a[0] && x < a[0] + a[2] && y >= a[1] && y < a[1] + a[3];
        else { const d1 = side(a[0], a[1], a[2], a[3], x, y), d2 = side(a[2], a[3], a[4], a[5], x, y), d3 = side(a[4], a[5], a[0], a[1], x, y); inside = !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); }
        if (inside) m[y][x] = m[y][wide - 1 - x] = ch;
      }
      return m.map((r) => r.join(""));
    }

    /* Scenery. Each layer is painted once on a strip that joins top to bottom, and slides down at its own speed, the far ones slowly. */
    function cloud(x, y, s, round) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), row = (j) => (((yi + j) % round) + round) % round; return lerp(lerp(chance(xi, row(0), s), chance(xi + 1, row(0), s), u), lerp(chance(xi, row(1), s), chance(xi + 1, row(1), s), u), v); } // soft lumps, the same at the top of the strip as at its foot
    function ground(across, s, sx, sy, steps, tones, soft = 0.05, rim = 1) { // ground as the old consoles had it: soft lumps cut into flat levels, a pattern of dots where two levels meet (soft), a pale edge to the upper left and a dark one to the lower right (rim)
      const level = new Uint8Array(across * STRIP);
      for (let j = 0; j < STRIP; j++) for (let i = 0; i < across; i++) { const n = 0.65 * cloud(i / sx, j / sy, s, STRIP / sy) + 0.35 * cloud((i * 2) / sx, (j * 2) / sy, s + 9, (2 * STRIP) / sy) + (grain(i, j) - 0.5) * soft; let l = 0; while (l < steps.length && n > steps[l]) l++; level[j * across + i] = l; }
      const at = (i, j) => level[((j + STRIP) % STRIP) * across + Math.max(0, Math.min(across - 1, i))], pale = tones.map((c) => c && mix(c, WHITE, 0.3 * rim)), deep = tones.map((c) => c && mix(c, BLACK, 0.4 * rim));
      const c = paint(across, STRIP, (i, j) => { const l = at(i, j); return !rim || !l || !tones[l] ? tones[l] : at(i - 1, j - 1) < l ? pale[l] : at(i + 1, j + 1) < l ? deep[l] : tones[l]; });
      c.at = at;
      return c;
    }
    function strip(across, draw) { const [c, x] = paper(across, STRIP), box = (col, px, py, wide = 1, high = 1) => { x.fillStyle = pixelCss(col); for (const dy of [-STRIP, 0, STRIP]) x.fillRect(Math.round(px), Math.round(py) + dy, wide, high); }; draw(box); return c; } // a strip drawn with boxes: whatever hangs over its foot comes in again at the top
    const dots = (across, s, n, tones, big) => strip(across, (box) => { for (let i = 0; i < n; i++) { const x = chance(i, 1, s) * across, y = chance(i, 2, s) * STRIP, col = tones[i % tones.length]; box(col, x, y); if (big && i % 5 === 0) { box(col, x - 1, y, 3, 1); box(col, x, y - 1, 1, 3); } } }); // stars, some of them a small cross
    const ball = (r, tones, bands = 0) => paint(r * 2 + 1, r * 2 + 1, (i, j) => { const x = (i - r) / r, y = (j - r) / r, d = x * x + y * y; if (d > 1) return null; const light = clamp(0.5 + 0.55 * (-x * 0.6 - y * 0.6 + Math.sqrt(1 - d) * 0.45) + bands * Math.sin(y * 9 + x * 2)), f = light * 2, n = Math.min(1, Math.floor(f)); return tones[f - n > grain(i, j) ? n + 1 : n]; }); // a ball lit from the upper left, in three tones blended with dots
    const stack = (across, ...layers) => { const [c, x] = paper(across, STRIP); layers.forEach((l) => x.drawImage(l, 0, 0)); return c; };
    function slide(S, c, by) { by = ((by % STRIP) + STRIP) % STRIP; for (let y = by - STRIP; y < S.down; y += STRIP) S.x.drawImage(c, 0, Math.round(y)); }
    const SCENES = { // each makes its layers for a screen so many dots across and down, and gives back what draws them
      space({ AX, tall, k }) { // far dust and stars, a planet that goes by, nearer stars
        const far = stack(AX, ground(AX, 1, 64, 64, [0.55, 0.66], [null, k[0], k[1]], 0.16, 0), dots(AX, 2, Math.round(AX / 4), [k[2]])), mid = dots(AX, 3, Math.round(AX / 7), [k[3], k[2]]), near = dots(AX, 4, Math.round(AX / 13), [k[4], k[3]], true), orb = ball(tall ? 15 : 22, [k[5], k[6], k[7]], 0.12);
        return (S) => { slide(S, far, G.scroll * 0.12); S.put(orb, S.across * 0.74 - orb.width / 2, G.orb * (S.down + 120) - 80); slide(S, mid, G.scroll * 0.35); slide(S, near, G.scroll * 0.8); };
      },
      vats({ AX, tall, k, EDGE }) { // a rock floor with runs of acid, bubbles that pop on the beat, pipes down the sides
        const pools = ground(AX, 5, 30, 64, [0.56, 0.6, 0.72], [null, k[3], k[4], k[5]], 0.04, 0.7), floor = stack(AX, ground(AX, 6, 24, 32, [0.42, 0.6], [k[0], k[1], k[2]], 0.1, 0.5), pools), live = [];
        const pipes = strip(AX, (box) => { for (const x of tall ? [7] : [9, 22]) for (const px of [x, AX - x - 5]) { box(k[6], px, 0, 5, STRIP); box(k[7], px + 1, 0, 1, STRIP); box(EDGE, px + 4, 0, 1, STRIP); box(EDGE, px - 1, 0, 1, STRIP); for (let y = (px * 7) % 64; y < STRIP; y += 64) { box(EDGE, px - 2, y - 1, 9, 6); box(k[7], px - 1, y, 7, 4); box(k[6], px, y + 1, 6, 3); } } });
        return (S) => {
          const by = G.scroll * 0.4, t = G.t;
          if (G.pulse) for (let n = 0, made = 0; n < 30 && made < 4; n++) { const x = rnd(8, AX - 8) | 0, y = rnd(0, STRIP) | 0; if (pools.at(x, y) >= 2) { live.push({ x, y, born: t + made * 0.04 }); made++; } }
          slide(S, floor, by);
          for (let i = live.length - 1; i >= 0; i--) { const b = live[i], age = t - b.born, y = (((b.y + by) % STRIP) + STRIP) % STRIP; if (age > 0.5 || age < -1) { live.splice(i, 1); continue; } if (age < 0) continue;
            const f = Math.floor(age * 10); if (f < 2) S.rect(k[8], b.x, y, 2 + f, 2 + f); else if (f < 4) { S.rect(k[8], b.x - 1, y - 1, 5, 5); S.rect(k[4], b.x, y, 3, 3); S.rect(WHITE, b.x, y, 1, 1); } else for (const [dx, dy] of [[-2, -2], [4, -2], [-2, 4], [4, 4]]) S.dot(k[8], b.x + dx, y + dy); }
          slide(S, pipes, G.scroll);
        };
      },
      garden({ AX, tall, k, Wd, EDGE }) { // moss, a slow wheel of lights whose colors step outward every other beat, and the tops of great toadstools (kept dim, more than half way to the background, so the foes stand out in front of them)
        const moss = ground(AX, 7, 40, 32, [0.5, 0.62], [null, k[0], k[1]], 0.14, 0), four = [k[2], k[3], k[4], k[5]], dim = four.map((c) => pixelCss(mix(c, Wd.bg, 0.5))), count = Math.max(5, Math.round(AX / 27)), speck = mix(k[6], Wd.bg, 0.45);
        const caps = strip(AX, (box) => { for (let n = 0; n < count; n++) { const cx = chance(n, 1, 8) * AX, cy = (n + chance(n, 2, 8) * 0.6) * (STRIP / count), R = 5 + Math.floor(chance(n, 3, 8) * 10), col = mix(four[n % 4], Wd.bg, 0.55), nub = R * 0.3;
          for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) { const d = Math.hypot(x, y); if (d > R + 0.5) continue; const light = -(x + y) / R / 1.41 + (grain(x + 64, y + 64) - 0.5) * 0.4;
            box(d > R - 0.5 ? EDGE : d > R - 2.5 ? mix(col, EDGE, light > 0.2 ? 0.2 : 0.55) : d < nub ? mix(col, WHITE, light < -0.3 ? 0.1 : 0.45) : d < nub + 1 && light < 0 ? mix(col, EDGE, 0.5) : light > 0.45 ? mix(col, WHITE, 0.3) : light < -0.4 ? mix(col, EDGE, 0.35) : col, cx + x, cy + y); }
          for (let q = 0; q < 3 + R / 3; q++) { const a = q * 2.4 + n, d = R * (0.5 + 0.22 * (q % 2)), big = R > 8 ? 2 : 1; box(speck, cx + Math.cos(a) * d, cy + Math.sin(a) * d, big, big); } } });
        return (S) => {
          slide(S, moss, G.scroll * 0.25);
          const cx = S.across / 2, cy = S.down * 0.44, gap = tall ? 16 : 19, x = S.x;
          for (let ring = 1; ring * gap < Math.hypot(S.across, S.down) * 0.56; ring++) { const n = ring * 14, rr = ring * gap * (1 + 0.04 * G.bassSlow), big = ring > 3 ? 2 : 1, turn = G.t * 0.1 * (ring % 2 ? 1 : -1);
            x.fillStyle = dim[(((ring - (G.beat >> 1)) % 4) + 4) % 4];
            for (let i = 0; i < n; i++) { const a = (i / n) * TAU + turn; x.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), big, big); } }
          slide(S, caps, G.scroll * 0.7);
        };
      },
      foundry({ AX, tall, k }) { // molten metal far below, plates and gratings going by at the sides, the gratings glowing with the kick, sparks coming up
        const lava = ground(AX, 9, 40, 32, [0.44, 0.56, 0.65, 0.73], [k[0], k[1], k[2], k[3], k[4]], 0.07, 0), grates = [], shade = [], P = 32, most = tall ? 1 : 3, live = [], edge = mix(k[5], WHITE, 0.25);
        const plates = strip(AX, (box) => { for (let row = 0; row < STRIP / P; row++) for (const right of [0, 1]) { const n = Math.max(tall ? 0 : 1, Math.round(chance(row, right, 3) * most)); for (let c = 0; c < n; c++) { const x = right ? AX - (c + 1) * P : c * P, y = row * P, grate = chance(row, c + right * 9, 4) < 0.3;
          box(k[5], x, y, P, P); box(edge, x, y, P, 1); box(edge, x, y, 1, P); box(k[6], x, y + P - 1, P, 1); box(k[6], x + P - 1, y, 1, P);
          for (const [dx, dy] of [[3, 3], [P - 5, 3], [3, P - 5], [P - 5, P - 5]]) { box(k[6], x + dx, y + dy, 2, 2); box(mix(k[5], WHITE, 0.4), x + dx, y + dy); }
          if (grate) { box(k[6], x + 7, y + 7, P - 14, P - 14); grates.push([x + 9, y + 9]); } else box(mix(k[5], BLACK, 0.2), x + 8, y + 15, P - 16, 2);
          if (c === n - 1) shade.push([right ? x - 3 : x + P, y]); } } });
        const shadows = strip(AX, (box) => shade.forEach(([x, y]) => box(BLACK, x, y, 3, P))); // the shadow the plates throw on what is below
        return (S) => {
          const t = G.t;
          slide(S, lava, G.scroll * 0.22);
          if (G.pulse) for (let n = 0; n < 5; n++) live.push({ x: rnd(S.across * 0.2, S.across * 0.8), y: rnd(S.down * 0.2, S.down), born: t, vy: rnd(-50, -20) });
          for (let i = live.length - 1; i >= 0; i--) { const b = live[i], age = t - b.born; if (age > 0.7 || age < 0) { live.splice(i, 1); continue; } S.dot(age < 0.3 ? k[4] : k[3], b.x, b.y + b.vy * age); }
          const by = ((G.scroll % STRIP) + STRIP) % STRIP;
          S.x.globalAlpha = 0.5; slide(S, shadows, G.scroll); S.x.globalAlpha = 1;
          slide(S, plates, G.scroll);
          S.x.fillStyle = pixelCss(mix(k[1], k[7], clamp(0.2 + 0.6 * G.thump))); // (the glow follows the kick slowly, so the gratings swell and never blink)
          for (const [gx, gy] of grates) for (let y = gy + by - STRIP; y < S.down; y += STRIP) for (let bar = 0; bar < 3; bar++) S.x.fillRect(gx, Math.round(y) + bar * 5, P - 18, 2);
        };
      },
      clouds({ AX, DN, tall, k }) { // a night sky going to dawn at the foot, a moon, and three sheets of cloud
        const sky = paint(AX, DN, (i, j) => { const f = (j / DN) * 3, n = Math.min(2, Math.floor(f)); return k[f - n > grain(i, j) ? n + 1 : n]; }), moon = ball(tall ? 14 : 20, [k[8], k[9], k[10]]);
        const far = ground(AX, 11, 56, 32, [0.58], [null, k[4]], 0.12, 0), mid = ground(AX, 13, 72, 32, [0.57, 0.66], [null, k[5], k[6]], 0.02, 1), near = ground(AX, 14, 96, 64, [0.68, 0.74], [null, k[6], k[7]], 0.02, 0.8);
        const stars = Array.from({ length: 26 }, (_, i) => [chance(i, 1, 15), chance(i, 2, 15) ** 2 * 0.6]);
        return (S) => { S.put(sky, 0, 0); stars.forEach(([x, y], i) => S.dot(k[10], x * S.across, y * S.down, (i + G.hats) % 5 ? 0.5 : 1)); slide(S, far, G.scroll * 0.15); S.put(moon, S.across * 0.7, S.down * 0.1); slide(S, mid, G.scroll * 0.45); slide(S, near, G.scroll * 1.1); };
      },
    };

    /* The figures the foes settle into: where foe i of n sits, across from -1 to 1 and down from 0 to 1 (and, for a ring inside a ring, which way and how fast it turns next to the others).
       None is rows of foes: a clock face whose hands show another time each wave, two rings, a spiral, a flower of four petals, two strands that cross, a fan, a double arrowhead, two arcs like a rainbow,
       one long snaking line (down the screen on a phone), a diamond and a cross. */
    const zag = (x) => 1 - Math.abs((((x % 4) + 4) % 4) - 2);
    const round = (a, r) => [Math.sin(a) * r * 0.96, 0.5 - Math.cos(a) * r * 0.5];
    const FORMS = {
      clock: (i, n, wave) => { const rim = n - 4, j = i - rim; return j < 0 ? round((i / rim) * TAU, 1) : j < 2 ? round((((wave * 5) % 12) / 12) * TAU, 0.3 + 0.32 * j) : round((((wave * 6 + 4) % 12) / 12) * TAU, 0.22 + 0.22 * (j - 2)); },
      rings: (i, n) => { const outer = Math.round(n * 0.625); return i < outer ? round((i / outer) * TAU, 1) : [...round(((i - outer) / (n - outer)) * TAU, 0.48), -1.6]; },
      spiral: (i, n) => round((i / n) * TAU * 1.75, 0.28 + 0.72 * (i / (n - 1))),
      petals: (i, n) => round((i / n) * TAU, 0.4 + 0.6 * Math.abs(Math.cos((i / n) * TAU * 2))),
      helix: (i, n) => { const u = (Math.floor(i / 2) / (n / 2 - 1)) * 2 - 1; return [u, 0.5 + (i % 2 ? 0.44 : -0.44) * Math.sin((u + 1.13) * 3.6)]; },
      fan: (i, n) => { const a = ((i % 4) - 1.5) * 0.52, d = 0.3 + 0.7 * (Math.floor(i / 4) / (n / 4 - 1)); return [Math.sin(a) * d * 1.2, Math.cos(a) * d]; },
      arrows: (i, n) => { const half = n / 2, inner = i >= half, u = ((i % half) / (half - 1)) * 2 - 1; return [u * (inner ? 0.55 : 1), (inner ? 0.02 : 0.42) + (1 - Math.abs(u)) * (inner ? 0.4 : 0.58)]; },
      arcs: (i, n) => { const outer = Math.round(n * 0.56), inner = i >= outer, a = ((inner ? (i - outer) / (n - outer - 1) : i / (outer - 1)) * 2 - 1) * 1.75, r = inner ? 0.58 : 1; return [Math.sin(a) * r, 0.62 - Math.cos(a) * r * 0.62]; },
      snake: (i, n, wave, tall) => { const along = i / (n - 1), swing = Math.sin(along * TAU * 1.5); return tall ? [swing * 0.9, along] : [along * 2 - 1, 0.5 + 0.42 * swing]; },
      diamond: (i, n) => { const a = (i / n) * 4; return [zag(a + 1), 0.5 + 0.5 * zag(a)]; },
      cross: (i, n) => { const half = n / 2, u = ((i % half) / (half - 1)) * 2 - 1; return [u, i < half ? (u + 1) / 2 : 1 - (u + 1) / 2]; },
    }, TURNS = new Set(["clock", "rings", "spiral", "petals", "diamond"]), GUNS = [[[0, 0]], [[-3, -3], [3, 3]], [[-13, 0], [0, 0], [13, 0]]]; // TURNS: the figures that can turn. GUNS: where the bolts leave from and close on, for one gun, two, and two pods beside the ship

    /* The game. G is all of it; made is the world's drawings for the screen as it is now; L is where things go on a screen of this shape; was is the last world's drawings, kept while the new world comes down over it. */
    let G = null, made = null, L = null, was = null;
    const kept = new Map(); // the last few sets of drawings, by world and size: going back to one costs nothing
    const fresh = (t) => ({ t, mode: flow.since > 1.4 ? "calm" : "", beat: 0, lastBeat: t - 9, slot: 0, hats: 0, x: 0, y: 0, ax: 0, ay: 0, lean: 0, px: 0, pods: 0, foes: [], queue: [], shots: [], booms: [], bits: [], pops: [], lights: [], medals: [], drops: [], drifters: [], lightAt: 0, lit: 0, landed: -9,
      boss: { in: 0, x: 0, y: -60, hit: -9, dead: -9, at: [0, 0] }, score: 0, shown: 0, combo: 0, streak: 0, stage: 1, scroll: 0, orb: 0.3, wave: 0, dropAt: t - 99, fired: -9, shield: -9, gap: 0.47, kickClock: flow.clock - flow.since, B: 0.47, build: 0, ribbon: 0, grooved: 0, stageAt: t - 99,
      breath: 0, bassSlow: 0, thump: 0, breakFor: 0, rails: [{ now: 0, held: 0, until: 0 }, { now: 0, held: 0, until: 0 }], kick: 0, bass: 0, pulse: 0, across: 0, down: 0, builtAt: t - 9, wipe: null, moodWas: null, genreWas: null, want: "toys", begun: false });
    function layout(AX, DN) { // where things go: the figure of foes at the top (never wider than suits its height), the ship's row near the foot, a rail of lamps down each side
      const tall = DN > AX, narrow = AX < 120, low = DN < 140, FH = DN * (tall ? 0.4 : 0.36), RAIL = 5; // narrow, low: a small screen (a phone, or a slow computer, that the app has turned the picture's quality down for), where some things must give way
      const FT = Math.round(DN * (tall ? 0.08 : 0.133)), BASE = DN - (tall ? 40 : low ? 22 : 30);
      return { AX, DN, CX: AX / 2, tall, narrow, low, FT, FH, FW: Math.min((AX - (narrow ? 38 : tall ? 46 : 60)) / 2, FH * 2.2), BASE, BY: Math.min(FT + (tall ? 40 : 30), BASE - 55), SWAY: Math.min(tall ? 10 : 30, Math.max(0, (AX - 2 * RAIL - 66) / 2)), RAIL, LOOP: tall ? 0.2 : 0.17 }; // (BY: how far down the great foe comes: never onto the ship, however low the screen. SWAY: how far it goes from side to side: never into the rails, however narrow)
    }
    function build(which, AX, DN) { // a world's drawings, for a screen so many dots across and down
      const key = which + ":" + AX + ":" + DN;
      if (!kept.has(key)) { if (kept.size > 2) kept.delete(kept.keys().next().value); kept.set(key, draft(which, AX, DN)); }
      return kept.get(key);
    }
    function draft(which, AX, DN) {
      const Wd = WORLDS[which], EDGE = mix(Wd.bg, BLACK, 0.5), tones = (c) => ({ a: c[0], b: c[1], c: c[2], e: c[3], w: WHITE, k: EDGE }), wears = { a: Wd.ship[0], b: Wd.ship[1], c: Wd.ship[2], w: Wd.ship[3] };
      return { which, Wd, EDGE, AX, DN, bursts: new Map(), ship: art(SHIP, wears, EDGE), lean: art(SHIP, wears, EDGE, true, true), prize: art(PRIZE, { a: Wd.burst[1], c: mix(Wd.burst[1], WHITE, 0.6), w: WHITE }, EDGE),
        foes: [0, 1].map((tint) => FOES[Wd.foes[tint] || Wd.foes[0]].map((rows) => art(rows, tones(tint ? [...Wd.foe2, Wd.foe[2], Wd.foe[3]] : Wd.foe), EDGE, rows[0].length < 12))), // [which colors][which pose]
        boss: art(shapes(64, 40, BOSSES[Wd.boss].list), tones(Wd.great), EDGE, false), pts: BOSSES[Wd.boss].pts, back: SCENES[Wd.scene]({ AX, DN, tall: DN > AX, k: Wd.k, Wd, EDGE }) };
    }
    function burstArt(size, f) { // one of a burst's five quick pictures, the old way: a pale block, a ring that widens, then a ring of dots that thins out. Each is drawn once and kept
      const key = size + ":" + f, tones = made.Wd.burst;
      if (!made.bursts.has(key)) { const R = Math.round([3, 5, 7, 8, 9][f] * size), hole = Math.round([0, 0, 3, 6, 8][f] * size);
        made.bursts.set(key, paint(R * 2 + 1, R * 2 + 1, (i, j) => { const d = (i - R) ** 2 + (j - R) ** 2; return d > R * R || d < hole * hole || (f > 2 && grain(i, j) <= (f - 2) * 0.3) ? null : d < (R * R) / 3 && f < 2 ? (size > 2 ? tones[1] : WHITE) : tones[Math.min(3, f)]; })); } // (the great burst opens in the pale burst color, not white, so there is never a big white disk)
      return made.bursts.get(key);
    }
    function resize(kx, ky) { // the window changed shape: everything keeps its place on the new screen, and the game goes on
      for (const list of [G.shots, G.booms, G.bits, G.pops, G.lights, G.medals, G.drops, G.drifters]) for (const o of list) { if (o.x !== undefined) { o.x *= kx; o.y *= ky; } if (o.x0 !== undefined) { o.x0 *= kx; o.y0 *= ky; } }
      G.x *= kx; G.ax *= kx; G.px *= kx; G.y *= ky; G.ay *= ky; G.boss.x *= kx; G.boss.y *= ky; G.boss.at = [G.boss.at[0] * kx, G.boss.at[1] * ky];
    }
    function where(f) { // where a foe is now: on its way in, in its place (the figure breathing, and turning if it turns), making a turn about its place, or leaving
      const { AX, DN, CX, FW, FT, FH, tall } = L, t = G.t;
      if (f.prize) { const p = (t - f.born) / f.dur; return [CX - f.side * (AX * 0.5 + 12) * (1 - 2 * p) + Math.sin(p * TAU * 3) * 6, FT + FH * 0.5 + Math.sin(p * Math.PI) * FH * 0.62]; } // the star crosses in a long dip under the figure
      let u = f.u, v = f.v;
      if (f.turn) { const a = f.at, c = Math.cos(a), s = Math.sin(a), vv = (v - 0.5) * 2; v = 0.5 + (u * s + vv * c) / 2; u = u * c - vv * s; }
      let x = CX + u * FW * (1 + G.breath) + Math.sin(t * 0.9 + v * 3) * (tall ? 2 : 4) * (0.4 + G.bass), y = FT + (0.5 + (v - 0.5) * (1 + G.breath)) * FH;
      const p = clamp((t - f.born) / f.dur);
      if (p < 1) { const e = eased(p), arc = Math.sin(Math.PI * p), side = f.side, way = f.way;
        const from = way === "top" ? [CX + u * FW * 0.4, -16, side * 30] : way === "squig" ? [CX + u * FW * 0.7, -16, 0] : way === "swirl" ? [CX + side * (AX * 0.5 + 16), DN * 0.25, -side * 50] : way === "drop" ? [CX + u * FW, -16 - v * 40, 0] : [CX + side * (AX * 0.5 + 16), FT + FH * 0.9, side * 24];
        x = lerp(from[0], x, e) + arc * from[2] + (way === "squig" ? Math.sin(p * TAU * 2) * 12 * (1 - p) : 0); y = lerp(from[1], y, way === "drop" ? 1 - (1 - p) ** 3 : e) + arc * Math.abs(from[2]) * 0.4; }
      if (f.twirl) { const q = (t - f.twirl) / f.twirlFor; if (q < 1) { const r = Math.sin(q * Math.PI) * 9; x += Math.sin(q * TAU) * r * f.side; y += (1 - Math.cos(q * TAU)) * r * 0.6; } } // now and then one makes a turn about its own place
      if (f.gone) { const q = Math.max(0, t - f.gone); y -= q * q * 240; x += f.side * q * 40; }
      return [x, y - Math.round(2 * G.kick)];
    }
    function spawn() { // a wave more of foes: their places in the figure, the way in, and the order the ship will take them in
      const Wd = made.Wd, kind = Wd.forms[(G.wave + G.stage - 1) % Wd.forms.length], way = Wd.enter[G.wave % Wd.enter.length], n = Math.max(8, Math.min(L.narrow ? 8 : L.low ? 12 : 24, Math.round((V.foes ?? 16) / 4) * 4)), B = G.B, wave = [], turns = TURNS.has(kind), hops = V.hops ?? 0;
      for (let i = 0; i < n; i++) { const [u, v, turn = 1] = FORMS[kind](i, n, G.wave, L.tall); wave.push({ u, v, born: G.t + (i / n) * B * 1.5, dur: Math.max(0.5, B * 2.4), way, side: i % 2 ? 1 : -1, turn: turns ? Wd.spin * turn * (G.wave % 2 ? -1 : 1) : 0, at: 0, tint: (G.wave + G.stage) % 2 }); }
      // the order: always the nearest one left (hops), or every other time the farthest across (leaps, for the hard worlds). A version can say which
      const leaps = hops < -0.5 || (hops <= 0.5 && Wd.sweep === "far"), last = G.queue[G.queue.length - 1];
      let at = last && !last.prize ? [last.u, last.v] : [(G.x - L.CX) / L.FW, 1], left = [...wave];
      while (left.length) { const far = leaps && left.length % 2 === 0, score = (f) => Math.abs(f.u - at[0]) * L.FW * (far ? -1 : 1) + 2.5 * Math.abs(f.v - at[1]) * L.FH - (far ? 0 : f.v * L.FH * 0.4); left.sort((a, b) => score(a) - score(b)); const f = left.shift(); G.queue.push(f); at = [f.u, f.v]; }
      G.foes.push(...wave);
      G.wave = (G.wave + 1) % 240;
    }
    const boom = (x, y, size = 1, at = G.t) => G.booms.push({ x, y, size: Math.round(size * 5) / 5, born: at });
    function bitsAt(x, y, n, tones, speed = 60) { for (let i = 0; i < n && G.bits.length < 260; i++) { const a = rnd(0, TAU), v = rnd(0.3, 1) * speed; G.bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: G.t, life: rnd(0.25, 0.7), col: tones[i % tones.length], big: i % 3 === 0 }); } }
    function land(s) { // a bolt arrives
      const Wd = made.Wd, b = G.boss;
      G.landed = G.t;
      if (s.f) { const f = s.f; if (f.dead) return; const [x, y] = where(f), pts = f.prize ? 500 : 10 * (1 + Math.floor(Math.min(G.combo, 999) / 8)), q = G.queue.indexOf(f);
        const at = G.foes.indexOf(f); if (at < 0) return; f.dead = true; G.foes.splice(at, 1); if (q >= 0) G.queue.splice(q, 1);
        boom(x, y, f.prize ? 1.6 : 1); bitsAt(x, y, 5, [f.prize ? WHITE : Wd.foe[0], Wd.burst[1], Wd.burst[2]]); G.score += pts; G.combo = Math.min(9999, G.combo + 1); G.streak++; G.pops.push({ x, y: y - 6, n: pts, born: G.t });
        if (f.prize) for (let i = 0; i < 5; i++) G.medals.push({ x, y, a: rnd(0, TAU), born: G.t, i }); }
      else if (b.in > 0.2) { const [dx, dy] = made.pts[s.pt], x = b.x + dx * (L.tall ? 0.7 : 1) + rnd(-3, 3), y = b.y + dy + 2; boom(x, y, 0.6); bitsAt(x, y, 2, [Wd.great[0], Wd.burst[1]], 40); b.hit = G.t; G.score += 5; G.combo = Math.min(9999, G.combo + 1); }
    }
    function fizz() { for (const d of G.drops) bitsAt(d.x, d.y, 2, [made.Wd.great[2]], 20); G.drops.length = 0; }
    function leave() { for (const f of G.foes) if (!f.gone) f.gone = G.t + rnd(0, 0.3); G.queue.length = 0; G.shots.length = 0; fizz(); }
    function scatter() { for (const d of G.drifters) bitsAt(d.x, d.y, 4, [made.Wd.foe2[0], WHITE], 30); G.drifters.length = 0; } // the slow ones of a long break go in a puff when the game is on again
    function answer(speed) { // a foe answers the ship with a slow shot of its own, but only down a lane the ship is not about to use: the ship is under the next few in its order a beat apart, so a shot that would cross its row near those is not fired
      const t = G.t, able = G.foes.filter((f) => !f.gone && !f.prize && t > f.born + f.dur && G.queue.indexOf(f) > 2);
      if (!able.length) return;
      const f = able[Math.floor(rnd(0, able.length))], [x, y] = where(f), beats = (t + (L.BASE - y) / speed - G.lastBeat) / G.B - 1;
      let lo = G.x, hi = G.x;
      for (let q = Math.max(0, Math.floor(beats - 1)); q <= Math.ceil(beats + 1.5); q++) if (G.queue[q]) { const qx = where(G.queue[q])[0]; lo = Math.min(lo, qx); hi = Math.max(hi, qx); }
      if (x < lo - 18 || x > hi + 18) G.drops.push({ x, y: y + 8, v: speed });
    }
    function burstAll() { // the drop: the great foe (or every foe there is) goes up, the stage goes up, what the ship had earned is to be earned again, and the ship is given a loop to fly
      const b = G.boss, t = G.t, Wd = made.Wd;
      if (b.in > 0.25) { b.dead = t; b.at = [b.x, b.y]; for (let i = 0; i < 9; i++) boom(b.x + rnd(-26, 26), b.y + rnd(-16, 16), i ? rnd(0.8, 1.6) : 3.2, t + i * 0.07); bitsAt(b.x, b.y, 40, [Wd.great[0], Wd.great[1], Wd.burst[1], Wd.burst[2]], 120);
        for (let i = 0; i < 10; i++) G.medals.push({ x: b.x, y: b.y, a: rnd(0, TAU), born: t, i }); G.score += 5000; b.in = 0; }
      else for (let i = 0; i < 10; i++) boom(G.x + Math.cos((i / 10) * TAU) * 34, G.y - 8 + Math.sin((i / 10) * TAU) * 22, 1, t + i * 0.03); // no great foe to burst: a ring goes out from the ship
      G.foes.forEach((f, i) => { const [x, y] = where(f); boom(x, y, 1, t + i * 0.03); G.score += 50; });
      G.foes.length = 0; G.queue.length = 0; G.shots.length = 0; fizz(); scatter();
      G.stage = (G.stage % 99) + 1; G.stageAt = t; G.grooved = 0; G.streak = 0; G.dropAt = t; G.mode = "";
    }
    function ribbonAt(y) { // where the ribbon of lights crosses a height: between the light just under it and the one just over it
      let under = null, over = null;
      for (const l of G.lights) { if (l.y >= y) { if (!under || l.y < under.y) under = l; } else if (!over || l.y > over.y) over = l; }
      return under && over ? lerp(over.x, under.x, (y - over.y) / (under.y - over.y)) : over ? over.x : null;
    }

    function update(dt) { // the game moves on by dt seconds of the picture's own time. A beat is counted in that time too, so the bolts still land on the kick when the picture runs fast or slow
      const { AX, DN, CX, tall, BASE, RAIL, LOOP } = L, Wd = made.Wd, t = G.t, b = G.boss, ease = (k) => 1 - Math.exp(-dt * k), SH = made.ship.height;
      const rate = Math.max(0.2, T.speed * flow.pace), clock = flow.clock, beatReal = flow.bpm ? 60 / flow.bpm : G.gap, B = (G.B = beatReal * rate); // rate: how fast the picture's time runs next to the song's. B: one beat of the song, in the picture's time
      G.kick = sound.kick; G.bass = sound.bass;
      if (sound.hatHit) G.hats = (G.hats + 1) % 3600;
      G.bassSlow += (sound.bass - G.bassSlow) * ease(2); G.breath = 0.04 * Math.sin(t * 0.8) + 0.05 * G.bassSlow; G.thump = Math.max(sound.kick, G.thump - dt * 0.8);
      let since = t - G.dropAt;
      if (flow.dropHit && since > 3 * rate) { burstAll(); since = 0; } // (a drop can be told two or three times within a second or two: only the first counts)
      const build = (G.build = since < 1.5 * rate ? 0 : flow.build), calm = (flow.calm > 0.5 && since > 2 * rate) || !hearing;
      // a kick. The length of a beat is learned from every kick, for as long as the app has not worked the tempo out itself
      const kicked = sound.kickHit > 0 && clock - G.kickClock > 0.2;
      if (kicked) { const gap = clock - G.kickClock; if (gap > 0.25 && gap < 1.2) G.gap += (gap - G.gap) * 0.3; G.kickClock = clock; }
      // what is going on: the great foe through a build, the ribbon of lights in a break (and until a kick has really come back, so no wave flies in between a break and a build only to flee), the waves otherwise
      const want = build > (G.mode === "boss" ? 0.27 : 0.3) ? "boss" : calm || ((G.mode === "calm" || G.mode === "boss") && clock - G.kickClock > 2 * beatReal) ? "calm" : "wave";
      if (want !== G.mode) { if (want !== "wave") leave(); if (G.mode === "calm") scatter(); else if (want === "calm") G.lightAt = t + 0.5; G.mode = want; if (want === "wave") spawn(); }
      G.breakFor = G.mode === "wave" ? 0 : G.breakFor + dt / rate;
      // the beat: a real kick always, or the clock when the kick is missing (so the game never stalls)
      let beat = 0;
      if (kicked) { beat = 1; G.lastBeat = t; } else if (G.mode !== "calm" && t - G.lastBeat > B * 1.35) { beat = 2; G.lastBeat = t - G.lastBeat > 3 * B ? t : G.lastBeat + B; }
      const loop = since < 4 * B ? since / (4 * B) : -1, aim = () => { const f = G.queue[0]; return f && (f.prize || t > f.born + f.dur * 0.5) ? f : null; }; // loop: how far round the ship's loop after a drop is. aim: the foe the ship is after, once it is near its place
      if (beat) {
        G.pulse = beat; G.beat = (G.beat + 1) % 3840; G.slot = 0;
        if (G.mode === "wave" && ++G.grooved >= 64) { G.grooved = 0; G.stage = (G.stage % 99) + 1; G.stageAt = t; } // a song with no break still gets on: after 64 beats of waves the stage goes up by itself, and with it the figures and the foes' colors come round another way
        let due = 0; // bolts well on their way land now, on the beat; on a real kick the rest are hurried home too
        for (const s of G.shots) { if ((t - s.t0) / (s.t1 - s.t0) > 0.4) { s.now = true; due++; } else if (beat === 1) { s.t1 = Math.min(s.t1, t + 0.035); s.fast = true; due++; } }
        if (G.mode === "wave" && G.queue.length <= 4 && since > 4 * B) spawn();
        const f = aim();
        if (beat === 1 && !due && f && G.mode === "wave" && loop < 0 && t - G.landed > 0.1 * B) { G.fired = t; G.shots.push({ t0: t - 0.02, t1: t + 0.03, x0: G.x, y0: G.y - SH / 2, f, pt: 0, fast: true }); } // a kick with no bolt on its way (broken beats, a missing hi-hat): a fast bolt goes at once and is there within a frame or two, so every kick is a hit. Only a hit a moment ago stops it (a tenth of a beat), so the same kick never takes two foes
        if (G.mode === "wave" && G.beat % 8 === 4 && G.queue.length > 7) { const one = G.queue[G.queue.length - 1 - Math.floor(rnd(0, 3))]; if (!one.prize && t > one.born + one.dur) { one.twirl = t; one.twirlFor = 2 * B; } }
        if (G.mode === "wave" && G.beat % 32 === 20 && since > 8 * B && !G.foes.some((one) => one.prize)) G.foes.push({ prize: true, born: t, dur: 8 * B, side: rnd(0, 1) < 0.5 ? -1 : 1, u: 0, v: 1 }); // every 32 beats a star drifts through
      }
      for (let i = G.foes.length - 1; i >= 0; i--) { const f = G.foes[i]; // a foe in a figure that turns goes round with it (each keeps its own angle); the star joins the head of the ship's order when it is well in, and is gone if it gets across; foes that left are forgotten
        if (f.turn) f.at = (f.at + dt * (V.spin ?? 1) * f.turn) % TAU;
        if (f.prize) { const p = (t - f.born) / f.dur; if (p > 0.3 && !f.asked && G.mode === "wave") { f.asked = true; G.queue.unshift(f); } if (p >= 1) { G.foes.splice(i, 1); const q = G.queue.indexOf(f); if (q >= 0) G.queue.splice(q, 1); } }
        else if (f.gone && t > f.gone && where(f)[1] < -30) G.foes.splice(i, 1); }
      const wait = G.mode === "wave" && clock - G.kickClock < 1.5 * beatReal ? 0.15 * B : 0; // (while the kick is running, a bolt that is there a moment early waits for it)
      for (let i = G.shots.length - 1; i >= 0; i--) { const s = G.shots[i]; if (s.now || t >= s.t1 + (s.fast ? 0 : wait)) { land(s); G.shots.splice(i, 1); } }
      // the great foe comes down as the build grows, and goes back up if the build comes to nothing
      b.in += ((G.mode === "boss" ? clamp((build - 0.2) / 0.35) : 0) - b.in) * ease(3);
      b.x = CX + Math.sin(t * 0.7) * L.SWAY * b.in; b.y = lerp(-26, L.BY, eased(b.in)) + Math.sin(t * 1.9) * 2 + build * 8 - (t - b.hit < 0.07 ? 1 : 0);
      // where the ship wants to be: on its loop, on the ribbon of lights, under a soft spot of the great foe, or under the foe it is after
      const target = aim();
      let wantX = CX + Math.sin(t * 0.8) * 20, wantY = BASE, quick = 26;
      if (loop >= 0) { const a = eased(loop) * TAU; wantX = CX + Math.sin(a) * AX * (tall ? 0.28 : 0.16); wantY = BASE - (1 - Math.cos(a)) * DN * LOOP; quick = 40; }
      else if (G.mode === "calm") { wantY = DN * 0.62 + Math.sin(t * 1.3) * 3; wantX = ribbonAt(wantY) ?? wantX; quick = 9; }
      else if (G.mode === "boss") { if (b.in > 0.2) wantX = b.x + made.pts[G.beat % 3][0] * (tall ? 0.7 : 1); }
      else if (target) wantX = where(target)[0];
      const was = G.x;
      G.ax += (wantX - G.ax) * ease(quick); G.x += (G.ax - G.x) * ease(quick); G.ay += (wantY - G.ay) * ease(quick); G.y += (G.ay - G.y) * ease(quick);
      G.lean += (clamp((G.x - was) / dt / 60 + 0.5) * 2 - 1 - G.lean) * ease(20);
      // firing: on the hi-hat if it comes in the middle of a beat, else at the half beat by the clock; twice and then four times a beat as a build grows. Each bolt is timed to land on the beat, or a clean part of it
      const per = G.mode === "boss" ? (build < 0.45 ? 1 : build < 0.75 ? 2 : 4) : 1, ph = (t - G.lastBeat) / B, slot = Math.floor(ph * per + 0.5), canHit = G.mode === "boss" ? b.in > 0.5 : G.mode === "wave" && !!target && loop < 0;
      if (canHit && ((slot > G.slot && slot <= per) || (per === 1 && sound.hatHit && !G.slot && ph > 0.25 && ph < 0.75))) {
        G.slot = Math.max(slot, 1); G.fired = t;
        G.shots.push({ t0: t, t1: Math.max(t + 0.07, G.lastBeat + (G.slot * B) / per), x0: G.x, y0: G.y - SH / 2, f: G.mode === "wave" ? target : null, pt: (G.beat + G.slot) % 3 });
        if (G.mode === "wave") { if (rnd(0, 1) < 0.3 + 0.7 * flow.intensity) answer(40 + 30 * Wd.pace); } else if (G.slot === 1) { const out = Math.min(tall ? 52 : 70, CX - RAIL - 6); for (const side of [-1, 1]) G.drops.push({ x: b.x + side * rnd(Math.min(40, out - 6), out), y: b.y + 10, v: 40 + 30 * Wd.pace }); }
      }
      for (let i = G.drops.length - 1; i >= 0; i--) { const d = G.drops[i]; d.y += d.v * dt; if (Math.abs(d.x - G.x) < 9 && Math.abs(d.y - G.y) < 11) { bitsAt(d.x, d.y, 4, [WHITE, Wd.ship[3]], 30); G.shield = t; G.drops.splice(i, 1); } else if (d.y > DN + 4) G.drops.splice(i, 1); }
      // a break: lights come down in a ribbon that winds wide and narrow, and the ship drifts through them. In a long break slow foes come down too, each as far to one side as a light is to the other, so the ship weaves round them
      const fall = DN * 0.22 * dt;
      if (G.mode === "calm") {
        G.ribbon = (G.ribbon + (dt * TAU) / (12 * B)) % (TAU * 100); // (one winding every twelve beats)
        if (t >= G.lightAt) { const s = Math.sin(G.ribbon) * (0.62 + 0.38 * Math.sin(G.ribbon * 0.23 + 1)), x = CX + s * (AX * 0.5 - RAIL - 24);
          G.lightAt = Math.max(G.lightAt + B / 2, t - B); G.lights.push({ x, y: -4 }); G.lit = (G.lit + 1) % 800;
          if (G.breakFor > 16 && G.lit % 4 === 0 && Math.abs(s) > 0.5) G.drifters.push({ x: 2 * CX - x, y: -10, tint: G.lit % 8 ? 0 : 1 }); }
        G.combo = Math.max(0, G.combo - dt * 30);
      }
      for (let i = G.lights.length - 1; i >= 0; i--) { const l = G.lights[i]; l.y += fall; if (Math.abs(l.x - G.x) < 8 && Math.abs(l.y - G.y) < 7) { G.score += 50; bitsAt(l.x, l.y, 4, [WHITE, Wd.lamp], 30); G.lights.splice(i, 1); } else if (l.y > DN + 6) G.lights.splice(i, 1); }
      for (let i = G.drifters.length - 1; i >= 0; i--) { const d = G.drifters[i]; d.y += fall; if (d.y > DN + 14) G.drifters.splice(i, 1); }
      // what has had its time goes; the prizes of a great foe fly out and then home to the ship
      for (let i = G.medals.length - 1; i >= 0; i--) if (t - G.medals[i].born > 1.2 + G.medals[i].i * 0.1) { G.score += 200; bitsAt(G.x, G.y, 3, [WHITE, Wd.burst[1]], 30); G.pops.push({ x: G.x, y: G.y - 8, n: 200, born: t }); G.medals.splice(i, 1); }
      for (let i = G.booms.length - 1; i >= 0; i--) if ((t - G.booms[i].born) * 14 >= 5) G.booms.splice(i, 1);
      for (let i = G.bits.length - 1; i >= 0; i--) if (t - G.bits[i].born > G.bits[i].life) G.bits.splice(i, 1);
      for (let i = G.pops.length - 1; i >= 0; i--) if (t - G.pops[i].born > 0.6) G.pops.splice(i, 1);
      // what the ship has earned this stage: two bolts side by side from 16 foes, a pod on each side from 48; at 80 the pods fly off and it is all to earn again
      if (G.streak >= 80) { for (const side of [-1, 1]) bitsAt(G.px + side * 13, G.y, 6, [Wd.ship[3], WHITE], 50); G.streak = 0; }
      G.px += (G.x - G.px) * ease(12); G.pods += ((G.streak >= 48 ? 1 : 0) - G.pods) * ease(5);
      // the ground goes by: faster in a world with a fast pace, in a loud part and after a drop, slower in a break
      const run = dt * (V.scroll ?? 1) * Wd.pace * (18 + 50 * flow.intensity) * (1 + flow.drop + 0.4 * build) * (1 - 0.45 * flow.calm);
      G.scroll = (G.scroll + run) % (STRIP * 100); G.orb = (G.orb + (run * 0.05) / (DN + 120)) % 1;
      if (G.score >= 1e6) { G.score -= 1e6; G.shown = Math.max(0, G.shown - 1e6); } // the counter goes round, as counters did
      G.shown += (G.score - G.shown) * ease(7);
      // the two rails of lamps: the low bands fill the left one and the high bands the right. Each holds its top for a second and then sinks slowly, so nothing there blinks with the beat
      [clamp(sound.bass * 1.1), clamp(sound.treble * 1.4 * (0.5 + 0.5 * T.spark))].forEach((level, i) => { const r = G.rails[i]; r.now += (level - r.now) * ease(level > r.now ? 30 : 6); if (level >= r.held) { r.held = level; r.until = t + rate; } else if (t > r.until) r.held = Math.max(level, r.held - dt * 0.4); });
    }

    function num(S, n, px, py, col, big = 1, pad = 0, shade = null) { // a number in the pixel screen's own figures, any size, with a dark copy behind it if asked
      const text = String(Math.max(0, Math.floor(n))).padStart(pad, "0"); px = Math.round(px); py = Math.round(py);
      for (const [by, c] of shade ? [[big, shade], [0, col]] : [[0, col]]) { S.x.fillStyle = pixelCss(c); for (let i = 0; i < text.length; i++) { const d = PIXEL_DIGITS[text[i]]; for (let q = 0; q < 15; q++) if (d[q] === "1") S.x.fillRect(px + by + (i * 4 + (q % 3)) * big, py + by + Math.floor(q / 3) * big, big, big); } }
    }
    const lampOf = (set) => (set.which === "toys" ? mix(colors[0], WHITE, 0.3) : set.Wd.lamp); // the color of a world's lamps (in the world for any music, they take the record's own color)
    function scene(S) { // the picture in the drawings of one world (made), from the back to the front. Nothing in the game is changed here, so it can be drawn more than once in a frame
      const { AX, DN, CX, tall, narrow, low, BASE, RAIL, LOOP } = L, Wd = made.Wd, EDGE = made.EDGE, t = G.t, b = G.boss, B = G.B, build = G.build, since = t - G.dropAt, SH = made.ship.height, reach = tall ? 0.7 : 1;
      const lamp = lampOf(made), off = mix(lamp, EDGE, 0.82), rails = clamp(V.rails ?? 1);
      S.rect(Wd.bg, 0, 0, AX, DN);
      made.back(S);
      if (rails > 0.03) { const lit = mix(lamp, EDGE, 0.5), top = mix(Wd.burst[1], EDGE, 0.5), n = Math.floor(DN / 6);
        for (const side of [0, 1]) { const r = G.rails[side], x = side ? AX - RAIL : 0, now = r.now > 0.03 ? Math.floor(r.now * (n - 1)) : -1; // the lamps up to the held level glow dimly, and one bright lamp rides the level as it is this moment
          S.rect(EDGE, x, 0, RAIL, DN, rails); for (let i = 0; i < n; i++) S.rect(i === now ? lamp : i < r.held * n ? (i > n * 0.75 ? top : lit) : off, x + 1, DN - 5 - i * 6, RAIL - 2, 4, rails); } }
      // the foes, and the slow ones of a long break
      const pose = G.beat % 2;
      for (const d of G.drifters) { const a = made.foes[d.tint][Math.floor(t * 2) % 2]; S.put(a, d.x - a.width / 2 + Math.sin(t * 1.5 + d.x) * 3, d.y - a.height / 2); }
      for (const f of G.foes) { if (t < f.born) continue; const [x, y] = where(f), a = f.prize ? made.prize : made.foes[f.tint][pose]; S.put(a, x - a.width / 2, y - a.height / 2); }
      // the great foe: its charge gathers under it as the build grows, and a row of pips over it runs out as the drop comes; after the drop its two halves fall apart
      if (b.in > 0.02) { S.put(made.boss, b.x - 33, b.y - 21);
        for (let i = 0; i < 14; i++) { const p = 1 - ((t * 0.9 + i / 14) % 1), a = i * 2.4 + t, r = p * (20 + 30 * build); if (i < build * 16) S.dot(Wd.burst[1], b.x + Math.cos(a) * r, b.y + 24 + Math.sin(a) * r * 0.6); }
        const r = Math.round(1 + build * 4 + G.thump); S.rect(Wd.burst[2], b.x - r, b.y + 24 - r, r * 2, r * 2); S.rect(Wd.burst[1], b.x - r + 1, b.y + 25 - r, r * 2 - 2, r * 2 - 2); if (r > 2) S.rect(WHITE, b.x - r + 2, b.y + 26 - r, r * 2 - 4, r * 2 - 4);
        const pips = 16, left = Math.ceil((1 - build) * pips), gap = narrow ? 4 : 5; for (let i = 0; i < pips; i++) S.rect(i < left ? Wd.burst[i < 4 ? 2 : 1] : off, CX - (pips * gap) / 2 + i * gap, 14, gap - 1, 2); }
      if (t - b.dead < 0.9 && t >= b.dead) { const q = t - b.dead, [x, y] = b.at; for (const s of [0, 1]) S.x.drawImage(made.boss, s * 33, 0, 33, 42, Math.round(x - 33 + s * 33 + (s ? 1 : -1) * q * 50), Math.round(y - 21 + q * q * 90 + q * 10), 33, 42); }
      // lights, prizes and the foes' own shots
      const gem = (x, y, col) => { x = Math.round(x); y = Math.round(y); S.rect(EDGE, x - 1, y - 3, 3, 7); S.rect(EDGE, x - 3, y - 1, 7, 3); S.rect(EDGE, x - 2, y - 2, 5, 5); S.rect(col, x, y - 2, 1, 5); S.rect(col, x - 2, y, 5, 1); S.rect(col, x - 1, y - 1, 3, 3); S.rect(WHITE, x - (Math.floor(t * 6 + x) % 2), y - 1, 1, 1); };
      for (const l of G.lights) gem(l.x, l.y, lamp);
      for (const m of G.medals) { const age = t - m.born, out = 1 - Math.exp(-age * 4), home = eased(clamp((age - 0.5 - m.i * 0.1) / 0.7)); gem(lerp(m.x + Math.cos(m.a) * 44 * out, G.x, home), lerp(m.y + Math.sin(m.a) * 30 * out, G.y, home), Wd.burst[1]); }
      for (const d of G.drops) { const x = Math.round(d.x), y = Math.round(d.y), fat = Math.floor(t * 8 + d.x) % 2; S.rect(EDGE, x - 2, y - 2, 5, 5); S.rect(Wd.great[2], x - 1 - fat, y - 1, 3 + fat * 2, 3); S.rect(Wd.great[2], x - 1, y - 1 - fat, 3, 3 + fat * 2); S.rect(WHITE, x, y, 1, 1); } // a small ball that beats
      // the ship's bolts: pale, with a colored tail (a long one on a fast bolt). Two side by side once it has earned them, and then a pod on each side whose bolts close on the same foe
      const guns = GUNS[G.streak >= 48 ? 2 : G.streak >= 16 ? 1 : 0];
      for (const s of G.shots) { const p = clamp((t - s.t0) / (s.t1 - s.t0)), [tx, ty] = s.f ? where(s.f) : [b.x + made.pts[s.pt][0] * reach, b.y + made.pts[s.pt][1]], y = lerp(s.y0, ty + 5, p);
        for (const [from, to] of guns) { const x = Math.round(lerp(s.x0 + from, tx + to, p)); S.rect(Wd.shot, x - 1, y, 2, s.fast ? 14 : 7, 0.55); S.rect(Wd.shot, x - 1, y, 2, 4); S.rect(WHITE, x - 1, y, 2, 2); } }
      if (G.pods > 0.05) for (const side of [-1, 1]) { const x = Math.round(G.px + side * (6 + 7 * G.pods)) - 2, y = Math.round(G.y + 2 + Math.sin(t * 3 + side) * 1.5); S.rect(EDGE, x - 1, y - 1, 6, 9); S.rect(Wd.ship[1], x, y, 4, 7); S.rect(Wd.ship[0], x, y, 2, 6); S.rect(Wd.ship[3], x + 1, y + 1, 2, 2); S.rect(Wd.ship[2], x + 1, y + 6, 2, 1 + (Math.floor(t * 15) % 2)); }
      // the ship: its shadow self twice on the loop, a flame that lengthens with the bass, a cap of light when a shot glances off, a spark at the nose when it fires
      const leans = Math.abs(G.lean) > 0.35, pic = leans ? made.lean : made.ship, ship = (x, y, alpha) => S.put(pic, x - pic.width / 2, y - SH / 2, { flip: leans && G.lean > 0, alpha });
      if (since < 4 * B) for (const [behind, alpha] of [[0.09, 0.22], [0.045, 0.4]]) { const a = eased(Math.max(0, since / (4 * B) - behind / (4 * B))) * TAU; ship(CX + Math.sin(a) * AX * (tall ? 0.28 : 0.16), BASE - (1 - Math.cos(a)) * DN * LOOP, alpha); }
      const flame = 2 + Math.round(G.bass * 4 + (Math.floor(t * 15) % 2)); S.rect(Wd.ship[2], G.x - 2, G.y + SH / 2 - 2, 4, flame); S.rect(Wd.burst[1], G.x - 1, G.y + SH / 2 - 2, 2, flame - 2);
      ship(G.x, G.y, 1);
      if (t - G.shield < 0.15 && t >= G.shield) { S.rect(Wd.ship[3], G.x - 7, G.y - SH / 2 - 3, 14, 1); S.rect(Wd.ship[3], G.x - 9, G.y - SH / 2 - 2, 2, 1); S.rect(Wd.ship[3], G.x + 7, G.y - SH / 2 - 2, 2, 1); }
      if (t - G.fired < 0.05 && t >= G.fired) { S.rect(Wd.shot, G.x - 2, G.y - SH / 2 - 2, 4, 3); S.rect(WHITE, G.x - 1, G.y - SH / 2 - 3, 2, 3); }
      // bursts, the bits they throw, and the points going up from each foe
      for (const e of G.booms) { const f = Math.floor((t - e.born) * 14); if (f < 0 || f > 4) continue; const a = burstArt(e.size, f); S.put(a, e.x - (a.width >> 1), e.y - (a.height >> 1)); }
      for (const p of G.bits) { const age = t - p.born; if (age < 0 || age > p.life) continue; const slow = (1 - Math.exp(-age * 4)) / 4, s = p.big && age < p.life * 0.6 ? 2 : 1; S.rect(p.col, p.x + p.vx * slow, p.y + p.vy * slow, s, s); }
      for (const p of G.pops) { const age = t - p.born; if (age >= 0 && age <= 0.6) num(S, p.n, p.x - String(p.n).length * 2, p.y - age * 16, age > 0.4 ? Wd.burst[2] : WHITE); }
      // the cabinet's own marks: the score, the count of hits in a row with eight pips that fill a beat at a time, and the stage as pips (past five, one pip and a number).
      // A small screen has no room for all three: the score is left out, a narrow one shows the stage as a number from the start, and a low one keeps the count in the corner, out of the great foe's way
      const ink = mix(lamp, WHITE, 0.7), left = RAIL + 4, right = AX - RAIL - 4, hop = t - G.lastBeat < 0.08 && t >= G.lastBeat ? 1 : 0, combo = Math.min(999, Math.floor(G.combo));
      if (!narrow && !low) num(S, G.shown + 0.5, left, 4, ink, 1, 6, EDGE);
      if (combo > 1) { const wide = String(combo).length * 8 + 6, x = low ? left : Math.round(CX - wide / 2); for (const [dx, dy] of [[0, 5], [2, 5], [1, 6], [0, 7], [2, 7]]) S.dot(Wd.burst[1], x + dx, dy); num(S, combo, x + 5, 3 - hop, Wd.burst[1], 2, 0, EDGE);
        for (let i = 0; i < 8; i++) S.rect(i <= (combo - 1) % 8 ? lamp : off, (low ? x : CX - 16) + i * 4, 15 + (b.in > 0.02 && !low ? 4 : 0), 3, 1); }
      const risen = t - G.stageAt, up = risen >= 0 && risen < 0.6 ? Math.round(Math.sin((risen / 0.6) * Math.PI) * 3) : 0, shown = Math.min(G.stage, 5), text = G.stage > 5 || narrow ? String(G.stage) : ""; // (the stage's mark hops when it goes up)
      if (text) { num(S, G.stage, right - text.length * 4 + 1, 4 - up, ink, 1, 0, EDGE); S.rect(EDGE, right - text.length * 4 - 6, 4 - up, 5, 5); S.rect(Wd.burst[1], right - text.length * 4 - 5, 5 - up, 3, 3); }
      else for (let i = 0; i < shown; i++) { const x = right - shown * 6 + i * 6 + 1, y = 4 - (i === shown - 1 ? up : 0); S.rect(EDGE, x, y, 5, 5); S.rect(i === shown - 1 ? Wd.burst[1] : lamp, x + 1, y + 1, 3, 3); }
    }
    function draw(S) { // the whole picture. Going over to another world (the next song is another kind of music), the new one comes down behind a line of light: above the line the game is drawn as the new world, below it as the old one, so the ship and the foes play on right through the change
      const { AX, DN } = L, t = G.t, now = made, x = S.x;
      if (was && was.AX === AX && was.DN === DN && G.wipe !== null && t >= G.wipe && t - G.wipe < 1.8) { const line = Math.round(eased((t - G.wipe) / 1.8) * DN);
        for (const [set, top, high] of [[now, 0, line], [was, line, DN - line]]) { if (high < 1) continue; made = set; x.save(); x.beginPath(); x.rect(0, top, AX, high); x.clip(); scene(S); x.restore(); }
        made = now; S.rect(lampOf(now), 0, line, AX, 1); }
      else scene(S);
      G.pulse = 0;
    }

    return () => {
      const dot = Math.max(2, Math.round(Math.sqrt(w * h) / 240)), wide = Math.round(w / dot), S = pixelScreen((wide * h) / w < 150 ? Math.ceil((150 * w) / h) : wide), AX = S.across, DN = S.down, t = sound.t; // dots of about a 240th of the picture's size (320 by 180 on a wide screen, 150 by 300 on a phone), and smaller ones on a low wide picture so it is never under 150 dots tall
      if (!G || t < G.t || t - G.t > 1) G = fresh(t - Math.min(0.05, sound.dt)); // a new game when the effect starts: the picture's clock has run on without it
      if (mood !== G.moodWas || genre !== G.genreWas) { G.moodWas = mood; G.genreWas = genre; G.want = WORLD_OF[musicWorld()] || "toys"; }
      if (!L || L.AX !== AX || L.DN !== DN) L = layout(AX, DN);
      if (G.across !== AX || G.down !== DN) { if (G.across) resize(AX / G.across, DN / G.down); else { G.x = G.ax = G.px = L.CX; G.y = G.ay = L.BASE; } G.across = AX; G.down = DN; G.wipe = null; }
      if (was && (G.wipe === null || t < G.wipe || t - G.wipe >= 1.8)) was = null; // (the old world's drawings are let go once the new one is all the way down)
      // the world's drawings: made when the game starts, made again when the music's kind changes (the old world's are kept until the new one has come down over it), and when the window has changed shape, though not more than twice a second while it is being dragged
      const fits = made && made.AX === AX && made.DN === DN;
      if (!made || (!G.begun && (made.which !== G.want || !fits))) { made = build(G.want, AX, DN); G.builtAt = t; }
      else if (made.which !== G.want && (G.wipe === null || t - G.wipe >= 1.8)) { if (fits) { was = made; G.wipe = t; } made = build(G.want, AX, DN); G.builtAt = t; }
      else if (!fits && Math.abs(t - G.builtAt) > 0.5) { made = build(made.which, AX, DN); G.builtAt = t; }
      G.begun = true;
      const step = t - G.t;
      G.t = t;
      if (step > 0) update(Math.min(step, 0.3)); // (when it is drawn a second time in one frame, the clock has not moved and neither does the game)
      draw(S);
      S.show();
    };
  })();
  /* ==== arcade: end ==== */
  /* ==== places: begin ==== */
  /* ---------- Places: pixel-art scenery that lives with the song, one place for each kind of music. Not a game: a picture with depth, a sky that turns slowly through the hours, and things that live in it.
     Everything is drawn in whole dots by a few drawing tools of its own into one list of dots (B), which goes onto the small screen in one go: nothing is smoothed, blends are dithered or mixed in a few steps.
     What is kept from frame to frame is a handful of numbers (placeSt) and sixteen levels of the spectrum. Snow, embers, birds, fireworks and the whale are worked out from the clocks, so nothing piles up. ---------- */
  const PLACE_OF = { trance: "fjord", techno: "city", jungle: "city", hard: "cinder", acid: "acid", psy: "psy", house: "pier", ambient: "sea", game: "day", "": "meadow" }; // the place each kind of music gets ("day" is the meadow under a bright sky; drum and bass gets the city with heavier rain)
  const PLACE_HOUR = { fjord: 0.4, city: 0.4, acid: 0.4, psy: 0.3, sea: 0.3 }; // where in the turn of the sky each place begins (0 is late in the day, 0.5 the middle of the night): the places that are best by night begin near it
  const placeSt = { t: 0, cam: 1000, day: 0, wide: 0, calmFor: 0, gT: 30, soft: 0, up: 0, afloat: 0, beat: 0, hat: 0, hatAgo: 0, he: 0, bs: 0.4, sw: 0.4, kick: 0, sk: 9, bl: 0.47, bc: 0, build: 0, inten: 0.6, rain: 0.55, eq: new Float32Array(16), world: "", over: 1, stepped: -1, painted: -1e9, look: "" }; // the clocks and levels of the place: see placeStep
  const PLACE_LANDS = "abcd"; // the four lies of the land a version can have (the dial "land"). Letters and not numbers, because the app walks a number through the sizes in between, and here each is another landscape with the moon on the other side
  let placeView = null; // the place as it is drawn for one size of small screen: made again when the picture changes shape, while placeSt carries on
  function placeStep() { // the clocks and the smoothed levels, once a frame
    const st = placeSt, dt = Math.min(Math.max(+sound.dt || 0, 0), 0.1), ease = (rate) => 1 - Math.exp(-dt * rate); // a late frame moves things a tenth of a second at most, and a frame with no time moves nothing: nothing jumps after a sleeping tab
    const kind = musicWorld(), next = PLACE_OF[kind] || "meadow", building = clamp((flow.build - 0.25) / 0.75); // (with no kick the follower's build creeps up to a quarter and sits there: only what is above that is a build)
    st.t += dt; st.kick = sound.kick; st.inten += (flow.intensity - st.inten) * ease(2); st.bl = 60 / (flow.bpm || 128);
    st.build += (building - st.build) * ease(building > st.build ? 5 : 2.5); // the build, smoothed: the follower sets its own to nothing on the frame a drop lands
    st.bs += (sound.bass - st.bs) * ease(7); // the bass, quick: for small things (a reed, a frond, a tower car)
    st.sw += (sound.bass - st.sw) * ease(1.2); // the bass, slow: a swell for big areas (water, aurora, lava), so that nothing large pulses with single kicks
    st.calmFor = flow.calm > 0.5 ? Math.min(60, st.calmFor + dt) : Math.max(0, st.calmFor - dt * 6);
    st.up += dt * (1 + st.build); st.afloat += dt * (1 - 0.7 * st.wide); // clocks of their own for what rises: embers go up faster through a build, spores slower in a break. (Stepped like this a change of speed only changes how fast they go on from where they are)
    st.wide += (flow.calm * (1 - 0.65 * eased(clamp((st.calmFor - 20) / 10))) - st.wide) * ease(0.7); // a break: the view settles and tilts up to the sky. After twenty seconds of quiet the stillness wears off again, so music with no drums is not a still picture
    st.cam += dt * (V.going ?? 1) * 5 * (1 - 0.9 * st.wide) * (0.5 + 0.8 * st.inten) * (1 + 0.6 * st.build); // dots a second for the nearest layer
    st.bc = (st.bc + (dt / st.bl) * (1 - 0.92 * st.wide) * (1 + st.build)) % 32; // a clock in beats for wheels and sails: it nearly stops in a break and runs ahead in a build
    st.day = (st.day + dt / 240) % 1; // the sky turns once in four minutes
    if (sound.kickHit > 0) { st.beat = (st.beat + 1) % 2400; st.sk = 0; } else st.sk += dt; // count the kicks, quiet ones too; sk is the seconds since the last one
    st.hatAgo = sound.hatHit ? 0 : st.hatAgo + dt;
    if (sound.hatHit) { st.hat = (st.hat + 1) % 360000; st.he = 1; } else st.he *= Math.exp(-dt * 7); // count the hi-hats; he is a hat's short afterglow
    if (st.hatAgo > 1.5 + st.bl * 2) { st.hat = (st.hat + 1) % 360000; st.hatAgo = 1.5; } // with no hi-hats at all, the windows and bulbs still change now and then
    if (flow.dropHit && st.gT > 8) { st.gT = 0; st.soft = 0; } // the drop: the grand thing begins (a second drop while it is still on is left alone)
    else if (st.gT > (st.world === "sea" ? 90 : 180) && (st.calmFor > 40 || (sound.kickHit > 0 && flow.part === "groove"))) { st.gT = 0; st.soft = 1; } // no drop for a long while: it comes by itself, and more gently. Only in a long quiet (music with no drums never has a drop) or on a kick of a running groove: never in an ordinary break, where the drop itself is on its way
    else st.gT += dt;
    if (st.soft && (flow.dropHit || st.soft < 1)) st.soft = Math.max(0, Math.min(st.soft, 0.999) - dt / 0.4); // a real drop while one that came by itself is on takes it over: it is not started again, its gentleness goes in a moment (soft is 1 while gentle, and on its way to 0 from then on)
    for (let i = 0; i < 16; i++) { const v = (sound.bands[i * 4] + sound.bands[i * 4 + 1] + sound.bands[i * 4 + 2] + sound.bands[i * 4 + 3]) / 4; st.eq[i] += (v - st.eq[i]) * (v > st.eq[i] ? ease(30) : ease(4)); } // sixteen levels of the spectrum, quick up and slow down
    st.rain += ((kind === "jungle" ? 1 : 0.55) - st.rain) * ease(0.5);
    if (st.over < 1) st.over = Math.min(1, st.over + dt / 2.2); // going over to another place takes two seconds or so
    else if (next !== st.world) { st.over = st.world ? 0 : 1; st.world = next; } // another kind of music: another place (the clocks carry on)
  }
  function placeMake(S) { // the place laid out for one size of small screen, with its drawing tools
    const W = S.across, H = S.down, img = S.x.createImageData(W, H), B = new Uint32Array(img.data.buffer), old = new Uint32Array(W * H), st = placeSt, WIDE = W >= H; // B: every dot of the small screen as one number; old: the place before, while the new one comes through it
    const TALL = WIDE ? Math.min(1, Math.max(0.6, H / 180)) : 1.3, SC = WIDE ? Math.min(1, Math.max(0.7, H / 180)) : 0.8; // how much taller things stand on an upright picture, and how much smaller they are drawn on a low or narrow one
    const M = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // the 4 by 4 dither
    const lerp = (a, b, t) => a + (b - a) * t; // from a to b by t (0..1)
    const rgb = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0; // a color as the one number a dot of B holds
    const named = {}, C = (hex) => named[hex] ?? (named[hex] = rgb(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))); // a color from its name ("#rrggbb"): worked out the first time and kept
    const mixc = (a, b, t) => { t = clamp(t); const ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255; return rgb(ar + ((b & 255) - ar) * t, ag + (((b >> 8) & 255) - ag) * t, ab + (((b >> 16) & 255) - ab) * t); }; // a color between two (t from 0 to 1)
    const turnOf = (c, deg) => { const k = (deg * Math.PI) / 180, co = Math.cos(k), m = (1 - co) / 3, q = Math.sin(k) / Math.sqrt(3), s = co + m, b = m - q, o = m + q, r = c & 255, g = (c >> 8) & 255, bl = (c >> 16) & 255, cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v); return rgb(cl(r * s + g * b + bl * o), cl(r * o + g * s + bl * b), cl(r * b + g * o + bl * s)); }; // a color with its hue turned
    const hash = (n, s = 0) => { let x = Math.imul((n | 0) ^ Math.imul((s | 0) + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; x = Math.imul(x, 0x297a2d39); x ^= x >>> 15; return (x >>> 0) / 4294967296; }; // a number from 0 to 1 that is always the same for the same two whole numbers
    const noise = (x, s = 0) => { const i = Math.floor(x), f = x - i; return lerp(hash(i, s), hash(i + 1, s), eased(f)); }; // a smooth wandering number (0..1) along x: the same place always gives the same
    const fbm = (x, s = 0) => noise(x, s) * 0.6 + noise(x * 2.3, s + 1) * 0.28 + noise(x * 5.1, s + 2) * 0.12; // the same with finer wobbles on top, for a skyline
    const noise2 = (x, y, s = 0) => { const i = Math.floor(x), j = Math.floor(y), u = eased(x - i), v = eased(y - j); return lerp(lerp(hash(i + j * 7919, s), hash(i + 1 + j * 7919, s), u), lerp(hash(i + (j + 1) * 7919, s), hash(i + 1 + (j + 1) * 7919, s), u), v); }; // and one over a flat area, for mist
    let HZ = 0, air = [], ni = 0, grand = 0, day = 0, land = 1, moonAt = 0.74, weather = 1, pick = "", coming = false; // this frame's horizon row, sky colors (top to horizon), how much it is night (0..1), how much of the drop's grand thing there is (0..1), the hour, and the version's dials

    // The drawing tools. Each puts whole dots into B; where a blend is wanted (l from 0 to 1) it is dithered: so many dots of every sixteen, in a fixed pattern.
    const dit = (x, y, l) => M[(x & 3) | ((y & 3) << 2)] < l * 16; // is this dot on, at a blend of l (0..1)
    const dot = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y < H) B[y * W + x] = c; };
    function box(x, y, w, h, c, l = 1) { // a filled rectangle, dithered when l < 1
      x = Math.round(x); y = Math.round(y); const x1 = Math.min(W, x + Math.round(w)), y1 = Math.min(H, y + Math.round(h)); x = Math.max(0, x); y = Math.max(0, y);
      if (x1 <= x || l <= 0) return;
      for (let j = y; j < y1; j++) { if (l >= 1) B.fill(c, j * W + x, j * W + x1); else for (let i = x; i < x1; i++) if (dit(i, j, l)) B[j * W + i] = c; }
    }
    function disc(cx, cy, r, c, l = 1, below = H) { cx = Math.round(cx); cy = Math.round(cy); for (let j = -Math.ceil(r); j <= r; j++) { const q = r * r - j * j; if (q >= 0 && cy + j < below) { const half = Math.floor(Math.sqrt(q) + 0.35); box(cx - half, cy + j, half * 2 + 1, 1, c, l); } } } // "below": nothing is drawn from that row down (for things half in the water)
    function dome(cx, base, rx, ry, c, l = 1) { cx = Math.round(cx); base = Math.round(base); for (let j = 0; j <= ry; j++) { const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (j / (ry + 0.5)) ** 2))); box(cx - half, base - j, half * 2 + 1, 1, c, l); } } // the top half of an ellipse standing on row "base"
    function ring(cx, cy, r, c, l = 1, squash = 1, tilt = 0, from = 0, to = TAU) { const n = Math.max(8, Math.ceil(r * 7)), ct = Math.cos(tilt), sn = Math.sin(tilt); for (let i = 0; i < n; i++) { const a = from + ((to - from) * i) / n, ex = Math.cos(a) * r, ey = Math.sin(a) * r * squash, x = Math.round(cx + ex * ct - ey * sn), y = Math.round(cy + ex * sn + ey * ct); if (l >= 1 || dit(x, y, l)) dot(x, y, c); } }
    function line(x0, y0, x1, y1, c) { x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) dot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c); }
    function put(rows, x, y, pal, flip = false, size = 1) { // a sprite: rows of characters, colored by pal at the moment it is drawn (so the same sprite can be lit by the hour)
      x = Math.round(x);
      y = Math.round(y);
      const n = rows[0].length;
      for (let j = 0; j < rows.length; j++) for (let i = 0; i < n; i++) { const c = pal[rows[j][flip ? n - 1 - i : i]]; if (c !== undefined) { if (size === 1) dot(x + i, y + j, c); else box(x + i * size, y + j * size, size, size, c); } }
    }

    // Things every place uses: the hour, the sky, stars, a moon, a layer of land, things standing along a layer, water, birds, clouds, rain.
    const phase = () => { const p = day * 4, i = Math.floor(p) % 4; return [i, (i + 1) % 4, eased(clamp((p - Math.floor(p) - 0.3) / 0.7))]; }; // each hour of the sky is held for a while, then blends into the next
    const hour = (table) => { const [a, b, f] = phase(); return typeof table[a] === "number" ? lerp(table[a], table[b], f) : table[a].map((c, k) => mixc(c, table[b][k], f)); };
    const band = (x) => st.eq[Math.max(0, Math.min(15, Math.floor((x / W) * 16)))]; // the spectrum laid across the picture, low on the left
    function paintSky(cols, to) { // bands of the sky's colors from the top to row "to", dithered into each other
      const n = cols.length - 1;
      for (let y = 0; y < Math.min(H, to); y++) { const f = (y / to) * n, i = Math.min(n - 1, Math.floor(f)), l = clamp((f - i - 0.2) / 0.6) * 16, a = cols[i], b = cols[i + 1], row = y * W, my = (y & 3) << 2; for (let x = 0; x < W; x++) B[row + x] = M[(x & 3) | my] < l ? b : a; }
    }
    function stars(count, level, cDim, cBright, to) { // they come out as it gets dark; a few flare on each hi-hat
      for (let i = 0; i < count; i++) {
        if (hash(i, 11) > level) continue;
        const x = Math.floor((((hash(i, 12) * W - st.cam * 0.02) % W) + W) % W), y = Math.floor(hash(i, 13) ** 1.4 * to), big = hash(i, 14) > 0.8, lit = (i + st.hat * 5) % 9 === 0 && st.he > 0.25;
        dot(x, y, big || lit ? cBright : cDim);
        if (lit && big) { dot(x - 1, y, cDim); dot(x + 1, y, cDim); dot(x, y - 1, cDim); dot(x, y + 1, cDim); }
      }
    }
    function moon(x, y, r, cLit, cDark, cHalo, bite = 0.45) { // a moon with a halo that swells on the kick
      const k = st.kick * (1 - st.wide * 0.5);
      disc(x, y, r + 5 + 5 * k, cHalo, 0.14); disc(x, y, r + 2 + 3 * k, cHalo, 0.35);
      disc(x, y, r, cLit);
      if (bite > 0) { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.7 && (i - r * bite * 1.6) ** 2 + (j + r * bite * 0.5) ** 2 < r * r * 0.92) dot(x + i, y + j, cDark); }
      else { disc(x - r * 0.35, y - r * 0.2, r * 0.22, cDark); disc(x + r * 0.35, y + r * 0.35, r * 0.16, cDark); dot(x + r * 0.2, y - r * 0.5, cDark); dot(x - r * 0.1, y + r * 0.55, cDark); }
    }
    const heights = new Float32Array(W + 14); // a layer's height at every column (and a few to either side), filled anew by each layer as it is drawn
    function ridge(hOf, par, base, cBody, cLit, { litDeep = 2, to = H, tex = null, cHaze = null } = {}) { // one layer of land: a silhouette from a height function, lit on the slopes that face left
      const off = Math.floor(st.cam * par), hs = heights, PAD = 6; base = Math.round(base); to = Math.min(H, Math.round(to));
      for (let x = -PAD - 2; x < W + PAD; x++) hs[x + PAD + 2] = hOf(x + off);
      for (let x = 0; x < W; x++) {
        const hh = hs[x + PAD + 2], y = Math.max(0, Math.round(base - hh));
        if (y >= to) continue;
        for (let j = y, end = Math.min(to, H); j < end; j++) B[j * W + x] = cBody;
        if (cLit !== null) for (let d = 0, n = Math.min(litDeep, to - y); d < n; d++) { const sh = x + PAD + 2 + Math.round((Math.abs((d % 14) - 7) - 3.5) * 1.1); if (hs[sh] - hs[sh - 2] > 0.25) B[(y + d) * W + x] = cLit; } // lit where the slope above faces the light; the line between light and shade zigzags down the mountain
        if (tex) tex(x, y, x + off, hh);
        if (cHaze !== null) for (let d = 1; d <= 9 && to - d >= y; d++) if (to - d < H && dit(x, to - d, 0.75 - d * 0.08)) B[(to - d) * W + x] = cHaze;
      }
    }
    const each = (par, cell, seed, fn, margin = 40, drift = 0) => { const off = Math.floor(st.cam * par + drift); for (let k = Math.floor((off - margin) / cell); k <= Math.floor((off + W + margin) / cell); k++) fn(k * cell + Math.floor(hash(k, seed) * cell * 0.7) - off, k, hash(k, seed + 1)); }; // things standing along a layer, one to a cell
    function water(top, cWater, cGlint, { ripple = 1, deep = 0.3, glint = 1, flow = 0, few = 0.93 } = {}) { // everything above row "top" mirrored below it, rippling with the bass, sinking into the water's own color
      const amp = (0.3 + 2.4 * st.sw * ripple) * (1 - 0.85 * st.wide);
      for (let y = top; y < H; y++) {
        const d = y - top, src = top - 1 - Math.floor(d * 1.25), off = Math.round(Math.sin(d * 0.55 + st.t * 1.7) * amp * Math.min(1, d / 5)), row = y * W, sink = clamp(deep + (0.6 * d) / (H - top + 1)) * 4, my = (y & 3) << 2;
        for (let x = 0; x < W; x++) B[row + x] = src < 0 ? cWater : mixc(B[src * W + Math.max(0, Math.min(W - 1, x + off))], cWater, Math.floor(sink + M[(x & 3) | my] / 16) / 4);
        if (glint) for (let x = 0; x < W; x++) if (noise((x + st.cam * 0.3 + st.t * flow * (4 + d * 0.3)) * 0.11 + d * 3.7, d) + 0.25 * Math.sin(st.t * 1.3 + d * 1.9 + x * 0.05) > few - 0.06 * st.he * glint) B[row + x] = mixc(B[row + x], cGlint, 0.6); // short glints that shift, a few more on each hi-hat
      }
    }
    function glitter(x, top, c) { for (let y = top; y < H; y++) { const d = y - top, hw = 2 + d * 0.16; for (let i = 0; i < 2; i++) if (hash(d, i + 5) < 0.5) box(x + (hash(d * 3 + i, Math.floor(st.t * 3 + d * 0.3)) - 0.5) * 2 * hw, y, 1 + hash(d, i) * 3, 1, c, d % 2 ? 1 : 0.5); } } // a path of short dashes that widens toward the viewer
    function flock(rowsA, rowsB, pal, { n = 7, y = 0.3, every = 26, takes = 18, seed = 5, spread = 9 } = {}) { // a flock crossing the sky now and then, wings beating
      const k = Math.floor(st.t / every), p = (st.t - k * every) / takes; if (p >= 1 || hash(k, seed) < 0.2) return;
      const dir = hash(k, seed + 1) < 0.5 ? 1 : -1, x0 = dir > 0 ? lerp(-70, W + 70, p) : lerp(W + 70, -70, p), y0 = HZ * (y + 0.2 * hash(k, seed + 2)) + 5 * Math.sin(p * 9);
      for (let i = 0; i < n; i++) { const side = i % 2 ? 1 : -1, rank = Math.ceil(i / 2); put(Math.floor(st.t * 5 + i * 0.37) % 2 ? rowsA : rowsB, x0 - dir * rank * spread, y0 + side * rank * spread * 0.55 + rank, pal, dir < 0); }
    }
    function cloud(x, base, size, id, cLit, cBody, cUnder, flat = false, high = 0.62) { // a heap of domes with a flat foot, lit from the upper left
      if (flat) { // "flat": bars of low cloud or smoke
        const L = size * 5;
        for (let i = 0; i < 3; i++) { const o = (hash(id, 60 + i) - 0.5) * L * 0.5, l = L * (0.5 + 0.5 * hash(id, 70 + i)), y = base - i * 3; box(x + o - l / 2, y, l, 2, cBody); box(x + o - l / 2 - 5, y, 5, 2, cBody, 0.5); box(x + o + l / 2, y, 5, 2, cBody, 0.5); box(x + o - l * 0.35, y - 1, l * 0.7, 1, cLit, 0.5); box(x + o - l * 0.4, y + 2, l * 0.8, 1, cUnder, 0.5); }
        return;
      }
      const heap = high > 0.8, n = heap ? 3 + Math.floor(size / 7) : 4 + Math.floor(size / 4), fat = heap ? 1.15 : 1.5;
      for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { const u = i / (n - 1) - 0.5, r = size * (0.25 + 0.75 * (1 - 4 * u * u) ** 0.8) * (0.6 + 0.4 * hash(i, id + 50)), cx = x + u * size * (heap ? 3 : 3.6); if (pass) dome(cx + 1, base, r * fat, r * high, cBody); else dome(cx - 1, base, r * fat, r * high + 1.5, cLit); }
      box(x - size * 2, base, size * 4, 1, cUnder); box(x - size * 1.7, base - 1, size * 3.4, 1, cUnder, 0.5);
    }
    function fall(amount, c, vx, vy, len = 0, seed = 21) { // rain, snow or ash: dots that fall by the clock
      const n = Math.round(W * 0.5 * clamp(amount)), span = W + 60;
      for (let i = 0; i < n; i++) { const f = 0.75 + 0.5 * hash(i, seed + 2), x = ((((hash(i, seed) * span + st.t * vx * f + (len ? 0 : 5 * Math.sin(st.t * 0.6 + i))) % span) + span) % span) - 30, y = (hash(i, seed + 1) * H + st.t * vy * f) % H; dot(x, y, c); for (let j = 1; j <= len; j++) dot(x - (vx / vy) * j, y - j, c); }
    }
    function flame(x, y, h, cols) { h = Math.round(h); for (let j = 0; j < h; j++) { const wd = Math.round((1 - j / h) * Math.min(2, h / 4)); box(x - wd, y - j, wd * 2 + 1, 1, j < h * 0.35 ? cols[2] : j < h * 0.7 ? cols[1] : cols[0]); } }
    const BIRD_A = ["b.....b", ".b...b.", "..bbb..", "...b..."], BIRD_B = [".......", "..bbb..", ".b.b.b.", "b.....b"];
    const CABIN = ["......rr.......", "....sssssss....", "...sssssssss...", "..srrrrrrrrrs..", ".rrrrrrrrrrrrr.", ".bbbbbbbbbbbbb.", ".bwwbbbbbbwwbb.", ".bwwbbddbbwwbb.", ".bbbbbddbbbbbb."];
    const BOAT = ["......l......", "......m......", "......mw.....", "......mww....", ".....wmwww...", "....wwmwwww..", "...wwwmwwwww.", "..wwwwmwwwwww", "......m......", "hhhhhhhhhhhhh", ".hkkkkkkkkkh.", "..hhhhhhhhh.."];
    function boat(every, takes, y, pal, cWake) { const k = Math.floor(st.t / every), p = (st.t - k * every) / takes; if (p < 1) { const bx = lerp(W + 20, -20, p), by = y + Math.round(Math.sin(st.t * 1.5) * 0.6); put(BOAT, bx, by - 11, pal); box(bx + 1, by + 1, 11, 1, cWake, 0.5); box(bx + 6, by + 2, 1, 5, pal.l, 0.5); } } // a boat with a lantern crosses now and then

    // The places. Each has its sky at four hours (late day, evening, night, dawn; four colors each from the top down to the horizon), how much it is night at each, and draw(), which paints it from the back to the front.
    const WORLDS = {};

    // Fjord (trance): snow peaks over still water, a little harbour, the aurora.
    WORLDS.fjord = (() => {
      const SKY = [["#27336b", "#5a5f9c", "#c57a9e", "#f7b891"], ["#10163a", "#272b63", "#5c4688", "#b9627f"], ["#04060f", "#080f29", "#0c1a3d", "#15304f"], ["#0d1535", "#2b3873", "#7c68a3", "#eba08e"]].map((r) => r.map(C));
      const NIGHT = [0.1, 0.55, 1, 0.6];
      const snow = C("#eef4ff"), snowSh = C("#8fa3d6"), rock = C("#2a3157"), rockLit = C("#59679c"), pineC = C("#0a1626"), pineLit = C("#1d3a4a"), warm = C("#ffd27a"), warmDim = C("#7a4a3a"), roof = C("#7a2f3f"), wall = C("#3a2a3a"), aur = [C("#3dffa0"), C("#22c7a9"), C("#7a5cff"), C("#ff5cc8")], waterC = C("#060d22");
      const AUR = [aur[0], aur[1], aur[2], ...[0, 1, 2, 3, 4].map((k) => mixc(aur[0], aur[3], k / 4))], lit = new Uint8Array(W * H); // the aurora's colors (the foot of a curtain, its middle, its top, and five from green to pink for the edge on a drop), and its light on every dot of the sky this frame: strength 0 to 4 and which color
      const far = (x) => { const p = noise(x * 0.012, land), q = 1 - Math.abs(2 * noise(x * 0.03, land + 3) - 1); return 12 + 46 * TALL * p * (0.35 + 0.65 * q) + 5 * noise(x * 0.21, land + 5); };
      const mid = (x) => 4 + 30 * fbm(x * 0.011, land + 9) + Math.max(0, 5 * hash(Math.floor(x / 5), 7) + 2 - Math.abs((x % 5 + 5) % 5 - 2) * 2.6);
      function pine(x, base, h, sway, sn, snS) {
        const tierH = Math.max(6, Math.round(h / 6));
        for (let j = 0; j < h; j++) { const tier = (j % tierH) / tierH, half = Math.floor(1 + (j / h) * h * 0.3 * (0.45 + 0.55 * tier)), o = Math.round(sway * (1 - j / h) ** 2), y = base - h + j; box(x - half + o, y, half * 2 + 1, 1, pineC); if (tier < 0.3 && j > 3) box(x - half + o, y, half + 1, 1, tier < 0.14 ? sn : snS); else if (half > 2) box(x - half + o + 1, y, half * 0.6, 1, pineLit); }
        box(x - 1, base, 3, 8, pineC);
      }
      return { SKY, NIGHT, draw() {
        const t = st.t, sc = SC;
        stars(Math.round(W * 0.42), (ni - 0.2) * 1.3, mixc(air[1], snow, 0.55), snow, HZ * 0.85);
        // the aurora: curtains of rays that sway with the bass, gather through a build and fill the sky on a drop
        const power = clamp(0.1 + 0.3 * ni * (0.5 + st.sw) + 0.3 * st.build ** 2 + 0.9 * grand - 0.1 * st.wide);
        lit.fill(0);
        for (let c = 0; c < 3; c++) for (let x = 0; x < W; x++) {
          const gather = lerp(1, 0.55, st.build), u = ((x - W / 2) * gather) / Math.max(W, 240), base = HZ * (0.3 + 0.13 * c - 0.1 * grand) + HZ * 0.14 * Math.sin(u * 5 + t * 0.13 + c * 2.1) + HZ * 0.05 * Math.sin(u * 13 - t * 0.21 + c);
          const ray = noise(x * 0.33 + c * 31, 4) * 0.6 + 0.4, len = (10 + HZ * 0.34 * noise(x * 0.045 + t * 0.25 + c * 17, 2)) * (0.5 + power) * ray;
          const edge = 3 + Math.round(clamp(ray * 1.6 - 0.5) * 4); // on a drop the foot of each ray is lit pink, more where the ray is strong
          for (let j = 0; j < len; j++) { const y = Math.round(base - j), u = 1 - j / len, l = power * ray * u * (0.7 + 0.3 * u) * (0.85 + 0.3 * st.sw); if (y < 0 || y >= HZ) continue; const q = Math.floor(clamp(l * 1.5) * 4 + M[(x & 3) | ((y & 3) << 2)] / 16), at = y * W + x; if (q > (lit[at] & 7)) lit[at] = q | ((j < 2 && grand > 0.2 ? edge : j < len * 0.35 ? 0 : j < len * 0.7 ? 1 : 2) << 3); }
        }
        for (let at = 0, n = W * Math.min(H, HZ); at < n; at++) if (lit[at]) B[at] = mixc(B[at], AUR[lit[at] >> 3], (lit[at] & 7) * 0.2125); // onto the sky in four steps of strength: where curtains cross, the brighter one shows
        moon(Math.round(W * moonAt), Math.round(HZ * 0.2), Math.round(9 * sc), C("#fff6d8"), mixc(air[0], C("#fff6d8"), 0.12), mixc(air[0], C("#cfd8ff"), 0.5));
        flock(BIRD_A, BIRD_B, { b: mixc(pineC, air[2], 0.3) }, { y: 0.34 });
        // far peaks with snow, then a nearer wooded ridge
        const haze = mixc(rock, air[3], 0.45), hazeLit = mixc(rockLit, air[2], 0.4), sn = mixc(snow, air[2], 0.25 + 0.3 * ni), snS = mixc(snowSh, air[1], 0.3 + 0.3 * ni);
        ridge(far, 0.08, HZ, haze, hazeLit, { to: HZ + 2, litDeep: 90, cHaze: mixc(haze, air[3], 0.5), tex: (x, y, wx, hh) => { if (hh > 26) { const deep = Math.round((hh - 26) * 0.8 + 3 * hash(wx, 3)); for (let d = 0; d < deep; d++) B[(y + d) * W + x] = B[(y + d) * W + x] === hazeLit ? sn : snS; } } });
        ridge(mid, 0.2, HZ + 1, mixc(pineC, air[3], 0.22), null, { to: HZ + 2 });
        // the harbour: a spit of land with cabins and sometimes a lighthouse (windows change on the hi-hats)
        const land = mixc(C("#101a30"), air[3], 0.1);
        each(0.4, Math.round(Math.max(130, Math.min(230, W * 0.72))), 40, (x, k, r) => {
          for (let i = -50; i <= 50; i++) { const hh = Math.round((2 + 5 * noise((i + k * 300) * 0.08, 3)) * Math.sqrt(1 - (i / 50) ** 2)); box(x + i, HZ - hh + 1, 1, hh + 1, land); dot(x + i, HZ - hh + 1, snS); }
          for (let j = 0, n = 2 + Math.floor(r * 3); j < n; j++) { const cx = x - 40 + j * 18 + Math.floor(hash(k * 3 + j, 2) * 4), on = hash(k * 8 + j, Math.floor((st.hat + j * 3) / 8)) < 0.45 + 0.4 * st.inten - 0.3 * st.wide; put(CABIN, cx, HZ - 12 - Math.floor(hash(k * 3 + j, 9) * 3), { r: roof, s: sn, b: wall, w: on ? warm : warmDim, d: C("#20141f") }); }
          if (hash(k, 5) > 0.35) { const lx = x + 38, ly = HZ - 26; box(lx, ly, 5, 24, snS); box(lx, ly, 2, 24, sn); box(lx, ly + 6, 5, 3, roof); box(lx, ly + 15, 5, 3, roof); box(lx - 1, ly - 4, 7, 4, pineC); box(lx + 1, ly - 3, 3, 2, warm); box(lx + 1, ly - 5, 3, 1, roof); dot(lx + 2, ly - 6, roof); disc(lx + 2, ly - 2, 3 + 4 * st.kick, warm, 0.22); } // the lamp swells on the kick
        }, 70);
        water(HZ + 1, waterC, mixc(air[2], snow, 0.35), { deep: 0.22 });
        boat(34, 26, HZ + 8, { m: pineC, w: mixc(snow, air[2], 0.3), h: roof, k: wall, l: warm }, mixc(waterC, snow, 0.4));
        fall(clamp(noise(t / 30, 5) * 2.4 - 1.1 + (weather - 1) * 0.6) * (1 - grand), sn, -6, 14); // snow comes and goes
        // the near bank: tall pines that lean with the bass
        const bank = H - 4 + st.wide * H * 0.08;
        each(1, WIDE ? 62 : 46, 60, (x, k, r) => { if (r < 0.7) pine(x, bank + r * 6, Math.round((38 + r * 46) * TALL), Math.sin(t * 0.9 + k) * (1 + 3 * st.bs), sn, snS); }, 30);
        box(0, bank, W, 30, pineC); box(0, bank - 1, W, 1, snS, 0.5);
        // shooting stars over the first seconds of a drop, one a beat
        for (let i = 0; i < 6; i++) { const a = st.gT - i * st.bl; if (a > 0 && a < 0.9) { const sx = W * (0.1 + 0.6 * hash(i, 31)) + a * 70, sy = HZ * 0.06 + hash(i, 9) * HZ * 0.25 + a * 34; for (let j = 0; j < 14; j++) if (j < 5 || dit(Math.round(sx - j * 2), Math.round(sy - j), 0.5)) dot(sx - j * 2, sy - j, j < 3 ? snow : aur[1]); } }
      } };
    })();

    // City (techno; with heavier rain for drum and bass): towers whose lit floors are the spectrum, a train on a viaduct, a canal, signs on the roofs that all come on at the drop.
    WORLDS.city = (() => {
      const SKY = [["#241f3c", "#46335a", "#8a4a62", "#d27a58"], ["#0b0d1d", "#161a33", "#2a2748", "#5a3a55"], ["#04060d", "#090d1a", "#101726", "#1e2838"], ["#121829", "#263048", "#4a5a72", "#8d9199"]].map((r) => r.map(C));
      const NIGHT = [0.35, 0.8, 1, 0.65];
      const ink = C("#07080f"), tower = C("#12172a"), towerLit = C("#252e4c"), warm = C("#ffb85a"), cool = C("#9fe8ff"), winOff = C("#1b2136"), red = C("#ff3b4a"), signs = [C("#ff4fa8"), C("#4fe8ff"), C("#ffe14f")], steel = C("#3c4764"), waterC = C("#04060c"), white = C("#f2f6ff");
      const GLYPH = [["...x...", "..x.x..", "..x.x..", ".x...x.", ".x...x.", "x.....x", "xxxxxxx"], ["..xxx..", ".x...x.", "x.....x", "x..x..x", "x.....x", ".x...x.", "..xxx.."], ["......x", "....x.x", "..x.x.x", "x.x.x.x", "x.x.x.x", "x.x.x.x", "x.x.x.x"],
        [".......", "..x....", ".x.x...", "x...x.x", ".....x.", ".......", "xxxxxxx"], ["...x...", "..xxx..", ".x.x.x.", "...x...", "...x...", "...x...", "...x..."], ["x..x..x", ".x.x.x.", "..xxx..", "xxxxxxx", "..xxx..", ".x.x.x.", "x..x..x"]];
      const CAR = [".bbbbbbbbbbbbbbbbbb.", "bbbbbbbbbbbbbbbbbbbb", "bwwbwwbwwbwwbwwbwwbb", "bwwbwwbwwbwwbwwbwwbb", "bbbbbbbbbbbbbbbbbbbb", "ssssssssssssssssssss", ".oo..............oo."];
      const beacon = (x, y) => { dot(x, y, red); disc(x, y, 1 + 2.5 * st.kick, red, 0.3); };
      return { SKY, NIGHT, draw() {
        const t = st.t, wet = clamp(noise(t / 34, 8) * 2.6 - 0.9 + (weather - 1) * 0.6) * st.rain * (1 - st.wide) * (1 - 0.7 * grand); // rain comes and goes, and stops in a break
        stars(Math.round(W * 0.3), (ni - 0.5) * (0.4 + st.wide) * (1 - wet), mixc(air[1], white, 0.4), white, HZ * 0.6);
        moon(Math.round(W * (1 - moonAt) + 20), Math.round(HZ * 0.16), Math.round(7 * (WIDE ? 1 : 0.8)), mixc(air[1], C("#f4ecd0"), 0.75), mixc(air[0], white, 0.08), mixc(air[1], white, 0.3), 0);
        each(0.04, 90, 60, (x, k, r) => { const s = 9 + r * 12; cloud(x, HZ * (0.18 + 0.4 * hash(k, 3)), s, k, mixc(air[1], air[2], 0.5), mixc(air[0], air[1], 0.4), mixc(air[3], warm, 0.12), true); }, 60, t * 1.2); // low cloud, lit from below by the town
        flock(BIRD_A, BIRD_B, { b: ink }, { n: 5, y: 0.2, every: 37 });
        // the far skyline: flat shapes, a few lights, red lamps on the masts that swell on the kick
        const farC = mixc(tower, air[3], 0.5), farWin = mixc(warm, air[3], 0.45);
        each(0.07, 13, 70, (x, k, r) => {
          const hh = Math.round((8 + r * r * 34) * TALL), wd = 8 + Math.floor(hash(k, 3) * 6);
          box(x, HZ - hh, wd, hh + 1, farC);
          if (hash(k, 4) < 0.25) { box(x + 3, HZ - hh - 7, 1, 7, farC); beacon(x + 3, HZ - hh - 8); }
          for (let j = 0; j < hh / 4 - 1; j++) for (let i = 0; i < wd / 3 - 1; i++) if (hash(k * 131 + j * 17 + i, 5) < 0.16) dot(x + 2 + i * 3, HZ - hh + 3 + j * 4, farWin);
        });
        // the towers: floors light up from the street as their part of the spectrum rises; every window makes up its own mind on a hi-hat
        each(0.18, 25, 80, (x, k, r) => {
          const wd = 13 + Math.floor(hash(k, 2) * 9), hh = Math.round((26 + r * 52) * TALL), top = HZ - hh, kind = hash(k, 6), lev = Math.max(st.eq[((k * 5) % 16 + 16) % 16] * 1.15, st.build * 0.95, clamp(grand * 3)) * (1 - 0.6 * st.wide), win = hash(k, 9) < 0.3 ? cool : warm;
          box(x, top, wd, hh + 1, tower); box(x, top, 2, hh + 1, towerLit); box(x, top, wd, 1, towerLit);
          if (kind < 0.3) { box(x + 3, top - 4, wd - 6, 4, tower); box(x + 3, top - 4, 1, 4, towerLit); } else if (kind < 0.5) { box(x + (wd >> 1), top - 11, 1, 11, tower); beacon(x + (wd >> 1), top - 12); } else if (kind < 0.65) { box(x + 2, top - 6, 5, 5, tower); dome(x + 4, top - 6, 2, 2, towerLit); }
          const rows = Math.floor((hh - 4) / 4), cols = Math.floor((wd - 4) / 3);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const id = k * 977 + j * 31 + i, lit = 1 - j / rows < lev ? hash(id, Math.floor((st.hat + (id % 8)) / 8)) < 0.78 : hash(id, 3) < 0.09; box(x + 3 + i * 3, top + 3 + j * 4, 2, 2, lit ? win : winOff); }
          if (wd >= 17 && hash(k, 7) < 0.6) { // a sign on the roof: dark most of the time; on the drop they come on one after another across the town, and go out again as the drop fades
            const gx = x + ((wd - 16) >> 1), gy = top - (kind < 0.3 ? 21 : 17), order = clamp(x / W) * 10, on = (st.gT > order * st.bl * 0.5 && grand > 0.08 + 0.02 * order) || hash(k, 8) < 0.12, col = signs[((k % 3) + 3) % 3];
            box(gx + 2, gy + 15, 1, 3, steel); box(gx + 13, gy + 15, 1, 3, steel); box(gx, gy, 16, 16, ink);
            if (on) { for (let j = -2; j < 18; j++) for (let i = -2; i < 18; i++) if ((i < 0 || j < 0 || i > 15 || j > 15) && dit(gx + i, gy + j, 0.4)) dot(gx + i, gy + j, mixc(col, ink, 0.45)); }
            put(GLYPH[((k % 6) + 6) % 6], gx + 1, gy + 1, { x: on ? col : mixc(col, ink, 0.8) }, false, 2);
          }
        });
        // the viaduct and its train
        const vy = HZ - 10, k = Math.floor(t / 21), p = (t - k * 21) / 8;
        each(0.35, 28, 90, (x) => { box(x, vy + 2, 3, 9, ink); box(x - 2, vy + 2, 7, 1, ink); }, 10);
        if (p < 1) { const dir = hash(k, 31) < 0.5 ? 1 : -1, x0 = dir > 0 ? lerp(-110, W + 10, p) : lerp(W + 10, -110, p); for (let c = 0; c < 5; c++) put(CAR, x0 + c * 21, vy - 7, { b: steel, w: (c + k) % 3 ? warm : mixc(warm, ink, 0.6), s: towerLit, o: ink }); dot(dir > 0 ? x0 + 104 : x0, vy - 3, white); }
        box(0, vy, W, 2, ink); box(0, vy, W, 1, steel, 0.5);
        water(HZ + 1, waterC, mixc(air[2], cool, 0.3), { deep: 0.2, ripple: 0.8 });
        fall(wet, mixc(air[2], white, 0.3), -40, 150, 2);
        // the roofs in front: tanks, masts, a vent that puffs on the kick, a skylight
        each(1, WIDE ? 84 : 64, 100, (x, kk, r) => {
          const top = H - Math.round((14 + r * 20) * TALL) + st.wide * H * 0.07, wd = 44 + Math.floor(hash(kk, 2) * 22);
          box(x, top, wd, H, ink); box(x + 1, top + 4, wd - 1, H, tower, 0.25); box(x, top, wd, 1, towerLit); box(x, top + 3, wd, 1, tower); box(x, top + 1, 1, H, towerLit); for (let i = 3; i < wd - 12; i += 9) if (hash(kk * 9 + i, 6) < 0.5) box(x + i + 28, top + 9, 4, 5, hash(kk * 9 + i, 7 + Math.floor((st.hat + i) / 8)) < 0.4 ? cool : winOff);
          if (hash(kk, 3) < 0.6) { const tx = x + 6; box(tx + 1, top - 5, 1, 5, ink); box(tx + 8, top - 5, 1, 5, ink); box(tx, top - 15, 10, 10, tower); box(tx, top - 15, 2, 10, towerLit); dome(tx + 5, top - 15, 5, 3, tower); }
          if (hash(kk, 4) < 0.7) { const ax = x + wd - 9; box(ax, top - 26, 1, 26, ink); box(ax - 3, top - 20, 7, 1, ink); box(ax - 2, top - 15, 5, 1, ink); beacon(ax, top - 27); }
          const sx = x + (wd >> 1); box(sx, top - 4, 3, 4, tower); for (let i = 0; i < 3; i++) { const a = (st.sk / st.bl + i) / 3; if (a < 1 && st.wide < 0.5) disc(sx + 1 + a * 5, top - 6 - a * 14, 1 + 3 * a, mixc(air[2], white, 0.25), 0.55 * (1 - a)); }
          if (hash(kk, 5 + Math.floor((st.hat + kk) / 6)) < 0.6) box(x + 22, top + 4, 6, 3, warm); else box(x + 22, top + 4, 6, 3, winOff);
        }, 70);
      } };
    })();

    // Cinder (hardcore, gabber, hardstyle): a volcano over a lake of lava, forge stacks whose flames jump on the kick; on the drop it erupts.
    WORLDS.cinder = (() => {
      const SKY = [["#1a0a14", "#4a1220", "#a02a1e", "#f0702a"], ["#050207", "#14060f", "#380c14", "#861e16"], ["#0d0b10", "#1e181c", "#3a2a28", "#6a3a2a"], ["#12060e", "#3a0e1c", "#8a2030", "#e0603a"]].map((r) => r.map(C));
      const NIGHT = [0.4, 1, 0.8, 0.5];
      const basalt = C("#08060c"), rockC = C("#170d14"), rockLit = C("#5c1d1c"), lava = [C("#2a0a10"), C("#a01a12"), C("#f0541a"), C("#ffc23a"), C("#fff3b0")], smoke = C("#241b24"), ash = C("#8a7f85"), SPAN = Math.round(W * 1.5), AT = 40 + Math.round(W * 0.64) - SPAN / 2, FOOT = Math.min(130, W * 0.62);
      const cone = (x) => { const d = Math.abs(((((x - AT) % SPAN) + SPAN) % SPAN) - SPAN / 2), body = d < FOOT ? 64 * TALL * (1 - d / FOOT) ** 1.55 : 0; return Math.max(body - (d < 8 ? (8 - d) * 0.7 + 3 : 0), 0) + 4 * noise(x * 0.11, 2) + 3; };
      const crag = (x) => 5 + 24 * (1 - Math.abs(2 * noise(x * 0.035, land + 4) - 1)) * noise(x * 0.01, land + 6) + 4 * noise(x * 0.3, 8);
      return { SKY, NIGHT, draw() {
        const t = st.t, off = Math.floor(st.cam * 0.04), vx = Math.round(AT + SPAN / 2 + SPAN * Math.round((off + W / 2 - SPAN / 2 - AT) / SPAN) - off), top = HZ - Math.round(cone(vx + off)) - 1, heat = clamp(0.25 + 0.35 * st.sw + 0.5 * grand + 0.3 * st.build - 0.35 * st.wide);
        // a dull red sun behind bars of smoke; its halo swells on the kick
        const sx = Math.round(W * (1 - moonAt) + 6), sy = Math.round(HZ * 0.24), sr = Math.round(11 * (WIDE ? 1 : 0.85));
        disc(sx, sy, sr + 4 + 5 * st.kick, mixc(air[1], lava[1], 0.6), 0.25); disc(sx, sy, sr, mixc(lava[2], air[2], 0.25)); disc(sx - 2, sy - 2, sr - 4, mixc(lava[3], air[3], 0.4), 0.5);
        for (let i = 0; i < 3; i++) box(sx - sr - 2, sy - 4 + i * 5 + Math.round(Math.sin(t * 0.2 + i) * 1.5), sr * 2 + 5, 2, air[1], 0.75);
        each(0.05, 80, 20, (x, k, r) => cloud(x, HZ * (0.12 + 0.45 * hash(k, 3)), 8 + r * 13, k, mixc(smoke, air[2], 0.35), mixc(smoke, air[0], 0.4), mixc(smoke, lava[1], 0.55), true), 60, t * 1.5);
        flock(BIRD_A, BIRD_B, { b: basalt }, { n: 9, y: 0.3, every: 31, spread: 8 });
        // the mountain: its plume, the glow in its mouth (kick), the streams down its sides
        for (let i = 0; i < 12; i++) { const a = (t * 0.06 + i / 12) % 1, r = 3 + a * 12 * TALL, x = vx + a * a * 60 + 5 * Math.sin(i * 2.4 + a * 4), y = top - 5 - a * HZ * 0.55, l = a > 0.75 ? (1 - a) * 4 : 1; disc(x - 1, y + 1, r, mixc(smoke, lava[1], 0.6 * (1 - a) + 0.3 * grand), l); disc(x + 1, y - 1, r - 1, mixc(smoke, air[1], a * 0.6), l); }
        disc(vx, top, 7 + 5 * st.kick + 7 * st.build + 8 * grand, lava[2], 0.3); disc(vx, top + 1, 4 + 2 * st.kick + 4 * grand, lava[3], 0.6);
        if (grand > 0) { // the eruption: a pillar of fire, and bombs thrown out one after another
          const hc = HZ * 0.55 * Math.sqrt(grand) * Math.min(1, st.gT * 3) * (0.75 + 0.25 * noise(t * 5, 3));
          for (let j = 0; j < hc; j++) { const wd = 1 + 6 * (1 - j / hc) ** 0.7, wob = Math.sin(j * 0.35 + t * 8) * (1 + j * 0.04); box(vx - wd + wob, top - j, wd * 2 + 1, 1, lava[2], j > hc * 0.7 ? 0.6 : 1); box(vx - wd * 0.6 + wob, top - j, wd * 1.2 + 1, 1, lava[3], j > hc * 0.55 ? 0.5 : 1); if (j < hc * 0.4) box(vx - wd * 0.25 + wob, top - j, wd * 0.5 + 1, 1, lava[4]); }
          for (let i = 0; i < 18; i++) { const a = st.gT - i * st.bl * 0.5; if (a <= 0) continue; const bvx = (hash(i, 41) - 0.5) * 80, bvy = -(50 + hash(i, 42) * 40) * TALL; for (let s = 0; s < 4; s++) { const q = a - s * 0.05, bx = vx + bvx * q, by = top - 6 + bvy * q + 30 * q * q; if (q > 0 && by < HZ - 2) box(bx, by, s ? 1 : 2, s ? 1 : 2, lava[4 - s]); } }
        }
        ridge(cone, 0.04, HZ, mixc(rockC, air[2], 0.18), mixc(rockLit, air[3], 0.25), { litDeep: 100, to: HZ + 2 });
        for (let side = -1; side <= 1; side += 2) for (let s = 0; s < 3; s++) {
          const reach = Math.min(FOOT - 6, (22 + s * 16 + (40 + s * 14) * clamp(st.gT / 5) * clamp(grand * 4)) * (s === 1 && side < 0 ? 0.6 : 1));
          for (let d = 3; d < reach; d++) { const x = vx + side * d, y = HZ - cone(x + off) + d * (0.12 + 0.42 * s) + Math.sin(d * 0.5 + s) * 0.8; if (y < HZ) box(x, y, 1, 2, d > reach - 4 ? lava[3] : heat > 0.5 || s === 0 ? lava[2] : lava[1]); }
        }
        ridge(crag, 0.15, HZ + 1, mixc(rockC, air[1], 0.1), mixc(rockLit, air[2], 0.1), { litDeep: 3, to: HZ + 2 });
        // the forge: stacks whose flames jump on every kick, a hall whose slits change on the hi-hats
        each(0.3, 150, 50, (x, k, r) => {
          box(x, HZ - 9, 44, 10, basalt); box(x, HZ - 9, 44, 1, rockLit); for (let i = 0; i < 6; i++) box(x + 4 + i * 7, HZ - 5, 3, 2, hash(k * 9 + i, Math.floor((st.hat + i) / 4)) < 0.6 ? lava[2] : lava[0]);
          for (let i = 0; i < 2 + (r > 0.5); i++) { const cx = x + 6 + i * 15, ch = Math.round((20 + hash(k * 3 + i, 4) * 20) * TALL); box(cx, HZ - ch, 5, ch, basalt); box(cx, HZ - ch, 1, ch, rockLit); box(cx - 1, HZ - ch, 7, 2, basalt); flame(cx + 2, HZ - ch - 1, 2 + (8 + 5 * grand) * st.kick * (1 - 0.6 * st.wide), [lava[2], lava[3], lava[4]]); }
        }, 60);
        // the lake: a crust with glowing cracks that widen with the bass
        for (let y = HZ + 1; y < H; y++) {
          const d = y - HZ, sx2 = 0.11 * (16 / (d + 14)), v = Math.log(1 + d / 7) * 2.6 - t * 0.03, row = y * W;
          for (let x = 0; x < W; x++) { const n = Math.abs(noise2((x - W / 2) * sx2 + st.cam * 0.01, v, 5) - 0.5) + 0.05 + (M[(x & 3) | ((y & 3) << 2)] - 8) * 0.0022; B[row + x] = n < 0.02 + heat * 0.035 ? lava[3] : n < 0.05 + heat * 0.07 ? lava[2] : n < 0.09 + heat * 0.1 ? lava[1] : n < 0.2 ? lava[0] : basalt; }
        }
        box(0, HZ + 1, W, 1, mixc(lava[1], basalt, 0.4));
        // embers rise (faster through a build); in a break ash falls instead
        for (let i = 0, n = Math.round(W * 0.2 * (0.4 + st.inten) * (1 - 0.8 * st.wide)); i < n; i++) { const f = hash(i, 61), y = H - ((st.up * (9 + 18 * f) + hash(i, 62) * 700) % (H * 0.95)), x = (((hash(i, 63) * W * 1.3 - st.cam * 0.5 + 6 * Math.sin(t * 0.8 + i)) % W) + W) % W; dot(x, y, y < HZ * 0.7 ? lava[2] : (i + st.hat) % 4 ? lava[3] : lava[4]); }
        fall(Math.max(st.wide, 0.6 * clamp(noise(t / 40, 3) * 2 - 0.9 + (weather - 1) * 0.6)) * 0.5, mixc(ash, air[2], 0.3), 5, 11);
        // basalt columns in front, lit from the lake
        const lift = st.wide * H * 0.07;
        const cOff = Math.floor(st.cam), colH = (q) => Math.round((3 + 50 * Math.max(0, noise(q * 0.11, 5) - 0.32) + 7 * hash(q, 6)) * TALL - lift), rim = mixc(rockLit, lava[1], 0.3 + 0.5 * heat);
        for (let k = Math.floor(cOff / 10) - 1; k * 10 - cOff < W; k++) { const x = k * 10 - cOff, hh = colH(k), y = H - hh; box(x, y, 10, hh, basalt); box(x + 1, y, 8, 1, rockLit); box(x + 2, y + 1, 7, 2, rockC); if (colH(k - 1) < hh) box(x, y + 1, 1, hh - colH(k - 1), rim); for (let j = 9; j < hh; j += 11) box(x + 3 + (j % 4), y + j, 4, 1, rockC); }
      } };
    })();

    // Acid: a marsh below a chemical works, under a dripping moon; reeds that are the spectrum, bubbles, a frog; on the drop the pools throw up geysers.
    WORLDS.acid = (() => {
      const SKY = [["#1c2812", "#46561a", "#9aa41c", "#e2de3c"], ["#050e0b", "#0a2418", "#1a5a2a", "#5c9a2c"], ["#030808", "#081a14", "#124030", "#2f7a48"], ["#0b1813", "#1e4829", "#66962a", "#d6de5e"]].map((r) => r.map(C));
      const NIGHT = [0.25, 0.9, 1, 0.5];
      const lime = C("#b6ff3c"), yel = C("#f4f04a"), dk = C("#05100b"), g2 = C("#16482a"), g3 = C("#3f8f2c"), rust = C("#7a4420"), pink = C("#ff4fb0"), cream = C("#f6ffd0"), waterC = C("#030d07");
      const FROG = [["...........oooo.....", "..........oywkoo....", "......oooooGkkGGo...", "....ooGGGGGGGGGGGGo.", "...oGGGGGGGgggGpppo.", "..oGGGGGGGggggpppo..", ".oGGGGGGggggggooo...", ".oGGgooogggggggo....", "oGGgoGGGoggggggo....", "oggoGGgggoogggo.....", ".oooGgooggo.ogGo....", "..oGGGGoooo.oGGGGo.."],
        ["...........oooo.....", "..........oywkoo....", "......oooooGkkGGoo..", "....ooGGGGGGGGGGGppo", "...oGGGGGGGgggGppppo", "..oGGGGGGGggggpppppo", ".oGGGGGGggggggopppo.", ".oGGgooogggggggooo..", "oGGgoGGGoggggggo....", "oggoGGgggoogggo.....", ".oooGgooggo.ogGo....", "..oGGGGoooo.oGGGGo.."]];
      return { SKY, NIGHT, draw() {
        const t = st.t, sc = SC, wk = mixc(dk, air[2], 0.3), wkLit = mixc(dk, air[3], 0.6);
        stars(Math.round(W * 0.25), (ni - 0.4) * 1.2, mixc(air[1], lime, 0.35), cream, HZ * 0.7);
        // the moon drips: a drop swells for six beats, falls for two, and rings the water where it lands
        const mx = Math.round(W * moonAt), my = Math.round(HZ * 0.24), mr = Math.round(14 * sc), moonC = mixc(yel, lime, 0.35), dn = ((st.beat % 8) + Math.min(1, st.sk / st.bl)) / 8;
        moon(mx, my, mr, moonC, mixc(moonC, g3, 0.45), mixc(air[1], lime, 0.4), 0);
        disc(mx - mr * 0.3, my - mr * 0.3, mr * 0.45, mixc(moonC, cream, 0.5), 0.5);
        if (dn < 0.75) box(mx - 1, my + mr - 1, 2, 2 + dn * 9, moonC); else box(mx - 1, my + mr + 8 + ((dn - 0.75) / 0.25) ** 2 * (HZ - my - mr - 8), 2, 3, moonC);
        each(0.05, 110, 20, (x, k, r) => cloud(x, HZ * (0.2 + 0.4 * hash(k, 3)), 7 + r * 9, k, mixc(air[2], lime, 0.25), mixc(air[1], air[2], 0.6), mixc(air[1], air[0], 0.5)), 60, t * 0.9);
        flock(BIRD_A, BIRD_B, { b: dk }, { n: 3, y: 0.45, every: 23, spread: 13 });
        // the works on the far shore: tanks, a flare stack that licks up on the hi-hats, lamps
        each(0.1, 150, 30, (x, k, r) => {
          disc(x + 12, HZ - 18, 11, wk); for (let j = -11; j <= 11; j++) { const half = Math.floor(Math.sqrt(121 - j * j)); box(x + 12 - half, HZ - 18 + j, Math.max(1, half * 0.35), 1, wkLit); } box(x + 4, HZ - 9, 2, 10, wk); box(x + 18, HZ - 9, 2, 10, wk); box(x + 1, HZ - 18, 22, 1, wk); // a ball tank on legs
          const th = Math.round((40 + r * 22) * TALL); box(x + 34, HZ - th, 6, th + 1, wk); box(x + 34, HZ - th, 2, th + 1, wkLit); for (let j = 6; j < th; j += 8) box(x + 32, HZ - j, 10, 1, wk); box(x + 42, HZ - th + 6, 1, th - 6, wk); flame(x + 37, HZ - th - 1, 4 + 5 * st.he + 10 * grand, [g3, lime, cream]); // a column with a flare that licks up on the hi-hats
          for (let i = 0; i < 2; i++) { const tx = x + 52 + i * 21; box(tx, HZ - 20, 17, 21, wk); dome(tx + 8, HZ - 20, 8, 4, wk); box(tx, HZ - 20, 3, 21, wkLit); box(tx, HZ - 12, 17, 1, mixc(wk, dk, 0.5)); }
          for (let j = 0; j < 30 * TALL; j++) { const u = j / (30 * TALL), half = Math.round(10 - 4 * Math.sin(u * Math.PI * 0.8)); box(x + 108 - half, HZ - j, half * 2, 1, wk); box(x + 108 - half, HZ - j, 3, 1, wkLit); } // a cooling tower that breathes out a puff on each kick
          for (let i = 0; i < 3; i++) { const a = (st.sk / st.bl + i) / 3; if (a < 1) disc(x + 108 + a * 8, HZ - 30 * TALL - 3 - a * 16, 2 + 5 * a, mixc(air[2], cream, 0.3), 0.6 * (1 - a)); }
          box(x + 23, HZ - 6, 86, 2, wk); box(x + 40, HZ - 12, 60, 1, wk);
          for (let i = 0; i < 7; i++) if (hash(k * 7 + i, Math.floor((st.hat + i) / 4)) < 0.6) dot(x + 6 + i * 17, HZ - 3 - (i % 3) * 6, yel);
        }, 130);
        // a pipeline on stilts: each joint lets a drop go on a kick, and it lands on the next
        const py = HZ - 9, pipe = mixc(dk, air[1], 0.2);
        box(0, py, W, 2, pipe); box(0, py, W, 1, mixc(g2, air[2], 0.3), 0.5);
        each(0.25, 44, 90, (x, k) => { box(x, py + 2, 2, 8, pipe); const jx = x + 20, ph = st.sk / st.bl, turnN = (((st.beat + k) % 4) + 4) % 4; box(jx - 1, py - 1, 3, 5, rust); dot(jx - 1, py - 1, mixc(rust, yel, 0.4)); if (turnN === 0) box(jx, py + 4 + Math.min(1, ph) ** 2 * 6, 1, 2, lime); if (turnN === 1 && ph < 1.6) ring(jx, HZ + 4, 2 + 7 * ph, lime, 0.9 - ph * 0.5, 0.3); }, 10);
        // on the drop: the pools throw up geysers, one after another across the marsh
        if (grand > 0) for (let i = 0; i < 5; i++) {
          const a = st.gT - i * st.bl * 0.5, gx = Math.round(W * (0.1 + 0.2 * i)); if (a <= 0) continue;
          const hg = HZ * 0.78 * (0.6 + 0.4 * hash(i, 3)) * Math.min(1, a * 2.5) * grand ** 0.6 * (0.92 + 0.08 * Math.sin(t * 11 + i));
          for (let j = 0; j < hg; j++) { const wd = 1 + 2.5 * (1 - j / hg), wob = Math.round(Math.sin(j * 0.3 + t * 7 + i) * (j / hg) * 1.5); box(gx - wd + wob, HZ - j, wd * 2 + 1, 1, g3); box(gx - wd + 1 + wob, HZ - j, wd * 2 - 1, 1, j > hg * 0.75 ? cream : lime); }
          for (let j = 0; j < 14; j++) { const q = (t * 0.9 + hash(j, i + 7)) % 1; dot(gx + (hash(j, i + 8) - 0.5) * 34 * q, HZ - hg - 5 * Math.sin(q * Math.PI) + hg * 0.5 * q * q, j % 3 ? lime : cream); }
        }
        if (dn < 0.2) ring(mx, HZ + 2, 3 + 60 * dn, moonC, 0.8 - dn * 3, 0.3);
        water(HZ + 1, waterC, mixc(g2, lime, 0.45), { deep: 0.25, few: 0.965 });
        if (st.wide > 0.05) for (let y = HZ - 10; y < HZ + 8; y++) for (let x = 0; x < W; x++) if (dit(x, y, st.wide * 0.75 * (1 - Math.abs(y - HZ + 1) / 9) * (0.3 + noise((x + t * 3) * 0.03 + y * 0.11, 12)))) B[y * W + x] = mixc(B[y * W + x], mixc(air[3], cream, 0.3), 0.7); // in a break, mist lies on the water in drifts
        // bubbles drift up out of the marsh, more of them through a build
        for (let i = 0, n = Math.round(5 + 4 * st.inten + 12 * st.build); i < n; i++) {
          const f = hash(i, 71), y = H - ((t * (5 + 9 * f) + hash(i, 72) * 900) % (H + 30)) + 10, x = (((hash(i, 73) * W * 1.4 - st.cam * 0.6) % W) + W) % W + 5 * Math.sin(t * 0.7 + i), r = 2 + Math.floor(f * 3.5) + ((i + st.hat) % 4 === 0 && st.he > 0.5 ? 1 : 0);
          ring(x, y, r, y < HZ ? mixc(lime, air[2], 0.3) : lime);
          dot(x - r * 0.4, y - r * 0.4, cream);
        }
        // reeds: their height is the spectrum laid across the marsh
        const off = Math.floor(st.cam * 0.8), base = H + st.wide * H * 0.05;
        for (let x = -4; x < W + 4; x++) {
          const k = x + off;
          if (((k % 4) + 4) % 4 || hash(k, 3) > 0.8) continue;
          const big = hash(k, 5) < 0.35, hh = Math.round((6 + 12 * hash(k, 4) + 22 * band(x) * (big ? 1 : 0.6)) * TALL), lean = Math.sin(t * 1.2 + k * 0.13) * (1 + 3.5 * st.bs), c = big ? mixc(g3, air[1], 0.35) : mixc(dk, g2, 0.55);
          for (let j = 0; j < hh; j++) { const xo = x + Math.round(lean * (j / hh) ** 2); dot(xo, base - j, c); if (big && j < hh * 0.5) dot(xo + 1, base - j, mixc(dk, g2, 0.55)); }
          const tx = x + Math.round(lean);
          if (big) { box(tx, base - hh, 2, 5, rust); dot(tx, base - hh - 2, c); dot(tx, base - hh - 1, c); dot(tx, base - hh, mixc(rust, yel, 0.5)); } else if (band(x) > 0.6) dot(tx, base - hh, lime);
        }
        // a frog on a lily pad, its throat swelling on the kick
        each(1, Math.round(Math.max(130, Math.min(250, W * 0.8))), 95, (x, k) => { const y = H - Math.round(15 * TALL) + st.wide * H * 0.05; box(x - 6, y, 32, 2, g3); box(x - 4, y + 2, 28, 1, g2); box(x - 6, y, 10, 1, lime); put(FROG[st.kick > 0.45 ? 1 : 0], x, y - 12, { o: dk, G: g3, g: mixc(g3, lime, 0.55), y: yel, w: cream, k: dk, p: mixc(cream, pink, 0.35 + 0.3 * st.kick) }, k % 2 === 0); }, 40);
      } };
    })();

    // Psy (psytrance, goa): a garden of giant mushrooms under a ringed planet, colors that turn; on the drop a mandala opens around the planet.
    WORLDS.psy = (() => {
      const SKY = [["#170a36", "#461a76", "#aa3a96", "#fa8a5c"], ["#040a20", "#0a2048", "#0e4a6a", "#1a8684"], ["#0a0418", "#2a0a48", "#6a1070", "#bc308a"], ["#1a0a30", "#5a1a5a", "#bc504c", "#fcc064"]].map((r) => r.map(C));
      const NIGHT = [0.5, 1, 0.9, 0.4];
      const ink = C("#090420"), CAPS = [C("#ff3fa4"), C("#ff9a2e"), C("#2ee6d6"), C("#a65cff")], cream = C("#fff2c8"), stemC = C("#d9c9ea"), stemSh = C("#6c4c9c"), moss = C("#3cffb0");
      const RAY_A = ["mm...........mm", ".mmm.......mmm.", "..mmmm...mmmm..", "...mmmmmmmmm...", "....mwmmmwm....", "......mmm......", ".......t.......", ".......t......."], RAY_B = ["...............", "......mmm......", "..mmmmmmmmmmm..", ".mmmmwmmmwmmmm.", "mmm...mmm...mmm", "m......t......m", ".......t.......", "..............."];
      let mist = null, mistOf = 0, mistUnder = -1, mistOver = 0;
      function shroom(x, base, h, r, cap, k, flat, sway, glow) { // flat: one dark color for the ones far off
        const lean = (hash(k, 3) - 0.5) * h * 0.35, wd = Math.max(1, Math.round(r * 0.2));
        for (let j = 0; j < h; j++) { const u = j / h, sx = x + Math.round((lean + sway) * u * u); box(sx - wd, base - j, wd * 2 + 1, 1, flat || stemSh); if (!flat) box(sx - wd, base - j, wd, 1, stemC); }
        const tx = x + Math.round(lean + sway), ty = base - h, ry = Math.round(r * 0.62);
        if (flat) { dome(tx, ty + 2, r, ry, flat); box(tx - r + 2, ty + 3, r * 2 - 3, 1, mixc(flat, cap, 0.5 + 0.4 * glow)); return; }
        dome(tx, ty + 2, r, ry, mixc(cap, ink, 0.55)); dome(tx - 1, ty + 1, r - 2, ry - 2, cap); dome(tx - r * 0.3, ty - ry * 0.35, r * 0.4, ry * 0.3, mixc(cap, cream, 0.45));
        box(tx - r + 2, ty + 3, r * 2 - 3, 1, mixc(stemSh, cream, 0.3 + 0.7 * glow)); box(tx - r + 4, ty + 4, r * 2 - 7, 1, stemSh);
        for (let i = 0, n = 3 + Math.floor(r / 5); i < n; i++) { const a = (i + 0.5) / n * Math.PI, q = 0.35 + 0.5 * hash(k * 7 + i, 4); disc(tx - Math.cos(a) * r * q * 1.05, ty + 1 - Math.sin(a) * ry * q, 0.8 + r * 0.07 * (1 + hash(k * 7 + i, 5)) + ((k + st.beat) % 2 ? 0 : st.kick * 1.3), mixc(cream, cap, 0.25 * (1 - glow))); } // the spots swell on the kick, every other mushroom in turn
      }
      return { SKY, NIGHT, draw() {
        const t = st.t, sc = WIDE ? SC : 0.75, hue = t * 5 + grand * 60, caps = CAPS.map((c) => turnOf(c, hue)), glow = clamp(0.25 + 0.5 * st.bs + grand);
        stars(Math.round(W * 0.6), 0.3 + ni * 0.7, mixc(air[2], cream, 0.4), cream, HZ * 0.9);
        if (mistOf !== land) { mistOf = land; mist = mist || new Uint8Array(W * Math.ceil(H * 0.56)); for (let y = 0; y < H * 0.56; y++) for (let x = 0; x < W; x++) { const v = noise2(x * 0.02 + y * 0.03, y * 0.045 - x * 0.012, 9 + land); mist[y * W + x] = v > 0.56 ? Math.min(16, (v - 0.56) * 35) : 0; } } // a band of mist across the stars: its shape is worked out once, its color turns with the rest
        mistUnder = -1;
        for (let y = 0, to = Math.min(HZ * 0.8, H * 0.56); y < to; y++) for (let x = 0; x < W; x++) { const l = mist[y * W + x]; if (l && M[(x & 3) | ((y & 3) << 2)] < l) { const under = B[y * W + x]; if (under !== mistUnder) { mistUnder = under; mistOver = mixc(under, caps[3], 0.35); } B[y * W + x] = mistOver; } } // (the sky under it has a handful of colors: each is mixed once, not for every dot)
        // the planet: its rings, and on each kick a ripple that runs out along the ring's plane
        const px = Math.round(W * (1 - moonAt) + 8), py = Math.round(HZ * 0.3), pr = Math.round(19 * sc), pc = [turnOf(C("#ffb46a"), hue * 0.3), turnOf(C("#e0607a"), hue * 0.3), turnOf(C("#7a3a8a"), hue * 0.3)];
        if (grand > 0) { // the mandala: three rings of petals that turn against each other
          const R = Math.min(HZ * 0.95, W * 0.6) * eased(clamp(st.gT / 1.6)), rot = t * 0.22, N = [6, 10, 16], F = [0.5, 0.76, 1];
          for (let m = 0; m < 3; m++) for (let i = 0, steps = Math.ceil(R * F[m] * 9); i < steps; i++) { // each petal line with a glow that thins out inward
            const a = (i / steps) * TAU, Rm = R * F[m] * (0.72 + 0.28 * Math.abs(Math.cos(N[m] * 0.5 * (a + rot * (m % 2 ? -1 : 1))))), ca = Math.cos(a), sa = Math.sin(a);
            for (let g = 0; g < 5; g++) { const rr = Rm - g * 1.6, x = Math.round(px + ca * rr), y = Math.round(py + sa * rr); if (rr > pr + 2 && y >= 0 && y < HZ && x >= 0 && x < W && dit(x, y, grand * (g ? 0.8 - g * 0.17 : 2.5))) B[y * W + x] = mixc(B[y * W + x], caps[m], g ? 0.45 : 0.9); }
          }
        }
        ring(px, py, pr * 1.95, pc[0], 1, 0.3, -0.35, Math.PI, TAU); ring(px, py, pr * 1.7, pc[1], 1, 0.3, -0.35, Math.PI, TAU);
        for (let j = -pr; j <= pr; j++) { const half = Math.floor(Math.sqrt(pr * pr - j * j) + 0.35); for (let i = -half; i <= half; i++) { const bandN = Math.max(0, Math.floor((j + pr + 2 * Math.sin(i * 0.2)) / (pr / 3.2))) % 3, shade = i * 0.9 + j * 0.45 - pr * 0.25; dot(px + i, py + j, shade > 0 && dit(px + i, py + j, shade / (pr * 0.5)) ? mixc(pc[2], ink, 0.6) : pc[bandN]); } }
        ring(px, py, pr * 1.95, pc[0], 1, 0.3, -0.35, 0, Math.PI); ring(px, py, pr * 1.7, pc[1], 1, 0.3, -0.35, 0, Math.PI);
        for (let i = 0; i < 2; i++) { const a = (st.sk / st.bl + i) / 2; if (a < 1 && st.wide < 0.6) ring(px, py, pr * 2.2 + a * pr * 2.6, caps[2], 0.7 * (1 - a), 0.3, -0.35); }
        disc(px + pr * 2.7, py - pr * 0.9, 3 * sc + 1, cream); disc(px + pr * 2.7 + 1, py - pr * 0.9 + 1, 3 * sc, mixc(cream, air[1], 0.5));
        flock(RAY_A, RAY_B, { m: mixc(caps[2], air[1], 0.25), w: cream, t: caps[2] }, { n: 3, y: 0.42, every: 29, takes: 22, spread: 17 });
        // far off: stepped temples on low domes of hills
        const hillC = mixc(ink, air[3], 0.42);
        ridge((x) => 6 + 22 * fbm(x * 0.008, land + 2) ** 1.5, 0.08, HZ + 2, hillC, mixc(hillC, air[3], 0.35), { litDeep: 3, to: HZ + 12 });
        each(0.08, 210, 30, (x, k, r) => {
          const n = 4 + Math.floor(r * 3), tc = mixc(ink, air[3], 0.5), tl = mixc(ink, air[3], 0.75), up = Math.round(7 * TALL);
          for (let i = 0; i < n; i++) { const wd = Math.round(60 - i * (48 / n)); box(x - wd / 2, HZ - up * (i + 1) + 2, wd, up, tc); box(x - wd / 2, HZ - up * (i + 1) + 2, wd * 0.3, up, tl); box(x - wd / 2, HZ - up * (i + 1) + 2, wd, 1, tl); }
          const ty = HZ - up * n + 2;
          box(x - 2, ty - 9, 5, 9, tc);
          box(x - 2, ty - 9, 2, 9, tl);
          dot(x, ty - 11, cream);
          disc(x, ty - 11, 1 + 2.5 * st.kick, caps[1], 0.4);
          box(x - 3, HZ - 8, 6, 10, ink);
          box(x - 1, ty - 6, 2, 3, st.hat % 2 ? caps[1] : ink);
        }, 50);
        // the wood: dark mushrooms behind, big spotted ones in front that sway with the bass
        const farCap = mixc(ink, air[2], 0.28), ground = H - Math.round(13 * TALL) + st.wide * H * 0.06;
        const hop = Math.min(1, st.kick), hopOf = (k, most) => Math.round(hop * most * TALL * ((k + st.beat) % 2 ? 0.35 : 1)); // on the kick the mushrooms stand up a little taller and sink back, every other one in turn
        each(0.22, 34, 44, (x, k, r) => shroom(x, HZ + 6, Math.round((16 + r * 30) * TALL) + hopOf(k, 1.5), Math.round((6 + Math.floor(hash(k, 2) * 9)) * SC), caps[((k % 4) + 4) % 4], k, farCap, 0, glow), 30);
        ridge((x) => 3 + 7 * fbm(x * 0.015, land + 40), 0.35, HZ + 8, mixc(ink, air[2], 0.12), mixc(ink, air[2], 0.3), { litDeep: 1 });
        for (let y = HZ + 9; y < H; y++) for (let x = 0; x < W; x++) if (hash(x + st.cam * 0.6 * ((y - HZ) / (H - HZ)) | 0, y) < 0.04) dot(x, y, band(x) > hash(x * 31 + y, 8) ? mixc(moss, air[2], 0.3) : mixc(ink, moss, 0.22)); // moss lights: the spectrum picks which glow
        each(0.55, WIDE ? 74 : 60, 55, (x, k, r) => { if (r < 0.8) shroom(x, ground + 6, Math.round((34 + r * 50) * TALL) + hopOf(k, 3 + 3 * r), Math.round((11 + Math.floor(hash(k, 2) * 12)) * (WIDE ? SC : 1)), caps[((k % 4) + 4) % 4], k, 0, Math.sin(t * 0.8 + k) * (1 + 4 * st.bs), glow); }, 40);
        ridge((x) => 5 + 9 * fbm(x * 0.03, land + 30), 1, ground + 10, ink, null, { tex: (x, y, wx) => {
          if (wx % 7 === 0 && hash(wx, 2) < 0.6) { const fh = 5 + Math.floor(hash(wx, 3) * 7), sw = Math.round(Math.sin(t + wx) * st.bs * 2); for (let j = 0; j < fh; j++) dot(x + (j > fh - 3 ? sw : 0), y - j, ink); for (let i = 0; i < 7; i++) dot(x + sw + Math.cos(i * 0.9) * (2.5 - i * 0.3), y - fh + Math.sin(i * 0.9) * (2.5 - i * 0.3), i > 4 ? moss : ink); }
        } });
        // spores rise from the caps and, through a build, draw together toward the planet
        for (let i = 0, n = Math.round(W * 0.17 * (0.5 + st.inten)); i < n; i++) {
          const f = hash(i, 81), up = (st.afloat * (5 + 9 * f) + hash(i, 82) * 600) % (H * 0.9), y = H * 0.88 - up;
          let x = (((hash(i, 83) * W * 1.3 - st.cam * 0.5) % W) + W) % W + 5 * Math.sin(t * 0.9 + i);
          x = lerp(x, px, st.build * 0.85 * clamp(up / (H * 0.8)));
          dot(x, y, (i + st.hat) % 5 === 0 && st.he > 0.3 ? cream : caps[i % 4]);
        }
      } };
    })();

    // Pier (house, disco): a boardwalk at sunset, a big wheel that turns with the beat, strings of bulbs, palms; on the drop, fireworks.
    WORLDS.pier = (() => {
      const SKY = [["#2a3a7c", "#7a5a9c", "#f08a6a", "#ffd27a"], ["#1a1648", "#5a2a78", "#d04a7a", "#ff9a5a"], ["#060a24", "#0e1640", "#1c2a5e", "#3a3a7a"], ["#1c2a5a", "#5a5a9a", "#e8a0a0", "#ffe0a0"]].map((r) => r.map(C));
      const NIGHT = [0, 0.5, 1, 0.5];
      const ink = C("#150a26"), wood = C("#4a2a3a"), bulbs = [C("#ff5fa2"), C("#ffe066"), C("#5fe0e6"), C("#fff4d6")], steel = C("#8a7aa8"), palm = C("#143a34"), palmLit = C("#2f7a5a"), white = C("#fff8ea"), waterC = C("#0a0c2a");
      function wheel(cx, deck, R, night) { // one turn in thirty-two beats; the rim's bulbs step round on the hi-hats
        const cy = deck - R - 5, a0 = (st.bc / 32) * TAU, frame = mixc(steel, ink, 0.3 + 0.4 * night);
        line(cx, cy, cx - R * 0.6, deck, ink); line(cx, cy, cx + R * 0.6, deck, ink); line(cx + 1, cy, cx - R * 0.6 + 1, deck, ink);
        ring(cx, cy, R, frame); ring(cx, cy, R - 3, mixc(frame, ink, 0.4));
        for (let i = 0; i < 8; i++) { const a = a0 + (i * TAU) / 8; line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, mixc(frame, ink, 0.4)); }
        for (let i = 0; i < 8; i++) { const a = a0 + (i * TAU) / 8, gx = Math.round(cx + Math.cos(a) * R), gy = Math.round(cy + Math.sin(a) * R); box(gx - 2, gy + 1, 5, 4, bulbs[i % 3]); box(gx - 2, gy + 1, 5, 1, ink); box(gx - 1, gy + 2, 3, 1, mixc(white, ink, 0.2 + 0.5 * (1 - night))); }
        for (let i = 0; i < 16; i++) { const a = a0 + ((i + 0.5) * TAU) / 16, on = grand > 0.08 || (i + st.hat) % 4 === 0; dot(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1), on ? white : mixc(bulbs[1], ink, 0.6)); }
        disc(cx, cy, 2, white); disc(cx, cy, 3 + 2 * st.kick, bulbs[1], 0.3);
      }
      function palmTree(x, base, h, sway, body, lit) {
        const lean = (hash(h, 3) - 0.5) * h * 0.5;
        for (let j = 0; j < h; j++) { const sx = x + Math.round(lean * (j / h) ** 1.6); box(sx - 1, base - j, j > h * 0.6 ? 2 : 3, 1, j % 4 ? body : lit); }
        const tx = x + Math.round(lean), ty = base - h;
        for (let f = 0; f < 9; f++) { const a = Math.PI * (1.04 + f * 0.115), L = h * (0.36 + 0.1 * hash(f, h)); for (let s = 0; s < L; s++) { const fx = tx + Math.cos(a) * s * 1.1, fy = ty + Math.sin(a) * s * 0.6 + s * s * (0.62 / L) + sway * (s / L) ** 2, hang = 1 + Math.round(3 * Math.sin((s / L) * Math.PI)); box(fx, fy, 1, 2, f < 4 ? lit : body); if (s % 2 === 0) box(fx, fy + 2, 1, hang, body); } }
        disc(tx, ty + 1, 2, body);
      }
      return { SKY, NIGHT, draw() {
        const t = st.t, sc = SC, d = day, alt = Math.max(-0.6, Math.min(1, d < 0.5 ? 1 - d / 0.36 : (d - 0.86) / 0.14));
        stars(Math.round(W * 0.4), (ni - 0.35) * 1.5, mixc(air[1], white, 0.5), white, HZ * 0.8);
        // the sun goes down into the sea as the song goes on, and a moon comes up; whichever is there swells on the kick
        const sx = Math.round(W * moonAt), sy = Math.round(HZ - 2 - alt * HZ * 0.42), sr = Math.round(15 * sc), sunC = mixc(C("#ff5a4a"), C("#fff0a0"), clamp(alt * 1.2));
        if (alt > -0.55) { disc(sx, sy, sr + 4 + 5 * st.kick, mixc(air[2], sunC, 0.5), 0.3); disc(sx, sy, sr, sunC); disc(sx - 2, sy - 2, sr - 4, mixc(sunC, white, 0.5), 0.5); }
        if (ni > 0.5) moon(Math.round(W * (1 - moonAt)), Math.round(HZ * (0.2 + 1.2 * (1 - clamp((ni - 0.5) * 2.2)))), Math.round(8 * sc), white, mixc(air[0], white, 0.1), mixc(air[1], white, 0.4));
        each(0.05, 100, 20, (x, k, r) => cloud(x, HZ * (0.2 + 0.5 * hash(k, 3)), 6 + r * 10, k, mixc(air[3], white, 0.5 - 0.3 * ni), mixc(air[2], air[1], 0.35), mixc(air[1], air[2], 0.5)), 60, t * 0.8);
        flock(BIRD_A, BIRD_B, { b: mixc(white, air[1], 0.2 + 0.5 * ni) }, { n: 5, y: 0.3, every: 33, spread: 11 });
        // fireworks, one every two beats through the first half of the drop
        if (grand > 0) for (let i = 0; i < 14; i++) {
          const a = st.gT - i * st.bl, fx = W * (i % 2 ? 0.08 + 0.4 * hash(i, 3) : 0.52 + 0.4 * hash(i, 3)), top = HZ * (0.16 + 0.34 * hash(i, 4)), col = bulbs[i % 3]; if (a <= 0) continue;
          if (a < 0.6) { const y = lerp(HZ - 12, top, eased(a / 0.6)); dot(fx, y, white); dot(fx, y + 2, col); dot(fx, y + 4, mixc(col, air[1], 0.5)); continue; }
          const b = a - 0.6, R = (20 + 17 * hash(i, 5)) * sc; if (b > 2.6) continue;
          if (b < 0.15) disc(fx, top, 1 + b * 9, white, 0.4);
          for (let j = 0; j < 42; j++) for (let s = 0; s < 3; s++) {
            const q = Math.max(0, b - s * 0.07), ang = (j / 14) * TAU + i + (j % 3) * 0.2, rr = R * [1, 0.68, 0.36][j % 3] * (1 - Math.exp(-q * 3.2)), x = Math.round(fx + Math.cos(ang) * rr), y = Math.round(top + Math.sin(ang) * rr + 6 * q * q);
            if (y < HZ && (b < 1.4 || dit(x, y, 1 - (b - 1.4) / 1.2))) { if (s === 0 && b < 0.9) box(x, y, 2, 2, b < 0.18 ? white : j % 3 === 2 ? white : col); else dot(x, y, s ? mixc(col, air[1], 0.3 * s) : col); }
          }
        }
        // the headland with its hotels, the long pier with the wheel, a tent and a tower
        const headC = mixc(C("#2a1648"), air[3], 0.3), head = (x) => 3 + 17 * fbm(x * 0.01, land + 3);
        ridge(head, 0.1, HZ + 1, headC, mixc(headC, air[3], 0.35), { litDeep: 2, to: HZ + 2 });
        each(0.1, 46, 30, (x, k, r) => {
          if (r > 0.55) return;
          const hh = 9 + Math.floor(hash(k, 2) * 15), by = HZ - Math.round(head(x + Math.floor(st.cam * 0.1))) + 3;
          box(x, by - hh, 9, hh, headC);
          box(x, by - hh, 2, hh, mixc(headC, air[3], 0.45));
          for (let j = 0; j < hh / 3 - 1; j++) for (let i = 0; i < 2; i++) if (hash(k * 50 + j * 2 + i, Math.floor((st.hat + j) / 8)) < ni * 0.75) dot(x + 3 + i * 3, by - hh + 2 + j * 3, bulbs[1]);
        });
        const deck = HZ - 5, night = ni;
        each(0.3, 12, 0, (x) => box(x, deck + 1, 2, 5, ink), 4);
        each(0.3, Math.round(Math.max(110, Math.min(170, W * 0.55))), 44, (x, k) => {
          const kind = [0, 1, 0, 2][((k % 4) + 4) % 4]; // every other one is a wheel, so one is nearly always in view
          if (kind === 0) wheel(x, deck, Math.round(27 * TALL * sc + 3), night);
          else if (kind === 1) {
            for (let i = -17; i <= 17; i++) { const hh = Math.round(11 * Math.sqrt(1 - (i / 17.5) ** 2)); box(x + i, deck - 8 - hh, 1, hh, Math.floor((i + 18) / 4) % 2 ? bulbs[0] : white); }
            box(x - 17, deck - 8, 35, 8, mixc(bulbs[0], ink, 0.5));
            box(x - 3, deck - 6, 6, 6, ink);
            box(x, deck - 26, 1, 8, ink);
            box(x + 1, deck - 26, 4, 2, bulbs[1]);
            for (let i = 0; i < 6; i++) dot(x - 15 + i * 6, deck - 9, (i + st.hat) % 2 ? bulbs[1] : ink);
          }
          else { const th = Math.round(46 * TALL); box(x, deck - th, 2, th, ink); box(x - 2, deck - th - 2, 6, 2, ink); box(x - 3, deck - 9 - (th - 16) * clamp(st.bs * 1.2), 8, 4, bulbs[2]); dot(x, deck - th - 3, bulbs[0]); disc(x, deck - th - 3, 1 + 2 * st.kick, bulbs[0], 0.35); } // a car that rides up the tower with the bass
          for (let i = 0; i < 3; i++) { const bx = x + 36 + i * 15; box(bx, deck - 7, 11, 7, wood); box(bx - 1, deck - 9, 13, 2, i % 2 ? bulbs[2] : bulbs[0]); box(bx + 3, deck - 5, 5, 3, hash(k * 3 + i, Math.floor((st.hat + i) / 4)) < 0.3 + 0.6 * ni ? bulbs[1] : ink); }
        }, 90);
        box(0, deck, W, 2, wood); box(0, deck, W, 1, mixc(wood, air[3], 0.4));
        water(HZ + 1, waterC, mixc(air[3], white, 0.3), { deep: 0.18, flow: 1 });
        if (alt > 0.02) glitter(sx, HZ + 2, mixc(waterC, sunC, 0.8)); else if (ni > 0.6) glitter(Math.round(W * (1 - moonAt)), HZ + 2, mixc(waterC, white, 0.55));
        boat(41, 30, HZ + 9, { m: ink, w: white, h: bulbs[0], k: ink, l: bulbs[1] }, mixc(waterC, white, 0.4));
        // the promenade in front: lamp posts with strings of bulbs (they step on the hi-hats, fill up through a build, all shine on the drop), and palms
        const y0 = H - Math.round(13 * TALL) + st.wide * H * 0.07, off = Math.floor(st.cam * 0.8), dark = mixc(ink, air[1], 0.15);
        for (let x = 0; x < W; x++) if ((x + off) % 8 === 0) box(x, y0 - 5, 1, 5, dark);
        box(0, y0 - 5, W, 1, dark); box(0, y0, W, H, dark); box(0, y0, W, 1, mixc(wood, air[3], 0.3));
        each(0.8, 66, 0, (x, k) => {
          const ph = Math.round(30 * TALL); box(x, y0 - ph, 2, ph, dark); box(x - 1, y0 - ph - 3, 4, 3, grand > 0.08 || ni > 0.4 ? bulbs[3] : dark); if (ni > 0.4) disc(x, y0 - ph - 2, 3 + st.kick, bulbs[1], 0.25);
          for (let j = 1; j < 13; j++) { const u = j / 13, bx = x + 1 + u * 66, by = y0 - ph + 2 + 28 * u * (1 - u), col = bulbs[(((j + k) % 4) + 4) % 4], on = grand > 0.08 ? true : st.build > 0.05 ? bx / W < st.build * 1.1 : (j + st.hat + k) % 3 === 0 && (st.wide < 0.5 || j % 4 === 0); dot(bx, by - 1, dark); box(bx, by, 2, 2, on ? col : mixc(col, ink, 0.72)); if (on && ni > 0.3) dot(bx, by, white); }
        }, 70);
        each(0.9, 140, 77, (x, k, r) => palmTree(x, H, Math.round((58 + r * 26) * TALL), Math.sin(t * 0.8 + k) * (1.5 + 5 * st.bs), mixc(palm, ink, 0.3 + 0.4 * ni), mixc(palmLit, air[3], 0.25 * (1 - ni))), 50);
      } };
    })();

    // Sea (ambient, chill, downtempo): open water under towers of cloud, an island, a skiff, a buoy; on the drop a whale leaps out of the water (and with no drop for a minute and a half, by itself).
    WORLDS.sea = (() => {
      const SKY = [["#35579a", "#6a8ac2", "#b2b9d9", "#f1c9b1"], ["#192357", "#49397f", "#ae5989", "#f7a171"], ["#040818", "#081230", "#0e2048", "#183a60"], ["#16224a", "#3a4a80", "#9a80a8", "#f0b8a0"]].map((r) => r.map(C));
      const NIGHT = [0, 0.5, 1, 0.55];
      const white = C("#fdfaf0"), ink = C("#070b1c"), whale = C("#1c2c4c"), whaleLit = C("#3a5684"), belly = C("#cfd9e6"), red = C("#e0483c"), warm = C("#ffd27a"), waterC = C("#07122e"), PROF = [4, 6, 8, 9, 9, 10, 10, 10, 9, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3, 3, 2, 2];
      const SKIFF = ["........l........", "........m........", "........m........", "..pp....m........", "..pp....m........", ".ppp....m.......h", "hhhhhhhhhhhhhhhhh", ".hkkkkkkkkkkkkkh.", "..hhhhhhhhhhhhh.."];
      return { SKY, NIGHT, draw() {
        const t = st.t, sc = SC, wy = HZ + Math.round(13 * TALL);
        stars(Math.round(W * 0.45), (ni - 0.3) * 1.4, mixc(air[1], white, 0.5), white, HZ * 0.85);
        moon(Math.round(W * moonAt), Math.round(HZ * 0.22), Math.round(12 * sc), C("#fff6d8"), mixc(C("#fff6d8"), air[2], 0.45), mixc(air[1], white, 0.4), 0);
        // towers of cloud that come and go with the weather
        const cover = 0.35 + 0.5 * noise(t / 50, 4) + (weather - 1) * 0.25, cl = mixc(white, air[3], 0.25 + 0.45 * ni), cb = mixc(air[2], white, 0.3 - 0.2 * ni), cu = mixc(air[1], air[2], 0.6);
        each(0.06, 120, 20, (x, k, r) => { const s = (10 + r * 12) * sc * clamp((cover - hash(k, 4) * 0.7) * 5), base = HZ * (0.5 + 0.38 * hash(k, 3)); if (s < 3) return; cloud(x + s * 0.5, base - s * 1.5, s * 0.45, k + 9, cl, cb, cb, false, 1.1); cloud(x - s * 0.3, base - s * 0.75, s * 0.7, k + 5, cl, cb, cb, false, 1.1); cloud(x, base, s, k, cl, cb, cu, false, 0.9); }, 80, t * 0.7);
        flock(BIRD_A, BIRD_B, { b: mixc(white, air[1], 0.3 + 0.5 * ni) }, { n: 5, y: 0.4, every: 31, spread: 11 });
        // an island with one leaning tree and standing stones; a ship far out with its lights on
        const rockC = mixc(C("#1a2240"), air[3], 0.25), rockLit = mixc(rockC, air[3], 0.4);
        each(0.12, Math.round(Math.max(150, Math.min(330, W * 0.9))), 30, (x, k) => {
          dome(x, HZ, 36, 8, rockC);
          dome(x - 6, HZ - 1, 26, 6, rockLit);
          dome(x + 2, HZ, 30, 6, rockC);
          for (let j = 0; j < 14; j++) box(x + 6 + Math.round(j * j * 0.04), HZ - 7 - j, 2, 1, ink);
          disc(x + 15, HZ - 23, 6, ink);
          disc(x + 21, HZ - 20, 5, ink);
          disc(x + 11, HZ - 20, 4, ink);
          disc(x + 13, HZ - 25, 3, mixc(ink, C("#2f6a5a"), 0.5));
          for (let i = 0; i < 3; i++) { box(x - 22 + i * 6, HZ - 11 - (i % 2) * 3, 3, 6 + (i % 2) * 3, rockC); box(x - 22 + i * 6, HZ - 11 - (i % 2) * 3, 1, 6 + (i % 2) * 3, rockLit); }
        }, 50);
        {
          const k = Math.floor(t / 53), p = (t - k * 53) / 44, x = lerp(-30, W + 30, p);
          if (p < 1) { box(x, HZ - 2, 26, 3, ink); box(x - 2, HZ - 3, 3, 1, ink); box(x + 8, HZ - 5, 12, 3, ink); box(x + 11, HZ - 9, 2, 4, ink); box(x + 15, HZ - 9, 2, 4, ink); box(x + 3, HZ - 8, 1, 6, ink); box(x + 11, HZ - 9, 2, 1, red); box(x + 15, HZ - 9, 2, 1, red); for (let i = 0; i < 6; i++) if ((i + st.hat) % 5) dot(x + 2 + i * 4, HZ - 1, warm); }
        }
        water(HZ + 1, waterC, mixc(air[2], white, 0.45), { deep: 0.2, flow: 1 }); glitter(Math.round(W * moonAt), HZ + 2, mixc(waterC, C("#fff6d8"), 0.3 + 0.35 * ni));
        for (let i = 0; i < 9; i++) { // the swell: long lines that roll with the bass
          const d = Math.round(3 + i * i * (H - HZ) / 90), y = HZ + 1 + d, amp = (0.6 + 2.2 * st.sw) * (1 - 0.8 * st.wide) * (0.4 + i * 0.15), c = mixc(waterC, air[2], 0.55);
          if (y < H) for (let x = 0; x < W; x++) if (noise((x + st.cam * (0.2 + i * 0.1) + t * (3 + i * 2)) * 0.05, i + 9) > 0.45) dot(x, y + Math.round(Math.sin((x + t * (6 + i * 3)) * (0.16 - i * 0.008)) * amp), c);
        }
        // now and then a back rolls out of the water and blows
        { const k = Math.floor(t / 37), p = (t - k * 37) / 7, x = W * (0.2 + 0.6 * hash(k, 51)) - p * 14; if (p < 1 && grand === 0 && hash(k, 52) < 0.8) { dome(x, wy, 15 * sc, 5 * Math.sin(p * Math.PI) * sc, whale); if (p > 0.25 && p < 0.6) for (let i = 0; i < 12; i++) { const q = (p - 0.25) * 3 + hash(i, 3) * 0.3; dot(x - 8 + (hash(i, 4) - 0.5) * 12 * q, wy - 5 - 12 * Math.sin(Math.min(1, q) * 2.2), white); } } }
        // the breach: the whale follows its own arc out of the sea and back, with spray where it leaves and where it lands
        if (grand > 0 && st.gT > 0.3) {
          const u = (st.gT - 0.3) / 4.2, x0 = W * 0.36, span = 64 * sc, rise = Math.min(HZ * 0.66, span * 1.25), at = (v) => [x0 + span * v, wy + 10 - rise * Math.sin(Math.PI * Math.min(v, 1.2))], seg = [];
          for (let s = 0; s < PROF.length; s++) { const v = u - s * 0.023, [x, y] = at(v), [xa, ya] = at(v + 0.01), [xb, yb] = at(v - 0.01), m = Math.hypot(xa - xb, ya - yb) || 1; seg.push([x, y, (xa - xb) / m, (ya - yb) / m, PROF[s] * sc * 1.15]); }
          const back = mixc(whale, C("#3d5c92"), ni * 0.85), top = mixc(whaleLit, C("#8fb2e2"), ni * 0.85), tail = seg[seg.length - 1];
          for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 14 * sc; i++) for (let j = 0; j < 6 - i / 3; j++) { const fx = tail[0] - tail[2] * (1 + i * 0.45 + j) - tail[3] * side * i * 1.15, fy = tail[1] - tail[3] * (1 + i * 0.45 + j) + tail[2] * side * i * 1.15; if (fy < wy) dot(fx, fy, j ? back : top); }
          for (let s = seg.length - 1; s >= 0; s--) { const [x, y, tx, ty, r] = seg[s]; disc(x, y, r, back, 1, wy); disc(x + ty * r * 0.45 - 1, y - tx * r * 0.45 - 1, r * 0.5, top, 1, wy); }
          for (let s = 11; s >= 1; s--) { const [x, y, tx, ty, r] = seg[s]; disc(x - ty * r * 0.62, y + tx * r * 0.62, r * 0.42, belly, 1, wy); }
          for (let s = 10; s >= 1; s--) for (const o of [0.45, 0.8]) { const [x, y, tx, ty, r] = seg[s], lx = x - ty * r * o, ly = y + tx * r * o; if (ly < wy) { dot(lx, ly, mixc(belly, back, 0.55)); dot(lx - tx * 2, ly - ty * 2, mixc(belly, back, 0.55)); } } // the grooves of its throat
          { const [x, y, tx, ty, r] = seg[6]; for (let i = 0; i < 24 * sc; i++) for (let j = 0; j < 5 - i / 6; j++) { const fx = x - ty * (r * 0.8 + i * 0.8) - tx * (i * 0.55 + j), fy = y + tx * (r * 0.8 + i * 0.8) - ty * (i * 0.55 + j); if (fy < wy) dot(fx, fy, j ? back : top); } } // the long fin
          { const [x, y, tx, ty, r] = seg[2]; if (y < wy) { box(x - ty * r * 0.2 - 1, y + tx * r * 0.2 - 1, 2, 2, ink); dot(x - ty * r * 0.2 - 1, y + tx * r * 0.2 - 1, white); } }
          for (const [te, xe, big] of [[0.3, x0 + 4, 1], [4.6, x0 + span - 2, 1.6]]) {
            const a = st.gT - te;
            if (a <= 0) continue;
            if (a < 2.6) for (let i = 0; i < 50 * big; i++) { const q = a - hash(i, 7) * 0.6; if (q <= 0) continue; const y = wy - (22 + 60 * hash(i, 8)) * big * q + 62 * q * q; if (y < wy) box(xe + (hash(i, 9) - 0.5) * 80 * big * q, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2, i % 3 ? white : mixc(white, air[2], 0.4)); }
            for (let i = 0; i < 3; i++) ring(xe, wy + 1, (6 + 9 * a) * big * (1 - i * 0.3), mixc(white, air[2], 0.2), 0.9 - a * 0.13, 0.2);
          }
        }
        // nearer: a skiff at anchor with somebody in it and a lamp on its mast, rocking on the swell; and now and then a fish jumps
        each(0.7, Math.round(Math.max(120, Math.min(260, W * 0.8))), 74, (x, k) => {
          const y = HZ + Math.round((H - HZ) * 0.42) + Math.round(Math.sin(t * 1.1 + k) * (0.6 + 1.5 * st.bs)) + st.wide * H * 0.03, hull = mixc(C("#6a4a3a"), ink, 0.5 * ni);
          put(SKIFF, x - 8, y - 8, { l: warm, m: ink, p: ink, h: hull, k: mixc(hull, ink, 0.5) }, k % 2 === 0);
          disc(x, y - 8, 2 + 3 * st.kick, warm, 0.25);
          box(x - 7, y + 1, 15, 1, mixc(waterC, white, 0.4), 0.5);
          box(x, y + 2, 1, 5, warm, 0.5);
        }, 30);
        { const k = Math.floor(t / 2.7), p = (t - k * 2.7) / 0.8;
          if (p < 1.7 && hash(k, 64) < 0.7) {
            const dir = hash(k, 65) < 0.5 ? 1 : -1, x0 = W * (0.08 + 0.84 * hash(k, 66)), y0 = HZ + (H - HZ) * (0.3 + 0.6 * hash(k, 67)), fx = x0 + dir * p * 15, fy = y0 - Math.sin(p * Math.PI) * 9 * sc, silver = mixc(belly, air[2], 0.5 * ni), q = p < 1 ? p : (p - 1) / 0.7;
            if (p < 1) { box(fx - 2, fy, 4, 2, silver); dot(fx + dir * 2, fy + (p > 0.5 ? 1 : 0), silver); dot(fx - dir * 3, fy - 1, silver); dot(fx - dir * 3, fy + 1, silver); }
            ring(p < 1 ? x0 : x0 + dir * 15, y0 + 1, 2 + 7 * q, mixc(waterC, white, 0.5), 0.8 - 0.6 * q, 0.3); // a ring where it leaves the water, and another where it lands
          }
        }
        // a buoy in front, bobbing; its lamp swells on the kick
        each(1, Math.round(Math.max(130, Math.min(300, W * 0.9))), 70, (x, k) => {
          const y = H - Math.round(24 * TALL) + Math.round(Math.sin(t * 1.3 + k) * (1 + 2 * st.bs)) + st.wide * H * 0.05;
          box(x - 4, y, 9, 9, red);
          box(x - 4, y + 3, 9, 2, white);
          box(x - 4, y, 2, 9, mixc(red, white, 0.35));
          box(x - 6, y + 9, 13, 2, ink);
          box(x, y - 9, 1, 9, ink);
          box(x - 2, y - 5, 5, 1, ink);
          box(x - 1, y - 12, 3, 3, warm);
          disc(x, y - 11, 3 + 4 * st.kick, warm, 0.25);
          ring(x, y + 12, 9 + 2 * Math.sin(t * 1.3 + k), mixc(waterC, white, 0.4), 0.6, 0.25);
        }, 30);
      } };
    })();

    // Meadow (music of no known kind, at dusk; and under a bright sky for game music): hills, a windmill, an oak and a stag, balloons, sunflowers, grass that is the spectrum, fireflies; on the drop, lanterns rise.
    const meadowOf = (bright) => {
      const DUSK = [["#3a4a8a", "#8a6aa0", "#f0906a", "#ffd890"], ["#141a40", "#3a2a68", "#8a4a78", "#e07a5a"], ["#03050f", "#080e26", "#0e1a3a", "#182c4a"], ["#101a3a", "#2e4474", "#7a7aa8", "#f4b890"]], DAY = [["#2f6fd0", "#58a0e8", "#9ad0f0", "#e0f0e0"], ["#27408f", "#7a5aa8", "#f08a7a", "#ffd890"], ["#060a20", "#0c1638", "#142450", "#243e6a"], ["#1c3070", "#4a6ab0", "#b0a0c8", "#ffd0a0"]];
      const SKY = (bright ? DAY : DUSK).map((r) => r.map(C)), NIGHT = bright ? [0, 0.4, 1, 0.45] : [0.15, 0.55, 1, 0.6];
      const ink = C("#07101a"), g1 = C("#123a2c"), g2 = C("#1f6a3a"), g3 = C("#58b04a"), g4 = C("#b4e060"), bark = C("#3a2418"), warm = C("#ffd27a"), white = C("#fff8ea"), fly = C("#e8ff7a"), stripes = [[C("#e0483c"), C("#fff0d0")], [C("#3c8ae0"), C("#ffe066")], [C("#a050d0"), C("#ff9a5a")]];
      const STAG = ["..a...a...........", ".a.a.a.a..........", "..aa.aa...........", "...aaa............", "...hhh............", "..hhhhh...........", ".hhehhh...........", ".nhhhhhh..........", "...hhhhhhhhhhhhh..", "....hhhhhhhhhhhhh.", "....hhhhhhhhhhhhht", "....hhbbbbbbbbhhh.", "....hh.h....hh.h..", "....hh.h....hh.h..", "....h..h....h..h..", "....h..h....h..h..", "....k..k....k..k.."];
      const farH = (x) => 10 + 24 * fbm(x * 0.008, land + 1), midH = (x) => 5 + 22 * fbm(x * 0.012, land + 11), nearH = (x) => (30 + 34 * fbm(x * 0.006, land + 21)) * TALL;
      return { SKY, NIGHT, draw() {
        const t = st.t, sc = SC, dim = 0.15 + 0.5 * ni, lift = st.wide * H * 0.07;
        stars(Math.round(W * 0.5), (ni - 0.25) * 1.4, mixc(air[1], white, 0.5), white, HZ * 0.9);
        for (let i = 0; i < W * 0.6; i++) { const x = Math.floor(hash(i, 91) * W), y = Math.floor(HZ * 0.75 - x * 0.28 * (HZ / W) * 2 + (hash(i, 92) + hash(i, 93) - 1) * HZ * 0.16); if (hash(i, 94) < (ni - 0.5) * 2 && y >= 0) dot(x, y, mixc(air[1], white, 0.35)); } // the milky way, when it is dark enough
        moon(Math.round(W * moonAt), Math.round(HZ * 0.18), Math.round(9 * sc), C("#fff6d8"), mixc(air[0], C("#fff6d8"), 0.12), mixc(air[1], white, 0.4));
        each(0.05, 110, 20, (x, k, r) => cloud(x, HZ * (0.25 + 0.4 * hash(k, 3)), 6 + r * 9, k, mixc(air[3], white, 0.45 - 0.3 * ni), mixc(air[2], air[1], 0.3), mixc(air[1], air[2], 0.5)), 60, t * 0.8);
        // balloons drift over; each lights its burner on its own beat, and the whole balloon glows
        for (let i = 0; i < 3; i++) { const span = W + 90, x = ((((hash(i, 5) * span + t * (2.2 + i * 0.9) - st.cam * 0.1) % span) + span) % span) - 45, y = HZ * (0.24 + 0.17 * i) + 3 * Math.sin(t * 0.3 + i * 2), r = Math.round((9 - i * 1.5) * sc), fire = st.beat % 3 === i ? st.kick : 0, [ca, cb] = stripes[i];
          for (let j = -r; j <= r * 1.5; j++) { const half = j < 0 ? Math.floor(Math.sqrt(r * r - j * j) + 0.4) : Math.round(r * (1 - (j / (r * 1.5)) ** 1.6) + 0.5); for (let q = -half; q <= half; q++) { const c = Math.floor((q + r + 0.5) / Math.max(2, r / 2)) % 2 ? ca : cb; dot(x + q, y + j, mixc(mixc(c, air[1], dim * (q > 0 ? 1 : 0.6)), warm, fire * 0.6)); } }
          box(x - 1, y + r * 1.5 + 3, 3, 2, bark); dot(x - 1, y + r * 1.5 + 2, ink); dot(x + 1, y + r * 1.5 + 2, ink); if (fire > 0.3) dot(x, y + r * 1.5 + 1, white); }
        flock(BIRD_A, BIRD_B, { b: mixc(ink, air[2], 0.3) }, { n: 7, y: 0.5, every: 35 });
        // three ranges of hills; a windmill whose sails turn with the beat, and a hamlet below it
        const farC = mixc(mixc(g1, C("#2a5a6a"), 0.6), air[3], 0.42), midC = mixc(mixc(mixc(g1, g2, 0.6), air[3], 0.14), ink, 0.35 * ni), midLit = mixc(mixc(g3, air[3], 0.3), ink, 0.35 * ni);
        ridge(farH, 0.08, HZ, farC, mixc(farC, air[3], 0.35), { litDeep: 3, to: HZ + 8 });
        ridge(midH, 0.2, HZ + 6, midC, midLit, { litDeep: 2, tex: (x, y, wx) => { for (let d = 4; d < 60; d += 4) if (hash(wx * 7 + d, 5) < 0.07) dot(x, y + d, hash(wx + d, 6) < 0.25 ? mixc(white, midC, 0.4 + 0.4 * ni) : midLit); if (hash(Math.floor(wx / 6), 3) < 0.4 && wx % 6 === 0) { dome(x, y + 1, 3, 4, mixc(g1, ink, 0.4)); dot(x - 1, y - 2, midLit); } } });
        each(0.2, Math.round(Math.max(130, Math.min(270, W * 0.85))), 30, (x, k) => { const off = Math.floor(st.cam * 0.2), by = HZ + 6 - Math.round(midH(x + off)), a0 = (st.bc / 16) * TAU, body = mixc(C("#c8b8a8"), air[1], dim);
          for (let j = 0; j < 17; j++) { const half = 2 + Math.floor(j / 6); box(x - half, by - 17 + j, half * 2 + 1, 1, mixc(body, ink, 0.45)); box(x - half, by - 17 + j, half, 1, body); } box(x - 3, by - 20, 7, 3, mixc(C("#7a2f3f"), air[1], dim)); dot(x, by - 6, st.hat % 4 < 2 ? warm : ink);
          for (let i = 0; i < 4; i++) { const a = a0 + i * Math.PI * 0.5, ex = x + Math.cos(a) * 14, ey = by - 18 + Math.sin(a) * 14; line(x, by - 18, ex, ey, ink); line(x + Math.cos(a + 0.22) * 5, by - 18 + Math.sin(a + 0.22) * 5, x + Math.cos(a + 0.16) * 14, by - 18 + Math.sin(a + 0.16) * 14, mixc(white, air[1], dim)); }
          for (let j = 0; j < 3; j++) put(CABIN, x + 24 + j * 19, by - 5 + j * 2, { r: mixc(C("#7a2f3f"), air[1], dim), s: mixc(C("#a04a3a"), air[1], dim), b: mixc(C("#5a4038"), air[1], dim), w: hash(k * 8 + j, Math.floor((st.hat + j * 3) / 8)) < 0.3 + 0.6 * ni ? warm : ink, d: ink }); }, 80);
        // the near hill with the oak and the stag
        const nearC = mixc(g2, ink, 0.25 + 0.45 * ni), nearLit = mixc(g3, air[2], 0.2 + 0.4 * ni), base = H + lift;
        ridge(nearH, 0.5, base, nearC, nearLit, { litDeep: 2, tex: (x, y, wx) => { for (let d = 3; d < H - y; d += 3) if (hash(wx * 13 + d, 2) < 0.12) dot(x, y + d, d % 2 ? nearLit : mixc(nearC, ink, 0.3)); } });
        each(0.5, Math.round(Math.max(150, Math.min(330, W * 0.9))), 35, (x, k) => {
          const off = Math.floor(st.cam * 0.5), by = Math.round(base - nearH(x + off)), dk = mixc(g1, ink, 0.3 + 0.4 * ni), md = mixc(g2, ink, 0.1 + 0.5 * ni), lt = mixc(g3, air[2], 0.1 + 0.5 * ni), sw = Math.round(Math.sin(t * 0.7) * st.bs * 2);
          const L = [[0, -30, 16], [-13, -24, 11], [13, -25, 12], [0, -41, 10], [-8, -36, 8], [9, -37, 8]].map(([a, b, r]) => [a * TALL, b * TALL, r * TALL]);
          for (let j = 0; j < 20 * TALL; j++) box(x - 2 - (j < 3 ? 2 - j : 0), by - j + 2, 5 + (j < 3 ? 4 - 2 * j : 0), 1, mixc(bark, ink, 0.3 + 0.4 * ni));
          line(x, by - 14, x - 9, by - 24, bark); line(x + 1, by - 14, x + 9, by - 25, bark);
          for (const [a, b, r] of L) disc(x + a + sw + 1, by + b + 2, r, dk);
          for (const [a, b, r] of L) disc(x + a + sw, by + b, r - 1, md);
          for (const [a, b, r] of L) {
            disc(x + a + sw - r * 0.3, by + b - r * 0.35, r * 0.5, lt);
            disc(x + a + sw - r * 0.1, by + b - r * 0.15, r * 0.45, md);
            for (let i = 0; i < 5; i++) dot(x + a + sw + (hash(i, r) - 0.5) * r * 1.5, by + b + (hash(i, r + 1) - 0.2) * r, i % 2 ? dk : lt);
          }
          const sx = x - 44, sy = Math.round(base - nearH(sx + off));
          put(STAG, sx, sy - 16, { a: mixc(C("#d8c8a8"), ink, 0.5 * ni), h: mixc(C("#6a4028"), ink, 0.3 + 0.4 * ni), e: ink, n: ink, b: mixc(C("#b08a60"), ink, 0.3 + 0.4 * ni), t: white, k: ink }, k % 2 === 0);
        }, 70);
        // on the drop: paper lanterns rise from behind the hill, hundreds of them, and drift off into the sky
        if (grand > 0) for (let i = 0, n = Math.round(W * 0.34); i < n; i++) {
          const a = st.gT - hash(i, 41) * 5;
          if (a <= 0) continue;
          const f = hash(i, 42), x = hash(i, 43) * W + a * (3 + 5 * f) + 3 * Math.sin(t * 0.6 + i), y = HZ + 20 - a * (9 + 9 * f) * TALL, big = f > 0.55;
          if (y < -4 || hash(i, 44) >= grand * 4) continue;
          if (big) { box(x - 1, y - 1, 3, 4, C("#ff9a3a")); box(x, y + 1, 1, 2, warm); dot(x, y - 2, C("#c0502a")); } else { dot(x, y, C("#ff9a3a")); dot(x, y + 1, warm); }
        }
        // a fence along the front, and sunflowers behind it that lean with the bass and nod on the kick, every other one in turn
        const fy = H - Math.round(15 * TALL) + lift, rail = mixc(C("#9a7a58"), ink, 0.25 + 0.5 * ni), railSh = mixc(bark, ink, 0.3 + 0.4 * ni), petal = mixc(C("#ffd23a"), ink, 0.1 + 0.45 * ni), stem = mixc(g2, ink, 0.15 + 0.4 * ni);
        each(1, 27, 88, (x, k, r) => {
          if (r > 0.6) return;
          const hh = Math.round((24 + r * 36) * TALL), lean = Math.sin(t * 0.9 + k) * (1 + 3 * st.bs), by = H + lift, hx = x + Math.round(lean), hy = by - hh + ((k + st.beat) % 2 ? 0 : Math.round(st.kick * 2));
          for (let j = 0; j < hh; j++) dot(x + Math.round(lean * (j / hh) ** 2), by - j, stem);
          for (const [u, side] of [[0.45, -1], [0.62, 1]]) { const lx = x + Math.round(lean * u * u), ly = by - Math.round(hh * u); box(side < 0 ? lx - 4 : lx + 1, ly, 4, 1, stem); box(side < 0 ? lx - 3 : lx + 1, ly - 1, 3, 1, stem); }
          disc(hx, hy, 4, petal); disc(hx, hy, 2, mixc(bark, ink, 0.4 * ni)); dot(hx - 1, hy - 1, mixc(bark, petal, 0.4));
        }, 20);
        for (let x = -((((Math.floor(st.cam) % 13) + 13) % 13)); x < W; x += 13) { box(x, fy - 3, 2, 12, railSh); box(x, fy - 3, 1, 12, rail); }
        box(0, fy, W, 1, rail); box(0, fy + 1, W, 1, railSh); box(0, fy + 5, W, 1, rail); box(0, fy + 6, W, 1, railSh);
        // grass in front: its height is the spectrum laid across the meadow; fireflies that blink on the hi-hats and gather through a build
        const off = Math.floor(st.cam);
        for (let x = -3; x < W + 3; x++) {
          const k = x + off;
          if (k % 2) continue;
          const hh = Math.round((5 + 9 * hash(k, 4) + 16 * band(x)) * TALL - lift), lean = Math.sin(t * 1.3 + k * 0.11) * (0.8 + 3 * st.bs), c = hash(k, 5) < 0.35 ? mixc(g3, ink, 0.2 + 0.5 * ni) : mixc(g2, ink, 0.3 + 0.4 * ni);
          for (let j = 0; j < hh; j++) dot(x + Math.round(lean * (j / hh) ** 2), H - j, c);
          if (hash(k, 6) < 0.1) dot(x + Math.round(lean), H - hh, hash(k, 7) < 0.5 ? white : C("#ff8ab0"));
          else if (band(x) > 0.6) dot(x + Math.round(lean), H - hh, mixc(g4, ink, 0.5 * ni));
        }
        for (let i = 0, n = Math.round(W * 0.09); i < n; i++) {
          if (hash(i, Math.floor((st.hat + i) / 3)) > 0.25 + 0.7 * ni) continue;
          let x = (((hash(i, 31) * W * 1.3 - st.cam * 0.7) % W) + W) % W + 9 * Math.sin(t * 0.5 + i * 1.7), y = H * 0.93 - hash(i, 32) * (H - HZ) * 0.9 + 6 * Math.sin(t * 0.7 + i);
          x = lerp(x, W / 2 + (x - W / 2) * 0.3, st.build);
          y -= st.build * HZ * 0.5 * hash(i, 33);
          dot(x, y, fly);
          if ((i + st.hat) % 4 === 0 && st.he > 0.3) { dot(x - 1, y, mixc(fly, ink, 0.5)); dot(x + 1, y, mixc(fly, ink, 0.5)); dot(x, y - 1, mixc(fly, ink, 0.5)); dot(x, y + 1, mixc(fly, ink, 0.5)); }
        }
      } };
    };
    WORLDS.meadow = meadowOf(false); WORLDS.day = meadowOf(true);

    function paint() {
      if (pick !== st.world) { coming = !!pick && st.over < 1; if (coming) old.set(B); pick = st.world; } // another place: keep the last picture of the old one, for the new one to come through
      const wd = WORLDS[pick] || WORLDS.meadow;
      land = PLACE_LANDS.indexOf(V.land) + 1 || 1; moonAt = land % 2 ? 0.74 : 0.26; weather = V.weather ?? 1;
      day = (((st.day + (PLACE_HOUR[pick] || 0) + (V.hour || 0)) % 1) + 1) % 1;
      HZ = Math.round(H * (WIDE ? 0.62 : 0.6) + st.wide * H * 0.07);
      air = hour(wd.SKY); ni = hour(wd.NIGHT); grand = clamp(Math.min(st.gT / (0.4 + 2.6 * st.soft), 1 - st.gT / 12)); // the grand thing comes in over a moment (never in one frame) and is gone after twelve seconds
      paintSky(air, HZ + 2);
      wd.draw();
      if (coming && st.over < 1) { for (let y = 0; y < H; y++) { const row = y * W, my = (y & 3) << 2; for (let x = 0; x < W; x++) if ((M[(x & 3) | my] + 0.5) / 16 >= st.over * 1.5 - (x / W) * 0.5) B[row + x] = old[row + x]; } } // the new place comes through the old one from the left, dot by dot
      else coming = false;
      S.x.putImageData(img, 0, 0);
    }
    return { S, paint };
  }
  function placesFx() { // Places: the clocks step once a frame, the picture is painted at most thirty times a second (every dot of it is worked out here, not by the graphics card) and shown every frame
    const st = placeSt;
    let size = Math.max(2, Math.round(Math.min(w, h) / 180)); // a dot is this many of the picture's own: about 180 dots along the short side,
    while (w / size > 400) size++; // and never more than 400 across, which keeps the work small on a very wide picture
    const S = pixelScreen(Math.round(w / size));
    if (!placeView || placeView.S !== S) { placeView = placeMake(S); st.painted = -1e9; } // a picture of another shape: the place is laid out again for it, and placeSt carries on (the view and the sky do not start again)
    if (st.stepped !== realNow) { st.stepped = realNow; placeStep(); } // (this can be called twice in one frame: the clocks step once)
    const look = st.world + V.land;
    if (Math.abs(realNow - st.painted) >= 30 || look !== st.look) { st.painted = realNow; st.look = look; placeView.paint(); } // (another lie of the land is painted at once, behind the old picture going away)
    S.show();
  }
  /* ==== places: end ==== */
  /* ==== life: begin ==== */
  /* ---------- Living grid: the pattern among the pixel effects. One grid of cells, each drawn as a bead of 2 by 2 dots from a fixed set of colors, run by one of nine rule-sets from the oldest
     self-playing games (cells that live and die by their neighbours, crystals that grow, ants that turn, sand that falls) and fed by the song: a kick plants a shape, the bass feeds the floor,
     a hi-hat sprinkles, a build raises the birth rate, a break slows it all to half, and a drop sends one ring out from the middle that clears the grid, with a new garden planted behind it.
     The kind of music picks one of ten worlds, each with its own colors, backdrop and rule-set. Nothing here lights the whole picture: a cell comes on quickly and goes out slowly. ---------- */
  const lifeCounts = (...counts) => counts.reduce((mask, n) => mask | (1 << n), 0); // several counts of neighbours kept as one number
  /* The rule-sets. cells: a cell is born with so many live neighbours and stays with so many; states is how long a fading tail it leaves (2 is none); with fuel each birth passes on one less, so a family burns out.
     bloom: a cell grows wherever exactly one neighbour is alive. pace is steps a beat, sym how many mirror images suit it, up and down the seconds a cell takes to light and to fade. */
  const LIFE_RULES = {
    comets: { kind: "cells", born: lifeCounts(2), stay: 0, states: 7, fuel: true, pace: 4, sym: 2, up: 0.05, down: 0.5 }, // pairs of cells that fly straight, with long tails
    sparks: { kind: "cells", born: lifeCounts(2), stay: 0, states: 3, fuel: true, pace: 4, sym: 2, up: 0.04, down: 0.45 }, // the same without the tail: bursts and darts
    maze: { kind: "cells", born: lifeCounts(3), stay: lifeCounts(1, 2, 3, 4, 5), states: 2, fuel: true, crumbles: 14, pace: 2, sym: 4, up: 0.16, down: 0.6 }, // corridors that crawl outward
    classic: { kind: "cells", born: lifeCounts(3), stay: lifeCounts(2, 3), states: 2, pace: 2, sym: 2, up: 0.16, down: 0.7 }, // the first of them all
    crystal: { kind: "bloom", near: 4, pace: 2, sym: 4, up: 0.07, down: 0.6 }, // snowflakes
    coral: { kind: "bloom", near: 8, chance: 0.16, pace: 2, sym: 1, up: 0.2, down: 0.9 }, // the same by chance, and upward: branches
    vines: { kind: "bloom", near: 8, chance: 0.24, both: true, pace: 4, sym: 2, up: 0.12, down: 0.7 }, // and the same hanging from the ceiling too, quicker: creepers
    ants: { kind: "ants", pace: 1, sym: 2, up: 0.14, down: 0.7 }, // an ant turns right on an empty cell and left on a painted one, and repaints it
    sand: { kind: "sand", pace: 1, sym: 2, up: 0.06, down: 0.28 }, // grains from the top, a column for each part of the spectrum
  };
  /* The worlds, one for each answer of musicWorld() and the dish for when nothing says. rule is its own rule-set and also the two a version can change it to. back: the backdrop's three colors, dark to light;
     ember: a cell's last glow; inks: [dim, body, hot] for what the bass, the kick and the hi-hat plant (the hourglass has six sands of two shades). turns: how much of the version's turn of the colors it takes. */
  const LIFE_WORLDS = {
    acid: { rule: "ants", also: ["maze", "sand"], scene: "tiles", turns: 0.12, back: [[7, 11, 6], [13, 21, 9], [22, 34, 12]], ember: [44, 62, 16], // the vat
      inks: [[[66, 104, 22], [150, 222, 44], [228, 255, 150]], [[124, 104, 12], [246, 228, 44], [255, 251, 196]], [[128, 60, 12], [255, 142, 32], [255, 216, 156]]] },
    psy: { rule: "crystal", also: ["maze", "classic"], sym: 8, scene: "rings", turns: 1, back: [[13, 6, 26], [25, 9, 42], [42, 16, 60]], ember: [72, 24, 88], // the mandala
      inks: [[[112, 24, 124], [232, 52, 204], [255, 176, 242]], [[14, 98, 124], [40, 222, 232], [196, 255, 250]], [[134, 86, 12], [255, 192, 42], [255, 242, 184]]] },
    hard: { rule: "sparks", also: ["comets", "ants"], scene: "grate", turns: 0.12, back: [[9, 4, 4], [22, 6, 5], [38, 10, 7]], ember: [84, 16, 11], // the furnace
      inks: [[[150, 26, 16], [240, 58, 34], [255, 140, 84]], [[144, 52, 10], [255, 134, 30], [255, 238, 172]], [[124, 112, 100], [238, 232, 220], [255, 255, 255]]] },
    trance: { rule: "comets", also: ["crystal", "coral"], scene: "sky", turns: 0.5, back: [[6, 8, 26], [12, 20, 50], [26, 40, 86]], ember: [34, 48, 112], // the night sky
      inks: [[[40, 62, 152], [92, 142, 255], [194, 222, 255]], [[132, 52, 122], [255, 132, 222], [255, 216, 246]], [[112, 122, 62], [227, 245, 128], [251, 255, 216]]] },
    techno: { rule: "maze", also: ["ants", "crystal"], scene: "board", turns: 0.5, back: [[8, 10, 12], [15, 19, 23], [27, 34, 40]], ember: [40, 50, 58], // the board
      inks: [[[60, 73, 84], [142, 162, 178], [216, 228, 238]], [[10, 92, 98], [30, 222, 212], [184, 255, 247]], [[112, 102, 40], [240, 222, 92], [255, 247, 192]]] },
    house: { rule: "sand", also: ["coral", "comets"], scene: "dusk", turns: 0.5, back: [[18, 9, 14], [34, 15, 22], [96, 62, 74]], ember: [62, 26, 32], peg: [[96, 62, 74], [206, 164, 152]], glint: [255, 246, 220], // the hourglass
      inks: [[[150, 40, 52], [236, 80, 82]], [[160, 86, 24], [250, 152, 50]], [[150, 132, 30], [250, 222, 82]], [[24, 122, 112], [60, 212, 182]], [[40, 82, 162], [92, 152, 250]], [[150, 62, 132], [250, 132, 212]]] },
    jungle: { rule: "vines", also: ["ants", "sparks"], scene: "stems", turns: 0.5, back: [[4, 11, 9], [7, 23, 18], [13, 38, 28]], ember: [20, 62, 40], // the undergrowth
      inks: [[[16, 102, 62], [42, 222, 122], [184, 255, 204]], [[132, 92, 12], [255, 198, 42], [255, 242, 184]], [[112, 40, 92], [240, 92, 182], [255, 194, 232]]] },
    ambient: { rule: "crystal", also: ["coral", "sand"], sym: 2, slowly: 0.5, scene: "shafts", turns: 0.5, back: [[4, 13, 23], [7, 27, 40], [13, 43, 57]], ember: [20, 62, 78], // the reef: frost at half the pace
      inks: [[[20, 92, 102], [62, 192, 192], [184, 246, 238]], [[132, 72, 72], [250, 152, 132], [255, 222, 204]], [[112, 112, 72], [236, 230, 162], [255, 252, 222]]] },
    game: { rule: "classic", also: ["ants", "sand"], scene: "lattice", turns: 0.25, back: [[17, 32, 21], [23, 43, 26], [34, 60, 33]], ember: [50, 82, 40], // the pocket screen: four greens
      inks: [[[70, 112, 48], [132, 174, 60], [204, 228, 124]], [[78, 122, 50], [156, 196, 72], [224, 242, 154]], [[96, 132, 70], [190, 214, 120], [240, 246, 206]]] },
    dish: { rule: "crystal", also: ["classic", "comets"], scene: "vignette", turns: 1, back: [[7, 9, 15], [13, 17, 27], [22, 28, 44]], ember: [34, 42, 64], // the dish
      inks: [[[86, 98, 26], [212, 240, 60], [240, 250, 176]], [[28, 82, 70], [70, 200, 170], [190, 240, 226]], [[50, 54, 106], [120, 130, 255], [206, 210, 255]]] },
  };
  const LIFE_SHAPES = { ship: ["##", "++"], side: ["+#", "+#"], dart: ["##"], pin: ["#", "#"], burst: ["##", "##"], glider: [".#.", "..#", "###"], bloom: [".##", "##.", ".#."], triple: ["###"], seed: ["#.#", ".#.", "###"], corner: ["##", "#."], one: ["#"] }; // what gets planted: "#" a live cell, "+" a fading one
  const LIFE_ANT = [[".h.h.", "l.h.l", ".lbl.", "l.b.l", "..b.."], [".h.h.", "..h..", "llbll", "..b..", "l.b.l"]]; // the ant itself, 5 by 5 dots, in two steps of its legs: h its bright head, the rest dark
  const LIFE_DITHER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // the order in which the dots of a 4 by 4 square come on, for blending two colors without a third
  function lifeGrid(cols, rows, worldName, ruleName) { // one grid of so many cells, in one world, run by one rule-set. It keeps the cells, moves them on with the song, and paints them into its own picture of 2 by 2 dots a cell
    const world = LIFE_WORLDS[worldName], home = ruleName === world.rule, R = LIFE_RULES[ruleName], kind = R.kind, sands = kind === "sand", coral = R.chance < 1, N = cols * rows, dotsW = cols * 2, dotsH = rows * 2;
    const st = new Uint8Array(N), nx = new Uint8Array(N), ink = new Uint8Array(N), fuel = new Uint8Array(N), fuel2 = new Uint8Array(N), age = new Uint16Array(N), lum = new Float32Array(N), tgt = new Float32Array(N), far = new Float32Array(N); // each cell's state, its next state, which ink it is, how much it can still pass on, how old it is, how brightly it shows, how brightly it should, and how far from the middle it lies
    const mark = new Int32Array(N), two = new Uint8Array(N), flips = new Uint8Array(N), jit = new Uint8Array(N), tired = new Float32Array(N), scenery = new Uint8Array(dotsW * dotsH), backdrop = new Uint32Array(dotsW * dotsH);
    const img = new ImageData(dotsW, dotsH), out = new Uint32Array(img.data.buffer), ramp = new Uint32Array(8 * 5), pegTones = new Uint32Array(2); // ramp: for each ink five colors, [backdrop, ember, dim, body, hot]; a cell's light walks up and down them
    const cx = (cols - 1) / 2, cy = (rows - 1) / 2, reach = Math.hypot(cx, cy) + 2, roll = () => Math.random(), int = (n) => Math.floor(Math.random() * n);
    const K = { phase: 0, kicks: 0, planted: 0, ring: -1, sown: 0, sinceDrop: 9, gardens: 0, slow: 0, antSteps: 0, sandTicks: 0, heap: 0, hatch: 0, drain: 0.02, tick: 0, stamps: 0, pulse: -1, pulseOf: 0 }; // the song's place in it all, which goes along onto another grid: see adopt(). pulse: how far the last kick's ring of light has run, in cells (-1: none), and pulseOf how bright it is
    let sym = 2, share = 1, lean = 1, trail = 1, pace = R.pace, quicken = 1, bead = 1, turnNow = NaN, dark = 0, inkCount = 3, front = [], ants = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { far[y * cols + x] = Math.hypot(x - cx, y - cy); const u = Math.abs(2 * x - cols + 1), v = Math.abs(2 * y - rows + 1); let n = (Math.min(u, v) * 374761393 + Math.max(u, v) * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); jit[y * cols + x] = (n ^ (n >>> 16)) & 63; } // jit: a number 0..63 that is the same at every mirror image of a cell
    const chanceAt = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }; // a number 0..1 that is always the same for the same dot
    for (let y = 0; y < dotsH; y++) for (let x = 0; x < dotsW; x++) { // the scenery, drawn once: which of the backdrop's colors each dot is (3 is the ember color), blended by dithering
      const d = (LIFE_DITHER[(y & 3) * 4 + (x & 3)] + 0.5) / 16, v = y / dotsH, r = Math.hypot(x - dotsW / 2, y - dotsH / 2) / (Math.min(dotsW, dotsH) / 2), s = world.scene;
      let k = v * 1.2 + d > 1 ? 1 : 0; // most of them: darker above, a little lighter below
      if (s === "tiles") { if ((x % 16 === 0 && y % 16 === 0) || ((x + 8) % 16 === 0 && (y + 8) % 16 === 0)) k = 2; }
      else if (s === "rings") { const ring = (r * 5) % 2; k = (ring < 1 ? ring : 2 - ring) * 0.9 + d * 0.9 > 1 ? 1 : 0; if (Math.abs(r - 0.8) < 0.012 || Math.abs(r - 0.4) < 0.014) k = 2; }
      else if (s === "grate") { k = v * 1.5 + d > 1.25 ? 1 : 0; if ((x + y) % 24 === 0 && chanceAt(x >> 3, y >> 3) < 0.5) k = 2; if (v > 0.8) { const bed = (v - 0.8) * 5; if (bed * 1.1 + d > 1.15) k = 2; if (bed + d * 0.7 > 1.4 && chanceAt(x >> 1, y >> 1) < 0.6) k = 3; } } // a bed of embers along the floor, so the furnace still reads when little is burning
      else if (s === "sky") { const horizon = 1 - Math.abs(v - 0.74) * 2.4; k = horizon + d * 0.8 > 1.1 ? 1 : 0; if (horizon > 0.97 && ((x >> 1) + y) % 2 === 0) k = 2; if (v < 0.7 && chanceAt(x, y) < 0.007) k = chanceAt(y, x) < 0.3 ? 3 : 2; }
      else if (s === "board") { k = x % 32 === 0 || y % 32 === 0 ? 1 : 0; if (x % 32 < 2 && y % 32 < 2) k = 2; }
      else if (s === "stems") { const stem = Math.abs(((x + Math.sin(y * 0.05 + (x >> 5)) * 6) % 40) - 20) / 20; k = stem * 0.8 + d * 0.5 + v * 0.3 > 1 ? 1 : 0; }
      else if (s === "shafts") { const shaft = Math.sin((x + y * 0.6) * 0.045) * 0.5 + 0.5; k = shaft * (1 - v) * 1.5 + d * 0.7 > 1 ? 1 : 0; if (v > 0.93 && chanceAt(x >> 1, 7) + v > 1.5) k = 2; }
      else if (s === "lattice") k = (x & 1) && (y & 1) ? 1 : 0;
      else if (s === "vignette") k = 1.25 - r * 0.9 + d * 0.6 > 1.1 ? 1 : 0;
      scenery[y * dotsW + x] = k;
    }
    function tones(turn) { // the world's colors, turned round the color wheel as far as the version says: worked out again only when that changes
      turn = Math.round(turn);
      if (turn === turnNow) return;
      turnNow = turn;
      const tone = (c) => { const [r, gr, b] = turnHue(c, turn); return ((255 << 24) | (Math.round(b) << 16) | (Math.round(gr) << 8) | Math.round(r)) >>> 0; }, glint = world.glint || [255, 246, 220];
      let inks = world.inks;
      if (sands && inks.length < 6) inks = [0, 1, 2, 3, 4, 5].map((k) => { const [dim, body] = world.inks[k % 3]; return k < 3 ? [dim, body] : [dim.map((v) => v * 0.6), dim.map((v) => Math.min(255, v * 1.35))]; }); // sand in a world of three inks: those three, and three darker ones made from them, so the layers show
      if (!sands && inks[0].length < 3) inks = [0, 2, 4].map((k) => [...world.inks[k], glint]); // and the hourglass's six sands down to three inks for any other rule
      inks.forEach((three, k) => { ramp[k * 5 + 1] = tone(world.ember); ramp[k * 5 + 2] = tone(three[0]); ramp[k * 5 + 3] = tone(three[1]); ramp[k * 5 + 4] = tone(three[2] || glint); });
      inkCount = inks.length;
      (world.peg || [world.back[2], world.inks[2][0]]).forEach((c, k) => { pegTones[k] = tone(c); });
      const four = [...world.back, world.ember].map(tone);
      dark = four[0];
      for (let o = 0; o < backdrop.length; o++) backdrop[o] = four[scenery[o]];
    }
    function dials(symNow, trailNow, paceNow, beadNow) { // the version's dials, which can change while the garden grows on
      const most = sands || ruleName === "coral" ? 2 : ruleName === "vines" ? 4 : 8, own = Math.min(most, (home && world.sym) || R.sym), next = Math.min(most, symNow || own); // sand and coral have an up and a down, so no more than two mirrors
      share = Math.min(1, own / next) ** (R.fuel ? 1.5 : 1); // with more mirrors than a rule-set was made for, everything planted comes that many more times over, so the song plants that much less often. Rarer still where what is planted spreads as a ring: rings set off together light the picture faster than the same rings one after another
      lean = share ** 0.6; // and what it plants is that much smaller
      const tailed = kind === "cells" && R.states > 2; // comets and sparks blink by nature, and are tuned so that nothing blinks faster than twice a second: they keep their own pace and their own fade whatever the dials say
      trail = tailed ? 1 : trailNow;
      quicken = tailed ? 1 : R.fuel ? Math.min(1, paceNow) : paceNow; // (and the maze, which also grows by fuel, is never run at double pace: a build would fill the picture too fast)
      pace = R.pace * quicken * ((home && world.slowly) || 1);
      bead = sands ? 0 : beadNow;
      if (next !== sym) { sym = next; if (kind === "ants" && K.gardens) newAnts(); } // (ants walk in mirrored twos or fours, so they start again)
    }

    // every mirror image of a spot, for mandalas: fn(x, y, flipX, flipY, turned)
    function images(x, y, fn) {
      fn(x, y, 1, 1, 0);
      if (sym >= 2) fn(cols - 1 - x, y, -1, 1, 0);
      if (sym >= 4) { fn(x, rows - 1 - y, 1, -1, 0); fn(cols - 1 - x, rows - 1 - y, -1, -1, 0); }
      if (sym >= 8) { const X = Math.floor(cx + y - cy), Y = Math.floor(cy + x - cx); for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const X2 = sx > 0 ? X : cols - 1 - X, Y2 = sy > 0 ? Y : rows - 1 - Y; if (Y2 >= 0 && Y2 < rows && X2 >= 0 && X2 < cols) fn(X2, Y2, sx, sy, 1); } } // and the same four again with across and down changed over
    }
    function set(x, y, state, k, f) { if (x < 1 || y < 1 || x >= cols - 1 || y >= rows - 1) return -1; const i = y * cols + x; st[i] = state; ink[i] = k; fuel[i] = f; age[i] = 0; tgt[i] = state === 1 ? 1 : 0.4; return i; }
    function stamp(shape, x, y, k, f) { // a shape at every mirror image of a spot, pointing the way each image points
      const oy = (shape.length - 1) >> 1, ox = (shape[0].length - 1) >> 1;
      images(x, y, (X, Y, fx, fy, turned) => { shape.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") { let dx = (i - ox) * fx, dy = (j - oy) * fy; if (turned) [dx, dy] = [dy * fx * fy, dx * fx * fy]; const at = set(X + dx, Y + dy, row[i] === "#" ? 1 : 2, k, f); if (at >= 0 && kind === "bloom" && row[i] === "#") front.push(at, f); } }); });
    }
    // where the next thing is planted: spots spread evenly over the top left quarter (the mirrors fill the rest), never the same place twice running
    const spread = (n, by) => { let f = 1, r = 0; while (n > 0) { f /= by; r += f * (n % by); n = Math.floor(n / by); } return r; };
    function spot(inX = 0.06, toX = 0.5, inY = 0.08, toY = 0.5) { K.planted = (K.planted % 4096) + 1; const span = sym === 1 ? 1 : toX, tall = sym >= 4 ? toY : 1 - inY; return [Math.floor(cols * (inX + (span - inX) * spread(K.planted, 2))), Math.floor(rows * (inY + (tall - inY) * spread(K.planted, 3)))]; }
    function spotWithin(within, ...edges) { for (let tries = 0; tries < 8; tries++) { const at = spot(...edges); if (far[at[1] * cols + at[0]] < within) return at; } return null; } // the same, but no further from the middle than this (behind the drop's ring), or nowhere

    // ---- cells: live and die by the count of neighbours ----
    function stepCells() {
      const born = R.born, stay = R.stay, states = R.states, burns = !!R.fuel, young = R.crumbles ? 8 : 0;
      for (let y = 1; y < rows - 1; y++) for (let i = y * cols + 1, end = y * cols + cols - 1; i < end; i++) {
        const s = st[i];
        if (s > 1) { nx[i] = s + 1 < states ? s + 1 : 0; continue; }
        const a = i - cols, b = i + cols, n = (st[a - 1] === 1) + (st[a] === 1) + (st[a + 1] === 1) + (st[i - 1] === 1) + (st[i + 1] === 1) + (st[b - 1] === 1) + (st[b] === 1) + (st[b + 1] === 1);
        if (s === 1) { nx[i] = (stay >> n) & 1 ? 1 : states > 2 ? 2 : 0; continue; }
        if (n && (born >> n) & 1) {
          let from = -1, most = 0; // a newborn takes the ink of the neighbour with the most fuel, and one less of it
          for (let j = 0; j < 8; j++) { const at = i + NEAR8[j]; if (st[at] === 1 && fuel[at] >= most && (!young || age[at] < young)) { most = fuel[at]; from = at; } } // (where corridors crumble, only a young cell passes fuel on: a hole in an old island stays a hole)
          if (from < 0 || (burns && most < 2)) { nx[i] = 0; continue; }
          nx[i] = 1; ink[i] = ink[from]; fuel2[i] = burns ? most - 1 : 0; age[i] = 0;
        } else nx[i] = 0;
      }
      const old = 24, plain = states === 2, crumbles = R.crumbles || 0;
      for (let i = 0; i < N; i++) {
        let s = nx[i]; const was = st[i];
        if (s === 1 && was === 0) fuel[i] = fuel2[i];
        if (crumbles && s === 1 && age[i] > crumbles + (jit[i] >> 1)) s = 0; // old corridors crumble, each cell at its own time, so there is always room to grow into
        if (plain) { flips[i] = (s === 1) !== (was === 1) && (s === 1) === (two[i] === 1) ? Math.min(9, flips[i] + 1) : 0; two[i] = was; } // on, off, on, off: a blinker
        st[i] = s;
        if (plain && flips[i] > 2) tgt[i] = 0.5; // a cell that has blinked three steps running is held at a steady half light until it stops: nothing strobes
        else if (s === 1) { const a = age[i]; if (a < 400) age[i] = a + 1; tgt[i] = a < 2 ? (plain ? 0.85 : 1) : a < old ? 0.75 : 0.55; } else tgt[i] = s ? 0.62 * (1 - (s - 1) / (states - 1)) : 0;
      }
    }
    const ragged = () => [0, 1, 2, 3].map((j) => [0, 1, 2, 3].map((i) => ((i === 1 || i === 2) && (j === 1 || j === 2)) || roll() < 0.4 ? "#" : ".").join("")); // a ragged lump: where the tidy square opens into a clean ring, this goes off like a fireball
    function feedCells(hushed, lively) { // once a step: the bass feeds the bottom rows, and a build sprinkles everywhere
      const bass = sound.bass * lively, build = flow.build, wide = (sym > 1 ? cols / 2 : cols) - 4, any = hushed ? K.planted % 3 : 2; // (in a long quiet stretch the sprinkle takes each ink in turn, so the picture never ends up all one color)
      if (ruleName === "maze") { // islands of corridors along the floor, as big as the bass is loud
        const n = hushed ? 0 : (bass * 0.25 + build * 0.8) * share; for (let k = 0; k < n; k++) if (roll() < n - k) stamp(LIFE_SHAPES.seed, 2 + int(wide), rows - 3 - int(5), 0, 3 + Math.round(bass * 4));
        if (roll() < build * 1.5 * share) { const [x, y] = spot(0.04, 0.5, 0.04, 0.5); stamp(LIFE_SHAPES.seed, x, y, any, Math.round((4 + int(2 + 5 * build)) * lean)); }
      } else if (R.fuel) { // fountains: a ship from the floor that climbs as high as the bass is loud
        const n = hushed ? 0 : (bass * cols * (R.states === 3 ? 0.016 : 0.008) + build * 1.2) * share; for (let k = 0; k < n; k++) if (roll() < n - k) stamp(LIFE_SHAPES.ship, 2 + int(wide), rows - 3, 0, 6 + Math.round(bass * rows * 0.5 * (0.5 + 0.5 * roll())));
        if (roll() < build * build * 1.5 * share) { const [x, y] = spot(); stamp(R.states === 3 && roll() < 0.6 ? ragged() : LIFE_SHAPES.burst, x, y, any, Math.round((3 + int(4 + (R.states === 3 ? 4 : 3) * build)) * lean)); } // (smaller than a kick's: in a build several go off together, and big ones together would light the whole picture at once)
        if (roll() < (flow.calm - 0.15) * (R.states === 3 ? 0.9 : 0.7) * share) stamp(LIFE_SHAPES.ship, 2 + int(cols / 2 - 4), rows - 3 - int(rows * 0.5), int(3), 200); // in a break: slow comets, one after another, all the way up
      } else {
        const n = hushed ? 0 : (bass * 1.6 + build * 3) * share; for (let k = 0; k < n; k++) if (roll() < n - k) stamp(LIFE_SHAPES.triple, 2 + int(wide), rows - 2 - int(4), 0, 0);
        if (roll() < build * 3 * share) { const [x, y] = spot(0.04, 0.5, 0.04, 0.5); stamp(ruleName === "classic" ? (roll() < 0.5 ? LIFE_SHAPES.bloom : LIFE_SHAPES.triple) : LIFE_SHAPES.seed, x, y, any, 0); }
      }
    }
    function kickCells(strong, bar) {
      const [x, y] = spot(), odd = K.planted % 2;
      if (ruleName === "maze") stamp(LIFE_SHAPES.seed, x, y, 1, Math.round((bar ? 7 + 3 * strong : 4) * lean));
      else if (R.states === 3) stamp(ragged(), x, y, 1, Math.round(((bar ? 24 : 14) + 6 * strong) * lean)); // the furnace: every kick is a fireball, the first of a bar a big one
      else if (R.fuel) { if (bar) stamp(LIFE_SHAPES.burst, x, y, 1, Math.round((7 + 8 * strong) * lean)); else stamp(odd ? LIFE_SHAPES.side : LIFE_SHAPES.ship, odd ? 3 : x, odd ? y : rows - 4 - int(8), 1, 40 + int(60)); } // a bar starts with a burst; the other kicks send a ship in from the side or up from the floor
      else if (ruleName === "classic") stamp(bar ? LIFE_SHAPES.bloom : LIFE_SHAPES.glider, bar ? x : 4 + int(cols * 0.3), bar ? y : 3 + int(rows * 0.3), 1, 0);
      else stamp(LIFE_SHAPES.seed, x, y, 1, 0);
    }
    function hatCells() {
      const x = 2 + int(cols - 4), y = 2 + int(rows * 0.8);
      if (ruleName === "maze") stamp(LIFE_SHAPES.seed, x, y, 2, Math.round((3 + int(3)) * lean)); else if (R.fuel) stamp(roll() < 0.5 ? LIFE_SHAPES.dart : LIFE_SHAPES.pin, x, y, 2, Math.round((4 + int(5)) * lean)); else if (ruleName === "classic") stamp(LIFE_SHAPES.corner, x, y, 2, 0); else stamp(LIFE_SHAPES.one, x, y, 2, 0);
    }

    // ---- bloom: crystals, coral and creepers. front is the list of cells that may still grow, each with what it has left: its fuel, how often it has failed, and whether it hangs ----
    const UPWARD = [-cols - 1, -cols, -cols, -cols, -cols + 1, -cols - 1, -cols + 1, -1, 1], NEAR4 = [-cols, -1, 1, cols], NEAR8 = [-cols - 1, -cols, -cols + 1, -1, 1, cols - 1, cols, cols + 1];
    function stepBloom(ageing) {
      const near = R.near === 4 ? NEAR4 : NEAR8, births = [], keep = [], most = 3 * Math.max(30, Math.round(N / 90 / Math.max(1, quicken))); // (most: no more cells than this are born in one step, fewer where the steps come faster, so a whole garden growing at once never lights the picture in a rush)
      if (++K.stamps > 1e9) { K.stamps = 1; mark.fill(0); }
      const stampNo = K.stamps;
      for (let q = 0; q < front.length; q += 2) {
        const f = front[q], e = front[q + 1]; if (st[f] !== 1 || (e & 255) < 2) continue;
        if (coral) { // a coral's tip tries one way a step, mostly upward: it grows on from there, forks now and then, and after four failures is a tip no more
          const tries = (e >> 8) & 255, fuelNow = e & 255, hangs = e & 65536, n = f + UPWARD[int(UPWARD.length)] * (hangs ? -1 : 1), x = n % cols; let grew = false;
          if (n >= cols && n < N - cols && x > 0 && x < cols - 1 && st[n] === 0 && mark[n] !== stampNo) { let c = 0; for (const d2 of near) c += st[n + d2] === 1; if (c === 1) { mark[n] = stampNo; births.push(n, ink[f], (fuelNow - 1) | hangs); grew = true; } }
          if (grew ? roll() < R.chance : tries < 4) keep.push(f, hangs | ((grew ? 0 : tries + 1) << 8) | (fuelNow - 1));
          continue;
        }
        if (births.length >= most) { keep.push(f, e); continue; } // the rest wait their turn
        for (const d of near) {
          const n = f + d, x = n % cols; if (n < cols || n >= N - cols || x === 0 || x === cols - 1 || st[n] !== 0 || mark[n] === stampNo) continue;
          let c = 0; for (const d2 of near) c += st[n + d2] === 1;
          if (c === 1) { mark[n] = stampNo; births.push(n, ink[f], e - 1); } // only where exactly one neighbour is alive: so branches never touch
        }
      }
      for (let k = 0; k < births.length; k += 3) { const n = births[k]; if (st[n]) continue; st[n] = 1; ink[n] = births[k + 1]; fuel[n] = births[k + 2] & 255; age[n] = 0; tgt[n] = 1; keep.push(n, births[k + 2]); }
      front = keep;
      const life = Math.round((R.both ? 230 : coral ? 200 : 36) * trail);
      for (let i = 0; i < N; i++) if (st[i] === 1) { const a = age[i] + (ageing ? 1 : 0), mine = coral ? life - 2 * (70 - fuel[i]) : life; age[i] = a; if (a > mine) { st[i] = 0; tgt[i] = 0; } else tgt[i] = a < 3 ? 1 : a < mine * 0.6 ? 0.75 : 0.55; } // a crystal goes hollow from the middle; a coral, whose tips have the least fuel, draws back from its tips
    }
    function seedBloom(x, y, k, f) { images(x, y, (X, Y) => { if (X > 0 && Y > 0 && X < cols - 1 && Y < rows - 1 && st[Y * cols + X] === 0) front.push(set(X, Y, 1, k, f), f | (R.both && Y < rows / 2 ? 65536 : 0)); }); } // a creeper in the top half grows downward
    function feedBloom(hushed, lively) {
      const bass = sound.bass, build = flow.build, n = hushed ? 0 : (bass * lively * (coral ? 0.5 : 0.7) + build * (coral ? 0.6 : 1.2)) * share; // the bass plants along the floor: frost climbing, or coral
      for (let k = 0; k < n; k++) if (roll() < n - k) seedBloom(1 + int((sym > 1 ? cols / 2 : cols) - 2), R.both && roll() < 0.5 ? 1 : rows - 2, 0, coral ? 20 + int(60 * bass) : 3 + Math.round(bass * 8));
      if (roll() < build * (sym >= 8 ? 1.3 : 2.5) * share) { const [x, y] = spot(0.02, 0.5, 0.02, 0.5); seedBloom(x, y, hushed ? K.planted % 3 : 2, coral ? 10 + int(12) : 4 + int(3 + 5 * build)); } // (each ink in turn through a long quiet stretch)
    }

    // ---- ants ----
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    function newAnts() { // in mirrored twos or fours: a mirror image turns the other way, so together they draw one mirrored picture
      const mirrors = sym >= 4 ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : sym >= 2 ? [[1, 1], [-1, 1]] : [[1, 1]], count = sym >= 4 ? 2 : sym >= 2 ? 3 : 5;
      ants = [];
      for (let k = 0; k < count; k++) { const [x, y] = spot(0.15, 0.48, 0.2, sym >= 4 ? 0.46 : 0.8), d = int(4);
        for (const [fx, fy] of mirrors) { let dd = d; if (fx < 0) dd = (4 - dd) & 3; if (fy < 0) dd = (6 - dd) & 3; ants.push({ x: fx < 0 ? cols - 1 - x : x, y: fy < 0 ? rows - 1 - y : y, d: dd, ink: k % 3, hand: fx * fy, fx, fy, pair: k + 1, hops: 0 }); } }
    }
    function stepAnt(a) {
      const i = a.y * cols + a.x, on = st[i] ? 0 : 1;
      a.d = (a.d + (on ? 1 : -1) * a.hand + 4) & 3;
      st[i] = on; ink[i] = a.ink; age[i] = 0; tgt[i] = on ? 0.75 : 0; if (on && lum[i] < 0.5) lum[i] = 0.5; // fresh paint is the brightest
      a.x += DX[a.d]; a.y += DY[a.d];
      if (a.x < 0 || a.y < 0 || a.x >= cols || a.y >= rows) { // off the edge: it starts again somewhere else (its twin, leaving at the same moment, at the mirror of the same place), so a road never runs round and round the screen
        a.hops = (a.hops % 500) + 1;
        const n = a.pair * 7 + a.hops, x = Math.floor(cols * (sym >= 2 ? 0.1 + 0.38 * spread(n, 2) : 0.1 + 0.8 * spread(n, 2))), y = Math.floor(rows * (sym >= 4 ? 0.1 + 0.38 * spread(n, 3) : 0.1 + 0.8 * spread(n, 3)));
        a.x = a.fx < 0 ? cols - 1 - x : x; a.y = a.fy < 0 ? rows - 1 - y : y;
      }
    }
    function moveAnts(dt, burst) {
      K.antSteps += dt * (40 + 260 * flow.intensity + 420 * flow.build + 240 * sound.bass) * (1 - 0.8 * flow.calm) * quicken + burst; // so many steps a second for each ant, and a kick is a dash
      let n = Math.min(400, Math.floor(K.antSteps)); K.antSteps -= Math.floor(K.antSteps);
      for (; n > 0; n--) for (const a of ants) stepAnt(a);
    }
    function ageAnts() { // once a beat: paint dries, and after a while flakes away, so the grid never fills for good
      const life = Math.round(44 * trail);
      for (let i = 0; i < N; i++) if (st[i]) { const a = ++age[i]; if (a > life) { st[i] = 0; tgt[i] = 0; } else if (a === 6 && tgt[i] > 0.6) tgt[i] -= 0.15; }
    }
    function drawAnt(a) { // a dark ant with a bright head, on its own fresh paint, turned the way it walks
      const legs = LIFE_ANT[(a.x + a.y) & 1], k = a.ink * 5, ox = a.x * 2 - 1, oy = a.y * 2 - 1;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
        const ch = legs[j][i]; if (ch === ".") continue;
        const u = a.d === 0 ? i : a.d === 1 ? 4 - j : a.d === 2 ? 4 - i : j, v = a.d === 0 ? j : a.d === 1 ? i : a.d === 2 ? 4 - j : 4 - i, X = ox + u, Y = oy + v;
        if (X >= 0 && Y >= 0 && X < dotsW && Y < dotsH) out[Y * dotsW + X] = ch === "h" ? ramp[k + 4] : dark;
      }
    }

    // ---- sand: a cell is a grain (255 is a peg, which never moves) ----
    function pegs() { // the furniture: short shelves and slopes, mirrored, for the sand to heap on and spill from
      for (let i = 0; i < N; i++) if (st[i] === 255) { st[i] = 0; tgt[i] = 0; }
      const count = 5 + int(3);
      for (let k = 0; k < count; k++) {
        const len = 5 + int(Math.max(3, cols * 0.07)), x0 = 3 + int(Math.max(1, cols / 2 - len - 4)), y0 = Math.floor(rows * (0.14 + 0.5 * ((k + roll() * 0.6) / count))), slope = [0, 0, 0.5, -0.5, 1][int(5)];
        for (let j = 0; j < len; j++) images(x0 + j, y0 + Math.round(j * slope), (X, Y) => { if (Y > 1 && Y < rows - 2 && X > 0 && X < cols - 1) { const i = Y * cols + X; st[i] = 255; tgt[i] = 0; } });
      }
    }
    function stepSand() {
      K.tick ^= 1;
      const open = K.hatch > 0; // the floor is open: everything runs out, over a couple of seconds
      for (let y = rows - 2; y >= 1; y--) {
        const leftFirst = (y + K.tick) & 1;
        for (let j = 1; j < cols - 1; j++) {
          const x = leftFirst ? j : cols - 1 - j, i = y * cols + x, s = st[i]; if (!s || s === 255) continue;
          if (y === rows - 2) { if (roll() < (open ? 0.6 / quicken : K.drain)) { st[i] = 0; tgt[i] = 0; } continue; }
          const b = i + cols; let to = -1;
          if (!st[b]) to = b; else { const side = roll() < 0.5 ? -1 : 1, one = x + side > 0 && x + side < cols - 1, other = x - side > 0 && x - side < cols - 1; if (one && !st[b + side] && !st[i + side]) to = b + side; else if (other && !st[b - side] && !st[i - side]) to = b - side; } // (never into the two edge columns, which nothing sweeps)
          if (to >= 0) { const air = y < rows - 3 && !st[to + cols]; st[to] = s; ink[to] = ink[i]; tgt[to] = open ? 0.6 : air ? 0.86 : Math.min(0.75, tgt[i]); age[to] = air ? 0 : age[i]; st[i] = 0; tgt[i] = 0; } // a grain falling through the air glints; one that only sinks with its heap stays as dim as it had become
          else if (age[i] < 60000) { const a = ++age[i]; if (a === 12) tgt[i] = 0.75; else if (a === 120) tgt[i] = 0.42; } // at rest it settles: bright while it moves, its own color lying still, and dim once it has lain a couple of seconds, so the heap never becomes one big bright mass
        }
      }
      // the spectrum pours in along the top: each band over its own stretch of columns, the low notes in the middle and the high at the sides, each in its own sand, and more of it on the kick than between
      const bands = sound.bands, rate = (0.05 + 0.3 * flow.intensity + 0.5 * flow.build) * (1 - 0.6 * flow.calm) * (0.3 + 1.4 * clamp(sound.kick));
      for (let x = 1; x < cols - 1; x++) { const b = Math.min(63, Math.floor((sym >= 2 ? Math.abs(x - cx) / cx : x / cols) * 64)), v = bands[b]; if (v > 0.08 && roll() < v * v * rate && !st[cols + x]) { const i = cols + x; st[i] = 1; ink[i] = Math.min(inkCount - 1, Math.floor((b / 64) * inkCount)); age[i] = 0; tgt[i] = 1; } }
      let filled = 0, seen = 0; for (let x = 4; x < cols; x += 8, seen++) for (let y = rows - 2; y > 0 && st[y * cols + x]; y--) filled++; // how high the heap stands, as a part of the screen
      K.heap = filled / (rows * Math.max(1, seen));
    }
    function kickSand(bar) { // a kick tips a scoop of the kick's own sand in from the top, a round lump that falls as one
      const [x] = spot(0.1, 0.5), r = bar ? 4 : 2, k = (K.planted >> 2) % inkCount;
      images(x, 2 + r, (X, Y) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) { const xx = X + dx, yy = Y + dy; if (xx > 0 && xx < cols - 1 && yy > 0 && !st[yy * cols + xx]) { const i = yy * cols + xx; st[i] = 1; ink[i] = k; age[i] = 0; tgt[i] = 1; } } });
    }

    // ---- what they share: the garden, the clock, the ring on a drop, and the picture ----
    function garden(much, first, within) { // what a grid starts with, and what a drop plants behind its ring: much is how big a garden, first says the middle piece is still to come, within how far from the middle it may be planted yet
      const many = (n) => { const all = n * much, whole = Math.floor(all); return whole + (roll() < all - whole ? 1 : 0); };
      if (kind === "cells") {
        if (ruleName === "maze") for (let k = many(5); k > 0; k--) { const at = spotWithin(within, 0.1, 0.5, 0.1, 0.5); if (at) stamp(LIFE_SHAPES.seed, at[0], at[1], k % 3, 7 + int(4)); }
        else if (R.fuel) { if (first) stamp(LIFE_SHAPES.burst, Math.floor(cols * 0.5) - 1, Math.floor(rows * 0.5) - 1, 1, 22); for (let k = many(sym >= 8 ? 1 : sym >= 4 ? 2 : 4); k > 0; k--) { const at = spotWithin(within); if (at) stamp(LIFE_SHAPES.burst, at[0], at[1], k % 3, 10); } }
        else if (ruleName === "classic") for (let k = many(10); k > 0; k--) { const at = spotWithin(within, 0.05, 0.5, 0.06, 0.94); if (at) stamp(k % 3 ? LIFE_SHAPES.bloom : LIFE_SHAPES.glider, at[0], at[1], k % 3, 0); }
        else for (let k = many(5); k > 0; k--) { const at = spotWithin(within, 0.1, 0.5, 0.1, 0.5); if (at) stamp(LIFE_SHAPES.seed, at[0], at[1], k % 3, 0); }
      } else if (kind === "bloom") {
        if (coral) for (let k = many(9); k > 0; k--) { const x = 2 + int(cols - 4), y = R.both && k % 2 ? 1 : rows - 2; if (far[y * cols + x] < within) seedBloom(x, y, k % 3, 45 + int(25)); else if (within < reach * 0.6) { const at = spotWithin(within, 0.1, 0.5, 0.3, 0.7); if (at) seedBloom(at[0], at[1], k % 3, 14 + int(10)); } } // coral: a row of holdfasts on the floor (and while the ring has not reached the floor, a few adrift)
        else { if (first) seedBloom(Math.floor(cx), Math.floor(cy), 1, sym >= 8 ? 18 : 24); for (let k = many(3); k > 0; k--) { const at = spotWithin(within, 0.1, 0.4, 0.1, 0.4); if (at) seedBloom(at[0], at[1], (k + K.gardens) % 3, 10); } } // crystal: one big flake in the middle and a few around it
      } else if (kind === "ants") newAnts();
      else if (sands) pegs();
    }
    function advance(dt) { // the song moves it all on
      const bpm = flow.bpm > 40 ? flow.bpm : 128, calm = flow.calm, hushed = calm > 0.5, rising = flow.part === "build" || flow.build > 0.35, hit = sound.kickHit > 0, strong = Math.min(1.4, sound.kick * (1 + 0.4 * flow.drop)), lively = 0.4 + flow.intensity; // (after a drop the kicks plant bigger for a while)
      // the clock: so many steps a beat, half as many in a break (the picture's own clock already runs at three quarters there), and a kick pulls the next step onto itself
      K.phase += dt * (bpm / 60) * pace * (1 - 0.35 * calm);
      if (hit) K.phase = K.phase - Math.floor(K.phase) > 0.5 ? Math.ceil(K.phase) : Math.floor(K.phase);
      let steps = Math.min(3, Math.floor(K.phase));
      K.phase -= Math.floor(K.phase);
      if (K.ring < 0) {
        if (hit && !hushed) {
          K.kicks = (K.kicks + 1) % 16;
          const bar = K.kicks % 4 === 1;
          K.pulse = 0; K.pulseOf = clamp(strong) * (bar ? 1 : 0.7); // every kick sends a ring of light out from the middle, the first of a bar a brighter one
          if (kind === "cells") kickCells(strong, bar);
          else if (kind === "bloom") { const [x, y] = spot(); if (coral) seedBloom(x, bar ? y : R.both && K.kicks % 2 ? 1 : rows - 2, 1, bar ? 12 : 30 + int(40)); else seedBloom(x, y, 1, bar ? 8 + Math.round(4 * strong) : 3 + Math.round(3 * strong)); } // coral: from the floor, and at the start of a bar a small one adrift
          else if (sands) kickSand(bar);
        }
        if (sound.hatHit && !hushed) for (let n = T.spark; n > 0; n--) if (roll() < n * share) { // a hi-hat sprinkles (more or fewer with the knob for glints on the hi-hats)
          if (kind === "cells") hatCells();
          else if (kind === "bloom") seedBloom(1 + int(cols - 2), 1 + int(rows * 0.85), 2, coral ? 2 + int(5) : 3);
          else if (kind === "ants") images(int(cols), int(rows), (X, Y) => { const i = Y * cols + X; if (!st[i]) { st[i] = 1; ink[i] = 2; age[i] = 0; tgt[i] = 0.75; lum[i] = 1; } }); // a crumb in an ant's way, and one at each mirror image of the spot
          else if (sands) for (let k = 0; k < 3; k++) { const i = cols + 1 + int(cols - 2); if (!st[i]) { st[i] = 1; ink[i] = inkCount - 1; age[i] = 0; tgt[i] = 1; } }
        }
      }
      for (; steps > 0; steps--) {
        const turn = !hushed || (K.slow = (K.slow + 1) % 3) === 0; // in a break what has grown ages one step in three: slowly, but it never stands still, so a song with no drums at all does not fill the grid for good
        if (kind === "cells") { if (K.ring < 0) feedCells(hushed, lively); stepCells(); }
        else if (kind === "bloom") { if (K.ring < 0) feedBloom(hushed, lively); stepBloom(turn && !(coral && rising && !hushed)); } // (coral and creepers do not age through a build: its new shoots come on top of the old growth)
        else if (kind === "ants" && turn) ageAnts();
      }
      if (kind === "ants") moveAnts(dt, hit && !hushed ? 24 : 0);
      if (sands) {
        K.hatch = Math.max(0, K.hatch - dt);
        if (K.ring < 0 && K.sinceDrop >= 64) { K.sinceDrop = 8; K.hatch = 2.6; pegs(); } // a minute with no drop: the floor opens and the shelves are set out afresh, so the hourglass is not the same picture all through a steady song
        K.drain = Math.max(0, (K.heap - (0.1 + 0.2 * flow.build)) * 3); // the floor lets sand through faster the higher the heap stands; a build lets it pile up a little
        K.sandTicks += dt * 48 * (1 - 0.35 * calm) * quicken;
        let n = Math.min(4, Math.floor(K.sandTicks)); K.sandTicks -= Math.floor(K.sandTicks);
        for (; n > 0; n--) stepSand();
      }
      K.sinceDrop = Math.min(99, K.sinceDrop + dt);
      if (K.ring >= 0) { // the drop's ring runs out from the middle, clears what it crosses, and the new garden is planted behind it, a third at a time
        const from = K.ring, quick = 1 - Math.exp(-dt / 0.06), slowOnes = ruleName === "classic" || coral || pace < R.pace;
        K.ring += dt * (reach / 1.9);
        for (let i = 0; i < N; i++) { const r = far[i];
          if (r >= from && r < K.ring) { if (!sands) { st[i] = 0; tgt[i] = 0; } ink[i] = st[i] && st[i] !== 255 ? ink[i] : 1; if (st[i] !== 255) lum[i] = Math.max(lum[i], 0.8); }
          else if (r < from - 3 && r > from - 16 && lum[i] > tgt[i]) lum[i] += (tgt[i] - lum[i]) * quick; } // the ring is three cells wide: behind it the light goes out quickly instead of trailing
        while (K.sown < 3 && K.ring > reach * [0.3, 0.62, 1][K.sown]) { // (the slow rules get a garden two or three times the usual, so the song's biggest moment is not its emptiest picture)
          K.sown++;
          K.gardens = (K.gardens % 30) + 1;
          if (kind !== "ants" && (!sands || K.sown === 3)) garden((slowOnes ? 2.6 : 1.3) / 3, K.sown === 1, K.sown === 3 ? Infinity : K.ring - 4);
        }
        if (K.ring > reach) K.ring = -1;
      }
      if (K.pulse >= 0) { K.pulse += dt * (reach / 0.35); if (K.pulse > reach * 0.8 + 3 || K.ring >= 0) K.pulse = -1; } // the kick's ring runs out in about a third of a second, and makes way for the drop's
    }
    function paint(dt) { // each cell's light eases to where it should be (quickly up, slowly down: the trail) and picks its color from the ramp: the top left dot a shade up and the bottom right a shade down, which makes the bead
      const up = 1 - Math.exp(-dt / R.up), down = 1 - Math.exp(-dt / (R.down * trail * (1 + 0.8 * flow.calm))), hi = bead ? 0.6 : 0.3, lo = bead ? 0.1 : 0.05, rest = dt * 2;
      const P = K.pulse, band = 3.5, ringLight = 0.65 * K.pulseOf * T.react, kickLight = 0.2 * clamp(sound.kick) * T.react; // the kick, shown in the light only: a ring three or four cells wide, bright at its front and fading behind it, and a flash of the living cells
      for (let y = 0, i = 0; y < rows; y++) for (let x = 0, o = y * 2 * dotsW; x < cols; x++, i++, o += 2) {
        const aim = tgt[i], F = tired[i]; let L = lum[i];
        if (F > 0) tired[i] = F > rest ? F - rest : 0;
        if (L !== aim) { if (aim > L) L += (aim - L) * (F > 0 ? up * (1 - 0.85 * F) : up); else { L += (aim - L) * down; if (L > 0.3) tired[i] = 1; } if (Math.abs(aim - L) < 0.004) L = aim; lum[i] = L; } // (a cell that has only just gone dark comes back slowly: nothing blinks)
        if (st[i] === 255) { out[o] = out[o + 1] = pegTones[1]; out[o + dotsW] = out[o + dotsW + 1] = pegTones[0]; continue; }
        const behind = P >= 0 ? P - far[i] : -1, shown = L + (L >= 0.1 ? kickLight : 0) + (behind >= 0 && behind < band ? ringLight * (1 - behind / band) : 0);
        if (shown < 0.1) { out[o] = backdrop[o]; out[o + 1] = backdrop[o + 1]; out[o + dotsW] = backdrop[o + dotsW]; out[o + dotsW + 1] = backdrop[o + dotsW + 1]; continue; }
        const v = shown * 4 + 0.5, k = (L < 0.1 ? 1 : ink[i]) * 5, a = Math.min(4, (v + hi) | 0), b = Math.min(4, (v + lo) | 0), c = (v - lo) | 0, d = (v - hi) | 0;
        out[o] = a ? ramp[k + a] : backdrop[o]; out[o + 1] = b ? ramp[k + b] : backdrop[o + 1]; out[o + dotsW] = c ? ramp[k + c] : backdrop[o + dotsW]; out[o + dotsW + 1] = d > 0 ? ramp[k + d] : backdrop[o + dotsW + 1];
      }
      if (kind === "ants") for (const a of ants) drawAnt(a);
    }
    function frame(dt, again) { // again: the effect is being drawn a second time in one frame (for a picture of it), so nothing moves on
      if (!K.gardens) { K.gardens = 1; if (!flow.dropHit) garden(1, true, Infinity); } // (a grid that starts on a drop starts with the ring)
      if (flow.dropHit && K.ring < 0 && K.sinceDrop > 4) { K.ring = 0; K.sown = 0; K.sinceDrop = 0; if (sands) K.hatch = 2.6; if (kind === "ants") newAnts(); } // one ring for a drop, however many times it lands in its first seconds (the sand's floor opens; new ants start at once, inside the ring)
      if (!again) advance(dt);
      paint(dt);
    }
    function adopt(old) { // the same garden on a grid of another size, when the window changes shape: the middle stays the middle (sand and coral keep their floor), and what no longer fits is let go
      const o = old.kept(), ox = (cols >> 1) - (o.cols >> 1), oy = sands || coral ? rows - o.rows : (rows >> 1) - (o.rows >> 1), where = new Int32Array(o.cols * o.rows).fill(-1);
      for (let y = 1; y < o.rows - 1; y++) for (let x = 1; x < o.cols - 1; x++) {
        const X = x + ox, Y = y + oy; if (X < 1 || Y < 1 || X >= cols - 1 || Y >= rows - 1) continue;
        const a = y * o.cols + x, b = Y * cols + X; where[a] = b; st[b] = o.st[a]; ink[b] = o.ink[a]; fuel[b] = o.fuel[a]; age[b] = o.age[a]; lum[b] = o.lum[a]; tgt[b] = o.tgt[a];
      }
      for (let q = 0; q < o.front.length; q += 2) if (where[o.front[q]] >= 0) front.push(where[o.front[q]], o.front[q + 1]);
      ants = o.ants.map((a) => ({ ...a, x: Math.max(0, Math.min(cols - 1, a.x + ox)), y: Math.max(0, Math.min(rows - 1, a.y + oy)) }));
      Object.assign(K, o.K);
      sym = o.sym;
      if (K.ring >= 0) K.ring *= reach / o.reach;
      if (K.pulse >= 0) K.pulse *= reach / o.reach;
    }
    const kept = () => ({ cols, rows, reach, sym, st, ink, fuel, age, lum, tgt, front, ants, K });
    return { cols, rows, world: worldName, rule: ruleName, img, K, tones, dials, frame, adopt, kept };
  }
  const lifeNow = { grid: null, seen: -1, screen: null, soft: null, old: null, fade: 0 }; // the grid showing, the moment it was last moved on, the small screen it was last drawn on, the small smoothed copy for the glow, and the last picture going away over a new world or a grid of another size
  function livingGrid() {
    const now = lifeNow, dot = Math.max(2, Math.round(Math.sqrt((w * h) / 57600))), S = pixelScreen(2 * Math.floor(w / dot / 2)), cols = S.across >> 1, rows = S.down >> 1; // about 14,400 cells whatever the picture's shape: 160 by 90 on a wide one, 75 by 150 on a phone
    const again = sound.t === now.seen, dt = again ? 0 : Math.min(0.25, Math.max(0, sound.dt)), worldName = musicWorld() || "dish", world = LIFE_WORLDS[worldName], ruleNo = Math.round(V.rule || 0) % 3, ruleName = ruleNo ? world.also[ruleNo - 1] : world.rule; // (the version's rule dial: 0 the world's own rule-set, 1 and 2 its other two)
    now.seen = sound.t;
    let L = now.grid;
    if (!L || L.world !== worldName || L.rule !== ruleName || L.cols !== cols || L.rows !== rows) {
      const next = lifeGrid(cols, rows, worldName, ruleName), same = L && L.world === worldName && L.rule === ruleName, last = now.screen;
      if (same) next.adopt(L); // only the window's shape changed: the garden goes along
      else if (L) { next.K.phase = L.K.phase; next.K.kicks = L.K.kicks; } // another world or rule-set: a new garden, at the same place in the song
      if (L && last && (L.world !== worldName || (same && Math.abs(cols * rows - L.cols * L.rows) > 0.1 * L.cols * L.rows))) { // another kind of music, or a grid of quite another size all at once (the app makes its picture smaller on a slow machine, and the cells change size with it): the last picture is kept, and goes away over the new one in a second or two. A window being dragged changes a column at a time and needs none of this
        if (!now.old || now.old[0].width !== last.across || now.old[0].height !== last.down) now.old = paper(last.across, last.down);
        now.old[1].globalCompositeOperation = "copy";
        now.old[1].drawImage(last.c, 0, 0);
        now.fade = 1;
      }
      L = now.grid = next;
    }
    now.screen = S;
    const s = Math.round(V.sym || 0);
    L.dials(s >= 6 ? 8 : s >= 3 ? 4 : s >= 1 ? 2 : 0, V.trail || 1, V.pace || 1, (V.bead ?? 1) > 0.5 ? 1 : 0);
    L.tones((V.hue || 0) * world.turns);
    L.frame(dt, again);
    S.x.putImageData(L.img, 0, 0);
    if (now.fade > 0) {
      S.x.globalAlpha = eased(now.fade);
      S.x.drawImage(now.old[0], 0, 0, S.across, S.down);
      S.x.globalAlpha = 1;
      now.fade -= dt / 1.6;
    }
    S.show();
    if (!now.soft || now.soft[0].width !== S.across >> 2 || now.soft[0].height !== S.down >> 2) now.soft = paper(Math.max(1, S.across >> 2), Math.max(1, S.down >> 2));
    const [soft, sx] = now.soft; // the glow: the same picture a quarter the size, smoothed, laid softly over the dots
    sx.globalCompositeOperation = "copy";
    sx.drawImage(S.c, 0, 0, soft.width, soft.height);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.35 + 0.2 * clamp(sound.kick) * T.react; // and the glow swells a little on the kick
    g.drawImage(soft, 0, 0, w, h);
    g.restore();
  }
  /* ==== life: end ==== */
  /* ==== beings: begin ==== */
  /* Beings: somebody gathers out of a tunnel of flower rings, opens its eyes, looks at you and comes apart again. Its body is the shadow of a shape that has four dimensions, turning through itself;
     in each of its great eyes lives the next being, and now and then the view falls into that eye and the one inside takes over. All of it is lines, in the mood's three tones.
     A being is some thirty numbers, and every one of them can glide to another being's, so one changes into the next while you watch. A quiet part shows only the tunnel. */
  FOLK_OF.beings = ["shapes", "neon", "jelly", "shapes"]; // (the visitor that is one great eye would be an eye too many here)
  const beingsFx = (() => { // everything of this effect is kept in here, so none of its names can meet another effect's
    const WHITE = [255, 255, 255], NIGHT = [3, 3, 10], TRAIL = 0.42, IRIS = 0.66, PUPIL = 0.52, FITS = 1.3; // how much of the last frame each new one wipes away (as Shapes in space does); the iris against the eye's half-width; the pupil against the iris; how many units of a being fit across a pupil's radius
    const step = (a, b, x) => eased(clamp((x - a) / (b - a))), toward = (rate, dt) => 1 - Math.exp(-rate * dt), pick = (list) => list[Math.floor(Math.random() * list.length)];
    const blob = (px, py, r, tone, strength) => { if (r >= 0.5 && strength >= 0.004) softBlob(g, px, py, r, tone, Math.min(1, strength)); }; // a soft round light, or with the night's color a soft round dark; nothing at all when there'd be nothing to see

    // The body: the 24 corners of the shape called a 24-cell, in four dimensions. The first 16 are a four-dimensional cube's and the last 8 a four-dimensional diamond's, so one set of numbers makes both shapes and anything between
    const CORNERS = [], EDGES = [[], [], []], PLANES = [[0, 1], [2, 3], [0, 2], [1, 3], [1, 2], [0, 3]]; // the cube's 32 edges, the 64 that join cube and diamond, the diamond's 24; and the six ways it can turn, three of which turn it through itself
    for (let i = 0; i < 16; i++) CORNERS.push([i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5, i & 8 ? 0.5 : -0.5]);
    for (let a = 0; a < 4; a++) for (const s of [-1, 1]) { const c = [0, 0, 0, 0]; c[a] = s; CORNERS.push(c); }
    for (let a = 0; a < 16; a++) for (let b = a + 1; b < 16; b++) { const d = a ^ b; if ((d & (d - 1)) === 0) EDGES[0].push([a, b]); }
    for (let c = 16; c < 24; c++) for (let a = 0; a < 16; a++) if (CORNERS[a][(c - 16) >> 1] * ((c - 16) & 1 ? 1 : -1) > 0) EDGES[1].push([c, a]);
    for (let a = 16; a < 24; a++) for (let b = a + 1; b < 24; b++) if ((a - 16) >> 1 !== (b - 16) >> 1) EDGES[2].push([a, b]);
    const KINDS = { tess: [1, 0, 0, 1], cell16: [0, 0, 1, 1.2], cell24: [0.9, 0.5, 0, 1], star: [0.8, 0, 0.9, 1.7], web: [0.25, 0.75, 0.5, 1.3], cage: [1, 0.3, 0.7, 0.62] }; // each kind of body: how bright the cube's edges, the joining ones and the diamond's are, and how far out the diamond's corners stand
    const pointed = (kind) => kind === "cell16" || kind === "star" || kind === "web"; // bodies that show as a triangle or a star of rays (the web too, from many sides: round one eye it stands as a pyramid)

    function born() { // a new being, picked by chance within what the version's dials ask for
      const one = !pointed(V.body) && (V.eyes === "one" || (V.eyes !== "two" && Math.random() < 0.2)); // two eyes are the rule: a pair is what makes it somebody. One great eye in a pointed body would be an emblem and not a creature, so those bodies always get two
      const kind = KINDS[V.body] ? V.body : pick(Object.keys(KINDS).filter((k) => !(one && pointed(k)))), [tess, web, cross, spike] = KINDS[kind];
      const winged = one || Math.random() < 0.75, arms = pick([5, 5, 6, 6, 7, 8, 8, 10, 12]), corner = Math.random() < 0.75 ? rnd(0.5, 1) : 0; // (a one-eyed being is always the same left and right, or it is only a flower with an eye in it)
      return { kind, tess, web: corner ? Math.min(0.5, web) : web, cross: one ? Math.min(0.35, cross) : cross, spike, // (with eyes at its corners the joining edges are kept faint, or it is a tangle; and round a single eye the diamond is kept faint, or it frames the eye like a badge)
        far: rnd(2.3, 3.3), size: rnd(0.36, 0.46), spin: [rnd(-0.25, 0.25), rnd(0.2, 0.5) * pick([-1, 1]), rnd(-0.3, 0.3), rnd(-0.45, 0.45), rnd(-0.2, 0.2), rnd(0.15, 0.45) * pick([-1, 1])], // how near the eye that sees it stands in the fourth dimension (nearer is stranger), how big the body is, how fast it turns each of the six ways
        arms, reach: rnd(0.55, 0.9), curl: rnd(0.2, 1.2) * (winged && arms <= 6 ? 1 : pick([-1, 1])), wide: rnd(0.08, 0.18), waist: rnd(0, 0.75), sway: rnd(0.12, 0.35), // limbs: how many, how long, how curled, how wide, how pinched where they join the body (0: a tentacle, 1: a leaf), how much they wave
        sym: winged ? rnd(0.75, 1) : rnd(0, 0.15), wing: [rnd(-0.5, 0.6), rnd(-0.8, 0.8), rnd(-0.6, 0.6)], hang: !winged ? 0 : arms <= 6 ? rnd(0, 0.9) : rnd(-0.5, 0.9), // 0: a flower, limbs alike and swirling one way; 1: the same left and right, limbs longer here and shorter there, hanging like a cloak or lifting like flames. With few limbs they never lift or curl upwards: one lifted pair is a pair of horns, and an upper pair curled together over a level pair stands as a cross
        inner: Math.random() < 0.7 ? rnd(0.25, 0.45) : 0, tips: arms <= 8 && Math.random() < 0.4 ? 1 : 0, // a second row of shorter petals between the limbs; an eye near the tip of each limb, when there aren't too many limbs for that
        ...(one ? { eye: rnd(0.27, 0.34), apart: 0 } : { eye: rnd(0.17, 0.21), apart: rnd(0.24, 0.29) }), slant: rnd(-0.1, 0.14), round: rnd(0.62, 1), // the great eye, or two of them this far from the middle: how wide, how slanted, how round
        corner, rings: rnd(1, 3.99), ringR: rnd(0.86, 1), tilt: rnd(0.25, 1.1), rays: pick([0, 12, 16, 24, 32]), rayLen: rnd(0.12, 0.3), // how many of the eight eyes at the body's corners can open; the halo behind it: rings, how big, how tilted, and the rays round it
        tone: Math.floor(rnd(0, 3)) }; // which of the three tones is which
    }
    const suits = (G) => (!KINDS[V.body] || G.kind === V.body) && (V.eyes === "two" ? G.apart > 0 : V.eyes !== "one" || !G.apart || pointed(V.body)); // is this being one the version's dials would have made?
    const KEPT = new Set(["kind", "rays", "tone"]); // these don't glide: the rays shrink away and grow back as another number of them, and the tones stay as they are
    function between(a, b, u) { // the being that is this far from one to another
      const o = {};
      for (const k in b) o[k] = KEPT.has(k) ? (u < 0.5 ? a[k] : b[k]) : Array.isArray(a[k]) ? a[k].map((v, i) => v + (b[k][i] - v) * u) : a[k] + (b[k] - a[k]) * u;
      o.dip = Math.abs(1 - 2 * u);
      return o;
    }
    const alive = (G) => ({ G: { ...G, dip: 1 }, from: null, to: null, u: 0, takes: 5, ang: Array.from({ length: 6 }, () => rnd(0, TAU)), lid: 0, lidV: 0, blink: sound.t + rnd(2, 5), shut: 0, look: [0, 0], seed: rnd(0, 100), reach: 0, reachV: 0 }); // a being and what it's doing: its numbers (and where they are gliding from and to), how far it has turned, its lids, its next blink, where it looks, how far its limbs are flung
    const glide = (b, G) => { b.from = { ...b.G }; b.to = { ...G, tone: b.G.tone }; b.u = 0; };

    let S = null, tones = null, unit = 1; // all that's kept from frame to frame; the mood's three tones and the size of one unit of a being, for this frame
    const chain = () => S.line.forEach((b, i) => { if (i) b.G.tone = (S.line[i - 1].G.tone + 1) % 3; }); // each being's colors are one step round from those of the being whose eye it lives in
    const lobes = () => Math.max(3, Math.round(S.line[0].G.arms));
    const stir = (n) => (n === 0 ? 1 : n === 1 && S.falling ? eased(S.fall) : 0); // how much of a drop's stir a being feels: the one that's here all of it, and the one we are falling into takes it over as it takes the picture over
    function begin() { // a fresh start: three beings, one inside the other's eye, none of them here yet, and the tunnel
      S = { line: [alive(born()), alive(born()), alive(born())], here: 0, present: false, away: 0, lone: 12, visit: 0, rest: 1, fall: 0, falling: false, clock: 0, arrived: false, nextFall: 8, nextGlide: 14, flare: 0, warm: 0, lock: 0, phase: 0, speed: 0.3, rings: [], made: 0, widest: 2.3, at: sound.t };
      chain();
      for (let k = 0; k < 16; k++) S.rings.push({ k, lobes: lobes(), tone: k % 3, twist: (k * 0.31) % TAU, way: k % 2 ? 1 : -1, id: k });
    }

    function update() { // the numbers move on by the clock
      const dt = Math.min(0.4, sound.dt), { t, kick, bass } = sound, B = S.line[0], building = flow.part === "build" || flow.build > 0.35, soft = S.visit > 0;
      // Is somebody here? Yes from the moment a drop lands or the song is high (but not for a build's own climbing: there it must wait for the drop), and no only once it has been quiet for a while: a song wavers, and a being that came and went with every waver would never be anybody
      if (flow.part === "drop" || (flow.intensity > 0.5 && !building)) { S.present = true; S.away = 0; }
      else if (flow.calm > 0.6 || flow.intensity < 0.3) { S.away += dt; if (S.away > 1.5) S.present = false; }
      else S.away = 0;
      // and in music with no kick at all, or a very long quiet part, one comes by anyway after a while, slowly, stays half a minute and goes
      if (S.here > 0.97) S.lone = 0; else if (!building) S.lone += dt;
      if (S.present) S.visit = 0;
      else if (!soft && !building && S.lone > 20) S.visit = rnd(20, 30);
      else if (soft && S.here > 0.97) S.visit = Math.max(S.falling ? 0.01 : 0, S.visit - dt); // (it never leaves in the middle of a fall)
      const staying = S.present || S.visit > 0 ? 1 : 0, want = S.falling ? 1 : Math.max(staying, 0.85 * clamp((flow.build - 0.25) / 0.6)); // through a build it gathers as far as the build has climbed; a build never takes apart one that's here
      S.here += Math.max(-dt / 3.2, Math.min(dt / (S.present ? 1.1 : 6), want - S.here)); // quickly on a drop, slowly through a build or on a visit; and it leaves in about three seconds
      S.rest = Math.min(1, S.rest + dt / 2.5); // after a fall the new being hangs still for a moment, then floats again
      S.flare += (flow.drop - S.flare) * toward(flow.drop > S.flare ? 7 : 3, dt);
      S.lock += ((S.here > 0.93 ? 1 : 0) - S.lock) * toward(2.5, dt); // its look wanders while it gathers, and settles on you once it's here
      S.warm += (0.6 * clamp(B.reach) + 0.4 * S.flare - S.warm) * toward(1.3, dt); // the glow behind it swells with the kick and the drop, but slowly: it lies over most of the picture, and that much must never jump
      // the tunnel of flowers flows outwards, and inwards through a build, into the being that is gathering there. A ring that leaves is born again at the other end with as many petals as the being has limbs
      const inward = flow.part === "drop" ? 0 : step(0.28, 0.45, flow.build), out = 0.15 + 0.45 * flow.intensity + 0.5 * flow.drop;
      S.speed += (out + (-(0.3 + 0.7 * flow.build) - out) * inward - S.speed) * toward(1.6, dt); // rings a second
      S.phase += dt * S.speed;
      for (const r of S.rings) r.twist = (r.twist + dt * 0.05 * r.way) % TAU; // each ring turns slowly, the other way from its neighbours
      while (S.phase >= 1) { S.phase -= 1; for (const r of S.rings) r.k++; S.rings.pop(); const first = S.rings[0]; S.rings.unshift({ k: 0, lobes: lobes(), tone: (first.tone + 2) % 3, twist: (first.twist - 0.31) % TAU, way: -first.way, id: (S.made = (S.made + 1) % 97) }); }
      while (S.phase < 0) { S.phase += 1; for (const r of S.rings) r.k--; S.rings.shift(); const last = S.rings[S.rings.length - 1]; S.rings.push({ k: last.k + 1, lobes: lobes(), tone: (last.tone + 1) % 3, twist: (last.twist + 0.31) % TAU, way: -last.way, id: (S.made = (S.made + 1) % 97) }); }
      // every being in the line lives: it turns, blinks, looks about
      S.line.forEach((b, n) => {
        const G = b.G, speed = (0.3 + 0.9 * flow.intensity + 0.8 * S.flare) * (n ? 0.8 : 1 + 2.5 * (1 - S.here) ** 2) * (V.spin ?? 1);
        for (let i = 0; i < 6; i++) b.ang[i] = (b.ang[i] + dt * G.spin[i] * speed) % TAU;
        if (S.falling && n < 2) b.blink = Math.max(b.blink, t + 1.5); // nobody blinks while we fall through an eye: a lid as big as the picture would be a flash
        if (!n && b.lid < 0.8 && t >= b.shut) b.blink = Math.max(b.blink, t + 2); // until its eyes are wide open the next blink waits, so it never blinks in the first two seconds after they open: that is when it looks at you (and a late frame, in which they open all at once, doesn't cut that short)
        if (t > b.blink || b.blink > t + 9) { b.blink = t + rnd(2.6, 6.5); b.shut = t + 0.15; }
        const quick = t < b.shut, open = n ? 1 : S.falling ? 1.12 : soft ? step(0.6, 0.97, S.here) : S.here > 0.93 ? 1 : S.here > 0.3 ? 0.1 * flow.build : 0, aim = quick ? 0.04 : open, closing = aim < b.lid; // the great eye: a slit as it gathers, wide open the moment it's here (or, on a slow visit, opening as it comes)
        const stiff = quick ? 420 : closing ? 14 : 90, damp = quick ? 36 : closing ? 7 : 11; // a blink is quick; opening is a spring with a little bounce; closing for good, as it leaves, is slow
        for (let left = dt; left > 1e-6; left -= 1 / 120) { // (both springs in small steps, so a late frame doesn't throw them)
          const d = Math.min(left, 1 / 120);
          b.lidV += ((aim - b.lid) * stiff - b.lidV * damp) * d;
          b.lid = Math.max(0, Math.min(1.25, b.lid + b.lidV * d));
          b.reachV += ((kick * 0.5 + bass * 0.5 + 0.55 * S.flare * stir(n) - b.reach) * 60 - b.reachV * 9) * d; // the limbs fling out on the kick and on the drop
          b.reach += b.reachV * d;
        }
        if (!Number.isFinite(b.lid + b.lidV + b.reach + b.reachV)) b.lid = b.lidV = b.reach = b.reachV = 0;
        const wander = 1 - 0.8 * (n ? 1 : S.lock);
        b.look = [Math.sin(t * 0.53 + b.seed) * 0.6 * wander, Math.sin(t * 0.37 + b.seed * 2) * 0.3 * wander];
        if (b.to) { b.u = Math.min(1, b.u + dt / b.takes); b.G = between(b.from, b.to, eased(b.u)); if (b.u >= 1) { b.G = { ...b.to, dip: 1 }; b.to = null; } }
      });
      // now and then, while it's here, the being glides into another one, or the view falls into its eye. Never both at once, and not in a quiet part or a build unless it's one of the slow visits
      const kicking = flow.since < (flow.bpm ? 132 / flow.bpm : 1.4), high = S.here > 0.97 && (soft || (flow.part !== "calm" && !building && kicking)), free = high && !S.falling && !B.to; // (no kick for two beats and more: the song is going quiet, and nothing new is begun)
      if (high && !S.arrived) { S.arrived = true; S.clock = 0; S.nextFall = rnd(6.5, 9); S.nextGlide = rnd(13, 17); } // it has just arrived: the clock of its stay starts
      if (S.here < 0.5) S.arrived = false;
      if (high) S.clock += dt;
      if (free && S.clock > S.nextGlide) { glide(B, born()); S.nextGlide = S.clock + rnd(14, 22); }
      else if (free && B.lid > 0.8 && !(soft && S.visit < 12) && (S.clock > S.nextFall || (flow.dropHit && S.clock > 4))) { S.falling = true; S.nextFall = S.clock + rnd(13, 19); } // (a drop that finds it long here sends us into its eye at once)
      if (S.falling) {
        S.fall += dt * (0.12 + 0.08 * (S.present || soft ? flow.intensity : 1)); // about six seconds a fall, and no longer when the song has gone quiet under it
        if (S.fall >= 1) { S.fall = 0; S.falling = false; S.line.shift(); S.line.push(alive(born())); chain(); S.line[0].blink = t + 2; S.rest = 0; S.nextGlide = Math.max(S.nextGlide, S.clock + rnd(8, 12)); } // (and the one that has just taken over is left as it is for a while before it changes)
      }
      // when the version's dials change, beings they wouldn't have made glide into ones they would; one that nobody can see yet is simply swapped. The one that's here waits out the first seconds of a drop, so its eyes open on you before it starts to change
      S.line.forEach((b, n) => {
        if (suits(b.to || b.G)) return;
        if (n === 2 || (n === 0 && S.here < 0.08)) { S.line[n] = alive(born()); chain(); }
        else if (!b.to && (n || (!S.falling && flow.drop < 0.75))) glide(b, born());
      });
    }

    // ---- drawing
    const line = (path, tone, light, wide, soft) => { // a bright narrow line; under the ones that matter most (body, lids, iris) a faint wide one first, for a glow: "soft" is how much of that, 0 to 1. Brighter than 1 is the narrow one drawn again
      if (light < 0.01) return;
      if (light * soft > 0.05) { g.strokeStyle = rgba(tone, Math.min(1, light * 0.22 * soft)); g.lineWidth = wide * 3.4; g.stroke(path); }
      g.strokeStyle = rgba(mix(tone, WHITE, 0.25), Math.min(1, light)); g.lineWidth = wide; g.stroke(path);
      if (light > 1.05) { g.strokeStyle = rgba(mix(tone, WHITE, 0.25), Math.min(1, light - 1)); g.stroke(path); }
    };
    function curve(path, pts, closed) { // a smooth line through a few points: each point pulls the line towards it, and the line passes half way between neighbours
      const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (closed) { path.moveTo(...mid(pts[n - 1], pts[0])); for (let i = 0; i < n; i++) path.quadraticCurveTo(...pts[i], ...mid(pts[i], pts[(i + 1) % n])); }
      else { path.moveTo(...pts[0]); for (let i = 1; i < n - 1; i++) path.quadraticCurveTo(...pts[i], ...(i === n - 2 ? pts[n - 1] : mid(pts[i], pts[i + 1]))); }
    }
    function smallEye(x, y, e, open, turn, tone, light, soft) { // one of the many small eyes: two lids, an iris and a bright pupil
      if (open < 0.05 || e < 1.5 || light < 0.02) return;
      const H = e * 0.55 * Math.min(1, open), c = Math.cos(turn), s = Math.sin(turn), lids = new Path2D(), at = (px, py) => [x + px * c - py * s, y + px * s + py * c], r = Math.min(e * 0.48, H * 0.92);
      lids.moveTo(...at(-e, 0)); lids.quadraticCurveTo(...at(0, -H * 2), ...at(e, 0)); lids.quadraticCurveTo(...at(0, H * 2), ...at(-e, 0));
      g.globalCompositeOperation = "source-over"; g.fillStyle = rgba(NIGHT, 1); g.fill(lids);
      g.globalCompositeOperation = "lighter";
      line(lids, tone, light, Math.max(0.8, e * 0.09), soft);
      g.strokeStyle = rgba(mix(tone, WHITE, 0.4), Math.min(1, light)); g.lineWidth = Math.max(0.7, e * 0.07); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      g.fillStyle = rgba(mix(tone, WHITE, 0.75), Math.min(1, light)); g.beginPath(); g.arc(x, y, r * 0.42 * (1 + 0.3 * sound.kick), 0, TAU); g.fill();
    }

    function drawTunnel(cx, cy, U, light, clear, watch) { // the flower tunnel: rings of petals, each a third bigger than the one inside it and a little turned from it. "clear" is how far out the being has taken the place for itself; "watch" opens eyes on the petals
      if (light < 0.01) return;
      const { t, kick, bass } = sound, paths = [new Path2D(), new Path2D(), new Path2D()], shade = [0, 0, 0], far = (Math.hypot(w, h) / 2 / U) * 1.15, eyes = [], deep = 0.13 + 0.1 * bass + 0.05 * kick;
      for (const r of S.rings) {
        const pos = r.k + S.phase, R = 0.07 * 1.33 ** pos, a = clamp(pos / 2) * step(clear * 0.75, clear * 1.2 + 0.01, R) * (0.4 + 0.6 * clamp(R / 1.2));
        if (R > far || a < 0.02) continue;
        const m = r.lobes, n = m * 6, twist = r.twist + pos * 0.06, pts = [];
        for (let i = 0; i < n; i++) { const th = twist + (i / n) * TAU, rr = R * U * (1 + deep * (2 * Math.abs(Math.cos((m * (i / n) * TAU) / 2)) ** 0.8 - 1)); pts.push([cx + Math.sin(th) * rr, cy - Math.cos(th) * rr]); } // round petals with sharp folds between them, a point always in each fold
        curve(paths[r.tone], pts, true);
        shade[r.tone] = Math.max(shade[r.tone], a);
        if (watch > 0.02 && R > 0.8 && R < 1.9) for (let j = 0; j < m; j++) { const th = twist + (j / m) * TAU, rr = R * U * (1 + deep * 0.45); eyes.push([cx + Math.sin(th) * rr, cy - Math.cos(th) * rr, Math.min(R * 0.06, 0.07) * U, th, r.tone, a * step(0.8, 1, R) * (1 - step(1.6, 1.9, R)), j + r.id * 3]); }
      }
      g.globalCompositeOperation = "lighter";
      paths.forEach((path, n) => line(path, tones[n], light * shade[n] * (0.8 + 0.12 * kick) * (1 - 0.6 * clamp(clear)), Math.max(1, unit / 227), 0));
      for (const [x, y, e, th, tn, a, i] of eyes) smallEye(x, y, e, watch * clamp(0.2 + 1.3 * Math.sin(t * 0.9 + i * 1.7)), th, tones[(tn + 1) % 3], light * a * 0.55, 0); // opening and shutting in a ripple
    }

    function pupilAt(b, side, here) { // where an eye's pupil is from the middle of that eye, in the being's units: it follows the look, and the eye's slant turns it
      const G = b.G, W = G.eye * step(0.3, 0.8, here), Hu = W * 0.5 * G.round * Math.min(1.12, b.lid), px = b.look[0] * W * 0.3, py = b.look[1] * W * 0.3 - Hu * 0.072, sl = -side * G.slant, c = Math.cos(sl), sn = Math.sin(sl);
      return [px * c - py * sn, px * sn + py * c];
    }
    function greatEye(b, n, ex, ey, W, side, U, s, light, eyeL, tone, wide, lead) { // a great eye: lids, an iris of fibres, and a dark pupil with the next being living in it. "lead" is the eye the view falls into
      const G = b.G, { t, kick, bass } = sound, agape = lead ? 1 + 1.5 * step(0.3, 0.9, S.fall) : 1, Hu = W * 0.5 * G.round * Math.min(1.12, b.lid) * agape, Hl = Hu * 0.82, sl = -side * G.slant, c = Math.cos(sl), sn = Math.sin(sl), at = (px, py) => [ex + px * c - py * sn, ey + px * sn + py * c]; // (falling in, the lids draw right back and the pupil opens until it is wider than the picture: by the end nothing of this eye may be left in sight)
      const lids = new Path2D(), crease = new Path2D(), glow = step(0.1, 0.3, s) / Math.max(1, s) ** 0.8, veil = lead ? 1 - step(0.72, 0.97, S.fall) : 1; // inside an eye the picture is wiped clean each frame; as we fall through, that wipe fades away and leaves the soft wipe of the whole picture, so nothing changes when the being inside takes over
      lids.moveTo(...at(-W, 0)); lids.quadraticCurveTo(...at(0, -Hu * 2), ...at(W, 0)); lids.quadraticCurveTo(...at(0, Hl * 2), ...at(-W, 0)); lids.closePath();
      crease.moveTo(...at(-W * 1.04, -Hu * 0.3)); crease.quadraticCurveTo(...at(0, -Hu * 2.75 - W * 0.06), ...at(W * 1.04, -Hu * 0.3));
      g.globalCompositeOperation = "source-over";
      blob(ex, ey, W * 1.7, NIGHT, 0.85 * clamp(eyeL * 2)); // a little dark round the eye, so it's the eye that's seen first
      g.fillStyle = rgba(NIGHT, veil); g.fill(lids);
      const Rp0 = W * IRIS * PUPIL, Rp = Rp0 * (1 + 0.16 * kick - 0.1 * bass) * (lead ? 1 + (S.widest - 1) * step(0.45, 0.95, S.fall) : 1), Ri = Math.max(W * IRIS, Rp * 1.1), pu = pupilAt(b, side, n ? 1 : S.here), ix = ex + pu[0] * U, iy = ey + pu[1] * U;
      if (Hu > 1.2) {
        g.save(); g.clip(lids);
        g.globalCompositeOperation = "lighter";
        blob(ix, iy, Ri * 1.5, tone(2), (0.3 * eyeL) / Math.max(1, s) ** 0.7 + (lead ? 0.13 * eyeL * step(0.4, 0.58, S.fall) * (1 - step(0.6, 0.85, S.fall)) : 0)); // the iris glows; and half way down a fall it glows more, because the being we are leaving has gone faint and the one inside is still small, and the picture would go dark for a second
        const iris = new Path2D(), fibres = new Path2D(), nf = W < 40 ? 16 : 36, huge = 1 + 1.4 * step(1.5, 4.5, s); // (an eye we are falling into has nothing round it to light the picture, so its iris is drawn brighter)
        iris.arc(ix, iy, Ri, 0, TAU); iris.moveTo(ix + Ri * 0.8, iy); iris.arc(ix, iy, Ri * 0.8, 0, TAU);
        for (let i = 0; i < nf; i++) { const a = (i / nf) * TAU + (t * 0.1) % TAU, in0 = Rp * 1.12, out = Ri * (0.74 + 0.2 * Math.sin(i * 2.4 + t * 0.9) ** 2); fibres.moveTo(ix + Math.cos(a) * in0, iy + Math.sin(a) * in0); fibres.lineTo(ix + Math.cos(a + 0.12) * out, iy + Math.sin(a + 0.12) * out); }
        line(fibres, tone(0), eyeL * 0.55 * huge, wide * 0.7, glow);
        line(iris, tone(2), eyeL * 0.9 * huge, wide, glow);
        g.globalCompositeOperation = "source-over"; g.fillStyle = rgba(NIGHT, veil); g.beginPath(); g.arc(ix, iy, Rp, 0, TAU); g.fill();
        g.save(); g.beginPath(); g.arc(ix, iy, Rp, 0, TAU); g.clip();
        const small = Rp0 / FITS / U, inS = s * small, inU = U * small, wiped = 1 - (1 - TRAIL) * (1 - veil) ** 2, inLight = Math.min(2.4, (light * wiped) / TRAIL); // the one inside is this much smaller, so its halo fits the pupil. Out in the picture the soft wipe lets each frame's lines add up to 1 / TRAIL times their light; in here they're wiped clean, so they're drawn that much brighter to match
        if (lead && S.fall > 0.5) drawTunnel(ix, iy, inU, inLight * step(0.35, 0.95, inS) * step(3, 6.5, s), 1.3, 0); // (its own tunnel only from half way down: before that it's too small to be seen)
        drawBeing(n + 1, ix, iy, inU, inS, n || lead ? inLight : inLight * (1 - step(1.3, 2.2, s))); // (falling into one eye, the being in the other isn't drawn for long)
        g.restore();
        g.globalCompositeOperation = "lighter";
        const ring = new Path2D(); ring.arc(ix, iy, Rp, 0, TAU);
        line(ring, mix(tone(2), WHITE, 0.3), eyeL, wide, glow);
        blob(ix - Rp * 0.75, iy - Rp * 0.8, Rp * 0.5, WHITE, 0.55 * eyeL * (lead ? 1 - step(0.05, 0.3, S.fall) : 1)); // the wet light on it
        g.restore();
      }
      g.globalCompositeOperation = "lighter";
      line(crease, tone(0), eyeL * 0.45 * clamp(b.lid * 2 - 0.6), wide * 0.8, 0);
      line(lids, mix(tone(0), WHITE, 0.2), eyeL * 1.1, wide * 1.3, glow);
    }

    function drawBeing(n, cx, cy, U, s, light) { // being n of the line, its middle at cx, cy, one of its units U dots long; s is its size against a being seen whole (below 1: one inside an eye; above 1: one we are falling into)
      const b = S.line[n];
      if (!b || U < 3 || light < 0.01) return;
      const G = b.G, { t, kick, bass } = sound, tone = (k) => tones[(k + G.tone) % 3], here = n ? 1 : S.here;
      g.globalCompositeOperation = "lighter";
      if (U < 7) { blob(cx, cy, U * 1.3, tone(0), 0.6 * light); return; } // too small to be more than a glimmer
      const leaves = 1 - step(2.5, 7, s), detail = step(0.14, 0.5, s), wide = Math.max(0.7, (unit / 235) * Math.min(1.8, Math.max(0.35, s ** 0.6))), big = Math.max(1, s), L = (light * leaves) / big ** 0.3, glow = step(0.1, 0.3, s) / big ** 0.8; // falling in, the being we pass goes faint (and fainter the bigger it is, so the picture doesn't brighten as its lines grow across it); a small one is drawn plainer. And the glow under its lines: none for a tiny one, less as it grows in a fall
      g.lineCap = g.lineJoin = "round";
      blob(cx, cy, U * 1.7, tone(0), ((0.085 + 0.045 * S.warm * stir(n)) * L * here) / big);

      // the halo: rings turning behind it like a gyroscope, and rays that lengthen on the kick. They come in from outside as it gathers
      const haloIn = step(0, 0.55, here), outer = 1 - step(1.6, 3.2, s); // (falling in, the halo and the limbs are soon outside the picture and aren't drawn)
      for (let i = 0; i < Math.ceil(G.rings) && L * outer > 0.02; i++) {
        const R = G.ringR * (1 + 0.13 * i) * (1.9 - 0.9 * haloIn) * U, lean = G.tilt * (0.6 + 0.4 * Math.sin(t * 0.21 + i * 2.1 + b.seed)), one = new Path2D();
        one.ellipse(cx, cy, R, R * Math.max(0.04, Math.cos(lean * (i + 1) * 0.8)), (t * 0.13 * (i % 2 ? -1 : 1) + i * 1.05 + b.seed) % TAU, 0, TAU);
        line(one, tone(1 + i), L * outer * 0.45 * clamp(G.rings - i) * haloIn, wide * 0.8, 0);
      }
      if (G.rays && detail > 0.02 && L * outer > 0.02) {
        const rays = new Path2D(), nr = G.rays, r0 = G.ringR * 0.86 * U * (1.5 - 0.5 * haloIn), turn = -t * 0.07 + b.seed;
        for (let i = 0; i < nr; i++) { const a = (i / nr) * TAU + turn, len = G.rayLen * G.dip * (i % 2 ? 0.55 : 1) * (0.75 + 0.5 * b.reach) * U; rays.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); rays.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); }
        line(rays, tone(2), L * outer * 0.5 * haloIn * detail, wide * 0.8, 0);
      }

      // the limbs: petals in pairs, left and right of the middle line. They grow out as it gathers, wave with the bass and fling out on the kick
      const grow = step(0.2, 0.92, here), K = s < 0.4 ? 4 : 7, r0 = G.size * 0.85, na = Math.max(2.2, G.arms), gap = TAU / na;
      const longer = (th0) => Math.max(0.22, 1 + G.sym * (G.wing[0] * Math.cos(th0) + G.wing[1] * Math.cos(2 * th0) + G.wing[2] * Math.cos(3 * th0)));
      const limb = (path, th0, side, len, wd, phase) => { // one limb into a path: its two edges, from the body out to a point. Gives back where an eye near its tip would sit
        const hand = 1 + (side - 1) * G.sym, pts = [[], []];
        let tip = null;
        for (let i = 0; i <= K; i++) {
          const u = i / K, rr = r0 + len * u, a = side * (th0 + G.hang * G.sym * Math.sin(th0) * u ** 1.3) + hand * (G.curl * u ** 1.5 * (1 - 0.25 * b.reach) + G.sway * (0.4 + bass) * Math.sin(t * 1.4 - u * 2.6 + phase) * u), half = (wd * ((1 - u) ** 0.8 * (1 - G.waist) + Math.sin(Math.PI * u ** 0.62) * (1 - 0.35 * u) * G.waist)) / Math.max(0.25, rr);
          for (const e of [0, 1]) pts[e].push([cx + Math.sin(a + (e ? half : -half)) * rr * U, cy - Math.cos(a + (e ? half : -half)) * rr * U]);
          if (i === Math.round(K * 0.7)) tip = [cx + Math.sin(a) * rr * U, cy - Math.cos(a) * rr * U, a];
        }
        for (const e of [0, 1]) curve(path, pts[e], false);
        return tip;
      };
      if (grow > 0.01 && L * outer > 0.02 && U > 14) {
        const limbs = new Path2D(), petals = new Path2D(), tipEyes = [];
        let longest = 0.5;
        for (let i = 0; i <= 12; i++) longest = Math.max(longest, longer((i / 12) * Math.PI)); // the longest limb is as long as "reach" says, the others shorter
        for (let j = 0; j < Math.ceil(na / 2); j++) {
          const th0 = Math.min(Math.PI, (j + 0.5) * gap), len = G.reach * (longer(th0) / longest) * grow * eased(clamp(na / 2 - j)) * (1 + 0.1 * b.reach), wd = Math.min(G.wide, gap * (0.6 * r0 * (1 - G.waist) + 0.42 * (r0 + len * 0.5) * G.waist));
          for (const side of th0 > Math.PI - 1e-3 ? [1] : [-1, 1]) { const tip = limb(limbs, th0, side, len, wd, j * 0.9); if (G.tips > 0.02 && detail > 0.3) tipEyes.push([...tip, len * wd * 2.2, j]); }
        }
        if (G.inner > 0.05 && detail > 0.02) for (let j = 0; j <= Math.floor(na / 2); j++) { // the shorter petals between
          const th0 = Math.min(Math.PI, j * gap), len = G.reach * G.inner * grow * detail * (1 + 0.16 * b.reach);
          for (const side of j === 0 || th0 > Math.PI - 1e-3 ? [1] : [-1, 1]) limb(petals, th0, side, len, Math.min(G.wide, 0.4 * gap * r0), j * 0.9 + 2);
        }
        line(petals, tone(2), L * outer * 0.5 * grow, wide * 0.8, 0);
        line(limbs, tone(1), L * outer * 0.9 * grow, wide, 0);
        for (const [x, y, a, e, j] of tipEyes) smallEye(x, y, Math.min(e, 0.07) * U * G.tips, clamp(b.lid * 1.1 - 0.02 * j) * step(0.8, 1, here), a + Math.PI / 2, tone(2), L * outer * detail, glow);
      }

      // the body: the shadow of the four-dimensional shape. It unfolds from a point
      const unfold = step(0.08, 0.85, here), bodyU = G.size * unfold * (1 + 0.05 * b.reach) * U;
      if (unfold > 0.01 && L > 0.02) {
        const seen = [], cs = b.ang.map((a) => [Math.cos(a), Math.sin(a)]);
        for (let i = 0; i < 24; i++) { // each corner turned the six ways, then seen from a little way off in the fourth dimension, then from in front
          const v = CORNERS[i].slice(), out = i < 16 ? 1 : G.spike;
          for (let p = 0; p < 6; p++) { const [a, c] = PLANES[p], x = v[a], y = v[c]; v[a] = x * cs[p][0] - y * cs[p][1]; v[c] = x * cs[p][1] + y * cs[p][0]; }
          const k4 = 1 / (1 - Math.max(-0.8, Math.min(0.72, (v[3] * out) / G.far))), k = (out * k4) / (1 - (v[2] * out * k4) / 5.5);
          seen.push([cx + v[0] * k * bodyU, cy - v[1] * k * bodyU, k4]);
        }
        g.globalCompositeOperation = "source-over"; blob(cx, cy, bodyU * 1.9, NIGHT, 0.8 * L); g.globalCompositeOperation = "lighter"; // the body stands in front of its limbs and its halo
        EDGES.forEach((list, fam) => {
          const show = [G.tess, G.web, G.cross][fam] * (fam === 1 ? 0.6 * detail : 1);
          if (show < 0.03) return;
          const near = new Path2D(), back = new Path2D();
          for (const [a, c] of list) { const path = seen[a][2] + seen[c][2] > 2.08 ? near : back; path.moveTo(seen[a][0], seen[a][1]); path.lineTo(seen[c][0], seen[c][1]); } // edges nearer to us in the fourth dimension are bright and wide, the far ones faint
          line(back, tone(fam), L * show * 0.3 * unfold, wide * 0.75, 0);
          line(near, tone(fam), L * show * (0.85 + 0.15 * kick) * unfold, wide * 1.5, glow);
        });
        if (G.corner > 0.02 && detail > 0.25) for (let i = 16; i < 24; i++) { // eyes at the diamond's eight corners: each opens as its corner comes towards us through the fourth dimension, and shuts as it goes
          const [x, y, k4] = seen[i], open = clamp(G.corner * 8 - (i - 16)) * step(0.9, 1.12, k4) * clamp(b.lid * 1.2 - 0.03 * (i - 16)) * step(0.75, 1, here);
          smallEye(x, y, 0.07 * k4 * U * Math.min(1.6, s), open, 0, tone(2), L * detail, glow);
        }
      }

      // the great eye in the middle, or two of them side by side
      const W = G.eye * U * step(0.3, 0.8, here);
      if (W > 2) (G.apart < 0.02 ? [[0, 1]] : [[-G.apart, -1], [G.apart, 1]]).forEach(([px, side], i) => {
        const lead = n === 0 && i === 0, eyeL = (lead ? (light * (1 - step(0.72, 0.97, S.fall))) / big ** 0.15 : L) * step(0.35, 0.8, here);
        if (eyeL > 0.01 || lead) greatEye(b, n, cx + px * U, cy, W, side, U, s, lead ? light : L, eyeL, tone, wide, lead);
      });
    }

    return function () {
      const fresh = !S || sound.t < S.at || sound.t - S.at > 1; // shown for the first time, or again after another effect: it starts over
      if (fresh) begin();
      if (fresh || sound.t !== S.at) { update(); S.at = sound.t; } // (a frame can be drawn twice, for a picture of it to change from: the numbers still move on only once)
      const cx = w / 2, cy = h / 2, U = Math.min(w * 0.46, h * 0.42), b = S.line[0], G = b.G, { t } = sound;
      tones = moodColors(3);
      unit = U;
      g.save();
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      g.fillStyle = rgba(NIGHT, TRAIL);
      g.fillRect(0, 0, w, h);
      // falling: the view grows about the pupil until the being inside it is as big as this one was
      S.widest = Math.max(1.3, (Math.hypot(w, h) * 0.6) / (FITS * U)); // how many times wider the pupil must open for its rim to be outside the picture when the fall ends
      const e = eased(S.fall), Z = ((G.eye * IRIS * PUPIL) / FITS) ** -e, into = step(0, 0.3, S.fall), calm = eased(S.rest), two = G.apart >= 0.02, pu = pupilAt(b, two ? -1 : 1, S.here);
      const float = [Math.sin(t * 0.31 + b.seed) * 0.03 * calm, Math.sin(t * 0.23 + b.seed * 3) * 0.035 * calm], eyeAt = [(two ? -G.apart : 0) + pu[0], pu[1]]; // its slow drift, and where the pupil of the leading eye is, in units
      const ox = cx + U * Z * (float[0] * (1 - into) - eyeAt[0] * into), oy = cy + U * Z * (float[1] * (1 - into) - eyeAt[1] * into);
      drawTunnel(ox, oy, U * Z, 1 - step(1.5, 3.5, Z), S.here * 1.3, step(0.3, 0.6, flow.build) * (1 - step(0.86, 0.97, S.here)));
      drawBeing(0, ox, oy, U * Z, Z, 1);
      g.restore();
    };
  })();
  /* ==== beings: end ==== */
  /* ==== acid: begin ==== */
  /* The 303: the squelching bass synthesizer of acid house. First an ear for it, which tells from the spectrum whether one is playing a line just now. Then a small smiley that comes in when a line starts, over whatever effect is showing,
     and sings it: its mouth is the filter, open when the squelch is high, its tongue comes out on an accent, and the line pours out of its mouth across the picture as a glowing ribbon. When the line stops it leaves again. */

  /* The ear. Two ways of listening that look for the same thing differently, and BOTH must say yes, because each one alone is fooled by something the other is not:
       the squelch  In four overlapping stretches of the middle of the spectrum: where is the loudest narrow place, and how does it move? On every note of a 303 it LEAPS up and GLIDES back down, several times a second.
                    The glides must lean downward, add up to more than about an octave a second, and come with leaps. A plucked sound whose brightness falls away on every note fools it, because it never asks whether the bright place is one narrow peak.
       the ridge    Follows the sharpest peak of the spectrum less its own half-second average (so whatever stands still fades away), and adds up how far that ridge glides DOWN after rising, less how far it glides UP.
                    The dying tails of hats, stabs and kick rolls fool it, but a plucked sound does not, because it wants a peak that stands clear of its neighbours.
     Its three answers. acid, from 0 to 1: how sure it is. That is the squelch's score, let through only while the ridge agrees; it comes up over 0.9 s and lets go over 0.4 s.
     where, from 0 to 1: the place of the squelch, from 150 Hz to 6 kHz by octaves. It goes up at once and down over 40 ms, and holds still while the loudest place sits at the very top of its stretch (that is a hi-hat, not the line).
     hit: true on the frame a note of the line lands.
     Everything is differences between loudnesses, so the volume makes no difference, and everything goes by the clock. Nothing is made anew on a frame: the tables and the tallies are made once, here.
     Every number in it was settled by trying it on stretches of real acid tracks, and on other music, where it never once said yes. They belong together and are not to be changed one at a time.
     It expects the page's own analyser: 2048 samples, smoothed by 0.6, looked at about sixty times a second. */
  function acidEarFor(binHz) { // binHz: how many Hz one place of the spectrum is wide. Gives back the ear itself: ear(freq, dt) with the spectrum and the seconds since it was last asked
    const SPAN = Math.log2(40); // "where" runs from 150 Hz to 6 kHz
    const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x), ramp = (x, r) => unit((x - r[0]) / (r[1] - r[0]));
    // the squelch's numbers
    const STRETCHES = [[258, 5600], [258, 1600], [700, 5600], [1100, 5600]]; // Hz
    const TILT = 10, WIN = 0.33, OUT = 0.9;                // loudness an octave that every place is lifted by before the loudest is chosen; octaves round it that count in full, and by which they have faded out
    const SLOW = 0.9, FAST = 18, LEAP = 0.25;              // octaves a second: slower is standing still, faster is a jump; and octaves above its recent low that make a leap
    const DEEP = [75, 115], EDGE = 0.12, ROOF_TOP_HZ = 5000; // how far under the loudest thing up to 5 kHz a glide counts in full, and not at all; octaves from the top of the stretch
    const LONG = 2.5, SHORT = 0.8, IDLE = 0.45, CAP = 2.5; // seconds the tallies remember; seconds without a glide down before the line counts as stopped; the most fall a tally holds
    const LEAN = [0.15, 0.35], FALL = [0.6, 1.2], PACE = [1.5, 2.5]; // from "no" to "yes": the lean (-1 to 1), the fall (octaves a second), the leaps a second (a quick one counts three times)
    const UP = 0.9, DOWN = 0.4;                            // seconds for acid to come up and to let go
    const STRIDE = 0.012, PAUSE = 1.5;                     // the shortest time between two looks (a very fast screen is looked at every other frame); a gap this long starts afresh
    const HITCH = 0.12, HITCH_AS = 0.05;                   // a frame later than this measures nothing, and ages the tallies by only this much
    const WHERE_ROOM = 0.25;                               // octaves from the top of the stretch inside which "where" holds still
    // the ridge's numbers
    const K = {
      floor: 250, countFrom: 330, top: 6000,   // Hz: no ridge below floor or above top; glides below countFrom do not count (the tail of a kick)
      alpha: 0.7, tau: 0.5,                    // how much of a band's own average is taken away, and how long that average remembers (s)
      thrNew: 10, thrKeep: 6, keepShare: 0.5,  // how far a peak must stand above its neighbours to be taken up, and to be kept; and the share of the tallest peak it must keep
      stick: 15, maxReach: 0.4,                // octaves a second the ridge may move and still be the same ridge; never more than this many octaves in one frame
      leap: 0.2, slack: 0.1, appear: 1.0, maxFall: 3, fallTime: 0.8, // octaves a jump up must be to count as a note; credit beyond the rise; credit for a ridge out of nothing; the most one fall counts; s within which it must come
      mem: 6, memFast: 2.5,                    // s: how long glides are remembered, and the quick memory
      hi: 0.64, hiFast: 1.0, lo: 0.36,         // octaves a second of saw-tooth falling: open above hi (or the quick score above hiFast), shut below lo
      cap: 0.95, wait: 1.6, letGo: 0.8,        // the score's ceiling; s without real falling before the score is let go; and how quickly then
    };
    const PER = 8, LOW_HZ = 75, TOP_HZ = 9000, NB = Math.floor(Math.log2(TOP_HZ / LOW_HZ) * PER) + 1, OFF = Math.log2(LOW_HZ / 150); // 56 bands, eight to the octave; band i is i / PER + OFF octaves above 150 Hz
    // the squelch: its tables and what it keeps
    const OCT = Float64Array.from({ length: 512 }, (_, k) => Math.log2((Math.max(1, k) * binHz) / 150)), LIFT = Float64Array.from(OCT, (v) => TILT * v);
    const WEIGHT = Float64Array.from({ length: 512 }, (_, d) => 10 ** (-d * (75 / 255 / 10) * 2)); // how much a place counts that is d steps of loudness under the loudest (a step is 75/255 dB)
    const ROOF_TOP = Math.min(511, Math.round(ROOF_TOP_HZ / binHz));
    const bands = STRETCHES.map(([lo, hi]) => ({ a: Math.round(lo / binHz), b: Math.min(511, Math.round(hi / binHz)), x: 0, had: false, down: 0, up: 0, fall: 0, fallNow: 0, leaps: 0, quick: 0, low: 0, lowAge: 9, since: 9, idle: 9, score: 0, lean: 0, leap: false, room: 1 }));
    let best = 0, roof = 0, where = 0.5;
    // the ridge: its tables and what it keeps
    const lo = new Int16Array(NB), hi = new Int16Array(NB);
    for (let i = 0; i < NB; i++) { const c = (LOW_HZ * 2 ** (i / PER)) / binHz, h = Math.max(1, 0.045 * c); lo[i] = Math.max(1, Math.round(c - h)); hi[i] = Math.min(Math.floor(TOP_HZ / binHz), Math.round(c + h)); }
    const FIRST = Math.ceil(Math.log2(K.floor / LOW_HZ) * PER), LAST = Math.floor(Math.log2(K.top / LOW_HZ) * PER), minPos = Math.log2(K.countFrom / 150);
    const A = new Float32Array(NB), W = new Float32Array(NB), P = new Float32Array(NB); // A is kept from frame to frame; W and P are worked out afresh on every one
    let started = false, p = -1, down = 0, up = 0, downF = 0, upF = 0, quick = 0, sinceFall = 9, credit = 0, sinceRise = 9, open = false;
    const middle = (at) => { let s = 0, w = 0; for (let j = at - 2; j <= at + 2; j++) if (j >= FIRST && j <= LAST && P[j] > 0) { s += P[j] * j; w += P[j]; } return s / w / PER + OFF; };
    // the two together
    let acid = 0, wait = 0;
    const out = { acid: 0, where: 0.5, hit: false };

    function squelch(freq, dt) { // gives back the best stretch's score, 0 to 1; sets where and out.hit
      if (dt > PAUSE) { roof = 0; for (let j = 0; j < bands.length; j++) { const B = bands[j]; B.down = B.up = B.fall = B.fallNow = B.leaps = B.quick = 0; B.had = false; } }
      const stale = dt > HITCH; if (stale) dt = HITCH_AS;
      const keep = Math.exp(-dt / LONG), keepNow = Math.exp(-dt / SHORT);
      let top = -1, at = 0, peak = 0;
      for (let k = 2; k < ROOF_TOP; k++) if (freq[k] > peak) peak = freq[k];
      roof -= 60 * dt; if (peak > roof) roof = peak; // the loudest thing in the spectrum (the kick, mostly), held about a second
      for (let j = 0; j < bands.length; j++) {
        const B = bands[j], a = B.a, b = B.b;
        let loud = -1, kt = a;
        for (let k = a; k <= b; k++) { const v = freq[k] + LIFT[k]; if (v > loud) { loud = v; kt = k; } }
        const ka = Math.max(a, Math.ceil(kt / 2 ** OUT)), kb = Math.min(b, Math.floor(kt * 2 ** OUT)), mid = OCT[kt];
        let sum = 0, sumAt = 0;
        for (let k = ka; k <= kb; k++) {
          const d = (loud - freq[k] - LIFT[k]) | 0; if (d > 511) continue;
          const far = OCT[k] > mid ? OCT[k] - mid : mid - OCT[k], w = far <= WIN ? WEIGHT[d] : (WEIGHT[d] * (OUT - far)) / (OUT - WIN);
          sum += w; sumAt += w * OCT[k];
        }
        const heard = freq[kt] > 0, x = heard ? sumAt / sum : B.x;
        const near = OCT[b] - OCT[kt] >= EDGE && kt > a + 1 ? 1 - ramp(roof - freq[kt], DEEP) : 0; // how much a glide counts now: 1 for a peak inside the stretch and loud enough
        B.down *= keep; B.up *= keep; B.fall *= keep; B.leaps *= keep; B.quick *= keep; B.fallNow *= keepNow; B.since += dt; B.lowAge += dt; B.idle += dt; B.leap = false; B.room = OCT[b] - OCT[kt];
        if (heard && B.had && !stale) {
          const v = (x - B.x) / dt;
          if (v > SLOW && v <= FAST) { B.up += dt * near; B.fall -= (near * (x - B.x)) / LONG; B.fallNow -= (near * (x - B.x)) / SHORT; }
          else if (v < -SLOW && v >= -FAST) { if (near > 0.5) B.idle = 0; B.down += dt * near; B.fall += (near * (B.x - x)) / LONG; B.fallNow += (near * (B.x - x)) / SHORT; }
          if (B.lowAge > 0.07 || x < B.low) { B.low = x; B.lowAge = 0; }
          if (x - B.low > LEAP && B.since > 0.07) { B.leaps += 1 / LONG; if (B.since < 0.17) B.quick += 1 / LONG; B.since = 0; B.low = x; B.lowAge = 0; B.leap = true; }
        } else { B.low = x; B.lowAge = 0; }
        B.x = x; B.had = heard; if (B.fall > CAP) B.fall = CAP; if (B.fallNow > CAP) B.fallNow = CAP;
        B.lean = (B.down - B.up) / (B.down + B.up + 0.15);
        const fall = B.idle > IDLE ? 0 : B.fall < 2 * B.fallNow ? B.fall : 2 * B.fallNow; // stopped when no glide came lately, or when the last second fell less than half as far as the last few
        B.score = Math.min(ramp(B.lean, LEAN), ramp(fall, FALL), ramp(B.leaps + 2 * B.quick, PACE));
        const rank = B.score + 0.02 * (B.lean + (fall < 2 ? fall : 2)) + (j === best ? 0.1 : 0); // it stays with the stretch it is on unless another is clearly better
        if (rank > top) { top = rank; at = j; }
      }
      best = at; const B = bands[best], goal = unit(B.x / SPAN);
      if (B.room >= WHERE_ROOM) where += (goal - where) * Math.min(1, dt / (goal > where ? 0.01 : 0.04)); // up at once, down a little eased
      out.hit = B.leap;
      return B.score;
    }

    function ridge(freq, long) { // says whether its gate is open
      if (long > 0.25) { started = false; p = -1; credit = 0; } // back from a pause: what the ridge did across the gap is not a glide
      const dt = Math.min(long, 0.1);
      for (let i = 0; i < NB; i++) { let m = 0; for (let k = lo[i]; k <= hi[i]; k++) if (freq[k] > m) m = freq[k]; if (!started) A[i] = m; A[i] += (m - A[i]) * Math.min(1, dt / K.tau); W[i] = m - K.alpha * A[i]; }
      started = true;
      let top = -1, topP = 0; // how far each band stands above its neighbours 3/8 of an octave to an octave away, on the louder side
      for (let i = FIRST; i <= LAST; i++) {
        let L = 0, R = 0, nl = 0, nr = 0;
        for (let j = i - 8; j <= i - 3; j++) if (j >= 0) { L += W[j]; nl++; }
        for (let j = i + 3; j <= i + 8; j++) if (j < NB) { R += W[j]; nr++; }
        const v = W[i] - Math.max(L / nl, R / nr); P[i] = v;
        if (v > topP) { topP = v; top = i; }
      }
      let np = -1, jumped = false; // the ridge: the same peak as on the last frame if it is still within reach and tall enough, or else the tallest (a jump)
      if (p >= 0) {
        const reach = Math.min(K.stick * dt, K.maxReach) * PER, at = (p - OFF) * PER; let near = -1, nearP = 0;
        for (let i = Math.max(FIRST, Math.ceil(at - reach)); i <= Math.min(LAST, Math.floor(at + reach)); i++) if (P[i] > nearP) { nearP = P[i]; near = i; }
        if (near >= 0 && nearP >= K.thrKeep && nearP >= K.keepShare * topP) np = middle(near);
      }
      if (np < 0 && top >= 0 && topP >= K.thrNew) { np = middle(top); jumped = p >= 0; }
      const fade = Math.exp(-long / K.mem), fadeF = Math.exp(-long / K.memFast); down *= fade; up *= fade; downF *= fadeF; upF *= fadeF; quick *= Math.exp(-long / 0.5);
      sinceFall += long; sinceRise += long;
      if (np >= 0 && p >= 0) { // the saw-tooth: a glide down counts as far as the ridge rose just before it
        const d = np - p;
        if (jumped && d >= K.leap) { credit = Math.min(K.maxFall, d) + K.slack; sinceRise = 0; }
        else if (!jumped && d > 0) { credit = Math.min(K.maxFall, credit + d); sinceRise = 0; }
        if (sinceRise > K.fallTime) credit = 0;
        if (!jumped && np >= minPos) {
          if (d < 0) { const c = Math.min(-d, credit); credit -= c; down += c; downF += c; quick += c; }
          else { up += d; upF += d; quick -= d; }
        }
      } else if (np >= 0) { credit = K.appear; sinceRise = 0; }
      if (quick > 0.25) { sinceFall = 0; if (quick > 0.5) quick = 0.5; } else if (quick < -0.5) quick = -0.5;
      if (sinceFall > K.wait) { const f = Math.exp(-long / K.letGo); down *= f; up *= f; downF *= f; upF *= f; }
      if (down - up > K.cap * K.mem) down = up + K.cap * K.mem;
      if (downF - upF > 2 * K.hiFast * K.memFast) downF = upF + 2 * K.hiFast * K.memFast;
      const score = (down - up) / K.mem, fast = (downF - upF) / K.memFast;
      if (!open && (score > K.hi || fast > K.hiFast)) open = true; else if (open && score < K.lo && fast < K.hiFast) open = false;
      p = np;
      return open;
    }

    return (freq, dt) => {
      if (!(dt > 0)) dt = 1 / 60;
      wait += dt; out.hit = false;
      if (wait < STRIDE) return out; // too soon after the last look (a very fast screen): the same answer
      dt = wait; wait = 0;
      if (dt > PAUSE) acid = 0;      // the music was paused or the page hidden: what was tallied is about another moment
      const s = squelch(freq, dt), gate = ridge(freq, dt), want = gate ? s : 0, step = dt > HITCH ? HITCH_AS : dt;
      acid += (want - acid) * Math.min(1, step / (want > acid ? UP : DOWN));
      out.acid = acid; out.where = where; out.hit = out.hit && acid > 0.4;
      return out;
    };
  }
  /* The ear in the song follower: follow() asks it on every frame the music is heard, and its answers go on flow beside the rest: flow.acid (how sure), flow.acidAt (where the squelch is) and flow.acidHit (1 on the frame a note lands).
     It is told the time since it last heard anything by the clock on the wall. While the music is paused or the page hidden nobody asks it, so the first frame back comes with the whole gap,
     and it knows not to take what it hears then for a glide from what it heard before: after a second and a half away it starts afresh. A new song makes it start afresh too. */
  Object.assign(flow, { acid: 0, acidAt: 0.5, acidHit: 0 });
  let acidEar = null, acidEarHz = 0, acidHeardAt = 0;
  function acidHear(dt) {
    if (!freq || freq.length < 512) return; // (it reads the lower 512 places of the spectrum)
    if (acidEarHz !== binHz) { acidEar = acidEarFor(binHz); acidEarHz = binHz; } // made when the music is first heard, and again only if the sound comes at another rate
    const gap = (realNow - acidHeardAt) / 1000, said = acidEar(freq, gap > 0 && gap < 1e9 ? gap : dt);
    acidHeardAt = realNow;
    flow.acid = said.acid;
    flow.acidAt = said.where;
    flow.acidHit = said.hit ? 1 : 0;
  }
  function acidNewSong() { acidHeardAt = realNow - 60000; acidSinger.tired = false; } // as if a minute had gone by: nothing of the last song's line is left when this one starts, and the last song's rest is not this one's: a new song may be sung at once

  /* The singer. Whether it is there goes by a switch with a gap in it: it comes when the ear is more than half sure and goes when that falls under a quarter, so an ear that hovers at "fairly sure",
     as it does for seconds on end in real tracks, shows all of it, steadily, or nothing: never a face that trembles. It comes and goes eased, over about a second.
     And it is a visit, not a fixture: it stays for 24 seconds of a line that goes on, then keeps away for 40 before it may come back. A line that stops by itself needs no such rest.
     The "Singing to the 303" slider stretches the stay and shortens the rest by as much (at 2 it stays 48 seconds and rests 20), and at 0 it never comes.
     What it sings with is worked out here once a frame, from the ear's three answers; the drawing reads these and nothing else:
       show    0 to 1, how much of it is there: it rises, fades and leaves with this
       sq      where the squelch is, its leap softened to 30 ms so nothing jumps in one frame. The ear's place is believed only while the ear is sure: all of it from half sure, none of it under 0.4 or once the switch is off.
               Then it sinks to the bottom: the singer keeps its place and hums, mouth nearly shut, until the ear is sure again or gives up
       knob    sq averaged over a second and a half: the hand on the filter's knob
       wah     sq between its own lowest and highest of the last moments, eased over 35 ms: the squelch itself, full range on every note however dark or bright the line is
       v       0.4 of knob and 0.6 of wah: the height that is drawn
       tongue  out for a fifth of a second when a note leaps clearly higher than the last few did (an accent), and then not again for a bar
       punch   up on a note and gone in a tenth of a second: it only ever moves and swells the face a little, it never lights anything
       nod     it rocks left and right, changing side on every note */
  const ACID_ON = 0.5, ACID_OFF = 0.25, ACID_COME = 0.9, ACID_GO = 1.2, ACID_STAY = 24, ACID_REST = 40; // the switch, the seconds it takes to come and to go, and the visit
  const ACID_KEEP = 256, ACID_TICK = 1 / 60, ACID_LINE = 109, ACID_DROPS = 4, ACID_INK = "#16140a", ACID_YELLOW = [246, 230, 50]; // the ribbon: how much is remembered, how often, and how much of it is drawn (a bar of music, 1.8 s)
  const acidSinger = { sure: 0, on: false, tired: false, cameAt: 0, leftAt: 0, ramp: 0, show: 0, sq: 0, knob: 0, lo: 0, hi: 0, peak: 0, peaks: 0, since: 9, wah: 0, v: 0, tongue: 0, lickAt: -9, punch: 0, hitAt: -9, side: 1, nod: 0, t: 0, owed: 0, at: 0, drop: 0, dropAt: -9, rainbow: false, rain: 0, hue: 0 }; // rainbow: this visit goes round the colors; rain, how far it has got into them; hue, where it is on the wheel
  const acidKept = { v: new Float32Array(ACID_KEEP), show: new Float32Array(ACID_KEEP) }; // the height and how much was there, sixty times a second, the newest at acidSinger.at
  const acidLine = { across: new Float32Array(ACID_LINE), along: new Float32Array(ACID_LINE), thick: new Float32Array(ACID_LINE), taper: new Float32Array(ACID_LINE), bend: new Float32Array(ACID_LINE) }; // the ribbon's middle as it is drawn this frame, and two tables for its shape
  const acidDrops = { born: new Float64Array(ACID_DROPS).fill(-9), fall: new Float32Array(ACID_DROPS), speed: new Float32Array(ACID_DROPS), size: new Float32Array(ACID_DROPS) }; // the few drops there can be at once
  const acidTones = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let acidArt = null;
  const acidPart = (dt, secs) => 1 - Math.exp(-dt / secs); // how much of the way something eased over "secs" gets in this frame
  const acidShows = () => acidSinger.show > 0;
  function acidNow(dt) { // from frame(), before anything is drawn: the colors, and the keeping of a clean picture, need to know whether it is there
    const S = acidSinger, sure = hearing && T.acid ? flow.acid : 0;
    S.t += dt;
    S.sure = T.acid ? S.sure + (sure - S.sure) * acidPart(dt, 0.2) : 0; // the ear's answer, steadied. With the slider at 0 it is nothing, and whoever is there leaves
    if (!S.on && S.sure > ACID_ON && !(S.tired && S.t - S.leftAt < ACID_REST / T.acid)) {
      if (S.ramp <= 0) { acidKept.show.fill(0); S.sq = S.knob = S.lo = S.hi = S.peak = S.peaks = flow.acidAt; S.wah = S.tongue = S.punch = S.nod = 0; S.cameAt = S.t; S.rainbow = Math.random() < (mood === "psy" ? 0.7 : 0.3); } // from nothing: no ribbon from the last visit, it starts where the line is, and its visit is counted from now
      S.on = true; // (back before it had quite gone, it is the same visit and its clock runs on: a line that dips now and then does not keep it on screen for ever)
      S.tired = false;
    } else if (S.on && (S.sure < ACID_OFF || S.t - S.cameAt > ACID_STAY * T.acid)) {
      S.on = false;
      S.tired = S.sure >= ACID_OFF; // it left a line that goes on: that is what the rest is for
      S.leftAt = S.t;
    }
    S.ramp = clamp(S.ramp + (S.on ? dt / ACID_COME : -dt / ACID_GO));
    S.show = eased(S.ramp);
    if (S.ramp <= 0) return; // not there: nothing more to work out
    const trust = S.on ? clamp((sure - 0.4) / 0.1) : 0, where = flow.acidAt * trust, hit = trust > 0 && flow.acidHit > 0; // the ear's "where" means something only while it is sure: all of it from half sure, none of it under 0.4
    S.sq += (where - S.sq) * acidPart(dt, trust < 1 ? 0.1 : where > S.sq ? 0.03 : 0.015);
    S.knob += (S.sq - S.knob) * acidPart(dt, 1.5);
    S.lo = S.sq < S.lo ? S.sq : S.lo + (S.sq - S.lo) * acidPart(dt, 0.8);
    S.hi = S.sq > S.hi ? S.sq : S.hi + (S.sq - S.hi) * acidPart(dt, 0.8);
    S.wah += (clamp((S.sq - S.lo) / Math.max(0.1, S.hi - S.lo)) - S.wah) * acidPart(dt, 0.035); // the mouth and the ribbon take two or three frames to get there
    S.v = clamp(0.4 * S.knob + 0.6 * S.wah);
    if (S.on && flow.dropHit) S.rainbow = true; // a drop while it sings sends it through the rainbow for the rest of its visit
    S.rain += ((S.rainbow ? 1 : 0) - S.rain) * acidPart(dt, 0.6);
    S.hue = (S.hue + dt * (90 + 260 * S.wah) + (hit ? 25 : 0)) % 360; // a turn of the wheel every four seconds, much quicker while the filter is wide open, and a step on every note
    if (hit) { S.peaks += (S.peak - S.peaks) * 0.3; S.peak = S.sq; S.since = 0; S.hitAt = S.t; S.side = -S.side; } else S.since += dt; // peaks: how high the last few notes leapt
    S.peak = Math.max(S.peak, S.sq);
    const accent = S.show > 0.3 && S.since < 0.15 && S.sq > S.peaks + 0.3 * Math.max(0.05, S.peaks - S.lo), sinceHit = S.t - S.hitAt; // this note leaps clearly higher than the last few
    if (accent && S.t - S.lickAt > 1.6) S.lickAt = S.t;
    const licking = S.t - S.lickAt < 0.2;
    S.tongue += ((licking ? 1 : 0) - S.tongue) * acidPart(dt, licking ? 0.04 : 0.08);
    S.punch = sinceHit < 0.034 ? Math.max(S.punch, sinceHit / 0.034) : Math.exp(-(sinceHit - 0.034) / 0.09); // two frames up, then away
    S.nod += (S.side * 0.08 * S.show - S.nod) * acidPart(dt, 0.07);
    S.owed += dt; // the ribbon is written down sixty times a second whatever the screen does, so a bar is always as long on the picture
    const due = Math.min(8, Math.floor(S.owed / ACID_TICK)), v0 = acidKept.v[S.at], show0 = acidKept.show[S.at];
    for (let k = 1; k <= due; k++) { // a late frame owes several steps at once: they are filled in on a slope from where it was, not as a stair
      S.at = (S.at + 1) % ACID_KEEP;
      acidKept.v[S.at] = v0 + ((S.v - v0) * k) / due;
      acidKept.show[S.at] = show0 + ((S.show - show0) * k) / due;
    }
    S.owed = due < 8 ? S.owed - due * ACID_TICK : 0; // after a long gap it does not catch up
    const { born, fall, speed, size } = acidDrops;
    if (accent && S.t - S.dropAt > 0.4 && S.show > 0.5) { S.dropAt = S.t; S.drop = (S.drop + 1) % ACID_DROPS; born[S.drop] = S.t; fall[S.drop] = speed[S.drop] = 0; size[S.drop] = rnd(0.7, 1.3); } // under an accent a drop forms on the ribbon
    for (let i = 0; i < ACID_DROPS; i++) if (S.t - born[i] > 0.3 && fall[i] < 1) { speed[i] += dt * 2.6; fall[i] += speed[i] * dt; } // it hangs for a moment, then falls
  }
  function acidTint(from) { // while it sings, the picture's colors lean a little toward acid's yellow. The three leaning colors are kept and filled in again, not made anew
    const lean = 0.2 * acidSinger.show;
    if (lean < 0.004 || from.length !== 3) return from;
    const toward = acidSinger.rain > 0.01 ? acidTone(ACID_YELLOW, 0) : ACID_YELLOW; // in a rainbow, toward the color it is just now
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) acidTones[i][c] = from[i][c] + (toward[c] - from[i][c]) * lean;
    return acidTones;
  }
  function acidPaints() { // its paints, made once: they are laid out for a face one unit across and a ribbon one unit high, and the drawing is stretched to fit, so the same ones serve at any size
    const skin = stage.createRadialGradient(-0.3, -0.4, 0.1, 0, 0, 1), halo = stage.createRadialGradient(0, 0, 0.8, 0, 0, 1.7), heat = stage.createLinearGradient(0.15, 0, 0.9, 0);
    skin.addColorStop(0, "#fff6a0"); skin.addColorStop(0.6, "#f7e11e"); skin.addColorStop(1, "#d6b900"); // the yellow of the page's other smileys
    halo.addColorStop(0, "rgba(246,230,50,0.3)"); halo.addColorStop(1, "rgba(246,230,50,0)");
    heat.addColorStop(0, "rgb(255,140,30)"); heat.addColorStop(0.5, "rgb(246,230,50)"); heat.addColorStop(1, "rgb(197,247,148)"); // the ribbon: orange where the filter is shut, yellow in the middle, a pale lime where it screams
    for (let i = 0; i < ACID_LINE; i++) { acidLine.taper[i] = (1 - i / (ACID_LINE - 1)) ** 0.6; acidLine.bend[i] = eased(clamp(i / 12)); } // it thins to nothing at its far end, and leaves the mouth straight before it starts to wave
    return { skin, halo, heat };
  }
  const ACID_SKIN = [[255, 246, 160], [247, 225, 30], [214, 185, 0]]; // the face's yellow, light to dark, as acidPaints lays it
  const acidTone = (c, turn) => mix(c, turnHue(c, acidSinger.hue + turn), acidSinger.rain); // a color of it, as far into the rainbow as it is; turn moves along the rainbow
  function acidRainbow(paint, from, to) { // in a rainbow the face, its glow and the ribbon go round the colors: these paints are made each frame while it does, and the yellow ones made once serve otherwise
    if (acidSinger.rain < 0.01) return acidArt[paint];
    if (paint === "skin") { const p = stage.createRadialGradient(-0.3, -0.4, 0.1, 0, 0, 1); [0, 0.6, 1].forEach((at, i) => p.addColorStop(at, rgba(acidTone(ACID_SKIN[i], 0), 1))); return p; }
    if (paint === "halo") { const p = stage.createRadialGradient(0, 0, 0.8, 0, 0, 1.7), c = acidTone(ACID_YELLOW, 0); p.addColorStop(0, rgba(c, 0.3)); p.addColorStop(1, rgba(c, 0)); return p; }
    const p = stage.createLinearGradient(0, from, 0, to); // the ribbon: the whole rainbow along its length, the newest color at the mouth, so the colors stream out of it as the wheel turns
    for (let k = 0; k <= 7; k++) p.addColorStop(k / 7, rgba(turnHue(ACID_YELLOW, acidSinger.hue - k * 50), 1));
    return p;
  }
  function acidBand(grow, lift) { // the ribbon as a closed shape and filled: its thickness times "grow", moved toward its open side by "lift" thicknesses
    const { across, along, thick } = acidLine;
    g.beginPath();
    g.moveTo(across[0] + thick[0] * (grow + lift), along[0]);
    for (let i = 1; i < ACID_LINE; i++) g.lineTo(across[i] + thick[i] * (grow + lift), along[i]);
    for (let i = ACID_LINE - 1; i >= 0; i--) g.lineTo(across[i] - thick[i] * (grow - lift), along[i]);
    g.closePath();
    g.fill();
  }
  /* The ribbon: the last bar of the squelch, written out from the mouth like a seismograph. Thick where the filter was open and thin where it was shut, thinning to nothing at its far end; under an accent a drop forms, hangs and falls.
     On a wide picture it runs to the left and waves up and down; on a tall one it hangs down from the mouth and swings left and right, and has no drops.
     It is drawn in a frame of its own, laid from "shut" (0) to "open" (1) across it and in the picture's own steps along it, which is what lets one paint made once color it wherever it is. */
  function acidRibbon(mouthX, mouthY, tall, m) {
    const S = acidSinger, show = S.show, reach = (tall ? w * 0.5 : h * 0.46) * 0.8 * show; // how far an open filter is from a shut one on the picture
    if (reach < 1) return;
    const { across, along, thick, taper, bend } = acidLine, pen = tall ? mouthY : mouthX, run = ((tall ? h - pen : pen) + m * 0.05) / (ACID_LINE - 1), rest = tall ? 0.55 : 0.45, shut = tall ? mouthX - reach * rest : mouthY + reach * rest, part = Math.min(1, S.owed / ACID_TICK);
    for (let i = 0; i < ACID_LINE; i++) { // 0 is now, at the mouth; the last is the oldest
      const k = S.at - i + ACID_KEEP, v = i ? 0.25 * acidKept.v[(k + 1) % ACID_KEEP] + 0.5 * acidKept.v[k % ACID_KEEP] + 0.25 * acidKept.v[(k - 1) % ACID_KEEP] : S.v, life = i ? acidKept.show[k % ACID_KEEP] : show, far = (i ? i - 1 + part : 0) * run; // it moves with the frame, not in steps of its memory
      across[i] = rest + (v - 0.45) * bend[i];
      along[i] = tall ? pen + far : pen - far;
      thick[i] = (m * (0.006 + 0.026 * v) * taper[i] * (0.3 + 0.7 * life) * clamp(life * 5)) / reach; // nothing is written for the time before the line was there
    }
    g.save();
    if (tall) g.transform(reach, 0, 0, 1, shut, 0); else g.transform(0, -reach, 1, 0, 0, shut);
    g.globalCompositeOperation = "source-over"; // a shadow first, so it reads over a bright picture; over black this does nothing
    g.fillStyle = "#000";
    g.globalAlpha = 0.5 * show; acidBand(4.2, 0);
    g.globalAlpha = 0.7 * show; acidBand(2.4, 0);
    g.globalCompositeOperation = "lighter";
    const rain = S.rain;
    for (const [paint, part] of [[acidArt.heat, 1 - rain], [rain >= 0.01 ? acidRainbow("heat", along[0], along[ACID_LINE - 1]) : null, rain]]) { // the yellow heat as far as it is yellow, the rainbow as far as it is a rainbow
      if (!paint || part < 0.01) continue;
      g.fillStyle = paint;
      g.globalAlpha = 0.16 * show * part; acidBand(3.2, 0);
      g.globalAlpha = 0.3 * show * part; acidBand(1.8, 0);
      g.globalAlpha = 0.95 * show * part; acidBand(1, 0);
    }
    g.fillStyle = "#fff"; // the shine along its upper side: something liquid, not a graph
    g.globalAlpha = 0.75 * show; acidBand(0.28, 0.45);
    g.restore();
    if (tall) return;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let d = 0; d < ACID_DROPS; d++) { // the drops ride along with the ribbon while they hang, then fall
      const age = S.t - acidDrops.born[d], fall = acidDrops.fall[d], i = Math.min(ACID_LINE - 1, age * 60), at = Math.floor(i), fade = clamp(1 - fall * 1.6) * clamp((ACID_LINE - 1 - i) / 20) * show;
      if (age < 0 || age > 1.5 || fade <= 0) continue;
      const hang = clamp(age / 0.3), r = m * 0.015 * acidDrops.size[d] * (0.4 + 0.6 * hang), x = along[at], top = shut - reach * across[at], y = top + thick[at] * reach + r * (0.6 + 1.6 * hang) + fall * h;
      g.strokeStyle = g.fillStyle = S.rain < 0.01 ? "rgb(246,230,50)" : rgba(mix(ACID_YELLOW, turnHue(ACID_YELLOW, S.hue - (i / (ACID_LINE - 1)) * 350), S.rain), 1); // in a rainbow, the color of the ribbon where it hangs
      g.globalAlpha = 0.5 * fade; // its neck while it hangs, a short streak while it falls
      g.lineWidth = Math.max(1, r * 0.5);
      g.beginPath(); g.moveTo(x, fall ? y - r * (2 + 14 * Math.min(0.25, acidDrops.speed[d])) : top); g.lineTo(x, y); g.stroke();
      g.globalAlpha = 0.9 * fade;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = "#fff";
      g.globalAlpha = 0.7 * fade;
      g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.4, 0, TAU); g.fill();
    }
    g.restore();
  }
  function acidLips(cornerX, cornerY, lipTop, lipLow) { // the mouth: two curves between the same two corners. With both at the same height it is the smile
    g.beginPath();
    g.moveTo(-cornerX, cornerY);
    g.quadraticCurveTo(0, lipTop, cornerX, cornerY);
    g.quadraticCurveTo(0, lipLow, -cornerX, cornerY);
    g.closePath();
  }
  /* The face: the page's own smiley (the same yellow, the same dark line, the same eyes and smile as smileyFace), drawn afresh on every frame because its mouth moves.
     open, from 0 to 1, is the mouth: the smile at 0, a wide-open shout at 1. tongue pushes the tongue out over the lip, and squint narrows the eyes as it shouts. It is drawn one unit across and stretched to r. */
  function acidFace(cx, cy, r, open, tongue, squint, tilt, alpha) {
    const cornerX = 0.48 + 0.03 * open, cornerY = 0.4 - 0.2 * open, lipTop = 0.88 - 0.7 * open, lipLow = lipTop + 1.12 * open, chin = 0.5 * cornerY + 0.5 * lipLow, eyeY = -0.2 - 0.06 * open;
    g.save();
    g.translate(cx, cy);
    g.rotate(tilt);
    g.scale(r, r);
    g.lineCap = g.lineJoin = "round";
    g.globalAlpha = alpha;
    g.globalCompositeOperation = "lighter"; // a soft light round it, steady
    g.fillStyle = acidRainbow("halo");
    g.fillRect(-1.7, -1.7, 3.4, 3.4);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = acidRainbow("skin");
    g.beginPath();
    g.arc(0, 0, 1, 0, TAU);
    g.fill();
    g.strokeStyle = ACID_INK;
    g.lineWidth = 0.07;
    g.stroke();
    g.fillStyle = ACID_INK;
    g.beginPath();
    for (let side = -1; side <= 1; side += 2) { g.moveTo(side * 0.34 + 0.13, eyeY); g.ellipse(side * 0.34, eyeY, 0.13, 0.27 * (1 - 0.72 * squint), 0, 0, TAU); }
    g.fill();
    if (open < 0.06) { // shut: the smile, one line
      g.lineWidth = 0.12;
      g.beginPath();
      g.moveTo(-cornerX, cornerY);
      g.quadraticCurveTo(0, lipLow, cornerX, cornerY);
      g.stroke();
    } else {
      g.save();
      acidLips(cornerX, cornerY, lipTop, lipLow);
      g.fillStyle = "#2a0a0e";
      g.fill();
      g.clip(); // what is inside the mouth stays inside it
      g.strokeStyle = "#fffbe6"; // the upper teeth, along the lip
      g.lineWidth = 0.3 * open;
      g.lineCap = "butt";
      g.beginPath();
      g.moveTo(-cornerX, cornerY);
      g.quadraticCurveTo(0, lipTop, cornerX, cornerY);
      g.stroke();
      g.fillStyle = "#ff5c8d"; // the tongue lying in it
      g.beginPath();
      g.ellipse(0, chin + 0.02, 0.3, 0.26 * open, 0, 0, TAU);
      g.fill();
      g.restore();
      g.lineWidth = 0.09;
      acidLips(cornerX, cornerY, lipTop, lipLow);
      g.stroke();
      if (tongue > 0.04) { // and out over the lower lip, on an accent
        const tip = chin + 0.34 * tongue;
        g.fillStyle = "#ff5c8d";
        g.lineWidth = 0.05;
        g.beginPath();
        g.moveTo(-0.2, chin - 0.2);
        g.lineTo(-0.2, tip - 0.2);
        g.quadraticCurveTo(-0.2, tip, 0, tip);
        g.quadraticCurveTo(0.2, tip, 0.2, tip - 0.2);
        g.lineTo(0.2, chin - 0.2);
        g.closePath();
        g.fill();
        g.stroke();
        g.strokeStyle = "rgba(170,24,72,.7)"; // the line down its middle
        g.lineWidth = 0.035;
        g.beginPath();
        g.moveTo(0, chin - 0.12);
        g.lineTo(0, tip - 0.1);
        g.stroke();
      }
    }
    g.restore();
  }
  function acidSing() { // from drawFrame(), where the visitors are drawn. While it is there drawFrame keeps the picture as it was without it and puts that back before the next frame, so an effect that keeps part of its last frame gets no echoes of the singer
    const S = acidSinger;
    if (S.show <= 0) return;
    if (!acidArt) acidArt = acidPaints();
    const tall = h > w, m = Math.min(w, h), up = 1 - (1 - clamp(S.ramp / 0.8)) ** 3, r = m * (tall ? 0.14 : 0.13); // wide: at the right, up from below, singing to the left. Tall, as on a phone: at the top right, down from above, singing downwards and keeping to its side
    const x = tall ? w * 0.74 : w * 0.87, y = tall ? h * 0.12 - (1 - up) * (h * 0.12 + r * 1.2) : h * 0.58 + (1 - up) * (h * 0.42 + r * 1.2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (tall) acidRibbon(x, y + r * 0.55, true, m); else acidRibbon(x - r * 0.1, y + r * 0.5, false, m);
    acidFace(x, y - r * 0.05 * S.punch, r * (1 + 0.04 * S.punch), clamp(0.2 + 0.25 * S.v + 0.6 * S.wah) * S.show, S.tongue * S.show, clamp(1.3 * S.wah - 0.35) * S.show, S.nod, clamp(S.ramp * 4));
  }
  /* ==== acid: end ==== */
  /* ==== band: begin ==== */
  /* The band: what the picture does for claps, snare rolls, risers and hard kicks, the way the smiley sings the 303. One small company plays all of them:
       the crowd    along the bottom edge with its back to us, watching the picture as we do. It claps with the claps, lifts its hands higher and shakes them through a roll and a build, and jumps when the drop lands
       the dancer   a small figure stamping on a pair of speakers whose cones punch out with each kick, one stamp a kick: in the hard mood only (hardcore, gabber, hardstyle and their kin)
       the rocket   it climbs with a riser and bursts into sparks when the riser ends
     Each of them comes and goes: none is there for a whole song. First two ears, which listen for what they play to, then the company itself. */

  /* The ear for claps, snares and snare rolls, from the spectrum the page already has. A clap or a snare is a burst of noise across the MIDDLE of the sound that comes up within a frame or two
     and is mostly still there a twentieth of a second later. So, every frame:
       1. six numbers: the mean of the low end (47-150 Hz) and of five bands A 300-700, B 700-1500, C 1500-3200, D 3200-5500, E 5500-8500 Hz. A few loud narrow peaks (a note) move a mean
          little, and noise that fills the band moves it a lot. And one more, "peaky": how far the loudest place in a stretch of the middle stands above that stretch's mean (noise: 15-25; notes: more).
       2. a BURST starts when B, C and D have all risen over their lowest of the last 55 ms. It is followed until 58 ms after its top: how high each band got, whether the low end rose with it
          (a kick under it), and how much of the height is still there at the end.
       3. it is a CLAP when it is wide (B, C and D all up, none far behind: a distorted kick falls away steeply), heavier in the middle than at the top (a hat, or an open hat over a bass note, is not),
          quick to rise, mostly but not wholly still there 58 ms after its top (a kick's click and a rimshot are gone; a held note has not fallen at all), not peaky (a stab, a 303 note), and
            with a kick under it: clearly bigger than what kicks alone do in this song (a gabber kick fills the middle on every beat: that is the kick);
            with no kick under it: the last such burst was more than a beat and a quarter ago (the open hat over the off-beat bass comes every beat; claps do not).
       4. that answer comes 70-100 ms after the hit. So the ear LEARNS: once bursts of a certain size and tilt have proved to be claps, one that reaches that size is called at once,
          on its first or second frame; if it then turns out not to be one, that trust is taken away again.
       5. a ROLL is a run of bursts that are alike in size and tilt, evenly spaced, at most a quarter second apart. It takes about ten of them to be believed (a groove has shorter runs of
          the kind all the time), fewer once it has doubled its speed. It is further along the faster it goes and the longer it has run; when the hits blur into one noise it is held while the
          noise holds; it is dropped when the hits stop, when the middle falls away, or when the low end comes back (the drop). Twenty-four seconds at one speed and it is no longer believed.
       6. THE PATTERN. A clap is only given once claps have come evenly: the second of a pattern sets its pace (0.25 to 1.7 s), the third on time is the first to show, and from then on every one
          that lands on the pattern shows (up to three may go unheard in between). One off it is not shown and costs belief; with none for 2.6 places belief runs out in a second or two.
          Without this, a clap came now and then on nothing in particular in most hardcore, gabber, psytrance and goa.
       7. LOUDER OR FASTER. A run only counts as a roll once the middle has come up 3 to 7 steps since its fourth hit, or once it has doubled its speed and kept the new speed for five hits:
          a shaker, a line of hats and a speedcore kick do neither. And a roll is only given once it has been going 0.2 to 0.45 s: four quick hits in a groove are a fill.
       8. A SLOW PAGE. A rise is timed in whole frames, so the longest frame of a burst, less a sixtieth of a second, is added to what a rise may take.
     Everything is differences between loudnesses, so the volume does not matter; everything goes by the clock; nothing is made anew on any frame, and the same answer is handed back every time:
       clap       0, or 0.2 to 1 on the one frame a clap or snare ON THE PATTERN is heard (its strength): the one to clap hands to
       clapOn     0 to 1, how sure the pattern is: 0.5 and over, claps are being given. It falls to 0 within about three places of the pattern after the last clap
       clapEvery  seconds from clap to clap while claps are being given, else 0
       burst      0, or 0.2 to 1 on the frame ANY burst is taken for a clap or snare, on the pattern or not
       roll       0 to 1, how surely a roll is going and how far it has got;  rollRate  its hits a second;  rollHit  0, or 0.2 to 1 on the frame a hit of a believed roll lands
     It was made and judged outside the page, on 91 minutes of real music and on made-up sounds; its numbers are the judge's, unchanged. Claps are good enough as they are. A roll is not
     good enough to be believed on its own: the page only believes one while its own build is on. */
  function clapEarFor(binHz) {
    const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    // the bands
    const EDGES_HZ = [47, 150, 300, 700, 1500, 3200, 5500, 8500]; // low end (under a snare's own tone) | (not used) | A | B | C | D | E
    const LOW = 0, A = 1, B = 2, C = 3, D = 4, E = 5;            // where each is kept
    const PARTS = 3;                                              // B, C and D are each cut in three for "peaky"
    // a burst
    const PRE_WIN = 0.058;               // s: a band's level "before" is its lowest over this long
    const START_BR = 3, START_M = 6;     // steps: B, C, D must each have risen this much, and this much on average, for a burst to start
    const CONF = 0.058, GIVE_UP = 0.14;  // s after its top at which a burst is judged; s after its start at which one that keeps rising is dropped (a swell, not a hit)
    const RISE_MAX = 0.055;              // s from start to top: slower is not a hit
    const AGAIN = 0.03;                  // s after its top from which a new burst may cut in (the next hit of a quick roll); the one before is then judged early
    // a clap
    const CLAP_BR = 7, CLAP_M = 9;       // steps: the least each of B, C, D rose, and the least they rose on average
    const WIDE = 0.35;                   // the band of B, C, D that rose least must have risen this share of the one that rose most
    const TILT = 5, B_SHARE = 0.35;      // "tilt" is the mean rise of B and C less E's: the middle must have risen this much more than the top; and B this share of the more of C and D
    const STAY = [0.42, 0.58, 0.93], STAY_H = [45, 70]; // the share of the middle's height still there CONF after the top: under STAY[0] it is a click (under STAY[1] for a big rise: the page's own smoothing cannot let a big click fall faster); over STAY[2] it is a held note
    const PEAKY_OK = 29, PEAKY_DROP = 0.75, PEAKY_RAW = 32; // "peaky" at the top may be this much, or this share of what it was before (noise over a tune flattens it); a roll's hit may be PEAKY_RAW
    const LOW_RISE = 10, LOW_OVER = 10;  // "with a kick": the low end rose this many steps, and stands this many over the middle
    const KICK_MUL = 1.2, KICK_ADD = 3, KICK_OVER = 5; // with a kick, the middle must rise over KICK_MUL times what kicks alone do and KICK_ADD more, and reach KICK_OVER over the level they reach
    const KICK_DOWN = 0.5, KICK_UP = 0.2, KICK_SEEN = 3; // how fast "what kicks alone do" follows a smaller burst, and a bigger one; kicks that must have been seen first
    const SPARSE = [1.25, 0.52];         // with no kick under it: the last burst with no kick must be over SPARSE[0] beats ago (SPARSE[1] s when the beat is not known)
    const BEAT = [0.27, 0.75], BEAT_AGE = 4; // s between two kicks that can be a beat; s without one before the beat counts as not known
    const GAP = 0.06;                    // s: no two claps closer than this
    const FULL = 30;                     // steps of rise that give strength 1
    // learning
    const TRUST_UP = 0.34, TRUST_DOWN = 0.5, TRUST_GO = 0.6, TRUST_FADE = 12; // trust gained by a clap that proved itself, lost by an early call that did not; needed to call early; s to forget
    const LIKE = 0.75, LIKE_TILT = 8;    // an early call needs this share of the learnt height, and a tilt within this of the learnt one
    // a roll
    const RAW_UP = 4, RAW_TILT = -10, RAW_B = 0.4; // a roll's hit: the least rise of C and of D (neither under WIDE of the other), the least of that rise less E's (a snare may be bright, a hat is brighter), and B's share of the more of C and D. It need not stay
    const ODD = 3;                       // a hit that does not fit costs the run this many hits
    const MAX_GAP = 0.27, MIN_GAP = 0.045; // s between hits of a roll
    const SAME = [0.4, 2.5, 0.15], SAME_TILT = 10; // a hit belongs to the run if its rise is within SAME[0] to SAME[1] times the run's usual (from SAME[2] when the roll has just doubled: hits that follow closer rise less), and its tilt within this of the run's
    const EVEN = [0.4, 1.3];             // and its gap within these times the run's usual gap (0.5 is the roll doubling its speed)
    const MISS = [1.7, 2.3];             // one hit not heard: a gap within these times the usual one keeps the run going
    const END = [2.3, 0.02], END_DROP = 12; // the roll is over when no hit came for END[0] times the gap and END[1] s more, or at once when the middle falls END_DROP under the run's level
    const DROP = 20, DROP_FROM = 6;      // the low end coming up this many steps over the most it reached during a run of DROP_FROM hits or more ends the roll at once: the drop
    const TIRE = 24, REST = 60;          // s of roll at one speed after which it is no longer believed (it fades over the second half of that); s without a roll to forget it
    const SURE_FAST = [6, 14], SURE_SLOW = [7, 14], FAST = 6.5, FASTER = 4; // hits in the run from "no" to "sure": at FAST a second or more, and slower; hits a doubling of speed is worth
    const BLUR_FROM = 8, BLUR_HOLD = 5, BLUR_END = 9, BLUR_MAX = 1.5, BLUR_MORE = 0.15; // hits before a blur is believed; steps under the run's level the noise may sit to start a hold, and to end it; s a hold lasts at most; what it adds to roll
    // the pattern, louder or faster, and a slow page
    const EVERY = [0.25, 1.7];           // s: the shortest and longest time from one clap to the next that can be a pattern (every beat at 200 a minute, every other beat at 70)
    const ON_TIME = [0.035, 0.03];       // a clap is on the pattern when it lands within ON_TIME[0] s, and ON_TIME[1] of the time since the last one, of where the pattern puts it
    const SKIP_NEW = 2, SKIP_KEPT = 4;   // how many places of the pattern may lie between two claps: while the pattern is being proved, and once it is believed
    const PROOF = [0.15, 0.34, 0.2, 0.34]; // belief: what the second clap of a pattern gives, each one on time after it, one on time after a skipped place, and what one off the pattern takes away
    const SHOWN = 0.45;                  // belief at which claps are given (so the third clap of a pattern is the first to show)
    const OVERDUE = 2.6, FORGET = 0.5;   // with no clap for OVERDUE places belief falls, by FORGET a second
    const ROLL_IN = [0.2, 0.45];         // s a roll must have been going before it is given: from nothing to in full
    const FAST_PROOF = 5;                // hits at the new speed after a run has doubled its speed before "it got faster" is believed
    const SWELL = [3, 7], SWELL_FROM = 4; // steps the middle must have come up over a run, from its SWELL_FROM-th hit on, for the run to count as a roll: from "no" to "yes"
    const STRIDE = 0.012, PAUSE = 0.25;  // the shortest time between two looks; a gap this long starts afresh

    const bin = (hz) => Math.max(1, Math.min(1023, Math.round(hz / binHz)));
    const lowFrom = bin(EDGES_HZ[0]), lowTo = bin(EDGES_HZ[1]);
    const edges = [];
    for (let b = 2; b < 7; b++) { const pieces = b >= 3 && b <= 5 ? PARTS : 1; for (let p = 0; p < pieces; p++) edges.push(EDGES_HZ[b] * (EDGES_HZ[b + 1] / EDGES_HZ[b]) ** (p / pieces)); }
    edges.push(EDGES_HZ[7]);
    const NE = edges.length, cut = Int16Array.from(edges, bin); // A, then B, C, D in PARTS pieces each, then E
    const now = new Float32Array(6), pre = new Float32Array(6), base = new Float32Array(6), top = new Float32Array(6), hist = new Float32Array(4 * 6), histAge = new Float32Array(4).fill(9);
    let slot = 0, peaky = 0, peakyWas = 0, peakyWas2 = 0, wait = 0;
    // the burst being followed
    let on = false, age = 0, sinceTop = 0, riseT = 0, topMid = 0, baseMid = 0, basePeaky = 0, topPeaky = 0, lowUp = 0, rawDone = false, called = 0;
    let sinceClap = 9, sinceBurst = 9, sinceBare = 9; // s since the last clap, the last burst's start, the last burst with no kick under it
    // what this song's kicks do, its beat, and what its claps are like
    let kickRise = 0, kickTop = 0, kickSeen = 0, beat = 0, sinceKick = 9, beatAge = 9, odd = 0, trust = 0, likeMid = 0, likeTilt = 0, likeKick = 0;
    // the roll
    let runN = 0, gap = 0, usual = 0, usualTilt = 0, sinceHit = 9, runT = 0, runLevel = 0, runLow = 0, blur = 0, roll = 0, rate = 0, tired = 0, level0 = 0, faster = false, fastIn = 0, rollFor = 0;
    // a slow page, and the pattern of the claps
    let slack = 0; // how much longer than a sixtieth of a second the longest look of this burst took
    let every = 0, belief = 0, sinceOn = 9, heardNow = 0, heardAge = 0;
    const out = { clap: 0, clapOn: 0, clapEvery: 0, burst: 0, roll: 0, rollRate: 0, rollHit: 0 };

    function measure(freq) {
      let s = 0;
      for (let k = lowFrom; k < lowTo; k++) s += freq[k];
      now[LOW] = s / (lowTo - lowFrom);
      let band = A, sum = 0, n = 0, pk = 0, i = 0;
      peaky = 0;
      for (let piece = 0; piece < NE - 1; piece++) {
        const a = cut[piece], b = cut[piece + 1]; let ps = 0, m = 0;
        for (let k = a; k < b; k++) { const v = freq[k]; ps += v; if (v > m) m = v; }
        sum += ps; n += b - a;
        const inMid = band >= B && band <= D;
        if (inMid) { pk += m - ps / (b - a); i++; }
        if (!inMid || i === PARTS) { now[band] = sum / n; if (inMid) peaky += pk / (3 * PARTS); band++; sum = 0; n = 0; pk = 0; i = 0; }
      }
    }
    function kickSaw(h, level) { // what a kick did to the middle: followed down quickly, up slowly, so a clap on every other kick does not lift it
      if (kickSeen === 0) { kickRise = h; kickTop = level; } else { kickRise += (h - kickRise) * (h < kickRise ? KICK_DOWN : KICK_UP); kickTop += (level - kickTop) * (level < kickTop ? KICK_DOWN : KICK_UP); }
      if (kickSeen < 99) kickSeen++;
    }
    function endRun() { fastIn = 0; runN = 0; gap = 0; blur = 0; roll = 0; rate = 0; runT = 0; faster = false; level0 = 0; }
    function rawHit(up, tilt) { // a hit for the roll: up is how far C and D rose, tilt that less how far E rose. Says whether it is one of a run
      const g = sinceHit, twice = gap > 0 && g < 0.75 * gap, like = runN > 0 && up >= SAME[twice ? 2 : 0] * usual && up <= SAME[1] * usual && Math.abs(tilt - usualTilt) <= SAME_TILT;
      if (like && gap > 0 && g >= EVEN[0] * gap && g <= EVEN[1] * gap) { runN++; runT += g; if (twice) { if (runN > 4) { runN += FASTER; fastIn = FAST_PROOF; } gap = g; tired = 0; usual = up; } else { gap += (g - gap) * 0.35; if (fastIn > 0 && --fastIn === 0) faster = true; } } // a doubling is taken at once, and is a roll for sure
      else if (like && gap > 0 && g >= MISS[0] * gap && g <= MISS[1] * gap) { runN++; runT += g; }                   // one was not heard
      else if (like && gap === 0 && g >= MIN_GAP && g <= MAX_GAP) { runN = 2; gap = g; runT = g; }                   // the second hit sets the pace
      else { // it does not fit
        if (blur > 0) return false; // in a blur what is heard of single hits is by chance
        runN -= ODD;
        if (runN >= 1 && g < END[0] * gap) return false; // an odd hit inside a run: passed over
        endRun(); runN = 1; gap = 0; usual = up; usualTilt = tilt; sinceHit = 0; runLevel = topMid; runLow = now[LOW];
        return false;
      }
      sinceHit = 0; blur = 0;
      usual += (up - usual) * 0.3; usualTilt += (tilt - usualTilt) * 0.3;
      runLevel = runN <= 2 ? topMid : runLevel + (topMid - runLevel) * 0.3;
      if (level0 === 0 && runN >= SWELL_FROM) level0 = runLevel;
      return true;
    }

    let hb = 0, hc = 0, hd = 0, h = 0, tilt = 0, br = 0, shape = false, plain = false, withKick = false, overKick = false, sparse = false; // the burst being followed, sized up
    function sizeUp() {
      hb = top[B] - base[B]; hc = top[C] - base[C]; hd = top[D] - base[D]; h = (hb + hc + hd) / 3; tilt = (hb + hc) / 2 - (top[E] - base[E]);
      br = hb < hc ? (hb < hd ? hb : hd) : hc < hd ? hc : hd;
      const most = hb > hc ? (hb > hd ? hb : hd) : hc > hd ? hc : hd;
      shape = br >= WIDE * most && tilt >= TILT && hb >= B_SHARE * (hc > hd ? hc : hd);
      plain = topPeaky <= PEAKY_OK || topPeaky <= PEAKY_DROP * basePeaky;
      withKick = lowUp >= LOW_RISE && top[LOW] >= topMid + LOW_OVER;
      overKick = kickSeen >= KICK_SEEN && h >= kickRise * KICK_MUL + KICK_ADD && topMid >= kickTop + KICK_OVER;
      sparse = sinceBare >= (beat > 0 && beatAge <= BEAT_AGE ? SPARSE[0] * beat : SPARSE[1]);
    }
    function judge(level) { // the burst is over: was it a clap? level: where the middle stands now
      const stays = (level - baseMid) / (topMid - baseMid + 1e-6);
      let is = br >= CLAP_BR && h >= CLAP_M && shape && stays >= STAY[0] + (STAY[1] - STAY[0]) * unit((h - STAY_H[0]) / (STAY_H[1] - STAY_H[0])) && stays <= STAY[2] && plain && riseT <= RISE_MAX + slack;
      if (withKick) { if (!overKick) is = false; kickSaw(h, topMid); }
      else { if (!sparse) is = false; if (br >= RAW_UP && h >= START_M) sinceBare = 0; }
      if (is) {
        if (trust < 0.05) { likeMid = h; likeTilt = tilt; likeKick = withKick ? 1 : 0; } else { likeMid += (h - likeMid) * 0.3; likeTilt += (tilt - likeTilt) * 0.3; likeKick += ((withKick ? 1 : 0) - likeKick) * 0.3; }
        trust = Math.min(1, trust + TRUST_UP);
        if (!called && sinceClap >= GAP) { heardNow = unit(0.2 + (0.8 * h) / FULL); heardAge = age; sinceClap = 0; }
      } else if (called === 1) trust = Math.max(0, trust - TRUST_DOWN); // called early and wrong
      on = false;
    }

    return (freq, dt, kick) => { // freq: the analyser's 1024 places; dt: seconds since it last heard; kick: -1, or 0 to 1 on the frame the page's kick lands
      if (!(dt > 0)) dt = 1 / 60; // 0, negative or not a number: taken for a usual frame
      out.clap = 0; out.burst = 0; out.rollHit = 0; heardNow = 0;
      wait += dt;
      if (wait < STRIDE) return out;
      dt = wait; wait = 0;
      if (dt > PAUSE) { on = false; histAge.fill(9); endRun(); sinceHit = 9; out.roll = 0; out.rollRate = 0; if (dt > 2 * EVERY[1]) { every = 0; belief = 0; out.clapOn = 0; out.clapEvery = 0; } sinceOn += dt - PAUSE; dt = PAUSE; } // back from a pause: nothing that was going on still is
      measure(freq);
      const mid = (now[B] + now[C] + now[D]) / 3;
      // the level before: each band's lowest over the last PRE_WIN (the look just before always counts)
      let had = 0;
      for (let i = 0; i < 4; i++) {
        histAge[i] += dt;
        if (histAge[i] <= PRE_WIN || (histAge[i] < 9 && i === ((slot + 3) & 3))) { for (let b = 0; b < 6; b++) { const v = hist[i * 6 + b]; if (!had || v < pre[b]) pre[b] = v; } had = 1; }
      }
      for (let b = 0; b < 6; b++) hist[slot * 6 + b] = now[b];
      histAge[slot] = 0; slot = (slot + 1) & 3;
      sinceClap += dt; sinceHit += dt; sinceBurst += dt; sinceBare += dt; sinceKick += dt; beatAge += dt;
      trust *= Math.exp(-dt / TRUST_FADE);
      if (kick >= 0) { // the page's kick: the beat; and what a kick with no burst does to the middle (nothing)
        if (sinceKick >= BEAT[0] && sinceKick <= BEAT[1]) { if (beat === 0 || beatAge > BEAT_AGE || odd >= 2) { beat = sinceKick; odd = 0; beatAge = 0; } else if (Math.abs(sinceKick - beat) < 0.15 * beat) { beat += (sinceKick - beat) * 0.3; odd = 0; beatAge = 0; } else odd++; }
        sinceKick = 0;
        if (!on && sinceBurst > 0.2) kickSaw(0, mid);
      }

      if (had) {
        const rb = now[B] - pre[B], rc = now[C] - pre[C], rd = now[D] - pre[D], fresh = rb >= START_BR && rc >= START_BR && rd >= START_BR && rb + rc + rd >= 3 * START_M;
        if (on && rawDone && sinceTop >= AGAIN && fresh) { sizeUp(); judge((pre[B] + pre[C] + pre[D]) / 3); } // the next hit cuts in: the one before is judged by how far it had fallen
        if (!on) {
          if (fresh) {
            on = true; slack = dt > 0.018 ? dt - 0.018 : 0; sinceBurst = 0; age = 0; sinceTop = 0; riseT = 0; rawDone = false; called = 0;
            for (let b = 0; b < 6; b++) { base[b] = pre[b]; top[b] = now[b]; }
            baseMid = (pre[B] + pre[C] + pre[D]) / 3; topMid = mid; basePeaky = peakyWas < peakyWas2 ? peakyWas : peakyWas2; topPeaky = peaky; lowUp = now[LOW] - base[LOW];
          }
        } else {
          age += dt; if (sinceTop === 0 && dt - 0.018 > slack) slack = dt - 0.018;
          for (let b = 0; b < 6; b++) if (now[b] > top[b]) top[b] = now[b];
          if (now[LOW] - base[LOW] > lowUp) lowUp = now[LOW] - base[LOW];
          if (mid > topMid + Math.max(1, 0.1 * (topMid - baseMid))) { topMid = mid; sinceTop = 0; riseT = age; topPeaky = peaky; } // still rising
          else { if (mid > topMid) topMid = mid; sinceTop += dt; }                                                                  // creeping up a little is not
        }
      }
      if (on) {
        sizeUp();
        if (!rawDone && (sinceTop > 0 || age >= RISE_MAX)) { // the rise is over: a hit for the roll?
          rawDone = true;
          const up = (hc + hd) / 2, upTilt = up - (top[E] - base[E]);
          if (hc >= RAW_UP && hd >= RAW_UP && (hc < hd ? hc >= WIDE * hd : hd >= WIDE * hc) && hb >= RAW_B * (hc > hd ? hc : hd) && upTilt >= RAW_TILT && (plain || topPeaky <= PEAKY_RAW) && riseT <= RISE_MAX + slack) {
            if (rawHit(up, upTilt) && !called && runN >= SURE_FAST[1] && tired < 1 && sinceClap >= GAP) { called = 2; if (roll > 0) out.rollHit = unit(0.2 + (0.8 * h) / FULL); } // inside a roll that is believed every hit is given, as rollHit
          }
        }
        if (!called && trust >= TRUST_GO && sinceClap >= GAP && h >= LIKE * likeMid && Math.abs(tilt - likeTilt) <= LIKE_TILT && br >= CLAP_BR && shape && plain && (likeKick > 0.5 ? overKick : sparse && !withKick)) { // like this song's claps: call it now
          called = 1; heardNow = unit(0.2 + (0.8 * h) / FULL); heardAge = age; sinceClap = 0;
        }
        if (sinceTop >= CONF) judge(mid); else if (age > GIVE_UP) on = false;
      }
      peakyWas2 = peakyWas; peakyWas = peaky;

      // the roll
      if (runN > 0 && now[LOW] > runLow) { if (runN >= DROP_FROM && now[LOW] > runLow + DROP) endRun(); else runLow = now[LOW]; }
      if (runN > 0) {
        if (blur > 0) { // the hits have blurred into one noise: held while it holds
          blur += dt;
          if (mid < runLevel - BLUR_END || blur > BLUR_MAX) endRun();
        } else if (gap > 0 && (sinceHit > END[0] * gap + END[1] || (sinceHit > 1.3 * gap && mid < runLevel - END_DROP))) {
          if (runN >= BLUR_FROM && gap <= 0.14 && mid >= runLevel - BLUR_HOLD && sinceHit <= END[0] * gap + END[1] + dt) blur = dt; else endRun();
        } else if (gap === 0 && sinceHit > MAX_GAP) endRun();
      }
      if (runN > 0 && gap > 0) {
        rate = 1 / gap;
        const sure = rate >= FAST ? unit((runN - SURE_FAST[0]) / (SURE_FAST[1] - SURE_FAST[0])) : unit((runN - SURE_SLOW[0]) / (SURE_SLOW[1] - SURE_SLOW[0]));
        const proof = faster ? 1 : level0 > 0 ? unit((runLevel - level0 - SWELL[0]) / (SWELL[1] - SWELL[0])) : 0; // it has got faster, or louder
        roll = sure * proof * (0.35 + 0.45 * unit(Math.log2(rate / 4) / 2) + 0.2 * unit(runT / 6));
        if (blur > 0) roll = unit(roll + BLUR_MORE);
        if (roll > 0) tired += dt / TIRE;
        roll *= unit(2 - 2 * tired); // full until half tired, then fading
      } else { roll = 0; rate = 0; tired -= dt / REST; if (tired < 0) tired = 0; }
      if (tired > 2) tired = 2;
      rollFor = roll > 0 ? rollFor + dt : 0;
      roll *= unit((rollFor - ROLL_IN[0]) / (ROLL_IN[1] - ROLL_IN[0]));
      out.roll = roll; out.rollRate = roll > 0 ? rate : 0;

      // the pattern: a clap is only given once claps have come evenly (a clap now and then, on nothing in particular, is worse than none)
      sinceOn += dt;
      if (heardNow > 0) {
        out.burst = heardNow; let fit = false;
        const g = sinceOn - heardAge, m = every > 0 ? Math.round(g / every) : 0; // from where the last one began to where this one began: one may be called on its first frame and the next only when it is over
        if (every > 0 && m >= 1 && m <= (belief >= SHOWN ? SKIP_KEPT : SKIP_NEW) && Math.abs(g - m * every) <= ON_TIME[0] + ON_TIME[1] * g) { // on the pattern
          belief = Math.min(1, belief + (m === 1 ? PROOF[1] : PROOF[2])); every += (g / m - every) * 0.25; sinceOn = heardAge; fit = true;
        } else if (every > 0 && belief > PROOF[3]) belief -= PROOF[3]; // one off the pattern: the pattern is kept, a little less sure (and the time is still counted from the last one on it)
        else if (g >= EVERY[0] && g <= EVERY[1]) { every = g; belief = PROOF[0]; sinceOn = heardAge; } // the second of a new pattern
        else { every = 0; belief = 0; sinceOn = heardAge; } // the first
        if (belief >= SHOWN && fit) out.clap = heardNow;
      } else if (every > 0 && sinceOn > OVERDUE * every) { belief -= FORGET * dt; if (belief <= 0) { belief = 0; every = 0; } }
      out.clapOn = belief >= SHOWN ? 0.5 + (0.5 * (belief - SHOWN)) / (1 - SHOWN) : (0.5 * belief) / SHOWN; // 0.5 and over: claps are being given
      out.clapEvery = belief >= SHOWN ? every : 0;
      return out;
    };
  }

  /* The ear for risers: "is something climbing now, and where has it got to?" A riser is something that MOVES UP the pitch smoothly for a second or more: a note gliding up, a band of noise
     swept up by a filter, a filter's edge opening quickly. So this measures movement, not brightness:
       1. THE PICTURE  60 bands, twelve to the octave, 280 Hz to 8.5 kHz. A band is its loudest place, each place counting less the further it is from the band's middle, so a thin whistle shows in
                       its neighbours too and can be seen sliding between bands. Every band is averaged twice over time, quickly (0.06 s: "now") and slowly (0.3 s: "a moment ago").
       2. THE FLOW     If a shape slides up, each band changes over time exactly as the shape slopes across the bands, with the sign turned. So over nine bands at a time "how it changes" is laid
                       against "how it slopes", both less their own mean over the nine: how alike they are (-1 to 1) says whether what is there is moving, and which way; their ratio says how fast.
                       Taking the means away is what makes it blind to everything that only gets louder or quieter: a drum hit, a fade, hats or a lead coming in.
       3. TRACKS       Three tracks ride whatever is flowing UP (one more rides what flows down). A track starts where the flow, averaged over half a second, is strongest and cleanest; moves with
                       what it rides; and keeps tally of how sure the movement is, how far it has gone (octaves), how fast, for how long, and whether it rides a LINE (a crest standing above both
                       sides) or an EDGE (one side of something wide).
       4. A RISER      is a track that has gone 0.4 octaves or more, for about a second or more, at least fairly sure, at 0.1 octaves a second or more for a line and 0.3 or more for an edge
                       (a slowly opening filter is a slow edge: not a riser). Once believed it is kept while it is still there and still moving.
       5. NOT A RISER  Three things set a track's count back to nothing: a note STARTING ON it (its loudest band jumps far more than the middle one of the nine: a drum hit lifts them all, a note
                       only its own); until it is believed, a note starting NEAR it; and HAND-OVERS: lines that stand still and light up one after another, which are a tune stepping upward,
                       an arpeggio, or a filter opening over held notes (a 303's knob), however smooth they look in the bands. A glide moves the loudest place one at a time.
       6. LETTING GO   The track is dropped when the flow stops for a quarter of a second (less if the kick has just come back after a second without one: the drop); at once when its loudest band
                       falls far under what it has been (the sound was cut); and when it has sat at the top of what is read for 0.2 s (it left through the top).
       riser      0 to 1, how surely something is climbing now
       riserAt    0 to 1, where it is, 353 Hz to 6.7 kHz by octaves; eased over 0.1 s and never faster than 1.5 a second; it holds still with no riser, and starts at the right place when one begins
       riserGone  true on the one frame a riser that had been over 0.5 for 0.35 s or more has ended
       riserFor   seconds riser has been over 0.5 without a break: drawn from 0.35 on, so a flicker never shows
       faller, fallerAt  the same for something gliding down (seldom, and less well tried)
     Its numbers are the judge's, unchanged. It is precise but misses about half of the risers there are and comes late: when it fires the climb is drawn, but no riser never means no build. */
  function riserEarFor(binHz) {
    const unit = (x) => (x < 0 ? 0 : x > 1 ? 1 : x), ramp = (x, lo, hi) => unit((x - lo) / (hi - lo));
    const PER = 12, LOW_HZ = 280, NB = 60;   // bands an octave; the lowest band's middle; bands (the top one is at 8.46 kHz)
    const TOP_HZ = 8990;                     // nothing above this is read: it was only tried up to there
    const CONE = 14, REACH = 1.5;            // steps a place loses for every band it is away from a band's middle; how many bands away it still counts
    const TA = 0.06, TB = 0.3;               // seconds: the quick and the slow average of every band
    const W = 4;                             // bands each side that are looked at together (nine in all)
    const T_MAP = 0.5;                       // seconds the flow in every place is averaged over, for choosing where a track starts
    const R_NEW = 0.35, UP_NEW = 25;         // to start a track: how alike that averaged flow is, and its size
    const APART = 5;                         // bands two tracks must be apart when one starts; two that come within 2 bands are one thing, and the less sure is dropped
    const T_NOW = 0.12;                      // seconds the track's "is it moving right now" tally remembers
    const R_KEEP = 0.25, UP_KEEP = 8;        // the likeness and size of the flow just now under which the track is "missing" what it rode
    const FADED = 0.25;                      // and so is flow weaker than this share of what has been usual on the track
    const MISS = 0.25, MISS_DROP = 0.08;     // seconds missing before the track is dropped; and in the 0.3 s after a kick that comes back after GAP seconds without one
    const GAP = 1.0;
    const GONE_BY = 40, T_LEVEL = 0.4;       // steps (12 dB) the track's loudest band may fall under its own average (over 0.4 s) before a believed riser is called cut;
    const SUNK = 0.25, SUNK_BY = 20;         // or: it stands out from the nine bands round it less than this share of what it did, and has itself fallen this many steps
    const TOP_HOLD = 0.2;                    // seconds a track may sit at the top of what is read before it is taken to have left through the top
    const SLEW = 1.5;                        // the most riserAt moves in a second (a jump from one track to another becomes a quick glide)
    const JUNK_AFTER = 1.0, JUNK_R = 0.3;    // an unproven track is given up after a second if its likeness is under this,
    const IDLE_AFTER = 1.5, IDLE = 0.06;     // or after a second and a half if it has not gone 0.06 octaves,
    const BACK = -0.15;                      // or at once if it has gone this far the wrong way;
    const AVOID = 1.5;                       // and no track starts within 3 bands of a place just given up for this long (s)
    const ONSET = 30, QUIET = 0.15;          // steps the loudest band must jump (over the middle band of the nine) to be a note starting; seconds between two "near" notes that count
    const NEAR_UNDER = 40;                   // a note "near" ends no more than this many steps under the track's loudest band
    const WIDE = 0;                          // what a note starting near an unproven track leaves of its count: nothing
    const TUNE = 3, T_TUNE = 2;              // an unproven track that has had this many notes start on it (counted over about 2 s) is riding a tune: given up, and the place avoided
    const FIXED = 0.12, SETTLED = 0.1, STEP = 3, DRIFT = 2; // a line that kept to one place for 0.12 s, then gave way to another STEP places or more off that keeps still for 0.1 s: a hand-over between lines that do not move
    const HANDS = 1.5, T_HANDS = 1.5;        // this many hand-overs (counted over about 1.5 s) and what the track rides is not moving at all
    const T_R = 0.8, T_SPEED = 1.5, T_LINE = 0.5; // seconds the tallies of likeness, of speed and of "is it a line" remember
    const PROM = [6, 14];                    // steps the crest stands above the lowest band 2 to 4 bands away, on its higher side: an edge, up to a line
    const SURE = [0.45, 0.6];                // from "no" to "yes": the likeness over T_R,
    const FAR = [0.3, 0.5];                  // octaves gone since the track started or a note last started on it,
    const LONG = [0.7, 1.2];                 // seconds since then,
    const SLOW_LINE = [0.085, 0.11], SLOW_EDGE = [0.25, 0.35]; // and octaves a second, for a line and for an edge
    const EASE = 0.9, EASE_SPEED = 0.5;      // once believed: the share of SURE and of the speed it must keep (a glide may flatten for a moment)
    const UP = 0.2, DOWN = 0.12;             // seconds for a track's sureness to come up and to go down
    const V_MAX = 72;                        // bands a second (6 octaves): faster than this is not measured
    const PAUSE = 0.25, STRIDE = 0.012;      // a gap this long starts afresh; the shortest time between two looks
    const GONE_MIN = 0.35;                   // riserGone is only given for a riser that had been over 0.5 this long (s): a flicker ending is not "the riser ended"
    const UPS = 3, N = 4;                    // tracks 0 to 2 look for what goes up, track 3 for what goes down

    const kTop = Math.min(1023, Math.floor(TOP_HZ / binHz)), DT = TB - TA, WN = 2 * W + 1, LAST = NB - 1 - W;
    // the cone: for every band, which places it reads and what each loses
    const k0 = new Int16Array(NB), k1 = new Int16Array(NB), off = new Int32Array(NB + 1), pens = [];
    for (let b = 0; b < NB; b++) {
      const c = LOW_HZ * 2 ** (b / PER); let a = Math.ceil((c * 2 ** (-REACH / PER)) / binHz), z = Math.floor((c * 2 ** (REACH / PER)) / binHz);
      if (z > kTop) z = kTop; if (a > z) a = z;
      k0[b] = a; k1[b] = z; off[b] = pens.length;
      for (let k = a; k <= z; k++) pens.push(CONE * Math.abs(Math.log2((k * binHz) / c)) * PER);
    }
    off[NB] = pens.length; const PEN = Float32Array.from(pens);
    // what it keeps
    const A = new Float32Array(NB), B = new Float32Array(NB), Mc = new Float32Array(NB), Mt = new Float32Array(NB), Mx = new Float32Array(NB);
    const on = new Uint8Array(N), held = new Uint8Array(N), q = new Float64Array(N), age = new Float64Array(N), life = new Float64Array(N), travel = new Float64Array(N), speed = new Float64Array(N), C = new Float64Array(N), VT = new Float64Array(N), VX = new Float64Array(N), Cs = new Float64Array(N), VTs = new Float64Array(N), VXs = new Float64Array(N), miss = new Float64Array(N), sure = new Float64Array(N), line = new Float64Array(N), level = new Float64Array(N), since = new Float64Array(N), crest = new Float64Array(N), stood = new Float64Array(N), topFor = new Float64Array(N), notes = new Float64Array(N), cur = new Int16Array(N), anchor = new Int16Array(N), stay = new Float64Array(N), moving = new Uint8Array(N), pend = new Int16Array(N), pendFor = new Float64Array(N), hands = new Float64Array(N);
    let started = false, wait = 0, sinceKick = 9, dropWatch = 0, shun = -99, shunFor = 0, at = 0.5, fallAt = 0.5, was = false, onFor = 0;
    // worked out afresh on every look
    const E = new Float32Array(NB), D = new Float32Array(NB), moves = new Float32Array(NB), G = new Float32Array(NB), sT = new Float64Array(NB + 1), sG = new Float64Array(NB + 1), sTG = new Float64Array(NB + 1), sTT = new Float64Array(NB + 1), sGG = new Float64Array(NB + 1), nine = new Float32Array(WN);
    const out = { riser: 0, riserAt: 0.5, riserGone: false, riserFor: 0, faller: 0, fallerAt: 0.5 };
    const LK = new Float64Array(3); // what look() found last, kept in a table so that writing it makes nothing new: cov, vt, vx
    const look = (b) => { // the nine bands round b: how "changing" goes with "sloping" (cov: negative is upward), and how much there is of each (vt, vx)
      const a = b - W, z = b + W + 1, t = sT[z] - sT[a], g = sG[z] - sG[a];
      LK[0] = sTG[z] - sTG[a] - (t * g) / WN; LK[1] = sTT[z] - sTT[a] - (t * t) / WN; LK[2] = sGG[z] - sGG[a] - (g * g) / WN;
    };
    const ridge = (c, near, reach, dir) => { // where, within reach of a place, the thing moving that way is: the middle of what moves round its strongest band
      const a = c - W, z = c + W, mt = (sT[z + 1] - sT[a]) / WN, mg = (sG[z + 1] - sG[a]) / WN; let top = 0, best = -1;
      for (let b = Math.max(a, Math.ceil(near - reach)); b <= Math.min(z, Math.floor(near + reach)); b++) { const u = -dir * (moves[b] - mt) * (G[b] - mg); if (u > top) { top = u; best = b; } }
      if (best < 0) return near;
      let s = 0, sb = 0;
      for (let b = Math.max(a, best - 2); b <= Math.min(z, best + 2); b++) { const u = -dir * (moves[b] - mt) * (G[b] - mg); if (u > 0) { s += u; sb += u * b; } }
      return sb / s;
    };
    const drop = (i, avoid) => { on[i] = 0; sure[i] = 0; held[i] = 0; if (avoid) { shun = Math.round(q[i]); shunFor = AVOID; } };

    return (freq, dt, kick) => { // freq: the analyser's 1024 places; dt: seconds since it last heard; kick: -1, or 0 to 1 on the frame the page's kick lands
      out.riserGone = false;
      if (!(dt > 0)) dt = 1 / 60;           // 0, negative or not a number: a frame is a frame
      wait += dt; if (wait < STRIDE) return out; // too soon after the last look: the same answer
      dt = wait; wait = 0;
      // 1. the picture
      for (let b = 0; b < NB; b++) { let m = 0, o = off[b]; for (let k = k0[b]; k <= k1[b]; k++, o++) { const v = freq[k] - PEN[o]; if (v > m) m = v; } E[b] = m; }
      if (!started || dt > PAUSE) { // the first look, or back from a pause: nothing is known about how things were moving
        for (let b = 0; b < NB; b++) { A[b] = B[b] = E[b]; Mc[b] = Mt[b] = Mx[b] = 0; }
        for (let i = 0; i < N; i++) { on[i] = 0; sure[i] = 0; held[i] = 0; }
        if (was) { was = false; out.riserGone = onFor >= GONE_MIN; }
        onFor = 0; out.riserFor = 0; started = true; dt = 1 / 60; shunFor = 0;
      }
      const fa = 1 - Math.exp(-dt / TA), fb = 1 - Math.exp(-dt / TB), fm = 1 - Math.exp(-dt / T_MAP);
      for (let b = 0; b < NB; b++) { D[b] = E[b] - A[b]; A[b] += D[b] * fa; B[b] += (E[b] - B[b]) * fb; moves[b] = A[b] - B[b]; }
      for (let b = 0; b < NB; b++) { const lo = b > 0 ? b - 1 : 0, hi = b < NB - 1 ? b + 1 : NB - 1; G[b] = (A[hi] + B[hi] - A[lo] - B[lo]) / (2 * (hi - lo)); }
      for (let b = 0; b < NB; b++) { const t = moves[b], g = G[b]; sT[b + 1] = sT[b] + t; sG[b + 1] = sG[b] + g; sTG[b + 1] = sTG[b] + t * g; sTT[b + 1] = sTT[b] + t * t; sGG[b + 1] = sGG[b] + g * g; }
      sinceKick += dt; dropWatch -= dt; shunFor -= dt;
      if (kick >= 0) { if (sinceKick > GAP) dropWatch = 0.3; sinceKick = 0; }
      // 2. the flow in every place, averaged; and the best place to start a track going up, and one going down
      let bestUp = -1, scoreUp = 0, bestDown = -1, scoreDown = 0;
      for (let b = W; b <= LAST; b++) {
        look(b); Mc[b] += (-LK[0] - Mc[b]) * fm; Mt[b] += (LK[1] - Mt[b]) * fm; Mx[b] += (LK[2] - Mx[b]) * fm;
        const m = Mc[b], size = m < 0 ? -m : m; if (size < UP_NEW) continue;
        const r = size / Math.sqrt(Mt[b] * Mx[b] + 1e-9); if (r < R_NEW) continue;
        if (m > 0) {
          if (m * r <= scoreUp || (shunFor > 0 && b >= shun - 3 && b <= shun + 3)) continue;
          let free = true; for (let i = 0; i < UPS; i++) if (on[i] && b > q[i] - APART && b < q[i] + APART) free = false;
          if (free) { scoreUp = m * r; bestUp = b; }
        } else if (size * r > scoreDown) { scoreDown = size * r; bestDown = b; }
      }
      // 3. the tracks
      for (let i = 0; i < N; i++) {
        const dir = i < UPS ? 1 : -1;
        if (!on[i]) {
          const b = dir > 0 ? bestUp : bestDown; if (b < 0) continue;
          on[i] = 1; held[i] = 0; q[i] = ridge(b, b, W, dir); age[i] = life[i] = travel[i] = speed[i] = miss[i] = sure[i] = line[i] = notes[i] = hands[i] = stay[i] = topFor[i] = 0; since[i] = 9; level[i] = -1; cur[i] = anchor[i] = pend[i] = -1; moving[i] = 0;
          C[i] = dir * Mc[b] * T_R * 0.5; VT[i] = Mt[b] * T_R * 0.5; VX[i] = Mx[b] * T_R * 0.5; Cs[i] = VTs[i] = VXs[i] = 0; // it starts half believed: what the average said
          if (dir > 0) bestUp = -1; else bestDown = -1;
        }
        // the flow where the track is (the best of four places round it, leaning the way it goes)
        const c = Math.max(W, Math.min(LAST, Math.round(q[i]))); let at2 = c, top = -1e9;
        for (let k = -1; k <= 2; k++) { const b = c + dir * k; if (b < W || b > LAST) continue; look(b); if (-dir * LK[0] > top) { top = -dir * LK[0]; at2 = b; } }
        look(at2);
        const flow = -dir * LK[0], vt = LK[1], vx = LK[2], keepR = Math.exp(-dt / T_R), keepS = Math.exp(-dt / T_NOW);
        C[i] = C[i] * keepR + flow * dt; VT[i] = VT[i] * keepR + vt * dt; VX[i] = VX[i] * keepR + vx * dt;
        Cs[i] = Cs[i] * keepS + flow * dt; VTs[i] = VTs[i] * keepS + vt * dt; VXs[i] = VXs[i] * keepS + vx * dt;
        const r = C[i] / Math.sqrt(VT[i] * VX[i] + 1e-9), rs = Cs[i] / Math.sqrt(VTs[i] * VXs[i] + 1e-9), size = Cs[i] < 0 ? -Cs[i] : Cs[i];
        const there = size > UP_KEEP * T_NOW * 0.5 && (life[i] < 1 || Cs[i] / T_NOW > (FADED * C[i]) / T_R), q0 = q[i];
        if (there && (rs > R_KEEP || rs < -R_KEEP)) { let v = Cs[i] / (VXs[i] * DT); if (v > V_MAX) v = V_MAX; else if (v < -V_MAX) v = -V_MAX; q[i] += dir * v * dt; } // it moves as fast as what it rides
        if (there && rs > R_KEEP) { let pull = (ridge(at2, q[i], 2.5, dir) - q[i]) * Math.min(1, dt / 0.2); if (pull > 0.5) pull = 0.5; else if (pull < -0.5) pull = -0.5; q[i] += pull; miss[i] = 0; } else miss[i] += dt; // and is drawn to the middle of it
        if (q[i] >= LAST) { q[i] = LAST; topFor[i] += dt; } else { topFor[i] = 0; if (q[i] < W) q[i] = W; }
        const moved = (dir * (q[i] - q0)) / PER;
        // what is on the track: its loudest band; the nearest crest, and whether that stands above both sides; whether a note has just started
        const cc = Math.max(W, Math.min(LAST, Math.round(q[i]))); let m = cc - 2, peak = 0, pk = cc, lo = 1e9, hi = 1e9;
        for (let b = cc - 2; b <= cc + 2; b++) if (E[b] > E[m]) m = b;
        for (let b = Math.max(4, cc - 3); b <= Math.min(NB - 5, cc + 3); b++) if (B[b] > peak) { peak = B[b]; pk = b; }
        for (let b = pk - 4; b <= pk - 2; b++) if (B[b] < lo) lo = B[b];
        for (let b = pk + 2; b <= pk + 4; b++) if (B[b] < hi) hi = B[b];
        for (let k = 0; k < WN; k++) { const v = D[cc - W + k]; let j = k; while (j > 0 && nine[j - 1] > v) { nine[j] = nine[j - 1]; j--; } nine[j] = v; } // the nine jumps, sorted: the middle one is what a drum hit would lift
        const mid = nine[W] > 0 ? nine[W] : 0, onset = D[m] - mid, now = E[m]; // now: how loud the loudest of the five bands on the track is
        let near = false; // a note starting NEAR the track: a band 2 or more away jumps up (more than the middle band) and ends nearly as loud as the track's own
        if (!held[i] && since[i] > QUIET) for (let b = cc - W; b <= cc + W; b++) if (D[b] - mid > ONSET && (b - m >= 2 || m - b >= 2) && E[b] >= now - NEAR_UNDER) { near = true; break; }
        crest[i] = pk; since[i] += dt;
        line[i] += (ramp(peak - (lo > hi ? lo : hi), PROM[0], PROM[1]) - line[i]) * Math.min(1, dt / T_LINE);
        notes[i] *= Math.exp(-dt / T_TUNE);
        if (onset > ONSET) { if (since[i] > QUIET) notes[i]++; age[i] = travel[i] = speed[i] = 0; held[i] = 0; since[i] = 0; } // a note started on it: the count starts again
        else if (near) { notes[i]++; age[i] *= WIDE; travel[i] *= WIDE; speed[i] *= WIDE; since[i] = 0; }
        // 5. is the thing itself moving, or are lines that stand still lighting up one after another? The loudest place under the crest: a glide moves it one at a time, noise throws it about, a tune or a filter over held notes keeps it still and then jumps
        let kb = k0[pk - 1], top2 = -1; for (let k = k0[pk - 1]; k <= k1[pk + 1]; k++) if (freq[k] > top2) { top2 = freq[k]; kb = k; }
        hands[i] *= Math.exp(-dt / T_HANDS); pendFor[i] += dt; if (pendFor[i] > 0.3) pend[i] = -1; // a line left behind is only remembered for a moment
        if (cur[i] < 0 || kb - cur[i] >= STEP || cur[i] - kb >= STEP) { // another line
          if (cur[i] >= 0 && !moving[i] && stay[i] >= FIXED) { pend[i] = anchor[i]; pendFor[i] = 0; } else if (stay[i] >= SETTLED) pend[i] = -1; // what was left stood still (or what stood still was left only for a moment: a drum hit)
          anchor[i] = kb; stay[i] = 0; moving[i] = 0;
        } else { stay[i] += dt; if (kb - anchor[i] >= DRIFT || anchor[i] - kb >= DRIFT) moving[i] = 1; if (pend[i] >= 0 && !moving[i] && stay[i] >= SETTLED) { if (anchor[i] - pend[i] >= STEP || pend[i] - anchor[i] >= STEP) hands[i]++; pend[i] = -1; } }
        cur[i] = kb;
        if (hands[i] >= HANDS) { age[i] = travel[i] = speed[i] = 0; held[i] = 0; }
        age[i] += dt; life[i] += dt; travel[i] += moved; speed[i] += (moved / dt - speed[i]) * Math.min(1, dt / T_SPEED);
        const quick = speed[i] / (1 - Math.exp(-age[i] / T_SPEED)), ease = held[i] ? EASE_SPEED : 1; // the speed since the count began (the average starts from nothing, so it is put right)
        const slow0 = (SLOW_EDGE[0] + (SLOW_LINE[0] - SLOW_EDGE[0]) * line[i]) * ease, slow1 = (SLOW_EDGE[1] + (SLOW_LINE[1] - SLOW_EDGE[1]) * line[i]) * ease;
        let want = ramp(quick, slow0, slow1);
        if (held[i]) { const s = ramp(r, SURE[0] * EASE, SURE[1] * EASE); if (s < want) want = s; }
        else { let s = ramp(r, SURE[0], SURE[1]); if (s < want) want = s; s = ramp(travel[i], FAR[0], FAR[1]); if (s < want) want = s; s = ramp(age[i], LONG[0], LONG[1]); if (s < want) want = s; }
        sure[i] += (want - sure[i]) * Math.min(1, dt / (want > sure[i] ? UP : DOWN));
        if (sure[i] > 0.5) held[i] = 1; else if (sure[i] < 0.25) held[i] = 0;
        let round = 0; for (let b = cc - W; b <= cc + W; b++) round += E[b]; const out9 = now - round / WN; // how far the track's loudest band stands out of the nine
        if (level[i] < 0) { level[i] = now; stood[i] = out9; }
        // 6. letting go
        if (miss[i] > (dropWatch > 0 ? MISS_DROP : MISS)) drop(i, false);
        else if (sure[i] > 0.3 && (now < level[i] - GONE_BY || (now < level[i] - SUNK_BY && stood[i] > 10 && out9 < SUNK * stood[i]))) drop(i, false);
        else if (dir > 0 && topFor[i] > TOP_HOLD) drop(i, false);
        else if (sure[i] < 0.3 && ((life[i] > JUNK_AFTER && r < JUNK_R) || (age[i] > IDLE_AFTER && travel[i] < IDLE) || notes[i] > TUNE)) drop(i, dir > 0);
        else if (travel[i] < BACK) drop(i, false);
        level[i] += (now - level[i]) * Math.min(1, dt / T_LEVEL); stood[i] += (out9 - stood[i]) * Math.min(1, dt / T_LEVEL);
      }
      for (let i = 0; i < UPS; i++) for (let j = 0; j < UPS; j++) if (i !== j && on[i] && on[j] && Math.abs(q[i] - q[j]) < 2 && sure[i] <= sure[j] && (sure[i] < sure[j] || life[i] < life[j])) drop(i, false); // two tracks on one thing
      // the answers: the surest track going up
      let best = -1, riser = 0;
      for (let i = 0; i < UPS; i++) if (on[i] && sure[i] > riser) { riser = sure[i]; best = i; }
      if (best < 0) for (let i = 0; i < UPS; i++) if (on[i] && (best < 0 || life[i] > life[best])) best = i;
      if (best >= 0 && riser > 0.1) { const to = unit(((line[best] > 0.5 ? crest[best] : q[best]) - W) / (LAST - W)); if (out.riser <= 0.1) at = to; else { let step = (to - at) * Math.min(1, dt / 0.1); const most = SLEW * dt; if (step > most) step = most; else if (step < -most) step = -most; at += step; } }
      if (riser > 0.5) { was = true; onFor += dt; } else if (was && riser < 0.3) { was = false; out.riserGone = onFor >= GONE_MIN; onFor = 0; } else if (!was) onFor = 0;
      out.riserFor = riser > 0.5 ? onFor : 0;
      if (on[UPS] && sure[UPS] > 0.1) fallAt += (unit((q[UPS] - W) / (LAST - W)) - fallAt) * Math.min(1, dt / 0.1);
      out.riser = riser; out.riserAt = at; out.faller = on[UPS] ? sure[UPS] : 0; out.fallerAt = fallAt;
      return out;
    };
  }

  /* The two ears in the song follower: follow() asks them on every frame the music is heard, just after the 303's, and their answers go on flow beside the rest:
     flow.clap, clapOn, clapEvery, roll, rollRate and rollHit from the first; flow.riser, riserAt, riserGone (1 on its frame) and riserFor from the second.
     As the 303's ear is, they are told the time since they last heard anything by the clock on the wall, so the first frame back from a pause, a seek or a hidden page comes with the
     whole gap and they start afresh; a new song makes them start afresh too. They are made when the music is first heard, and again only if the sound comes at another rate. */
  Object.assign(flow, { clap: 0, clapOn: 0, clapEvery: 0, roll: 0, rollRate: 0, rollHit: 0, riser: 0, riserAt: 0.5, riserGone: 0, riserFor: 0 });
  let clapEar = null, riserEar = null, bandEarHz = 0, bandHeardAt = 0;
  function bandHear(dt, hit) {
    if (!freq || freq.length < 512) return; // (they read the lower 384 places of the spectrum)
    if (bandEarHz !== binHz) { clapEar = clapEarFor(binHz); riserEar = riserEarFor(binHz); bandEarHz = binHz; }
    const gap = (realNow - bandHeardAt) / 1000, step = gap > 0 && gap < 1e9 ? gap : dt, c = clapEar(freq, step, hit), r = riserEar(freq, step, hit);
    bandHeardAt = realNow;
    flow.clap = c.clap;
    flow.clapOn = c.clapOn;
    flow.clapEvery = c.clapEvery;
    flow.roll = c.roll;
    flow.rollRate = c.rollRate;
    flow.rollHit = c.rollHit;
    flow.riser = r.riser;
    flow.riserAt = r.riserAt;
    flow.riserGone = r.riserGone ? 1 : 0;
    flow.riserFor = r.riserFor;
  }
  function bandNewSong() { bandHeardAt = realNow - 60000; company.rocket.on = false; company.rocket.ramp = company.rocket.show = 0; } // as if a minute had gone by: nothing of the last song's claps, roll or riser is left when this one starts. A rocket still up simply goes, so the ear's fresh start is not taken for its riser ending (no burst at the change of song)

  /* The company. What it does with the ears' answers is worked out once a frame, in bandNow(), and the drawing reads that and nothing else. Who comes, and when:
       the crowd    comes when the claps have come evenly for a while (flow.clapOn has reached 0.75 and four claps of the pattern have been given: about the sixth clap heard), when the
                    page's own build has been on and past half way (flow.build over 0.5) for two seconds, or on a drop that ends a build. Once come it stays three seconds at least, and then
                    while claps are being given (clapOn 0.5 and over), while the build is on, and for five seconds after the drop; then it goes. A snare roll is only believed while the
                    page says a build is on: then the hands go higher and shake with it. A visit lasts at most 24 seconds (only the five seconds after a drop's jump may hold it longer),
                    and after a visit it keeps away for as long as that visit's share of 48 seconds (48 after a whole one) before it may come back; a build or a drop may cut that rest
                    short once half of it is over.
       the dancer   only in the hard mood (hardcore, gabber, hardstyle and their kin), once the kick has been running a second and a half. One stamp a kick, at the song's tempo. It goes three
                    seconds after the kick stops, and after 20 seconds of dancing at most, then keeps away for that visit's share of 50 seconds (a drop, within three seconds of the kick
                    coming back, may bring it back once half of that is over).
       the rocket   when the riser ear has been more than half sure for 0.35 s. It climbs as the riser does and never comes back down; it bursts into sparks when the riser ends, when the drop
                    lands, when the riser has been unsure for more than a second, or after 24 seconds (one that ends before it is clear of the floor simply goes). Another may only go up after
                    as long as this one flew, up to six seconds.
     The "Crowd and dancers" slider: at 0 nobody comes. Above 1 the visits may be longer and the rests are shorter by as much (at 2 the crowd stays up to 48 s and rests up to 24,
     the dancer 40 and 25, the rocket waits up to 3 s), the crowd is fuller and everyone a little bigger; under 1 the other way round (down to a quarter). */
  const BAND_KEEP = 128, BAND_TICK = 1 / 60, BAND_MOST = 40, BAND_FIG = 25; // what is remembered, sixty times a second; the most figures in a row; the numbers kept for each figure
  const BAND_HARD = [255, 50, 40, 170, 20, 30, 255, 140, 60], BAND_ACID = [246, 230, 50, 150, 240, 60, 255, 140, 30]; // the company's colors in the hard mood and in acid (anything else takes the picture's)
  const BAND_LEG = Float32Array.of(0, 0.1, 0.25, 0.5, -0.05, 0.4, 1, -0.3, 1.6, 1.45, 0.95, 0.3, 2, 0.1, 0.25); // the hakken step: one leg's hip swing and knee bend over two kicks. 0: it lands (the stamp). 0.5: it carries the hop. 1: heel up behind while the other lands. 1.45: kicked out in front
  const BAND_RAYS = Float32Array.of(-2.5, -1.571, -0.64); // where the three short rays point when hands meet
  const bandVisit = () => ({ on: false, ramp: 0, show: 0, leaveAt: 0, restTill: 0, rest: 0, came: 0 });
  const company = { t: 0, owed: 0, at: 0, much: 1, period: 0.43, kickT: -9, kicks: 0, punch: 0, beat: 0, going: false, sinceK: 9, clapT: -9, clapGap: 0, clapKnown: false, close: 0, roll: 0, rate: 0, shake: 0,
    build: 0, buildNow: 0, builtAt: -99, buildFor: 0, given: 0, drop: 0, dropT: -99, jumpT: -99, lift: 1, crowd: bandVisit(), dancer: bandVisit(), rocket: bandVisit(),
    step: 0, go: 0, facing: 1, face: 1, tail: 1, posed: false, high: 0, sx: 0, alt: -0.1, unsure: 0, endT: -99, endSx: 0, endAlt: 0, endH: 0, endBig: 1, tonesAt: -9, toned: false };
  const bandKept = { close: new Float32Array(BAND_KEEP), punch: new Float32Array(BAND_KEEP), lift: new Float32Array(BAND_KEEP).fill(1), x: new Float32Array(BAND_KEEP), y: new Float32Array(BAND_KEEP).fill(-9) }; // the newest at company.at
  const bandJoints = new Float32Array(10), bandAim = new Float32Array(10), bandLegs = new Float32Array(14), bandArms = new Float32Array(8); // the dancer: ten joint numbers as drawn, and as wanted this frame; its two legs and arms worked out
  const bandFigs = new Float32Array(2 * BAND_MOST * BAND_FIG), bandCount = new Int16Array(2); // the crowd as it is drawn this frame, row by row
  const bandTrail = new Float32Array(112 * 3); // the rocket's trail as it is drawn this frame: where, and how thick
  const bandTone = new Float32Array(9), bandToned = new Float32Array(9).fill(-99); // the company's three colors now, and as they were when its paints were last mixed
  const bandAt = { floor: 0, tall: false, m: 0, size: 1, r: 0, dx: 0, dH: 0, pw: 0, ph: 0, rx: 0, rows: 2 }; // where everybody stands, worked out once a frame
  const bandArt = { made: false, w: 0, floor: 0, rows: [null, null], palm: ["", ""], spark: "", body: "", dim: "", shoe: "", shoeDim: "", skin: "", tail: "", halo: null, cab: "", cap: "", air: "", hull: "", fin: "", flame: "", window: "", heat: null, glow: null, burst: ["", "", ""] }; // its paints, mixed afresh only when its colors have moved
  let bandLegT = 0, bandLegP = 0, bandHipY = 0;
  const bandHash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; // the same number between 0 and 1 for the same n: each figure keeps its looks
  const bandK = (dt, secs) => 1 - Math.exp(-dt / secs); // how much of the way something eased over "secs" gets in this frame
  const bandFly = (q) => (1 - Math.exp(-q * 3.2)) / 0.96; // how far a spark of the burst has flown, q seconds out: quickly, then slowing
  const bandRise = (p) => 1 - (1 - clamp(p)) ** 3;
  const bandShows = () => company.crowd.ramp > 0 || company.dancer.ramp > 0 || company.rocket.on || company.t - company.endT < 1.9; // while anybody is there, drawFrame keeps the picture clean of them

  function bandGate(V, want, dt, stay, rest, hold, force) { // a visit: it comes when wanted and rested, stays at most "stay" seconds unless held, and however it leaves it then keeps away for its share of "rest":
    const t = company.t;                                     // after a whole visit all of it, after one half as long half of it. So it is never there for more than about stay / (stay + rest) of a song. A forced visit may cut a rest short once half of it is over
    if (!V.on && want && (t >= V.restTill || (force && t >= V.restTill - V.rest / 2))) { V.on = true; V.leaveAt = t + stay; V.came = t; }
    else if (V.on && (!want || (t > V.leaveAt && !hold))) { V.on = false; V.rest = rest * Math.min(1, (t - V.came) / stay); V.restTill = t + V.rest; }
    V.ramp = clamp(V.ramp + (V.on ? dt / 0.9 : -dt / 1.2)); // about a second to come, and a little more to go
    V.show = eased(V.ramp);
  }
  function bandStep(u) { // where one leg is in the hakken step, u kicks along it: its hip swing and knee bend, eased between the five poses
    u = ((u % 2) + 2) % 2;
    for (let i = 0; i < 4; i++) {
      const u0 = BAND_LEG[i * 3], u1 = BAND_LEG[i * 3 + 3];
      if (u <= u1) { const q = eased((u - u0) / (u1 - u0)); bandLegT = BAND_LEG[i * 3 + 1] + (BAND_LEG[i * 3 + 4] - BAND_LEG[i * 3 + 1]) * q; bandLegP = BAND_LEG[i * 3 + 2] + (BAND_LEG[i * 3 + 5] - BAND_LEG[i * 3 + 2]) * q; return; }
    }
    bandLegT = 0.1; bandLegP = 0.25;
  }

  function bandNow(dt) { // from frame(), before anything is drawn: who is there, and what they are doing
    if (!(dt > 0)) dt = 0; // a frame that took no time (or a clock that went back) moves nothing
    const S = company, t = (S.t += dt), much = T.band, long = Math.max(0.25, Math.min(2, much)), live = hearing && much > 0;
    S.much = much;
    if (!live && !bandShows() && !S.crowd.on && !S.dancer.on) return; // switched off or not listening, and nobody left on the picture: nothing to work out
    // the kick, and the beat by the clock
    if (flow.bpm > 40) S.period = 60 / flow.bpm;
    const kicked = sound.kickHit > 0 && t - S.kickT > 0.12;
    if (kicked) { S.kickT = t; S.kicks++; }
    S.sinceK = t - S.kickT;
    S.punch = S.sinceK < 0.034 ? Math.max(S.punch, S.sinceK / 0.034) : Math.exp(-(S.sinceK - 0.034) / 0.09); // two frames up, then away: it only ever moves things
    S.going = S.sinceK < 1.6 * S.period;
    S.beat = clamp(S.sinceK / S.period);
    // the claps. Nobody claps overhead faster than about twice a second, so of claps on every beat of a quick song every other one is taken
    if (flow.clap > 0 && t - S.clapT > 0.5) {
      const gap = t - S.clapT;
      if (gap < 2) { S.clapKnown = S.clapGap > 0 && Math.abs(gap - S.clapGap) < 0.15 * S.clapGap; S.clapGap = S.clapGap ? S.clapGap + (gap - S.clapGap) * 0.5 : gap; } else { S.clapKnown = false; S.clapGap = 0; }
      S.clapT = t;
    }
    if (flow.clap > 0) S.given++; // the claps given since the pattern was last lost: a stray pattern of two or three is not enough to bring the crowd
    if (flow.clapOn < 0.5) S.given = 0;
    const sinceC = t - S.clapT;
    let shut = 0;
    if (sinceC < 0.07) shut = 1; else if (S.clapKnown && sinceC > 0.7 * S.clapGap && sinceC < 1.15 * S.clapGap) shut = 0.7 * eased(clamp((sinceC - 0.7 * S.clapGap) / (0.3 * S.clapGap))); // when they come evenly the hands start in toward the next one before it lands
    S.close += (shut - S.close) * bandK(dt, shut > S.close ? (sinceC < 0.07 ? 0.012 : 0.05) : 0.07);
    // the roll, believed only while the page says a build is on; the build itself, and the drop
    const built = flow.part === "build" || flow.build > 0.35, rollNow = built ? flow.roll : 0, rateNow = built ? flow.rollRate : 0;
    if (built) S.builtAt = t;
    S.buildFor = flow.part === "build" ? (flow.build > 0.5 ? S.buildFor + dt : S.buildFor) : 0; // how long the page's build has been on and past half way: a moment of rising highs is not a build to come for
    S.roll += (rollNow - S.roll) * bandK(dt, rollNow > S.roll ? 0.15 : 0.3);
    S.rate += (rateNow - S.rate) * bandK(dt, 0.2);
    S.shake = (S.shake + dt * TAU * Math.min(9, S.rate * 0.5)) % TAU; // the hands shake at half the roll's rate, never more than nine times a second
    S.buildNow = flow.build;
    S.build += (flow.build - S.build) * bandK(dt, 0.3);
    S.drop = flow.drop;
    const C = S.crowd;
    if (flow.dropHit) S.dropT = t;
    if (flow.dropHit && (C.on || t - S.builtAt < 3)) S.jumpT = t; // the drop that ends a build: everybody jumps
    const sinceJ = t - S.jumpT, busy = built || sinceJ < 5;
    S.lift += (1 + 0.45 * Math.max(S.roll, 0.6 * S.build, sinceJ < 4 ? 0.8 * (1 - sinceJ / 4) : 0) - S.lift) * bandK(dt, 0.12); // 1 is hands held for clapping, 1.45 stretched right up
    // who is here
    const clapping = flow.clapOn >= 0.75 && S.given >= 4, building = S.buildFor >= 2;
    bandGate(C, live && (C.on ? flow.clapOn >= 0.5 || busy || t - C.came < 3 : clapping || building || sinceJ < 0.5), dt, 24 * long, 48 / long, sinceJ < 5, building || sinceJ < 0.5); // once come it stays three seconds at least, so it never just bobs up and down; past its time only the jump on a drop holds it
    const hard = mood === "hard", D = S.dancer, dancing = hard && S.going;
    bandGate(D, live && hard && (D.on ? S.sinceK < 3 : S.sinceK < 1 && flow.steady > 1.5), dt, 20 * long, 50 / long, false, live && hard && t - S.dropT < 3); // a drop is remembered for three seconds, as the kick it brings back needs a second and a half to count as running
    if (D.ramp > 0) { // the dancer's joints: where the step wants them, each eased over 30 ms so no kick can snap a limb
      if (kicked && dancing) { S.step++; if (S.step % 16 === 0) S.facing = -S.facing; } // it turns round every sixteen kicks
      S.go += ((dancing ? 1 : 0) - S.go) * bandK(dt, 0.3);
      S.face += (S.facing - S.face) * bandK(dt, 0.06);
      const u = S.step + S.beat, sw = 0.8 * Math.cos(Math.PI * (u - 0.45)), go = S.go, breath = 0.012 * Math.sin(t * 5) * (1 - go), A = bandAim; // standing still, it gets its breath
      bandStep(u); A[0] = 0.07 + (bandLegT - 0.07) * go; A[1] = 0.06 + (bandLegP - 0.06) * go;
      bandStep(u + 1); A[2] = -0.07 + (bandLegT + 0.07) * go; A[3] = 0.06 + (bandLegP - 0.06) * go;
      A[4] = 0.1 + (sw - 0.1) * go; A[5] = 0.3 + (1.2 + 0.5 * sw) * go; A[6] = -0.1 + (0.1 - sw) * go; A[7] = 0.3 + (1.2 - 0.5 * sw) * go; A[8] = 0.03 + (0.14 + 0.05 * sw) * go + breath; A[9] = 0.07 * Math.sin(Math.PI * S.beat) * go;
      if (!S.posed) { bandJoints.set(A); S.posed = true; }
      const was = bandJoints[9];
      for (let i = 0; i < 10; i++) bandJoints[i] += (A[i] - bandJoints[i]) * bandK(dt, 0.03);
      if (dt > 0) S.tail += (Math.max(-0.6, Math.min(2.4, 1 + 2.2 * ((bandJoints[9] - was) / dt))) - S.tail) * bandK(dt, 0.07); // the ponytail lags behind the hop: up as the body comes down
    } else S.posed = false;
    // the rocket
    const R = S.rocket;
    if (!R.on && live && flow.riserFor >= 0.35 && t >= R.restTill) { R.on = true; R.ramp = 0; R.came = t; S.high = 0; S.unsure = 0; bandKept.y.fill(-9); }
    if (R.on) {
      S.high = Math.max(S.high, S.high + (flow.riserAt - S.high) * bandK(dt, 0.2)); // it never comes back down
      R.ramp = clamp(R.ramp + dt / 0.8);
      R.show = eased(R.ramp);
      S.sx = Math.sin(t * 1.7 + 1) * 0.012 + Math.sin(t * 4.3) * 0.004 * (1 + 3 * S.high) + Math.sin(t * 23) * 0.003 * clamp((S.high - 0.85) / 0.15); // it sways, more the higher it is, and shivers near the top
      S.alt = -0.12 + 0.32 * bandRise(R.ramp) + (bandAt.tall ? 0.56 : 0.64) * S.high; // on a phone it stops a little lower, under the smiley at the top right
      S.unsure = flow.riser < 0.5 ? S.unsure + dt : 0;
      if (!live) { R.on = false; R.ramp = R.show = 0; } // switched off or paused: it is simply gone
      else if (flow.riserGone || flow.dropHit || S.unsure > 1 || t - R.came > 24) { // it bursts, if it has got clear of the floor, and the next one waits by as much as this one flew (six seconds after a flight of six or more)
        R.on = false; R.ramp = R.show = 0; R.restTill = t + (6 / long) * Math.min(1, (t - R.came) / 6);
        if (S.alt > 0.05) { S.endT = t; S.endSx = S.sx; S.endAlt = S.alt; S.endH = S.high; S.endBig = flow.dropHit || sinceJ < 0.3 ? 1.3 : 1; }
      }
    }
    if (flow.dropHit && t - S.endT < 0.3) S.endBig = 1.3; // the drop landed a moment after it ended: the same thing
    // the memory, written sixty times a second whatever the screen does
    for (S.owed += dt; S.owed >= BAND_TICK; S.owed -= BAND_TICK) {
      S.at = (S.at + 1) % BAND_KEEP;
      bandKept.close[S.at] = S.close; bandKept.punch[S.at] = S.punch; bandKept.lift[S.at] = S.lift; bandKept.x[S.at] = S.sx; bandKept.y[S.at] = R.on ? S.alt : -9;
      if (S.owed > 0.25) S.owed = BAND_TICK;
    }
    // its colors: the hard mood's reds, acid's yellows, or else the picture's own, eased over a second
    const set = mood === "hard" ? BAND_HARD : mood === "acid" ? BAND_ACID : null, n = colors.length, ease = S.toned ? bandK(dt, 1) : 1;
    for (let i = 0; i < 3; i++) {
      let r = set ? set[i * 3] : colors[i % n][0], gr = set ? set[i * 3 + 1] : colors[i % n][1], b = set ? set[i * 3 + 2] : colors[i % n][2];
      const most = Math.max(r, gr, b, 1), up = most < 150 ? 150 / most : 1; // a dark color is lifted, so the light round them always shows
      r *= up; gr *= up; b *= up;
      bandTone[i * 3] += (Math.min(255, r) - bandTone[i * 3]) * ease; bandTone[i * 3 + 1] += (Math.min(255, gr) - bandTone[i * 3 + 1]) * ease; bandTone[i * 3 + 2] += (Math.min(255, b) - bandTone[i * 3 + 2]) * ease;
    }
    S.toned = true;
  }

  function bandPlace() { // where everybody stands. The floor is the bottom of the picture in Full view; otherwise the top of the play bar, which covers the bottom of the picture
    const P = bandAt, much = company.much;
    P.floor = alone ? h : Math.max(h * 0.6, h - ((innerWidth <= 820 ? 156 : 100) * w) / Math.max(1, innerWidth)); // the play bar is 84 points high and stands 12 off the bottom; in a window 820 points wide or less (a phone) it is 144 high, with 8 more under it in the glass look
    P.tall = h > w;
    P.m = Math.min(w, P.floor);
    P.size = 0.85 + 0.15 * Math.min(2, much);
    if (P.tall) { // a phone: one row of fewer, larger people, and smaller speakers, so they read on a narrow picture
      P.r = w * 0.05 * P.size; P.rows = 1; P.dx = w * 0.15; P.dH = w * 0.2 * P.size; P.pw = w * 0.22 * P.size; P.ph = w * 0.105 * P.size; P.rx = w * 0.4;
    } else { P.r = P.m * 0.033 * P.size; P.rows = 2; P.dx = w * 0.115; P.dH = P.m * 0.23 * P.size; P.pw = P.m * 0.3 * P.size; P.ph = P.m * 0.14 * P.size; P.rx = w * 0.31; }
  }
  function bandInk(i, white, black, a) { // one of the company's three colors, toward white and then toward black by those shares
    const o = i * 3, f = (c) => Math.round((c + (255 - c) * white) * (1 - black));
    return "rgba(" + f(bandTone[o]) + "," + f(bandTone[o + 1]) + "," + f(bandTone[o + 2]) + "," + a + ")";
  }
  function bandPaint() { // its paints, mixed when it first plays and again only when its colors have moved, the picture has changed size, or the crowd has: not on every frame
    const A = bandArt, P = bandAt, t = company.t;
    let moved = 0;
    for (let i = 0; i < 9; i++) moved = Math.max(moved, Math.abs(bandTone[i] - bandToned[i]));
    if (A.made && A.w === w && A.floor === P.floor && A.size === P.size && (moved < 8 || t - company.tonesAt < 0.25)) return;
    company.tonesAt = t; bandToned.set(bandTone); A.made = true; A.w = w; A.floor = P.floor; A.size = P.size;
    for (let row = 0; row < 2; row++) { // the rim of light round the crowd changes color from one figure to the next
      const space = P.r * (row ? 0.78 * 6.4 : P.tall ? 4.6 : 5), stops = Math.max(3, Math.round(w / (space * 1.5))), edge = stage.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= stops; i++) edge.addColorStop(i / stops, bandInk((i + row) % 3, 0.28, row ? 0.5 : 0, 1));
      A.rows[row] = edge;
      A.palm[row] = bandInk(2, 0.55, row ? 0.45 : 0, 1);
    }
    A.spark = bandInk(2, 0.78, 0, 1);
    A.body = bandInk(0, 0.18, 0, 1); A.dim = bandInk(0, 0, 0.45, 1); A.shoe = bandInk(2, 0.62, 0, 1); A.shoeDim = bandInk(2, 0.62, 0.4, 1); A.skin = bandInk(0, 0.5, 0, 1); A.tail = bandInk(2, 0.25, 0, 1);
    A.halo = stage.createRadialGradient(0, 0, 0.1, 0, 0, 0.62); A.halo.addColorStop(0, bandInk(0, 0, 0, 0.22)); A.halo.addColorStop(1, bandInk(0, 0, 0, 0)); // drawn one unit across and stretched to fit
    A.cab = bandInk(0, 0.25, 0, 1); A.cap = bandInk(2, 0.3, 0, 1); A.air = bandInk(2, 0, 0, 1);
    A.hull = bandInk(0, 0.82, 0, 1); A.fin = bandInk(0, 0.1, 0, 1); A.flame = bandInk(2, 0, 0, 1); A.window = bandInk(1, 0.3, 0, 1);
    A.heat = stage.createLinearGradient(0, 0, 0, 1); A.heat.addColorStop(0, bandInk(2, 0.6, 0, 1)); A.heat.addColorStop(0.35, bandInk(2, 0, 0, 1)); A.heat.addColorStop(1, bandInk(0, 0, 0, 0.35)); // laid along the trail from the rocket (0) to its end (1)
    A.glow = stage.createRadialGradient(0, 0, 0.4, 0, 0, 3.2); A.glow.addColorStop(0, bandInk(2, 0, 0, 0.3)); A.glow.addColorStop(1, bandInk(2, 0, 0, 0));
    for (let c = 0; c < 3; c++) A.burst[c] = bandInk(c, c === 1 ? 0.55 : 0.3, 0, 1);
  }

  /* The crowd. Seen from behind: dark heads and shoulders with a rim of light, arms as lines with the same rim, plain mitten hands the brightest thing about them. Two rows on a wide picture,
     the back one smaller and dimmer; one on a phone. Each figure has its own height, hair and a few frames' lateness, and its own way of joining in: most clap, some pump a fist with the kick,
     a few only nod until a roll or a build gets everybody's hands up. They come up from below the floor, the middle first, and sink back down when they go. */
  function bandRow(row) { // where everyone in one row is this frame, into bandFigs; says how many there are
    const S = company, P = bandAt, C = S.crowd, t = S.t, floor = P.floor, much = S.much, F = bandFigs, o0 = row * BAND_MOST * BAND_FIG;
    const r = P.r * (row ? 0.78 : 1), space = r * (row ? 6.4 : P.tall ? 4.6 : 5), n = Math.min(BAND_MOST, Math.ceil(w / space) + 1), dens = row ? clamp(much - 0.4) * 0.85 : clamp(0.45 + 0.5 * much);
    const pogo = S.going ? Math.sin(Math.PI * S.beat) : 0, crouch = eased(clamp((S.buildNow - 0.8) / 0.2)), speakers = S.dancer.show, gapL = P.dx - P.pw / 2 - r * 1.6, gapR = P.dx + P.pw / 2 + r * 1.6; // nobody stands in front of the speakers: those there sink out of the way as the dancer comes, and come back up as it goes
    const sing = P.tall ? 0 : acidSinger.show, singX = w * 0.87, singR = Math.min(w, h) * 0.13 * 1.4 + r * 1.5; // and on a wide picture those under the 303's singer (at the right, its middle 0.87 across) sink out of its way while it is there
    let count = 0;
    for (let i = 0; i < n; i++) {
      const id = 97 + row * 53 + i, h1 = bandHash(id), h2 = bandHash(id + 0.37), h3 = bandHash(id + 0.71);
      if (bandHash(id + 0.13) > dens) continue;
      const x = (i + 0.3 + 0.2 * h2 + (row ? 0.5 : 0)) * space - space * 0.4;
      const back = 1 + Math.floor(h2 * 5), kept = (S.at - back + BAND_KEEP) % BAND_KEEP, close = bandKept.close[kept], punch = bandKept.punch[kept], raise = clamp((bandKept.lift[kept] - 1) / 0.45), came = bandRise((C.ramp - Math.abs(x / w - 0.5) * 0.5) / 0.6) * (sing > 0 && Math.abs(x - singX) < singR ? 1 - sing : 1) * (speakers > 0 && x > gapL && x < gapR ? 1 - speakers : 1);
      const tj = t - S.jumpT - h2 * 0.07, peak = r * (2.2 + 1.3 * h3), jump = tj > 0 && tj < 0.55 ? peak * 4 * (tj / 0.55) * (1 - tj / 0.55) : 0, land = tj >= 0.55 ? Math.exp(-(tj - 0.55) / 0.1) : 0;
      const hy = floor - r * (1.5 + 0.9 * h3 + (row ? 2.1 : 0)) + (1 - came) * r * 8 - r * 0.5 * raise - jump - S.drop * pogo * r * (0.7 + 0.5 * h3) + r * 0.28 * punch * (1 - 0.6 * S.drop) + r * 0.55 * crouch * (jump ? 0 : 1) + land * 0.35 * r;
      if (hy - 4 * r > floor) continue; // still wholly below the floor, hands and all
      const kind = row ? 2 : h1 < 0.7 ? 0 : h1 < 0.87 ? 1 : 2, clapping = kind === 0 ? 1 - clamp(raise * 1.6) : 0, o = o0 + count * BAND_FIG; // kind 0 claps, 1 pumps a fist, 2 nods
      F[o] = x; F[o + 1] = x + Math.sin(t * (0.7 + h1) + h2 * 9) * r * 0.12; F[o + 2] = hy; F[o + 3] = r; F[o + 4] = h3 < 0.18 ? 1 : h3 < 0.34 ? 2 : h3 < 0.46 ? 3 : 0; F[o + 5] = jump / peak; F[o + 6] = 0;
      for (let side = 0; side < 2; side++) { // each arm: shoulder, elbow, hand, the elbow bending outward
        const sgn = side ? 1 : -1, up = kind === 0 ? 1 : kind === 1 ? ((sgn > 0) === (h2 > 0.5) ? 1 : raise) : raise, a = o + 9 + side * 8;
        F[o + 7 + side] = up < 0.04 ? 0 : 1;
        if (up < 0.04) continue;
        const apart = 1.45 + (0.2 - 1.45) * close * clapping - 0.2 * raise, pump = kind === 1 && !raise ? 0.9 * punch : 0.5 * punch * S.drop;
        let HX = x + sgn * apart * r + Math.sin(S.shake + h2 * TAU + (sgn > 0 ? 1.3 : 0)) * 0.32 * r * S.roll, HY = hy - r * (1.3 + 1.2 * raise + 0.2 * close * clapping + pump);
        if (up < 1) { HX = x + sgn * 1.35 * r + (HX - x - sgn * 1.35 * r) * up; HY = hy + 2.6 * r + (HY - hy - 2.6 * r) * up; }
        const SX = x + sgn * 1.2 * r, SY = hy + 1.35 * r, far = Math.sqrt((HX - SX) * (HX - SX) + (HY - SY) * (HY - SY)) || 1, bone = Math.max(0.8 * r, Math.min(1.95 * r, 0.51 * far)), d = Math.min(far, 2 * bone - 0.01), base = Math.atan2(HY - SY, HX - SX), bend = Math.acos(d / (2 * bone));
        HX = SX + (HX - SX) * (d / far); HY = SY + (HY - SY) * (d / far);
        const EX = SX + bone * Math.cos(base + sgn * bend), EY = SY + bone * Math.sin(base + sgn * bend), fl = Math.sqrt((HX - EX) * (HX - EX) + (HY - EY) * (HY - EY)) || 1;
        F[a] = HX; F[a + 1] = HY; F[a + 2] = SX; F[a + 3] = SY; F[a + 4] = EX; F[a + 5] = EY; F[a + 6] = (HX - EX) / fl; F[a + 7] = (HY - EY) / fl;
      }
      if (kind === 0 && clapping > 0.5) { const age = t - S.clapT - back * BAND_TICK; if (age >= 0 && age < 0.13) F[o + 6] = 1 - age / 0.13; } // where the hands meet: three short rays, there for an eighth of a second
      count++;
    }
    bandCount[row] = count;
    return count;
  }
  function bandBodies(row) { // the heads and shoulders of one row as one shape, and their legs while they are in the air
    const F = bandFigs, floor = bandAt.floor;
    g.beginPath();
    for (let f = 0, o = row * BAND_MOST * BAND_FIG; f < bandCount[row]; f++, o += BAND_FIG) {
      const x = F[o], hx = F[o + 1], hy = F[o + 2], r = F[o + 3], hair = F[o + 4], tuck = F[o + 5], hip = hy + 4.6 * r, foot = hy + (7.9 - tuck) * r;
      if (hip - r < floor) for (let e = -1; e <= 1; e += 2) { g.moveTo(x + e * 1.25 * r, hip - 0.4 * r); g.lineTo(x + e * (1.15 + 0.5 * tuck) * r, foot); g.lineTo(x + e * (0.3 + 0.5 * tuck) * r, foot); g.lineTo(x + e * 0.1 * r, hip - 0.4 * r); g.closePath(); }
      g.moveTo(x - 1.3 * r, hip); g.quadraticCurveTo(x - 2.1 * r, hy + 1.1 * r, x - 0.55 * r, hy + 0.95 * r); g.lineTo(x + 0.55 * r, hy + 0.95 * r); g.quadraticCurveTo(x + 2.1 * r, hy + 1.1 * r, x + 1.3 * r, hip); g.closePath();
      g.moveTo(hx + 0.95 * r, hy); g.arc(hx, hy, 0.95 * r, 0, TAU);
      if (hair === 1) { g.moveTo(hx + 0.42 * r, hy - 1.1 * r); g.arc(hx, hy - 1.1 * r, 0.42 * r, 0, TAU); } // a bun
      else if (hair === 2) { g.moveTo(hx - 0.95 * r, hy - 0.25 * r); g.lineTo(hx - 1.55 * r, hy - 0.1 * r); g.lineTo(hx - 0.9 * r, hy + 0.1 * r); } // a cap's peak
      else if (hair === 3) { g.moveTo(hx - 0.5 * r, hy - 0.8 * r); g.lineTo(hx - 0.35 * r, hy - 1.45 * r); g.lineTo(hx, hy - 0.95 * r); g.lineTo(hx + 0.35 * r, hy - 1.45 * r); g.lineTo(hx + 0.5 * r, hy - 0.8 * r); } // spiked hair
    }
  }
  function bandLimbs(row, fresh) { // every arm of one row: shoulder to elbow to hand
    const F = bandFigs;
    if (fresh) g.beginPath();
    for (let f = 0, o = row * BAND_MOST * BAND_FIG; f < bandCount[row]; f++, o += BAND_FIG) for (let side = 0; side < 2; side++) if (F[o + 7 + side]) { const a = o + 9 + side * 8; g.moveTo(F[a + 2], F[a + 3]); g.lineTo(F[a + 4], F[a + 5]); g.lineTo(F[a], F[a + 1]); }
  }
  function bandHands(row, grow) { // and the hands at their ends, each an oval along the forearm
    const F = bandFigs;
    g.beginPath();
    for (let f = 0, o = row * BAND_MOST * BAND_FIG; f < bandCount[row]; f++, o += BAND_FIG) for (let side = 0; side < 2; side++) if (F[o + 7 + side]) {
      const a = o + 9 + side * 8, r = F[o + 3], fx = F[a + 6], fy = F[a + 7], cx = F[a] + fx * 0.42 * r, cy = F[a + 1] + fy * 0.42 * r;
      g.moveTo(cx + fx * 0.62 * r * grow, cy + fy * 0.62 * r * grow); g.ellipse(cx, cy, 0.62 * r * grow, 0.4 * r * grow, Math.atan2(fy, fx), 0, TAU);
    }
  }
  function bandCrowd() {
    const P = bandAt, A = bandArt, F = bandFigs;
    if (company.crowd.ramp <= 0) return;
    g.save();
    g.beginPath(); g.rect(0, 0, w, P.floor); g.clip(); // nothing of them shows under the floor
    g.lineCap = g.lineJoin = "round";
    for (let row = P.rows - 1; row >= 0; row--) {
      if (!bandRow(row)) continue;
      const r = P.r * (row ? 0.78 : 1), rim = Math.max(1.2, r * 0.11), arm = Math.max(2.5, r * 0.44);
      g.globalCompositeOperation = "lighter"; // a soft light round them
      g.globalAlpha = row ? 0.1 : 0.15; g.strokeStyle = A.rows[row]; g.lineWidth = arm + rim * 4; bandBodies(row); bandLimbs(row, false); g.stroke();
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 0.86; g.fillStyle = "#050507"; bandBodies(row); g.fill(); // the dark of them, so they read over a bright picture
      g.globalAlpha = 0.95; g.lineWidth = rim; bandBodies(row); g.stroke(); // the rim of light
      g.lineWidth = arm + rim * 2; bandLimbs(row, true); g.stroke(); // the arms: the same dark with the same rim
      g.globalAlpha = 1; g.strokeStyle = "#050507"; g.lineWidth = arm; g.stroke();
      g.globalAlpha = 0.6; g.fillStyle = "#000"; bandHands(row, 1.3); g.fill();
      g.globalAlpha = 1; g.fillStyle = A.palm[row]; bandHands(row, 1); g.fill(); // the hands: the brightest thing they have
      let spark = 0;
      for (let f = 0, o = row * BAND_MOST * BAND_FIG; f < bandCount[row]; f++, o += BAND_FIG) spark = Math.max(spark, F[o + 6]);
      if (spark > 0) { // where the hands meet: three short rays
        g.globalCompositeOperation = "lighter"; g.strokeStyle = A.spark; g.lineWidth = Math.max(1, r * 0.14); g.globalAlpha = 0.9 * spark;
        g.beginPath();
        for (let f = 0, o = row * BAND_MOST * BAND_FIG; f < bandCount[row]; f++, o += BAND_FIG) if (F[o + 6] > 0 && F[o + 7] && F[o + 8]) {
          const fr = F[o + 3], y = Math.min(F[o + 10], F[o + 18]) - 0.55 * fr, out = 1 - F[o + 6];
          for (let j = 0; j < 3; j++) { const c = Math.cos(BAND_RAYS[j]), s = Math.sin(BAND_RAYS[j]); g.moveTo(F[o] + c * fr * (0.55 + 0.5 * out), y + s * fr * (0.55 + 0.5 * out)); g.lineTo(F[o] + c * fr * (0.95 + 0.9 * out), y + s * fr * (0.95 + 0.9 * out)); }
        }
        g.stroke();
      }
    }
    g.restore();
  }

  /* The dancer, for hard kicks: a small figure in a tracksuit on a low pair of speakers. The speakers' cones punch out with every kick and push a thin ring of air off; the dancer hakkens on top,
     one stamp a kick. When the kick stops it stands and gets its breath. Every kick only ever moves things: no light comes and goes with it. */
  function bandBox(x, y, bw, bh, cy, R, a) { // the cabinet with its two cones, its top left corner at x, y
    const S = company, A = bandArt, since = S.t - S.kickT, air = since < 0.24 ? since / 0.24 : 1, p = S.punch, line = Math.max(1.5, bh * 0.028), c1 = x + bw * 0.26, c2 = x + bw * 0.74;
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 0.88 * a; g.fillStyle = "#07070a"; g.beginPath(); g.roundRect(x, y, bw, bh, bh * 0.08); g.fill();
    g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.16 * a; g.strokeStyle = A.cab; g.lineWidth = line * 5; g.stroke();
    g.globalCompositeOperation = "source-over"; g.globalAlpha = 0.95 * a; g.lineWidth = line;
    for (let c = 0; c < 2; c++) { const cx = c ? c2 : c1, mid = R * (0.68 + 0.1 * p); g.moveTo(cx + R, cy); g.arc(cx, cy, R, 0, TAU); g.moveTo(cx + mid, cy); g.arc(cx, cy, mid, 0, TAU); }
    g.stroke();
    g.fillStyle = A.cap; g.beginPath(); for (let c = 0; c < 2; c++) { const cx = c ? c2 : c1, cap = R * (0.3 + 0.16 * p); g.moveTo(cx + cap, cy); g.arc(cx, cy, cap, 0, TAU); } g.fill(); // the cap comes out at you
    if (air < 1 && S.going) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.3 * (1 - air) * a; g.strokeStyle = A.air; g.lineWidth = line; g.beginPath(); for (let c = 0; c < 2; c++) { const cx = c ? c2 : c1, ar = R * (1.05 + 0.75 * air); g.moveTo(cx + ar, cy); g.arc(cx, cy, ar, 0, TAU); } g.stroke(); } // the air it pushed: a thin ring, away in a quarter of a second
  }
  function bandLeg(o, th, ph) { // one leg from the hip: knee, ankle, which way the foot points, and how far below the hip its lowest point is
    const s = th - ph, L = bandLegs, kx = 0.215 * Math.sin(th), ky = 0.215 * Math.cos(th), ax = kx + 0.215 * Math.sin(s), ay = ky + 0.215 * Math.cos(s);
    L[o] = kx; L[o + 1] = ky; L[o + 2] = ax; L[o + 3] = ay; L[o + 4] = Math.cos(s); L[o + 5] = -Math.sin(s); L[o + 6] = ay + 0.04 + Math.max(0, -Math.sin(s)) * 0.1;
  }
  function bandArm(o, al, be, nx, ny) { // one arm from the shoulder: elbow and hand
    const ex = nx + 0.14 * Math.sin(al), ey = ny + 0.035 + 0.14 * Math.cos(al);
    bandArms[o] = ex; bandArms[o + 1] = ey; bandArms[o + 2] = ex + 0.13 * Math.sin(al + be); bandArms[o + 3] = ey + 0.13 * Math.cos(al + be);
  }
  const bandLegPath = (o) => { const L = bandLegs; g.moveTo(0, bandHipY); g.lineTo(L[o], bandHipY + L[o + 1]); g.lineTo(L[o + 2], bandHipY + L[o + 3]); };
  const bandShoePath = (o) => { const L = bandLegs, ax = L[o + 2], ay = bandHipY + L[o + 3] + 0.012; g.moveTo(ax - L[o + 4] * 0.03, ay - L[o + 5] * 0.03); g.lineTo(ax + L[o + 4] * 0.085, ay + L[o + 5] * 0.085); };
  const bandArmPath = (o, nx, ny) => { g.moveTo(nx, ny + 0.035); g.lineTo(bandArms[o], bandArms[o + 1]); g.lineTo(bandArms[o + 2], bandArms[o + 3]); };
  function bandDancer() {
    const S = company, P = bandAt, A = bandArt, V = S.dancer, J = bandJoints;
    if (V.ramp <= 0 || !S.posed) return;
    const up = bandRise(V.ramp / 0.8), a = clamp(V.ramp * 4), top = P.floor - P.ph + (1 - up) * (P.ph + P.dH * 1.2) - P.m * 0.008 * S.punch * (S.going ? 1 : 0); // the speakers hop a hair with each kick
    g.save();
    g.beginPath(); g.rect(0, 0, w, P.floor); g.clip();
    bandBox(P.dx - P.pw / 2, top, P.pw, P.ph + P.m * 0.02, top + P.ph * 0.5, P.ph * 0.37, a); // a little deeper than it shows, so its foot is under the floor
    bandLeg(0, J[0], J[1]); bandLeg(7, J[2], J[3]);
    const L = bandLegs, lean = J[8], hipY = (bandHipY = -(Math.max(L[6], L[13]) + J[9])), nx = 0.27 * Math.sin(lean), ny = hipY - 0.27 * Math.cos(lean), hx = nx + 0.02 + 0.039 * Math.sin(lean), hy = ny - 0.078 * 1.12;
    bandArm(0, J[4], J[5], nx, ny); bandArm(4, J[6], J[7], nx, ny);
    g.translate(P.dx, top); g.scale(P.dH * S.face, P.dH); g.lineCap = g.lineJoin = "round";
    g.globalCompositeOperation = "lighter"; g.globalAlpha = a; g.fillStyle = A.halo; g.translate(0, hipY - 0.1); g.fillRect(-0.62, -0.62, 1.24, 1.24); g.translate(0, 0.1 - hipY); // a soft light round it, steady
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 0.7 * a; g.strokeStyle = "#000"; g.lineWidth = 0.115; g.beginPath(); bandLegPath(0); bandLegPath(7); bandArmPath(0, nx, ny); bandArmPath(4, nx, ny); bandShoePath(0); bandShoePath(7); g.stroke(); // its own shadow under it
    g.lineWidth = 0.2; g.beginPath(); g.moveTo(0, hipY - 0.03); g.lineTo(nx, ny + 0.05); g.moveTo(hx, hy); g.lineTo(hx + 0.001, hy); g.stroke();
    g.globalAlpha = a; g.strokeStyle = A.dim; g.lineWidth = 0.062; g.beginPath(); bandLegPath(7); bandArmPath(4, nx, ny); g.stroke(); // the far arm and leg, darker
    g.strokeStyle = A.shoeDim; g.lineWidth = 0.075; g.beginPath(); bandShoePath(7); g.stroke();
    g.strokeStyle = A.body; g.lineWidth = 0.125; g.beginPath(); g.moveTo(0, hipY - 0.03); g.lineTo(nx, ny + 0.05); g.stroke(); // the jacket
    { const ta = S.tail, bx = hx - 0.055, by = hy - 0.04; g.strokeStyle = A.tail; g.lineWidth = 0.04; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx - 0.07 * Math.cos(ta * 0.5), by + 0.07 * Math.sin(ta * 0.5), bx - 0.14 * Math.cos(ta), by + 0.14 * Math.sin(ta)); g.stroke(); } // the ponytail
    g.fillStyle = A.skin; g.beginPath(); g.arc(hx, hy, 0.078, 0, TAU); g.fill();
    g.fillStyle = "#16140a"; g.beginPath(); g.arc(hx + 0.042, hy - 0.008, 0.013, 0, TAU); g.fill(); // an eye, so it faces somewhere
    g.strokeStyle = A.body; g.lineWidth = 0.066; g.beginPath(); bandLegPath(0); bandArmPath(0, nx, ny); g.stroke(); // the near arm and leg
    g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 0.013; g.stroke(); // the stripe down the tracksuit
    g.strokeStyle = A.shoe; g.lineWidth = 0.08; g.beginPath(); bandShoePath(0); g.stroke(); // big shoes: the feet are the dance
    const q = (S.t - S.kickT) / 0.2, foot = S.step % 2 ? 7 : 0;
    if (q < 1 && S.go > 0.5) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.8 * (1 - q) * a; g.strokeStyle = A.shoe; g.lineWidth = 0.014; g.beginPath(); g.ellipse(L[foot + 2] + 0.03, -0.012, 0.06 + 0.16 * q, 0.012 + 0.02 * q, 0, Math.PI, TAU); g.stroke(); } // the stamp: a small arc of dust
    g.restore();
  }

  /* The rocket, for a riser. It climbs the picture left of the middle as the riser climbs, leaving a tapering trail (kin to the smiley's ribbon), swaying more the higher it gets,
     and bursts into a flower of sparks when the riser ends. Nothing is lit but the rocket, its trail and the sparks themselves. */
  function bandRocket() {
    const S = company, P = bandAt, A = bandArt, R = S.rocket, m = P.m, t = S.t, s = m * 0.04 * P.size, floor = P.floor, K = bandKept;
    if (R.on) {
      const x = P.rx + S.sx * m, y = floor * (1 - S.alt), a = clamp(R.ramp * 5), lean = Math.max(-0.35, Math.min(0.35, (S.sx - K.x[(S.at - 6 + BAND_KEEP) % BAND_KEEP]) * 14));
      g.save();
      g.beginPath(); g.rect(0, 0, w, floor); g.clip();
      let n = 0; // the trail: where it has been for the last second and a half, streaming down behind it so a rocket that hangs at the top of a riser still has one, thick at the rocket and nothing at its end
      for (let i = 0; i < 112; i++) { const at = (S.at - i + BAND_KEEP * 2) % BAND_KEEP; if (K.y[at] < -1) break; bandTrail[i * 3] = P.rx + K.x[at] * m + Math.sin(i * 0.33 - t * 9) * s * 0.1 * Math.min(1, i / 12); bandTrail[i * 3 + 1] = floor * (1 - K.y[at]) + s * (1.1 + 0.045 * i); bandTrail[i * 3 + 2] = s * 0.34 * (1 - i / 112) ** 0.7; n++; }
      const y0 = n ? bandTrail[1] : 0, span = n ? bandTrail[(n - 1) * 3 + 1] - y0 : 0;
      if (n > 2 && span > 2) { // drawn in a frame of its own, from the rocket (0) to the trail's end (1), which is what lets one paint made once color it wherever it is
        g.setTransform(1, 0, 0, span, 0, y0);
        for (let pass = 0; pass < 3; pass++) {
          const grow = pass === 0 ? 2.6 : pass === 1 ? 2.4 : 1;
          if (pass === 0) { g.globalCompositeOperation = "source-over"; g.globalAlpha = 0.5 * a; g.fillStyle = "#000"; } else { g.globalCompositeOperation = "lighter"; g.fillStyle = A.heat; g.globalAlpha = (pass === 1 ? 0.22 : 0.95) * a; }
          g.beginPath();
          for (let i = 0; i < n; i++) { const qx = bandTrail[i * 3] - bandTrail[i * 3 + 2] * grow, qy = (bandTrail[i * 3 + 1] - y0) / span; if (i) g.lineTo(qx, qy); else g.moveTo(qx, qy); }
          for (let i = n - 1; i >= 0; i--) g.lineTo(bandTrail[i * 3] + bandTrail[i * 3 + 2] * grow, (bandTrail[i * 3 + 1] - y0) / span);
          g.closePath(); g.fill();
        }
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      g.translate(x, y); g.rotate(lean); g.scale(s, s);
      const fl = 1.1 + 0.9 * S.high + 0.15 * Math.sin(t * 31) + 0.1 * Math.sin(t * 17.3);
      g.globalCompositeOperation = "lighter"; g.globalAlpha = a; g.fillStyle = A.glow; g.fillRect(-3.2, -3.2, 6.4, 6.4); // a soft light round it
      g.globalCompositeOperation = "source-over";
      g.fillStyle = A.flame; g.beginPath(); g.moveTo(-0.36, 0.8); g.quadraticCurveTo(0, 0.8 + fl * 2, 0.36, 0.8); g.fill(); // the flame
      g.fillStyle = "#fff8d8"; g.beginPath(); g.moveTo(-0.18, 0.8); g.quadraticCurveTo(0, 0.8 + fl, 0.18, 0.8); g.fill();
      g.strokeStyle = "#16140a"; g.lineWidth = 0.13;
      g.fillStyle = A.fin; g.beginPath(); for (let e = -1; e <= 1; e += 2) { g.moveTo(e * 0.5, 0.1); g.lineTo(e * 1.1, 1.1); g.lineTo(e * 0.5, 0.8); g.closePath(); } g.fill(); g.stroke(); // the fins
      g.fillStyle = A.hull; g.beginPath(); g.moveTo(0, -1.7); g.quadraticCurveTo(0.66, -0.9, 0.5, 0.15); g.lineTo(0.5, 0.8); g.lineTo(-0.5, 0.8); g.lineTo(-0.5, 0.15); g.quadraticCurveTo(-0.66, -0.9, 0, -1.7); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = "#16140a"; g.beginPath(); g.arc(0, -0.45, 0.27, 0, TAU); g.fill(); // its window
      g.strokeStyle = A.window; g.lineWidth = 0.08; g.stroke();
      g.restore();
    }
  }
  function bandBurst() {
    const S = company, P = bandAt, A = bandArt, m = P.m, floor = P.floor, age = S.t - S.endT, life = 1.4;
    if (age >= 0 && age < life) { // the burst: sparks flung out, slowing and sinking a little, each a short streak, in two shells
      const x = P.rx + S.endSx * m, y = floor * (1 - S.endAlt), reach = m * (0.12 + 0.2 * S.endH) * S.endBig * P.size * (P.tall ? 0.8 : 1), n = S.endH < 0.25 ? 10 : 22, sink = m * 0.09 * age * age, d1 = bandFly(age), d0 = bandFly(Math.max(0, age - 0.16));
      g.save();
      g.globalCompositeOperation = "lighter"; g.lineCap = "round";
      g.globalAlpha = (1 - age / life) ** 1.2; g.lineWidth = Math.max(1.5, m * 0.008 * (1 - (0.6 * age) / life));
      for (let c = 0; c < 3; c++) {
        g.strokeStyle = A.burst[c]; g.beginPath();
        for (let j = c; j < n; j += 3) { const ang = (j / n) * TAU + bandHash(j + S.endT) * 0.25, far = reach * (j % 2 ? 0.5 : 0.85 + 0.15 * bandHash(j * 3.1 + S.endT)), cs = Math.cos(ang), sn = Math.sin(ang); g.moveTo(x + cs * far * d0, y + sn * far * d0 + sink * 0.75); g.lineTo(x + cs * far * d1, y + sn * far * d1 + sink); }
        g.stroke();
      }
      g.restore();
    }
  }

  function bandPlay() { // from drawFrame(), after the 303's singer, so they stand in front of the tail of its line. While any of them is there drawFrame keeps the picture as it was without them, so an effect that keeps part of its last frame gets no echoes
    if (!bandShows()) return;
    bandPlace();
    bandPaint();
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    bandDancer(); // from the back: the speakers and the dancer, the rocket, then the crowd in front of them all (they stand nearest us), and the burst over everything
    bandRocket();
    bandCrowd();
    bandBurst();
    g.restore();
  }
  /* ==== band: end ==== */
  const DRAW = { beings: beingsFx, life: livingGrid, places: placesFx, arcade: arcadeFx, runner: runnerFx, forms: formsFx, faces, ribbon, silk, helix, strings, bars, mirror, leds, terrain, scope, trails, tunnel, vortex, prism, ripple, comets, stars: starfield, whirl, dust, links, fireworks, halo, sun, rings, mandala, rays, space, warp: space, drift: space, orbit: space, visitors: space, well,
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
    formsKept.started = false;
    runner.fresh = true;
    placeSt.world = ""; placeSt.over = 1; placeSt.gT = Math.max(placeSt.gT, 12); // Places opens straight in the place for the music playing now: no wipe from where it was last time, and no grand thing left half done
    lifeNow.grid = null; // the living grid plants a new garden each time it is shown
    afterImages.ghosts.length = 0; // the last effect's after-images go with it, and a fold starts open
    afterImages.rate = afterImages.span = 0;
    trippy.fold = 0;
    trippy.stepped = -1;
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
    if (FRACTALS.has(name)) return; // (the fractals fold in their own sum, and only through a break)
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
  function pointerRings() { // a click on the picture sends a soft ring out from where it landed, in the record's colors, and the kick pushes it on
    const L = pointer.rings;
    if (pointer.tapped && !pointer.taken) { if (L.length >= 6) L.shift(); L.push({ x: pointer.tapped.x, y: pointer.tapped.y, age: 0, tone: around(Math.random()) }); }
    if (!L.length) return;
    const big = Math.hypot(w, h), dt = Math.min(0.1, sound.dt);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "lighter";
    for (let k = L.length - 1; k >= 0; k--) {
      const r = L[k];
      r.age += dt * (1 + 1.5 * sound.kick);
      const p = r.age / 1.6; // from a dot to the edge of the picture in about a second and a half
      if (p >= 1) { L.splice(k, 1); continue; }
      const radius = big * (0.03 + 0.5 * eased(p)), fade = 0.5 * (1 - p) * (1 - p);
      g.strokeStyle = rgba(r.tone, 1);
      g.globalAlpha = fade;
      g.lineWidth = Math.max(1.5, big * 0.006 * (1 - 0.6 * p));
      g.beginPath(); g.arc(r.x, r.y, radius, 0, TAU); g.stroke();
      g.globalAlpha = fade * 0.5; // and a fainter one just behind it
      g.lineWidth *= 0.5;
      g.beginPath(); g.arc(r.x, r.y, radius * 0.72, 0, TAU); g.stroke();
    }
    g.restore();
  }
  function drawFrame() {
    pointer.tapped = pointer.tap && realNow - pointer.tap.at < 300 ? pointer.tap : null; // a click is news for the one frame after it, for the picture and the visitors alike
    pointer.tap = null;
    pointer.taken = false;
    const inScene = folkInScene();
    drawScene();
    drawTwinkles();
    if (!inScene) invite(TRIPS[name] || ROAM);
    if (acidShows() || bandShows() || (fadesInPlace() && (morph || (!inScene && crowd.folk.length) || dreaming() || pointer.rings.length))) { clean = copyOf(clean); dirty = true; }
    if (morph) blend();
    const inPixels = pixelOver(); // over a pixel world, the visitors and the singer are drawn in its own big square dots
    pointerRings();
    if (!inScene) drawFolk();
    acidSing(); // the 303's singer, over whoever else is visiting
    bandPlay(); // the crowd, the dancer and the rocket, after the singer so they stand in front of the tail of its line
    pixelDone(inPixels);
  }

  /* Morph: the effect changes into another by itself now and then. Never just after a drop, which is the song's big moment and stays with the effect it landed on; best of all in a breakdown,
     or on a kick as a build begins, so that the drop lands on the new one; otherwise on a kick, every minute or so. */
  let wanders = null;
  const roam = { on: 0, due: 60, sinceDrop: 99 };
  function wander(real) {
    const kick = sound.kickHit;
    roam.sinceDrop = flow.dropHit ? 0 : Math.min(99, roam.sinceDrop + real);
    if (!wanders || pending || morph || !hearing) return; // only while the music plays
    roam.on += real;
    if (roam.sinceDrop < 20) return;
    const waiting = flow.part === "calm" || (flow.part === "build" && flow.build < 0.55 && kick); // a breakdown, or a build just begun
    if ((waiting && roam.on > 25) || (kick && roam.on > roam.due) || roam.on > roam.due + 20) { roam.on = 0; roam.due = rnd(40, 80); wanders(); }
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
    names: [["ribbon", "Ribbon"], ["bars", "Bars"], ["trails", "Trails"], ["stars", "Stars"], ["halo", "Halo"], ["space", "Space"], ["trip", "Psychedelic"], ["journey", "Journeys"], ["worlds", "3D"], ["visions", "Visions"], ["pixel", "Pixel"], ["recipes", "Recipes"]],
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
      pointer.rings.length = 0;
      pointer.on = false;
      dream.on = dream.held = dream.bloom = 0;
      dream.motes.length = 0;
      canvas.hidden = true;
    },
    slow() { slowNext = true; }, // the next change takes its time, for when it changes by itself
    wander(pick) { wanders = pick || null; roam.on = 0; roam.due = rnd(40, 80); }, // Morph: what to call for the next effect now and then, or nothing to stay on this one
    full(on) { alone = on; },
    pointer(x, y, how) { // the mouse, from the page: where it is on the screen and what it did ("move" or "down"), or "off" when it has left the picture or is over the page's own things
      if (how === "off") { pointer.on = false; return; }
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      pointer.x = ((x - r.left) * w) / r.width;
      pointer.y = ((y - r.top) * h) / r.height;
      pointer.on = true;
      pointer.at = realNow;
      if (how === "down") pointer.tap = { x: pointer.x, y: pointer.y, at: realNow };
    },
    mood(next) { mood = next || ""; }, // what's playing decides who comes by
    song(text, kind) { if ((text || "") !== nowSong) { flow.floor = 0.19; flow.bare = 0.13; flow.since = Math.max(flow.since, 1.4); flow.thump = 0; flow.spare = 0; flow.grooved = false; bandNewSong(); acidNewSong(); } nowSong = text || ""; genre = typeof kind === "string" ? kind : ""; }, // kind: the song's genres in words ("Acid, Techno"), for the effects that go by the kind of music. The name is for the cockpit's news, and a new song's usual is learned afresh: the last song's kick isn't this one's
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
    knobs: (style) => { const trip = TRIPS[style]; return ["light", "react", "speed", "spark", ...(LEAVES_TRAILS.has(style) ? ["drag"] : []), ...(style === "ripple" ? ["tilt"] : []), ...(trip ? ["nod", ...(trip.steer ? ["turns"] : []), ...(trip.moves ? ["moves"] : []), "shots"] : []), ...(VERSIONS[style] ? ["vary"] : []), ...(FRACTALS.has(style) ? ["color", "echo", "breathe", "sounds"] : []), "dream", "folk", "acid", "band", ...(trip && trip.falls ? ["falls"] : []), ...(trip && trip.cockpit ? ["pit"] : [])].map((key) => [key, ...KNOBS[key]]); },
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
        bandNow(real); // the band's numbers for this frame, before anything is drawn
        dreamNow(real);
        acidNow(real);
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
