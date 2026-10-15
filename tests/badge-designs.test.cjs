const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {DESIGNS,PALETTES,DEFAULT_STYLE,style}=require('../core/badges/config.cjs');
function fixture(t){const store=new Store(':memory:');store.rememberAccount('123','owner');store.add('alice');store.add('bob');const service=new Badges({store,account:()=> '123',port:0});t.after(()=>{service.close();store.close();});return {store,service};}

test('exactly three designs have independent complete validated palettes',()=>{
  assert.deepEqual(DESIGNS.map(d=>d.id),['air','pass','sticker']);
  const first=style(),second=style();
  first.palettes.air.background1='#123456';
  assert.equal(second.palettes.air.background1,PALETTES.air.background1);
  assert.equal(DEFAULT_STYLE.palettes.air.background1,PALETTES.air.background1);
  for(const design of DESIGNS){assert.equal(style({design:design.id}).design,design.id);assert.deepEqual(Object.keys(PALETTES[design.id]),Object.keys(PALETTES.air));}
});

test('invalid nested colors and prototype-like design keys are rejected',()=>{
  for(const value of [{design:'old'},{design:'__proto__'},{palettes:[]},{palettes:null},{palettes:{other:{}}},{palettes:{air:[]}},
    {palettes:{air:{background1:'url(https://evil.invalid)'}}},{palettes:{air:{unknown:'#ffffff'}}},JSON.parse('{"palettes":{"__proto__":{"background1":"#ffffff"}}}')])assert.throws(()=>style(value));
  assert.equal({}.background1,undefined);
});

test('legacy config gets Air on read without changing stored settings or descriptions',t=>{
  const {store,service}=fixture(t),legacy={radius:37,borderWidth:6,font:'Georgia',stampText:'АВТОР',stampEnabled:false,background1:'#123456',exitEffect:'blur'};
  store.setMeta('badges:config:123',{enabled:false,style:legacy,people:{alice:{enabled:true,custom:true,description:'Do not lose this',style:legacy},bob:{enabled:false,custom:false,description:'Another description'}}});
  const before=JSON.stringify(store.meta('badges:config:123'));
  const view=service.view();
  assert.equal(view.config.style.design,'air');assert.equal(view.people[0].style.radius,37);
  assert.equal(service.rule('alice').description,'Do not lose this');assert.equal(service.rule('alice').style.stampText,'АВТОР');
  assert.equal(service.rule('bob').description,'Another description');assert.equal(service.rule('bob').enabled,false);
  assert.equal(service.rule('alice').style.background1,'#123456');assert.equal(JSON.stringify(store.meta('badges:config:123')),before);
});

test('switching and saving designs preserves other palettes and unrelated user data',async t=>{
  const {store,service}=fixture(t);store.observeShoutout('123','alice',1900000000000);
  const history=JSON.stringify(store.history('123')),people=JSON.stringify(store.people('123')),last=store.last('123','alice'),token=service.overlayToken;
  service.save({account:'123',enabled:true,style:{design:'air',palettes:{air:{textColor:'#112233'}}}});
  service.save({account:'123',enabled:true,style:{design:'pass',palettes:{pass:{textColor:'#aabbcc'}}}});
  service.save({account:'123',enabled:true,style:{design:'sticker',palettes:{sticker:{stampColor:'#778899'}}}});
  service.save({account:'123',enabled:true,style:{design:'air'}});
  assert.equal(service.config().style.palettes.air.textColor,'#112233');assert.equal(service.config().style.palettes.pass.textColor,'#aabbcc');assert.equal(service.config().style.palettes.sticker.stampColor,'#778899');
  assert.equal(JSON.stringify(store.history('123')),history);assert.equal(JSON.stringify(store.people('123')),people);assert.equal(store.last('123','alice'),last);assert.equal(service.overlayToken,token);
  const reopened=new Badges({store,account:()=> '123'});t.after(()=>reopened.close());assert.deepEqual(reopened.config(),service.config());assert.equal(reopened.overlayToken,token);
});

test('personal themes retain descriptions and each palette independently from common theme',async t=>{
  const {service}=fixture(t);
  service.save({account:'123',login:'alice',person:{enabled:true,custom:true,description:'Keep my words',style:{design:'sticker',palettes:{sticker:{textColor:'#010203'}}}}});
  service.save({account:'123',enabled:true,style:{design:'pass',palettes:{pass:{accentColor:'#456789'}}}});
  await service.test('alice');assert.equal(service.frame().event.style.design,'sticker');assert.equal(service.frame().event.description,'Keep my words');
  assert.equal(service.rule('alice').style.palettes.sticker.textColor,'#010203');assert.equal(service.rule('bob').style.design,'pass');
  const current=service.rule('alice');service.save({account:'123',login:'alice',person:{...current,style:{design:'air',palettes:{air:{textColor:'#a1b2c3'}}}}});
  assert.equal(service.rule('alice').style.palettes.sticker.textColor,'#010203');assert.equal(service.rule('alice').description,'Keep my words');
});

test('an older editor cannot erase newly stored designs or palettes by omitting them',t=>{
  const {service}=fixture(t);
  service.save({account:'123',enabled:true,style:{design:'sticker',palettes:{pass:{background1:'#030405'}}}});
  service.save({account:'123',enabled:false,style:{font:'Arial',radius:20,background1:'#aabbcc'}});
  assert.equal(service.config().style.design,'sticker');assert.equal(service.config().style.palettes.pass.background1,'#030405');assert.equal(service.config().enabled,false);
});
