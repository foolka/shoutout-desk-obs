const $=id=>document.getElementById(id),view=new BadgeView($('preview'));
const fragment=new URLSearchParams(location.hash.slice(1));
const token=fragment.get('key')||sessionStorage.getItem('badge-key')||'';sessionStorage.setItem('badge-key',token);
let selected=fragment.get('login')||'',state,draft,dirty=false,identity=null,profileEpoch=0,toastTimer,saving=false;
history.replaceState(null,'',location.pathname);
const effectNames={fade:'Растворение',left:'Слева',right:'Справа',up:'Снизу',down:'Сверху',zoom:'Приближение',pop:'Пружина',flip:'Поворот по оси',tilt:'Наклон',blur:'Из размытия'};
const exitNames={fade:'Растворение',left:'Влево',right:'Вправо',up:'Вверх',down:'Вниз',zoom:'Уменьшение',pop:'Пружина',flip:'Поворот по оси',tilt:'Наклон',blur:'В размытие'};
const numeric=[['sizes','paddingX','Отступы по горизонтали',4,48],['sizes','paddingY','Отступы по вертикали',4,32],['sizes','radius','Скругление',0,80],['sizes','borderWidth','Толщина рамки',0,12],['sizes','avatarSize','Размер аватара',32,120],['sizes','gap','Расстояние до текста',4,36],['typography','angle','Угол градиента, °',0,360],['typography','fontSize','Размер ника',16,48],['typography','descriptionSize','Размер описания',12,26],['stamp-fields','stampAngle','Наклон, °',-45,45],['stamp-fields','stampSize','Ширина штампа, px',80,240],['stamp-fields','stampFontSize','Размер текста, px',10,42],['motion','duration','Показ, секунд',2,30]];
function icons(){lucide.createIcons();}
function notice(text,error=false){clearTimeout(toastTimer);$('notice').textContent=text;$('notice').hidden=false;$('notice').classList.toggle('error',error);toastTimer=setTimeout(()=>$('notice').hidden=true,5000);}
async function api(route,body){const response=await fetch('/api/'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(8000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Ошибка соединения');return data;}
function field(group,key,text,type,options=[]){
  const label=document.createElement('label');label.textContent=text;const input=document.createElement(type==='select'?'select':'input');input.id='f-'+key;input.dataset.key=key;
  if(type==='select'){for(const [value,caption]of options){const option=document.createElement('option');option.value=value;option.textContent=caption;input.append(option);}const wrap=document.createElement('span');wrap.className='select-wrap';const icon=document.createElement('i');icon.dataset.lucide='chevron-down';wrap.append(input,icon);label.append(wrap);}
  else if(type==='checkbox'){input.type=type;label.textContent='';label.className='toggle';const caption=document.createElement('span');caption.textContent=text;label.append(input,caption);}
  else{input.type=type;label.append(input);}
  $(group).append(label);input.oninput=()=>{if(!draft)return;const target=isPaletteKey(key)?draft.style.palettes[draft.style.design]:draft.style;target[key]=type==='checkbox'?input.checked:type==='number'?Number(input.value)/fieldScale(key):input.value;if(key==='stampEnabled')syncStamp();mark();preview();};return input;
}
function fieldScale(key){return key==='descriptionSize'?1.5:1;}
function isPaletteKey(key){return !!state?.paletteDefaults?.air&&Object.hasOwn(state.paletteDefaults.air,key);}
function syncStamp(){$('stamp-options').disabled=!activeStyle().stampEnabled;}
function fillStyle(){const theme=activeStyle();for(const input of document.querySelectorAll('[data-key]')){const key=input.dataset.key,value=isPaletteKey(key)?theme.palettes[theme.design][key]:theme[key];if(input.type==='checkbox')input.checked=value;else input.value=typeof value==='number'?value*fieldScale(key):value;}for(const button of $('designs').querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.design===theme.design));$('palette-heading').textContent='Цвета: '+state.designs.find(item=>item.id===theme.design).name;$('f-accentTextColor').closest('label').hidden=theme.design==='sticker';$('f-surfaceColor').closest('label').firstChild.textContent=theme.design==='sticker'?'Плашка адреса':'Панель описания';syncStamp();}
field('stamp-switch','stampEnabled','Показывать штамп','checkbox');
const stampText=field('stamp-fields','stampText','Текст','text');stampText.maxLength=32;stampText.spellcheck=false;
field('stamp-fields','stampPosition','Позиция','select',[['top-right','Справа сверху'],['top-left','Слева сверху'],['bottom-right','Справа снизу'],['bottom-left','Слева снизу']]);
field('stamp-fields','stampColor','Цвет штампа','color');
for(const [group,key,text,min,max]of numeric){const input=field(group,key,text,'number');input.min=min*fieldScale(key);input.max=max*fieldScale(key);input.step=fieldScale(key);}
function mark(){dirty=true;$('save-status').textContent='Есть изменения';}
function activeStyle(){return selected&&!draft.custom?state.config.style:draft.style;}
function preview(play=false){if(!draft)return;const login=selected||state.people[0]?.login||'streamer';const data={login,name:identity?.name||login,avatar:identity?.avatar||'',description:selected?draft.description:'Короткое описание стримера',style:activeStyle()};play?view.play(data,play==='exit'?650+data.style.duration*1000:0):view.render(data);}
async function loadIdentity(){const epoch=++profileEpoch;identity=null;preview();const login=selected||state.people[0]?.login;if(!login)return;try{const data=await api('profile?login='+encodeURIComponent(login));if(epoch===profileEpoch){identity=data;preview();}}catch{} }
function people(){
  $('people').replaceChildren();const q=$('search').value.trim().toLowerCase();$('count').textContent=state.people.length;let shown=0;
  for(const person of state.people){if(!person.login.includes(q))continue;shown++;
    const row=document.createElement('div');row.className='person'+(person.enabled?'':' disabled');const choose=document.createElement('button');choose.className='choose';choose.setAttribute('aria-pressed',String(selected===person.login));choose.title=person.login;
    const dot=document.createElement('span');dot.className='dot';const name=document.createElement('span');name.textContent=person.login;choose.append(dot,name);choose.onclick=()=>select(person.login);
    const test=document.createElement('button');test.className='icon-button test';test.title='Тест: '+person.login;test.setAttribute('aria-label',test.title);const icon=document.createElement('i');icon.dataset.lucide='play';test.append(icon);test.onclick=()=>void testUser(person.login,test);row.append(choose,test);$('people').append(row);
  }
  $('empty').hidden=!!shown;$('empty').textContent=state.people.length?'Ничего не найдено':'Список пуст';icons();
}
function select(login,force=false){
  if(!force&&dirty&&!confirm('Не сохранять изменения и переключиться?'))return;
  selected=login;const person=state.people.find(p=>p.login===login);if(login&&!person)selected='';
  draft=structuredClone(person||{enabled:state.config.enabled,custom:true,description:'',style:state.config.style});dirty=false;
  $('selected-name').textContent=selected||'Общая тема';$('person-fields').hidden=!selected;$('default-theme').hidden=!selected;$('person-enabled').checked=draft.enabled;$('person-custom').checked=draft.custom;$('description').value=draft.description;
  $('description-count').textContent=draft.description.length+' / 140';$('theme-controls').disabled=!!selected&&!draft.custom;$('reset').disabled=!!selected&&!draft.custom;
  fillStyle();
  $('save-status').textContent='Без изменений';people();void loadIdentity();
}
async function save(){
  if(saving)throw Error('Сохранение ещё не завершено.');
  if(!$('theme-form').reportValidity())throw Error('Проверьте значения оформления.');
  saving=true;$('save').disabled=true;
  try{const result=await api('config',selected?{account:state.account,login:selected,person:draft}:{account:state.account,enabled:state.config.enabled,style:draft.style});state=result;dirty=false;people();$('save-status').textContent='Сохранено';return result;}
  finally{saving=false;$('save').disabled=false;}
}
async function testUser(login,button){
  button.disabled=true;
  try{if(dirty&&(selected===login||!selected))await save();await api('test',{account:state.account,login});notice('Тестовая плашка отправлена в источник OBS');}
  catch(error){notice(error.message,true);}finally{button.disabled=false;}
}
$('save').onclick=()=>void save().catch(error=>notice(error.message,true));
$('search').oninput=()=>people();$('default-theme').onclick=()=>select('');$('animate').onclick=()=>preview(true);
$('animate-exit').onclick=()=>preview('exit');
$('person-enabled').onchange=()=>{draft.enabled=$('person-enabled').checked;mark();};
$('person-custom').onchange=()=>{draft.custom=$('person-custom').checked;$('theme-controls').disabled=!draft.custom;$('reset').disabled=!draft.custom;fillStyle();mark();preview();};
$('description').oninput=()=>{draft.description=$('description').value;$('description-count').textContent=draft.description.length+' / 140';mark();preview();};
$('test-selected').onclick=()=>void testUser(selected,$('test-selected'));
$('reset').onclick=()=>{draft.style.palettes[draft.style.design]=structuredClone(state.paletteDefaults[draft.style.design]);fillStyle();mark();preview();};
$('global-enabled').onchange=async()=>{const input=$('global-enabled');input.disabled=true;try{const next=await api('config',{account:state.account,enabled:input.checked,style:state.config.style});state=next;notice(input.checked?'Показ включён':'Показ выключен');}catch(error){input.checked=state.config.enabled;notice(error.message,true);}finally{input.disabled=false;}};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('source-url').value);notice('URL скопирован');}catch{$('source-url').select();document.execCommand('copy');notice('URL выбран для копирования');}};
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
async function init(){state=await api('config');for(const [key,label]of state.paletteFields)field('colors',key,label,'color');for(const design of state.designs){const button=document.createElement('button');button.type='button';button.dataset.design=design.id;button.setAttribute('aria-pressed','false');const icon=document.createElement('i');icon.dataset.lucide={air:'radio',pass:'contact-round',sticker:'sticker'}[design.id];const name=document.createElement('span');name.textContent=design.name;button.append(icon,name);button.onclick=()=>{draft.style.design=design.id;fillStyle();mark();preview();};$('designs').append(button);}field('typography','font','Шрифт','select',state.fonts.map(f=>[f,f]));field('motion','effect','Появление','select',state.effects.map(e=>[e,effectNames[e]]));field('motion','exitEffect','Уход','select',state.exitEffects.map(e=>[e,exitNames[e]]));$('source-url').value=state.url;$('source-size').textContent=BadgeView.dimensions.width+' × '+BadgeView.dimensions.height;$('global-enabled').checked=state.config.enabled;select(selected,true);icons();}
init().catch(error=>{$('save').disabled=true;$('global-enabled').disabled=true;notice(error.message,true);});
