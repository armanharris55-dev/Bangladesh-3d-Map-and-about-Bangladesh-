import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

/* ---------- Config ---------- */
const S = 30;                     // 1 degree = 30 units
const COS = Math.cos((23.7 * Math.PI) / 180);
const LON0 = 90.35, LAT0 = 23.7;
const DEPTH = 3.5;                // division extrude height
const COLORS = { 1: "#2e86de", 2: "#f39c12", 3: "#27ae60", 4: "#e74c3c", 5: "#8e44ad", 6: "#b9770e", 7: "#e84393", 8: "#16a085" };
const bn = (n) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[d]);
const proj = (lon, lat) => [(lon - LON0) * COS * S, (lat - LAT0) * S];
const $ = (id) => document.getElementById(id);

/* ---------- State ---------- */
let info, divGJ, distGJ, quizBank;
const divs = new Map();           // id -> {id, name, color, group, mesh, lines, districts[], target, cur, label, cx, cy, size}
const dists = new Map();          // id -> {id, divId, name, nameEn, mesh}
let hoverDiv = null, selDiv = null, selDist = null, quizDist = null;
let autoRotate = false, topView = false;

/* ---------- Three setup ---------- */
const stage = $("stage"), canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
const HOME = { pos: new THREE.Vector3(0, 165, 175), target: new THREE.Vector3(0, 0, 0) };
camera.position.copy(HOME.pos);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.05;
controls.minDistance = 40;
controls.maxDistance = 700;
controls.autoRotateSpeed = 1.2;

scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-120, 250, 160);
scene.add(sun);

// Floor grid (halka)
const grid = new THREE.GridHelper(700, 40, 0x2d4a63, 0x1b3347);
grid.position.y = -0.5;
grid.material.transparent = true; grid.material.opacity = 0.35;
scene.add(grid);

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

/* ---------- Geometry helpers ---------- */
function ringPts(ring) { return ring.map(([lon, lat]) => new THREE.Vector2(...proj(lon, lat))); }
function polysOf(geom) { return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates; }
function toShapes(geom) {
  return polysOf(geom).map((poly) => {
    const shape = new THREE.Shape(ringPts(poly[0]));
    for (let i = 1; i < poly.length; i++) shape.holes.push(new THREE.Path(ringPts(poly[i])));
    return shape;
  });
}
function outline(geom, y, mat) {
  const g = new THREE.Group();
  for (const poly of polysOf(geom)) {
    for (const ring of poly) {
      const pts = ring.map(([lon, lat]) => { const [x, z] = proj(lon, lat); return new THREE.Vector3(x, y, -z); });
      g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
  }
  return g;
}
function labelSprite(text, color) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const x = c.getContext("2d");
  x.font = "700 64px 'Hind Siliguri','Noto Sans Bengali','Kalpurush',sans-serif";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.lineWidth = 10; x.strokeStyle = "rgba(0,0,0,.75)"; x.strokeText(text, 256, 68);
  x.fillStyle = "#fff"; x.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(32, 8, 1);
  sp.renderOrder = 10;
  return sp;
}

/* ---------- Build map ---------- */
function buildMap() {
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const dLineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });

  for (const f of divGJ.features) {
    const p = f.properties, id = p.id, color = COLORS[id];
    const group = new THREE.Group();
    const geo = new THREE.ExtrudeGeometry(toShapes(f.geometry), { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.3, bevelSegments: 1 });
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, emissive: color, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.userData.divId = id;
    group.add(mesh);
    group.add(outline(f.geometry, DEPTH + 0.5, lineMat));

    geo.computeBoundingBox();
    const sz = geo.boundingBox.getSize(new THREE.Vector3());
    const [cx, cy] = proj(p.cx, p.cy);
    const bc = geo.boundingBox.getCenter(new THREE.Vector3());
    const label = labelSprite(p.name_bn, color);
    label.position.set(cx, DEPTH + 5, -cy);
    group.add(label);

    scene.add(group);
    divs.set(id, { id, name: p.name_bn, nameEn: p.name_en, color, group, mesh, label, cx, cy, bx: bc.x, bz: -bc.y, size: Math.max(sz.x, sz.y), cur: 0, target: 0, districts: [], dLines: null });
  }

  for (const f of distGJ.features) {
    const p = f.properties, d = divs.get(p.division_id);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(toShapes(f.geometry)),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = DEPTH + 0.55;
    m.userData.distId = p.id;
    d.group.add(m);
    const lines = outline(f.geometry, DEPTH + 0.6, dLineMat);
    d.group.add(lines);
    (d.dLines ??= []).push(lines);
    d.districts.push(p.id);
    dists.set(p.id, { id: p.id, divId: p.division_id, name: p.name_bn, nameEn: p.name_en, mesh: m });
  }
}

/* ---------- Camera tween ---------- */
let tween = null;
function flyTo(pos, target, ms = 900) {
  tween = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: pos.clone(), t1: target.clone() };
}
function stepTween(now) {
  if (!tween) return;
  let k = Math.min((now - tween.t0) / tween.ms, 1);
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  camera.position.lerpVectors(tween.p0, tween.p1, e);
  controls.target.lerpVectors(tween.t0v, tween.t1, e);
  if (k >= 1) tween = null;
}
function homeView() {
  const off = topView ? new THREE.Vector3(0, 380, 1) : HOME.pos;
  flyTo(off, HOME.target);
}
function focusDiv(d) {
  const t = new THREE.Vector3(d.bx, 0, d.bz);
  const dist = d.size * 1.7 + 60;
  const off = topView ? new THREE.Vector3(0, dist, 1) : new THREE.Vector3(0, dist * 0.8, dist * 0.7);
  flyTo(t.clone().add(off), t);
}

/* ---------- Selection ---------- */
function setDistColor(id, color, opacity) {
  const d = dists.get(id); if (!d) return;
  d.mesh.material.color.set(color); d.mesh.material.opacity = opacity;
}
function clearDistHighlight() {
  for (const d of dists.values()) d.mesh.material.opacity = 0;
}
function selectDivision(id) {
  selDiv = id; selDist = null;
  clearDistHighlight();
  for (const d of divs.values()) { d.target = d.id === id ? 3.5 : 0; d.dim = id && d.id !== id; }
  if (id) { focusDiv(divs.get(id)); renderDivision(id); } else { homeView(); renderHome(); }
}
function selectDistrict(id) {
  const d = dists.get(id); if (!d) return;
  if (selDiv !== d.divId) selectDivision(d.divId);
  clearDistHighlight();
  selDist = id;
  setDistColor(id, 0xffffff, 0.55);
  renderDivision(d.divId, id);
}

/* ---------- Panel rendering ---------- */
const list = (arr) => arr && arr.length ? `<ul class="list">${arr.map((x) => `<li>${x}</li>`).join("")}</ul>` : "";
function renderHome() {
  const c = info.country;
  $("panel-body").innerHTML = `
    <h2>বাংলাদেশ</h2>
    <span class="tag">৮টি বিভাগ · ৬৪টি জেলা</span>
    <p>${c.intro}</p>
    <h3>বিভাগ বেছে নিন</h3>
    <div class="chips">${[...divs.values()].map((d) => `<span class="chip div" data-div="${d.id}" style="border-left-color:${d.color}">${d.name}</span>`).join("")}</div>
    <h3>মনে রাখার পয়েন্ট</h3>
    ${c.facts.map((f) => `<div class="fact">${f}</div>`).join("")}
    <h3>কীভাবে ব্যবহার করবেন</h3>
    ${list(["মানচিত্রে মাউস নিয়ে গেলে বিভাগ উঁচু হবে", "ক্লিক করলে বিভাগের সব তথ্য এখানে আসবে", "বিভাগ বাছাই করার পর জেলায় ক্লিক করুন", "উপরের 'কুইজ' বাটনে নিজেকে যাচাই করুন"])}
    <p class="note">${info.note}<br>মানচিত্রের সীমানা: geoBoundaries (CC BY 4.0), BBS/OCHA ভিত্তিক। সীমানা সরলীকৃত, শুধু শেখার জন্য।</p>`;
}
function renderDivision(id, distId) {
  const v = info.divisions[id], d = divs.get(id);
  const chips = d.districts.map((k) => { const x = dists.get(k); return `<span class="chip ${k === distId ? "act" : ""}" data-dist="${k}">${x.name}</span>`; }).join("");
  const dd = distId ? dists.get(distId) : null;
  $("panel-body").innerHTML = `
    <button class="back" data-div="">← সব বিভাগ</button>
    <h2 style="color:${d.color}">${d.name} বিভাগ</h2>
    <span class="tag">${d.nameEn} Division</span><span class="tag">${bn(d.districts.length)}টি জেলা</span>
    ${dd ? `<div class="dist-card">নির্বাচিত জেলা: <b>${dd.name}</b> <span class="tag">${dd.nameEn}</span></div>` : ""}
    <p>${v.intro}</p>
    <div class="stats">
      <div class="stat"><span>বিভাগীয় সদর</span>${v.sodor}</div>
      <div class="stat"><span>আয়তন</span>${v.area}</div>
      <div class="stat"><span>জনসংখ্যা</span>${v.pop}</div>
      <div class="stat"><span>জেলা</span>${bn(d.districts.length)}টি</div>
    </div>
    <h3>জেলাসমূহ (ক্লিক করুন)</h3><div class="chips">${chips}</div>
    <h3>নদ-নদী</h3><div class="chips">${v.rivers.map((r) => `<span class="chip" style="cursor:default">${r}</span>`).join("")}</div>
    <h3>প্রকৃতি ও দর্শনীয় স্থান</h3>${list(v.nature)}
    <h3>কৃষি ও শিল্প</h3>${list(v.produce)}
    <h3>ইতিহাস ও ঐতিহ্য</h3>${list(v.history)}
    ${v.people && v.people.length ? `<h3>বিখ্যাত ব্যক্তি / স্থান</h3>${list(v.people)}` : ""}
    <h3>পরীক্ষার জন্য মনে রাখুন</h3>${v.facts.map((f) => `<div class="fact">${f}</div>`).join("")}
    <p class="note">${info.note}</p>`;
}
$("panel-body").addEventListener("click", (e) => {
  const el = e.target.closest("[data-div],[data-dist]"); if (!el) return;
  if ("dist" in el.dataset) selectDistrict(el.dataset.dist);
  else selectDivision(el.dataset.div || null);
});

/* ---------- Picking ---------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(ev) {
  const r = canvas.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects([...divs.values()].map((d) => d.mesh), false)[0];
  const divId = hit ? hit.object.userData.divId : null;
  let distId = null;
  if (divId && divId === selDiv) {
    const dh = ray.intersectObjects(divs.get(divId).districts.map((k) => dists.get(k).mesh), false)[0];
    if (dh) distId = dh.object.userData.distId;
  }
  return { divId, distId };
}
const tip = $("tip");
canvas.addEventListener("pointermove", (ev) => {
  if (ev.buttons) return;
  const { divId, distId } = pick(ev);
  hoverDiv = divId;
  canvas.style.cursor = divId ? "pointer" : "grab";
  if (divId && !quizDist) {
    tip.hidden = false;
    tip.textContent = distId ? `${dists.get(distId).name} জেলা` : `${divs.get(divId).name} বিভাগ`;
    tip.style.left = ev.clientX + "px"; tip.style.top = ev.clientY + "px";
  } else tip.hidden = true;
});
canvas.addEventListener("pointerleave", () => { hoverDiv = null; tip.hidden = true; });
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener("pointerup", (e) => {
  if (!down || quizDist) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved > 6 || performance.now() - down.t > 500) return;
  const { divId, distId } = pick(e);
  if (distId) selectDistrict(distId);
  else if (divId) { if (divId !== selDiv) selectDivision(divId); }
  else if (selDiv) selectDivision(null);
});
addEventListener("keydown", (e) => { if (e.key === "Escape") { closeQuiz(); selectDivision(null); } });

/* ---------- Toolbar ---------- */
$("btn-view").onclick = (e) => {
  topView = !topView;
  e.target.textContent = topView ? "৩ডি" : "২ডি";
  selDiv ? focusDiv(divs.get(selDiv)) : homeView();
};
$("btn-districts").onclick = (e) => {
  e.target.classList.toggle("on");
  const on = e.target.classList.contains("on");
  for (const d of divs.values()) d.dLines.forEach((l) => (l.visible = on));
};
$("btn-rotate").onclick = (e) => { autoRotate = !autoRotate; e.target.classList.toggle("on", autoRotate); controls.autoRotate = autoRotate; };
$("btn-reset").onclick = () => { topView = false; $("btn-view").textContent = "২ডি"; selectDivision(null); };

/* ---------- Search ---------- */
const results = $("results");
$("search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { results.hidden = true; return; }
  const out = [];
  for (const d of divs.values()) if (d.name.includes(q) || d.nameEn.toLowerCase().includes(q)) out.push({ k: "div", id: d.id, t: d.name + " বিভাগ", s: d.nameEn });
  for (const d of dists.values()) if (d.name.includes(q) || d.nameEn.toLowerCase().includes(q)) out.push({ k: "dist", id: d.id, t: d.name + " জেলা", s: divs.get(d.divId).name + " বিভাগ" });
  results.innerHTML = out.slice(0, 10).map((o) => `<li data-k="${o.k}" data-id="${o.id}">${o.t}<small>${o.s}</small></li>`).join("") || "<li>কিছু পাওয়া যায়নি</li>";
  results.hidden = false;
});
results.addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]"); if (!li) return;
  li.dataset.k === "div" ? selectDivision(li.dataset.id) : selectDistrict(li.dataset.id);
  results.hidden = true; $("search").value = "";
});

/* ---------- Quiz ---------- */
const quizEl = $("quiz"), qb = $("quiz-body");
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const best = () => Number(localStorage.getItem("bdmap-best") || 0);
let quizInPanel = false;
function closeQuiz() { quizEl.hidden = true; quizEl.classList.remove("map"); if (quizInPanel) { quizInPanel = false; renderHome(); } if (quizDist) { clearDistHighlight(); quizDist = null; } }
$("quiz-close").onclick = closeQuiz;
$("btn-quiz").onclick = () => {
  quizEl.hidden = false; quizEl.classList.remove("map");
  qb.innerHTML = `<h2>কুইজ</h2><p>সেরা স্কোর: <b>${bn(best())}</b></p>
    <div class="row"><button class="accent" id="mode-gk">সাধারণ জ্ঞান (১০টি)</button><button id="mode-map">মানচিত্র কুইজ: জেলা চিনুন (১০টি)</button></div>`;
  $("mode-gk").onclick = () => runQuiz("gk");
  $("mode-map").onclick = () => runQuiz("map");
};
function runQuiz(mode) {
  let qs;
  if (mode === "gk") qs = shuffle(quizBank).slice(0, 10);
  else qs = shuffle([...dists.values()]).slice(0, 10).map((d) => {
    const others = shuffle([...divs.values()].filter((x) => x.id !== d.divId)).slice(0, 3);
    const opts = shuffle([divs.get(d.divId), ...others]);
    return { dist: d.id, q: "মানচিত্রে জেলাটি কোন বিভাগে?", options: opts.map((o) => o.name + " বিভাগ"), answer: opts.findIndex((o) => o.id === d.divId), explain: `${d.name} জেলা ${divs.get(d.divId).name} বিভাগে।` };
  });
  let i = 0, score = 0;
  const host = mode === "map" ? $("panel-body") : qb;
  if (mode === "map") { selectDivision(null); quizEl.hidden = true; quizInPanel = true; }
  const closeBtn = mode === "map" ? `<button class="back" id="qclose">✕ কুইজ বন্ধ করুন</button>` : "";
  const show = () => {
    if (i >= qs.length) {
      clearDistHighlight(); quizDist = null;
      if (score > best()) localStorage.setItem("bdmap-best", score);
      host.innerHTML = `${closeBtn}<h2>ফলাফল: ${bn(score)}/${bn(qs.length)}</h2><p>সেরা স্কোর: ${bn(best())}</p><div class="row"><button class="accent" id="again">আবার খেলুন</button><button id="home">বন্ধ করুন</button></div>`;
      if ($("qclose")) $("qclose").onclick = closeQuiz; $("again").onclick = () => $("btn-quiz").onclick(); $("home").onclick = closeQuiz; return;
    }
    const q = qs[i];
    if (q.dist) { clearDistHighlight(); quizDist = q.dist; setDistColor(q.dist, 0xffff00, 0.9); const dd = dists.get(q.dist); const d = divs.get(dd.divId); d.target = 2; }
    host.innerHTML = `${closeBtn}<div class="bar"><i style="width:${(i / qs.length) * 100}%"></i></div>
      <small>প্রশ্ন ${bn(i + 1)}/${bn(qs.length)} · স্কোর ${bn(score)}</small>
      <div class="q">${q.q}</div><div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${o}</button>`).join("")}</div><div id="fb"></div>`;
    if ($("qclose")) $("qclose").onclick = closeQuiz;
    host.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
      const k = Number(b.dataset.k); const ok = k === q.answer; if (ok) score++;
      host.querySelectorAll(".opt").forEach((x) => { x.disabled = true; if (Number(x.dataset.k) === q.answer) x.classList.add("ok"); });
      if (!ok) b.classList.add("bad");
      $("fb").innerHTML = `<div class="exp">${ok ? "✔ সঠিক! " : "✘ ভুল। "}${q.explain}</div><div class="row"><button class="accent" id="next">${i + 1 === qs.length ? "ফলাফল দেখুন" : "পরের প্রশ্ন"}</button></div>`;
      $("next").onclick = () => { if (q.dist) { const dd = dists.get(q.dist); divs.get(dd.divId).target = 0; } i++; show(); };
    }));
  };
  show();
}

/* ---------- Render loop ---------- */
function animate(now) {
  requestAnimationFrame(animate);
  stepTween(now);
  for (const d of divs.values()) {
    const want = d.target + (hoverDiv === d.id && !quizDist ? 1.8 : 0);
    d.cur += (want - d.cur) * 0.15;
    d.group.position.y = d.cur;
    const m = d.mesh.material;
    m.emissiveIntensity += (((hoverDiv === d.id || selDiv === d.id) && !quizDist ? 0.28 : 0) - m.emissiveIntensity) * 0.15;
    const dim = selDiv && selDiv !== d.id && !quizDist;
    m.opacity = 1; m.transparent = false;
    m.color.set(d.color); if (dim) m.color.multiplyScalar(0.45);
    d.label.visible = !selDiv || selDiv === d.id || topView;
  }
  controls.update();
  renderer.render(scene, camera);
}

/* ---------- Boot ---------- */
async function boot() {
  const get = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
  [divGJ, distGJ, info, quizBank] = await Promise.all([get("data/divisions.geojson"), get("data/districts.geojson"), get("data/divisions_info.json"), get("data/quiz.json")]);
  buildMap();
  renderHome();
  resize();
  requestAnimationFrame(animate);
  $("loading").classList.add("done");
}
boot().catch((err) => { $("loading").innerHTML = "ডেটা লোড করা যায়নি। server.py দিয়ে চালান।<br><small>" + err.message + "</small>"; });
