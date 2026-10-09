// Performance monitor: tracks FPS, frame time, draw calls, and active updates.
// Toggled by key 'P' or URL parameter ?perf=1 / ?debug=1.
export class PerfMonitor {
  constructor(renderer) {
    this.renderer = renderer;
    const params = new URLSearchParams(location.search);
    this.enabled = params.has('perf') || params.has('debug');

    this.el = document.createElement('div');
    this.el.id = 'perf-hud';
    this.el.className = this.enabled ? '' : 'hidden';
    document.body.appendChild(this.el);

    this.frames = 0;
    this.prevTime = performance.now();
    this.fps = 60;
    this.frameTime = 16.6;
    this.activeExhibits = 0;
    this.totalExhibits = 0;

    addEventListener('keydown', e => {
      // Toggle on 'P' when not typing in an input
      if (e.code === 'KeyP' && !e.target.matches('input, textarea')) {
        this.toggle();
      }
    });
  }

  toggle() {
    this.enabled = !this.enabled;
    this.el.classList.toggle('hidden', !this.enabled);
  }

  begin() {
    this.startFrameTime = performance.now();
  }

  end(activeExhibits = 0, totalExhibits = 0) {
    this.activeExhibits = activeExhibits;
    this.totalExhibits = totalExhibits;
    const now = performance.now();
    this.frameTime = now - this.startFrameTime;
    this.frames++;

    if (now - this.prevTime >= 250) {
      this.fps = Math.round((this.frames * 1000) / (now - this.prevTime));
      this.frames = 0;
      this.prevTime = now;
      if (this.enabled) this.render();
    }
  }

  render() {
    const info = this.renderer?.info;
    const calls = info?.render?.calls ?? 0;
    const tris = (info?.render?.triangles ?? 0).toLocaleString();
    const textures = info?.memory?.textures ?? 0;
    const geometries = info?.memory?.geometries ?? 0;

    this.el.innerHTML = [
      '<div class="perf-title">PERF MONITOR <span class="perf-key">[P]</span></div>',
      '<div class="perf-row"><span class="perf-lbl">FPS:</span> <span class="perf-val">' + this.fps + '</span> (' + this.frameTime.toFixed(1) + ' ms)</div>',
      '<div class="perf-row"><span class="perf-lbl">Draw Calls:</span> <span class="perf-val">' + calls + '</span></div>',
      '<div class="perf-row"><span class="perf-lbl">Triangles:</span> <span class="perf-val">' + tris + '</span></div>',
      '<div class="perf-row"><span class="perf-lbl">Exhibits Active:</span> <span class="perf-val">' + this.activeExhibits + ' / ' + this.totalExhibits + '</span></div>',
      '<div class="perf-row"><span class="perf-lbl">Textures / Geos:</span> <span class="perf-val">' + textures + ' / ' + geometries + '</span></div>',
    ].join('');
  }
}
