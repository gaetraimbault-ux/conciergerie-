// Textes du site modifiables par les gérants (prix, coordonnées, titres…).
// Chaque élément modifiable porte un attribut data-k dans index.html ; la table site_content
// garde uniquement les textes changés. Le texte d'origine reste dans la page comme valeur par défaut.

const ALLOWED = new Set(['EM', 'STRONG', 'B', 'I', 'BR', 'SPAN', 'SMALL']);
const DEFAULTS = {};
document.querySelectorAll('[data-k]').forEach((el) => (DEFAULTS[el.dataset.k] = el.innerHTML.trim()));
let saved = {};

// Ne garde que la mise en forme simple : aucun lien, script ni attribut (sauf la classe d'un <span>).
export function clean(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html ?? '');
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
  walk(t.content);
  return t.innerHTML.trim();
}

function apply(key, html) {
  document.querySelectorAll(`[data-k="${CSS.escape(key)}"]`).forEach((el) => (el.innerHTML = clean(html)));
}

export async function loadSiteContent(supabase) {
  if (!supabase) return;
  const { data, error } = await supabase.from('site_content').select('key, html');
  if (error || !data) return;
  saved = {};
  data.forEach((r) => { if (r.key in DEFAULTS) { saved[r.key] = r.html; apply(r.key, r.html); } });
}

const KIND = { H1: 'Grand titre', H2: 'Titre', H3: 'Sous-titre', A: 'Lien ou bouton', LI: 'Ligne de liste', TD: 'Case du tableau', TH: 'En-tête du tableau', B: 'Information', STRONG: 'Montant', SPAN: 'Texte court', P: 'Texte', DT: 'Terme', DD: 'Définition' };
const GROUP = { header: 'Menu du haut', hero: 'Accueil', seasons: 'Deux saisons', voyageurs: 'Voyageurs', proprietaires: 'Propriétaires (offres et tarifs)', territoire: 'Territoire', promise: 'Engagements', contact: 'Contact et coordonnées', footer: 'Pied de page' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Affiche le texte sans balises quand il n'en a pas besoin, pour une saisie simple.
const toField = (html) => (/<[a-z]/i.test(html) ? html : new DOMParser().parseFromString(`<p>${html}</p>`, 'text/html').body.textContent);
const fromField = (v) => (/<[a-z]/i.test(v) ? clean(v) : esc(v.trim()));
const norm = (h) => clean(h).replace(/\s+/g, ' ').trim();

export function renderSiteEditor(box, { supabase, toast, me, rerender }) {
  const groups = {};
  Object.keys(DEFAULTS).forEach((k) => (groups[k.replace(/-\d+$/, '')] ||= []).push(k));
  const q = (box.dataset.q || '').toLowerCase();
  const field = (k) => {
    const el = document.querySelector(`[data-k="${CSS.escape(k)}"]`);
    const cur = k in saved ? saved[k] : DEFAULTS[k];
    const changed = k in saved && norm(saved[k]) !== norm(DEFAULTS[k]);
    const v = toField(cur);
    const prev = el?.previousElementSibling, ctx = prev && ['SPAN', 'TD', 'TH', 'H3', 'DT'].includes(prev.tagName) ? prev.textContent.trim().slice(0, 50) : '';
    const label = (/€/.test(DEFAULTS[k]) ? 'Prix' : KIND[el?.tagName] || 'Texte') + (ctx ? ' · ' + ctx : '') + (changed ? ' · modifié' : '');
    return `<div class="field cms-f" data-cms="${esc(k)}" ${q && !(v.toLowerCase().includes(q) || label.toLowerCase().includes(q)) ? 'hidden' : ''}><label for="cms-${esc(k)}">${esc(label)}</label>
      <textarea id="cms-${esc(k)}" rows="${Math.min(6, Math.max(1, Math.ceil(v.length / 70)))}">${esc(v)}</textarea>
      ${changed ? `<button class="linkbtn" type="button" data-reset="${esc(k)}">Revenir au texte d’origine</button>` : ''}</div>`;
  };
  box.innerHTML = `<p class="who-is" style="margin-bottom:12px">Modifiez ici les textes du site : prix, coordonnées, titres, descriptions. Les changements sont visibles par tous les visiteurs dès l’enregistrement. Pour mettre un mot en italique, entourez-le de &lt;em&gt; et &lt;/em&gt;.</p>
    <div class="field" style="max-width:420px;margin-bottom:18px"><label for="cms-q">Rechercher un texte</label><input id="cms-q" value="${esc(box.dataset.q || '')}" placeholder="ex. €, courriel, ménage…"></div>
    ${Object.entries(groups).map(([g, keys]) => `<details class="cms-g" ${q ? 'open' : ''}><summary>${esc(GROUP[g] || g)} <span class="m">(${keys.length})</span></summary>
      <form class="newreq cms-form" data-g="${esc(g)}" novalidate>${keys.map(field).join('')}<button class="btn solid" type="submit">Enregistrer cette partie</button></form></details>`).join('')}`;

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
      const before = k in saved ? saved[k] : DEFAULTS[k];
      if (norm(html) !== norm(before)) rows.push({ key: k, html, updated_by: me.id, updated_at: new Date().toISOString() });
    });
    if (!rows.length) return toast('Aucun changement dans cette partie');
    const { error } = await supabase.from('site_content').upsert(rows);
    if (error) return toast('Enregistrement impossible : ' + error.message);
    rows.forEach((r) => { saved[r.key] = r.html; apply(r.key, r.html); });
    toast(rows.length === 1 ? '1 texte mis à jour sur le site' : `${rows.length} textes mis à jour sur le site`);
    rerender();
  }));
  box.querySelectorAll('[data-reset]').forEach((b) => (b.onclick = async () => {
    const k = b.dataset.reset;
    const { error } = await supabase.from('site_content').delete().eq('key', k);
    if (error) return toast('Impossible : ' + error.message);
    delete saved[k]; apply(k, DEFAULTS[k]); toast('Texte d’origine rétabli'); rerender();
  }));
}

export const CMS_CSS = `.cms-g{border-top:1px solid var(--line);padding:14px 0}.cms-g summary{cursor:pointer;font-family:'Playfair Display',serif;font-size:22px;list-style-position:outside}.cms-g summary .m{font-family:Inter,sans-serif;font-size:13px}.cms-form{margin-top:14px}.cms-f textarea{min-height:0;resize:vertical}.cms-f .linkbtn{margin-top:6px;font-size:12px}`;
