const { fixture, root, chromium, output } = require('./startup.test.cjs');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function run() {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1201,height:883},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*', route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/authenticator') {
      const auth=fixture({login:true}).replace('<form><input type="password" aria-label="Пароль"><button>Войти</button></form>', '<div class="card"><div class="card-body"><form><div class="row mb-0"><div class="col-md-8 offset-md-4"><button class="btn btn-success" type="button">Выйти</button><button class="btn btn-success" type="button">Продолжить</button></div></div></form></div></div>');
      return route.fulfill({contentType:'text/html',body:auth});
    }
    if(url.searchParams.get('page')==='2') return route.fulfill({contentType:'text/html',body:'<table class="table"><tbody><tr><td>2026-11-18</td><td>Игрок Test_Player вышел с сервера</td><td>I: 0</td><td>—</td></tr></tbody></table><nav role="navigation"><ul class="pagination"></ul></nav>'});
    if(url.pathname==='/') {
      let html=fixture({delay:50,rows:80});
      html=html.replace('<option value="30">Love</option>', '<option value="30">Love</option><option value="1">Phoenix</option>')
        .replace('<option value="login">Вход</option>', '<option value="login">Вход</option><option value="money">Передача денег</option><option value="ban">Блокировка</option>')
        .replace('<option value="desc">Сначала новые</option>', '<option value="desc">Сначала новые</option><option value="asc">Сначала старые</option>')
        .replace('<option value="100">100</option>', '<option value="100">100</option><option value="500">500</option><option value="1000">1000</option>')
        .replace('</form>', '<button type="reset" id="host-reset">Сбросить форму</button></form>')
        .replace('</body>', '<nav role="navigation"><div><ul class="pagination"><li><a aria-label="Next" href="?page=2">2</a></li></ul></div></nav></body>');
      return route.fulfill({contentType:'text/html',body:html});
    }
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
    return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':undefined});
  });
  try {
    await page.goto('https://arizonarp.logsparser.info/');
    await page.waitForFunction(()=>document.documentElement.dataset.alhStartup==='ready');
    await page.evaluate(()=>{ArizonaNotifications.show=()=>{};});
    await page.waitForFunction(()=>!document.querySelector('#arz-scroll-top-btn').classList.contains('visible')&&document.querySelector('#arz-scroll-bottom-btn').classList.contains('visible'));
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    await page.waitForFunction(()=>!document.querySelector('#arz-scroll-bottom-btn').classList.contains('visible'));
    assert.ok(await page.locator('#arz-scroll-top-btn').evaluate(el=>el.classList.contains('visible')));
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForFunction(()=>!document.querySelector('#arz-scroll-top-btn').classList.contains('visible'));

    const proxy = name => page.locator(`[name="${name}"][data-alh-upgraded]`).evaluate(el=>el.id+'-display');
    // Simulate a late Select2 initialization by the host and verify retirement.
    await page.evaluate(()=>{
      const source=document.querySelector('select[name="sort"]');
      window.jQuery=function(el){return {data(){return el._legacy},select2(){el._legacy=false;el.nextElementSibling?.matches('.select2-container')&&el.nextElementSibling.remove();window.retiredWidgets=(window.retiredWidgets||0)+1;return this;},off(){return this;},on(){return this;}};};
      window.jQuery.fn={select2(){}};
      source._legacy=true;source.classList.add('select2-hidden-accessible');
      const old=document.createElement('span');old.className='select2-container';source.after(old);
    });
    await page.waitForFunction(()=>window.retiredWidgets===1);
    assert.equal(await page.locator('select.select2-hidden-accessible').count(),0);
    await page.evaluate(()=>{delete window.jQuery;});
    const server='#'+await proxy('server_number');
    await page.locator(server).click();
    await page.locator('#'+await proxy('limit')).click();
    assert.equal(await page.locator('.alh-control-popover').count(),1,'Only the current control may have a popup');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.alh-control-popover').count(),0);
    await page.locator(server).click();
    await page.getByRole('combobox',{name:'Поиск: Сервер',exact:true}).fill('Phoenix');
    await page.getByRole('option',{name:'Phoenix',exact:true}).click();
    assert.equal(await page.locator('select[name="server_number"]').inputValue(),'1');
    const type='#'+await proxy('type[]');
    await page.locator(type).click();
    await page.getByRole('option',{name:'Передача денег',exact:true}).click();
    await page.getByRole('option',{name:'Блокировка',exact:true}).click();
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.locator('select[name="type[]"]').evaluate(el=>[...el.selectedOptions].map(o=>o.value)),['money','ban']);
    assert.equal(await page.locator(type).inputValue(),'Выбрано: 2');
    await page.locator(type).click();
    await page.getByRole('button',{name:'Убрать Передача денег',exact:true}).click();
    assert.equal(await page.locator(type).inputValue(),'Блокировка');
    await page.keyboard.press('Escape');
    await page.locator('select[name="sort"]').evaluate(el=>{el.value='asc';el.dispatchEvent(new Event('change',{bubbles:true}));});
    assert.equal(await page.locator('#'+await proxy('sort')).inputValue(),'Сначала старые');
    const from='#'+await proxy('min_period');const to='#'+await proxy('max_period');
    await page.locator(from).fill('18.11.2026 10:20:30');
    assert.equal(await page.locator('[name="min_period"]').inputValue(),'2026-11-18 10:20:30');
    await page.locator(to).fill('19.11.2026 12:00:00');
    await page.locator(from).press('ArrowDown');
    await page.locator('.alh-calendar [data-date="2026-11-17"]').click();
    await page.locator('.alh-datetime-time input').nth(0).fill('09');
    await page.locator('.alh-datetime-time input').nth(1).fill('45');
    await page.locator('.alh-datetime-time input').nth(2).fill('12');
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    assert.equal(await page.locator('[name="min_period"]').inputValue(),'2026-11-17 09:45:12');
    const params=await page.locator('form.filter').evaluate(el=>new URLSearchParams(new FormData(el)).toString());
    assert.ok(params.includes('type%5B%5D=ban') && params.includes('server_number=1') && params.includes('min_period=2026-11-17+09%3A45%3A12'));
    await page.locator('#host-reset').click();
    await page.waitForFunction(()=>document.querySelector('[name="min_period"]').value===document.querySelector('#alh-site-min-period-display').value.split(' ')[0].split('.').reverse().join('-')+' '+document.querySelector('#alh-site-min-period-display').value.split(' ')[1]);
    assert.equal(await page.locator(from).inputValue(),'01.11.2026 00:00:00');
    assert.equal(await page.locator(type).inputValue(),'');
    await page.getByText('Сначала новые',{exact:true}).last().click();
    assert.equal(await page.locator('select[name="sort"]').inputValue(),'desc');
    await page.locator('#alh-date-shortcut-input-display').fill('15.11.2026');
    assert.equal(await page.locator('[name="min_period"]').inputValue(),'2026-11-15 00:00:00');
    assert.equal(await page.locator('[name="max_period"]').inputValue(),'2026-11-15 23:59:59');
    await page.locator('.arz-type-emoji-btn').first().click();
    assert.equal(await page.locator('.alh-combo-search').inputValue(),'➕');
    await page.keyboard.press('Escape');
    const rowCount=await page.locator('table.table tbody tr').count();
    await page.locator('#arz-load-more-btn-top').click();
    await page.waitForFunction(n=>document.querySelectorAll('table.table tbody tr').length>n,rowCount);
    assert.equal(await page.locator('table.table tbody tr').count(),rowCount+1);
    await page.waitForFunction(()=>!document.querySelector('#arz-load-more-btn'));
    // Native widget adapters must preserve delegated host behavior exactly once.
    await page.evaluate(()=>{window.hostChanges=0;document.querySelector('form.filter').addEventListener('change',e=>{if(e.target.name==='sort')hostChanges++;});});
    await page.locator('#'+await proxy('sort')).click();await page.getByRole('option',{name:'Сначала старые',exact:true}).click();
    assert.equal(await page.evaluate(()=>hostChanges),1);
    // The exact same upgraded form moves into/out of the floating filter dialog.
    await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
    const fab=page.locator('#arz-floating-filter-btn');
    await fab.waitFor({state:'visible'});await fab.click();
    await page.locator(server).click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('.arz-filter-modal').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.arz-filter-modal').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('arz-modal-open')),false);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.click('#arz-lookup-btn');
    assert.equal(await page.locator('#arz-lookup-close-bottom').isVisible(),false);
    assert.equal(await page.locator('#arz-lookup-close svg').count(),1);
    const dialog=await page.locator('#arz-lookup-overlay > .arz-modal-container').boundingBox();
    await page.mouse.move(dialog.x+30,dialog.y+30);await page.mouse.down();await page.mouse.move(2,2);await page.mouse.up();
    assert.equal(await page.locator('#arz-lookup-overlay').count(),1,'drag must not dismiss');
    await page.mouse.click(2,2);await page.waitForSelector('#arz-lookup-overlay',{state:'detached'});
    assert.equal(await page.evaluate(()=>document.body.classList.contains('arz-modal-open')),false);
    for(const theme of ['dark','light']) {
      await page.evaluate(theme=>ArizonaThemeManager.init({theme}),theme);
      for(const width of [390,1101,1201,1254,1440]) {
        await page.setViewportSize({width,height:883});await page.evaluate(()=>window.scrollTo(0,0));
        await page.evaluate(()=>{
          const source=document.querySelector('select[name="type[]"]');
          if(source.options.length<50)for(let i=0;i<50;i++)source.add(new Option('Очень длинное название типа '+i+' — '.repeat(20),'long'+i));
        });
        const initialHeight=await page.locator(type).evaluate(el=>el.closest('.alh-combo-control').getBoundingClientRect().height);
        for(const count of [0,1,5,50]) {
          await page.locator('select[name="type[]"]').evaluate((el,count)=>{[...el.options].forEach((o,i)=>o.selected=i<count);el.dispatchEvent(new Event('change',{bubbles:true}));},count);
          assert.equal(await page.locator(type).evaluate(el=>el.closest('.alh-combo-control').getBoundingClientRect().height),initialHeight);
        }
        await page.locator('table.table tbody tr').first().evaluate(tr=>{tr.cells[1].append(' ТехническоеЗначение'.repeat(80));tr.cells[2].append('1234567890'.repeat(80));});
        assert.equal(initialHeight,38);
        assert.equal(await page.locator(type).inputValue(),'Выбрано: 50');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`document overflow ${theme} ${width}`);
        assert.equal(await page.locator('form.filter > .alh-primary-grid').count(),1);
        const aligned=await page.evaluate(()=>{const input=document.querySelector('.alh-primary-grid').getBoundingClientRect();const actions=document.querySelector('.filter-buttons').getBoundingClientRect();const card=document.querySelector('.alh-filter-card').getBoundingClientRect();return {dx:Math.abs(input.x-actions.x),inset:actions.x-card.x}});
        assert.ok(aligned.dx<1,'action buttons must align with fields');
        assert.ok(aligned.inset>=(width<=700?16:24),'buttons need card inset');
        assert.equal(await page.locator('form.filter > .alh-form-actions.col-sm-12').count(),1);

        assert.equal(await page.locator('form.filter > .alh-secondary-grid > *').count(),3);
        assert.equal(await page.locator('#arz-filter-logs-regex').evaluate(el=>getComputedStyle(el).width),'34px');
        const playerWidth=await page.locator('#arz-multi-player-input').evaluate(el=>el.getBoundingClientRect().width);
        const searchWidth=await page.locator('#arz-filter-logs').evaluate(el=>el.getBoundingClientRect().width);
        assert.ok(Math.abs(playerWidth-searchWidth)<2);
        assert.equal(await page.locator('[name="dynamic_349"]').inputValue(),'349');
        await page.screenshot({path:path.join(output,`main-form-${theme}-${width}.png`)});
        await page.locator(type).click();
        const box=await page.locator('.alh-combo-list').boundingBox();
        assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=883);
        const searchColors=await page.locator('.alh-combo-search').evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color];});
        assert.notEqual(searchColors[0],searchColors[1]);
        if(theme==='dark')assert.notEqual(searchColors[0],'rgb(255, 255, 255)');
        await page.screenshot({path:path.join(output,`types-${theme}-${width}.png`)});
        await page.keyboard.press('Escape');
        await page.click('#arz-select-all-logs-btn');
        const bar=await page.locator('#arz-bulk-actions-bar').boundingBox();
        assert.ok(bar.x>=0&&bar.x+bar.width<=width+1);
        await page.screenshot({path:path.join(output,`bulk-actions-${theme}-${width}.png`)});
        assert.ok(await page.evaluate(()=>document.querySelector('.alh-bulk-spacer').getBoundingClientRect().height>=document.querySelector('#arz-bulk-actions-bar').getBoundingClientRect().height));
        await page.click('#arz-bulk-deselect');
        await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
        await fab.waitFor({state:'visible'});await fab.click();
        assert.equal(await page.locator('.arz-filter-modal form.filter > .alh-primary-grid').count(),1);
        await page.locator(type).click();
        await page.screenshot({path:path.join(output,`floating-types-${theme}-${width}.png`)});
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.arz-filter-modal').isVisible(),true);
        await page.keyboard.press('Escape');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`floating overflow ${theme} ${width}`);
      }
    }
    await page.setViewportSize({width:1201,height:883});
    await page.evaluate(()=>window.scrollTo(0,1200));
    const navBottom=await page.locator('.app-nav').evaluate(el=>el.getBoundingClientRect().bottom);
    const headerTop=await page.locator('table.table thead th').first().evaluate(el=>el.getBoundingClientRect().top);
    assert.ok(Math.abs(navBottom-headerTop)<=1,`sticky gap ${navBottom} vs ${headerTop}`);
    await page.locator('.app-nav').evaluate(el=>el.style.height='76px');
    await page.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--alh-navbar-bottom'))-document.querySelector('.app-nav').getBoundingClientRect().bottom)<1);
    assert.deepEqual(errors,[]);
    await page.goto('https://arizonarp.logsparser.info/authenticator');
    await page.waitForFunction(()=>document.documentElement.dataset.alhStartup==='non-log-page');
    for(const width of [1101,390]) {
      await page.setViewportSize({width,height:883});
      const exit=await page.getByRole('button',{name:'Выйти',exact:true}).boundingBox();
      const next=await page.getByRole('button',{name:'Продолжить',exact:true}).boundingBox();
      if(width>420) assert.ok(Math.abs(exit.y-next.y)<1 && next.x-exit.x-exit.width>=11);
      else assert.ok(next.y>=exit.y+exit.height+11);
      await page.screenshot({path:path.join(output,`authenticator-${width}.png`)});
    }
    console.log('PASS: main form, server search, multiselect summary, 350 hidden fields, long values, datetime seconds, FormData, reset, host events, floating form, modal backdrop/drag, themes and five widths.');
  } finally {await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
