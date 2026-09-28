const CHAT_SETTLE_MS=10000;
function chatUser(data) {
  const user=data.user || data.message?.user || {};
  return {
    login:user.login || user.userLogin || data.userLogin || data.message?.username || data.message?.userName || '',
    id:String(user.id || user.userId || data.userId || data.message?.userId || ''),
    channel:String(data.broadcaster?.id || data.broadcaster?.userId || data.broadcasterUserId || data.message?.channelId || ''),
    source:String(data.sharedChatSource?.id || ''),
    shared:!!(data.isFromSharedChatGuest || data.isSharedChat || data.isSharedChatMessage || data.message?.isSharedChat || data.sharedChat?.isSharedChat),
    synthetic:!!(data.isTest || data.meta?.isTest || data.meta?.internal || data.message?.isTest),
  };
}
class Engine {
  constructor(store,bridge,onChange=()=>{}) {
    this.store=store;this.bridge=bridge;this.onChange=onChange;
    const last=store.lastAccount();this.account=last.id;this.channel=last.channel;
    this.live=false;this.ready=false;this.busy=false;this.stopped=false;
  }
  async connect() {
    this.ready=false;this.live=false;
    const state=await this.bridge.call('status');
    if(this.stopped)return;
    if (state.status!=='ok' || !state.account) throw Error(state.detail || 'Не удалось подтвердить подключение Twitch.');
    if (this.account && this.account!==state.account) this.store.cancelQueue('Аккаунт Twitch изменён');
    this.account=state.account;this.channel=state.channel;this.live=state.live;
    this.store.rememberAccount(this.account,this.channel);
    for (const row of this.store.unresolved(this.account)) {
      const result=await this.bridge.call('probe',{operationId:row.id});
      if(this.stopped)return;
      this.apply(row,result);
    }
    this.ready=true; this.onChange();
  }
  disconnect() { this.ready=false;this.live=false;this.store.cancelQueue('Соединение потеряно');this.onChange(); }
  stop(){this.stopped=true;this.ready=false;this.live=false;}
  async refresh() {
    const state=await this.bridge.call('status');
    if(this.stopped)return;
    if(state.status!=='ok') throw Error(state.detail || 'Twitch недоступен');
    if(state.account!==this.account) { this.store.cancelQueue('Аккаунт изменён'); await this.connect(); return; }
    this.live=state.live;
    if (!this.live) this.store.cancelQueue('Трансляция завершена');
    this.onChange();
  }
  message(data) {
    if(!this.ready || !this.live || !this.store.prefs().enabled) return;
    const user=chatUser(data);
    if(!user.login || user.shared || user.synthetic || (user.source && user.source!==this.account) || (user.channel && user.channel!==this.account) || user.id===this.account) return;
    try { if(this.store.enqueue(this.account,user.login)) this.onChange(); } catch { /* Invalid chat usernames are ignored. */ }
  }
  shoutout(data){
    if(this.stopped||data.isTest||data.meta?.isTest||data.isFromSharedChatGuest)return;
    const account=String(data.broadcaster?.id||'');
    if(!account||account!==this.account)return;
    const stamp=Date.parse(data.startedAt||data.createdAt||'');
    try{if(this.store.observeShoutout(account,data.user?.login,stamp))this.onChange();}catch{ /* Ignore malformed event identities. */ }
  }
  apply(row,result) {
    if(result.status==='sent') this.store.finish(row.id,'sent','',Number(result.sentAt)||this.store.now());
    else if(result.status==='offline') { this.store.finish(row.id,'cancelled','Канал не в эфире'); this.live=false;this.store.cancelQueue('Канал не в эфире'); }
    else if(result.status==='cancelled'||(result.status==='rate_limited'&&!this.store.canSend(row.id))) this.store.finish(row.id,'cancelled',result.detail||'Шотаут уже сделан в канале или очередь отменена');
    else if(result.status==='rate_limited') this.store.retry(row.id,125000,'Лимит Twitch: повтор через 2 минуты');
    else if(result.status==='failed') this.store.finish(row.id,'failed',result.detail || 'Twitch отклонил шотаут');
    else this.store.finish(row.id,'uncertain','Нет подтверждения. Повтор заблокирован на время таймаута.');
  }
  async tick() {
    if(this.busy || !this.ready || !this.live || !this.store.prefs().enabled) return;
    const row=this.store.take(this.account,CHAT_SETTLE_MS); if(!row) return;
    this.busy=true;this.onChange();
    try {
      const canSend=()=>!this.stopped&&this.ready&&this.live&&this.account===row.account&&this.store.canSend(row.id);
      const result=await this.bridge.call('send',{operationId:row.id,login:row.login,account:this.account,canSend});
      if(this.stopped)return;
      this.apply(row,result);
    } catch {
      // Leave 'sending' durable: reconnect probes the bridge ledger without re-sending.
      if(!this.stopped){this.ready=false;this.bridge.reset?.();}
    } finally { this.busy=false;if(!this.stopped)this.onChange(); }
  }
}
module.exports={Engine,chatUser,CHAT_SETTLE_MS};
