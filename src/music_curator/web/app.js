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
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", upnext: "M4 6h16M4 12h9M4 18h9M16 12.500v7l5.500-3.500z",
  plus: "M12 5v14M5 12h14", import: "M12 4v11M8 11l4 4 4-4M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5", chevron: "M6 9l6 6 6-6", expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", even: "M6 9v6M10 9v6M14 9v6M18 9v6M3 5h18M3 19h18", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.500 20a7.500 7.500 0 0 1 15 0",
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
const S = { songs: [], byId: new Map(), lib: [], decisions: {}, progress: {}, meta: {}, songView: "list", sort: { key: "artist", dir: 1 }, list: [], listen: false, observers: [], lists: new Map(), inSpotify: new Map(), inOwn: new Map() };
const TRUST = {
  verified: { label: "Verified", long: "Confirmed against Discogs or MusicBrainz.", icon: "shield", cls: "good" },
  auto: { label: "Auto-matched", long: "Matched to a Discogs record by the app, by name and length, or you picked the version. Nobody has double-checked it.", icon: "tick", cls: "auto" },
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
  indexLists();
  $("#genres").replaceChildren(...tally(S.lib.map((s) => s.genre)).map(([g]) => el("option", { value: g })));
  badge();
  if (S.meta.curate && S.meta.curate.running) watchCurate(); // the page was reloaded during a run
  if (S.meta.export && S.meta.export.running) watchExport();
}

const OWN = "own:"; // how the Songs page tells a playlist made here from a Spotify one, which can have the same name
const ownList = (key) => (S.meta.own_playlists || []).find((p) => OWN + p.id === key);
const listName = (key) => (key.startsWith(OWN) ? (ownList(key) || { name: "A deleted playlist" }).name : key);
function indexLists() {
  const own = S.meta.own_playlists || [], spotify = S.meta.my_playlists || [];
  S.lists = new Map([...spotify.map((p) => [p.name, p.ids]), ...own.map((p) => [OWN + p.id, p.ids])].map(([key, ids]) => [key, new Map(ids.map((id, i) => [id, i]))]));
  const whereIs = (lists) => { const m = new Map(); for (const p of lists) for (const id of p.ids) m.set(id, [...(m.get(id) || []), p.name]); return m; };
  S.inSpotify = whereIs(spotify);
  S.inOwn = whereIs(own);
}
const playlistChores = () => waitingToAdd().reduce((n, [, d]) => n + lines(d.note).length, 0) + sum(((S.meta.spotify || {}).to_remove || []).map((r) => r.count));
function badge() {
  const c = $("#check-count"), a = $("#add-count");
  if (c) c.textContent = needsYou() || "";
  if (a) a.textContent = playlistChores() || "";
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
function listenCards(st, times, top) { // st counts each song once per play
  const out = [], songs = (o) => `#/songs?${q2(o)}`;
  if (st.genres.length) {
    const [g, c] = st.genres[0], then = st.genres.slice(1, 3).map((x) => x[0]);
    out.push({ label: "You mostly listen to", big: g, sub: `${Math.round((c / sum(st.genres.map((x) => x[1]))) * 100)}% of what you play.${then.length ? ` Then ${then.join(" and ")}.` : ""}`, href: songs({ genre: g }) });
  }
  out.push({ label: "On repeat", big: plural(top[0].plays, "play"), sub: songName(top[0]) || top[0].file, href: songs({ open: top[0].id }) });
  if (st.artists.length) {
    const [a, c] = st.artists[0], next = st.artists[1];
    out.push({ label: "Favourite artist", big: a, sub: `${plural(c, "play")}.${next ? ` ${next[0]} follows with ${next[1]}.` : ""}`, href: songs({ artist: a }) });
  }
  out.push({ label: "Listened for about", big: longTime(st.secs), sub: `${plural(times, "play")} of ${plural(top.length, "song")}.` });
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

  const factsBox = (cards) => el("div", { class: "facts" }, cards.map((f) => el(f.href ? "a" : "div", { class: "fact", href: f.href }, el("div", { class: "label" }, f.label), el("div", { class: "big" }, f.big), el("div", { class: "sub" }, f.sub))));
  const seeAll = (sort) => el("a", { class: "linkish see-all", href: `#/songs?sort=${sort}` }, "See all");
  const panel = (title, rows, key) => el("div", { class: "card" }, el("h2", {}, title), ranks(rows, (name) => `#/songs?${q2({ [key]: name })}`));
  const page = el("div", {}, curateBar(), hero);

  const newest = lib.filter((s) => s.added).sort((a, b) => b.added.localeCompare(a.added) || fold(songName(a)).localeCompare(fold(songName(b)))).slice(0, 20);
  if (newest.length) page.append(el("h2", { class: "section" }, "Recently added", seeAll("added")), el("div", { class: "strip" }, newest.map((s, i) => el("div", { class: "tile has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
    coverEl(s, () => playQueue(newest.map((x) => x.id), i, "Recently added")), el("span", { class: "t-main", title: s.title }, s.title), el("span", { class: "t-sub", title: s.artist }, s.artist)))));

  page.append(el("h2", { class: "section" }, "What stands out"), factsBox(factCards(lib, st)), el("h2", { class: "section" }, "What you play"));
  const top = lib.filter((s) => s.plays).sort((a, b) => b.plays - a.plays || b.played.localeCompare(a.played));
  if (!top.length) page.append(el("p", { class: "note" }, "Nothing counted yet. A song counts once you've heard half of it, or 4 minutes if that comes first."));
  else {
    const listened = lib.flatMap((s) => Array(s.plays || 0).fill(s)), played = stats(listened), most = top.slice(0, 10), enough = listened.length >= 5; // a couple of plays say nothing about anyone's taste
    if (enough) page.append(factsBox(listenCards(played, listened.length, top)));
    page.append(el("div", { class: "cols" },
      el("div", { class: "card" }, el("h2", {}, "Most played", seeAll("plays")), el("div", { class: "rows" }, most.map((s, i) => el("div", { class: "row has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
        coverEl(s, () => playQueue(most.map((x) => x.id), i, "Most played")),
        el("div", { class: "grow" }, el("div", { class: "now", title: songName(s) }, s.title || s.file), el("div", { class: "was", title: s.artist }, s.artist)),
        el("span", { class: "time" }, plural(s.plays, "play")))))),
      enough && played.genres.length > 1 ? panel("Genres you play", played.genres.slice(0, 10), "genre") : null));
  }

  if (st.peak) {
    const p = st.peak, data = [];
    for (let y = p.min; y <= p.max; y++) data.push({ x: y, y: p.by.get(y) || 0, hi: y >= p.y && y < p.y + 3 });
    const box = el("div", { class: "chart" }), noYear = lib.length - p.dated;
    page.append(el("h2", { class: "section" }, "When your music came out"), el("div", { class: "card" },
      el("p", { class: "note" }, `Songs per release year. The three busiest years in a row are highlighted.${noYear ? ` ${plural(noYear, "song")} with no year ${noYear === 1 ? "isn't" : "aren't"} shown.` : ""}`), box,
      twin(["Year", "Songs"], data.filter((d) => d.y).map((d) => [d.x, d.y]))));
    columns(box, data, { label: "Songs per release year", pick: (d) => { location.hash = `#/songs?${q2({ from: d.x, to: d.x })}`; } });
  }
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
    if (f.playlist && !(S.lists.get(f.playlist) || new Map()).has(s.id)) return false;
    if (f.spotify && S.inSpotify.has(s.id) !== (f.spotify === "yes")) return false;
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
  const num = key === "year" || key === "secs" || key === "kbps" || key === "plays";
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
const NEWEST_FIRST = { plays: "Most played first", played: "Last played first", added: "Newest in your library first" };
function pageSongs(params) {
  const f = {}; for (const k of ["q", "genre", "decade", "trust", "album", "artist", "label", "playlist", "country", "from", "to", "spotify"]) f[k] = params.get(k) || "";
  f.area = params.get("area") || "library";
  if (NEWEST_FIRST[params.get("sort")]) S.sort = { key: params.get("sort"), dir: -1 };
  if (f.playlist) S.sort = { key: "playlist", dir: 1 };
  const inScope = () => (f.area === "all" ? S.songs : S.songs.filter((s) => s.area === f.area));
  const results = el("div"), countLine = el("p", { class: "count-line" }), chips = el("div", { class: "actions" }), head = el("div");
  const exporter = exportControls(() => [listName(f.playlist), f.album, f.label, f.artist, f.genre, f.q.trim()].find(Boolean) || S.meta.library || "Library");
  const adder = el("button", { class: "btn small", type: "button", onclick: () => addToList(S.list, plural(S.list.length, "song")) }, icon("plus", 14), "Add to playlist");

  const sync = () => { const qs = q2({ ...f, area: f.area === "library" ? "" : f.area }); history.replaceState(null, "", `#/songs${qs ? `?${qs}` : ""}`); };
  function paintHead(list) {
    const own = ownList(f.playlist);
    countLine.textContent = `${plural(list.length, "song")} · ${longTime(sum(list.map((s) => s.secs)))}`;
    exporter.counted();
    adder.disabled = !list.length;
    head.replaceChildren(...(own ? [ownHead(own, list)] : !list.length ? [] : f.playlist ? [playlistHead(f.playlist, list)] : f.album ? [albumHead(list)] : f.label ? [labelHead(f.label, list)] : f.artist ? [artistHead(f.artist, list)] : []));
  }
  async function takeOut(s, row) { // the row goes by itself, so you keep your place in a long list
    const own = ownList(f.playlist), r = await post("/api/playlists/remove", { list: own.id, ids: [s.id] });
    if (r.error) return toast(r.error);
    tookLists(r);
    toast(`Took ${songName(s) || s.file} out of ${own.name}.`);
    row.remove();
    S.list = S.list.filter((id) => id !== s.id);
    if (S.list.length) paintHead(S.list.map((id) => S.byId.get(id))); else update();
  }
  function update() {
    sync();
    results.replaceChildren();
    S.observers.forEach((o) => o.disconnect()); S.observers = [];
    if (!f.playlist && S.sort.key === "playlist") S.sort = { key: "artist", dir: 1 };
    const order = S.sort.key === "playlist" ? S.lists.get(f.playlist) : null; // a playlist stays in its own order until you sort it by a column
    const list = S.songs.filter(matcher(f)).sort(order ? (a, b) => order.get(a.id) - order.get(b.id) : comparator(S.sort));
    S.list = list.map((s) => s.id);
    paintHead(list);
    chips.replaceChildren(...[["playlist", "Playlist"], ["album", "Album"], ["artist", "Artist"], ["label", "Label"], ["country", "Country"]].filter(([k]) => f[k]).map(([k, w]) => chipOff(`${w}: ${k === "playlist" ? listName(f[k]) : f[k]}`, () => { f[k] = ""; update(); })),
      ...(f.from ? [chipOff(f.from === f.to ? `Year: ${f.from}` : `Years: ${f.from}–${f.to}`, () => { f.from = f.to = ""; update(); })] : []),
      ...(NEWEST_FIRST[S.sort.key] && S.sort.dir < 0 ? [chipOff(NEWEST_FIRST[S.sort.key], () => { S.sort = { key: "artist", dir: 1 }; update(); })] : []));
    const own = ownList(f.playlist);
    if (!list.length) return results.replaceChildren(el("p", { class: "empty" }, own && !own.ids.length ? "Nothing in this playlist yet. Find a song and press + to add it." : "Nothing matches these filters."));
    S.songView === "grid" ? renderTiles(results, list) : renderTable(results, list, update, own ? takeOut : null);
  }
  const chipOff = (text, off) => el("button", { class: "chip", type: "button", title: "Remove this filter", onclick: off }, text, " ", el("em", {}, "×"));
  const pick = (label, key, options) => el("select", { "aria-label": label, onchange: (e) => { f[key] = e.target.value; update(); } }, options.map(([v, t]) => el("option", { value: v, selected: f[key] === v }, t)));

  const decades = tally(inScope().map((s) => (s.year ? String(Math.floor(+s.year / 10) * 10) : ""))).sort((a, b) => +a[0] - +b[0]);
  const onLists = inScope().filter((s) => S.inSpotify.has(s.id)).length;
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
      (S.meta.my_playlists || []).length ? pick("Spotify lists", "spotify", [["", "Spotify lists: any"], ["yes", `On a Spotify list (${fmt(onLists)})`], ["no", `On no Spotify list (${fmt(inScope().length - onLists)})`]]) : null,
      toggle),
    chips, head, el("div", { class: "list-head" }, countLine, el("div", { class: "actions" }, adder, exporter.button)), exporter.panel, results));
  update();
}
function renderTable(box, list, update, takeOut) {
  const head = (label, key, cls) => el("th", { class: cls }, el("button", { type: "button", class: S.sort.key === key ? "on" : "", onclick: () => {
    S.sort = { key, dir: S.sort.key === key ? -S.sort.dir : NEWEST_FIRST[key] ? -1 : 1 }; update();
  } }, `${label}${S.sort.key === key ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}`));
  const body = el("tbody");
  const holder = el("div");
  box.replaceChildren(el("table", { class: "table" },
    el("colgroup", {}, ["c-cover", "", "c-album", "c-year", "c-genre", "c-len", "c-kbps", "c-plays", "c-trust"].map((c) => el("col", { class: c }))),
    el("thead", {}, el("tr", {}, el("th", { class: "c-cover" }), el("th", {}, el("button", { type: "button", class: S.sort.key === "artist" ? "on" : "", onclick: () => { S.sort = { key: "artist", dir: S.sort.key === "artist" ? -S.sort.dir : 1 }; update(); } }, `Artist${S.sort.key === "artist" ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}`), " · ", el("button", { type: "button", class: S.sort.key === "title" ? "on" : "", onclick: () => { S.sort = { key: "title", dir: S.sort.key === "title" ? -S.sort.dir : 1 }; update(); } }, `Title${S.sort.key === "title" ? (S.sort.dir > 0 ? " ↑" : " ↓") : ""}`)),
      head("Album", "album", "c-album"), head("Year", "year", "c-year"), head("Genre", "genre", "c-genre"), head("Length", "secs", "c-len num"), head("kbps", "kbps", "c-kbps num"), head("Plays", "plays", "c-plays num"), head("How sure", "trust", "c-trust"))),
    body), holder);
  lazy(body, list, (s) => el("tr", { class: "has-play", dataset: { song: s.id }, onclick: () => openDrawer(s.id) },
    el("td", { class: "c-cover" }, coverEl(s, () => playFrom(s.id))),
    el("td", { class: "t-cell" }, el("button", { class: "t-main", type: "button", title: s.title, onclick: (e) => { e.stopPropagation(); openDrawer(s.id); } }, s.title), el("span", { class: "t-sub", title: s.artist }, s.artist),
      takeOut ? el("button", { class: "row-add row-out", type: "button", title: "Take out of this playlist", "aria-label": `Take ${songName(s)} out of this playlist`, onclick: (e) => { e.stopPropagation(); takeOut(s, e.currentTarget.closest("tr")); } }, icon("x", 15)) : null,
      el("button", { class: "row-add row-list", type: "button", title: "Add to a playlist", "aria-label": `Add ${songName(s)} to a playlist`, onclick: (e) => { e.stopPropagation(); addToList([s.id], songName(s) || s.file); } }, icon("plus", 15)),
      el("button", { class: "row-add", type: "button", title: "Add to queue", "aria-label": `Add ${songName(s)} to the queue`, onclick: (e) => { e.stopPropagation(); enqueue([s.id]); } }, icon("listadd", 15))),
    el("td", { class: "c-album", title: s.album }, s.album), el("td", { class: "c-year" }, s.year), el("td", { class: "c-genre", title: s.genre }, s.genre),
    el("td", { class: "c-len num" }, clock(s.secs)), el("td", { class: "c-kbps num" }, s.kbps || "–"), el("td", { class: "c-plays num", dataset: { plays: s.id } }, s.plays ? fmt(s.plays) : "–"), el("td", { class: "c-trust" }, trustTag(s))), holder);
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
    r.already ? `${plural(r.already, "song was", "songs were")} already there.` : "", r.playlist ? `The playlist ${r.playlist} is in there too.` : "", r.stopped ? "Stopped before the end." : ""].filter(Boolean).join(" ");
}
function playlistSaver(count) { // every playlist at once, as files other players can open
  const box = el("div", { class: "export-folder" }), said = el("div", { class: "export-said" });
  let field = null;
  const go = el("button", { class: "btn primary small", type: "button", disabled: true, onclick: async () => {
    go.disabled = true;
    const r = await post("/api/export/playlists", { folder: field.value() });
    if (r.error) { go.disabled = false; return toast(r.error); }
    store("curator-playlist-folder", field.value());
    const words = `Saved ${plural(r.saved, "playlist")} to ${r.folder}.${r.left.length ? ` Left alone, because a different file already has that name: ${r.left.join(", ")}.` : ""}`;
    said.replaceChildren(el("p", { class: "note" }, words));
    toast(words);
    field.check(); // the folder may exist by now
  } }, `Save ${plural(count, "playlist")}`);
  const changed = () => { go.disabled = !field || !field.ok; };
  const panel = el("div", { class: "card export-panel", id: "playlist-saver", hidden: true }, el("h2", {}, "Save your playlists as files"),
    el("p", { class: "note" }, "One .m3u8 file for each playlist, with the songs you have as files. Players like foobar2000, VLC, Plex and Navidrome can open them, and they keep working if that folder and your music move together."),
    box, el("div", { class: "export-go" }, el("span", {}), go), said);
  const toggle = el("button", { class: "btn small", type: "button", "aria-expanded": "false", "aria-controls": "playlist-saver", onclick: async () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (panel.hidden || field) return;
    let picker = false;
    try { const r = await fetch("/api/settings", { cache: "no-store" }); if (r.ok) picker = !!(await r.json()).picker; } catch { picker = false; }
    if (field) return; // pressed twice while that was being asked
    field = folderField({ kind: "playlists", label: "Folder for the playlists", picker, value: store("curator-playlist-folder") || "", changed });
    box.replaceChildren(field.node);
    if (field.value()) field.check();
  } }, icon("export", 14), "Save as files");
  return { toggle, panel };
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
    const r = await post("/api/export/copy", { ids: S.list, folder: field.value(), keep: keep.checked, name: nameOf() });
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
      el("div", { class: "note" }, "Or copy the songs to a folder or USB drive, with a playlist of them. Your library stays as it is, and anything already in that folder is left alone."),
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
  if (!item.songs.length) return el("div", { class: "cover vinyl" }); // a new playlist with nothing in it yet
  const play = () => playAll(item.songs, item.name), label = `Play ${item.name}`;
  const faces = [], seen = new Set();
  for (const s of item.songs) if (s.cover && !seen.has(s.link || s.id)) { seen.add(s.link || s.id); faces.push(s); }
  if (!mosaic || faces.length < 4) return coverEl(faces[0] || item.songs[0], play, label);
  const c = el("div", { class: "cover four-up" }, faces.slice(0, 4).map((s) => el("img", { src: coverUrl(s), alt: "", loading: "lazy", decoding: "async" })));
  c.append(el("button", { class: "over", type: "button", title: "Play", "aria-label": label, onclick: (e) => { e.stopPropagation(); play(); } }, icon("play", 20)));
  return c;
}
const disc = (art) => el("div", { class: "disc" }, el("div", { class: "disc-label" }, art && art.cover ? el("img", { src: coverUrl(art), alt: "", decoding: "async" }) : null));
const shelfTile = (item, mosaic) => el("div", { class: "tile has-play shelf", onclick: () => { location.hash = item.href; } },
  el("div", { class: "sleeve" }, disc(), shelfCover(item, mosaic)),
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
function playlistItems() { // the ones made here, then your Spotify playlists as far as your files go
  const item = (p, key, line) => {
    const songs = p.ids.map((id) => S.byId.get(id)).filter(Boolean), genre = (tally(songs.map((s) => s.genre))[0] || [""])[0];
    return { own: key !== p.name, name: p.name, songs, year: Math.max(0, ...yearsOf(songs)), lines: [line(songs.length), genre].filter(Boolean),
      href: `#/songs?${q2({ playlist: key, area: "all" })}`, hay: fold(`${p.name} ${songs.map((s) => `${s.artist} ${s.genre}`).join(" ")}`) };
  };
  return [...(S.meta.own_playlists || []).map((p) => item(p, OWN + p.id, (n) => (p.away.length ? `${fmt(n)} of ${fmt(n + p.away.length)} here` : n ? plural(n, "song") : "No songs yet"))),
    ...(S.meta.my_playlists || []).map((p) => item(p, p.name, (n) => `${fmt(n)} of ${fmt(p.total)} here`)).filter((x) => x.songs.length)];
}
function artistItems() {
  const byName = new Map();
  for (const s of S.lib) for (const a of artistsOf(s)) {
    if (!byName.has(a)) byName.set(a, []);
    byName.get(a).push(s);
  }
  return [...byName].map(([name, songs]) => {
    const years = yearsOf(songs), genre = (tally(songs.map((s) => s.genre))[0] || [""])[0];
    return { name, songs: songs.sort(byTitle), year: years.length ? Math.max(...years) : 0, lines: [plural(songs.length, "song"), [yearSpan(years), genre].filter(Boolean).join(" · ")].filter(Boolean),
      href: `#/songs?${q2({ artist: name })}`, hay: fold(`${name} ${songs.map((s) => `${s.genre} ${s.album} ${s.label}`).join(" ")}`) };
  });
}
function shelfHead(o) { // what the Songs page is showing, when that's one record or one label
  const face = o.songs.find((s) => s.cover) || o.songs[0], play = () => playAll(o.songs, o.name), ids = o.songs.map((s) => s.id);
  return el("div", { class: "card shelf-head" }, face ? coverEl(face) : el("div", { class: "cover vinyl" }),
    el("div", { class: "shelf-info" },
      el("h2", {}, o.name), o.by ? el("div", { class: "by" }, o.by) : null,
      el("dl", { class: "facts-list" }, o.facts.filter(([, v]) => v).map(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      el("div", { class: "actions" }, ids.length ? [el("button", { class: "btn primary small", type: "button", onclick: play }, icon("play", 14), "Play"), queueButtons(ids)] : null, o.links), o.below));
}
const namesIn = (songs, key, most) => tally(songs.map((s) => s[key])).slice(0, most).map(([v]) => v).join(", ");
const yearSpan = (years) => (!years.length ? "" : Math.min(...years) === Math.max(...years) ? String(years[0]) : `${Math.min(...years)}–${Math.max(...years)}`);
function albumHead(songs) {
  const who = [...new Set(songs.map((s) => s.artist).filter(Boolean))], record = songs.find((s) => /discogs/.test(s.link)) || songs[0], shop = shopLink(record);
  const onRecord = Math.max(...songs.map((s) => s.tracks || 0)), years = yearsOf(songs), verified = songs.filter((s) => s.trust === "verified").length;
  return shelfHead({ name: songs[0].album, by: who.length === 1 ? who[0] : who.length ? "Various artists" : "", songs,
    facts: [["Format", record.format], ["Year", years.length ? String(Math.min(...years)) : ""], ["Label", namesIn(songs, "label", 3)], ["Country", namesIn(songs, "country", 3)], ["Genre", namesIn(songs, "genre", 3)],
      ["You have", `${onRecord > songs.length ? `${songs.length} of ${onRecord} tracks` : plural(songs.length, "song")} · ${longTime(sum(songs.map((s) => s.secs)))}`], ["How sure", `${verified} of ${songs.length} verified`]],
    links: [record.link ? el("a", { class: "btn small", href: record.link, target: "_blank", rel: "noreferrer noopener" }, icon("link", 14), sourceName(record.link)) : null,
      shop && /discogs\.com\/(sell)/.test(shop.href) ? el("a", { class: "btn small", href: shop.href, target: "_blank", rel: "noreferrer noopener" }, icon(shop.icon, 14), shop.label) : null] });
}
function labelHead(name, songs) {
  const artists = new Set(songs.flatMap(artistsOf)).size;
  return shelfHead({ name, by: plural(artists, "artist"), songs,
    facts: [["Years", yearSpan(yearsOf(songs))], ["Country", namesIn(songs, "country", 3)], ["Genres", namesIn(songs, "genre", 4)], ["You have", `${plural(songs.length, "song")} · ${longTime(sum(songs.map((s) => s.secs)))}`]] });
}
function artistHead(name, songs) {
  const records = new Set(songs.map((s) => fold(s.album).trim()).filter(Boolean)).size, plays = sum(songs.map((s) => s.plays));
  return shelfHead({ name, by: namesIn(songs, "genre", 3), songs,
    facts: [["You have", `${plural(songs.length, "song")} · ${longTime(sum(songs.map((s) => s.secs)))}`], ["Records", records ? String(records) : ""], ["Years", yearSpan(yearsOf(songs))], ["Labels", namesIn(songs, "label", 4)], ["Played", plays ? plural(plays, "time") : ""]] });
}
function playlistHead(name, songs) {
  const saved = (S.meta.my_playlists || []).find((p) => p.name === name), total = saved ? saved.total : songs.length, away = total - saved.ids.length;
  return shelfHead({ name, by: plural(new Set(songs.flatMap(artistsOf)).size, "artist"), songs,
    facts: [["You have", `${away ? `${fmt(songs.length)} of ${fmt(total)} songs` : plural(songs.length, "song")} · ${longTime(sum(songs.map((s) => s.secs)))}`], ["Only on Spotify", away ? plural(away, "song") : ""], ["Genres", namesIn(songs, "genre", 4)], ["Years", yearSpan(yearsOf(songs))]] });
}
function ownHead(p, songs) {
  const changed = (r) => { tookLists(r); route(); return ""; };
  const rename = el("button", { class: "btn small", type: "button", onclick: () => nameBox("Rename this playlist", "Rename", p.name, async (name) => {
    const r = await post("/api/playlists/rename", { list: p.id, name });
    return r.error || changed(r);
  }) }, "Rename");
  const remove = el("button", { class: "btn small", type: "button", onclick: () => modal(`Delete ${p.name}?`, (box) => [
    el("p", { class: "note" }, "Only the list goes. Your songs stay where they are."),
    el("div", { class: "modal-go" }, el("button", { class: "linkish", type: "button", onclick: () => box.close() }, "Cancel"),
      el("button", { class: "btn primary small", type: "button", onclick: async () => {
        const r = await post("/api/playlists/delete", { list: p.id });
        box.close();
        if (r.error) return toast(r.error);
        tookLists(r);
        location.hash = "#/add";
      } }, "Delete"))]) }, "Delete");
  const away = p.away.length ? el("details", { class: "twin" }, el("summary", {}, `Show the ${plural(p.away.length, "song")} you don't have`),
    el("div", { class: "scroll" }, el("ul", { class: "away-list" }, p.away.map((name) => el("li", {}, name)))),
    el("button", { class: "linkish", type: "button", onclick: async () => {
      const r = await post("/api/playlists/remove", { list: p.id, away: true });
      if (r.error) return toast(r.error);
      changed(r);
    } }, "Take them out of this playlist")) : null;
  return shelfHead({ name: p.name, by: songs.length ? plural(new Set(songs.flatMap(artistsOf)).size, "artist") : "", songs, links: [rename, remove], below: away,
    facts: [["You have", songs.length ? `${plural(songs.length, "song")} · ${longTime(sum(songs.map((s) => s.secs)))}` : ""], ["Not here", p.away.length ? plural(p.away.length, "song") : ""], ["Genres", namesIn(songs, "genre", 4)], ["Years", yearSpan(yearsOf(songs))]] });
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
    const sorter = sorters[f.sort] || sorters.most;
    const list = all.filter((x) => (!f.many || x.songs.length > 1) && words.every((w) => x.hay.includes(w))).sort((a, b) => (b.own ? 1 : 0) - (a.own ? 1 : 0) || sorter(a, b)); // playlists made here come first
    countLine.textContent = o.count(list.length);
    if (!list.length) return results.replaceChildren(el("p", { class: "empty" }, all.length ? "Nothing matches that." : o.none));
    const grid = el("div", { class: "grid" }), holder = el("div");
    results.replaceChildren(grid, holder);
    lazy(grid, list, (x) => shelfTile(x, o.mosaic), holder);
  }
  const search = el("input", { type: "search", placeholder: o.placeholder, value: f.q, "aria-label": "Search", id: "song-search", oninput: (e) => { f.q = e.target.value; update(); } });
  const order = el("select", { "aria-label": "Sort", onchange: (e) => { f.sort = e.target.value; update(); } }, [["most", "Most songs"], ["name", "A to Z"], ["year", "Newest first"]].map(([v, t]) => el("option", { value: v, selected: f.sort === v }, t)));
  view.replaceChildren(el("div", {},
    el("div", { class: `page-head${o.tools ? " add-page-head" : ""}` }, el("h1", {}, o.title), o.tools),
    o.tabs,
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
function pageArtists(params) {
  pageShelf(params, { page: "artists", title: "Artists", items: artistItems, mosaic: true, placeholder: "Search artists, albums and genres…", many: "Only ones with 2 or more songs", none: "No artists yet.", count: (n) => plural(n, "artist") });
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
function audioLine(c) { // what comparing the audio found. Evidence for you to weigh: nothing goes in because of it
  const a = c.kind === "waiting" ? c.audio : null;
  if (!a) return null;
  if (!a.strong) return el("div", { class: "item-also" }, `Compared with ${plural(a.tried, "video")} on this record. ${a.tried === 1 ? "It isn't" : "None is"} clearly the same recording, which doesn't rule it out.`);
  return el("div", { class: "item-also audio-sure" }, el("b", {}, "Strongly sure: "), "your file and ", el("a", { href: a.url, target: "_blank", rel: "noreferrer noopener" }, "the video on this record"),
    ` are the same recording, start to finish. ${a.option ? "It looks like the version marked below, but the call is yours." : "The video doesn't say which version it is, so that's your call."}`);
}
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
    case "waiting": {
      const sure = check.audio && check.audio.strong ? check.audio.option : "";
      [...(check.options || [])].sort((a, b) => (b.id === sure) - (a.id === sure)).forEach((o) => {
        const c = chip(`It's ${o.pos ? `${o.pos} ` : ""}${o.title}`, act("pick", { note: o.id }), versionNote(o));
        if (o.id === sure) { c.classList.add("sure"); c.prepend(icon("tick", 13)); }
        row.append(c);
      });
      row.append(chip("I know what this is…", ask("Artist - Title", "identify", "note")), chip("Not worth keeping", act("drop")), chip("Leave it for now", act("keep")));
      break;
    }
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
        el("div", { class: "item-why" }, it.c.why), alreadyIn(it.c), recordLine(it.c), audioLine(it.c), spotifyLine(it.c), betterLine(it.c),
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
/* ---------- your own playlists: made here, or brought in from a file ---------- */
function modal(title, build) { // a small box over the page. Esc or a click outside it closes it
  const inner = el("div", { class: "modal-in" }, el("h2", {}, title));
  const box = el("dialog", { class: "modal", "aria-label": title, onclose: () => box.remove(), onclick: (e) => { if (e.target === box) box.close(); } }, inner);
  document.body.append(box);
  fill(inner, {}, build(box));
  box.showModal();
}
function nameBox(title, word, start, save) { // save answers with what went wrong, or nothing
  modal(title, (box) => {
    const said = el("p", { class: "modal-said", role: "alert" });
    const input = el("input", { type: "text", value: start, maxlength: 100, placeholder: "Playlist name", "aria-label": "Playlist name", spellcheck: "false", autocomplete: "off" });
    const go = async () => {
      const name = input.value.trim();
      if (!name) return input.focus();
      const problem = await save(name);
      if (problem) said.textContent = problem; else box.close();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    return [input, said, el("div", { class: "modal-go" }, el("button", { class: "linkish", type: "button", onclick: () => box.close() }, "Cancel"), el("button", { class: "btn primary small", type: "button", onclick: go }, word))];
  });
}
function tookLists(r) { // the app answers every change with your playlists as they are now
  S.meta.own_playlists = r.lists;
  indexLists();
  if (drawerSong) paintPanel();
}
function addToList(ids, what) { // one song or a whole list, into a playlist you have or a new one
  if (!ids.length) return toast("There are no songs to add.");
  const landed = (r, p) => {
    tookLists(r);
    toast(`Added ${plural(r.added, "song")} to ${p.name}.${r.already ? ` ${fmt(r.already)} ${r.already === 1 ? "was" : "were"} already in it.` : ""}`);
    if (new URLSearchParams(location.hash.split("?")[1] || "").get("playlist") === OWN + p.id) route();
  };
  modal(`Add ${what} to a playlist`, (box) => {
    const said = el("p", { class: "modal-said", role: "alert" });
    const name = el("input", { type: "text", maxlength: 100, placeholder: "Name for a new playlist", "aria-label": "Name for a new playlist", spellcheck: "false", autocomplete: "off" });
    const make = async () => {
      if (!name.value.trim()) return name.focus();
      const r = await post("/api/playlists/new", { name: name.value, ids });
      if (r.error) { said.textContent = r.error; return; }
      box.close();
      landed(r, r.made);
    };
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") make(); });
    const rows = (S.meta.own_playlists || []).map((p) => {
      const have = S.lists.get(OWN + p.id), missing = ids.filter((id) => !have.has(id)).length;
      return el("button", { class: "modal-row", type: "button", disabled: !missing, onclick: async () => {
        const r = await post("/api/playlists/add", { list: p.id, ids });
        if (r.error) { said.textContent = r.error; return; }
        box.close();
        landed(r, p);
      } }, el("span", {}, p.name), missing === ids.length ? null : el("em", {}, !missing ? "already in" : `${fmt(ids.length - missing)} already in`));
    });
    return [el("div", { class: "inline-form" }, name, el("button", { class: "btn small", type: "button", onclick: make }, "Make it")), rows.length ? el("div", { class: "modal-list" }, rows) : null, said];
  });
}
const listButton = (ids, what) => el("button", { class: "btn small", type: "button", onclick: () => addToList(ids, what) }, icon("plus", 14), "Add to playlist");
const newListButton = () => el("button", { class: "btn primary small", type: "button", onclick: () => nameBox("New playlist", "Make it", "", async (name) => {
  const r = await post("/api/playlists/new", { name });
  if (r.error) return r.error;
  tookLists(r);
  location.hash = `#/songs?${q2({ playlist: OWN + r.made.id, area: "all" })}`;
  return "";
}) }, icon("plus", 14), "New playlist");
const IMPORT_MOST_BYTES = 7 << 20; // the app takes 8 MB at a time, and sending a file makes it a little longer
let lastImport = null; // what the last import found, for the page it repaints
async function playlistText(file) { // an .m3u8 is UTF-8. Older .m3u files are mostly in the Windows encoding
  const bytes = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return new TextDecoder("windows-1252").decode(bytes); }
}
function importedLine(r) {
  if (r.error) return el("p", { class: "import-one" }, r.error.includes(r.name) ? r.error : `${r.name}: ${r.error}`);
  const lost = r.total - r.found;
  return el("div", { class: "import-one" }, el("a", { class: "fact-link", href: `#/songs?${q2({ playlist: OWN + r.made.id, area: "all" })}` }, r.made.name), ` · found ${fmt(r.found)} of ${plural(r.total, "song")}`,
    lost ? el("details", { class: "twin" }, el("summary", {}, `Show the ${plural(lost, "song")} it couldn't find`),
      el("div", { class: "scroll" }, el("ul", { class: "away-list" }, r.missing.map((name) => el("li", {}, name)), r.more ? el("li", {}, `and ${fmt(r.more)} more`) : null))) : null);
}
function playlistImporter() { // only the text of the file goes to the app, which matches its lines to songs it already knows
  const said = lastImport ? el("section", { class: "card import-said" }, el("h2", {}, "Imported"), lastImport.map(importedLine)) : null;
  lastImport = null;
  const input = el("input", { type: "file", accept: ".m3u,.m3u8", multiple: true, hidden: true, "aria-label": "Playlist files to import", onchange: async () => {
    const files = [...input.files], got = [];
    input.value = ""; // so the same file can be chosen again
    button.disabled = true;
    for (const file of files) {
      const name = file.name.replace(/\.m3u8?$/i, "");
      const r = file.size > IMPORT_MOST_BYTES ? { error: `${name} is too big to import.` } : await post("/api/playlists/import", { name, text: await playlistText(file) });
      if (r.lists) S.meta.own_playlists = r.lists;
      got.push({ name, ...r });
    }
    indexLists();
    lastImport = got;
    route();
  } });
  const button = el("button", { class: "btn small", type: "button", title: "Bring in .m3u or .m3u8 playlists from another player", onclick: () => input.click() }, icon("import", 14), "Import");
  return { input, button, said };
}
function pageAdd(params) {
  const shelves = playlistItems(), chores = playlistChores(), sp = S.meta.spotify || {}, tabbed = sp.ready || chores, listening = !tabbed || params.get("tab") !== "todo";
  const tabs = tabbed ? el("div", { class: "pills" },
    el("a", { class: `pill${listening ? " on" : ""}`, href: "#/add" }, "Your playlists", el("b", {}, fmt(shelves.length))),
    el("a", { class: `pill${listening ? "" : " on"}`, href: "#/add?tab=todo" }, "To add and remove", chores ? el("b", {}, fmt(chores)) : null)) : null;
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
  const shown = (iso) => (iso.slice(0, 10) === new Date().toLocaleDateString("sv") ? iso.slice(11, 16) : iso.slice(0, 16).replace("T", " "));
  const said = el("span", { class: "sub" }, sp.wait_until ? `Spotify asked to wait until ${shown(sp.wait_until)}` : sp.checked ? `Last checked ${shown(sp.checked)}` : "");
  const checking = el("span", {}, "Check Spotify");
  const checker = sp.ready ? el("button", { class: "btn small", type: "button", disabled: !!sp.wait_until, onclick: async () => {
    checker.disabled = true;
    checking.textContent = "Checking…";
    said.textContent = "If a Spotify tab opens, approve it there.";
    const r = await post("/api/spotify/check", {});
    if (await safeLoad()) { route(); toast(r.message || r.error || "Checked."); }
  } }, icon("refresh", 14), checking) : null;
  if (listening) {
    const filled = shelves.filter((x) => x.songs.length).length, saver = playlistSaver(filled), importer = playlistImporter();
    return pageShelf(params, { page: "add", title: "Playlists", items: () => shelves, mosaic: true, placeholder: "Search playlists, artists and genres…", none: sp.ready ? "No playlists yet. Make one, import one from another player, or press Check Spotify to bring yours in." : "No playlists yet. Make one, or import one from another player.", tabs: [tabs, saver.panel, importer.said],
      tools: el("div", { class: "add-check" }, checker ? said : null, checker, filled ? saver.toggle : null, importer.input, importer.button, newListButton()), count: (n) => plural(n, "playlist") });
  }
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
    tabs,
    !shelves.length && sp.ready ? el("p", { class: "note" }, "Press Check Spotify once to play your playlists here.") : null,
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
const answersToRun = () => Object.entries(S.decisions).filter(([k, d]) => k.startsWith("waiting:inbox/") && /\.(mp3|flac|m4a)$/i.test(k) && S.songs.some((s) => `waiting:${s.key}` === k && !s.done) && (d.action === "pick" || (d.action === "identify" && /\s[-–—]\s/.test(d.note || "")))).length;
function lastRunWords(r) {
  return `${r.stopped ? "Stopped early. " : ""}Added ${plural(r.added, "song")}${r.waiting ? `, ${fmt(r.waiting)} waiting for you` : ""}.${r.strong ? ` ${fmt(r.strong)} of those ${r.strong === 1 ? "has" : "have"} a strong audio match for you to confirm.` : ""}${r.said ? ` ${r.said}` : ""}`;
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
  [/\bdamaged\b/i, "Damaged file"], [/wasn't looked up/i, "Mixes, nightcore and the like"], [/longer|shorter/i, "Length doesn't match"], [/file says|only lists/i, "Mix name doesn't match"],
  [/versions on the record/i, "Several versions"], [/but not this track/i, "Artist found, not this song"], [/not found on discogs/i, "Not on Discogs"],
  [/already in your library/i, "Already in your library"], [/only mp3/i, "File type not supported"], [/discogs (couldn't|answered)/i, "Couldn't reach Discogs"],
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
function compareSetting() { // only there for people who have what it needs
  const box = el("div");
  fetch("/api/settings/compare", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((c) => {
    if (!c || !c.available) return;
    const input = el("input", { type: "checkbox", checked: !!c.on, onchange: async () => {
      input.disabled = true;
      const r = await post("/api/settings/compare", { on: input.checked });
      input.disabled = false;
      if (r.error) { input.checked = !input.checked; toast(r.error); }
    } });
    box.replaceChildren(el("div", { class: "card compare-setting" }, el("h2", {}, "Comparing audio"),
      el("label", { class: "pick" }, input, "When Curate can't tell which version a song is, compare it with the videos on the record"),
      el("p", { class: "note" }, "It fetches the video linked on the record, compares it with your file, and deletes it straight after. It never adds a song by itself: To check tells you when it's strongly sure, and you decide.")));
  });
  return box;
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
    compareSetting(),
    el("dl", { class: "facts-list about" },
      st.app_folder ? [el("dt", {}, "App files"), el("dd", {}, st.app_folder)] : null,
      el("dt", {}, "Settings file"), el("dd", {}, st.config_file))));
}

/* ---------- song drawer ---------- */
const sourceName = (link) => (/discogs/.test(link) ? "Open on Discogs" : /musicbrainz/.test(link) ? "Open on MusicBrainz" : /youtu/.test(link) ? "Open the upload" : "Open the source");
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
function recordSongs(s) { // the songs from this song's record that are in the library
  if (!s.album) return [];
  const k = fold(s.album).trim(), names = artistsOf(s);
  return S.lib.filter((x) => fold(x.album).trim() === k && (x.id === s.id || (s.link && x.link === s.link) || artistsOf(x).some((a) => names.includes(a)))).sort(byTitle);
}
const trackRow = (x, number, on, mixed, go, remove) => el("div", { class: `track${on ? " on" : ""}` },
  el("button", { class: "track-go", type: "button", title: songName(x), "aria-current": on ? "true" : null, onclick: go },
    el("span", { class: "track-n" }, on ? icon("play", 12) : number),
    el("span", { class: "track-name" }, (mixed ? songName(x) : x.title) || x.file),
    el("span", { class: "track-len" }, clock(x.secs))),
  remove ? el("button", { class: "track-x", type: "button", title: "Remove from the queue", "aria-label": `Remove ${x.title || x.file} from the queue`, onclick: remove }, icon("x", 13)) : null);
function queueList(s) { // what's playing and what's coming, only on the panel of the song that's playing
  const now = current();
  if (!now || now.id !== s.id || P.queue.length < 2) return null;
  const big = P.queue.length > 60, from = big ? Math.max(0, P.i - 1) : 0, to = big ? Math.min(P.queue.length, P.i + 40) : P.queue.length; // a whole library is too long to list
  const mixed = new Set(P.queue.map((id) => (S.byId.get(id) || {}).artist)).size > 1, rows = [];
  for (let k = from; k < to; k++) {
    const x = S.byId.get(P.queue[k]);
    if (x) rows.push(trackRow(x, k + 1, k === P.i, mixed, () => { P.i = k; loadCurrent(); }, k === P.i ? null : () => removeFromQueue(k)));
  }
  return [el("h3", { class: "queue-head" }, `${P.label && P.label !== "Shuffle" ? P.label : "Up next"} · ${plural(P.queue.length, "song")}`,
    P.i < P.queue.length - 1 ? el("button", { class: "linkish", type: "button", onclick: clearUpcoming }, "Clear what's next") : null),
  el("div", { class: "tracks" }, rows)];
}
function recordList(s) { // the album this song is on, unless that's already what's playing
  const songs = recordSongs(s), now = current();
  if (songs.length < 2 || (now && now.id === s.id && P.label && fold(P.label).trim() === fold(s.album).trim())) return null;
  const ids = songs.map((x) => x.id), mixed = new Set(songs.map((x) => x.artist)).size > 1;
  return [el("h3", {}, `${s.album} · ${plural(songs.length, "song")}`),
    el("div", { class: "tracks" }, songs.slice(0, 200).map((x, i) => trackRow(x, i + 1, !!now && now.id === x.id, mixed, () => playQueue(ids, i, s.album))))];
}
const queueButtons = (ids) => [
  el("button", { class: "btn small", type: "button", onclick: () => enqueue(ids, true) }, icon("upnext", 14), "Play next"),
  el("button", { class: "btn small", type: "button", onclick: () => enqueue(ids) }, icon("listadd", 14), "Add to queue")];
function paintPanel() {
  paintNowQueue();
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
    ["Quality", [(/\.(flac|m4a|aac|ogg|opus|wav)$/i.exec(s.file) || [])[1]?.toUpperCase(), s.kbps ? `${s.kbps} kbps` : ""].filter(Boolean).join(" · ")], ["Size", `${(s.bytes / 1e6).toFixed(1)} MB`],
    ["Where", s.area === "library" ? [S.meta.library, s.folder].filter(Boolean).join(" / ") : s.area === "review" ? ["Review", s.folder].filter(Boolean).join(" / ") : s.where],
    ["File", s.file], ["Added", s.added ? s.added.replace("T", " ").slice(0, 16) : ""], ["Played", playedWords(s)], ["In your playlists", (S.inOwn.get(s.id) || []).join(", ")], ["On your Spotify lists", (S.inSpotify.get(s.id) || []).join(", ")], ["Loudness", typeof s.lufs === "number" ? `${s.lufs.toFixed(1)} LUFS` : ""]].filter(([, v]) => v);
  const linkName = sourceName(s.link);
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
    el("div", { class: `sleeve${isNow ? " now" : ""}` }, disc(isNow ? s : null), coverEl(s)), el("h2", {}, s.title), el("div", { class: "by" }, s.artist),
    el("div", { class: "actions" },
      isNow ? null : el("button", { class: "btn primary small", type: "button", onclick: () => (S.list.includes(s.id) ? playFrom(s.id) : playQueue([s.id], 0, "")) }, icon("play", 14), "Play"),
      isNow ? null : queueButtons([s.id]),
      listButton([s.id], songName(s) || s.file),
      s.link ? el("a", { class: "btn small", href: s.link, target: "_blank", rel: "noreferrer noopener" }, icon("link", 14), linkName) : null,
      shop ? el("a", { class: "btn small", href: shop.href, target: "_blank", rel: "noreferrer noopener" }, icon(shop.icon, 14), shop.label) : null),
    queueList(s), recordList(s),
    el("dl", { class: "facts-list" }, facts.map(([k, v]) => [el("dt", {}, k), el("dd", k === "Played" ? { dataset: { plays: s.id } } : {}, k === "Album" || k === "Label" ? el("a", { class: "fact-link", href: `#/songs?${q2({ [k.toLowerCase()]: v })}` }, v) : v)])),
    s.area === "library" ? [el("h3", {}, "How sure"), el("div", { class: "box" }, trustTag(s), el("div", { class: "note" }, t.long), s.notes ? el("div", { class: "item-why" }, s.notes) : null)] : null,
    s.was && s.was !== s.file ? [el("h3", {}, "Your file was called"), el("div", { class: "box" }, s.was)] : null,
    checks.length ? [el("h3", {}, "To check"), checks.map((c) => el("div", { class: "box" }, el("strong", {}, KINDS[c.kind].label), el("div", { class: "item-why" }, c.why), alreadyIn(c), recordLine(c), audioLine(c), spotifyLine(c), betterLine(c),
      controls(s, c, (advance) => { if (advance && S.listen && current() && current().id === s.id) step(1); })))] : null,
    el("div", { class: "hintbar" }, flagBox)]);
  drawer.classList.toggle("fresh", paintedSong !== drawerSong); // only a new song arrives with motion, not a repaint of the same one
  if (paintedSong !== drawerSong) { drawer.scrollTop = 0; paintedSong = drawerSong; }
  const playingRow = drawer.querySelector(".track.on");
  if (playingRow) playingRow.parentElement.scrollTop = playingRow.offsetTop - playingRow.parentElement.clientHeight / 3; // keep it in view on a long list
}

/* ---------- now playing: the whole window for what's on ---------- */
let beforeNow = "#/", openNext = ""; // openNext is a song for the panel once the page has changed: route() decides about the panel, so it has to be told
const onNowPage = () => location.hash.replace(/^#\/?/, "").split("?")[0] === "now";
function openNow() { if (!onNowPage()) { beforeNow = location.hash || "#/"; location.hash = "#/now"; } }
const closeNow = () => { location.hash = beforeNow; };
function paintNowQueue() { // on its own, so changing the queue doesn't pull the record back into its sleeve
  const box = $("#now-queue"), s = current();
  if (!box) return;
  box.replaceChildren(...[(s && queueList(s)) || el("p", { class: "note" }, "Nothing after this song.")].flat().filter(Boolean));
  const on = box.querySelector(".track.on");
  if (on) on.parentElement.scrollTop = on.offsetTop - on.parentElement.offsetTop - 8;
}
function pageNow() {
  const s = current(), close = el("button", { class: "icon-btn now-close", type: "button", title: "Close (Esc)", "aria-label": "Close Now Playing", onclick: closeNow }, icon("chevron", 22));
  if (!s) return view.replaceChildren(el("div", { class: "now-page now-nothing" }, close, el("div", { class: "cover vinyl" }), el("p", {}, "Nothing playing yet."),
    S.lib.length ? el("button", { class: "btn primary", type: "button", onclick: () => playQueue(shuffled(S.lib).map((x) => x.id), 0, "Shuffle") }, icon("shuffle", 16), "Play something") : null));
  const songs = (o) => `#/songs?${q2(o)}`, dot = () => el("span", { class: "now-dot" }, "·");
  const place = el("input", { type: "range", min: 0, max: 1000, value: 0, "aria-label": "Position in the song" });
  wireSeek(place);
  const about = [s.album ? el("a", { href: songs({ album: s.album }) }, s.album) : null, s.year ? el("a", { href: songs({ from: s.year, to: s.year }) }, s.year) : null, s.genre ? el("a", { href: songs({ genre: s.genre }) }, s.genre) : null, s.label ? el("a", { href: songs({ label: s.label }) }, s.label) : null].filter(Boolean);
  view.replaceChildren(el("div", { class: "now-page" }, close,
    el("div", { class: "now-stage" },
      el("div", { class: "sleeve now" }, disc(s), coverEl(s)),
      el("div", { class: "now-info" },
        el("div", { class: "eyebrow" }, P.label && P.label !== "Shuffle" ? P.label : "Now playing"),
        el("h1", {}, s.title || s.file),
        el("div", { class: "by" }, artistsOf(s).flatMap((a, i) => [i ? " & " : "", el("a", { href: songs({ artist: a }) }, a)])),
        el("div", { class: "now-about" }, about.flatMap((a, i) => (i ? [dot(), a] : [a]))),
        el("div", { class: "actions" }, el("button", { class: "btn small", type: "button", onclick: () => { openNext = s.id; closeNow(); } }, "Song details"), listButton([s.id], songName(s) || s.file), s.link ? el("a", { class: "btn small", href: s.link, target: "_blank", rel: "noreferrer noopener" }, icon("link", 14), sourceName(s.link)) : null)),
      el("div", { class: "wave-box wave-big", dataset: { bars: 300 } }, waveShape("wave-rest"), waveShape("wave-done"), place)),
    el("div", { class: "now-queue", id: "now-queue" })));
  paintNowQueue();
  showPlace(audio.duration ? audio.currentTime / audio.duration : 0);
  paintWave();
}

/* ---------- the background takes its colors from what's playing ---------- */
const ambient = (() => { // a tiny picture stretched over the window: it looks blurred, and moving it costs next to nothing, unlike a real blur
  const SIZE = 64, THUMB = 9, CAP = 112, FLOOR = 190; // how bright (dark theme) or how dark (light theme) it may get: the words on top have to stay readable
  const box = el("div", { class: "ambient", "aria-hidden": "true" }), layers = [0, 1].map(() => el("canvas", { width: SIZE, height: SIZE }));
  box.append(...layers, el("div", { class: "ambient-scrim" }));
  document.body.prepend(box);
  const thumb = el("canvas", { width: THUMB, height: THUMB });
  let front = 0, turn = 0;
  function paint(canvas, img) {
    const small = thumb.getContext("2d", { willReadFrequently: true }), big = canvas.getContext("2d", { willReadFrequently: true });
    small.drawImage(img, 0, 0, THUMB, THUMB);
    big.imageSmoothingEnabled = true;
    big.imageSmoothingQuality = "high";
    big.drawImage(thumb, 0, 0, SIZE, SIZE);
    const picture = big.getImageData(0, 0, SIZE, SIZE), d = picture.data, light = document.documentElement.dataset.theme === "light";
    for (let i = 0; i < d.length; i += 4) {
      const grey = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
      const scale = light ? 1 : grey > CAP ? CAP / grey : 1, lift = light && grey < FLOOR ? FLOOR - grey : 0;
      for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, Math.max(0, (grey + (d[i + c] - grey) * 1.55) * scale + lift)); // richer color, within those limits
    }
    big.putImageData(picture, 0, 0);
  }
  return (s) => {
    const mine = ++turn;
    if (!s || !s.cover) { layers.forEach((l) => l.classList.remove("on")); box.classList.remove("lit"); return; } // back to the usual background
    const img = new Image();
    img.onload = () => {
      if (mine !== turn) return;
      try { paint(layers[1 - front], img); } catch { return; }
      layers[1 - front].classList.add("on");
      layers[front].classList.remove("on");
      box.classList.add("lit");
      front = 1 - front;
    };
    img.src = coverUrl(s);
  };
})();

/* ---------- player ---------- */
const audio = $("#audio");
const P = { queue: [], i: -1, label: "", original: null, shuffle: false, repeat: "off" }; // original: the order to go back to when shuffle goes off
const current = () => S.byId.get(P.queue[P.i]);
let dragging = false;
function playQueue(ids, start, label) {
  if (label !== "To check") S.listen = false;
  const list = [...ids]; // its own copy: the queue changes, the list it came from doesn't
  P.label = label || "";
  if (P.shuffle && list.length > 1 && label !== "To check" && label !== "Shuffle") {
    P.original = list;
    P.queue = [list[start], ...shuffled(list.filter((_, k) => k !== start))];
    P.i = 0;
  } else {
    P.original = null;
    P.queue = list;
    P.i = start;
  }
  loadCurrent();
}
function playAll(songs, label) { // a whole album or label: with shuffle on, it shouldn't always start on the same song
  playQueue(songs.map((s) => s.id), P.shuffle ? Math.floor(Math.random() * songs.length) : 0, label);
}
function enqueue(ids, next) { // right after this song, or at the end
  if (!current()) return playQueue(ids, 0, "");
  const playing = P.queue[P.i], fresh = [...new Set(ids)].filter((id) => id !== playing);
  if (!fresh.length) return toast("That's what's playing.");
  const moving = new Set(fresh), without = (list) => list.filter((id) => !moving.has(id));
  P.i = without(P.queue.slice(0, P.i)).length;
  P.queue = without(P.queue);
  P.queue.splice(next ? P.i + 1 : P.queue.length, 0, ...fresh);
  if (P.original) {
    P.original = without(P.original);
    P.original.splice(next ? P.original.indexOf(playing) + 1 : P.original.length, 0, ...fresh);
  }
  toast(next ? `${plural(fresh.length, "song")} playing next.` : `${plural(fresh.length, "song")} added to the queue.`);
  paintPanel();
  saveSpot();
  if (audio.ended) step(1); // the queue had run out: carry on
}
function removeFromQueue(k) {
  const [id] = P.queue.splice(k, 1);
  if (k < P.i) P.i--;
  if (P.original) P.original = P.original.filter((x) => x !== id);
  paintPanel();
  saveSpot();
}
function clearUpcoming() {
  const gone = new Set(P.queue.splice(P.i + 1));
  if (P.original) P.original = P.original.filter((x) => !gone.has(x));
  paintPanel();
  saveSpot();
}
function setShuffle(on) {
  P.shuffle = on;
  store("curator-shuffle", on ? "1" : "");
  const id = P.queue[P.i];
  if (id !== undefined && P.queue.length > 1 && P.label !== "To check") {
    if (on) {
      P.original = [...P.queue];
      P.queue = [...P.queue.slice(0, P.i + 1), ...shuffled(P.queue.slice(P.i + 1))]; // what's already played stays where it is
    } else if (P.original) {
      P.queue = P.original;
      P.original = null;
      P.i = P.queue.indexOf(id);
    }
    paintPanel();
    saveSpot();
  }
  paintModes();
}
function setRepeat(mode) {
  P.repeat = mode;
  store("curator-repeat", mode);
  paintModes();
}
function paintModes() {
  const s = $("#shuffle"), r = $("#repeat"), words = { off: "Repeat", all: "Repeating the list", one: "Repeating this song" };
  s.classList.toggle("active", P.shuffle);
  s.setAttribute("aria-pressed", String(P.shuffle));
  s.title = P.shuffle ? "Shuffle is on" : "Shuffle";
  r.classList.toggle("active", P.repeat !== "off");
  r.classList.toggle("one", P.repeat === "one");
  r.title = words[P.repeat];
  r.setAttribute("aria-label", words[P.repeat]);
}
let resumeAt = 0, lastSaved = 0;
function saveSpot() { // where you are, so a reload or tomorrow picks up from here
  if (!P.queue.length) return;
  lastSaved = performance.now();
  store("curator-player", JSON.stringify({ queue: P.queue.slice(0, 8000), i: P.i, label: P.label, original: P.original ? P.original.slice(0, 8000) : null, at: Math.floor(audio.currentTime || resumeAt || 0) }));
}
function restoreSpot() {
  let saved = null;
  try { saved = JSON.parse(store("curator-player") || "null"); } catch { saved = null; }
  if (!saved || !Array.isArray(saved.queue)) return;
  const id = saved.queue[saved.i];
  if (!S.byId.has(id)) return; // moved or deleted since
  const known = (list) => list.filter((x) => S.byId.has(x));
  P.queue = known(saved.queue);
  P.i = P.queue.indexOf(id);
  P.label = typeof saved.label === "string" ? saved.label : "";
  P.original = Array.isArray(saved.original) ? known(saved.original) : null;
  loadCurrent(false, +saved.at || 0);
}
function playFrom(id) {
  const i = S.list.indexOf(id);
  i >= 0 ? playQueue(S.list, i, "") : playQueue([id], 0, "");
}
function step(d) {
  let n = P.i + d;
  if (P.repeat === "all" && P.queue.length) n = (n + P.queue.length) % P.queue.length; // round again
  if (!P.queue.length || n < 0 || n >= P.queue.length) { audio.pause(); return; }
  P.i = n;
  loadCurrent();
  if (S.listen) { const card = document.querySelector(`.item[data-song="${current().id}"]`); if (card) card.scrollIntoView({ block: "center", behavior: "smooth" }); }
}
/* A play counts once you've really listened to half the song, or 4 minutes if that comes first. Seeking doesn't add to it. */
const heard = { secs: 0, at: null, counted: false };
let playsWarned = false;
function listenAgain() { heard.secs = 0; heard.at = null; heard.counted = false; }
const playedWords = (s) => (s.plays ? `${plural(s.plays, "time")}, last ${s.played.replace("T", " ").slice(0, 16)}` : "Not yet");
function countListening() {
  const t = audio.currentTime, gap = heard.at === null ? 0 : t - heard.at;
  heard.at = t;
  if (audio.paused || audio.seeking || gap <= 0 || gap >= 2) return; // a jump or a stall isn't listening
  heard.secs += gap;
  const s = current();
  if (heard.counted || !s || !audio.duration || heard.secs < Math.min(240, audio.duration / 2)) return;
  heard.counted = true;
  post("/api/played", { id: s.id }).then((r) => {
    if (r.error) { if (!playsWarned) toast(r.error); playsWarned = true; return; }
    s.plays = r.plays; s.played = r.played;
    document.querySelectorAll(`td[data-plays="${s.id}"]`).forEach((n) => { n.textContent = fmt(s.plays); });
    document.querySelectorAll(`dd[data-plays="${s.id}"]`).forEach((n) => { n.textContent = playedWords(s); });
  });
}
function loadCurrent(autoplay = true, at = 0) {
  const s = current();
  if (!s) return;
  resumeAt = at; // set on every load, so a spot that was never reached can't land on the next song
  listenAgain();
  matchLevel(s);
  audio.src = `/audio/${s.id}`;
  if (autoplay) audio.play().catch(() => {});
  $("#np-title").textContent = s.title || s.file;
  $("#np-title").title = songName(s);
  $("#np-artist").textContent = P.label ? `${s.artist} · ${P.label}` : s.artist;
  const c = $("#np-cover");
  c.replaceChildren(); c.className = `cover${s.cover ? "" : " vinyl"}`;
  if (s.cover) c.append(el("img", { src: coverUrl(s), alt: "" }));
  ["#play", "#prev", "#next", "#seek"].forEach((x) => ($(x).disabled = false));
  showPlace(0);
  paintWave();
  learnWave(S.byId.get(P.queue[P.i + 1])); // ready before it's needed
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, album: s.album, artwork: s.cover ? [{ src: coverUrl(s), sizes: "512x512" }] : [] });
  markPlaying();
  $(".np").classList.add("ready");
  ambient(s);
  followPlaying();
  if (onNowPage()) pageNow();
  saveSpot();
}
function markPlaying() {
  const id = current() ? current().id : null;
  document.querySelectorAll("[data-song]").forEach((n) => n.classList.toggle("playing", n.dataset.song === id));
}
let smoothnessChecked = false;
function checkSmoothness() { // moving a whole window's background is easy with a graphics card and hard without one: if it's slow here, update it less often
  if (smoothnessChecked) return;
  smoothnessChecked = true;
  setTimeout(() => {
    if (document.hidden) { smoothnessChecked = false; return; } // a hidden page proves nothing: look again next time
    let frames = 0, first = 0;
    const count = (t) => {
      first = first || t;
      frames++;
      if (t - first < 1500) return requestAnimationFrame(count);
      if (frames / ((t - first) / 1000) < 45) { document.body.classList.add("gentle"); gentleMotion(); }
    };
    requestAnimationFrame(count);
  }, 2500); // after the colors have finished fading in
}
let gentleTimer = 0, gentleTick = 0, lastScroll = 0;
view.addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });
function gentleMotion() { // a running CSS animation makes the browser redraw the whole window every frame, so on a slow machine things get moved from here, a few times a second
  const body = document.body, on = body.classList.contains("gentle") && body.classList.contains("is-playing") && !document.hidden;
  if (!on) { clearInterval(gentleTimer); gentleTimer = 0; return; }
  if (gentleTimer) return;
  gentleTimer = setInterval(() => {
    if (performance.now() - lastScroll < 400) return; // scrolling comes first
    gentleTick++;
    const label = $(".sleeve.now .disc-label");
    if (label) label.style.transform = `rotate(${(gentleTick * 16) % 360}deg)`;
    if (gentleTick % 2) return; // the background only needs half as many
    const turn = (gentleTick * 0.65) % 360, grow = 1.31 + 0.11 * Math.sin((gentleTick * Math.PI) / 280);
    document.querySelectorAll(".ambient canvas.on").forEach((c) => { c.style.transform = `rotate(${turn}deg) scale(${grow.toFixed(3)})`; });
  }, 125);
}
document.addEventListener("visibilitychange", gentleMotion);
function paintPlay() {
  const paused = audio.paused;
  if (!paused) checkSmoothness();
  $("#play").replaceChildren(icon(paused ? "play" : "pause", 18));
  $("#play").setAttribute("aria-label", paused ? "Play" : "Pause");
  document.body.classList.toggle("is-playing", !paused);
  gentleMotion();
}
function fillRange(input) {
  const part = `${((input.value - input.min) / (input.max - input.min)) * 100}%`, box = input.closest(".wave-box");
  input.style.setProperty("--v", part);
  if (box) box.style.setProperty("--v", part); // the played part of the shape goes by this too
}
/* The shape of the song. A vector stretched to fit, so it needs no redrawing when the window changes, and the page's colors apply to it. */
const waveShape = (kind) => svg("svg", { class: `wave ${kind}`, preserveAspectRatio: "none", "aria-hidden": "true" }, svg("path", {}));
function showPlace(part) { document.querySelectorAll(".wave-box input").forEach((bar) => { bar.value = part * 1000; fillRange(bar); }); }
function wireSeek(bar) {
  bar.addEventListener("input", () => { dragging = true; showPlace(bar.value / 1000); if (audio.duration) $("#cur").textContent = clock((bar.value / 1000) * audio.duration); });
  bar.addEventListener("change", () => { if (audio.duration) audio.currentTime = (bar.value / 1000) * audio.duration; dragging = false; });
}
function wavePath(wave, bars) { // as many bars as fit, mirrored around the middle
  let d = "";
  for (let x = 0; x < bars; x++) {
    const from = Math.floor((x * wave.length) / bars), to = Math.max(from + 1, Math.floor(((x + 1) * wave.length) / bars));
    const h = Math.max(4, sum(wave.slice(from, to)) / (to - from));
    d += `M${x} ${(100 - h) / 2}h.72v${h}h-.72z`;
  }
  return d;
}
function paintWave() {
  const s = current(), wave = s && s.wave;
  document.querySelectorAll(".wave-box").forEach((box) => {
    box.classList.toggle("has-wave", !!wave);
    if (!wave) return;
    const bars = +box.dataset.bars, d = wavePath(wave, bars);
    box.querySelectorAll("svg").forEach((shape) => { shape.setAttribute("viewBox", `0 0 ${bars} 100`); shape.firstChild.setAttribute("d", d); });
  });
  learnWave(s); // not known yet: a new song, or the library has just been read again
}
async function learnWave(s) { // measured the first time it's needed, then kept
  if (!s || s.wave !== undefined || s.askedWave) return;
  s.askedWave = true;
  const r = await fetch(`/api/waveform/${s.id}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  s.askedWave = false;
  if (!r) return;
  (S.byId.get(s.id) || s).wave = r.wave; // the library may have been read again while this was measured, and then these are new objects
  const now = current();
  if (now && now.id === s.id) paintWave();
}
const togglePlay = () => { if (!audio.src) return; audio.paused ? audio.play().catch(() => {}) : audio.pause(); };
audio.addEventListener("play", paintPlay);
audio.addEventListener("pause", () => { paintPlay(); saveSpot(); });
window.addEventListener("pagehide", saveSpot);
const startOver = () => { audio.currentTime = 0; listenAgain(); };
audio.addEventListener("ended", () => { if (P.repeat === "one") { startOver(); audio.play().catch(() => {}); } else step(1); });
audio.addEventListener("error", () => { if (audio.getAttribute("src")) toast("This file can't be played in the browser."); });
audio.addEventListener("timeupdate", () => {
  countListening();
  if (dragging || !audio.duration) return;
  showPlace(audio.currentTime / audio.duration);
  $("#cur").textContent = clock(audio.currentTime);
  if (performance.now() - lastSaved > 4000) saveSpot();
});
audio.addEventListener("loadedmetadata", () => {
  $("#dur").textContent = clock(audio.duration);
  if (resumeAt && resumeAt < audio.duration - 2) audio.currentTime = resumeAt;
  resumeAt = 0;
});
$("#seek").before(waveShape("wave-rest"), waveShape("wave-done"));
wireSeek($("#seek"));
$("#play").addEventListener("click", togglePlay);
$("#prev").addEventListener("click", () => (audio.currentTime > 4 ? startOver() : step(-1)));
$("#next").addEventListener("click", () => step(1));
$(".np").addEventListener("click", () => { if (current()) openDrawer(current().id); }); // the title inside is the keyboard's way in
$("#np-cover").addEventListener("click", (e) => { e.stopPropagation(); if (current()) (onNowPage() ? closeNow() : openNow()); });
$("#now-toggle").append(icon("expand", 17));
$("#now-toggle").addEventListener("click", () => (onNowPage() ? closeNow() : openNow()));
$("#panel-toggle").append(icon("panel", 18));
$("#panel-toggle").addEventListener("click", () => setPanel(!panelShown()));
roomy.addEventListener("change", () => { overlayOpen = false; showPanel(); });
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; }
/* Even volume only ever turns songs down. Nearly every file already reaches full scale (57 of 65 measured on one real library), so raising a quiet one would distort it.
   So the level is set in the middle, not at the quietest song: louder songs come down to it, quieter ones stay as they are. */
const LEVEL_TARGET = -12, LEVEL_USUAL = -10.5; // LUFS. The second is what to assume about a song until it has been measured
let evenOn = store("curator-even") === "on", volGain = 1, gainFade = 0;
function setVolume() { audio.volume = Math.max(0, Math.min(1, +$("#vol").value * volGain)); }
function gainFor(s) {
  if (!evenOn) return 1;
  return Math.min(1, 10 ** ((LEVEL_TARGET - (s && typeof s.lufs === "number" ? s.lufs : LEVEL_USUAL)) / 20));
}
function fadeGain(to) { // a level can arrive once the song has started: slide there, don't jump
  clearInterval(gainFade);
  const from = volGain;
  let n = 0;
  gainFade = setInterval(() => { n++; volGain = from + ((to - from) * n) / 12; setVolume(); if (n >= 12) clearInterval(gainFade); }, 30);
}
async function learnLevel(s) { // measured the first time it's needed, then kept
  if (!evenOn || !s || typeof s.lufs === "number" || s.askedLevel) return;
  s.askedLevel = true;
  const r = await fetch(`/api/loudness/${s.id}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!r) { s.askedLevel = false; return; }
  const song = S.byId.get(s.id) || s, now = current(); // the library may have been read again while this was measured, and then these are new objects
  if (typeof r.lufs === "number") song.lufs = r.lufs;
  if (now && now.id === s.id) fadeGain(gainFor(song));
}
function matchLevel(s) {
  clearInterval(gainFade);
  volGain = gainFor(s);
  setVolume();
  learnLevel(s);
  learnLevel(S.byId.get(P.queue[P.i + 1])); // ready before it's needed
}
function paintEven() {
  const b = $("#even");
  b.classList.toggle("active", evenOn);
  b.setAttribute("aria-pressed", String(evenOn));
  b.title = evenOn ? "Even volume is on: loud songs are turned down to match the rest" : "Even volume is off: every song plays at its own level";
}
function setEven(on) {
  evenOn = on;
  store("curator-even", on ? "on" : "off");
  paintEven();
  const s = current();
  fadeGain(gainFor(s));
  learnLevel(s);
  learnLevel(S.byId.get(P.queue[P.i + 1]));
}
$("#vol").value = store("curator-volume") || 0.8;
setVolume();
fillRange($("#vol"));
$("#vol").addEventListener("input", (e) => { setVolume(); fillRange(e.target); store("curator-volume", e.target.value); });
$("#even").append(icon("even", 17));
$("#even").addEventListener("click", () => setEven(!evenOn));
paintEven();
if ("mediaSession" in navigator) {
  navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
  navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
}

/* ---------- frame ---------- */
const NAV = [["home", "Overview", "home", "#/"], ["songs", "Songs", "music", "#/songs"], ["artists", "Artists", "user", "#/artists"], ["albums", "Albums", "disc", "#/albums"], ["labels", "Labels", "tag", "#/labels"], ["check", "To check", "ears", "#/check"], ["add", "Playlists", "listadd", "#/add"], ["progress", "Progress", "bars", "#/progress"]];
$("#rail-links").replaceChildren(...NAV.map(([k, label, ic, href]) => el("a", { class: "nav", href, dataset: { page: k } }, icon(ic, 18), label, k === "check" || k === "add" ? el("span", { class: "count", id: `${k}-count` }) : null)));
$("#vol-icon").append(icon("vol", 16));
$("#prev").append(icon("prev", 20));
$("#next").append(icon("next", 20));
$("#shuffle").append(icon("shuffle", 15));
$("#repeat").append(icon("repeat", 15));
$("#shuffle").addEventListener("click", () => setShuffle(!P.shuffle));
$("#repeat").addEventListener("click", () => setRepeat({ off: "all", all: "one", one: "off" }[P.repeat]));
P.shuffle = store("curator-shuffle") === "1";
P.repeat = ["all", "one"].includes(store("curator-repeat")) ? store("curator-repeat") : "off";
paintModes();
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
  if (current()) ambient(current());
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
  document.body.classList.toggle("now-view", page === "now");
  $("#now-toggle").classList.toggle("active", page === "now");
  $("#now-toggle").setAttribute("aria-pressed", String(page === "now"));
  document.querySelectorAll(".nav").forEach((n) => { const on = n.dataset.page === page; n.classList.toggle("active", on); on ? n.setAttribute("aria-current", "page") : n.removeAttribute("aria-current"); });
  moveNav();
  const pages = { home: pageHome, songs: pageSongs, artists: pageArtists, albums: pageAlbums, labels: pageLabels, check: pageCheck, add: pageAdd, progress: pageProgress, settings: pageSettings, now: pageNow };
  (pages[page] || pageHome)(params);
  view.scrollTop = 0;
  markPlaying();
  const open = params.get("open") || openNext;
  openNext = "";
  if (open) openDrawer(open); else if (roomy.matches) showPanel(); else closeDrawer();
}
window.addEventListener("hashchange", route);
window.addEventListener("keydown", (e) => {
  if ($("dialog[open]")) return; // the box over the page has the keyboard
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (e.key === "Escape") { if (onNowPage()) closeNow(); else if (!roomy.matches) closeDrawer(); }
  else if (e.code === "Space" && !typing && e.target.tagName !== "BUTTON" && e.target.tagName !== "A") { e.preventDefault(); togglePlay(); }
  else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !typing && !e.ctrlKey && !e.altKey && !e.metaKey && current()) { // ten seconds either way, or with Shift a song
    e.preventDefault();
    const way = e.key === "ArrowRight" ? 1 : -1;
    if (e.shiftKey) step(way);
    else if (audio.duration) audio.currentTime = Math.max(0, Math.min(audio.duration - 0.5, audio.currentTime + way * 10));
  }
  else if (e.key === "/" && !typing && $("#song-search")) { e.preventDefault(); $("#song-search").focus(); }
});
async function safeLoad() {
  try { await load(); paintPanel(); return true; } catch { view.replaceChildren(el("p", { class: "empty" }, "Couldn't read the library. Is the server still running?")); return false; }
}
safeLoad().then((ok) => {
  if (!ok) return;
  if (!S.setup) restoreSpot();
  route();
});
