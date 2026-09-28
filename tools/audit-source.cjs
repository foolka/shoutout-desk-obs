const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const top=new Set(['src','core','data','docs','tools','tests','.github','README.md','README.ru.md','README.uk.md','LICENSE','THIRD_PARTY_NOTICES.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','CMakeLists.txt','package.json','package-lock.json','worker.cjs','.gitignore','.gitattributes']);
const failures=[];
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name),rel=path.relative(root,file);
  if(dir===root&&!top.has(entry.name))continue;
  if(entry.isSymbolicLink()){failures.push(rel+': symlink');continue;}
  if(entry.isDirectory()){scan(file);continue;}
  if(/\.(sqlite(?:-wal|-shm)?|dpapi|pem|key|exe|dll|pdb|zip)$/i.test(entry.name))failures.push(rel+': private/generated file');
  const text=fs.readFileSync(file,'utf8');
  if(/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(text))failures.push(rel+': private key');
  if(/(?:accessToken|refreshToken|clientSecret|access_token|refresh_token)\s*["']?\s*:\s*["'][A-Za-z0-9_-]{24,}["']/.test(text))failures.push(rel+': possible literal credential');
  if(/C:\\\\Users\\\\darkg|F:\\\\Twich/.test(text))failures.push(rel+': private absolute path');
}}
scan(root);
const locales=['en-US','ru-RU','uk-UA'].map(name=>Object.keys(JSON.parse(fs.readFileSync(path.join(root,'data/locale',name+'.json')))).sort().join(','));
if(new Set(locales).size!==1)failures.push('Locale keys differ');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Source allowlist, credential patterns and locale keys checked.');
