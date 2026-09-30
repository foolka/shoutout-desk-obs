const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {Store}=require('../core/store.cjs');
const {Engine}=require('../core/engine.cjs');
const {readDesktop,importBundle}=require('../core/transfer.cjs');
const {UpdateMonitor}=require('../core/update-monitor.cjs');
const {REPO}=require('../core/update.cjs');
function fixture(t){
  let now=1800000000000;
  const s=new Store(':memory:',()=>now);s.rememberAccount('123','owner');s.setPrefs({raidShoutouts:true});
  const sent=[],bridge={call:async(op,args)=>{if(op==='send'){sent.push(args);return {status:'sent',sentAt:now};}return {status:'ok',account:'123',channel:'owner',live:true};}};
  const e=new Engine(s,bridge);e.ready=true;e.live=true;t.after(()=>{e.stop();s.close();});
  return {s,e,sent,advance:n=>now+=n,raid:()=>e.raid({raider:{id:'456',login:'raider'},broadcaster:{id:'123'}})};
}
test('raid outside list waits 20 seconds and is recorded without adding a person',async t=>{
  const f=fixture(t);f.raid();assert.equal(f.s.people('123').length,0);assert.equal(f.s.history('123')[0].trigger,'raid');
  f.advance(19999);await f.e.tick();assert.equal(f.sent.length,0);f.advance(1);await f.e.tick();assert.equal(f.sent.length,1);
  f.raid();f.advance(30000);await f.e.tick();assert.equal(f.sent.length,1);
});
test('other bot cancels raid; chat and duplicate raid cannot bypass delay',async t=>{
  const f=fixture(t);f.s.add('raider');f.e.message({user:{id:'456',login:'raider'}});f.advance(9000);f.raid();f.raid();
  assert.equal(f.s.history('123').length,1);f.advance(11000);await f.e.tick();assert.equal(f.sent.length,0);
  f.s.observeShoutout('123','raider',f.s.now());f.advance(150000);await f.e.tick();assert.equal(f.sent.length,0);
  assert.equal(f.s.history('123')[0].status,'cancelled');
});
test('disable, pause, offline, shared, test, foreign, self and stale raids never send',async t=>{
  const f=fixture(t),base={raider:{id:'456',login:'raider'}};
  for(const bad of [{...base,isTest:true},{...base,meta:{isTest:true}},{...base,isFromSharedChatGuest:true},{...base,broadcaster:{id:'other'}},{raider:{id:'123',login:'owner'}},{...base,createdAt:'2000-01-01T00:00:00Z'}])f.e.raid(bad);
  assert.equal(f.s.history('123').length,0);
  f.e.live=false;f.raid();f.e.live=true;f.s.setPrefs({enabled:false});f.raid();assert.equal(f.s.history('123').length,0);
  f.s.setPrefs({enabled:true});f.raid();f.s.setPrefs({raidShoutouts:false});f.advance(25000);await f.e.tick();assert.equal(f.sent.length,0);
});
test('late other-bot event blocks final send and raid respects global cooldown',t=>{
  const f=fixture(t);f.raid();f.s.observeShoutout('123','someone_else',f.s.now());f.advance(20000);
  assert.equal(f.s.take('123'),null);f.advance(105000);const row=f.s.take('123');assert.ok(f.s.canSend(row.id));
  f.s.observeShoutout('123','raider',f.s.now());assert.equal(f.s.canSend(row.id),false);
});
test('the first SQLite schema imports read-only into a new profile and upgrades in place',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sd-legacy-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'shoutouts.sqlite'),db=new DatabaseSync(file),stamp=Date.now()-10000;
  db.exec("CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE people(login TEXT PRIMARY KEY,added_at INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1); CREATE TABLE attempts(id TEXT PRIMARY KEY,account TEXT NOT NULL,login TEXT NOT NULL,created_at INTEGER NOT NULL,started_at INTEGER,finished_at INTEGER,status TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',retry_at INTEGER NOT NULL DEFAULT 0,tries INTEGER NOT NULL DEFAULT 0);");
  db.prepare('INSERT INTO preferences VALUES (?,?)').run('lastAccount',JSON.stringify({id:'123',channel:'owner'}));
  db.prepare('INSERT INTO people VALUES (?,?,1)').run('old_friend',stamp);
  db.prepare("INSERT INTO attempts(id,account,login,created_at,finished_at,status) VALUES ('old','123','old_friend',?,?,'sent')").run(stamp,stamp);db.close();
  const bytes=fs.readFileSync(file),bundle=readDesktop(file),target=new Store(':memory:');t.after(()=>target.close());
  target.rememberAccount('123','owner');importBundle(target,bundle,'123');importBundle(target,bundle,'123');
  assert.equal(target.people('123').length,1);assert.equal(target.history('123').length,1);assert.equal(target.last('123','old_friend'),stamp);
  assert.deepEqual(fs.readFileSync(file),bytes);
  const upgraded=new Store(file);assert.equal(upgraded.db.prepare('PRAGMA user_version').get().user_version,3);
  assert.equal(upgraded.people('123').length,1);assert.equal(upgraded.last('123','old_friend'),stamp);upgraded.close();
});
test('updates are automatic, throttled, optional and retain a verified banner after restart',async t=>{
  const f=fixture(t);let calls=0,changed=0;
  const release={available:true,version:'v99.0.0',url:'https://github.com/'+REPO+'/releases/tag/v99.0.0'};
  const m=new UpdateMonitor(f.s,'1.0.0',()=>changed++,async()=>{calls++;return release;});t.after(()=>m.stop());
  await m.refresh();await m.refresh();assert.equal(calls,1);assert.equal(changed,1);assert.deepEqual(m.view(),release);
  const next=new UpdateMonitor(f.s,'1.0.0');assert.deepEqual(next.view(),release);next.stop();
  f.advance(24*3600000+1);f.s.setPrefs({autoUpdates:false});await m.refresh();assert.equal(calls,1);
  await m.refresh(true);assert.equal(calls,2);
});
test('offline update check is quiet; manual check reports failure; close ignores late responses',async t=>{
  const f=fixture(t),m=new UpdateMonitor(f.s,'1.0.0',()=>{},async()=>{throw Error('offline');});
  assert.equal(await m.refresh(),null);await assert.rejects(m.refresh(true),/offline/);m.stop();
  let done;const late=new UpdateMonitor(f.s,'1.0.0',()=>assert.fail('closed monitor changed'),()=>new Promise(r=>done=r));
  const pending=late.refresh(true);late.stop();done({available:false,version:'1.0.0'});await pending;
});
