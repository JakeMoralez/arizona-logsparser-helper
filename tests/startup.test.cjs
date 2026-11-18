/* Full content-script startup against a synthetic LogsParser document. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const scripts = manifest.content_scripts.flatMap(s => s.js).filter(s => !s.endsWith('stopCopy.js'));
const styles = manifest.content_scripts.flatMap(s => s.css || []);
const output = path.join(root, 'test-results'); fs.mkdirSync(output, { recursive: true });
function fixture(config) {
  const setup = `
    const config=${JSON.stringify(config)};
    const settings={arz_logsparser_helper_settings:{'extension-toggle':!config.disabled,'tweak-always-limit':'none','tweak-ip-info':!!config.geo,'sakai-compatibility-mode':config.sakai?'auto':'off'},arizonaSettings:{theme:config.light?'light':'dark',ipLookupEnabled:!!config.geo,geoIPEnabled:!!config.geo,masking:{enabled:true,maskIp:!config.geo}},arizonaTemplates:[]};
    const event=()=>({addListener(){},removeListener(){}});
    window.chrome={runtime:{id:'fixture',getURL:p=>new URL('/'+p,location.origin).href,onMessage:event(),sendMessage:(m,cb)=>{const result=m.action==='log_acquire'?{granted:true,epoch:1}:m.action==='log_finish'?{}:m.type==='FETCH_ECOSYSTEM_API'?{success:true,data:{users:[]}}:m.action==='fetch_ip_geo_batch'?{success:true,data:m.ips.map(query=>({query,status:'success',country:'Россия',city:'Москва',lat:55.75,lon:37.6}))}:{success:true,data:{}};if(cb)setTimeout(()=>cb(result),1000);else return Promise.resolve(result);}},storage:{onChanged:event(),local:{get:(keys,cb)=>{if(config.never)return;const result=Array.isArray(keys)?Object.fromEntries(keys.filter(k=>k in settings).map(k=>[k,settings[k]])):settings;if(cb)setTimeout(()=>cb(result),config.delay||0);else return Promise.resolve(result);},set:(v,cb)=>cb?.(),remove:(v,cb)=>cb?.()}}};
    window.startupShifts=[];window.startupFrames=[];
    new PerformanceObserver(list=>{for(const e of list.getEntries())if(document.documentElement.dataset.alhStartup==='ready'&&!e.hadRecentInput)startupShifts.push(e.value);}).observe({type:'layout-shift',buffered:true});
    window.addEventListener('alh-startup-ready',()=>{
      const capture=()=>Object.fromEntries(['.filter-buttons','table.table','.app-nav'].map(s=>{const r=document.querySelector(s)?.getBoundingClientRect();return [s,r&&[r.x,r.y,r.width,r.height]];}));
      startupFrames.push(capture());setTimeout(()=>startupFrames.push(capture()),1400);
    });
  `;
  const rows = Array.from({length:config.rows || 120}, (_, i) => `<tr><td>2026-11-18 10:00:00</td><td>Игрок <a href="?player=Test_Player"><strong>Test_Player</strong></a> авторизовался на сервер.</td><td>I: 100 SA$ / 0 SA$ / 0 AZ / ID: ${1000+i} / 0 VC$ / 0 lvl</td><td>${config.geo ? '<div class="table-ip"><code>I:</code><a href="?ip=192.0.2.1"><span class="badge badge-secondary">192.0.2.1</span></a><a href="?ip=203.0.113.140"><span class="badge badge-primary">203.0.113.140</span></a></div>' : '<a href="?ip=192.0.2.1">192.0.2.1</a>'}</td></tr>`).join('');
  const field = (name, title, inner) => `<div class="js_component_filter_item_${name} col-sm-3"><label>${title}</label><div class="form-group">${inner}</div></div>`;
  const fields = [
    field('server_number','Сервер','<select name="server_number"><option value="30">Love</option></select>'),
    field('type','Тип','<select name="type[]" multiple><option value="login">Вход</option></select>'),
    field('sort','Сортировка','<select name="sort"><option value="desc">Сначала новые</option></select>'),
    field('min_period','Период от','<input name="min_period" class="form-control" value="2026-11-01 00:00:00">'),
    field('max_period','Период до','<input name="max_period" class="form-control">'),
    field('player','ID или имя игрока','<input name="player" class="form-control">'),
    field('player2','ID или имя игрока #2','<input name="player2" class="form-control">'),
    field('ip','IP-адрес','<input name="ip" class="form-control">')
  ].join('');
  const content = config.challenge ? '<h1>Processing your request, please wait</h1>' : config.login ? '<form><input type="password" aria-label="Пароль"><button>Войти</button></form>' : `<div class="app"><nav class="app-nav"><a class="app-nav-logo">Arizona RP</a><a id="navbarDropdown">Test_Player</a></nav><div class="app-content--sidebar"><div class="app-content-body"><div class="row"><div class="col-md-12"><div class="card"><div class="card-body"><form class="filter js_component_filter">${fields}${Array.from({length:350},(_,i)=>`<div hidden class="js_component_filter_item"><input type="hidden" name="dynamic_${i}" value="${i}"></div>`).join('')}<div class="col-sm-12 mt-3"><div class="filter-buttons"><button class="btn btn-success" type="button">Применить</button></div></div></form><div class="row mb-3"><div class="col-sm-6"></div><div class="col-sm-6"><div class="row justify-content-end"><div class="col-sm-4 d-flex"><span>Показать</span><div class="ms-2"><select name="limit"><option value="100">100</option></select></div><span class="ms-2 text-muted">записей</span></div></div></div></div><table class="table"><thead><tr><th>Дата</th><th>Действие</th><th>Данные</th><th>IP</th></tr></thead><tbody>${rows}</tbody></table></div></div></div></div></div></div></div>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Startup fixture</title><script>${setup}</script>${styles.map(p=>`<link rel="stylesheet" href="/${p}">`).join('')}<style>body{margin:0;background:var(--az-bg);font:14px 'Segoe UI';color:var(--az-text)}.app-nav{display:flex;justify-content:space-between;padding:16px}.app-content-body{padding:20px}.filter-buttons{display:flex;flex-wrap:wrap;gap:8px}.form-control{display:block;width:100%}.row{display:flex;flex-wrap:wrap}.col-sm-6{width:50%}.justify-content-end{justify-content:flex-end}.d-flex{display:flex}.form-group{margin:0}table{width:100%}th,td{padding:8px}.app{min-height:100vh}.card{width:100%}.card-body{padding:16px}.js_component_filter{display:flex;flex-wrap:wrap}.js_component_filter>div{width:25%;flex:0 0 25%;min-width:0}.js_component_filter>div[class*=col-]{padding:12px}.col-sm-12{width:100%}.mt-3{margin-top:16px}.js_entry_format_button{font-size:24px;padding:12px}.col-md-12{width:100%;min-width:0}.col-sm-3{width:25%}.col-sm-4{width:33.333%}input[type=search]{background:white;color:black}.row{margin-left:-12px;margin-right:-12px}.row>*{padding-left:12px;padding-right:12px;box-sizing:border-box}</style>${scripts.map(p=>`<script src="/${p}"></script>${config.error && p==='content/theme.js'?'<script>ArizonaThemeManager.init=()=>{throw Error("fixture initialization failure")};</script>':''}`).join('')}</head><body>${config.sakai?'<style id="arz-helper-log-styles"></style>':''}${content}</body></html>`;
}
async function run() {
  const browser = await chromium.launch({headless:true});
  try {
    for (const config of [
      {name:'normal',delay:400,rows:500}, {name:'light',light:true,delay:80}, {name:'geo',geo:true,rows:40},
      {name:'disabled',disabled:true}, {name:'login',login:true},
      {name:'challenge',challenge:true}, {name:'sakai',sakai:true},
      {name:'error',error:true}, {name:'timeout',never:true}
    ]) {
      const page = await browser.newPage({viewport:{width:1113,height:883},reducedMotion:'reduce'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*', route=>{
        const url=new URL(route.request().url());
        if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture(config)});
        const file=path.resolve(root,'.'+url.pathname);
        if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
        return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':undefined});
      });
      await page.goto('https://arizonarp.logsparser.info/',{waitUntil:'domcontentloaded'});
      if(config.name==='normal') {
        assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('alh-startup-pending')),true);
        assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');
        assert.deepEqual(await page.evaluate(()=>{const s=getComputedStyle(document.documentElement,'::after');return [s.width,s.height,s.animationName];}),['48px','3px','none']);
        await page.emulateMedia({reducedMotion:'no-preference'});
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement,'::after').animationName),'alh-startup-slide');
        await page.emulateMedia({reducedMotion:'reduce'});
        await page.screenshot({path:path.join(output,'startup-preparing.png')});
      }
      await page.waitForFunction(()=>!!document.documentElement.dataset.alhStartup,{timeout:4500});
      const reason=await page.evaluate(()=>document.documentElement.dataset.alhStartup);
      const expected={disabled:'disabled',login:'non-log-page',challenge:'challenge',error:'error',timeout:'timeout'};
      assert.equal(reason,expected[config.name]||'ready',config.name+': '+errors.join('; '));
      if(reason==='ready') {
        assert.equal(await page.locator('table.table tbody tr:not([data-arz-processed="true"])').count(),0,config.name+' unprocessed initial rows');
        assert.equal(await page.locator('colgroup[data-arz-layout-lock]').count(),0);
        await page.waitForFunction(()=>startupFrames.length===2);
        const frames=await page.evaluate(()=>startupFrames);
        assert.deepEqual(frames[1],frames[0],config.name+' late layout change');
        const cls=await page.evaluate(()=>startupShifts.reduce((a,b)=>a+b,0));
        assert.ok(cls<0.005,config.name+' CLS='+cls);
        assert.deepEqual(errors,[]);
        if(config.geo) {
          assert.equal(await page.locator('.alh-geo-slot').count(),40);
          assert.match(await page.locator('.alh-geo-slot').first().innerText(),/Москва/);
        }
        await page.screenshot({path:path.join(output,`startup-${config.name}-ready.png`)});
        console.log(`${config.name}: ready, CLS=${cls}, stable layout, all initial rows processed`);
      } else {
        assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('alh-startup-pending')),false);
        console.log(`${config.name}: ${reason}, page accessible`);
      }
      await page.close();
    }
  } finally {await browser.close();}
}
module.exports = { fixture, root, chromium, output };
if (require.main === module) run().catch(e=>{console.error(e);process.exitCode=1;});
