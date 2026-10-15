(() => {
  const animations={
    fade:[{opacity:0},{opacity:1}],
    left:[{opacity:0,transform:'translateX(-150px)'},{opacity:1,transform:'translateX(0)'}],
    right:[{opacity:0,transform:'translateX(150px)'},{opacity:1,transform:'translateX(0)'}],
    up:[{opacity:0,transform:'translateY(100px)'},{opacity:1,transform:'translateY(0)'}],
    down:[{opacity:0,transform:'translateY(-100px)'},{opacity:1,transform:'translateY(0)'}],
    zoom:[{opacity:0,transform:'scale(.65)'},{opacity:1,transform:'scale(1)'}],
    pop:[{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1.045)',offset:.72},{opacity:1,transform:'scale(1)'}],
    flip:[{opacity:0,transform:'perspective(800px) rotateX(-75deg)'},{opacity:1,transform:'perspective(800px) rotateX(0)'}],
    tilt:[{opacity:0,transform:'translateY(50px) rotate(-8deg) scale(.9)'},{opacity:1,transform:'translateY(0) rotate(0) scale(1)'}],
    blur:[{opacity:0,filter:'blur(12px)',transform:'scale(.95)'},{opacity:1,filter:'blur(0)',transform:'scale(1)'}]
  };
  const exits={
    fade:[{opacity:1},{opacity:0}],
    left:[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(-150px)'}],
    right:[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(150px)'}],
    up:[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-100px)'}],
    down:[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(100px)'}],
    zoom:[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.65)'}],
    pop:[{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(1.045)',offset:.28},{opacity:0,transform:'scale(.6)'}],
    flip:[{opacity:1,transform:'perspective(800px) rotateX(0)'},{opacity:0,transform:'perspective(800px) rotateX(75deg)'}],
    tilt:[{opacity:1,transform:'translateY(0) rotate(0) scale(1)'},{opacity:0,transform:'translateY(50px) rotate(8deg) scale(.9)'}],
    blur:[{opacity:1,filter:'blur(0)',transform:'scale(1)'},{opacity:0,filter:'blur(12px)',transform:'scale(.95)'}]
  };
  class BadgeView {
    static dimensions=Object.freeze({width:560,height:560});
    constructor(root){
      this.root=root;this.space=document.createElement('div');this.space.className='badge-space';
      this.card=document.createElement('div');this.card.className='shoutout-badge';this.card.hidden=true;
      this.avatar=document.createElement('div');this.avatar.className='badge-avatar';this.fallback=document.createElement('span');this.image=document.createElement('img');this.image.alt='';this.image.referrerPolicy='no-referrer';
      this.image.onerror=()=>{this.image.hidden=true;};this.image.onload=()=>{this.image.hidden=false;};this.avatar.append(this.fallback,this.image);
      this.header=document.createElement('div');this.header.className='badge-header';this.headerLeft=document.createElement('span');this.headerRight=document.createElement('span');this.header.append(this.headerLeft,this.headerRight);
      const copy=document.createElement('div');copy.className='badge-copy';this.name=document.createElement('div');this.name.className='badge-name';this.description=document.createElement('div');this.description.className='badge-description';this.handle=document.createElement('div');this.handle.className='badge-handle';copy.append(this.name,this.handle,this.description);
      this.nameText=document.createElement('span');this.nameText.className='badge-name-text';this.name.append(this.nameText);
      this.footer=document.createElement('div');this.footer.className='badge-footer';this.footer.textContent='СВОИ ЛЮДИ';
      this.card.append(this.header,this.avatar,copy,this.footer);this.space.append(this.card);root.replaceChildren(this.space);
      this.stampSlot=document.createElement('div');this.stampSlot.className='badge-stamp-slot';this.stamp=document.createElement('div');this.stamp.className='badge-stamp';this.stampText=document.createElement('span');this.stamp.append(this.stampText);this.stampSlot.append(this.stamp);this.card.append(this.stampSlot);
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(root);
    }
    resize(){const {width,height}=BadgeView.dimensions,scale=Math.min(this.root.clientWidth/width,this.root.clientHeight/height);this.space.style.transform=`scale(${scale})`;this.space.style.left=(this.root.clientWidth-width*scale)/2+'px';this.space.style.top=(this.root.clientHeight-height*scale)/2+'px';}
    render(data){
      this.stop();const s={stampEnabled:true,stampText:'СТРИМЕР',stampPosition:'top-right',stampAngle:-14,stampColor:'#ed3d4d',stampSize:164,stampFontSize:24,...data.style};
      const design=['air','pass','sticker'].includes(s.design)?s.design:'air',p=s.palettes?.[design]||s;
      this.card.dataset.design=design;
      const vars={'--px':s.paddingX+'px','--py':s.paddingY+'px','--radius':s.radius+'px','--border':s.borderWidth+'px','--border-color':p.borderColor,'--bg1':p.background1,'--bg2':p.background2,'--angle':s.angle+'deg','--color':p.textColor,'--description-color':p.descriptionColor,'--surface':p.surfaceColor||p.background1,'--accent':p.accentColor||s.borderColor,'--accent-text':p.accentTextColor||s.textColor,'--muted':p.mutedColor||s.descriptionColor,'--avatar-bg':p.avatarBackground||s.background1,'--avatar-border':p.avatarBorderColor||s.borderColor,'--shadow':p.shadowColor||s.borderColor,'--font':s.font,'--name-size':s.fontSize+'px','--description-size':(s.descriptionSize*1.5)+'px','--avatar':s.avatarSize+'px','--gap':s.gap+'px'};
      for(const [name,value]of Object.entries(vars))this.card.style.setProperty(name,value);
      this.headerLeft.textContent=design==='pass'?'COMMUNITY':'ЗНАКОМЬТЕСЬ';this.headerRight.textContent=design==='pass'?'ALL ACCESS':'';this.handle.textContent='twitch.tv/'+String(data.login||'streamer');
      this.nameText.textContent=data.name||data.login;this.description.textContent=String(data.description||'').trim();this.fallback.textContent=(data.name||data.login||'?').slice(0,1).toUpperCase();
      this.image.hidden=true;const url=data.avatar||'';if(url&&this.image.getAttribute('src')!==url)this.image.src=url;else if(url&&this.image.complete&&this.image.naturalWidth)this.image.hidden=false;else if(!url)this.image.removeAttribute('src');
      this.card.hidden=false;this.resize();
      this.stampText.textContent=s.stampText;this.stampSlot.hidden=!s.stampEnabled||!s.stampText.trim();
      this.stampSlot.dataset.position=s.stampPosition;
      this.stampSlot.style.removeProperty('top');
      this.stamp.style.color=p.stampColor||s.stampColor;this.stamp.style.setProperty('--stamp-angle',s.stampAngle+'deg');
      const radians=Math.abs(s.stampAngle)*Math.PI/180;
      const stampHeight=size=>size*(Math.sin(radians)+.34*Math.cos(radians));
      const stampSize=s.stampSize;
      let nameSize=s.fontSize,descSize=s.descriptionSize*1.5;
      // Measure unscaled text so the same nickname fits in both the editor and OBS.
      const nameStyle=getComputedStyle(this.name),nameWidth=this.name.clientWidth-parseFloat(nameStyle.paddingLeft)-parseFloat(nameStyle.paddingRight)-1;
      while(this.nameText.scrollWidth>nameWidth&&nameSize>1){nameSize=Math.max(1,Math.min(nameSize-.25,Math.floor(nameSize*nameWidth/this.nameText.scrollWidth*4)/4));this.card.style.setProperty('--name-size',nameSize+'px');}
      // Fit long descriptions without raising an already reduced nickname size.
      while(this.card.offsetHeight>492&&(nameSize>16||descSize>18)){if(nameSize>16)nameSize=Math.max(16,nameSize-1);if(descSize>18)descSize=Math.max(18,descSize-1);this.card.style.setProperty('--name-size',nameSize+'px');this.card.style.setProperty('--description-size',descSize+'px');}
      let gap=s.gap,padding=s.paddingY,avatar=s.avatarSize;
      while(this.card.offsetHeight>492&&(gap>4||padding>4||avatar>40)){gap=Math.max(4,gap-1);padding=Math.max(4,padding-1);avatar=Math.max(40,avatar-2);this.card.style.setProperty('--gap',gap+'px');this.card.style.setProperty('--py',padding+'px');this.card.style.setProperty('--avatar',avatar+'px');}
      this.stampSlot.style.width=(stampSize*(Math.cos(radians)+.34*Math.sin(radians)))+'px';
      this.stampSlot.style.height=stampHeight(stampSize)+'px';
      if(design==='sticker'&&s.stampPosition.startsWith('top')){
        const offset=parseFloat(getComputedStyle(this.card).getPropertyValue('--sticker-header-offset'));
        const corner=(s.stampPosition.endsWith('left')?1:-1)*Math.sin(3*Math.PI/180)*this.name.offsetWidth/2;
        const top=this.name.offsetTop+offset+corner+16-stampHeight(stampSize);
        this.stampSlot.style.top=Math.max(8-this.card.offsetTop,top)+'px';
      }
      this.stamp.style.setProperty('--stamp-size',stampSize+'px');
      let stampFont=s.stampFontSize;this.stampText.style.fontSize=stampFont+'px';
      while(!this.stampSlot.hidden&&(this.stampText.scrollWidth>this.stampText.clientWidth||this.stampText.scrollHeight>this.stamp.clientHeight-12)&&stampFont>3){stampFont-=.5;this.stampText.style.fontSize=stampFont+'px';}
    }
    play(data,elapsed=0){
      this.render(data);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const frames=animations[reduced?'fade':data.style.effect]||animations.fade;
      const exitFrames=exits[reduced?'fade':data.style.exitEffect]||exits.fade;
      const exitAt=data.style.duration*1000+650,total=exitAt+300;
      elapsed=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
      if(elapsed>=total){this.hide();return;}
      const leave=(offset=0)=>{this.animation?.cancel();this.animation=this.card.animate(exitFrames,{duration:300,easing:'ease-in',fill:'both'});this.animation.currentTime=offset;};
      // A reloaded source may join during the exit; resume that phase without flashing the full badge.
      if(elapsed>=exitAt)leave(elapsed-exitAt);
      else{
        this.animation=this.card.animate(frames,{duration:650,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'});this.animation.currentTime=Math.min(elapsed,650);
        this.exitTimer=setTimeout(()=>leave(),exitAt-elapsed);
      }
      this.hideTimer=setTimeout(()=>this.hide(),total-elapsed);
    }
    stop(){clearTimeout(this.exitTimer);clearTimeout(this.hideTimer);this.animation?.cancel();this.animation=null;}
    hide(){this.stop();this.card.hidden=true;}
  }
  window.BadgeView=BadgeView;
})();
