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
  await ready;assert.equal(state.demo,true);assert.equal(state.connected,false);assert.equal(state.prefs.enabled,false);
  await request('add',{login:'another_person'});state=await request('state');assert.ok(state.people.some(p=>p.login==='another_person'));
  await request('remove',{login:'another_person'});state=await request('state');assert.ok(!state.people.some(p=>p.login==='another_person'));
  await request('prefs',{cooldownHours:14});assert.equal((await request('state')).prefs.cooldownHours,14);
  await assert.rejects(request('prefs',{role:'moderator'}));await assert.rejects(request('login'));
  const file=path.join(dir,'export.json');await request('export',{path:file});assert.ok(!fs.readFileSync(file,'utf8').includes('accessToken'));
  const exit=once(child,'exit');child.stdin.end();const [code]=await exit;assert.equal(code,0);
},{timeout:10000});
