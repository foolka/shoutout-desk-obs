const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {Store}=require('../core/store.cjs');
const {prepareProfile}=require('../core/vault.cjs');
function temp(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-recovery-'));t.after(()=>fs.rmSync(dir,{force:true,recursive:true}));return dir;}
test('broken version marker is backed up and repaired without clearing people',async t=>{
  const dir=temp(t),file=path.join(dir,'shoutouts.sqlite');let store=new Store(file);store.add('kept','owner');store.close();
  fs.writeFileSync(path.join(dir,'profile-version.json'),'{incomplete');
  await prepareProfile(dir,'0.3.2');store=new Store(file);assert.equal(store.people('owner')[0].login,'kept');store.close();
  assert.equal(fs.readdirSync(path.join(dir,'backups')).length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'profile-version.json'))).version,'0.3.2');
});
test('recovery mode keeps pending queue and paused preference',t=>{
  const dir=temp(t),file=path.join(dir,'shoutouts.sqlite');let store=new Store(file);
  store.rememberAccount('owner','owner');store.add('kept');const id=store.enqueue('owner','kept');store.setPrefs({enabled:false});store.close();
  store=new Store(file,Date.now,{resumeQueue:true});assert.equal(store.history('owner')[0].id,id);assert.equal(store.history('owner')[0].status,'queued');assert.equal(store.prefs().enabled,false);store.close();
});
test('missing module emits actionable diagnostic without raw exception or private data',async t=>{
  const dir=temp(t),profile=path.join(dir,'profile');fs.mkdirSync(profile);
  fs.copyFileSync(path.join(__dirname,'../worker.cjs'),path.join(dir,'worker.cjs'));
  const child=spawn(process.execPath,[path.join(dir,'worker.cjs'),profile,path.join(dir,'helper.exe'),'--offline-demo'],{windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
  const [code]=await once(child,'exit');assert.equal(code,1);const event=JSON.parse(stdout.trim());assert.equal(event.code,'FILES_MISSING');assert.equal(event.phase,'loading');
  const diagnostic=fs.readFileSync(path.join(profile,'worker-diagnostic.log'),'utf8');assert.equal(JSON.parse(diagnostic).code,'FILES_MISSING');assert.ok(!diagnostic.includes(dir));assert.equal(stderr,'');
});
