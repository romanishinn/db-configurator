// Hub page (apps/hub) with a STUBBED Supabase SDK: proves card visibility per role, the gallery link handling and the app_links calls, NOT real RLS.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const S = __dirname, R = path.resolve(S, '../..'); const O = n => path.join(process.env.OUT || os.tmpdir(), n); const stub = fs.readFileSync(S + '/hub-stub.txt', 'utf8');
const LINK = 'https://drive.google.com/drive/folders/TESTFOLDER';
let bad = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) bad++; };
(async () => {
  const b = await chromium.launch();
  async function mk(w, init, file) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 } }); const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(init || ''); await page.route('**/supabase.js', r => r.fulfill({ contentType: 'application/javascript', body: stub }));
    await page.goto('file://' + (file || R + '/apps/hub/index.html')); return { page, errs };
  }
  const login = async p => { await p.waitForSelector('#login:not([hidden])'); await p.fill('#em', 'a@b.c'); await p.fill('#pw', 'x'); await p.click('#login button.primary'); await p.waitForTimeout(300); };
  const cards = p => p.$$eval('#tiles [data-card]', e => e.map(x => x.getAttribute('data-card')));
  const html = p => p.evaluate(() => document.documentElement.outerHTML);
  const want = { dealer: 'submit,gallery,conf,crm', superdealer: 'submit,gallery,conf,crm', manager: 'crm,projects,gallery,landing,conf', superadmin: 'crm,projects,submit,gallery,landing,conf' };
  for (const w of [390, 1100]) {
    { const { page, errs } = await mk(w, ''); await page.waitForSelector('#login:not([hidden])'); await page.waitForTimeout(200);
      ok(`${w} anon cards`, (await cards(page)).join() === 'landing,conf'); ok(`${w} anon no gallery/link`, !(await html(page)).includes('drive.google') && !(await page.$('[data-card=gallery]')));
      await page.screenshot({ path: O(`hub-anon-${w}.png`), fullPage: true }); ok(`${w} anon no errors`, !errs.length); }
    for (const r of ['dealer', 'manager', 'superadmin']) {
      const { page, errs } = await mk(w, `window.__role="${r}";window.__link="${LINK}";`); await login(page);
      ok(`${w} ${r} cards`, (await cards(page)).join() === want[r]);
      const g = await page.$eval('[data-card=gallery]', e => ({ href: e.getAttribute('href'), t: e.target, rel: e.rel, txt: e.textContent }));
      ok(`${w} ${r} gallery button opens new tab safely`, g.href === LINK && g.t === '_blank' && g.rel === 'noopener noreferrer' && !g.txt.includes('http'));
      ok(`${w} ${r} link not in page text`, !(await page.innerText('body')).includes('drive.google'));
      ok(`${w} ${r} admin field only for superadmin`, (await page.$eval('#adm', e => !e.hidden)) === (r === 'superadmin'));
      await page.screenshot({ path: O(`hub-${r}-${w}.png`), fullPage: true }); ok(`${w} ${r} no errors`, !errs.length);
    }
  }
  { const { page } = await mk(390, 'window.__role="superdealer";window.__link="' + LINK + '";'); await login(page); ok('superdealer cards', (await cards(page)).join() === want.superdealer); }
  for (const r of ['client', 'weird']) { // not allowed to read: the table is not even requested, link never in DOM
    const { page } = await mk(390, `window.__role="${r}";window.__link="${LINK}";`); await login(page);
    ok(`${r}: public cards only`, (await cards(page)).join() === 'landing,conf');
    ok(`${r}: no gallery, link not in DOM, app_links not read`, !(await page.$('[data-card=gallery]')) && !(await html(page)).includes('drive.google') && !(await page.evaluate(() => window.__log)).some(l => l.read)); }
  { const { page } = await mk(390, 'window.__role="manager";'); await login(page); // not set
    const t = await page.textContent('[data-card=gallery]'); ok('gallery not set: text, no link', t.includes('Ссылка ещё не добавлена') && !t.includes('Добавьте') && !(await page.$('a[data-card=gallery]')));
    await page.screenshot({ path: O('hub-manager-noset-390.png'), fullPage: true }); }
  { const { page } = await mk(390, 'window.__role="superadmin";'); await login(page);
    ok('superadmin not set: hint where to add', (await page.textContent('[data-card=gallery]')).includes('Добавьте её в поле ниже'));
    for (const bad1 of ['http://drive.google.com/x', 'https://evil.example/drive.google.com', 'https://drive.google.com.evil.example/x', 'javascript:alert(1)', 'not a url']) {
      await page.evaluate(() => { document.getElementById('galUrl').type = 'text'; }); await page.fill('#galUrl', bad1); await page.click('#galSave'); await page.waitForTimeout(100);
      ok('rejects ' + bad1, (await page.textContent('#galMsg')).includes('Нужна ссылка') && !(await page.evaluate(() => window.__log)).some(l => l.upsert)); }
    await page.fill('#galUrl', ' ' + LINK + ' '); await page.click('#galSave'); await page.waitForSelector('a[data-card=gallery]');
    const up = (await page.evaluate(() => window.__log)).filter(l => l.upsert);
    ok('upsert key/title/url', up.length === 1 && up[0].upsert === 'app_links' && JSON.stringify(up[0].row) === JSON.stringify({ key: 'gallery', title: 'Галерея объектов', url: LINK }));
    ok('after save: button with href, field cleared', (await page.getAttribute('a[data-card=gallery]', 'href')) === LINK && (await page.inputValue('#galUrl')) === '');
    await page.screenshot({ path: O('hub-superadmin-saved-390.png'), fullPage: true }); }
  { const { page } = await mk(390, 'window.__role="superadmin";window.__upErr={message:"new row violates row-level security"};'); await login(page);
    await page.fill('#galUrl', LINK); await page.click('#galSave'); await page.waitForTimeout(200);
    ok('save denied: Russian message, no button', (await page.textContent('#galMsg')).includes('Нет прав') && !(await page.$('a[data-card=gallery]'))); }
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); let sdk = 0; await page.route('**/supabase.js', r => { sdk++; r.abort(); });
    const f = O('nb-hub.html'); fs.writeFileSync(f, fs.readFileSync(R + '/apps/hub/index.html', 'utf8').replace(/url: 'https:[^']*supabase\.co'/, "url: ''"));
    await page.goto('file://' + f); await page.waitForTimeout(300);
    ok('no BACKEND.url: public cards, no login, no SDK request', (await cards(page)).join() === 'landing,conf' && (await page.$eval('#login', e => e.hidden)) && sdk === 0 && !errs.length); }
  { const { page } = await mk(390, '', R + '/apps/hub/index.html'); await page.waitForTimeout(200); // SDK stub present but check dark + reduced motion do not break
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await page.screenshot({ path: O('hub-anon-dark-390.png'), fullPage: true }); }
  for (const f of ['projects', 'submit']) { const { page } = await mk(390, '', R + `/apps/${f}/index.html`); ok(f + ' has Меню link to hub.html', (await page.getAttribute('.top a.menu', 'href')) === 'hub.html'); }
  await b.close(); console.log(bad ? 'FAIL total ' + bad : 'PASS all'); process.exit(bad ? 1 : 0);
})();
