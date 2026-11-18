const {fixture,root,chromium,output}=require('./startup.test.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const sizes=process.env.ALH_PERF_ROWS?process.env.ALH_PERF_ROWS.split(',').map(Number):[100,500,1000];
const runs=Number(process.env.ALH_PERF_RUNS||3);
async function sample(browser,rows,run){
 const page=await browser.newPage({viewport:{width:1254,height:883},reducedMotion:'reduce'});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 await page.addInitScript(()=>{
  window.perf={callbacks:0,queries:0,longTasks:[],callbackMs:0};
  const Native=MutationObserver;window.MutationObserver=class extends Native{constructor(cb){super((r,o)=>{const start=performance.now();perf.callbacks++;try{cb(r,o)}finally{perf.callbackMs+=performance.now()-start}})}};
  for(const proto of [Document.prototype,Element.prototype])for(const key of ['querySelector','querySelectorAll']){const orig=proto[key];proto[key]=function(...args){perf.queries++;return orig.apply(this,args)}}
  new PerformanceObserver(list=>perf.longTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});
 });
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture({rows,delay:50})});const codeRoot=process.env.ALH_CODE_ROOT||root;const file=path.resolve(codeRoot,'.'+url.pathname);if(!file.startsWith(codeRoot+path.sep)||!fs.existsSync(file))return route.abort();return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':undefined})});
 const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const delta=(a,b)=>Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(k=>[k,k.endsWith('Duration')?Math.round((b[k]-a[k])*10000)/10:b[k]-a[k]]));
 const phases={};let phaseStart;
 const begin=async()=>{await page.evaluate(()=>window.perf={callbacks:0,queries:0,longTasks:[],callbackMs:0});phaseStart=await metrics()};
 const end=async name=>{await page.waitForTimeout(150);const now=await metrics();phases[name]={...delta(phaseStart,now),...await page.evaluate(()=>({...perf}))}};
 try{
  await cdp.send('Tracing.start',{categories:'devtools.timeline',transferMode:'ReturnAsStream'});
  const start=await metrics();await page.goto('https://arizonarp.logsparser.info/');await page.waitForFunction(n=>document.querySelectorAll('table.table tbody tr[data-arz-processed=true]').length===n,rows);await page.waitForFunction(()=>document.documentElement.dataset.alhStartup==='ready');await page.waitForTimeout(2500);phases.startup={...delta(start,await metrics()),...await page.evaluate(()=>({...perf}))};
  await page.evaluate(()=>{ArizonaNotifications.show=()=>{}});
  await begin();await page.waitForTimeout(400);await end('idle');
  await begin();const selectionMs=await page.evaluate(()=>{const start=performance.now();ArizonaMultiSelectManager.selectAllVisible();return performance.now()-start});await end('selection');phases.selection.handlerMs=selectionMs;
  await begin();for(let i=0;i<16;i++){await page.evaluate(i=>scrollTo(0,i*350),i);await page.waitForTimeout(16)}await end('scroll');
  await begin();await page.locator('#arz-floating-filter-btn').click();await page.keyboard.press('Escape');await end('filter');
  const finished=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await finished;let raw='';for(;;){const chunk=await cdp.send('IO.read',{handle:stream});raw+=chunk.data;if(chunk.eof)break}await cdp.send('IO.close',{handle:stream});
  const trace=JSON.parse(raw);const paint=trace.traceEvents.filter(e=>e.name==='Paint'&&e.ph==='X').reduce((sum,e)=>sum+(e.dur||0),0)/1000;
  const label=process.argv[2]||'current';if(run===0&&rows===1000)fs.writeFileSync(path.join(output,`trace-${label}-1000.json`),raw);
  const result={rows,run,paintMs:paint,phases};console.log(JSON.stringify(result));
  if(label==='after'){assert.equal(phases.idle.callbacks,0);assert.ok(selectionMs<100);assert.ok(phases.scroll.longTasks.every(ms=>ms<100),'scroll must not produce repeated 100ms stalls');assert.ok(!trace.traceEvents.some(e=>e.name==='FunctionCall'&&e.args?.data?.functionName==='updateScrollButtons'),'scroll controls must not measure layout');assert.equal(await page.locator('table.table tbody tr').count(),rows)}
  return result;
 }finally{await page.close()}
}
async function main(){const browser=await chromium.launch({headless:true});const samples=[];try{for(const rows of sizes)for(let run=0;run<runs;run++)samples.push(await sample(browser,rows,run))}finally{await browser.close()}const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];const medians=sizes.map(rows=>({rows,phases:Object.fromEntries(['startup','idle','selection','scroll','filter'].map(phase=>[phase,Object.fromEntries(['ScriptDuration','LayoutDuration','RecalcStyleDuration','queries','callbackMs'].map(k=>[k,median(samples.filter(s=>s.rows===rows).map(s=>s.phases[phase][k]))]))]))}));fs.writeFileSync(path.join(output,`performance-${process.argv[2]||'current'}.json`),JSON.stringify({samples,medians},null,2));console.log('MEDIANS '+JSON.stringify(medians))}
main().catch(e=>{console.error(e);process.exitCode=1});
