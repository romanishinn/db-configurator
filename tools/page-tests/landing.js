// Landing page callback form with a STUBBED network (supabase.co) and a STUBBED window.turnstile.
// Proves the page logic and the request body, NOT the real Turnstile widget or the real Edge Function.
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os');
const R = path.resolve(__dirname, '../..'); const O = n => path.join(process.env.OUT || os.tmpdir(), n);
const TS = 'window.turnstile={render:function(h,o){window.__o=o;return 1},reset:function(){},execute:function(){var t=window.__tok;setTimeout(function(){if(t)window.__o.callback(t);else window.__o["error-callback"]()},10)}};';
let bad = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) bad++; };
(async () => {
  const b = await chromium.launch();
  async function mk(w, o = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 } }); const page = await ctx.newPage();
    const errs = [], reqs = []; page.on('pageerror', e => errs.push(e.message));
    await page.addInitScript(`window.__tok=${JSON.stringify(o.tok === undefined ? 'TOK' : o.tok)};`);
    await page.route('**/challenges.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: TS }));
    await page.route('**/*.supabase.co/**', r => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      const q = r.request();
      if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (q.url().includes('/functions/v1/submit-request')) { reqs.push({ headers: q.headers(), body: JSON.parse(q.postData()) }); return r.fulfill({ status: o.status || 200, headers: cors, contentType: 'application/json', body: JSON.stringify(o.resp || { ok: true, number: null }) }); }
      return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '[]' });
    });
    let url = 'file://' + R + '/apps/landing/index.html';
    if (o.noUrl) { const f = O('nb-landing.html'); fs.writeFileSync(f, fs.readFileSync(R + '/apps/landing/index.html', 'utf8').replace(/url:'https:[^']*supabase\.co'/g, "url:''")); url = 'file://' + f; }
    await page.goto(url + (o.q || '')); return { page, errs, reqs };
  }
  const fill = async (p, v = {}) => {
    await p.fill('[name=name]', v.name ?? 'Anna Muster'); await p.fill('[name=ort]', v.ort ?? 'Hauptstraße 5, 1130 Wien');
    await p.fill('[name=kontakt]', v.kontakt ?? 'anna@example.at'); await p.fill('[name=msg]', v.msg ?? 'Terrasse 4x5');
    if (v.consent !== false) await p.check('[name=consent]');
  };
  const msg = p => p.textContent('#lead-msg');
  for (const w of [390, 1100]) {
    const { page, errs, reqs } = await mk(w, { q: '?utm_source=g&gclid=abc&x=1' });
    await fill(page); await page.screenshot({ path: O(`landing-form-${w}.png`), fullPage: false });
    const btnTxt = await page.textContent('#lead button[type=submit]');
    ok(`${w} button text without time promise`, btnTxt.trim() === 'Rückruf anfordern');
    await page.click('#lead button[type=submit]'); await page.waitForSelector('.form-ok');
    ok(`${w} one request`, reqs.length === 1);
    const r = reqs[0];
    ok(`${w} body`, JSON.stringify(r.body) === JSON.stringify({ kind: 'callback', token: 'TOK', consent: true, contact: { name: 'Anna Muster', address: 'Hauptstraße 5, 1130 Wien', postcode: '1130', note: 'Terrasse 4x5', email: 'anna@example.at' }, utm: { utm_source: 'g', gclid: 'abc' }, journey: 'Landing page ' + new URL(page.url()).pathname, hp: '' }));
    if (w === 390) console.log(JSON.stringify(r.body));
    ok(`${w} headers`, r.headers.apikey && r.headers.authorization === 'Bearer ' + r.headers.apikey);
    ok(`${w} success text`, (await page.textContent('.form-ok')).replace(/!/,'! ').includes('Danke! Ihre Anfrage ist eingegangen. Wir melden uns bei Ihnen.'));
    await page.screenshot({ path: O(`landing-ok-${w}.png`) });
    ok(`${w} no js errors`, errs.length === 0);
  }
  { // no consent
    const { page, reqs } = await mk(390); await fill(page, { consent: false }); await page.click('#lead button[type=submit]'); await page.waitForTimeout(200);
    ok('no consent: no request, German message', reqs.length === 0 && (await msg(page)).includes('stimmen Sie'));
    ok('no consent: no request', reqs.length === 0);
  }
  { // empty contact / bad contact
    const { page, reqs } = await mk(390); await fill(page, { kontakt: '' }); await page.click('#lead button[type=submit]'); await page.waitForTimeout(200);
    ok('empty contact blocked', reqs.length === 0 && (await msg(page)).includes('Telefonnummer'));
  }
  { // phone vs email
    const { page, reqs } = await mk(390); await fill(page, { kontakt: '+43 1 234 5678', ort: 'Wien' }); await page.click('#lead button[type=submit]'); await page.waitForSelector('.form-ok');
    const c = reqs[0].body.contact; ok('phone: phone set, no email, postcode empty', c.phone === '+43 1 234 5678' && !('email' in c) && c.postcode === '' && c.address === 'Wien');
  }
  for (const [st, code, txt] of [[429, 'too_many_requests', 'Zu viele'], [500, 'server_error', 'Fehler'], [403, 'turnstile_failed', 'Sicherheitsprüfung'], [400, 'contact_required', 'Telefonnummer']]) {
    const { page, reqs } = await mk(390, { status: st, resp: { ok: false, error: code } }); await fill(page); await page.click('#lead button[type=submit]'); await page.waitForTimeout(300);
    ok(`${st} ${code}: German error, form kept, button re-enabled`, (await msg(page)).includes(txt) && !(await page.$('.form-ok')) && !(await page.$eval('#lead button[type=submit]', e => e.disabled)));
    if (st === 500) { await page.screenshot({ path: O('landing-err-390.png') }); await page.click('#lead button[type=submit]'); await page.waitForTimeout(300); ok('retry sends again', reqs.length === 2); }
  }
  { // honeypot is sent as filled
    const { page, reqs } = await mk(390); await fill(page); await page.$eval('[name=hp]', e => e.value = 'bot');
    ok('hp field hidden and tabindex -1', await page.$eval('[name=hp]', e => { const r = e.getBoundingClientRect(); console.log('hp', e.tabIndex, e.autocomplete, r.x, r.width); return e.tabIndex === -1 && e.autocomplete === 'off' && (r.width <= 1 || r.x < 0); }));
    await page.click('#lead button[type=submit]'); await page.waitForSelector('.form-ok'); ok('hp value sent', reqs[0].body.hp === 'bot');
  }
  { // no token
    const { page, reqs } = await mk(390, { tok: '' }); await fill(page); await page.click('#lead button[type=submit]'); await page.waitForTimeout(300);
    ok('no token: no request, retry message', reqs.length === 0 && (await msg(page)).includes('Sicherheitsprüfung') && !(await page.$eval('#lead button[type=submit]', e => e.disabled)));
  }
  { // button blocked while sending
    const { page } = await mk(390); await fill(page);
    await page.route('**/functions/v1/submit-request', async r => { await new Promise(x => setTimeout(x, 600)); r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"number":null}' }); });
    await page.click('#lead button[type=submit]'); await page.waitForTimeout(150);
    ok('button disabled during send', await page.$eval('#lead button[type=submit]', e => e.disabled));
  }
  { // empty BACKEND.url
    const { page, reqs } = await mk(390, { noUrl: true }); await page.screenshot({ path: O('landing-nourl-390.png') });
    ok('no url: form stays, unavailable text, disabled', !!(await page.$('#lead')) && (await msg(page)).includes('Derzeit nicht verfügbar') && (await page.$eval('#lead button[type=submit]', e => e.disabled)) && reqs.length === 0);
  }
  await b.close(); console.log(bad ? 'FAIL total ' + bad : 'PASS all'); process.exit(bad ? 1 : 0);
})();
