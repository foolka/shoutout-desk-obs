const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../core/store.cjs');
const {Engine,CHAT_SETTLE_MS}=require('../core/engine.cjs');

// Simulate Twitch without sending messages or touching a real profile.
function setup(t){
  let now=1800000000000;
  const store=new Store(':memory:',()=>now),sent=[];
  store.rememberAccount('123','owner');store.setPrefs({raidShoutouts:true});
  store.add('guest');store.add('raider');
  const bridge={call:async(op,args)=>{
    if(op==='send'){if(!args.canSend())return {status:'cancelled'};sent.push(args.login);return {status:'sent',sentAt:now};}
    return {status:'ok',account:'123',channel:'owner',live:true};
  }};
  const engine=new Engine(store,bridge);engine.ready=true;engine.live=true;
  t.after(()=>store.close());
  return {store,engine,bridge,sent,advance:ms=>now+=ms,raid:()=>engine.raid({raider:{id:'456',login:'raider'},broadcaster:{id:'123'}})};
}

test('raider reserves first place even when a guest wrote before the raid event',async t=>{
  const f=setup(t);
  f.engine.message({user:{login:'guest'}});f.advance(9000);f.raid();
  f.advance(1000);await f.engine.tick();assert.deepEqual(f.sent,[]);
  f.advance(19000);await f.engine.tick();assert.deepEqual(f.sent,['raider']);
  f.advance(125000);await f.engine.tick();assert.deepEqual(f.sent,['raider','guest']);
});

test('raid bypasses our 24-hour cooldown but not the Twitch 60-minute target limit',async t=>{
  const f=setup(t);
  f.store.observeShoutout('123','raider',f.store.now());f.advance(10*60000);f.raid();
  f.advance(31*60000);await f.engine.tick();assert.deepEqual(f.sent,[]);
  assert.equal(f.store.history('123')[0].status,'queued');
  f.advance(19*60000+4999);await f.engine.tick();assert.deepEqual(f.sent,[]);
  f.advance(1);await f.engine.tick();assert.deepEqual(f.sent,['raider']);
  assert.equal(f.store.prefs().cooldownHours,24);assert.equal(f.store.people('123').length,2);
});

test('raid after more than an hour repeats, ordinary messages still respect our timeout',async t=>{
  const f=setup(t);
  f.store.observeShoutout('123','raider',f.store.now());f.advance(2*3600000);
  f.engine.message({user:{login:'raider'}});assert.equal(f.store.history('123').length,0);
  f.raid();f.advance(20000);await f.engine.tick();assert.deepEqual(f.sent,['raider']);
});

test('promotion keeps one queue entry and delayed old observations do not cancel the raid',async t=>{
  const f=setup(t),old=f.store.now()-2*3600000;
  f.engine.message({user:{login:'raider'}});f.advance(3000);f.raid();f.raid();
  f.store.observeShoutout('123','raider',old);
  assert.equal(f.store.history('123').length,1);f.advance(20000);await f.engine.tick();
  assert.deepEqual(f.sent,['raider']);
});

test('another bot satisfying this raid cancels it, not the unrelated guest',async t=>{
  const f=setup(t);f.raid();f.engine.message({user:{login:'guest'}});f.advance(5000);
  f.store.observeShoutout('123','raider',f.store.now());
  f.advance(125000);await f.engine.tick();assert.deepEqual(f.sent,['guest']);
});

test('manual reset cannot erase Twitch limits for incoming raids',async t=>{
  const f=setup(t);f.store.observeShoutout('123','raider',f.store.now());f.advance(1000);
  f.store.resetCooldowns();f.advance(1);f.raid();f.advance(20000);
  assert.equal(f.store.nextAt('123','raider'),0);await f.engine.tick();assert.deepEqual(f.sent,[]);
});

test('raid arriving during chat preparation postpones the chat without losing it',async t=>{
  const f=setup(t);f.engine.message({user:{login:'guest'}});f.advance(CHAT_SETTLE_MS);
  let release;
  const original=f.bridge.call;f.bridge.call=async(op,args)=>{
    if(op==='send')await new Promise(resolve=>release=resolve);
    return original(op,args);
  };
  const tick=f.engine.tick();f.raid();release();await tick;
  assert.equal(f.store.history('123').find(row=>row.login==='guest').status,'queued');
  assert.deepEqual(f.sent,[]);f.bridge.call=original;f.advance(20000);
  await f.engine.tick();f.advance(125000);await f.engine.tick();
  assert.deepEqual(f.sent,['raider','guest']);
});

test('unknown Twitch rate limit does not discard a raid after just three rejections',async t=>{
  const f=setup(t);f.raid();f.advance(20000);
  f.bridge.call=async()=>({status:'rate_limited'});
  for(let i=0;i<4;i++){await f.engine.tick();f.advance(125000);}
  assert.equal(f.store.history('123')[0].status,'queued');
  f.advance(2*3600000);await f.engine.tick();assert.equal(f.store.history('123')[0].status,'cancelled');
});

test('EventSub cooldown timestamps are retained independently of local settings',t=>{
  const f=setup(t),now=f.store.now();
  f.store.observeShoutout('123','raider',now,{global:now+150000,target:now+3700000});
  assert.equal(f.store.globalNext('123'),now+155000);
  assert.equal(f.store.targetNext('123','raider'),now+3705000);
  f.advance(1);f.store.resetCooldowns();
  assert.equal(f.store.targetNext('123','raider'),now+3705000);
});

test('an old shoutout discovered during preparation defers the raid, rather than dropping it',async t=>{
  const f=setup(t);f.raid();f.advance(20000);
  const original=f.bridge.call;f.bridge.call=async(op,args)=>{
    f.store.observeShoutout('123','raider',f.store.now()-10*60000);
    return original(op,args);
  };
  await f.engine.tick();assert.deepEqual(f.sent,[]);
  assert.equal(f.store.history('123')[0].status,'queued');
  f.bridge.call=original;f.advance(50*60000+5000);await f.engine.tick();
  assert.deepEqual(f.sent,['raider']);
});
