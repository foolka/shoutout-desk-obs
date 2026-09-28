const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs');
const {ObsSession,HOUR_MS,HEARTBEAT_MS}=require('../core/session.cjs');
const {exportBundle,importBundle}=require('../core/transfer.cjs');

function fixture(t,file=':memory:'){
  let now=1800000000000;
  const store=new Store(file,()=>now);store.rememberAccount('123','owner');store.setPrefs({enabled:true});store.add('person');
  t.after(()=>{try{store.close();}catch{}});
  return {store,advance:ms=>now+=ms,now:()=>now};
}
function mark(store){const id=store.enqueue('123','person');store.take('123');store.finish(id,'sent');return id;}

test('manual reset preserves people and history, cancels queue, and leaves Twitch global gap',t=>{
  const {store,advance}=fixture(t);const id=mark(store);store.add('queued');store.enqueue('123','queued');
  store.observeShoutout('other','person',store.now());
  const global=store.globalNext('123');advance(1);store.resetCooldowns();
  assert.equal(store.nextAt('123','person'),0);assert.equal(store.people('123').length,2);
  assert.equal(store.history('123').find(x=>x.id===id).status,'sent');
  assert.equal(store.history('123').find(x=>x.login==='queued').status,'cancelled');
  assert.equal(store.globalNext('123'),global);assert.ok(store.nextAt('other','person')>store.now());
  advance(1);assert.ok(store.enqueue('123','person'));assert.equal(store.take('123'),null);
});

test('reset ignores old/replayed observed events but new shoutouts restore the cooldown',t=>{
  const {store,advance}=fixture(t);const old=store.now();store.observeShoutout('123','person',old);
  advance(1);store.resetCooldowns();store.observeShoutout('123','person',old);assert.equal(store.nextAt('123','person'),0);
  advance(1);store.observeShoutout('123','person',store.now());assert.ok(store.nextAt('123','person')>store.now());
});

test('reset during asynchronous preparation blocks the old attempt before its POST',t=>{
  const {store,advance}=fixture(t);store.enqueue('123','person');const row=store.take('123');assert.equal(store.canSend(row.id),true);
  advance(1);store.resetCooldowns();assert.equal(store.canSend(row.id),false);
  advance(1);store.finish(row.id,'sent');assert.ok(store.nextAt('123','person')>store.now());
});

test('reset persists after database restart and export/import does not resurrect old cooldowns',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-reset-')),file=path.join(dir,'store.sqlite');
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const {store,advance,now}=fixture(t,file);mark(store);advance(1);store.resetCooldowns();const bundle=exportBundle(store,'123');store.close();
  const reopened=new Store(file,now);assert.equal(reopened.nextAt('123','person'),0);reopened.close();
  const target=new Store(':memory:',now);target.rememberAccount('123','owner');importBundle(target,bundle,'123');
  assert.equal(target.nextAt('123','person'),0);assert.equal(target.history('123').length,1);target.close();
});

for(const minutes of [59,60,60.001])test(`automatic reset uses time closed, boundary ${minutes} minutes`,t=>{
  const {store,advance}=fixture(t);store.setPrefs({resetAfterLongClose:true});mark(store);
  const session=new ObsSession(store);advance(4*HOUR_MS);session.touch();assert.ok(store.nextAt('123','person')>store.now());
  session.close();advance(minutes*60000);const next=new ObsSession(store);
  assert.equal(next.didReset,minutes>60);assert.equal(store.nextAt('123','person')===0,minutes>60);
});

test('automatic reset is opt-in and never uses a different channel or a future timestamp',t=>{
  const {store,advance}=fixture(t);mark(store);const session=new ObsSession(store);session.close();advance(2*HOUR_MS);
  assert.equal(new ObsSession(store).didReset,false);
  store.setPrefs({resetAfterLongClose:true});const active=new ObsSession(store);active.close();advance(2*HOUR_MS);store.rememberAccount('456','other');
  assert.equal(new ObsSession(store).didReset,false);assert.ok(store.nextAt('123','person')>store.now());
  store.setMeta('obsSession',{account:'456',closedAt:store.now()+HOUR_MS,resetAfterLongClose:true});assert.equal(new ObsSession(store).didReset,false);
});

test('unclean shutdown allows a heartbeat grace period and does not reset from OBS being open',t=>{
  const {store,advance}=fixture(t);store.setPrefs({resetAfterLongClose:true});mark(store);
  const session=new ObsSession(store);advance(2*HOUR_MS);session.touch();
  const previous=store.meta('obsSession');advance(HOUR_MS);assert.equal(new ObsSession(store).didReset,false);
  store.setMeta('obsSession',previous);advance(HEARTBEAT_MS+1);assert.equal(new ObsSession(store).didReset,true);
});

test('automatic reset consumes the closed interval once and respects disabled option',t=>{
  const {store,advance}=fixture(t);store.setPrefs({resetAfterLongClose:true});mark(store);const session=new ObsSession(store);session.close();advance(2*HOUR_MS);
  assert.equal(new ObsSession(store).didReset,true);const cutoff=store.cooldownResetAt('123');
  advance(1);assert.equal(new ObsSession(store).didReset,false);assert.equal(store.cooldownResetAt('123'),cutoff);
  const next=new ObsSession(store);next.close();advance(2*HOUR_MS);store.setPrefs({resetAfterLongClose:false});assert.equal(new ObsSession(store).didReset,false);
  assert.throws(()=>store.setPrefs({resetAfterLongClose:'true'}));
});
