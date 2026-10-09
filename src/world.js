// Builds every room from data/projects.json.
//
// Layout: a round lobby at the origin with "spokes" radiating out of it. Each
// spoke is a doorway arch, a short connector corridor, then a hall. Spokes are
// built in a local frame where x is sideways and the hall runs down local -z,
// so "s" (distance from the lobby centre) maps to local z = -s. A group rotated
// by -angle turns that local frame into the world.
//
// Collision is "walkable union": you may stand anywhere inside at least one
// region (lobby circle, connector box, hall box) and outside every obstacle.
// Regions only overlap at doorway gaps, so walls are impassable for free.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signMesh, rgba } from './text.js';
import { style, palette, t, mat } from './theme.js';

export const EYE = 1.7;
export const LOBBY_R = 14;
export const DOOR_W = 4.4;
export const CONN_END = 18;
export const HALL_W = 11;
export const WALL_H = 5.5;
const EXHIBIT_X = 3.2;
const PAIR_GAP = 6.5;
const MIRROR_LEN = 16;

export const WING_ORDER = ['work', 'side', 'personal', 'brain', 'home', 'music'];
// name, tagline and colour are filled from the theme when the world is built
export const TIMELINE = { id: 'timeline', name: '', color: '', tagline: '' };
export const SHAPES = { work: 'cube', side: 'ico', personal: 'gem', brain: 'knot', home: 'house', music: 'note' };
// New Acquisitions rotunda: due south of the lobby, behind the spawn, where the
// lobby wall is otherwise solid. acquisitions.js builds it; the lobby wall only
// needs to leave a doorway gap at this angle.
export const ACQ = { id: 'new-acquisitions', angle: Math.PI, x: 0, z: 21.5, r: 6.5 };

export function startYear(years) {
  const m = String(years ?? '').match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

// Unit vectors for a spoke at angle a (radians, 0 = north = -z, clockwise).
const dirOf = a => new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
const rightOf = a => new THREE.Vector3(Math.cos(a), 0, Math.sin(a));

function floorTexture(pal, pattern) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = pal.floor; g.fillRect(0, 0, 512, 512);
  if (pattern === 'kraft') {
    // kraft board: short paper fibres and a few darker flecks
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * Math.PI, l = 3 + Math.random() * 9;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,245,220,0.10)' : 'rgba(70,45,20,0.10)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  } else {
    // terrazzo speckles
    for (let i = 0; i < 900; i++) {
      const v = 30 + Math.random() * 40;
      g.fillStyle = `rgba(${v + 20},${v + 10},${v + 30},${0.25 + Math.random() * 0.4})`;
      g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, Math.random() * 2.6, 0, Math.PI * 2); g.fill();
    }
  }
  g.strokeStyle = pal.floorLine; g.lineWidth = 3;
  for (let i = 0; i <= 512; i += 256) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Environment map for the mirrors: a small dark room with neon strips in the
// wing colours, pre-filtered by PMREM so metal surfaces have something to show.
function funhouseEnv(renderer, colors) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x1a1622, side: THREE.BackSide })));
  colors.forEach((col, i) => {
    const a = (i / colors.length) * Math.PI * 2;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 0.2), new THREE.MeshBasicMaterial({ color: col }));
    strip.position.set(Math.sin(a) * 9, 0, Math.cos(a) * 9);
    strip.lookAt(0, 0, 0);
    env.add(strip);
  });
  const top = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
  top.position.y = 4.8; env.add(top);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  return tex;
}

export function exhibitObject(shape, color, size) {
  const m = mat({
    color, emissive: color, emissiveIntensity: style().materials.exhibitEmissive, roughness: 0.32, metalness: 0.25, flatShading: shape !== 'knot',
  });
  let obj;
  switch (shape) {
    case 'cube': obj = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), m); obj.rotation.set(0.5, 0, 0.6); break;
    case 'ico': obj = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.68, 0), m); break;
    case 'gem': obj = new THREE.Mesh(new THREE.OctahedronGeometry(size * 0.7, 0).scale(1, 1.35, 1), m); break;
    case 'knot': obj = new THREE.Mesh(new THREE.TorusKnotGeometry(size * 0.38, size * 0.12, 120, 16), m); break;
    case 'house': {
      obj = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, size * 0.7, size * 0.8), m);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.78, size * 0.55, 4), m);
      roof.position.y = size * 0.62; roof.rotation.y = Math.PI / 4;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.22, size * 0.22), new THREE.MeshBasicMaterial({ color: palette().window }));
      win.position.set(0, size * 0.05, size * 0.401);
      const win2 = win.clone(); win2.rotation.y = Math.PI; win2.position.z = -size * 0.401;
      obj.add(body, roof, win, win2);
      break;
    }
    case 'note': {
      // an eighth note: tilted ellipsoid head, stem and flag
      obj = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(size * 0.32, 24, 16), m);
      head.scale.set(1.3, 0.9, 0.9); head.rotation.z = 0.4;
      head.position.set(-size * 0.2, -size * 0.45, 0);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.05, size * 0.05, size * 1.3, 10), m);
      stem.position.set(size * 0.17, size * 0.15, 0);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(size * 0.12, size * 0.5, size * 0.1), m);
      flag.position.set(size * 0.32, size * 0.55, 0); flag.rotation.z = 0.9;
      obj.add(head, stem, flag);
      break;
    }
    default: obj = new THREE.Mesh(new THREE.SphereGeometry(size * 0.6, 24, 16), m);
  }
  return { obj, mat: m };
}

// A thin box wall between two local points, with a glowing trim along the top.
function wall(parent, x1, z1, x2, z2, h, mat, trimMat) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return;
  const rotY = Math.atan2(-dz, dx); // aligns the box's x axis with the segment
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.3), mat);
  m.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
  m.rotation.y = rotY;
  parent.add(m);
  if (trimMat) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.36), trimMat);
    trim.position.set((x1 + x2) / 2, h - 0.25, (z1 + z2) / 2);
    trim.rotation.y = rotY;
    const base = trim.clone(); base.position.y = 0.08;
    parent.add(trim, base);
  }
}

export function buildWorld(scene, data, renderer) {
  const world = {
    regions: [], obstacles: [], exhibits: [], spokes: [], mirrorZones: [], tourPath: [],
    wingsById: {}, spawn: new THREE.Vector3(0, EYE, 9), spawnYaw: 0,
  };
  const P0 = palette();
  TIMELINE.name = t('timelineName'); TIMELINE.tagline = t('timelineTagline'); TIMELINE.color = P0.trim;
  // a theme may rename a wing on its signs (copy.wingName / wingTagline in a wing override)
  const wings = (data.wings ?? []).map(w => {
    const c = style(w.id).copy;
    return { ...w, name: c.wingName || w.name, tagline: c.wingTagline || w.tagline };
  });
  // projects pointing at an unknown wing get an implicit wing rather than vanishing
  for (const p of data.projects ?? []) {
    if (p.wing && !wings.find(w => w.id === p.wing)) wings.push({ id: p.wing, name: p.wing, tagline: '', color: P0.unknownWing });
  }
  wings.sort((a, b) => {
    const ia = WING_ORDER.indexOf(a.id), ib = WING_ORDER.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  wings.forEach(w => { world.wingsById[w.id] = w; });
  world.wings = wings;
  world.projects = (data.projects ?? []).filter(p => p && p.id && p.name);

  const floorTex = floorTexture(P0, style().materials.floorPattern);
  const mirrorEnv = funhouseEnv(renderer, wings.map(w => w.color));

  // ---------- lobby ----------
  const lobby = new THREE.Group();
  scene.add(lobby);
  world.regions.push({ type: 'circle', x: 0, z: 0, r: LOBBY_R, label: t('lobbyName'), color: P0.regionDefault, id: 'lobby' });

  const lobbyFloorTex = floorTex.clone(); lobbyFloorTex.repeat.set(7, 7); lobbyFloorTex.needsUpdate = true;
  const lobbyFloor = new THREE.Mesh(new THREE.CircleGeometry(LOBBY_R + 0.3, 96),
    mat({ map: lobbyFloorTex, roughness: 0.55, metalness: 0.1 }));
  lobbyFloor.rotation.x = -Math.PI / 2;
  lobby.add(lobbyFloor);
  // inlaid compass rose ring
  const inlay = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.8, 96), new THREE.MeshBasicMaterial({ color: P0.trim, transparent: true, opacity: 0.35 }));
  inlay.rotation.x = -Math.PI / 2; inlay.position.y = 0.01;
  lobby.add(inlay);

  // Exits: wings in order, with the Timeline Rail dead ahead in the middle,
  // fanned over 270 degrees so the south wall (behind the spawn) stays solid.
  const exits = [...wings];
  exits.splice(Math.floor(wings.length / 2), 0, TIMELINE);
  const span = Math.PI * 1.5;
  const step = exits.length > 1 ? span / (exits.length - 1) : 0;
  exits.forEach((e, i) => { e._angle = exits.length > 1 ? -span / 2 + i * step : 0; });

  // Lobby wall: a ring of panels, skipping any panel that overlaps a doorway.
  const lobbyWallMat = mat({ color: P0.wall, roughness: 0.85 });
  const N = 140;
  const panelW = (2 * Math.PI * LOBBY_R) / N;
  const halfDoor = Math.asin((DOOR_W / 2) / LOBBY_R);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const blocked = [...exits.map(e => e._angle), ACQ.angle].some(ea => {
      let diff = Math.abs(((a - ea + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return diff < halfDoor + (panelW / LOBBY_R) / 2;
    });
    if (blocked) continue;
    const p = new THREE.Mesh(new THREE.BoxGeometry(panelW * 1.04, WALL_H, 0.4), lobbyWallMat);
    const d = dirOf(a);
    p.position.set(d.x * (LOBBY_R + 0.2), WALL_H / 2, d.z * (LOBBY_R + 0.2));
    p.rotation.y = -a;
    lobby.add(p);
  }
  const ringTrim = new THREE.Mesh(new THREE.TorusGeometry(LOBBY_R, 0.08, 8, 160), new THREE.MeshBasicMaterial({ color: P0.trim }));
  ringTrim.rotation.x = Math.PI / 2; ringTrim.position.y = WALL_H - 0.2;
  lobby.add(ringTrim);

  // Title, floating over the Surprise Factory
  const title = signMesh(15, 3.9, {
    width: 2048, height: 532, bg: rgba(P0.signBg, 0.82), border: P0.trim, borderWidth: 14, radius: 60,
    blocks: [
      { text: t('museumTitle'), size: 128, weight: 900, color: P0.titleInk, maxLines: 1, shadow: P0.titleGlow },
      { text: t('museumSubtitle'), size: 58, weight: 500, color: P0.accent, maxLines: 1, gap: 26 },
    ],
  });
  title.position.set(0, 8.7, -4.5);
  lobby.add(title);
  world.title = title;

  // Controls sign near the spawn
  const sign = signMesh(4.2, 3.0, {
    width: 1024, height: 732, bg: rgba(P0.signBg, 0.92), border: P0.accent, align: 'left', padding: 70,
    blocks: [
      { text: t('howToTitle'), size: 80, weight: 900, color: P0.accent, maxLines: 1 },
      ...[t('howTo1'), t('howTo2'), t('howTo3'), t('howTo4'), t('howTo5')].map((text, i) => ({ text, size: 50, weight: 600, color: P0.signInk, gap: i ? 10 : 26 })),
    ],
  });
  sign.position.set(6.6, 2.3, 7.2);
  sign.rotation.y = -0.75;
  const signPost = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 8), mat({ color: P0.post }));
  signPost.position.set(6.6, 0.4, 7.2);
  lobby.add(sign, signPost);

  // ---------- spokes ----------
  const pedGeo = new THREE.CylinderGeometry(0.72, 0.9, 1.1, 28);
  const ringGeo = new THREE.TorusGeometry(0.74, 0.04, 8, 40);
  const mirrorWingId = wings.find(w => w.id === 'side')?.id ?? wings[1]?.id;
  const cases = [];   // glass display case transforms, instanced after the spokes

  for (const exit of exits) {
    const isTimeline = exit === TIMELINE;
    const layout = isTimeline ? timelineLayout(world.projects) : wingLayout(world.projects.filter(p => p.wing === exit.id), exit.id === mirrorWingId);
    buildSpoke(exit, layout);
  }

  function wingLayout(projects, withMirrors) {
    const sorted = [...projects].sort((a, b) => (startYear(a.years) ?? 9999) - (startYear(b.years) ?? 9999) || a.name.localeCompare(b.name));
    const items = sorted.map((p, i) => ({ project: p, x: i % 2 === 0 ? -EXHIBIT_X : EXHIBIT_X, s: CONN_END + 5 + Math.floor(i / 2) * PAIR_GAP }));
    const rows = Math.ceil(sorted.length / 2);
    let length = Math.max(12, 5 + Math.max(0, rows - 1) * PAIR_GAP + 5);
    let mirror = null;
    if (withMirrors) { mirror = { s0: CONN_END + length, s1: CONN_END + length + MIRROR_LEN }; length += MIRROR_LEN + 3; }
    return { items, length, markers: [], mirror, empty: sorted.length === 0 };
  }

  function timelineLayout(projects) {
    const dated = projects.filter(p => startYear(p.years) != null);
    const undated = projects.filter(p => startYear(p.years) == null);
    const byYear = new Map();
    for (const p of dated) {
      const y = startYear(p.years);
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(p);
    }
    const items = [], markers = [];
    let s = CONN_END + 4;
    let side = 0;
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const placeGroup = (group, label) => {
      markers.push({ s, label });
      // a lone project in its year alternates sides with its neighbours so
      // the rail does not lean left; pairs share a row
      if (group.length === 1) {
        items.push({ project: group[0], x: side++ % 2 === 0 ? -EXHIBIT_X : EXHIBIT_X, s: s + 3 });
      } else {
        group.forEach((p, j) => items.push({ project: p, x: j % 2 === 0 ? -EXHIBIT_X : EXHIBIT_X, s: s + 3 + Math.floor(j / 2) * 5 }));
      }
      s += group.length ? 3 + Math.ceil(group.length / 2) * 5 : 2.5;
    };
    if (years.length) {
      const longSpan = years[years.length - 1] - years[0] > 40;
      for (let y = years[0]; y <= years[years.length - 1]; y++) {
        const group = byYear.get(y) ?? [];
        // empty years still get a marker so the gaps feel like time passing
        if (group.length || !longSpan || y % 5 === 0) placeGroup(group, String(y));
      }
    }
    if (undated.length) placeGroup(undated, t('timelineUndated'));
    return { items, length: Math.max(14, s - CONN_END + 4), markers, mirror: null, empty: projects.length === 0 };
  }

  function buildSpoke(exit, layout) {
    const angle = exit._angle;
    const d = dirOf(angle), right = rightOf(angle);
    const toWorld = (x, s, y = 0) => new THREE.Vector3(right.x * x + d.x * s, y, right.z * x + d.z * s);
    const g = new THREE.Group();
    g.rotation.y = -angle;
    scene.add(g);
    const color = new THREE.Color(exit.color);
    const L = layout.length;
    const s0 = CONN_END, s1 = CONN_END + L;
    const P = palette(exit.id), M = style(exit.id).materials;
    const wallMat = mat({ color: color.clone().multiplyScalar(P.wingWallTint).add(new THREE.Color(P.wingWallBase)), roughness: 0.85 }, exit.id);
    const trimMat = new THREE.MeshBasicMaterial({ color });

    // floors
    const ft = floorTex.clone(); ft.repeat.set(HALL_W / 4, L / 4); ft.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, L), mat({ map: ft, roughness: 0.6, color: color.clone().lerp(new THREE.Color(0xffffff), P.floorTint) }, exit.id));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -(s0 + L / 2));
    const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, L - 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 }));
    runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.01, -(s0 + L / 2));
    const connLen = CONN_END - LOBBY_R + 0.6;
    const cfloor = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, connLen), floor.material);
    cfloor.rotation.x = -Math.PI / 2; cfloor.position.set(0, 0, -(LOBBY_R - 0.3 + connLen / 2));
    g.add(floor, runner, cfloor);

    // walls: connector sides, hall start (with doorway gap), hall sides, end
    const hw = HALL_W / 2, dw = DOOR_W / 2;
    const sIn = LOBBY_R * Math.cos(halfDoor) - 0.1;
    wall(g, -dw, -sIn, -dw, -s0, WALL_H, wallMat, trimMat);
    wall(g, dw, -sIn, dw, -s0, WALL_H, wallMat, trimMat);
    wall(g, -hw, -s0, -dw, -s0, WALL_H, wallMat, trimMat);
    wall(g, dw, -s0, hw, -s0, WALL_H, wallMat, trimMat);
    wall(g, -hw, -s0, -hw, -s1, WALL_H, wallMat, trimMat);
    wall(g, hw, -s0, hw, -s1, WALL_H, wallMat, trimMat);
    wall(g, -hw, -s1, hw, -s1, WALL_H, wallMat, trimMat);
    // lintel over the connector so it reads as a corridor
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.3, 0.6, s0 - sIn), wallMat);
    lintel.position.set(0, WALL_H - 0.3, -(sIn + s0) / 2);
    g.add(lintel);

    // the arch facing the lobby: pillars, glowing keystone band, wing name
    const pillarMat = mat({ color: P.pillar, roughness: 0.5, metalness: 0.3, emissive: color, emissiveIntensity: M.pillarGlow }, exit.id);
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, WALL_H + 0.9, 0.9), pillarMat);
      pillar.position.set(sx * (dw + 0.35), (WALL_H + 0.9) / 2, -(LOBBY_R - 0.35));
      g.add(pillar);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(dw + 0.35, 0.18, 10, 40, Math.PI), trimMat);
    band.position.set(0, WALL_H - 0.6, -(LOBBY_R - 0.5));
    band.scale.y = 0.55;
    g.add(band);
    const nameSign = signMesh(6.6, 1.65, {
      width: 1024, height: 256, bg: rgba(P.signBg, 0.9), border: exit.color, borderWidth: 10, radius: 40, padding: 40,
      blocks: [{ text: exit.name, size: 92, weight: 900, color: P.wingInk || exit.color, maxLines: 2 }],
    });
    nameSign.position.set(0, WALL_H + 1.35, -(LOBBY_R - 0.95));
    g.add(nameSign);
    const doorLight = new THREE.PointLight(color, P.hallLight.intensity, 14, 1.6);
    doorLight.position.set(0, 3.6, -(LOBBY_R - 2.2));
    g.add(doorLight);

    // hall lights + end-wall sign: cap to at most 3 lights per spoke with wider radius (36) to prevent WebGL fragment shader stalls
    const nLights = Math.min(3, Math.max(1, Math.round(L / 50)));
    for (let i = 0; i < nLights; i++) {
      const pl = new THREE.PointLight(color.clone().lerp(new THREE.Color(P.hallLight.mix), 0.45), P.hallLight.intensity, 36, 1.4);
      pl.position.set(0, 4.6, -(s0 + (L * (i + 0.5)) / nLights));
      g.add(pl);
    }
    const endSign = signMesh(8.5, 3.2, {
      width: 1024, height: 386, bg: rgba(P.signBg, 0.88), border: exit.color,
      blocks: [
        { text: exit.name, size: 84, weight: 900, color: P.wingInk || exit.color, maxLines: 2 },
        { text: layout.empty ? t('wingEmpty', {}, exit.id) : exit.tagline, size: 46, weight: 500, color: P.signSoft, maxLines: 3, gap: 20 },
      ],
    });
    endSign.position.set(0, 3.0, -(s1 - 0.2));
    g.add(endSign);

    // regions
    const conn0 = LOBBY_R - 1.2, conn1 = CONN_END + 1.2;
    world.regions.push({ type: 'box', c: toWorld(0, (conn0 + conn1) / 2), d, right, halfL: (conn1 - conn0) / 2, halfW: dw, label: exit.name, color: exit.color, id: exit.id, connector: true });
    const hallRegion = { type: 'box', c: toWorld(0, s0 + L / 2), d, right, halfL: L / 2, halfW: hw, label: exit.name, color: exit.color, id: exit.id };
    world.regions.push(hallRegion);

    // timeline floor markers
    for (const m of layout.markers) {
      const marker = signMesh(3.4, 1.3, {
        width: 768, height: 294, bg: 'rgba(0,0,0,0)', blocks: [{ text: m.label, size: 190, weight: 900, color: P.trim, maxLines: 1, shadow: rgba(P.trim, 0.6) }],
      });
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(0, 0.02, -m.s);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W - 0.6, 0.07), new THREE.MeshBasicMaterial({ color: P.trim, transparent: true, opacity: 0.5 }));
      line.rotation.x = -Math.PI / 2; line.position.set(0, 0.015, -(m.s - 0.9));
      g.add(marker, line);
    }

    // exhibits
    for (const it of layout.items) {
      const p = it.project;
      const wing = world.wingsById[p.wing] ?? exit;
      const wcolor = new THREE.Color(wing.color ?? P.unknownWing);
      const scale = Math.min(3, Math.max(1, Number(p.scale) || 1));
      const size = 0.55 + 0.3 * scale;
      const ped = new THREE.Mesh(pedGeo, mat({ color: P.pedestal, roughness: 0.4, metalness: 0.4 }, exit.id));
      ped.position.set(it.x, 0.55, -it.s);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: wcolor }));
      ring.rotation.x = Math.PI / 2; ring.position.set(it.x, 1.11, -it.s);
      const { obj, mat: emat } = exhibitObject(SHAPES[p.wing] ?? 'sphere', wcolor, size);
      const baseY = 1.1 + 0.35 + size * 0.75;
      obj.position.set(it.x, baseY, -it.s);
      const plaque = signMesh(2.7, 1.35, {
        width: 1024, height: 512, bg: rgba(P.signBg, 0.9), border: wing.color,
        blocks: [
          { text: p.name, size: 92, weight: 800, color: P.signInk, maxLines: 3 },
          { text: [p.years, p.status].filter(Boolean).join('  ·  '), size: 56, weight: 600, color: P.wingInk || wing.color, maxLines: 1, gap: 22 },
        ],
      });
      // angle plaques toward the walkway and a little back toward the entrance
      plaque.position.set(it.x, baseY + size * 0.8 + 1.0, -it.s);
      plaque.rotation.y = it.x < 0 ? Math.PI / 3 : -Math.PI / 3;
      g.add(ped, ring, obj, plaque);
      if (M.displayCases) {
        // glass case from the pedestal top to just under the plaque
        const top = Math.min(baseY + size + 0.25, baseY + size * 0.8 + 0.3);
        const w = size * 1.5 + 0.35;
        cases.push({ pos: toWorld(it.x, it.s, 1.1), angle, w, h: top - 1.1, wing: exit.id });
      }
      const pos = toWorld(it.x, it.s);
      world.obstacles.push({ x: pos.x, z: pos.z, r: 0.95 });
      world.exhibits.push({
        project: p, wing, pos, obj, mat: emat, plaque, baseY, size,
        objWorld: toWorld(it.x, it.s, baseY),
        // stand toward the walkway and a few steps back toward the entrance, so the
        // exhibit and its plaque both fit in view
        standPos: toWorld(it.x * 0.1, it.s - 4.2, EYE),
        lookAt: toWorld(it.x, it.s, baseY),
        // pitch that centres the view between the pedestal top and the plaque top
        lookPitch: (() => {
          const dist = Math.hypot(it.x * 0.9, 4.2);
          const plaqueTop = baseY + size * 0.8 + 1.0 + 0.68;
          return (Math.atan2(1.1 - EYE, dist) + Math.atan2(plaqueTop - EYE, dist)) / 2;
        })(),
        spin: p.wing === 'side' ? 1.6 : 0.45,
        phase: Math.random() * Math.PI * 2,
        hall: exit.id, inTimeline: exit === TIMELINE, glow: 0,
      });
    }

    // hall of mirrors segment
    if (layout.mirror) {
      const { s0: m0, s1: m1 } = layout.mirror;
      const mirrorMat = mat({ color: P.mirror, metalness: 1, roughness: 0.04, envMap: mirrorEnv, envMapIntensity: 1.6 }, exit.id);
      // wavy panels: displace a subdivided plane so the "reflection" warps
      const wavy = new THREE.PlaneGeometry(1.9, 4.3, 12, 24);
      const pa = wavy.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setZ(i, Math.sin(pa.getY(i) * 2.2) * 0.12 + Math.sin(pa.getX(i) * 3) * 0.05);
      wavy.computeVertexNormals();
      let k = 0;
      for (let s = m0 + 1; s < m1; s += 2, k++) {
        for (const side of [-1, 1]) {
          const panel = new THREE.Mesh(wavy, mirrorMat);
          panel.position.set(side * (hw - 0.75), 2.45, -s);
          panel.rotation.y = -side * Math.PI / 2 + (k % 2 ? 0.16 : -0.16);
          g.add(panel);
        }
      }
      // freestanding mirror pillars, zig-zagging down the middle
      const pillarGeo = new THREE.CylinderGeometry(0.55, 0.55, WALL_H, 24);
      [0.25, 0.5, 0.75].forEach((f, i) => {
        const x = i % 2 ? 1.7 : -1.7;
        const s = m0 + (m1 - m0) * f;
        const pil = new THREE.Mesh(pillarGeo, mirrorMat);
        pil.position.set(x, WALL_H / 2, -s);
        g.add(pil);
        const w = toWorld(x, s);
        world.obstacles.push({ x: w.x, z: w.z, r: 0.6 });
      });
      const mSign = signMesh(5, 1.4, {
        width: 1024, height: 286, bg: rgba(P.signBg, 0.85), border: P.mirror,
        blocks: [
          { text: t('mirrorTitle', {}, exit.id), size: 80, weight: 900, color: P.mirror, maxLines: 1 },
          { text: t('mirrorSubtitle', {}, exit.id), size: 40, weight: 500, color: P.mirrorInk, gap: 10 },
        ],
      });
      mSign.position.set(0, WALL_H - 0.4, -(m0 - 0.4));
      g.add(mSign);
      const ml = new THREE.PointLight(P.mirrorLight, 60, 18, 1.6);
      ml.position.set(0, 4.5, -(m0 + m1) / 2);
      g.add(ml);
      world.mirrorZones.push({ type: 'box', c: toWorld(0, (m0 + m1) / 2), d, right, halfL: (m1 - m0) / 2, halfW: hw });
    }

    const spoke = { exit, angle, d, right, toWorld, s0, s1, hallRegion, isTimeline: exit === TIMELINE };
    world.spokes.push(spoke);
    // tour leg: into the hall, to the far end, and back out
    world.tourPath.push(toWorld(0, 6, EYE), toWorld(0, LOBBY_R, EYE), toWorld(0, s0 + 1.5, EYE), toWorld(0, s1 - 3, EYE),
      toWorld(0, s0 + 1.5, EYE), toWorld(0, LOBBY_R, EYE), toWorld(0, 6, EYE));
  }

  if (cases.length) buildCases(scene, cases);

  world.tourPath.unshift(world.spawn.clone());
  world.tourPath.push(world.spawn.clone());

  // ---------- queries ----------
  const inRegion = (r, x, z, m) => {
    if (r.type === 'circle') return (x - r.x) ** 2 + (z - r.z) ** 2 <= (r.r - m) ** 2;
    // project onto the region's own axes
    const dx = x - r.c.x, dz = z - r.c.z;
    const lx = dx * r.right.x + dz * r.right.z;
    const ls = dx * r.d.x + dz * r.d.z;
    return Math.abs(lx) <= r.halfW - m && Math.abs(ls) <= r.halfL - m;
  };
  world.inRegion = inRegion;
  world.isWalkable = (x, z, m = 0.4) => {
    if (!world.regions.some(r => inRegion(r, x, z, m))) return false;
    return !world.obstacles.some(o => (x - o.x) ** 2 + (z - o.z) ** 2 < (o.r + m) ** 2);
  };
  world.regionAt = (x, z) => world.regions.find(r => !r.connector && inRegion(r, x, z, 0)) ?? world.regions.find(r => inRegion(r, x, z, 0));
  world.inMirrors = (x, z) => world.mirrorZones.some(r => inRegion(r, x, z, 0));

  // ---------- per-frame life ----------
  const glowBase = style().materials.exhibitEmissive;
  const MAX_ANIM_DIST_SQ = 45 * 45;
  world.activeCount = 0;
  world.update = (t, dt, nearest, playerPos) => {
    let active = 0;
    const px = playerPos?.x, pz = playerPos?.z;
    const hasPlayer = px != null && pz != null;

    for (const e of world.exhibits) {
      const near = e === nearest;
      const cooling = e.glow > 0.005;

      if (hasPlayer && !near && !cooling) {
        const dx = e.pos.x - px;
        const dz = e.pos.z - pz;
        if (dx * dx + dz * dz > MAX_ANIM_DIST_SQ) {
          continue;
        }
      }

      active++;
      e.glow += ((near ? 1 : 0) - e.glow) * Math.min(1, dt * 5);
      e.obj.rotation.y += dt * e.spin * (1 + e.glow * 1.5);
      e.obj.position.y = e.baseY + Math.sin(t * 1.3 + e.phase) * (0.06 + e.glow * 0.16);
      // fresh projects (set by acquisitions.js) burn a little brighter
      e.mat.emissiveIntensity = glowBase + e.glow * 0.9 + (e.fresh ? 0.3 : 0);
      const s = 1 + e.glow * 0.12;
      e.obj.scale.setScalar(s);
      e.plaque.rotation.z = Math.sin(t * 0.8 + e.phase) * 0.045;
    }
    world.activeCount = active;
    return active;
  };
  return world;
}

// Glass display cases with framed edges: two InstancedMeshes for the whole
// museum (one glass box, one merged frame), so 150 cases cost 2 draw calls.
function buildCases(scene, cases) {
  const P = palette();
  const glassMat = new THREE.MeshBasicMaterial({ color: P.caseGlass, transparent: true, opacity: P.caseGlassOpacity, depthWrite: false, side: THREE.DoubleSide });
  const frameMat = mat({ color: P.caseFrame, roughness: 0.3, metalness: 0.9 });
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // twelve thin edge bars of a unit box, merged into one frame geometry
  const bars = [], b = 0.03;
  for (const y of [0, 1]) for (const z of [-0.5, 0.5]) bars.push(new THREE.BoxGeometry(1 + b, b, b).translate(0, y, z));
  for (const y of [0, 1]) for (const x of [-0.5, 0.5]) bars.push(new THREE.BoxGeometry(b, b, 1 + b).translate(x, y, 0));
  for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) bars.push(new THREE.BoxGeometry(b, 1, b).translate(x, 0.5, z));
  const frame = mergeGeometries(bars);
  const glass = new THREE.InstancedMesh(box, glassMat, cases.length);
  const edges = new THREE.InstancedMesh(frame, frameMat, cases.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  cases.forEach((c, i) => {
    q.setFromAxisAngle(up, -c.angle);
    sc.set(c.w, c.h, c.w);
    m.compose(c.pos, q, sc);
    glass.setMatrixAt(i, m);
    edges.setMatrixAt(i, m);
  });
  glass.renderOrder = 2;
  scene.add(glass, edges);
}
