// Écrans de connexion, de création de compte client et de mot de passe oublié.
// Utilisé par portal.js ; ne dépend que de Supabase Auth.

import { t } from './i18n.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LIEUX = ['Les Orres', 'Crévoux', 'Embrun', 'Savines-le-Lac', 'Vars', 'Risoul', 'Autre'];
const redirect = () => location.origin + location.pathname + '#connexion';
const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e);

export const AUTH_CSS = `
.auth{max-width:620px;border:1px solid var(--line);background:var(--paper)}
.auth-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--line)}
.auth-tabs button{background:none;border:0;border-bottom:2px solid transparent;padding:16px;font:500 13px var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);cursor:pointer}
.auth-tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--ember);background:var(--snow)}
.auth form{padding:32px;display:grid;gap:16px}
.auth h2{font-size:30px}
.auth .lead{color:var(--muted)}
.auth .who{margin-bottom:4px}
.auth .row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.auth .hint{font-size:13px;color:var(--muted)}
.auth .check-line{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--muted)}
.auth .check-line input{margin-top:4px;accent-color:var(--ink)}
.auth .alt{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.auth .ok{border:1px solid var(--ember);padding:16px;background:var(--snow)}
.auth .ok b{color:var(--ink)}
.pw-meter{height:4px;background:var(--line);margin-top:6px}
.pw-meter span{display:block;height:100%;width:0;background:var(--ember);transition:width .2s}
@media (max-width:560px){.auth form{padding:22px}.auth .row{grid-template-columns:1fr}}
`;

export function renderAuth(body, supabase, opts = {}) {
  const { mode = 'login', toast } = opts;
  const tabs = `<div class="auth-tabs" role="tablist">
      <button type="button" role="tab" data-mode="login" aria-selected="${mode === 'login'}">${t('Se connecter')}</button>
      <button type="button" role="tab" data-mode="signup" aria-selected="${mode === 'signup'}">${t('Créer un compte')}</button></div>`;
  const head = `<div class="p-head"><div><p class="eyebrow">${mode === 'signup' ? t('Inscription') : t('Connexion')}</p><h1>${mode === 'signup' ? t('Créez votre espace.') : t('Bienvenue.')}</h1>
      <p class="who-is">${mode === 'signup' ? t('Suivez votre séjour ou votre bien, faites vos demandes et écrivez-nous depuis votre espace.') : t('Clients et gérants se connectent ici. Chaque compte ouvre l’espace qui lui correspond.')}</p></div></div>`;
  let form = '';
  if (mode === 'login') {
    form = `<form id="au-login" novalidate>
      <div class="field"><label for="au-e">${t('Adresse courriel')}</label><input id="au-e" type="email" autocomplete="email"></div>
      <div class="field"><label for="au-p">${t('Mot de passe')}</label><input id="au-p" type="password" autocomplete="current-password"></div>
      <p class="err" id="au-err" hidden></p>
      <button class="btn solid" type="submit">${t('Se connecter')}</button>
      <div class="alt"><button class="linkbtn" type="button" id="au-forgot">${t('Mot de passe oublié ?')}</button><button class="linkbtn" type="button" id="au-magic">${t('Recevoir un lien par courriel')}</button></div>
      <p class="hint">${t('Pas encore de compte ?')} <button class="linkbtn" type="button" data-mode="signup">${t('Créer un compte')}</button></p></form>`;
  } else if (mode === 'signup') {
    form = `<form id="au-signup" novalidate>
      <div class="who" role="radiogroup" aria-label="${t('Vous êtes')}">
        <input type="radio" name="su-kind" id="su-v" value="voyageur" checked><label for="su-v">${t('Je séjourne')}</label>
        <input type="radio" name="su-kind" id="su-o" value="proprietaire"><label for="su-o">${t('Je suis propriétaire')}</label></div>
      <div class="row"><div class="field"><label for="su-fn">${t('Prénom')}</label><input id="su-fn" autocomplete="given-name"></div>
        <div class="field"><label for="su-ln">${t('Nom|famille')}</label><input id="su-ln" autocomplete="family-name"></div></div>
      <div class="row"><div class="field"><label for="su-e">${t('Adresse courriel')}</label><input id="su-e" type="email" autocomplete="email"></div>
        <div class="field"><label for="su-ph">${t('Téléphone')}</label><input id="su-ph" type="tel" autocomplete="tel" placeholder="${t('06 12 34 56 78')}"></div></div>
      <div class="row"><div class="field"><label for="su-pl">${t('Lieu')}</label><select id="su-pl">${LIEUX.map((l) => `<option value="${l}">${t(l)}</option>`).join('')}</select></div>
        <div class="field"><label for="su-pr" id="su-pr-l">${t('Logement réservé')}</label><input id="su-pr" placeholder="${t('ex. Chalet Les Mélèzes')}"></div></div>
      <div class="field" id="su-dates-f"><label for="su-dates">${t('Dates du séjour')}</label><input id="su-dates" data-cal="range" placeholder="${t('Arrivée et départ')}"></div>
      <div class="row"><div class="field"><label for="su-p">${t('Mot de passe')}</label><input id="su-p" type="password" autocomplete="new-password"><div class="pw-meter" aria-hidden="true"><span id="su-meter"></span></div><span class="hint">${t('8 caractères minimum')}</span></div>
        <div class="field"><label for="su-p2">${t('Confirmer le mot de passe')}</label><input id="su-p2" type="password" autocomplete="new-password"></div></div>
      <label class="check-line"><input type="checkbox" id="su-ok"> <span>${t('J’accepte que la conciergerie conserve ces informations pour gérer mon séjour ou mon bien.')}</span></label>
      <p class="err" id="su-err" hidden></p>
      <button class="btn solid" type="submit">${t('Créer mon compte')}</button>
      <p class="hint">${t('Déjà inscrit ?')} <button class="linkbtn" type="button" data-mode="login">${t('Se connecter')}</button></p></form>`;
  } else if (mode === 'forgot') {
    form = `<form id="au-forgotf" novalidate><h2>${t('Mot de passe oublié')}</h2><p class="lead">${t('Indiquez votre adresse : vous recevez un lien pour choisir un nouveau mot de passe.')}</p>
      <div class="field"><label for="fg-e">${t('Adresse courriel')}</label><input id="fg-e" type="email" autocomplete="email"></div>
      <p class="err" id="fg-err" hidden></p><button class="btn solid" type="submit">${t('Envoyer le lien')}</button>
      <button class="linkbtn" type="button" data-mode="login">${t('Retour à la connexion')}</button></form>`;
  } else if (mode === 'reset') {
    form = `<form id="au-reset" novalidate><h2>${opts.welcome ? t('Choisissez votre mot de passe') : t('Nouveau mot de passe')}</h2>${opts.welcome ? `<p class="lead">${t('Votre compte a été créé par la conciergerie. Choisissez un mot de passe pour vous connecter les prochaines fois.')}</p>` : ''}
      <div class="field"><label for="rs-p">${t('Nouveau mot de passe')}</label><input id="rs-p" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="rs-p2">${t('Confirmer')}</label><input id="rs-p2" type="password" autocomplete="new-password"></div>
      <p class="err" id="rs-err" hidden></p><button class="btn solid" type="submit">${t('Enregistrer')}</button></form>`;
  }
  body.innerHTML = head + `<div class="auth">${mode === 'login' || mode === 'signup' ? tabs : ''}${form}</div>`;
  const $ = (id) => body.querySelector('#' + id);
  const fail = (id, msg) => { const e = $(id); e.textContent = msg; e.hidden = false; };
  const done = (html) => { body.querySelector('.auth form').innerHTML = `<div class="ok">${html}</div>`; };
  body.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => renderAuth(body, supabase, { mode: b.dataset.mode, toast })));

  if (mode === 'login') {
    $('au-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('au-e').value.trim(), password = $('au-p').value;
      if (!emailOk(email) || !password) return fail('au-err', t('Indiquez votre adresse et votre mot de passe.'));
      $('au-err').hidden = true;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) fail('au-err', /confirm/i.test(error.message) ? t('Confirmez d’abord votre adresse avec le lien reçu par courriel.') : t('Adresse ou mot de passe incorrect.'));
    });
    $('au-forgot').onclick = () => renderAuth(body, supabase, { mode: 'forgot', toast });
    $('au-magic').onclick = async () => {
      const email = $('au-e').value.trim();
      if (!emailOk(email)) return fail('au-err', t('Indiquez d’abord votre adresse courriel.'));
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: false } });
      if (error) return fail('au-err', t('Envoi impossible. Vérifiez l’adresse ou créez un compte.'));
      done(`<b>${t('Lien envoyé à {email}.', { email: esc(email) })}</b><br>${t('Ouvrez-le sur cet appareil pour accéder à votre espace.')}`);
    };
  }

  if (mode === 'signup') {
    const kindSync = () => {
      const owner = $('su-o').checked;
      $('su-dates-f').hidden = owner;
      $('su-pr-l').textContent = owner ? t('Votre bien') : t('Logement réservé');
      $('su-pr').placeholder = owner ? t('ex. T3 de 60 m², résidence Le Belvédère') : t('ex. Chalet Les Mélèzes');
    };
    body.querySelectorAll('[name="su-kind"]').forEach((r) => (r.onchange = kindSync));
    $('su-p').oninput = () => { const v = $('su-p').value; const sc = Math.min(4, (v.length >= 8) + (v.length >= 12) + /[A-Z]/.test(v) + /[^A-Za-z]/.test(v)); $('su-meter').style.width = sc * 25 + '%'; };
    $('au-signup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fn = $('su-fn').value.trim(), ln = $('su-ln').value.trim(), email = $('su-e').value.trim(), phone = $('su-ph').value.trim();
      const p = $('su-p').value, p2 = $('su-p2').value, owner = $('su-o').checked, dates = $('su-dates');
      if (!fn || !ln) return fail('su-err', t('Indiquez votre prénom et votre nom.'));
      if (!emailOk(email)) return fail('su-err', t('Indiquez une adresse courriel valide.'));
      if (p.length < 8) return fail('su-err', t('Choisissez un mot de passe d’au moins 8 caractères.'));
      if (p !== p2) return fail('su-err', t('Les deux mots de passe ne sont pas identiques.'));
      if (!$('su-ok').checked) return fail('su-err', t('Cochez la case pour accepter la conservation de vos informations.'));
      $('su-err').hidden = true;
      const btn = body.querySelector('#au-signup button[type="submit"]'); btn.disabled = true; btn.textContent = t('Création…');
      const { data, error } = await supabase.auth.signUp({ email, password: p, options: { emailRedirectTo: redirect(), data: {
        full_name: `${fn} ${ln}`, phone, kind: owner ? 'proprietaire' : 'voyageur', place: $('su-pl').value,
        property: $('su-pr').value.trim(), stay_from: owner ? '' : dates.dataset.from || '', stay_to: owner ? '' : dates.dataset.to || '' } } });
      btn.disabled = false; btn.textContent = t('Créer mon compte');
      if (error) return fail('su-err', /registered|exists/i.test(error.message) ? t('Un compte existe déjà avec cette adresse. Connectez-vous.') : t('Création impossible : ') + error.message);
      if (!data.session) done(`<b>${t('Compte créé, plus qu’une étape.')}</b><br>${t('Nous avons envoyé un lien de confirmation à {email}. Cliquez dessus pour ouvrir votre espace.', { email: '<b>' + esc(email) + '</b>' })}`);
      else toast && toast(t('Bienvenue {name} !', { name: fn }));
    });
  }

  if (mode === 'forgot') {
    $('au-forgotf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('fg-e').value.trim();
      if (!emailOk(email)) return fail('fg-err', t('Indiquez une adresse courriel valide.'));
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect() });
      done(`<b>${t('C’est envoyé.')}</b><br>${t('Si un compte existe pour {email}, vous allez recevoir un lien pour choisir un nouveau mot de passe.', { email: esc(email) })}`);
    });
  }

  if (mode === 'reset') {
    $('au-reset').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = $('rs-p').value, p2 = $('rs-p2').value;
      if (p.length < 8) return fail('rs-err', t('Au moins 8 caractères.'));
      if (p !== p2) return fail('rs-err', t('Les deux mots de passe ne sont pas identiques.'));
      const { error } = await supabase.auth.updateUser({ password: p, data: { needs_password: false } });
      if (error) return fail('rs-err', t('Enregistrement impossible : ') + error.message);
      toast && toast('Mot de passe enregistré');
      location.hash = 'connexion'; window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }
}
