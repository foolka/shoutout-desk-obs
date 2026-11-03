const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../core/store.cjs');
const {Engine,CHAT_SETTLE_MS}=require('../core/engine.cjs');
function fixture(t){
  let now=1800000000000,stream='stream-1',live=true;
  const store=new Store(':memory:',()=>now),sent=[];
  for(const name of ['first','second','third'])store.add(name,'owner');
  const bridge={call:async(op,args)=>op==='status'?{status:'ok',account:'owner',channel:'owner',live,streamId:stream}:
    op==='probe'?{status:'unknown'}:(sent.push(args.login),{status:'sent',sentAt:now})};
  const engine=new Engine(store,bridge);
  t.after(()=>{engine.stop();store.close();});
  return {store,engine,bridge,sent,advance:ms=>now+=ms,setStream:value=>stream=value,setLive:value=>live=value};
}
test('brief network outage preserves FIFO queue without another chat message',async t=>{
  const f=fixture(t);await f.engine.connect();
  for(const login of ['first','second','third'])f.engine.message({user:{login}});
  f.advance(CHAT_SETTLE_MS);f.engine.disconnect();await f.engine.tick();assert.deepEqual(f.sent,[]);
  assert.equal(f.store.history('owner').filter(row=>row.status==='queued').length,3);
  await f.engine.connect();
  for(let i=0;i<3;i++){await f.engine.tick();f.advance(125000);}
  assert.deepEqual(f.sent,['first','second','third']);
});
test('reconnect to offline or a different broadcast cancels stale queue',async t=>{
  for(const offline of [true,false]){
    const f=fixture(t);await f.engine.connect();f.engine.message({user:{login:'first'}});f.engine.disconnect();
    offline?f.setLive(false):f.setStream('stream-2');await f.engine.connect();f.advance(CHAT_SETTLE_MS);await f.engine.tick();
    assert.equal(f.store.history('owner')[0].status,'cancelled');assert.deepEqual(f.sent,[]);
  }
});
test('a stale status response cannot restore a disconnected engine',async t=>{
  const f=fixture(t);let resolve;f.bridge.call=()=>new Promise(r=>resolve=r);
  const pending=f.engine.connect();f.engine.disconnect();resolve({status:'ok',account:'owner',live:true});await pending;
  assert.equal(f.engine.ready,false);
});
test('definitively unsent request retries without a personal or global cooldown',async t=>{
  const f=fixture(t);await f.engine.connect();f.engine.message({user:{login:'first'}});f.advance(CHAT_SETTLE_MS);
  const send=f.bridge.call;let first=true;
  f.bridge.call=async(op,args)=>op==='send'&&first?(first=false,{status:'deferred'}):send(op,args);
  await f.engine.tick();const row=f.store.history('owner')[0];
  assert.equal(row.status,'queued');assert.equal(row.started_at,null);assert.equal(f.store.nextAt('owner','first'),0);
  assert.equal(f.store.globalNext('owner'),0);await f.engine.tick();assert.deepEqual(f.sent,[]);
  f.advance(15000);await f.engine.tick();assert.deepEqual(f.sent,['first']);
});
test('deferred result does not revive a paused or externally completed request',async t=>{
  for(const external of [false,true]){
    const f=fixture(t);await f.engine.connect();f.engine.message({user:{login:'first'}});f.advance(CHAT_SETTLE_MS);
    f.bridge.call=async()=>{external?f.store.observeShoutout('owner','first',f.store.now()):f.store.setPrefs({enabled:false});return {status:'deferred'};};
    await f.engine.tick();assert.equal(f.store.history('owner')[0].status,'cancelled');
  }
});
test('cancelled rate-limit retries do not delay unrelated people',t=>{
  const f=fixture(t);const id=f.store.enqueue('owner','first');f.store.enqueue('owner','second');
  f.store.take('owner');f.store.retry(id);f.store.remove('first','owner');
  assert.equal(f.store.globalNext('owner'),0);assert.equal(f.store.take('owner').login,'second');
});
test('queue countdown reflects settling, raid and global waits',t=>{
  const f=fixture(t);f.store.setPrefs({raidShoutouts:true});f.store.enqueue('owner','first','raid');f.store.enqueue('owner','second');
  assert.equal(f.store.queueState('owner').login,'first');assert.equal(f.store.queueState('owner').nextAt,f.store.now()+20000);
  f.advance(CHAT_SETTLE_MS);assert.equal(f.store.take('owner',CHAT_SETTLE_MS),null);
  assert.equal(f.store.queueState('owner').login,'first');assert.equal(f.store.queueState('owner').nextAt,f.store.now()+10000);
  f.advance(10000);const row=f.store.take('owner',CHAT_SETTLE_MS);assert.equal(row.login,'first');
  assert.equal(f.store.queueState('owner').sending,true);f.store.finish(row.id,'sent');
  assert.equal(f.store.queueState('owner').login,'second');assert.equal(f.store.queueState('owner').nextAt,f.store.now()+125000);
  f.advance(125000);assert.equal(f.store.take('owner',CHAT_SETTLE_MS).login,'second');
});
