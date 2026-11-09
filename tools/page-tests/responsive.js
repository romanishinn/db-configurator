// Responsive audit: every page x device matrix, with STUBBED network (no real Supabase, no CDN, no Turnstile).
// Proves layout/hit-test/size rules in Chromium (swiftshader WebGL), NOT real iOS Safari / Android Chrome, real fonts or real touch.
// Report mode by default (always exit 0); RESPONSIVE_STRICT=1 exits 1 on any violation. See responsive-README.md.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const S = __dirname, R = path.resolve(S, '../..');
const OUTDIR = process.env.RESP_OUT || path.join(process.env.OUT || os.tmpdir(), 'resp'); fs.mkdirSync(OUTDIR, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'resp-'));
const STRICT = process.env.RESPONSIVE_STRICT === '1', WORKERS = +process.env.RESP_WORKERS || 4;
const ONLY = (process.env.RESP_PAGES || '').split(',').filter(Boolean);
const rd = f => fs.readFileSync(path.join(S, f), 'utf8');

// name, w, h, touch (hasTouch+isMobile => pointer:coarse); scale = also run the font x1.3 pass
const DEV = [
  ['ph360x740', 360, 740, 1, 1], ['ph393x760', 393, 760, 1, 0], ['ph390x844', 390, 844, 1, 1], ['ph430x932', 430, 932, 1, 0],
  ['phL740x360', 740, 360, 1, 1], ['phL844x390', 844, 390, 1, 1], ['phL932x430', 932, 430, 1, 0],
  ['tab768x1024', 768, 1024, 1, 1], ['tab820x1180', 820, 1180, 1, 0], ['tab834x1194', 834, 1194, 1, 0],
  ['tabL1024x768', 1024, 768, 1, 1], ['tabL1180x820', 1180, 820, 1, 0], ['tabL1194x834', 1194, 834, 1, 0],
  ['lap1366x768', 1366, 768, 0, 0], ['lap1440x900', 1440, 900, 0, 0], ['desk1920x1080', 1920, 1080, 0, 1]
].map(([n, w, h, t, sc]) => ({ n, w, h, touch: !!t, scale: !!sc }));
// the configurator is heavy (software WebGL): fewer devices unless RESP_FULL_CFG=1
const CFG_DEV = new Set(['ph360x740', 'ph390x844', 'ph430x932', 'phL740x360', 'phL844x390', 'tab768x1024', 'tabL1024x768', 'lap1366x768', 'desk1920x1080']);

const TYPES = { A: 'гориз. прокрутка', B: 'перекрыт', C: 'тап-цель <44', D: 'шрифт <12', E: 'вне экрана/обрезан', F: 'панели >35% высоты', G: 'действие: вложенная прокрутка/недоступно', H: 'ошибка консоли', I: 'шрифт x1.3: действие недоступно' };

// ---------- the build the pages are served from (same wrapper as .github/workflows/pages.yml) ----------
function prepare() {
  cp.execSync('bash prototype/build.sh', { cwd: R, stdio: 'ignore' });
  const head = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>';
  fs.writeFileSync(TMP + '/configurator.html', head + fs.readFileSync(R + '/prototype/dist/terrace-3d.html', 'utf8') + '</body></html>');
  fs.writeFileSync(TMP + '/crm.html', fs.readFileSync(R + '/prototype/crm.html', 'utf8').replace('/*CRM_I18N*/', () => fs.readFileSync(R + '/prototype/crm-i18n.js', 'utf8')).replace('/*CRM_LIVE*/', () => fs.readFileSync(R + '/prototype/crm-live.js', 'utf8')));
}
const TS = 'window.turnstile={render:function(h,o){window.__o=o;return 1},reset:function(){},execute:function(){}};';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };

// ---------- in-page checks (self-contained: runs inside the browser) ----------
function inPage(opt) {
  const out = [], els = []; window.__respEls = els; const vw = innerWidth, vh = innerHeight;
  const sel = el => { if (!el || !el.tagName) return '?'; const p = []; let e = el; for (let i = 0; e && e.nodeType === 1 && i < 3; i++, e = e.parentElement) {
      let s = e.tagName.toLowerCase(); if (e.id) { p.unshift(s + '#' + e.id); break; }
      const c = (e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2); if (c.length) s += '.' + c.join('.');
      if (i === 0) { const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18); if (t) s += '["' + t + '"]'; }
      p.unshift(s); } return p.join(' > '); };
  const add = (type, el, detail) => { els.push(el); out.push({ type, sel: sel(el), detail, i: els.length - 1 }); };
  const vis = el => { if (!el.isConnected) return false; if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false; const r = el.getClientRects()[0]; return !!r && r.width >= 2 && r.height >= 2; };
  const CAND = 'button,a[href],input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex]:not([tabindex="-1"])';
  const cands = [...document.querySelectorAll(CAND)].filter(e => vis(e) && !e.closest('[inert]') && getComputedStyle(e).pointerEvents !== 'none');
  const hitOk = (el, hit) => !!hit && (hit === el || el.contains(hit) || (() => { const l = hit.closest && hit.closest('label'); return !!l && l.control === el; })());
  const tryAt = el => { const r = el.getClientRects()[0]; const l = Math.max(r.left, 0), rr = Math.min(r.right, vw), t = Math.max(r.top, 0), b = Math.min(r.bottom, vh);
    if (rr - l < 1) return 'вне экрана по горизонтали'; if (b - t < 1) return 'вне экрана по вертикали'; const x = (l + rr) / 2;
    for (const f of [.2, .5, .8]) { const hit = document.elementFromPoint(x, t + (b - t) * f); if (!hitOk(el, hit)) return 'перекрыт: ' + (hit ? sel(hit) : 'ничем (null)'); } return null; };
  const scrolls = el => { const r = []; for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) { const c = getComputedStyle(a);
      if (/(auto|scroll|overlay)/.test(c.overflowY) && a.scrollHeight > a.clientHeight + 1) r.push(a); } return r; };
  // primary action: reachable without nested scroll, then hit-testable with window scroll only
  const primaryCheck = type => {
    let el = null; for (const e of document.querySelectorAll(opt.primary)) if (vis(e)) { el = e; break; } if (!el) return;
    const rc = el.getBoundingClientRect();
    for (const a of scrolls(el)) { const ar = a.getBoundingClientRect(); if (rc.top < ar.top - 1 || rc.bottom > ar.bottom + 1) { add(type, el, 'нужна вложенная прокрутка внутри ' + sel(a)); return; } }
    let why = null; for (const pos of [null, 0, 1e6]) { if (pos !== null) scrollTo({ top: pos, behavior: 'instant' }); why = tryAt(el); if (!why) break; }
    if (why) add(type, el, 'основное действие недоступно: ' + why); scrollTo({ top: 0, behavior: 'instant' });
  };
  if (opt.mode === 'scale') { primaryCheck('I'); return out; }
  primaryCheck('G');
  // (a) horizontal page scroll
  const de = document.documentElement; if (de.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1) {
    let w = null, m = vw; for (const e of document.body.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && r.right > m + 1 && vis(e)) { m = r.right; w = e; } }
    add('A', w || document.body, `scrollWidth ${Math.max(de.scrollWidth, document.body.scrollWidth)} > ${vw}` + (w ? `; самый широкий: ${Math.round(m)}px` : '')); }
  // (b) hit-test with scrolling (centre, then top, then bottom of the viewport: a sticky panel must not cover the element in all of them)
  for (const el of cands) { let why = null; for (const blk of ['center', 'start', 'end']) { el.scrollIntoView({ block: blk, inline: 'nearest', behavior: 'instant' }); why = tryAt(el); if (!why) break; }
    if (why) add('B', el, why); }
  scrollTo({ top: 0, behavior: 'instant' });
  // (c) tap target size
  if (opt.coarse) for (const el of cands) { let t = el; if (/^(checkbox|radio|file)$/.test(el.type || '')) t = el.closest('label') || el; const r = t.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) { const inl = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length - el.textContent.trim().length > 8;
      if (inl) out.push({ type: 'x', sel: sel(el), detail: 'inline-ссылка в тексте ' + Math.round(r.width) + 'x' + Math.round(r.height) }); else add('C', el, Math.round(r.width) + 'x' + Math.round(r.height)); } }
  // (d) font size of visible text
  const textEls = new Set(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) { const p = n.parentElement; if (!p || !n.nodeValue.trim() || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(p.tagName)) continue; if (vis(p)) textEls.add(p); }
  for (const p of textEls) { const fs = parseFloat(getComputedStyle(p).fontSize); if (fs < 11.99) add('D', p, fs + 'px "' + p.textContent.trim().replace(/\s+/g, ' ').slice(0, 24) + '"'); }
  // (e) off-screen horizontally / clipped by an overflow parent
  const seen = new Set(); const hscroller = el => { for (let a = el.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (/(auto|scroll)/.test(c.overflowX) && a.scrollWidth > a.clientWidth + 1) return true; } return false; };
  const docOver = de.scrollWidth > vw + 1; let ecount = 0;
  for (const el of new Set([...cands, ...textEls])) { if (ecount > 60) break; if (seen.has(el)) continue; seen.add(el); const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if (!hscroller(el)) {
      if (r.left < vw - 1 && r.right > vw + 1) { add('E', el, `выходит за правый край: right ${Math.round(r.right)} > ${vw}`); ecount++; continue; }
      if (r.left < -1 && r.right > 1) { add('E', el, `выходит за левый край: left ${Math.round(r.left)}`); ecount++; continue; }
      if (r.left >= vw && docOver) { add('E', el, `целиком правее экрана: left ${Math.round(r.left)}`); ecount++; continue; } }
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) { const c = getComputedStyle(a); if (c.position === 'fixed' && cs.position !== 'fixed') break;
      const hx = /(hidden|clip)/.test(c.overflowX), hy = /(hidden|clip)/.test(c.overflowY); if (!hx && !hy) continue; const ar = a.getBoundingClientRect(); if (ar.height < 2 || ar.width < 2) break;
      const bad = (hx && (r.left < ar.left - 2 || r.right > ar.right + 2)) || (hy && (r.top < ar.top - 2 || r.bottom > ar.bottom + 2));
      if (bad && !(cs.position === 'absolute' || cs.position === 'fixed')) { add('E', el, `обрезан родителем ${sel(a)}`); ecount++; break; } if (bad) break; }
  }
  // (f) fixed/sticky panels on low landscape screens
  if (vh <= 500 && vw > vh) { let best = 0, bestEl = null, ivs = [];
    const panels = [...document.querySelectorAll('*')].filter(e => { const c = getComputedStyle(e); return (c.position === 'fixed' || c.position === 'sticky') && c.pointerEvents !== 'none' && e.tagName !== 'CANVAS' && vis(e); });
    const top = panels.filter(p => !panels.some(q => q !== p && q.contains(p)));
    const H = Math.max(de.scrollHeight, vh);
    for (const pos of [0, (H - vh) / 2, H]) { scrollTo({ top: pos, behavior: 'instant' }); const iv = [];
      for (const p of top) { const r = p.getBoundingClientRect(); const t = Math.max(r.top, 0), b = Math.min(r.bottom, vh); if (b - t < 1 || r.width < vw * .6 || ((b - t) >= vh * .9 && r.width >= vw * .9)) continue; iv.push([t, b, p]); }
      iv.sort((a, b) => a[0] - b[0]); let tot = 0, cur = -1, big = null, bigH = 0; for (const [t, b, p] of iv) { if (b - t > bigH) { bigH = b - t; big = p; } const s = Math.max(t, cur); if (b > s) { tot += b - s; cur = b; } }
      if (tot > best) { best = tot; bestEl = big; } }
    scrollTo({ top: 0, behavior: 'instant' }); if (best > vh * .35) add('F', bestEl || document.body, `панели занимают ${Math.round(best / vh * 100)}% высоты (${Math.round(best)} из ${vh}px)`); }
  return out;
}
function scaleText(k) { const set = new Set(), tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) { const p = n.parentElement; if (p && n.nodeValue.trim() && !p.dataset.rs && !/^(SCRIPT|STYLE)$/.test(p.tagName)) set.add(p); }
  const arr = [...set].map(e => [e, parseFloat(getComputedStyle(e).fontSize)]); for (const [e, f] of arr) { e.dataset.rs = '1'; e.style.setProperty('font-size', (f * k) + 'px', 'important'); } }

// ---------- scenarios: each gets (run, page); run(label, primarySelector) checks the current state ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const login = async (p, sel = '#login button.primary') => { await p.waitForSelector('#login:not([hidden])', { timeout: 5000 }); await p.fill('#em', 'a@b.c'); await p.fill('#pw', 'x'); await p.click(sel); await sleep(400); };
const PRIM = 'button.primary:not([hidden]),button[type=submit]';
const SC = {
  async configurator(p, run) {
    await p.goto('file://' + TMP + '/configurator.html?lang=de'); await p.waitForSelector('#funnel .f-prod', { timeout: 20000 }); await sleep(1200);
    await run('Produktwahl', '#funnel .f-prod');
    await p.click('#funnel [data-product="louvered"]'); await sleep(700); await run('Schritt 0 (Grösse)', '#funnel .next');
    const pops = await p.$$eval('.toolbar .tb-row .ib[aria-controls]', e => e.filter(x => x.offsetParent).map(x => x.id));
    for (const id of pops) { await p.click('#' + id).catch(() => {}); await sleep(250); await run('Popup ' + id, '#funnel .next'); await p.click('#' + id).catch(() => {}); await sleep(150); }
    await run('Schritt 0, Popups zu', '#funnel .next');
    for (let s = 1; s <= 3; s++) { await p.click('#funnel .next:not([disabled])').catch(() => {}); await sleep(600); await run('Schritt ' + s, '#funnel .next'); }
    await p.click('#funnel .next:not([disabled])').catch(() => {}); await sleep(700); await run('Schritt 4 (Formular)', 'form button[type=submit], #funnel .next, .f-form button.primary');
  },
  async landing(p, run) { await p.goto('file://' + R + '/apps/landing/index.html'); await sleep(700); await run('Seite', '#lead button[type=submit]'); },
  async crm(p, run) { await p.goto('file://' + TMP + '/crm.html'); await sleep(900); await run('Start', PRIM); },
  async hub(p, run) { await p.addInitScript('window.__role="superadmin";window.__link="https://drive.google.com/drive/folders/X";'); await p.goto('file://' + R + '/apps/hub/index.html'); await sleep(300); await run('Anmeldung', '#login button.primary');
    await login(p); await run('superadmin', 'a[data-card],[data-card]'); },
  async projects(p, run) { await p.addInitScript('window.__role="manager";'); await p.goto('file://' + R + '/apps/projects/index.html'); await sleep(300); await run('Anmeldung', '#login button.primary');
    await login(p); await run('Liste', '#save'); for (const t of ['tabQueue', 'tabOrders']) { await p.click('#' + t).catch(() => {}); await sleep(300); await run(t, PRIM); } },
  async submit(p, run) { await p.addInitScript('window.__role="dealer";'); await p.goto('file://' + R + '/apps/submit/index.html'); await sleep(300); await run('Anmeldung', '#login button.primary');
    await login(p); await run('dealer', PRIM); },
  async join(p, run) { await p.goto('file://' + R + '/apps/join/index.html?token=x'); await sleep(500); await run('Start', '#go'); }
};
const PAGES = Object.keys(SC).filter(k => !ONLY.length || ONLY.includes(k));
const STUB = { hub: 'hub-stub.txt', projects: 'manager-stub.txt', submit: 'dealer-stub.txt' };

// ---------- runner ----------
const violations = [], exceptions = [], shotTaken = new Set(); const t0 = Date.now(); let browser;
async function job(j) {
  const d = j.dev, ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, hasTouch: d.touch, isMobile: d.touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); let label = '-'; const rec = (type, sel, detail, extra = {}) => violations.push({ page: j.page, dev: d.n, w: d.w, h: d.h, state: label, mode: j.scale ? 'x1.3' : '1.0', type, sel, detail, ...extra });
  p.on('pageerror', e => rec('H', 'pageerror', e.message.slice(0, 160))); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) rec('H', 'console.error', m.text().slice(0, 160)); });
  p.on('dialog', x => x.dismiss());
  const stub = STUB[j.page] ? rd(STUB[j.page]) : null;
  await p.route(/^https?:/, r => { const u = r.request().url();
    if (/supabase\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: stub || '' });
    if (/turnstile/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: TS });
    if (/\.supabase\.co/.test(u)) { if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS }); return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '[]' }); }
    if (/\.(js)(\?|$)/.test(u)) return r.fulfill({ contentType: 'application/javascript', body: '' }); if (/css/.test(u)) return r.fulfill({ contentType: 'text/css', body: '' }); return r.fulfill({ status: 204, body: '' }); });
  const run = async (lbl, primary) => { label = lbl;
    try {
      if (j.scale) { await p.evaluate(scaleText, 1.3); await sleep(120); const o = await p.evaluate(inPage, { primary, mode: 'scale', coarse: d.touch }); for (const v of o) rec(v.type, v.sel, v.detail); return; }
      const o = await p.evaluate(inPage, { primary, mode: 'full', coarse: d.touch });
      for (const v of o) { if (v.type === 'x') { exceptions.push({ page: j.page, dev: d.n, state: label, sel: v.sel, detail: v.detail }); continue; }
        const key = v.type; let shot = null;
        if (!shotTaken.has(key)) { shotTaken.add(key); shot = `shot-${key}-${j.page}-${d.n}.png`;
          await p.evaluate(i => { const e = window.__respEls[i]; if (e) { e.scrollIntoView({ block: 'center', behavior: 'instant' }); e.setAttribute('data-resp-old', e.style.outline); e.style.setProperty('outline', '3px solid red', 'important'); } }, v.i).catch(() => {});
          await p.screenshot({ path: path.join(OUTDIR, shot) }).catch(() => {});
          await p.evaluate(i => { const e = window.__respEls[i]; if (e) { e.style.outline = e.getAttribute('data-resp-old') || ''; e.removeAttribute('data-resp-old'); } scrollTo({ top: 0, behavior: 'instant' }); }, v.i).catch(() => {}); }
        rec(v.type, v.sel, v.detail, shot ? { shot } : {}); }
    } catch (e) { rec('H', 'harness', 'проверка упала: ' + String(e.message).split('\n')[0].slice(0, 140)); } };
  try { await SC[j.page](p, run); } catch (e) { rec('H', 'scenario', 'сценарий прерван в «' + label + '»: ' + String(e.message).split('\n')[0].slice(0, 140)); }
  await ctx.close();
}
async function main() {
  prepare(); browser = await chromium.launch();
  const jobs = []; for (const pg of PAGES) for (const dev of DEV) { if (pg === 'configurator' && !process.env.RESP_FULL_CFG && !CFG_DEV.has(dev.n)) continue;
    jobs.push({ page: pg, dev, scale: false }); if (dev.scale) jobs.push({ page: pg, dev, scale: true }); }
  jobs.sort((a, b) => (b.page === 'configurator') - (a.page === 'configurator')); let next = 0, done = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => { while (next < jobs.length) { const j = jobs[next++]; await job(j).catch(e => violations.push({ page: j.page, dev: j.dev.n, state: '-', mode: '-', type: 'H', sel: 'job', detail: String(e.message).slice(0, 140) })); if (++done % 20 === 0) process.stderr.write(`  ${done}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)}s)\n`); } }));
  await browser.close();
  // ---- report ----
  const uniq = new Map(); for (const v of violations) { const k = [v.page, v.dev, v.mode, v.state, v.type, v.sel].join('|'); if (!uniq.has(k)) uniq.set(k, v); } const V = [...uniq.values()];
  const by = {}; for (const v of V) { const k = v.page + ' x ' + v.dev + (v.mode === 'x1.3' ? ' [x1.3]' : ''); (by[k] = by[k] || {})[v.type] = (by[k][v.type] || 0) + 1; }
  console.log('\n== Сводка: страница x размер -> нарушения по типам (' + Object.entries(TYPES).map(([k, v]) => k + '=' + v).join('; ') + ')');
  const rows = Object.entries(by).sort(); const pad = (s, n) => String(s).padEnd(n); console.log(pad('страница x размер', 36) + 'всего  типы'); for (const [k, m] of rows) console.log(pad(k, 36) + pad(Object.values(m).reduce((a, b) => a + b, 0), 7) + Object.entries(m).sort().map(([t, c]) => t + ':' + c).join(' '));
  const perPage = {}; for (const v of V) { (perPage[v.page] = perPage[v.page] || {})[v.type] = (perPage[v.page][v.type] || 0) + 1; }
  console.log('\n== По страницам (уникальные нарушения: состояние x размер x селектор)'); for (const [k, m] of Object.entries(perPage)) console.log(pad(k, 14) + Object.entries(m).sort().map(([t, c]) => t + ':' + c).join(' '));
  const grp = new Map(); for (const v of V) { const k = v.type + '|' + v.page + '|' + v.sel; const g = grp.get(k) || { type: v.type, page: v.page, sel: v.sel, n: 0, devs: new Set(), detail: v.detail, shot: v.shot }; g.n++; g.devs.add(v.dev); if (v.shot) g.shot = v.shot; grp.set(k, g); }
  const ORD = 'BGIAEFCHD'; const all = [...grp.values()].sort((a, b) => b.devs.size - a.devs.size); const top = []; // round-robin by type so noisy types (font size) do not hide the rest
  for (let round = 0; top.length < 20 && round < 20; round++) for (const t of ORD) { const g = all.filter(x => x.type === t)[round]; if (g && top.length < 20) top.push(g); }
  console.log('\n== Топ-20 нарушений (тип, страница, селектор, на скольких размерах, пример)'); top.forEach((g, i) => console.log(`${i + 1}. [${g.type}] ${g.page}: ${g.sel} — ${g.devs.size} разм. (${[...g.devs].slice(0, 4).join(', ')}) — ${g.detail}${g.shot ? ' [' + g.shot + ']' : ''}`));
  console.log('\nИсключения (inline-ссылки в тексте, не нарушения): ' + new Set(exceptions.map(e => e.page + ': ' + e.sel)).size + ' шт.'); for (const s of [...new Set(exceptions.map(e => e.page + ': ' + e.sel + ' ' + e.detail))].slice(0, 15)) console.log('  ' + s);
  fs.writeFileSync(path.join(OUTDIR, 'report.json'), JSON.stringify({ when: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), devices: DEV, cfgDevices: [...CFG_DEV], types: TYPES, summary: by, violations: V, exceptions }, null, 1));
  console.log(`\nвсего уникальных нарушений: ${V.length}; ${jobs.length} прогонов за ${Math.round((Date.now() - t0) / 1000)} с; JSON: ${path.join(OUTDIR, 'report.json')}`);
  fs.rmSync(TMP, { recursive: true, force: true });
  if (STRICT && V.length) process.exit(1);
}
main().catch(e => { console.error('responsive.js: сбой самого инструмента:', e); process.exit(STRICT ? 1 : 0); });
