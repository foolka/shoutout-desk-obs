const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const release=path.join(root,'release',`shoutout-desk-obs-${version}-windows-x64`);
const plugin=path.join(release,'shoutout-desk-obs'),data=path.join(plugin,'data');
const mkdir=dir=>fs.mkdirSync(dir,{recursive:true});
function copy(from,to){mkdir(path.dirname(to));fs.copyFileSync(from,to);}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
async function main(){
  mkdir(data);mkdir(path.join(plugin,'bin/64bit'));
  copy(path.join(root,'build/Release/shoutout-desk-obs.dll'),path.join(plugin,'bin/64bit/shoutout-desk-obs.dll'));
  copy(path.join(root,'build/Release/shoutout-secure.exe'),path.join(data,'shoutout-secure.exe'));
  for(const file of ['worker.cjs','package.json','package-lock.json'])copy(path.join(root,file),path.join(data,file));
  for(const dir of ['core','data'])fs.cpSync(path.join(root,dir),path.join(data,dir),{recursive:true});
  const prod=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'))).packages;
  for(const [relative,meta] of Object.entries(prod))if(relative&&relative.startsWith('node_modules/')&&!meta.dev)fs.cpSync(path.join(root,relative),path.join(data,relative),{recursive:true});
  const icons=['plus','x','users','history','settings-2','refresh-cw','chevron-down','check','log-in','log-out','external-link','book-open','upload','download','folder-open','user-plus'];
  for(const name of icons){const svg=fs.readFileSync(path.join(root,'node_modules/lucide-static/icons',name+'.svg'),'utf8').replaceAll('currentColor','#bbd5cd');mkdir(path.join(data,'data/icons'));fs.writeFileSync(path.join(data,'data/icons',name+'.svg'),svg);}
  copy(path.join(root,'node_modules/lucide-static/LICENSE'),path.join(data,'data/icons/LICENSE'));
  mkdir(path.join(data,'runtime'));
  const runtime=path.join(data,'runtime/node.exe');
  const nodeVersion='v24.14.0';
  const checksums=await (await fetch(`https://nodejs.org/dist/${nodeVersion}/SHASUMS256.txt`)).text();
  const expected=checksums.split(/\r?\n/).find(l=>l.endsWith(' win-x64/node.exe'))?.trim().split(/\s+/)[0];
  if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('Cannot verify Node runtime.');
  let bytes=fs.readFileSync(process.execPath);
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected){
    const response=await fetch(`https://nodejs.org/dist/${nodeVersion}/win-x64/node.exe`);if(!response.ok)throw Error('Node download failed.');bytes=Buffer.from(await response.arrayBuffer());
  }
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Node SHA256 mismatch.');
  fs.writeFileSync(runtime,bytes);
  const license=await (await fetch(`https://raw.githubusercontent.com/nodejs/node/${nodeVersion}/LICENSE`)).text();
  if(!license.includes('Copyright'))throw Error('Cannot retrieve Node license.');
  fs.writeFileSync(path.join(data,'runtime/LICENSE'),license);
  for(const file of ['README.md','README.ru.md','README.uk.md','LICENSE','THIRD_PARTY_NOTICES.md','CHANGELOG.md'])copy(path.join(root,file),path.join(release,file));
  copy(path.join(root,'tools/Install.ps1'),path.join(release,'Install.ps1'));
  copy(path.join(root,'tools/Install.cmd'),path.join(release,'Install.cmd'));
  const hashes=files(plugin).sort().map(file=>({path:path.relative(release,file).split(path.sep).join('/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
  fs.writeFileSync(path.join(release,'manifest.json'),JSON.stringify({version,platform:'windows-x64',files:hashes},null,2));
  console.log(release);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
