const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs');
const {DatabaseSync}=require('node:sqlite');
const {exportBundle,importBundle,readDesktop}=require('../core/transfer.cjs');
const {prepareProfile,backupProfile,vault}=require('../core/vault.cjs');
const {checkUpdate,newer}=require('../core/update.cjs');
function fixture(t){const s=new Store(':memory:');s.rememberAccount('123','sample');s.setPrefs({enabled:true});t.after(()=>s.close());return s;}
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obs-shoutout-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('plugin defaults to direct, accepts bot and excludes moderator settings',()=>{
  const s=new Store(':memory:');assert.deepEqual(s.prefs(),{cooldownHours:24,enabled:true,resetAfterLongClose:false,provider:'direct',raidShoutouts:false,autoUpdates:true});
  s.setPrefs({provider:'bot'});assert.equal(s.prefs().provider,'bot');
  for(const key of ['role','provider','startInTray'])assert.throws(()=>s.setPrefs({[key]:'anything'}));s.close();
});

test('an older plugin refuses a newer database without changing it',t=>{
  const file=path.join(temp(t),'future.sqlite');
  const db=new DatabaseSync(file);db.exec('PRAGMA user_version=4; CREATE TABLE future_data(value TEXT);');db.close();
  const before=fs.readFileSync(file);
  assert.throws(()=>new Store(file));assert.deepEqual(fs.readFileSync(file),before);
});
test('export/import preserves history and cooldown, merges people and pauses instead of replaying',t=>{
  const a=fixture(t),b=fixture(t);a.add('someone');a.add('pending');a.setPrefs({cooldownHours:14});
  const id=a.enqueue('123','someone');a.take('123');a.finish(id,'sent');a.enqueue('123','pending');a.observeShoutout('123','external',Date.now()-1000);
  const bundle=exportBundle(a,'123');b.add('existing');const result=importBundle(b,bundle,'123');
  assert.equal(result.people,2);assert.equal(b.people('123').length,3);assert.equal(b.prefs().enabled,false);
  assert.equal(b.prefs().cooldownHours,14);assert.equal(b.last('123','someone'),a.last('123','someone'));
  assert.equal(b.last('123','external'),a.last('123','external'));assert.ok(b.history('123').every(h=>h.status!=='queued'));
  importBundle(b,bundle,'123');assert.equal(b.history('123').length,2);
  assert.ok(!JSON.stringify(bundle).includes('clientId'));
});
test('foreign account, malformed history and future timestamps leave database unchanged',t=>{
  const a=fixture(t),b=fixture(t);a.add('someone');const bundle=exportBundle(a,'123');
  assert.throws(()=>importBundle(b,bundle,'other'));
  assert.throws(()=>importBundle(b,{...bundle,people:[{login:'someone',active:1,added_at:Date.now()+999999}]},'123'));
  assert.throws(()=>importBundle(b,{...bundle,attempts:[{id:'bad',account:'123',login:'someone',created_at:1,status:'invented'}]},'123'));
  for(const status of ['sent','sending','uncertain'])assert.throws(()=>importBundle(b,{...bundle,attempts:[{id:'bad',account:'123',login:'someone',created_at:1,status}]},'123'));
  assert.equal(b.people('123').length,0);assert.equal(b.prefs().enabled,true);
});
test('desktop import is read-only and never reads the desktop auth file',t=>{
  const dir=temp(t),file=path.join(dir,'desktop.sqlite');let s=new Store(file);s.rememberAccount('123','sample');s.add('someone');s.close();
  const before=fs.readFileSync(file),bundle=readDesktop(file);assert.equal(bundle.people[0].login,'someone');assert.deepEqual(fs.readFileSync(file),before);
});

test('desktop Voice history IDs import intact and repeated import is idempotent',t=>{
  const file=path.join(temp(t),'desktop.sqlite'),source=new Store(file),target=fixture(t),stamp=Date.now()-3600000;
  source.rememberAccount('123','sample');source.add('old_friend');source.setPrefs({cooldownHours:14});
  const id=`voice:123:old_friend:${stamp}`;
  source.db.prepare('INSERT INTO attempts(id,account,login,created_at,started_at,finished_at,status,detail) VALUES(?,?,?,?,?,?,?,?)')
    .run(id,'123','old_friend',stamp,stamp,stamp,'sent','Imported from Voice');
  source.close();const before=fs.readFileSync(file),bundle=readDesktop(file);
  for(let i=0;i<2;i++)assert.deepEqual(importBundle(target,bundle,'123'),{people:1,history:1});
  assert.equal(target.people('123').length,1);assert.equal(target.history('123').length,1);
  assert.equal(target.history('123')[0].id,id);assert.equal(target.last('123','old_friend'),stamp);
  assert.equal(target.prefs().cooldownHours,14);assert.deepEqual(fs.readFileSync(file),before);
});

test('history IDs reject malformed values without a partial import',t=>{
  const source=fixture(t),target=fixture(t);source.add('person');const bundle=exportBundle(source,'123'),stamp=Date.now()-1000;
  for(const id of [null,123,'','x'.repeat(129),'bad/id','bad\nvalue',"bad';--"]){
    assert.throws(()=>importBundle(target,{...bundle,attempts:[{id,account:'123',login:'person',status:'sent',created_at:stamp,started_at:stamp,finished_at:stamp}]},'123'));
    assert.equal(target.people('123').length,0);assert.equal(target.history('123').length,0);
  }
});

test('SQLite import preserves the plugin cooldown reset cutoff',t=>{
  const file=path.join(temp(t),'plugin.sqlite'),source=new Store(file),target=fixture(t);
  source.rememberAccount('123','sample');source.add('person');source.observeShoutout('123','person',Date.now()-1000);source.resetCooldowns();
  const cutoff=source.cooldownResetAt('123');source.close();
  importBundle(target,readDesktop(file),'123');assert.equal(target.cooldownResetAt('123'),cutoff);assert.equal(target.last('123','person'),null);
});
test('version backup captures SQLite WAL before writable migrations, once per version',async t=>{
  const dir=temp(t);await prepareProfile(dir,'0.1.0');const s=new Store(path.join(dir,'shoutouts.sqlite'));s.rememberAccount('123','sample');s.add('person');
  await prepareProfile(dir,'0.2.0');await prepareProfile(dir,'0.2.0');const backups=fs.readdirSync(path.join(dir,'backups'));assert.equal(backups.length,1);
  const copy=readDesktop(path.join(dir,'backups',backups[0],'shoutouts.sqlite'));assert.equal(copy.people[0].login,'person');s.close();
});
test('updater accepts only official stable release URL and uses no Twitch credentials',async()=>{
  const release={tag_name:'v0.2.0',html_url:'https://github.com/foolka/shoutout-desk-obs/releases/tag/v0.2.0'};
  const result=await checkUpdate('0.1.0',async(url,options)=>{assert.ok(url.startsWith('https://api.github.com/'));assert.equal(options.headers.Authorization,undefined);return {ok:true,json:async()=>release};});
  assert.equal(result.available,true);assert.equal(newer('0.1.0','0.1.0'),false);
  await assert.rejects(checkUpdate('0.1.0',async()=>({ok:true,json:async()=>({...release,html_url:'https://evil.test'})})));
});
test('Windows vault round trip keeps plaintext off disk and detects corrupt ciphertext',{skip:process.platform!=='win32'||!fs.existsSync(path.join(__dirname,'../build/Release/shoutout-secure.exe'))},t=>{
  const dir=temp(t),file=path.join(dir,'auth.dpapi'),v=vault(file,path.resolve(__dirname,'../build/Release/shoutout-secure.exe'));
  const data={token:{accessToken:'test-only-token',refreshToken:'test-only-refresh'}};
  v.save(data);assert.deepEqual(v.load(),data);assert.ok(!fs.readFileSync(file).includes('test-only-token'));
  fs.writeFileSync(file,'corrupt');assert.throws(()=>v.load());v.save(null);assert.equal(fs.existsSync(file),false);
});
