// Freshness: which projects were added to (or rediscovered by) the museum
// recently. Pure date logic, no three.js. Every field is optional: a project
// with no `added` and no `rediscovered` is simply never fresh.

export const FRESH_DAYS = 30;
export const LAST_VISIT = 'danny-museum.lastVisit';
const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2026-10-01" is read as local midnight (new Date() would say UTC and can
// slip a day); anything with a time part goes through Date.parse.
export function parseDate(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function fmtDate(t) {
  const d = new Date(t);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// The project's most recent museum date and which kind it was, or null.
export function latestDate(p) {
  const added = parseDate(p?.added), red = parseDate(p?.rediscovered);
  if (red != null && (added == null || red >= added)) return { kind: 'rediscovered', t: red };
  // The founding collection (everything in the museum on opening day) is never
  // "new": only a later rediscovery can make one of those fresh.
  if (p?.founding) return null;
  if (added != null) return { kind: 'added', t: added };
  return null;
}

// "Added Oct 1, 2026" or "Rediscovered Sep 28, 2026", or '' when undated.
export function dateLine(p) {
  const d = latestDate(p);
  if (!d) return '';
  return `${d.kind === 'rediscovered' ? 'Rediscovered' : 'Added'} ${fmtDate(d.t)}`;
}

export function sourcesOf(p) {
  return Array.isArray(p?.sources) ? p.sources.filter(s => typeof s === 'string' && s.trim()) : [];
}

/**
 * Map of id -> { kind, t } for every fresh project, freshest first.
 * Fresh: dated within the last FRESH_DAYS, or newer than the previous visit.
 */
export function computeFresh(projects, { now = Date.now(), since = null } = {}) {
  const cutoff = now - FRESH_DAYS * DAY;
  const hits = [];
  for (const p of projects) {
    const d = latestDate(p);
    if (d && (d.t >= cutoff || (since != null && d.t > since))) hits.push([p.id, d]);
  }
  hits.sort((a, b) => b[1].t - a[1].t);
  return new Map(hits);
}

// How many projects arrived (or came back) after the previous visit.
export function countSince(projects, since) {
  if (since == null) return 0;
  return projects.filter(p => {
    const d = latestDate(p);
    return d && d.t > since;
  }).length;
}
