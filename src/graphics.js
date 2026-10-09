// Graphics quality manager: Performance, Balanced, High.
// Adjusts pixelRatio, culling distance, CSS blur, and particle effects on the fly.
// Persisted in localStorage and selectable via UI or key "G".

const STORE_KEY = "danny-museum.graphics";

export const PRESETS = {
  perf: {
    id: "perf",
    label: "Performance",
    dpr: 1.0,
    visDist: 28,
    blur: false,
    effects: false,
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    dpr: 1.25,
    visDist: 38,
    blur: true,
    effects: true,
  },
  high: {
    id: "high",
    label: "High",
    dpr: 1.5,
    visDist: 52,
    blur: true,
    effects: true,
  },
};

export class GraphicsManager {
  constructor(renderer, world, acq) {
    this.renderer = renderer;
    this.world = world;
    this.acq = acq;

    const params = new URLSearchParams(location.search);
    const urlParam = params.get("graphics") || params.get("quality");
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}

    const initial = (urlParam && PRESETS[urlParam]) ? urlParam : (saved && PRESETS[saved] ? saved : "balanced");
    this.current = PRESETS[initial] || PRESETS.balanced;

    this.apply(this.current.id, false);
    this.buildUI();

    addEventListener("keydown", e => {
      if (e.code === "KeyG" && !e.target.matches("input, textarea")) {
        this.cycle();
      }
    });
  }

  cycle() {
    const order = ["perf", "balanced", "high"];
    const nextIdx = (order.indexOf(this.current.id) + 1) % order.length;
    this.apply(order[nextIdx]);
  }

  apply(presetId, save = true) {
    const p = PRESETS[presetId] || PRESETS.balanced;
    this.current = p;
    if (save) {
      try { localStorage.setItem(STORE_KEY, p.id); } catch (e) {}
    }

    document.documentElement.dataset.graphics = p.id;

    // 1. Pixel Ratio
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(p.dpr, devicePixelRatio || 1));
      this.renderer.setSize(innerWidth, innerHeight);
    }

    // 2. Visibility Distance
    if (this.world) {
      this.world.maxVisDistSq = p.visDist * p.visDist;
    }

    // 3. Effects / ribbons / halos
    if (this.acq) {
      this.acq.effectsEnabled = p.effects;
      if (this.acq.halos) {
        for (const h of this.acq.halos) h.visible = p.effects;
      }
      if (this.acq.tags) {
        for (const t of this.acq.tags) t.visible = p.effects;
      }
    }

    this.updateUI();
  }

  buildUI() {
    const overlayCard = document.querySelector("#overlay .card");
    if (overlayCard) {
      const row = document.createElement("div");
      row.id = "graphics-bar";
      row.innerHTML = `
        <div class="gfx-header">
          <span class="gfx-title">Graphics Quality</span>
          <span class="gfx-hint"><kbd>G</kbd> in-game</span>
        </div>
        <div class="gfx-buttons" role="group" aria-label="Graphics Quality">
          <button type="button" class="gfx-btn" data-gfx="perf">Performance</button>
          <button type="button" class="gfx-btn" data-gfx="balanced">Balanced</button>
          <button type="button" class="gfx-btn" data-gfx="high">High</button>
        </div>
      `;
      row.addEventListener("click", e => {
        const btn = e.target.closest("[data-gfx]");
        if (btn) this.apply(btn.dataset.gfx);
      });
      const btnRow = overlayCard.querySelector(".buttons");
      if (btnRow) overlayCard.insertBefore(row, btnRow);
      else overlayCard.appendChild(row);
    }
    this.updateUI();
  }

  updateUI() {
    const btns = document.querySelectorAll(".gfx-btn");
    btns.forEach(b => {
      b.classList.toggle("active", b.dataset.gfx === this.current.id);
    });
    const perfHud = document.getElementById("perf-hud");
    if (perfHud) {
      let gfxRow = perfHud.querySelector(".perf-gfx");
      if (!gfxRow) {
        gfxRow = document.createElement("div");
        gfxRow.className = "perf-row perf-gfx";
        perfHud.appendChild(gfxRow);
      }
      gfxRow.innerHTML = `<span class="perf-lbl">Quality [G]:</span> <span class="perf-val">${this.current.label} (${this.current.dpr}x)</span>`;
    }
  }
}
