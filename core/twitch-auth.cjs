const {EventEmitter}=require('node:events');
const SCOPES=['user:read:chat','moderator:manage:shoutouts'];
let sdkPromise;
function loadSdk(){return sdkPromise ||= Promise.all([import('@twurple/auth'),import('@twurple/api'),import('@twurple/eventsub-ws')]).then(parts=>Object.assign({},...parts));}
function clientId(value){const id=String(value||'').trim();if(!/^[a-z0-9]{20,64}$/i.test(id))throw Error('Вставьте Client ID приложения Twitch. Не Client Secret.');return id;}
function errorCode(error){let body=error?.body;try{if(typeof body==='string')body=JSON.parse(body);}catch{}return body?.message||body?.error||error?.message||'';}
function safeError(error){
  if(error?.publicMessage)return error.publicMessage;
  const code=errorCode(error);
  if(/denied|declined/i.test(code))return 'Доступ не разрешён. Можно повторить вход.';
  if(/client|device code/i.test(code))return 'Проверьте Client ID и тип Public в Twitch Developer Console.';
  if(/scope|token|unauthorized|invalid.*auth/i.test(code)||[401,403].includes(error?.statusCode))return 'Нужно заново войти через Twitch и разрешить доступ.';
  return 'Twitch не ответил. Проверьте интернет и повторите попытку.';
}
function publicError(message){return Object.assign(Error(message),{publicMessage:message});}
function verificationUrl(value){const url=new URL(value);if(url.origin!=='https://www.twitch.tv'||url.pathname!=='/activate')throw publicError('Twitch вернул неизвестный адрес входа.');return url.href;}
class TwitchAuth extends EventEmitter {
  constructor({saved=null,save,sdk=loadSdk,now=Date.now}){super();this.saved=saved;this.save=save;this.sdk=sdk;this.now=now;this.serial=0;this.authGeneration=0;this.pending=null;this.message='';}
  view(){return {user:this.saved?.user||null,pending:this.pending?{code:this.pending.userCode,url:this.pending.url,expiresAt:this.pending.expiresAt}:null,message:this.message};}
  persist(value){try{this.save(value);}catch{throw publicError('Не удалось сохранить вход в защищённом хранилище Windows. Повторите авторизацию.');}}
  invalidate(message){this.invalid=true;this.message=message;this.emit('expired');this.emit('change');}
  cancel(){this.serial++;clearTimeout(this.timer);this.pending=null;this.emit('change');}
  async start(id){
    this.cancel();const generation=this.serial;id=clientId(id);this.message='Получаем код Twitch';this.emit('change');
    const sdk=await this.sdk();const info=await sdk.startDeviceCodeFlow(id,SCOPES);
    if(generation!==this.serial)return;
    this.pending={...info,clientId:id,url:verificationUrl(info.verificationUri),expiresAt:this.now()+info.expiresIn*1000,interval:Math.max(5,info.interval||5)*1000};
    this.message='Разрешите доступ в браузере';this.emit('change');this.schedule(generation);return this.view();
  }
  schedule(generation){clearTimeout(this.timer);this.timer=setTimeout(()=>void this.poll(generation),this.pending.interval);this.timer.unref?.();}
  async poll(generation=this.serial){
    if(generation!==this.serial||!this.pending)return;
    const pending=this.pending;
    if(this.now()>=pending.expiresAt){this.cancel();this.message='Код истёк. Нажмите «Войти через Twitch» ещё раз.';this.emit('change');return;}
    try{
      const sdk=await this.sdk();const token=await sdk.exchangeDeviceCode(pending.clientId,pending.deviceCode,SCOPES);
      if(generation!==this.serial)return;
      const info=await sdk.getTokenInfo(token.accessToken,pending.clientId);
      if(generation!==this.serial)return;
      if(info.clientId!==pending.clientId||!info.userId||SCOPES.some(scope=>!info.scopes.includes(scope)))throw publicError('Разрешены не все нужные права. Повторите вход.');
      const saved={clientId:pending.clientId,user:{id:info.userId,login:info.userName},token:{...token,scope:info.scopes}};
      this.persist(saved);this.authGeneration++;this.loading=null;this.invalid=false;this.saved=saved;this.provider=null;this.pending=null;clearTimeout(this.timer);this.message='Вход выполнен';this.emit('change');this.emit('authorized');
    }catch(error){
      if(generation!==this.serial)return;
      const code=errorCode(error);
      if(/authorization_pending/i.test(code)){this.schedule(generation);return;}
      if(/slow_down/i.test(code)){pending.interval+=5000;this.schedule(generation);return;}
      if(!error.statusCode&&!error.publicMessage){this.message='Нет ответа Twitch. Повторяем подключение';this.emit('change');this.schedule(generation);return;}
      this.pending=null;this.message=safeError(error);this.emit('change');
    }
  }
  async getProvider(){
    if(this.invalid)throw publicError(this.message);
    if(!this.saved)throw publicError('Войдите через Twitch.');
    if(this.provider)return this.provider;
    if(this.loading)return this.loading;
    const generation=this.authGeneration,saved=this.saved;
    const loading=(async()=>{
      const sdk=await this.sdk();const provider=new sdk.RefreshingAuthProvider({clientId:saved.clientId});
      provider.onRefresh((id,token)=>{
        if(generation!==this.authGeneration||this.saved?.user.id!==id)return;
        const next={...this.saved,token};
        try{this.persist(next);this.saved=next;}catch(error){this.invalidate(error.publicMessage);}
      });
      provider.onRefreshFailure(()=>{if(generation===this.authGeneration)this.invalidate('Сессия Twitch истекла. Войдите снова.');});
      const id=await provider.addUserForToken(saved.token,['chat','default']);
      if(generation!==this.authGeneration)throw publicError('Настройка подключения изменена.');
      if(id!==saved.user.id)throw publicError('Аккаунт Twitch изменился. Войдите снова.');
      const current=await provider.getAccessTokenForUser(id,SCOPES);
      if(generation!==this.authGeneration||this.invalid)throw publicError('Настройка подключения изменена. Повторите вход.');
      if(!current?.accessToken)throw publicError('Войдите через Twitch заново.');
      this.persist({...this.saved,token:current});this.saved={...this.saved,token:current};
      this.provider=provider;this.validatedAt=this.now();return provider;
    })().finally(()=>{if(this.loading===loading)this.loading=null;});this.loading=loading;return loading;
  }
  async validate(){
    const generation=this.authGeneration,provider=await this.getProvider();if(this.now()-(this.validatedAt||0)<55*60000)return;
    const sdk=await this.sdk();let token=await provider.getAccessTokenForUser(this.saved.user.id,SCOPES),info;
    try{info=await sdk.getTokenInfo(token.accessToken,this.saved.clientId);}catch{token=await provider.refreshAccessTokenForUser(this.saved.user.id);info=await sdk.getTokenInfo(token.accessToken,this.saved.clientId);}
    if(generation!==this.authGeneration)throw publicError('Подключение изменено.');
    if(info.userId!==this.saved.user.id||info.clientId!==this.saved.clientId||SCOPES.some(s=>!info.scopes.includes(s))){this.invalidate('Права Twitch изменились. Войдите снова.');throw publicError(this.message);}
    this.validatedAt=this.now();
  }
  logout(){this.cancel();this.authGeneration++;this.loading=null;this.provider=null;this.invalid=false;this.saved=null;this.persist(null);this.message='Вы вышли из аккаунта';this.emit('change');}
  dispose(){this.cancel();this.authGeneration++;this.removeAllListeners();}
}
module.exports={TwitchAuth,SCOPES,clientId,loadSdk,errorCode,safeError,publicError,verificationUrl};
