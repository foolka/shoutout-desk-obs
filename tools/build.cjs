const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const env={};for(const [key,value]of Object.entries(process.env))env[key.toUpperCase()==='PATH'?'Path':key.toUpperCase()]=value;
env.MSBUILDDISABLENODEREUSE='1';
function run(file,args,options={}){
  const r=spawnSync(file,args,{cwd:root,env,stdio:'inherit',windowsHide:true,...options});
  if(r.error||r.status!==0)throw Error(`Command failed: ${path.basename(file)}`);
  return r;
}
async function main(){
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Windows x64 is required.');
  const vswhere=path.join(process.env['ProgramFiles(x86)']||'C:/Program Files (x86)','Microsoft Visual Studio/Installer/vswhere.exe');
  const found=run(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-format','json'],{stdio:'pipe',encoding:'utf8'});
  const vs=JSON.parse(found.stdout)[0];if(!vs)throw Error('Install Visual Studio C++ Build Tools.');
  let cmake=process.env.CMAKE_EXE||path.join(vs.installationPath,'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe');
  if(!fs.existsSync(cmake))cmake='cmake';
  const major=Number(vs.installationVersion.split('.')[0]);
  const generator=major>=17?'Visual Studio 17 2022':'Visual Studio 16 2019';
  let qt=process.env.QT_SDK;
  if(!qt){
    const deps=path.join(root,'.deps');fs.mkdirSync(deps,{recursive:true});qt=path.join(deps,'qt6');
    if(!fs.existsSync(path.join(qt,'lib/cmake/Qt6/Qt6Config.cmake'))){
      const url='https://github.com/obsproject/obs-deps/releases/download/2025-07-11/windows-deps-qt6-2025-07-11-x64-RelWithDebInfo.zip';
      const file=path.join(deps,'qt6.zip');
      console.log('Downloading the official OBS Qt SDK...');
      const response=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!response.ok)throw Error('Qt download failed.');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(crypto.createHash('sha256').update(bytes).digest('hex')!=='b68f98f8bb5b81d446953ff1c35bbbc8d98dbce0e0d787664dce84ec88749648')throw Error('Qt SHA256 mismatch.');
      fs.writeFileSync(file,bytes);
      const quote=s=>"'"+s.replaceAll("'","''")+"'";
      run('powershell.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${quote(file)} -DestinationPath ${quote(qt)} -Force`]);
    }
  }
  run(cmake,['-S',root,'-B',path.join(root,'build'),'-G',generator,'-A','x64',`-DCMAKE_PREFIX_PATH=${qt}`]);
  run(cmake,['--build',path.join(root,'build'),'--config','Release','--parallel','1','--','/nodeReuse:false']);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
