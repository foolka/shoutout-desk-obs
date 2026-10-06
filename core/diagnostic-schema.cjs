const HOURS = [1, 24, 168];
const MAX_BYTES = 524288;
const MAX_EVENTS = 1800;
const AUTH = ['unknown','signed_out','restoring','ready','authorizing','retrying','reauth_required'];
const STATUS = ['unknown','queued','sending','sent','failed','uncertain','cancelled','confirmed',
  'connected','disconnected','live','offline','enabled','paused',...AUTH];
const REASONS = ['none','cooldown','expired','removed','restart','paused','offline','connection',
  'already_sent','rate_limit','timeout','other','FILES_MISSING','PROFILE_ACCESS','PROFILE_LOCKED',
  'PROFILE_DATABASE','PROFILE_INVALID','WORKER_CRASH','LAUNCH_FAILED','PROCESS_EXIT','HISTORY_UNAVAILABLE','LOG_LIMIT'];
function exact(value, keys) {
  return value && typeof value==='object' && !Array.isArray(value) &&
    Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
}
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function validReport(r, now=Date.now()) {
  if(!exact(r,['schema','id','product','version','channel','hours','from','to','availableFrom','truncated','state','events']))return false;
  if(r.schema!==1||typeof r.id!=='string'||!/^\w{8}-\w{4}-4\w{3}-[89ab]\w{3}-\w{12}$/.test(r.id)||!/^[a-z0-9-]+$/.test(r.id))return false;
  if(!['desktop','obs'].includes(r.product)||typeof r.version!=='string'||typeof r.channel!=='string'||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r.version)||!/^[a-z0-9_]{1,25}$/.test(r.channel))return false;
  if(!HOURS.includes(r.hours)||!integer(r.to,1577836800000,now+300000)||r.from!==r.to-r.hours*3600000)return false;
  if(!integer(r.availableFrom,r.from,r.to)||typeof r.truncated!=='boolean')return false;
  const s=r.state;
  if(!exact(s,['provider','connected','live','enabled','auth','queue','people','cooldownHours']))return false;
  if(!['direct','bot'].includes(s.provider)||!AUTH.includes(s.auth)||!['connected','live','enabled'].every(k=>typeof s[k]==='boolean'))return false;
  if(!integer(s.queue,0,100000)||!integer(s.people,0,100000)||!integer(s.cooldownHours,1,168))return false;
  if(!Array.isArray(r.events)||r.events.length>MAX_EVENTS)return false;
  return r.events.every(e=>exact(e,['at','type','status','subject','reason','tries','retryAt']) &&
    integer(e.at,r.from,r.to) && ['attempt','confirmation','connection','stream','automation','auth','worker','diagnostic'].includes(e.type) &&
    STATUS.includes(e.status) && typeof e.subject==='string' && (e.subject===''||/^u_[a-f0-9]{12}$/.test(e.subject)) && REASONS.includes(e.reason) &&
    integer(e.tries,0,100000) && integer(e.retryAt,0,r.to+604800000));
}
module.exports={HOURS,MAX_BYTES,MAX_EVENTS,AUTH,STATUS,REASONS,validReport};
