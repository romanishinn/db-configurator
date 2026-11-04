/* ---------- Pro CRM: live layer (Supabase) ----------
 * crm.html is the screen layout; this file makes it work on real data: login, leads, customers, quotes, orders,
 * notifications, settings. Inlined into crm.html by the Pages workflow (placeholder CRM_LIVE).
 * Who sees what is decided by row level security in the database; the page only hides what a role cannot use.
 * Without BACKEND.url the file does nothing and crm.html keeps its demo data (the site works as before).
 * UI language of the live layer: Russian (internal users).
 */
(() => {
  const BACKEND = { url: 'https://zypujyrvbegilvtvqras.supabase.co', anonKey: 'sb_publishable_1jTysmz6_Tz0zveMQN5GaQ_Pb8dHTL9' }; // same project as backend.js (public key)
  const C = window.CRM;
  if (!C || !BACKEND.url || !BACKEND.anonKey) return;
  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.95.0/dist/umd/supabase.js';
  const STAFF = ['seller', 'manager', 'dealer', 'superdealer', 'superadmin', 'architect'];
  const { $, $$, esc } = C;
  document.documentElement.classList.add('live');

  /* ---------- vocabulary ---------- */
  const STAGE_IDX = { new: 0, contacted: 1, processing: 1, visit_agreed: 1, consultation: 1, measured: 1, quote_issued: 2, proposal: 2, negotiation: 3, won: 4, lost: 4 };
  const STAGE_RU = { new: 'Новый', contacted: 'Связались', processing: 'В обработке', visit_agreed: 'Выезд согласован', consultation: 'Консультация', measured: 'Замер сделан', quote_issued: 'КП выдано', proposal: 'Предложение', negotiation: 'Переговоры', won: 'Заказ', lost: 'Отказ' };
  const STEPS = ['Новый', 'В работе', 'Предложение', 'Переговоры', 'Итог'];
  // the button "Перевести →" moves to the first stage of the next column
  const NEXT_STAGE = { 0: 'contacted', 1: 'quote_issued', 2: 'negotiation', 3: 'won' };
  const ORDER_RU = { inbox: 'Входящие', measurement: 'Замер', awaiting_payment: 'Ожидает оплаты', delivery: 'Поставка', in_stock: 'На складе', installation: 'Монтаж', done: 'Выполнено' };
  const ORDER_COL = [['os.inbox', 'inbox'], ['os.measurement', 'measurement'], ['os.payment', 'awaiting_payment'], ['os.delivery', 'delivery'], ['os.instock', 'in_stock'], ['os.installation', 'installation'], ['os.done', 'done']];
  const ROLE_RU = { client: 'клиент', seller: 'продавец', manager: 'менеджер', dealer: 'дилер', superdealer: 'суперДилер', superadmin: 'суперадмин', architect: 'архитектор' };
  const HOT = 20; // ASSUMPTION: a lead with 20+ points (quote 10, stage 5, comment 2 …) is "hot"; the points come from the database
  const SOURCES = ['Звонок', 'Сайт', 'Meta', 'Google', 'Рекомендация', 'Выставка', 'Другое'];
  const WANTS = ['Пергола', 'Боковые системы', 'Стекло', 'Пока не знает'];

  /* ---------- state ---------- */
  let sb = null, me = null, leads = [], orders = [], users = [], groups = [];
  const detail = {};            // lead id -> { events, quotes }
  let chip = 'need', query = '', tab = 'ov', curLid = null, booted = false;

  /* ---------- small helpers ---------- */
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const money = (n) => n == null ? '—' : '€' + Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dmy = (iso) => { if (!iso) return '—'; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const dm = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };
  const hm = (iso) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function ago(iso) {
    const m = Math.floor((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return 'сейчас'; if (m < 60) return m + ' мин назад';
    const h = Math.floor(m / 60); if (h < 24) return h + ' ч назад';
    return Math.floor(h / 24) + ' дн назад';
  }
  const days = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5));
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : d; };
  const userName = (id) => { const u = users.find((x) => x.id === id); return u ? (u.full_name || u.email || 'Сотрудник') : (me && id === me.id ? me.full_name || 'Вы' : 'Сотрудник'); };
  const sees = () => !!me && (me.role === 'superadmin' || me.role === 'superdealer');
  const isAdmin = () => !!me && me.role === 'superadmin';
  const isArch = () => !!me && me.role === 'architect';
  function humanError(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    if (/Invalid login/i.test(m)) return 'Неверный e-mail или пароль';
    if (/COMMENT_REQUIRED/.test(m)) return 'Нужен комментарий';
    if (/lost_needs_reason/.test(m)) return 'Укажите причину отказа';
    if (/BAD_ASSIGNEE/.test(m)) return 'Этому человеку лид передать нельзя';
    if (/FORBIDDEN|permission denied|row-level security/i.test(m)) return 'Нет прав на это действие';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Нет связи с сервером';
    return m || 'Ошибка';
  }

  /* ---------- toast + dialog ---------- */
  function toast(msg, bad, action) {
    let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div'); t.className = 'toast2' + (bad ? ' bad' : ''); t.textContent = msg;
    if (action) { const b = document.createElement('button'); b.className = 'btn sm'; b.style.marginLeft = '10px'; b.textContent = action.label; b.onclick = () => { action.run(); t.remove(); }; t.appendChild(b); }
    box.appendChild(t); setTimeout(() => t.remove(), action ? 9000 : bad ? 6000 : 3200);
  }
  // dialog({title, sub, body(html), foot:[{label,primary,run(close,root)}], onOpen(root)})
  function dialog(o) {
    const back = document.createElement('div'); back.className = 'dlgback';
    back.innerHTML = '<div class="dlg" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><h3>' + esc(o.title) + '</h3>' + (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + '<div class="body">' + (o.body || '') + '</div><div class="foot"></div></div>';
    document.body.appendChild(back);
    const prevFocus = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) {} };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    const foot = back.querySelector('.foot');
    (o.foot || [{ label: 'Закрыть', run: (c) => c() }]).forEach((f) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (f.primary ? ' primary' : ''); b.textContent = f.label;
      b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await f.run(close, back); } finally { b.disabled = false; } };
      foot.appendChild(b);
    });
    if (o.onOpen) o.onOpen(back, close);
    const first = back.querySelector('[autofocus],input,textarea,select'); if (first) setTimeout(() => first.focus(), 30);
    return { close, root: back };
  }
  const val = (root, name) => (root.querySelector('[name="' + name + '"]') || {}).value || '';

  /* ---------- Supabase ---------- */
  const ready = new Promise((res) => {
    const s = document.createElement('script'); s.src = SDK; s.async = true;
    s.onload = () => { sb = window.supabase.createClient(BACKEND.url, BACKEND.anonKey); res(true); };
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  async function run(q) { const r = await q; if (r.error) throw r.error; return r.data; }

  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data } = await sb.from('profiles').select('id, role, full_name, email, org_id, discount_limit').eq('id', session.user.id).single();
    return data || null;
  }
  const loadLeads = async () => { leads = await run(sb.from('lead_board').select('*').order('last_activity_at', { ascending: false }).limit(2000)); };
  const loadOrders = async () => { try { orders = await run(sb.from('orders').select('id, stage, measured_at, paid, delivery_eta, note, created_at, lead_id, leads(contact_name), quotes(number, total_net)').order('created_at', { ascending: false }).limit(500)); } catch (e) { orders = []; } };
  const loadUsers = async () => { try { users = await run(sb.from('profiles').select('id, role, full_name, email, org_id, discount_limit, active')); } catch (e) { users = []; } };
  let approvals = [];
  const loadApprovals = async () => { try { approvals = await run(sb.from('quote_approvals').select('quote_id, status, created_at, decided_at, comment, quotes(number, total_net, discount, owner, lead_id, leads(contact_name))').order('created_at', { ascending: false }).limit(300)); } catch (e) { approvals = []; } };
  const apprOf = (qid) => approvals.find((a) => a.quote_id === qid);
  const APPR_RU = { pending: ['ждёт утверждения', 'warn'], approved: ['скидка утверждена', 'ok'], rejected: ['скидка отклонена', 'bad'] };
  const apprTag = (qid) => { const a = apprOf(qid); return a ? ' <span class="tag ' + APPR_RU[a.status][1] + '">' + APPR_RU[a.status][0] + '</span>' : ''; };
  const loadGroups = async () => { try { groups = await run(sb.from('discount_groups').select('id, code, title, max_discount').order('title')); } catch (e) { groups = []; } };
  async function loadDetail(lid, force) {
    if (detail[lid] && !force) return detail[lid];
    const [events, quotes] = await Promise.all([
      run(sb.from('lead_events').select('id, at, by, kind, from_stage, to_stage, to_user, comment').eq('lead_id', lid).order('at', { ascending: false })),
      run(sb.from('quotes').select('id, number, created_at, valid_until, total_net, discount, config, revises, owner').eq('lead_id', lid).order('created_at', { ascending: false })),
    ]);
    return (detail[lid] = { events, quotes });
  }

  /* ---------- model ---------- */
  function srcInfo(l) {
    const u = l.utm || {}, raw = String(u.source || '').trim(), low = raw.toLowerCase();
    let kind = 'other', label = raw;
    if (/facebook|instagram|meta|fb\b/.test(low) || u.fbclid) { kind = 'meta'; label = 'Meta'; }
    else if (/google|gclid/.test(low) || u.gclid) { kind = 'google'; label = 'Google'; }
    else if (!raw) { label = { web: 'Сайт', seller: 'Продавец', dealer: 'Дилер', office: 'Офис', client: 'Клиент' }[l.source] || 'Сайт'; kind = l.source === 'web' ? 'web' : 'other'; }
    else if (low === 'сайт') kind = 'web';
    return { kind, label, raw };
  }
  const isOpen = (l) => l.stage !== 'won' && l.stage !== 'lost';
  const overdue = (l) => isOpen(l) && !!l.next_action_at && l.next_action_at < today();
  const dueNow = (l) => isOpen(l) && !!l.next_action_at && l.next_action_at <= today();

  function toDeal(l) {
    const name = l.contact_name || l.phone || l.email || 'Без имени', idx = STAGE_IDX[l.stage] ?? 0, late = overdue(l);
    const sc = l.score || 0;
    return {
      live: true, lid: l.id, raw: l, name, av: initials(name),
      comp: l.assignee_org || '', owner: l.assignee_name || (l.assigned_to ? userName(l.assigned_to) : 'Не назначен'),
      id: l.last_quote ? 'КП ' + l.last_quote : '', score: sc, band: sc >= HOT ? 'hi' : sc >= 8 ? 'mid' : '', hot: sc >= HOT && isOpen(l),
      product: l.object_address || (l.note ? String(l.note).replace(/\s+/g, ' ').slice(0, 48) : '—'),
      dot: late || l.stale ? 'red' : l.stage === 'new' ? 'amber' : isOpen(l) ? 'green' : 'grey',
      statusK: late ? 'Шаг просрочен · ' + (l.next_action || STAGE_RU[l.stage]) : (l.next_action ? l.next_action : STAGE_RU[l.stage]),
      timeK: ago(l.last_activity_at), stage: idx, curDays: days(l.last_activity_at),
      q: { net: l.last_total_net != null ? money(l.last_total_net) : '—' },
    };
  }
  const prio = (l) => overdue(l) ? 0 : dueNow(l) ? 1 : l.stage === 'new' ? 2 : isOpen(l) ? 3 : 4;
  const sortLeads = (arr) => arr.slice().sort((a, b) => prio(a) - prio(b) || new Date(b.last_activity_at) - new Date(a.last_activity_at));

  function buildBoards(deals) {
    const col = (tK, ix) => {
      const list = deals.map((d, di) => ({ d, di })).filter((x) => x.d.stage === ix);
      const sum = list.reduce((a, x) => a + (Number(x.d.raw.last_total_net) || 0), 0);
      return { tK, sum: sum ? money(sum) : '', cards: list.map(({ d, di }) => ({ n: d.name, di, sum: d.q.net, sc: d.score, hot: d.hot, stK: d.raw.stage === 'won' || d.raw.stage === 'lost' ? STAGE_RU[d.raw.stage] : (d.raw.next_action || STAGE_RU[d.raw.stage]), dot: d.dot, days: d.curDays, rot: !!d.raw.stale, cold: false })) };
    };
    const req = [col('st.new', 0), col('st.processing', 1), col('st.proposal', 2), col('st.negotiation', 3), col('st.winlose', 4)];
    const ord = ORDER_COL.map(([tK, st]) => {
      const list = orders.filter((o) => o.stage === st);
      const sum = list.reduce((a, o) => a + (Number(o.quotes && o.quotes.total_net) || 0), 0);
      return { tK, sum: sum ? money(sum) : '', cards: list.map((o) => ({ oid: o.id, nOrd: (o.leads && o.leads.contact_name) || 'Заказ', sum: o.quotes ? money(o.quotes.total_net) : '', stK: o.paid ? 'оплачен' : (o.delivery_eta ? 'поставка ' + dm(o.delivery_eta) : o.measured_at ? 'замер ' + dm(o.measured_at) : ORDER_RU[o.stage]), dot: o.paid ? 'green' : 'amber', days: days(o.created_at) })) };
    });
    return [req, ord];
  }

  function rebuild(keepLid) {
    const sorted = sortLeads(leads);
    const deals = sorted.map(toDeal);
    const [req, ord] = buildBoards(deals);
    let sel = keepLid ? deals.findIndex((d) => d.lid === keepLid) : -1;
    if (sel < 0) { const f = deals.findIndex((d) => C.filter(d)); sel = f < 0 ? 0 : f; }
    C.setData(deals, req, ord, sel);
    C.rerender();
    renderChips(); renderBadges();
    if (curScreen() === 'approvals') renderApprovals();
  }
  async function refresh(keepLid) {
    await Promise.all([loadLeads(), loadOrders(), loadApprovals()]);
    rebuild(keepLid === undefined ? curLid : keepLid);
    if (curScreen() === 'quotes') renderQuotes();
    if (curScreen() === 'customers') renderCustomers();
    if (curScreen() === 'admin') renderAdmin();
  }
  const curScreen = () => (($('.screen.on') || {}).dataset || {}).screen;

  /* ---------- Today: filter chips + search ---------- */
  const preds = {
    need: (l) => isOpen(l) && (!l.assigned_to || l.assigned_to === (me && me.id)) && (dueNow(l) || l.stage === 'new'),
    wait: (l) => isOpen(l) && (STAGE_IDX[l.stage] >= 2) && !dueNow(l),
    late: (l) => overdue(l),
    all: (l) => isOpen(l),
  };
  C.filter = (d) => {
    const l = d.raw; if (!preds[chip](l)) return false;
    if (!query) return true;
    const q = query.toLowerCase(), digits = query.replace(/\D/g, '');
    return [l.contact_name, l.email, l.object_address, l.last_quote, l.note].some((x) => String(x || '').toLowerCase().includes(q)) || (digits.length >= 3 && String(l.phone || '').replace(/\D/g, '').includes(digits));
  };
  function renderChips() {
    const box = $('.lh .chips'); if (!box) return;
    const cnt = (k) => leads.filter(preds[k]).length;
    const def = [['need', 'Нужны вам'], ['late', 'Просрочено'], ['wait', 'Ждут клиента'], ['all', 'Все открытые']];
    box.innerHTML = def.map(([k, t]) => '<button type="button" class="cchip' + (chip === k ? ' on' : '') + '" data-chip="' + k + '"><span class="n">' + cnt(k) + '</span> <span>' + t + '</span></button>').join('');
  }
  function renderBadges() {
    const n = leads.filter(preds.late).length;
    const lnk = $('.rail a[data-s="today"]'); if (!lnk) return;
    let b = lnk.querySelector('.badge'); if (!b) { b = document.createElement('span'); b.className = 'badge'; lnk.appendChild(b); }
    b.textContent = n; b.hidden = !n;
    const al = $('.rail a[data-s="approvals"]');
    if (al) { let ab = al.querySelector('.badge'); if (!ab) { ab = document.createElement('span'); ab.className = 'badge'; al.appendChild(ab); } const pn = approvals.filter((a) => a.status === 'pending').length; ab.textContent = pn; ab.hidden = !pn; }
  }
  C.emptyList = () => {
    const empty = !leads.length;
    return '<div class="empty" style="height:auto;padding:48px 18px"><div class="ic">✓</div><div>' + (empty ? 'Пока нет ни одного лида.<br><span class="muted">Заявки с сайта появятся здесь сами. Или добавьте первого клиента вручную.</span>' : 'В этом списке пусто.<br><span class="muted">Переключите фильтр или очистите поиск.</span>') + '</div><button class="btn primary" data-act="newlead">＋ Новый лид</button></div>';
  };
  C.emptyRecord = () => '<div class="empty"><div class="ic">◍</div><div>Выберите лид слева<br><span class="muted">или создайте нового кнопкой «Новый лид»</span></div></div>';

  /* ---------- login / boot ---------- */
  C.login = async (email, pass, status, done) => {
    status.className = 'gstatus'; status.textContent = '…';
    if (!(await ready)) { status.textContent = 'Сервер недоступен'; status.className = 'gstatus warn'; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { status.textContent = humanError(error); status.className = 'gstatus warn'; return; }
    me = await loadMe();
    if (!me || !STAFF.includes(me.role)) { status.textContent = 'Нет доступа: этот вход не для CRM'; status.className = 'gstatus warn'; await sb.auth.signOut(); me = null; return; }
    status.textContent = ''; done(); await boot();
  };
  C.requestAccess = async (row, status, done) => {
    if (!(await ready)) { status.textContent = 'Сервер недоступен'; status.className = 'gstatus warn'; return; }
    const { error } = await sb.from('access_requests').insert(row);
    if (error) { status.textContent = humanError(error); status.className = 'gstatus warn'; return; }
    done();
  };
  async function signOut() { try { await sb.auth.signOut(); } catch (e) {} location.reload(); }

  function applyRole() {
    const set = (sel, on) => $$(sel).forEach((e) => { e.hidden = !on; e.style.display = on ? '' : 'none'; });
    set('.rail a[data-s="approvals"]', isAdmin());
    set('.rail a[data-s="orders"]', !isArch());              // an architect works with his own projects and quotes only
    set('.rail a[data-s="admin"]', sees());
    set('.rail a[data-s="settings"]', isAdmin());
    const grp = $('.rail .grp'); if (grp) { grp.hidden = !sees(); grp.style.display = sees() ? '' : 'none'; }
    const nm = me.full_name || me.email || 'Пользователь';
    const av = $('.rail .me .av'); if (av) av.textContent = initials(nm);
    const box = $('.rail .me > div'); if (box) box.innerHTML = '<div style="font-size:12.5px">' + esc(nm) + '</div><small>' + esc(ROLE_RU[me.role] || me.role) + ' · <a href="#" id="logout" style="color:var(--accent)">выйти</a></small>';
    const lo = $('#logout'); if (lo) lo.onclick = (e) => { e.preventDefault(); signOut(); };
    // top button: new lead (the configurator has its own menu item)
    const nb = $('#newCalcBtn');
    if (nb) { const c = nb.cloneNode(true); nb.replaceWith(c); const l = c.querySelector('.lbl'); if (l) { l.removeAttribute('data-i18n'); l.textContent = ' Новый лид'; } c.addEventListener('click', () => newLeadDialog()); }
    // demo-only things that have no data behind them
    const seg = $('.board-top .seg'); if (seg) seg.style.display = 'none';
    $$('.board-top .pill').forEach((p) => { p.style.display = 'none'; });
    const ta = $$('.lh .r .btn')[0]; if (ta) ta.style.display = 'none';
  }

  async function boot() {
    if (booted) return; booted = true;
    applyRole();
    await Promise.all([loadUsers(), loadGroups()]);
    try { await refresh(null); } catch (e) { toast(humanError(e), true); }
    pollNotifications(); setInterval(() => { pollNotifications(); }, 60000);
    setInterval(() => { if (!document.hidden && !$('.dlgback')) refresh().catch(() => {}); }, 120000);
    const h = location.hash.replace('#', ''); if (h) C.onShow(h);
  }

  // start: demo data must never show when the backend is on
  C.setData([], buildBoards([])[0], buildBoards([])[1]);
  C.rerender(); renderChips();
  ready.then(async (ok) => {
    if (!ok) return;
    me = await loadMe();
    if (me && STAFF.includes(me.role)) { document.body.classList.add('authed'); await boot(); }
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && booted) location.reload(); });
  });

  /* ---------- lead card ---------- */
  const tel = (p) => String(p || '').replace(/[^\d+]/g, '');
  const waNum = (p) => { const s = String(p || '').trim(); if (/^\+/.test(s)) return s.replace(/\D/g, ''); if (/^00/.test(s)) return s.replace(/\D/g, '').slice(2); return ''; };
  const mapUrl = (a) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

  function evText(e) {
    switch (e.kind) {
      case 'created': return 'Лид создан';
      case 'assigned': return 'Назначен: ' + userName(e.to_user) + (e.comment ? ' — ' + e.comment : '');
      case 'transferred': return 'Передан: ' + userName(e.to_user) + (e.comment ? ' — ' + e.comment : '');
      case 'stage': return 'Стадия: ' + (STAGE_RU[e.from_stage] || '—') + ' → ' + (STAGE_RU[e.to_stage] || '—') + (e.comment ? ' — ' + e.comment : '');
      case 'comment': return e.comment || '';
      case 'quote': return 'Выставлено КП' + (e.comment ? ' ' + e.comment : '');
      default: return e.kind;
    }
  }
  const feedHtml = (evs, n) => (evs || []).slice(0, n || 99).map((e) => '<div class="fe' + (e.kind === 'comment' ? '' : '') + '"><div style="white-space:pre-wrap;word-break:break-word">' + (e.kind === 'comment' ? '💬 ' : '') + esc(evText(e)) + '</div><div class="who">' + esc(e.by ? userName(e.by) : 'система') + ' · ' + hm(e.at) + '</div></div>').join('') || '<div class="muted" style="padding:6px 0">Событий пока нет</div>';

  function utmHtml(l) {
    const u = l.utm || {}, keys = Object.keys(u).filter((k) => u[k]);
    if (!keys.length) return '';
    return '<details class="jr"><summary>Откуда пришёл — подробно</summary><div style="margin-top:8px">' + keys.map((k) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v" style="word-break:break-all">' + esc(String(u[k]).length > 90 ? String(u[k]).slice(0, 90) + '…' : u[k]) + '</span></div>').join('') + '</div></details>';
  }

  C.renderLive = (d, wrap) => {
    const l = d.raw;
    if (curLid !== l.id) { curLid = l.id; tab = 'ov'; }
    const dt = detail[l.id];
    if (!dt) loadDetail(l.id).then(() => { if (curLid === l.id) C.rerenderRecord(); }).catch((e) => toast(humanError(e), true));
    const src = srcInfo(l), late = overdue(l), open = isOpen(l), idx = d.stage;
    const mine = l.assigned_to && me && l.assigned_to === me.id;
    const steps = STEPS.map((t, i) => {
      const cls = l.stage === 'won' ? 'cv done' : i < idx ? 'cv done' : i === idx ? 'cv now' : 'cv';
      const small = i === idx ? '<small>' + (l.stage === 'lost' ? 'Отказ · ' : l.stage === 'won' ? 'Заказ · ' : (STAGE_RU[l.stage] !== STEPS[i] ? STAGE_RU[l.stage] + ' · ' : '')) + d.curDays + ' дн</small>' : '';
      return '<div class="' + cls + '"><span>' + t + '</span>' + small + '</div>';
    }).join('');
    let own = '';
    if (open) own = !l.assigned_to ? (sees() ? '<button class="btn sm" data-act="take">Взять себе</button>' : '') : (mine || sees() ? '<button class="btn sm" data-act="transfer">Передать</button>' : '');
    const next = open && NEXT_STAGE[idx] ? '<button class="btn primary sm" data-act="advance">Перевести → ' + esc(NEXT_STAGE[idx] === 'won' ? 'Заказ' : STAGE_RU[NEXT_STAGE[idx]]) + '</button>' : '';
    const lose = open ? '<button class="btn sm" data-act="lose">Отказ</button>' : '<button class="btn sm" data-act="reopen">Вернуть в работу</button>';
    const wa = waNum(l.phone);
    const contacts = (l.phone ? '<a href="tel:' + esc(tel(l.phone)) + '">📞 ' + esc(l.phone) + '</a>' : '') + (wa ? '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') + (l.email ? '<a href="mailto:' + esc(l.email) + '">✉ ' + esc(l.email) + '</a>' : '') + (l.object_address ? '<a href="' + esc(mapUrl(l.object_address)) + '" target="_blank" rel="noopener">📍 Карта</a>' : '');

    const nextBlock = (l.next_action || l.next_action_at)
      ? '<div class="task"><span class="i">' + (late ? '⏰' : '📞') + '</span><div class="t"><b>' + esc(l.next_action || 'Следующий шаг') + '</b><div class="' + (late ? 'late' : '') + '">' + (l.next_action_at ? (late ? 'Просрочено · ' : 'До ') + dmy(l.next_action_at) : 'Срок не задан') + '</div></div>' + (open ? '<button class="go" data-act="done">Готово</button><button class="go" data-act="setnext" style="color:var(--muted)">Изменить</button>' : '') + '</div>'
      : '<div class="task"><span class="i">＋</span><div class="t"><b>Следующий шаг не задан</b><div>Лид без шага «забывают» — назначьте звонок или встречу</div></div>' + (open ? '<button class="go" data-act="setnext">Задать шаг</button>' : '') + '</div>';

    const brief = '<div class="brief">'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="src ' + src.kind + '">' + esc(src.label) + '</span><span class="muted">пришёл ' + esc(ago(l.created_at)) + '</span>' + (d.hot ? '<span class="hotchip">🔥 HOT</span>' : '') + (l.stale ? '<span class="tag bad">без движения 7+ дн</span>' : '') + '</div>'
      + '<div><div class="lb">Чего хочет</div><div class="msg">' + (l.note ? esc(l.note) : '<span class="muted">Сообщения нет — спросите по телефону</span>') + '</div></div>'
      + (l.object_address ? '<div><div class="lb">Объект</div><div>' + esc(l.object_address) + '</div></div>' : '')
      + (src.raw && src.raw !== src.label ? '<div><div class="lb">Источник</div><div style="word-break:break-all">' + esc(src.raw) + '</div></div>' : '')
      + utmHtml(l)
      + (l.journey ? '<details class="jr"><summary>Что клиент делал в конфигураторе</summary><pre>' + esc(l.journey) + '</pre></details>' : '')
      + '</div>';

    let tabBody = '';
    const evs = dt && dt.events, qs = dt && dt.quotes;
    if (tab === 'ov') {
      tabBody = kv('Телефон', l.phone ? '<a href="tel:' + esc(tel(l.phone)) + '" style="color:inherit">' + esc(l.phone) + '</a>' : '—') + kv('E-mail', l.email ? '<a href="mailto:' + esc(l.email) + '" style="color:inherit">' + esc(l.email) + '</a>' : '—')
        + kv('Адрес объекта', esc(l.object_address || '—') + (l.postcode ? ' · ' + esc(l.postcode) : '')) + kv('Ответственный', esc(d.owner) + (d.comp ? ' · ' + esc(d.comp) : '')) + kv('Создан', dmy(l.created_at))
        + (l.stage === 'lost' ? kv('Причина отказа', esc(l.lost_reason || '—')) : '')
        + '<div id="dupHint"></div><h4 class="ovhead">Недавняя активность</h4><div class="feed">' + (evs ? feedHtml(evs, 5) : '<div class="muted">Загрузка…</div>') + '</div>'
        + '<div style="margin-top:14px"><button class="btn sm" data-act="edit">✎ Править данные клиента</button></div>';
    } else if (tab === 'q') {
      tabBody = !qs ? '<div class="muted">Загрузка…</div>' : qs.length ? qs.map((q) => '<div class="vrow"><span>' + esc(q.number) + '</span><span class="d">' + dmy(q.created_at) + ' · до ' + dmy(q.valid_until) + apprTag(q.id) + '</span><span class="s tab-num">' + money(q.total_net) + '</span><button class="btn sm" data-act="openq" data-q="' + q.id + '">Открыть</button></div>').join('') : '<div class="muted">КП ещё нет. Нажмите «Рассчитать КП».</div>';
    } else if (tab === 'hist') {
      tabBody = '<div class="feed">' + (evs ? feedHtml(evs) : '<div class="muted">Загрузка…</div>') + '</div>';
    } else {
      tabBody = '<div class="fld"><label for="noteTxt">Заметка (видна всем, кто видит лид)</label><textarea id="noteTxt" placeholder="Что обсудили, что обещали…"></textarea></div><div style="margin:8px 0 14px"><button class="btn primary sm" data-act="comment">Добавить заметку</button></div><div class="feed">' + (evs ? feedHtml(evs.filter((e) => e.kind === 'comment')) : '') + '</div>';
    }
    const tabs = [['ov', 'Обзор'], ['q', 'КП' + (qs ? ' (' + qs.length + ')' : '')], ['hist', 'История'], ['notes', 'Заметки']].map(([k, t]) => '<div class="t' + (tab === k ? ' on' : '') + '" role="tab" tabindex="0" data-tab="' + k + '">' + t + '</div>').join('');

    const lq = qs && qs[0];
    const qpanel = '<div class="qpanel"><div class="qcard"><div class="b">'
      + (lq ? '<div class="tot"><span class="big tab-num">' + money(lq.total_net) + '</span><small>нетто · КП ' + esc(lq.number) + '</small></div>' + (apprOf(lq.id) ? '<div style="margin:-4px 0 8px">' + apprTag(lq.id) + '</div>' : '') + '<div class="qmeta"><div class="l"><span>Создано</span><b>' + dmy(lq.created_at) + '</b></div><div class="l"><span>Действует</span><b>до ' + dmy(lq.valid_until) + '</b></div>' + (qs.length > 1 ? '<div class="l"><span>Версий</span><b>' + qs.length + '</b></div>' : '') + '</div>'
        + '<div class="qbtns"><button class="btn primary sm wide" data-act="openq" data-q="' + lq.id + '">Открыть / исправить КП</button></div>'
        : '<div class="tot"><span class="big tab-num">—</span><small>' + (qs ? 'КП ещё не рассчитано' : 'Загрузка…') + '</small></div>')
      + '<div class="qbtns"><button class="btn ' + (lq ? '' : 'primary ') + 'sm wide" data-act="newq">＋ Рассчитать ' + (lq ? 'новое ' : '') + 'КП</button></div>'
      + '</div></div></div>';

    wrap.innerHTML = '<div class="rhead"><button class="btn sm ghost back" id="recBack">← Назад</button><div class="top"><div class="idn"><h2>' + esc(d.name) + (d.hot ? ' <span class="hotchip">🔥 HOT</span>' : '') + '</h2><div class="meta"><span>' + esc(d.owner) + '</span>' + (d.id ? '<span>' + esc(d.id) + '</span>' : '') + '<span>' + esc(STAGE_RU[l.stage]) + '</span></div><div class="contact">' + contacts + '</div></div><div class="acts">' + own + lose + next + '</div></div><div class="stages">' + steps + '</div></div>'
      + '<div class="rbody"><div class="rmain">' + brief + '<div class="upnext"><div class="uh"><span>Следующий шаг</span></div>' + nextBlock + '</div><div class="tabs" role="tablist">' + tabs + '</div>' + tabBody + '</div>' + qpanel + '</div>';
    const back = $('#recBack', wrap); if (back) back.onclick = () => $('#split').classList.remove('show-rec');
    if (tab === 'ov') dupHint(l);
  };
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';

  function dupHint(l) {
    const box = $('#dupHint'); if (!box) return;
    const key = normPhone(l.phone), em = (l.email || '').toLowerCase();
    const other = leads.filter((x) => x.id !== l.id && ((key && normPhone(x.phone) === key) || (em && (x.email || '').toLowerCase() === em)));
    if (!other.length) return;
    box.innerHTML = '<div class="dup" style="margin-top:12px"><b>Этот клиент уже обращался (' + other.length + ')</b>' + other.slice(0, 4).map((x) => '<div><a href="#" data-open="' + x.id + '" style="color:var(--accent)">' + esc(x.contact_name || x.phone) + '</a> · ' + esc(STAGE_RU[x.stage]) + ' · ' + dmy(x.created_at) + '</div>').join('') + '</div>';
  }

  /* ---------- actions on the card ---------- */
  const curLead = () => leads.find((x) => x.id === curLid);
  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); delete detail[curLid]; await refresh(curLid); } catch (e) { toast(humanError(e), true); }
  }
  function nextDialog(l) {
    dialog({
      title: 'Следующий шаг', sub: esc(l.contact_name || ''),
      body: '<div class="fld"><label>Что сделать</label><input class="inp" name="t" value="' + esc(l.next_action || 'Позвонить') + '" autofocus></div><div class="fld"><label>Когда</label><input class="inp" type="date" name="d" value="' + esc(l.next_action_at || plusDays(1)) + '"></div><div class="chips2" data-quick>' + [['Сегодня', 0], ['Завтра', 1], ['Через 3 дня', 3], ['Через неделю', 7]].map(([t, n]) => '<button type="button" data-n="' + n + '">' + t + '</button>').join('') + '</div>',
      onOpen: (r) => r.querySelector('[data-quick]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) r.querySelector('[name=d]').value = plusDays(+b.dataset.n); }),
      foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Сохранить', primary: true, run: async (c, r) => { const t = val(r, 't').trim(), d = val(r, 'd'); if (!t) return toast('Напишите, что сделать', true); await act(async () => { await run(sb.from('leads').update({ next_action: t, next_action_at: d || null }).eq('id', l.id)); }, 'Шаг сохранён'); c(); } }],
    });
  }
  function loseDialog(l) {
    const reasons = ['Дорого', 'Выбрал другого', 'Не сейчас', 'Нет связи', 'Дубль', 'Спам'];
    dialog({
      title: 'Отказ: ' + (l.contact_name || ''), sub: 'Причина обязательна — по ней потом видно, где мы теряем клиентов.',
      body: '<div class="chips2" data-r>' + reasons.map((r) => '<button type="button">' + r + '</button>').join('') + '</div><div class="fld"><label>Причина</label><input class="inp" name="r" placeholder="Выберите выше или напишите своё" autofocus></div>',
      onOpen: (root) => root.querySelector('[data-r]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) root.querySelector('[name=r]').value = b.textContent; }),
      foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Отметить отказ', primary: true, run: async (c, r) => { const t = val(r, 'r').trim(); if (!t) return toast('Укажите причину', true); await act(async () => { await run(sb.from('leads').update({ stage: 'lost', lost_reason: t, next_action: null, next_action_at: null }).eq('id', l.id)); }, 'Лид закрыт: отказ'); c(); } }],
    });
  }
  function transferDialog(l) {
    const cands = users.filter((u) => ['seller', 'manager', 'dealer'].includes(u.role) && u.active !== false && u.id !== (me && me.id));
    if (!cands.length) return toast('Нет сотрудников, которым можно передать лид', true);
    dialog({
      title: 'Передать лид', sub: esc(l.contact_name || ''),
      body: '<div class="fld"><label>Кому</label><select class="inp" name="u">' + cands.map((u) => '<option value="' + u.id + '">' + esc((u.full_name || u.email) + ' — ' + (ROLE_RU[u.role] || u.role)) + '</option>').join('') + '</select></div><div class="fld"><label>Комментарий (обязательно)</label><textarea name="c" placeholder="Что важно знать тому, кто возьмёт лид" autofocus></textarea></div>',
      foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Передать', primary: true, run: async (c, r) => { const t = val(r, 'c').trim(); if (!t) return toast('Нужен комментарий', true); await act(async () => { await run(sb.rpc('transfer_lead', { p_lead: l.id, p_to: val(r, 'u'), p_comment: t })); }, 'Лид передан'); c(); } }],
    });
  }
  function editDialog(l) {
    dialog({
      title: 'Данные клиента',
      body: '<div class="fld"><label>Имя</label><input class="inp" name="n" value="' + esc(l.contact_name || '') + '"></div><div class="fld"><label>Телефон</label><input class="inp" type="tel" name="p" value="' + esc(l.phone || '') + '"></div><div class="fld"><label>E-mail</label><input class="inp" type="email" name="e" value="' + esc(l.email || '') + '"></div><div class="fld"><label>Адрес объекта</label><input class="inp" name="a" value="' + esc(l.object_address || '') + '"></div><div class="fld"><label>Индекс</label><input class="inp" name="z" value="' + esc(l.postcode || '') + '"></div>',
      foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Сохранить', primary: true, run: async (c, r) => { const n = val(r, 'n').trim(), p = val(r, 'p').trim(), e = val(r, 'e').trim(); if (!n && !p && !e) return toast('Нужны имя, телефон или e-mail', true); await act(async () => { await run(sb.from('leads').update({ contact_name: n || null, phone: p || null, email: e || null, object_address: val(r, 'a').trim() || null, postcode: val(r, 'z').trim() || null }).eq('id', l.id)); }, 'Сохранено'); c(); } }],
    });
  }
  function handoff(l, q) {
    try { localStorage.setItem('db.handoff', JSON.stringify({ leadId: l.id, leadName: l.contact_name || l.phone || '', quoteId: q ? q.id : null, quoteNo: q ? q.number : null, config: q ? q.config : null, ts: Date.now() })); } catch (e) {}
    openConfigurator(true);
  }
  function openConfigurator(model) {
    const f = $('#cfgFrame'); if (!f) return;
    f.setAttribute('data-lang', C.lang());
    f.setAttribute('src', 'configurator.html?' + (model ? 'model&' : '') + 'lang=' + C.lang());
    C.show('configurator');
  }

  document.addEventListener('click', (e) => {
    const chipEl = e.target.closest('[data-chip]');
    if (chipEl) { chip = chipEl.dataset.chip; renderChips(); C.rerender(); return; }
    const op = e.target.closest('[data-open]');
    if (op) { e.preventDefault(); openLead(op.dataset.open); return; }
    const tb = e.target.closest('.tabs [data-tab]');
    if (tb && curLid) { tab = tb.dataset.tab; C.rerenderRecord(); return; }
    const oc = e.target.closest('[data-oid]');
    if (oc) { orderDialog(orders.find((o) => o.id === oc.dataset.oid)); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act0 = a.dataset.act, l = curLead();
    if (act0 === 'newlead') return newLeadDialog();
    if (act0 === 'bell') return;
    if (!l) return;
    if (act0 === 'take') return act(async () => { await run(sb.rpc('assign_lead', { p_lead: l.id, p_to: me.id, p_comment: 'Взял в работу' })); }, 'Лид теперь ваш');
    if (act0 === 'transfer') return transferDialog(l);
    if (act0 === 'lose') return loseDialog(l);
    if (act0 === 'reopen') return act(async () => { await run(sb.from('leads').update({ stage: 'processing', lost_reason: null }).eq('id', l.id)); }, 'Лид снова в работе');
    if (act0 === 'advance') {
      const to = NEXT_STAGE[STAGE_IDX[l.stage]];
      const go = () => act(async () => { await run(sb.from('leads').update({ stage: to }).eq('id', l.id)); }, 'Стадия: ' + STAGE_RU[to]);
      if (to === 'won') return dialog({ title: 'Оформить заказ?', sub: 'Лид станет клиентом, а в «Заказах» появится карточка.', foot: [{ label: 'Нет', run: (c) => c() }, { label: 'Оформить заказ', primary: true, run: async (c) => { await go(); c(); } }] });
      return go();
    }
    if (act0 === 'setnext') return nextDialog(l);
    if (act0 === 'done') return act(async () => {
      const txt = 'Шаг выполнен: ' + (l.next_action || 'шаг');
      await run(sb.rpc('comment_lead', { p_lead: l.id, p_comment: txt }));
      await run(sb.from('leads').update({ next_action: null, next_action_at: null }).eq('id', l.id));
    }, 'Готово. Назначьте следующий шаг').then(() => { const nl = curLead(); if (nl && isOpen(nl)) nextDialog(nl); });
    if (act0 === 'edit') return editDialog(l);
    if (act0 === 'comment') { const t = ($('#noteTxt') || {}).value || ''; if (!t.trim()) return toast('Напишите заметку', true); return act(async () => { await run(sb.rpc('comment_lead', { p_lead: l.id, p_comment: t.trim() })); }, 'Заметка добавлена'); }
    if (act0 === 'newq') return handoff(l, null);
    if (act0 === 'openq') { const q = ((detail[l.id] || {}).quotes || []).find((x) => x.id === a.dataset.q); return handoff(l, q || null); }
  });

  function openLead(id) {
    const i = C.deals.findIndex((d) => d.lid === id);
    if (i >= 0) { chip = 'all'; query = ''; const s = $('#gsearch'); if (s) s.value = ''; renderChips(); C.rerender(); C.open(C.deals.findIndex((d) => d.lid === id)); }
  }

  /* ---------- new lead ---------- */
  function newLeadDialog(pre) {
    pre = pre || {};
    let srcSel = 'Звонок', wantSel = [];
    const d = dialog({
      title: 'Новый лид', sub: 'Достаточно телефона или имени — остальное можно дописать позже.',
      body: '<div class="fld"><label>Телефон</label><input class="inp" type="tel" inputmode="tel" name="p" autocomplete="off" placeholder="+43 660 …" value="' + esc(pre.phone || '') + '" autofocus></div><div id="dupBox"></div>'
        + '<div class="fld"><label>Имя</label><input class="inp" name="n" autocomplete="off" value="' + esc(pre.name || '') + '"></div>'
        + '<div class="fld"><label>Что интересует</label><div class="chips2" data-want>' + WANTS.map((w) => '<button type="button">' + w + '</button>').join('') + '</div></div>'
        + '<div class="fld"><label>Заметка</label><textarea name="note" rows="2" placeholder="Что сказал клиент, когда удобно звонить…"></textarea></div>'
        + '<div class="fld"><label>Откуда клиент</label><div class="chips2" data-src>' + SOURCES.map((s) => '<button type="button" class="' + (s === srcSel ? 'on' : '') + '">' + s + '</button>').join('') + '</div></div>'
        + '<details class="jr"><summary>Ещё: e-mail, адрес, следующий шаг</summary><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">'
        + '<div class="fld"><label>E-mail</label><input class="inp" type="email" name="e" autocomplete="off"></div><div class="fld"><label>Адрес объекта</label><input class="inp" name="a" autocomplete="off"></div><div class="fld"><label>Индекс</label><input class="inp" name="z" inputmode="numeric" autocomplete="off"></div>'
        + '<div class="fld"><label>Следующий шаг</label><input class="inp" name="t" value="Позвонить"></div><div class="fld"><label>Когда</label><input class="inp" type="date" name="d" value="' + plusDays(1) + '"></div></div></details>',
      onOpen: (r) => {
        r.querySelector('[data-want]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; b.classList.toggle('on'); wantSel = $$('[data-want] .on', r).map((x) => x.textContent); });
        r.querySelector('[data-src]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('[data-src] button', r).forEach((x) => x.classList.remove('on')); b.classList.add('on'); srcSel = b.textContent; });
        const check = () => {
          const p = normPhone(val(r, 'p')), em = val(r, 'e').trim().toLowerCase();
          const hit = leads.find((x) => (p.length >= 7 && normPhone(x.phone) === p) || (em && (x.email || '').toLowerCase() === em));
          const box = r.querySelector('#dupBox');
          box.innerHTML = hit ? '<div class="dup"><div><b>Такой клиент уже есть:</b> ' + esc(hit.contact_name || hit.phone) + ' · ' + esc(STAGE_RU[hit.stage]) + (hit.assignee_name ? ' · ' + esc(hit.assignee_name) : '') + '</div><div class="a"><button type="button" class="btn sm primary" data-existing="' + hit.id + '">Открыть его карточку</button><span class="muted" style="align-self:center">или нажмите «Создать» — это будет новое обращение</span></div></div>' : '';
        };
        r.querySelector('[name=p]').addEventListener('input', check); r.querySelector('[name=e]').addEventListener('input', check);
        r.addEventListener('click', (e) => { const x = e.target.closest('[data-existing]'); if (x) { d.close(); openLead(x.dataset.existing); } });
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); r.querySelector('.foot .primary').click(); } });
        check();
      },
      foot: [
        { label: 'Отмена', run: (c) => c() },
        { label: 'Создать', primary: true, run: (c, r) => saveNew(c, r, false) },
        { label: 'Создать и рассчитать КП', run: (c, r) => saveNew(c, r, true) },
      ],
    });
    async function saveNew(close, r, withQuote) {
      const name = val(r, 'n').trim(), phone = val(r, 'p').trim(), email = val(r, 'e').trim();
      if (!name && !phone && !email) { toast('Введите телефон или имя', true); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Проверьте e-mail', true); return; }
      const addr = val(r, 'a').trim(), zip = val(r, 'z').trim() || ((addr.match(/\b\d{4}\b/) || [null])[0]);
      const note = [wantSel.length ? 'Интересует: ' + wantSel.join(', ') : '', val(r, 'note').trim()].filter(Boolean).join('\n');
      const step = val(r, 't').trim();
      try {
        const row = await run(sb.from('leads').insert({ created_by: me.id, source: me.role === 'dealer' ? 'dealer' : me.role === 'manager' ? 'manager' : me.role === 'seller' ? 'seller' : 'office', utm: { source: srcSel }, contact_name: name || null, phone: phone || null, email: email || null, object_address: addr || null, postcode: zip || null, note: note || null, next_action: step || null, next_action_at: step ? (val(r, 'd') || plusDays(1)) : null }).select('id').single());
        if (sees()) { try { await run(sb.rpc('assign_lead', { p_lead: row.id, p_to: me.id, p_comment: 'Создал вручную' })); } catch (e) { /* stays unassigned: "Взять себе" is on the card */ } }
        close(); toast('Лид создан');
        curLid = row.id; await refresh(row.id); chip = 'all'; renderChips(); C.rerender();
        const i = C.deals.findIndex((x) => x.lid === row.id); if (i >= 0) C.open(i);
        if (withQuote) handoff({ id: row.id, contact_name: name, phone }, null);
      } catch (e) { toast(humanError(e), true); }
    }
  }

  /* ---------- orders ---------- */
  function orderDialog(o) {
    if (!o) return;
    dialog({
      title: 'Заказ: ' + ((o.leads && o.leads.contact_name) || ''),
      body: '<div class="fld"><label>Этап</label><select class="inp" name="s">' + Object.keys(ORDER_RU).map((k) => '<option value="' + k + '"' + (k === o.stage ? ' selected' : '') + '>' + ORDER_RU[k] + '</option>').join('') + '</select></div>'
        + '<div class="fld"><label>Дата замера</label><input class="inp" type="date" name="m" value="' + esc(o.measured_at || '') + '"></div><div class="fld"><label>Ожидаемая поставка</label><input class="inp" type="date" name="dl" value="' + esc(o.delivery_eta || '') + '"></div>'
        + '<div class="fld"><label><input type="checkbox" name="pd"' + (o.paid ? ' checked' : '') + '> Оплачен</label></div><div class="fld"><label>Заметка</label><textarea name="nt">' + esc(o.note || '') + '</textarea></div>',
      foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Открыть лид', run: (c) => { c(); openLead(o.lead_id); } }, { label: 'Сохранить', primary: true, run: async (c, r) => { try { await run(sb.from('orders').update({ stage: val(r, 's'), measured_at: val(r, 'm') || null, delivery_eta: val(r, 'dl') || null, paid: r.querySelector('[name=pd]').checked, note: val(r, 'nt').trim() || null }).eq('id', o.id)); toast('Заказ сохранён'); c(); await refresh(); } catch (e) { toast(humanError(e), true); } } }],
    });
  }

  /* ---------- screens: quotes, customers, admin, settings ---------- */
  function setScreen(id, html) { const sc = $('[data-screen="' + id + '"]'); if (sc) sc.innerHTML = '<div class="pad">' + html + '</div>'; }
  let quotes = [], qTab = 'act', qSearch = '';
  async function renderQuotes() {
    const sc = $('[data-screen="quotes"]');
    if (!sc) return;
    try { quotes = await run(sb.from('quotes').select('id, number, created_at, valid_until, total_net, revises, lead_id, owner, config, leads(contact_name, phone)').order('created_at', { ascending: false }).limit(500)); } catch (e) { toast(humanError(e), true); return; }
    const revised = new Set(quotes.map((q) => q.revises).filter(Boolean)), t = today();
    const isAct = (q) => q.valid_until >= t && !revised.has(q.id);
    const list = quotes.filter((q) => (qTab === 'act' ? isAct(q) : !isAct(q))).filter((q) => !qSearch || [q.number, q.leads && q.leads.contact_name, q.leads && q.leads.phone].some((x) => String(x || '').toLowerCase().includes(qSearch.toLowerCase())));
    setScreen('quotes', '<div class="h1" style="margin-bottom:12px">Коммерческие предложения</div><div class="bar"><div class="seg2"><button class="' + (qTab === 'act' ? 'on' : '') + '" data-qt="act">Действующие</button><button class="' + (qTab === 'arc' ? 'on' : '') + '" data-qt="arc">Архив</button></div><input class="inp" id="qSearch" placeholder="Поиск: номер, клиент…" value="' + esc(qSearch) + '"><div class="sp"></div><button class="btn primary sm" data-act="configurator">＋ Новое КП</button></div>'
      + (list.length ? '<div class="panel"><div class="tblwrap"><table class="tbl"><thead><tr><th>№ КП</th><th>Клиент</th><th class="num">Сумма, нетто</th><th>Создано</th><th>Действует до</th></tr></thead><tbody>' + list.map((q) => '<tr class="click" data-qrow="' + q.id + '"><td><b>' + esc(q.number) + '</b>' + apprTag(q.id) + '</td><td>' + esc((q.leads && (q.leads.contact_name || q.leads.phone)) || '—') + '</td><td class="num">' + money(q.total_net) + '</td><td>' + dmy(q.created_at) + '</td><td class="' + (q.valid_until < t ? 'late' : '') + '">' + dmy(q.valid_until) + '</td></tr>').join('') + '</tbody></table></div></div>'
        : '<div class="empty" style="height:auto;padding:50px 0"><div class="ic">❏</div><div>' + (qTab === 'act' ? 'Действующих КП нет.<br><span class="muted">Рассчитайте первое в конфигураторе или из карточки лида.</span>' : 'Архив пуст.') + '</div></div>'));
    const si = $('#qSearch'); if (si) { si.oninput = () => { qSearch = si.value; renderQuotesLocal(); }; }
  }
  function renderQuotesLocal() { const pos = ($('#qSearch') || {}).selectionStart; renderQuotes().then(() => { const s = $('#qSearch'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) {} } }); }
  let cust = [], cSearch = '';
  async function renderCustomers() {
    try { cust = await run(sb.from('customers').select('*').order('last_activity_at', { ascending: false }).limit(1000)); }
    catch (e) { // the view comes with migration 0008; until then group the leads here (same rule: last 9 digits of the phone, else e-mail)
      const g = {}; leads.forEach((l) => { const k = normPhone(l.phone) || (l.email || '').toLowerCase(); if (!k) return; const c = g[k] || (g[k] = { key: k, name: l.contact_name, phone: l.phone, email: l.email, object_address: l.object_address, leads: 0, won: 0, last_activity_at: l.last_activity_at }); c.leads++; if (l.stage === 'won') c.won++; if (l.last_activity_at > c.last_activity_at) c.last_activity_at = l.last_activity_at; });
      cust = Object.values(g).sort((a, b) => (a.last_activity_at < b.last_activity_at ? 1 : -1));
    }
    const q = cSearch.toLowerCase(), dg = cSearch.replace(/\D/g, '');
    const list = cust.filter((c) => !q || [c.name, c.email, c.object_address].some((x) => String(x || '').toLowerCase().includes(q)) || (dg.length >= 3 && String(c.phone || '').replace(/\D/g, '').includes(dg)));
    setScreen('customers', '<div class="h1" style="margin-bottom:12px">Клиенты</div><div class="bar"><input class="inp" id="cSearch" placeholder="Поиск: имя, телефон, e-mail…" value="' + esc(cSearch) + '"><div class="sp"></div><button class="btn primary sm" data-act="newlead">＋ Новый клиент</button></div>'
      + (list.length ? '<div class="panel"><div class="tblwrap"><table class="tbl"><thead><tr><th>Клиент</th><th>Телефон</th><th>Адрес</th><th class="num">Обращений</th><th class="num">Заказов</th><th>Последний контакт</th></tr></thead><tbody>' + list.map((c) => '<tr class="click" data-cust="' + esc(c.key) + '"><td><b>' + esc(c.name || c.email || c.phone) + '</b></td><td>' + esc(c.phone || '—') + '</td><td>' + esc(c.object_address || '—') + '</td><td class="num">' + c.leads + '</td><td class="num">' + c.won + '</td><td>' + ago(c.last_activity_at) + '</td></tr>').join('') + '</tbody></table></div></div>'
        : '<div class="empty" style="height:auto;padding:50px 0"><div class="ic">◍</div><div>' + (cust.length ? 'Никого не найдено.' : 'Клиентов пока нет.<br><span class="muted">Они появятся из лидов — с сайта или созданных вручную.</span>') + '</div><button class="btn primary" data-act="newlead">＋ Новый клиент</button></div>'));
    const si = $('#cSearch'); if (si) si.oninput = () => { cSearch = si.value; const pos = si.selectionStart; renderCustomers().then(() => { const s = $('#cSearch'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) {} } }); };
  }
  function customerDialog(key) {
    const c = cust.find((x) => x.key === key); if (!c) return;
    const mine = leads.filter((l) => (normPhone(l.phone) || (l.email || '').toLowerCase()) === key).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    dialog({
      title: c.name || c.email || c.phone, sub: esc([c.phone, c.email].filter(Boolean).join(' · ')),
      body: '<div class="contact">' + (c.phone ? '<a href="tel:' + esc(tel(c.phone)) + '">📞 Позвонить</a>' : '') + (waNum(c.phone) ? '<a href="https://wa.me/' + waNum(c.phone) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') + (c.email ? '<a href="mailto:' + esc(c.email) + '">✉ Написать</a>' : '') + '</div>'
        + (c.object_address ? '<div class="kv"><span class="k">Адрес</span><span class="v">' + esc(c.object_address) + '</span></div>' : '')
        + '<h4 class="ovhead">Обращения (' + mine.length + ')</h4>' + mine.map((l) => '<div class="vrow" style="cursor:pointer" data-lead="' + l.id + '"><span>' + dmy(l.created_at) + '</span><span class="d">' + esc(STAGE_RU[l.stage]) + (l.last_quote ? ' · КП ' + esc(l.last_quote) : '') + '</span><span class="s tab-num">' + money(l.last_total_net) + '</span></div>').join(''),
      onOpen: (r, close) => r.addEventListener('click', (e) => { const x = e.target.closest('[data-lead]'); if (x) { close(); openLead(x.dataset.lead); } }),
      foot: [{ label: 'Закрыть', run: (cl) => cl() }, { label: '＋ Новое обращение', primary: true, run: (cl) => { cl(); newLeadDialog({ name: c.name, phone: c.phone }); } }],
    });
  }

  function renderAdmin() {
    const sc = $('[data-screen="admin"]'); if (!sc) return;
    const open = leads.filter(isOpen), won = leads.filter((l) => l.stage === 'won'), lost = leads.filter((l) => l.stage === 'lost');
    const pipe = open.reduce((a, l) => a + (Number(l.last_total_net) || 0), 0);
    const wr = won.length + lost.length ? Math.round(100 * won.length / (won.length + lost.length)) : null;
    const wsum = won.filter((l) => l.last_total_net != null);
    const avg = wsum.length ? wsum.reduce((a, l) => a + Number(l.last_total_net), 0) / wsum.length : null;
    const bySrc = {}; leads.forEach((l) => { const k = srcInfo(l).label; bySrc[k] = (bySrc[k] || 0) + 1; });
    const per = {}; leads.forEach((l) => { if (l.assigned_to) { const p = per[l.assigned_to] || (per[l.assigned_to] = { n: 0, open: 0, sum: 0, late: 0, won: 0, lost: 0 }); p.n++; if (isOpen(l)) { p.open++; p.sum += Number(l.last_total_net) || 0; } if (overdue(l)) p.late++; if (l.stage === 'won') p.won++; if (l.stage === 'lost') p.lost++; } });
    const un = open.filter((l) => !l.assigned_to).length;
    const kpi = (l, v, sub) => '<div class="kpi"><div class="l">' + l + '</div><div class="v tab-num">' + v + '</div>' + (sub ? '<div class="delta">' + sub + '</div>' : '') + '</div>';
    setScreen('admin', '<div class="h1" style="margin-bottom:4px">Обзор</div><p class="muted" style="margin:0 0 16px">Цифры считаются по лидам, которые вы видите.</p>'
      + '<div class="kpis">' + kpi('В работе (сумма КП)', money(pipe), open.length + ' лидов') + kpi('Доля побед', wr == null ? '—' : wr + '%', won.length + ' из ' + (won.length + lost.length)) + kpi('Средний чек', money(avg)) + kpi('Без ответственного', un, un ? 'раздайте в работу' : 'всё разобрано') + '</div>'
      + '<div class="panel"><div class="ph"><h3>Менеджеры</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Сотрудник</th><th>Роль</th><th class="num">Лидов</th><th class="num">В работе</th><th class="num">Сумма</th><th class="num">Просрочено</th><th class="num">Побед</th></tr></thead><tbody>'
      + (Object.keys(per).map((id) => { const p = per[id], u = users.find((x) => x.id === id) || {}; return '<tr><td>' + esc(userName(id)) + '</td><td>' + esc(ROLE_RU[u.role] || '') + '</td><td class="num">' + p.n + '</td><td class="num">' + p.open + '</td><td class="num">' + money(p.sum) + '</td><td class="num' + (p.late ? ' late' : '') + '">' + p.late + '</td><td class="num">' + p.won + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="muted">Пока нет назначенных лидов</td></tr>') + '</tbody></table></div></div>'
      + '<div class="panel"><div class="ph"><h3>Откуда приходят клиенты</h3></div><div class="tblwrap"><table class="tbl"><tbody>' + (Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, n]) => '<tr><td>' + esc(k) + '</td><td class="num">' + n + '</td></tr>').join('') || '<tr><td class="muted">Данных пока нет</td></tr>') + '</tbody></table></div></div>');
  }

  /* approvals: discount above the personal limit waits for the superadmin */
  let apprTab = 'pending';
  function discText(d, lim) { const k = { pergola: 'Пергола', sides: 'Боковые', extras: 'Прочее' }; return Object.keys(d || {}).map((x) => (k[x] || x) + ' ' + d[x] + '%').join(', ') + (lim != null ? ' · лимит ' + lim + '%' : ''); }
  function renderApprovals() {
    const list = approvals.filter((a) => (apprTab === 'pending' ? a.status === 'pending' : a.status !== 'pending'));
    const row = (a) => {
      const q = a.quotes || {}, u = users.find((x) => x.id === q.owner) || {};
      return '<div class="appr"><div class="t"><b>' + esc((q.leads && q.leads.contact_name) || 'КП ' + q.number) + ' · ' + money(q.total_net) + '</b><div class="reasons"><span class="tag">КП ' + esc(q.number) + '</span><span class="tag warn">' + esc(discText(q.discount, u.discount_limit)) + '</span><span class="tag">' + esc(userName(q.owner)) + '</span>' + (a.status !== 'pending' ? '<span class="tag ' + APPR_RU[a.status][1] + '">' + APPR_RU[a.status][0] + (a.comment ? ': ' + esc(a.comment) : '') + '</span>' : '') + '</div></div>'
        + '<div class="acts">' + (q.lead_id ? '<button class="btn sm" data-lead="' + q.lead_id + '">Открыть</button>' : '') + (a.status === 'pending' ? '<button class="btn sm" data-reject="' + a.quote_id + '">Отклонить</button><button class="btn primary sm" data-approve="' + a.quote_id + '">Утвердить</button>' : '') + '</div></div>';
    };
    setScreen('approvals', '<div class="h1" style="margin-bottom:4px">Утверждения</div><p class="muted" style="margin:0 0 14px">Скидка выше личного лимита сотрудника ждёт вашего решения. Решение необратимо, сотрудник получит уведомление.</p><div class="bar"><div class="seg2"><button class="' + (apprTab === 'pending' ? 'on' : '') + '" data-at="pending">Ждут</button><button class="' + (apprTab === 'done' ? 'on' : '') + '" data-at="done">Решённые</button></div></div>'
      + (list.length ? '<div class="panel">' + list.map(row).join('') + '</div>' : '<div class="empty" style="height:auto;padding:50px 0"><div class="ic">✓</div><div>' + (apprTab === 'pending' ? 'Нет заявок на утверждение' : 'Решений пока нет') + '</div></div>'));
  }
  document.addEventListener('click', (e) => {
    const at = e.target.closest('[data-at]'); if (at) { apprTab = at.dataset.at; renderApprovals(); return; }
    const ap = e.target.closest('[data-approve]'); if (ap) { run(sb.rpc('decide_approval', { p_quote: ap.dataset.approve, p_approve: true })).then(() => { toast('Скидка утверждена'); return refresh(); }).catch((er) => toast(humanError(er), true)); return; }
    const rj = e.target.closest('[data-reject]');
    if (rj) dialog({ title: 'Отклонить скидку', sub: 'Сотрудник увидит ваш комментарий.', body: '<div class="fld"><label>Комментарий (обязательно)</label><textarea name="c" autofocus placeholder="Какая скидка допустима…"></textarea></div>', foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Отклонить', primary: true, run: async (c, r) => { const t = val(r, 'c').trim(); if (!t) return toast('Нужен комментарий', true); try { await run(sb.rpc('decide_approval', { p_quote: rj.dataset.reject, p_approve: false, p_comment: t })); toast('Скидка отклонена'); c(); await refresh(); } catch (er) { toast(humanError(er), true); } } }] });
  });

  /* settings: real users, invites, discount groups, service rates */
  let invGroupsReady = false;
  async function renderSettings() {
    const usersPane = $('.setpane[data-set="users"]'); if (!usersPane) return;
    await Promise.all([loadUsers(), loadGroups()]);
    let reqs = []; try { reqs = await run(sb.from('access_requests').select('*').order('created_at', { ascending: false }).limit(30)); } catch (e) {}
    const inv = usersPane.querySelector('.panel');
    if (inv && !invGroupsReady) {
      const sel = $('#invGroup'); if (sel && groups.length) sel.innerHTML = groups.map((g) => '<option value="' + g.id + '">' + esc(g.title) + '</option>').join('');
      const gen = $('#invGen'); if (gen) { const g2 = gen.cloneNode(true); gen.replaceWith(g2); g2.addEventListener('click', createInvite); }
      const ct = $('#invCopy'); if (ct) { const c2 = ct.cloneNode(true); ct.replaceWith(c2); c2.addEventListener('click', () => { const i = $('#invLink'); i.select(); try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); } toast('Ссылка скопирована'); }); }
      invGroupsReady = true;
    }
    const panels = usersPane.querySelectorAll('.panel'), up = panels[1];
    if (up) up.innerHTML = '<div class="ph"><h3>Пользователи</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Имя</th><th>E-mail</th><th>Роль</th><th class="num">Личная скидка %</th><th>Статус</th></tr></thead><tbody>' + users.filter((u) => u.role !== 'client').map((u) => '<tr><td>' + esc(u.full_name || '—') + '</td><td class="muted">' + esc(u.email || '') + '</td><td>' + esc(ROLE_RU[u.role] || u.role) + '</td><td class="num">' + (u.discount_limit != null ? u.discount_limit : '—') + '</td><td><span class="tag ' + (u.active === false ? 'bad' : 'ok') + '">' + (u.active === false ? 'отключён' : 'активен') + '</span></td></tr>').join('') + '</tbody></table></div>';
    let rp = $('#reqPanel'); if (!rp) { rp = document.createElement('div'); rp.id = 'reqPanel'; rp.className = 'panel'; usersPane.appendChild(rp); }
    rp.innerHTML = '<div class="ph"><h3>Заявки на доступ</h3><span class="muted" style="font-size:12px">пригласите нужных кнопкой выше</span></div>' + (reqs.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>Компания</th><th>Имя</th><th>Город</th><th>E-mail</th><th>Дата</th></tr></thead><tbody>' + reqs.map((r) => '<tr><td>' + esc(r.company) + '</td><td>' + esc((r.first_name || '') + ' ' + (r.last_name || '')) + '</td><td>' + esc(r.location) + '</td><td>' + esc(r.email) + '</td><td>' + dmy(r.created_at) + '</td></tr>').join('') + '</tbody></table></div>' : '<div style="padding:14px 15px" class="muted">Новых заявок нет</div>');
    // discount groups: real
    const dp = $('.setpane[data-set="disc"] .panel');
    if (dp) dp.innerHTML = '<div class="ph"><h3>Группы скидок</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Группа</th><th class="num">Макс. скидка %</th></tr></thead><tbody>' + groups.map((g) => '<tr><td>' + esc(g.title) + '</td><td class="num">' + Number(g.max_discount) + '</td></tr>').join('') + '</tbody></table></div><div style="padding:12px 15px" class="muted">Скидка выше личного лимита блокируется системой при сохранении КП.</div>';
    // roles: plain text instead of fake switches
    const rl = $('.setpane[data-set="roles"]');
    if (rl) rl.innerHTML = '<div class="panel"><div class="ph"><h3>Кто что видит</h3></div><div style="padding:14px 15px;line-height:1.7"><p style="margin:0 0 8px"><b>Суперадмин, суперДилер</b> — все лиды и КП.</p><p style="margin:0 0 8px"><b>Дилер</b> — свои лиды и лиды своей компании.</p><p style="margin:0 0 8px"><b>Продавец</b> — только те, что создал сам или получил.</p><p class="muted" style="margin:0">Права закреплены в базе данных и не зависят от этой страницы.</p></div></div>';
    const pp = $('.setpane[data-set="pipe"]');
    if (pp) {
      let rate = null; try { rate = await run(sb.from('pricing_config').select('install_pct, delivery_pct').eq('id', 1).single()); } catch (e) {}
      pp.innerHTML = '<div class="panel"><div class="ph"><h3>Наценки на услуги</h3></div><div style="padding:14px 15px;display:flex;flex-direction:column;gap:12px;max-width:360px"><div class="fld"><label>Монтаж, % от суммы</label><input class="inp" type="number" step="0.1" min="0" id="rIns" value="' + (rate ? Number(rate.install_pct) : '') + '"></div><div class="fld"><label>Доставка, % от суммы</label><input class="inp" type="number" step="0.1" min="0" id="rDel" value="' + (rate ? Number(rate.delivery_pct) : '') + '"></div><button class="btn primary sm" id="rSave" style="align-self:flex-start">Сохранить</button><p class="muted" style="margin:0">Применяется в новых расчётах сразу, без обновления сайта.</p></div></div>';
      const sv = $('#rSave'); if (sv) sv.onclick = async () => { try { await run(sb.from('pricing_config').update({ install_pct: Number($('#rIns').value), delivery_pct: Number($('#rDel').value), updated_at: new Date().toISOString() }).eq('id', 1)); toast('Сохранено'); } catch (e) { toast(humanError(e), true); } };
    }
    const tabNames = { pipe: 'Наценки', roles: 'Роли и доступ', disc: 'Группы скидок' };
    $$('.subnav .t').forEach((t) => { if (tabNames[t.dataset.set]) { t.removeAttribute('data-i18n'); t.textContent = tabNames[t.dataset.set]; } });
  }
  async function createInvite() {
    const { data: { session } } = await sb.auth.getSession();
    const role = ($('#invRole') || {}).value, gid = ($('#invGroup') || {}).value;
    try {
      const res = await fetch(BACKEND.url + '/functions/v1/create-invite', { method: 'POST', headers: { 'content-type': 'application/json', apikey: BACKEND.anonKey, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ role, discount_group_id: gid || null }) });
      const j = await res.json(); if (!res.ok || !j.link) throw new Error(j.message || j.error || 'Ошибка');
      $('#invLink').value = j.link; $('#invOut').hidden = false; toast('Ссылка действует 14 дней');
    } catch (e) { toast(humanError(e), true); }
  }

  /* ---------- notifications ---------- */
  let notes = [];
  async function pollNotifications() {
    try { notes = await run(sb.from('notifications').select('id, at, text, lead_id, read').order('at', { ascending: false }).limit(20)); } catch (e) { return; }
    const un = notes.filter((n) => !n.read).length, dot = $('#bellDot'); if (dot) { dot.hidden = !un; }
  }
  document.addEventListener('click', (e) => {
    const bell = e.target.closest('#bellBtn'), open = $('#ntfBox');
    if (open && !e.target.closest('#ntfBox') && !bell) open.remove();
    if (!bell) return;
    if (open) { open.remove(); return; }
    const box = document.createElement('div'); box.id = 'ntfBox'; box.className = 'ntf';
    box.innerHTML = notes.length ? notes.map((n) => '<div class="it' + (n.read ? '' : ' un') + '" data-n="' + n.id + '" data-lead="' + (n.lead_id || '') + '">' + esc(n.text) + '<small>' + ago(n.at) + '</small></div>').join('') + '<div class="it" style="text-align:center;color:var(--accent)" data-allread="1">Отметить всё прочитанным</div>' : '<div class="it muted">Уведомлений нет</div>';
    bell.appendChild(box);
    box.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const it = ev.target.closest('.it'); if (!it) return;
      try {
        if (it.dataset.allread) await run(sb.from('notifications').update({ read: true }).eq('read', false));
        else if (it.dataset.n) await run(sb.from('notifications').update({ read: true }).eq('id', it.dataset.n));
      } catch (er) {}
      box.remove(); pollNotifications();
      if (it.dataset.lead) openLead(it.dataset.lead);
    });
  });

  /* ---------- search, keyboard, screen switching, messages from the configurator ---------- */
  const si = $('#gsearch');
  if (si) si.addEventListener('input', () => { query = si.value.trim(); if (curScreen() !== 'today') C.show('today'); chip = query ? 'all' : chip; renderChips(); C.rerender(); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (si) si.focus(); return; }
    const tag = (document.activeElement || {}).tagName;
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(tag || '') && !$('.dlgback') && booted) { e.preventDefault(); newLeadDialog(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.rail a, .tabs .t, .cchip, .row, #tabbar a')) { e.preventDefault(); e.target.click(); }
  });
  $$('.rail a').forEach((a) => { a.setAttribute('role', 'link'); a.tabIndex = 0; });
  $$('.rail a').forEach((a) => a.addEventListener('keydown', (e) => { if (e.key === 'Enter') a.click(); }));

  document.addEventListener('click', (e) => {
    const qt = e.target.closest('[data-qt]'); if (qt) { qTab = qt.dataset.qt; renderQuotes(); return; }
    const qr = e.target.closest('[data-qrow]'); if (qr) { const q = quotes.find((x) => x.id === qr.dataset.qrow); if (q && q.lead_id) openLead(q.lead_id); return; }
    const cr = e.target.closest('[data-cust]'); if (cr) { customerDialog(cr.dataset.cust); return; }
    const cf = e.target.closest('[data-act="configurator"]'); if (cf) { try { localStorage.removeItem('db.handoff'); } catch (er) {} openConfigurator(true); }
  });

  C.onShow = (id) => {
    markTab(id);
    if (!booted) return;
    if (id === 'quotes') renderQuotes();
    if (id === 'customers') renderCustomers();
    if (id === 'admin') renderAdmin();
    if (id === 'settings') renderSettings();
    if (id === 'approvals') renderApprovals();
    if (id === 'configurator') {
      const f = $('#cfgFrame');
      if (f && !/[?&]model/.test(f.getAttribute('src') || '')) { try { localStorage.removeItem('db.handoff'); } catch (e) {} f.setAttribute('data-lang', C.lang()); f.setAttribute('src', 'configurator.html?model&lang=' + C.lang()); }
    }
  };

  /* ---------- drag and drop on the boards ----------
   * Mouse: grab and move. Touch: press and hold (~0.3 s) so scrolling stays natural. The card follows the finger,
   * the column under it lights up, the board scrolls at the edges; a drop moves the lead / order, otherwise the card glides back. */
  const DRAG = { st: null, justDragged: false, landed: null };
  const colOf = (el) => el && el.closest && el.closest('.kanban .col');
  const colIndex = (col) => Array.prototype.indexOf.call(col.parentNode.children, col);
  function cardInfo(card) {
    if (card.dataset.oid) return { kind: 'order', id: card.dataset.oid };
    const m = /openDeal\((\d+)\)/.exec(card.getAttribute('onclick') || ''); if (!m) return null;
    const d = C.deals[+m[1]]; if (!d || !isOpen(d.raw)) return null;       // won / lost cards stay where they are
    return { kind: 'lead', id: d.lid };
  }
  function dragStart(st, x, y) {
    st.active = true; document.body.classList.add('dragmode');
    const r = st.card.getBoundingClientRect(); st.rect = r; st.dx = x - r.left; st.dy = y - r.top; st.cx = x; st.cy = y;
    const g = st.card.cloneNode(true); g.removeAttribute('onclick'); g.classList.add('ghost'); g.classList.remove('dragging', 'landed');
    g.style.width = r.width + 'px'; g.style.left = '0'; g.style.top = '0'; document.body.appendChild(g); st.ghost = g;
    st.card.classList.add('dragging');
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) {}
    dragMove(st);
    st.raf = requestAnimationFrame(function tick() { if (!st.active) return; const kb = st.card.closest('.kanban'); if (kb) { const kr = kb.getBoundingClientRect(), edge = 70; const v = st.cx < kr.left + edge ? -(kr.left + edge - st.cx) / 5 : st.cx > kr.right - edge ? (st.cx - (kr.right - edge)) / 5 : 0; if (v) { kb.scrollLeft += v; dragMove(st); } } st.raf = requestAnimationFrame(tick); });
  }
  function dragMove(st) {
    st.ghost.style.transform = 'translate3d(' + (st.cx - st.dx) + 'px,' + (st.cy - st.dy) + 'px,0) rotate(1.4deg) scale(1.03)';
    const el = document.elementFromPoint(st.cx, st.cy), col = colOf(el);
    $$('.kanban .col.drop').forEach((c) => { if (c !== col) c.classList.remove('drop'); });
    if (col && col.closest('.kanban') === st.card.closest('.kanban')) col.classList.add('drop');
  }
  function dragCleanup(st) {
    clearTimeout(st.timer); cancelAnimationFrame(st.raf); st.active = false; DRAG.st = null;
    document.body.classList.remove('dragmode'); $$('.kanban .col.drop').forEach((c) => c.classList.remove('drop'));
  }
  function glideBack(st) {
    const g = st.ghost; if (!g) return;
    const a = g.animate([{ transform: g.style.transform }, { transform: 'translate3d(' + st.rect.left + 'px,' + st.rect.top + 'px,0)' }], { duration: 260, easing: 'cubic-bezier(.22,.8,.3,1)' });
    a.onfinish = () => { g.remove(); st.card.classList.remove('dragging'); };
  }
  async function dragEnd(st, cancelled) {
    if (!st) return;
    if (!st.active) { clearTimeout(st.timer); DRAG.st = null; return; }
    const el = document.elementFromPoint(st.cx, st.cy), col = colOf(el), same = col && col === st.card.closest('.col');
    const kb = st.card.closest('.kanban');
    dragCleanup(st); DRAG.justDragged = true; setTimeout(() => { DRAG.justDragged = false; }, 400);
    if (cancelled || !col || same || col.closest('.kanban') !== kb) { glideBack(st); return; }
    const g = st.ghost; g.animate([{ opacity: 0.96 }, { opacity: 0, transform: g.style.transform.replace('scale(1.03)', 'scale(.94)') }], { duration: 180, easing: 'ease-out' }).onfinish = () => g.remove();
    const idx = colIndex(col);
    st.card.classList.remove('dragging');
    if (st.info.kind === 'lead') moveLead(leads.find((x) => x.id === st.info.id), idx); else moveOrder(orders.find((x) => x.id === st.info.id), idx);
  }
  const STAGE_AT = ['new', 'contacted', 'quote_issued', 'negotiation'];
  function moveLead(l, idx) {
    if (!l || idx === STAGE_IDX[l.stage]) return;
    DRAG.landed = l.id;
    if (idx === 4) {
      return dialog({ title: 'Итог по лиду', sub: esc(l.contact_name || ''), body: '<div class="muted">Лид закрыт как заказ или как отказ.</div>',
        foot: [{ label: 'Отмена', run: (c) => c() }, { label: 'Отказ', run: (c) => { c(); curLid = l.id; loseDialog(l); } }, { label: 'Оформить заказ', primary: true, run: async (c) => { c(); curLid = l.id; await act(async () => { await run(sb.from('leads').update({ stage: 'won', next_action: null, next_action_at: null }).eq('id', l.id)); }, 'Заказ оформлен'); landed(); } }] });
    }
    curLid = l.id;
    act(async () => { await run(sb.from('leads').update({ stage: STAGE_AT[idx] }).eq('id', l.id)); }, 'Стадия: ' + STAGE_RU[STAGE_AT[idx]]).then(landed);
  }
  async function moveOrder(o, idx) {
    if (!o || !ORDER_COL[idx] || ORDER_COL[idx][1] === o.stage) return;
    DRAG.landed = o.id;
    try { await run(sb.from('orders').update({ stage: ORDER_COL[idx][1] }).eq('id', o.id)); toast('Этап: ' + ORDER_RU[ORDER_COL[idx][1]]); await refresh(); landed(); } catch (e) { toast(humanError(e), true); }
  }
  function landed() {
    const id = DRAG.landed; DRAG.landed = null; if (!id) return;
    const card = $$('.kanban .kc').find((k) => { const i = cardInfo(k); return i && i.id === id; }) || $$('.kanban .kc[data-oid="' + id + '"]')[0];
    if (card) { card.classList.add('landed'); card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
  }
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = e.target.closest('.kanban .kc'); if (!card) return;
    const info = cardInfo(card); if (!info) return;
    const st = { card, info, x0: e.clientX, y0: e.clientY, pid: e.pointerId, type: e.pointerType, active: false, timer: null };
    DRAG.st = st;
    if (e.pointerType !== 'mouse') st.timer = setTimeout(() => { if (DRAG.st === st) dragStart(st, st.cx != null ? st.cx : st.x0, st.cy != null ? st.cy : st.y0); }, 300);
  });
  document.addEventListener('pointermove', (e) => {
    const st = DRAG.st; if (!st || e.pointerId !== st.pid) return;
    st.cx = e.clientX; st.cy = e.clientY;
    if (!st.active) {
      const dist = Math.hypot(e.clientX - st.x0, e.clientY - st.y0);
      if (st.type === 'mouse') { if (dist > 6) dragStart(st, e.clientX, e.clientY); }
      else if (dist > 10) { clearTimeout(st.timer); DRAG.st = null; }   // the finger is scrolling, not dragging
      return;
    }
    dragMove(st);
  });
  document.addEventListener('pointerup', (e) => { const st = DRAG.st; if (st && e.pointerId === st.pid) { st.cx = e.clientX; st.cy = e.clientY; dragEnd(st, false); } });
  document.addEventListener('pointercancel', (e) => { const st = DRAG.st; if (st && e.pointerId === st.pid) dragEnd(st, true); });
  document.addEventListener('touchmove', (e) => { if (DRAG.st && DRAG.st.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (DRAG.st && DRAG.st.active) e.preventDefault(); });
  document.addEventListener('click', (e) => { if (DRAG.justDragged && e.target.closest('.kanban .kc')) { e.stopPropagation(); e.preventDefault(); } }, true);

  /* ---------- phone tab bar, rail tooltips ---------- */
  const tabbar = $('#tabbar');
  const markTab = (id) => $$('#tabbar a[data-t]').forEach((a) => a.classList.toggle('on', a.dataset.t === id));
  if (tabbar) tabbar.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-t]'); if (!a) return;
    const t = a.dataset.t;
    if (t === 'new') newLeadDialog(); else if (t === 'more') { $('#rail').classList.add('open'); $('#scrim').classList.add('on'); } else C.show(t);
  });
  $$('.rail a').forEach((a) => { const l = a.querySelector('span:nth-child(2)'); if (l) a.title = l.textContent; });

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'db-crm-back') return;
    refresh().then(() => { C.show(curLid ? 'today' : 'leads'); }).catch(() => {});
  });
})();
