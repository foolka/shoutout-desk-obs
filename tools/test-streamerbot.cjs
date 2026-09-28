// Compiles and probes the real bridge in a disposable, unauthenticated Streamer.bot.
const fs=require('node:fs'),path=require('node:path');const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');const {install}=require('../core/setup.cjs');const {Bridge}=require('../core/bridge.cjs');
const root=path.resolve(__dirname,'..');const source=process.argv[2];
if(!source||path.basename(source).toLowerCase()!=='streamer.bot.exe')throw Error('Pass Streamer.bot.exe as first argument');
fs.mkdirSync(path.join(root,'.test-data'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.test-data','bot-'));
for(const file of fs.readdirSync(path.dirname(source))){
  if(/\.(dll|exe|config)$/.test(file)&&fs.statSync(path.join(path.dirname(source),file)).isFile())fs.copyFileSync(path.join(path.dirname(source),file),path.join(dir,file));
}
fs.mkdirSync(path.join(dir,'data'));
fs.writeFileSync(path.join(dir,'data','actions.json'),JSON.stringify({version:24,blocking:false,t:new Date().toISOString(),collapsedGroups:[],groups:[],queues:[],actions:[]}));
fs.writeFileSync(path.join(dir,'data','settings.json'),JSON.stringify({version:34,instanceId:randomUUID(),instanceName:'ShoutoutDesk isolated test',
  websockets:{autoStart:true,address:'127.0.0.1',port:18376,endpoint:'/',enableAuth:false,authEnforce:false,connections:[],servers:[]},
  logLevel:0,logFolder:'logs',backupFolder:'backup',useInvariantCulture:true}));
let child,bridge;
(async()=>{
  const exe=path.join(dir,'Streamer.bot.exe');
  const result=await install(exe,fs.readFileSync(path.join(root,'data','bridge','ShoutoutDesk.cs'),'utf8'),undefined,{checkRunning:async()=>[]});
  child=spawn(exe,['/nologin','/headless'],{cwd:dir,windowsHide:true,stdio:'ignore'});
  console.log('Isolated Streamer.bot PID '+child.pid+'; no credentials copied.');
  bridge=new Bridge(result.connection);
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('No bridge connection within 45 seconds')),45000);
    bridge.on('ready',()=>{clearTimeout(timeout);resolve();});bridge.on('status',s=>console.log(s));bridge.connect();
  });
  const reply=await bridge.call('status');
  if(reply.app!=='ShoutoutDesk'||reply.version!==1||reply.status!=='failed')throw Error('Unexpected unauthenticated status: '+JSON.stringify(reply));
  console.log('Native C# bridge compiled and returned status through General.Custom. No Twitch account or shoutout.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  bridge?.removeAllListeners();bridge?.close();
  if(child){
    const closer=spawn(path.join(dir,'Streamer.bot.exe'),['/shutdown'],{cwd:dir,windowsHide:true,stdio:'ignore'});
    closer.on('error',()=>{});
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,15000);});
    if(child.exitCode===null)console.error('Test Streamer.bot still running, PID '+child.pid);
  }
  console.log('Test instance: '+dir);
});
