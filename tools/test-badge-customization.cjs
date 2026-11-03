const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {DESIGNS,style}=require('../core/badges/config.cjs');
const store=new Store(':memory:');store.rememberAccount('123','owner');store.add('friend');
const service=new Badges({store,account:()=> '123',port:0});
let browser;

// Exercise editable controls and reconnecting sources on an isolated HTTP server.
(async()=>{
  await service.start();browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  await page.goto(service.editor());await page.locator('#f-width').waitFor();
  const output=path.join(__dirname,'../test-output/badge-customization');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'editor.png')});
  await page.locator('#f-width').fill('');await page.locator('#f-width').pressSequentially('360');
  await page.locator('#f-stampOffsetX').fill('-30');await page.locator('#f-stampOffsetY').fill('24');
  await page.locator('#f-borderStyle').selectOption('double');await page.locator('#f-avatarShape').selectOption('square');
  await page.locator('#f-backgroundOpacity').fill('0');await page.locator('#f-shadowOpacity').fill('0');
  await page.locator('#f-fontWeight').fill('900');await page.locator('#f-descriptionWeight').fill('700');
  await page.locator('#f-headerText').fill('НАШ ГОСТЬ');await page.locator('#f-showHandle').uncheck();
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено');
  const saved=service.config().style;
  assert.equal(saved.width,360);assert.equal(saved.stampOffsetX,-30);assert.equal(saved.backgroundOpacity,0);
  assert.equal(saved.shadowOpacity,0);assert.equal(saved.showHandle,false);assert.equal(saved.headerText,'НАШ ГОСТЬ');
  const overlay=await context.newPage();await overlay.goto(service.info().url);
  await overlay.evaluate(()=>window.probe=new BadgeView(document.querySelector('.badge-stage')));
  for(const design of DESIGNS){
    const actual=await overlay.evaluate(data=>{
      window.probe.render(data);
      const card=document.querySelector('.shoutout-badge'),avatar=card.querySelector('.badge-avatar'),stamp=card.querySelector('.badge-stamp-slot');
      return {width:card.offsetWidth,background:getComputedStyle(card).getPropertyValue('--bg1').trim(),shape:avatar.style.borderRadius,weight:getComputedStyle(card.querySelector('.badge-name')).fontWeight,handle:card.querySelector('.badge-handle').hidden,stamp:stamp.style.transform};
    },{login:'friend',description:'Test description',style:style({...saved,design:design.id})});
    assert.equal(actual.width,360);assert(actual.background.endsWith('00'));assert.equal(actual.shape,'0px');
    assert.equal(actual.weight,'900');assert.equal(actual.handle,true);assert.equal(actual.stamp,'translate(-30px, 24px)');
  }
  await overlay.close();service.current=null;service.queue=[];
  let failedRequests=0;
  const reconnect=await context.newPage();
  await reconnect.route('**/api/view/*',async route=>{
    if(failedRequests<2){failedRequests++;await route.abort('connectionrefused');return;}
    await route.continue();
  });
  await service.test('friend');const eventId=service.current.id;
  await reconnect.goto(service.info().url);
  await reconnect.waitForFunction(()=>document.querySelector('.shoutout-badge')?.hidden===false);
  assert.equal(failedRequests,2);assert.equal(service.current.id,eventId);assert.equal(service.current.login,'friend');
  assert.equal(service.queue.length,0);assert.equal(store.history('123').length,0);
  console.log(JSON.stringify({ok:true,designs:6,controlsPersist:true,zeroOpacity:true,sourceReconnect:true,currentBadgePreserved:true}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();service.close();store.close();});
