const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs');
const {Engine,CHAT_SETTLE_MS}=require('../core/engine.cjs');
async function fixture(t){
  let now=1800000000000,sends=0;
  const store=new Store(':memory:',()=>now);store.setPrefs({enabled:true});store.add('raider');
  const bridge={call:async(op,args)=>op==='status'?{status:'ok',account:'owner',live:true}:(assert.equal(args.canSend(),true),sends++,{status:'sent'})};
  const engine=new Engine(store,bridge);await engine.connect();t.after(()=>store.close());
  return {store,bridge,engine,advance:ms=>now+=ms,get sends(){return sends;}};
}
function event(store,extra={}){return {broadcaster:{id:'owner'},user:{login:'raider'},startedAt:new Date(store.now()).toISOString(),...extra};}
test('raid bot shoutout before chat prevents our second shoutout for the full personal cooldown',async t=>{
  const f=await fixture(t);f.store.setPrefs({cooldownHours:14});
  f.engine.shoutout(event(f.store));f.engine.message({user:{login:'raider'}});f.advance(CHAT_SETTLE_MS);await f.engine.tick();
  assert.equal(f.store.history('owner').length,0);assert.equal(f.sends,0);
  f.advance(14*3600000-CHAT_SETTLE_MS-1);assert.equal(f.store.enqueue('owner','raider'),null);
  f.advance(1);assert.ok(f.store.enqueue('owner','raider'));
});
test('chat arriving first waits ten seconds, so a delayed external event cancels the queue',async t=>{
  const f=await fixture(t);f.engine.message({user:{login:'raider'}});await f.engine.tick();
  f.advance(CHAT_SETTLE_MS-1);await f.engine.tick();assert.equal(f.sends,0);
  f.engine.shoutout(event(f.store));f.advance(1);await f.engine.tick();
  assert.equal(f.sends,0);assert.equal(f.store.history('owner')[0].status,'cancelled');
});
test('without another shoutout a normal first message is sent after the settling window',async t=>{
  const f=await fixture(t);f.engine.message({user:{login:'raider'}});f.advance(CHAT_SETTLE_MS);await f.engine.tick();assert.equal(f.sends,1);
});
test('test, shared guest, wrong channel, malformed and future events cannot set cooldown',async t=>{
  const f=await fixture(t);
  for(const extra of [{isTest:true},{meta:{isTest:true}},{isFromSharedChatGuest:true},{broadcaster:{id:'other'}},{broadcaster:null},{user:null},{user:{login:'<bad>'}},{startedAt:'bad'},{startedAt:new Date(f.store.now()+60001).toISOString()}])f.engine.shoutout(event(f.store,extra));
  assert.equal(f.store.nextAt('owner','raider'),0);assert.ok(f.store.enqueue('owner','raider'));
});
test('duplicate/replayed events retain original timestamp and expired events do not cancel new chat',async t=>{
  const f=await fixture(t),original=event(f.store);f.engine.shoutout(original);f.advance(25*3600000);
  f.engine.message({user:{login:'raider'}});f.engine.shoutout(original);
  assert.equal(f.store.history('owner')[0].status,'queued');assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM observed_shoutouts').get().n,1);
  f.advance(CHAT_SETTLE_MS);await f.engine.tick();assert.equal(f.sends,1);
});
test('external shoutout during async preparation blocks final send, including a rate-limit retry',async t=>{
  const f=await fixture(t);f.engine.message({user:{login:'raider'}});f.advance(CHAT_SETTLE_MS);
  f.bridge.call=async(_op,args)=>{assert.equal(args.canSend(),true);f.engine.shoutout(event(f.store));assert.equal(args.canSend(),false);return {status:'rate_limited'};};
  await f.engine.tick();assert.equal(f.store.history('owner')[0].status,'cancelled');assert.equal(f.store.enqueue('owner','raider'),null);
});
test('observed cooldown survives a database restart',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-external-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'shoutouts.sqlite');let store=new Store(file);
  store.add('raider','owner');store.observeShoutout('owner','raider',Date.now());store.close();
  store=new Store(file);try{assert.equal(store.enqueue('owner','raider'),null);}finally{store.close();}
});
