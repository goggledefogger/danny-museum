// Glue: load data, build the world, run the loop, wire input and debug hooks.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Hud } from './hud.js';
import { Funhouse } from './funhouse.js';
import { Minimap } from './minimap.js';
import { Tour } from './tour.js';
import { Acquisitions } from './acquisitions.js';
import { computeFresh, countSince, LAST_VISIT } from './fresh.js';
import { loadTheme, style, palette, t, applyCss, applyCopy, loadFonts } from './theme.js';
import { chooseTheme } from './picker.js';
import { PerfMonitor } from './perf.js';
import { GraphicsManager } from './graphics.js';

const BASE_FOV = 70;
const NEAR_EXHIBIT = 3.5;
const STORE = 'danny-museum.visited';

const loading = document.getElementById('loading');

// ---------- theme: picker (or ?theme=), then the start card ----------
const themeId = await chooseTheme();
try {
  await loadTheme(themeId);
} catch (err) {
  loading.textContent = `Could not load themes/${themeId}.json (${err.message}).`;
  document.getElementById('overlay').classList.remove('hidden');
  throw err;
}
applyCss();
applyCopy();
document.documentElement.dataset.theme = themeId;
document.getElementById('overlay').classList.remove('hidden');
await loadFonts();
const P = palette();
const M = style().materials;

const hud = new Hud();
let data;
try {
  const res = await fetch('data/projects.json', { cache: 'no-store' });
  data = await res.json();
} catch (err) {
  loading.textContent = t('loadingError', { error: err.message });
  throw err;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = M.toneMapping === 'none' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = M.exposure;
renderer.domElement.className = 'scene';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(P.fog.color, P.fog.near, P.fog.far);
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 900);

const world = buildWorld(scene, data, renderer);
scene.add(new THREE.AmbientLight(P.ambient.color, P.ambient.intensity));
const lobbyLight = new THREE.PointLight(P.light.color, P.light.intensity, 34, 1.4);
lobbyLight.position.set(0, 9, 3);
scene.add(lobbyLight);

const player = new Player(camera, renderer.domElement, world);
const funhouse = new Funhouse(scene, world, hud);
const acq = new Acquisitions(scene, world);
const minimap = new Minimap(document.getElementById('minimap'), world);
const perf = new PerfMonitor(renderer);
const graphics = new GraphicsManager(renderer, world, acq);
const tour = new Tour(player, world.tourPath, () => { mode = 'menu'; hud.setTour(false); hud.showOverlay(true, true); });

player.teleport(world.spawn);
player.setLook(world.spawnYaw, 0.08);

const projectIds = new Set(world.projects.map(p => p.id));
const visited = new Set((JSON.parse(localStorage.getItem(STORE) || '[]')).filter(id => projectIds.has(id)));
hud.setPassport(visited.size, projectIds.size);
// ---------- freshness ----------
// The previous visit is read once, then "now" becomes the last visit (and is
// written again on the way out), so a reload counts from this visit.
const readVisit = () => { const v = Number(localStorage.getItem(LAST_VISIT)); return Number.isFinite(v) && v > 0 ? v : null; };
let prevVisit = readVisit();
const saveVisit = () => { try { localStorage.setItem(LAST_VISIT, String(Date.now())); } catch { /* private mode */ } };
saveVisit();
addEventListener('pagehide', saveVisit);
addEventListener('beforeunload', saveVisit);

function refreshFresh() {
  const fresh = computeFresh(world.projects, { since: prevVisit });
  world.fresh = fresh;          // funhouse reads this for the lever bias
  acq.setFresh(fresh);
  hud.setSince(countSince(world.projects, prevVisit));
  hud.showExhibit(null);        // drop a panel that may point at a rebuilt case
}
refreshFresh();

loading.textContent = t('loadingDone', { exhibits: projectIds.size, wings: world.wings.length });

// mode: 'menu' (overlay up), 'walk' (pointer locked), 'free' (no lock, drag to look), 'tour'
let mode = 'menu';
let nearest = null;

// After a teleport we stand a few steps back from the exhibit for a good view;
// keep it "focused" (panel up) until the player walks a couple of units away.
let focus = null;

function nearestExhibit(pos) {
  if (focus) {
    if (Math.hypot(pos.x - focus.from.x, pos.z - focus.from.z) < 2) return focus.ex;
    focus = null;
  }
  let best = null, bestD = NEAR_EXHIBIT;
  for (const e of world.exhibits) {
    const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function openExhibit(ex) {
  const first = !visited.has(ex.project.id);
  if (first) {
    visited.add(ex.project.id);
    localStorage.setItem(STORE, JSON.stringify([...visited]));
    funhouse.burst(ex.objWorld, [ex.wing.color, ...P.stampConfetti]);
    hud.setPassport(visited.size, projectIds.size);
    if (visited.size === projectIds.size) hud.toast(t('allStamped'));
  }
  hud.showExhibit(ex, true);
  hud.celebrate();
}

function interact() {
  if (player.frozen || mode === 'tour') return;
  const pos = player.position;
  const fd = funhouse.distToFactory(pos);
  const ed = nearest ? Math.hypot(nearest.pos.x - pos.x, nearest.pos.z - pos.z) : Infinity;
  if (funhouse.nearFactory(pos) && fd < ed + 1) funhouse.pullLever();
  else if (nearest) openExhibit(nearest);
}

function teleportTo(projectId) {
  if (projectId === 'new-acquisitions') {
    player.teleport(acq.standPos, acq.lookAt, -0.02);
    focus = null;
    hud.hideSurprise();
    hud.toast(t(acq.exhibits.length ? 'acqTeleport' : 'acqTeleportEmpty'));
    return true;
  }
  // prefer the wing copy, then the Timeline Rail, then the New Acquisitions case
  const ex = world.exhibits.find(e => e.project.id === projectId && !e.inTimeline && !e.inAcquisitions)
    ?? world.exhibits.find(e => e.project.id === projectId && !e.inAcquisitions)
    ?? world.exhibits.find(e => e.project.id === projectId);
  if (!ex) return false;
  player.teleport(ex.standPos, ex.lookAt, ex.lookPitch);
  focus = { ex, from: ex.standPos.clone() };
  hud.hideSurprise();
  hud.toast(t('teleportTo', { name: ex.project.name }));
  return true;
}

function startWalking() {
  if (tour.active) { tour.active = false; hud.setTour(false); }
  player.controls.lock();
}

function startFree() {
  if (tour.active) { tour.active = false; hud.setTour(false); }
  mode = 'free';
  hud.showOverlay(false);
}

function startTour() {
  mode = 'tour';
  hud.showOverlay(false);
  hud.hideSurprise();
  hud.setTour(true);
  tour.start();
}

// ---------- input ----------
player.controls.addEventListener('lock', () => { mode = 'walk'; hud.showOverlay(false); });
player.controls.addEventListener('unlock', () => {
  if (mode === 'walk') { mode = 'menu'; hud.showOverlay(true, true); }
});
document.addEventListener('pointerlockerror', () => {
  startFree();
  hud.toast(t('pointerLockFail'));
});
document.getElementById('btn-start').addEventListener('click', startWalking);
document.getElementById('btn-tour').addEventListener('click', startTour);

document.getElementById('surprise').addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') hud.hideSurprise();
  if (act === 'again') funhouse.pullLever();
  if (act === 'teleport' && hud.surpriseId) {
    teleportTo(hud.surpriseId);
    if (mode === 'menu') startWalking();
  }
});

document.getElementById('since').addEventListener('click', () => {
  teleportTo('new-acquisitions');
  if (mode === 'menu') startWalking();
});

addEventListener('keydown', e => {
  if (e.code === 'Escape' && mode === 'tour') { tour.stop(); return; }
  if (mode !== 'walk' && mode !== 'free') return;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyT' && hud.surpriseId) teleportTo(hud.surpriseId);
});

renderer.domElement.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (mode === 'walk') interact();
  else if (mode === 'free') { dragging = { x: e.clientX, y: e.clientY, moved: false }; }
});
let dragging = null;
addEventListener('mousemove', e => {
  if (!dragging) return;
  player.dragLook(e.clientX - dragging.x, e.clientY - dragging.y);
  if (Math.abs(e.clientX - dragging.x) + Math.abs(e.clientY - dragging.y) > 2) dragging.moved = true;
  dragging.x = e.clientX; dragging.y = e.clientY;
});
addEventListener('mouseup', () => {
  if (dragging && !dragging.moved && mode === 'free') interact();
  dragging = null;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  perf.begin();
  const dt = Math.min(0.05, clock.getDelta());
  const time = clock.elapsedTime;
  if (mode === 'tour') tour.update(dt);
  else if (mode === 'walk' || mode === 'free') player.update(dt);

  const pos = player.position;
  funhouse.update(dt, time, player);
  acq.update(time);

  nearest = player.frozen ? null : nearestExhibit(pos);
  hud.showExhibit(nearest, nearest ? visited.has(nearest.project.id) : false);
  const activeExhibits = world.update(time, dt, nearest, pos);

  const atFactory = funhouse.nearFactory(pos) && mode !== 'tour';
  hud.prompt(atFactory && !nearest ? t('factoryPrompt') : null);
  if (hud.surpriseId && funhouse.distToFactory(pos) > 12 && mode !== 'menu') hud.hideSurprise();
  hud.setLocation(world.regionAt(pos.x, pos.z));

  // hall of mirrors: widen and wobble the field of view while inside
  const target = world.inMirrors(pos.x, pos.z) ? 98 + Math.sin(time * 1.7) * 8 : BASE_FOV;
  if (Math.abs(camera.fov - target) > 0.01) {
    camera.fov += (target - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();
  }

  minimap.draw(pos, player.yaw, visited, nearest);
  renderer.render(scene, camera);
  perf.end(activeExhibits, world.exhibits.length);
  requestAnimationFrame(frame);
}
frame();

// ---------- debug hooks ----------
window.__museum = {
  perf,
  graphics,
  start: () => { startFree(); return true; },
  teleport: id => { if (mode === 'menu') startFree(); return teleportTo(id); },
  tour: () => { startTour(); return true; },
  stopTour: () => { tour.stop(); return true; },
  pullLever: () => { funhouse.pullLever(); return true; },
  open: () => { interact(); return nearest?.project.id ?? null; },
  where: () => ({ x: +player.position.x.toFixed(2), z: +player.position.z.toFixed(2), mode, region: world.regionAt(player.position.x, player.position.z)?.label }),
  projects: () => world.projects.map(p => p.id),
  fresh: () => [...(world.fresh?.keys() ?? [])],
  // In-memory only: stamp a project's added (or rediscovered) date and rebuild
  // the case, ribbons and since-last-visit line. date defaults to today.
  _setAdded: (id, date = new Date().toISOString().slice(0, 10), field = 'added') => {
    const p = world.projects.find(q => q.id === id);
    if (!p || (field !== 'added' && field !== 'rediscovered')) return false;
    p[field] = date;
    refreshFresh();
    return true;
  },
  // Pretend the previous visit was at this time (ms or ISO); null for a first visit.
  _setLastVisit: when => { prevVisit = when == null ? null : (typeof when === 'number' ? when : Date.parse(when)); refreshFresh(); return prevVisit; },
  theme: () => themeId,
  dinoBones: () => world.dinosaur?.bones ?? [],
  _three: { scene, camera, renderer, funhouse, acq },
};
