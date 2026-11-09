const {test}=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../core/store.cjs');
const {Badges}=require('../core/badges/service.cjs');
const {Engine}=require('../core/engine.cjs');
const {DEFAULT_STYLE,style,person,EFFECTS}=require('../core/badges/config.cjs');
function fixture(t){let now=1900000000000,account='123';const store=new Store(':memory:',()=>now);store.rememberAccount(account,'owner');store.add('alice');store.add('bob');
 const service=new Badges({store,account:()=>account,now:()=>now,port:0,profile:async login=>({displayName:login.toUpperCase(),avatarUrl:'https://static-cdn.jtvnw.net/avatars/'+login+'.png'})});
 const heartbeat=()=>service.observe('00000000-0000-4000-8000-000000000001',service.build,'obs-browser');heartbeat();
 t.after(()=>{service.close();store.close();});return {store,service,advance:ms=>{now+=ms;heartbeat();},now:()=>now,account:id=>{account=id;}};
}
test('badges default on for existing/new people, persist per account without changing people/history/cooldowns',async t=>{
 const f=fixture(t),before=f.store.people('123');f.store.observeShoutout('123','alice',f.now()-5000);const stamp=f.store.last('123','alice');
 assert.equal(f.service.config().enabled,true);assert.equal(f.service.rule('alice').enabled,true);f.store.add('carol');assert.equal(f.service.rule('carol').enabled,true);
 f.service.save({account:'123',login:'alice',person:{enabled:false,custom:true,description:'Hello',style:{...DEFAULT_STYLE,radius:40}}});
 assert.equal(f.service.rule('alice').enabled,false);assert.equal(f.store.last('123','alice'),stamp);assert.equal(f.store.people('123').length,before.length+1);
 const reopened=new Badges({store:f.store,account:()=> '123'});t.after(()=>reopened.close());assert.equal(reopened.rule('alice').description,'Hello');assert.equal(reopened.overlayToken,f.service.overlayToken);
 f.account('456');assert.equal(f.service.rule('alice').enabled,true);assert.throws(()=>f.service.save({account:'123',enabled:false,style:DEFAULT_STYLE}));
});
test('style validation is strict, bounded, and resists scripts and prototype keys',()=>{
 assert.equal(EFFECTS.length,10);assert.throws(()=>style({font:'url(evil)'}));assert.throws(()=>style({background1:'red;display:none'}));assert.throws(()=>style({duration:Infinity}));assert.throws(()=>style({paddingX:999}));assert.throws(()=>style({unknown:1}));
 assert.equal(style({}).exitEffect,'fade');assert.throws(()=>style({exitEffect:'__proto__'}));assert.throws(()=>style({exitEffect:'url(evil)'}));
 for(const exitEffect of EFFECTS)assert.equal(style({effect:'pop',exitEffect}).exitEffect,exitEffect);
 assert.throws(()=>person({enabled:true,custom:false,description:'x'.repeat(141)}));assert.equal(person({enabled:true,custom:false,description:'hello\nworld'}).description,'hello world');
});
test('legacy themes gain an exit default without rewriting stored customization',async t=>{
 const f=fixture(t),legacy={...DEFAULT_STYLE,effect:'flip',radius:39,font:'Georgia'};delete legacy.exitEffect;
 const saved={enabled:false,style:legacy,people:{alice:{enabled:true,custom:true,description:'Keep me',style:{...legacy,background1:'#123456'}}}};
 f.store.setMeta('badges:config:123',saved);const before=JSON.stringify(f.store.meta('badges:config:123'));
 assert.equal(f.service.config().style.exitEffect,'fade');assert.equal(f.service.rule('alice').style.exitEffect,'fade');
 assert.equal(f.service.rule('alice').style.background1,'#123456');assert.equal(f.service.rule('alice').style.effect,'flip');assert.equal(f.service.rule('alice').description,'Keep me');
 assert.equal(JSON.stringify(f.store.meta('badges:config:123')),before);
 await f.service.test('alice');assert.equal(f.service.frame().event.style.exitEffect,'fade');
});
test('independent exit effects persist and each queue item retains its complete exit time',async t=>{
 const f=fixture(t);
 f.service.save({account:'123',enabled:true,style:{...DEFAULT_STYLE,effect:'left',exitEffect:'up',duration:2}});
 f.service.save({account:'123',login:'alice',person:{enabled:true,custom:true,description:'',style:{...DEFAULT_STYLE,effect:'pop',exitEffect:'blur',duration:2}}});
 const reopened=new Badges({store:f.store,account:()=> '123'});t.after(()=>reopened.close());
 assert.equal(reopened.rule('alice').style.exitEffect,'blur');assert.equal(reopened.config().style.exitEffect,'up');assert.deepEqual(reopened.view().exitEffects,EFFECTS);
 await f.service.test('alice');await f.service.test('bob');let event=f.service.frame().event;
 assert.equal(event.style.effect,'pop');assert.equal(event.style.exitEffect,'blur');assert.equal(event.endsAt-event.startsAt,2950);
 f.advance(2949);assert.equal(f.service.frame().event.login,'alice');f.advance(1);event=f.service.frame().event;
 assert.equal(event.login,'bob');assert.equal(event.style.effect,'left');assert.equal(event.style.exitEffect,'up');
});
test('prototype-like valid login never corrupts the config map',t=>{const f=fixture(t);f.store.add('__proto__');f.service.save({account:'123',login:'__proto__',person:{enabled:false,custom:false,description:'A',style:DEFAULT_STYLE}});assert.equal(f.service.rule('__proto__').enabled,false);assert.equal(f.service.rule('bob').enabled,true);});
test('only fresh confirmed tracked users are displayed, duplicates and old events never replay',async t=>{
 const f=fixture(t);f.service.confirm({account:'456',login:'alice'});f.service.confirm({account:'123',login:'stranger'});f.service.confirm({account:'123',login:'alice',stamp:f.now()-61000});assert.equal(f.service.frame().event,null);
 const event={account:'123',login:'alice',stamp:f.now()};f.service.confirm(event);f.service.confirm({...event,stamp:f.now()+100});await f.service.pending;assert.equal(f.service.frame().event.login,'alice');assert.equal(f.service.queue.length,0);
 f.advance(20000);assert.equal(f.service.frame().event,null);f.service.confirm(event);await f.service.pending;assert.equal(f.service.frame().event,null);
});
test('FIFO tests are independent of real shoutouts and never write history or cooldown',async t=>{
 const f=fixture(t);const before=JSON.stringify(f.store.history('123'));await f.service.test('alice');await f.service.test('bob');assert.equal(f.service.frame().event.login,'alice');f.advance(10000);assert.equal(f.service.frame().event.login,'bob');f.advance(10000);assert.equal(f.service.frame().event,null);assert.equal(JSON.stringify(f.store.history('123')),before);assert.equal(f.store.last('123','alice'),null);
});
test('global and personal disable suppress live badges immediately but allow explicit tests',async t=>{
 const f=fixture(t);f.service.confirm({account:'123',login:'alice'});await f.service.pending;assert.ok(f.service.frame().event);
 f.service.save({account:'123',enabled:false,style:DEFAULT_STYLE});assert.equal(f.service.frame().event,null);f.advance(60000);f.service.confirm({account:'123',login:'alice'});await f.service.pending;assert.equal(f.service.frame().event,null);
 await f.service.test('alice');assert.equal(f.service.frame().event.test,true);f.advance(10000);
 f.service.save({account:'123',enabled:true,style:DEFAULT_STYLE});f.service.save({account:'123',login:'bob',person:{enabled:false,custom:false,description:'',style:DEFAULT_STYLE}});f.service.confirm({account:'123',login:'bob'});await f.service.pending;assert.equal(f.service.frame().event,null);
});
test('account change/removal cancels queued and active badges',async t=>{const f=fixture(t);await f.service.test('alice');await f.service.test('bob');f.store.remove('alice');assert.equal(f.service.frame().event.login,'bob');f.account('456');assert.equal(f.service.frame().event,null);});
test('custom versus common themes and descriptions are used at dispatch',async t=>{
 const f=fixture(t);f.service.save({account:'123',enabled:true,style:{...DEFAULT_STYLE,radius:44}});f.service.save({account:'123',login:'alice',person:{enabled:true,custom:true,description:'My channel',style:{...DEFAULT_STYLE,radius:7}}});await f.service.test('alice');await f.service.test('bob');assert.equal(f.service.frame().event.style.radius,7);assert.equal(f.service.frame().event.description,'My channel');f.advance(10000);assert.equal(f.service.frame().event.style.radius,44);
});
test('localhost API separates read-only overlay from authenticated settings, rejects foreign origins',async t=>{
 const f=fixture(t);await f.service.start();const base=f.service.origin,auth={Authorization:'Bearer '+f.service.adminToken};
 assert.equal((await fetch(base+'/api/config')).status,401);assert.equal((await fetch(base+'/api/config',{headers:{Authorization:'Bearer '+f.service.overlayToken}})).status,401);
 assert.equal((await fetch(base+'/api/config',{headers:{...auth,Origin:'https://evil.example'}})).status,403);
 const foreignHost=await new Promise((resolve,reject)=>{require('node:http').get(base+'/api/config',{headers:{...auth,Host:'evil.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});assert.equal(foreignHost,403);
 const config=await (await fetch(base+'/api/config',{headers:auth})).json();assert.equal(config.width,560);assert.equal(config.height,560);assert.ok(!JSON.stringify(config).includes(f.service.adminToken));
 assert.equal((await fetch(config.url)).status,200);assert.equal((await fetch(base+'/api/view/'+f.service.overlayToken)).status,200);
 assert.equal((await fetch(base+'/api/test',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({account:'wrong',login:'alice'})})).status,400);
 const result=await fetch(base+'/api/test',{method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({account:'123',login:'alice'})});assert.equal(result.status,200);assert.equal(f.service.frame().event.login,'alice');
 assert.equal((await fetch(base+'/core/store.cjs')).status,404);assert.equal((await fetch(base+'/api/view/'+f.service.overlayToken,{method:'POST'})).status,401);
});
test('failed visual callback cannot break confirmed send and failed requests never trigger visuals',t=>{
 const f=fixture(t);let calls=0;const engine=new Engine(f.store,{},()=>{},()=>{calls++;throw Error('Bad visual');});const id=f.store.enqueue('123','alice'),row=f.store.db.prepare('SELECT * FROM attempts WHERE id=?').get(id);
 engine.apply(row,{status:'sent',sentAt:f.now()});assert.equal(calls,1);assert.equal(f.store.history('123')[0].status,'sent');engine.apply(row,{status:'failed'});assert.equal(calls,1);
});
