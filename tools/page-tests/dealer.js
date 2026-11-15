const { chromium } = require('playwright'); const fs=require('fs');
const path=require('path'), os=require('os'); const S=__dirname, R=path.resolve(__dirname,'../..'); const O=n=>path.join(process.env.OUT||os.tmpdir(),n); const stub=fs.readFileSync(S+'/dealer-stub.txt','utf8');
(async()=>{const b=await chromium.launch();
async function mk(w,init,url){const ctx=await b.newContext({viewport:{width:w,height:844}});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>{console.log('DIALOG',d.message());d.dismiss()});
 await page.addInitScript(init||'');await page.route('**/supabase.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.goto('file://'+R+'/apps/submit/index.html');return {page,errs,ctx};}
const login=async p=>{await p.waitForSelector('#login:not([hidden])');await p.fill('#em','a@b.c');await p.fill('#pw','x');await p.click('#login button.primary');};
const imgs=[1,2,3].map(()=>S+'/fixtures/photo.jpg');
// 1 dealer happy path
for(const w of [390,1100]){
 let {page,errs}=await mk(w,'window.__role="dealer";window.__name="<img src=x onerror=window.__x=1>";');await login(page);await page.waitForSelector('#objs .item');
 console.log(w,'items',await page.$$eval('#objs .item b',e=>e.map(x=>x.textContent)),'xss',await page.evaluate(()=>window.__x||0));
 await page.screenshot({path:O(`s-list-${w}.png`)});
 await page.click('#objs .item button');await page.setInputFiles('#files',imgs);await page.waitForSelector('#previews img:nth-child(3)');
 console.log('send disabled w/o check',await page.$eval('#send',e=>e.disabled));
 await page.check('#assured');await page.fill('#note','Schön');await page.screenshot({path:O(`s-form-${w}.png`),fullPage:true});
 console.log('send disabled with check',await page.$eval('#send',e=>e.disabled));
 await page.click('#send');await page.waitForSelector('#mineCard:not([hidden])');await page.waitForTimeout(200);
 console.log('log',JSON.stringify((await page.evaluate(()=>window.__log)).map(l=>l.rpc||('up:'+l.up.split('/')[0]+' upsert='+l.upsert))),'mine',await page.textContent('#mineCard'),'errs',errs);
 await page.screenshot({path:O(`s-mine-${w}.png`)});
}
// 2 interrupted
{let {page}=await mk(390,'window.__role="dealer";window.__failAt=2;');await login(page);await page.waitForSelector('#objs .item');
 await page.click('#objs .item button');await page.setInputFiles('#files',imgs);await page.check('#assured');await page.click('#send');await page.waitForTimeout(2000);
 console.log('interrupt msg:',await page.textContent('#msg'));
 await page.click('#tMine');await page.waitForSelector('#mine .item');console.log('mine:',await page.textContent('#mine'),'btn',await page.$$eval('#mine button',e=>e.length));
 await page.click('#mine button');await page.setInputFiles('#files',imgs);console.log('retry send enabled',await page.$eval('#send',e=>!e.disabled));
 await page.click('#send');await page.waitForTimeout(500);console.log('retry log',JSON.stringify((await page.evaluate(()=>window.__log)).map(l=>l.rpc||'up')));}
// 3 rejected statuses
{let {page}=await mk(390,'window.__role="dealer";window.__projects=[{id:"a",title:"A",photos:["a/1.jpg"],published:true},{id:"b",title:"B",photos:["b/1.jpg"],published:false},{id:"c",title:"C",photos:["c/1"],published:false},{id:"f",title:"Foreign",photos:["f/1"],published:true}];window.__priv=[{project_id:"a"},{project_id:"c"},{project_id:"b",rejected_reason:"people",rejected_note:"двое на фото"}];');
 await login(page);await page.click('#tMine');await page.waitForSelector('#mine .item');console.log('foreign hidden',!(await page.textContent('#mine')).includes('Foreign'));console.log('statuses:',await page.$$eval('#mine .item',e=>e.map(x=>x.textContent)));}
// 3b rpc-only list, empty, error, no foreign-only
{let {page}=await mk(390,'window.__role="dealer";window.__orders=[];');await login(page);await page.waitForSelector('#objs .sub');console.log('empty:',await page.textContent('#objs'));
 await page.evaluate(()=>{window.__projects=[{id:"f",title:"Foreign",photos:["f/1"],published:true}]});await page.click('#tMine');await page.waitForSelector('#mine .sub');console.log('only foreign ->',await page.textContent('#mine'));
 console.log('rpcs',JSON.stringify((await page.evaluate(()=>window.__log)).map(l=>l.rpc)));}
// 4 non dealer, no backend
for(const r of ['manager','client']){let {page}=await mk(390,`window.__role="${r}"`);await login(page);await page.waitForSelector('#denied:not([hidden])');console.log(r,(await page.textContent('#denied')).trim(),'tabs hidden',await page.$eval('#tabs',e=>e.hidden));}
{const ctx=await b.newContext();const page=await ctx.newPage();await page.route('**/supabase.js',r=>r.abort());await page.goto('file://'+R+'/apps/submit/index.html');await page.waitForTimeout(500);console.log('sdk fail unavail:',await page.$eval('#unavail',e=>!e.hidden));}
{const ctx=await b.newContext();const page=await ctx.newPage();const html=fs.readFileSync(R+'/apps/submit/index.html','utf8').replace(/url: 'https:[^']*supabase.co'/,"url: ''");fs.writeFileSync(O('nb-submit.html'),html);await page.goto('file://'+O('nb-submit.html'));console.log('no url unavail:',await page.$eval('#unavail',e=>!e.hidden),await page.$eval('#login',e=>e.hidden));}
await b.close();})();
