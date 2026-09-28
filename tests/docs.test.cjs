const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('README screenshots use the matching language and exist',()=>{
  for(const [file,locale] of [['README.md','en-US'],['README.uk.md','uk-UA'],['README.ru.md','ru-RU']]){
    const text=fs.readFileSync(path.join(root,file),'utf8');
    const images=[...text.matchAll(/!\[[^\]]*\]\((docs\/screenshots\/[^)]+)\)/g)];
    assert.ok(images.length>=4,file+' must show the main views');
    for(const [,image] of images){assert.ok(image.startsWith('docs/screenshots/'+locale+'/'),file+': '+image);assert.ok(fs.existsSync(path.join(root,image)),image);}
  }
});
