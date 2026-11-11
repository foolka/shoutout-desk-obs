const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs');
const {inspect,guard,restoreMissing,info}=require('../core/profile-review.cjs');
const {exportBundle,importBundle,readDesktop}=require('../core/transfer.cjs');
const {DatabaseSync}=require('node:sqlite');
const build=require('../package.json');
const prepare=build.name==='shoutout-desk'?require('../core/profile.cjs').prepareProfile:require('../core/vault.cjs').prepareProfile;
const canonical=dir=>path.join(dir,'shoutouts.sqlite');
function temp(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-review-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;
}
function seed(file,who){
  const s=new Store(file);s.rememberAccount('100','owner');s.add(who);return s;
}
test('renamed DB and missing DB in a versioned profile block startup even at the same version',async t=>{
  const dir=temp(t),old=path.join(dir,'saved-copy'),marker=path.join(dir,'profile-version.json');
  seed(old,'old_person').close();fs.writeFileSync(marker,'{"version":"'+build.version+'"}');
  const r=inspect(dir);assert.equal(r.candidates[0].people,1);assert.equal(r.canCreate,false);
  await assert.rejects(prepare(dir,build.version),{code:'PROFILE_REVIEW'});
  assert.ok(!fs.existsSync(canonical(dir)));assert.equal(JSON.parse(fs.readFileSync(marker)).version,build.version);
  fs.unlinkSync(old);
  await assert.rejects(prepare(dir,build.version),{code:'PROFILE_REVIEW'});
});
test('manual selection previews counts before restore and preserves WAL-backed history and badges',async t=>{
  const dir=temp(t),oldDir=temp(t),old=canonical(oldDir),s=seed(old,'previous');
  try{
    s.db.exec('PRAGMA wal_autocheckpoint=0');
    s.setMeta('badges:config:100',{people:{previous:{description:'kept'}}});
    s.enqueue('100','previous');assert.ok(fs.existsSync(old+'-wal'));
    fs.writeFileSync(path.join(dir,'profile-version.json'),'{"version":"0.4.1"}');
    let steps=0;
    await prepare(dir,build.version,{alternatives:[oldDir],ask:async v=>{
      assert.ok(!fs.existsSync(canonical(dir)));assert.ok(v.detail.includes(old));assert.ok(v.detail.includes('1 / 1'));
      if(++steps===1){assert.ok(!v.actions.restore);return {action:'browse',file:old};}
      assert.ok(v.actions.restore);return {action:'restore'};
    }});
    assert.equal(steps,2);assert.equal(info(canonical(dir)).history,1);
    const dest=new Store(canonical(dir));try{assert.equal(dest.meta('badges:config:100').people.previous.description,'kept');}finally{dest.close();}
    assert.equal(s.people('100').length,1);
  }finally{s.close();}
});
test('two nonempty lists show both sizes without replacing either, keep choice survives restart',async t=>{
  const dir=temp(t),original=canonical(dir),other=path.join(dir,'previous.bak');
  seed(original,'current').close();const s=seed(other,'one');s.add('two');s.close();
  await prepare(dir,build.version,{ask:async v=>{
    assert.ok(v.detail.includes('1 / 0')&&v.detail.includes('2 / 0'));assert.ok(!v.actions.restore&&!v.actions.create);
    return {action:'keep'};
  }});
  await prepare(dir,build.version);
  assert.equal(info(original).people,1);assert.equal(info(other).people,2);
});
test('detect populated backups next to an empty list; never overwrite a damaged file or orphan journal',async t=>{
  const dir=temp(t),file=canonical(dir),b=path.join(dir,'backups','before-test');
  fs.mkdirSync(b,{recursive:true});seed(canonical(b),'saved').close();
  new Store(file).close();assert.equal(inspect(dir).candidates[0].people,1);
  fs.writeFileSync(file,'broken');
  await assert.rejects(restoreMissing(dir,canonical(b)));assert.equal(fs.readFileSync(file,'utf8'),'broken');
  fs.unlinkSync(file);fs.writeFileSync(file+'-wal','preserve');assert.equal(inspect(dir).canRestore,false);
  await assert.rejects(restoreMissing(dir,canonical(b)));assert.ok(!fs.existsSync(file));
});
test('only an actually fresh root may explicitly start separately from an alternate profile',async t=>{
  const dir=temp(t),other=temp(t);seed(canonical(other),'old').close();
  assert.equal(inspect(dir,[other]).canCreate,true);
  await assert.rejects(prepare(dir,build.version,{alternatives:[other],ask:()=>({action:'close'})}),{code:'PROFILE_CANCELLED'});
  assert.equal(fs.readdirSync(dir).length,0);
  await prepare(dir,build.version,{alternatives:[other],ask:()=>({action:'create'})});new Store(canonical(dir)).close();
  assert.equal(inspect(dir,[other]).needed,false);assert.equal(info(canonical(other)).people,1);
});
test('unrelated Chromium SQLite files alone do not mark a new folder as an old profile',t=>{
  const dir=temp(t),d=new DatabaseSync(path.join(dir,'Cookies'));d.exec('CREATE TABLE cookies(value)');d.close();
  assert.equal(inspect(dir).needed,false);
});
test('JSON and SQLite imports merge missing descriptions without replacing current badges or source keys',t=>{
  const dir=temp(t),src=seed(canonical(dir),'first'),dst=seed(canonical(temp(t)),'existing');
  const person=description=>({enabled:true,custom:false,description});
  try{
    src.add('existing');src.setMeta('badges:config:100',{enabled:true,style:{},people:{first:person('from old'),existing:person('stale')}});
    src.setMeta('badges:overlayToken','SENSITIVE_TEST_VALUE');
    dst.setMeta('badges:config:100',{enabled:false,people:{existing:person('current')}});
    for(const value of [exportBundle(src,'100'),readDesktop(canonical(dir))]){
      assert.ok(!JSON.stringify(value).includes('SENSITIVE_TEST_VALUE'));importBundle(dst,value,'100');
      const config=dst.meta('badges:config:100');assert.equal(config.people.first.description,'from old');
      assert.equal(config.people.existing.description,'current');assert.equal(config.enabled,false);
    }
  }finally{src.close();dst.close();}
});
