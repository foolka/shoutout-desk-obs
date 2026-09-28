const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {validatePackage}=require('./installer-package.cjs');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
function main(){
  if(process.platform!=='win32')throw Error('Build the Windows installer on Windows.');
  if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Expected a numeric release version.');
  const release=path.join(root,'release'),dir=path.join(release,`shoutout-desk-obs-${version}-windows-x64`);
  validatePackage(dir,version);
  const candidates=[process.env.ISCC_EXE,path.join(root,'.deps/inno/ISCC.exe'),
    path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Inno Setup 6/ISCC.exe'),
    path.join(process.env.ProgramFiles||'C:/Program Files','Inno Setup 7/ISCC.exe')].filter(Boolean);
  const compiler=candidates.find(p=>fs.existsSync(p));
  if(!compiler)throw Error('Install Inno Setup 6.7.3+ or set ISCC_EXE. See README.');
  const result=spawnSync(compiler,['/Qp',`/DAppVersion=${version}`,`/DPackageDir=${dir}`,`/DOutputDir=${release}`,path.join(__dirname,'installer.iss')],{stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0)throw Error('Installer compilation failed.');
  const name=`shoutout-desk-obs-${version}-windows-x64-setup.exe`,file=path.join(release,name);
  const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(file+'.sha256',`${digest}  ${name}\n`);
  console.log(file);
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
