// Plain-HTML overlays: exhibit panel, Surprise Factory card, passport counter,
// location chip, prompts, toasts, the start/pause card and the fall flash.
import { dateLine, sourcesOf } from './fresh.js';
import { t } from './theme.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Hud {
  constructor() {
    this.el = {
      overlay: $('overlay'), exhibit: $('exhibit'), surprise: $('surprise'), prompt: $('prompt'),
      toast: $('toast'), flash: $('flash'), passport: $('passport'), bar: $('passport-bar'),
      location: $('location'), tour: $('tour-banner'), startBtn: $('btn-start'), tourBtn: $('btn-tour'),
      overlayTitle: $('overlay-title'), since: $('since'),
    };
    this.current = null;
    this.toastTimer = 0;
  }

  showOverlay(on, resumed = false) {
    this.el.overlay.classList.toggle('hidden', !on);
    if (resumed) this.el.startBtn.textContent = t('resume');
  }

  setTour(on) { this.el.tour.classList.toggle('hidden', !on); }

  setPassport(n, total) {
    this.el.passport.textContent = n >= total && total > 0 ? t('passportDone', { total }) : t('passport', { n, total });
    this.el.bar.style.width = `${total ? (100 * n) / total : 0}%`;
  }

  // "N new since your last visit"; hidden on a first visit or when nothing is new
  setSince(n) {
    const on = n > 0;
    this.el.since.classList.toggle('hidden', !on);
    if (on) this.el.since.innerHTML = `<span class="spark"></span>${esc(t('sinceVisit', { n }))} <span class="go">${esc(t('sinceGo'))}</span>`;
  }

  setLocation(region) {
    const key = region?.id ?? 'lobby';
    if (key === this.locKey) return;
    this.locKey = key;
    this.el.location.textContent = region?.label ?? t('betweenRooms');
    this.el.location.style.setProperty('--accent', region?.color ?? 'var(--region-default)');
  }

  showExhibit(ex, visited) {
    if (!ex) {
      if (this.current) { this.el.exhibit.classList.add('hidden'); this.current = null; }
      return;
    }
    if (this.current === ex && this.currentVisited === visited && this.currentFresh === ex.fresh) return;
    this.current = ex;
    this.currentVisited = visited;
    this.currentFresh = ex.fresh;
    const p = ex.project, w = ex.wing;
    const link = p.link
      ? (/^https?:\/\//.test(p.link)
        ? `<a class="link" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.link.replace(/^https?:\/\//, ''))} &rarr;</a>`
        : `<code class="link">${esc(p.link)}</code>`)
      : '';
    const stack = Array.isArray(p.stack) && p.stack.length ? `<div class="chips">${p.stack.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : '';
    const dated = dateLine(p);
    const fresh = ex.fresh ? `<span class="fresh-pill">${esc(t('freshPill'))}</span>` : '';
    const when = dated || fresh ? `<div class="dated">${fresh}${esc(dated)}</div>` : '';
    const src = sourcesOf(p);
    const sources = src.length ? `<div class="chips sources">${src.map(s => `<span class="chip source">${esc(s)}</span>`).join('')}</div>` : '';
    const where = ex.inTimeline ? ` · ${t('onTimeline')}` : ex.inAcquisitions ? ` · ${t('inAcquisitions')}` : '';
    const facts = Array.isArray(p.facts) && p.facts.length ? `<ul class="facts">${p.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
    this.el.exhibit.style.setProperty('--accent', w?.color ?? 'var(--region-default)');
    this.el.exhibit.innerHTML = `
      <div class="wing-tag">${esc(w?.name ?? p.wing)}${esc(where)}</div>
      <h2>${esc(p.name)}</h2>
      <div class="meta">${p.years ? `<span>${esc(p.years)}</span>` : ''}${p.status ? `<span class="status status-${esc(p.status)}">${esc(p.status)}</span>` : ''}</div>
      ${when}
      ${p.role ? `<div class="role">${esc(p.role)}</div>` : ''}
      ${p.summary ? `<p class="summary">${esc(p.summary)}</p>` : ''}
      ${stack}${facts}${link}
      <div class="stamp ${visited ? 'stamped' : ''}">${esc(t(visited ? 'stamped' : 'stampHint'))}</div>
      ${sources}`;
    this.el.exhibit.classList.remove('hidden');
  }

  celebrate() {
    this.el.exhibit.classList.remove('pop');
    void this.el.exhibit.offsetWidth; // restart the CSS animation
    this.el.exhibit.classList.add('pop');
  }

  prompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    this.el.prompt.textContent = text ?? '';
    this.el.prompt.classList.toggle('hidden', !text);
  }

  showSurprise(p, wing, fresh = false) {
    const line = p.surprise || (Array.isArray(p.facts) && p.facts[0]) || p.summary || t('surpriseFallback');
    const s = this.el.surprise;
    s.style.setProperty('--accent', wing?.color ?? 'var(--ticket-accent)');
    s.innerHTML = `
      <button class="close" data-act="close" aria-label="Close">&times;</button>
      <div class="ticket-head">${esc(t('factoryPresents'))}${fresh ? ` <span class="fresh">· ${esc(t('factoryFresh'))}</span>` : ''}</div>
      <blockquote>${esc(line)}</blockquote>
      <div class="from">${esc(t('surpriseFrom'))} <strong>${esc(p.name)}</strong>${wing ? ` ${esc(t('surpriseIn'))} ${esc(wing.name)}` : ''}</div>
      <div class="actions">
        <button data-act="teleport">${esc(t('surpriseTeleport'))} <kbd>T</kbd></button>
        <button class="ghost" data-act="again">${esc(t('surpriseAgain'))} <kbd>E</kbd></button>
      </div>`;
    s.dataset.project = p.id;
    s.classList.remove('hidden', 'pop');
    void s.offsetWidth;
    s.classList.add('pop');
  }

  hideSurprise() { this.el.surprise.classList.add('hidden'); delete this.el.surprise.dataset.project; }
  get surpriseId() { return this.el.surprise.classList.contains('hidden') ? null : this.el.surprise.dataset.project; }

  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2800);
  }

  flash(a) { this.el.flash.style.opacity = String(Math.max(0, Math.min(1, a))); }
}
