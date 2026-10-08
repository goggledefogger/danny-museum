// First-person controls: PointerLockControls for looking, our own WASD
// movement with slide-along-walls collision against world.isWalkable.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EYE } from './world.js';

const WALK = 5.2, RUN = 9.5, RADIUS = 0.4;
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class Player {
  constructor(camera, dom, world) {
    this.camera = camera;
    this.world = world;
    this.controls = new PointerLockControls(camera, dom);
    this.keys = new Set();
    this.vel = new THREE.Vector2();
    this.frozen = false;   // true during the trapdoor fall
    this.bob = 0;
    camera.rotation.order = 'YXZ';
    addEventListener('keydown', e => this.keys.add(e.code));
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  get position() { return this.camera.position; }

  get yaw() { return _euler.setFromQuaternion(this.camera.quaternion, 'YXZ').y; }

  setLook(yaw, pitch = 0) {
    this.camera.quaternion.setFromEuler(_euler.set(pitch, yaw, 0, 'YXZ'));
  }

  // Yaw that makes the camera (which looks down its local -z) face (dx, dz).
  static yawToward(dx, dz) { return Math.atan2(-dx, -dz); }

  teleport(pos, lookAt, pitch) {
    this.camera.position.set(pos.x, EYE, pos.z);
    if (lookAt) {
      const dx = lookAt.x - pos.x, dz = lookAt.z - pos.z;
      this.setLook(Player.yawToward(dx, dz), pitch ?? -0.08);
    }
    this.vel.set(0, 0);
  }

  // Mouse-drag look for when pointer lock is unavailable (debug/free mode).
  dragLook(dx, dy) {
    _euler.setFromQuaternion(this.camera.quaternion, 'YXZ');
    _euler.y -= dx * 0.004;
    _euler.x = Math.max(-1.3, Math.min(1.3, _euler.x - dy * 0.004));
    this.camera.quaternion.setFromEuler(_euler);
  }

  update(dt) {
    if (this.frozen) return;
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const str = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const yaw = this.yaw;
    // forward on the floor plane is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw)
    const wx = -Math.sin(yaw) * fwd + Math.cos(yaw) * str;
    const wz = -Math.cos(yaw) * fwd - Math.sin(yaw) * str;
    const len = Math.hypot(wx, wz) || 1;
    const speed = k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK;
    const tx = (wx / len) * speed * (fwd || str ? 1 : 0);
    const tz = (wz / len) * speed * (fwd || str ? 1 : 0);
    // ease toward the target velocity so starts and stops feel soft
    const a = Math.min(1, dt * 10);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;

    const p = this.camera.position;
    const nx = p.x + this.vel.x * dt, nz = p.z + this.vel.y * dt;
    const w = this.world;
    // try the full move, then each axis alone, so you slide along walls
    if (w.isWalkable(nx, nz, RADIUS)) { p.x = nx; p.z = nz; }
    else if (w.isWalkable(nx, p.z, RADIUS)) { p.x = nx; this.vel.y = 0; }
    else if (w.isWalkable(p.x, nz, RADIUS)) { p.z = nz; this.vel.x = 0; }
    else this.vel.set(0, 0);

    const moving = this.vel.length();
    this.bob += dt * moving * 1.6;
    p.y = EYE + Math.sin(this.bob) * 0.045 * Math.min(1, moving / WALK);
  }
}
