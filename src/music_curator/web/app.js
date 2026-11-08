"use strict";

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const view = $("#view");
const SVGNS = "http://www.w3.org/2000/svg";

function fill(n, attrs, kids) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.setAttribute("class", v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c.nodeType ? c : String(c));
  return n;
}
const el = (tag, attrs, ...kids) => fill(document.createElement(tag), attrs, kids); // text always goes in as text, never as HTML
const svg = (tag, attrs, ...kids) => fill(document.createElementNS(SVGNS, tag), attrs, kids);

const ICONS = {
  home: "M3 11.5 12 4l9 7.5M5.5 9.7V20h13V9.7", music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  ears: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z", bars: "M5 20v-6M12 20V5M19 20v-10",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", rows: "M4 6h16M4 12h16M4 18h16",
  shield: "M12 3l7.5 3v5.5c0 4.6-3.1 7.8-7.5 9.5-4.4-1.7-7.5-4.9-7.5-9.5V6zM8.7 12l2.4 2.4 4.3-4.6",
  link: "M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5", bag: "M6 8h12l1.2 12H4.800zM9 11V6a3 3 0 0 1 6 0v5", panel: "M4 5h16v14H4zM15 5v14", listadd: "M4 6h13M4 12h8M4 18h8M17 12v8M13 16h8",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.4a2.6 2.6 0 0 1 5 .6c0 1.7-2.5 2.2-2.5 3.7M12 17h.01", dash: "M5 12h14", x: "M6 6l12 12M18 6 6 18",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z", refresh: "M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5",
  vol: "M4 9.5v5h3.5L13 19V5L7.5 9.5zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11", tick: "M4.5 12.5 10 18 20 7", flag: "M5 21V4M5 4h12l-2 4 2 4H5",
  warn: "M12 4 2.5 20h19zM12 10v4.5M12 17.5h.01", sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4", shuffle: "M16 4h5v5M4 20 21 4M21 15v5h-5M15 15l6 5M4 4l5 5",
  play: "M8 5v14l11-7z", pause: "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z", prev: "M19 6v12l-9-6zM6 6h2.2v12H6z", next: "M5 6v12l9-6zM15.8 6H18v12h-2.2z",
  disc: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", tag: "M4 4h7.5l8.500 8.500-7.500 7.500L4 11.500zM8 8h.01", export: "M12 15V4M8 8l4-4 4 4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5",
};
const FILLED = new Set(["play", "pause", "prev", "next"]);
function icon(name, size = 18, cls) {
  const solid = FILLED.has(name);
  return svg("svg", { viewBox: "0 0 24 24", width: size, height: size, "aria-hidden": "true", class: cls, fill: solid ? "currentColor" : "none",
    stroke: solid ? "none" : "currentColor", "stroke-width": 1.9, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg("path", { d: ICONS[name] }));
}

const fmt = (n) => Number(n).toLocaleString("en-US");
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many || one + "s"}`;
const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
const fold = (t) => (t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const songName = (s) => [s.artist, s.title].filter(Boolean).join(" - ");
const coverUrl = (s) => `/cover/${s.id}?v=${s.v}`;
const q2 = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== "" && v !== null && v !== undefined)).toString();

function clock(secs) {
  if (secs === null || secs === undefined || !isFinite(secs)) return "–";
  const s = Math.round(secs), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
function longTime(secs) {
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.round((secs % 3600) / 60);
  if (d) return `${plural(d, "day")} ${h} h`;
  return h ? `${h} h ${m} min` : `${m} min`;
}
function tally(items) {
  const m = new Map();
  for (const k of items) if (k) m.set(k, (m.get(k) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}
function niceMax(v) { // a clean top for the axis whose half is clean too, close enough that the data fills the chart
  if (v <= 10) return Math.max(2, 2 * Math.ceil(v / 2));
  const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
  return [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10].find((x) => m <= x) * p;
}

/* ---------- state ---------- */
const S = { songs: [], byId: new Map(), lib: [], decisions: {}, progress: {}, meta: {}, songView: "list", sort: { key: "artist", dir: 1 }, list: [], listen: false, observers: [] };
const TRUST = {
  verified: { label: "Verified", long: "Confirmed against Discogs or MusicBrainz.", icon: "shield", cls: "good" },
  auto: { label: "Auto-matched", long: "Matched to a Discogs record by the app, by name and length, or you picked the version. Nobody compared the audio with the record.", icon: "tick", cls: "auto" },
  source: { label: "From the source", long: "Taken from the artist's own upload or an official video, not a record database.", icon: "link", cls: "warn" },
  unverified: { label: "Unverified", long: "No source confirms it. It's in your library because you kept it.", icon: "help", cls: "serious" },
  unknown: { label: "No record", long: "Not in the log, so there's no note on how it was checked.", icon: "dash", cls: "muted" },
};
const KINDS = {
  genre: { label: "Genre by ear", hint: "Discogs lists more than one style." },
  waiting: { label: "Not in the library yet", hint: "Couldn't be verified." },
  flag: { label: "Flagged by you", hint: "You marked this one." },
  problem: { label: "Something looked off", hint: "The last write needs a look." },
  quality: { label: "Low quality", hint: "A better copy might exist." },
  better: { label: "Maybe a better copy", hint: "Found online. Yours stays unless you say otherwise." },
  unverified: { label: "Unverified, kept on purpose", hint: "Only if you change your mind." },
  cover: { label: "No cover", hint: "Empty until a verified one turns up." },
  spotify: { label: "Might be on Spotify", hint: "Listen and compare before saying it's the same." },
  playlist: { label: "Playlist ideas", one: "Playlist idea", hint: "Songs that might belong in one of your playlists." },
};
const ORDER = Object.keys(KINDS);
const NEEDS = new Set(["genre", "waiting", "flag", "problem"]);
const allItems = () => S.songs.flatMap((s) => s.checks.map((c) => ({ s, c, key: `${c.kind}:${s.key}` })));
const isDone = (it) => it.c.kind !== "flag" && !!S.decisions[it.key];
const needsYou = () => allItems().filter((it) => NEEDS.has(it.c.kind) && !isDone(it)).length;

async function load() {
  const r = await fetch("/api/all", { cache: "no-store" });
  if (!r.ok) throw new Error(`server said ${r.status}`);
  const d = await r.json();
  S.setup = d.setup || null;
  document.body.classList.toggle("setup", !!S.setup);
  if (S.setup) return;
  S.songs = d.songs; S.decisions = d.decisions; S.progress = d.progress; S.meta = d.meta;
  S.byId = new Map(d.songs.map((s) => [s.id, s]));
  S.lib = d.songs.filter((s) => s.area === "library");
  $("#genres").replaceChildren(...tally(S.lib.map((s) => s.genre)).map(([g]) => el("option", { value: g })));
  badge();
  if (S.meta.curate && S.meta.curate.running) watchCurate(); // the page was reloaded during a run
  if (S.meta.export && S.meta.export.running) watchExport();
}

function badge() {
  const c = $("#check-count"), a = $("#add-count");
  if (c) c.textContent = needsYou() || "";
  if (a) a.textContent = waitingToAdd().reduce((n, [, d]) => n + lines(d.note).length, 0) + sum(((S.meta.spotify || {}).to_remove || []).map((r) => r.count)) || "";
}
const lines = (text) => (text || "").split("\n").filter(Boolean);
const waitingToAdd = () => Object.entries(S.decisions).filter(([, d]) => d.action === "add");
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4200);
}

/* ---------- tooltips ---------- */
const tipBox = $("#tip");
function showTip(x, y, value, rest) {
  tipBox.replaceChildren(el("strong", {}, value), " ", rest);
  tipBox.hidden = false;
  const r = tipBox.getBoundingClientRect();
  tipBox.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x + 12))}px`;
  tipBox.style.top = `${Math.max(8, y - r.height - 10)}px`;
}
const hideTip = () => (tipBox.hidden = true);
function hoverable(node, value, rest) {
  node.addEventListener("pointermove", (e) => showTip(e.clientX, e.clientY, value, rest));
  node.addEventListener("pointerleave", hideTip);
  node.addEventListener("focus", () => { const r = node.getBoundingClientRect(); showTip(r.left + r.width / 2, r.top, value, rest); });
  node.addEventListener("blur", hideTip);
}

/* ---------- charts ---------- */
function responsive(box, draw) {
  let w = 0;
  const go = () => { const n = box.clientWidth; if (n && n !== w) { w = n; box.replaceChildren(); draw(n); } };
  const ro = new ResizeObserver(go);
  ro.observe(box);
  S.observers.push(ro);
  go();
}
function twin(head, rows, label = "Show as a table") {
  return el("details", { class: "twin" }, el("summary", {}, label),
    el("div", { class: "scroll" }, el("table", { class: "mini" }, el("thead", {}, el("tr", {}, head.map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c) => el("td", {}, c))))))));
}
function columns(box, data, opts) {
  responsive(box, (W) => {
    const H = 214, P = { l: 30, r: 4, t: 20, b: 22 }, iw = W - P.l - P.r, ih = H - P.t - P.b;
    const peak = Math.max(...data.map((d) => d.y)), top = niceMax(peak), base = P.t + ih;
    const sy = (v) => base - (v / top) * ih, band = iw / data.length, bw = Math.min(24, Math.max(3, band - 2));
    const stride = opts.ticks ? Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / opts.ticks)))) : 0; // else: every fifth year
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "group", "aria-label": opts.label });
    const axis = svg("g", { class: "axis" });
    for (const v of [top / 2, top]) {
      root.append(svg("line", { class: "gridline", x1: P.l, x2: W - P.r, y1: sy(v), y2: sy(v) }));
      axis.append(svg("text", { x: P.l - 6, y: sy(v) + 4, "text-anchor": "end" }, fmt(v)));
    }
    root.append(svg("line", { class: "baseline", x1: P.l, x2: W - P.r, y1: base, y2: base }), axis);
    let capped = false;
    data.forEach((d, i) => {
      const x = P.l + band * i + (band - bw) / 2, y = Math.min(sy(d.y), base - (d.y ? 2 : 0)), r = Math.min(4, bw / 2, base - y);
      const can = opts.pick && (!opts.only || opts.only(d));
      const hit = svg("rect", { class: `hit${can ? "" : " still"}`, x: P.l + band * i, y: P.t, width: band, height: ih, tabindex: 0, role: can ? "button" : "img", "aria-label": `${d.x}: ${plural(d.y, "song")}` });
      hoverable(hit, plural(d.y, "song"), String(d.x));
      if (can) {
        hit.addEventListener("click", () => opts.pick(d));
        hit.addEventListener("keydown", (e) => { if (e.key === "Enter") opts.pick(d); });
      }
      root.append(hit);
      if (d.y) root.append(svg("path", { class: `col${d.hi ? " hi" : ""}`, d: `M${x} ${base}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${base}Z` }));
      if (stride ? i % stride === 0 : d.x % 5 === 0) axis.append(svg("text", { x: P.l + band * i + band / 2, y: H - 6, "text-anchor": "middle" }, String(d.tick ?? d.x)));
      if (d.y === peak && !capped) { capped = true; root.append(svg("text", { class: "cap", x: x + bw / 2, y: y - 6, "text-anchor": "middle" }, fmt(d.y))); }
    });
    box.append(root);
  });
}
function growth(box, points, label) {
  responsive(box, (W) => {
    const H = 190, P = { l: 34, r: 34, t: 14, b: 22 }, iw = W - P.l - P.r, ih = H - P.t - P.b, top = niceMax(points[points.length - 1].total), base = P.t + ih;
    const sx = (i) => P.l + (points.length > 1 ? (i / (points.length - 1)) * iw : iw / 2), sy = (v) => base - (v / top) * ih;
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, height: H, role: "img", "aria-label": `Songs in the library over time, reaching ${points[points.length - 1].total}` });
    const axis = svg("g", { class: "axis" });
    for (const v of [top / 2, top]) {
      root.append(svg("line", { class: "gridline", x1: P.l, x2: W - P.r, y1: sy(v), y2: sy(v) }));
      axis.append(svg("text", { x: P.l - 6, y: sy(v) + 4, "text-anchor": "end" }, fmt(v)));
    }
    const stride = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 90))));
    points.forEach((p, i) => { if (i % stride === 0) axis.append(svg("text", { x: sx(i), y: H - 6, "text-anchor": "middle" }, label(p.t, true))); });
    const line = points.map((p, i) => `${i ? "L" : "M"}${sx(i)} ${sy(p.total)}`).join("");
    const lastI = points.length - 1, last = points[lastI];
    const cross = svg("line", { class: "cross", y1: P.t, y2: base, visibility: "hidden" });
    const dot = svg("circle", { class: "dot", r: 5, visibility: "hidden" });
    root.append(svg("line", { class: "baseline", x1: P.l, x2: W - P.r, y1: base, y2: base }), axis,
      svg("path", { class: "area", d: `${line}L${sx(lastI)} ${base}L${sx(0)} ${base}Z` }), svg("path", { class: "line", d: line }), cross,
      svg("circle", { class: "dot", cx: sx(lastI), cy: sy(last.total), r: 5 }),
      svg("text", { class: "cap", x: sx(lastI) + 9, y: sy(last.total) + 4 }, fmt(last.total)), dot);
    root.addEventListener("pointermove", (e) => {
      const r = root.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(lastI, Math.round(((x - P.l) / iw) * lastI))), p = points[i];
      cross.setAttribute("x1", sx(i)); cross.setAttribute("x2", sx(i)); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", sx(i)); dot.setAttribute("cy", sy(p.total)); dot.setAttribute("visibility", "visible");
      showTip(e.clientX, e.clientY, plural(p.total, "song"), `${label(p.t)} (+${fmt(p.added)})`);
    });
    root.addEventListener("pointerleave", () => { cross.setAttribute("visibility", "hidden"); dot.setAttribute("visibility", "hidden"); hideTip(); });
    box.append(root);
  });
}
function ranks(rows, href) {
  const max = rows.length ? rows[0][1] : 1;
  return el("div", { class: "ranks" }, rows.map(([name, n]) => {
    const bar = el("span", { class: "bar" });
    bar.style.width = `${(n / max) * 84}%`;
    return el("a", { class: "rank", href: href(name) }, el("span", { class: "name", title: name }, name), el("span", { class: "track" }, bar, el("span", { class: "val" }, fmt(n))));
  }));
}

/* ---------- covers and shared bits ---------- */
function coverEl(s, play, label) {
  const c = el("div", { class: `cover${s.cover ? "" : " vinyl"}` });
  if (s.cover) {
    const img = el("img", { src: coverUrl(s), alt: "", loading: "lazy", decoding: "async" });
    img.addEventListener("error", () => { img.remove(); c.classList.add("vinyl"); });
    c.append(img);
  }
  if (play) c.append(el("button", { class: "over", type: "button", title: "Play", "aria-label": label || `Play ${songName(s)}`, onclick: (e) => { e.stopPropagation(); play(); } }, icon("play", 20)));
  return c;
}
function trustTag(s) {
  const t = TRUST[s.trust] || TRUST.unknown;
  return el("span", { class: `trust ${t.cls}`, title: t.long }, icon(t.icon, 15), t.label);
}
function lazy(container, items, one, holder) {
  let i = 0;
  const sentinel = el("div", { class: "sentinel" });
  const add = () => {
    const frag = document.createDocumentFragment();
    items.slice(i, i + 80).forEach((x) => frag.append(one(x)));
    i += 80;
    container.append(frag);
    if (i >= items.length) { io.disconnect(); sentinel.remove(); }
    markPlaying();
  };
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) add(); }, { root: view, rootMargin: "700px" });
  S.observers.push(io);
  (holder || container).append(sentinel);
  add();
  if (i < items.length) io.observe(sentinel);
}
function clearPage() {
  S.observers.forEach((o) => o.disconnect());
  S.observers = [];
  hideTip();
}

/* ---------- overview ---------- */
function peakWindow(lib) {
  const by = new Map();
  lib.forEach((s) => { if (s.year) by.set(+s.year, (by.get(+s.year) || 0) + 1); });
  if (!by.size) return null;
  const min = Math.min(...by.keys()), max = Math.max(...by.keys());
  let best = null;
  for (let y = min; y <= Math.max(min, max - 2); y++) {
    const n = (by.get(y) || 0) + (by.get(y + 1) || 0) + (by.get(y + 2) || 0);
    if (!best || n > best.n) best = { y, n };
  }
  return { ...best, min, max, by, dated: sum([...by.values()]) };
}
function stats(lib) {
  const genreNames = new Set(lib.map((s) => s.genre).filter(Boolean));
  const names = lib.flatMap((s) => (s.artist || "").split(" & ")).map((a) => a.trim()).filter((a) => a && !genreNames.has(a) && !/ OST$/.test(a));
  return { secs: sum(lib.map((s) => s.secs)), bytes: sum(lib.map((s) => s.bytes)), genres: tally(lib.map((s) => s.genre)), artists: tally(names),
    labels: tally(lib.map((s) => s.label)), countries: tally(lib.map((s) => s.country)), peak: peakWindow(lib) };
}
function factCards(lib, st) {
  const out = [], n = lib.length, songs = (o) => `#/songs?${q2(o)}`;
  if (st.peak && st.peak.n) {
    const p = st.peak;
    out.push({ label: "Golden years", big: `${p.y}–${p.y + 2}`, sub: `${plural(p.n, "song")} from just three years, ${Math.round((p.n / p.dated) * 100)}% of everything with a date.`, href: songs({ from: p.y, to: p.y + 2 }) });
  }
  if (st.genres.length) {
    const [g, c] = st.genres[0], then = st.genres.slice(1, 3).map((x) => x[0]);
    const ratio = n / c;
    out.push({ label: "You mostly collect", big: g, sub: `${ratio < 1.5 ? "Most of your songs" : `1 in ${Math.round(ratio)} songs`}.${then.length ? ` Then ${then.join(" and ")}.` : ""}`, href: songs({ genre: g }) });
  }
  if (st.artists.length) out.push({ label: "Most collected", big: st.artists[0][0], sub: `${plural(st.artists[0][1], "song")}. ${st.artists[1] ? `${st.artists[1][0]} follows with ${st.artists[1][1]}.` : ""}`, href: songs({ artist: st.artists[0][0] }) });
  out.push({ label: "Start to finish", big: longTime(st.secs), sub: "to play it all without stopping." });
  const known = sum(st.countries.map((x) => x[1]));
  if (st.countries.length) out.push({ label: "Mostly pressed in", big: st.countries[0][0], sub: `${st.countries[0][1]} of the ${known} songs with a known country.`, href: songs({ country: st.countries[0][0] }) });
  if (st.labels.length) out.push({ label: "Top label", big: st.labels[0][0], sub: plural(st.labels[0][1], "song") + ".", href: songs({ label: st.labels[0][0] }) });
  const dated = lib.filter((s) => s.year).sort((a, b) => +a.year - +b.year);
  if (dated.length) out.push({ label: "Oldest song", big: dated[0].year, sub: songName(dated[0]), href: songs({ open: dated[0].id }) });
  const longest = lib.filter((s) => s.secs).sort((a, b) => b.secs - a.secs)[0];
  if (longest) out.push({ label: "Longest ride", big: clock(longest.secs), sub: songName(longest), href: songs({ open: longest.id }) });
  return out;
}
function shuffled(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
function pageHome() {
  const lib = S.lib;
  if (!lib.length) return view.replaceChildren(el("div", {}, curateBar(), el("p", { class: "empty" }, "No songs in your library yet. Put songs in your downloads folder and press Curate, or ask your AI app to curate them.")));
  const st = stats(lib), left = needsYou();
  const hero = el("section", { class: "hero" },
    el("div", { class: "mosaic", "aria-hidden": "true" }, shuffled(lib.filter((s) => s.cover)).slice(0, 72).map((s) => el("img", { src: coverUrl(s), alt: "", loading: "lazy" }))),
    el("div", { class: "hero-copy" },
      el("p", { class: "eyebrow" }, "Your library"),
      el("h1", { class: "hero-num" }, fmt(lib.length), el("span", {}, lib.length === 1 ? "song" : "songs")),
      el("p", { class: "hero-sub" }, `${longTime(st.secs)} of music · ${plural(st.artists.length, "artist")} · ${plural(st.genres.length, "genre")} · ${(st.bytes / 1e9).toFixed(1)} GB`),
      el("div", { class: "hero-actions" },
        el("button", { class: "btn primary", type: "button", onclick: () => playQueue(shuffled(lib).map((s) => s.id), 0, "Shuffle") }, icon("shuffle", 16), "Play something"),
        left ? el("a", { class: "btn", href: "#/check" }, icon("ears", 16), `${fmt(left)} to check`) : null)));

  const factsBox = el("div", { class: "facts" }, factCards(lib, st).map((f) => el(f.href ? "a" : "div", { class: "fact", href: f.href }, el("div", { class: "label" }, f.label), el("div", { class: "big" }, f.big), el("div", { class: "sub" }, f.sub))));
  const page = el("div", {}, curateBar(), hero, el("h2", { class: "section" }, "What stands out"), factsBox);

  if (st.peak) {
    const p = st.peak, data = [];
    for (let y = p.min; y <= p.max; y++) data.push({ x: y, y: p.by.get(y) || 0, hi: y >= p.y && y < p.y + 3 });
    const box = el("div", { class: "chart" }), noYear = lib.length - p.dated;
    page.append(el("h2", { class: "section" }, "When your music came out"), el("div", { class: "card" },
      el("p", { class: "note" }, `Songs per release year. The three busiest years in a row are highlighted.${noYear ? ` ${plural(noYear, "song")} with no year ${noYear === 1 ? "isn't" : "aren't"} shown.` : ""}`), box,
      twin(["Year", "Songs"], data.filter((d) => d.y).map((d) => [d.x, d.y]))));
    columns(box, data, { label: "Songs per release year", pick: (d) => { location.hash = `#/songs?${q2({ from: d.x, to: d.x })}`; } });
  }
  const panel = (title, rows, key) => el("div", { class: "card" }, el("h2", {}, title), ranks(rows, (name) => `#/songs?${q2({ [key]: name })}`));
  const cols = el("div", { class: "cols" }, panel("Top genres", st.genres.slice(0, 10), "genre"), panel("Top artists", st.artists.slice(0, 10), "artist"));
  if (st.labels.length) cols.append(panel("Top labels", st.labels.slice(0, 8), "label"), panel("Where the records were pressed", st.countries.slice(0, 8), "country"));
  page.append(el("h2", { class: "section" }, "What's in it"), cols);
  view.replaceChildren(page);
}

/* ---------- songs ---------- */
const AREAS = { library: "In your library", review: "Not in the library yet", inbox: "In the inbox", all: "Everything" };
function matcher(f) {
  const words = fold(f.q).split(/\s+/).filter(Boolean);
  return (s) => {
    if (f.area !== "all" && s.area !== f.area) return false;
    if (f.genre && s.genre !== f.genre) return false;
    if (f.trust && s.trust !== f.trust) return false;
    if (f.label && s.label !== f.label) return false;
    if (f.album && fold(s.album).trim() !== fold(f.album).trim()) return false;
    if (f.country && s.country !== f.country) return false;
    if (f.artist && !(s.artist || "").split(" & ").map((a) => a.trim()).includes(f.artist)) return false;
    if (f.decade === "none" && s.year) return false;
    if (f.decade && f.decade !== "none" && !(s.year && Math.floor(+s.year / 10) * 10 === +f.decade)) return false;
    if (f.from && !(s.year && +s.year >= +f.from)) return false;
    if (f.to && !(s.year && +s.year <= +f.to)) return false;
    if (words.length) {
      s._hay = s._hay || fold(`${s.artist} ${s.title} ${s.album} ${s.genre} ${s.label} ${s.file}`);
      if (!words.every((w) => s._hay.includes(w))) return false;
    }
    return true;
  };
}
function comparator({ key, dir }) {
  const num = key === "year" || key === "secs" || key === "kbps";
  const rank = { verified: 0, auto: 1, source: 2, unverified: 3, unknown: 4 };
  const val = (s) => key === "trust" ? rank[s.trust] : num ? (s[key] ? +s[key] : null) : fold(s[key]);
  return (a, b) => {
    const x = val(a), y = val(b);
    const blankX = x === null || x === "", blankY = y === null || y === "";
    if (blankX || blankY) return blankX === blankY ? fold(songName(a)).localeCompare(fold(songName(b))) : blankX ? 1 : -1; // blanks stay last
    const c = num || key === "trust" ? x - y : x.localeCompare(y);
    return (c || fold(a.title).localeCompare(fold(b.title))) * dir;
  };
}
function pageSongs(params) {
  const f = {}; for (const k of ["q", "genre", "decade", "trust", "album", "artist", "label", "country", "from", "to"]) f[k] = params.get(k) || "";
  f.area = params.get("area") || "library";
  const inScope = () => (f.area === "all" ? S.songs : S.songs.filter((s) => s.area === f.area));
  const results = el("div"), countLine = el("p", { class: "count-line" }), chips = el("div", { class: "actions" });
  const exporter = exportControls(() => [f.album, f.label, f.artist, f.genre, f.q.trim()].find(Boolean) || S.meta.library || "Library");

  const sync = () => { const qs = q2({ ...f, area: f.area === "library" ? "" : f.area }); history.replaceState(null, "", `#/songs${qs ? `?${qs}` : ""}`); };
  function update() {
    sync();
    results.replaceChildren();
    S.observers.forEach((o) => o.disconnect()); S.observers = [];
    const list = S.songs.filter(matcher(f)).sort(comparator(S.sort));
    S.list = list.map((s) => s.id);
    countLine.textContent = `${plural(list.length, "song")} · ${longTime(sum(list.map((s) => s.secs)))}`;
    exporter.counted();
    chips.replaceChildren(...[["album", "Album"], ["artist", "Artist"], ["label", "Label"], ["country", "Country"]].filter(([k]) => f[k]).map(([k, w]) => chipOff(`${w}: ${f[k]}`, () => { f[k] = ""; update(); })),
      ...(f.from ? [chipOff(f.from === f.to ? `Year: ${f.from}` : `Years: ${f.from}–${f.to}`, () => { f.from = f.to = ""; update(); })] : []));
    if (!list.length) return results.replaceChildren(el("p", { class: "empty" }, "Nothing matches these filters."));
    S.songView === "grid" ? renderTiles(results, list) : renderTable(results, list, update);
  }
  const chipOff = (text, off) => el("button", { class: "chip", type: "button", title: "Remove this filter", onclick: off }, text, " ", el("em", {}, "×"));
  const pick = (label, key, options) => el("select", { "aria-label": label, onchange: (e) => { f[key] = e.target.value; update(); } }, options.map(([v, t]) => el("option", { value: v, selected: f[key] === v }, t)));

  const decades = tally(inScope().map((s) => (s.year ? String(Math.floor(+s.year / 10) * 10) : ""))).sort((a, b) => +a[0] - +b[0]);
  const search = el("input", { type: "search", placeholder: "Search artist, title, album…", value: f.q, "aria-label": "Search", id: "song-search", oninput: (e) => { f.q = e.target.value; update(); } });
  const toggle = el("div", { class: "view-toggle", role: "group", "aria-label": "View" });
  const paintToggle = () => toggle.replaceChildren(
    el("button", { type: "button", class: S.songView === "list" ? "on" : "", "aria-label": "List", title: "List", onclick: () => { S.songView = "list"; paintToggle(); update(); } }, icon("rows", 16)),
    el("button", { type: "button", class: S.songView === "grid" ? "on" : "", "aria-label": "Covers", title: "Covers", onclick: () => { S.songView = "grid"; paintToggle(); update(); } }, icon("grid", 16)));
  paintToggle();

  view.replaceChildren(el("div", {},
    el("div", { class: "page-head" }, el("h1", {}, "Songs")),
    el("div", { class: "filters" },
      el("div", { class: "search" }, icon("search", 16), search),
      pick("Where", "area", Object.entries(AREAS)),
      pick("Genre", "genre", [["", "All genres"], ...tally(S.songs.map((s) => s.genre)).sort((a, b) => a[0].localeCompare(b[0])).map(([g, c]) => [g, `${g} (${c})`])]),
      pick("Decade", "decade", [["", "All years"], ...decades.map(([d, c]) => [d, `${d}s (${c})`]), ["none", "No year"]]),
      pick("How sure", "trust", [["", "How sure: any"], ...Object.entries(TRUST).map(([k, t]) => [k, t.label])]),
      toggle),
    chips, el("div", { class: "list-head" }, countLine, exporter.button), exporter.panel, results));
  update();
}
function renderTable(box, list, update) {
  const head = (label, key, cls) => el("th", { class: cls }, el("button", { type: "button", class: S.sort.key === key ? "on" : "", onclick: () => {
    S.sort = { key, dir: S.sort.key === key ? -S.sort.dir : 1 }; update();
  } }, `${label}${S.sort.key === key ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}`));
  const body = el("tbody");
  const holder = el("div");
  box.replaceChildren(el("table", { class: "table" },
    el("colgroup", {}, ["c-cover", "", "c-album", "c-year", "c-genre", "c-len", "c-kbps", "c-trust"].map((c) => el("col", { class: c }))),
    el("thead", {}, el("tr", {}, el("th", { class: "c-cover" }), el("th", {}, el("button", { type: "button", class: S.sort.key === "artist" ? "on" : "", onclick: () => { S.sort = { key: "artist", dir: S.sort.key === "artist" ? -S.sort.dir : 1 }; update(); } }, `Artist${S.sort.key === "artist" ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}`), " · ", el("button", { type: "button", class: S.sort.key === "title" ? "on" : "", onclick: () => { S.sort = { key: "title", dir: S.sort.key === "title" ? -S.sort.dir : 1 }; update(); } }, `Title${S.sort.key === "title" ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}`)),
      head("Album", "album", "c-album"), head("Year", "year", "c-year"), head("Genre", "genre", "c-genre"), head("Length", "secs", "c-len num"), head("kbps", "kbps", "c-kbps num"), head("How sure", "trust", "c-trust"))),
    body), holder);
  lazy(body, list, (s) => el("tr", { class: "has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
    el("td", { class: "c-cover" }, coverEl(s, () => playFrom(s.id))),
    el("td", {}, el("button", { class: "t-main", type: "button", title: s.title, onclick: (e) => { e.stopPropagation(); openDrawer(s.id); } }, s.title), el("span", { class: "t-sub", title: s.artist }, s.artist)),
    el("td", { class: "c-album", title: s.album }, s.album), el("td", { class: "c-year" }, s.year), el("td", { class: "c-genre", title: s.genre }, s.genre),
    el("td", { class: "c-len num" }, clock(s.secs)), el("td", { class: "c-kbps num" }, s.kbps || "–"), el("td", { class: "c-trust" }, trustTag(s))), holder);
}
function renderTiles(box, list) {
  const grid = el("div", { class: "grid" }), holder = el("div");
  box.replaceChildren(grid, holder);
  lazy(grid, list, (s) => el("div", { class: "tile has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
    coverEl(s, () => playFrom(s.id)), el("span", { class: "t-main", title: s.title }, s.title), el("span", { class: "t-sub", title: s.artist }, s.artist)), holder);
}

/* ---------- export: a playlist file, a spreadsheet, or copies in a folder ---------- */
let exportTimer = null, exportPaint = null;
function saveFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportWords(r) {
  return [r.copied ? `Copied ${plural(r.copied, "song")} to ${r.target}.` : `No new songs to copy to ${r.target}.`,
    r.already ? `${plural(r.already, "song was", "songs were")} already there.` : "", r.stopped ? "Stopped before the end." : ""].filter(Boolean).join(" ");
}
function exportControls(nameOf) { // works on whatever the Songs page is listing right now
  const heading = el("h2", {}), status = el("div"), folderBox = el("div", { class: "export-folder" });
  const keep = el("input", { type: "checkbox", checked: true });
  const fileButton = (label, format, ext, type) => el("button", { class: "btn small", type: "button", onclick: async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    const r = await post("/api/export/list", { ids: S.list, format });
    b.disabled = false;
    if (r.error) return toast(r.error);
    const name = `${nameOf().replace(/[\\/:*?"<>|]+/g, "-").trim() || "Library"}.${ext}`;
    saveFile(name, r.text, type);
    toast(`Saved ${name} to your browser's downloads.`);
  } }, label);
  const copy = el("button", { class: "btn primary small", type: "button", disabled: true, onclick: async () => {
    copy.disabled = true;
    const r = await post("/api/export/copy", { ids: S.list, folder: field.value(), keep: keep.checked });
    if (r.error) { toast(r.error); counted(); return; }
    store("curator-export-folder", field.value());
    S.meta.export = { running: true, stopping: false, done: 0, total: S.list.length, name: "", failed: "", result: null };
    paint();
    watchExport();
  } });
  const form = el("div", {}, heading,
    el("div", { class: "export-part" },
      el("div", { class: "note" }, "Save a list of these songs. It goes to your browser's downloads."),
      el("div", { class: "actions" }, fileButton("M3U playlist", "m3u", "m3u8", "audio/x-mpegurl"), fileButton("Spreadsheet (CSV)", "csv", "csv", "text/csv;charset=utf-8"))),
    el("div", { class: "export-part" },
      el("div", { class: "note" }, "Or copy the songs to a folder or USB drive. Your library stays as it is, and anything already in that folder is left alone."),
      folderBox,
      el("div", { class: "export-go" }, el("label", {}, keep, "Keep the genre folders"), copy)));
  const panel = el("div", { class: "card export-panel", id: "export-panel", hidden: true }, status, form);
  let field = null, building = false, wasRunning = false;
  const button = el("button", { class: "btn small", type: "button", "aria-expanded": "false", "aria-controls": "export-panel", onclick: () => { panel.hidden = !panel.hidden; paint(); } }, icon("export", 14), "Export");
  function counted() {
    const n = S.list.length;
    heading.textContent = `Export ${plural(n, "song")}`;
    copy.textContent = `Copy ${plural(n, "song")}`;
    copy.disabled = !n || !field || !field.ok;
  }
  async function buildField() {
    if (field || building) return;
    building = true;
    let picker = false;
    try { const r = await fetch("/api/settings", { cache: "no-store" }); if (r.ok) picker = !!(await r.json()).picker; } catch { picker = false; }
    field = folderField({ kind: "export", label: "Folder to copy to", picker, value: store("curator-export-folder") || "", changed: counted });
    folderBox.replaceChildren(field.node);
    if (field.value()) field.check();
    counted();
  }
  function paint() {
    const c = S.meta.export || {};
    if (wasRunning && !c.running && field) field.check(); // the folder may exist by now
    wasRunning = !!c.running;
    if (c.running) panel.hidden = false;
    form.hidden = !!c.running;
    button.setAttribute("aria-expanded", String(!panel.hidden));
    status.replaceChildren();
    if (c.running) {
      const bar = el("div");
      bar.style.width = `${c.total ? (c.done / c.total) * 100 : 0}%`;
      status.append(el("div", { class: "curate-head" },
        el("div", { class: "grow" }, el("h2", {}, `Copying ${fmt(Math.min(c.done + 1, c.total))} of ${fmt(c.total)}`), el("div", { class: "note curate-now" }, c.name || "Starting…")),
        el("button", { class: "btn small", type: "button", disabled: !!c.stopping, onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = "Stopping…"; post("/api/export/stop", {}); } }, c.stopping ? "Stopping…" : "Stop")),
      el("div", { class: "meter" }, bar));
      return;
    }
    if (!panel.hidden) buildField();
    if (c.failed || c.result) {
      const r = c.result || { problems: [], more: 0 };
      status.append(el("div", { class: "export-said" },
        c.result ? el("p", { class: "note" }, exportWords(r)) : null,
        c.failed ? el("p", { class: "note" }, c.failed) : null,
        r.problems.length ? el("ul", { class: "note" }, r.problems.map((p) => el("li", {}, p)), r.more ? el("li", {}, `and ${fmt(r.more)} more`) : null) : null));
    }
  }
  exportPaint = paint;
  paint();
  return { button, panel, counted };
}
function watchExport() {
  if (exportTimer) return;
  const tick = async () => {
    let c = null;
    try { const r = await fetch("/api/export", { cache: "no-store" }); if (r.ok) c = await r.json(); } catch { c = null; }
    if (!c) { exportTimer = null; return; } // the app has gone away: the next load picks it up again
    S.meta.export = c;
    if (exportPaint) exportPaint();
    if (c.running) { exportTimer = setTimeout(tick, 500); return; }
    exportTimer = null;
    toast(c.failed || (c.result ? exportWords(c.result) : "Copy finished."));
  };
  exportTimer = setTimeout(tick, 300);
}

/* ---------- albums and labels: the library, shelf by shelf ---------- */
function shelfCover(item, mosaic) {
  const play = () => playQueue(item.songs.map((s) => s.id), 0, item.name), label = `Play ${item.name}`;
  const faces = [], seen = new Set();
  for (const s of item.songs) if (s.cover && !seen.has(s.link || s.id)) { seen.add(s.link || s.id); faces.push(s); }
  if (!mosaic || faces.length < 4) return coverEl(faces[0] || item.songs[0], play, label);
  const c = el("div", { class: "cover four-up" }, faces.slice(0, 4).map((s) => el("img", { src: coverUrl(s), alt: "", loading: "lazy", decoding: "async" })));
  c.append(el("button", { class: "over", type: "button", title: "Play", "aria-label": label, onclick: (e) => { e.stopPropagation(); play(); } }, icon("play", 20)));
  return c;
}
const shelfTile = (item, mosaic) => el("div", { class: "tile has-play", onclick: () => { location.hash = item.href; } },
  shelfCover(item, mosaic),
  el("a", { class: "t-main", href: item.href, title: item.name, onclick: (e) => e.stopPropagation() }, item.name),
  item.lines.map((line) => el("span", { class: "t-sub", title: line }, line)));
const byTitle = (a, b) => fold(a.title).localeCompare(fold(b.title));
const yearsOf = (songs) => songs.map((s) => +s.year).filter(Boolean);
const artistsOf = (s) => (s.artist || "").split(" & ").map((a) => a.trim()).filter(Boolean);
function albumItems() {
  const byName = new Map();
  for (const s of S.lib) if (s.album) {
    const k = fold(s.album).trim();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(s);
  }
  const items = [];
  for (const group of byName.values()) { // the same title can be two different records: songs belong together if they share a record or an artist
    const parts = [];
    for (const s of group) {
      const names = artistsOf(s);
      let part = parts.find((p) => (s.link && p.links.has(s.link)) || names.some((a) => p.artists.has(a)));
      if (!part) parts.push(part = { songs: [], links: new Set(), artists: new Set() });
      part.songs.push(s);
      if (s.link) part.links.add(s.link);
      names.forEach((a) => part.artists.add(a));
    }
    for (const { songs } of parts) {
      const who = [...new Set(songs.map((s) => s.artist).filter(Boolean))], years = yearsOf(songs), year = years.length ? Math.min(...years) : 0, name = songs[0].album;
      items.push({ name, songs: songs.sort(byTitle), year, lines: [who.length === 1 ? who[0] : who.length ? "Various artists" : "", `${year ? `${year} · ` : ""}${plural(songs.length, "song")}`].filter(Boolean),
        href: `#/songs?${q2({ album: name, artist: parts.length > 1 ? artistsOf(songs[0])[0] : "" })}`, hay: fold(`${name} ${who.join(" ")} ${songs.map((s) => s.label).join(" ")}`) });
    }
  }
  return items;
}
function labelItems() {
  const byName = new Map();
  for (const s of S.lib) if (s.label) {
    if (!byName.has(s.label)) byName.set(s.label, []);
    byName.get(s.label).push(s);
  }
  return [...byName].map(([name, songs]) => {
    const years = yearsOf(songs), low = years.length ? Math.min(...years) : 0, high = years.length ? Math.max(...years) : 0, genre = (tally(songs.map((s) => s.genre))[0] || [""])[0];
    return { name, songs: songs.sort(byTitle), year: high, lines: [plural(songs.length, "song"), [low === high ? low : `${low}–${high}`, genre].filter(Boolean).join(" · ")].filter(Boolean),
      href: `#/songs?${q2({ label: name })}`, hay: fold(`${name} ${songs.map((s) => `${s.artist} ${s.genre}`).join(" ")}`) };
  });
}
function pageShelf(params, o) {
  const f = { q: params.get("q") || "", sort: params.get("sort") || "most", many: params.get("many") === "1" }, all = o.items();
  const results = el("div"), countLine = el("p", { class: "count-line" });
  const names = (a, b) => fold(a.name).localeCompare(fold(b.name));
  const sorters = { most: (a, b) => b.songs.length - a.songs.length || names(a, b), name: names, year: (a, b) => b.year - a.year || names(a, b) };
  function update() {
    const qs = q2({ q: f.q, sort: f.sort === "most" ? "" : f.sort, many: f.many ? "1" : "" });
    history.replaceState(null, "", `#/${o.page}${qs ? `?${qs}` : ""}`);
    S.observers.forEach((x) => x.disconnect()); S.observers = [];
    const words = fold(f.q).split(/\s+/).filter(Boolean);
    const list = all.filter((x) => (!f.many || x.songs.length > 1) && words.every((w) => x.hay.includes(w))).sort(sorters[f.sort] || sorters.most);
    countLine.textContent = o.count(list.length);
    if (!list.length) return results.replaceChildren(el("p", { class: "empty" }, all.length ? "Nothing matches that." : o.none));
    const grid = el("div", { class: "grid" }), holder = el("div");
    results.replaceChildren(grid, holder);
    lazy(grid, list, (x) => shelfTile(x, o.mosaic), holder);
  }
  const search = el("input", { type: "search", placeholder: o.placeholder, value: f.q, "aria-label": "Search", id: "song-search", oninput: (e) => { f.q = e.target.value; update(); } });
  const order = el("select", { "aria-label": "Sort", onchange: (e) => { f.sort = e.target.value; update(); } }, [["most", "Most songs"], ["name", "A to Z"], ["year", "Newest first"]].map(([v, t]) => el("option", { value: v, selected: f.sort === v }, t)));
  view.replaceChildren(el("div", {},
    el("div", { class: "page-head" }, el("h1", {}, o.title)),
    el("div", { class: "filters" }, el("div", { class: "search" }, icon("search", 16), search), order,
      o.many ? el("label", { class: "filter-check" }, el("input", { type: "checkbox", checked: f.many, onchange: (e) => { f.many = e.target.checked; update(); } }), o.many) : null),
    countLine, results));
  update();
}
function pageAlbums(params) {
  const loose = S.lib.filter((s) => !s.album).length;
  pageShelf(params, { page: "albums", title: "Albums", items: albumItems, placeholder: "Search albums and artists…", many: "Only ones with 2 or more songs", none: "No albums yet. Songs from a single have no album.",
    count: (n) => `${plural(n, "album or EP", "albums and EPs")}${loose ? ` · ${plural(loose, "single")} not shown` : ""}` });
}
function pageLabels(params) {
  const loose = S.lib.filter((s) => !s.label).length;
  pageShelf(params, { page: "labels", title: "Labels", items: labelItems, mosaic: true, placeholder: "Search labels, artists and genres…", none: "No labels yet. They come from the Discogs records of your songs.",
    count: (n) => `${plural(n, "label")}${loose ? ` · ${plural(loose, "song")} with no label on file` : ""}` });
}

/* ---------- decisions ---------- */
async function decide(song, kind, action, extra = {}) {
  let r;
  try {
    r = await fetch("/api/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: song.id, kind, action, ...extra }) });
  } catch { r = null; }
  if (!r) { toast("Couldn't save that. Is the server still running?"); return false; }
  if (!r.ok) { const data = await r.json().catch(() => ({})); toast(data.error || "Couldn't save that."); return false; }
  const key = `${kind}:${song.key}`;
  if (action === null) delete S.decisions[key];
  else S.decisions[key] = { kind, action, genre: extra.genre || "", note: extra.note || "" };
  badge();
  if (cards.has(key)) cards.get(key)(false); // the same question can be on the page and in the panel: both show the answer
  if (drawerSong === song.id) paintPanel();
  return true;
}
function decidedText(d) {
  return { keep: d.kind === "playlist" ? "Doesn't fit" : d.kind === "waiting" ? "Left for now" : d.kind === "spotify" ? "Not the same" : "Keep it as it is", genre: `Change the genre to ${d.genre}`, identify: `You said: ${d.note}`, drop: d.note === "On Spotify" ? "It's on Spotify, so your file isn't needed" : "Not worth keeping", stream: `On Spotify, in ${lines(d.note).join(", ")}`, pick: `It's ${(d.note || "").split("|").slice(1).join("|")}. Press Curate to add it.`,
    recheck: `Look at it again${d.note ? `: ${d.note}` : ""}`, better: d.kind === "better" ? "Use the found version" : "Find a better copy", cover: "Find a cover", add: `Add it to ${lines(d.note).join(", ")}`, added: `Added to ${lines(d.note).join(", ")}` }[d.action] || d.action;
}
const alreadyIn = (c) => (c.also && c.also.length ? el("div", { class: "item-also" }, `Already in ${c.also.join(", ")}`) : null);
const spotifyLine = (c) => (c.kind === "spotify" && c.link ? el("div", { class: "item-also" }, el("a", { href: c.link, target: "_blank", rel: "noreferrer noopener" }, "Open it on Spotify"), " to compare") : null);
const betterLine = (c) => (c.kind === "better" && c.link ? el("div", { class: "item-also better-open" }, el("a", { class: "btn small", href: c.link, target: "_blank", rel: "noreferrer noopener" }, icon("link", 14), "Open it to compare"), el("span", {}, c.checked ? "Checked: it's the same recording as yours" : "A guess: nobody has compared it with your file")) : null);
function playlistForm(names, chosen, already, label, save, cancel) {
  const search = el("input", { type: "search", placeholder: "Find a playlist", "aria-label": "Find a playlist" }), list = el("div", { class: "pick-list" });
  const paintList = () => list.replaceChildren(...names.filter((n) => fold(n).includes(fold(search.value))).map((n) => (already.has(n)
    ? el("label", { class: "pick off" }, el("input", { type: "checkbox", checked: true, disabled: true }), n, el("em", {}, "already in"))
    : el("label", { class: "pick" }, el("input", { type: "checkbox", checked: chosen.has(n), onchange: (e) => { if (e.target.checked) chosen.add(n); else chosen.delete(n); } }), n))));
  search.addEventListener("input", paintList);
  paintList();
  return { search, form: el("div", { class: "pick-form" }, search, list, el("div", { class: "actions" },
    el("button", { class: "btn primary small", type: "button", onclick: (e) => (chosen.size ? save(e.currentTarget) : search.focus()) }, label),
    el("button", { class: "linkish", type: "button", onclick: cancel }, "Cancel"))) };
}
const recordLine = (c) => (c.record ? el("div", { class: "item-also" }, "Closest record: ", el("a", { href: c.record.discogs, target: "_blank", rel: "noreferrer noopener" }, c.record.title || "on Discogs"), c.record.labels ? ` (${c.record.labels})` : "") : null);
function versionNote(o) { // how this version on the record compares with your file
  if (o.gap === null || o.gap === undefined) return o.dur || null;
  const off = Math.abs(o.gap);
  return off <= 6 ? `${o.dur}, same length as yours` : `${o.dur}, yours is ${off < 90 ? `${off} s` : clock(off)} ${o.gap > 0 ? "longer" : "shorter"}`;
}
function controls(song, check, after) {
  const key = `${check.kind}:${song.key}`, d = S.decisions[key];
  if (d && check.kind !== "flag") {
    return el("div", { class: "decided" }, icon("tick", 15), el("span", {}, decidedText(d)),
      el("button", { class: "linkish", type: "button", onclick: async () => { if (await decide(song, check.kind, null)) after(false); } }, "Undo"));
  }
  const row = el("div", { class: "actions" });
  const act = (action, extra) => async () => { if (await decide(song, check.kind, action, extra)) after(true); };
  const chip = (label, fn, note) => el("button", { class: "chip", type: "button", onclick: fn }, label, note ? el("em", {}, note) : null);
  const ask = (placeholder, action, field, list) => () => {
    const input = el("input", { type: "text", placeholder, "aria-label": placeholder, list: list || null });
    const save = async () => { const v = input.value.trim(); if (!v) return input.focus(); await act(action, { [field]: v })(); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    row.replaceChildren(el("div", { class: "inline-form" }, input, el("button", { class: "btn small", type: "button", onclick: save }, "Save")));
    input.focus();
  };
  switch (check.kind) {
    case "genre": {
      const opts = check.options.length ? check.options : [song.genre].filter(Boolean);
      opts.forEach((g) => row.append(chip(g, g === song.genre ? act("keep") : act("genre", { genre: g }), g === song.genre ? "now" : null)));
      row.append(chip("Other…", ask("Which genre?", "genre", "genre", "genres")));
      break;
    }
    case "waiting":
      (check.options || []).forEach((o) => row.append(chip(`It's ${o.pos ? `${o.pos} ` : ""}${o.title}`, act("pick", { note: o.id }), versionNote(o))));
      row.append(chip("I know what this is…", ask("Artist - Title", "identify", "note")), chip("Not worth keeping", act("drop")), chip("Leave it for now", act("keep")));
      break;
    case "quality":
      row.append(chip("Fine as it is", act("keep")), chip("Find a better copy", act("better")));
      break;
    case "better":
      row.append(chip("Fine as it is", act("keep")), chip("Use found version", act("better", { note: check.link })));
      break;
    case "cover":
      row.append(chip("Leave it empty", act("keep")), chip("Find a cover", act("cover")));
      break;
    case "playlist": {
      const chosen = new Set(), already = new Set(check.also || []);
      const done = el("button", { class: "btn primary small", type: "button", disabled: true, onclick: () => { if (chosen.size) act("add", { note: [...chosen].join("\n") })(); } }, "Done");
      (check.fits || []).forEach(({ name, why }) => { // click the ones that fit, then Done
        const c = chip(name, () => {
          const on = !chosen.has(name);
          if (on) chosen.add(name); else chosen.delete(name);
          c.classList.toggle("on", on);
          c.setAttribute("aria-pressed", String(on));
          done.disabled = !chosen.size;
        });
        c.title = why;
        c.setAttribute("aria-pressed", "false");
        row.append(c);
      });
      row.append(done, chip("None fit", act("keep")), chip("Other playlists…", () => {
        const back = () => { if (cards.has(key)) cards.get(key)(false); if (drawerSong === song.id) paintPanel(); };
        const { form, search } = playlistForm(S.meta.playlists || [], chosen, already, "Add to these", () => act("add", { note: [...chosen].join("\n") })(), back);
        row.replaceChildren(form);
        search.focus();
      }));
      break;
    }
    case "spotify":
      row.append(chip("It's the same…", () => {
        const chosen = new Set(), back = () => { if (cards.has(key)) cards.get(key)(false); if (drawerSong === song.id) paintPanel(); };
        const { form, search } = playlistForm((S.meta.spotify || {}).playlists || [], chosen, new Set(), "Add it to these", async (button) => {
          button.disabled = true;
          button.textContent = "Adding…";
          const r = await post("/api/spotify/stream", { id: song.id, playlists: [...chosen] });
          if (r.error) { toast(r.error); button.disabled = false; button.textContent = "Add it to these"; return; }
          if (await safeLoad()) { route(); toast(r.message || "Added."); }
        }, back);
        row.replaceChildren(form);
        search.focus();
      }), chip("Not the same", act("keep")));
      break;
    case "flag":
      row.append(chip("Done with this", async () => { if (await decide(song, "flag", null)) { song.checks = song.checks.filter((c) => c.kind !== "flag"); badge(); after(true); } }));
      break;
    default:
      row.append(chip("Fine as it is", act("keep")), chip("Look at it again", ask("What's off? (optional detail helps)", "recheck", "note")));
  }
  return row;
}

/* ---------- to check ---------- */
function pageCheck(params) {
  const kind = params.get("kind") || "needs", showDone = params.get("done") === "1", items = allItems();
  const inKind = (it) => (kind === "needs" ? NEEDS.has(it.c.kind) : kind === "all" ? true : it.c.kind === kind);
  const link = (k, done) => `#/check?${q2({ kind: k === "needs" ? "" : k, done: done ? "1" : "" })}`;
  const list = items.filter(inKind).filter((it) => showDone || !isDone(it))
    .sort((a, b) => ORDER.indexOf(a.c.kind) - ORDER.indexOf(b.c.kind) || fold(songName(a.s)).localeCompare(fold(songName(b.s))));
  const left = (f) => items.filter(f).filter((it) => !isDone(it)).length;
  const pill = (k, label, f) => { const n = left(f); return n || k === kind ? el("a", { class: `pill${k === kind ? " on" : ""}`, href: link(k, showDone) }, label, el("b", {}, fmt(n))) : null; };

  const counter = el("span", { class: "sub" }), meterFill = el("div");
  const paintMeter = () => {
    const scope = items.filter(inKind).filter((it) => it.c.kind !== "flag"), done = scope.filter(isDone).length;
    counter.textContent = scope.length ? `${fmt(done)} of ${fmt(scope.length)} decided` : "";
    meterFill.style.width = scope.length ? `${(done / scope.length) * 100}%` : "0";
  };
  cards.clear();
  const queue = () => [...new Set(list.filter((it) => !isDone(it)).map((it) => it.s.id))];
  const box = el("div", { class: "check-list" }), holder = el("div");
  view.replaceChildren(el("div", {},
    el("div", { class: "page-head" }, el("h1", {}, "To check"), counter),
    el("div", { class: "meter" }, meterFill),
    el("div", { class: "pills" }, pill("needs", "Needs you", (it) => NEEDS.has(it.c.kind)), ORDER.map((k) => pill(k, KINDS[k].label, (it) => it.c.kind === k))),
    el("div", { class: "check-tools" },
      list.length ? el("button", { class: "btn small", type: "button", onclick: () => { S.listen = true; const q = queue(); if (q.length) playQueue(q, 0, "To check"); } }, icon("play", 14), "Listen through these") : null,
      el("label", {}, el("input", { type: "checkbox", checked: showDone, onchange: (e) => { location.hash = link(kind, e.target.checked); } }), "Show what's decided")),
    list.length ? box : el("p", { class: "empty" }, "Nothing left to check here."), holder,
    el("p", { class: "hintbar" }, "Your answers are saved in ", el("code", {}, S.meta.decisions_file || "decisions.json"), ". Nothing in your music changes until you press Curate, run ", el("code", {}, "curator apply"), ", or your AI app does it.")));
  paintMeter();
  lazy(box, list, (it) => itemCard(it, paintMeter), holder);
}
const cards = new Map();
function itemCard(it, paintMeter) {
  const card = el("div", { class: "item has-play", dataset: { song: it.s.id } });
  const paint = (advance) => {
    const k = KINDS[it.c.kind];
    card.replaceChildren(coverEl(it.s, () => { S.listen = false; playQueue([it.s.id], 0, "To check"); }),
      el("div", { class: "item-body" },
        el("button", { class: "item-title", type: "button", onclick: () => openDrawer(it.s.id) }, songName(it.s) || it.s.file),
        el("div", { class: "item-kind" }, it.s.genre ? `${k.one || k.label} · filed under ${it.s.genre}${it.s.year ? `, ${it.s.year}` : ""}` : k.one || k.label),
        el("div", { class: "item-why" }, it.c.why), alreadyIn(it.c), recordLine(it.c), spotifyLine(it.c), betterLine(it.c),
        controls(it.s, it.c, paint)));
    if (paintMeter) paintMeter();
    if (advance && S.listen && current() && current().id === it.s.id) step(1);
  };
  cards.set(it.key, paint);
  paint(false);
  return card;
}

/* ---------- to add: playlist answers waiting to be dragged in ---------- */
async function markAdded(s, name, added) {
  const d = S.decisions[`playlist:${s.key}`];
  const waiting = d && d.action === "add" ? lines(d.note) : [];
  const left = added ? waiting.filter((n) => n !== name) : [...new Set([...waiting, name])];
  return decide(s, "playlist", left.length ? "add" : "added", { note: left.length ? left.join("\n") : name });
}
function addRow(s, name, paintCounts) {
  const action = el("div", { class: "add-action" });
  const paint = (added) => {
    action.replaceChildren(...(added
      ? [el("span", { class: "state" }, icon("tick", 14, "good-i"), "Added"), el("button", { class: "linkish", type: "button", onclick: async (e) => { e.stopPropagation(); if (await markAdded(s, name, false)) { paint(false); paintCounts(name, 1); } } }, "Undo")]
      : [el("button", { class: "chip", type: "button", onclick: async (e) => { e.stopPropagation(); if (await markAdded(s, name, true)) { paint(true); paintCounts(name, -1); } } }, "Added")]));
  };
  paint(false);
  return el("div", { class: "row has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
    coverEl(s, () => playQueue([s.id], 0, "To add")),
    el("div", { class: "grow" }, el("div", { class: "now", title: s.file }, songName(s) || s.file), el("div", { class: "was" }, [S.meta.library, s.folder].filter(Boolean).join(" / "))),
    action);
}
function removeCard(r) {
  return el("section", { class: "card" }, el("div", { class: "add-head" }, el("h2", {}, r.playlist), el("span", { class: "sub" }, `${fmt(r.count)} to remove`)),
    el("p", { class: "note" }, r.at_end ? (r.count === 1 ? "It's the last one in the playlist." : `They're the last ${fmt(r.count)} in the playlist.`) : "They're spread through the playlist, and the numbers below match the # column in Spotify. Move all to the bottom gathers them so you can select them in one go."),
    twin(["#", "Song", "Why"], r.songs.map((x) => [x.pos, x.song, x.why]), "Show which"));
}
function pageAdd() {
  const groups = new Map();
  for (const [key, d] of waitingToAdd()) {
    const file = key.slice(key.indexOf(":") + 1), s = S.lib.find((x) => x.key === file);
    if (s) lines(d.note).forEach((n) => groups.set(n, [...(groups.get(n) || []), s]));
  }
  const names = [...groups.keys()].sort((a, b) => fold(a).localeCompare(fold(b))), left = new Map(names.map((n) => [n, groups.get(n).length]));
  const counts = new Map(names.map((n) => [n, el("span", { class: "sub" })])), total = el("span", { class: "sub" });
  const paintCounts = (name, change) => {
    if (name) left.set(name, left.get(name) + change);
    counts.forEach((c, n) => { c.textContent = left.get(n) ? `${fmt(left.get(n))} to add` : "All added"; });
    const sum = [...left.values()].reduce((a, b) => a + b, 0);
    total.textContent = sum ? plural(sum, "song") + " left to add" : "All added";
  };
  paintCounts();
  const sp = S.meta.spotify || {}, shown = (iso) => (iso.slice(0, 10) === new Date().toLocaleDateString("sv") ? iso.slice(11, 16) : iso.slice(0, 16).replace("T", " "));
  const said = el("span", { class: "sub" }, sp.wait_until ? `Spotify asked to wait until ${shown(sp.wait_until)}` : sp.checked ? `Last checked ${shown(sp.checked)}` : "");
  const checking = el("span", {}, "Check Spotify");
  const checker = sp.ready ? el("button", { class: "btn small", type: "button", disabled: !!sp.wait_until, onclick: async () => {
    checker.disabled = true;
    checking.textContent = "Checking…";
    said.textContent = "If a Spotify tab opens, approve it there.";
    const r = await post("/api/spotify/check", {});
    if (await safeLoad()) { route(); toast(r.message || r.error || "Checked."); }
  } }, icon("refresh", 14), checking) : null;
  const removing = (sp.to_remove || []).filter((r) => r.count), removeTotal = sum(removing.map((r) => r.count));
  const odd = (sp.to_remove || []).flatMap((r) => (r.odd || []).map((x) => [r.playlist, x.pos, x.song]));
  const moving = el("span", {}, "Move all to the bottom"), movingSaid = el("span", { class: "sub" }, "Asks Spotify for permission to reorder");
  const mover = sp.ready && removing.some((r) => !r.at_end) ? el("button", { class: "btn small", type: "button", disabled: !!sp.wait_until, onclick: async () => {
    mover.disabled = true;
    if (checker) checker.disabled = true;
    moving.textContent = "Moving…";
    movingSaid.textContent = "If a Spotify tab opens, approve it there.";
    const r = await post("/api/spotify/move", {});
    if (await safeLoad()) { route(); toast(r.message || r.error || "Done."); }
  } }, moving) : null;
  view.replaceChildren(el("div", {},
    el("div", { class: "page-head add-page-head" }, el("h1", {}, "Playlists"), checker ? el("div", { class: "add-check" }, said, checker) : null),
    el("div", { class: "add-head add-part" }, el("h2", {}, "To add"), names.length ? total : null),
    names.length ? el("p", { class: "lead add-help" }, sp.ready
      ? "Spotify doesn't let apps add local files, so these are for you to drag in. In Spotify, open Local Files, find the song and drag it onto the playlist. Then click Added, or Check Spotify to confirm them all."
      : "Spotify doesn't let apps add local files, so these are for you to drag in. In Spotify, open Local Files, find the song and drag it onto the playlist, then click Added here.") : null,
    names.length ? el("div", { class: "stack" }, names.map((n) => el("section", { class: "card" }, el("div", { class: "add-head" }, el("h2", {}, n), counts.get(n)),
      el("div", { class: "rows" }, groups.get(n).sort((a, b) => fold(songName(a)).localeCompare(fold(songName(b)))).map((s) => addRow(s, n, paintCounts))))))
      : el("p", { class: "empty" }, "Nothing to add. Songs you say fit a playlist show up here."),
    removeTotal || sp.ready ? [
      el("div", { class: "add-head add-part" }, el("h2", {}, "To remove"), removeTotal ? el("span", { class: "sub" }, `${plural(removeTotal, "entry", "entries")} in ${plural(removing.length, "playlist")}`) : null, mover ? el("div", { class: "add-check" }, movingSaid, mover) : null),
      removeTotal ? el("p", { class: "lead add-help" }, "No file in your folders matches these, so Spotify can't play them, or they're second copies of a song. Spotify doesn't let apps remove local files, so these are for you: click the first, Shift+click the last, right-click and choose Remove from this playlist. If one of them still plays, leave it. Check Spotify again to update this list.") : el("p", { class: "empty" }, sp.checked ? "Nothing to remove. Every local song in your playlists has a file behind it." : "Press Check Spotify, at the top of this page, to see what's left to remove from your playlists."),
      removeTotal ? el("div", { class: "stack" }, removing.map(removeCard)) : null,
      odd.length ? el("section", { class: "card add-odd" }, el("div", { class: "add-head" }, el("h2", {}, "Worth a look"), el("span", { class: "sub" }, plural(odd.length, "entry", "entries"))),
        el("p", { class: "note" }, "These match one of your files by name, but Spotify remembers a different length, usually because the file changed after Spotify last read it. If they play, they're fine. If one is greyed out, remove it and add the song again."),
        twin(["Playlist", "#", "Song"], odd, "Show which")) : null,
    ] : null));
}

/* ---------- curate: what the app does with no AI ---------- */
let curateTimer = null;
const freshSongs = () => S.songs.filter((s) => s.area === "inbox" && !s.done && !s.looked && !S.decisions[`waiting:${s.key}`]).length;
const answersToRun = () => Object.entries(S.decisions).filter(([k, d]) => k.startsWith("waiting:inbox/") && /\.mp3$/i.test(k) && S.songs.some((s) => `waiting:${s.key}` === k && !s.done) && (d.action === "pick" || (d.action === "identify" && /\s[-–—]\s/.test(d.note || "")))).length;
function lastRunWords(r) {
  return `${r.stopped ? "Stopped early. " : ""}Added ${plural(r.added, "song")}${r.waiting ? `, ${fmt(r.waiting)} waiting for you` : ""}.`;
}
function paintCurate(box) {
  const c = S.meta.curate || {}, fresh = freshSongs(), answers = answersToRun(), todo = fresh + answers;
  if (c.running) {
    const fill = el("div");
    fill.style.width = c.total ? `${Math.round((c.done / c.total) * 100)}%` : "0";
    box.hidden = false;
    box.replaceChildren(
      el("div", { class: "curate-head" },
        el("div", { class: "grow" },
          el("h2", {}, c.total ? `Curating song ${fmt(Math.min(c.done + 1, c.total))} of ${fmt(c.total)}` : c.step || "Curating"),
          el("div", { class: "note curate-now" }, c.total ? c.name : "This can take a few minutes: Discogs answers about once a second.")),
        el("button", { class: "btn small", type: "button", disabled: !!c.stopping, onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = "Stopping…"; post("/api/curate/stop", {}); } }, c.stopping ? "Stopping…" : "Stop")),
      el("div", { class: "meter" }, fill));
    return;
  }
  const last = box.dataset.always ? c.result : null;
  box.hidden = !todo && !last && !c.failed;
  if (box.hidden) { box.replaceChildren(); return; }
  const words = [fresh ? plural(fresh, "new song") : "", answers ? plural(answers, "answer") : ""].filter(Boolean).join(" and ");
  const blocked = todo && c.problem;
  box.replaceChildren(...[
    el("div", { class: "curate-head" },
      el("div", { class: "grow" },
        el("h2", {}, todo ? `${words} to curate` : "Curate"),
        el("div", { class: "note" }, blocked ? c.problem : todo ? "Looks each song up on Discogs and adds the ones it's sure of. The rest wait for you on To check. Your originals stay as they are." : "Nothing new in your downloads.")),
      blocked ? (/DISCOGS_TOKEN/.test(c.problem) ? el("a", { class: "btn small", href: "https://www.discogs.com/settings/developers", target: "_blank", rel: "noreferrer noopener" }, icon("link", 14), "Get a token") : null)
        : todo ? el("button", { class: "btn primary", type: "button", onclick: startCurate }, "Curate") : null),
    c.failed ? el("p", { class: "note curate-said" }, c.failed) : null,
    last ? el("p", { class: "note curate-said" }, lastRunWords(last), last.waiting ? [" ", el("a", { href: "#/check" }, "See what's waiting")] : null) : null,
  ].filter(Boolean));
}
function curateBar(always) {
  if (!S.meta.curate) return null;
  const box = el("div", { class: "card curate-bar", id: "curate-bar", dataset: { always: always ? "1" : "" } });
  paintCurate(box);
  return box;
}
function repaintCurate() { const box = $("#curate-bar"); if (box) paintCurate(box); }
async function startCurate() {
  const r = await post("/api/curate", {});
  if (r.error) return toast(r.error);
  S.meta.curate = { ...S.meta.curate, running: true, step: "Starting", done: 0, total: 0, name: "", failed: "", result: null };
  repaintCurate();
  watchCurate();
}
function watchCurate() {
  if (curateTimer) return;
  const tick = async () => {
    let c = null;
    try { const r = await fetch("/api/curate", { cache: "no-store" }); if (r.ok) c = await r.json(); } catch { c = null; }
    if (!c) { curateTimer = null; return; } // the app has gone away: the next load picks it up again
    S.meta.curate = c;
    repaintCurate();
    if (c.running) { curateTimer = setTimeout(tick, 900); return; }
    curateTimer = null;
    if (await safeLoad()) route();
    toast(c.failed || (c.result ? lastRunWords(c.result) : "Curate finished."));
  };
  curateTimer = setTimeout(tick, 400);
}

/* ---------- progress ---------- */
const WHY_WAITING = [ // the reasons Curate and the lookup give, in the groups the chart shows
  [/wasn't looked up/i, "Mixes, nightcore and the like"], [/longer|shorter/i, "Length doesn't match"], [/file says|only lists/i, "Mix name doesn't match"],
  [/versions on the record/i, "Several versions"], [/but not this track/i, "Artist found, not this song"], [/not found on discogs/i, "Not on Discogs"],
  [/already in your library/i, "Already in your library"], [/only mp3/i, "Not an MP3"], [/discogs (couldn't|answered)/i, "Couldn't reach Discogs"],
];
const STATES = [[/^ok$/, "Written", "tick", "good-i"], [/^removed/, "Removed", "dash", "mute-i"], [/^check/, "Needs a look", "warn", "warn-i"], [/^skipped/, "Skipped", "dash", "mute-i"], [/^error/, "Failed", "x", "bad-i"]];
function stateTag(status) {
  const hit = STATES.find(([re]) => re.test(status)) || [null, status, "dash", "mute-i"];
  return el("span", { class: "state", title: status }, icon(hit[2], 14, hit[3]), hit[1]);
}
function whenLabel(t, unit, short) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [date, hour] = t.split("T"), [y, m, d] = date.split("-");
  if (unit === "hour") return short ? `${hour}:00` : `${months[+m - 1]} ${+d}, ${hour}:00`;
  if (unit === "month") return `${months[+m - 1]} ${y}`;
  return `${months[+m - 1]} ${+d}`;
}
function pageProgress() {
  const lib = S.lib, inbox = S.songs.filter((s) => s.area === "inbox" && !s.done), review = S.songs.filter((s) => s.area === "review"), P_ = S.progress;
  const count = (t) => lib.filter((s) => s.trust === t).length, left = needsYou(), verified = count("verified");
  const kpi = (label, value, sub, href) => el(href ? "a" : "div", { class: "kpi", href }, el("div", { class: "label" }, label), el("div", { class: "value" }, fmt(value)), el("div", { class: "sub" }, sub));
  const fresh = freshSongs();
  const page = el("div", {}, el("div", { class: "page-head" }, el("h1", {}, "Progress")), curateBar(true),
    el("div", { class: "kpis" },
      kpi("In your library", lib.length, lib.length ? `${Math.round((verified / lib.length) * 100)}% verified${count("auto") ? `, ${fmt(count("auto"))} auto-matched` : ""}` : "", "#/songs"),
      kpi("Waiting in the inbox", inbox.length, !inbox.length ? "nothing new" : fresh ? `${fmt(fresh)} not looked at yet` : "all looked at"),
      kpi("Not in the library yet", review.length, "couldn't be verified", "#/songs?area=review"),
      kpi("Left to check", left, left ? "need your ears" : "all done", "#/check")));

  const parts = Object.entries(TRUST).map(([k, t]) => ({ name: t.label, long: t.long, n: count(k), cls: t.cls })).filter((p) => p.n);
  const total = sum(parts.map((p) => p.n));
  if (total) {
    const bar = el("div", { class: "seg", role: "group", "aria-label": parts.map((p) => `${p.name}: ${p.n}`).join(", ") }, parts.map((p) => {
      const share = (p.n / total) * 100;
      const b = el("div", { class: `seg-part ${p.cls}`, tabindex: 0, "aria-label": `${p.name}: ${p.n} (${Math.round(share)}%)` }, share >= 7 ? `${Math.round(share)}%` : "");
      b.style.flexGrow = p.n; b.style.flexBasis = "0";
      hoverable(b, plural(p.n, "song"), p.name);
      return b;
    }));
    page.append(el("div", { class: "card" }, el("h2", {}, "How sure each song is"), bar,
      el("div", { class: "legend" }, parts.map((p) => el("span", { title: p.long }, el("i", { class: `swatch ${p.cls}` }), p.name))),
      twin(["How sure", "Songs", "Share"], parts.map((p) => [p.name, p.n, `${Math.round((p.n / total) * 100)}%`]))));
  }
  const draw = [], unitName = P_.unit[0] ? P_.unit[0].toUpperCase() + P_.unit.slice(1) : "";
  const over = el("div", { class: "cols" });
  if ((P_.timeline || []).length > 1) {
    const box = el("div", { class: "chart" }), perBox = el("div", { class: "chart" }), lab = (t, short) => whenLabel(t, P_.unit, short);
    over.append(el("div", { class: "card" }, el("h2", {}, "Library growth"), el("p", { class: "note" }, `Songs in the library, per ${P_.unit}.`), box,
      twin([unitName, "Added", "Total"], P_.timeline.map((p) => [lab(p.t), p.added, p.total]))),
    el("div", { class: "card" }, el("h2", {}, `Songs added per ${P_.unit}`), el("p", { class: "note" }, "When new songs went in."), perBox,
      twin([unitName, "Added"], P_.timeline.map((p) => [lab(p.t), p.added]))));
    draw.push(() => growth(box, P_.timeline, lab), () => columns(perBox, P_.timeline.map((p) => ({ x: lab(p.t), tick: lab(p.t, true), y: p.added })), { label: `Songs added per ${P_.unit}`, ticks: 90 }));
  }
  const health = el("div", { class: "cols" });
  const open = allItems().filter((it) => !isDone(it)), byKind = ORDER.map((k) => [KINDS[k].label, open.filter((it) => it.c.kind === k).length, k]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  if (byKind.length) {
    const kindOf = new Map(byKind.map(([label, , k]) => [label, k]));
    health.append(el("div", { class: "card" }, el("h2", {}, "What's left to check"), el("p", { class: "note" }, "Click one to go through it."),
      el("div", { class: "wide-ranks" }, ranks(byKind, (label) => `#/check?${q2({ kind: kindOf.get(label) })}`))));
  }
  const rated = lib.filter((s) => s.kbps);
  if (rated.length) {
    const qualityBox = el("div", { class: "chart" }), low = 128; // the page's line for "a better copy might exist"
    const quality = [["Under 128", 0, low], ["128 to 191", low, 192], ["192 to 255", 192, 256], ["256 to 319", 256, 320], ["320", 320, Infinity]]
      .map(([tick, from, to]) => ({ x: `${tick} kbps`, tick, y: rated.filter((s) => s.kbps >= from && s.kbps < to).length, hi: to === low }));
    health.append(el("div", { class: "card" }, el("h2", {}, "Sound quality"), el("p", { class: "note" }, "Songs by bitrate, in kbps. Highlighted: low enough that a better copy is worth looking for."), qualityBox,
      twin(["Bitrate (kbps)", "Songs"], quality.map((d) => [d.tick, d.y]))));
    draw.push(() => columns(qualityBox, quality, { label: "Songs by bitrate", ticks: 66, pick: () => { location.hash = "#/check?kind=quality"; }, only: (d) => d.hi && d.y }));
  }
  const waiting = el("div", { class: "cols" });
  if (inbox.length) {
    const why = tally(inbox.map((s) => { const c = s.checks.find((x) => x.kind === "waiting"); return c ? (WHY_WAITING.find(([re]) => re.test(c.why)) || [0, "Other reasons"])[1] : "Not looked at yet"; }));
    waiting.append(el("div", { class: "card" }, el("h2", {}, "Waiting in the inbox"),
      el("div", { class: "rows scrolled" }, inbox.sort((a, b) => fold(a.file).localeCompare(fold(b.file))).map((s) => el("div", { class: "row has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
        coverEl(s, () => playQueue([s.id], 0, "Inbox")),
        el("div", { class: "grow" }, el("div", { class: "now", title: s.file }, s.file), el("div", { class: "was" }, s.checks.length ? s.checks[0].why : s.where)),
        el("span", { class: "time" }, clock(s.secs)))))),
    el("div", { class: "card" }, el("h2", {}, "Why they're waiting"), el("p", { class: "note" }, "Curate looks up new songs. The rest are yours to settle by ear."),
      el("div", { class: "wide-ranks" }, ranks(why, () => "#/check?kind=waiting")),
      why.some(([name]) => name !== "Not looked at yet") ? el("div", { class: "actions" }, el("a", { class: "btn small", href: "#/check?kind=waiting" }, icon("ears", 14), "Settle these on To check")) : null));
  }
  page.append(...[over, health, waiting].filter((row) => row.children.length));
  const recent = P_.recent || [];
  if (recent.length) {
    page.append(el("h2", { class: "section" }, "Latest changes"), el("div", { class: "card" }, el("div", { class: "rows" }, recent.map((r) => el("div", { class: "row" },
      el("span", { class: "when" }, r.when ? whenLabel(r.when.slice(0, 13), "hour") : ""),
      el("div", { class: "grow" }, el("div", { class: "now", title: r.now }, r.now.replace(/\.[^.]+$/, "")), r.was && r.was.replace(/\.[^.]+$/, "") !== r.now.replace(/\.[^.]+$/, "") ? el("div", { class: "was", title: r.was }, `was ${r.was.replace(/\.[^.]+$/, "")}`) : null),
      stateTag(r.status))))));
  }
  view.replaceChildren(page);
  draw.forEach((chart) => chart());
}

/* ---------- choosing folders: first run and settings ---------- */
async function post(path, body) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { error: data.error || "That didn't work.", field: data.field };
  } catch {
    return { error: "Couldn't reach the app. Is it still running?" };
  }
}
const TONE_ICON = { good: "tick", warn: "warn", bad: "x" };
function folderField(o) {
  const input = el("input", { type: "text", value: o.value || "", placeholder: "Choose a folder, or paste its path", "aria-label": o.label, spellcheck: "false", autocomplete: "off" });
  const status = el("div", { class: "folder-status", role: "status" });
  const field = { input, ok: false, value: () => input.value.trim() };
  let timer, turn = 0;
  field.check = async () => {
    const mine = ++turn;
    field.ok = false;
    const r = await post("/api/settings/check", { kind: o.kind, path: input.value, library: o.library ? o.library() : "" });
    if (mine !== turn) return;
    const tone = r.error ? "bad" : r.tone;
    field.ok = !r.error && !!r.ok;
    status.className = `folder-status st-${tone}`;
    status.replaceChildren(...(TONE_ICON[tone] ? [icon(TONE_ICON[tone], 14)] : []), r.error || r.message || "");
    o.changed();
  };
  input.addEventListener("input", () => {
    field.ok = false;
    clearTimeout(timer);
    timer = setTimeout(field.check, 220);
    o.changed();
    if (o.kind === "library") o.again();
  });
  const pick = o.picker ? el("button", { class: "btn", type: "button", onclick: async () => {
    const label = pick.textContent;
    pick.disabled = true;
    pick.textContent = "Waiting for the folder window…";
    const r = await post("/api/settings/pick", { kind: o.kind, start: input.value });
    pick.disabled = false;
    pick.textContent = label;
    if (r.error) return toast(r.error);
    if (r.path) {
      input.value = r.path;
      await field.check();
      if (o.kind === "library") o.again();
    }
  } }, "Choose folder…") : null;
  const remove = o.remove ? el("button", { class: "icon-btn", type: "button", title: "Remove this folder", "aria-label": "Remove this folder", onclick: () => o.remove(field) }, icon("x", 16)) : null;
  field.node = el("div", { class: "field-line" }, el("div", { class: "field-row" }, input, pick, remove), status);
  return field;
}
function folderForm(st, opts) {
  const inboxes = [], inboxBox = el("div", { class: "field-list" }), errorLine = el("p", { class: "form-error", role: "alert", hidden: true });
  let library, review = null, recheck;
  const original = JSON.stringify({ library: st.library, inbox: st.inbox, review: st.review });
  const values = () => ({ library: library.value(), inbox: inboxes.map((f) => f.value()).filter(Boolean), review: review ? review.value() : st.review });
  const saveBtn = el("button", { class: "btn primary", type: "button", disabled: true, onclick: async () => {
    saveBtn.disabled = true;
    errorLine.hidden = true;
    const r = await post("/api/settings", values());
    if (r.error) { errorLine.textContent = r.error; errorLine.hidden = false; paint(); return; }
    saveBtn.textContent = "Reading your library…";
    await opts.saved();
  } }, opts.button);
  const others = () => [...inboxes, ...(review ? [review] : [])];
  const paint = () => {
    const changed = !opts.requireChange || JSON.stringify(values()) !== original;
    saveBtn.disabled = !(library.ok && others().every((f) => f.ok) && changed);
  };
  const again = () => { clearTimeout(recheck); recheck = setTimeout(() => others().forEach((f) => f.check()), 260); };
  const shared = { picker: st.picker, library: () => library.value(), changed: paint, again };
  library = folderField({ ...shared, kind: "library", label: "Your library folder", value: st.library, library: null });
  const addInbox = (value) => {
    const f = folderField({ ...shared, kind: "inbox", label: "Downloaded songs folder", value, remove: (gone) => {
      inboxes.splice(inboxes.indexOf(gone), 1);
      gone.node.remove();
      if (!inboxes.length) addInbox("");
      paint();
    } });
    inboxes.push(f);
    inboxBox.append(f.node);
    f.check();
  };
  (st.inbox.length ? st.inbox : [""]).forEach(addInbox);
  library.check();
  const section = (title, help, ...body) => el("section", { class: "field" }, el("h2", {}, title), el("p", { class: "note" }, help), body);
  const form = el("div", {},
    section("Your library", "Where finished songs end up, sorted into genre folders. It can be empty, or a library you already have.", library.node),
    section("Downloaded songs", "Where you put new downloads, ready to be curated. Subfolders are ignored. Originals stay here until you say they can go.", inboxBox,
      el("button", { class: "linkish add-folder", type: "button", onclick: () => addInbox("") }, "Add another folder")));
  if (opts.showReview) {
    review = folderField({ ...shared, kind: "review", label: "Songs waiting for a decision", value: st.review });
    form.append(section("Songs waiting for a decision", "Optional. Songs that couldn't be verified, kept apart from your library.", review.node));
    review.check();
  }
  form.append(el("div", { class: "form-foot" }, saveBtn, el("span", { class: "note" }, "Picking a folder doesn't move any music. It only sets where the app looks and where finished songs get written.")), errorLine);
  return form;
}
function pageSetup() {
  const st = S.setup, missing = st.reason === "missing";
  view.replaceChildren(el("div", { class: "setup-wrap" },
    el("div", { class: "setup-brand" }, el("img", { src: "/favicon.svg", alt: "", width: 26, height: 26 }), "Curator"),
    el("h1", {}, missing ? "Where did your library go?" : "Where does your music live?"),
    el("p", { class: "lead" }, missing ? `Couldn't find it at ${st.library}. If it's on a drive, plug it in and reload this page. If it moved, pick its new location.`
      : "Pick two folders to get started. You can change them later."),
    folderForm(st, { button: missing ? "Use this folder" : "Start", requireChange: missing, showReview: !!st.review, saved: async () => {
      if (!(await safeLoad())) return;
      if (location.hash === "#/") route(); else location.hash = "#/";
    } }),
    missing ? null : el("p", { class: "note setup-note" }, "The app keeps its log, your answers and its cache in a _curation folder next to your library, so Spotify doesn't scan them.")));
}
async function pageSettings() {
  view.replaceChildren(el("p", { class: "loading" }, "Reading your settings…"));
  const st = await fetch("/api/settings", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
  if (!location.hash.startsWith("#/settings")) return;
  if (!st) return view.replaceChildren(el("p", { class: "empty" }, "Couldn't read your settings. Is the app still running?"));
  view.replaceChildren(el("div", { class: "settings-wrap" },
    el("div", { class: "page-head" }, el("h1", {}, "Folders")),
    folderForm(st, { showReview: true, requireChange: true, button: "Save folders", saved: async () => {
      if (!(await safeLoad())) return;
      toast("Folders saved.");
      if (location.hash === "#/") route(); else location.hash = "#/";
    } }),
    el("dl", { class: "facts-list about" },
      st.app_folder ? [el("dt", {}, "App files"), el("dd", {}, st.app_folder)] : null,
      el("dt", {}, "Settings file"), el("dd", {}, st.config_file))));
}

/* ---------- song drawer ---------- */
function shopLink(s) { // the record's own listings when Discogs knows it, otherwise a search that can find it
  const m = /discogs\.com\/(release|master)\/(\d+)/.exec(s.link || "");
  if (m) return { href: m[1] === "release" ? `https://www.discogs.com/sell/release/${m[2]}` : `https://www.discogs.com/sell/list?master_id=${m[2]}&format=Vinyl`, label: "Buy on Discogs", icon: "bag" };
  const q = [s.artist, (s.title || "").replace(/\s*[([][^)\]]*[)\]]/g, "")].filter(Boolean).join(" "); // Discogs finds nothing when "(Original Mix)" is in the search
  return q ? { href: `https://www.discogs.com/search/?q=${encodeURIComponent(q)}&type=all`, label: "Search Discogs", icon: "search" } : null;
}
const drawer = $("#drawer");
const roomy = matchMedia("(min-width: 1000px)"); // the same width as in style.css: below it the panel slides over the page, so it only opens when asked
let drawerFrom = null, drawerSong = null, overlayOpen = false, paintedSong = null;
const panelShown = () => !S.setup && (roomy.matches ? store("curator-panel") !== "hidden" : overlayOpen);
function keepInPlace(id, change) { // the page changes width as the panel opens or closes: the song you're on stays where it was
  const row = id && document.querySelector(`[data-song="${id}"]`), top = row && row.getBoundingClientRect().top;
  change();
  if (!row) return;
  const page = $("#view"), until = performance.now() + 450; // the page glides to its new width, so hold the song still the whole way
  const hold = () => { page.scrollTop += row.getBoundingClientRect().top - top; if (row.isConnected && performance.now() < until) requestAnimationFrame(hold); };
  hold();
}
function showPanel() {
  const on = panelShown(), toggle = $("#panel-toggle");
  if (document.body.classList.contains("drawer-open") !== on) keepInPlace(drawerSong, () => document.body.classList.toggle("drawer-open", on));
  toggle.classList.toggle("active", on);
  toggle.setAttribute("aria-pressed", String(on));
  toggle.title = on ? "Hide the song panel" : "Show the song panel";
}
function setPanel(on) {
  if (roomy.matches) store("curator-panel", on ? "shown" : "hidden"); else overlayOpen = on;
  showPanel();
}
function closeDrawer() {
  if (!panelShown()) return;
  setPanel(false);
  if (!roomy.matches && drawerFrom && drawerFrom.isConnected) drawerFrom.focus({ preventScroll: true });
}
function openDrawer(id) { // show this song in the panel, opening the panel if it's hidden
  if (!S.byId.has(id)) return;
  if (!roomy.matches && !overlayOpen) drawerFrom = document.activeElement;
  drawerSong = id;
  paintPanel();
  setPanel(true);
  if (!roomy.matches) $("#drawer-close").focus();
}
function followPlaying() { // whatever starts playing takes over the panel, even a hidden one, so it's right when it's opened
  drawerSong = current().id;
  paintPanel();
}
function paintPanel() {
  const s = drawerSong && S.byId.get(drawerSong), now = current();
  const close = el("button", { class: "icon-btn drawer-close", type: "button", "aria-label": "Hide the panel", title: "Hide the panel", onclick: closeDrawer, id: "drawer-close" }, icon("x", 18));
  if (!s) {
    drawer.classList.remove("fresh");
    drawer.replaceChildren(close, el("div", { class: "panel-empty" }, el("div", { class: "cover vinyl" }), el("p", {}, "Nothing playing yet."), el("p", { class: "note" }, "Play a song, or click one, to see it here.")));
    return;
  }
  const isNow = now && now.id === s.id;
  const t = TRUST[s.trust] || TRUST.unknown;
  const facts = [["Album", s.album], ["Year", s.year], ["Genre", s.genre], ["Label", s.label], ["Country", s.country], ["Length", clock(s.secs)],
    ["Quality", s.kbps ? `${s.kbps} kbps` : ""], ["Size", `${(s.bytes / 1e6).toFixed(1)} MB`],
    ["Where", s.area === "library" ? [S.meta.library, s.folder].filter(Boolean).join(" / ") : s.area === "review" ? ["Review", s.folder].filter(Boolean).join(" / ") : s.where],
    ["File", s.file], ["Added", s.added ? s.added.replace("T", " ").slice(0, 16) : ""]].filter(([, v]) => v);
  const linkName = /discogs/.test(s.link) ? "Open on Discogs" : /musicbrainz/.test(s.link) ? "Open on MusicBrainz" : /youtu/.test(s.link) ? "Open the upload" : "Open the source";
  const shop = shopLink(s), flagBox = el("div");
  const paint = () => {
    const flag = S.decisions[`flag:${s.key}`];
    flagBox.replaceChildren(flag ? el("div", { class: "decided" }, icon("flag", 15), el("span", {}, flag.note ? `Flagged: ${flag.note}` : "Flagged for another look"),
      el("button", { class: "linkish", type: "button", onclick: async () => { if (await decide(s, "flag", null)) { s.checks = s.checks.filter((c) => c.kind !== "flag"); badge(); paint(); } } }, "Undo"))
      : el("button", { class: "linkish", type: "button", onclick: () => {
        const input = el("input", { type: "text", placeholder: "What's wrong with it?", "aria-label": "What's wrong with it?" });
        const save = async () => { const note = input.value.trim(); if (await decide(s, "flag", "flag", { note })) { s.checks = [...s.checks.filter((c) => c.kind !== "flag"), { kind: "flag", why: note || "Flagged by you" }]; badge(); paint(); } };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
        flagBox.replaceChildren(el("div", { class: "inline-form" }, input, el("button", { class: "btn small", type: "button", onclick: save }, "Flag it")));
        input.focus();
      } }, "Something wrong with this one?"));
  };
  paint();
  const checks = s.checks.filter((c) => c.kind !== "flag");
  drawer.replaceChildren();
  fill(drawer, {}, [
    close,
    isNow ? el("div", { class: "panel-tag" }, "Now playing") : now ? el("button", { class: "linkish panel-tag", type: "button", onclick: () => openDrawer(now.id) }, "Back to what's playing") : null,
    coverEl(s), el("h2", {}, s.title), el("div", { class: "by" }, s.artist),
    el("div", { class: "actions" },
      isNow ? null : el("button", { class: "btn primary small", type: "button", onclick: () => (S.list.includes(s.id) ? playFrom(s.id) : playQueue([s.id], 0, "")) }, icon("play", 14), "Play"),
      s.link ? el("a", { class: "btn small", href: s.link, target: "_blank", rel: "noreferrer noopener" }, icon("link", 14), linkName) : null,
      shop ? el("a", { class: "btn small", href: shop.href, target: "_blank", rel: "noreferrer noopener" }, icon(shop.icon, 14), shop.label) : null),
    el("dl", { class: "facts-list" }, facts.map(([k, v]) => [el("dt", {}, k), el("dd", {}, k === "Album" || k === "Label" ? el("a", { class: "fact-link", href: `#/songs?${q2({ [k.toLowerCase()]: v })}` }, v) : v)])),
    s.area === "library" ? [el("h3", {}, "How sure"), el("div", { class: "box" }, trustTag(s), el("div", { class: "note" }, t.long), s.notes ? el("div", { class: "item-why" }, s.notes) : null)] : null,
    s.was && s.was !== s.file ? [el("h3", {}, "Your file was called"), el("div", { class: "box" }, s.was)] : null,
    checks.length ? [el("h3", {}, "To check"), checks.map((c) => el("div", { class: "box" }, el("strong", {}, KINDS[c.kind].label), el("div", { class: "item-why" }, c.why), alreadyIn(c), recordLine(c), spotifyLine(c), betterLine(c),
      controls(s, c, (advance) => { if (advance && S.listen && current() && current().id === s.id) step(1); })))] : null,
    el("div", { class: "hintbar" }, flagBox)]);
  drawer.classList.toggle("fresh", paintedSong !== drawerSong); // only a new song arrives with motion, not a repaint of the same one
  if (paintedSong !== drawerSong) { drawer.scrollTop = 0; paintedSong = drawerSong; }
}

/* ---------- player ---------- */
const audio = $("#audio");
const P = { queue: [], i: -1, label: "" };
const current = () => S.byId.get(P.queue[P.i]);
let dragging = false;
function playQueue(ids, start, label) {
  if (label !== "To check") S.listen = false;
  P.queue = ids; P.i = start; P.label = label || "";
  loadCurrent();
}
function playFrom(id) {
  const i = S.list.indexOf(id);
  i >= 0 ? playQueue(S.list, i, "") : playQueue([id], 0, "");
}
function step(d) {
  const n = P.i + d;
  if (!P.queue.length || n < 0 || n >= P.queue.length) { audio.pause(); return; }
  P.i = n;
  loadCurrent();
  if (S.listen) { const card = document.querySelector(`.item[data-song="${current().id}"]`); if (card) card.scrollIntoView({ block: "center", behavior: "smooth" }); }
}
function loadCurrent() {
  const s = current();
  if (!s) return;
  audio.src = `/audio/${s.id}`;
  audio.play().catch(() => {});
  $("#np-title").textContent = s.title || s.file;
  $("#np-title").title = songName(s);
  $("#np-artist").textContent = P.label ? `${s.artist} · ${P.label}` : s.artist;
  const c = $("#np-cover");
  c.replaceChildren(); c.className = `cover${s.cover ? "" : " vinyl"}`;
  if (s.cover) c.append(el("img", { src: coverUrl(s), alt: "" }));
  ["#play", "#prev", "#next", "#seek"].forEach((x) => ($(x).disabled = false));
  $("#seek").value = 0; fillRange($("#seek"));
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, album: s.album, artwork: s.cover ? [{ src: coverUrl(s), sizes: "512x512" }] : [] });
  markPlaying();
  $(".np").classList.add("ready");
  followPlaying();
}
function markPlaying() {
  const id = current() ? current().id : null;
  document.querySelectorAll("[data-song]").forEach((n) => n.classList.toggle("playing", n.dataset.song === id));
}
function paintPlay() {
  const paused = audio.paused;
  $("#play").replaceChildren(icon(paused ? "play" : "pause", 18));
  $("#play").setAttribute("aria-label", paused ? "Play" : "Pause");
  document.body.classList.toggle("is-playing", !paused);
}
function fillRange(input) { input.style.setProperty("--v", `${((input.value - input.min) / (input.max - input.min)) * 100}%`); }
const togglePlay = () => { if (!audio.src) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); };
audio.addEventListener("play", paintPlay);
audio.addEventListener("pause", paintPlay);
audio.addEventListener("ended", () => step(1));
audio.addEventListener("error", () => { if (audio.getAttribute("src")) toast("This file can't be played in the browser."); });
audio.addEventListener("timeupdate", () => {
  if (dragging || !audio.duration) return;
  $("#seek").value = (audio.currentTime / audio.duration) * 1000;
  fillRange($("#seek"));
  $("#cur").textContent = clock(audio.currentTime);
});
audio.addEventListener("loadedmetadata", () => { $("#dur").textContent = clock(audio.duration); });
$("#seek").addEventListener("input", (e) => { fillRange(e.target); dragging = true; if (audio.duration) $("#cur").textContent = clock((e.target.value / 1000) * audio.duration); });
$("#seek").addEventListener("change", (e) => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; dragging = false; });
$("#play").addEventListener("click", togglePlay);
$("#prev").addEventListener("click", () => (audio.currentTime > 4 ? (audio.currentTime = 0) : step(-1)));
$("#next").addEventListener("click", () => step(1));
$(".np").addEventListener("click", () => { if (current()) openDrawer(current().id); }); // the title inside is the keyboard's way in
$("#panel-toggle").append(icon("panel", 18));
$("#panel-toggle").addEventListener("click", () => setPanel(!panelShown()));
roomy.addEventListener("change", () => { overlayOpen = false; showPanel(); });
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; }
$("#vol").value = store("curator-volume") || 0.8;
audio.volume = +$("#vol").value;
fillRange($("#vol"));
$("#vol").addEventListener("input", (e) => { audio.volume = +e.target.value; fillRange(e.target); store("curator-volume", e.target.value); });
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
  navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
}

/* ---------- frame ---------- */
const NAV = [["home", "Overview", "home", "#/"], ["songs", "Songs", "music", "#/songs"], ["albums", "Albums", "disc", "#/albums"], ["labels", "Labels", "tag", "#/labels"], ["check", "To check", "ears", "#/check"], ["add", "Playlists", "listadd", "#/add"], ["progress", "Progress", "bars", "#/progress"]];
$("#rail-links").replaceChildren(...NAV.map(([k, label, ic, href]) => el("a", { class: "nav", href, dataset: { page: k } }, icon(ic, 18), label, k === "check" || k === "add" ? el("span", { class: "count", id: `${k}-count` }) : null)));
$("#vol-icon").append(icon("vol", 16));
$("#prev").append(icon("prev", 20));
$("#next").append(icon("next", 20));
paintPlay();
function paintTheme() {
  const dark = document.documentElement.dataset.theme !== "light";
  $("#theme").replaceChildren(icon(dark ? "sun" : "moon", 17));
}
if (store("curator-theme") === "light") document.documentElement.dataset.theme = "light";
paintTheme();
$("#theme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "light";
  if (dark) document.documentElement.dataset.theme = "light"; else delete document.documentElement.dataset.theme;
  store("curator-theme", dark ? "light" : "dark");
  paintTheme();
});
$("#settings-link").append(icon("sliders", 17));
$("#refresh").append(icon("refresh", 17));
$("#refresh").addEventListener("click", async () => { if (!(await safeLoad())) return; route(); if (!S.setup) toast("Library read again."); });

function moveNav() { // the highlight glides to the page you're on
  const box = $("#rail-links"), on = $(".nav.active");
  box.style.setProperty("--nav-on", on ? 1 : 0);
  if (on) [["x", on.offsetLeft], ["y", on.offsetTop], ["w", on.offsetWidth], ["h", on.offsetHeight]].forEach(([k, v]) => box.style.setProperty(`--nav-${k}`, `${v}px`));
}
window.addEventListener("resize", moveNav);
function route() {
  clearPage();
  if (S.setup) return pageSetup();
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(qs || ""), page = path || "home";
  $("#settings-link").classList.toggle("active", page === "settings");
  document.querySelectorAll(".nav").forEach((n) => { const on = n.dataset.page === page; n.classList.toggle("active", on); on ? n.setAttribute("aria-current", "page") : n.removeAttribute("aria-current"); });
  moveNav();
  const pages = { home: pageHome, songs: pageSongs, albums: pageAlbums, labels: pageLabels, check: pageCheck, add: pageAdd, progress: pageProgress, settings: pageSettings };
  (pages[page] || pageHome)(params);
  view.scrollTop = 0;
  markPlaying();
  if (params.get("open")) openDrawer(params.get("open")); else if (roomy.matches) showPanel(); else closeDrawer();
}
window.addEventListener("hashchange", route);
window.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === "Escape") { if (!roomy.matches) closeDrawer(); }
  else if (e.code === "Space" && !typing && e.target.tagName !== "BUTTON" && e.target.tagName !== "A") { e.preventDefault(); togglePlay(); }
  else if (e.key === "/" && !typing && $("#song-search")) { e.preventDefault(); $("#song-search").focus(); }
});
async function safeLoad() {
  try { await load(); paintPanel(); return true; } catch { view.replaceChildren(el("p", { class: "empty" }, "Couldn't read the library. Is the server still running?")); return false; }
}
safeLoad().then((ok) => { if (ok) route(); });
