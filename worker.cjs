const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline');
const {Store}=require('./core/store.cjs');
const {Engine}=require('./core/engine.cjs');
const {TwitchAuth,safeError}=require('./core/twitch-auth.cjs');
const {DirectBridge}=require('./core/twitch-direct.cjs');
const {vault,prepareProfile,backupProfile,atomicWrite}=require('./core/vault.cjs');
const {exportBundle,importBundle,readDesktop}=require('./core/transfer.cjs');
const {checkUpdate}=require('./core/update.cjs');
const {ObsSession,HEARTBEAT_MS}=require('./core/session.cjs');
const VERSION=require('./package.json').version;

async function main() {
  const args=process.argv.slice(2), dir=path.resolve(args[0]||''), helper=path.resolve(args[1]||'');
  if(!path.isAbsolute(args[0]||'')||!path.isAbsolute(args[1]||''))throw Error('Absolute profile and helper paths are required.');
  const demo=args.includes('--offline-demo');
  await prepareProfile(dir,VERSION);
  const store=new Store(path.join(dir,'shoutouts.sqlite'));
  const secrets=vault(path.join(dir,'twitch-auth.dpapi'),helper);
  const pendingSecrets=vault(path.join(dir,'twitch-login.dpapi'),helper);
  let saved=null,notice='',bridge=null,engine=null,closing=false,refreshing=false,generation=0;
  let pending=null;
  try{if(!demo)saved=secrets.load();}catch{notice='Защищённый вход недоступен. Войдите снова; список и история сохранены.';}
  try{if(!demo&&!saved)pending=pendingSecrets.load();}catch{notice='Незавершённый вход недоступен. Войдите через Twitch ещё раз.';}
  const auth=new TwitchAuth({saved,save:v=>secrets.save(v),pending,savePending:v=>pendingSecrets.save(v)});
  const session=new ObsSession(store);
  const emit=value=>{if(!closing)process.stdout.write(JSON.stringify(value)+'\n');};
  if(demo){
    store.rememberAccount('999001','demo_channel');
    for(const name of ['aurora_live','pixel_cook','riverstudio','nightshift','someone_with_a_long_name'])store.add(name);
    store.observeShoutout('999001','riverstudio',Date.now()-2*3600000);
  }
  function state(){
    const account=store.lastAccount();
    const history=store.history(account.id);
    const people=store.people(account.id);
    return {version:VERSION,account,auth:auth.view(),prefs:store.prefs(),people,history,notice,
      connected:!!engine?.ready,live:!!engine?.live,demo,language:store.meta('language','ru-RU'),
      queue:history.filter(h=>['queued','sending'].includes(h.status)).length,
      globalNextAt:store.globalNext(account.id),now:Date.now(),
      clientConfigured:!!(store.meta('clientId','')||require('./data/twitch-client.json').clientId)};
  }
  let debounce;
  function changed(){clearTimeout(debounce);debounce=setTimeout(()=>emit({event:'state',data:state()}),80);}
  function disconnect(){generation++;engine?.stop();bridge?.close();engine=null;bridge=null;store.cancelQueue('Подключение остановлено');}
  function connect(){
    disconnect();if(!auth.saved||demo)return changed();
    const epoch=generation,user=auth.saved.user;
    store.rememberAccount(user.id,user.login);
    const current=bridge=new DirectBridge({auth,target:{id:user.id,login:user.login},store});
    engine=new Engine(store,current,changed);
    current.on('ready',async()=>{
      if(epoch!==generation)return;
      const active=engine;
      try{await active.connect();if(epoch===generation)notice='';}catch(error){if(epoch===generation){notice=safeError(error);current.reset();}}
      changed();
    });
    current.on('offline',message=>{if(epoch!==generation)return;engine.disconnect();notice=message;changed();});
    current.on('event',(_type,data)=>{if(epoch===generation)engine.message(data);});
    current.on('changed',changed);
    void current.connect();changed();
  }
  auth.on('change',changed);auth.on('authorized',()=>{store.setPrefs({enabled:false});connect();});
  auth.on('expired',()=>{disconnect();notice=auth.message;changed();});
  const commands={
    state:async()=>state(),
    add:async p=>{const name=store.add(p.login);changed();return name;},
    remove:async p=>{store.remove(p.login);changed();},
    prefs:async p=>{
      const result=store.setPrefs(p);
      if(!result.enabled)store.cancelQueue('Автоотметки на паузе');changed();return result;
    },
    language:async p=>{if(!['en-US','ru-RU','uk-UA'].includes(p.value))throw Error('Unknown language.');store.setMeta('language',p.value);changed();},
    login:async p=>{
      if(demo)throw Error('Demo is offline.');
      const id=String(p.clientId||store.meta('clientId','')||require('./data/twitch-client.json').clientId).trim();
      disconnect();store.setPrefs({enabled:false});
      await auth.start(id);store.setMeta('clientId',id);changed();return auth.view();
    },
    cancelLogin:async()=>{auth.cancel();connect();},
    logout:async()=>{disconnect();store.setPrefs({enabled:false});auth.logout();notice='';changed();},
    reconnect:async()=>{notice='';connect();},
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
      if(!auth.saved&&!demo)throw Error('Перед импортом войдите через Twitch.');
      if(!path.isAbsolute(p.path||'')||fs.statSync(p.path).size>64*1024*1024)throw Error('Invalid import file.');
      const value=/\.sqlite$/i.test(p.path)?readDesktop(p.path):JSON.parse(fs.readFileSync(p.path,'utf8'));
      store.setPrefs({enabled:false});store.cancelQueue('Импорт данных');
      await backupProfile(dir,'before-import');
      const result=importBundle(store,value,auth.saved?.user.id||store.lastAccount().id);changed();return result;
    },
    update:async()=>checkUpdate(VERSION),
    quit:async()=>shutdown()
  };
  function shutdown(){
    if(closing)return;disconnect();closing=true;auth.dispose();clearTimeout(debounce);clearInterval(tick);clearInterval(refresh);clearInterval(heartbeat);session.close();store.close();process.exit(0);
  }
  const heartbeat=setInterval(()=>session.touch(),HEARTBEAT_MS);
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
  emit({event:'state',data:state()});connect();auth.resume();
}
process.on('uncaughtException',()=>{process.stdout.write(JSON.stringify({event:'fatal',error:'The local worker stopped. Your data is preserved.'})+'\n');process.exit(1);});
process.on('unhandledRejection',()=>{process.stdout.write(JSON.stringify({event:'fatal',error:'The local worker stopped. Your data is preserved.'})+'\n');process.exit(1);});
main().catch(()=>{process.stdout.write(JSON.stringify({event:'fatal',error:'Cannot open local data or create the required backup. No Twitch actions were started.'})+'\n');process.exit(1);});
