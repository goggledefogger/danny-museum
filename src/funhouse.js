// The fun stuff: the Surprise Factory, the trapdoor, confetti, and the
// ambient life (balloons, orbiting ideas, colour-cycling sky).
import * as THREE from 'three';
import { EYE } from './world.js';
import { palette, props, t } from './theme.js';
import { FACTORY_SKINS, TRAPDOOR_SKINS, glowSprite, placeProps } from './props.js';

const FACTORY_POS = new THREE.Vector3(0, 0, -1);
const TRAP_POS = new THREE.Vector3(-5.5, 0, 4.5);
const TRAP_HALF = 1.05;

const easeOutBack = t => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

export { glowSprite };

// the first prop of a kind the theme lists, else the first kind known
const pick = skins => props(p => skins[p.type])[0] ?? { type: Object.keys(skins)[0] };

export class Funhouse {
  constructor(scene, world, hud) {
    this.scene = scene; this.world = world; this.hud = hud;
    this.bursts = [];
    this.factoryAnim = -1;
    this.lastSurprise = null;
    this.fall = null;
    this.trapArmed = true;
    this.buildFactory();
    this.buildTrapdoor();
    this.buildAmbient();
  }

  // ---------------- Surprise Factory ----------------
  buildFactory() {
    const f = new THREE.Group();
    f.position.copy(FACTORY_POS);
    this.scene.add(f);
    this.factory = f;
    const body = new THREE.Group();
    f.add(body);
    this.factoryBody = body;
    // the look comes from the theme's factory prop (props.js FACTORY_SKINS)
    const spec = pick(FACTORY_SKINS);
    this.skin = FACTORY_SKINS[spec.type](body, f, spec);
    this.lever = this.skin.lever;
    // the flying ticket
    this.ticket = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({
      map: this.skin.ticketTex, transparent: true, side: THREE.DoubleSide,
    }));
    this.ticket.visible = false;
    f.add(this.ticket);
    const light = new THREE.PointLight(this.skin.glow, 45, 14, 1.5);
    light.position.set(0, 5.5, 3.5);
    f.add(light);
    this.world.obstacles.push({ x: FACTORY_POS.x, z: FACTORY_POS.z, r: 2.6 });
  }

  distToFactory(pos) { return Math.hypot(pos.x - FACTORY_POS.x, pos.z - FACTORY_POS.z); }
  nearFactory(pos) { return this.distToFactory(pos) < 4.4; }

  pullLever() {
    if (this.factoryAnim >= 0) return;
    this.factoryAnim = 0;
    this.spat = false;
  }

  // When anything is fresh (world.fresh, kept by main.js), roughly one pull in
  // three draws from the fresh pile instead of the whole museum.
  pickSurprise() {
    const freshIds = this.world.fresh;
    const fresh = freshIds?.size ? this.world.projects.filter(p => freshIds.has(p.id)) : [];
    const useFresh = fresh.length > 0 && Math.random() < 1 / 3;
    const base = useFresh ? fresh : this.world.projects;
    const pool = base.filter(p => p.id !== this.lastSurprise?.id);
    const list = pool.length ? pool : base;
    const p = list[Math.floor(Math.random() * list.length)];
    this.lastSurprise = p;
    this.lastSurpriseFresh = useFresh;
    return p;
  }

  updateFactory(dt, t) {
    const busy = this.factoryAnim >= 0;
    this.skin.animate(dt, t, busy);
    if (!busy) {
      this.factoryBody.position.set(0, 0, 0);
      this.lever.rotation.x = -0.45;
      return;
    }
    this.factoryAnim += dt;
    const a = this.factoryAnim;
    // lever: yank down over 0.25s, hold, spring back
    this.lever.rotation.x = a < 0.25 ? -0.45 + (a / 0.25) * 1.55 : a < 0.9 ? 1.1 : 1.1 - Math.min(1, (a - 0.9) / 0.4) * 1.55;
    // rattle, strongest in the middle of the run
    const shake = Math.sin(Math.min(1, a / 1.4) * Math.PI) * 0.07;
    this.factoryBody.position.set((Math.random() - 0.5) * shake, Math.abs(Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    // ticket arcs out of the chute
    if (a > 0.9 && a < 1.9) {
      const k = (a - 0.9) / 1.0;
      this.ticket.visible = true;
      this.ticket.position.set(Math.sin(k * 3) * 0.3, 1.1 + Math.sin(k * Math.PI) * 2.4 + k * 0.8, 1.4 + k * 1.6);
      this.ticket.rotation.set(k * 2, k * 7, k * 1.5);
      this.ticket.scale.setScalar(0.6 + k * 0.8);
      this.ticket.material.opacity = 1 - Math.max(0, k - 0.7) / 0.3;
    } else this.ticket.visible = false;
    if (a > 1.35 && !this.spat) {
      this.spat = true;
      const p = this.pickSurprise();
      if (p) {
        this.hud.showSurprise(p, this.world.wingsById[p.wing], this.lastSurpriseFresh);
        this.burst(new THREE.Vector3(FACTORY_POS.x, 3.2, FACTORY_POS.z + 2.2), palette().confetti, 160);
      }
    }
    if (a > 2.0) this.factoryAnim = -1;
  }

  // ---------------- Trapdoor ----------------
  buildTrapdoor() {
    const g = new THREE.Group();
    g.position.copy(TRAP_POS);
    this.scene.add(g);
    // hinge on the -x edge; the door hangs off it toward +x
    const hinge = new THREE.Group();
    hinge.position.set(-TRAP_HALF, 0.03, 0);
    g.add(hinge);
    this.trapHinge = hinge;
    // the look comes from the theme's trapdoor prop (props.js TRAPDOOR_SKINS)
    const spec = pick(TRAPDOOR_SKINS);
    this.trapSign = TRAPDOOR_SKINS[spec.type](g, hinge, TRAP_HALF, spec).sign;
  }

  // Called every frame with the player; returns true while the fall owns the camera.
  updateTrapdoor(dt, t, player) {
    this.trapSign.rotation.y = Math.sin(t * 0.7) * 0.6;
    this.trapSign.position.y = 2.3 + Math.sin(t * 2) * 0.08;
    const p = player.position;
    const onTile = Math.abs(p.x - TRAP_POS.x) < TRAP_HALF && Math.abs(p.z - TRAP_POS.z) < TRAP_HALF;
    if (!this.fall) {
      if (!onTile) this.trapArmed = true;
      this.trapHinge.rotation.z += (0 - this.trapHinge.rotation.z) * Math.min(1, dt * 3);
      if (onTile && this.trapArmed) this.startFall(player);
      return false;
    }
    const f = this.fall;
    f.t += dt;
    if (f.phase === 'drop') {
      this.trapHinge.rotation.z = -Math.min(1, f.t / 0.2) * 1.7;
      // accelerate downward (y = y0 - g t^2 / 2) with a slow spin
      const k = Math.max(0, f.t - 0.15);
      p.y = EYE - 14 * k * k;
      player.setLook(f.yaw + k * 2.5, -0.6 - k * 0.6);
      this.hud.flash(Math.min(1, k / 0.55));
      if (k > 0.6) {
        f.phase = 'land'; f.t = 0;
        const spoke = f.target;
        const at = spoke.toWorld(0, spoke.s0 + 3.5, EYE);
        player.teleport(at, spoke.toWorld(0, spoke.s1, EYE));
        f.yaw = player.yaw;
      }
    } else {
      // drop in from above and settle with a little overshoot
      const k = Math.min(1, f.t / 0.7);
      p.y = EYE + (1 - easeOutBack(k)) * 7;
      player.setLook(f.yaw, -0.5 * (1 - k));
      this.hud.flash(1 - k);
      if (k >= 1) {
        p.y = EYE;
        this.fall = null;
        player.frozen = false;
        this.hud.toast(t('trapdoorLand', { wing: f.target.exit.name }));
        return false;
      }
    }
    return true;
  }

  startFall(player) {
    const wings = this.world.spokes.filter(s => !s.isTimeline);
    if (!wings.length) return;
    this.trapArmed = false;
    player.frozen = true;
    this.fall = { t: 0, phase: 'drop', yaw: player.yaw, target: wings[Math.floor(Math.random() * wings.length)] };
    this.hud.toast(t('trapdoorFall'));
  }

  // ---------------- Confetti ----------------
  burst(origin, colors, n = 260) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = [];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos.set([origin.x, origin.y, origin.z], i * 3);
      c.set(colors[i % colors.length]);
      col.set([c.r, c.g, c.b], i * 3);
      // random direction in an upward cone
      const a = Math.random() * Math.PI * 2, up = 3 + Math.random() * 5, out = 1 + Math.random() * 3.5;
      vel.push(new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);
    this.bursts.push({ pts, vel, life: 0 });
  }

  updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life += dt;
      const arr = b.pts.geometry.attributes.position.array;
      b.vel.forEach((v, j) => {
        v.y -= 9 * dt;            // gravity
        v.multiplyScalar(1 - dt * 0.9); // air drag, so it flutters
        arr[j * 3] += v.x * dt; arr[j * 3 + 1] = Math.max(0.05, arr[j * 3 + 1] + v.y * dt); arr[j * 3 + 2] += v.z * dt;
      });
      b.pts.geometry.attributes.position.needsUpdate = true;
      b.pts.material.opacity = 1 - Math.max(0, b.life - 1.6) / 1.0;
      if (b.life > 2.6) { this.scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); this.bursts.splice(i, 1); }
    }
  }

  // ---------------- Ambient life ----------------
  // Sky and hemisphere light come from the palette; everything else ambient
  // (skylight, balloons, motes, stars, portholes, the dinosaur) is a theme prop.
  buildAmbient() {
    const P = palette();
    this.cycle = P.skyCycle;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ color: P.sky, side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(P.hemi.sky, P.hemi.ground, P.hemi.intensity);
    this.scene.add(this.hemi);
    this.updateProps = placeProps(this.scene, this.world);
  }

  updateAmbient(dt, t) {
    if (this.cycle) {
      // slow hue cycle, one lap every ~100 seconds
      const h = (t * 0.01) % 1;
      // setHSL lightness lands in linear space, so keep it very low for a dusky sky
      this.sky.material.color.setHSL(h, 0.5, 0.012);
      if (this.scene.fog) this.scene.fog.color.copy(this.sky.material.color);
      this.hemi.color.setHSL(h, 0.35, 0.8);
    }
    this.updateProps(dt, t);
  }

  update(dt, t, player) {
    this.updateFactory(dt, t);
    this.updateAmbient(dt, t);
    this.updateBursts(dt);
    return this.updateTrapdoor(dt, t, player);
  }
}

export { FACTORY_POS, TRAP_POS };
