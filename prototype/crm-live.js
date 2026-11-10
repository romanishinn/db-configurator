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
  const STAFF = ['manager', 'dealer', 'superdealer', 'superadmin', 'architect'];
  const { $, $$, esc } = C;
  document.documentElement.classList.add('live');

  /* ---------- language ---------- */
  const DICT = window.CRM_I18N || {};
  const curLang = () => (C.lang && C.lang()) || 'ru';
  const _ = (s) => { const l = curLang(); if (l === 'ru') return s; const e = DICT[s]; if (!e) return s; return e[l] != null ? e[l] : (e.en != null ? e.en : s); };
  const LOCALES = { ru: 'ru-RU', en: 'en-GB', de: 'de-AT', hr: 'hr-HR', es: 'es-ES' };
  const LOC = () => LOCALES[curLang()] || 'en-GB';
  // a table of source texts that is translated when read, so a language switch needs no reload
  const L = (o) => new Proxy(o, { get: (t, k) => (typeof t[k] === 'string' ? _(t[k]) : t[k]) });

  /* ---------- vocabulary ---------- */
  const STAGE_IDX = { new: 0, contacted: 1, processing: 1, visit_agreed: 1, consultation: 1, measured: 1, quote_issued: 2, proposal: 2, negotiation: 3, won: 4, lost: 4 };
  const STAGE_RU = L({ new: 'Новый', contacted: 'Связались', processing: 'В обработке', visit_agreed: 'Выезд согласован', consultation: 'Консультация', measured: 'Замер сделан', quote_issued: 'КП выдано', proposal: 'Предложение', negotiation: 'Переговоры', won: 'Заказ', lost: 'Отказ' });
  const stepsL = () => ['Новый', 'В работе', 'Предложение', 'Переговоры', 'Итог'].map(_);
  // the button "Перевести →" moves to the first stage of the next column
  const NEXT_STAGE = { 0: 'contacted', 1: 'quote_issued', 2: 'negotiation', 3: 'won' };
  const ORDER_RU = L({ inbox: 'Входящие', measurement: 'Замер', awaiting_payment: 'Ожидает оплаты', delivery: 'Поставка', in_stock: 'На складе', installation: 'Монтаж', done: 'Выполнено' });
  const ORDER_COL = [['os.inbox', 'inbox'], ['os.measurement', 'measurement'], ['os.payment', 'awaiting_payment'], ['os.delivery', 'delivery'], ['os.instock', 'in_stock'], ['os.installation', 'installation'], ['os.done', 'done']];
  const ROLE_RU = L({ client: 'клиент', seller: 'продавец', manager: 'менеджер', dealer: 'дилер', superdealer: 'суперДилер', superadmin: 'суперадмин', architect: 'архитектор' });
  const HOT = 20; // ASSUMPTION: a lead with 20+ points (quote 10, stage 5, comment 2 …) is "hot"; the points come from the database
  const SOURCES = ['Звонок', 'Сайт', 'Meta', 'Google', 'Рекомендация', 'Выставка', 'Другое'];
  const WANTS = ['Пергола', 'Боковые системы', 'Стекло', 'Пока не знает'];

  /* ---------- state ---------- */
  let sb = null, me = null, orders = [], users = [], groups = [];
  const detail = {};            // lead id -> { events, quotes }
  let chip = 'need', query = '', tab = 'ov', curLid = null, booted = false;

  /* ---------- small helpers ---------- */
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const money = (n) => n == null ? '—' : '€' + Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dmy = (iso) => { if (!iso) return '—'; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString(LOC(), { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const dm = (iso) => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso); return d.toLocaleDateString(LOC(), { day: '2-digit', month: '2-digit' }); };
  const hm = (iso) => new Date(iso).toLocaleString(LOC(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function ago(iso) {
    const m = Math.floor((Date.now() - new Date(iso)) / 6e4);
    if (m < 1) return _('сейчас'); if (m < 60) return m + _(' мин назад');
    const h = Math.floor(m / 60); if (h < 24) return h + _(' ч назад');
    return Math.floor(h / 24) + _(' дн назад');
  }
  const days = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 864e5));
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  const normPhone = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : d; };
  const userName = (id) => { const u = users.find((x) => x.id === id); return u ? (u.full_name || u.email || _('Сотрудник')) : (me && id === me.id ? me.full_name || _('Вы') : _('Сотрудник')); };
  const sees = () => !!me && (me.role === 'superadmin' || me.role === 'superdealer');
  const isAdmin = () => !!me && me.role === 'superadmin';
  const isArch = () => !!me && me.role === 'architect';
  function humanError(e) {
    const m = String((e && (e.message || e.error_description)) || e || '');
    if (/Invalid login/i.test(m)) return _('Неверный e-mail или пароль');
    if (/COMMENT_REQUIRED/.test(m)) return _('Нужен комментарий');
    if (/lost_needs_reason/.test(m)) return _('Укажите причину отказа');
    if (/BAD_ASSIGNEE/.test(m)) return _('Этому человеку лид передать нельзя');
    if (/FORBIDDEN|permission denied|row-level security/i.test(m)) return _('Нет прав на это действие');
    if (/Failed to fetch|NetworkError/i.test(m)) return _('Нет связи с сервером');
    return m || _('Ошибка');
  }

  const skeleton = (n) => '<div class="skel" aria-busy="true"><i class="h"></i>' + '<i></i>'.repeat(n || 6) + '</div>';
  let loaded = false;        // the first data has arrived; until then screens show a placeholder, never demo or "empty" text

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
    (o.foot || [{ label: _('Закрыть'), run: (c) => c() }]).forEach((f) => {
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
  /* ---------- leads come in pages from the server: never "all leads" ----------
   * byId holds every lead row that was loaded (any page, board column or lookup). The Today list and each board
   * column keep only the ids of their pages. The server (lead_page / lead_counts / crm_stats) filters, searches,
   * counts and respects the access rules; the page only asks for what is on the screen. */
  const PAGE = 40, COL_PAGE = 20;
  const byId = new Map();
  const T0 = { rows: [], done: false, busy: false };                       // Today list: ids in server order
  const colD = [0, 1, 2, 3, 4].map(() => ({ ids: [], done: false }));      // board columns
  let counts = null, stats = null, colsLoaded = false, ordersLoaded = false, tgen = 0;
  const pinned = new Set();                                                 // opened from elsewhere: kept in the deal list
  const SRV = { need: 'need', late: 'late', wait: 'wait', all: 'open' };    // chip -> server filter
  const remember = (rows) => (rows || []).map((r) => { byId.set(r.id, r); return r.id; });
  const fetchPage = (chipName, q, offset, limit) => run(sb.rpc('lead_page', { p_chip: chipName, p_q: q || null, p_limit: limit, p_offset: offset }));
  async function loadCounts() { const r = await run(sb.rpc('lead_counts')); counts = (r && r[0]) || null; }
  async function loadToday(reset, limit) {
    if (reset) { tgen++; T0.done = false; } else if (T0.busy || T0.done) return;
    const g = tgen, lim = limit || PAGE, off = reset ? 0 : T0.rows.length;
    T0.busy = true;
    let rows;
    try { rows = await fetchPage(query ? 'all' : SRV[chip], query, off, lim); }          // a search looks through every lead, closed ones too
    catch (e) { if (g === tgen) T0.busy = false; throw e; }
    if (g !== tgen) return;                       // the filter or the search changed meanwhile: this answer is stale
    T0.busy = false;
    const ids = remember(rows);
    if (reset) T0.rows = ids; else { const have = new Set(T0.rows); ids.forEach((i) => { if (!have.has(i)) T0.rows.push(i); }); }
    T0.done = rows.length < lim;
  }
  async function loadCols(reset) {
    await Promise.all(colD.map(async (c, i) => {
      const off = reset ? 0 : c.ids.length, lim = reset ? Math.max(COL_PAGE, Math.min(100, c.ids.length)) : COL_PAGE;
      const rows = await fetchPage('c' + i, null, off, lim);
      const ids = remember(rows);
      if (reset) c.ids = ids; else { const have = new Set(c.ids); ids.forEach((x) => { if (!have.has(x)) c.ids.push(x); }); }
      c.done = rows.length < lim;
    }));
    colsLoaded = true;
  }
  async function loadStats() { try { stats = await run(sb.rpc('crm_stats')); } catch (e) { stats = null; } }

  /* the first page is kept on the device: the next start shows it at once, then the server answers.
   * Personal data of customers: one user, 7 days, removed on sign-out (see docs/backend.md). */
  const CK = 'crm.cache.v1';
  let leaving = false;               // once a sign-out has begun nothing may be written to the device again
  function cacheSave() {
    if (leaving || !me || chip !== 'need' || query) return;
    try { localStorage.setItem(CK, JSON.stringify({ uid: me.id, ts: Date.now(), me: { id: me.id, role: me.role, full_name: me.full_name, email: me.email, org_id: me.org_id, discount_limit: me.discount_limit }, counts, rows: T0.rows.map((id) => byId.get(id)).filter(Boolean).map((r) => Object.assign({}, r, { journey: null })) })); } catch (e) {}
  }
  function cacheLoad() {
    try {
      const c = JSON.parse(localStorage.getItem(CK) || 'null');
      if (!c || !me || c.uid !== me.id || Date.now() - c.ts > 864e5 || !Array.isArray(c.rows)) return false;
      T0.rows = remember(c.rows); T0.done = c.rows.length < PAGE; counts = c.counts || null; return true;
    } catch (e) { return false; }
  }
  const cacheClear = () => { try { localStorage.removeItem(CK); } catch (e) {} };
  const loadOrders = async () => { ordersLoaded = true; try { orders = await run(sb.from('orders').select('id, stage, measured_at, paid, delivery_eta, note, created_at, lead_id, leads(contact_name), quotes(number, total_net)').order('created_at', { ascending: false }).limit(500)); } catch (e) { orders = []; } };
  const loadUsers = async () => { try { users = await run(sb.from('profiles').select('id, role, full_name, email, org_id, discount_limit, active')); } catch (e) { users = []; } };
  let approvals = [];
  const loadApprovals = async () => { try { approvals = await run(sb.from('quote_approvals').select('quote_id, status, created_at, decided_at, comment, quotes(number, total_net, discount, owner, lead_id, leads(contact_name))').order('created_at', { ascending: false }).limit(300)); } catch (e) { approvals = []; } };
  const apprOf = (qid) => approvals.find((a) => a.quote_id === qid);
  const APPR_RU = { pending: ['ждёт утверждения', 'warn'], approved: ['скидка утверждена', 'ok'], rejected: ['скидка отклонена', 'bad'] };
  const apprTag = (qid) => { const a = apprOf(qid); return a ? ' <span class="tag ' + APPR_RU[a.status][1] + '">' + _(APPR_RU[a.status][0]) + '</span>' : ''; };
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
    else if (!raw) { label = { web: _('Сайт'), seller: _('Продавец'), dealer: _('Дилер'), office: _('Офис'), client: _('Клиент') }[l.source] || _('Сайт'); kind = l.source === 'web' ? 'web' : 'other'; }
    else if (low === 'сайт') { kind = 'web'; label = _('Сайт'); }
    else if (SOURCES.includes(raw)) label = _(raw);        // a source picked in the new-lead form is stored in Russian
    return { kind, label, raw };
  }
  const isOpen = (l) => l.stage !== 'won' && l.stage !== 'lost';
  const overdue = (l) => isOpen(l) && !!l.next_action_at && l.next_action_at < today();
  const dueNow = (l) => isOpen(l) && !!l.next_action_at && l.next_action_at <= today();

  function toDeal(l) {
    const name = l.contact_name || l.phone || l.email || _('Без имени'), idx = STAGE_IDX[l.stage] ?? 0, late = overdue(l);
    const sc = l.score || 0;
    return {
      live: true, lid: l.id, raw: l, name, av: initials(name),
      comp: l.assignee_org || '', owner: l.assignee_name || (l.assigned_to ? userName(l.assigned_to) : _('Не назначен')),
      id: l.last_quote ? _('КП ') + l.last_quote : '', score: sc, band: sc >= HOT ? 'hi' : sc >= 8 ? 'mid' : '', hot: sc >= HOT && isOpen(l),
      product: l.object_address || (l.note ? String(l.note).replace(/\s+/g, ' ').slice(0, 48) : '—'),
      dot: late || l.stale ? 'red' : l.stage === 'new' ? 'amber' : isOpen(l) ? 'green' : 'grey',
      statusK: late ? _('Шаг просрочен · ') + (l.next_action || STAGE_RU[l.stage]) : (l.next_action ? l.next_action : STAGE_RU[l.stage]),
      timeK: ago(l.last_activity_at), stage: idx, curDays: days(l.last_activity_at),
      q: { net: l.last_total_net != null ? money(l.last_total_net) : '—' },
    };
  }
  function buildBoards(deals, idxOf) {
    const col = (tK, ix) => {
      const cd = colD[ix];
      const list = cd.ids.map((id) => idxOf.get(id)).filter((i) => i != null).map((i) => ({ d: deals[i], di: i }));
      const total = counts ? (ix === 4 ? Number(counts.won) + Number(counts.lost) : Number(counts['c' + ix])) : list.length;
      const sum = list.reduce((a, x) => a + (Number(x.d.raw.last_total_net) || 0), 0);
      return { tK, key: 'c' + ix, total, more: Math.max(0, total - list.length), sum: sum && total <= list.length ? money(sum) : '', cards: list.map(({ d, di }) => ({ n: d.name, di, sum: d.q.net, sc: d.score, hot: d.hot, stK: d.raw.stage === 'won' || d.raw.stage === 'lost' ? STAGE_RU[d.raw.stage] : (d.raw.next_action || STAGE_RU[d.raw.stage]), dot: d.dot, days: d.curDays, rot: !!d.raw.stale, cold: false })) };
    };
    const req = [col('st.new', 0), col('st.processing', 1), col('st.proposal', 2), col('st.negotiation', 3), col('st.winlose', 4)];
    const ord = ORDER_COL.map(([tK, st]) => {
      const list = orders.filter((o) => o.stage === st);
      const sum = list.reduce((a, o) => a + (Number(o.quotes && o.quotes.total_net) || 0), 0);
      return { tK, sum: sum ? money(sum) : '', cards: list.map((o) => ({ oid: o.id, nOrd: (o.leads && o.leads.contact_name) || _('Заказ'), sum: o.quotes ? money(o.quotes.total_net) : '', stK: o.paid ? _('оплачен') : (o.delivery_eta ? _('поставка ') + dm(o.delivery_eta) : o.measured_at ? _('замер ') + dm(o.measured_at) : ORDER_RU[o.stage]), dot: o.paid ? 'green' : 'amber', days: days(o.created_at) })) };
    });
    return [req, ord];
  }
  C.moreLabel = (n) => _('Показать ещё') + ' · ' + n;

  let todaySet = new Set();
  function rebuild(keepLid) {
    const ids = [], seen = new Set();
    const add = (id) => { if (!seen.has(id) && byId.has(id)) { seen.add(id); ids.push(id); } };
    T0.rows.forEach(add); colD.forEach((c) => c.ids.forEach(add)); pinned.forEach(add); if (curLid) add(curLid);
    const deals = ids.map((id) => toDeal(byId.get(id)));
    const idxOf = new Map(deals.map((d, i) => [d.lid, i]));
    todaySet = new Set(T0.rows);
    const [req, ord] = buildBoards(deals, idxOf);
    let sel = keepLid ? idxOf.get(keepLid) : undefined;
    if (sel == null) { const f = deals.findIndex((d) => todaySet.has(d.lid)); sel = f < 0 ? 0 : f; }
    const rows = $('#rows'), keep = rows ? rows.scrollTop : 0;
    C.setData(deals, req, ord, sel);
    C.rerender();
    if (rows && keep) rows.scrollTop = keep;
    renderChips(); renderBadges();
    if (curScreen() === 'approvals') renderApprovals();
  }
  let sig = '';
  async function refresh(keepLid, force) {
    const keep = Math.min(100, Math.max(PAGE, T0.rows.length));
    await Promise.all([loadCounts(), loadToday(true, keep), loadApprovals(), colsLoaded ? loadCols(true) : null, ordersLoaded ? loadOrders() : null]);
    loaded = true;
    const s = JSON.stringify([counts, T0.rows.map((id) => byId.get(id)), colD.map((c) => c.ids.map((id) => byId.get(id))), orders, approvals]) + curLang();
    if (s === sig && !force) return false;         // nothing changed: do not redraw (no flicker, scroll and typing stay)
    sig = s; stats = null;
    cacheSave();
    rebuild(keepLid === undefined ? curLid : keepLid);
    if (curScreen() === 'quotes') renderQuotes(true);
    if (curScreen() === 'customers') renderCustomers(true);
    if (curScreen() === 'admin') renderAdmin();
    return true;
  }
  const curScreen = () => (($('.screen.on') || {}).dataset || {}).screen;

  /* ---------- Today: filter chips + search (the server does both) ---------- */
  C.filter = (d) => todaySet.has(d.lid);
  function setChip(k) {
    chip = k; T0.rows = []; T0.busy = true; todaySet = new Set(); renderChips(); C.rerender();
    loadToday(true).then(() => rebuild(curLid), (e) => { T0.busy = false; toast(humanError(e), true); C.rerender(); });
  }
  let qTimer = null;
  function setQuery(v) {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      query = v; if (curScreen() !== 'today') C.show('today');
      if (query) chip = 'all';
      T0.rows = []; T0.busy = true; todaySet = new Set(); renderChips(); C.rerender();
      loadToday(true).then(() => rebuild(curLid), (e) => { T0.busy = false; toast(humanError(e), true); C.rerender(); });
    }, 250);
  }
  function renderChips() {
    const box = $('.lh .chips'); if (!box) return;
    if (!loaded || !counts) { box.innerHTML = ''; return; }
    const num = { need: counts.need, late: counts.late, wait: counts.wait, all: counts.open };
    const def = [['need', _('Нужны вам')], ['late', _('Просрочено')], ['wait', _('Ждут клиента')], ['all', _('Все открытые')]];
    box.innerHTML = def.map(([k, t]) => '<button type="button" class="cchip' + (chip === k ? ' on' : '') + '" data-chip="' + k + '"><span class="n">' + Number(num[k]) + '</span> <span>' + t + '</span></button>').join('');
  }
  function renderBadges() {
    const n = counts ? Number(counts.late) : 0;
    const lnk = $('.rail a[data-s="today"]'); if (!lnk) return;
    let b = lnk.querySelector('.badge'); if (!b) { b = document.createElement('span'); b.className = 'badge'; lnk.appendChild(b); }
    b.textContent = n; b.hidden = !n;
    const al = $('.rail a[data-s="approvals"]');
    if (al) { let ab = al.querySelector('.badge'); if (!ab) { ab = document.createElement('span'); ab.className = 'badge'; al.appendChild(ab); } const pn = approvals.filter((a) => a.status === 'pending').length; ab.textContent = pn; ab.hidden = !pn; }
  }
  // "show more" at the end of the Today list: a button, and the same thing when it scrolls into view
  C.rowsFooter = () => (T0.done || !T0.rows.length) ? '' : '<div id="moreRows" class="morerows"><button type="button" class="btn sm ghost" data-more="today">' + _('Показать ещё') + '</button></div>';
  let io = null;
  C.afterRows = () => {
    if (io) { io.disconnect(); io = null; }
    const m = $('#moreRows'); if (!m || !('IntersectionObserver' in window)) return;
    io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) more('today'); }, { root: $('#rows'), rootMargin: '200px' });
    io.observe(m);
  };
  async function more(what) {
    if (what === 'today') { try { await loadToday(false); rebuild(curLid); } catch (e) { toast(humanError(e), true); } return; }
    const i = +String(what).slice(1); if (!(i >= 0 && i <= 4)) return;
    const cd = colD[i]; if (cd.done) return;
    try {
      const rows = await fetchPage('c' + i, null, cd.ids.length, COL_PAGE);
      const have = new Set(cd.ids); remember(rows).forEach((x) => { if (!have.has(x)) cd.ids.push(x); }); cd.done = rows.length < COL_PAGE;
      rebuild(curLid);
    } catch (e) { toast(humanError(e), true); }
  }
  C.emptyList = () => {
    if (!loaded || T0.busy) return skeleton(5);
    const empty = counts ? Number(counts.open) + Number(counts.won) + Number(counts.lost) === 0 : !T0.rows.length;
    return '<div class="empty" style="height:auto;padding:48px 18px"><div class="ic">✓</div><div>' + (empty ? _('Пока нет ни одного лида.<br><span class="muted">Заявки с сайта появятся здесь сами. Или добавьте первого клиента вручную.</span>') : _('В этом списке пусто.<br><span class="muted">Переключите фильтр или очистите поиск.</span>')) + _('</div><button class="btn primary" data-act="newlead">＋ Новый лид</button></div>');
  };
  C.emptyRecord = () => !loaded ? skeleton(4) : _('<div class="empty"><div class="ic">◍</div><div>Выберите лид слева<br><span class="muted">или создайте нового кнопкой «Новый лид»</span></div></div>');

  /* ---------- login / boot ---------- */
  C.login = async (email, pass, status, done) => {
    status.className = 'gstatus'; status.textContent = '…';
    if (!(await ready)) { status.textContent = _('Сервер недоступен'); status.className = 'gstatus warn'; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { status.textContent = humanError(error); status.className = 'gstatus warn'; return; }
    me = await loadMe();
    if (!me || !STAFF.includes(me.role)) { status.textContent = _('Нет доступа: этот вход не для CRM'); status.className = 'gstatus warn'; await sb.auth.signOut(); me = null; return; }
    status.textContent = ''; done(); await boot();
  };
  C.requestAccess = async (row, status, done) => {
    if (!(await ready)) { status.textContent = _('Сервер недоступен'); status.className = 'gstatus warn'; return; }
    const { error } = await sb.from('access_requests').insert(row);
    if (error) { status.textContent = humanError(error); status.className = 'gstatus warn'; return; }
    done();
  };
  async function signOut() { leaving = true; cacheClear(); try { await sb.auth.signOut(); } catch (e) {} cacheClear(); location.reload(); }

  function chrome() {
    if (!me) return;
    const nm = me.full_name || me.email || _('Пользователь');
    const av = $('.rail .me .av'); if (av) av.textContent = initials(nm);
    const box = $('.rail .me > div'); if (box) box.innerHTML = '<div style="font-size:12.5px">' + esc(nm) + '</div><small>' + esc(ROLE_RU[me.role] || me.role) + '</small>';
    // a real "log out" item at the bottom of the rail: full label on desktop and in the phone drawer ("Ещё"), icon only on a tablet
    let lo = $('#logout');
    if (!lo) { const rail = $('#rail'); if (rail) { lo = document.createElement('a'); lo.id = 'logout'; lo.href = '#'; lo.setAttribute('role', 'button'); lo.style.marginTop = '4px'; lo.innerHTML = '<span class="ic" aria-hidden="true">⎋</span><span></span>'; rail.appendChild(lo); } }
    if (lo) { lo.querySelector('span:nth-child(2)').textContent = _('Выйти'); lo.title = _('Выйти'); lo.setAttribute('aria-label', _('Выйти')); lo.onclick = (e) => { e.preventDefault(); signOut(); }; }
    const l = $('#newCalcBtn .lbl'); if (l) l.textContent = _(' Новый лид');
    $$('.rail a').forEach((a) => { const t = a.querySelector('span:nth-child(2)'); if (t) a.title = t.textContent; });
  }
  function applyRole() {
    const set = (sel, on) => $$(sel).forEach((e) => { e.hidden = !on; e.style.display = on ? '' : 'none'; });
    set('.rail a[data-s="approvals"]', isAdmin());
    set('.rail a[data-s="orders"]', !isArch());              // an architect works with his own projects and quotes only
    set('.rail a[data-s="admin"]', sees());
    set('.rail a[data-s="settings"]', isAdmin());
    const grp = $('.rail .grp'); if (grp) { grp.hidden = !sees(); grp.style.display = sees() ? '' : 'none'; }
    // top button: new lead (the configurator has its own menu item)
    const nb = $('#newCalcBtn');
    if (nb) { const c = nb.cloneNode(true); nb.replaceWith(c); const l = c.querySelector('.lbl'); if (l) l.removeAttribute('data-i18n'); c.addEventListener('click', () => newLeadDialog()); }
    chrome();
    // demo-only things that have no data behind them
    const seg = $('.board-top .seg'); if (seg) seg.style.display = 'none';
    $$('.board-top .pill').forEach((p) => { p.style.display = 'none'; });
    const ta = $$('.lh .r .btn')[0]; if (ta) ta.style.display = 'none';
  }

  async function boot() {
    if (booted) return; booted = true;
    applyRole();
    if (cacheLoad()) { loaded = true; rebuild(null); }       // the saved first page, at once; the server answers next
    await Promise.all([loadUsers(), loadGroups()]);
    try { await refresh(null, true); } catch (e) { loaded = true; T0.busy = false; toast(humanError(e), true); C.rerender(); }
    renderChips(); C.onShow(curScreen());
    pollNotifications(); pollChanges();
    setInterval(() => { pollNotifications(); pollChanges(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pollChanges(); });
    const h = location.hash.replace('#', ''); if (h) C.onShow(h);
  }

  // a stored session is being restored: keep the login screen out of sight meanwhile
  try { if (Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))) document.documentElement.classList.add('restoring'); } catch (e) {}
  const unrestore = () => document.documentElement.classList.remove('restoring');
  // start: demo data must never show when the backend is on
  C.setData([], buildBoards([])[0], buildBoards([])[1]);
  ['admin', 'quotes', 'customers', 'approvals'].forEach((id) => setScreen(id, skeleton()));
  { const st = $('[data-screen="settings"]'); if (st) { st.classList.add('loading'); st.insertAdjacentHTML('afterbegin', skeleton(5)); } }
  C.rerender(); renderChips();
  ready.then(async (ok) => {
    if (!ok) { unrestore(); return; }
    // a warm start: the stored session and the saved first page are enough to draw the app at once; the server confirms in the background
    let early = null;
    try { const { data: { session } } = await sb.auth.getSession(); const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (session && c && c.me && c.uid === session.user.id && Date.now() - c.ts < 864e5 && STAFF.includes(c.me.role)) early = c.me; } catch (e) {}
    if (early) {
      me = early; unrestore(); document.body.classList.add('authed'); boot();
      loadMe().then((m) => { if (!m || !STAFF.includes(m.role) || m.role !== early.role) { cacheClear(); location.reload(); } else me = m; }, () => {});
      sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { leaving = true; cacheClear(); location.reload(); } });
      return;
    }
    me = await loadMe();
    unrestore();
    if (me && STAFF.includes(me.role)) { document.body.classList.add('authed'); await boot(); }
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { leaving = true; cacheClear(); if (booted) location.reload(); } });
  });

  /* ---------- lead card ---------- */
  const tel = (p) => String(p || '').replace(/[^\d+]/g, '');
  const waNum = (p) => { const s = String(p || '').trim(); if (/^\+/.test(s)) return s.replace(/\D/g, ''); if (/^00/.test(s)) return s.replace(/\D/g, '').slice(2); return ''; };
  const mapUrl = (a) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);

  function evText(e) {
    switch (e.kind) {
      case 'created': return _('Лид создан');
      case 'assigned': return _('Назначен: ') + userName(e.to_user) + (e.comment ? ' — ' + e.comment : '');
      case 'transferred': return _('Передан: ') + userName(e.to_user) + (e.comment ? ' — ' + e.comment : '');
      case 'stage': return _('Стадия: ') + (STAGE_RU[e.from_stage] || '—') + ' → ' + (STAGE_RU[e.to_stage] || '—') + (e.comment ? ' — ' + e.comment : '');
      case 'comment': return evComment(e.comment);
      case 'quote': return _('Выставлено КП') + (e.comment ? ' ' + e.comment : '');
      default: return e.kind;
    }
  }
  // texts the database writes itself start with a fixed Russian phrase: translate the phrase, keep the rest
  const NTF = ['Скидка выше лимита, нужно утверждение: КП ', 'Скидка утверждена: КП ', 'Скидка отклонена: КП ', 'Лид передан дальше: ', 'Новая заявка: ', 'Вам передан лид'];
  const ntfText = (t) => { t = String(t || ''); for (const p of NTF) if (t.startsWith(p)) return _(p) + t.slice(p.length); return t; };
  const evComment = (c) => { c = String(c || ''); const m = /^Скидка по КП (\S+) (утверждена|отклонена: [\s\S]*)$/.exec(c); if (!m) return c; return m[2] === 'утверждена' ? _('Скидка по КП ') + m[1] + _(' утверждена') : _('Скидка по КП ') + m[1] + _(' отклонена: ') + m[2].slice('отклонена: '.length); };
  const feedHtml = (evs, n) => (evs || []).slice(0, n || 99).map((e) => '<div class="fe' + (e.kind === 'comment' ? '' : '') + '"><div style="white-space:pre-wrap;word-break:break-word">' + (e.kind === 'comment' ? '💬 ' : '') + esc(evText(e)) + '</div><div class="who">' + esc(e.by ? userName(e.by) : _('система')) + ' · ' + hm(e.at) + '</div></div>').join('') || _('<div class="muted" style="padding:6px 0">Событий пока нет</div>');

  function utmHtml(l) {
    const u = l.utm || {}, keys = Object.keys(u).filter((k) => u[k]);
    if (!keys.length) return '';
    return _('<details class="jr"><summary>Откуда пришёл — подробно</summary><div style="margin-top:8px">') + keys.map((k) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v" style="word-break:break-all">' + esc(String(u[k]).length > 90 ? String(u[k]).slice(0, 90) + '…' : u[k]) + '</span></div>').join('') + '</div></details>';
  }

  C.renderLive = (d, wrap) => {
    const l = d.raw;
    if (curLid !== l.id) { curLid = l.id; tab = 'ov'; }
    const same = wrap.dataset.lid === l.id;
    const keepScroll = same ? ((wrap.querySelector('.rbody') || {}).scrollTop || 0) : 0;
    const keepNote = same && $('#noteTxt', wrap) ? $('#noteTxt', wrap).value : '';
    const hadFocus = same && document.activeElement && document.activeElement.id === 'noteTxt';
    wrap.classList.toggle('fresh', !same); wrap.dataset.lid = l.id;
    if (!same) { clearTimeout(wrap._ft); wrap._ft = setTimeout(() => wrap.classList.remove('fresh'), 420); }
    const dt = detail[l.id];
    if (!dt) loadDetail(l.id).then(() => { if (curLid === l.id) C.rerenderRecord(); }).catch((e) => toast(humanError(e), true));
    const src = srcInfo(l), late = overdue(l), open = isOpen(l), idx = d.stage;
    const mine = l.assigned_to && me && l.assigned_to === me.id;
    const stepNames = stepsL();
    const steps = stepNames.map((t, i) => {
      const cls = l.stage === 'won' ? 'cv done' : i < idx ? 'cv done' : i === idx ? 'cv now' : 'cv';
      const small = i === idx ? '<small>' + (l.stage === 'lost' ? _('Отказ · ') : l.stage === 'won' ? _('Заказ · ') : (STAGE_RU[l.stage] !== stepNames[i] ? STAGE_RU[l.stage] + ' · ' : '')) + d.curDays + _(' дн</small>') : '';
      return '<div class="' + cls + '"><span>' + t + '</span>' + small + '</div>';
    }).join('');
    let own = '';
    if (open) own = !l.assigned_to ? (sees() ? _('<button class="btn sm" data-act="take">Взять себе</button>') : '') : (mine || sees() ? _('<button class="btn sm" data-act="transfer">Передать</button>') : '');
    const next = open && NEXT_STAGE[idx] ? _('<button class="btn primary sm" data-act="advance">Перевести → ') + esc(NEXT_STAGE[idx] === 'won' ? _('Заказ') : STAGE_RU[NEXT_STAGE[idx]]) + '</button>' : '';
    const lose = open ? _('<button class="btn sm" data-act="lose">Отказ</button>') : _('<button class="btn sm" data-act="reopen">Вернуть в работу</button>');
    const wa = waNum(l.phone);
    const contacts = (l.phone ? '<a href="tel:' + esc(tel(l.phone)) + '">📞 ' + esc(l.phone) + '</a>' : '') + (wa ? '<a href="https://wa.me/' + wa + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') + (l.email ? '<a href="mailto:' + esc(l.email) + '">✉ ' + esc(l.email) + '</a>' : '') + (l.object_address ? '<a href="' + esc(mapUrl(l.object_address)) + _('" target="_blank" rel="noopener">📍 Карта</a>') : '');

    const nextBlock = (l.next_action || l.next_action_at)
      ? '<div class="task"><span class="i">' + (late ? '⏰' : '📞') + '</span><div class="t"><b>' + esc(l.next_action || _('Следующий шаг')) + '</b><div class="' + (late ? 'late' : '') + '">' + (l.next_action_at ? (late ? _('Просрочено · ') : _('До ')) + dmy(l.next_action_at) : _('Срок не задан')) + '</div></div>' + (open ? _('<button class="go" data-act="done">Готово</button><button class="go" data-act="setnext" style="color:var(--muted)">Изменить</button>') : '') + '</div>'
      : _('<div class="task"><span class="i">＋</span><div class="t"><b>Следующий шаг не задан</b><div>Лид без шага «забывают» — назначьте звонок или встречу</div></div>') + (open ? _('<button class="go" data-act="setnext">Задать шаг</button>') : '') + '</div>';

    const brief = '<div class="brief">'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="src ' + src.kind + '">' + esc(src.label) + _('</span><span class="muted">пришёл ') + esc(ago(l.created_at)) + '</span>' + (d.hot ? '<span class="hotchip">🔥 HOT</span>' : '') + (l.stale ? _('<span class="tag bad">без движения 7+ дн</span>') : '') + '</div>'
      + _('<div><div class="lb">Чего хочет</div><div class="msg">') + (l.note ? esc(l.note) : _('<span class="muted">Сообщения нет — спросите по телефону</span>')) + '</div></div>'
      + (l.object_address ? _('<div><div class="lb">Объект</div><div>') + esc(l.object_address) + '</div></div>' : '')
      + (src.raw && src.raw !== src.label && !SOURCES.includes(src.raw) ? _('<div><div class="lb">Источник</div><div style="word-break:break-all">') + esc(src.raw) + '</div></div>' : '')
      + utmHtml(l)
      + (l.journey ? _('<details class="jr"><summary>Что клиент делал в конфигураторе</summary><pre>') + esc(l.journey) + '</pre></details>' : '')
      + '</div>';

    let tabBody = '';
    const evs = dt && dt.events, qs = dt && dt.quotes;
    if (tab === 'ov') {
      tabBody = kv(_('Телефон'), l.phone ? '<a href="tel:' + esc(tel(l.phone)) + '" style="color:inherit">' + esc(l.phone) + '</a>' : '—') + kv('E-mail', l.email ? '<a href="mailto:' + esc(l.email) + '" style="color:inherit">' + esc(l.email) + '</a>' : '—')
        + kv(_('Адрес объекта'), esc(l.object_address || '—') + (l.postcode ? ' · ' + esc(l.postcode) : '')) + kv(_('Ответственный'), esc(d.owner) + (d.comp ? ' · ' + esc(d.comp) : '')) + kv(_('Создан'), dmy(l.created_at))
        + (l.stage === 'lost' ? kv(_('Причина отказа'), esc(l.lost_reason || '—')) : '')
        + _('<div id="dupHint"></div><h4 class="ovhead">Недавняя активность</h4><div class="feed">') + (evs ? feedHtml(evs, 5) : _('<div class="muted">Загрузка…</div>')) + '</div>'
        + _('<div style="margin-top:14px"><button class="btn sm" data-act="edit">✎ Править данные клиента</button></div>');
    } else if (tab === 'q') {
      tabBody = !qs ? _('<div class="muted">Загрузка…</div>') : qs.length ? qs.map((q) => '<div class="vrow"><span>' + esc(q.number) + '</span><span class="d">' + dmy(q.created_at) + _(' · до ') + dmy(q.valid_until) + apprTag(q.id) + '</span><span class="s tab-num">' + money(q.total_net) + '</span><button class="btn sm" data-act="openq" data-q="' + q.id + _('">Открыть</button></div>')).join('') : _('<div class="muted">КП ещё нет. Нажмите «Рассчитать КП».</div>');
    } else if (tab === 'hist') {
      tabBody = '<div class="feed">' + (evs ? feedHtml(evs) : _('<div class="muted">Загрузка…</div>')) + '</div>';
    } else {
      tabBody = _('<div class="fld"><label for="noteTxt">Заметка (видна всем, кто видит лид)</label><textarea id="noteTxt" placeholder="Что обсудили, что обещали…"></textarea></div><div style="margin:8px 0 14px"><button class="btn primary sm" data-act="comment">Добавить заметку</button></div><div class="feed">') + (evs ? feedHtml(evs.filter((e) => e.kind === 'comment')) : '') + '</div>';
    }
    const tabs = [['ov', _('Обзор')], ['q', _('КП') + (qs ? ' (' + qs.length + ')' : '')], ['hist', _('История')], ['notes', _('Заметки')]].map(([k, t]) => '<div class="t' + (tab === k ? ' on' : '') + '" role="tab" tabindex="0" data-tab="' + k + '">' + t + '</div>').join('');

    const lq = qs && qs[0];
    const qpanel = '<div class="qpanel"><div class="qcard"><div class="b">'
      + (lq ? '<div class="tot"><span class="big tab-num">' + money(lq.total_net) + _('</span><small>нетто · КП ') + esc(lq.number) + '</small></div>' + (apprOf(lq.id) ? '<div style="margin:-4px 0 8px">' + apprTag(lq.id) + '</div>' : '') + _('<div class="qmeta"><div class="l"><span>Создано</span><b>') + dmy(lq.created_at) + _('</b></div><div class="l"><span>Действует</span><b>до ') + dmy(lq.valid_until) + '</b></div>' + (qs.length > 1 ? _('<div class="l"><span>Версий</span><b>') + qs.length + '</b></div>' : '') + '</div>'
        + '<div class="qbtns"><button class="btn primary sm wide" data-act="openq" data-q="' + lq.id + _('">Открыть / исправить КП</button></div>')
        : '<div class="tot"><span class="big tab-num">—</span><small>' + (qs ? _('КП ещё не рассчитано') : _('Загрузка…')) + '</small></div>')
      + '<div class="qbtns"><button class="btn ' + (lq ? '' : 'primary ') + _('sm wide" data-act="newq">＋ Рассчитать ') + (lq ? _('новое ') : '') + _('КП</button></div>')
      + '</div></div></div>';

    wrap.innerHTML = _('<div class="rhead"><button class="btn sm ghost back" id="recBack">← Назад</button><div class="top"><div class="idn"><h2>') + esc(d.name) + (d.hot ? ' <span class="hotchip">🔥 HOT</span>' : '') + '</h2><div class="meta"><span>' + esc(d.owner) + '</span>' + (d.id ? '<span>' + esc(d.id) + '</span>' : '') + '<span>' + esc(STAGE_RU[l.stage]) + '</span></div><div class="contact">' + contacts + '</div></div><div class="acts">' + own + lose + next + '</div></div><div class="stages">' + steps + '</div></div>'
      + '<div class="rbody"><div class="rmain">' + brief + _('<div class="upnext"><div class="uh"><span>Следующий шаг</span></div>') + nextBlock + '</div><div class="tabs" role="tablist">' + tabs + '</div>' + tabBody + '</div>' + qpanel + '</div>';
    const back = $('#recBack', wrap); if (back) back.onclick = () => $('#split').classList.remove('show-rec');
    if (tab === 'ov') dupHint(l);
    const nt = $('#noteTxt', wrap); if (nt && keepNote) { nt.value = keepNote; if (hadFocus) nt.focus(); }
    const rb = wrap.querySelector('.rbody'); if (rb && keepScroll) rb.scrollTop = keepScroll;
  };
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';

  async function dupHint(l) {
    const key = normPhone(l.phone), em = (l.email || '').toLowerCase();
    const q = key.length >= 7 ? key : em; if (!q) return;
    let other;
    try { other = (await fetchPage('all', q, 0, 6)).filter((x) => x.id !== l.id); } catch (e) { return; }
    const box = $('#dupHint'); if (!box || curLid !== l.id || !other.length) return;
    remember(other);
    box.innerHTML = _('<div class="dup" style="margin-top:12px"><b>Этот клиент уже обращался (') + other.length + ')</b>' + other.slice(0, 4).map((x) => '<div><a href="#" data-open="' + x.id + '" style="color:var(--accent)">' + esc(x.contact_name || x.phone) + '</a> · ' + esc(STAGE_RU[x.stage]) + ' · ' + dmy(x.created_at) + '</div>').join('') + '</div>';
  }

  /* ---------- actions on the card ---------- */
  const curLead = () => byId.get(curLid);
  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); const lid = curLid, old = JSON.stringify(detail[lid]); await refresh(lid, true); await loadDetail(lid, true); if (curLid === lid && JSON.stringify(detail[lid]) !== old) C.rerenderRecord(); } catch (e) { toast(humanError(e), true); }
  }
  function nextDialog(l) {
    dialog({
      title: _('Следующий шаг'), sub: esc(l.contact_name || ''),
      body: _('<div class="fld"><label>Что сделать</label><input class="inp" name="t" value="') + esc(l.next_action || _('Позвонить')) + _('" autofocus></div><div class="fld"><label>Когда</label><input class="inp" type="date" name="d" value="') + esc(l.next_action_at || plusDays(1)) + '"></div><div class="chips2" data-quick>' + [[_('Сегодня'), 0], [_('Завтра'), 1], [_('Через 3 дня'), 3], [_('Через неделю'), 7]].map(([t, n]) => '<button type="button" data-n="' + n + '">' + t + '</button>').join('') + '</div>',
      onOpen: (r) => r.querySelector('[data-quick]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) r.querySelector('[name=d]').value = plusDays(+b.dataset.n); }),
      foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Сохранить'), primary: true, run: async (c, r) => { const t = val(r, 't').trim(), d = val(r, 'd'); if (!t) return toast(_('Напишите, что сделать'), true); await act(async () => { await run(sb.from('leads').update({ next_action: t, next_action_at: d || null }).eq('id', l.id)); }, _('Шаг сохранён')); c(); } }],
    });
  }
  function loseDialog(l) {
    const reasons = [_('Дорого'), _('Выбрал другого'), _('Не сейчас'), _('Нет связи'), _('Дубль'), _('Спам')];
    dialog({
      title: _('Отказ: ') + (l.contact_name || ''), sub: _('Причина обязательна — по ней потом видно, где мы теряем клиентов.'),
      body: '<div class="chips2" data-r>' + reasons.map((r) => '<button type="button">' + r + '</button>').join('') + _('</div><div class="fld"><label>Причина</label><input class="inp" name="r" placeholder="Выберите выше или напишите своё" autofocus></div>'),
      onOpen: (root) => root.querySelector('[data-r]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) root.querySelector('[name=r]').value = b.textContent; }),
      foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Отметить отказ'), primary: true, run: async (c, r) => { const t = val(r, 'r').trim(); if (!t) return toast(_('Укажите причину'), true); await act(async () => { await run(sb.from('leads').update({ stage: 'lost', lost_reason: t, next_action: null, next_action_at: null }).eq('id', l.id)); }, _('Лид закрыт: отказ')); c(); } }],
    });
  }
  function transferDialog(l) {
    const cands = users.filter((u) => ['manager', 'dealer'].includes(u.role) && u.active !== false && u.id !== (me && me.id));
    if (!cands.length) return toast(_('Нет сотрудников, которым можно передать лид'), true);
    dialog({
      title: _('Передать лид'), sub: esc(l.contact_name || ''),
      body: _('<div class="fld"><label>Кому</label><select class="inp" name="u">') + cands.map((u) => '<option value="' + u.id + '">' + esc((u.full_name || u.email) + ' — ' + (ROLE_RU[u.role] || u.role)) + '</option>').join('') + _('</select></div><div class="fld"><label>Комментарий (обязательно)</label><textarea name="c" placeholder="Что важно знать тому, кто возьмёт лид" autofocus></textarea></div>'),
      foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Передать'), primary: true, run: async (c, r) => { const t = val(r, 'c').trim(); if (!t) return toast(_('Нужен комментарий'), true); await act(async () => { await run(sb.rpc('transfer_lead', { p_lead: l.id, p_to: val(r, 'u'), p_comment: t })); }, _('Лид передан')); c(); } }],
    });
  }
  function editDialog(l) {
    dialog({
      title: _('Данные клиента'),
      body: _('<div class="fld"><label>Имя</label><input class="inp" name="n" value="') + esc(l.contact_name || '') + _('"></div><div class="fld"><label>Телефон</label><input class="inp" type="tel" name="p" value="') + esc(l.phone || '') + '"></div><div class="fld"><label>E-mail</label><input class="inp" type="email" name="e" value="' + esc(l.email || '') + _('"></div><div class="fld"><label>Адрес объекта</label><input class="inp" name="a" value="') + esc(l.object_address || '') + _('"></div><div class="fld"><label>Индекс</label><input class="inp" name="z" value="') + esc(l.postcode || '') + '"></div>',
      foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Сохранить'), primary: true, run: async (c, r) => { const n = val(r, 'n').trim(), p = val(r, 'p').trim(), e = val(r, 'e').trim(); if (!n && !p && !e) return toast(_('Нужны имя, телефон или e-mail'), true); await act(async () => { await run(sb.from('leads').update({ contact_name: n || null, phone: p || null, email: e || null, object_address: val(r, 'a').trim() || null, postcode: val(r, 'z').trim() || null }).eq('id', l.id)); }, _('Сохранено')); c(); } }],
    });
  }
  function handoff(l, q) {
    try { localStorage.setItem('db.handoff', JSON.stringify({ leadId: l.id, leadName: l.contact_name || l.phone || '', quoteId: q ? q.id : null, quoteNo: q ? q.number : null, config: q ? q.config : null, ts: Date.now() })); } catch (e) {}
    openConfigurator(true);
  }
  function openConfigurator(model) {
    const f = $('#cfgFrame'); if (!f) return;
    f.setAttribute('data-lang', C.lang());
    f.setAttribute('src', 'configurator.html?' + (model ? 'model&' : '') + 'lang=' + C.cfgLang());
    C.show('configurator');
  }

  document.addEventListener('click', (e) => {
    const chipEl = e.target.closest('[data-chip]');
    if (chipEl) { setChip(chipEl.dataset.chip); return; }
    const mo = e.target.closest('[data-more]'); if (mo) { more(mo.dataset.more); return; }
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
    if (act0 === 'take') return act(async () => { await run(sb.rpc('assign_lead', { p_lead: l.id, p_to: me.id, p_comment: _('Взял в работу') })); }, _('Лид теперь ваш'));
    if (act0 === 'transfer') return transferDialog(l);
    if (act0 === 'lose') return loseDialog(l);
    if (act0 === 'reopen') return act(async () => { await run(sb.from('leads').update({ stage: 'processing', lost_reason: null }).eq('id', l.id)); }, _('Лид снова в работе'));
    if (act0 === 'advance') {
      const to = NEXT_STAGE[STAGE_IDX[l.stage]];
      const go = () => act(async () => { await run(sb.from('leads').update({ stage: to }).eq('id', l.id)); }, _('Стадия: ') + STAGE_RU[to]);
      if (to === 'won') return dialog({ title: _('Оформить заказ?'), sub: _('Лид станет клиентом, а в «Заказах» появится карточка.'), foot: [{ label: _('Нет'), run: (c) => c() }, { label: _('Оформить заказ'), primary: true, run: async (c) => { await go(); c(); } }] });
      return go();
    }
    if (act0 === 'setnext') return nextDialog(l);
    if (act0 === 'done') return act(async () => {
      const txt = _('Шаг выполнен: ') + (l.next_action || _('шаг'));
      await run(sb.rpc('comment_lead', { p_lead: l.id, p_comment: txt }));
      await run(sb.from('leads').update({ next_action: null, next_action_at: null }).eq('id', l.id));
    }, _('Готово. Назначьте следующий шаг')).then(() => { const nl = curLead(); if (nl && isOpen(nl)) nextDialog(nl); });
    if (act0 === 'edit') return editDialog(l);
    if (act0 === 'comment') { const t = ($('#noteTxt') || {}).value || ''; if (!t.trim()) return toast(_('Напишите заметку'), true); return act(async () => { await run(sb.rpc('comment_lead', { p_lead: l.id, p_comment: t.trim() })); }, _('Заметка добавлена')); }
    if (act0 === 'newq') return handoff(l, null);
    if (act0 === 'openq') { const q = ((detail[l.id] || {}).quotes || []).find((x) => x.id === a.dataset.q); return handoff(l, q || null); }
  });

  async function openLead(id) {
    if (!byId.has(id)) {
      try { const r = await run(sb.from('lead_board').select('*').eq('id', id).limit(1)); if (!r.length) return toast(_('Лид не найден'), true); remember(r); } catch (e) { return toast(humanError(e), true); }
    }
    pinned.add(id); curLid = id; rebuild(id);
    const i = C.deals.findIndex((d) => d.lid === id); if (i >= 0) C.open(i);
  }

  /* ---------- new lead ---------- */
  function newLeadDialog(pre) {
    pre = pre || {};
    let srcSel = 'Звонок', wantSel = [];
    const d = dialog({
      title: _('Новый лид'), sub: _('Достаточно телефона или имени — остальное можно дописать позже.'),
      body: _('<div class="fld"><label>Телефон</label><input class="inp" type="tel" inputmode="tel" name="p" autocomplete="off" placeholder="+43 660 …" value="') + esc(pre.phone || '') + '" autofocus></div><div id="dupBox"></div>'
        + _('<div class="fld"><label>Имя</label><input class="inp" name="n" autocomplete="off" value="') + esc(pre.name || '') + '"></div>'
        + _('<div class="fld"><label>Что интересует</label><div class="chips2" data-want>') + WANTS.map((w) => '<button type="button">' + _(w) + '</button>').join('') + '</div></div>'
        + _('<div class="fld"><label>Заметка</label><textarea name="note" rows="2" placeholder="Что сказал клиент, когда удобно звонить…"></textarea></div>')
        + _('<div class="fld"><label>Откуда клиент</label><div class="chips2" data-src>') + SOURCES.map((s) => '<button type="button" data-v="' + s + '" class="' + (s === srcSel ? 'on' : '') + '">' + _(s) + '</button>').join('') + '</div></div>'
        + _('<details class="jr"><summary>Ещё: e-mail, адрес, следующий шаг</summary><div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">')
        + _('<div class="fld"><label>E-mail</label><input class="inp" type="email" name="e" autocomplete="off"></div><div class="fld"><label>Адрес объекта</label><input class="inp" name="a" autocomplete="off"></div><div class="fld"><label>Индекс</label><input class="inp" name="z" inputmode="numeric" autocomplete="off"></div>')
        + _('<div class="fld"><label>Следующий шаг</label><input class="inp" name="t" value="Позвонить"></div><div class="fld"><label>Когда</label><input class="inp" type="date" name="d" value="') + plusDays(1) + '"></div></div></details>',
      onOpen: (r) => {
        r.querySelector('[data-want]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; b.classList.toggle('on'); wantSel = $$('[data-want] .on', r).map((x) => x.textContent); });
        r.querySelector('[data-src]').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('[data-src] button', r).forEach((x) => x.classList.remove('on')); b.classList.add('on'); srcSel = b.dataset.v; });
        let dupT = null;
        const check = () => {
          clearTimeout(dupT);
          dupT = setTimeout(async () => {
            const p = normPhone(val(r, 'p')), em = val(r, 'e').trim().toLowerCase();
            const q = p.length >= 7 ? p : (/@/.test(em) ? em : ''), box = r.querySelector('#dupBox'); if (!box) return;
            if (!q) { box.innerHTML = ''; return; }
            let hit = null; try { hit = (await fetchPage('all', q, 0, 3))[0]; } catch (e) { return; }
            if (!r.isConnected) return; remember(hit ? [hit] : []);
            box.innerHTML = hit ? _('<div class="dup"><div><b>Такой клиент уже есть:</b> ') + esc(hit.contact_name || hit.phone) + ' · ' + esc(STAGE_RU[hit.stage]) + (hit.assignee_name ? ' · ' + esc(hit.assignee_name) : '') + '</div><div class="a"><button type="button" class="btn sm primary" data-existing="' + hit.id + _('">Открыть его карточку</button><span class="muted" style="align-self:center">или нажмите «Создать» — это будет новое обращение</span></div></div>') : '';
          }, 300);
        };
        r.querySelector('[name=p]').addEventListener('input', check); r.querySelector('[name=e]').addEventListener('input', check);
        r.addEventListener('click', (e) => { const x = e.target.closest('[data-existing]'); if (x) { d.close(); openLead(x.dataset.existing); } });
        r.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); r.querySelector('.foot .primary').click(); } });
        check();
      },
      foot: [
        { label: _('Отмена'), run: (c) => c() },
        { label: _('Создать'), primary: true, run: (c, r) => saveNew(c, r, false) },
        { label: _('Создать и рассчитать КП'), run: (c, r) => saveNew(c, r, true) },
      ],
    });
    async function saveNew(close, r, withQuote) {
      const name = val(r, 'n').trim(), phone = val(r, 'p').trim(), email = val(r, 'e').trim();
      if (!name && !phone && !email) { toast(_('Введите телефон или имя'), true); return; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast(_('Проверьте e-mail'), true); return; }
      const addr = val(r, 'a').trim(), zip = val(r, 'z').trim() || ((addr.match(/\b\d{4}\b/) || [null])[0]);
      const note = [wantSel.length ? _('Интересует: ') + wantSel.join(', ') : '', val(r, 'note').trim()].filter(Boolean).join('\n');
      const step = val(r, 't').trim();
      try {
        const row = await run(sb.from('leads').insert({ created_by: me.id, source: me.role === 'dealer' ? 'dealer' : me.role === 'manager' ? 'manager' : 'office', utm: { source: srcSel }, contact_name: name || null, phone: phone || null, email: email || null, object_address: addr || null, postcode: zip || null, note: note || null, next_action: step || null, next_action_at: step ? (val(r, 'd') || plusDays(1)) : null }).select('id').single());
        if (sees()) { try { await run(sb.rpc('assign_lead', { p_lead: row.id, p_to: me.id, p_comment: _('Создал вручную') })); } catch (e) { /* stays unassigned: "Взять себе" is on the card */ } }
        close(); toast(_('Лид создан'));
        curLid = row.id; pinned.add(row.id); chip = 'all'; query = ''; const sq = $('#gsearch'); if (sq) sq.value = '';
        await refresh(row.id, true);
        const i = C.deals.findIndex((x) => x.lid === row.id); if (i >= 0) C.open(i);
        if (withQuote) handoff({ id: row.id, contact_name: name, phone }, null);
      } catch (e) { toast(humanError(e), true); }
    }
  }

  /* ---------- orders ---------- */
  function orderDialog(o) {
    if (!o) return;
    dialog({
      title: _('Заказ: ') + ((o.leads && o.leads.contact_name) || ''),
      body: _('<div class="fld"><label>Этап</label><select class="inp" name="s">') + Object.keys(ORDER_RU).map((k) => '<option value="' + k + '"' + (k === o.stage ? ' selected' : '') + '>' + ORDER_RU[k] + '</option>').join('') + '</select></div>'
        + _('<div class="fld"><label>Дата замера</label><input class="inp" type="date" name="m" value="') + esc(o.measured_at || '') + _('"></div><div class="fld"><label>Ожидаемая поставка</label><input class="inp" type="date" name="dl" value="') + esc(o.delivery_eta || '') + '"></div>'
        + '<div class="fld"><label><input type="checkbox" name="pd"' + (o.paid ? ' checked' : '') + _('> Оплачен</label></div><div class="fld"><label>Заметка</label><textarea name="nt">') + esc(o.note || '') + '</textarea></div>',
      foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Открыть лид'), run: (c) => { c(); openLead(o.lead_id); } }, { label: _('Сохранить'), primary: true, run: async (c, r) => { try { await run(sb.from('orders').update({ stage: val(r, 's'), measured_at: val(r, 'm') || null, delivery_eta: val(r, 'dl') || null, paid: r.querySelector('[name=pd]').checked, note: val(r, 'nt').trim() || null }).eq('id', o.id)); toast(_('Заказ сохранён')); c(); await refresh(); } catch (e) { toast(humanError(e), true); } } }],
    });
  }

  /* ---------- screens: quotes, customers, admin, settings ---------- */
  function setScreen(id, html) { const sc = $('[data-screen="' + id + '"]'); if (!sc) return; const out = html.startsWith('<div class="skel"') ? html : '<div class="pad">' + html + '</div>'; if (sc.dataset.h === out) return; sc.dataset.h = out; sc.innerHTML = out; }
  let quotes = [], qTab = 'act', qSearch = '', qDone = false, qBusy = false, qsTimer = null;
  const revisedSet = new Set();
  let quotesLoaded = false;
  const safeQ = (s) => String(s || '').replace(/[,()"\\%*_]/g, ' ').trim();
  async function renderQuotes(force) {
    if (!quotesLoaded) setScreen('quotes', skeleton());
    if (!quotesLoaded || force) { try { await loadQuotes(true); quotesLoaded = true; } catch (e) { toast(humanError(e), true); return; } }
    drawQuotes();
  }
  const QSEL = 'id, number, created_at, valid_until, total_net, revises, lead_id, owner, config, leads(contact_name, phone)';
  async function loadQuotes(reset) {
    if (reset) { quotes = []; qDone = false; revisedSet.clear(); } else if (qBusy || qDone) return;
    qBusy = true;
    try {
      let rows;
      if (qSearch) {       // by number, or by the lead found by name / phone / e-mail
        const q = safeQ(qSearch);
        const [a, ls] = await Promise.all([run(sb.from('quotes').select(QSEL).ilike('number', '%' + q + '%').order('created_at', { ascending: false }).limit(50)), fetchPage('all', q, 0, 30)]);
        const ids = remember(ls).slice(0, 30);
        const b = ids.length ? await run(sb.from('quotes').select(QSEL).in('lead_id', ids).order('created_at', { ascending: false }).limit(60)) : [];
        const seen = new Set(); rows = a.concat(b).filter((x) => !seen.has(x.id) && seen.add(x.id)).sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
        qDone = true;
      } else {
        let qy = sb.from('quotes').select(QSEL).order('created_at', { ascending: false });
        if (qTab === 'act') qy = qy.gte('valid_until', today());
        rows = await run(qy.range(quotes.length, quotes.length + PAGE - 1));
        qDone = rows.length < PAGE;
      }
      rows.forEach((r) => { if (r.revises) revisedSet.add(r.revises); });     // a newer version comes first, so its parent is known before it arrives
      quotes = reset ? rows : quotes.concat(rows);
    } finally { qBusy = false; }
  }
  const quoteShown = () => { const t = today(); const isAct = (q) => q.valid_until >= t && !revisedSet.has(q.id); return quotes.filter((q) => (qTab === 'act' ? isAct(q) : !isAct(q))); };
  async function moreQuotes() {
    try {
      await loadQuotes(false);
      for (let k = 0; k < 6 && !qDone && qTab === 'arc' && quoteShown().length < PAGE; k++) await loadQuotes(false);   // the archive is a filter of the full list
      drawQuotes();
    } catch (e) { toast(humanError(e), true); }
  }
  function drawQuotes() {
    const t = today(), list = quoteShown();
    setScreen('quotes', _('<div class="h1" style="margin-bottom:12px">Коммерческие предложения</div><div class="bar"><div class="seg2"><button class="') + (qTab === 'act' ? 'on' : '') + _('" data-qt="act">Действующие</button><button class="') + (qTab === 'arc' ? 'on' : '') + _('" data-qt="arc">Архив</button></div><input class="inp" id="qSearch" placeholder="Поиск: номер, клиент…" value="') + esc(qSearch) + _('"><div class="sp"></div><button class="btn primary sm" data-act="configurator">＋ Новое КП</button></div>')
      + (list.length ? _('<div class="panel"><div class="tblwrap"><table class="tbl"><thead><tr><th>№ КП</th><th>Клиент</th><th class="num">Сумма, нетто</th><th>Создано</th><th>Действует до</th></tr></thead><tbody>') + list.map((q) => '<tr class="click" data-qrow="' + q.id + '"><td><b>' + esc(q.number) + '</b>' + apprTag(q.id) + '</td><td>' + esc((q.leads && (q.leads.contact_name || q.leads.phone)) || '—') + '</td><td class="num">' + money(q.total_net) + '</td><td>' + dmy(q.created_at) + '</td><td class="' + (q.valid_until < t ? 'late' : '') + '">' + dmy(q.valid_until) + '</td></tr>').join('') + '</tbody></table></div></div>' + (qDone ? '' : '<div class="morerows"><button type="button" class="btn sm ghost" data-moreq="1">' + _('Показать ещё') + '</button></div>')
        : '<div class="empty" style="height:auto;padding:50px 0"><div class="ic">❏</div><div>' + (qTab === 'act' ? _('Действующих КП нет.<br><span class="muted">Рассчитайте первое в конфигураторе или из карточки лида.</span>') : _('Архив пуст.')) + '</div></div>'));
    const si = $('#qSearch'); if (si) si.oninput = () => {
      const v = si.value, pos = si.selectionStart; qSearch = v; clearTimeout(qsTimer);
      qsTimer = setTimeout(async () => { try { await loadQuotes(true); } catch (e) { toast(humanError(e), true); return; } drawQuotes(); const s = $('#qSearch'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) {} } }, 300);
    };
  }
  let cust = [], cSearch = '', cDone = false, cBusy = false, cTotal = 0, cTimer = null;
  let custLoaded = false;
  async function renderCustomers(force) {
    if (!custLoaded) setScreen('customers', skeleton());
    if (!custLoaded || force) { try { await loadCustomers(true); custLoaded = true; } catch (e) { toast(humanError(e), true); return; } }
    drawCustomers();
  }
  async function loadCustomers(reset) {
    if (reset) { cust = []; cDone = false; } else if (cBusy || cDone) return;
    cBusy = true;
    try {
      let qy = sb.from('customers').select('*', { count: 'exact' }).order('last_activity_at', { ascending: false });
      const q = safeQ(cSearch), dg = cSearch.replace(/\D/g, '');
      if (q) qy = qy.or(['name.ilike.%' + q + '%', 'email.ilike.%' + q + '%', 'object_address.ilike.%' + q + '%'].concat(dg.length >= 3 ? ['key.ilike.%' + dg.slice(-9) + '%'] : []).join(','));
      const { data, count, error } = await qy.range(cust.length, cust.length + PAGE - 1);
      if (error) throw error;
      cust = cust.concat(data || []); cTotal = count == null ? cust.length : count; cDone = (data || []).length < PAGE;
    } finally { cBusy = false; }
  }
  function drawCustomers() {
    const list = cust;
    setScreen('customers', _('<div class="h1" style="margin-bottom:12px">Клиенты</div><div class="bar"><input class="inp" id="cSearch" placeholder="Поиск: имя, телефон, e-mail…" value="') + esc(cSearch) + _('"><div class="sp"></div><button class="btn primary sm" data-act="newlead">＋ Новый клиент</button></div>')
      + (list.length ? _('<div class="panel"><div class="tblwrap"><table class="tbl"><thead><tr><th>Клиент</th><th>Телефон</th><th>Адрес</th><th class="num">Обращений</th><th class="num">Заказов</th><th>Последний контакт</th></tr></thead><tbody>') + list.map((c) => '<tr class="click" data-cust="' + esc(c.key) + '"><td><b>' + esc(c.name || c.email || c.phone) + '</b></td><td>' + esc(c.phone || '—') + '</td><td>' + esc(c.object_address || '—') + '</td><td class="num">' + c.leads + '</td><td class="num">' + c.won + '</td><td>' + ago(c.last_activity_at) + '</td></tr>').join('') + '</tbody></table></div></div>' + (cDone ? '' : '<div class="morerows"><button type="button" class="btn sm ghost" data-morec="1">' + _('Показать ещё') + ' · ' + Math.max(0, cTotal - list.length) + '</button></div>')
        : '<div class="empty" style="height:auto;padding:50px 0"><div class="ic">◍</div><div>' + (cSearch ? _('Никого не найдено.') : _('Клиентов пока нет.<br><span class="muted">Они появятся из лидов — с сайта или созданных вручную.</span>')) + _('</div><button class="btn primary" data-act="newlead">＋ Новый клиент</button></div>')));
    const si = $('#cSearch'); if (si) si.oninput = () => {
      const v = si.value, pos = si.selectionStart; cSearch = v; clearTimeout(cTimer);
      cTimer = setTimeout(async () => { try { await loadCustomers(true); } catch (e) { toast(humanError(e), true); return; } drawCustomers(); const s = $('#cSearch'); if (s) { s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) {} } }, 300);
    };
  }
  async function customerDialog(key) {
    const c = cust.find((x) => x.key === key); if (!c) return;
    let mine = []; try { mine = await fetchPage('all', key, 0, 30); remember(mine); } catch (e) { return toast(humanError(e), true); }
    dialog({
      title: c.name || c.email || c.phone, sub: esc([c.phone, c.email].filter(Boolean).join(' · ')),
      body: '<div class="contact">' + (c.phone ? '<a href="tel:' + esc(tel(c.phone)) + _('">📞 Позвонить</a>') : '') + (waNum(c.phone) ? '<a href="https://wa.me/' + waNum(c.phone) + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') + (c.email ? '<a href="mailto:' + esc(c.email) + _('">✉ Написать</a>') : '') + '</div>'
        + (c.object_address ? _('<div class="kv"><span class="k">Адрес</span><span class="v">') + esc(c.object_address) + '</span></div>' : '')
        + _('<h4 class="ovhead">Обращения (') + mine.length + ')</h4>' + mine.map((l) => '<div class="vrow" style="cursor:pointer" data-lead="' + l.id + '"><span>' + dmy(l.created_at) + '</span><span class="d">' + esc(STAGE_RU[l.stage]) + (l.last_quote ? _(' · КП ') + esc(l.last_quote) : '') + '</span><span class="s tab-num">' + money(l.last_total_net) + '</span></div>').join(''),
      onOpen: (r, close) => r.addEventListener('click', (e) => { const x = e.target.closest('[data-lead]'); if (x) { close(); openLead(x.dataset.lead); } }),
      foot: [{ label: _('Закрыть'), run: (cl) => cl() }, { label: _('＋ Новое обращение'), primary: true, run: (cl) => { cl(); newLeadDialog({ name: c.name, phone: c.phone }); } }],
    });
  }

  const srcLabel = (raw) => {
    const low = String(raw || '').toLowerCase();
    if (/facebook|instagram|meta|fb\b/.test(low)) return 'Meta';
    if (/google|gclid/.test(low)) return 'Google';
    if (SOURCES.includes(raw)) return _(raw);
    return { web: _('Сайт'), seller: _('Продавец'), manager: _('Продавец'), dealer: _('Дилер'), office: _('Офис'), client: _('Клиент') }[low] || raw;
  };
  function renderAdmin() {
    const sc = $('[data-screen="admin"]'); if (!sc) return;
    if (!loaded) return setScreen('admin', skeleton());
    if (!stats) { setScreen('admin', skeleton()); loadStats().then(() => { if (stats && curScreen() === 'admin') renderAdmin(); }); return; }
    const st = stats;
    const open = { length: Number(st.open) }, won = { length: Number(st.won) }, lost = { length: Number(st.lost) };
    const pipe = Number(st.pipeline) || 0;
    const wr = won.length + lost.length ? Math.round(100 * won.length / (won.length + lost.length)) : null;
    const avg = st.avg_won == null ? null : Number(st.avg_won);
    const bySrc = {}; (st.by_source || []).forEach((s) => { const k = srcLabel(s.k); bySrc[k] = (bySrc[k] || 0) + Number(s.n); });
    const per = {}; (st.by_user || []).forEach((u) => { per[u.id] = { n: Number(u.n), open: Number(u.open), sum: Number(u.sum), late: Number(u.late), won: Number(u.won), lost: Number(u.lost) }; });
    const un = Number(st.unassigned);
    const kpi = (l, v, sub) => '<div class="kpi"><div class="l">' + l + '</div><div class="v tab-num">' + v + '</div>' + (sub ? '<div class="delta">' + sub + '</div>' : '') + '</div>';
    setScreen('admin', _('<div class="h1" style="margin-bottom:4px">Обзор</div><p class="muted" style="margin:0 0 16px">Цифры считаются по лидам, которые вы видите.</p>')
      + '<div class="kpis">' + kpi(_('В работе (сумма КП)'), money(pipe), open.length + _(' лидов')) + kpi(_('Доля побед'), wr == null ? '—' : wr + '%', won.length + _(' из ') + (won.length + lost.length)) + kpi(_('Средний чек'), money(avg)) + kpi(_('Без ответственного'), un, un ? _('раздайте в работу') : _('всё разобрано')) + '</div>'
      + _('<div class="panel"><div class="ph"><h3>Менеджеры</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Сотрудник</th><th>Роль</th><th class="num">Лидов</th><th class="num">В работе</th><th class="num">Сумма</th><th class="num">Просрочено</th><th class="num">Побед</th></tr></thead><tbody>')
      + (Object.keys(per).map((id) => { const p = per[id], u = users.find((x) => x.id === id) || {}; return '<tr><td>' + esc(userName(id)) + '</td><td>' + esc(ROLE_RU[u.role] || '') + '</td><td class="num">' + p.n + '</td><td class="num">' + p.open + '</td><td class="num">' + money(p.sum) + '</td><td class="num' + (p.late ? ' late' : '') + '">' + p.late + '</td><td class="num">' + p.won + '</td></tr>'; }).join('') || _('<tr><td colspan="7" class="muted">Пока нет назначенных лидов</td></tr>')) + '</tbody></table></div></div>'
      + _('<div class="panel"><div class="ph"><h3>Откуда приходят клиенты</h3></div><div class="tblwrap"><table class="tbl"><tbody>') + (Object.entries(bySrc).sort((a, b) => b[1] - a[1]).map(([k, n]) => '<tr><td>' + esc(k) + '</td><td class="num">' + n + '</td></tr>').join('') || _('<tr><td class="muted">Данных пока нет</td></tr>')) + '</tbody></table></div></div>');
  }

  /* approvals: discount above the personal limit waits for the superadmin */
  let apprTab = 'pending';
  function discText(d, lim) { const k = { pergola: _('Пергола'), sides: _('Боковые'), extras: _('Прочее') }; return Object.keys(d || {}).map((x) => (k[x] || x) + ' ' + d[x] + '%').join(', ') + (lim != null ? _(' · лимит ') + lim + '%' : ''); }
  function renderApprovals() {
    if (!loaded) return setScreen('approvals', skeleton());
    const list = approvals.filter((a) => (apprTab === 'pending' ? a.status === 'pending' : a.status !== 'pending'));
    const row = (a) => {
      const q = a.quotes || {}, u = users.find((x) => x.id === q.owner) || {};
      return '<div class="appr"><div class="t"><b>' + esc((q.leads && q.leads.contact_name) || _('КП ') + q.number) + ' · ' + money(q.total_net) + _('</b><div class="reasons"><span class="tag">КП ') + esc(q.number) + '</span><span class="tag warn">' + esc(discText(q.discount, u.discount_limit)) + '</span><span class="tag">' + esc(userName(q.owner)) + '</span>' + (a.status !== 'pending' ? '<span class="tag ' + APPR_RU[a.status][1] + '">' + _(APPR_RU[a.status][0]) + (a.comment ? ': ' + esc(a.comment) : '') + '</span>' : '') + '</div></div>'
        + '<div class="acts">' + (q.lead_id ? '<button class="btn sm" data-lead="' + q.lead_id + _('">Открыть</button>') : '') + (a.status === 'pending' ? '<button class="btn sm" data-reject="' + a.quote_id + _('">Отклонить</button><button class="btn primary sm" data-approve="') + a.quote_id + _('">Утвердить</button>') : '') + '</div></div>';
    };
    setScreen('approvals', _('<div class="h1" style="margin-bottom:4px">Утверждения</div><p class="muted" style="margin:0 0 14px">Скидка выше личного лимита сотрудника ждёт вашего решения. Решение необратимо, сотрудник получит уведомление.</p><div class="bar"><div class="seg2"><button class="') + (apprTab === 'pending' ? 'on' : '') + _('" data-at="pending">Ждут</button><button class="') + (apprTab === 'done' ? 'on' : '') + _('" data-at="done">Решённые</button></div></div>')
      + (list.length ? '<div class="panel">' + list.map(row).join('') + '</div>' : '<div class="empty" style="height:auto;padding:50px 0"><div class="ic">✓</div><div>' + (apprTab === 'pending' ? _('Нет заявок на утверждение') : _('Решений пока нет')) + '</div></div>'));
  }
  document.addEventListener('click', (e) => {
    const at = e.target.closest('[data-at]'); if (at) { apprTab = at.dataset.at; renderApprovals(); return; }
    const ap = e.target.closest('[data-approve]'); if (ap) { run(sb.rpc('decide_approval', { p_quote: ap.dataset.approve, p_approve: true })).then(() => { toast(_('Скидка утверждена')); return refresh(); }).catch((er) => toast(humanError(er), true)); return; }
    const rj = e.target.closest('[data-reject]');
    if (rj) dialog({ title: _('Отклонить скидку'), sub: _('Сотрудник увидит ваш комментарий.'), body: _('<div class="fld"><label>Комментарий (обязательно)</label><textarea name="c" autofocus placeholder="Какая скидка допустима…"></textarea></div>'), foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Отклонить'), primary: true, run: async (c, r) => { const t = val(r, 'c').trim(); if (!t) return toast(_('Нужен комментарий'), true); try { await run(sb.rpc('decide_approval', { p_quote: rj.dataset.reject, p_approve: false, p_comment: t })); toast(_('Скидка отклонена')); c(); await refresh(); } catch (er) { toast(humanError(er), true); } } }] });
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
      const ct = $('#invCopy'); if (ct) { const c2 = ct.cloneNode(true); ct.replaceWith(c2); c2.addEventListener('click', () => { const i = $('#invLink'); i.select(); try { navigator.clipboard.writeText(i.value); } catch (e) { document.execCommand('copy'); } toast(_('Ссылка скопирована')); }); }
      invGroupsReady = true;
    }
    const panels = usersPane.querySelectorAll('.panel'), up = panels[1];
    if (up) up.innerHTML = _('<div class="ph"><h3>Пользователи</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Имя</th><th>E-mail</th><th>Роль</th><th class="num">Личная скидка %</th><th>Статус</th></tr></thead><tbody>') + users.filter((u) => u.role !== 'client').map((u) => '<tr><td>' + esc(u.full_name || '—') + '</td><td class="muted">' + esc(u.email || '') + '</td><td>' + esc(ROLE_RU[u.role] || u.role) + '</td><td class="num">' + (u.discount_limit != null ? esc(u.discount_limit) : '—') + '</td><td><span class="tag ' + (u.active === false ? 'bad' : 'ok') + '">' + (u.active === false ? _('отключён') : _('активен')) + '</span></td></tr>').join('') + '</tbody></table></div>';
    let rp = $('#reqPanel'); if (!rp) { rp = document.createElement('div'); rp.id = 'reqPanel'; rp.className = 'panel'; usersPane.appendChild(rp); }
    rp.innerHTML = _('<div class="ph"><h3>Заявки на доступ</h3><span class="muted" style="font-size:12px">пригласите нужных кнопкой выше</span></div>') + (reqs.length ? _('<div class="tblwrap"><table class="tbl"><thead><tr><th>Компания</th><th>Имя</th><th>Город</th><th>E-mail</th><th>Дата</th></tr></thead><tbody>') + reqs.map((r) => '<tr><td>' + esc(r.company) + '</td><td>' + esc((r.first_name || '') + ' ' + (r.last_name || '')) + '</td><td>' + esc(r.location) + '</td><td>' + esc(r.email) + '</td><td>' + dmy(r.created_at) + '</td></tr>').join('') + '</tbody></table></div>' : _('<div style="padding:14px 15px" class="muted">Новых заявок нет</div>'));
    // discount groups: real
    const dp = $('.setpane[data-set="disc"] .panel');
    if (dp) dp.innerHTML = _('<div class="ph"><h3>Группы скидок</h3></div><div class="tblwrap"><table class="tbl"><thead><tr><th>Группа</th><th class="num">Макс. скидка %</th></tr></thead><tbody>') + groups.map((g) => '<tr><td>' + esc(g.title) + '</td><td class="num">' + Number(g.max_discount) + '</td></tr>').join('') + _('</tbody></table></div><div style="padding:12px 15px" class="muted">Скидка выше личного лимита блокируется системой при сохранении КП.</div>');
    // roles: plain text instead of fake switches
    const rl = $('.setpane[data-set="roles"]');
    if (rl) rl.innerHTML = _('<div class="panel"><div class="ph"><h3>Кто что видит</h3></div><div style="padding:14px 15px;line-height:1.7"><p style="margin:0 0 8px"><b>Суперадмин, суперДилер</b> — все лиды и КП.</p><p style="margin:0 0 8px"><b>Дилер</b> — свои лиды и лиды своей компании.</p><p style="margin:0 0 8px"><b>Продавец</b> — только те, что создал сам или получил.</p><p class="muted" style="margin:0">Права закреплены в базе данных и не зависят от этой страницы.</p></div></div>');
    const pp = $('.setpane[data-set="pipe"]');
    if (pp) {
      let rate = null; try { rate = await run(sb.from('pricing_config').select('install_pct, delivery_pct').eq('id', 1).single()); } catch (e) {}
      pp.innerHTML = _('<div class="panel"><div class="ph"><h3>Наценки на услуги</h3></div><div style="padding:14px 15px;display:flex;flex-direction:column;gap:12px;max-width:360px"><div class="fld"><label>Монтаж, % от суммы</label><input class="inp" type="number" step="0.1" min="0" id="rIns" value="') + (rate ? Number(rate.install_pct) : '') + _('"></div><div class="fld"><label>Доставка, % от суммы</label><input class="inp" type="number" step="0.1" min="0" id="rDel" value="') + (rate ? Number(rate.delivery_pct) : '') + _('"></div><button class="btn primary sm" id="rSave" style="align-self:flex-start">Сохранить</button><p class="muted" style="margin:0">Применяется в новых расчётах сразу, без обновления сайта.</p></div></div>');
      const sv = $('#rSave'); if (sv) sv.onclick = async () => { try { await run(sb.from('pricing_config').update({ install_pct: Number($('#rIns').value), delivery_pct: Number($('#rDel').value), updated_at: new Date().toISOString() }).eq('id', 1)); toast(_('Сохранено')); } catch (e) { toast(humanError(e), true); } };
    }
    const stScreen = $('[data-screen="settings"]'); if (stScreen && stScreen.classList.contains('loading')) { stScreen.classList.remove('loading'); const sk = stScreen.querySelector(':scope > .skel'); if (sk) sk.remove(); }
    const tabNames = { pipe: _('Наценки'), roles: _('Роли и доступ'), disc: _('Группы скидок') };
    $$('.subnav .t').forEach((t) => { if (tabNames[t.dataset.set]) { t.removeAttribute('data-i18n'); t.textContent = tabNames[t.dataset.set]; } });
  }
  async function createInvite() {
    const { data: { session } } = await sb.auth.getSession();
    const role = ($('#invRole') || {}).value, gid = ($('#invGroup') || {}).value;
    try {
      const res = await fetch(BACKEND.url + '/functions/v1/create-invite', { method: 'POST', headers: { 'content-type': 'application/json', apikey: BACKEND.anonKey, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ role, discount_group_id: gid || null }) });
      const j = await res.json(); if (!res.ok || !j.link) throw new Error(j.message || j.error || _('Ошибка'));
      $('#invLink').value = j.link; $('#invOut').hidden = false; toast(_('Ссылка действует 14 дней'));
    } catch (e) { toast(humanError(e), true); }
  }

  /* ---------- notifications ---------- */
  let notes = [];
  // a light question every minute: did anything change? (the counters and the newest activity); only then the pages are read again
  let lastMark = '';
  async function pollChanges() {
    if (document.hidden || !booted) return;
    try {
      const [c, l] = await Promise.all([run(sb.rpc('lead_counts')), run(sb.from('leads').select('last_activity_at').order('last_activity_at', { ascending: false }).limit(1))]);
      const mark = JSON.stringify([c, l]);
      if (lastMark && mark !== lastMark) { const a = document.activeElement; if (!$('.dlgback') && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) await refresh(); }
      lastMark = mark;
    } catch (e) { /* offline or a hiccup: try again in a minute */ }
  }
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
    box.innerHTML = notes.length ? notes.map((n) => '<div class="it' + (n.read ? '' : ' un') + '" data-n="' + n.id + '" data-lead="' + (n.lead_id || '') + '">' + esc(ntfText(n.text)) + '<small>' + ago(n.at) + '</small></div>').join('') + _('<div class="it" style="text-align:center;color:var(--accent)" data-allread="1">Отметить всё прочитанным</div>') : _('<div class="it muted">Уведомлений нет</div>');
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
  if (si) si.addEventListener('input', () => setQuery(si.value.trim()));
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (si) si.focus(); return; }
    const tag = (document.activeElement || {}).tagName;
    if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA|SELECT/.test(tag || '') && !$('.dlgback') && booted) { e.preventDefault(); newLeadDialog(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.rail a, .tabs .t, .cchip, .row, #tabbar a')) { e.preventDefault(); e.target.click(); }
  });
  $$('.rail a').forEach((a) => { a.setAttribute('role', 'link'); a.tabIndex = 0; });
  $$('.rail a').forEach((a) => a.addEventListener('keydown', (e) => { if (e.key === 'Enter') a.click(); }));

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-moreq]')) { moreQuotes(); return; }
    const mc = e.target.closest('[data-morec]'); if (mc) { loadCustomers(false).then(drawCustomers, (er) => toast(humanError(er), true)); return; }
    const qt = e.target.closest('[data-qt]'); if (qt) { qTab = qt.dataset.qt; loadQuotes(true).then(() => (qTab === 'arc' ? moreQuotes() : drawQuotes()), (er) => toast(humanError(er), true)); return; }
    const qr = e.target.closest('[data-qrow]'); if (qr) { const q = quotes.find((x) => x.id === qr.dataset.qrow); if (q && q.lead_id) openLead(q.lead_id); return; }
    const cr = e.target.closest('[data-cust]'); if (cr) { customerDialog(cr.dataset.cust); return; }
    const cf = e.target.closest('[data-act="configurator"]'); if (cf) { try { localStorage.removeItem('db.handoff'); } catch (er) {} openConfigurator(true); }
  });

  C.onShow = (id) => {
    markTab(id);
    if (!booted) return;
    if (id === 'quotes') renderQuotes();
    if (id === 'customers') renderCustomers();
    if (id === 'leads' && !colsLoaded) { colsLoaded = true; loadCols(true).then(() => rebuild(curLid), (e) => { colsLoaded = false; toast(humanError(e), true); }); }
    if (id === 'orders' && !ordersLoaded) loadOrders().then(() => rebuild(curLid));
    if (id === 'admin') renderAdmin();
    if (id === 'settings') renderSettings();
    if (id === 'approvals') renderApprovals();
    if (id === 'configurator') {
      const f = $('#cfgFrame');
      if (f && !/[?&]model/.test(f.getAttribute('src') || '')) { try { localStorage.removeItem('db.handoff'); } catch (e) {} f.setAttribute('data-lang', C.lang()); f.setAttribute('src', 'configurator.html?model&lang=' + C.cfgLang()); }
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
    if (st.info.kind === 'lead') moveLead(byId.get(st.info.id), idx); else moveOrder(orders.find((x) => x.id === st.info.id), idx);
  }
  const STAGE_AT = ['new', 'contacted', 'quote_issued', 'negotiation'];
  function moveLead(l, idx) {
    if (!l || idx === STAGE_IDX[l.stage]) return;
    DRAG.landed = l.id;
    if (idx === 4) {
      return dialog({ title: _('Итог по лиду'), sub: esc(l.contact_name || ''), body: _('<div class="muted">Лид закрыт как заказ или как отказ.</div>'),
        foot: [{ label: _('Отмена'), run: (c) => c() }, { label: _('Отказ'), run: (c) => { c(); curLid = l.id; loseDialog(l); } }, { label: _('Оформить заказ'), primary: true, run: async (c) => { c(); curLid = l.id; await act(async () => { await run(sb.from('leads').update({ stage: 'won', next_action: null, next_action_at: null }).eq('id', l.id)); }, _('Заказ оформлен')); landed(); } }] });
    }
    curLid = l.id;
    act(async () => { await run(sb.from('leads').update({ stage: STAGE_AT[idx] }).eq('id', l.id)); }, _('Стадия: ') + STAGE_RU[STAGE_AT[idx]]).then(landed);
  }
  async function moveOrder(o, idx) {
    if (!o || !ORDER_COL[idx] || ORDER_COL[idx][1] === o.stage) return;
    DRAG.landed = o.id;
    try { await run(sb.from('orders').update({ stage: ORDER_COL[idx][1] }).eq('id', o.id)); toast(_('Этап: ') + ORDER_RU[ORDER_COL[idx][1]]); await refresh(); landed(); } catch (e) { toast(humanError(e), true); }
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

  C.onLang = () => {
    if (!booted) return;
    chrome(); rebuild(curLid);      // the deals and boards carry translated texts: build them again
    const sc = curScreen();
    if (sc === 'quotes') (quotesLoaded ? drawQuotes() : renderQuotes()); if (sc === 'customers') (custLoaded ? drawCustomers() : renderCustomers()); if (sc === 'admin') renderAdmin();
    if (sc === 'approvals') renderApprovals(); if (sc === 'settings') renderSettings();
    const nb = $('#ntfBox'); if (nb) nb.remove();
  };
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'db-crm-back') return;
    refresh(undefined, true).then(() => { C.show(curLid ? 'today' : 'leads'); }).catch(() => {});
  });
})();
