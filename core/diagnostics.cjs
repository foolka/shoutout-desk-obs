const fs=require('node:fs');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {HOURS,MAX_BYTES,MAX_EVENTS,AUTH,STATUS,REASONS,validReport}=require('./diagnostic-schema.cjs');
const ENDPOINT='https://fermionaplay.win/api/diagnostics/reports';
const DAY=86400000, FILE_LIMIT=262144;
const bounded=(n,min,max)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Math.trunc(Number(n)))):min;
function safeState(value={}) {
  const prefs=value.prefs||{},auth=value.auth||value.direct||{};
  const health=auth.reauthRequired?'reauth_required':auth.status;
  return {provider:prefs.provider==='bot'?'bot':'direct',connected:!!value.connected,live:!!value.live,
    enabled:prefs.enabled!==false,auth:AUTH.includes(health)?health:'unknown',
    queue:bounded(value.queue??value.history?.filter(e=>['queued','sending'].includes(e.status)).length,0,100000),
    people:bounded(value.people?.length,0,100000),cooldownHours:bounded(prefs.cooldownHours||24,1,168)};
}
function event(at,type,status,subject='',reason='none',tries=0,retryAt=0){return {at,type,status,subject,reason,tries,retryAt};}
function reason(detail){
  const text=String(detail||'');
  if(/таймаут|cooldown/i.test(text))return 'cooldown';
  if(/устарело/i.test(text))return 'expired';
  if(/удал[её]н/i.test(text))return 'removed';
  if(/перезапуск/i.test(text))return 'restart';
  if(/пауз|выключен/i.test(text))return 'paused';
  if(/не в эфире/i.test(text))return 'offline';
  if(/уже сделан/i.test(text))return 'already_sent';
  if(/429|лимит/i.test(text))return 'rate_limit';
  if(/ответ|timeout/i.test(text))return 'timeout';
  if(/подключен/i.test(text))return 'connection';
  return text?'other':'none';
}
class Diagnostics {
  constructor(root,now=Date.now){this.root=root;this.now=now;this.previous=new Map();this.attempts=new Map();}
  capture(account,value){
    if(!/^\d{1,30}$/.test(String(account||'')))return;
    const state=safeState(value),old=this.previous.get(account),at=this.now();
    const before=this.attempts.get(account),history=new Map(),changes=[];
    for(const row of value.history||[]){
      const stamp=JSON.stringify([row.status,row.tries,row.retry_at,row.detail]);history.set(row.id,stamp);
      if(before&&before.get(row.id)!==stamp)changes.push({at,account:String(account),event:event(at,'attempt',STATUS.includes(row.status)?row.status:'unknown',String(row.login),reason(row.detail),bounded(row.tries,0,100000),bounded(row.retry_at,0,at+7*DAY))});
    }
    this.attempts.set(account,history);
    if(old&&JSON.stringify(old.state)===JSON.stringify(state)&&at-old.at<300000&&!changes.length)return;
    const dir=path.join(this.root,'diagnostics');
    try{
      fs.mkdirSync(dir,{recursive:true});
      for(const name of fs.readdirSync(dir))if(/^\d{4}-\d\d-\d\d\.jsonl$/.test(name)&&Date.parse(name.slice(0,10))<at-8*DAY)fs.unlinkSync(path.join(dir,name));
      const file=path.join(dir,new Date(at).toISOString().slice(0,10)+'.jsonl');
      let remaining=FILE_LIMIT-(fs.existsSync(file)?fs.statSync(file).size:0);
      for(const row of [{at,account:String(account),state},...changes]){
        const line=JSON.stringify(row)+'\n',size=Buffer.byteLength(line);
        if(size>remaining)break;
        fs.appendFileSync(file,line);remaining-=size;
      }
      this.previous.set(account,{state,at});
    }catch{/* Diagnostics must never interrupt shoutouts. */}
  }
}
function readLines(file,limit=FILE_LIMIT){
  try{if(fs.statSync(file).size>limit+4096)return [];return fs.readFileSync(file,'utf8').split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}}).filter(Boolean);}catch{return [];}
}
function buildReport({root,product,version,hours,account,current,now=Date.now()}){
  if(!HOURS.includes(hours))throw Error('invalid_period');
  const id=randomUUID(),from=now-hours*3600000,events=[];
  let db,chosen=account,state=safeState(current),availableFrom=now,truncated=false;
  const subject=login=>'u_'+createHash('sha256').update(id+'\0'+String(login)).digest('hex').slice(0,12);
  try{
    db=new DatabaseSync(path.join(root,'shoutouts.sqlite'),{readOnly:true});
    db.exec('PRAGMA busy_timeout=1000');
    const meta=(key,fallback)=>{try{const row=db.prepare('SELECT value FROM preferences WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;}catch{return fallback;}};
    chosen=chosen||meta('lastAccount',{});
    if(!current)state=safeState({prefs:{provider:meta('provider','direct'),enabled:meta('enabled',true),cooldownHours:meta('cooldownHours',24)}});
    const rows=db.prepare('SELECT login,created_at,started_at,finished_at,status,detail,tries,retry_at FROM attempts WHERE account=? AND MAX(created_at,COALESCE(started_at,0),COALESCE(finished_at,0))>=? ORDER BY created_at DESC LIMIT ?').all(String(chosen.id||''),from,MAX_EVENTS+1);
    for(const row of rows){
      const at=Math.max(row.created_at,row.started_at||0,row.finished_at||0);
      if(at<=now)events.push(event(at,'attempt',STATUS.includes(row.status)?row.status:'unknown',subject(row.login),reason(row.detail),bounded(row.tries,0,100000),bounded(row.retry_at,0,now+7*DAY)));
    }
    const confirmed=db.prepare('SELECT login,stamp FROM observed_shoutouts WHERE account=? AND stamp BETWEEN ? AND ? ORDER BY stamp DESC LIMIT ?').all(String(chosen.id||''),from,now,MAX_EVENTS+1);
    for(const row of confirmed)events.push(event(row.stamp,'confirmation','confirmed',subject(row.login)));
    if(!current){state.people=db.prepare('SELECT COUNT(*) AS n FROM channel_people WHERE account=? AND active=1').get(String(chosen.id||'')).n;state.queue=db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE account=? AND status IN ('queued','sending')").get(String(chosen.id||'')).n;}
  }catch{events.push(event(now,'diagnostic','unknown','','HISTORY_UNAVAILABLE'));}
  finally{db?.close();}
  const channel=String(chosen?.channel||chosen?.login||'').toLowerCase();
  if(!/^[a-z0-9_]{1,25}$/.test(channel))throw Error('channel_required');
  const dir=path.join(root,'diagnostics');let logs=[];
  try{
    for(const name of fs.readdirSync(dir).filter(n=>/^\d{4}-\d\d-\d\d\.jsonl$/.test(n))){
      const file=path.join(dir,name);
      if(Date.parse(name.slice(0,10))+DAY<from)continue;
      if(fs.statSync(file).size>=FILE_LIMIT-4096)truncated=true;
      logs.push(...readLines(file).filter(row=>row.account===String(chosen.id)&&row.at>=from&&row.at<=now));
    }
  }catch{}
  logs.sort((a,b)=>a.at-b.at);let previous;
  for(const row of logs){
    if(row.event){
      const e=row.event;
      events.push(event(row.at,'attempt',STATUS.includes(e.status)?e.status:'unknown',subject(e.subject),REASONS.includes(e.reason)?e.reason:'other',bounded(e.tries,0,100000),bounded(e.retryAt,0,now+7*DAY)));
      continue;
    }
    // Re-project local data too: edited files must not become a secret-exfiltration path.
    const s=safeState({prefs:row.state,auth:{status:row.state?.auth},connected:row.state?.connected,live:row.state?.live});
    availableFrom=Math.min(availableFrom,row.at);
    for(const [key,type,yes,no] of [['connected','connection','connected','disconnected'],['live','stream','live','offline'],['enabled','automation','enabled','paused'],['auth','auth']]){
      if(!previous||previous[key]!==s[key])events.push(event(row.at,type,key==='auth'?s[key]:s[key]?yes:no));
    }
    previous=s;
  }
  // With no running worker, old connection samples are history, not current health.
  if(product==='obs')for(const name of ['worker-process.log','worker-process.log.previous','worker-diagnostic.log','worker-diagnostic.log.previous']){
    for(const row of readLines(path.join(root,name),140000)){
      const at=Date.parse(row.time),code=row.reason||row.code;
      if(at>=from&&at<=now&&REASONS.includes(code))events.push(event(at,'worker','failed','',code));
    }
  }
  events.sort((a,b)=>b.at-a.at);
  truncated ||= events.length>MAX_EVENTS;
  const report={schema:1,id,product,version,channel,hours,from,to:now,availableFrom,truncated,state,events:events.slice(0,MAX_EVENTS)};
  if(!validReport(report,now)||Buffer.byteLength(JSON.stringify(report))>MAX_BYTES)throw Error('invalid_report');
  return report;
}
async function uploadReport(report,{fetch:request=globalThis.fetch}={}){
  if(!validReport(report)||Buffer.byteLength(JSON.stringify(report))>MAX_BYTES)throw Error('invalid_report');
  let response;
  try{response=await request(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(report),redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});}catch{throw Error('network_error');}
  if(!response.ok)throw Error(response.status===429?'rate_limited':response.status===413?'report_too_large':'upload_failed');
  let body='';
  for await(const chunk of response.body){body+=Buffer.from(chunk).toString('utf8');if(body.length>2048)throw Error('invalid_response');}
  let result;try{result=JSON.parse(body);}catch{throw Error('invalid_response');}
  if(result.id!==report.id)throw Error('invalid_response');
  return {id:report.id};
}
module.exports={Diagnostics,buildReport,uploadReport,safeState,ENDPOINT};
