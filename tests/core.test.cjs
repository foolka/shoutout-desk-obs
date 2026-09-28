const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store,normalizeLogin}=require('../core/store.cjs');
const {Engine,chatUser,CHAT_SETTLE_MS}=require('../core/engine.cjs');
function fixture(t){let now=1800000000000;const store=new Store(':memory:',()=>now);store.setPrefs({enabled:true});t.after(()=>store.close());return {store,advance:ms=>now+=ms};}
test('normalizes names, handles Twitch URLs, rejects foreign URLs and markup',()=>{
  assert.equal(normalizeLogin(' @Some_Name '),'some_name');assert.equal(normalizeLogin('https://www.twitch.tv/Some_Name/'),'some_name');
  for(const input of ['','hello world','<script>','https://evil.com/test','https://twitch.tv/a/b','a'.repeat(26)])assert.throws(()=>normalizeLogin(input));
});
test('duplicate nickname is one chip; removal does not reset cooldown',t=>{
  const {store}=fixture(t);store.add('Tester');store.add('@tester');assert.equal(store.people().length,1);
  const id=store.enqueue('a','tester');store.take('a');store.finish(id,'sent');store.remove('tester','a');assert.equal(store.people('a').length,0);store.add('tester','a');assert.equal(store.enqueue('a','tester'),null);
});
test('cooldown expires at exact boundary and is per broadcaster',t=>{
  const {store,advance}=fixture(t);store.setPrefs({cooldownHours:14});store.add('tester');const id=store.enqueue('a','tester');store.take('a');store.finish(id,'sent');
  store.add('tester','b');assert.ok(store.enqueue('b','tester'));advance(14*3600000-1);assert.equal(store.enqueue('a','tester'),null);advance(1);assert.ok(store.enqueue('a','tester'));
});
test('chat floods enqueue one entry and global gap is 125 seconds',t=>{
  const {store,advance}=fixture(t);store.add('one');store.add('two');const id=store.enqueue('a','one');for(let i=0;i<50;i++)assert.equal(store.enqueue('a','one'),null);
  store.enqueue('a','two');store.take('a');store.finish(id,'sent');advance(124999);assert.equal(store.take('a'),null);advance(1);assert.equal(store.take('a').login,'two');
});
test('failure does not consume personal cooldown; uncertainty does',t=>{
  const {store}=fixture(t);store.add('one');let id=store.enqueue('a','one');store.take('a');store.finish(id,'failed');assert.equal(store.nextAt('a','one'),0);
  id=store.enqueue('a','one');store.take('a');store.finish(id,'uncertain');assert.ok(store.nextAt('a','one')>store.now());assert.equal(store.enqueue('a','one'),null);
});
test('preferences are range checked',t=>{const {store}=fixture(t);for(const n of [0,169,2.5,'14'])assert.throws(()=>store.setPrefs({cooldownHours:n}));assert.throws(()=>store.setPrefs({enabled:'true'}));});
test('old queue is not sent and paused queue is cleared',t=>{const {store,advance}=fixture(t);store.add('one');store.enqueue('a','one');advance(31*60000);assert.equal(store.take('a'),null);assert.equal(store.history('a')[0].status,'cancelled');});
test('SQLite cooldown and in-flight reservation survive process restart',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'data.sqlite');
  let store=new Store(file);store.setPrefs({enabled:true});store.add('one');store.add('two');const id=store.enqueue('a','one');store.take('a');store.enqueue('a','two');store.close();
  store=new Store(file);assert.equal(store.enqueue('a','one'),null);assert.equal(store.unresolved('a')[0].id,id);assert.equal(store.history('a').find(r=>r.login==='two').status,'cancelled');store.close();
});
test('unknown users, offline chat, shared chat and broadcaster are ignored',async t=>{
  const {store}=fixture(t);store.add('one');const engine=new Engine(store,{call:async()=>({status:'ok',account:'a',live:false})});await engine.connect();
  engine.message({user:{login:'one',id:'u'}});assert.equal(store.history('a').length,0);engine.live=true;
  for(const data of [{user:{login:'other'}},{user:{login:'one',id:'a'}},{user:{login:'one'},isSharedChat:true},{user:{login:'one'},broadcaster:{id:'other'}}])engine.message(data);
  assert.equal(store.history('a').length,0);engine.message({user:{login:'one',id:'u'}});assert.equal(store.history('a').length,1);
});
test('supports current and legacy chat envelopes',()=>{
  assert.equal(chatUser({user:{login:'tester',id:'1'}}).login,'tester');assert.equal(chatUser({message:{username:'tester',userId:'1'}}).login,'tester');
});
test('current shared-chat and synthetic fields cannot trigger a shoutout',async t=>{
  const {store}=fixture(t);store.add('one');const engine=new Engine(store,{call:async()=>({status:'ok',account:'a',channel:'owner',live:true})});await engine.connect();
  for(const extra of [{isFromSharedChatGuest:true},{sharedChatSource:{id:'b'}},{isTest:true},{meta:{isTest:true}},{meta:{internal:true}}])engine.message({user:{login:'one',id:'u'},...extra});
  assert.equal(store.history('a').length,0);
  engine.message({user:{login:'one',id:'u'},isInSharedChat:true,sharedChatSource:{id:'a'}});
  assert.equal(store.history('a').length,1);
});
test('last account keeps offline history and cooldown available after restart',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-account-'));const file=path.join(dir,'data.sqlite');
  let store=new Store(file);store.setPrefs({enabled:true});store.rememberAccount('123','owner');store.add('one');const id=store.enqueue('123','one');store.take('123');store.finish(id,'sent');store.close();
  store=new Store(file);t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});const engine=new Engine(store,{});
  assert.equal(engine.account,'123');assert.equal(engine.channel,'owner');assert.equal(engine.ready,false);
  assert.equal(store.history(engine.account)[0].status,'sent');assert.ok(store.people(engine.account)[0].nextAt>store.now());
});
test('engine confirms successful sending rather than DoAction acceptance',async t=>{
  const {store,advance}=fixture(t);store.add('one');let sends=0;const engine=new Engine(store,{call:async(op)=>op==='status'?{status:'ok',account:'a',live:true}:(sends++,{status:'sent'})});await engine.connect();engine.message({user:{login:'one'}});advance(CHAT_SETTLE_MS);await engine.tick();await engine.tick();assert.equal(sends,1);assert.equal(store.history('a')[0].status,'sent');
});
test('lost response is probed after reconnect, never re-sent',async t=>{
  const {store,advance}=fixture(t);store.add('one');let sends=0;const bridge={call:async op=>{if(op==='status')return {status:'ok',account:'a',live:true};if(op==='probe')return {status:'sent'};sends++;throw Error('lost');}};
  const engine=new Engine(store,bridge);await engine.connect();engine.message({user:{login:'one'}});advance(CHAT_SETTLE_MS);await engine.tick();assert.equal(store.history('a')[0].status,'sending');await engine.connect();await engine.tick();assert.equal(sends,1);assert.equal(store.history('a')[0].status,'sent');
});
test('unresolved send with missing bridge result is blocked, not replayed',async t=>{
  const {store}=fixture(t);store.add('one');store.enqueue('a','one');store.take('a');const engine=new Engine(store,{call:async op=>op==='status'?{status:'ok',account:'a',live:true}:{status:'unknown'}});await engine.connect();assert.equal(store.history('a')[0].status,'uncertain');assert.equal(store.enqueue('a','one'),null);
});
test('rate limit retries are bounded and wait out the global gap',t=>{
  const {store,advance}=fixture(t);store.add('one');const id=store.enqueue('a','one');for(let i=0;i<3;i++){assert.ok(store.take('a'));store.retry(id);assert.equal(store.take('a'),null);advance(125000);}assert.equal(store.history('a')[0].status,'failed');assert.equal(store.nextAt('a','one'),0);
});
