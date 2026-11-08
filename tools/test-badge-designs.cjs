const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {style,DESIGNS,FONTS,EFFECTS,PALETTES}=require('../core/badges/config.cjs');
const out=path.resolve(__dirname,'../test-output/badge-designs');fs.mkdirSync(out,{recursive:true});
const store=new Store(':memory:');store.rememberAccount('123','owner');store.add('sayrek_liss');store.add('mrdratato');
const description='Тот самый стример, ради которого откладываешь все дела.';
const service=new Badges({store,account:()=> '123',port:0,profile:async login=>({displayName:login==='sayrek_liss'?'Sayrek_Liss':'Mrdratato',avatarUrl:'https://static-cdn.jtvnw.net/test-avatar.png'})});
service.save({account:'123',login:'sayrek_liss',person:{enabled:true,custom:false,description,style:style()}});
service.save({account:'123',login:'mrdratato',person:{enabled:false,custom:true,description:'Сохранить новый текст',style:style({design:'pass'})}});
const otherBefore=JSON.stringify(service.rule('mrdratato')),historyBefore=JSON.stringify(store.history('123'));
let browser;
(async()=>{
  await service.start();const url=service.info().url;
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const context=await browser.newContext();await context.route('https://static-cdn.jtvnw.net/**',route=>route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(__dirname,'../tests/fixtures/badge-avatar.png'))}));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:1000});await page.goto(service.editor('sayrek_liss'));
  await page.waitForFunction(()=>document.querySelector('#description').value.length>0);
  assert.equal(await page.locator('#description').inputValue(),description);assert(await page.locator('[data-design=air]').last().count());
  assert.equal(await page.locator('#designs button').count(),7);assert(await page.locator('#designs button').first().isDisabled());
  await page.locator('#default-theme').click();
  const chosen={air:'#ffbb88',pass:'#3b254a',sticker:'#bdd8ef',terminal:'#153a2b',ticket:'#ffdde5',frame:'#e7f0fb'};
  for(const design of DESIGNS.filter(d=>d.id!=='custom')){await page.locator('#designs [data-design='+design.id+']').click();await page.locator('#f-background1').fill(chosen[design.id]);await page.locator('#f-stampColor').fill('#9b3f63');}
  for(const design of DESIGNS.filter(d=>d.id!=='custom')){await page.locator('#designs [data-design='+design.id+']').click();assert.equal(await page.locator('#f-background1').inputValue(),chosen[design.id]);}
  await page.locator('#designs [data-design=sticker]').click();
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено');
  assert.equal(service.config().style.design,'sticker');for(const design of DESIGNS.filter(d=>d.id!=='custom'))assert.equal(service.config().style.palettes[design.id].background1,chosen[design.id]);
  await page.reload();await page.locator('#designs [aria-pressed=true]').waitFor();assert.equal(await page.locator('#f-background1').inputValue(),chosen.sticker);
  await page.locator('#reset').click();assert.equal(await page.locator('#f-background1').inputValue(),PALETTES.sticker.background1);
  await page.locator('#designs [data-design=air]').click();assert.equal(await page.locator('#f-background1').inputValue(),chosen.air);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено');
  for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'editor-'+width+'.png'),fullPage:true});}
  await page.setViewportSize({width:1280,height:1000});await page.locator('.choose').filter({hasText:'sayrek_liss'}).click();await page.locator('#person-custom').check();await page.locator('#designs [data-design=pass]').click();await page.locator('#f-textColor').fill('#f5db83');await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено');
  assert.equal(service.rule('sayrek_liss').description,description);assert.equal(service.rule('sayrek_liss').style.design,'pass');assert.equal(service.rule('sayrek_liss').style.palettes.pass.textColor,'#f5db83');assert.equal(service.config().style.design,'air');
  const overlay=await context.newPage();overlay.on('pageerror',e=>errors.push(e.message));await overlay.setViewportSize({width:560,height:560});await overlay.goto(url);
  await page.locator('#test-selected').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('отправлена'));
  await overlay.locator('.shoutout-badge').waitFor({state:'visible'});
  assert.equal(service.frame().event.style.design,'pass');assert.equal(service.frame().event.description,description);
  assert.equal(service.info().url,url);assert.equal(JSON.stringify(service.rule('mrdratato')),otherBefore);assert.equal(JSON.stringify(store.history('123')),historyBefore);
  service.current=null;service.queue=[];
  await overlay.evaluate(()=>window.probe=new BadgeView(document.querySelector('.badge-stage')));
  let cases=0;
  for(const design of DESIGNS.filter(d=>d.id!=='custom')){
    for(const font of FONTS){
      for(const long of [false,true]){
        const settings=style({design:design.id,font,...(long?{paddingX:48,paddingY:32,radius:80,borderWidth:12,fontSize:48,descriptionSize:26,avatarSize:120,gap:36}:{})});
        const data={login:'sayrek_liss',name:long?'Long_Streamer_gyjp_'.repeat(2):'Sayrek_Liss',description:long?'gyjp_абвгд'.repeat(14):description,style:settings,avatar:'https://static-cdn.jtvnw.net/test-avatar.png'};
        const geometry=await overlay.evaluate(data=>{
          window.probe.render(data);
          const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
          const card=document.querySelector('.shoutout-badge'),name=card.querySelector('.badge-name'),desc=card.querySelector('.badge-description'),ava=card.querySelector('.badge-avatar');
          const nameText=document.createRange();nameText.selectNodeContents(name);const descriptionText=document.createRange();descriptionText.selectNodeContents(desc);
          const nr=nameText.getBoundingClientRect(),dr=descriptionText.getBoundingClientRect(),ar=ava.getBoundingClientRect();
          const textsFit=[nr,dr].every(r=>r.left>=0&&r.top>=0&&r.right<=560&&r.bottom<=560);
          const before=[rect(card),rect(name),rect(desc),rect(ava)];
          window.probe.render({...data,style:{...data.style,stampEnabled:false}});
          const after=[rect(card),rect(name),rect(desc),rect(ava)];
          window.probe.render(data);
          return {textsFit,noTextOverlap:nr.bottom<=dr.top+1,avatarCentered:Math.abs((ar.left+ar.right)/2-280)<1,stampAbsolute:JSON.stringify(before)===JSON.stringify(after),height:card.offsetHeight};
        },data);
        assert(geometry.textsFit,JSON.stringify({design:design.id,font,long,geometry}));assert(geometry.noTextOverlap,JSON.stringify({design:design.id,font,long,geometry}));assert(geometry.avatarCentered);assert(geometry.stampAbsolute);assert(geometry.height<=492);cases++;
      }
    }
    await overlay.evaluate(data=>window.probe.render(data),{login:'stream_friend',name:'Stream_Friend',description:'Игры, разговоры и хорошие истории.',style:style({design:design.id}),avatar:'https://static-cdn.jtvnw.net/test-avatar.png'});
    await overlay.waitForFunction(()=>document.querySelector('.badge-avatar img').naturalWidth>0);
    await overlay.screenshot({path:path.join(out,design.id+'.png'),omitBackground:true});
    for(const exitEffect of EFFECTS){const result=await overlay.evaluate(data=>{window.probe.play(data,data.style.duration*1000+700);const animation=window.probe.animation;const frames=animation.effect.getKeyframes();window.probe.hide();return frames.at(-1).opacity;},{login:'viewer',name:'Viewer',description:'',style:style({design:design.id,exitEffect})});assert.equal(Number(result),0);}
    await overlay.evaluate(data=>window.probe.render(data),{login:'viewer',name:'<img src=x onerror=alert(1)>',description:'',style:style({design:design.id})});
    assert.equal(await overlay.locator('.badge-description').evaluate(el=>getComputedStyle(el).display),'none');assert.equal(await overlay.locator('.badge-name img').count(),0);
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,cases,designs:DESIGNS.length,editorWidths:4,exitAnimations:DESIGNS.length*EFFECTS.length,palettesPersist:true,sourceUrlUnchanged:true,descriptionsPreserved:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();service.close();store.close();});
