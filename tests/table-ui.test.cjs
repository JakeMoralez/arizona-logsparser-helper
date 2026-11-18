const {fixture,root,chromium,output}=require('./startup.test.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function run(){
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1254,height:883},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture({rows:1000,delay:50})});const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':undefined})});
 try{
  await page.goto('https://arizonarp.logsparser.info/');await page.waitForFunction(()=>document.documentElement.dataset.alhStartup==='ready');
  await page.evaluate(()=>{ArizonaNotifications.show=()=>{};ArizonaMultiSelectManager.selectAllVisible();ArizonaMultiSelectManager.deselectAll();window.barCalls=0;const update=ArizonaMultiSelectManager.updateBarVisibility;ArizonaMultiSelectManager.updateBarVisibility=()=>{barCalls++;update()}});
  const boxes=page.locator('table.table tbody .arz-row-checkbox');const selected=()=>page.locator('table.table tbody .arz-row-checkbox:checked').count();
  await boxes.nth(1).click();await boxes.nth(6).click({modifiers:['Shift']});assert.equal(await selected(),6);assert.equal(await page.evaluate(()=>barCalls),2);
  await boxes.nth(4).click({modifiers:['Shift']});assert.equal(await selected(),2,'range unchecks, keeps selection outside range');
  await page.evaluate(()=>ArizonaMultiSelectManager.deselectAll());
  await boxes.nth(9).click();await boxes.nth(2).click({modifiers:['Shift']});assert.equal(await selected(),8,'reverse range');
  await page.evaluate(()=>{ArizonaMultiSelectManager.deselectAll();document.querySelector('table.table tbody').rows[4].hidden=true;document.querySelector('table.table tbody').rows[5].classList.add('arz-row-hidden')});
  await boxes.nth(1).click();await boxes.nth(7).click({modifiers:['Shift']});assert.equal(await selected(),5,'hidden rows are skipped');
  await page.evaluate(()=>ArizonaMultiSelectManager.deselectAll());await boxes.nth(0).click();await boxes.nth(3).focus();await page.keyboard.press('Shift+Space');assert.equal(await selected(),4);
  await page.evaluate(()=>{ArizonaMultiSelectManager.deselectAll();const row=document.querySelector('table.table tbody').insertRow();for(let i=0;i<4;i++)row.insertCell().textContent=i===0?'2026-11-18 11:00:00':'Новая строка'});
  await page.waitForFunction(()=>document.querySelector('table.table tbody tr:last-child[data-arz-processed=true]'));
  await page.evaluate(()=>{ArizonaMultiSelectManager.selectAllVisible();ArizonaMultiSelectManager.deselectAll()});await boxes.nth(997).click();await boxes.last().click({modifiers:['Shift']});assert.equal(await selected(),4);
  await page.evaluate(()=>{
   ArizonaMultiSelectManager.deselectAll();
   ArizonaObservers.write(()=>{const row=document.querySelector('table.table tbody').rows[0];const eye=document.createElement('button');eye.className='btn btn-danger js_entry_format_button';eye.setAttribute('aria-label','Раскрыть информацию');eye.innerHTML='<i class="fa-solid fa-eye"></i>';eye.onclick=()=>eye.dataset.expanded=eye.dataset.expanded==='true'?'false':'true';row.cells[1].append(eye)});
  });
  const eye=page.getByRole('button',{name:'Раскрыть информацию'});await eye.click();assert.equal(await eye.getAttribute('data-expanded'),'true');assert.deepEqual(await eye.evaluate(el=>{const r=el.getBoundingClientRect();return [r.width,r.height]}),[24,24]);
  for(const theme of ['dark','light'])for(const width of [390,1101,1201,1254,1440]){
   await page.evaluate(theme=>ArizonaThemeManager.init({theme}),theme);await page.setViewportSize({width,height:883});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'document overflow');
   if(width>700)assert.ok(await page.locator('table.table tbody tr').first().evaluate(el=>el.cells[3].getBoundingClientRect().right<=document.documentElement.clientWidth),'IP escaped table');
   await page.evaluate(()=>scrollTo(0,0));
   const cols=await page.locator('.alh-primary-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(cols,width<=420?1:width<=700?2:4);
  }
  await page.setViewportSize({width:1254,height:883});
  await page.evaluate(()=>{ArizonaMultiSelectManager.deselectAll();});await boxes.nth(1).click();
  await page.evaluate(()=>{const old=document.querySelector('table.table tbody');old.replaceWith(old.cloneNode(true));});
  await page.waitForFunction(()=>document.querySelectorAll('table.table tbody tr[data-arz-processed=true]').length===1001);
  await boxes.nth(6).click({modifiers:['Shift']});assert.equal(await selected(),2,'replaced tbody discards old range anchor');
  // Exercise the real item dialog and its async catalogue response.
  await page.setViewportSize({width:1254,height:883});await page.evaluate(()=>{
   scrollTo(0,0);ArizonaObservers.write(()=>{const row=document.querySelector('table.table tbody').rows[0];row.cells[1].textContent='Игрок Test_Player получил в инвентарь Лён [id: 595] (Количество: 7)';ArizonaInventoryLogs.processRow(row)});
   ArizonaInventory.send=async()=>({success:true,status:{ready:true,updatedAt:Date.now(),retryAt:0},item:{id:595,name:'Лён',model_id:871,eng_name:'Flax',stack:1000,slot_id:-1,is_custom:'CUSTOM_NONE',useable:true,tradeable:true,droppable:true,colored:false,enchanted:false,no_pic:true,no_info:false}});
  });
  await page.locator('.alh-item-link').first().click();await page.waitForSelector('.alh-item-card');
  assert.equal(await page.locator('.alh-item-card h3').textContent(),'Лён');
  await page.locator('.alh-item-technical summary').click();
  for(const theme of ['dark','light'])for(const width of [390,1254]){await page.evaluate(theme=>ArizonaThemeManager.init({theme}),theme);await page.setViewportSize({width,height:883});await page.screenshot({path:path.join(output,`inventory-${theme}-${width}.png`)});const box=await page.locator('.alh-item-dialog-box').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.height<=883)}
  await page.keyboard.press('Escape');await page.waitForSelector('.alh-item-dialog',{state:'detached'});
  await page.evaluate(async()=>{
   history.replaceState(null,'','?player=Test_Player&min_period=2026-11-12&max_period=2026-11-18&arz_online=1');
   ArizonaObservers.write(()=>{const row=document.querySelector('table.table tbody').rows[0];row.cells[1].textContent='Игрок Test_Player вышел, сессии: 17:01:32, последняя авторизация';});
   window.testCopies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>testCopies.push(text)},configurable:true});
   const {create}=await import('/content/modules/online.js');const manager=create({openOverlay:ArizonaUtils.openOverlay,closeOverlay:ArizonaUtils.closeOverlay,currentSettings:{}});manager.checkAutoCalculation();
  });
  await page.waitForSelector('.alh-online-result');assert.equal(await page.locator('.online-result-table tbody tr').count(),7);assert.equal(await page.locator('.online-result-summary dd').first().textContent(),'17:01:32');
  await page.locator('#alh-online-copy-btn').click();assert.match(await page.evaluate(()=>testCopies[0]),/17:01:32/);
  for(const theme of ['dark','light'])for(const width of [390,1254]){await page.evaluate(theme=>ArizonaThemeManager.init({theme}),theme);await page.setViewportSize({width,height:883});await page.screenshot({path:path.join(output,`online-result-${theme}-${width}.png`)});const box=await page.locator('.alh-online-result .arz-modal-container').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.height<=883)}
  await page.keyboard.press('Escape');assert.deepEqual(errors,[]);console.log('PASS: Shift ranges, keyboard, hidden/new rows, one counter update, compact eye, suffix-only fields, IP bounds and inventory/online result dialogs.');
 }finally{await browser.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
