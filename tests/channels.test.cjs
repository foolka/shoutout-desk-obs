const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Store}=require('../core/store.cjs');
const {Engine}=require('../core/engine.cjs');
test('lists and removals are isolated by channel; draft list moves exactly once',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());store.add('draft');assert.equal(store.people('a').length,0);assert.equal(store.people().length,1);
  store.rememberAccount('a','owner');assert.equal(store.people('a')[0].login,'draft');assert.equal(store.people().length,0);store.rememberAccount('b','other');assert.equal(store.people('b').length,0);
  assert.equal(store.enqueue('b','draft'),null);store.add('draft','b');store.remove('draft','a');assert.equal(store.people('a').length,0);assert.equal(store.people('b').length,1);
});
test('legacy database migration preserves list and cooldown under original account only',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-migrate-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'old.sqlite');
  const old=new DatabaseSync(file);old.exec("CREATE TABLE preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE people(login TEXT PRIMARY KEY,added_at INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1);INSERT INTO people VALUES('viewer',1000,1);PRAGMA user_version=1;");old.prepare('INSERT INTO preferences VALUES (?,?)').run('lastAccount',JSON.stringify({id:'a',channel:'owner'}));old.close();
  let store=new Store(file);assert.equal(store.people('a')[0].login,'viewer');assert.equal(store.people('b').length,0);store.remove('viewer','a');store.close();
  store=new Store(file);assert.equal(store.people('a').length,0);store.close();
});
test('observed external shoutout cancels queue and shares per-channel cooldown',t=>{
  const now=1800000000000,store=new Store(':memory:',()=>now);store.setPrefs({enabled:true});t.after(()=>store.close());store.add('viewer','a');store.enqueue('a','viewer');store.observeShoutout('a','viewer',now);
  assert.equal(store.history('a')[0].status,'cancelled');assert.equal(store.enqueue('a','viewer'),null);assert.equal(store.nextAt('a','viewer'),now+24*3600000);assert.equal(store.globalNext('a'),now+125000);assert.equal(store.nextAt('b','viewer'),0);
  store.observeShoutout('a','viewer',now);assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM observed_shoutouts').get().n,1);
});
test('settings validation is atomic',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());assert.throws(()=>store.setPrefs({cooldownHours:14,enabled:'invalid'}));assert.equal(store.prefs().cooldownHours,24);assert.equal(store.prefs().enabled,false);
});
test('stopped engine cannot write late responses into a closed database',async()=>{
  const store=new Store(':memory:');store.add('viewer');let resolve;const engine=new Engine(store,{call:()=>new Promise(r=>resolve=r)});const pending=engine.connect();engine.stop();store.close();resolve({status:'ok',account:'a',live:true});await pending;
});
