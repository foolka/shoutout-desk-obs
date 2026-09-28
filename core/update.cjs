const REPO = 'foolka/shoutout-desk-obs';
function parseVersion(value) {
  const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  if(!match) throw Error('Unsupported release version.');
  return match.slice(1).map(Number);
}
function newer(a,b) {
  const x=parseVersion(a),y=parseVersion(b);
  for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i];}return false;
}
async function checkUpdate(version, fetchImpl=fetch) {
  const response=await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`,{
    headers:{Accept:'application/vnd.github+json','User-Agent':'Shoutout-Desk-OBS'}, signal:AbortSignal.timeout(12000),redirect:'error'
  });
  if(response.status===404)return {available:false,version,message:'no-release'};
  if(!response.ok)throw Error('Не удалось проверить обновления. Повторите позже.');
  const release=await response.json();
  const expected=`https://github.com/${REPO}/releases/tag/${release.tag_name}`;
  if(release.draft||release.prerelease||release.html_url!==expected)throw Error('Неизвестный адрес выпуска.');
  return {available:newer(release.tag_name,version),version:release.tag_name,url:expected};
}
module.exports={REPO,parseVersion,newer,checkUpdate};
