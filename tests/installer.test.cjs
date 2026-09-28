const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {validatePackage}=require('../tools/installer-package.cjs');
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-installer-test-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const manifest={version:'0.1.4',platform:'windows-x64',files:[]};
  for(const name of ['bin/64bit/shoutout-desk-obs.dll','data/shoutout-secure.exe','data/runtime/node.exe','data/data/icon.ico']){
    const relative='shoutout-desk-obs/'+name,file=path.join(dir,relative),bytes=Buffer.from('test-payload');
    fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
    manifest.files.push({path:relative,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));save();
  return {dir,manifest,save};
}
test('installer accepts the exact, complete verified payload',t=>{
  const f=fixture(t);assert.equal(validatePackage(f.dir,'0.1.4').files.length,4);
});
test('installer refuses wrong versions and platforms',t=>{
  const f=fixture(t);assert.throws(()=>validatePackage(f.dir,'0.1.5'),/version/);
  f.manifest.platform='other';f.save();assert.throws(()=>validatePackage(f.dir,'0.1.4'),/platform/);
});
test('installer refuses changed and unlisted files',t=>{
  const f=fixture(t),file=path.join(f.dir,f.manifest.files[0].path);
  fs.writeFileSync(file,'modified');assert.throws(()=>validatePackage(f.dir,'0.1.4'),/checksum/);
  fs.writeFileSync(file,'test-payload');fs.writeFileSync(path.join(f.dir,'shoutout-desk-obs/unlisted.txt'),'extra');
  assert.throws(()=>validatePackage(f.dir,'0.1.4'),/Unlisted/);
});
test('installer rejects traversal and duplicate paths',t=>{
  const f=fixture(t),original=f.manifest.files[0].path;
  f.manifest.files[0].path='shoutout-desk-obs/../outside';f.save();assert.throws(()=>validatePackage(f.dir,'0.1.4'),/Unsafe/);
  f.manifest.files[0].path=original;f.manifest.files.push(f.manifest.files[0]);f.save();assert.throws(()=>validatePackage(f.dir,'0.1.4'),/Duplicate/);
});
test('installer rejects personal data even if it was put in the manifest',t=>{
  const f=fixture(t),relative='shoutout-desk-obs/data/twitch-auth.dpapi',bytes=Buffer.from('test');
  fs.writeFileSync(path.join(f.dir,relative),bytes);
  f.manifest.files.push({path:relative,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});f.save();
  assert.throws(()=>validatePackage(f.dir,'0.1.4'),/Private/);
});
test('installer refuses an incomplete runtime',t=>{
  const f=fixture(t),last=f.manifest.files.pop();fs.unlinkSync(path.join(f.dir,last.path));f.save();
  assert.throws(()=>validatePackage(f.dir,'0.1.4'),/Missing required/);
});
test('installer messages have matching English, Russian and Ukrainian keys',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../tools/installer-messages.iss'),'utf8');
  const keys=language=>text.split(/\r?\n/).filter(line=>line.startsWith(language+'.')).map(line=>line.split('=')[0].slice(3)).sort();
  assert.ok(keys('en').length>10);assert.deepEqual(keys('en'),keys('ru'));assert.deepEqual(keys('en'),keys('uk'));
});
