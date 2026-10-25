/* ---------- configurator ⇄ cabinet bridge (Supabase) ----------
 * The dealer cabinet is a separate page (cabinet.html) that shares this Supabase session.
 * Here on the configurator we only: brand the PDF for the logged-in dealer, route staff to the cabinet,
 * run the "modeling" flow (build a pergola, save it as a quote to a lead), and store public requests as leads.
 * Switched off while BACKEND.url is empty: the site then works exactly as before.
 */
(() => {
  const BACKEND = { url: 'https://zypujyrvbegilvtvqras.supabase.co', anonKey: 'sb_publishable_1jTysmz6_Tz0zveMQN5GaQ_Pb8dHTL9', cabinet: 'cabinet.html' };
  if (!BACKEND.url || !BACKEND.anonKey) return;
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.js';
  const STAFF = ['seller', 'dealer', 'superdealer', 'superadmin'];
  // Bot protection: a public request is only accepted with a valid Cloudflare Turnstile token,
  // checked server-side by the submit-request Edge Function. Public site key for the "D&B configurator"
  // widget (hostname romanishinn.github.io); the matching secret lives in the function's TURNSTILE_SECRET env.
  const TURNSTILE = { siteKey: '0x4AAAAAAFlRMtBteuJ_-n1B', api: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit' };
  const SUBMIT_FN = BACKEND.url + '/functions/v1/submit-request';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let sb = null, me = null, modeling = false, handoff = null;
  let tsReady = null, tsWidget = null, tsResolve = null;

  const ready = new Promise((res) => {
    const s = document.createElement('script'); s.src = SDK; s.async = true;
    s.onload = () => { sb = window.supabase.createClient(BACKEND.url, BACKEND.anonKey); res(true); };
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  function humanError(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    if (/Invalid login/i.test(m)) return 'Неверный e-mail или пароль';
    if (/QUOTE_LIMIT/.test(m)) return 'Можно сохранить не больше 3 расчётов';
    if (/DISCOUNT_LIMIT/.test(m)) return 'Скидка выше лимита';
    if (/FORBIDDEN|permission denied/.test(m)) return 'Нет прав на это действие';
    return m || 'Ошибка';
  }
  const toast = (m) => (window.DBApp ? window.DBApp.toast(m) : alert(m));
  const isStaff = () => !!me && STAFF.includes(me.role);

  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; return; }
    const { data } = await sb.from('profiles').select('id, role, full_name, email, org_id, discount_limit').eq('id', session.user.id).single();
    me = data || null;
    if (me && me.role === 'dealer' && me.org_id) await loadBrand();
  }
  async function loadBrand() {
    const { data } = await sb.from('organizations').select('name, company, logo_url').eq('id', me.org_id).single();
    if (!data) return;
    const c = data.company || {};
    window.DBBrand = { name: data.name, email: c.email || '', phone: c.phone || '', web: c.web || c.address || '', logo: data.logo_url || '' };
    if (window.DBApp && window.DBApp.rerenderQuote) window.DBApp.rerenderQuote();
  }

  /* ---------- login card (used when a non-logged-in person asks for Pro / cabinet) ---------- */
  function gate(after) {
    if ($('bk-login')) return;
    const d = document.createElement('div'); d.id = 'bk-login';
    d.innerHTML = `<form class="card"><h2>Вход для партнёров</h2>
      <label>E-mail<input type="email" name="email" autocomplete="username" required></label>
      <label>Пароль<input type="password" name="password" autocomplete="current-password" required></label>
      <div class="msg" aria-live="polite"></div>
      <button type="submit" class="go">Войти</button>
      <div class="row"><button type="button" data-reset="1">Забыли пароль?</button><button type="button" data-close="1">← К конфигуратору</button></div>
      <p class="note">Доступ выдаёт D&amp;B Solutions по запросу на e-mail.</p></form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form'), msg = d.querySelector('.msg');
    f.onsubmit = async (e) => {
      e.preventDefault(); msg.textContent = '…';
      if (!(await ready)) { msg.textContent = 'Сервер недоступен'; return; }
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) { msg.textContent = humanError(error); return; }
      await loadMe();
      if (!isStaff()) { msg.textContent = 'Нет доступа к кабинету'; await sb.auth.signOut(); me = null; return; }
      d.remove(); (after || toCabinet)();
    };
    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) d.remove();
      if (e.target.closest('[data-reset]')) {
        const em = f.email.value.trim(); if (!em) { msg.textContent = 'Введите e-mail'; return; }
        await ready; const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname + BACKEND.cabinet });
        msg.textContent = error ? humanError(error) : 'Ссылка для нового пароля отправлена';
      }
    });
    setTimeout(() => f.email.focus(), 0);
  }
  const toCabinet = () => { location.href = BACKEND.cabinet; };

  /* ---------- modeling: a top bar to save the built pergola as a quote to a lead ---------- */
  function modelBar() {
    let bar = $('bk-modelbar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'bk-modelbar'; document.body.appendChild(bar); }
    const leadName = handoff && handoff.leadName ? handoff.leadName : null;
    bar.innerHTML = `<button type="button" class="b" data-cab="1">← Кабинет</button>
      <span class="lead">${leadName ? 'Лид: ' + esc(leadName) : 'Новый расчёт'}</span>
      <button type="button" class="b primary" data-savq="1">Сохранить КП</button>`;
    bar.querySelector('[data-cab]').onclick = toCabinet;
    bar.querySelector('[data-savq]').onclick = saveQuote;
  }
  async function saveQuote() {
    const A = window.DBApp; if (!A) return;
    let leadId = handoff && handoff.leadId;
    if (!leadId) {
      const contact_name = prompt('Клиент: имя и фамилия'); if (contact_name === null) return;
      const phone = prompt('Телефон') || null, object_address = prompt('Адрес объекта') || null;
      const r = await sb.from('leads').insert({ created_by: me.id, source: me.role === 'dealer' ? 'dealer' : me.role === 'seller' ? 'seller' : 'office', contact_name, phone, object_address, postcode: ((object_address || '').match(/\b\d{4}\b/) || [null])[0] }).select('id').single();
      if (r.error) return toast(humanError(r.error));
      leadId = r.data.id;
    }
    const q = await sb.from('quotes').insert({ owner: me.id, lead_id: leadId, catalog: A.catalog, config: A.snapshot(), lines: A.lines(), total_net: Math.round(A.totalNet() * 100) / 100 }).select('number').single();
    if (q.error) return toast(humanError(q.error));
    try { localStorage.removeItem('db.handoff'); } catch (e) {}
    toast('Сохранено: КП ' + q.data.number);
    setTimeout(toCabinet, 700);
  }
  function enterModeling() {
    modeling = true;
    const l = $('bk-login'); if (l) l.remove();
    try { const h = JSON.parse(localStorage.getItem('db.handoff') || 'null'); if (h && Date.now() - h.ts < 6e5) handoff = h; } catch (e) {}
    window.DBApp.setMode('pro');
    if (handoff && handoff.config) { try { window.DBApp.restore(handoff.config); } catch (e) {} }
    modelBar();
  }

  /* ---------- Cloudflare Turnstile: a silent "are you human" token for the public request ---------- */
  function loadTurnstile() {
    if (tsReady) return tsReady;
    tsReady = new Promise((res) => {
      const s = document.createElement('script'); s.src = TURNSTILE.api; s.async = true; s.defer = true;
      s.onload = () => res(true); s.onerror = () => res(false);
      document.head.appendChild(s);
    });
    return tsReady;
  }
  // Resolves with a fresh single-use token; the widget stays invisible unless Cloudflare decides a
  // challenge is needed (then a small dialog appears — that is the "only humans" case).
  async function turnstileToken() {
    if (!(await loadTurnstile()) || !window.turnstile) return '';
    if (tsWidget == null) {
      let host = $('bk-turnstile');
      if (!host) { host = document.createElement('div'); host.id = 'bk-turnstile'; document.body.appendChild(host); }
      try {
        tsWidget = window.turnstile.render(host, {
          sitekey: TURNSTILE.siteKey, execution: 'execute', appearance: 'interaction-only',
          callback: (tok) => { if (tsResolve) { const r = tsResolve; tsResolve = null; r(tok); } },
          'error-callback': () => { if (tsResolve) { const r = tsResolve; tsResolve = null; r(''); } },
          'timeout-callback': () => { if (tsResolve) { const r = tsResolve; tsResolve = null; r(''); } },
        });
      } catch (e) { return ''; }
    }
    return new Promise((resolve) => {
      tsResolve = resolve;
      try { window.turnstile.reset(tsWidget); } catch (e) {}
      try { window.turnstile.execute(tsWidget); } catch (e) { tsResolve = null; resolve(''); }
      setTimeout(() => { if (tsResolve === resolve) { tsResolve = null; resolve(''); } }, 12000);
    });
  }

  /* ---------- public request form: store as a lead with its quote (via the Edge Function) ---------- */
  async function submitRequest(contact, journey) {
    const A = window.DBApp; if (!A) return null;
    const quote = { catalog: A.catalog, config: A.snapshot(), lines: A.lines(), total_net: Math.round(A.totalNet() * 100) / 100 };
    const token = await turnstileToken();
    try {
      const res = await fetch(SUBMIT_FN, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: BACKEND.anonKey, Authorization: 'Bearer ' + BACKEND.anonKey },
        body: JSON.stringify({ token, contact, quote, utm: A.utm(), journey }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.number ? data.number : null;
    } catch (e) { return null; }
  }

  window.Backend = {
    submitRequest,
    // intercept the funnel's "Pro" button: staff → cabinet, others → login. 'cust' is left to the funnel.
    onMode: (m) => {
      if (m !== 'pro') return false;
      if (modeling) return false; // already modeling on this page: let the funnel show the Pro panel
      if (isStaff()) { toCabinet(); return true; }
      gate(toCabinet); return true;
    },
    allowPro: () => isStaff() || modeling,
    gate: () => gate(toCabinet),
  };

  ready.then(async (ok) => {
    if (!ok) return;
    await loadMe();
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { me = null; window.DBBrand = null; } });
    const params = new URLSearchParams(location.search);
    if (params.has('model')) {
      if (isStaff()) enterModeling();
      else gate(() => { location.href = location.pathname + '?pro&model'; });
    } else if (params.has('pro')) {
      if (isStaff()) toCabinet(); else gate(toCabinet);
    }
  });
})();
