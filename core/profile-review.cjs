const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {DatabaseSync, backup} = require('node:sqlite');
const database = 'shoutouts.sqlite';
const decision = 'profile-choice.json';
const sidecars = ['-wal','-shm','-journal'];
const traces = ['profile-version.json',decision,'backups','connection.json','twitch-auth.json','twitch-login.json','connection.dpapi','twitch-auth.dpapi','twitch-login.dpapi'];
const stat = file => fs.lstatSync(file,{throwIfNoEntry:false});
const key = file => process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);

// Read only Shoutout schemas; never initialize an empty or unrelated SQLite file.
function counts(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>r.name));
  const users = tables.has('channel_people') ? 'channel_people' : 'people';
  if (!tables.has(users) || !tables.has('preferences') || !tables.has('attempts') || db.prepare('PRAGMA user_version').get().user_version > 3) throw Error('Not a supported Shoutout database');
  return {people:db.prepare('SELECT count(*) AS n FROM '+users+' WHERE active=1').get().n,
    history:db.prepare('SELECT count(*) AS n FROM attempts').get().n};
}
function info(file) {
  const entry = stat(file);
  if (!entry?.isFile() || entry.size < 100) throw Error('Not a database file');
  const db = new DatabaseSync(file,{readOnly:true});
  try { return {file,...counts(db)}; } finally { db.close(); }
}
function entries(dir) {
  const s=stat(dir);
  return s?.isDirectory() ? fs.readdirSync(dir,{withFileTypes:true}) : [];
}

// Inspect only the current directory, its backups and known roots for this product.
function inspect(dir, alternatives=[], confirmFresh=false) {
  const file=path.join(dir,database), currentExists=!!stat(file);
  let current=null;
  if(currentExists){try{current=info(file);}catch{/* Never allow replacing this path. */}}
  const seen=new Set([key(file)]), candidates=[];
  function add(f, optional=false) {
    if(seen.has(key(f)))return;
    seen.add(key(f));
    try { const item=info(f); if(!optional||item.people||item.history)candidates.push(item); }catch{/* Not a readable Shoutout copy. */}
  }
  const own=entries(dir);
  let possibleCopy=false;
  for(const e of own){
    if(!e.isFile() || key(path.join(dir,e.name))===key(file) || /(?:-wal|-shm|-journal)$/i.test(e.name))continue;
    const dbName=/\.(?:sqlite3?|db|bak|old)(?:\.|$)/i.test(e.name);
    if(dbName){add(path.join(dir,e.name));if(/^shoutouts[.-]/i.test(e.name))possibleCopy=true;}
    else if(!traces.includes(e.name)){
      // A manually renamed database may no longer have an extension.
      const f=path.join(dir,e.name),header=Buffer.alloc(16);
      let fd;
      try{fd=fs.openSync(f,'r');if(fs.readSync(fd,header,0,16,0)===16 && header.toString('latin1')==='SQLite format 3\0')add(f);}catch(error){if(!['EBUSY','EPERM','EACCES','ENOENT'].includes(error.code))throw error;}finally{if(fd!==undefined)fs.closeSync(fd);}
    }
  }
  const primaryCopies=candidates.length;
  for(const root of alternatives.filter(Boolean)){
    if(key(root)!==key(dir) && stat(root)?.isDirectory())add(path.join(root,database));
  }
  const alternativesFound=candidates.length>primaryCopies;
  if(!current || candidates.length || (!current.people&&!current.history)){
    const base=path.join(dir,'backups');
    for(const entry of entries(base).sort((a,b)=>b.name.localeCompare(a.name))){
      if(entry.isDirectory())add(path.join(base,entry.name,database),true);
      else if(entry.isFile())add(path.join(base,entry.name),true);
    }
  }
  const orphan=sidecars.some(s=>!!stat(file+s));
  const localEvidence=possibleCopy||primaryCopies>0||orphan||traces.some(n=>!!stat(path.join(dir,n)));
  const canCreate=!currentExists&&!localEvidence&&(alternativesFound||confirmFresh);
  const canRestore=!currentExists&&!orphan;
  const signature=createHash('sha256').update(JSON.stringify([key(dir),candidates.filter(x=>!key(x.file).startsWith(key(path.join(dir,'backups'))+path.sep)||(!current?.people&&!current?.history)).map(x=>key(x.file)).sort()])).digest('hex');
  let acknowledged=false;
  if(current && stat(path.join(dir,decision))?.isFile()){
    try{acknowledged=JSON.parse(fs.readFileSync(path.join(dir,decision),'utf8')).signature===signature;}catch{/* Ask again. */}
  }
  const needed=current ? candidates.length>0&&!acknowledged : currentExists||localEvidence||alternativesFound||confirmFresh;
  return {file,current,candidates,needed,canCreate,canRestore,signature};
}

// Publish an integrity-checked, WAL-aware copy without ever replacing an existing path.
async function restoreMissing(dir, source) {
  const target=path.join(dir,database);
  if([target,...sidecars.map(s=>target+s)].some(f=>!!stat(f)))throw Error('Destination is not empty');
  info(source);
  const tmp=fs.mkdtempSync(path.join(dir,'.restore-')),copy=path.join(tmp,'snapshot');
  try {
    const db=new DatabaseSync(source,{readOnly:true});
    try {await backup(db,copy);}finally{db.close();}
    const verify=new DatabaseSync(copy);
    try {
      verify.exec('PRAGMA journal_mode=DELETE');
      if(verify.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw Error('Backup is damaged');
      counts(verify);
    }finally{verify.close();}
    if(sidecars.some(s=>!!stat(target+s)))throw Error('Destination journal appeared');
    fs.linkSync(copy,target);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}

const labels={
  ru:['Проверка профиля Shoutout','Рабочая база','Не найдена или недоступна','Записи / история','Проверьте прежнюю папку и резервные копии. Файлы не заменяются.','Оставить текущую базу','Создать отдельный пустой профиль','Выбрать копию','Восстановить копию','Открыть папку','Закрыть','Если нужны записи из другой базы, используйте «Импорт» в настройках.','Рабочий файл или журнал уже существует. Закройте приложение и сохраните всю папку перед ручным восстановлением.','Выбранная копия','Не удалось прочитать или восстановить копию.'],
  uk:['Перевірка профілю Shoutout','Робоча база','Не знайдена або недоступна','Записи / історія','Перевірте попередню папку та резервні копії. Файли не замінюються.','Залишити поточну базу','Створити окремий порожній профіль','Вибрати копію','Відновити копію','Відкрити папку','Закрити','Для додавання записів з іншої бази використайте «Імпорт» у налаштуваннях.','Робочий файл або журнал уже існує. Закрийте програму та збережіть усю папку перед ручним відновленням.','Вибрана копія','Не вдалося прочитати чи відновити копію.'],
  en:['Review Shoutout profile','Expected database','Missing or unavailable','People / history','Check the previous folder and backups. No files are replaced.','Keep current database','Create separate empty profile','Choose a copy','Restore selected copy','Open folder','Close','Use Import in Settings to add records from another database.','A database or journal already exists. Close the app and back up the entire folder before manual recovery.','Selected copy','Cannot read or restore this copy.']
};
// Both frontends present the same choices. A selected file is previewed before copying.
async function guard(dir,{alternatives=[],locale='ru',ask,write,confirmFresh=false}={}) {
  const l=labels[String(locale).slice(0,2)]||labels.en;
  let selected=null,problem='';
  for(;;){
    const r=inspect(dir,alternatives,confirmFresh);
    if(!r.needed)return;
    const line=x=>x.file+'  ('+x.people+' / '+x.history+')';
    const detail=[l[1]+': '+(r.current?line(r.current):r.file+' ('+l[2]+')'),l[3],...r.candidates.slice(0,8).map(line),r.candidates.length>8?'… (+'+(r.candidates.length-8)+')':'',r.current?l[11]:!r.canRestore?l[12]:l[4],selected?l[13]+': '+line(selected):'',problem].filter(Boolean).join('\n');
    const actions={};
    if(r.current)actions.keep=l[5];
    if(r.canCreate)actions.create=l[6];
    if(selected&&r.canRestore)actions.restore=l[8];
    if(r.canRestore)actions.browse=l[7];
    actions.folder=l[9];actions.close=l[10];
    if(!ask)throw Object.assign(Error(detail),{code:'PROFILE_REVIEW'});
    const answer=await ask({title:l[0],detail,actions,dir,initial:r.candidates[0]?.file||dir});
    if(!answer||!Object.hasOwn(actions,answer.action)||answer.action==='close')throw Object.assign(Error(l[0]),{code:'PROFILE_CANCELLED'});
    problem='';
    if(answer.action==='folder')continue;
    if(answer.action==='browse'){
      selected=null;
      if(answer.file){try{selected=info(answer.file);}catch{problem=l[14];}}
      continue;
    }
    if(answer.action==='restore'){
      try{await restoreMissing(dir,selected.file);}catch{selected=null;problem=l[14];continue;}
    }
    if(answer.action==='keep')info(r.file);
    // Never turn a missing established profile into a new one, even after a stale UI response.
    if(answer.action==='create'&&!inspect(dir,alternatives,confirmFresh).canCreate)continue;
    write(path.join(dir,decision),JSON.stringify({signature:r.signature}));
    return;
  }
}
module.exports={inspect,info,guard,restoreMissing};
