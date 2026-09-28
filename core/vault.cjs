const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {DatabaseSync, backup} = require('node:sqlite');

function atomicWrite(file, value) {
  const temp = file + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, value); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}

function vault(file, helper) {
  function convert(mode, bytes) {
    if (process.platform !== 'win32') throw Error('Windows DPAPI is required.');
    const result = spawnSync(helper, [mode], {input:bytes, windowsHide:true, timeout:10000, maxBuffer:1024*1024});
    if (result.status !== 0 || !result.stdout?.length) throw Error('Protected storage is unavailable.');
    return result.stdout;
  }
  return {
    load() { return fs.existsSync(file) ? JSON.parse(convert('decrypt', fs.readFileSync(file)).toString('utf8')) : null; },
    save(value) {
      if (value === null) { fs.rmSync(file, {force:true}); fs.rmSync(file+'.tmp', {force:true}); return; }
      atomicWrite(file, convert('encrypt', Buffer.from(JSON.stringify(value))));
    }
  };
}

async function backupProfile(dir, reason) {
  const safe = reason.replace(/[^a-zA-Z0-9.-]/g, '-');
  const target = path.join(dir, 'backups', `${safe}-${Date.now()}`);
  fs.mkdirSync(target, {recursive:true});
  const file = path.join(dir, 'shoutouts.sqlite');
  if (fs.existsSync(file)) {
    const db = new DatabaseSync(file, {readOnly:true});
    try { await backup(db, path.join(target, 'shoutouts.sqlite')); } finally { db.close(); }
  }
  const auth = path.join(dir, 'twitch-auth.dpapi');
  if (fs.existsSync(auth)) fs.copyFileSync(auth, path.join(target, 'twitch-auth.dpapi'));
  return target;
}

async function prepareProfile(dir, version) {
  fs.mkdirSync(dir, {recursive:true});
  const marker = path.join(dir, 'profile-version.json');
  let previous;
  if (fs.existsSync(marker)) previous = JSON.parse(fs.readFileSync(marker, 'utf8')).version;
  if (previous !== version && fs.existsSync(path.join(dir, 'shoutouts.sqlite'))) await backupProfile(dir, `before-${version}`);
  // Called before opening/migrating the writable database; a failed backup aborts startup.
  atomicWrite(marker, JSON.stringify({version}));
}
module.exports = {atomicWrite, vault, backupProfile, prepareProfile};
