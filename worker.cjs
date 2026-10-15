const fs=require('node:fs');
const path=require('node:path');
let phase='loading',fatalReported=false;
function fatal(error){
  if(fatalReported)return process.exit(1);fatalReported=true;
  const code=error?.code==='MODULE_NOT_FOUND'?'FILES_MISSING':
    ['EACCES','EPERM','EROFS'].includes(error?.code)?'PROFILE_ACCESS':
    /locked|busy/i.test(error?.message||'')?'PROFILE_LOCKED':
    error?.code==='ERR_SQLITE_ERROR'?'PROFILE_DATABASE':error instanceof SyntaxError?'PROFILE_INVALID':'WORKER_CRASH';
  const diagnostic={time:new Date().toISOString(),phase,code};
  try{
    const dir=process.argv[2];
    if(path.isAbsolute(dir||'')){
      const file=path.join(dir,'worker-diagnostic.log');
      if(fs.existsSync(file)&&fs.statSync(file).size>131072)fs.renameSync(file,file+'.previous');
      fs.appendFileSync(file,JSON.stringify(diagnostic)+'\n');
    }
  }catch{}
  try{process.stdout.write(JSON.stringify({event:'fatal',code,phase})+'\n',()=>process.exit(1));}
  catch{process.exit(1);}
  setTimeout(()=>process.exit(1),100).unref();
}
process.on('uncaughtException',fatal);process.on('unhandledRejection',fatal);
const readline=require('node:readline');
const {spawn}=require('node:child_process');
const {Store}=require('./core/store.cjs');
const {Engine}=require('./core/engine.cjs');
const {TwitchAuth,safeError}=require('./core/twitch-auth.cjs');
const {DirectBridge}=require('./core/twitch-direct.cjs');
const {Bridge}=require('./core/bridge.cjs');
const {install,runningBots}=require('./core/setup.cjs');
const {vault,prepareProfile,backupProfile,atomicWrite}=require('./core/vault.cjs');
const {exportBundle,importBundle,readDesktop}=require('./core/transfer.cjs');
const {UpdateMonitor}=require('./core/update-monitor.cjs');
const {ObsSession,HEARTBEAT_MS}=require('./core/session.cjs');
const {Diagnostics}=require('./core/diagnostics.cjs');
const {Badges}=require('./core/badges/service.cjs');
const VERSION=require('./package.json').version;

async function main() {
  const args=process.argv.slice(2), dir=path.resolve(args[0]||''), helper=path.resolve(args[1]||'');
  if(!path.isAbsolute(args[0]||'')||!path.isAbsolute(args[1]||''))throw Error('Absolute profile and helper paths are required.');
  const demo=args.includes('--offline-demo'),recover=args.includes('--recover-worker');
  phase='backup';await prepareProfile(dir,VERSION);phase='database';
  const store=new Store(path.join(dir,'shoutouts.sqlite'),Date.now,{resumeQueue:recover});
  const diagnostics=new Diagnostics(dir);
  // The checkbox pauses only this OBS session; startup never resets cooldowns.
  if(!recover)store.setPrefs({enabled:true});
  const secrets=vault(path.join(dir,'twitch-auth.dpapi'),helper);
  const pendingSecrets=vault(path.join(dir,'twitch-login.dpapi'),helper);
  const botSecrets=vault(path.join(dir,'connection.dpapi'),helper);
  let botConnection=null;
  let saved=null,notice='',bridge=null,engine=null,closing=false,refreshing=false,generation=0;
  let pending=null;
  try{if(!demo)saved=secrets.load();}catch{notice='Защищённый вход недоступен. Войдите снова; список и история сохранены.';}
  try{if(!demo&&!saved)pending=pendingSecrets.load();}catch{notice='Незавершённый вход недоступен. Войдите через Twitch ещё раз.';}
  try{if(!demo)botConnection=botSecrets.load();}catch{notice='Повторите автонастройку Streamer.bot. Список и история сохранены.';}
  const auth=new TwitchAuth({saved,save:v=>secrets.save(v),pending,savePending:v=>pendingSecrets.save(v)});
  const session=new ObsSession(store);
  const badges=new Badges({store,account:()=>store.lastAccount().id,port:demo?0:18772,profile:async login=>{
    if(demo)return null;
    const result=await bridge?.call('profile',{login});return result?.profile||null;
  }});
  await badges.start().catch(()=>{});
  const emit=value=>{if(!closing)process.stdout.write(JSON.stringify(value)+'\n');};
  if(demo){
    store.rememberAccount('999001','demo_channel');
    for(const name of ['aurora_live','pixel_cook','riverstudio','nightshift','someone_with_a_long_name'])store.add(name);
    store.observeShoutout('999001','riverstudio',Date.now()-2*3600000);
    const stamp=Date.now()-3*3600000;
    store.db.prepare("INSERT OR IGNORE INTO attempts(id,account,login,created_at,finished_at,status) VALUES(?,?,?,?,?,'sent')").run('preview-history','999001','returning_guest',stamp,stamp);
  }
  function state(){
    const account=store.lastAccount();
    const history=store.displayHistory(account.id);
    const people=store.people(account.id);
    const result={version:VERSION,account,auth:auth.view(),prefs:store.prefs(),people,history,notice,update:updates.view(),
      connected:!!engine?.ready,live:!!engine?.live,demo,language:store.meta('language','ru-RU'),
      botPath:botConnection?.exe||'',botConfigured:!!botConnection,
      queue:store.queueState(account.id).count,queueState:store.queueState(account.id),
      globalNextAt:store.globalNext(account.id),now:Date.now(),
      clientConfigured:!!(store.meta('clientId','')||require('./data/twitch-client.json').clientId)};
    diagnostics.capture(account.id,result);return result;
  }
  let debounce;
  function changed(){clearTimeout(debounce);debounce=setTimeout(()=>emit({event:'state',data:state()}),80);}
  const updates=new UpdateMonitor(store,VERSION,changed);
  function disconnect(preserveQueue=false){generation++;engine?.stop();bridge?.close();engine=null;bridge=null;if(!preserveQueue)store.cancelQueue('Подключение остановлено');}
  function connect(preserveQueue=false){
    disconnect(preserveQueue);const bot=store.prefs().provider==='bot';
    if(demo|| (bot?!botConnection:!auth.saved))return changed();
    const epoch=generation,user=bot?store.meta('botAccount',null):auth.saved.user;
    if(user)store.rememberAccount(user.id,user.login||user.channel);
    const current=bridge=bot?new Bridge(botConnection):new DirectBridge({auth,target:{id:user.id,login:user.login},store});
    engine=new Engine(store,current,changed,data=>badges.confirm(data));
    current.on('badgeShoutout',data=>{if(epoch===generation)badges.confirm(data);});
    current.on('ready',async()=>{
      if(epoch!==generation)return;
      const active=engine;
      try{await active.connect();if(epoch===generation){notice='';if(bot)store.setMeta('botAccount',store.lastAccount());}}catch(error){if(epoch===generation){notice=bot?error.message:safeError(error);current.reset();}}
      changed();
    });
    current.on('offline',message=>{if(epoch!==generation)return;engine.disconnect();notice=message;changed();});
    current.on('status',message=>{if(epoch===generation){notice=message;changed();}});
    current.on('event',(type,data)=>{
      if(epoch!==generation)return;
      if(type==='ChatMessage')engine.message(data);
      else if(type==='ShoutoutCreated')engine.shoutout(data);
      else if(type==='Raid')engine.raid(data);
      else if(['StreamOnline','StreamOffline'].includes(type)&&!data.isTest&&!data.meta?.isTest){
        const account=String(data.broadcaster?.id||data.user?.id||'');
        if(account!==engine.account)return;
        if(type==='StreamOffline'){engine.live=false;store.cancelQueue('Трансляция завершена');changed();}
        else void engine.refresh().catch(()=>current.reset());
      }
    });
    current.on('changed',changed);
    void current.connect();changed();
  }
  auth.on('change',changed);auth.on('authorized',()=>{if(store.prefs().provider==='direct'){store.setPrefs({enabled:true});connect();}});
  auth.on('expired',()=>{if(store.prefs().provider==='direct'){disconnect();notice=auth.message;changed();}});
  const commands={
    state:async()=>state(),
    badges:async p=>({url:badges.editor(p.login||''),...badges.info(),editorUrl:badges.editor(p.login||'')}),
    badgeTest:async p=>badges.test(p.login),
    add:async p=>{const name=store.add(p.login);changed();return name;},
    remove:async p=>{store.remove(p.login);changed();},
    prefs:async p=>{
      const previous=store.prefs().provider;
      if(p.provider&&engine?.busy)throw Error('Дождитесь завершения текущего шотаута.');
      const result=store.setPrefs(p);
      if(previous!==result.provider){auth.cancel();connect();}
      if(!result.enabled)store.cancelQueue('Автоотметки на паузе');changed();return result;
    },
    language:async p=>{if(!['en-US','ru-RU','uk-UA'].includes(p.value))throw Error('Unknown language.');store.setMeta('language',p.value);changed();},
    login:async p=>{
      if(demo)throw Error('Demo is offline.');
      if(engine?.busy)throw Error('Дождитесь завершения текущего шотаута.');
      const id=String(p.clientId||store.meta('clientId','')||require('./data/twitch-client.json').clientId).trim();
      disconnect();store.setPrefs({enabled:false,provider:'direct'});
      await auth.start(id);store.setMeta('clientId',id);changed();return auth.view();
    },
    cancelLogin:async()=>{auth.cancel();connect();},
    logout:async()=>{disconnect();store.setPrefs({enabled:false});auth.logout();notice='';changed();},
    reconnect:async()=>{notice='';connect();},
    botDetect:async()=>{if(demo)return [];return runningBots();},
    botSetup:async p=>{
      if(demo)throw Error('Demo is offline.');
      if(engine?.busy)throw Error('Дождитесь завершения текущего шотаута.');
      const exe=String(p.exe||botConnection?.exe||'');
      if(!path.isAbsolute(exe))throw Error('Выберите Streamer.bot.exe.');
      const result=await install(exe,fs.readFileSync(path.join(__dirname,'data/bridge/ShoutoutDesk.cs'),'utf8'),botConnection?.secret);
      if(result.needsClose)return result;
      botSecrets.save(result.connection);botConnection=result.connection;
      auth.cancel();store.setPrefs({provider:'bot'});
      const child=spawn(exe,[],{cwd:path.dirname(exe),detached:true,windowsHide:true,stdio:'ignore'});
      child.on('error',()=>{notice='Связка сохранена. Запустите Streamer.bot самостоятельно.';changed();});child.unref();
      notice='';connect();return {ok:true};
    },
    resetCooldowns:async()=>{
      if(engine?.busy)throw Error('Дождитесь завершения текущего шотаута и повторите сброс.');
      const reset=store.resetCooldowns();changed();return {reset};
    },
    export:async p=>{
      if(!path.isAbsolute(p.path||''))throw Error('Invalid export path.');
      if(fs.existsSync(p.path))throw Error('Выберите новое имя файла: существующий файл не перезаписывается.');
      atomicWrite(p.path,JSON.stringify(exportBundle(store,store.lastAccount().id),null,2));return {path:p.path};
    },
    import:async p=>{
      if(!engine?.ready&&!demo)throw Error('Перед импортом дождитесь подключения канала.');
      if(engine?.busy)throw Error('Дождитесь завершения текущего шотаута.');
      if(!path.isAbsolute(p.path||'')||fs.statSync(p.path).size>64*1024*1024)throw Error('Invalid import file.');
      const value=/\.sqlite$/i.test(p.path)?readDesktop(p.path):JSON.parse(fs.readFileSync(p.path,'utf8'));
      store.setPrefs({enabled:false});store.cancelQueue('Импорт данных');
      await backupProfile(dir,'before-import');
      const result=importBundle(store,value,engine?.account||store.lastAccount().id);changed();return result;
    },
    update:async()=>{if(demo)throw Error('Demo is offline.');return updates.refresh(true);},
    quit:async()=>shutdown()
  };
  function shutdown(){
    if(closing)return;disconnect();closing=true;badges.close();updates.stop();auth.dispose();clearTimeout(debounce);clearInterval(tick);clearInterval(refresh);clearInterval(heartbeat);session.close();store.close();process.exit(0);
  }
  const heartbeat=setInterval(()=>{session.touch();store.checkpoint();},HEARTBEAT_MS);
  const tick=setInterval(()=>{if(engine)void engine.tick().catch(()=>{notice='Ошибка обработки очереди. Переподключитесь.';disconnect();changed();});},1000);
  const refresh=setInterval(async()=>{
    if(refreshing||!engine?.ready)return;refreshing=true;const active=engine;
    try{await active.refresh();}catch(error){if(active===engine){notice=safeError(error);bridge.reset();changed();}}
    finally{refreshing=false;}
  },30000);
  const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
  let chain=Promise.resolve();
  input.on('line',line=>{
    if(line.length>1024*1024)return shutdown();
    try{const request=JSON.parse(line);if(Number.isSafeInteger(request.id)&&request.method==='ping'){emit({id:request.id,result:{ok:true}});return;}}catch{}
    chain=chain.then(async()=>{
      let request;
      try{
        request=JSON.parse(line);
        if(!Number.isSafeInteger(request.id)||!Object.hasOwn(commands,request.method))throw Error('Unknown command.');
        const result=await commands[request.method](request.params||{});
        emit({id:request.id,result:result??null});
      }catch(error){emit({id:request?.id||0,error:String(error.publicMessage||error.message||'Operation failed.').slice(0,500)});}
    });
  });
  input.on('close',shutdown);process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
  phase='running';emit({event:'state',data:state()});connect(recover);auth.resume();if(!demo)updates.start();
}
main().catch(fatal);
