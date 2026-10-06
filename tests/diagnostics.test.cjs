const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store}=require('../core/store.cjs');
const {Diagnostics,buildReport,uploadReport,ENDPOINT}=require('../core/diagnostics.cjs');
const {validReport}=require('../core/diagnostic-schema.cjs');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-diagnostics-'));
  let now=Date.now();const store=new Store(path.join(root,'shoutouts.sqlite'),()=>now);
  store.rememberAccount('123','test_channel');store.add('private_person');
  t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
  const options=()=>({root,product:'obs',version:'0.3.4',hours:24,now});
  return {root,store,options,advance:ms=>now+=ms,now:()=>now};
}
test('report only includes selected channel/period, pseudonyms and allowlisted fields; database unchanged',t=>{
  const f=fixture(t),s=f.store;
  const old=s.enqueue('123','private_person');s.finish(old,'sent','access_token=very_private_secret',f.now()-2*86400000);
  s.db.prepare('UPDATE attempts SET created_at=? WHERE id=?').run(f.now()-2*86400000,old);
  s.observeShoutout('123','another_private_person',f.now()-10000);
  s.add('foreign_person','999');const other=s.enqueue('999','foreign_person');s.finish(other,'failed','secret_foreign');
  s.add('current_person');const current=s.enqueue('123','current_person');s.finish(current,'failed','OAuth token never send this');
  const before=JSON.stringify(s.db.prepare('SELECT * FROM attempts').all());
  const report=buildReport(f.options()),serialized=JSON.stringify(report);
  assert(validReport(report));assert.equal(report.events.length,2);
  for(const secret of ['private_person','current_person','foreign_person','token','OAuth','very_private_secret','secret_foreign'])assert(!serialized.includes(secret));
  assert.equal(before,JSON.stringify(s.db.prepare('SELECT * FROM attempts').all()));
  assert.notEqual(report.events[0].subject,buildReport(f.options()).events[0].subject);
});
test('local capture records state/queue transitions and never stores OAuth or chat text',t=>{
  const f=fixture(t),log=new Diagnostics(f.root,f.now);
  const id=f.store.enqueue('123','private_person');
  const state={prefs:{provider:'direct',enabled:true,cooldownHours:24},auth:{status:'retrying',accessToken:'secret_value'},connected:false,live:false,people:[{}],history:f.store.history('123'),message:'SECRET_CHAT'};
  log.capture('123',state);f.advance(1000);f.store.finish(id,'sent');
  log.capture('123',{...state,connected:true,live:true,history:f.store.history('123')});
  const report=buildReport(f.options());
  assert(report.events.some(e=>e.type==='connection'&&e.status==='connected'));
  assert(report.events.some(e=>e.type==='auth'&&e.status==='retrying'));
  assert(report.events.some(e=>e.type==='attempt'&&e.status==='sent'));
  const files=fs.readdirSync(path.join(f.root,'diagnostics'));
  const text=fs.readFileSync(path.join(f.root,'diagnostics',files[0]),'utf8');
  assert(!text.includes('secret_value'));assert(!text.includes('SECRET_CHAT'));
  assert(!JSON.stringify(report).includes('private_person'));
});
test('worker failure logs only contribute safe codes; report works without the worker',t=>{
  const f=fixture(t);
  fs.writeFileSync(path.join(f.root,'worker-process.log'),JSON.stringify({time:new Date(f.now()).toISOString(),reason:'FILES_MISSING',secret:'DO_NOT_SEND'})+'\n'+JSON.stringify({time:new Date(f.now()).toISOString(),reason:'SECRET_CODE'})+'\n');
  const r=buildReport(f.options());assert(r.events.some(e=>e.reason==='FILES_MISSING'));assert(!JSON.stringify(r).includes('SECRET'));
});
test('invalid period or missing channel cannot send a report',t=>{
  const f=fixture(t);assert.throws(()=>buildReport({...f.options(),hours:2}),/invalid_period/);
  assert.throws(()=>buildReport({...f.options(),account:{id:'999',channel:''}}),/channel_required/);
});
test('strict schema rejects unexpected fields, script content and credentials at every level',t=>{
  const f=fixture(t);f.store.enqueue('123','private_person');const report=buildReport(f.options());
  for(const edit of [r=>r.token='secret',r=>r.state.token='secret',r=>r.events[0].detail='secret',r=>r.channel='<script>',r=>r.channel=['test'],r=>r.events[0].reason='secret']){
    const copy=structuredClone(report);edit(copy);assert.equal(validReport(copy),false);
  }
});
test('upload has fixed HTTPS destination, no credentials, no redirects and stable id',async t=>{
  const f=fixture(t),r=buildReport(f.options());let count=0;
  const request=async(url,options)=>{count++;assert.equal(url,ENDPOINT);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.deepEqual(Object.keys(options.headers),['content-type']);assert.deepEqual(JSON.parse(options.body),r);return new Response(JSON.stringify({id:r.id}));};
  assert.deepEqual(await uploadReport(r,{fetch:request}),{id:r.id});assert.deepEqual(await uploadReport(r,{fetch:request}),{id:r.id});assert.equal(count,2);
  await assert.rejects(uploadReport(r,{fetch:async()=>new Response('{}',{status:429})}),/rate_limited/);
  await assert.rejects(uploadReport(r,{fetch:async()=>new Response('x'.repeat(3000))}),/invalid_response/);
});
