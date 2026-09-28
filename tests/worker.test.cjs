const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const {once}=require('node:events');
test('real worker IPC starts offline, accepts edits, exports no tokens, and exits on parent EOF',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-worker-'));
  const child=spawn(process.execPath,[path.resolve(__dirname,'../worker.cjs'),dir,path.resolve(__dirname,'../build/Release/shoutout-secure.exe'),'--offline-demo'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let id=0,state;const pending=new Map();let resolveReady;const ready=new Promise(r=>resolveReady=r);
  readline.createInterface({input:child.stdout}).on('line',line=>{
    const message=JSON.parse(line);if(message.event==='state'){state=message.data;resolveReady(state);}
    if(message.event==='fatal')for(const p of pending.values())p.reject(Error(message.error));
    const request=pending.get(message.id);if(request){pending.delete(message.id);message.error?request.reject(Error(message.error)):request.resolve(message.result);}
  });
  child.stderr.resume();
  const request=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});child.stdin.write(JSON.stringify({id:n,method,params})+'\n');});
  t.after(()=>{child.kill();fs.rmSync(dir,{recursive:true,force:true});});
  await ready;assert.equal(state.demo,true);assert.equal(state.connected,false);assert.equal(state.prefs.enabled,true);
  await request('add',{login:'another_person'});state=await request('state');assert.ok(state.people.some(p=>p.login==='another_person'));
  await request('remove',{login:'another_person'});state=await request('state');assert.ok(!state.people.some(p=>p.login==='another_person'));
  await request('prefs',{cooldownHours:14});assert.equal((await request('state')).prefs.cooldownHours,14);
  await request('prefs',{resetAfterLongClose:true});assert.equal((await request('state')).prefs.resetAfterLongClose,true);
  const before=(await request('state')).people;assert.ok(before.find(p=>p.login==='riverstudio').nextAt>0);
  await request('resetCooldowns');assert.equal((await request('state')).people.find(p=>p.login==='riverstudio').nextAt,0);
  await assert.rejects(request('prefs',{role:'moderator'}));await assert.rejects(request('login'));
  const file=path.join(dir,'export.json');await request('export',{path:file});assert.ok(!fs.readFileSync(file,'utf8').includes('accessToken'));
  const exit=once(child,'exit');child.stdin.end();const [code]=await exit;assert.equal(code,0);
},{timeout:10000});

test('each worker startup enables auto-shoutouts but keeps cooldowns and cancels old queue',async t=>{
  const {Store}=require('../core/store.cjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-restart-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new Store(path.join(dir,'shoutouts.sqlite')),account='999001',stamp=Date.now()-1000;
  store.rememberAccount(account,'demo_channel');store.add('saved_person');store.add('queued_person');
  store.observeShoutout(account,'saved_person',stamp);store.enqueue(account,'queued_person');store.setPrefs({enabled:false});store.close();
  for(let run=0;run<2;run++){
    const child=spawn(process.execPath,[path.resolve(__dirname,'../worker.cjs'),dir,path.resolve(__dirname,'../build/Release/shoutout-secure.exe'),'--offline-demo'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const messages=readline.createInterface({input:child.stdout}),exit=once(child,'exit');child.stderr.resume();
    try{
      const state=await new Promise((resolve,reject)=>messages.on('line',line=>{
        const value=JSON.parse(line);if(value.event==='state')resolve(value.data);if(value.event==='fatal')reject(Error(value.error));
      }));
      assert.equal(state.prefs.enabled,true);assert.equal(state.connected,false);
      assert.equal(state.people.find(p=>p.login==='saved_person').lastAt,stamp);assert.equal(state.queue,0);
      const paused=new Promise((resolve,reject)=>messages.on('line',line=>{const value=JSON.parse(line);if(value.id===1)value.error?reject(Error(value.error)):resolve(value.result);}));
      child.stdin.write(JSON.stringify({id:1,method:'prefs',params:{enabled:false}})+'\n');
      assert.equal((await paused).enabled,false);
    } finally {child.stdin.end();assert.equal((await exit)[0],0);}
  }
},{timeout:10000});
