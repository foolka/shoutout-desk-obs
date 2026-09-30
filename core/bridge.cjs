const {EventEmitter}=require('node:events');
const {randomUUID,createHash}=require('node:crypto');
const ACTION_ID='2d917fc2-2ed3-44b1-a9fc-2d7f6b1a9a82';
function authHash(password,{salt,challenge}) {
  const secret=createHash('sha256').update(password+salt).digest('base64');
  return createHash('sha256').update(secret+challenge).digest('base64');
}
class Bridge extends EventEmitter {
  constructor(config,WebSocketImpl=WebSocket) { super();this.config=config;this.WebSocketImpl=WebSocketImpl;this.pending=new Map();this.results=new Map();this.closed=false; }
  connect() {
    if(this.closed) return;
    this.lastError='';
    const ws=this.ws=new this.WebSocketImpl(this.config.url);
    const helloTimer=setTimeout(()=>ws.close(),12000);
    ws.addEventListener('message',async e=>{
      let msg;try{msg=JSON.parse(String(e.data));}catch{return;}
      if(this.closed||this.ws!==ws)return;
      if(msg.request==='Hello') {
        clearTimeout(helloTimer);
        try {
          if(msg.authentication) await this.request('Authenticate',{authentication:authHash(this.config.password||'',msg.authentication)});
          const actions=await this.request('GetActions');
          if(!actions.actions?.some(a=>a.id===ACTION_ID && a.enabled)) throw Error('Нажмите «Настроить Streamer.bot»: связка не установлена.');
          await this.request('Subscribe',{events:{Twitch:['ChatMessage','StreamOnline','StreamOffline','ShoutoutCreated','Raid'],General:['Custom']}});
          if(!this.closed&&this.ws===ws)this.emit('ready');
        } catch(error) {this.lastError=error.message;this.emit('status',error.message);ws.close();}
      }
      if(msg.id && this.pending.has(msg.id)) {
        const task=this.pending.get(msg.id);this.pending.delete(msg.id);clearTimeout(task.timer);
        msg.status==='error'?task.reject(Error(msg.error||'Streamer.bot отклонил запрос')):task.resolve(msg);
      }
      const data=msg.data;
      if(data?.app==='ShoutoutDesk' && data.version===1 && this.results.has(data.requestId)) {
        const task=this.results.get(data.requestId);this.results.delete(data.requestId);clearTimeout(task.timer);task.resolve(data);
      }
      if(msg.event?.source==='Twitch') this.emit('event',msg.event.type,data||{});
    });
    ws.addEventListener('error',()=>this.emit('status',this.lastError || 'Ожидание Streamer.bot'));
    ws.addEventListener('close',()=>{
      clearTimeout(helloTimer);
      for(const map of [this.pending,this.results]) {for(const task of map.values()){clearTimeout(task.timer);task.reject(Error('Связь потеряна'));}map.clear();}
      this.emit('offline',this.lastError);
      if(!this.closed) this.reconnect=setTimeout(()=>this.connect(),5000);
    });
  }
  request(request,fields={}) {
    return new Promise((resolve,reject)=>{
      if(this.ws?.readyState!==1) return reject(Error('Streamer.bot не подключён'));
      const id=randomUUID();const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Нет ответа Streamer.bot'));},12000);
      this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({request,id,...fields}));
    });
  }
  call(op,args={}) {
    if(op==='send'&&args.canSend&&!args.canSend())return Promise.resolve({status:'cancelled',detail:'Шотаут уже сделан в канале или очередь отменена'});
    return new Promise((resolve,reject)=>{
      const requestId=randomUUID();
      const timer=setTimeout(()=>{this.results.delete(requestId);reject(Error('Нет ответа от связки'));},25000);
      this.results.set(requestId,{resolve,reject,timer});
      this.request('DoAction',{action:{id:ACTION_ID},args:{sd_op:op,sd_request:requestId,sd_key:this.config.secret,sd_operation:args.operationId||'',sd_login:args.login||'',sd_account:args.account||''}}).catch(error=>{
        clearTimeout(timer);this.results.delete(requestId);reject(error);
      });
    });
  }
  reset(reason='') {this.lastError=reason;this.ws?.close();}
  close() {this.closed=true;clearTimeout(this.reconnect);this.ws?.close();}
}
module.exports={Bridge,authHash,ACTION_ID};
