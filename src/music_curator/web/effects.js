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
  const T = { light: 1, react: 1, speed: 1, drag: 1, spark: 1, nod: 1, turns: 1, moves: 1, shots: 1, folk: 1, pit: 1, tilt: 1 }; // what's been adjusted for the effect showing: 1 is how it was designed
  const KNOBS = { light: ["Brightness", 0.3, 1.7], react: ["Reacts to the music", 0.2, 1.8], speed: ["Speed", 0.3, 2], spark: ["Glints on the hi-hats", 0, 2], drag: ["Length of the trails", 0.4, 2.5], nod: ["Nodding to the beat", 0, 2], turns: ["Changes of course", 0, 3], moves: ["Jumps and stops", 0, 3], pit: ["Cockpit", 0, 1], shots: ["Shooting stars", 0, 3], folk: ["Visitors", 0, 3], tilt: ["Turning now and then", 0, 3] };
  const LEAVES_TRAILS = new Set(["trails", "tunnel", "vortex", "prism", "ripple", "comets", "stars", "whirl", "fireworks", "scope"]);
  const raw = new Float32Array(BANDS), peaks = new Float32Array(BANDS), stars = new Float32Array(STARS * 3), HEADS = 9, past = new Float32Array(HEADS * 2).fill(NaN), orbits = new Float32Array(HEADS);
  let nowSong = "", mood = "", name = "", alone = false, w = 0, h = 0, quality = 1, colors = PLAIN, picture = null, last = 0, slowTime = 0, slowFrames = 0, top = 0.3, waveTop = 0.1, freq = null, time = null;
  let pending = "", morph = null, slowNext = false, quiet = false, dirty = false, clean = null, realNow = 0, hearing = false; // changing from one effect to another: see blend()
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

  function listen(analyser, hit, tick, dt) {
    const s = sound;
    if (analyser) {
      if (!freq) { freq = new Uint8Array(analyser.frequencyBinCount); time = new Uint8Array(analyser.fftSize); }
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      const perBin = analyser.context.sampleRate / analyser.fftSize, at = (b) => (30 * (16000 / 30) ** (b / BANDS)) / perBin;
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
    const { t, bass, mid, kick, hatHit } = sound, LINES = 14, step = Math.max(6, w / 150);
    const yAt = (u, r, spread) => h * (0.34 + r * 0.16) + Math.sin(u * 3.4 + t * 0.55 + r * 2.1 + spread * 1.6) * h * (0.07 + 0.1 * bass)
      + Math.sin(u * 8.2 - t * 0.9 + r * 2.1 + spread * 4) * h * (0.012 + 0.03 * mid)
      + spread * h * (0.09 + 0.16 * smooth(u * BANDS * 0.7 + r * 6)) * Math.sin(u * 2.6 + t * 0.4 + r);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineWidth = Math.max(1, h / 540);
    for (let r = 0; r < 3; r++) {
      for (let l = 0; l < LINES; l++) {
        const spread = l / (LINES - 1) - 0.5;
        g.beginPath();
        for (let x = 0; x <= w + step; x += step) {
          const y = yAt(x / w, r, spread);
          if (x) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.strokeStyle = rgba(colors[r], (0.16 + 0.22 * kick) * (1 - Math.abs(spread) * 1.1));
        g.stroke();
      }
    }
    if (hatHit) for (let i = 0; i < 3; i++) { const u = Math.random(); twinkle(u * w, yAt(u, i, rnd(-0.5, 0.5)), h * 0.06); }
  }

  function silk() { // broad sheets of light folding over each other, like the old glass desktop wallpapers
    const { t, bass, kick, hatHit } = sound, step = Math.max(8, w / 120), SHEETS = 5;
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
          const u = x / w, y = base + fold * h * 0.05 + Math.sin(u * 2.4 + t * 0.32 + phase + fold) * h * (0.1 + 0.07 * bass) + Math.sin(u * 5.7 - t * 0.46 + phase * 2) * h * 0.024, thick = h * (0.016 + 0.1 * smooth(u * BANDS * 0.7 + r * 7) + 0.035 * bass) * (1.15 + Math.sin(u * 3.3 + t * 0.26 + r + fold * 3));
          if (x) { sheet.lineTo(x, y - thick); edge.lineTo(x, y - thick); } else { sheet.moveTo(x, y - thick); edge.moveTo(x, y - thick); }
          under.push(x, y + thick * 0.4);
          if (hatHit && f === 2 && Math.random() < 0.008) twinkle(x, y - thick, h * 0.06);
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

  function helix() { // two strands wound round each other, with the sound strung between them
    const { t, bass, kick, hatHit } = sound, n = 90, amp = h * (0.17 + 0.08 * bass), one = new Path2D(), two = new Path2D(), width = Math.max(1.6, h / 340) * (1 + kick);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = u * w, turn = Math.sin(u * TAU * 2.4 + t * 0.8), y = h / 2 + Math.sin(u * 2.1 + t * 0.2) * h * 0.06, a = y + turn * amp, b = y - turn * amp;
      if (i) { one.lineTo(x, a); two.lineTo(x, b); } else { one.moveTo(x, a); two.moveTo(x, b); }
      if (i % 2) continue;
      const v = smooth(u * BANDS * 0.85);
      g.strokeStyle = rgba(around(u * 0.9 + t * 0.03), 0.18 + 0.75 * v);
      g.lineWidth = Math.max(1, h / 450) * (1 + 2.4 * v);
      g.beginPath();
      g.moveTo(x, a);
      g.lineTo(x, b);
      g.stroke();
      if (hatHit && Math.random() < 0.07) twinkle(x, Math.random() < 0.5 ? a : b, h * 0.055);
    }
    neon(one, rgba(colors[0], 1), width, 0.9);
    neon(two, rgba(colors[1], 1), width, 0.9);
  }

  function strings() { // a row of strings, each plucked by its own part of the sound
    const { t, kick, hatHit } = sound, N = 24, pad = h * 0.14, gapY = (h - pad * 2) / (N - 1), step = Math.max(6, w / 130), width = Math.max(1, h / 620);
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    for (let s = 0; s < N; s++) {
      const v = smooth(((N - 1 - s) / N) * BANDS * 0.9 + 1), y0 = pad + s * gapY, shake = Math.sin(t * (13 + s * 1.9)) * gapY * 3.4 * v, loops = 1 + (s % 3), path = new Path2D();
      for (let x = 0; x <= w + step; x += step) { const y = y0 + Math.sin((x / w) * Math.PI * loops) * shake; if (x) path.lineTo(x, y); else path.moveTo(x, y); }
      neon(path, rgba(around(s / N + t * 0.02), 1), width * (1 + 1.6 * v), 0.3 + 0.7 * v + 0.2 * kick, 0.6);
    }
    if (hatHit) for (let i = 0; i < 3; i++) twinkle(rnd(0, w), pad + Math.floor(rnd(0, N * 0.4)) * gapY, h * 0.05);
  }

  function bars() { // the spectrum, with little caps that fall back slowly
    const n = 56, side = w * 0.05, gap = w * 0.0035, wide = (w - side * 2 - gap * (n - 1)) / n, floor = h * 0.8, tall = h * 0.6;
    backdrop();
    for (let i = 0; i < n; i++) {
      const v = sound.bands[Math.floor((i / n) * BANDS * 0.92)], x = side + i * (wide + gap), high = Math.max(2, v * tall), c = around((i / n) * 0.9);
      peaks[i] = Math.max(v, peaks[i] - sound.dt * 0.5);
      g.fillStyle = rgba(c, 0.82);
      g.fillRect(x, floor - high, wide, high);
      g.fillStyle = rgba(c, 0.14);
      g.fillRect(x, floor + 3, wide, high * 0.32);
      g.fillStyle = rgba(mix(c, [255, 255, 255], 0.55), 0.9);
      g.fillRect(x, floor - peaks[i] * tall - 5, wide, 2.5);
    }
    if (sound.hatHit) for (let k = 0; k < 3; k++) { const i = Math.floor(rnd(n * 0.45, n)); twinkle(side + i * (wide + gap) + wide / 2, floor - peaks[i] * tall - 5, h * 0.06); }
  }

  function mirror() { // the spectrum folded about the middle and standing on black glass
    const { t, dt, hatHit } = sound, n = 44, side = w * 0.03, gap = w * 0.003, wide = (w / 2 - side - gap * n) / n, floor = h * 0.66, tall = h * 0.52;
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
    const { dt, hatHit } = sound, COLS = 30, ROWS = 20, side = w * 0.09, floor = h * 0.86, tall = h * 0.7, stepX = (w - side * 2) / COLS, stepY = tall / ROWS, lamp = stepX * 0.8, thin = stepY * 0.64, lit = [new Path2D(), new Path2D(), new Path2D()], off = new Path2D(), caps = new Path2D();
    backdrop();
    for (let c = 0; c < COLS; c++) {
      const v = sound.bands[Math.floor((c / COLS) * BANDS * 0.92)], level = Math.round(v * ROWS), x = side + c * stepX;
      peaks[c] = Math.max(v, peaks[c] - dt * 0.35);
      const cap = Math.min(ROWS - 1, Math.round(peaks[c] * ROWS));
      for (let r = 0; r < ROWS; r++) (r < level ? lit[r < ROWS * 0.62 ? 0 : r < ROWS * 0.85 ? 1 : 2] : r === cap ? caps : off).rect(x, floor - (r + 1) * stepY, lamp, thin);
      if (hatHit && c > COLS * 0.55 && Math.random() < 0.1) twinkle(x + lamp / 2, floor - (cap + 0.6) * stepY, h * 0.05);
    }
    g.fillStyle = "rgba(255,255,255,.04)";
    g.fill(off);
    [colors[0], [255, 196, 60], [255, 72, 50]].forEach((tone, k) => { g.fillStyle = rgba(tone, 0.95); g.fill(lit[k]); });
    g.fillStyle = rgba(mix(colors[0], [255, 255, 255], 0.6), 0.95);
    g.fill(caps);
  }

  const RIDGES = 34, ACROSS = 56, land = new Float32Array(RIDGES * ACROSS);
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
    const R = h * (0.21 + 0.014 * kick), heat = g.createLinearGradient(0, horizon - R, 0, horizon);
    heat.addColorStop(0, rgba(mix(colors[0], [255, 255, 255], 0.4), 1));
    heat.addColorStop(1, rgba(colors[1], 1));
    g.save();
    g.beginPath();
    g.arc(w / 2, horizon, R, Math.PI, 0);
    g.clip();
    g.fillStyle = heat;
    for (let i = 0; i < 9; i++) g.fillRect(0, horizon - R + (R * i) / 9, w, (R / 9) * (1 - (i / 9) * 0.68));
    g.restore();
    g.lineJoin = "round";
    for (let r = RIDGES - 1; r >= 0; r--) { // the far ones first, so the near ones hide them
      const depth = Math.min(1, (r + landClock / WAIT) / (RIDGES - 1)), near = (1 - depth) ** 2.6, y0 = horizon + (h * 1.04 - horizon) * near, half = w * (0.3 + 0.4 * near), lift = h * (0.012 + 0.3 * near), row = (landAt + r) % RIDGES, line = new Path2D();
      for (let a = 0; a < ACROSS; a++) {
        const x = w / 2 + (a / (ACROSS - 1) - 0.5) * 2 * half, y = y0 - land[row * ACROSS + a] * lift;
        if (a) line.lineTo(x, y); else line.moveTo(x, y);
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
    for (let p = 0; p < POINTS; p++) { const x = left + (wide * p) / (POINTS - 1), y = mid + wave[p] * h * 0.3; if (p) trace.lineTo(x, y); else trace.moveTo(x, y); }
    g.globalCompositeOperation = "lighter";
    g.lineJoin = "round";
    neon(trace, rgba(tone, 1), Math.max(1.4, h / 460), 0.8 + 0.2 * kick);
    if (hatHit) { const p = Math.floor(rnd(0, POINTS)); twinkle(left + (wide * p) / (POINTS - 1), mid + wave[p] * h * 0.3, h * 0.07); }
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
  function soundLoop(cx, cy, rx, ry, spin, depth, every = 1) { // the waveform bent into a closed ring
    const path = new Path2D();
    for (let p = 0; p <= POINTS; p += every) {
      const a = (p / POINTS) * TAU + spin, swell = 1 + sound.wave[p % POINTS] * depth * Math.sin((p / POINTS) * Math.PI), x = cx + Math.cos(a) * rx * swell, y = cy + Math.sin(a) * ry * swell;
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
    const { t, bass, kick, dt } = sound, pace = dt * 60, spin = t * 0.15, cx = w / 2, cy = h / 2, r = Math.min(w, h) * (0.13 + 0.08 * bass);
    echo(1 + (0.012 + 0.02 * bass + 0.012 * kick) * pace, (0.0025 + 0.0045 * Math.sin(t * 0.23)) * pace, 0.955 ** pace, Math.sin(t * 0.31) * w * 0.0012 * pace, Math.cos(t * 0.27) * h * 0.0016 * pace, undefined, 0.5);
    neon(soundLoop(cx, cy, r, r, spin, 0.42), sweep(cx, cy, spin * 1.4), Math.max(1.5, h / 360) * (1 + kick), 0.65 + 0.35 * kick, 0.55);
    spray(5, (u) => [cx + Math.cos(u * TAU) * r * 1.1, cy + Math.sin(u * TAU) * r * 1.1], h * 0.05);
    remember();
  }

  function tunnel() { // the other way: rings born at the edge sink away into the middle
    const { t, bass, kick, dt } = sound, pace = dt * 60, spin = -t * 0.2, cx = w / 2, cy = h / 2, swell = 0.46 * (1 + 0.05 * bass);
    echo(1 - (0.014 + 0.028 * bass + 0.014 * kick) * pace, (0.004 + 0.007 * Math.sin(t * 0.19)) * pace, 0.972 ** pace);
    neon(soundLoop(cx, cy, w * swell, h * swell, spin, 0.07, 2), sweep(cx, cy, spin), Math.max(2, h / 280) * (1 + 0.6 * kick), 0.6 + 0.4 * kick);
    spray(5, (u) => [cx + Math.cos(u * TAU) * w * swell, cy + Math.sin(u * TAU) * h * swell], h * 0.06);
    remember();
  }

  function vortex() { // arms of sound wound into a spiral
    const { t, wave, bass, kick, dt } = sound, pace = dt * 60, reach = Math.hypot(w, h) * 0.5, ARMS = 3;
    echo(1 + (0.007 + 0.012 * bass) * pace, (0.03 + 0.03 * bass) * pace, 0.955 ** pace);
    for (let arm = 0; arm < ARMS; arm++) {
      const a = (arm / ARMS) * TAU + t * 0.3, path = new Path2D(), nx = -Math.sin(a), ny = Math.cos(a);
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
    const { t, bass, kick, dt } = sound, pace = dt * 60, spin = t * 0.25, cx = w * (0.39 + 0.08 * Math.cos(t * 0.37)), cy = h * (0.37 + 0.1 * Math.sin(t * 0.29)), r = Math.min(w, h) * (0.13 + 0.07 * bass);
    echo(1 + (0.01 + 0.016 * bass + 0.01 * kick) * pace, (0.006 + 0.006 * Math.sin(t * 0.17)) * pace, 0.955 ** pace);
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
    const [now, was] = pools, along = (p) => mid + (p / (POINTS - 1) - 0.5) * 2 * reach, swell = (p) => mid + wave[p] * H * 0.11 * Math.sin((p / (POINTS - 1)) * Math.PI) ** 0.6, keep = [g, w, h];
    [g, w, h] = [now.getContext("2d"), B, B];
    try {
      echo(1 + 0.002 * pace, 0, 0.972 ** pace, 0, 0, 1 + (0.012 + 0.04 * bass + 0.025 * kick) * pace, 0.5, was);
      const path = new Path2D(), paint = g.createLinearGradient(mid - reach, 0, mid + reach, 0);
      for (let p = 0; p < POINTS; p++) { if (p) path.lineTo(along(p), swell(p)); else path.moveTo(along(p), swell(p)); }
      for (let i = 0; i <= 6; i++) paint.addColorStop(i / 6, rgba(around(i / 6 + t * 0.06), 1));
      neon(path, paint, Math.max(1.3, H / 430) * (1 + 0.7 * kick), 0.36 + 0.26 * kick, 0.7);
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
    for (let i = 0; i < HEADS; i++) {
      const share = i / HEADS, v = smooth((share + 0.05) * BANDS * 0.85);
      orbits[i] += dt * (0.3 + 1.6 * v + 1.2 * kick);
      const turn = orbits[i] + share * TAU, x = w / 2 + Math.cos(turn * (1 + share)) * w * (0.16 + 0.26 * share), y = h / 2 + Math.sin(turn * (1.6 - share * 0.4)) * h * (0.16 + 0.24 * share);
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
    const { dt, level, kick } = sound, cx = w / 2, cy = h / 2, speed = (0.1 + 0.8 * level + 0.7 * kick) * dt, GROUPS = colors.length * 3, paths = Array.from({ length: GROUPS }, () => new Path2D());
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(5,6,10,${(0.32 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < STARS; i++) {
      const x = stars[i * 3], y = stars[i * 3 + 1], z = stars[i * 3 + 2], next = z - speed;
      if (next <= 0.03) { stars[i * 3] = Math.random() * 2 - 1; stars[i * 3 + 1] = Math.random() * 2 - 1; stars[i * 3 + 2] = 1; continue; }
      stars[i * 3 + 2] = next;
      const near = Math.min(2, Math.floor((1 - next) * 3)), path = paths[(i % colors.length) * 3 + near];
      path.moveTo(cx + (x / z) * cx * 0.55, cy + (y / z) * cy * 0.55);
      path.lineTo(cx + (x / next) * cx * 0.55, cy + (y / next) * cy * 0.55);
      if (sound.hatHit && i % 90 === 0) twinkle(cx + (x / next) * cx * 0.55, cy + (y / next) * cy * 0.55, h * 0.05);
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
    const { dt, level, kick, hatHit } = sound, cx = w / 2, cy = h / 2, reach = Math.hypot(w, h) * 0.52, flat = 0.66, GROUPS = colors.length * 3, paths = Array.from({ length: GROUPS }, () => new Path2D());
    g.globalCompositeOperation = "source-over";
    g.fillStyle = `rgba(5,6,10,${(0.26 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < STARS; i++) {
      const out = (stars[i * 3 + 1] + 1) / 2, was = stars[i * 3] * Math.PI, now = was + ((0.2 + 1.5 * level + 1.6 * kick) * dt) / (0.12 + out), r = reach * (0.04 + 0.96 * out ** 0.7) * (1 + 0.07 * kick * out), near = Math.min(2, Math.floor(stars[i * 3 + 2] * 3)), path = paths[(i % colors.length) * 3 + near], x = cx + Math.cos(now) * r, y = cy + Math.sin(now) * r * flat;
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
      const z = stars[i * 3 + 2], layer = Math.min(2, Math.floor(z * 3)), grow = 1 + 0.06 * kick * (layer + 1);
      let y = stars[i * 3 + 1] - rise * (0.4 + z);
      if (y < -1) y += 2;
      stars[i * 3 + 1] = y;
      const px = cx + (stars[i * 3] + Math.sin(t * 0.21 + i) * 0.03) * cx * 1.05 * grow, py = cy + y * cy * 1.05 * grow, r = (0.7 + layer * 0.9) * Math.max(1, h / 720), path = groups[i % colors.length][layer];
      path.moveTo(px + r, py);
      path.arc(px, py, r, 0, TAU);
      if (hatHit && i % 60 === 0) twinkle(px, py, h * (0.03 + 0.05 * z));
    }
    colors.forEach((tone, c) => groups[c].forEach((path, layer) => { g.fillStyle = rgba(tone, 0.22 + layer * 0.2 + 0.3 * hat); g.fill(path); }));
  }

  const LINKS = 84, linkX = new Float32Array(LINKS), linkY = new Float32Array(LINKS);
  function links() { // points of light drifting about, joined up whenever they come close
    const { t, dt, level, kick, hatHit } = sound, close = Math.min(w, h) * 0.25, faint = new Path2D(), bright = new Path2D(), wrap = (v) => (v > 1 ? v - 2 : v < -1 ? v + 2 : v);
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
  function shell(x, y, count, tone, speed, life) { // one burst of sparks, each with where it is and where it's going
    const parts = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { const a = rnd(0, TAU), v = speed * Math.sqrt(Math.random()); parts.set([x, y, Math.cos(a) * v, Math.sin(a) * v], i * 4); }
    shells.push({ tone, parts, left: life, life, x, y });
  }
  function fireworks() { // a shell goes off on every kick, and crackles on the hi-hats
    const { dt, kickHit, hatHit } = sound, size = Math.min(w, h), drag = Math.exp(-dt * 1.7), fall = size * 0.42 * dt;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = `rgba(5,6,10,${(0.16 / T.drag).toFixed(3)})`;
    g.fillRect(0, 0, w, h);
    if (kickHit) {
      lastShell = [rnd(0.16, 0.84) * w, rnd(0.14, 0.62) * h];
      shell(...lastShell, Math.round(42 + 46 * kickHit), around(rnd(0, 1)), size * (0.34 + 0.46 * kickHit), rnd(1, 1.4));
      twinkle(...lastShell, size * 0.16, 0.2);
    }
    if (hatHit && lastShell) shell(lastShell[0] + rnd(-0.14, 0.14) * size, lastShell[1] + rnd(-0.14, 0.14) * size, 6, [255, 240, 210], size * 0.14, 0.45);
    if (shells.length > 22) shells.shift();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    shells = shells.filter((s) => (s.left -= dt) > 0);
    for (const s of shells) {
      const path = new Path2D(), p = s.parts, part = s.left / s.life;
      for (let i = 0; i < p.length; i += 4) {
        path.moveTo(p[i], p[i + 1]);
        p[i + 2] *= drag;
        p[i + 3] = p[i + 3] * drag + fall;
        p[i] += p[i + 2] * dt;
        p[i + 1] += p[i + 3] * dt;
        path.lineTo(p[i], p[i + 1]);
      }
      g.strokeStyle = rgba(mix(s.tone, [255, 255, 255], 0.2), part ** 0.7);
      g.lineWidth = Math.max(1.3, h / 380) * (0.6 + part);
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
    const cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * sound.kick), n = 72;
    backdrop();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineWidth = Math.max(2, ((TAU * r) / (n * 2)) * 0.55);
    for (let i = 0; i < n * 2; i++) {
      const b = i < n ? i : n * 2 - 1 - i, v = sound.bands[Math.floor((b / n) * BANDS * 0.82)], a = (i / (n * 2)) * TAU - Math.PI / 2, from = r * 1.05, to = from + size * (0.012 + 0.24 * v);
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
      for (let i = 0; i <= n; i++) out[i] = lift + swing * smooth(Math.abs((i / n) * 2 - 1) * BANDS * 0.62 + 1) + size * 0.012 * Math.sin((i / n) * TAU * 5 + t * 1.3 + layer);
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
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * kick), N = 13, gap = size * 0.021;
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
      for (const half of [0, Math.PI]) {
        g.beginPath();
        g.arc(cx, cy, at, spin + half, spin + half + long);
        g.stroke();
      }
      if (hatHit && i > N * 0.5 && Math.random() < 0.3) twinkle(cx + Math.cos(spin + long) * at, cy + Math.sin(spin + long) * at, h * 0.05);
    }
    middle(cx, cy, r);
  }

  function mandala() { // the sound folded into a flower round the record, like stained glass
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), r = size * (0.2 + 0.014 * kick), FOLDS = 8, STEPS = 20, span = Math.PI / FOLDS, soft = (at) => (smooth(at - 2.5) + smooth(at) + smooth(at + 2.5)) / 3;
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
    const { t, kick, hatHit } = sound, cx = w / 2, cy = h / 2, size = Math.min(w, h), reach = Math.hypot(w, h) * 0.56, r = size * (0.2 + 0.014 * kick), n = 60, spin = t * 0.05;
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
    space: { plan: ["nebula", "galaxy", "gas", "nebula", "hole", "gas", "nebula", "galaxy", "gas", "hole"], pace: 1, steer: 1, folk: [24, 55], crowd: 1, shots: 1, moves: 1, cockpit: true, odd: ["sign", "cow", "astronaut", "sign", "vinyl"] },
    warp: { plan: ["nebula", "galaxy", "nebula"], pace: 2.8, steer: 0.7, streak: 6, rings: true, folk: [50, 90], crowd: 1, shots: 0.4, moves: 0.6, odd: ["sign", "cow", "sign"] },
    drift: { plan: ["nebula", "gas", "galaxy", "nebula"], pace: 0.26, steer: 0.5, folk: [30, 60], crowd: 1, shots: 0.6, odd: ["astronaut", "cow", "vinyl"] },
    orbit: { plan: ["galaxy", "nebula"], pace: 0.14, steer: 0.22, orbit: true, folk: [30, 60], crowd: 1, shots: 1.6, odd: ["astronaut"] },
    visitors: { plan: ["nebula", "gas", "nebula", "galaxy"], pace: 0.5, steer: 0.7, folk: [2.5, 7], crowd: 5, shots: 1, moves: 0.6, odd: ["sign", "astronaut", "cow", "vinyl"] },
    well: { plan: [], pace: 0, steer: 0, folk: [40, 80], crowd: 1, shots: 0.8 },
  };
  const HEADINGS = [[0, 0], [0.6, -0.14], [-0.6, 0.12], [0.32, 0.36], [-0.32, -0.36], [0.9, 0.08], [-0.9, -0.08], [0, 0.5], [0, -0.5]];
  const sky = { far: null, things: [], gone: 0, nextAt: 0, step: 0, aurora: -1, whirl: 0, bob: 0, bobSpeed: 0 };
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
    Object.assign(sky, { far: paintFar(), veil: paper(256, 144), things: [], gone: 0, nextAt: 8, step: 2, aurora: -1, x: 0, y: 0, vx: 0, vy: 0, aimX: 0, aimY: 0, bank: 0, course: 0, bob: 0, bobSpeed: 0, surge: 0, lastKick: 0, turnAt: t + rnd(9, 20), shots: [], shotAt: t + rnd(1, 4), rings: [], pit: null,
      speedNow: 1, streakNow: 1, aimSpeed: 1, aimStreak: 1, move: "", steps: [], stepEnd: 0, waitKick: false, moveAt: t + rnd(14, 26), moveStep: 0, spin: 0, rollWas: 0, ink: null, inkLeft: 0, oddAt: t + rnd(16, 34), fallers: [],
      deck: null, told: "", tick: null, tickStep: 0, lastHit: 0, gaps: [], neck: 0, neckSpeed: 0, swing: 0, swingSpeed: 0, splats: [], splatAt: t + rnd(35, 90), wipeAt: 0, wipe: -1 });
    if (name === "well") return;
    spawn("nebula");
    sky.things.forEach((o) => { o.z -= 22; });
    spawn("galaxy");
    sky.things[sky.things.length - 1].z -= 12;
  }
  function drawThing(o, focal, camX, camY, reach) {
    const { t, bass, kick } = sound, k = focal / o.z, x = (o.x - camX) * k, size = o.size * k * (1 + 0.075 * kick * T.nod), y = (o.y - camY) * k + sky.bob * (k * 0.5 + o.nod * Math.min(size, h * 0.7) * 0.42), seen = clamp((FAR + 6 - o.z) / 10) * clamp((o.z - o.near) / (o.near * 1.4));
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
    if (kickHit) {
      if (sky.lastKick && t - sky.lastKick > 2.6) { sky.surge = 1; if (T.turns) newCourse(trip); for (let i = 0, n = Math.round(7 * T.shots); i < n; i++) launch(); }
      sky.lastKick = t;
    }
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
    sky.bobSpeed += (-sky.bob * 135 - sky.bobSpeed * 11) * dt;
    sky.bob += sky.bobSpeed * dt;
  }
  /* Every so often the ship does something: jumps ahead with the stars drawn out long, stops dead and floats, leaves trails, or holds still and turns while the stars draw circles, like a long exposure. Each step is a speed, a length of streak and how long it lasts; the last can wait for a kick. */
  const MOVES = { jump: [[5.5, 8, 1.8], [7, 11, 2.4], [1, 1, 1.5]], stop: [[0.02, 0.3, 1.4], [0.02, 0.3, 3.2, true], [4, 6, 0.6], [1, 1, 1.2]], trail: [[1, 3, 9], [1, 1, 1]], exposure: [[0.05, 0.3, 1.2], [0.05, 0.3, 8], [1, 1, 1.4]] };
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
    } else if (trip.moves && T.moves && t > sky.moveAt && (kickHit || t > sky.moveAt + 4)) startMove(MOVE_ORDER[sky.moveStep++ % MOVE_ORDER.length]);
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
  };
  const FOLK = { "": ["saucer", "jelly", "saucer", "peek", "jelly", "saucer"], euphoric: ["jelly", "whale", "saucer", "jelly", "peek", "whale"], acid: ["smiley", "saucer", "smiley", "peek", "smiley", "saucer"], hard: ["saucer", "saucer", "peek", "saucer", "saucer", "peek"] };
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
  function smileyFace(x, cx, cy, r) {
    const skin = x.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    skin.addColorStop(0, "#fff6a0");
    skin.addColorStop(0.6, "#f7e11e");
    skin.addColorStop(1, "#d6b900");
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
  const toneOf = (look) => (look === "hard" ? [255, 60, 44] : look === "acid" ? [246, 230, 50] : look === "euphoric" ? mix(around(rnd(0, 1)), [255, 255, 255], 0.35) : around(rnd(0, 1))); // a saucer's lights
  function meet(kind) {
    const { t } = sound, side = Math.random() < 0.5 ? -1 : 1, most = Math.max(w, h), look = mood, come = (o) => crowd.folk.push(o);
    if (kind === "jelly") { const tone = mix(around(rnd(0, 1)), look === "euphoric" ? [230, 215, 255] : [120, 210, 255], 0.35); come({ kind, born: t, life: rnd(15, 24), x: rnd(0.12, 0.88) * w, y: h * 1.15, drift: side * rnd(0.004, 0.02) * w, rise: h * rnd(0.055, 0.09), size: most * rnd(0.12, 0.2), art: paintJelly(tone), tone, pulse: 0, seed: rnd(0, TAU) }); return; }
    if (kind === "whale") { const tone = mix(around(rnd(0, 1)), [150, 200, 255], 0.5); come({ kind, born: t, life: rnd(18, 26), side, y: rnd(0.2, 0.55) * h, size: most * rnd(0.3, 0.45), art: paintWhale(tone), tone, seed: rnd(0, TAU) }); return; }
    if (kind === "smiley") { for (let i = 0; i < 3; i++) come({ kind, born: t + i * 1.2, life: rnd(9, 14), x: rnd(0.1, 0.9) * w, y: h * 1.2, vx: rnd(-0.05, 0.05) * w, vy: -rnd(0.1, 0.16) * h, size: most * rnd(0.07, 0.13), turn: rnd(0, TAU), spin: rnd(-0.7, 0.7), nod: Math.random() < 0.5 ? -1 : 1 }); return; }
    if (kind === "peek") { come({ kind, born: t, life: rnd(7, 11), x: rnd(0.16, 0.84) * w, size: Math.min(w, h) * rnd(0.34, 0.48), lean: side, blink: t + rnd(1, 3), shut: 0, seed: rnd(0, TAU), look }); return; }
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
    const { t, dt, kick } = sound, size = o.size * (1 + 0.1 * kick);
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = clamp(part / 0.08) * clamp((1 - part) / 0.12);
    g.translate(o.x, o.y + sky.bob * o.size * 0.5 * o.nod);
    g.rotate(o.turn + t * o.spin + sky.bob * 0.3 * o.nod);
    g.drawImage(artOf("acid").head, -size / 2, -size / 2, size, size);
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
    g.drawImage(artOf(o.look).head, -size / 2, -size / 2, size, size);
    if (look.angry) return;
    if (look.smiley) {
      if (!wink) return;
      g.fillStyle = "#f7e11e";
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
  const DRAWN_BY = { astronaut: drawAstronaut, saucer: drawSaucer, jelly: drawJelly, whale: drawWhale, smiley: drawSmiley, peek: drawPeek, cow: drawCow };
  function invite(trip) { // somebody new, when it's time: who depends on what's playing
    const { t } = sound, list = FOLK[mood] || FOLK[""];
    if (T.folk && t > crowd.at && crowd.folk.length < trip.crowd) { meet(list[crowd.step++ % list.length]); crowd.at = t + rnd(...trip.folk) / T.folk; }
    if (T.folk && trip.odd && t > crowd.oddAt) { const kind = trip.odd[crowd.oddStep++ % trip.odd.length]; if (TRIPS[name]) oddity(kind); else meet(kind); crowd.oddAt = t + rnd(40, 110) / T.folk; }
  }
  function drawFolk() {
    const { t } = sound;
    crowd.folk = crowd.folk.filter((o) => {
      const part = (t - o.born) / o.life;
      if (part >= 1) return false;
      if (part < 0) return true; // one of a group, not quite here yet
      g.save();
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
    for (let i = 0; i < STARS; i++) {
      const z = stars[i * 3 + 2], next = z - amount, x = stars[i * 3] - sideX, y = stars[i * 3 + 1] - sideY;
      if (next <= 0.03) { stars[i * 3] = Math.random() * 2 - 1; stars[i * 3 + 1] = Math.random() * 2 - 1; stars[i * 3 + 2] = 1; continue; }
      stars[i * 3 + 2] = next;
      if (Math.abs(x) > 1 || Math.abs(y) > 1) { stars[i * 3] = x - Math.sign(x) * (Math.abs(x) > 1 ? 2 : 0); stars[i * 3 + 1] = y - Math.sign(y) * (Math.abs(y) > 1 ? 2 : 0); continue; } // round to the other side, with nothing drawn across the middle
      stars[i * 3] = x;
      stars[i * 3 + 1] = y;
      const path = paths[(i % 3) * 3 + Math.min(2, Math.floor((1 - next) * 3))], was = Math.min(1, next + amount * streak), fromX = ((x + sideX * streak) / was) * reach, fromY = ((y + sideY * streak) / was) * reach, toX = (x / next) * reach, toY = (y / next) * reach;
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
    const d = sky.deck, u = d.u, A = T.pit, rattle = Math.max(0, sky.speedNow - 3) * 0.6 + sky.surge * 2, ox = rnd(-1, 1) * rattle, oy = sky.bob * h * 0.006 + rnd(-1, 1) * rattle, tone = around(t * 0.02);
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
    if (kickHit) { if (sky.lastHit && t - sky.lastHit > 0.2 && t - sky.lastHit < 1.3) { sky.gaps.push((t - sky.lastHit) / T.speed); if (sky.gaps.length > 12) sky.gaps.shift(); } sky.lastHit = t; }
    const sorted = [...sky.gaps].sort((a, b) => a - b), bpm = sorted.length > 3 ? Math.round(60 / sorted[sorted.length >> 1]) : 0;
    g.font = `700 ${Math.max(13, 30 * u)}px ui-monospace, Consolas, monospace`;
    g.fillStyle = rgba(tone, A);
    g.textAlign = "right";
    g.fillText(bpm ? String(bpm) : "---", Q.x + Q.w - 12 * u, Q.y + Q.h * 0.46);
    g.textAlign = "left";
    g.font = `700 ${Math.max(10, 14 * u)}px ui-monospace, Consolas, monospace`;
    g.fillStyle = rgba(sky.speedNow > 3 ? [255, 90, 70] : sky.speedNow < 0.2 ? [255, 196, 60] : [255, 255, 255], (sky.speedNow > 3 && Math.sin(t * 16) < 0 ? 0.3 : 0.85) * A);
    g.fillText(sky.speedNow > 3 ? "TOO FAST" : sky.speedNow < 0.2 ? "PARKED" : "CRUISING", Q.x + 12 * u, Q.y + Q.h - 18 * u);
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
    sky.neckSpeed += (-sky.neck * 170 - sky.neckSpeed * 5) * dt;
    sky.neck += sky.neckSpeed * dt;
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
    sky.swingSpeed += (-(sky.swing + sky.bank * 1.5) * 15 - sky.swingSpeed * 0.9) * dt;
    sky.swing += sky.swingSpeed * dt;
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

  function space() {
    if (!sky.far) startSky();
    const trip = TRIPS[name], { t, dt, level, kick, hatHit } = sound;
    steer(trip);
    moves(trip);
    const speed = (0.9 + 4.2 * level + 5 * kick + 15 * sky.surge) * trip.pace * sky.speedNow, focal = Math.max(w, h) * 0.62, reach = Math.hypot(w, h) * 0.6, size = Math.hypot(w, h) * 1.2;
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
    g.drawImage(sky.far, -size / 2, -size / 2, size, size);
    g.setTransform(1, 0, 0, 1, w / 2, h / 2 + sky.bob * h * 0.03);
    g.rotate(roll + t * 0.004);
    flightStars((speed * dt) / 26, focal, (trip.streak || 1) * sky.streakNow, roll + t * 0.004);
    if (trip.rings) warpRings(speed, focal);
    shootingStars(trip);
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
    for (const o of sky.things) drawThing(o, focal, camX, camY, reach);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    if (seen) planet(seen);
    if (folkInScene()) { invite(trip); drawFolk(); }
    const inside = trip.cockpit && T.pit;
    if (inside) cockpit(camX);
    if (hatHit) for (let i = 0; i < 2; i++) twinkle(rnd(0, w), rnd(0, inside ? h * 0.62 : h), h * (0.03 + 0.06 * hatHit));
  }

  function well() { // hanging over a black hole, with everything going round it and falling in
    if (!sky.far) startSky();
    const trip = TRIPS.well, { t, dt, bass, level, kick, hatHit } = sound, S = Math.min(w, h), size = S * (1.9 + 0.075 * kick * T.nod), cover = Math.hypot(w, h) * 1.2, behind = new Path2D(), before = new Path2D();
    steer(trip);
    if (!sky.pit) sky.pit = { art: paintHole(colors[0]), disc: paintDisc(colors[0]) };
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

  const DRAW = { ribbon, silk, helix, strings, bars, mirror, leds, terrain, scope, trails, tunnel, vortex, prism, ripple, comets, stars: starfield, whirl, dust, links, fireworks, halo, sun, rings, mandala, rays, space, warp: space, drift: space, orbit: space, visitors: space, well };

  /* From one effect to another. The change waits for the next frame, which draws the old picture once more with nobody visiting and keeps it.
     Then the new effect starts underneath and the old picture goes away over it, in one of several ways: quickly when you pick one, slowly when it changes by itself. */
  const FADES_IN_PLACE = new Set(["scope", "stars", "whirl", "fireworks"]); // these fade their own last frame, so whatever went over it would leave a trail
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
  function beginEffect(next) { // an effect from its first frame
    name = next;
    if (TRIPS[name]) sky.far = null; // a new journey each time
    fit();
    wipe();
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
    DRAW[name]();
    g.setTransform(1, 0, 0, 1, 0, 0);
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
    if (FADES_IN_PLACE.has(name) && (morph || (!inScene && crowd.folk.length))) { clean = copyOf(clean); dirty = true; }
    if (morph) blend();
    if (!inScene) drawFolk();
  }

  /* Morph: the effect changes into another by itself now and then. It waits for a kick, and best of all for the beat coming back after a break. */
  let wanders = null;
  const roam = { on: 0, due: 60, lastKick: 0 };
  function wander(real) {
    const kick = sound.kickHit, back = kick && roam.lastKick && realNow - roam.lastKick > 2600;
    if (kick) roam.lastKick = realNow;
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
    o.neckSpeed += (-o.neck * 170 - o.neckSpeed * 5) * dt;
    o.neck += o.neckSpeed * dt;
    o.swingSpeed += (-o.swing * 4 - o.swingSpeed * 0.5) * dt;
    o.swing += o.swingSpeed * dt;
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
  const GUESTS = { borrow: drawBorrow, abduct: drawAbduct, dangle: drawDangle, peek: drawPeek, astronaut: drawAstronaut, jelly: (o, part) => { drawJelly(o, part); if (o.y < -o.size * 1.4) o.done = true; } };
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
    names: [["ribbon", "Ribbon"], ["bars", "Bars"], ["trails", "Trails"], ["stars", "Stars"], ["halo", "Halo"], ["space", "Space"]],
    styles: {
      ribbon: [["ribbon", "Classic"], ["silk", "Silk"], ["helix", "Helix"], ["strings", "Strings"]],
      bars: [["bars", "Classic"], ["mirror", "Mirror"], ["leds", "LEDs"], ["terrain", "Landscape"], ["scope", "Scope"]],
      trails: [["trails", "Classic"], ["tunnel", "Tunnel"], ["vortex", "Vortex"], ["prism", "Prism"], ["ripple", "Ripple"], ["comets", "Comets"]],
      stars: [["stars", "Classic"], ["whirl", "Whirl"], ["dust", "Dust"], ["links", "Constellations"], ["fireworks", "Fireworks"]],
      halo: [["halo", "Classic"], ["sun", "Sun"], ["rings", "Rings"], ["mandala", "Mandala"], ["rays", "Rays"]],
      space: [["space", "Voyage"], ["warp", "Warp"], ["drift", "Drift"], ["orbit", "Orbit"], ["well", "Black hole"], ["visitors", "Visitors"]],
    },
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
      canvas.hidden = true;
    },
    slow() { slowNext = true; }, // the next change takes its time, for when it changes by itself
    wander(pick) { wanders = pick || null; roam.on = 0; roam.due = rnd(40, 80); }, // Morph: what to call for the next effect now and then, or nothing to stay on this one
    full(on) { alone = on; },
    mood(next) { mood = next || ""; }, // what's playing decides who comes by
    song(text) { nowSong = text || ""; }, // for the cockpit's news
    words: ["warp", "stop", "moo", "aliens"],
    word(what) { // typed on the keyboard, while a picture is showing
      if (!name) return;
      const aboard = TRIPS[name] && sky.far;
      if (what === "aliens") { meet("saucer"); meet("saucer"); }
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
      else if (kind === "peek") { const size = Math.max(130, Math.min(220, Math.min(W, H) * 0.22)); Object.assign(o, { life: rnd(7, 10), floor: place.floor ?? H, size, x: left + size * 0.6 + Math.max(0, right - left - size * 1.2) * Math.random(), lean: side, blink: t + rnd(1, 3), shut: 0 }); }
      else if (kind === "astronaut") Object.assign(o, { life: rnd(14, 18), y: rnd(0.15, 0.5) * H, size: Math.max(56, Math.min(96, Math.min(W, H) * 0.085)), beat: 0, arm: 0 });
      else { const tone = mix(around(rnd(0, 1)), look === "euphoric" ? [230, 215, 255] : [120, 210, 255], 0.35); Object.assign(o, { life: rnd(12, 16), x: rnd(0.15, 0.85) * W, y: H * 1.12, drift: side * rnd(0.004, 0.012) * W, rise: H * rnd(0.05, 0.065), size: Math.max(90, Math.min(160, Math.max(W, H) * 0.075)), art: paintJelly(tone), tone, pulse: 0 }); }
      guest.list.push(o);
      return true;
    },
    visiting: () => guest.list.length > 0,
    knobs: (style) => { const trip = TRIPS[style]; return ["light", "react", "speed", "spark", ...(LEAVES_TRAILS.has(style) ? ["drag"] : []), ...(style === "ripple" ? ["tilt"] : []), ...(trip ? ["nod", ...(trip.steer ? ["turns"] : []), ...(trip.moves ? ["moves"] : []), "shots"] : []), "folk", ...(trip && trip.cockpit ? ["pit"] : [])].map((key) => [key, ...KNOBS[key]]); },
    tuning(values) { // adjustments for the effect showing. Anything left out is back to how it was designed
      for (const key of Object.keys(T)) { const [, low, high] = KNOBS[key], v = Number(values[key]); T[key] = Number.isFinite(v) ? Math.min(high, Math.max(low, v)) : 1; }
      canvas.style.filter = T.light === 1 ? "" : `brightness(${T.light})`;
      if (!T.turns && sky.far) sky.aimX = sky.aimY = 0;
    },
    light: () => T.light,
    cover(img) { // the colors come from the record
      picture = img;
      colors = PLAIN;
      if (!img) return null;
      try {
        const picked = vividColors(img);
        if (picked.length) colors = [...picked, ...PLAIN].slice(0, 3);
        return picked.length ? picked[0] : null; // its strongest color, for whoever else wants it
      } catch { colors = PLAIN; return null; }
    },
    vivid(img) { try { return vividColors(img)[0] || null; } catch { return null; } }, // the strongest color on any picture, without touching what's on screen
    frame(now, analyser, hit, tick, drawing = true) { // drawing: whether the picture moves on this frame. The visitors on the app move either way
      const real = Math.min(0.1, last ? (now - last) / 1000 : 0.016), dt = real * T.speed, showing = !!name && drawing;
      last = now;
      realNow = now;
      hearing = !!analyser;
      if (showing) sound.t += dt;
      sound.dt = dt;
      listen(analyser, hit, tick, real);
      if (!(showing && TRIPS[name])) nodAlong(); // the visitors nod to the kick anywhere. In Space the ship's own nod does it
      if (showing) {
        keepUp(real);
        if (pending) changeOver();
        drawFrame();
        wander(real);
      }
      guests(real);
    },
  };
})();
