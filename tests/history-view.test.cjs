const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../core/store.cjs');
const {DatabaseSync}=require('node:sqlite');
test('stored Twitch events appear in history without fabricating local attempts',()=>{
  const now=1800000000000,s=new Store(':memory:',()=>now);
  try{s.observeShoutout('owner','guest',now-1000);s.observeShoutout('other','private',now-1000);
    const rows=s.displayHistory('owner');assert.equal(rows.length,1);assert.equal(rows[0].login,'guest');assert.equal(rows[0].status,'twitchConfirmed');
    assert.equal(s.history('owner').length,0);s.resetCooldowns('owner');assert.equal(s.displayHistory('owner').length,1);
  }finally{s.close();}
});
test('local successful shoutout and Twitch confirmation are one visible entry',()=>{
  const now=1800000000000,s=new Store(':memory:',()=>now);
  try{s.add('guest','owner');const id=s.enqueue('owner','guest');s.take('owner');s.finish(id,'sent','',now+1500);s.observeShoutout('owner','guest',now);
    assert.equal(s.displayHistory('owner').length,1);assert.equal(s.displayHistory('owner')[0].id,id);
    s.observeShoutout('owner','guest',now-3600000);assert.equal(s.displayHistory('owner').length,2);
  }finally{s.close();}
});
test('checkpoint persists recent events and session metadata in the main file',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-checkpoint-')),file=path.join(dir,'db.sqlite'),s=new Store(file);
  try{s.add('kept','owner');s.observeShoutout('owner','kept',Date.now());s.setMeta('obsSession',{lastSeenAt:Date.now()});s.checkpoint();
    const copy=path.join(dir,'main-file.sqlite');fs.copyFileSync(file,copy);const db=new DatabaseSync(copy,{readOnly:true});
    try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(db.prepare('SELECT COUNT(*) n FROM observed_shoutouts').get().n,1);assert.ok(db.prepare("SELECT value FROM preferences WHERE key='obsSession'").get());}finally{db.close();}
  }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
