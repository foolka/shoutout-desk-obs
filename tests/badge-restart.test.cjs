const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store}=require('../core/store.cjs'),{Badges}=require('../core/badges/service.cjs');
const {style}=require('../core/badges/config.cjs'),{prepareProfile}=require('../core/vault.cjs');
test('upgrade and repeated restarts keep old and newly edited descriptions, themes and source token',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shoutout-badge-upgrade-')),file=path.join(dir,'shoutouts.sqlite');
  t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('shoutout-badge-upgrade-'));fs.rmSync(dir,{recursive:true,force:true});});
  let store=new Store(file),badges=new Badges({store,account:()=> 'owner'});
  const snapshot=()=>Object.fromEntries(['channel_people','attempts','observed_shoutouts'].map(table=>[table,store.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
  let expected,original,token;
  try{
    store.rememberAccount('owner','demo_channel');store.add('aurora_live');store.add('pixel_cook');
    store.observeShoutout('owner','aurora_live',Date.now());
    badges.save({account:'owner',login:'aurora_live',person:{enabled:true,custom:true,description:'Existing personal description',style:style({design:'sticker',stampPosition:'top-left',exitEffect:'up'})}});
    badges.save({account:'owner',login:'pixel_cook',person:{enabled:false,custom:false,description:'New description entered before upgrade',style:style()}});
    expected=JSON.stringify(badges.config());original=snapshot();token=badges.overlayToken;
  }finally{badges.close();store.close();}
  await prepareProfile(dir,require('../package.json').version);
  const backups=fs.readdirSync(path.join(dir,'backups'));assert.equal(backups.length,1);
  const backup=path.join(dir,'backups',backups[0]);
  const backupStore=new Store(path.join(backup,'shoutouts.sqlite'));try{assert.equal(JSON.stringify(backupStore.meta('badges:config:owner')),expected);assert.equal(backupStore.meta('badges:overlayToken'),token);}finally{backupStore.close();}
  for(let i=0;i<3;i++){
    store=new Store(file);badges=new Badges({store,account:()=> 'owner'});
    try{assert.equal(badges.overlayToken,token);assert.equal(JSON.stringify(badges.config()),expected);assert.deepEqual(snapshot(),original);await prepareProfile(dir,require('../package.json').version);assert.deepEqual(fs.readdirSync(path.join(dir,'backups')),backups);}
    finally{badges.close();store.close();}
  }
});
