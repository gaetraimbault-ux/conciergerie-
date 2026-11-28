// Espaces connectés : connexion par lien courriel, espace client, compte gérant et messagerie.
import { supabase, inviteClient, configured } from './supabase.js';
import { renderAuth, AUTH_CSS } from './auth-ui.js';
import { loadSiteContent, renderSiteEditor, CMS_CSS } from './cms.js';
import { t, locale } from './i18n.js';
{ const c = document.createElement('style'); c.textContent = AUTH_CSS + CMS_CSS; document.head.appendChild(c); }

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => { if (!d) return '—'; const x = new Date(String(d).length === 10 ? d + 'T12:00' : d); return isNaN(x) ? esc(d) : x.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'long' }); };
const fmtTime = (t) => { const x = new Date(t); return isNaN(x) ? '' : x.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const STATUS = { nouvelle: 'Nouvelle', confirmee: 'Confirmée', terminee: 'Terminée', annulee: 'Annulée' };
const pill = (s) => `<span class="pill ${esc(s)}">${STATUS[s] ? t(STATUS[s]) : esc(s)}</span>`;
const SERVICES_V = ['Courses livrées avant l’arrivée', 'Pack Arrivée', 'Skis et forfaits au logement', 'Transfert depuis la gare d’Embrun', 'Chef à domicile', 'Matériel bébé', 'Garde d’enfants', 'Massage ou activité', 'Arrivée anticipée ou départ tardif'];
const SERVICES_P = ['Ménage de fin de séjour', 'Linge de lit et de toilette', 'Mise en chauffe avant l’arrivée', 'Déneigement', 'Visite de contrôle', 'Petite maintenance', 'Accueil + état des lieux'];

const main = $('top'), portal = $('portal'), body = $('portal-body'), toastEl = $('toast');
let tt; const toast = (m) => { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(tt); tt = setTimeout(() => (toastEl.hidden = true), 2800); };
const PORTAL = ['connexion', 'inscription', 'espace-client', 'espace-gerant'];

const st = { recovery: false, session: null, me: null, tab: 'messagerie', convo: null, data: {}, channel: null };

/* ---------- Formulaire de contact public ---------- */
window.altioraSendLead = async (lead) => {
  if (!configured) throw new Error('Supabase non configuré');
  const { error } = await supabase.from('leads').insert(lead);
  if (error) throw error;
};

/* ---------- Navigation ---------- */
function route() {
  const h = location.hash.slice(1);
  const on = PORTAL.includes(h);
  document.querySelectorAll('.acc-links a').forEach((a) => (on && a.getAttribute('href') === '#' + (h === 'inscription' ? 'inscription' : 'connexion') ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (!on) { portal.hidden = true; main.hidden = false; return; }
  main.hidden = true; portal.hidden = false; window.scrollTo(0, 0);
  render();
}
window.addEventListener('hashchange', route);

async function loadMe() {
  if (!st.session) { st.me = null; return; }
  const { data } = await supabase.from('profiles').select('*').eq('id', st.session.user.id).maybeSingle();
  st.me = data;
}

async function render() {
  if (portal.hidden) return;
  if (!configured) { body.innerHTML = `<div class="login"><h2>Configuration manquante</h2><p>L’adresse et la clé Supabase ne sont pas renseignées (fichier .env ou variables de l’hébergeur).</p></div>`; return; }
  if (st.recovery && st.session) return renderAuth(body, supabase, { mode: 'reset', toast });
  if (st.session?.user?.user_metadata?.needs_password) return renderAuth(body, supabase, { mode: 'reset', welcome: true, toast });
  if (!st.session) return renderLogin();
  if (!st.me) { await loadMe(); if (!st.me) { body.innerHTML = `<p class="empty">${t('Création de votre espace…')}</p>`; setTimeout(async () => { await loadMe(); render(); }, 1500); return; } }
  subscribe();
  return st.me.role === 'gerant' ? renderGerant() : renderClient();
}

/* ---------- Connexion et création de compte ---------- */
function renderLogin() {
  renderAuth(body, supabase, { mode: location.hash === '#inscription' ? 'signup' : 'login', toast });
}

async function logout() { await supabase.auth.signOut(); }

/* ---------- Temps réel ---------- */
function subscribe() {
  if (st.channel) return;
  st.channel = supabase.channel('altiora')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const m = p.new;
      if (st.me && m.sender_id !== st.me.id) toast(t('Nouveau message'));
      render();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => { if (st.me?.role === 'gerant') { toast('Nouveau message du site'); render(); } })
    .subscribe();
}

const thread = (msgs, me, names) => msgs.length
  ? `<div class="thread" id="thread">${msgs.map((m) => `<div class="msg ${m.sender_id === me ? 'mine' : ''}"><p>${esc(m.body)}</p><span>${esc(names[m.sender_id] || t('Conciergerie'))} · ${fmtTime(m.created_at)}</span></div>`).join('')}</div>`
  : `<p class="empty">${t('Pas encore de message.')}</p>`;
const scrollThread = () => { const t = $('thread'); if (t) t.scrollTop = t.scrollHeight; };

/* ---------- Biens des propriétaires (un propriétaire peut en avoir plusieurs) ---------- */
const LIEUX = ['Les Orres', 'Crévoux', 'Embrun', 'Savines-le-Lac', 'Vars', 'Risoul', 'Autre'];
// Formulaire d'ajout (b vide) ou de modification d'un bien. owners : liste de propriétaires (vue gérant, ajout).
const bienForm = (b = {}, owners = null) => `<form class="newreq bien-form" data-bien-form="${esc(b.id || '')}" novalidate>
  ${owners ? `<div class="field"><label>${t('Propriétaire')}</label><select data-bf="owner_id">${owners.map((o) => `<option value="${esc(o.id)}">${esc(o.full_name || o.email)}</option>`).join('')}</select></div>` : ''}
  <div class="row"><div class="field"><label>${t('Nom du bien')}</label><input data-bf="name" maxlength="200" value="${esc(b.name || '')}" placeholder="${t('ex. Chalet Les Mélèzes')}"></div>
  <div class="field"><label>${t('Lieu')}</label><select data-bf="place">${LIEUX.map((l) => `<option value="${l}" ${l === b.place ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></div></div>
  <div class="field"><label>${t('Adresse')}</label><input data-bf="address" maxlength="300" value="${esc(b.address || '')}"></div>
  <div class="field"><label>${t('Précisions')}</label><textarea data-bf="notes" maxlength="2000" placeholder="${t('Surface, couchages, accès, boîte à clés…')}">${esc(b.notes || '')}</textarea></div>
  <p class="err" hidden></p>
  <button class="btn solid" type="submit">${t(b.id ? 'Enregistrer le bien' : 'Ajouter le bien')}</button></form>`;
const bienItem = (b, extra = '') => `<div class="item bien"><span class="t">${esc(b.name)}</span>
  <span class="m">${[b.place ? t(b.place) : '', esc(b.address || '')].filter(Boolean).join(' · ')}${b.notes ? `<br>${esc(b.notes)}` : ''}${extra}</span>
  <span class="s"><button class="linkbtn" type="button" data-bien-del="${esc(b.id)}">${t('Retirer')}</button></span>
  <details class="bien-edit"><summary>${t('Modifier')}</summary>${bienForm(b)}</details></div>`;
// Branche les formulaires et boutons des biens présents dans la page.
function wireBiens(ownerId) {
  body.querySelectorAll('[data-bien-form]').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = {}; f.querySelectorAll('[data-bf]').forEach((i) => (v[i.dataset.bf] = i.value.trim() || null));
    const err = f.querySelector('.err');
    if (!v.name) { err.textContent = t('Indiquez le nom du bien.'); err.hidden = false; return; }
    const id = f.dataset.bienForm;
    if (!id && !v.owner_id) v.owner_id = ownerId;
    const { error } = id ? await supabase.from('properties').update(v).eq('id', id) : await supabase.from('properties').insert(v);
    if (error) { err.textContent = t('Enregistrement impossible : ') + error.message; err.hidden = false; return; }
    toast(t(id ? 'Bien mis à jour' : 'Bien ajouté')); render();
  }));
  body.querySelectorAll('[data-bien-del]').forEach((b) => (b.onclick = async () => {
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = t('Confirmer le retrait'); b.classList.add('danger'); return; }
    const { error } = await supabase.from('properties').delete().eq('id', b.dataset.bienDel);
    toast(error ? t('Enregistrement impossible : ') + error.message : t('Bien retiré')); render();
  }));
}

/* ---------- Espace client ---------- */
async function renderClient() {
  const me = st.me;
  const [{ data: msgs = [] }, { data: reqs = [] }] = await Promise.all([
    supabase.from('messages').select('*').eq('client_id', me.id).order('created_at'),
    supabase.from('requests').select('*').eq('client_id', me.id).order('wanted_on'),
  ]);
  const names = { [me.id]: me.full_name || t('Vous') };
  const owner = me.kind === 'proprietaire';
  const { data: biens = [] } = owner ? await supabase.from('properties').select('*').eq('owner_id', me.id).order('created_at') : { data: [] };
  const B = Object.fromEntries(biens.map((b) => [String(b.id), b]));
  const services = owner ? SERVICES_P : SERVICES_V;
  const biensPanel = owner ? `<div class="panel" id="biens"><h2>${t('Vos biens')} <small>${biens.length}</small></h2>
    ${biens.length ? `<div class="list">${biens.map((b) => bienItem(b)).join('')}</div>` : `<p class="empty">${t('Aucun bien enregistré pour l’instant.')}</p>`}
    <details class="bien-add" ${biens.length ? '' : 'open'}><summary>${t('Ajouter un bien')}</summary>${bienForm()}</details></div>` : '';
  const info = !owner && me.property ? `<div class="panel"><h2>${t(me.kind === 'proprietaire' ? 'Votre bien' : 'Votre séjour')}</h2><div class="stay"><p class="big">${esc(me.property)}</p>
    ${me.kind === 'proprietaire' ? '' : `<div><span>${t('Arrivée')}</span>${fmtDate(me.stay_from)}</div><div><span>${t('Départ')}</span>${fmtDate(me.stay_to)}</div>`}<div><span>${t('Votre contact')}</span>${t('La conciergerie')}</div></div></div>` : '';
  body.innerHTML = `<div class="p-head"><div><p class="eyebrow">${t('Espace client')}</p><h1>${t('Bonjour, {name}.', { name: esc(me.full_name || '') })}</h1><p class="who-is">${esc(me.email || '')}</p></div><button class="linkbtn" id="logout">${t('Se déconnecter')}</button></div>
  <div class="p-grid"><div>${info}${biensPanel}
    <div class="panel"><h2>${t('Messages')}</h2>${thread(msgs, me.id, names)}
      <form class="newreq" id="cmsg" novalidate><div class="field"><label for="cm-t">${t('Écrire à la conciergerie')}</label><textarea id="cm-t" placeholder="${t('Votre message…')}"></textarea></div><button class="btn solid" type="submit">${t('Envoyer le message')}</button></form></div>
    <div class="panel"><h2>${t('Vos demandes')} <small>${reqs.length}</small></h2>${reqs.length ? `<div class="list">${reqs.map((r) => `<div class="item"><span class="t">${esc(t(r.service))}</span><span class="m">${B[r.property_id] ? esc(B[r.property_id].name) + ' · ' : ''}${fmtDate(r.wanted_on)}${r.detail ? ' · ' + esc(r.detail) : ''}</span><span class="s">${pill(r.status)}</span></div>`).join('')}</div>` : `<p class="empty">${t('Aucune demande pour l’instant.')}</p>`}</div>
  </div><aside class="panel"><h2>${t('Nouvelle demande')}</h2><form class="newreq" id="newreq" novalidate>
    <div class="field"><label for="nr-s">${t('Service')}</label><select id="nr-s">${services.map((s) => `<option value="${esc(s)}">${esc(t(s))}</option>`).join('')}</select></div>
    ${biens.length ? `<div class="field"><label for="nr-b">${t('Bien concerné')}</label><select id="nr-b">${biens.length > 1 ? `<option value="">${t('Choisir…')}</option>` : ''}${biens.map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label for="nr-d">${t('Date souhaitée')}</label><input id="nr-d" type="date"></div>
    <div class="field"><label for="nr-t">${t('Précisions')}</label><textarea id="nr-t" placeholder="${t('Nombre de personnes, horaires, préférences…')}"></textarea></div>
    <button class="btn solid" type="submit">${t('Envoyer la demande')}</button></form></aside></div>`;
  scrollThread();
  wireBiens(me.id);
  $('logout').onclick = logout;
  $('cmsg').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('cm-t').value.trim(); if (!t) return;
    const { error } = await supabase.from('messages').insert({ client_id: me.id, sender_id: me.id, body: t });
    if (error) return toast(t('Message non envoyé : ') + error.message);
    toast(t('Message envoyé à la conciergerie')); render();
  });
  $('newreq').addEventListener('submit', async (e) => {
    e.preventDefault();
    const property_id = $('nr-b')?.value || null;
    if (biens.length > 1 && !property_id) return toast(t('Choisissez le bien concerné.'));
    const { error } = await supabase.from('requests').insert({ client_id: me.id, service: $('nr-s').value, wanted_on: $('nr-d').value || null, detail: $('nr-t').value.trim() || null, property_id });
    if (error) return toast(t('Demande non envoyée : ') + error.message);
    toast(t('Demande envoyée')); render();
  });
}

/* ---------- Compte gérant ---------- */
const TABS = [['messagerie', 'Messagerie'], ['contacts', 'Contacts du site'], ['demandes', 'Demandes'], ['biens', 'Biens'], ['clients', 'Comptes'], ['site', 'Textes du site']];

async function renderGerant() {
  const me = st.me;
  const [{ data: profiles = [] }, { data: msgs = [] }, { data: reads = [] }, { data: reqs = [] }, { data: leads = [] }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at'),
    supabase.from('messages').select('*').order('created_at'),
    supabase.from('message_reads').select('*').eq('user_id', me.id),
    supabase.from('requests').select('*').order('created_at', { ascending: false }),
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
  ]);
  const { data: biens = [] } = await supabase.from('properties').select('*').order('created_at');
  const BI = Object.fromEntries(biens.map((b) => [String(b.id), b]));
  const { data: invites = [] } = st.tab === 'clients' ? await supabase.from('invites').select('*').order('created_at', { ascending: false }) : { data: [] };
  const P = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.email]));
  const R = Object.fromEntries(reads.map((r) => [r.client_id, new Date(r.last_read_at).getTime()]));
  const byClient = {};
  msgs.forEach((m) => (byClient[m.client_id] ||= []).push(m));
  const unread = (c) => (byClient[c] || []).filter((m) => P[m.sender_id]?.role !== 'gerant' && new Date(m.created_at).getTime() > (R[c] || 0)).length;
  const convos = Object.keys(byClient).sort((a, b) => new Date(byClient[b].at(-1).created_at) - new Date(byClient[a].at(-1).created_at));
  const nMsg = convos.reduce((n, c) => n + unread(c), 0);
  const nNew = reqs.filter((r) => r.status === 'nouvelle').length;
  const nLeads = leads.filter((l) => !l.handled).length;
  const clients = profiles.filter((p) => p.role === 'client');
  const tab = st.tab;
  let content = '';

  if (tab === 'messagerie') {
    let cur = st.convo && P[st.convo]?.role === 'client' ? st.convo : convos[0] || null;
    st.convo = cur;
    if (cur) await supabase.from('message_reads').upsert({ user_id: me.id, client_id: cur, last_read_at: new Date().toISOString() });
    const list = [...new Set([...convos, ...(cur ? [cur] : [])])];
    content = `<div class="inbox"><div class="convos">${list.length ? list.map((c) => { const last = (byClient[c] || []).at(-1); const n = c === cur ? 0 : unread(c);
      return `<button type="button" class="convo ${c === cur ? 'on' : ''} ${n ? 'unread' : ''}" data-convo="${esc(c)}"><span class="cn">${esc(names[c])}${n ? ` <span class="badge">${n}</span>` : ''}</span><span class="cl">${last ? (P[last.sender_id]?.role === 'gerant' ? esc(names[last.sender_id]) + ' : ' : '') + esc(last.body.slice(0, 70)) : 'Nouvelle conversation'}</span><span class="ct">${last ? fmtTime(last.created_at) : ''}</span></button>`; }).join('') : '<p class="empty" style="padding:16px">Aucun message pour l’instant.</p>'}
      <div style="padding:14px 16px"><label class="m" for="new-convo" style="font-size:13px">Écrire à un client</label><select id="new-convo" style="width:100%;margin-top:6px;padding:8px"><option value="">Choisir…</option>${clients.map((c) => `<option value="${esc(c.id)}">${esc(c.full_name || c.email)}</option>`).join('')}</select></div></div>
      <div class="conv">${cur ? `<div class="conv-head"><h2>${esc(names[cur])}</h2><p class="m">${esc(P[cur]?.email || '')}</p></div>${thread(byClient[cur] || [], me.id, names)}
      <form class="newreq" id="g-msg" novalidate><div class="field"><label for="gm-t">Répondre</label><textarea id="gm-t" placeholder="Votre réponse…"></textarea></div><button class="btn solid" type="submit">Envoyer</button></form>` : '<p class="empty">Sélectionnez une conversation.</p>'}</div></div>`;
  } else if (tab === 'contacts') {
    content = leads.length ? `<div class="list">${leads.map((l) => `<div class="item"><span class="t">${esc(l.name)} · ${esc(l.reach)}</span><span class="m">${fmtTime(l.created_at)} · ${l.kind === 'proprietaire' ? 'Propriétaire' : 'Voyageur'} · ${esc(l.place || '')}${l.dates ? ' · ' + esc(l.dates) : ''}<br>${esc(l.body || '(pas de précision)')}</span><span class="s">${l.handled ? '<span class="pill terminee">Traité</span>' : `<button class="btn" type="button" data-lead="${esc(l.id)}">Marquer traité</button>`}</span></div>`).join('')}</div>` : '<p class="empty">Aucun message reçu depuis le site.</p>';
  } else if (tab === 'demandes') {
    content = reqs.length ? `<div class="tbl-wrap"><table class="ptable"><thead><tr><th>Client</th><th>Service</th><th>Date</th><th>Statut</th></tr></thead><tbody>${reqs.map((r) => `<tr class="${r.status === 'nouvelle' ? 'is-new' : ''}"><td>${esc(names[r.client_id])}${BI[r.property_id] ? `<div class="m">${esc(BI[r.property_id].name)}</div>` : ''}</td><td>${esc(r.service)}${r.detail ? `<div class="m">${esc(r.detail)}</div>` : ''}</td><td style="white-space:nowrap">${fmtDate(r.wanted_on)}</td><td><select aria-label="Statut" data-req="${esc(r.id)}">${Object.keys(STATUS).map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune demande.</p>';
  } else if (tab === 'biens') {
    const owners = profiles.filter((p) => p.role === 'client' && p.kind === 'proprietaire');
    const byOwner = {}; biens.forEach((b) => (byOwner[b.owner_id] ||= []).push(b));
    const ids = [...new Set([...owners.map((o) => o.id), ...Object.keys(byOwner)])];
    content = `<p class="who-is" style="margin-bottom:18px">Chaque propriétaire peut avoir plusieurs biens. Il peut aussi les ajouter lui-même depuis son espace.</p>
      ${ids.length ? ids.map((id) => `<div class="panel owner-biens"><h2>${esc(names[id] || '—')} <small>${(byOwner[id] || []).length} bien${(byOwner[id] || []).length > 1 ? 's' : ''}</small></h2>
        ${(byOwner[id] || []).length ? `<div class="list">${byOwner[id].map((b) => bienItem(b)).join('')}</div>` : '<p class="empty">Aucun bien enregistré.</p>'}</div>`).join('') : '<p class="empty">Aucun propriétaire pour l’instant. Passez un compte en « Propriétaire » dans l’onglet Comptes.</p>'}
      ${owners.length ? `<details class="bien-add panel"><summary>Ajouter un bien à un propriétaire</summary>${bienForm({}, owners)}</details>` : ''}`;
  } else if (tab === 'site') {
    content = '<div id="cms-box"></div>';
  } else {
    content = `<form class="newreq" id="inv" novalidate><h2>Créer un compte</h2><p class="m">La personne reçoit un courriel avec un lien qui ouvre son espace, puis elle choisit son mot de passe. Si l’adresse a déjà un compte, son rôle est simplement mis à jour.</p>
      <div class="row"><div class="field"><label for="inv-n">Nom complet</label><input id="inv-n" autocomplete="off"></div><div class="field"><label for="inv-e">Adresse courriel</label><input id="inv-e" type="email" autocomplete="off"></div></div>
      <div class="row"><div class="field"><label for="inv-r">Rôle</label><select id="inv-r"><option value="client">Client</option><option value="gerant">Gérant (accès complet)</option></select></div><div class="field"><label for="inv-k">Type de client</label><select id="inv-k"><option value="voyageur">Voyageur</option><option value="proprietaire">Propriétaire</option></select></div></div>
      <p class="err" id="inv-err" hidden></p><button class="btn solid" type="submit">Créer le compte et envoyer l’invitation</button></form>
    ${invites.length ? `<h2 style="margin:28px 0 10px">Invitations en attente</h2><div class="list">${invites.map((i) => `<div class="item"><span class="t">${esc(i.full_name || i.email)} · ${i.role === 'gerant' ? 'Gérant' : 'Client'}</span><span class="m">${esc(i.email)} · envoyée le ${fmtTime(i.created_at)}</span><span class="s"><button class="linkbtn" type="button" data-uninv="${esc(i.email)}">Annuler</button></span></div>`).join('')}</div>` : ''}
    <h2 style="margin:28px 0 10px">Tous les comptes</h2><p class="who-is" style="margin-bottom:16px">Complétez ici le séjour ou le bien de chacun, ou changez son rôle.</p>
    <div class="tbl-wrap"><table class="ptable"><thead><tr><th>Nom</th><th>Type</th><th>Logement / biens</th><th>Du</th><th>Au</th><th>Rôle</th><th></th></tr></thead><tbody>${profiles.map((p) => `<tr data-prof="${esc(p.id)}"><td>${esc(p.full_name || '')}<div class="m">${esc(p.email || '')}${p.phone ? '<br>' + esc(p.phone) : ''}${p.place ? '<br>' + esc(p.place) : ''}</div></td>
      <td><select data-f="kind"><option value="">—</option><option value="voyageur" ${p.kind === 'voyageur' ? 'selected' : ''}>Voyageur</option><option value="proprietaire" ${p.kind === 'proprietaire' ? 'selected' : ''}>Propriétaire</option></select></td>
      <td>${p.kind === 'proprietaire' ? `<button class="linkbtn" type="button" data-tab="biens">${(biens.filter((b) => b.owner_id === p.id)).length} bien(s)</button>` : `<input data-f="property" value="${esc(p.property || '')}" placeholder="Chalet…" style="width:100%;min-width:140px;padding:6px">`}</td>
      <td><input data-f="stay_from" type="date" value="${esc(p.stay_from || '')}" style="padding:6px"></td><td><input data-f="stay_to" type="date" value="${esc(p.stay_to || '')}" style="padding:6px"></td>
      <td><select data-f="role" ${p.id === me.id ? 'disabled' : ''}><option value="client" ${p.role === 'client' ? 'selected' : ''}>Client</option><option value="gerant" ${p.role === 'gerant' ? 'selected' : ''}>Gérant</option></select></td>
      <td><button class="linkbtn" type="button" data-save="${esc(p.id)}">Enregistrer</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  body.innerHTML = `<div class="p-head"><div><p class="eyebrow">Compte gérant · accès complet</p><h1>Bonjour, ${esc(me.full_name || '')}.</h1><p class="who-is">${esc(me.email || '')}</p></div><button class="linkbtn" id="logout">Se déconnecter</button></div>
  <div class="kpis"><div class="kpi ${nMsg ? 'alert' : ''}"><b>${nMsg}</b><span>Messages non lus</span></div><div class="kpi ${nLeads ? 'alert' : ''}"><b>${nLeads}</b><span>Contacts à traiter</span></div><div class="kpi ${nNew ? 'alert' : ''}"><b>${nNew}</b><span>Demandes nouvelles</span></div><div class="kpi"><b>${clients.length}</b><span>Clients</span></div></div>
  <div class="tabs" role="tablist">${TABS.map(([k, l]) => { const n = k === 'messagerie' ? nMsg : k === 'contacts' ? nLeads : k === 'demandes' ? nNew : 0; return `<button role="tab" type="button" aria-selected="${k === tab}" data-tab="${k}">${l}${n ? ` <span class="badge">${n}</span>` : ''}</button>`; }).join('')}</div>${content}`;
  scrollThread();

  const cmsBox = $('cms-box');
  if (cmsBox) { const o = { supabase, toast, me, rerender: () => renderSiteEditor(cmsBox, o) }; renderSiteEditor(cmsBox, o); }
  wireBiens(null);
  $('logout').onclick = logout;
  body.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { st.tab = b.dataset.tab; render(); }));
  body.querySelectorAll('[data-convo]').forEach((b) => (b.onclick = () => { st.convo = b.dataset.convo; render(); }));
  const nc = $('new-convo'); if (nc) nc.onchange = () => { if (nc.value) { st.convo = nc.value; render(); } };
  const gm = $('g-msg');
  if (gm) gm.addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('gm-t').value.trim(); if (!t) return;
    const { error } = await supabase.from('messages').insert({ client_id: st.convo, sender_id: me.id, body: t });
    if (error) return toast('Réponse non envoyée : ' + error.message);
    toast('Réponse envoyée'); render();
  });
  body.querySelectorAll('[data-lead]').forEach((b) => (b.onclick = async () => { await supabase.from('leads').update({ handled: true }).eq('id', b.dataset.lead); render(); }));
  body.querySelectorAll('[data-req]').forEach((s) => (s.onchange = async () => { const { error } = await supabase.from('requests').update({ status: s.value }).eq('id', s.dataset.req); toast(error ? 'Erreur : ' + error.message : 'Statut : ' + STATUS[s.value]); render(); }));
  const inv = $('inv');
  if (inv) inv.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = (m) => { $('inv-err').textContent = m; $('inv-err').hidden = false; };
    const full_name = $('inv-n').value.trim(), email = $('inv-e').value.trim().toLowerCase(), role = $('inv-r').value, kind = $('inv-k').value;
    if (!full_name) return err('Indiquez le nom de la personne.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return err('Indiquez une adresse courriel valide.');
    const btn = inv.querySelector('button[type=submit]'); btn.disabled = true;
    const exist = profiles.find((p) => (p.email || '').toLowerCase() === email);
    if (exist) {
      const { error } = await supabase.from('profiles').update({ role, kind: role === 'client' ? kind : exist.kind }).eq('id', exist.id);
      btn.disabled = false;
      if (error) return err('Mise à jour impossible : ' + error.message);
      toast(`${exist.full_name || email} avait déjà un compte : il est maintenant ${role === 'gerant' ? 'gérant' : 'client'}.`); return render();
    }
    const { error: e1 } = await supabase.from('invites').upsert({ email, role, full_name, kind: role === 'client' ? kind : null, invited_by: me.id });
    if (e1) { btn.disabled = false; return err('Invitation impossible : ' + e1.message); }
    const { error: e2 } = await inviteClient.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname + '#connexion', data: { full_name, kind: role === 'client' ? kind : null, needs_password: true } } });
    btn.disabled = false;
    if (e2) { await supabase.from('invites').delete().eq('email', email); return err(/rate|limit/i.test(e2.message) ? 'Trop de courriels envoyés en peu de temps. Réessayez dans une heure.' : 'Courriel non envoyé : ' + e2.message); }
    toast(`Invitation envoyée à ${email}`); render();
  });
  body.querySelectorAll('[data-uninv]').forEach((b) => (b.onclick = async () => { await supabase.from('invites').delete().eq('email', b.dataset.uninv); toast('Invitation annulée'); render(); }));
  body.querySelectorAll('[data-save]').forEach((b) => (b.onclick = async () => {
    const row = body.querySelector(`[data-prof="${CSS.escape(b.dataset.save)}"]`), v = {};
    row.querySelectorAll('[data-f]').forEach((i) => { if (!i.disabled) v[i.dataset.f] = i.value || null; });
    if (!v.role) delete v.role;
    const { error } = await supabase.from('profiles').update(v).eq('id', b.dataset.save);
    toast(error ? 'Erreur : ' + error.message : 'Fiche enregistrée'); render();
  }));
}

/* ---------- Démarrage ---------- */
if (configured) {
  loadSiteContent(supabase);
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') { st.recovery = true; st.session = session; history.replaceState(null, '', '#connexion'); route(); return; }
    if (event === 'USER_UPDATED') { st.recovery = false; st.session = session; render(); return; }
    const changed = (session?.user?.id || null) !== (st.session?.user?.id || null);
    st.session = session;
    if (changed) { st.me = null; if (st.channel) { supabase.removeChannel(st.channel); st.channel = null; } if (session && !PORTAL.includes(location.hash.slice(1))) history.replaceState(null, '', '#connexion'); route(); }
  });
}
route();
addEventListener('altiora-lang', () => render());
