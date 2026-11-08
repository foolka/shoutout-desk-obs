const EFFECTS=['fade','left','right','up','down','zoom','pop','flip','tilt','blur'];
const FONTS=['Segoe UI','Arial','Verdana','Tahoma','Trebuchet MS','Georgia','Impact','Courier New'];
const STAMP_POSITIONS=['top-right','top-left','bottom-right','bottom-left'];
const CUSTOM=require('./web/custom-template.js');
const DESIGNS=[{id:'air',name:'Эфир'},{id:'pass',name:'Пропуск'},{id:'sticker',name:'Стикер'},{id:'terminal',name:'Терминал'},{id:'ticket',name:'Билет'},{id:'frame',name:'Портрет'},{id:'custom',name:'Свой HTML / CSS'}];
const PALETTES={
  air:{background1:'#fcfcfb',background2:'#fcfcfb',surfaceColor:'#fcfcfb',borderColor:'#d7dcd8',accentColor:'#cf5046',accentTextColor:'#ffffff',textColor:'#252a29',descriptionColor:'#303931',mutedColor:'#647169',avatarBackground:'#77a998',avatarBorderColor:'#ffffff',shadowColor:'#b4c7bb',stampColor:'#c63d3a'},
  pass:{background1:'#262a27',background2:'#262a27',surfaceColor:'#30372c',borderColor:'#626b60',accentColor:'#d6ee9f',accentTextColor:'#252d1c',textColor:'#f4f7ef',descriptionColor:'#e0e7d6',mutedColor:'#b2be9f',avatarBackground:'#77a998',avatarBorderColor:'#879875',shadowColor:'#8ca875',stampColor:'#d6ee9f'},
  sticker:{background1:'#ffffff',background2:'#ffffff',surfaceColor:'#ffffff',borderColor:'#29342e',accentColor:'#e7f8c3',accentTextColor:'#253222',textColor:'#253222',descriptionColor:'#303931',mutedColor:'#51684f',avatarBackground:'#77a998',avatarBorderColor:'#ffffff',shadowColor:'#29342e',stampColor:'#d64841'},
  terminal:{background1:'#172724',background2:'#172724',surfaceColor:'#203832',borderColor:'#4e8b78',accentColor:'#91edba',accentTextColor:'#142720',textColor:'#f2fff8',descriptionColor:'#def2e6',mutedColor:'#a6c8b8',avatarBackground:'#31554b',avatarBorderColor:'#91edba',shadowColor:'#0b1713',stampColor:'#e8b94f'},
  ticket:{background1:'#fff6f7',background2:'#fff6f7',surfaceColor:'#fff6f7',borderColor:'#9f3859',accentColor:'#a62f55',accentTextColor:'#ffffff',textColor:'#612539',descriptionColor:'#55303d',mutedColor:'#945a6c',avatarBackground:'#f1bfcc',avatarBorderColor:'#ffffff',shadowColor:'#d6b2bd',stampColor:'#ba344d'},
  frame:{background1:'#ffffff',background2:'#f0f4fa',surfaceColor:'#ffffff',borderColor:'#4a6382',accentColor:'#365a86',accentTextColor:'#ffffff',textColor:'#263c59',descriptionColor:'#35465c',mutedColor:'#67768b',avatarBackground:'#d4e2ef',avatarBorderColor:'#ffffff',shadowColor:'#bccada',stampColor:'#b33b45'},
};
const PALETTE_FIELDS=[['background1','Фон: начало'],['background2','Фон: конец'],['surfaceColor','Панель описания'],['borderColor','Рамка и разделители'],['accentColor','Акцент'],['accentTextColor','Текст на акценте'],['textColor','Ник'],['descriptionColor','Описание'],['mutedColor','Подписи'],['avatarBackground','Фон аватара'],['avatarBorderColor','Рамка аватара'],['shadowColor','Тень']];
const DEFAULT_STYLE={design:'air',palettes:PALETTES,paddingX:28,paddingY:20,radius:8,borderWidth:1,borderColor:'#f5b85b',background1:'#386b63',background2:'#183c4d',angle:120,textColor:'#ffffff',descriptionColor:'#dfeee8',font:'Segoe UI',fontSize:32,descriptionSize:18,avatarSize:96,gap:20,effect:'pop',exitEffect:'fade',duration:8,stampEnabled:true,stampText:'СТРИМЕР',stampPosition:'top-right',stampAngle:-14,stampColor:'#ed3d4d',stampSize:136,stampFontSize:22,
  width:420,backgroundOpacity:100,shadowOpacity:100,shadowBlur:0,shadowOffset:8,borderStyle:'solid',avatarShape:'theme',avatarBorderScale:100,fontWeight:750,descriptionWeight:400,showHeader:true,showHandle:true,showFooter:true,headerText:'',footerText:'',stampOffsetX:0,stampOffsetY:0,stampOpacity:100,customHtml:CUSTOM.html,customCss:CUSTOM.css};
const numbers={paddingX:[4,48],paddingY:[4,32],radius:[0,80],borderWidth:[0,12],angle:[0,360],fontSize:[16,48],descriptionSize:[12,26],avatarSize:[32,120],gap:[4,36],duration:[2,30],stampAngle:[-45,45],stampSize:[80,240],stampFontSize:[10,42],width:[320,460],backgroundOpacity:[0,100],shadowOpacity:[0,100],shadowBlur:[0,24],shadowOffset:[0,16],avatarBorderScale:[0,200],fontWeight:[400,900],descriptionWeight:[400,900],stampOffsetX:[-60,60],stampOffsetY:[-60,60],stampOpacity:[0,100]};
function palettes(value={},base=PALETTES){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректные палитры.');
  const result=structuredClone(base);
  for(const [design,colors] of Object.entries(value)){
    if(!Object.hasOwn(PALETTES,design)||!colors||typeof colors!=='object'||Array.isArray(colors))throw Error('Неизвестный вариант бейджика.');
    for(const [key,color] of Object.entries(colors)){
      if(!Object.hasOwn(PALETTES[design],key)||typeof color!=='string'||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Некорректный цвет палитры.');
      result[design][key]=color;
    }
  }
  return result;
}
function style(value={},previous){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректная тема.');
  const result=previous===undefined?structuredClone(DEFAULT_STYLE):style(previous);
  for(const [key,v] of Object.entries(value)){
    if(!Object.hasOwn(result,key))throw Error('Неизвестный параметр оформления.');
    if(key==='palettes'){result.palettes=palettes(v,result.palettes);continue;}
    if(key==='design'){if(!DESIGNS.some(design=>design.id===v))throw Error('Неизвестный вариант бейджика.');}
    else if(Object.hasOwn(CUSTOM.limits,key)){if(typeof v!=='string'||v.length>CUSTOM.limits[key]||v.includes('\0'))throw Error('HTML и CSS: до 32768 символов в каждом поле, без нулевых символов.');}
    else if(numbers[key]){const [min,max]=numbers[key];if(!Number.isInteger(v)||v<min||v>max)throw Error('Значение вне диапазона: '+key);}
    else if(['stampEnabled','showHeader','showHandle','showFooter'].includes(key)){if(typeof v!=='boolean')throw Error('Некорректный переключатель оформления.');}
    else if(key==='borderStyle'){if(!['solid','dashed','dotted','double'].includes(v))throw Error('Неизвестный стиль рамки.');}
    else if(key==='avatarShape'){if(!['theme','circle','rounded','square'].includes(v))throw Error('Неизвестная форма аватара.');}
    else if(key==='headerText'||key==='footerText'){if(typeof v!=='string'||v.length>48||/[\u0000-\u001f\u007f]/.test(v))throw Error('Подпись: до 48 символов.');}
    else if(key==='stampText'){if(typeof v!=='string'||v.length>32||/[\u0000-\u001f\u007f]/.test(v))throw Error('Текст штампа: до 32 символов.');}
    else if(key==='stampPosition'){if(!STAMP_POSITIONS.includes(v))throw Error('Неизвестная позиция штампа.');}
    else if(key==='effect'||key==='exitEffect'){if(!EFFECTS.includes(v))throw Error('Неизвестный эффект.');}
    else if(key==='font'){if(!FONTS.includes(v))throw Error('Неизвестный шрифт.');}
    else if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw Error('Некорректный цвет.');
    result[key]=v;
  }
  return result;
}
function person(value={},previousStyle){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректные настройки стримера.');
  if(typeof value.enabled!=='boolean'||typeof value.custom!=='boolean'||typeof value.description!=='string'||value.description.length>140)throw Error('Описание: до 140 символов.');
  return {enabled:value.enabled,custom:value.custom,description:value.description.replace(/[\u0000-\u001f\u007f]/g,' ').trim(),style:style(value.style,previousStyle)};
}
const DEFAULT_PERSON={enabled:true,custom:false,description:''};
module.exports={EFFECTS,FONTS,STAMP_POSITIONS,DESIGNS,PALETTES,PALETTE_FIELDS,DEFAULT_STYLE,DEFAULT_PERSON,style,person};
