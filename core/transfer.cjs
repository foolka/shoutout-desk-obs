const {normalizeLogin} = require('./store.cjs');
const {DatabaseSync} = require('node:sqlite');

function exportBundle(store, account) {
  return {
    format:'shoutout-desk-obs', version:1, exportedAt:store.now(),
    account:{id:account, channel:store.lastAccount().channel},
    cooldownHours:store.prefs().cooldownHours,
    cooldownResetAt:store.cooldownResetAt(account),
    people:store.db.prepare('SELECT login,added_at,active FROM channel_people WHERE account=?').all(account),
    attempts:store.db.prepare('SELECT * FROM attempts WHERE account=? ORDER BY created_at').all(account),
    observed:store.db.prepare('SELECT login,stamp FROM observed_shoutouts WHERE account=?').all(account)
  };
}

function readDesktop(file) {
  const db = new DatabaseSync(file, {readOnly:true});
  try {
    const account = JSON.parse(db.prepare("SELECT value FROM preferences WHERE key='lastAccount'").get()?.value || '{}');
    if (!account.id) throw Error('В базе нет подключённого канала.');
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    if(db.prepare('PRAGMA user_version').get().user_version>3)throw Error('База из более новой версии. Сначала обновите приложение.');
    return {
      format:'shoutout-desk-obs', version:1, account,
      cooldownHours:JSON.parse(db.prepare("SELECT value FROM preferences WHERE key='cooldownHours'").get()?.value || '24'),
      cooldownResetAt:JSON.parse(db.prepare('SELECT value FROM preferences WHERE key=?').get('cooldownReset:'+account.id)?.value || '0'),
      people:tables.has('channel_people')?db.prepare("SELECT login,added_at,active FROM channel_people WHERE account=? OR account=''").all(account.id):db.prepare('SELECT login,added_at,active FROM people').all(),
      attempts:db.prepare('SELECT * FROM attempts WHERE account=?').all(account.id),
      observed:tables.has('observed_shoutouts')?db.prepare('SELECT login,stamp FROM observed_shoutouts WHERE account=?').all(account.id):[]
    };
  } finally { db.close(); }
}

function importBundle(store, value, account) {
  if (!account || value?.account?.id !== account) throw Error('Войдите в тот же канал Twitch, которому принадлежит импорт.');
  if (value.format !== 'shoutout-desk-obs' || value.version !== 1) throw Error('Неизвестный формат экспорта.');
  const now = store.now();
  const stamp = n => { if (!Number.isSafeInteger(n) || n <= 0 || n > now+60000) throw Error('Некорректная дата в импорте.'); return n; };
  for (const key of ['people','attempts','observed']) {
    if (!Array.isArray(value[key]) || value[key].length>100000) throw Error('Слишком большой или некорректный импорт.');
  }
  const people = value.people.map(p=>({login:normalizeLogin(p.login), added_at:stamp(p.added_at), active:p.active===1?1:0}));
  const attempts = value.attempts.map(a=>{
    // Legacy Voice imports use voice:account:login:timestamp IDs.
    if (a.account!==account || typeof a.id!=='string' || !/^[a-zA-Z0-9_:-]{1,128}$/.test(a.id)) throw Error('Некорректная история.');
    if (!['sent','failed','uncertain','cancelled','sending','queued'].includes(a.status)) throw Error('Некорректный статус.');
    if((a.status==='sent'&&a.finished_at==null)||(['sending','uncertain'].includes(a.status)&&a.started_at==null))throw Error('В истории отсутствует время отметки.');
    if(a.trigger!=null&&!['chat','raid'].includes(a.trigger))throw Error('Некорректный источник отметки.');
    return {...a, trigger:a.trigger||'chat', login:normalizeLogin(a.login), created_at:stamp(a.created_at), started_at:a.started_at==null?null:stamp(a.started_at),
      finished_at:a.finished_at==null?null:stamp(a.finished_at), detail:String(a.detail||'').slice(0,500),
      status:a.status==='sending'?'uncertain':a.status==='queued'?'cancelled':a.status};
  });
  const observed = value.observed.map(o=>({login:normalizeLogin(o.login), stamp:stamp(o.stamp)}));
  const hours = value.cooldownHours;
  if (!Number.isInteger(hours)||hours<1||hours>168) throw Error('Некорректный таймаут.');
  const resetAt=value.cooldownResetAt==null||value.cooldownResetAt===0?0:stamp(value.cooldownResetAt);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    for (const p of people) store.db.prepare('INSERT INTO channel_people VALUES (?,?,?,?) ON CONFLICT(account,login) DO UPDATE SET active=MAX(active,excluded.active),added_at=MIN(added_at,excluded.added_at)').run(account,p.login,p.added_at,p.active);
    for (const a of attempts) store.db.prepare('INSERT OR IGNORE INTO attempts(id,account,login,created_at,started_at,finished_at,status,detail,trigger) VALUES (?,?,?,?,?,?,?,?,?)').run(a.id,account,a.login,a.created_at,a.started_at,a.finished_at,a.status,a.detail,a.trigger);
    for (const o of observed) store.db.prepare('INSERT OR IGNORE INTO observed_shoutouts VALUES (?,?,?)').run(account,o.login,o.stamp);
    // Import never resumes automation or replays old pending requests.
    store.db.prepare('INSERT OR REPLACE INTO preferences VALUES (?,?)').run('enabled','false');
    store.db.prepare('INSERT OR REPLACE INTO preferences VALUES (?,?)').run('cooldownHours',JSON.stringify(hours));
    store.setMeta('cooldownReset:'+account,Math.max(resetAt,store.cooldownResetAt(account)));
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  return {people:people.filter(p=>p.active).length, history:attempts.length};
}
module.exports = {exportBundle, importBundle, readDesktop};
