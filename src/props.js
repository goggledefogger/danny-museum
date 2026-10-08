// Theme props: every decorative object a theme can list in its `props` array,
// plus the two "skins" that dress the working machinery (the factory with its
// lever, and the trapdoor). funhouse.js keeps the mechanics; a skin only builds
// the look. A theme picks one factory type and one trapdoor type and any number
// of decorations; the world builder (placeProps) iterates the list.
import * as THREE from 'three';
import { signMesh, textTexture, rgba } from './text.js';
import { palette, style, t, mat, props } from './theme.js';
import { LOBBY_R, HALL_W, startYear } from './world.js';

// soft round dot for particles (PointsMaterial draws squares otherwise)
export function glowSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ===================================================================
// Factory skins: build(body, root, spec) -> { lever, animate(dt, t, busy), ticketTex, glow }
// body is shaken while the machine runs; root (at FACTORY_POS) is not.
// ===================================================================

function gear(radius, color, hubColor) {
  const g = new THREE.Group();
  const m = mat({ color, metalness: 0.8, roughness: 0.35 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.22, 28), m);
  disc.rotation.z = Math.PI / 2;
  g.add(disc);
  const teeth = 12;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), m);
    tooth.position.set(0, Math.sin(a) * (radius + 0.1), Math.cos(a) * (radius + 0.1));
    tooth.rotation.x = -a;
    g.add(tooth);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, 0.3, 16), mat({ color: hubColor.color, emissive: hubColor.emissive }));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  return g;
}

function lever(body, spec, darkMat, brassMat) {
  const leverBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), darkMat);
  leverBase.position.set(2.05, 1.6, 0.7);
  body.add(leverBase);
  const pivot = new THREE.Group();
  pivot.position.set(2.05, 1.75, 0.7);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 10), brassMat);
  arm.position.y = 0.75;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), mat({ color: spec.knob, emissive: spec.knobGlow, roughness: 0.25 }));
  knob.position.y = 1.5;
  pivot.add(arm, knob);
  pivot.rotation.x = -0.45;
  body.add(pivot);
  return pivot;
}

export const FACTORY_SKINS = {
  'surprise-factory'(body, root, spec) {
    const metal = mat({ color: spec.metal, metalness: 0.7, roughness: 0.38 });
    const dark = mat({ color: spec.dark, metalness: 0.6, roughness: 0.5 });
    const brass = mat({ color: spec.brass, metalness: 0.9, roughness: 0.3 });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.5, 3.4), dark);
    plinth.position.y = 0.25;
    root.add(plinth);
    const box = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 2.4), metal);
    box.position.y = 1.8;
    body.add(box);
    // rivets along the front edges
    const rivetGeo = new THREE.SphereGeometry(0.06, 8, 6);
    for (let i = 0; i < 9; i++) {
      for (const y of [0.62, 2.98]) {
        const r = new THREE.Mesh(rivetGeo, brass);
        r.position.set(-1.55 + i * (3.1 / 8), y, 1.21);
        body.add(r);
      }
    }
    const label = signMesh(2.9, 1.1, {
      width: 1024, height: 388, bg: spec.labelBg, border: spec.brass, borderWidth: 12, radius: 30,
      blocks: [
        { text: t('factoryName'), size: 104, weight: 900, color: spec.labelInk, maxLines: 1 },
        { text: t('factorySubtitle'), size: 48, weight: 600, color: spec.labelSub, gap: 14 },
      ],
    });
    label.position.set(0, 2.15, 1.215);
    body.add(label);
    // hopper funnel on top
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.55, 1.1, 24, 1, true), mat({ color: spec.hopper, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    hopper.position.y = 3.65;
    body.add(hopper);
    // chimneys
    const chimneys = [];
    for (const x of [-1.15, 1.15]) {
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.6, 16), dark);
      ch.position.set(x, 3.8, -0.75);
      const cap = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 8, 20), brass);
      cap.rotation.x = Math.PI / 2; cap.position.set(x, 4.62, -0.75);
      body.add(ch, cap);
      chimneys.push(new THREE.Vector3(x, 4.7, -0.75));
    }
    // gears on both sides
    const gears = [];
    const hub = { color: spec.hub, emissive: spec.hubGlow };
    for (const sx of [-1, 1]) {
      const gr = gear(0.75, sx < 0 ? spec.gearA : spec.gearB, hub);
      gr.position.set(sx * 1.83, 2.0, 0.2);
      body.add(gr);
      const small = gear(0.42, spec.brass, hub);
      small.position.set(sx * 1.83, 2.95, -0.75);
      body.add(small);
      gears.push({ g: gr, rate: sx }, { g: small, rate: -sx * 1.8 });
    }
    // a row of bulbs
    const bulbs = [];
    spec.bulbs.forEach((c, i) => {
      const m = mat({ color: c, emissive: c, emissiveIntensity: 1 });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), m);
      b.position.set(-1.35 + i * 0.45, 3.28, 1.1);
      body.add(b);
      bulbs.push(m);
    });
    // output chute
    const chute = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.9), dark);
    chute.position.set(0, 0.95, 1.55);
    chute.rotation.x = 0.35;
    body.add(chute);
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.12), new THREE.MeshBasicMaterial({ color: spec.labelInk }));
    slot.position.set(0, 1.12, 1.21);
    body.add(slot);
    const pivot = lever(body, spec, dark, brass);
    // smoke puffs, in the unshaken root so they drift on their own
    const puffs = [];
    const puffMat = mat({ color: spec.smoke, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), puffMat.clone());
      p.userData.t = Math.random() * 3; p.userData.ch = i % 2;
      root.add(p);
      puffs.push(p);
    }
    const ticketTex = textTexture({ width: 512, height: 312, bg: spec.ticketBg, border: spec.brass, blocks: [{ text: t('factoryTicket'), size: 200, weight: 900, color: spec.ticketInk }] });
    return {
      lever: pivot, ticketTex, glow: spec.glow,
      animate(dt, time, busy) {
        for (const { g, rate } of gears) g.rotation.x += dt * rate * (busy ? 9 : 0.6);
        // idle: bulbs chase; busy: random blinking
        bulbs.forEach((m, i) => {
          m.emissiveIntensity = busy ? (Math.random() < 0.5 ? 2.5 : 0.1) : 0.4 + 0.9 * Math.max(0, Math.sin(time * 3 - i * 0.8));
        });
        // puffs drift up from the chimneys, faster while busy
        for (const p of puffs) {
          p.userData.t += dt * (busy ? 2.5 : 0.7);
          const life = p.userData.t % 3;
          const base = chimneys[p.userData.ch];
          p.position.set(base.x + Math.sin(life * 2 + p.id) * 0.2 * life, base.y + life * 0.9, base.z - life * 0.25);
          p.scale.setScalar(0.5 + life * 0.6);
          p.material.opacity = 0.45 * (1 - life / 3);
        }
      },
    };
  },

  // A specimen labelling machine: a cardboard housing, a conveyor of blank
  // specimen tags, a stamping arm and two paper spools. Busy = belt races.
  'labelling-machine'(body, root, spec) {
    const card = mat({ color: spec.housing });
    const kraft = mat({ color: spec.kraft });
    const brass = mat({ color: spec.brass, metalness: 0.9, roughness: 0.3 });
    const ink = mat({ color: spec.ink });

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.5, 3.4), kraft);
    plinth.position.y = 0.25;
    root.add(plinth);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.2, 1.9), card);
    housing.position.set(0, 1.6, -0.35);
    body.add(housing);
    // a folded-card roof (a triangular prism)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 3.1, 3, 1), kraft);
    roof.rotation.z = Math.PI / 2; roof.rotation.x = Math.PI / 6;
    roof.scale.set(1, 1, 0.55);
    roof.position.set(0, 2.98, -0.35);
    body.add(roof);
    const label = signMesh(2.7, 1.0, {
      width: 1024, height: 380, bg: spec.labelBg, border: spec.brass, borderWidth: 10, radius: 14,
      blocks: [
        { text: t('factoryName'), size: 100, weight: 700, color: spec.labelInk, maxLines: 1 },
        { text: t('factorySubtitle'), size: 50, weight: 400, color: spec.labelSub, gap: 10 },
      ],
    });
    label.position.set(0, 1.95, 0.61);
    body.add(label);
    // conveyor belt across the front, with rollers at the ends
    const beltLen = 4.6, beltY = 0.95, beltZ = 1.15;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(beltLen, 0.1, 0.8), ink);
    belt.position.set(0, beltY, beltZ);
    body.add(belt);
    for (const x of [-beltLen / 2, beltLen / 2]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.86, 12), brass);
      roller.rotation.x = Math.PI / 2; roller.position.set(x, beltY, beltZ);
      body.add(roller);
    }
    for (const x of [-1.9, 0, 1.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, beltY - 0.5, 0.1), brass);
      leg.position.set(x, 0.5 + (beltY - 0.5) / 2, beltZ);
      body.add(leg);
    }
    // the tags riding the belt: one InstancedMesh
    const tagTex = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = spec.tag; g.beginPath(); g.moveTo(40, 4); g.lineTo(w - 4, 4); g.lineTo(w - 4, h - 4); g.lineTo(40, h - 4); g.lineTo(4, h / 2); g.closePath(); g.fill();
      g.strokeStyle = spec.tagEdge; g.lineWidth = 5; g.stroke();
      g.fillStyle = spec.tagEdge; g.beginPath(); g.arc(34, h / 2, 9, 0, Math.PI * 2); g.fill();
      g.strokeStyle = spec.ink; g.lineWidth = 4;
      for (const y of [56, 84, 112]) { g.beginPath(); g.moveTo(70, y); g.lineTo(70 + 60 + Math.random() * 90, y + (Math.random() - 0.5) * 6); g.stroke(); }
    });
    const nTags = 12;
    const tags = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, side: THREE.DoubleSide }), nTags);
    body.add(tags);
    const dummy = new THREE.Object3D();
    let offset = 0;
    // the stamping arm over the middle of the belt
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.5, 0.16), brass);
    post.position.set(0, 1.0 + 0.75, beltZ - 0.5);
    const armBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), brass);
    armBar.position.set(0, 2.45, beltZ - 0.25);
    const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), ink);
    stamp.position.set(0, 1.55, beltZ);
    body.add(post, armBar, stamp);
    // paper spools on the roof
    const spools = [];
    for (const x of [-0.85, 0.85]) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14), mat({ color: spec.tag }));
      sp.rotation.x = Math.PI / 2; sp.position.set(x, 3.75, -0.35);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 8), brass);
      core.rotation.x = Math.PI / 2; core.position.copy(sp.position);
      body.add(sp, core);
      spools.push(sp);
    }
    const pivot = lever(body, spec, kraft, brass);
    const ticketTex = textTexture({ width: 512, height: 312, bg: spec.tag, border: spec.tagEdge, radius: 18, blocks: [{ text: t('factoryTicket'), size: 120, weight: 700, color: spec.ink }] });
    return {
      lever: pivot, ticketTex, glow: spec.glow,
      animate(dt, time, busy) {
        offset = (offset + dt * (busy ? 2.4 : 0.25)) % beltLen;
        for (let i = 0; i < nTags; i++) {
          const x = ((i * beltLen) / nTags + offset) % beltLen - beltLen / 2;
          dummy.position.set(x, beltY + 0.07, beltZ + 0.05);
          dummy.rotation.set(-1.25, 0, Math.sin(i * 2.1) * 0.25);
          dummy.updateMatrix();
          tags.setMatrixAt(i, dummy.matrix);
        }
        tags.instanceMatrix.needsUpdate = true;
        const k = busy ? (time * 6) % 1 : (time * 0.7) % 1;
        stamp.position.y = 1.55 - Math.max(0, Math.sin(k * Math.PI)) * 0.42;
        for (const sp of spools) sp.rotation.y += dt * (busy ? 6 : 0.4);
      },
    };
  },
};

// ===================================================================
// Trapdoor skins: build(g, hinge, half, spec) -> { sign }. The hinge sits on
// the -x edge; funhouse.js swings it when someone steps on the tile.
// ===================================================================
export const TRAPDOOR_SKINS = {
  'hazard-trapdoor'(g, hinge, half, spec) {
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    pit.rotation.x = -Math.PI / 2; pit.position.y = 0.012;
    g.add(pit);
    const doorTex = textTexture({
      width: 512, height: 512, bg: spec.door, stripes: spec.stripes, radius: 10, padding: 30,
      blocks: [{ text: t('trapdoorLabel'), size: 120, weight: 900, color: spec.ink, maxLines: 2, shadow: '#000' }],
    });
    const edge = () => mat({ color: spec.edge });
    const door = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.05, half * 2), [
      edge(), edge(),
      mat({ map: doorTex, roughness: 0.6, emissive: spec.doorGlow, emissiveMap: doorTex, emissiveIntensity: 0.6 }),
      mat({ color: spec.under }), edge(), edge(),
    ]);
    door.position.x = half;
    hinge.add(door);
    // little traffic cones at the corners, for plausibility
    const coneMat = mat({ color: spec.cones, roughness: 0.6 });
    for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 12), coneMat);
      cone.position.set(x, 0.225, z);
      g.add(cone);
    }
    const P = palette();
    const sign = signMesh(2.2, 0.7, {
      width: 768, height: 244, bg: rgba(P.signBg, 0.85), border: spec.door, padding: 26,
      blocks: [{ text: t('trapdoorSign'), size: 70, weight: 800, color: spec.door, maxLines: 1 }],
    });
    sign.position.set(0, 2.3, 0);
    g.add(sign);
    return { sign };
  },

  // A round airlock hatch set in a ring of warning stripes, with two beacons.
  airlock(g, hinge, half, spec) {
    const pit = new THREE.Mesh(new THREE.CircleGeometry(half, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    pit.rotation.x = -Math.PI / 2; pit.position.y = 0.012;
    g.add(pit);
    const stripeTex = canvasTex(512, 64, (c, w, h) => {
      c.fillStyle = spec.stripeA; c.fillRect(0, 0, w, h);
      c.fillStyle = spec.stripeB;
      for (let x = -h; x < w + h; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 24, 0); c.lineTo(x + 24 - h, h); c.lineTo(x - h, h); c.closePath(); c.fill(); }
    });
    stripeTex.wrapS = THREE.RepeatWrapping; stripeTex.repeat.set(3, 1);
    // a ring's UVs are planar; remap them so u runs around the ring and v across it
    const SEG = 40;
    const ringGeo = new THREE.RingGeometry(half + 0.05, half + 0.5, SEG, 1);
    const uv = ringGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (i % (SEG + 1)) / SEG, Math.floor(i / (SEG + 1)));
    const stripes = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ map: stripeTex }));
    stripes.rotation.x = -Math.PI / 2; stripes.position.y = 0.011;
    g.add(stripes);
    const hatchTex = canvasTex(512, 512, (c, w) => {
      const r = w / 2;
      c.fillStyle = spec.hatch; c.beginPath(); c.arc(r, r, r - 4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = spec.hatchLine; c.lineWidth = 10;
      for (const rr of [r - 14, r - 70, 90]) { c.beginPath(); c.arc(r, r, rr, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = spec.hatchLine;
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; c.beginPath(); c.arc(r + Math.cos(a) * (r - 42), r + Math.sin(a) * (r - 42), 9, 0, Math.PI * 2); c.fill(); }
      c.font = `700 64px ${style().typography.fontFamily}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = spec.ink;
      c.fillText(t('trapdoorLabel'), r, r - 150);
      c.fillText(t('trapdoorLabel'), r, r + 150);
    });
    const side = mat({ color: spec.hatchLine });
    const hatch = new THREE.Mesh(new THREE.CylinderGeometry(half, half, 0.06, 32), [side, mat({ map: hatchTex }), side]);
    hatch.position.set(half, 0.03, 0);
    hinge.add(hatch);
    // the wheel: a ring with four spokes
    const brass = mat({ color: spec.brass, metalness: 0.9, roughness: 0.3 });
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.045, 6, 20), brass);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(half, 0.1, 0);
    hinge.add(wheel);
    for (let i = 0; i < 2; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.05), brass);
      spoke.rotation.y = i * Math.PI / 2; spoke.position.set(half, 0.1, 0);
      hinge.add(spoke);
    }
    // two amber beacons
    const beaconMat = mat({ color: spec.beacon, emissive: spec.beacon, emissiveIntensity: 0.8 });
    for (const [x, z] of [[-1.5, -1.5], [1.5, 1.5]]) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.2, 10), brass);
      base.position.set(x, 0.1, z);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), beaconMat);
      lamp.position.set(x, 0.3, z);
      g.add(base, lamp);
    }
    const P = palette();
    const sign = signMesh(2.4, 0.75, {
      width: 768, height: 244, bg: rgba(P.signBg, 0.92), border: spec.stripeB, padding: 26,
      blocks: [{ text: t('trapdoorSign'), size: 70, weight: 700, color: P.signInk, maxLines: 1 }],
    });
    sign.position.set(0, 2.3, 0);
    g.add(sign);
    return { sign, beaconMat };
  },
};

// ===================================================================
// Decorations: build(scene, world, spec) -> optional update(dt, t)
// ===================================================================

// where a wall prop goes: { pos, rotY } in world space
function wallSpot(world, spec, inset) {
  if (!spec.wing || spec.wing === 'lobby') {
    const a = THREE.MathUtils.degToRad(spec.angle ?? 0);
    const r = LOBBY_R - inset;
    return { pos: new THREE.Vector3(Math.sin(a) * r, spec.y ?? 3, -Math.cos(a) * r), rotY: -a };
  }
  const spoke = world.spokes.find(s => s.exit.id === spec.wing);
  if (!spoke) return null;
  const side = spec.side < 0 ? -1 : 1;
  const s = spoke.s0 + (spoke.s1 - spoke.s0) * (spec.at ?? 0.5);
  const pos = spoke.toWorld(side * (HALL_W / 2 - 0.15 - inset), s, spec.y ?? 3);
  return { pos, rotY: -spoke.angle + (side < 0 ? Math.PI / 2 : -Math.PI / 2) };
}

// A low-poly Earth: flat faces coloured ocean or land by a cheap noise, so it
// reads as a paper model. Shared by every porthole.
let earthGeo = null;
function paperEarthGeometry(P) {
  if (earthGeo) return earthGeo;
  const geo = new THREE.IcosahedronGeometry(1, 2); // already non-indexed: one colour per face
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sea = new THREE.Color(P.earthSea), sea2 = new THREE.Color(P.earthSea).multiplyScalar(0.85);
  const land = new THREE.Color(P.earthLand), land2 = new THREE.Color(P.earthLand).multiplyScalar(0.8);
  const ice = new THREE.Color(P.earthIce);
  const v = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    v.set(0, 0, 0);
    for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, f + k));
    v.normalize();
    const n = Math.sin(v.x * 3.1 + 1.3) + Math.sin(v.y * 2.3 + v.z * 3.7) + Math.sin(v.z * 4.1 - v.x * 1.7);
    const c = Math.abs(v.y) > 0.86 ? ice : n > 0.55 ? (f % 2 ? land : land2) : (f % 2 ? sea : sea2);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  earthGeo = geo;
  return geo;
}

let starTex = null;
function starWindow(P) {
  if (starTex) return starTex;
  starTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = P.space; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(255,248,230,${0.3 + Math.random() * 0.7})`;
      const r = Math.random() < 0.9 ? 1 : 2;
      g.fillRect(Math.random() * w, Math.random() * h, r, r);
    }
  });
  return starTex;
}

export const DECOR = {
  // the glowing ring overhead; hue-cycles when the palette says skyCycle
  skylight(scene, world, spec) {
    const P = palette();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.radius ?? 7.5, spec.tube ?? 0.22, 12, 120), new THREE.MeshBasicMaterial({ color: P.ceiling }));
    ring.rotation.x = Math.PI / 2; ring.position.y = spec.y ?? 10.5;
    scene.add(ring);
    return (dt, time) => {
      if (P.skyCycle) ring.material.color.setHSL((time * 0.01) % 1, 0.85, 0.62);
      ring.rotation.z = time * 0.05;
    };
  },

  balloons(scene, world, spec) {
    const balloons = [];
    const colors = world.wings.map(w => w.color).concat(spec.extraColors ?? []);
    const n = spec.count ?? 9;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const col = new THREE.Color(colors[i % colors.length]);
      const skin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16).scale(1, 1.2, 1),
        mat({ color: col, roughness: 0.25, metalness: 0.05, emissive: col, emissiveIntensity: 0.15 }));
      const knot = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.15, 8), skin.material);
      knot.position.y = -0.7;
      const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.75, 0), new THREE.Vector3(0.05, -1.6, 0), new THREE.Vector3(-0.05, -2.4, 0)]),
        new THREE.LineBasicMaterial({ color: spec.string }));
      g.add(skin, knot, string);
      const a = (i / n) * Math.PI * 2 + 0.3, r = 8 + (i % 3) * 1.6;
      g.userData = { a, r, y: 5.6 + (i % 4) * 0.8, phase: Math.random() * 6 };
      scene.add(g);
      balloons.push(g);
    }
    return (dt, time) => {
      for (const b of balloons) {
        const u = b.userData;
        const a = u.a + time * 0.04;
        b.position.set(Math.sin(a) * u.r, u.y + Math.sin(time * 0.9 + u.phase) * 0.35, -Math.cos(a) * u.r);
        b.rotation.z = Math.sin(time * 0.7 + u.phase) * 0.12;
      }
    };
  },

  // orbiting "ideas": little glowing motes in slow tilted orbits
  'idea-motes'(scene, world, spec) {
    const n = spec.count ?? 160;
    const params = [];
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      params.push({ r: 3 + Math.random() * 9, y: 2 + Math.random() * 8, speed: (0.05 + Math.random() * 0.2) * (Math.random() < 0.5 ? -1 : 1), a: Math.random() * 6.28, wob: Math.random() * 6.28 });
      c.setHSL(spec.hue + Math.random() * spec.hueSpread, 1, 0.65 + Math.random() * 0.2);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ideas = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, map: glowSprite(), alphaTest: 0.01, vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(ideas);
    return (dt, time) => {
      const arr = geo.attributes.position.array;
      params.forEach((p, i) => {
        const a = p.a + time * p.speed;
        arr[i * 3] = Math.cos(a) * p.r;
        arr[i * 3 + 1] = p.y + Math.sin(time * 0.8 + p.wob) * 0.5;
        arr[i * 3 + 2] = Math.sin(a) * p.r - 1;
      });
      geo.attributes.position.needsUpdate = true;
    };
  },

  // a star field on the sky dome: one Points cloud
  starfield(scene, world, spec) {
    const n = spec.count ?? 1500;
    const pos = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(300 + Math.random() * 60);
      if (v.y < -40) v.y = -v.y; // keep most stars above the floor line
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: spec.size ?? 2, sizeAttenuation: false, color: palette().stars, fog: false }));
    scene.add(stars);
    return (dt, time) => { stars.rotation.y = time * 0.004; };
  },

  // a porthole in a wall, looking out on a paper Earth against the stars
  porthole(scene, world, spec) {
    const P = palette();
    const spot = wallSpot(world, spec, 0);
    if (!spot) return null;
    const g = new THREE.Group();
    g.position.copy(spot.pos);
    g.rotation.y = spot.rotY;
    const R = spec.radius ?? 0.95;
    const backing = new THREE.Mesh(new THREE.CircleGeometry(R, 24), new THREE.MeshBasicMaterial({ map: starWindow(P), fog: false }));
    backing.position.z = 0.01;
    const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.55, 24, 1, true), mat({ color: P.portholeTunnel, side: THREE.BackSide }));
    tunnel.rotation.x = Math.PI / 2; tunnel.position.z = 0.29;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(R + 0.04, 0.11, 6, 24), mat({ color: P.caseFrame, metalness: 0.9, roughness: 0.3 }));
    frame.position.z = 0.56;
    const bolts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 6, 4), mat({ color: P.caseFrame }), 8);
    const d = new THREE.Object3D();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      d.position.set(Math.cos(a) * (R + 0.04), Math.sin(a) * (R + 0.04), 0.66); d.updateMatrix();
      bolts.setMatrixAt(i, d.matrix);
    }
    const earthR = R * 0.42;
    const earth = new THREE.Mesh(paperEarthGeometry(P), mat({ vertexColors: true, flatShading: true }));
    earth.scale.setScalar(earthR);
    earth.position.set(R * 0.18, -R * 0.12, 0.3);
    earth.rotation.z = 0.4;
    // a paper-strip cloud ring around it
    const clouds = new THREE.Mesh(new THREE.CylinderGeometry(earthR * 1.3, earthR * 1.3, earthR * 0.16, 18, 1, true), mat({ color: P.earthCloud, side: THREE.DoubleSide }));
    clouds.position.copy(earth.position);
    clouds.rotation.set(1.1, 0, 0.35);
    // a tiny paper moon
    const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(earthR * 0.22, 0), mat({ color: P.earthIce, flatShading: true }));
    moon.position.set(-R * 0.55, R * 0.45, 0.2);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(R, 24), new THREE.MeshBasicMaterial({ color: P.caseGlass, transparent: true, opacity: 0.08, depthWrite: false }));
    glass.position.z = 0.55;
    g.add(backing, tunnel, earth, clouds, moon, frame, bolts, glass);
    scene.add(g);
    const spin = spec.spin ?? 0.12, phase = Math.random() * 6;
    return (dt, time) => {
      earth.rotation.y = time * spin + phase;
      clouds.rotation.y = -time * spin * 0.7 + phase;
    };
  },

  // A cardboard dinosaur kit skeleton: a spine plank with slotted rib hoops,
  // flat leg panels and a profile skull, standing on a kraft plinth. Its bones
  // carry hand-lettered tags naming the longest-running projects.
  dinosaur(scene, world, spec) {
    const P = palette();
    const a = THREE.MathUtils.degToRad(spec.angle ?? 67.5);
    const radius = spec.radius ?? 8.6;
    const g = new THREE.Group();
    g.position.set(Math.sin(a) * radius, 0, -Math.cos(a) * radius);
    g.rotation.y = a + Math.PI / 2;   // local +x (the head) points at the lobby centre
    const sc = spec.scale ?? 1;
    g.scale.setScalar(sc);
    const board = mat({ color: P.cardboard, side: THREE.DoubleSide });
    const boardDark = mat({ color: P.cardboardDark, side: THREE.DoubleSide });
    const brass = mat({ color: P.caseFrame, metalness: 0.9, roughness: 0.3 });
    const TH = 0.05;

    // plank between two points in the xy plane, h tall
    const plank = (x1, y1, x2, y2, h, m = board, z = 0) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const p = new THREE.Mesh(new THREE.BoxGeometry(len + h * 0.3, h, TH), m);
      p.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
      p.rotation.z = Math.atan2(y2 - y1, x2 - x1);
      g.add(p);
      return p;
    };
    // spine from tail tip to neck, tapering
    const spine = [[-4.6, 1.5], [-3.4, 2.15], [-2.2, 2.75], [-1.0, 3.05], [0.3, 3.0], [1.4, 3.15], [2.2, 3.7]];
    const hts = [0.12, 0.18, 0.26, 0.34, 0.34, 0.28];
    for (let i = 0; i < spine.length - 1; i++) plank(...spine[i], ...spine[i + 1], hts[i]);
    // tail vertebra fins
    for (let i = 0; i < 6; i++) {
      const x = -4.2 + i * 0.6, y = 1.75 + i * 0.3;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.36), boardDark);
      fin.position.set(x, y, 0); fin.rotation.z = -0.4;
      g.add(fin);
    }
    // rib hoops: flat arcs hanging under the spine, perpendicular to it
    const ribs = [];
    for (let i = 0; i < 7; i++) {
      const x = -0.7 + i * 0.36;
      const r = 0.95 - Math.abs(i - 3) * 0.1;
      const arc = new THREE.Mesh(new THREE.RingGeometry(r - 0.07, r, 10, 1, Math.PI * 1.05, Math.PI * 0.9), board);
      arc.rotation.y = Math.PI / 2;
      arc.position.set(x, 3.0, 0);
      g.add(arc);
      ribs.push({ x, y: 3.0 - r });
    }
    // pelvis panel
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, TH), boardDark);
    pelvis.position.set(-1.1, 2.7, 0.12); pelvis.rotation.z = -0.15;
    g.add(pelvis);
    // hind legs: thigh, shin, foot, on both sides
    for (const z of [-0.36, 0.36]) {
      plank(-1.1, 2.6, -0.7, 1.5, 0.3, board, z);
      plank(-0.7, 1.5, -1.25, 0.45, 0.22, board, z);
      plank(-1.4, 0.38, -0.55, 0.38, 0.14, boardDark, z);
      // tiny arms
      plank(1.3, 2.75, 1.65, 2.35, 0.09, board, z * 0.6);
      plank(1.65, 2.35, 1.9, 2.5, 0.07, board, z * 0.6);
    }
    // skull: an extruded side profile with an open jaw and an eye hole
    const skull = new THREE.Shape();
    skull.moveTo(0, 0); skull.lineTo(0.3, 0.45); skull.lineTo(0.9, 0.62); skull.lineTo(1.5, 0.45); skull.lineTo(1.65, 0.2);
    skull.lineTo(1.05, 0.08); skull.lineTo(1.6, -0.1); skull.lineTo(1.45, -0.3); skull.lineTo(0.5, -0.32); skull.lineTo(0.1, -0.15);
    skull.closePath();
    const eye = new THREE.Path(); eye.absarc(0.62, 0.3, 0.1, 0, Math.PI * 2, true);
    skull.holes.push(eye);
    const skullGeo = new THREE.ExtrudeGeometry(skull, { depth: 0.12, bevelEnabled: false });
    skullGeo.translate(0, 0, -0.06);
    const head = new THREE.Mesh(skullGeo, board);
    head.position.set(2.15, 3.75, 0);
    head.rotation.z = -0.12;
    g.add(head);
    // teeth: a row of little paper triangles
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 3), mat({ color: P.paper }));
      tooth.position.set(2.65 + i * 0.16, 3.72 - i * 0.02, 0);
      tooth.rotation.z = Math.PI;
      g.add(tooth);
    }
    // plinth and support rods
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.3, 2.2), boardDark);
    plinth.position.set(-0.4, 0.15, 0);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.05, 2.3), brass);
    edge.position.set(-0.4, 0.31, 0);
    g.add(plinth, edge);
    for (const x of [-3.0, 0.3]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), brass);
      const y = x < 0 ? 2.35 : 3.0;
      rod.scale.y = (y - 0.3) / 3; rod.position.set(x, 0.3 + (y - 0.3) / 2, 0);
      g.add(rod);
    }
    // placard on the plinth's front (local -z faces the spawn side)
    const placard = signMesh(2.6, 0.75, {
      width: 1024, height: 296, bg: P.labelCard, border: P.caseFrame, borderWidth: 8, radius: 12, padding: 30,
      blocks: [
        { text: t('dinoTitle'), size: 70, weight: 700, color: P.labelInk, maxLines: 1 },
        { text: t('dinoSubtitle'), size: 44, weight: 400, color: P.labelInk, maxLines: 1, gap: 8 },
      ],
    });
    placard.position.set(1.2, 0.62, -1.15); placard.rotation.set(-0.35, Math.PI, 0);
    g.add(placard);

    // tags on the bones: the longest-running projects
    const top = longestRunning(world.projects, spec.bones ?? 6);
    const anchors = [
      { at: [2.9, 3.9], tag: [3.4, 5.0] },          // skull
      { at: [1.9, 3.45], tag: [1.9, 4.8] },         // neck
      { at: [ribs[3].x, ribs[3].y + 0.1], tag: [0.6, 1.25] }, // rib
      { at: [-0.85, 1.9], tag: [-1.0, 4.1] },       // thigh
      { at: [-2.8, 2.45], tag: [-2.9, 3.75] },      // tail
      { at: [-4.2, 1.7], tag: [-4.4, 0.95] },       // tail tip
      { at: [1.7, 2.4], tag: [2.9, 2.0] },          // arm
    ];
    const lineMat = new THREE.LineBasicMaterial({ color: P.labelInk });
    top.slice(0, anchors.length).forEach((p, i) => {
      const { at, tag } = anchors[i];
      const label = signMesh(1.5, 0.62, {
        width: 768, height: 318, bg: P.labelCard, border: P.labelInk, borderWidth: 5, radius: 10, padding: 26,
        blocks: [
          { text: p.name, size: 64, weight: 700, color: P.labelInk, maxLines: 2 },
          { text: t('dinoBoneLabel', { start: p.start, end: p.endLabel, years: p.span }), size: 42, weight: 400, color: P.labelInkSoft, maxLines: 1, gap: 6 },
        ],
      });
      label.position.set(tag[0], tag[1], -0.95);
      label.rotation.y = Math.PI;   // read from the local -z side
      const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(at[0], at[1], -0.05), new THREE.Vector3(tag[0], tag[1] + (tag[1] > at[1] ? -0.31 : 0.31), -0.95)]), lineMat);
      label.userData.phase = i * 1.3;
      g.add(label, string);
    });
    scene.add(g);
    // keep visitors off the plinth
    for (let x = -4.6; x <= 4.2; x += 1.2) {
      const w = new THREE.Vector3(x * sc - 0.4 * sc, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
      world.obstacles.push({ x: w.x, z: w.z, r: 1.15 * sc });
    }
    world.dinosaur = { group: g, bones: top.map(p => p.id) };
    return null;
  },
};

// ---------- the longest-running projects, for the dinosaur ----------
// years strings look like "2014-2019", "~2013-2026", "2017-present" or "2020".
export function projectSpan(years, nowYear = new Date().getFullYear()) {
  const s = String(years ?? '');
  const start = startYear(s);
  if (start == null) return null;
  const all = s.match(/\d{4}/g).map(Number);
  const ongoing = /present|now|ongoing|current/i.test(s);
  const end = ongoing ? nowYear : Math.min(nowYear, Math.max(...all));
  return { start, end, span: end - start, ongoing };
}

export function longestRunning(projects, n = 6) {
  return projects
    .map(p => ({ p, s: projectSpan(p.years) }))
    .filter(x => x.s && x.s.span > 0)
    .sort((a, b) => b.s.span - a.s.span || a.s.start - b.s.start || a.p.name.localeCompare(b.p.name))
    .slice(0, n)
    .map(({ p, s }) => ({ id: p.id, name: p.name, start: s.start, end: s.end, endLabel: s.ongoing ? t('dinoNow') : String(s.end), span: s.span }));
}

// Build every decoration the theme lists; returns one update(dt, t) for all.
export function placeProps(scene, world) {
  const updaters = [];
  for (const spec of props(p => DECOR[p.type])) {
    const u = DECOR[spec.type](scene, world, spec);
    if (u) updaters.push(u);
  }
  for (const spec of props(p => !DECOR[p.type] && !FACTORY_SKINS[p.type] && !TRAPDOOR_SKINS[p.type])) {
    console.warn(`unknown prop type: ${spec.type}`);
  }
  return (dt, time) => { for (const u of updaters) u(dt, time); };
}

export const PROP_TYPES = [...Object.keys(DECOR), ...Object.keys(FACTORY_SKINS), ...Object.keys(TRAPDOOR_SKINS)];
