// Tour mode: glide the camera along world.tourPath (lobby -> each hall's far
// end -> back), turning smoothly to face the direction of travel.
import { Player } from './player.js';
import { EYE } from './world.js';

const SPEED = 5.5;

export class Tour {
  constructor(player, path, onEnd) {
    this.player = player; this.path = path; this.onEnd = onEnd;
    this.active = false;
  }

  start() {
    this.active = true;
    this.seg = 0;
    const p0 = this.path[0], p1 = this.path[1];
    this.player.teleport(p0, p1);
    this.yaw = this.player.yaw;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.onEnd?.();
  }

  update(dt) {
    if (!this.active) return;
    const pos = this.player.position;
    let remaining = SPEED * dt;
    // walk as many waypoints as this frame's distance budget allows
    while (remaining > 0) {
      const target = this.path[this.seg + 1];
      if (!target) { this.stop(); return; }
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= remaining) { pos.x = target.x; pos.z = target.z; remaining -= dist; this.seg++; continue; }
      pos.x += (dx / dist) * remaining; pos.z += (dz / dist) * remaining;
      remaining = 0;
      // turn toward the heading along the shortest arc
      const want = Player.yawToward(dx, dz);
      let diff = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += diff * Math.min(1, dt * 2.6);
    }
    pos.y = EYE;
    this.player.setLook(this.yaw, -0.06);
  }
}
