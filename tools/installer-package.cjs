const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

function validatePackage(dir,version){
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  if(manifest.version!==version||manifest.platform!=='windows-x64')throw Error('Wrong package version or platform.');
  if(!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Empty package manifest.');
  const expected=new Set();
  for(const item of manifest.files){
    if(typeof item.path!=='string'||!/^shoutout-desk-obs\/[A-Za-z0-9@_./-]+$/.test(item.path)||item.path.split('/').some(p=>p==='..'||p==='.'||!p))throw Error('Unsafe package path.');
    const name=item.path.toLowerCase();
    if(expected.has(name))throw Error('Duplicate package path.');
    expected.add(name);
    if(!/^[a-f0-9]{64}$/.test(item.sha256)||crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,item.path))).digest('hex')!==item.sha256)throw Error(`Package checksum mismatch: ${item.path}`);
  }
  const actual=new Set();
  function scan(folder){
    for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw Error('Package symlinks are forbidden.');
      const file=path.join(folder,entry.name);
      if(entry.isDirectory())scan(file);
      else {
        if(/(?:\.(?:sqlite(?:-(?:wal|shm))?|dpapi|pem|key|log)|^\.env.*)$/i.test(entry.name))throw Error('Private data in package.');
        const name=path.relative(dir,file).split(path.sep).join('/').toLowerCase();
        if(!expected.has(name))throw Error(`Unlisted package file: ${name}`);
        actual.add(name);
      }
    }
  }
  scan(path.join(dir,'shoutout-desk-obs'));
  if(actual.size!==expected.size)throw Error('Package manifest is incomplete.');
  for(const name of ['bin/64bit/shoutout-desk-obs.dll','data/shoutout-secure.exe','data/runtime/node.exe','data/data/icon.ico']){
    if(!actual.has('shoutout-desk-obs/'+name))throw Error(`Missing required file: ${name}`);
  }
  return manifest;
}
module.exports={validatePackage};
