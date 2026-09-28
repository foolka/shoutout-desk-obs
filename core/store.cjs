const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');

function normalizeLogin(input) {
  let name = String(input || '').trim();
  if (/^https?:\/\//i.test(name)) {
    const url = new URL(name);
    if (!['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(url.hostname.toLowerCase())) throw Error('Нужен ник или ссылка Twitch.');
    name = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  }
  name = name.replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(name)) throw Error('Ник: до 25 латинских букв, цифр или знаков _.');
  return name;
}

class Store {
  constructor(file, now = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(file);
    if(this.db.prepare('PRAGMA user_version').get().user_version>2){this.db.close();throw Error('База создана более новой версией плагина. Обновите плагин или восстановите соответствующую резервную копию.');}
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS people(login TEXT PRIMARY KEY, added_at INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY, account TEXT NOT NULL, login TEXT NOT NULL,
        created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, status TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '', retry_at INTEGER NOT NULL DEFAULT 0, tries INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS attempts_person ON attempts(account,login,created_at);
      CREATE INDEX IF NOT EXISTS attempts_state ON attempts(status);
      CREATE TABLE IF NOT EXISTS channel_people(account TEXT NOT NULL,login TEXT NOT NULL,added_at INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(account,login));
      CREATE TABLE IF NOT EXISTS observed_shoutouts(account TEXT NOT NULL,login TEXT NOT NULL,stamp INTEGER NOT NULL,PRIMARY KEY(account,login,stamp));`);
    if(this.db.prepare('PRAGMA user_version').get().user_version<2){
      this.db.prepare('INSERT OR IGNORE INTO channel_people SELECT ?,login,added_at,active FROM people').run(this.lastAccount().id);
      this.db.exec('PRAGMA user_version=2');
    }
    this.db.prepare("UPDATE attempts SET status='cancelled', detail='Перезапуск: ожидаем новое сообщение' WHERE status='queued'").run();
  }
  close() { this.db.close(); }
  lastAccount() {
    const row=this.db.prepare("SELECT value FROM preferences WHERE key='lastAccount'").get();
    return row ? JSON.parse(row.value) : {id:'',channel:''};
  }
  rememberAccount(id,channel='') {
    this.claimDraft(String(id));
    this.db.prepare('INSERT OR REPLACE INTO preferences VALUES (?,?)').run('lastAccount',JSON.stringify({id:String(id),channel:String(channel)}));
  }
  meta(key,fallback=null){const row=this.db.prepare('SELECT value FROM preferences WHERE key=?').get(key);return row?JSON.parse(row.value):fallback;}
  setMeta(key,value){this.db.prepare('INSERT OR REPLACE INTO preferences VALUES (?,?)').run(key,JSON.stringify(value));}
  claimDraft(account){
    if(!account||!this.db.prepare("SELECT 1 FROM channel_people WHERE account='' LIMIT 1").get())return;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.db.prepare("INSERT OR IGNORE INTO channel_people SELECT ?,login,added_at,active FROM channel_people WHERE account=''").run(account);
      this.db.prepare("DELETE FROM channel_people WHERE account=''").run();this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  prefs() {
    const out = { cooldownHours: 24, enabled: true, resetAfterLongClose: false };
    for (const row of this.db.prepare('SELECT * FROM preferences').all()) {
      if (Object.hasOwn(out, row.key)) out[row.key] = JSON.parse(row.value);
    }
    return out;
  }
  setPrefs(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'cooldownHours') {
        if (!Number.isInteger(value) || value < 1 || value > 168) throw Error('Интервал: от 1 до 168 часов.');
      } else if (key === 'enabled' || key === 'resetAfterLongClose') {
        if (typeof value !== 'boolean') throw Error('Некорректное значение настройки.');
      } else throw Error('Неизвестная настройка.');
    }
    this.db.exec('BEGIN IMMEDIATE');
    try{for(const [key,value] of Object.entries(patch))this.db.prepare('INSERT OR REPLACE INTO preferences VALUES (?,?)').run(key,JSON.stringify(value));this.db.exec('COMMIT');}
    catch(error){this.db.exec('ROLLBACK');throw error;}
    return this.prefs();
  }
  add(input,account=this.lastAccount().id) {
    const login = normalizeLogin(input);
    this.db.prepare('INSERT INTO channel_people(account,login,added_at) VALUES (?,?,?) ON CONFLICT(account,login) DO UPDATE SET active=1').run(account,login,this.now());
    return login;
  }
  remove(input,account=this.lastAccount().id) {
    const login = normalizeLogin(input);
    this.db.prepare('UPDATE channel_people SET active=0 WHERE account=? AND login=?').run(account,login);
    this.db.prepare("UPDATE attempts SET status='cancelled',detail='Удалён из списка' WHERE account=? AND login=? AND status='queued'").run(account,login);
  }
  last(account, login) {
    const cutoff=this.cooldownResetAt(account);
    const attempt=this.db.prepare(`SELECT MAX(CASE WHEN status='sent' THEN finished_at ELSE started_at END) AS stamp
      FROM attempts WHERE account=? AND login=? AND status IN ('sent','sending','uncertain')
      AND (CASE WHEN status='sent' THEN finished_at ELSE started_at END)>?`).get(account,login,cutoff).stamp;
    const observed=this.db.prepare('SELECT MAX(stamp) AS stamp FROM observed_shoutouts WHERE account=? AND login=? AND stamp>?').get(account,login,cutoff).stamp;
    return attempt==null?observed:observed==null?attempt:Math.max(attempt,observed);
  }
  cooldownResetAt(account){return this.meta('cooldownReset:'+account,0);}
  resetCooldowns(account=this.lastAccount().id){
    if(!account)return false;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      this.setMeta('cooldownReset:'+account,Math.max(this.now(),this.cooldownResetAt(account)));
      this.db.prepare("UPDATE attempts SET status='cancelled',detail='Таймауты сброшены: ожидаем новое сообщение' WHERE account=? AND status='queued'").run(account);
      this.db.exec('COMMIT');return true;
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  observeShoutout(account,login,stamp){
    if(!account||!Number.isFinite(stamp)||stamp<=0||stamp>this.now()+60000)return false;
    login=normalizeLogin(login);
    this.db.prepare('INSERT OR IGNORE INTO observed_shoutouts VALUES (?,?,?)').run(account,login,stamp);
    if(this.nextAt(account,login)>this.now())this.db.prepare("UPDATE attempts SET status='cancelled',detail='Шотаут уже сделан в канале',finished_at=? WHERE account=? AND login=? AND status='queued'").run(this.now(),account,login);
    return true;
  }
  canSend(id){
    const row=this.db.prepare("SELECT * FROM attempts WHERE id=? AND status='sending'").get(id);
    if(!row||!this.prefs().enabled||!this.db.prepare('SELECT 1 FROM channel_people WHERE account=? AND login=? AND active=1').get(row.account,row.login))return false;
    // Exclude this attempt's own in-flight reservation from the final check.
    if(row.started_at<=this.cooldownResetAt(row.account))return false;
    const observed=this.db.prepare('SELECT MAX(stamp) AS stamp FROM observed_shoutouts WHERE account=? AND login=? AND stamp>?').get(row.account,row.login,this.cooldownResetAt(row.account)).stamp;
    return observed==null||observed+this.prefs().cooldownHours*3600000<=this.now();
  }
  nextAt(account,login) {
    const stamp = this.last(account,login);
    return stamp == null ? 0 : stamp + this.prefs().cooldownHours * 3600000;
  }
  people(account = '') {
    return this.db.prepare('SELECT login,added_at FROM channel_people WHERE account=? AND active=1 ORDER BY added_at DESC, login').all(account).map(p => ({
      ...p, lastAt:this.last(account,p.login), nextAt:this.nextAt(account,p.login),
      queued:!!this.db.prepare("SELECT 1 FROM attempts WHERE account=? AND login=? AND status IN ('queued','sending')").get(account,p.login)
    }));
  }
  enqueue(account,input) {
    const login = normalizeLogin(input);
    this.claimDraft(account);
    if (!account || !this.prefs().enabled || !this.db.prepare('SELECT 1 FROM channel_people WHERE account=? AND login=? AND active=1').get(account,login)) return null;
    if (this.nextAt(account,login) > this.now()) return null;
    if (this.db.prepare("SELECT 1 FROM attempts WHERE account=? AND login=? AND status IN ('queued','sending')").get(account,login)) return null;
    const id=randomUUID();
    this.db.prepare("INSERT INTO attempts(id,account,login,created_at,status) VALUES (?,?,?,?,'queued')").run(id,account,login,this.now());
    return id;
  }
  globalNext(account) {
    const stamp = this.db.prepare(`SELECT MAX(COALESCE(finished_at,started_at)) AS stamp FROM attempts
      WHERE account=? AND status IN ('sent','sending','uncertain')`).get(account).stamp;
    const block = this.db.prepare("SELECT MAX(retry_at) AS stamp FROM attempts WHERE account=?").get(account).stamp;
    const observed=this.db.prepare('SELECT MAX(stamp) AS stamp FROM observed_shoutouts WHERE account=?').get(account).stamp;
    return Math.max(stamp == null ? 0 : stamp+125000, block || 0,observed==null?0:observed+125000);
  }
  take(account,settleMs=0) {
    if (this.globalNext(account)>this.now()) return null;
    this.db.prepare("UPDATE attempts SET status='cancelled',detail='Сообщение устарело' WHERE status='queued' AND created_at<?").run(this.now()-30*60000);
    const row=this.db.prepare("SELECT * FROM attempts WHERE account=? AND status='queued' AND retry_at<=? AND created_at<=? ORDER BY created_at,rowid LIMIT 1").get(account,this.now(),this.now()-settleMs);
    if (!row) return null;
    if (this.nextAt(account,row.login)>this.now()) {
      this.finish(row.id,'cancelled','Действует таймаут'); return null;
    }
    this.db.prepare("UPDATE attempts SET status='sending',started_at=?,tries=tries+1 WHERE id=?").run(this.now(),row.id);
    return this.db.prepare('SELECT * FROM attempts WHERE id=?').get(row.id);
  }
  finish(id,status,detail='',stamp=this.now()) {
    if (!['sent','failed','uncertain','cancelled'].includes(status)) throw Error('Invalid result');
    this.db.prepare('UPDATE attempts SET status=?,detail=?,finished_at=? WHERE id=?').run(status,detail,stamp,id);
  }
  retry(id,delay=125000,detail='Ожидание Twitch') {
    const row=this.db.prepare('SELECT * FROM attempts WHERE id=?').get(id);
    if (!row) return;
    // A rejected HTTP response is definitive; a transport timeout must not use this path.
    this.db.prepare("UPDATE attempts SET status=?,retry_at=?,detail=? WHERE id=?").run(row.tries<3?'queued':'failed',this.now()+delay,detail,id);
  }
  cancelQueue(detail='Ожидаем новое сообщение') {
    this.db.prepare("UPDATE attempts SET status='cancelled',detail=? WHERE status='queued'").run(detail);
  }
  unresolved(account) { return this.db.prepare("SELECT * FROM attempts WHERE account=? AND status='sending'").all(account); }
  history(account='') { return this.db.prepare('SELECT * FROM attempts WHERE account=? ORDER BY created_at DESC LIMIT 1000').all(account); }
}
module.exports={Store,normalizeLogin};
