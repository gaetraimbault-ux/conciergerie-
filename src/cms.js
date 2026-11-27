// Textes du site modifiables par les gérants (prix, coordonnées, titres…).
// Chaque élément modifiable porte un attribut data-k dans index.html ; la table site_content
// garde uniquement les textes changés. Le texte d'origine reste dans la page comme valeur par défaut.

import { FR, LANGS, saved, savedKey, defaultText, applyAll, clean, getLang } from './i18n.js';
export { clean };
const DEFAULTS = FR;
const KEYS = new Set(Object.keys(FR));

export async function loadSiteContent(supabase) {
  if (!supabase) return;
  const { data, error } = await supabase.from('site_content').select('key, html');
  if (error || !data) return;
  Object.keys(saved).forEach((k) => delete saved[k]);
  data.forEach((r) => { if (KEYS.has(r.key.replace(/^[a-z]{2}:/, ''))) saved[r.key] = r.html; });
  applyAll();
}

const KIND = { H1: 'Grand titre', H2: 'Titre', H3: 'Sous-titre', A: 'Lien ou bouton', LI: 'Ligne de liste', TD: 'Case du tableau', TH: 'En-tête du tableau', B: 'Information', STRONG: 'Montant', SPAN: 'Texte court', P: 'Texte', DT: 'Terme', DD: 'Définition' };
const GROUP = { header: 'Menu du haut', hero: 'Accueil', seasons: 'Deux saisons', voyageurs: 'Voyageurs', proprietaires: 'Propriétaires (offres et tarifs)', territoire: 'Territoire', promise: 'Engagements', contact: 'Contact et coordonnées', footer: 'Pied de page', home: 'Accueil · portes d’entrée' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Affiche le texte sans balises quand il n'en a pas besoin, pour une saisie simple.
const toField = (html) => (/<[a-z]/i.test(html) ? html : new DOMParser().parseFromString(`<p>${html}</p>`, 'text/html').body.textContent);
const fromField = (v) => (/<[a-z]/i.test(v) ? clean(v) : esc(v.trim()));
const norm = (h) => clean(h).replace(/\s+/g, ' ').trim();

export function renderSiteEditor(box, { supabase, toast, me, rerender }) {
  const L = box.dataset.lang || 'fr';
  const SK = (k) => savedKey(k, L), DEF = (k) => defaultText(k, L);
  const groups = {};
  Object.keys(DEFAULTS).forEach((k) => (groups[k.replace(/-\d+$/, '')] ||= []).push(k));
  const q = (box.dataset.q || '').toLowerCase();
  const field = (k) => {
    const el = document.querySelector(`[data-k="${CSS.escape(k)}"]`);
    const cur = SK(k) in saved ? saved[SK(k)] : DEF(k);
    const changed = SK(k) in saved && norm(saved[SK(k)]) !== norm(DEF(k));
    const v = toField(cur);
    const prev = el?.previousElementSibling, ctx = prev && ['SPAN', 'TD', 'TH', 'H3', 'DT'].includes(prev.tagName) ? prev.textContent.trim().slice(0, 50) : '';
    const label = (/€/.test(DEFAULTS[k]) ? 'Prix' : KIND[el?.tagName] || 'Texte') + (ctx ? ' · ' + ctx : '') + (changed ? ' · modifié' : '');
    return `<div class="field cms-f" data-cms="${esc(k)}" ${q && !(v.toLowerCase().includes(q) || label.toLowerCase().includes(q)) ? 'hidden' : ''}><label for="cms-${esc(k)}">${esc(label)}</label>
      <textarea id="cms-${esc(k)}" rows="${Math.min(6, Math.max(1, Math.ceil(v.length / 70)))}">${esc(v)}</textarea>
      ${changed ? `<button class="linkbtn" type="button" data-reset="${esc(k)}">Revenir au texte d’origine</button>` : ''}</div>`;
  };
  box.innerHTML = `<p class="who-is" style="margin-bottom:12px">Modifiez ici les textes du site : prix, coordonnées, titres, descriptions. Les changements sont visibles par tous les visiteurs dès l’enregistrement. Pour mettre un mot en italique, entourez-le de &lt;em&gt; et &lt;/em&gt;.</p>
    <div class="cms-top"><div class="field"><label for="cms-l">Langue des textes</label><select id="cms-l">${LANGS.map(([c, n]) => `<option value="${c}" ${c === L ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="field"><label for="cms-q">Rechercher un texte</label><input id="cms-q" value="${esc(box.dataset.q || '')}" placeholder="ex. €, courriel, ménage…"></div></div>
    <p class="hint cms-note">Chaque langue a ses propres textes : un prix ou une coordonnée changé ici est à reporter aussi dans les autres langues.</p>
    ${Object.entries(groups).map(([g, keys]) => `<details class="cms-g" ${q ? 'open' : ''}><summary>${esc(GROUP[g] || g)} <span class="m">(${keys.length})</span></summary>
      <form class="newreq cms-form" data-g="${esc(g)}" novalidate>${keys.map(field).join('')}<button class="btn solid" type="submit">Enregistrer cette partie</button></form></details>`).join('')}`;

  box.querySelector('#cms-l').onchange = (e) => { box.dataset.lang = e.target.value; rerender(); };
  const qi = box.querySelector('#cms-q');
  qi.oninput = () => {
    box.dataset.q = qi.value; const s = qi.value.toLowerCase();
    box.querySelectorAll('.cms-f').forEach((f) => (f.hidden = !!s && !(f.querySelector('textarea').value.toLowerCase().includes(s) || f.querySelector('label').textContent.toLowerCase().includes(s))));
    box.querySelectorAll('.cms-g').forEach((d) => (d.open = !!s && !!d.querySelector('.cms-f:not([hidden])')));
  };
  box.querySelectorAll('.cms-form').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = [];
    form.querySelectorAll('[data-cms]').forEach((f) => {
      const k = f.dataset.cms, html = fromField(f.querySelector('textarea').value);
      const before = SK(k) in saved ? saved[SK(k)] : DEF(k);
      if (norm(html) !== norm(before)) rows.push({ key: SK(k), html, updated_by: me.id, updated_at: new Date().toISOString() });
    });
    if (!rows.length) return toast('Aucun changement dans cette partie');
    const { error } = await supabase.from('site_content').upsert(rows);
    if (error) return toast('Enregistrement impossible : ' + error.message);
    rows.forEach((r) => { saved[r.key] = r.html; });
    applyAll();
    toast(rows.length === 1 ? '1 texte mis à jour sur le site' : `${rows.length} textes mis à jour sur le site`);
    rerender();
  }));
  box.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.reset;
    const { error } = await supabase.from('site_content').delete().eq('key', SK(k));
    if (error) return toast('Impossible : ' + error.message);
    delete saved[SK(k)]; applyAll(); toast('Texte d’origine rétabli'); rerender();
  }));
}

export const CMS_CSS = `.cms-g{border-top:1px solid var(--line);padding:14px 0}.cms-g summary{cursor:pointer;font-family:'Playfair Display',serif;font-size:22px;list-style-position:outside}.cms-g summary .m{font-family:Inter,sans-serif;font-size:13px}.cms-form{margin-top:14px}.cms-f textarea{min-height:0;resize:vertical}.cms-f .linkbtn{margin-top:6px;font-size:12px}.cms-top{display:grid;grid-template-columns:200px minmax(0,420px);gap:16px}.cms-note{margin:6px 0 18px;font-size:13px;color:var(--muted)}@media (max-width:560px){.cms-top{grid-template-columns:1fr}}`;
