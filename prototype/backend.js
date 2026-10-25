/* ---------- partner login, leads and saved quotes (Postgres via Supabase) ----------
 * Switched off while BACKEND.url is empty: the site then works exactly as before (no login, nothing stored).
 * Who may see or change what is decided by the database rules (db/migrations), not here: this file is only the screen.
 * Staff (seller, dealer, superdealer, superadmin) log in to open Pro; the public request form also stores a lead.
 */
(() => {
  // Supabase project URL and the publishable key (Project Settings → API). Both are safe in the page: RLS guards the data.
  const BACKEND = { url: 'https://zypujyrvbegilvtvqras.supabase.co', anonKey: 'sb_publishable_1jTysmz6_Tz0zveMQN5GaQ_Pb8dHTL9' };
  if (!BACKEND.url || !BACKEND.anonKey) return;
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.js';
  const STAGES = { new: 'Новый', contacted: 'Связался', visit_agreed: 'Договорились о выезде', consultation: 'Консультация', measured: 'Замер', quote_issued: 'КП выдано', negotiation: 'Предложение / переговоры', won: 'Заказ', lost: 'Отказ' };
  const ROLES = { client: 'клиент', seller: 'продавец', dealer: 'дилер', superdealer: 'супердилер', superadmin: 'суперадмин' };
  const STAFF = ['seller', 'dealer', 'superdealer', 'superadmin'];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const eur = (n) => Math.round(Number(n) || 0).toLocaleString('de-AT') + ' €';
  const day = (t) => (t ? new Date(t).toLocaleDateString('de-AT') : '');
  let sb = null, me = null, staff = [], leads = [], tab = 'mine', open = null, events = {}, unread = 0, currentLead = null;

  const ready = new Promise((res) => {
    const s = document.createElement('script'); s.src = SDK; s.async = true;
    s.onload = () => { sb = window.supabase.createClient(BACKEND.url, BACKEND.anonKey); res(true); };
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  const fail = (e) => { (window.DBApp ? window.DBApp.toast : alert)(humanError(e)); };
  function humanError(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    if (/Invalid login/i.test(m)) return 'Неверный e-mail или пароль';
    if (/QUOTE_LIMIT/.test(m)) return 'Можно сохранить не больше 3 расчётов';
    if (/DISCOUNT_LIMIT/.test(m)) return 'Скидка выше вашего лимита';
    if (/COMMENT_REQUIRED/.test(m)) return 'Нужен комментарий';
    if (/lost_needs_reason/.test(m)) return 'Для отказа нужна причина';
    if (/FORBIDDEN|permission denied/.test(m)) return 'Нет прав на это действие';
    return m || 'Ошибка';
  }

  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; return; }
    const { data, error } = await sb.from('profiles').select('id, role, full_name, email, org_id, discount_limit').eq('id', session.user.id).single();
    me = error ? null : data;
  }
  const isStaff = () => !!me && STAFF.includes(me.role);
  const seesAll = () => !!me && (me.role === 'superadmin' || me.role === 'superdealer');

  /* ---------- login card (over the page) ---------- */
  function gate() {
    if ($('bk-login')) return;
    const d = document.createElement('div'); d.id = 'bk-login';
    d.innerHTML = `<form class="card"><h2>Вход для партнёров</h2>
      <label>E-mail<input type="email" name="email" autocomplete="username" required></label>
      <label>Пароль<input type="password" name="password" autocomplete="current-password" required></label>
      <div class="msg" aria-live="polite"></div>
      <button type="submit" class="go">Войти</button>
      <div class="row"><button type="button" data-reset="1">Забыли пароль?</button><button type="button" data-close="1">← К конфигуратору</button></div>
      <p class="note">Доступ для дилеров и продавцов выдаёт D&amp;B Solutions по запросу на e-mail.</p></form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form'), msg = d.querySelector('.msg');
    f.onsubmit = async (e) => {
      e.preventDefault(); msg.textContent = '…';
      if (!(await ready)) { msg.textContent = 'Сервер недоступен'; return; }
      const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
      if (error) { msg.textContent = humanError(error); return; }
      await loadMe();
      if (!isStaff()) { msg.textContent = 'У этой учётной записи нет доступа к Pro'; await sb.auth.signOut(); me = null; return; }
      d.remove(); window.DBApp.setMode('pro'); refresh();
    };
    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) d.remove();
      if (e.target.closest('[data-reset]')) {
        const em = f.email.value.trim(); if (!em) { msg.textContent = 'Введите e-mail'; return; }
        await ready; const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname + '?pro' });
        msg.textContent = error ? humanError(error) : 'Ссылка для нового пароля отправлена на e-mail';
      }
    });
    setTimeout(() => f.email.focus(), 0);
  }

  /* ---------- the partner block at the top of the Pro panel ---------- */
  function box() {
    let b = $('bk-pro');
    if (!b) { b = document.createElement('section'); b.id = 'bk-pro'; b.className = 'pro-only'; document.querySelector('.app > aside.panel').prepend(b); b.addEventListener('click', onClick); b.addEventListener('change', onChange); }
    return b;
  }
  async function refresh() {
    if (!isStaff()) return;
    const [l, s, n] = await Promise.all([
      sb.from('lead_board').select('*').order('last_activity_at', { ascending: false }).limit(200),
      sb.from('profiles').select('id, full_name, email, role, org_id').in('role', STAFF),
      sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false),
    ]);
    if (l.error) return fail(l.error);
    leads = l.data || []; staff = s.data || []; unread = n.count || 0;
    render();
  }
  const name = (p) => (p ? p.full_name || p.email : '');
  function tabs() {
    return seesAll()
      ? [['mine', 'Все'], ['free', 'Без ответственного'], ['stale', 'Без движения 7 дн.']]
      : [['mine', 'Мои'], ['given', 'От D&B']];
  }
  function visible() {
    if (tab === 'free') return leads.filter((x) => !x.assigned_to);
    if (tab === 'stale') return leads.filter((x) => x.stale);
    if (tab === 'given') return leads.filter((x) => x.created_by !== me.id);
    return seesAll() ? leads : leads.filter((x) => x.created_by === me.id);
  }
  function render() {
    const b = box();
    if (!isStaff()) { b.innerHTML = ''; return; }
    const list = visible();
    let h = `<div class="bk-me"><b>${esc(name(me))}</b> · ${ROLES[me.role]}${me.discount_limit > 0 ? ` · скидка до ${me.discount_limit} %` : ''}${unread ? ` · <span class="bk-n">${unread} новых</span>` : ''}<button type="button" data-out="1">Выйти</button></div>`;
    h += `<div class="bk-save"><button type="button" class="go" data-save="1">${currentLead ? 'Сохранить КП к лиду' : 'Сохранить КП'}</button>${currentLead ? `<span>лид: ${esc(currentLead.contact_name || '—')} <button type="button" data-unlink="1">×</button></span>` : ''}</div>`;
    h += `<div class="bk-tabs">${tabs().map(([k, t]) => `<button type="button" data-tab="${k}" aria-pressed="${tab === k}">${t}</button>`).join('')}</div>`;
    h += list.length ? list.map(card).join('') : '<p class="bk-empty">Пока пусто</p>';
    b.innerHTML = h;
  }
  function card(x) {
    const opened = open === x.id;
    let h = `<div class="bk-lead${x.stale ? ' stale' : ''}" data-id="${x.id}"><button type="button" class="hd" data-open="${x.id}">
      <span><b>${esc(x.contact_name || '—')}</b> ${esc(x.phone || '')}<small>${esc(x.object_address || x.postcode || '')}</small></span>
      <span class="st">${STAGES[x.stage]}${x.stale ? ' · 7+ дн.' : ''}<small>${x.last_quote ? esc(x.last_quote) + ' · ' + eur(x.last_total_net) : ''}</small></span></button>`;
    if (opened) {
      h += `<div class="bd"><label>Стадия<select data-stage="${x.id}">${Object.entries(STAGES).map(([k, t]) => `<option value="${k}" ${k === x.stage ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
      h += `<div class="bk-row">Ответственный: <b>${esc(x.assignee_name || '—')}</b>${x.assignee_org ? ' · ' + esc(x.assignee_org) : ''}</div>`;
      const pick = (attr, roles) => `<select ${attr}="${x.id}"><option value="">${seesAll() ? 'Назначить…' : 'Передать дилеру…'}</option>${staff.filter((p) => roles.includes(p.role) && p.id !== x.assigned_to).map((p) => `<option value="${p.id}">${esc(name(p))} · ${ROLES[p.role]}</option>`).join('')}</select>`;
      if (seesAll()) h += pick('data-assign', ['seller', 'dealer']);
      else if (me.role === 'seller' && x.assigned_to === me.id) h += pick('data-transfer', ['dealer']);
      h += `<div class="bk-row"><input type="text" placeholder="Комментарий" data-cm="${x.id}"><button type="button" data-comment="${x.id}">Добавить</button></div>`;
      h += `<div class="bk-row"><button type="button" data-load="${x.id}">Открыть последнее КП</button><button type="button" data-link="${x.id}">Новое КП к этому лиду</button></div>`;
      if (x.utm && Object.keys(x.utm).length) h += `<div class="bk-row muted">Источник: ${esc(Object.values(x.utm).join(' / '))}</div>`;
      h += `<ol class="bk-hist">${(events[x.id] || []).map((e) => `<li>${day(e.at)} · ${esc(evText(e))}</li>`).join('')}</ol></div>`;
    }
    return h + '</div>';
  }
  function evText(e) {
    const who = name(staff.find((p) => p.id === e.to_user));
    return { created: 'создан', assigned: 'назначен: ' + who, transferred: 'передан: ' + who, stage: (STAGES[e.from_stage] || '') + ' → ' + STAGES[e.to_stage], comment: 'комментарий', quote: 'КП ' }[e.kind] + (e.comment ? ' — ' + e.comment : '');
  }
  const findLead = (id) => leads.find((x) => x.id === id);

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.out) { await sb.auth.signOut(); me = null; render(); window.DBApp.setMode('cust'); return; }
    if (d.tab) { tab = d.tab; render(); return; }
    if (d.open) {
      open = open === d.open ? null : d.open;
      if (open) { const r = await sb.from('lead_events').select('*').eq('lead_id', open).order('at'); events[open] = r.data || []; }
      render(); return;
    }
    if (d.comment) { const i = box().querySelector(`[data-cm="${d.comment}"]`); const r = await sb.rpc('comment_lead', { p_lead: d.comment, p_comment: i.value }); if (r.error) return fail(r.error); return reopen(d.comment); }
    if (d.load) { const r = await sb.from('quotes').select('number, config').eq('lead_id', d.load).order('created_at', { ascending: false }).limit(1); if (r.error) return fail(r.error); if (!r.data.length) return fail('У лида ещё нет КП'); window.DBApp.restore(r.data[0].config); currentLead = findLead(d.load); render(); window.DBApp.toast('Открыто КП ' + r.data[0].number); return; }
    if (d.link) { currentLead = findLead(d.link); render(); window.DBApp.toast('Следующее сохранённое КП попадёт к этому лиду'); return; }
    if (d.unlink) { currentLead = null; render(); return; }
    if (d.save) return saveQuote();
  }
  async function onChange(e) {
    const el = e.target, d = el.dataset;
    if (d.stage) {
      const stage = el.value; let lost_reason = null;
      if (stage === 'lost') { lost_reason = prompt('Причина отказа'); if (!lost_reason || !lost_reason.trim()) { el.value = findLead(d.stage).stage; return fail('Для отказа нужна причина'); } }
      const r = await sb.from('leads').update(stage === 'lost' ? { stage, lost_reason } : { stage }).eq('id', d.stage);
      if (r.error) return fail(r.error);
      return reopen(d.stage);
    }
    if (d.assign && el.value) { const c = prompt('Комментарий для ответственного (можно пусто)') || null; const r = await sb.rpc('assign_lead', { p_lead: d.assign, p_to: el.value, p_comment: c }); if (r.error) return fail(r.error); return reopen(d.assign); }
    if (d.transfer && el.value) { const c = prompt('Комментарий для дилера (обязательно)'); const r = await sb.rpc('transfer_lead', { p_lead: d.transfer, p_to: el.value, p_comment: c || '' }); if (r.error) return fail(r.error); return reopen(d.transfer); }
  }
  async function reopen(id) { await refresh(); open = id; const r = await sb.from('lead_events').select('*').eq('lead_id', id).order('at'); events[id] = r.data || []; render(); }

  /** the current configuration as a quote: to the opened lead, or a new lead with the customer's data */
  async function saveQuote() {
    const A = window.DBApp; let leadId = currentLead && currentLead.id;
    if (!leadId) {
      const contact_name = prompt('Клиент: имя и фамилия'); if (contact_name === null) return;
      const phone = prompt('Телефон клиента') || null, object_address = prompt('Адрес объекта') || null;
      const r = await sb.from('leads').insert({ created_by: me.id, source: me.role === 'dealer' ? 'dealer' : me.role === 'seller' ? 'seller' : 'office', contact_name, phone, object_address, postcode: ((object_address || '').match(/\b\d{4}\b/) || [null])[0] }).select('id').single();
      if (r.error) return fail(r.error);
      leadId = r.data.id;
    }
    const q = await sb.from('quotes').insert({ owner: me.id, lead_id: leadId, catalog: A.catalog, config: A.snapshot(), lines: A.lines(), total_net: Math.round(A.totalNet() * 100) / 100 }).select('number').single();
    if (q.error) return fail(q.error);
    A.toast('Сохранено: КП ' + q.data.number); currentLead = null; await refresh();
  }

  /** the public request form: stored as a lead with its quote (the office board shows it at once) */
  async function submitRequest(contact, journey) {
    if (!(await ready)) return null;
    const A = window.DBApp;
    const r = await sb.rpc('submit_request', { p_contact: contact, p_quote: { catalog: A.catalog, config: A.snapshot(), lines: A.lines(), total_net: Math.round(A.totalNet() * 100) / 100 }, p_utm: A.utm(), p_journey: journey });
    return r.error ? null : r.data;
  }

  window.Backend = {
    allowPro: () => isStaff(),
    gate,
    submitRequest,
  };
  // a returning partner is still logged in: open Pro straight away when it was asked for
  ready.then(async (ok) => {
    if (!ok) return;
    await loadMe();
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { me = null; render(); } });
    if (isStaff()) { refresh(); if (/[?&]pro\b/.test(location.search)) { $('bk-login') && $('bk-login').remove(); window.DBApp.setMode('pro'); } }
  });
})();
