const {EventEmitter}=require('node:events');
const {loadSdk,safeError,publicError}=require('./twitch-auth.cjs');
class DirectBridge extends EventEmitter {
  constructor({auth,target,store,sdk=loadSdk,fetchImpl=globalThis.fetch}){
    super();Object.assign(this,{auth,target,store,sdk,fetchImpl});this.closed=false;this.active=new Set();this.epoch=0;
  }
  async connect(){
    const epoch=++this.epoch;
    try{
      const sdk=await this.sdk(),authProvider=await this.auth.getProvider();
      if(this.closed||epoch!==this.epoch)return;
      this.actor=this.auth.saved.user.id;
      if(this.target.id!==this.actor)throw publicError('Плагин работает только с собственным каналом стримера.');
      if(this.closed||epoch!==this.epoch)return;
      this.provider=authProvider;this.api=new sdk.ApiClient({authProvider,logger:{minLevel:'error'}});
      const listener=this.listener=new sdk.EventSubWsListener({apiClient:this.api,logger:{minLevel:'error'}});
      this.active.clear();let chat,shoutout;
      listener.onSubscriptionCreateSuccess(sub=>{
        if(this.closed||epoch!==this.epoch)return;
        this.active.add(sub);if(this.active.has(chat)&&this.active.has(shoutout)){this.ready=true;clearTimeout(this.connectTimer);this.emit('ready');}
      });
      listener.onSubscriptionCreateFailure((_sub,error)=>this.fail(safeError(error),epoch));
      listener.onRevoke(()=>this.fail('Twitch отозвал доступ. Войдите снова и проверьте права на канал.',epoch,false));
      listener.onUserSocketDisconnect(()=>{if(!this.closed&&epoch===this.epoch){this.ready=false;this.active.clear();this.emit('offline','Переподключение к Twitch');}});
      chat=listener.onChannelChatMessage(this.target.id,this.actor,event=>{
        if(!this.ready||this.closed||epoch!==this.epoch)return;
        this.emit('event','ChatMessage',{user:{id:event.chatterId,login:event.chatterName},broadcaster:{id:event.broadcasterId},sharedChatSource:{id:event.sourceBroadcasterId||''}});
      });
      shoutout=listener.onChannelShoutoutCreate(this.target.id,this.actor,event=>{
        if(this.closed||epoch!==this.epoch||event.broadcasterId!==this.target.id)return;
        this.store.observeShoutout(this.target.id,event.shoutedOutBroadcasterName,event.startDate.getTime());this.emit('changed');
      });
      this.connectTimer=setTimeout(()=>this.fail('Twitch не подтвердил подключение к чату. Повторяем.',epoch),30000);this.connectTimer.unref?.();listener.start();
    }catch(error){this.fail(error.publicMessage||safeError(error),epoch);}
  }
  fail(message,epoch=this.epoch,retry=true){
    if(this.closed||epoch!==this.epoch)return;
    this.epoch++;this.ready=false;clearTimeout(this.connectTimer);this.listener?.stop();this.emit('offline',message);
    clearTimeout(this.timer);if(retry){this.timer=setTimeout(()=>void this.connect(),15000);this.timer.unref?.();}
  }
  async call(op,args={}){
    if(this.closed)throw publicError('Подключение закрыто.');
    if(op==='probe')return {status:'unknown'};
    if(!this.api)throw publicError('Twitch ещё не подключён.');
    if(op==='status'){
      await this.auth.validate();const stream=await this.api.asUser(this.actor,api=>api.streams.getStreamByUserId(this.target.id));
      return {status:'ok',account:this.target.id,channel:this.target.login,live:!!stream};
    }
    if(op!=='send'||args.account!==this.target.id)return {status:'failed',detail:'Выбран другой канал'};
    let target,token;
    try{
      const state=await this.call('status');if(!state.live)return {status:'offline'};
      target=await this.api.asUser(this.actor,api=>api.users.getUserByName(args.login));
      if(!target||target.id===this.target.id)return {status:'failed',detail:'Канал не найден или выбран собственный канал'};
      token=await this.provider.getAccessTokenForUser(this.actor,['moderator:manage:shoutouts']);
    }catch(error){return {status:'failed',detail:error.publicMessage||safeError(error)};}
    if(this.closed||!this.ready||this.auth.invalid)return {status:'failed',detail:'Соединение изменилось до отправки'};
    const params=new URLSearchParams({from_broadcaster_id:this.target.id,to_broadcaster_id:target.id,moderator_id:this.actor});
    // No SDK auto-retries for this side effect: a lost response must remain uncertain.
    const post=access=>this.fetchImpl('https://api.twitch.tv/helix/chat/shoutouts?'+params,{method:'POST',headers:{'Client-Id':this.auth.saved.clientId,Authorization:'Bearer '+access},signal:AbortSignal.timeout(10000),redirect:'error'});
    try{
      if(args.canSend&&!args.canSend())return {status:'cancelled',detail:'Шотаут уже сделан в канале или очередь отменена'};
      let response=await post(token.accessToken);
      if(response.status===401){
        let refreshed;try{refreshed=await this.provider.refreshAccessTokenForUser(this.actor);}catch{return {status:'failed',detail:'Войдите через Twitch заново'};}
        if(this.closed||!this.ready||this.auth.invalid)return {status:'failed',detail:'Подключение закрыто'};
        if(args.canSend&&!args.canSend())return {status:'cancelled',detail:'Шотаут уже сделан в канале или очередь отменена'};
        response=await post(refreshed.accessToken);
      }
      if(response.status===204)return {status:'sent',sentAt:Date.now()};
      if(response.status===429)return {status:'rate_limited'};
      if(response.status>=500)return {status:'unknown'};
      if(response.status===403)this.fail('Нет права на шотаут в своём канале. Войдите через Twitch заново.',this.epoch,false);
      if(response.status===401)this.fail('Вход Twitch больше не действителен. Войдите заново.',this.epoch,false);
      return {status:'failed',detail:response.status===403?'Нет права на шотаут в этом канале':response.status===400?'Twitch отклонил шотаут: канал не в эфире, нет зрителей или получатель недоступен':'Twitch отклонил запрос: HTTP '+response.status};
    }catch{return {status:'unknown'};}
  }
  reset(reason){this.fail(reason||'Переподключение к Twitch');}
  close(){this.closed=true;this.epoch++;clearTimeout(this.timer);clearTimeout(this.connectTimer);this.listener?.stop();}
}
module.exports={DirectBridge};
