// Themes: the museum's look and words, loaded from themes/<id>.json.
//
// Schema:
//   { id, name, blurb, default: StyleSet, wings?: { <wingId>: partial StyleSet }, props: [Prop] }
//   StyleSet = { palette, materials, typography, css, copy }
//     palette:    scene colours (floor, wall, ceiling, trim, accent, sign*, case*, light, fog, sky...)
//     materials:  shading "smooth" | "toon", toonSteps, roughness, metalness, exposure, floorPattern, displayCases
//     typography: fontFamily, fontUrl, maxWeight, letterSpacing (px), handLettered
//     css:        every CSS variable style.css reads, set on :root by applyCss()
//     copy:       every display string; "{name}" style placeholders are filled by t()
//   A wing override is deep-merged over default (objects merge, arrays and values replace),
//   so a wing only lists what differs. Props: [{ type, wing?: "lobby" | <wingId>, ...params }].
import * as THREE from 'three';

export const THEME_STORE = 'danny-museum.theme';
export const DEFAULT_THEME = 'funhouse';

let current = null;
const resolved = new Map();

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  return out;
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export const loadThemeIndex = () => getJson('themes/index.json');
export const fetchTheme = id => getJson(`themes/${encodeURIComponent(id)}.json`);

export async function loadTheme(id) {
  current = await fetchTheme(id);
  resolved.clear();
  return current;
}

export function theme() {
  if (!current) throw new Error('theme not loaded');
  return current;
}

// The resolved style set for a wing ('lobby', a wing id, 'timeline', or nothing).
export function style(wing) {
  const key = wing ?? '';
  if (!resolved.has(key)) resolved.set(key, deepMerge(theme().default, theme().wings?.[wing] ?? {}));
  return resolved.get(key);
}

export const palette = wing => style(wing).palette;

// Display copy with {placeholders}. Unknown keys show the key, so a typo is visible.
export function t(key, vars = {}, wing) {
  const s = style(wing).copy[key];
  if (s == null) { console.warn(`theme copy missing: ${key}`); return key; }
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

export function props(filter = () => true) {
  return (theme().props ?? []).filter(filter);
}

// ---------- materials ----------
let gradients = new Map();
function toonGradient(steps) {
  if (!gradients.has(steps)) {
    const data = new Uint8Array(steps * 4);
    for (let i = 0; i < steps; i++) {
      const v = Math.round(90 + (165 * i) / Math.max(1, steps - 1));
      data.set([v, v, v, 255], i * 4);
    }
    const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    gradients.set(steps, tex);
  }
  return gradients.get(steps);
}

// A lit surface in the theme's shading style. Under "smooth" this is exactly
// the MeshStandardMaterial it replaced; under "toon" roughness, metalness and
// env maps are dropped and light falls off in flat cardstock steps.
export function mat(params = {}, wing) {
  const m = style(wing).materials;
  const { roughness, metalness, envMap, envMapIntensity, ...rest } = params;
  if (m.shading !== 'toon') {
    params = { ...params };
    if (roughness != null) params.roughness = Math.min(1, roughness * (m.roughnessScale ?? 1));
    if (metalness != null) params.metalness = Math.min(1, metalness * (m.metalnessScale ?? 1));
    return new THREE.MeshStandardMaterial(params);
  }
  // MeshToonMaterial has no flatShading option, but the renderer honours the
  // flag when it is set on the instance, which gives faceted paper folds
  const { flatShading, ...toon } = rest;
  const out = new THREE.MeshToonMaterial({ ...toon, gradientMap: toonGradient(m.toonSteps ?? 3) });
  if (flatShading) out.flatShading = true;
  return out;
}

// ---------- DOM ----------
export function applyCss(set = style()) {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(set.css ?? {})) root.setProperty(`--${k}`, v);
}

let fontLinks = new Set();
export async function loadFonts(set = style()) {
  const ty = set.typography ?? {};
  if (ty.fontUrl && !fontLinks.has(ty.fontUrl)) {
    fontLinks.add(ty.fontUrl);
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: ty.fontUrl });
    document.head.append(link);
    await new Promise(r => { link.onload = link.onerror = r; setTimeout(r, 4000); });
  }
  // canvas text only uses a web font once it is loaded, so wait for it
  try {
    await Promise.race([
      Promise.all([`400 48px ${ty.fontFamily}`, `700 48px ${ty.fontFamily}`].map(f => document.fonts.load(f))),
      new Promise(r => setTimeout(r, 4000)),
    ]);
  } catch { /* fall back to whatever the stack resolves to */ }
}

// Fill every [data-copy] element (text), [data-copy-html] element (trusted
// theme markup such as <kbd>) and [data-copy-title] tooltip under root.
export function applyCopy(root = document) {
  root.querySelectorAll('[data-copy]').forEach(el => { el.textContent = t(el.dataset.copy); });
  root.querySelectorAll('[data-copy-html]').forEach(el => { el.innerHTML = t(el.dataset.copyHtml); });
  root.querySelectorAll('[data-copy-title]').forEach(el => { el.title = t(el.dataset.copyTitle); });
  const title = style().copy.pageTitle;
  if (title) document.title = title;
}
