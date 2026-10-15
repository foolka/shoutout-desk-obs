const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const {normalizeLogin}=require('../store.cjs');
const {DEFAULT_STYLE,DEFAULT_PERSON,EFFECTS,FONTS,DESIGNS,PALETTES,PALETTE_FIELDS,style,person}=require('./config.cjs');
const WIDTH=560,HEIGHT=560;
const same=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function avatar(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='static-cdn.jtvnw.net'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
class Badges {
  constructor({store,account,profile=async()=>null,port=18771,now=Date.now,onChange=()=>{}}){
    Object.assign(this,{store,account,profile,port,now,onChange});
    this.adminToken=randomBytes(32).toString('hex');
    this.overlayToken=store.meta('badges:overlayToken','');
    if(!/^[a-f0-9]{64}$/.test(this.overlayToken)){this.overlayToken=randomBytes(32).toString('hex');store.setMeta('badges:overlayToken',this.overlayToken);}
    this.cache=new Map();this.queue=[];this.current=null;this.pending=Promise.resolve();this.closed=false;
  }
  config(account=this.account()){
    const value=this.store.meta('badges:config:'+account,{});
    return {enabled:value.enabled!==false,style:style(value.style),people:Object.assign(Object.create(null),value.people||{})};
  }
  member(login,account=this.account()){return !!this.store.db.prepare('SELECT 1 FROM channel_people WHERE account=? AND login=? AND active=1').get(account,login);}
  rule(login,account=this.account()){const config=this.config(account),saved=config.people[login];return {...DEFAULT_PERSON,...saved,style:saved?.style?style(saved.style):config.style};}
  save(body){
    if(String(body.account)!==this.account())throw Error('Канал изменился. Откройте настройки заново.');
    const config=this.config();
    if(body.login){const login=normalizeLogin(body.login);if(!this.member(login))throw Error('Стример больше не в списке.');config.people[login]=person(body.person,config.people[login]?.style||config.style);}
    else {if(typeof body.enabled!=='boolean')throw Error('Некорректный переключатель.');config.enabled=body.enabled;config.style=style(body.style,config.style);}
    this.store.setMeta('badges:config:'+this.account(),config);this.onChange();return this.view();
  }
  info(){return {ready:!!this.server?.listening,error:this.error||'',width:WIDTH,height:HEIGHT,url:this.server?.listening?this.origin+'/overlay/'+this.overlayToken:''};}
  editor(login=''){if(!this.server?.listening)throw Error(this.error||'Источник ещё запускается.');return this.origin+'/editor#'+new URLSearchParams({key:this.adminToken,login}).toString();}
  view(){return {...this.info(),account:this.account(),config:this.config(),people:this.store.people(this.account()).map(p=>({login:p.login,...this.rule(p.login)})),effects:EFFECTS,exitEffects:EFFECTS,fonts:FONTS,designs:DESIGNS,paletteDefaults:PALETTES,paletteFields:PALETTE_FIELDS,defaults:DEFAULT_STYLE};}
  async identity(login){
    const key=this.account()+':'+login,cached=this.cache.get(key);
    if(cached&&cached.until>this.now())return cached.value;
    let timer,value;
    try{value=await Promise.race([this.profile(login),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2500);timer.unref?.();})]);}catch{}finally{clearTimeout(timer);}
    const result={login,name:String(value?.displayName||login).slice(0,40),avatar:avatar(value?.avatarUrl)};
    this.cache.set(key,{until:this.now()+(result.avatar?6*3600000:60000),value:result});return result;
  }
  confirm({account,login,stamp=this.now(),profile}){
    if(this.closed||account!==this.account()||!Number.isFinite(stamp)||stamp<this.now()-60000||stamp>this.now()+5000)return;
    try{login=normalizeLogin(login);if(!this.member(login,account)||!this.config(account).enabled||!this.rule(login,account).enabled)return;
      const key='badges:last:'+account+':'+login,last=this.store.meta(key,0);
      if(stamp<=last+30000)return;
      this.store.setMeta(key,stamp);
      if(profile)this.cache.set(account+':'+login,{until:this.now()+6*3600000,value:{login,name:String(profile.displayName||login).slice(0,40),avatar:avatar(profile.avatarUrl)}});
      this.pending=this.pending.then(()=>this.enqueue(login,false,account)).catch(()=>{});
    }catch{ /* A visual failure must never change the shoutout queue. */ }
  }
  async test(login,account=this.account()){
    login=normalizeLogin(login);if(account!==this.account()||!this.member(login))throw Error('Выберите стримера из списка.');
    if(this.queue.filter(x=>x.test).length>=5)throw Error('Дождитесь завершения тестовых плашек.');
    await this.enqueue(login,true,account);return {ok:true};
  }
  async enqueue(login,test,account){
    const identity=await this.identity(login);
    if(this.closed||account!==this.account()||!this.member(login,account))return;
    const config=this.config(account),rule=this.rule(login,account);
    if(!test&&(!config.enabled||!rule.enabled))return;
    if(this.queue.length>=30)return;
    this.queue.push({...identity,account,test,description:rule.description,style:rule.custom?rule.style:config.style,id:randomUUID(),queuedAt:this.now()});this.frame();
  }
  allowed(item){return item.account===this.account()&&this.member(item.login,item.account)&&(item.test||(this.config().enabled&&this.rule(item.login).enabled));}
  frame(){
    const now=this.now();
    if(this.current&&(now>=this.current.endsAt||!this.allowed(this.current)))this.current=null;
    if(!this.current){
      let next;while((next=this.queue.shift())){if(!this.allowed(next)||now-next.queuedAt>120000)continue;this.current={...next,startsAt:now,endsAt:now+next.style.duration*1000+950};break;}
    }
    return {now,event:this.current};
  }
  async start(){
    this.server=http.createServer((req,res)=>void this.handle(req,res).catch(()=>{if(!res.headersSent)this.json(res,500,{error:'Ошибка источника.'});else res.destroy();}));
    this.server.requestTimeout=5000;this.server.headersTimeout=5000;this.server.maxConnections=32;
    try{await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.port,'127.0.0.1',resolve);});}
    catch{this.error='Не удалось запустить бейджики: порт '+this.port+' занят или недоступен. Закройте вторую копию приложения.';throw Error(this.error);}
    this.server.on('error',()=>{this.error='Ошибка локального источника бейджиков.';});
    this.origin='http://127.0.0.1:'+this.server.address().port;
    this.timer=setInterval(()=>this.frame(),200);this.timer.unref();return this.info();
  }
  json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
  async body(req){let text='';for await(const part of req){text+=part;if(Buffer.byteLength(text)>32768)throw Error('Запрос слишком большой.');}return JSON.parse(text);}
  async handle(req,res){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://static-cdn.jtvnw.net; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
    if(req.headers.host!==this.origin?.slice(7))return this.json(res,403,{error:'Неверный адрес.'});
    const url=new URL(req.url,this.origin),route=url.pathname;
    if(req.headers.origin&&req.headers.origin!==this.origin)return this.json(res,403,{error:'Чужой источник запроса.'});
    if(route==='/api/view/'+this.overlayToken&&req.method==='GET')return this.json(res,200,this.frame());
    if(route.startsWith('/api/')){
      if(!same(req.headers.authorization,'Bearer '+this.adminToken))return this.json(res,401,{error:'Откройте «Бейджики» из приложения.'});
      try{
        if(route==='/api/config'&&req.method==='GET')return this.json(res,200,this.view());
        if(route==='/api/profile'&&req.method==='GET'){const login=normalizeLogin(url.searchParams.get('login'));if(!this.member(login))throw Error('Стример не найден.');return this.json(res,200,await this.identity(login));}
        if(route==='/api/config'&&req.method==='POST')return this.json(res,200,this.save(await this.body(req)));
        if(route==='/api/test'&&req.method==='POST'){const body=await this.body(req);if(typeof body.account!=='string')throw Error('Канал не указан.');return this.json(res,200,await this.test(body.login,body.account));}
      }catch(error){return this.json(res,400,{error:error.message});}
      return this.json(res,404,{error:'Не найдено.'});
    }
    const files={'/editor':'editor.html','/editor.js':'editor.js','/editor.css':'editor.css','/render.js':'render.js','/badge.css':'badge.css','/stamp-ink.png':'stamp-ink.png','/overlay.js':'overlay.js','/icons.js':'icons.js'};
    if(route==='/overlay/'+this.overlayToken)files[route]='overlay.html';
    if(!files[route]||req.method!=='GET')return this.json(res,404,{error:'Не найдено.'});
    const file=files[route],type=file.endsWith('.png')?'image/png':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript';
    res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(fs.readFileSync(path.join(__dirname,'web',file)));
  }
  close(){this.closed=true;clearInterval(this.timer);this.queue=[];this.current=null;this.server?.closeAllConnections();this.server?.close();}
}
module.exports={Badges,WIDTH,HEIGHT};
