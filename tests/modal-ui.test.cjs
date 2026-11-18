/* Run with Node and Playwright (or PLAYWRIGHT_MODULE pointing to its package).
 * Uses the actual dialog managers with only network/platform services stubbed.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('content/content.js');
const section = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from) + from.length));
const fixtureScript = `
const currentSettings = {}, toolSettings = s => s;
const runWhenElementExists = (selector, cb) => { if(document.querySelector(selector)) cb(); return () => {}; };
const isValidNickname = v => /^[a-z]+_[a-z]+$/i.test(v);
const logOptions = () => ({});
const fetchWithRetry = () => { throw Error('Network disabled in UI fixture'); };
const calls = []; window.testCalls = calls;
window.ArizonaNotifications = {show(){}};
window.testClipboard=[];
Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>testClipboard.push(text)}});
window.ArizonaUtils = {escapeHtml(s) {const d=document.createElement('div');d.textContent=s;return d.innerHTML;}};
window.ArizonaMaskingManager = {maskText:s=>s};
window.chrome = {storage:{local:{set(){}}}};
${section('  function openOverlay(overlay)', '  function logOptions(overlay)')}
${section('  function setupNickCounter(', '  function closeFilterModal(')}
${section('  window.ArizonaLookupManager =', '  window.ArizonaDateShortcut =')}
${section('  window.ArizonaTemplatesManager =', '  window.ArizonaMultiSelectManager =')}
for (const name of ['Online','Punishment','Report','IpBatch','IdNick']) window['Arizona'+name+'Manager'] = new Proxy({}, {get:(_,method)=>(...args)=>calls.push([name,method,...args])});
const ctx = {currentSettings, automaticCalculationEnabled:false, openOverlay,closeOverlay,setupDateShortcuts,runWhenElementExists,fetchWithRetry,logOptions,isValidNickname,setupNickCounter,getIpCellFromRow:()=>null,parseAllIpsFromCell:()=>[],loadIpDetailsCache:async()=>{},ipDetailsCache:{},calculateHaversineDistance:()=>0};
window.fixture = {openOverlay,closeOverlay,ctx};
window.ArizonaThemeManager.init({theme:'dark'});
window.ArizonaLookupManager.init({}); window.ArizonaTemplatesManager.init({});
import('/content/modules/forms.js').then(m=>{window.forms=m.create(ctx);forms.init({});});
import('/content/modules/analytics.js').then(m=>{window.analytics=m.create(ctx);analytics.init({});});
document.getElementById('open-lookup').onclick=()=>ArizonaLookupManager.openModal();
document.getElementById('open-forms').onclick=()=>forms.openModal();
document.getElementById('open-analytics').onclick=()=>analytics.openModal();
document.getElementById('open-templates').onclick=()=>document.getElementById('arz-templates-btn').click();
`;
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Проверка модальных окон</title>
<link rel="stylesheet" href="/content/content.css"><link rel="stylesheet" href="/content/modal-ui.css">
<style>body{margin:0;background:var(--az-bg);color:var(--az-text);font:14px 'Segoe UI',sans-serif;padding:24px}main{opacity:.25}button{font:inherit}table{width:100%}</style>
<main><h1>Arizona RP · Логи</h1><button id="open-lookup">Открыть пробив</button><button id="open-analytics">Открыть аналитику</button><button id="open-forms">Открыть формы</button><button id="open-templates">Открыть шаблоны</button>
<form class="filter"><select name="type[]"><option value="login">Вход на сервер</option><option value="ban">Блокировка</option><option value="money">Передача денег</option></select><input name="player" value="Test_Player"></form><div class="filter-buttons"></div>
<table class="table"><tbody><tr><td>18.11.2026</td><td><a><strong>Test_Player</strong></a> передал деньги <a><strong>Other_Player</strong></a></td><td></td><td></td></tr></tbody></table></main>
<script src="/content/theme.js"></script><script src="/content/modal-controls.js"></script><script type="module" src="/fixture.js"></script></html>`;
const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  if (route === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); return; }
  if (route === '/fixture.js') { res.setHeader('Content-Type','text/javascript; charset=utf-8'); res.end(fixtureScript); return; }
  const file = path.resolve(root, '.' + route);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(file));
});
async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1113,height:883}, reducedMotion:'reduce'});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const output = path.join(root, 'test-results'); fs.mkdirSync(output,{recursive:true});
  const screenshot = async options => {
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot(options);
  };
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.forms && window.analytics);
    const dates = await page.evaluate(() => {
      const d=ArizonaModalControls.date;
      return [d.parseDisplay('29.02.2024'),d.parseDisplay('29.02.2023'),d.parseDisplay('31.04.2026'),d.parseDisplay('01.01.0001'),d.displayDate('2026-12-31'),d.validTime('23:59'),d.validTime('24:00')];
    });
    assert.deepEqual(dates,['2024-02-29',null,null,'0001-01-01','31.12.2026',true,false]);
    await page.click('#open-lookup');
    await page.locator('#arz-lookup-date-from-display').focus();
    assert.deepEqual(await page.locator('#arz-lookup-date-from-display').evaluate(el=>{
      const s=getComputedStyle(el);return [s.outlineStyle,s.boxShadow,s.borderTopWidth];
    }),['none','none','0px']);
    assert.equal(await page.locator('.alh-field-trigger svg').count(),6);
    await page.locator('#arz-lookup-date-from-display').fill('29.02.2024');
    assert.equal(await page.locator('#arz-lookup-date-from').inputValue(),'2024-02-29');
    await page.evaluate(()=>document.getElementById('arz-lookup-date-to').value='2024-03-02');
    assert.equal(await page.locator('#arz-lookup-date-to-display').inputValue(),'02.03.2024');
    await page.locator('#arz-lookup-date-from-display').fill('31.02.2024');
    assert.equal(await page.locator('#arz-lookup-date-from-display').getAttribute('aria-invalid'),'true');
    await page.locator('#arz-lookup-start-btn').click();
    assert.equal(await page.locator('#arz-lookup-overlay').count(),1,'Invalid input must not start a request');
    await page.locator('#arz-lookup-date-from-display').fill('03.03.2024');
    assert.match(await page.locator('#arz-lookup-date-from-display-error').innerText(),/позже/);
    await page.locator('[data-range="week"]').click();
    assert.equal(await page.locator('[data-range="week"]').getAttribute('aria-pressed'),'true');
    assert.notEqual(await page.locator('#arz-lookup-date-from-display').inputValue(),'03.03.2024');
    await page.evaluate(()=>{document.getElementById('arz-lookup-date-from').value='2024-02-29';document.getElementById('arz-lookup-date-to').value='2024-03-02';});
    await page.locator('#arz-lookup-date-from-display').press('ArrowDown');
    assert.equal(await page.locator('.alh-calendar [data-date="2024-02-29"]').getAttribute('aria-pressed'),'true');
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#arz-lookup-date-from').inputValue(),'2024-03-01');
    await page.locator('#arz-lookup-date-from-display').press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.alh-control-popover').count(),0);
    assert.equal(await page.locator('#arz-lookup-overlay').count(),1);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'arz-lookup-date-from-display');
    await page.locator('#arz-lookup-date-from-display').press('ArrowDown');
    await page.getByRole('button',{name:'Выбрать месяц',exact:true}).click();
    await page.getByRole('button',{name:'Декабрь',exact:true}).click();
    await page.getByRole('spinbutton',{name:'Год',exact:true}).fill('2025');
    await page.getByRole('spinbutton',{name:'Год',exact:true}).press('Tab');
    await page.locator('.alh-calendar [data-date="2025-12-31"]').click();
    assert.equal(await page.locator('#arz-lookup-date-from').inputValue(),'2025-12-31');
    await page.locator('#arz-lookup-date-from-display').press('ArrowDown');
    await page.getByRole('button',{name:'Очистить',exact:true}).click();
    assert.equal(await page.locator('#arz-lookup-date-from').inputValue(),'');
    await page.locator('.arz-accordion-header').click();
    assert.equal(await page.locator('.alh-clean-online').evaluate(el=>getComputedStyle(el).borderLeftWidth),'0px');
    assert.equal(await page.locator('.alh-clean-online .arz-accordion-content').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await page.locator('#arz-lookup-stealth').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#arz-lookup-stealth').isChecked(),true);
    assert.equal(await page.locator('#arz-lookup-stealth').evaluate(el=>getComputedStyle(el).appearance),'none');
    await page.keyboard.press('Space');
    await page.locator('#arz-lookup-wd-from-display').fill('25:00');
    assert.equal(await page.locator('#arz-lookup-wd-from-display').getAttribute('aria-invalid'),'true');
    await page.locator('#arz-lookup-wd-from-display').fill('09:30');
    assert.equal(await page.locator('#arz-lookup-wd-from').inputValue(),'09:30');
    await page.locator('#arz-lookup-wd-from-display').press('ArrowDown');
    await page.locator('.alh-time-part input').first().fill('18');
    await page.locator('.alh-time-part input').last().fill('45');
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    assert.equal(await page.locator('#arz-lookup-wd-from').inputValue(),'18:45');
    await screenshot({path:path.join(output,'online-expanded-dark.png')});
    // Dynamic controls and nested-dialog focus/cleanup use the production lifecycle.
    await page.evaluate(()=>{
      const root=document.createElement('div');root.className='alh-modal-overlay';root.id='nested-test';
      root.innerHTML='<div class="arz-modal-container"><div class="alh-modal-body"><label for="dynamic-select">Режим</label><select id="dynamic-select"><option value="a">Первый</option><option value="b">Второй</option></select></div></div>';
      fixture.openOverlay(root);
      const date=document.createElement('input');date.type='date';date.id='dynamic-date';root.querySelector('.alh-modal-body').append(date);
    });
    await page.waitForSelector('#dynamic-date-display');
    await page.locator('#nested-test [role="combobox"]').press('ArrowDown');
    await page.keyboard.press('End');await page.keyboard.press('Enter');
    assert.equal(await page.locator('#dynamic-select').inputValue(),'b');
    await page.locator('#dynamic-date-display').press('ArrowDown');await page.keyboard.press('Escape');
    assert.equal(await page.locator('#nested-test').count(),1);
    await page.keyboard.press('Escape');await page.waitForSelector('#nested-test',{state:'detached'});
    assert.equal(await page.locator('#arz-lookup-overlay').count(),1);
    await page.locator('[data-tab="dump"]').click();
    assert.equal(await page.locator('#arz-dump-limit').evaluate(el=>getComputedStyle(el).appearance),'textfield');
    await page.locator('#arz-dump-type-display').click();
    await page.locator('.alh-combo-search').fill('Блок');
    const fieldBox=await page.locator('#arz-dump-type-display').boundingBox();
    const listBox=await page.locator('.alh-combo-list').boundingBox();
    assert.ok(Math.abs(fieldBox.width-listBox.width)<1);
    await screenshot({path:path.join(output,'dump-combobox-dark.png')});
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#arz-dump-type').inputValue(),'ban');
    await page.locator('.alh-combo-search').fill('unknown_custom_type');
    await page.getByRole('button',{name:'Добавить «unknown_custom_type»',exact:true}).click();
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{const o=new Option('Новый тип','new_type');document.getElementById('arz-dump-type').append(o);});
    await page.locator('#arz-dump-type-display').click();await page.locator('.alh-combo-search').fill('Новый');
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.deepEqual(await page.locator('#arz-dump-type').evaluate(el=>[...el.selectedOptions].map(o=>o.value)),['ban','unknown_custom_type','new_type']);
    await page.keyboard.press('Escape');
    // All lookup tabs, including fields hidden by the selected mode.
    for(const tab of ['punish','report','ip','idnick','online']) await page.locator(`[data-tab="${tab}"]`).click();
    await page.locator('#arz-lookup-nicks').fill('Test_Player');
    await page.locator('#arz-lookup-date-from-display').fill('01.11.2026');
    await page.locator('#arz-lookup-date-to-display').fill('18.11.2026');
    await page.locator('#arz-lookup-start-btn').click();
    assert.equal((await page.evaluate(()=>testCalls))[0][0],'Online');
    assert.ok((await page.evaluate(()=>testCalls))[0].includes('2026-11-01'));
    await page.waitForSelector('#arz-lookup-overlay',{state:'detached'});
    for(const [tab, manager] of [['punish','Punishment'],['report','Report'],['ip','IpBatch'],['idnick','IdNick']]) {
      await page.click('#open-lookup');await page.click(`[data-tab="${tab}"]`);
      await page.fill('#arz-lookup-nicks','Test_Player');
      if(tab==='punish'||tab==='report') {await page.fill('#arz-lookup-date-from-display','01.11.2026');await page.fill('#arz-lookup-date-to-display','18.11.2026');}
      await page.click('#arz-lookup-start-btn');await page.waitForSelector('#arz-lookup-overlay',{state:'detached'});
      assert.equal((await page.evaluate(()=>testCalls)).at(-1)[0],manager);
    }
    await page.click('#open-forms');
    await page.locator('#alh-form-template').fill('/check {nick}');
    assert.equal(await page.locator('.arz-list-item-text').innerText(),'/check Test_Player');
    await page.locator('[data-source="second"]').click();
    assert.equal(await page.locator('.arz-list-item-text').innerText(),'/check Other_Player');
    await page.click('#arz-copy-all-btn');
    assert.equal(await page.evaluate(()=>testClipboard.at(-1)),'/check Other_Player');
    await screenshot({path:path.join(output,'forms-dark.png')});
    await page.keyboard.press('Escape'); await page.waitForSelector('#alh-forms-overlay',{state:'detached'});
    await page.click('#open-templates');
    await page.fill('#arz-new-template-name','Проверка игрока'); await page.click('#arz-add-template-btn');
    assert.equal(await page.locator('.arz-template-card-title').innerText(),'Проверка игрока');
    await page.fill('#arz-templates-search','отсутствует'); assert.equal(await page.locator('.arz-template-card').count(),0);
    await page.fill('#arz-templates-search','');
    await screenshot({path:path.join(output,'templates-dark.png')});
    await page.keyboard.press('Escape'); await page.waitForSelector('#alh-templates-overlay',{state:'detached'});
    await page.click('#open-templates'); assert.equal(await page.locator('.arz-template-card').count(),1);
    await page.click('.btn-delete'); assert.equal(await page.locator('.arz-template-card').count(),0);
    await page.keyboard.press('Escape'); await page.waitForSelector('#alh-templates-overlay',{state:'detached'});
    await page.click('#open-analytics');
    for(const tab of ['repeats','leader-sales','admin-sales','business','similar-ips']) await page.locator(`[data-tab="${tab}"]`).click();
    await screenshot({path:path.join(output,'analytics-dark.png')});
    await page.keyboard.press('Escape'); await page.waitForSelector('#arz-analytics-overlay',{state:'detached'});
    for(const theme of ['dark','light']) {
      await page.evaluate(theme=>ArizonaThemeManager.init({theme}),theme);
      for(const width of [1113,1440,390]) {
        await page.setViewportSize({width,height:width===1440?900:883});
        await page.click('#open-lookup');
        await page.click('[data-tab="online"]');
        await page.fill('#arz-lookup-nicks','Test_Player, Other_Player');
        await page.evaluate(()=>{document.getElementById('arz-lookup-date-from').value='2026-11-01';document.getElementById('arz-lookup-date-to').value='2026-11-18';});
        await page.locator('#arz-lookup-overlay > .arz-modal-container').focus();
        await screenshot({path:path.join(output,`lookup-${theme}-${width}.png`)});
        await page.locator('#arz-lookup-date-from-display').press('ArrowDown');
        const box=await page.locator('.alh-calendar').boundingBox();
        assert.ok(box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=page.viewportSize().height,JSON.stringify(box));
        await screenshot({path:path.join(output,`calendar-${theme}-${width}.png`)});
        await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
        await page.waitForSelector('#arz-lookup-overlay',{state:'detached'});
        assert.equal(await page.locator('.alh-control-popover').count(),0);
        for(const [menu,id] of [['forms','alh-forms-overlay'],['templates','alh-templates-overlay'],['analytics','arz-analytics-overlay']]) {
          await page.click(`#open-${menu}`);
          const bounds=await page.locator(`#${id} > .arz-modal-container`).boundingBox();
          assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1 && bounds.height<=page.viewportSize().height);
          if(width===390) await screenshot({path:path.join(output,`${menu}-${theme}-390.png`)});
          await page.keyboard.press('Escape');await page.waitForSelector(`#${id}`,{state:'detached'});
        }
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: date/time parsing, range validation, shortcuts, programmatic sync, calendar keyboard, combobox, all menu tabs, command generation, template persistence, request arguments, six responsive/theme layouts.');
  } finally { await browser.close(); server.close(); }
}
run().catch(e=>{console.error(e);server.close();process.exitCode=1;});
