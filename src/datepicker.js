// Calendrier maison : remplace chaque <input type="date"> par un bouton qui ouvre un calendrier,
// et chaque <input data-cal="range"> par un choix « arrivée → départ ».
// L'input d'origine reste dans le formulaire (caché) et garde la valeur : AAAA-MM-JJ pour une date,
// « du … au … » pour une période (data-from / data-to gardent les dates ISO).
(function () {
  if (window.__altioraCal) return; window.__altioraCal = true;
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const JOURS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'];
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const human = (s) => { const d = parse(s); return d ? d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : ''; };
  const short = (s) => { const d = parse(s); return d ? `${d.getDate()} ${MOIS[d.getMonth()]}` : ''; };
  const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };

  const css = document.createElement('style');
  css.textContent = `
.cal-wrap{position:relative;display:block;min-width:0}
.cal-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;font:15px var(--body);color:var(--ink);background:var(--snow);border:1px solid var(--line);padding:12px;text-align:left;cursor:pointer}
.cal-btn:hover,.cal-btn[aria-expanded="true"]{border-color:var(--ember)}
.cal-btn .ph{color:var(--muted)}
.cal-btn svg{flex:none;width:18px;height:18px;stroke:var(--muted);fill:none;stroke-width:1.5}
.cal-pop{position:absolute;z-index:30;top:calc(100% + 6px);left:0;width:300px;max-width:calc(100vw - 40px);background:var(--paper);border:1px solid var(--ink);box-shadow:0 18px 40px -20px rgba(23,18,14,.45);padding:16px}
.cal-pop.up{top:auto;bottom:calc(100% + 6px)}
.cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.cal-head b{font:500 18px var(--display);text-transform:capitalize}
.cal-nav{background:none;border:1px solid var(--line);width:32px;height:32px;cursor:pointer;color:var(--ink);font-size:16px;line-height:1}
.cal-nav:hover{border-color:var(--ink)}
.cal-nav:disabled{opacity:.3;cursor:default}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.cal-grid .dn{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-align:center;padding:4px 0}
.cal-day{aspect-ratio:1;max-width:100%;border:0;background:none;color:var(--ink);font:14px var(--body);cursor:pointer;font-variant-numeric:tabular-nums}
.cal-day:hover:not(:disabled){outline:1px solid var(--ink);outline-offset:-1px}
.cal-day:disabled{color:var(--line);cursor:default}
.cal-day.today{font-weight:700;text-decoration:underline;text-decoration-color:var(--ember);text-underline-offset:3px}
.cal-day.in{background:color-mix(in srgb,var(--ember) 18%,transparent)}
.cal-day.sel,.cal-day.edge{background:var(--ink);color:var(--snow)}
.cal-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;font-size:13px;color:var(--muted)}
.cal-foot button{background:none;border:0;font:500 12px var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--ink);text-decoration:underline;cursor:pointer;padding:0}
.ptable .cal-btn{padding:6px 8px;font-size:14px;min-width:150px}
`;
  document.head.appendChild(css);

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
  let open = null; // { close }

  function enhance(input) {
    if (input.dataset.calDone) return;
    input.dataset.calDone = '1';
    const range = input.dataset.cal === 'range';
    const allowPast = input.hasAttribute('data-cal-past') || input.closest('.ptable');
    const placeholder = input.getAttribute('placeholder') || (range ? 'Choisir les dates' : 'Choisir une date');
    const wrap = document.createElement('span'); wrap.className = 'cal-wrap';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cal-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    if (input.id) { btn.id = input.id + '-cal'; const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`); if (lab) lab.htmlFor = btn.id; }
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(btn); wrap.appendChild(input);
    input.dataset.calType = input.type; input.type = 'hidden';
    if (input.getAttribute('aria-label')) btn.setAttribute('aria-label', input.getAttribute('aria-label'));

    const label = () => {
      let t = '';
      if (range) { const f = input.dataset.from, to = input.dataset.to; t = f ? (to ? `Du ${short(f)} au ${short(to)}` : `Arrivée le ${short(f)}, choisir le départ`) : ''; }
      else t = human(input.value);
      btn.innerHTML = `<span class="${t ? '' : 'ph'}">${t || placeholder}</span>${ICON}`;
    };
    const write = () => {
      if (range) {
        const f = input.dataset.from, to = input.dataset.to;
        input.value = f && to ? `du ${short(f)} au ${short(to)}` : f ? `à partir du ${short(f)}` : '';
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
      label();
    };
    input.__calRefresh = label;
    label();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (open && open.btn === btn) return open.close();
      if (open) open.close();
      const start = parse(range ? input.dataset.from : input.value) || today();
      let view = new Date(start.getFullYear(), start.getMonth(), 1);
      const pop = document.createElement('div'); pop.className = 'cal-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', range ? 'Choisir les dates' : 'Choisir une date');
      wrap.appendChild(pop); btn.setAttribute('aria-expanded', 'true');
      const r = btn.getBoundingClientRect(); if (r.bottom + 360 > window.innerHeight && r.top > 380) pop.classList.add('up');
      const pr = pop.getBoundingClientRect(); if (pr.right > window.innerWidth - 16) pop.style.left = Math.min(0, window.innerWidth - 16 - pr.right) + 'px';

      function draw(focusIso) {
        const y = view.getFullYear(), m = view.getMonth(), min = allowPast ? null : today();
        const first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
        const f = range ? input.dataset.from : input.value, to = range ? input.dataset.to : '';
        let cells = JOURS.map((j) => `<span class="dn">${j}</span>`).join('') + '<span></span>'.repeat(first);
        for (let d = 1; d <= days; d++) {
          const s = iso(new Date(y, m, d)), dis = min && new Date(y, m, d) < min;
          const cls = ['cal-day', s === iso(today()) ? 'today' : '', !range && s === f ? 'sel' : '', range && (s === f || s === to) ? 'edge' : '', range && f && to && s > f && s < to ? 'in' : ''].join(' ');
          cells += `<button type="button" class="${cls}" data-d="${s}" ${dis ? 'disabled' : ''} aria-label="${human(s)}" ${(!range && s === f) || (range && (s === f || s === to)) ? 'aria-pressed="true"' : ''}>${d}</button>`;
        }
        const prevDis = min && new Date(y, m, 1) <= new Date(min.getFullYear(), min.getMonth(), 1);
        const hint = range ? (!f || to ? 'Choisissez l’arrivée' : 'Choisissez le départ') : '';
        pop.innerHTML = `<div class="cal-head"><button type="button" class="cal-nav" data-nav="-1" aria-label="Mois précédent" ${prevDis ? 'disabled' : ''}>‹</button><b>${MOIS[m]} ${y}</b><button type="button" class="cal-nav" data-nav="1" aria-label="Mois suivant">›</button></div>
          <div class="cal-grid">${cells}</div><div class="cal-foot"><span>${hint}</span>${(range ? f : input.value) ? '<button type="button" data-clear>Effacer</button>' : ''}</div>`;
        const target = pop.querySelector(focusIso ? `[data-d="${focusIso}"]` : '[aria-pressed="true"]') || pop.querySelector('.cal-day:not(:disabled)');
        if (target) target.focus();
      }
      pop.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const nav = ev.target.closest('[data-nav]'), day = ev.target.closest('[data-d]');
        if (nav) { view = new Date(view.getFullYear(), view.getMonth() + Number(nav.dataset.nav), 1); draw(); pop.querySelector(`[data-nav="${nav.dataset.nav}"]`)?.focus(); return; }
        if (ev.target.closest('[data-clear]')) { if (range) { delete input.dataset.from; delete input.dataset.to; } else input.value = ''; write(); draw(); return; }
        if (!day) return;
        const s = day.dataset.d;
        if (!range) { input.value = s; write(); close(); btn.focus(); return; }
        const f = input.dataset.from, to = input.dataset.to;
        if (!f || to || s <= f) { input.dataset.from = s; delete input.dataset.to; write(); draw(s); }
        else { input.dataset.to = s; write(); close(); btn.focus(); }
      });
      pop.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { close(); btn.focus(); return; }
        const cur = document.activeElement?.dataset?.d; if (!cur) return;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[ev.key]; if (!step) return;
        ev.preventDefault(); const d = parse(cur); d.setDate(d.getDate() + step);
        if (d.getMonth() !== view.getMonth()) view = new Date(d.getFullYear(), d.getMonth(), 1);
        draw(iso(d));
      });
      function close() { pop.remove(); btn.setAttribute('aria-expanded', 'false'); open = null; }
      open = { btn, close };
      draw();
    });
  }

  document.addEventListener('click', () => { if (open) open.close(); });
  const scan = (root) => root.querySelectorAll?.('input[type="date"], input[data-cal="range"]').forEach(enhance);
  scan(document);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches?.('input[type="date"], input[data-cal="range"]')) enhance(n); scan(n); } }))).observe(document.documentElement, { childList: true, subtree: true });
  window.altioraCal = { enhance };
})();
