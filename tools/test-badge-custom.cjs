const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {style}=require('../core/badges/config.cjs');
const template=require('../core/badges/web/custom-template.js');
const store=new Store(':memory:');store.rememberAccount('123','owner');store.add('friend');
const service=new Badges({store,account:()=> '123',port:0,profile:async()=>({displayName:'FermionaPlay',avatarUrl:'https://static-cdn.jtvnw.net/avatar.png'})});
const output=path.join(__dirname,'../test-output/badge-custom');fs.mkdirSync(output,{recursive:true});
let browser;

// Exercise a separate test server; never connect to the installed app or OBS.
(async()=>{
	await service.start();browser=await chromium.launch({headless:true,channel:'chrome'});
	const context=await browser.newContext({viewport:{width:1440,height:1080}});
	await context.route('https://static-cdn.jtvnw.net/**',route=>route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(__dirname,'../tests/fixtures/badge-avatar.png'))}));
	const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
	const page=await context.newPage();await page.goto(service.editor());
	await page.locator('#designs [data-design=custom]').click();
	const preview=page.frameLocator('#custom-preview iframe');
	await preview.locator('.badge__name').filter({hasText:'FermionaPlay'}).waitFor();
	await preview.locator('.badge__avatar').evaluate(image=>image.decode());
	assert.equal(await page.locator('#custom-variables li').count(),7);
	assert.equal(await page.locator('#custom-preview iframe').getAttribute('sandbox'),'');
	for(const width of [1440,1024,850,760,541,540,375,320]){
		await page.setViewportSize({width,height:1080});
		assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width);
		await page.locator('#custom-editor').screenshot({path:path.join(output,'editor-'+width+'.png')});
	}
	await page.setViewportSize({width:1440,height:1080});
	await page.locator('#custom-brief').fill('Красный комикс');assert((await page.locator('#custom-prompt').inputValue()).includes('Красный комикс'));
	await page.locator('#custom-html').fill('<section class="my-badge"><h1>{{name}}</h1><div>{{description}}</div></section>');
	await page.locator('#custom-css').fill('.my-badge {margin:80px 30px;padding:24px;background:#e1ffef;color:#153a2b}');
	await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Сохранено');
	assert.equal(service.config().style.design,'custom');
	await page.reload();await page.locator('#custom-html').waitFor();assert((await page.locator('#custom-html').inputValue()).includes('my-badge'));
	await page.locator('#designs [data-design=air]').click();await page.locator('#designs [data-design=custom]').click();assert((await page.locator('#custom-html').inputValue()).includes('my-badge'));
	const overlay=await context.newPage();await overlay.setViewportSize({width:560,height:560});await overlay.goto(service.info().url);
	// Change the protocol hash while the old source page stays open.
	service.build='f'.repeat(64);
	await service.test('friend');assert.equal(service.current,null);assert.equal(service.queue.length,1);
	await overlay.frameLocator('iframe').locator('.my-badge').waitFor();
	assert.equal(await overlay.locator('meta[name=badge-build]').getAttribute('content'),service.build);
	assert.equal(await overlay.frameLocator('iframe').locator('h1').textContent(),'FermionaPlay');
	service.current=null;service.queue=[];
	// Detach polling before direct renderer probes, which are not queue events.
	await overlay.goto(service.origin+'/editor#'+new URLSearchParams({key:service.adminToken}));
	await overlay.locator('#custom-html').waitFor();
	const probe=async data=>overlay.evaluate(value=>{window.probe ||= new BadgeView(document.getElementById('custom-preview'));window.probe.render(value);},data);
	const hostileName='<img src=x onerror="parent.hacked=1">';
	const hostileHtml=`<div class="safe">{{name}}</div><div class="empty" data-hide-empty="description">{{description}}</div><img class="avatar" src="{{avatar}}"><script>parent.hacked=1</script><iframe src="https://evil.invalid/frame"></iframe><img src="https://evil.invalid/img" onerror="parent.hacked=1"><a href="https://evil.invalid/link">link</a><form action="https://evil.invalid"><input autofocus></form><meta http-equiv="refresh" content="0;url=https://evil.invalid"><svg onload="parent.hacked=1"></svg><style>@import url('https://evil.invalid/style');.safe{background-image:url('https://evil.invalid/css')}</style>`;
	const outgoing=[];await overlay.route('https://evil.invalid/**',route=>{outgoing.push(route.request().url());return route.abort();});
	await probe({login:'friend',name:hostileName,description:'',avatar:'https://static-cdn.jtvnw.net/avatar.png',style:style({design:'custom',customHtml:hostileHtml,customCss:'</style><script>parent.hacked=1</script>'})});
	const frame=overlay.frameLocator('#custom-preview iframe');await frame.locator('.safe').waitFor();
	assert.equal(await frame.locator('.safe').textContent(),hostileName);
	assert.equal(await frame.locator('script,iframe,form,input,meta[http-equiv=refresh],svg,[onerror],a[href],.empty').count(),0);
	await frame.locator('.avatar[src^="data:image/png"]').waitFor();
	await frame.locator('.avatar').evaluate(image=>image.decode());
	await overlay.waitForTimeout(300);assert.equal(await overlay.evaluate(()=>!!window.hacked),false);assert.deepEqual(outgoing,[]);
	for(const name of ['Friend','LongStreamerNickname'.repeat(2)]){
		await probe({login:'friend',name,description:'Очень длинное описание '.repeat(7).slice(0,140),avatar:'',style:style({design:'custom'})});
		await frame.locator('.badge__name').filter({hasText:name}).waitFor();
		const bounds=await frame.locator('.badge').evaluate(el=>{const r=el.getBoundingClientRect();return {right:r.right,bottom:r.bottom,left:r.left,top:r.top,scroll:el.scrollWidth,width:el.clientWidth};});
		assert(bounds.left>=0&&bounds.top>=0&&bounds.right<=560&&bounds.bottom<=560,JSON.stringify(bounds));
		assert(bounds.scroll<=bounds.width+1);
		assert.equal(await frame.locator('.badge__avatar').count(),0);
	}
	// Inline style in a single pasted HTML block is supported too.
	await probe({login:'friend',style:style({design:'custom',customHtml:'<style>.inline{color:rgb(1, 2, 3)}</style><div class="inline">{{login}}</div>',customCss:''})});
	await frame.locator('.inline').waitFor();assert.equal(await frame.locator('.inline').evaluate(el=>getComputedStyle(el).color),'rgb(1, 2, 3)');
	assert.deepEqual(errors,[]);
	console.log(JSON.stringify({ok:true,responsiveWidths:8,persistence:true,obsRendering:true,openSourceReload:true,queuedCustomPreserved:true,isolatedHtml:true,variablesEscaped:true,externalRequests:outgoing.length,inlineCss:true}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();service.close();store.close();});
