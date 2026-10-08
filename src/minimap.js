// Top-down 2D map: rooms as coloured blobs, exhibits as dots, you as an arrow.
// North (-z) is up. The map scrolls so you are always in the middle.
import { palette } from './theme.js';

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.ctx = canvas.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const css = canvas.clientWidth || 210;
    canvas.width = canvas.height = css * dpr;
    this.size = css * dpr;
    // fixed scale, centred on the player, so huge wings never shrink the map
    this.scale = 2.3 * dpr;
    this.dpr = dpr;
  }

  outline(r) {
    if (r.type === 'circle') {
      const pts = [];
      for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; pts.push([r.x + Math.cos(a) * r.r, r.z + Math.sin(a) * r.r]); }
      return pts;
    }
    // the four corners of an oriented box: centre +/- right*halfW +/- d*halfL
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
      r.c.x + r.right.x * r.halfW * a + r.d.x * r.halfL * b,
      r.c.z + r.right.z * r.halfW * a + r.d.z * r.halfL * b,
    ]);
  }

  map(x, z) { return [this.size / 2 + (x - this.cx) * this.scale, this.size / 2 + (z - this.cz) * this.scale]; }

  draw(pos, yaw, visited, nearest) {
    const { ctx, size } = this;
    const P = palette();
    this.cx = pos.x; this.cz = pos.z;
    ctx.clearRect(0, 0, size, size);
    for (const r of this.world.regions) {
      const pts = this.outline(r).map(([x, z]) => this.map(x, z));
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.globalAlpha = r.connector ? 0.35 : 0.5;
      ctx.fillStyle = r.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    for (const e of this.world.exhibits) {
      const [x, y] = this.map(e.pos.x, e.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, (e === nearest ? 3.2 : 2) * this.dpr, 0, Math.PI * 2);
      ctx.fillStyle = visited.has(e.project.id) ? P.mapVisited : e.wing.color;
      ctx.fill();
      if (!visited.has(e.project.id)) { ctx.strokeStyle = P.mapDotEdge; ctx.lineWidth = this.dpr; ctx.stroke(); }
    }
    // player arrow; camera forward on the floor is (-sin yaw, -cos yaw)
    const [px, py] = this.map(pos.x, pos.z);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const s = 7 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(px + fx * s, py + fz * s);
    ctx.lineTo(px - fx * s * 0.6 + fz * s * 0.55, py - fz * s * 0.6 - fx * s * 0.55);
    ctx.lineTo(px - fx * s * 0.6 - fz * s * 0.55, py - fz * s * 0.6 + fx * s * 0.55);
    ctx.closePath();
    ctx.fillStyle = P.mapArrow;
    ctx.strokeStyle = P.mapArrowEdge;
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.fill(); ctx.stroke();
  }
}
