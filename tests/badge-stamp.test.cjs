const {test}=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {DEFAULT_STYLE,STAMP_POSITIONS,style}=require('../core/badges/config.cjs');
test('stamp validation bounds, toggles, positions and literal text',()=>{
  assert.equal(style().stampText,'СТРИМЕР');assert.equal(style().stampEnabled,true);
  for(const stampPosition of STAMP_POSITIONS)assert.equal(style({stampPosition}).stampPosition,stampPosition);
  for(const patch of [{stampEnabled:1},{stampText:4},{stampText:'x'.repeat(33)},{stampText:'x\ny'},{stampSize:79},{stampSize:241},{stampAngle:46},{stampAngle:-46},{stampFontSize:43},{stampPosition:'__proto__'},{stampColor:'red;opacity:0'}])assert.throws(()=>style(patch));
  assert.equal(style({stampText:'<b>Автор & друг</b>'}).stampText,'<b>Автор & друг</b>');
  assert.equal(style({stampText:''}).stampText,'');
});
test('legacy theme gets stamp defaults without rewriting saved data or source URL',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());store.rememberAccount('123');store.add('alice');
  const legacy=Object.fromEntries(Object.entries(DEFAULT_STYLE).filter(([key])=>!key.startsWith('stamp')));
  legacy.background1='#112233';legacy.fontSize=42;
  const saved={enabled:true,style:legacy,people:{alice:{enabled:true,custom:true,description:'Keep this description',style:{...legacy,radius:42}}}};
  store.setMeta('badges:config:123',saved);
  const service=new Badges({store,account:()=> '123'});t.after(()=>service.close());
  const before=JSON.stringify(store.db.prepare('SELECT * FROM preferences ORDER BY key').all());
  assert.equal(service.config().style.stampEnabled,true);assert.equal(service.rule('alice').style.stampText,'СТРИМЕР');
  assert.equal(service.rule('alice').description,'Keep this description');assert.equal(service.rule('alice').style.radius,42);
  assert.equal(JSON.stringify(store.db.prepare('SELECT * FROM preferences ORDER BY key').all()),before);
  const reopened=new Badges({store,account:()=> '123'});t.after(()=>reopened.close());assert.equal(reopened.overlayToken,service.overlayToken);
});
test('personal and common stamps save independently and do not modify history or cooldowns',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());store.rememberAccount('123');store.add('alice');store.add('bob');
  const service=new Badges({store,account:()=> '123'});t.after(()=>service.close());
  store.observeShoutout('123','alice',Date.now()-10000);
  const rows=()=>JSON.stringify({people:store.people('123'),history:store.displayHistory('123')});const before=rows();
  service.save({account:'123',enabled:true,style:{...DEFAULT_STYLE,stampPosition:'bottom-left',stampColor:'#123456',stampText:'АВТОР'}});
  service.save({account:'123',login:'alice',person:{enabled:true,custom:true,description:'Still here',style:{...DEFAULT_STYLE,stampEnabled:false,stampAngle:35,stampSize:200,stampFontSize:30}}});
  service.observe('00000000-0000-4000-8000-000000000001',service.build,'obs-browser');
  assert.equal(rows(),before);await service.test('alice');assert.equal(service.frame().event.style.stampEnabled,false);
  assert.equal(service.rule('bob').style.stampText,'АВТОР');assert.equal(service.rule('bob').style.stampPosition,'bottom-left');
  const reopened=new Badges({store,account:()=> '123'});t.after(()=>reopened.close());assert.equal(reopened.rule('alice').description,'Still here');assert.equal(reopened.rule('alice').style.stampSize,200);
});
test('stamp texture is a raster served only through its static route',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());const service=new Badges({store,account:()=>'',port:0});t.after(()=>service.close());await service.start();
  const res=await fetch(service.origin+'/stamp-ink.png');assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/^image\/png/);
  const data=Buffer.from(await res.arrayBuffer());assert.equal(data.subarray(1,4).toString(),'PNG');
});
