/* Live map: MapLibre GL JS + OpenFreeMap (vector, 3D building) + Esri satellite + AWS terrain.
   Zoom korle: bibhag -> jela -> upazila -> (OpenStreetMap-er) gram/bazar. */
const $ = (id) => document.getElementById(id);
const bn = (n) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[d]);
const COLORS = { 1: "#2e86de", 2: "#f39c12", 3: "#27ae60", 4: "#e74c3c", 5: "#8e44ad", 6: "#b9770e", 7: "#e84393", 8: "#16a085" };
const Z_DIST = 7.3, Z_UPZ = 9.4;   // kon zoom-e jela / upazila dekhabe

const STYLE_STREET = "https://tiles.openfreemap.org/styles/liberty";
const STYLE_SAT = { version: 8, sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19,
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  attribution: "Imagery © Esri, Maxar, Earthstar Geographics" } }, layers: [{ id: "sat", type: "raster", source: "sat" }] };
const STYLE_BLANK = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#dfe9ee" } }] };

let divGJ, distGJ, upzGJ, info, postcodes;
let satellite = false, terrain3d = true, fellBack = false;
let sel = { level: null, id: null };
const markers = [];

const map = new maplibregl.Map({
  container: "map", style: STYLE_STREET, center: [90.35, 23.8], zoom: 6.3, pitch: 40, bearing: 0,
  maxPitch: 80, minZoom: 5, maxBounds: [[85.5, 19], [95, 28.5]], attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
map.addControl(new maplibregl.FullscreenControl(), "bottom-right");

/* ---------- helpers ---------- */
function bboxOf(geom) {
  let x0 = 999, y0 = 999, x1 = -999, y1 = -999;
  const walk = (a) => { if (typeof a[0] === "number") { x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); } else a.forEach(walk); };
  walk(geom.coordinates);
  return [[x0, y0], [x1, y1]];
}
const fitTo = (f, pad = 60) => map.fitBounds(bboxOf(f.geometry), { padding: pad, pitch: terrain3d ? 45 : 0, duration: 1600, maxZoom: 14 });
const level = () => { const z = map.getZoom(); return z < Z_DIST ? "div" : z < Z_UPZ ? "dist" : "upz"; };
const byId = (gj, id) => gj.features.find((f) => String(f.properties.id) === String(id));
const status = (t) => { const s = $("status"); s.hidden = !t; s.textContent = t || ""; };

/* ---------- overlays (style badle gele abar boshate hoy) ---------- */
const colorExpr = (key) => ["match", ["to-string", ["get", key]], ...Object.entries(COLORS).flat(), "#888"];
function addOverlays() {
  const add = (id, data) => { if (!map.getSource(id)) map.addSource(id, { type: "geojson", data, promoteId: "id" }); };
  add("div", divGJ); add("dist", distGJ); add("upz", upzGJ);
  if (!map.getSource("sel")) map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  if (!map.getSource("dem")) map.addSource("dem", { type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 13,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], attribution: "Terrain: Mapzen/AWS" });

  const hov = (a, b) => ["case", ["boolean", ["feature-state", "hover"], false], a, b];
  const L = (layer) => { if (!map.getLayer(layer.id)) map.addLayer(layer); };
  if (!satellite && !fellBack) L({ id: "hills", type: "hillshade", source: "dem", paint: { "hillshade-exaggeration": 0.4 } });
  L({ id: "div-fill", type: "fill", source: "div", maxzoom: Z_DIST, paint: { "fill-color": colorExpr("id"), "fill-opacity": hov(0.55, 0.3) } });
  L({ id: "dist-fill", type: "fill", source: "dist", minzoom: Z_DIST, maxzoom: Z_UPZ, paint: { "fill-color": colorExpr("division_id"), "fill-opacity": hov(0.5, 0.22) } });
  L({ id: "upz-fill", type: "fill", source: "upz", minzoom: Z_UPZ, paint: { "fill-color": colorExpr("division_id"), "fill-opacity": hov(0.4, 0.1) } });
  L({ id: "div-line", type: "line", source: "div", paint: { "line-color": "#ffffff", "line-width": 2.2 } });
  L({ id: "dist-line", type: "line", source: "dist", minzoom: Z_DIST, paint: { "line-color": "#ffffff", "line-width": 1.4, "line-opacity": 0.9 } });
  L({ id: "upz-line", type: "line", source: "upz", minzoom: Z_UPZ, paint: { "line-color": "#ffffff", "line-width": 1, "line-opacity": 0.8, "line-dasharray": [2, 1] } });
  L({ id: "sel-line", type: "line", source: "sel", paint: { "line-color": "#ffd60a", "line-width": 4 } });
  setTerrain();
}
function setTerrain() {
  if (!map.getSource("dem")) return;
  try { map.setTerrain(terrain3d && !fellBack ? { source: "dem", exaggeration: 1.6 } : null); } catch (e) { /* offline */ }
}

/* ---------- labels (HTML, Bangla font thik dekhay) ---------- */
function buildLabels() {
  markers.forEach((m) => m.remove()); markers.length = 0;
  const mk = (cls, text, x, y) => {
    const el = document.createElement("div"); el.className = "lbl " + cls; el.textContent = text;
    markers.push(new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([x, y]).addTo(map));
  };
  divGJ.features.forEach((f) => mk("div", f.properties.name_bn, f.properties.cx, f.properties.cy));
  distGJ.features.forEach((f) => mk("dist", f.properties.name_bn, f.properties.cx, f.properties.cy));
  upzGJ.features.forEach((f) => mk("upz", f.properties.name_bn || f.properties.name_en, f.properties.cx, f.properties.cy));
}
function updateLevel() {
  const l = level();
  document.body.dataset.lvl = l;
  const t = { div: "বিভাগ", dist: "জেলা", upz: "উপজেলা" }[l];
  $("level").textContent = map.getZoom() > 12 ? "লেভেল: গ্রাম / বাজার (OpenStreetMap)" : `লেভেল: ${t}`;
}

/* ---------- hover ---------- */
let hovered = null;
map.on("mousemove", (e) => {
  const layers = ["upz-fill", "dist-fill", "div-fill"].filter((l) => map.getLayer(l));
  const f = layers.length ? map.queryRenderedFeatures(e.point, { layers })[0] : null;
  if (hovered && (!f || hovered.id !== f.id || hovered.source !== f.source)) { map.setFeatureState({ source: hovered.source, id: hovered.id }, { hover: false }); hovered = null; }
  if (f) { hovered = { source: f.source, id: f.id }; map.setFeatureState(hovered, { hover: true }); }
  map.getCanvas().style.cursor = f ? "pointer" : "";
});

/* ---------- click ---------- */
map.on("click", (e) => {
  const layers = ["upz-fill", "dist-fill", "div-fill"].filter((l) => map.getLayer(l));
  const f = map.queryRenderedFeatures(e.point, { layers })[0];
  if (!f) return;
  const lv = f.source === "upz" ? "upz" : f.source === "dist" ? "dist" : "div";
  select(lv, f.properties.id);
});

/* ---------- selection ---------- */
function select(lv, id, fly = true) {
  const gj = { div: divGJ, dist: distGJ, upz: upzGJ }[lv];
  const f = byId(gj, id); if (!f) return;
  sel = { level: lv, id: f.properties.id };
  map.getSource("sel").setData({ type: "FeatureCollection", features: [f] });
  if (fly) fitTo(f);
  render(lv, f);
}
const crumb = (parts) => `<div class="crumbs"><span data-go="home">বাংলাদেশ</span>${parts.map((p) => ` › <span data-go="${p[0]}" data-id="${p[1]}">${p[2]}</span>`).join("")}</div>`;
const li = (arr) => arr && arr.length ? `<ul class="list">${arr.map((x) => `<li>${x}</li>`).join("")}</ul>` : "";

function render(lv, f) {
  const p = f.properties; let h = "";
  const divId = lv === "div" ? p.id : p.division_id;
  const d = byId(divGJ, divId).properties, v = info.divisions[divId];
  if (lv === "div") {
    h = crumb([["div", p.id, p.name_bn]]) + `<h2 style="color:${COLORS[p.id]}">${p.name_bn} বিভাগ</h2><span class="tag">${p.name_en}</span><span class="tag">${bn(p.districts)}টি জেলা</span>
      <p>${v.intro}</p><div class="stats"><div class="stat"><span>সদর</span>${v.sodor}</div><div class="stat"><span>আয়তন</span>${v.area}</div><div class="stat"><span>জনসংখ্যা</span>${v.pop}</div><div class="stat"><span>জেলা</span>${bn(p.districts)}টি</div></div>
      <h3>জেলাসমূহ (ক্লিক করুন)</h3><div class="chips">${distGJ.features.filter((x) => x.properties.division_id === p.id).map((x) => `<span class="chip" data-go="dist" data-id="${x.properties.id}">${x.properties.name_bn}</span>`).join("")}</div>
      <h3>প্রকৃতি ও দর্শনীয় স্থান</h3>${li(v.nature)}<h3>কৃষি ও শিল্প</h3>${li(v.produce)}<h3>ইতিহাস ও ঐতিহ্য</h3>${li(v.history)}
      <h3>পরীক্ষার জন্য মনে রাখুন</h3>${v.facts.map((x) => `<div class="fact">${x}</div>`).join("")}
      <p class="note">জুম করুন বা জেলায় ক্লিক করুন, জেলা ও উপজেলার তথ্য আসবে।</p>`;
  } else if (lv === "dist") {
    const ups = upzGJ.features.filter((x) => String(x.properties.district_id) === String(p.id));
    h = crumb([["div", d.id, d.name_bn], ["dist", p.id, p.name_bn]]) + `<h2 style="color:${COLORS[divId]}">${p.name_bn} জেলা</h2><span class="tag">${p.name_en} · ${d.name_bn} বিভাগ</span>
      <div class="stats"><div class="stat"><span>বিভাগ</span>${d.name_bn}</div><div class="stat"><span>উপজেলা/থানা (ম্যাপে)</span>${bn(ups.length)}টি</div></div>
      <h3>উপজেলা (ক্লিক করুন)</h3><div class="chips">${ups.map((x) => `<span class="chip" data-go="upz" data-id="${x.properties.id}">${x.properties.name_bn || x.properties.name_en}</span>`).join("")}</div>
      <h3>${d.name_bn} বিভাগের পরীক্ষার পয়েন্ট</h3>${v.facts.map((x) => `<div class="fact">${x}</div>`).join("")}
      <p class="note">আরও জুম করলে উপজেলা সীমানা ও গ্রাম/বাজারের নাম (OpenStreetMap) দেখা যাবে।</p>`;
  } else {
    const pcs = postcodes[String(p.id)] || [];
    const [lon, lat] = [p.cx, p.cy];
    h = crumb([["div", d.id, d.name_bn], ["dist", p.district_id, p.district_bn || p.district_en], ["upz", p.id, p.name_bn || p.name_en]]) +
      `<h2 style="color:${COLORS[divId]}">${p.name_bn || p.name_en}</h2><span class="tag">${p.name_en} উপজেলা/থানা</span>
      <div class="stats"><div class="stat"><span>জেলা</span>${p.district_bn || p.district_en}</div><div class="stat"><span>বিভাগ</span>${d.name_bn}</div></div>
      <h3>ডাকঘর ও পোস্টকোড</h3>${pcs.length ? pcs.map((x) => `<div class="po"><span>${x[0]}</span><b>${bn(x[1])}</b></div>`).join("") : '<p class="note">এই উপজেলার পোস্টকোড ডেটা মেলেনি।</p>'}
      <h3>গ্রাম / বাজার / এলাকা (ম্যাপ থেকে)</h3><div id="places"><p class="note">মানচিত্র জুম হলে নাম আসবে…</p></div>
      <h3>লিঙ্ক</h3><p><a class="link" target="_blank" rel="noopener" href="https://www.openstreetmap.org/#map=12/${lat}/${lon}">OpenStreetMap-এ দেখুন</a> · <a class="link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}">Google Maps</a></p>`;
    map.once("idle", () => setTimeout(updatePlaces, 300));
  }
  $("panel-body").innerHTML = h;
}
$("panel-body").addEventListener("click", (e) => {
  const el = e.target.closest("[data-go]"); if (!el) return;
  if (el.dataset.go === "home") return home();
  select(el.dataset.go, el.dataset.id);
});

/* ---------- gram/bazar (OpenStreetMap place layer) ---------- */
function updatePlaces() {
  const box = $("places"); if (!box || sel.level !== "upz") return;
  const feats = map.queryRenderedFeatures().filter((f) => f.sourceLayer === "place" && f.properties.name);
  const seen = new Set(), groups = {};
  const label = { city: "শহর", town: "শহর/বাজার", village: "গ্রাম", hamlet: "পাড়া/ছোট গ্রাম", suburb: "মহল্লা", neighbourhood: "মহল্লা", quarter: "মহল্লা", island: "দ্বীপ" };
  for (const f of feats) {
    const nm = f.properties["name:bn"] || f.properties.name_bn || f.properties.name;
    const cls = f.properties.class || f.properties.place || "other";
    if (seen.has(nm) || !label[cls]) continue; seen.add(nm);
    (groups[label[cls]] ||= []).push(nm);
  }
  const keys = Object.keys(groups);
  box.innerHTML = keys.length ? keys.map((k) => `<div><b>${k}</b> <small>(${bn(groups[k].length)})</small><br>${groups[k].slice(0, 40).map((n) => `<span class="place">${n}</span>`).join("")}</div>`).join("")
    : '<p class="note">এই জুমে কোনো গ্রাম/বাজারের নাম পাওয়া যায়নি। আরও জুম করুন (লেভেল ১১-১৪) অথবা ইন্টারনেট চেক করুন।</p>';
}
map.on("moveend", () => { if (sel.level === "upz") { clearTimeout(window.__pt); window.__pt = setTimeout(updatePlaces, 500); } });
map.on("zoom", updateLevel);

/* ---------- toolbar ---------- */
function home() {
  sel = { level: null, id: null }; map.getSource("sel").setData({ type: "FeatureCollection", features: [] });
  map.flyTo({ center: [90.35, 23.8], zoom: 6.3, pitch: terrain3d ? 40 : 0, bearing: 0, duration: 1500 });
  renderHome();
}
$("b-home").onclick = home;
$("b-3d").onclick = (e) => { terrain3d = !terrain3d; e.target.classList.toggle("on", terrain3d); setTerrain(); map.easeTo({ pitch: terrain3d ? 55 : 0, duration: 800 }); };
$("b-style").onclick = (e) => {
  satellite = !satellite; e.target.textContent = satellite ? "রাস্তা" : "স্যাটেলাইট";
  document.body.classList.toggle("sat", satellite);
  fellBack = false; map.setStyle(satellite ? STYLE_SAT : STYLE_STREET);
};
function renderHome() {
  $("panel-body").innerHTML = `<h2>বাংলাদেশ লাইভ ম্যাপ</h2><span class="tag">৮ বিভাগ · ৬৪ জেলা · ৫৪৪ উপজেলা/থানা</span>
    <p>মানচিত্রে জুম করলে বিভাগ থেকে জেলা, জেলা থেকে উপজেলা এবং আরও জুমে আসল রাস্তা, ভবন ও গ্রাম-বাজারের নাম দেখা যাবে।</p>
    <h3>বিভাগ বেছে নিন</h3><div class="chips">${divGJ.features.map((f) => `<span class="chip div" data-go="div" data-id="${f.properties.id}" style="border-left-color:${COLORS[f.properties.id]}">${f.properties.name_bn}</span>`).join("")}</div>
    <h3>কীভাবে ব্যবহার করবেন</h3>${li(["স্ক্রল/পিঞ্চ করে জুম করুন", "ডান মাউস বা দুই আঙুলে ঘুরিয়ে কোণ বদলান (৩ডি)", "যেকোনো এলাকায় ক্লিক করলে তথ্য প্যানেলে আসবে", "স্যাটেলাইট বাটনে আসল ছবি দেখুন", "উপরে সার্চ করে সরাসরি যান"])}
    <p class="note">${info.note}<br>বেসম্যাপ: © OpenStreetMap contributors, OpenFreeMap। স্যাটেলাইট: Esri। ভূমিরূপ: Mapzen/AWS। সীমানা: geoBoundaries (CC BY 4.0), সরলীকৃত।</p>`;
}

/* ---------- search ---------- */
const results = $("results");
$("search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase(); if (!q) { results.hidden = true; return; }
  const out = [], m = (p) => (p.name_bn || "").includes(q) || (p.name_en || "").toLowerCase().includes(q);
  divGJ.features.forEach((f) => m(f.properties) && out.push({ l: "div", id: f.properties.id, t: f.properties.name_bn + " বিভাগ", s: "বিভাগ" }));
  distGJ.features.forEach((f) => m(f.properties) && out.push({ l: "dist", id: f.properties.id, t: f.properties.name_bn + " জেলা", s: "জেলা" }));
  upzGJ.features.forEach((f) => m(f.properties) && out.push({ l: "upz", id: f.properties.id, t: (f.properties.name_bn || f.properties.name_en) + " উপজেলা", s: f.properties.district_bn || "" }));
  results.innerHTML = out.slice(0, 12).map((o) => `<li data-l="${o.l}" data-id="${o.id}">${o.t}<small>${o.s}</small></li>`).join("") || "<li>কিছু পাওয়া যায়নি</li>";
  results.hidden = false;
});
results.addEventListener("click", (e) => { const t = e.target.closest("li[data-id]"); if (!t) return; select(t.dataset.l, t.dataset.id); results.hidden = true; $("search").value = ""; });

/* ---------- boot ---------- */
map.on("style.load", () => { if (divGJ) { addOverlays(); updateLevel(); } });
map.on("error", (e) => {
  // street style load na hole (internet nei), blank background-e fallback
  if (!fellBack && !satellite && !map.isStyleLoaded()) {
    fellBack = true; status("ইন্টারনেট/বেসম্যাপ পাওয়া যায়নি। শুধু সীমানা দেখানো হচ্ছে। ইন্টারনেট থাকলে আসল ম্যাপ আসবে।");
    map.setStyle(STYLE_BLANK);
  }
});
async function boot() {
  const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  [divGJ, distGJ, upzGJ, info, postcodes] = await Promise.all(["divisions.geojson", "districts.geojson", "upazilas.geojson", "divisions_info.json", "postcodes.json"].map((n) => get("data/" + n)));
  buildLabels(); renderHome();
  if (map.isStyleLoaded()) { addOverlays(); updateLevel(); }
  map.once("idle", () => $("loading").classList.add("done"));
  setTimeout(() => $("loading").classList.add("done"), 6000);
}
boot().catch((e) => { $("loading").innerHTML = "ডেটা লোড করা যায়নি। server.py দিয়ে চালান।<br><small>" + e.message + "</small>"; });
