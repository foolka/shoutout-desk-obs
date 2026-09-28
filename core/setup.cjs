const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const {ACTION_ID}=require('./bridge.cjs');
const sha=s=>createHash('sha256').update(s).digest('hex');

async function runningBots() {
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-Process -Name 'Streamer.bot' -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }) | ConvertTo-Json -Compress"],{windowsHide:true});
  const value=stdout.trim()?JSON.parse(stdout):[];
  return Array.isArray(value)?value:value?[value]:[];
}
function prepare(exe,source,existingSecret) {
  if(path.basename(exe).toLowerCase()!=='streamer.bot.exe' || !fs.existsSync(exe)) throw Error('Выберите Streamer.bot.exe.');
  const dir=path.dirname(exe),actionsFile=path.join(dir,'data','actions.json'),settingsFile=path.join(dir,'data','settings.json');
  const rawActions=fs.readFileSync(actionsFile,'utf8'),rawSettings=fs.readFileSync(settingsFile,'utf8');
  const actions=JSON.parse(rawActions.replace(/^\uFEFF/,'')),settings=JSON.parse(rawSettings.replace(/^\uFEFF/,''));
  if(actions.version!==24 || !Array.isArray(actions.actions) || !settings.websockets) throw Error('Формат этой версии Streamer.bot пока не поддерживается. Нужна версия 1.0.7.');
  const ws=settings.websockets;
  if(!['127.0.0.1','localhost','::1'].includes(ws.address)) throw Error('WebSocket Streamer.bot открыт не только локально. Автонастройка не изменит существующее подключение: выберите локальный экземпляр.');
  if(!Number.isInteger(ws.port) || ws.port<1 || ws.port>65535) throw Error('Некорректный порт Streamer.bot.');
  if(ws.enableAuth && (typeof ws.password!=='string' || !ws.password)) throw Error('Пароль существующего WebSocket недоступен для автонастройки. Настройки не изменены.');
  const secret=existingSecret || randomBytes(32).toString('hex');
  if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Invalid bridge secret. Reconfigure the connection.');
  const code=source.replace('__BRIDGE_SECRET__',secret);
  const own=actions.actions.find(a=>a.id===ACTION_ID);
  if(own && own.name!=='Shoutout Desk OBS / Bridge') throw Error('ID связки занят другим действием. Изменения отменены.');
  const action={id:ACTION_ID,queue:'00000000-0000-0000-0000-000000000000',enabled:true,
    excludeFromHistory:true,excludeFromPending:true,name:'Shoutout Desk OBS / Bridge',group:'Shoutout Desk',
    alwaysRun:false,randomAction:false,concurrent:false,triggers:[],collapsedGroups:[],
    subActions:[{id:'ed88b8d2-acd1-4424-aa55-e155ce3380ad',name:'Shoutout Desk v1',description:'Local authenticated bridge',
      references:[path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','mscorlib.dll'),
        path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','System.dll'),
        path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','System.Net.Http.dll'),'.\\Newtonsoft.Json.dll'],
      byteCode:Buffer.from(code,'utf8').toString('base64'),precompile:false,delayStart:false,saveResultToVariable:false,saveToVariable:null,
      weight:0,type:99999,parentId:null,enabled:true,index:0}]};
  if(own) actions.actions[actions.actions.indexOf(own)]=action;else actions.actions.push(action);
  if(Array.isArray(actions.groups) && !actions.groups.includes('Shoutout Desk')) actions.groups.push('Shoutout Desk');
  ws.autoStart=true;
  const host=ws.address==='::1'?'[::1]':ws.address;
  return {exe,dir,actionsFile,settingsFile,rawActions,rawSettings,actions,settings,
    connection:{exe,url:`ws://${host}:${ws.port}${ws.endpoint?.startsWith('/')?ws.endpoint:'/'}`,secret,password:ws.enableAuth?ws.password:''}};
}
function atomicWrite(file,text) {
  const temp=file+'.shoutout-'+randomUUID()+'.tmp';
  try { fs.writeFileSync(temp,text,{flag:'wx'});fs.renameSync(temp,file); }
  finally { if(fs.existsSync(temp)) fs.unlinkSync(temp); }
}
async function install(exe,source,existingSecret,{checkRunning=runningBots}={}) {
  const same=p=>path.resolve(p).toLowerCase()===path.resolve(exe).toLowerCase();
  // GUI instances have no supported shutdown API. Never kill or edit a running bot.
  if((await checkRunning()).some(same)) return {needsClose:true};
  const plan=prepare(exe,source,existingSecret);
  if((await checkRunning()).some(same)) throw Error('Streamer.bot снова запущен. Изменения отменены.');
  if(sha(fs.readFileSync(plan.actionsFile))!==sha(plan.rawActions) || sha(fs.readFileSync(plan.settingsFile))!==sha(plan.rawSettings)) throw Error('Настройки изменились. Повторите настройку.');
  const backup=path.join(plan.dir,'backup','ShoutoutDesk-'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(backup,{recursive:true});
  fs.copyFileSync(plan.actionsFile,path.join(backup,'actions.json'));
  fs.copyFileSync(plan.settingsFile,path.join(backup,'settings.json'));
  let actionsWritten=false;
  try {
    atomicWrite(plan.actionsFile,JSON.stringify(plan.actions,null,2));actionsWritten=true;
    atomicWrite(plan.settingsFile,JSON.stringify(plan.settings,null,2));
  } catch(error) {
    if(actionsWritten) atomicWrite(plan.actionsFile,plan.rawActions);
    throw error;
  }
  return {connection:plan.connection,backup};
}
module.exports={prepare,install,runningBots,atomicWrite};
