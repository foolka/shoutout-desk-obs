const {EventEmitter}=require('node:events');
const {loadSdk,safeError,publicError}=require('./twitch-auth.cjs');
async function deadline(task,ms){
  let timer;
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Preparation timed out')),ms);})]);}
  finally{clearTimeout(timer);}
}
class DirectBridge extends EventEmitter {
  constructor({auth,target,store,sdk=loadSdk,fetchImpl=globalThis.fetch,prepareTimeoutMs=15000}){
    super();Object.assign(this,{auth,target,store,sdk,fetchImpl,prepareTimeoutMs});this.closed=false;this.active=new Set();this.epoch=0;
    this.authRetry=message=>this.reset(message);auth.on?.('retry',this.authRetry);
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
      this.active.clear();let chat,shoutout,raid;
      listener.onSubscriptionCreateSuccess(sub=>{
        if(this.closed||epoch!==this.epoch)return;
        this.active.add(sub);if(this.active.has(chat)&&this.active.has(shoutout)&&this.active.has(raid)){this.ready=true;clearTimeout(this.connectTimer);this.emit('ready');}
      });
      listener.onSubscriptionCreateFailure((_sub,error)=>this.fail(safeError(error),epoch));
      listener.onRevoke((_sub,status)=>{
        if(this.closed||epoch!==this.epoch)return;
        if(['authorization_revoked','user_removed'].includes(status))this.auth.invalidate('Twitch отозвал доступ. Войдите через Twitch снова.');
        this.fail('Подписка Twitch остановлена: '+status,epoch,false);
      });
      listener.onUserSocketDisconnect(()=>{if(!this.closed&&epoch===this.epoch){
        this.ready=false;this.active.clear();this.emit('offline','Переподключение к Twitch');
        clearTimeout(this.connectTimer);this.connectTimer=setTimeout(()=>this.fail('Повторяем подключение к Twitch',epoch),30000);this.connectTimer.unref?.();
      }});
      chat=listener.onChannelChatMessage(this.target.id,this.actor,event=>{
        if(!this.ready||this.closed||epoch!==this.epoch)return;
        this.emit('event','ChatMessage',{user:{id:event.chatterId,login:event.chatterName},broadcaster:{id:event.broadcasterId},sharedChatSource:{id:event.sourceBroadcasterId||''}});
      });
      shoutout=listener.onChannelShoutoutCreate(this.target.id,this.actor,event=>{
        if(this.closed||epoch!==this.epoch||event.broadcasterId!==this.target.id)return;
        this.store.observeShoutout(this.target.id,event.shoutedOutBroadcasterName,event.startDate.getTime());this.emit('changed');
        this.emit('badgeShoutout',{account:this.target.id,login:event.shoutedOutBroadcasterName,stamp:event.startDate.getTime()});
      });
      raid=listener.onChannelRaidTo(this.target.id,event=>{
        if(!this.ready||this.closed||epoch!==this.epoch||event.raidedBroadcasterId!==this.target.id)return;
        this.emit('event','Raid',{raider:{id:event.raidingBroadcasterId,login:event.raidingBroadcasterName},broadcaster:{id:event.raidedBroadcasterId}});
      });
      this.connectTimer=setTimeout(()=>this.fail('Twitch не подтвердил подключение к чату. Повторяем.',epoch),30000);this.connectTimer.unref?.();listener.start();
    }catch(error){this.fail(error.publicMessage||safeError(error),epoch);}
  }
  fail(message,epoch=this.epoch,retry=true){
    if(this.closed||epoch!==this.epoch)return;
    this.epoch++;this.ready=false;clearTimeout(this.connectTimer);this.listener?.stop();this.emit('offline',message);
    clearTimeout(this.timer);if(retry&&!this.auth.invalid){this.timer=setTimeout(()=>void this.connect(),15000);this.timer.unref?.();}
  }
  async call(op,args={}){
    if(this.closed)throw publicError('Подключение закрыто.');
    if(op==='probe')return {status:'unknown'};
    if(!this.api)throw publicError('Twitch ещё не подключён.');
    if(op==='profile'){
      const user=await this.api.asUser(this.actor,api=>api.users.getUserByName(args.login));
      return {profile:user?{displayName:user.displayName,avatarUrl:user.profilePictureUrl}:null};
    }
    if(op==='status'){
      const stream=await deadline((async()=>{await this.auth.validate();return this.api.asUser(this.actor,api=>api.streams.getStreamByUserId(this.target.id));})(),this.prepareTimeoutMs);
      return {status:'ok',account:this.target.id,channel:this.target.login,live:!!stream,streamId:stream?.id||''};
    }
    if(op!=='send'||args.account!==this.target.id)return {status:'failed',detail:'Выбран другой канал'};
    let target,token;const epoch=this.epoch;
    const deferred=()=>({status:'deferred',detail:'Twitch недоступен до отправки. Отметка сохранена в очереди.'});
    try{
      const prepared=await deadline((async()=>{
        const state=await this.call('status');if(!state.live)return {offline:true};
        const target=await this.api.asUser(this.actor,api=>api.users.getUserByName(args.login));
        const token=await this.provider.getAccessTokenForUser(this.actor,['moderator:manage:shoutouts']);
        return {target,token};
      })(),this.prepareTimeoutMs);
      if(prepared.offline)return {status:'offline'};
      ({target,token}=prepared);
      if(!target||target.id===this.target.id)return {status:'failed',detail:'Канал не найден или выбран собственный канал'};
    }catch(error){return this.auth.invalid?{status:'failed',detail:error.publicMessage||safeError(error)}:deferred();}
    if(this.closed||!this.ready||this.auth.invalid||epoch!==this.epoch)return this.auth.invalid?{status:'failed',detail:this.auth.message}:deferred();
    const params=new URLSearchParams({from_broadcaster_id:this.target.id,to_broadcaster_id:target.id,moderator_id:this.actor});
    // No SDK auto-retries for this side effect: a lost response must remain uncertain.
    const post=access=>this.fetchImpl('https://api.twitch.tv/helix/chat/shoutouts?'+params,{method:'POST',headers:{'Client-Id':this.auth.saved.clientId,Authorization:'Bearer '+access},signal:AbortSignal.timeout(10000),redirect:'error'});
    try{
      if(args.canSend&&!args.canSend())return {status:'cancelled',detail:'Шотаут уже сделан в канале или очередь отменена'};
      let response=await post(token.accessToken);
      if(response.status===401){
        let refreshed;try{refreshed=await deadline(this.provider.refreshAccessTokenForUser(this.actor),this.prepareTimeoutMs);}catch(error){return this.auth.invalid?{status:'failed',detail:this.auth.message||safeError(error)}:deferred();}
        if(this.closed||!this.ready||this.auth.invalid||epoch!==this.epoch)return this.auth.invalid?{status:'failed',detail:this.auth.message}:deferred();
        if(args.canSend&&!args.canSend())return {status:'cancelled',detail:'Шотаут уже сделан в канале или очередь отменена'};
        response=await post(refreshed.accessToken);
      }
      if(response.status===204)return {status:'sent',sentAt:Date.now(),profile:{displayName:target.displayName,avatarUrl:target.profilePictureUrl}};
      if(response.status===429)return {status:'rate_limited'};
      if(response.status>=500)return {status:'unknown'};
      if(response.status===403)this.fail('Twitch запретил шотаут. Проверьте права и ограничения канала.',this.epoch,false);
      if(response.status===401){this.auth.invalidate('Twitch отклонил обновлённый вход. Войдите через Twitch снова.');this.fail(this.auth.message,this.epoch,false);}
      return {status:'failed',detail:response.status===403?'Нет права на шотаут в этом канале':response.status===400?'Twitch отклонил шотаут: канал не в эфире, нет зрителей или получатель недоступен':'Twitch отклонил запрос: HTTP '+response.status};
    }catch{return {status:'unknown'};}
  }
  reset(reason){this.fail(reason||'Переподключение к Twitch');}
  close(){this.closed=true;this.epoch++;this.auth.off?.('retry',this.authRetry);clearTimeout(this.timer);clearTimeout(this.connectTimer);this.listener?.stop();}
}
module.exports={DirectBridge};
