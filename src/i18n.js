// Traductions du site : français (texte de la page), anglais, italien, espagnol, allemand, néerlandais.
// - Les textes marqués data-k viennent du dictionnaire « k » de chaque langue (même clé que l'éditeur des gérants).
// - Les autres textes (libellés de formulaire, menus, espace client) sont traduits phrase par phrase
//   grâce au dictionnaire « p », dont la clé est la phrase française.
// - Un texte modifié par un gérant (table site_content) l'emporte : clé « hero-02 » en français,
//   « en:hero-02 » en anglais, etc.
import en from './locales/en.json';
import it from './locales/it.json';
import es from './locales/es.json';
import de from './locales/de.json';
import nl from './locales/nl.json';

export const LANGS = [
  ['fr', 'Français', 'fr-FR'], ['en', 'English', 'en-GB'], ['it', 'Italiano', 'it-IT'],
  ['es', 'Español', 'es-ES'], ['de', 'Deutsch', 'de-DE'], ['nl', 'Nederlands', 'nl-NL'],
];
const DICT = { en, it, es, de, nl };
const CODES = LANGS.map((l) => l[0]);
const STORE = 'altiora-lang';

// Texte français d'origine de chaque élément data-k, relevé avant toute traduction.
export const FR = {};
document.querySelectorAll('[data-k]').forEach((el) => (FR[el.dataset.k] = el.innerHTML.trim()));

function pick() {
  const q = new URLSearchParams(location.search).get('lang');
  if (CODES.includes(q)) return q;
  try { const s = localStorage.getItem(STORE); if (CODES.includes(s)) return s; } catch (_) {}
  for (const l of navigator.languages || [navigator.language || 'fr']) { const c = String(l).slice(0, 2).toLowerCase(); if (CODES.includes(c)) return c; }
  return 'fr';
}
let lang = pick();
export const getLang = () => lang;
export const locale = () => LANGS.find((l) => l[0] === lang)[2];

// Traduit une phrase française ; {nom} est remplacé par vars.nom.
export function t(s, vars) {
  let out = lang === 'fr' ? s : (DICT[lang].p[s] ?? s);
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return out;
}
// Texte par défaut (avant modification par un gérant) d'une clé data-k dans une langue.
// Une clé sans traduction (numéro, adresse, nom de lieu) reprend le texte français, y compris s'il a été modifié.
export const defaultText = (k, l = lang) => (l === 'fr' ? FR[k] : DICT[l]?.k[k] ?? (saved[k] != null ? clean(saved[k]) : FR[k]));

// Mise en forme autorisée dans les textes modifiés par les gérants : aucun lien, script ni attribut
// (sauf la classe d'un <span>).
const ALLOWED = new Set(['EM', 'STRONG', 'B', 'I', 'BR', 'SPAN', 'SMALL']);
export function clean(html) {
  const tp = document.createElement('template');
  tp.innerHTML = String(html ?? '');
  const walk = (node) => {
    [...node.childNodes].forEach((c) => {
      if (c.nodeType === 3) return;
      if (c.nodeType !== 1 || !ALLOWED.has(c.tagName)) {
        if (c.nodeType === 1 && !['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT'].includes(c.tagName)) { walk(c); c.replaceWith(...c.childNodes); } else c.remove();
        return;
      }
      [...c.attributes].forEach((a) => { if (!(c.tagName === 'SPAN' && a.name === 'class' && /^[\w -]{0,40}$/.test(a.value))) c.removeAttribute(a.name); });
      walk(c);
    });
  };
  walk(tp.content);
  return tp.innerHTML.trim();
}

// Textes modifiés par les gérants : { 'hero-02': '…', 'en:hero-02': '…' }
export const saved = {};
export const savedKey = (k, l = lang) => (l === 'fr' ? k : `${l}:${k}`);
export const textFor = (k, l = lang) => { const s = saved[savedKey(k, l)]; return s != null ? clean(s) : defaultText(k, l); };

// Textes hors data-k de la partie publique : nœuds de texte et attributs, avec leur version française.
const nodes = [], attrs = [];
const scope = [document.querySelector('header'), document.getElementById('top'), document.querySelector('footer')].filter(Boolean);
scope.forEach((root) => {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (!n.nodeValue.trim() || n.parentElement.closest('[data-k], script, style, .lang') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  let n; while ((n = w.nextNode())) { const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(n.nodeValue); nodes.push([n, m[2], m[1], m[3]]); }
  root.querySelectorAll('[placeholder], [aria-label], [alt], [title]').forEach((el) => ['placeholder', 'aria-label', 'alt', 'title'].forEach((a) => { if (el.hasAttribute(a) && !el.closest('.lang')) attrs.push([el, a, el.getAttribute(a)]); }));
});
const meta = document.querySelector('meta[name="description"]');
if (meta) attrs.push([meta, 'content', meta.getAttribute('content')]);

export function applyAll() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-k]').forEach((el) => { const h = textFor(el.dataset.k); if (h != null && el.innerHTML !== h) el.innerHTML = h; });
  nodes.forEach(([n, fr, a, b]) => (n.nodeValue = a + t(fr) + b));
  attrs.forEach(([el, a, fr]) => el.setAttribute(a, t(fr)));
  document.querySelectorAll('select.lang-sel').forEach((s) => (s.value = lang));
  document.documentElement.classList.remove('i18n-wait');
}

export function setLang(l) {
  if (!CODES.includes(l) || l === lang) return;
  lang = l;
  try { localStorage.setItem(STORE, l); } catch (_) {}
  applyAll();
  window.dispatchEvent(new CustomEvent('altiora-lang', { detail: l }));
}

// Pour les scripts classiques de la page et le calendrier.
window.altioraT = t;
window.altioraLang = () => lang;
window.altioraLocale = locale;

document.querySelectorAll('select.lang-sel').forEach((s) => (s.onchange = () => setLang(s.value)));
applyAll();
window.dispatchEvent(new CustomEvent('altiora-lang', { detail: lang }));
