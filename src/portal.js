// Espaces connectés : connexion par lien courriel, espace client, compte gérant et messagerie.
import { supabase, configured } from './supabase.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => { if (!d) return '—'; const x = new Date(String(d).length === 10 ? d + 'T12:00' : d); return isNaN(x) ? esc(d) : x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' }); };
const fmtTime = (t) => { const x = new Date(t); return isNaN(x) ? '' : x.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
const STATUS = { nouvelle: 'Nouvelle', confirmee: 'Confirmée', terminee: 'Terminée', annulee: 'Annulée' };
const pill = (s) => `<span class="pill ${esc(s)}">${STATUS[s] || esc(s)}</span>`;
const SERVICES_V = ['Courses livrées avant l’arrivée', 'Pack Arrivée', 'Skis et forfaits au logement', 'Transfert depuis la gare d’Embrun', 'Chef à domicile', 'Matériel bébé', 'Garde d’enfants', 'Massage ou activité', 'Arrivée anticipée ou départ tardif'];
const SERVICES_P = ['Ménage de fin de séjour', 'Linge de lit et de toilette', 'Mise en chauffe avant l’arrivée', 'Déneigement', 'Visite de contrôle', 'Petite maintenance', 'Accueil + état des lieux'];

const main = $('top'), portal = $('portal'), body = $('portal-body'), toastEl = $('toast');
let tt; const toast = (m) => { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(tt); tt = setTimeout(() => (toastEl.hidden = true), 2800); };
const PORTAL = ['connexion', 'espace-client', 'espace-gerant'];

const st = { session: null, me: null, tab: 'messagerie', convo: null, data: {}, channel: null };

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
  document.querySelectorAll('.acc-links a').forEach((a) => (on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
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
  if (!st.session) return renderLogin();
  if (!st.me) { await loadMe(); if (!st.me) { body.innerHTML = '<p class="empty">Création de votre espace…</p>'; setTimeout(async () => { await loadMe(); render(); }, 1500); return; } }
  subscribe();
  return st.me.role === 'gerant' ? renderGerant() : renderClient();
}

/* ---------- Connexion par lien magique ---------- */
function renderLogin() {
  body.innerHTML = `<div class="p-head"><div><p class="eyebrow">Connexion</p><h1>Bienvenue.</h1><p class="who-is">Clients et gérants se connectent ici. Chaque compte ouvre l’espace qui lui correspond.</p></div></div>
  <form class="login" id="login" novalidate><h2>Se connecter</h2><p>Entrez votre adresse : vous recevez un lien de connexion par courriel, sans mot de passe.</p>
  <div class="field"><label for="lg-n">Votre nom (première connexion)</label><input id="lg-n" autocomplete="name"></div>
  <div class="field"><label for="lg-e">Adresse courriel</label><input id="lg-e" type="email" autocomplete="email" required></div>
  <p class="err" id="lg-err" hidden></p>
  <button class="btn solid" type="submit">Recevoir mon lien</button></form>`;
  $('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('lg-e').value.trim(), name = $('lg-n').value.trim(), err = $('lg-err');
    if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Indiquez une adresse courriel valide.'; err.hidden = false; return; }
    err.hidden = true;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname + '#connexion', data: name ? { full_name: name } : undefined } });
    if (error) { err.textContent = 'Envoi impossible : ' + error.message; err.hidden = false; return; }
    body.querySelector('#login').innerHTML = `<h2>Vérifiez votre boîte mail</h2><p>Un lien de connexion vient d’être envoyé à <b>${esc(email)}</b>. Ouvrez-le sur cet appareil pour accéder à votre espace.</p>`;
  });
}

async function logout() { await supabase.auth.signOut(); }

/* ---------- Temps réel ---------- */
function subscribe() {
  if (st.channel) return;
  st.channel = supabase.channel('altiora')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const m = p.new;
      if (st.me && m.sender_id !== st.me.id) toast('Nouveau message');
      render();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, () => { if (st.me?.role === 'gerant') { toast('Nouveau message du site'); render(); } })
    .subscribe();
}

const thread = (msgs, me, names) => msgs.length
  ? `<div class="thread" id="thread">${msgs.map((m) => `<div class="msg ${m.sender_id === me ? 'mine' : ''}"><p>${esc(m.body)}</p><span>${esc(names[m.sender_id] || 'Conciergerie')} · ${fmtTime(m.created_at)}</span></div>`).join('')}</div>`
  : '<p class="empty">Pas encore de message.</p>';
const scrollThread = () => { const t = $('thread'); if (t) t.scrollTop = t.scrollHeight; };

/* ---------- Espace client ---------- */
async function renderClient() {
  const me = st.me;
  const [{ data: msgs = [] }, { data: reqs = [] }] = await Promise.all([
    supabase.from('messages').select('*').eq('client_id', me.id).order('created_at'),
    supabase.from('requests').select('*').eq('client_id', me.id).order('wanted_on'),
  ]);
  const names = { [me.id]: me.full_name || 'Vous' };
  const services = me.kind === 'proprietaire' ? SERVICES_P : SERVICES_V;
  const info = me.property ? `<div class="panel"><h2>${me.kind === 'proprietaire' ? 'Votre bien' : 'Votre séjour'}</h2><div class="stay"><p class="big">${esc(me.property)}</p>
    ${me.kind === 'proprietaire' ? '' : `<div><span>Arrivée</span>${fmtDate(me.stay_from)}</div><div><span>Départ</span>${fmtDate(me.stay_to)}</div>`}<div><span>Votre contact</span>La conciergerie</div></div></div>` : '';
  body.innerHTML = `<div class="p-head"><div><p class="eyebrow">Espace client</p><h1>Bonjour, ${esc(me.full_name || '')}.</h1><p class="who-is">${esc(me.email || '')}</p></div><button class="linkbtn" id="logout">Se déconnecter</button></div>
  <div class="p-grid"><div>${info}
    <div class="panel"><h2>Messages</h2>${thread(msgs, me.id, names)}
      <form class="newreq" id="cmsg" novalidate><div class="field"><label for="cm-t">Écrire à la conciergerie</label><textarea id="cm-t" placeholder="Votre message…"></textarea></div><button class="btn solid" type="submit">Envoyer le message</button></form></div>
    <div class="panel"><h2>Vos demandes <small>${reqs.length}</small></h2>${reqs.length ? `<div class="list">${reqs.map((r) => `<div class="item"><span class="t">${esc(r.service)}</span><span class="m">${fmtDate(r.wanted_on)}${r.detail ? ' · ' + esc(r.detail) : ''}</span><span class="s">${pill(r.status)}</span></div>`).join('')}</div>` : '<p class="empty">Aucune demande pour l’instant.</p>'}</div>
  </div><aside class="panel"><h2>Nouvelle demande</h2><form class="newreq" id="newreq" novalidate>
    <div class="field"><label for="nr-s">Service</label><select id="nr-s">${services.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
    <div class="field"><label for="nr-d">Date souhaitée</label><input id="nr-d" type="date"></div>
    <div class="field"><label for="nr-t">Précisions</label><textarea id="nr-t" placeholder="Nombre de personnes, horaires, préférences…"></textarea></div>
    <button class="btn solid" type="submit">Envoyer la demande</button></form></aside></div>`;
  scrollThread();
  $('logout').onclick = logout;
  $('cmsg').addEventListener('submit', async (e) => {
    e.preventDefault(); const t = $('cm-t').value.trim(); if (!t) return;
    const { error } = await supabase.from('messages').insert({ client_id: me.id, sender_id: me.id, body: t });
    if (error) return toast('Message non envoyé : ' + error.message);
    toast('Message envoyé à la conciergerie'); render();
  });
  $('newreq').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('requests').insert({ client_id: me.id, service: $('nr-s').value, wanted_on: $('nr-d').value || null, detail: $('nr-t').value.trim() || null });
    if (error) return toast('Demande non envoyée : ' + error.message);
    toast('Demande envoyée'); render();
  });
}

/* ---------- Compte gérant ---------- */
const TABS = [['messagerie', 'Messagerie'], ['contacts', 'Contacts du site'], ['demandes', 'Demandes'], ['clients', 'Clients']];

async function renderGerant() {
  const me = st.me;
  const [{ data: profiles = [] }, { data: msgs = [] }, { data: reads = [] }, { data: reqs = [] }, { data: leads = [] }] = await Promise.all([
    supabase.from('profiles').select('*').order('created_at'),
    supabase.from('messages').select('*').order('created_at'),
    supabase.from('message_reads').select('*').eq('user_id', me.id),
    supabase.from('requests').select('*').order('created_at', { ascending: false }),
    supabase.from('leads').select('*').order('created_at', { ascending: false }),
  ]);
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
    content = reqs.length ? `<div class="tbl-wrap"><table class="ptable"><thead><tr><th>Client</th><th>Service</th><th>Date</th><th>Statut</th></tr></thead><tbody>${reqs.map((r) => `<tr class="${r.status === 'nouvelle' ? 'is-new' : ''}"><td>${esc(names[r.client_id])}</td><td>${esc(r.service)}${r.detail ? `<div class="m">${esc(r.detail)}</div>` : ''}</td><td style="white-space:nowrap">${fmtDate(r.wanted_on)}</td><td><select aria-label="Statut" data-req="${esc(r.id)}">${Object.keys(STATUS).map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${STATUS[s]}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Aucune demande.</p>';
  } else {
    content = `<p class="who-is" style="margin-bottom:16px">Un compte est créé automatiquement quand quelqu’un se connecte pour la première fois. Complétez ici son séjour ou son bien.</p>
    <div class="tbl-wrap"><table class="ptable"><thead><tr><th>Nom</th><th>Type</th><th>Logement</th><th>Du</th><th>Au</th><th>Rôle</th><th></th></tr></thead><tbody>${profiles.map((p) => `<tr data-prof="${esc(p.id)}"><td>${esc(p.full_name || '')}<div class="m">${esc(p.email || '')}</div></td>
      <td><select data-f="kind"><option value="">—</option><option value="voyageur" ${p.kind === 'voyageur' ? 'selected' : ''}>Voyageur</option><option value="proprietaire" ${p.kind === 'proprietaire' ? 'selected' : ''}>Propriétaire</option></select></td>
      <td><input data-f="property" value="${esc(p.property || '')}" placeholder="Chalet…" style="width:100%;min-width:140px;padding:6px"></td>
      <td><input data-f="stay_from" type="date" value="${esc(p.stay_from || '')}" style="padding:6px"></td><td><input data-f="stay_to" type="date" value="${esc(p.stay_to || '')}" style="padding:6px"></td>
      <td><select data-f="role" ${p.id === me.id ? 'disabled' : ''}><option value="client" ${p.role === 'client' ? 'selected' : ''}>Client</option><option value="gerant" ${p.role === 'gerant' ? 'selected' : ''}>Gérant</option></select></td>
      <td><button class="linkbtn" type="button" data-save="${esc(p.id)}">Enregistrer</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  body.innerHTML = `<div class="p-head"><div><p class="eyebrow">Compte gérant · accès complet</p><h1>Bonjour, ${esc(me.full_name || '')}.</h1><p class="who-is">${esc(me.email || '')}</p></div><button class="linkbtn" id="logout">Se déconnecter</button></div>
  <div class="kpis"><div class="kpi ${nMsg ? 'alert' : ''}"><b>${nMsg}</b><span>Messages non lus</span></div><div class="kpi ${nLeads ? 'alert' : ''}"><b>${nLeads}</b><span>Contacts à traiter</span></div><div class="kpi ${nNew ? 'alert' : ''}"><b>${nNew}</b><span>Demandes nouvelles</span></div><div class="kpi"><b>${clients.length}</b><span>Clients</span></div></div>
  <div class="tabs" role="tablist">${TABS.map(([k, l]) => { const n = k === 'messagerie' ? nMsg : k === 'contacts' ? nLeads : k === 'demandes' ? nNew : 0; return `<button role="tab" type="button" aria-selected="${k === tab}" data-tab="${k}">${l}${n ? ` <span class="badge">${n}</span>` : ''}</button>`; }).join('')}</div>${content}`;
  scrollThread();

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
  supabase.auth.onAuthStateChange(async (_e, session) => {
    const changed = (session?.user?.id || null) !== (st.session?.user?.id || null);
    st.session = session;
    if (changed) { st.me = null; if (st.channel) { supabase.removeChannel(st.channel); st.channel = null; } if (session && !PORTAL.includes(location.hash.slice(1))) history.replaceState(null, '', '#connexion'); route(); }
  });
}
route();
