// New Acquisitions: a small gold rotunda off the south side of the lobby that
// shows the freshest projects in glass cases, plus the NEW / REDISCOVERED
// ribbons and brighter glow that follow fresh projects into their wings and
// onto the Timeline Rail. setFresh() rebuilds everything, so freshness can
// change at runtime (the debug hooks rely on that).
import * as THREE from 'three';
import { signMesh, ribbonTexture, rgba } from './text.js';
import { palette, t, mat } from './theme.js';
import { EYE, LOBBY_R, DOOR_W, WALL_H, ACQ, SHAPES, exhibitObject } from './world.js';
import { glowSprite } from './funhouse.js';

const MAX = 8;
const RING = 4.2;       // radius of the pedestal ring
const SPREAD = 1.8;     // radians either side of the back wall the ring covers
const PED_H = 0.9;
const SPARKS = 22;      // sparkle motes per case
const TAG_H = 0.3;      // ribbon height in world units

const CENTER = new THREE.Vector3(ACQ.x, 0, ACQ.z);
// the rotunda's near edge where the connector corridor meets it
const NEAR_EDGE = ACQ.z - Math.sqrt(ACQ.r ** 2 - (DOOR_W / 2) ** 2);

// A ribbon is two back-to-back single-sided planes, so it never reads mirrored.
function ribbon(kind) {
  const { tex, aspect } = ribbonTexture(t(kind === 'rediscovered' ? 'ribbonRediscovered' : 'ribbonNew'));
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  const geo = new THREE.PlaneGeometry(TAG_H * aspect, TAG_H);
  const g = new THREE.Group();
  const back = new THREE.Mesh(geo, mat);
  back.rotation.y = Math.PI;
  g.add(new THREE.Mesh(geo, mat), back);
  g.userData.kind = kind;
  g.userData.phase = Math.random() * Math.PI * 2;
  return g;
}

export class Acquisitions {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    this.exhibits = [];   // case exhibits currently registered in world.exhibits
    this.obstacles = [];
    this.tags = [];       // every live ribbon, cases and wings alike
    this.halos = [];
    this.buildShell();
    this.contents = new THREE.Group();
    this.root.add(this.contents);
    this.standPos = new THREE.Vector3(0, EYE, NEAR_EDGE + 0.5);
    this.lookAt = new THREE.Vector3(0, 1.9, ACQ.z + 1.5);
    this.setFresh(new Map());
  }

  buildShell() {
    const root = new THREE.Group();
    this.scene.add(root);
    this.root = root;
    const dw = DOOR_W / 2;
    const P = palette('lobby');
    const GOLD = P.accent;
    const gold = new THREE.Color(GOLD);
    const wallMat = mat({ color: P.annexWall, roughness: 0.8 });
    const trimMat = new THREE.MeshBasicMaterial({ color: gold });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(ACQ.r + 0.3, 72), mat({ color: P.annexFloor, roughness: 0.45, metalness: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.copy(CENTER);
    const inlay = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.72, 72), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.4 }));
    inlay.rotation.x = -Math.PI / 2; inlay.position.set(CENTER.x, 0.01, CENTER.z);
    const connLen = NEAR_EDGE - LOBBY_R + 1.2;
    const cfloor = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W, connLen), floor.material);
    cfloor.rotation.x = -Math.PI / 2; cfloor.position.set(0, 0.005, LOBBY_R - 0.6 + connLen / 2);
    root.add(floor, inlay, cfloor);

    // rotunda wall: a ring of panels with a doorway gap facing the lobby (north)
    const N = 56, panelW = (2 * Math.PI * ACQ.r) / N;
    const gap = Math.asin(dw / ACQ.r) + panelW / ACQ.r / 2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2; // 0 = north, clockwise, like world.js
      if (Math.min(a, Math.PI * 2 - a) < gap) continue;
      const p = new THREE.Mesh(new THREE.BoxGeometry(panelW * 1.06, WALL_H, 0.4), wallMat);
      p.position.set(CENTER.x + Math.sin(a) * (ACQ.r + 0.2), WALL_H / 2, CENTER.z - Math.cos(a) * (ACQ.r + 0.2));
      p.rotation.y = -a;
      root.add(p);
    }
    const crown = new THREE.Mesh(new THREE.TorusGeometry(ACQ.r, 0.08, 8, 96), trimMat);
    crown.rotation.x = Math.PI / 2; crown.position.set(CENTER.x, WALL_H - 0.2, CENTER.z);
    root.add(crown);

    // connector corridor: two short walls and a lintel, lobby wall to rotunda
    const zIn = LOBBY_R * Math.cos(Math.asin(dw / LOBBY_R)) - 0.1;
    const zOut = NEAR_EDGE + 0.15;
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, WALL_H, zOut - zIn), wallMat);
      w.position.set(sx * dw, WALL_H / 2, (zIn + zOut) / 2);
      root.add(w);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.3, 0.6, zOut - zIn), wallMat);
    lintel.position.set(0, WALL_H - 0.3, (zIn + zOut) / 2);
    root.add(lintel);

    // the arch on the lobby side, matching the wing doorways
    const pillarMat = mat({ color: P.pillar, roughness: 0.5, metalness: 0.3, emissive: gold, emissiveIntensity: 0.25 });
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.7, WALL_H + 0.9, 0.9), pillarMat);
      pillar.position.set(sx * (dw + 0.35), (WALL_H + 0.9) / 2, LOBBY_R - 0.35);
      root.add(pillar);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(dw + 0.35, 0.18, 10, 40, Math.PI), trimMat);
    band.position.set(0, WALL_H - 0.6, LOBBY_R - 0.5);
    band.scale.y = 0.55;
    root.add(band);

    // signs: one over the doorway facing the lobby, one on the back wall facing in
    const sign = () => signMesh(6.2, 1.75, {
      width: 1024, height: 290, bg: rgba(P.signBg, 0.9), border: GOLD, borderWidth: 10, radius: 40, padding: 34,
      blocks: [
        { text: t('acqTitle'), size: 96, weight: 900, color: GOLD, maxLines: 1, shadow: rgba(GOLD, 0.7) },
        { text: t('acqSubtitle'), size: 46, weight: 600, color: P.signSoft, maxLines: 1, gap: 10 },
      ],
    });
    this.headSign = sign();
    this.headSign.position.set(0, WALL_H + 1.35, LOBBY_R - 0.95);
    this.headSign.rotation.y = Math.PI;
    this.backSign = sign();
    this.backSign.scale.setScalar(0.8);
    this.backSign.position.set(CENTER.x, 5.05, CENTER.z + ACQ.r - 1.2);
    this.backSign.rotation.y = Math.PI;
    root.add(this.headSign, this.backSign);

    // the empty state: one small sign on a post, and nothing else
    this.emptySign = new THREE.Group();
    const small = signMesh(2.6, 0.75, {
      width: 1024, height: 296, bg: rgba(P.signBg, 0.88), border: P.quietBorder, borderWidth: 8, radius: 36, padding: 40,
      blocks: [{ text: t('acqEmpty'), size: 64, weight: 700, color: P.quietInk, maxLines: 2 }],
    });
    small.position.y = 1.75;
    small.rotation.y = Math.PI;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), mat({ color: P.post }));
    post.position.y = 0.7;
    this.emptySign.add(small, post);
    this.emptySign.position.copy(CENTER);
    root.add(this.emptySign);

    // lights stay in the scene permanently (toggling them would recompile every
    // material); only their intensity changes with the case contents
    this.spot = new THREE.SpotLight(P.spot, 0, 22, 0.75, 0.6, 1.3);
    this.spot.position.set(CENTER.x, 10, CENTER.z);
    this.spot.target.position.copy(CENTER);
    this.fill = new THREE.PointLight(P.spotFill, 0, 12, 1.5);
    this.fill.position.set(CENTER.x, 3.6, CENTER.z);
    root.add(this.spot, this.spot.target, this.fill);

    // sparkles: one Points cloud shared by all cases, drawRange trims it
    const n = MAX * SPARKS;
    this.sparkParams = [];
    for (let i = 0; i < n; i++) this.sparkParams.push({ a: Math.random() * 6.28, r: 0.35 + Math.random() * 0.55, y: Math.random(), speed: 0.15 + Math.random() * 0.25, spin: (Math.random() - 0.5) * 1.6 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, map: glowSprite(), color: P.sparkle, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparks.frustumCulled = false;
    root.add(this.sparks);

    // walkable space: the rotunda and the corridor joining it to the lobby
    const conn0 = LOBBY_R - 1.2, conn1 = NEAR_EDGE + 1.2;
    this.world.regions.push(
      { type: 'box', c: new THREE.Vector3(0, 0, (conn0 + conn1) / 2), d: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(-1, 0, 0), halfL: (conn1 - conn0) / 2, halfW: dw, label: t('acqName'), color: GOLD, id: ACQ.id, connector: true },
      { type: 'circle', x: CENTER.x, z: CENTER.z, r: ACQ.r, label: t('acqName'), color: GOLD, id: ACQ.id },
    );
    // tour: peek into the rotunda before heading for the wings
    const at = z => new THREE.Vector3(0, EYE, z);
    this.world.tourPath.splice(1, 0, at(12), at(ACQ.z - 1), at(12));
  }

  // fresh: Map id -> { kind, t }, freshest first (fresh.js computeFresh)
  setFresh(fresh) {
    this.fresh = fresh;
    this.clearCases();
    this.tagWings(fresh);
    const picks = [...fresh.keys()].map(id => this.world.projects.find(p => p.id === id)).filter(Boolean).slice(0, MAX);
    picks.forEach((p, i) => this.buildCase(p, fresh.get(p.id).kind, i, picks.length));
    const any = picks.length > 0;
    this.emptySign.visible = !any;
    this.headSign.visible = this.backSign.visible = any;
    this.sparks.visible = any;
    this.sparks.geometry.setDrawRange(0, picks.length * SPARKS);
    this.spot.intensity = any ? 160 : 0;
    this.fill.intensity = any ? 14 : 0;
  }

  clearCases() {
    const w = this.world;
    w.exhibits = w.exhibits.filter(e => !this.exhibits.includes(e));
    w.obstacles = w.obstacles.filter(o => !this.obstacles.includes(o));
    this.exhibits = []; this.obstacles = [];
    this.tags = this.tags.filter(t => !t.userData.inCase);
    for (const c of [...this.contents.children]) this.contents.remove(c);
    this.slots = [];
  }

  buildCase(p, kind, i, n) {
    const P = palette('lobby');
    const GOLD = P.accent;
    const wing = this.world.wingsById[p.wing] ?? { id: p.wing, name: p.wing ?? t('unknownWingName'), color: P.unknownWing };
    const wcolor = new THREE.Color(wing.color ?? P.unknownWing);
    // spread the cases along the back of the ring, away from the doorway
    const a = n === 1 ? 0 : -SPREAD + (2 * SPREAD * i) / (n - 1); // 0 = due south
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const pos = CENTER.clone().addScaledVector(dir, RING);
    const g = new THREE.Group();
    g.position.copy(pos);
    this.contents.add(g);

    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, PED_H, 28), mat({ color: P.pedestal, roughness: 0.35, metalness: 0.5 }));
    ped.position.y = PED_H / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: GOLD }));
    ring.rotation.x = Math.PI / 2; ring.position.y = PED_H + 0.01;
    const size = 0.5;
    const { obj, mat: emat } = exhibitObject(SHAPES[p.wing] ?? 'sphere', wcolor, size);
    const baseY = PED_H + 0.3 + size * 0.75;
    obj.position.y = baseY;
    // glass case: an open cylinder with a lid
    const glassMat = new THREE.MeshStandardMaterial({ color: P.caseGlass, transparent: true, opacity: P.caseGlassOpacity, roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.45, 32, 1, true), glassMat);
    glass.position.y = PED_H + 0.725;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32), mat({ color: P.caseFrame, metalness: 0.9, roughness: 0.3 }));
    lid.position.y = PED_H + 1.47;
    // fake spotlight: an additive beam from the ceiling and a pool on the floor
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.8, WALL_H - PED_H, 24, 1, true), new THREE.MeshBasicMaterial({ color: P.spot, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = PED_H + (WALL_H - PED_H) / 2;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshBasicMaterial({ color: P.spotPool, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.015;
    const plaque = signMesh(1.8, 0.9, {
      width: 1024, height: 512, bg: rgba(P.signBg, 0.9), border: GOLD,
      blocks: [
        { text: p.name, size: 92, weight: 800, color: P.signInk, maxLines: 3 },
        { text: wing.name, size: 52, weight: 600, color: P.wingInk || (wing.color ?? GOLD), maxLines: 1, gap: 22 },
      ],
    });
    plaque.position.y = PED_H + 2.05;
    // face the middle of the rotunda (a plane's front is +z)
    plaque.rotation.y = Math.atan2(-dir.x, -dir.z);
    const tag = ribbon(kind);
    tag.userData.inCase = true;
    tag.position.set(0, 0.45 + TAG_H, 0.02);
    plaque.add(tag);
    this.tags.push(tag);
    g.add(pool, ped, ring, obj, glass, lid, beam, plaque);

    const ob = { x: pos.x, z: pos.z, r: 0.75 };
    this.world.obstacles.push(ob);
    this.obstacles.push(ob);
    const standDist = 2.5;
    const stand = pos.clone().addScaledVector(dir, -standDist);
    stand.y = EYE;
    const plaqueTop = PED_H + 2.05 + 0.45 + TAG_H * 2;
    const ex = {
      project: p, wing, pos: pos.clone(), obj, mat: emat, plaque, baseY, size,
      objWorld: new THREE.Vector3(pos.x, baseY, pos.z),
      standPos: stand,
      lookAt: new THREE.Vector3(pos.x, baseY, pos.z),
      lookPitch: (Math.atan2(PED_H - EYE, standDist) + Math.atan2(plaqueTop - EYE, standDist)) / 2,
      spin: 0.8, phase: Math.random() * Math.PI * 2,
      hall: ACQ.id, inTimeline: false, inAcquisitions: true, glow: 0, fresh: this.fresh.get(p.id),
    };
    // world.update only touches obj.position.y and plaque.rotation.z, so the
    // case's local group is safe to hand to it like any other exhibit
    this.world.exhibits.push(ex);
    this.exhibits.push(ex);
    this.slots.push(pos);
  }

  // NEW ribbons and a gold halo on every fresh plaque out in the wings
  tagWings(fresh) {
    for (const e of this.world.exhibits) {
      if (e.inAcquisitions) continue;
      const info = fresh.get(e.project.id);
      e.fresh = info;
      const old = e.freshTag;
      if (old && (!info || old.userData.kind !== info.kind)) {
        e.plaque.remove(old, e.freshHalo);
        this.tags = this.tags.filter(t => t !== old);
        this.halos = this.halos.filter(h => h !== e.freshHalo);
        e.freshTag = e.freshHalo = null;
      }
      if (!info || e.freshTag) continue;
      const pw = e.plaque.geometry.parameters.width, ph = e.plaque.geometry.parameters.height;
      const tag = ribbon(info.kind);
      tag.scale.setScalar(1.4);
      tag.position.set(0, ph / 2 + TAG_H * 1.1, 0.02);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(pw + 0.2, ph + 0.2), new THREE.MeshBasicMaterial({ color: palette().freshHalo, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      halo.position.z = -0.02;
      halo.userData.phase = Math.random() * 6;
      e.plaque.add(tag, halo);
      e.freshTag = tag; e.freshHalo = halo;
      this.tags.push(tag); this.halos.push(halo);
    }
  }

  update(t) {
    if (this.effectsEnabled === false) return;
    for (const tag of this.tags) {
      tag.rotation.y = t * 1.5 + tag.userData.phase;
    }
    for (const h of this.halos) h.material.opacity = 0.28 + 0.12 * Math.sin(t * 2.2 + h.userData.phase);
    if (!this.sparks.visible) return;
    const arr = this.sparks.geometry.attributes.position.array;
    const n = this.slots.length * SPARKS;
    for (let i = 0; i < n; i++) {
      const s = this.sparkParams[i], c = this.slots[Math.floor(i / SPARKS)];
      const life = (s.y + t * s.speed) % 1; // rise from the pedestal and fade out the top
      const a = s.a + t * s.spin;
      arr[i * 3] = c.x + Math.cos(a) * s.r * (1 + life * 0.4);
      arr[i * 3 + 1] = PED_H + 0.2 + life * 2.4;
      arr[i * 3 + 2] = c.z + Math.sin(a) * s.r * (1 + life * 0.4);
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
  }
}
