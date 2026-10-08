// The first screen: pick a theme, then the usual start card appears.
// Order of precedence: ?theme=<id> in the URL (skips the picker), else the
// picker, preselecting the last choice kept in localStorage.
import { loadThemeIndex, fetchTheme, loadTheme, applyCss, applyCopy, loadFonts, THEME_STORE, DEFAULT_THEME } from './theme.js';

const remember = id => { try { localStorage.setItem(THEME_STORE, id); } catch { /* private mode */ } };

export async function chooseTheme() {
  const index = await loadThemeIndex();
  const list = index.themes ?? [];
  const ids = list.map(x => x.id);
  const param = new URLSearchParams(location.search).get('theme');
  if (param && ids.includes(param)) { remember(param); return param; }

  let last = null;
  try { last = localStorage.getItem(THEME_STORE); } catch { /* private mode */ }
  const pre = ids.includes(last) ? last : (ids.includes(index.default) ? index.default : ids[0] ?? DEFAULT_THEME);
  if (list.length < 2) return pre;

  // the picker wears the preselected theme; focusing a card previews another
  await loadTheme(pre);
  applyCss(); applyCopy();
  const full = Object.fromEntries(await Promise.all(ids.map(async id => [id, await fetchTheme(id)])));
  ids.forEach(id => loadFonts(full[id].default));

  const picker = document.getElementById('picker');
  const ul = picker.querySelector('.themes');
  ul.replaceChildren();
  const cards = list.map((th, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.className = 'theme-card';
    b.type = 'button';
    b.dataset.theme = th.id;
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(th.id === pre));
    const name = Object.assign(document.createElement('span'), { className: 'name', textContent: th.name });
    const css = full[th.id].default.css ?? {};
    const tf = css['title-font'] ?? '';
    name.style.fontFamily = tf.startsWith('var(') ? (css.font ?? '') : tf;
    const blurb = Object.assign(document.createElement('span'), { className: 'blurb', textContent: th.blurb });
    b.append(name, blurb);
    if (th.id === last) b.append(Object.assign(document.createElement('span'), { className: 'last', textContent: full[pre].default.copy.pickerLast }));
    b.addEventListener('focus', () => applyCss(full[th.id].default));
    b.addEventListener('mouseenter', () => applyCss(full[th.id].default));
    li.append(b);
    ul.append(li);
    return b;
  });
  picker.classList.remove('hidden');
  cards[Math.max(0, ids.indexOf(pre))].focus();

  return new Promise(resolve => {
    const choose = id => {
      remember(id);
      picker.classList.add('hidden');
      picker.removeEventListener('keydown', onKey);
      resolve(id);
    };
    cards.forEach(b => b.addEventListener('click', () => choose(b.dataset.theme)));
    const onKey = e => {
      const i = cards.indexOf(document.activeElement);
      let j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % cards.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + cards.length) % cards.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = cards.length - 1;
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= cards.length) { choose(cards[Number(e.key) - 1].dataset.theme); return; }
      if (j != null) { e.preventDefault(); cards[j].focus(); }
    };
    picker.addEventListener('keydown', onKey);
  });
}
