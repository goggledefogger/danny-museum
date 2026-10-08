// Canvas text helpers: every sign, plaque and label in the museum is a
// CanvasTexture drawn here, so long names wrap and shrink instead of overflowing.
import * as THREE from 'three';
import { style, palette } from './theme.js';

// Sign typography comes from the active theme (typography block).
const typo = () => style().typography;
const fontOf = weight => `${Math.min(weight ?? 700, typo().maxWeight ?? 900)}`;
const setFont = (ctx, weight, size) => {
  ctx.font = `${fontOf(weight)} ${size}px ${typo().fontFamily}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(typo().letterSpacing ?? 0) * size / 100}px`;
};

// "#rrggbb" plus alpha as an rgba() string, for sign backgrounds.
export function rgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Greedy word wrap. Words wider than the line get broken by character.
export function wrapLines(ctx, text, maxWidth) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    while (ctx.measureText(word).width > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut--;
      if (line) { lines.push(line); line = ''; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw a card of text blocks onto a canvas and return a texture.
 * blocks: [{ text, size, weight, color, maxLines, gap }]
 * Each block shrinks until it fits maxLines; then the whole stack shrinks
 * uniformly until it fits the card height.
 */
export function textTexture({
  width = 1024, height = 512, bg = rgba(palette().signBg, 0.9), border = null,
  borderWidth = 10, radius = 44, padding = 56, blocks = [], align = 'center',
  stripes = null,
}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const bw = border ? borderWidth : 0;
  if (bg) {
    roundRect(ctx, bw / 2, bw / 2, width - bw, height - bw, radius);
    ctx.fillStyle = bg; ctx.fill();
    if (stripes) {
      // diagonal hazard stripes, clipped to the card
      ctx.save(); ctx.clip();
      ctx.fillStyle = stripes;
      for (let x = -height; x < width + height; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x + 45, 0); ctx.lineTo(x + 45 - height, height); ctx.lineTo(x - height, height);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    if (border) { ctx.lineWidth = bw; ctx.strokeStyle = border; ctx.stroke(); }
  }
  const maxW = width - padding * 2;
  let scale = 1;
  let laid;
  for (let attempt = 0; attempt < 12; attempt++) {
    laid = blocks.filter(b => b.text).map(b => {
      let size = b.size * scale;
      let lines;
      const maxLines = b.maxLines ?? 3;
      for (;;) {
        setFont(ctx, b.weight, size);
        lines = wrapLines(ctx, b.text, maxW);
        if (lines.length <= maxLines || size < 14) break;
        size *= 0.9;
      }
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '...');
      }
      return { ...b, size, lines, lh: size * 1.14 };
    });
    const total = laid.reduce((acc, b, i) => acc + b.lines.length * b.lh + (i ? (b.gap ?? 16) * scale : 0), 0);
    if (total <= height - padding * 1.4) break;
    scale *= 0.9;
  }
  const total = laid.reduce((acc, b, i) => acc + b.lines.length * b.lh + (i ? (b.gap ?? 16) * scale : 0), 0);
  let y = (height - total) / 2;
  ctx.textBaseline = 'top';
  ctx.textAlign = align;
  const x = align === 'center' ? width / 2 : padding;
  // hand-lettered themes tilt and nudge each line a little, like a pen label
  const hand = typo().handLettered;
  let n = 0;
  laid.forEach((b, i) => {
    if (i) y += (b.gap ?? 16) * scale;
    setFont(ctx, b.weight, b.size);
    ctx.fillStyle = b.color ?? palette().signInk;
    if (b.shadow) { ctx.shadowColor = b.shadow; ctx.shadowBlur = 24; } else { ctx.shadowBlur = 0; }
    for (const line of b.lines) {
      if (hand) {
        const k = n++;
        ctx.save();
        ctx.translate(x, y + b.lh / 2);
        ctx.rotate(Math.sin(k * 2.3 + line.length) * 0.018);
        ctx.fillText(line, Math.sin(k * 1.7) * 4, -b.lh / 2 + Math.cos(k * 3.1) * 2);
        ctx.restore();
      } else ctx.fillText(line, x, y);
      y += b.lh;
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A flat, unlit sign mesh (readable regardless of the lighting around it).
export function signMesh(w, h, opts) {
  const mat = new THREE.MeshBasicMaterial({ map: textTexture(opts), transparent: true, side: THREE.DoubleSide, toneMapped: false });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// Swallowtail ribbon (NEW, REDISCOVERED or the theme's words), cached per label.
// Returns the texture and its width/height so callers can size the plane.
const ribbons = new Map();
export function ribbonTexture(label) {
  if (ribbons.has(label)) return ribbons.get(label);
  const h = 160, notch = 46, pad = 96;
  const probe = document.createElement('canvas').getContext('2d');
  setFont(probe, 900, 92);
  const w = Math.ceil(probe.measureText(label).width + pad * 2);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(4, 4); ctx.lineTo(w - 4, 4); ctx.lineTo(w - notch, h / 2); ctx.lineTo(w - 4, h - 4);
  ctx.lineTo(4, h - 4); ctx.lineTo(notch, h / 2); ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  const rb = palette().ribbon;
  grad.addColorStop(0, rb.top); grad.addColorStop(0.45, rb.mid); grad.addColorStop(1, rb.bottom);
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = rb.edge; ctx.stroke();
  setFont(ctx, 900, 92);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = rb.ink;
  ctx.fillText(label, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const out = { tex, aspect: w / h };
  ribbons.set(label, out);
  return out;
}
