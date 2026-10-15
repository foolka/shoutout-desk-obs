const badge=new BadgeView(document.getElementById('stage'));
const key=location.pathname.split('/').pop();let last='';
async function poll(){
  try{
    const response=await fetch('/api/view/'+key,{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw Error('Unavailable');const data=await response.json(),event=data.event;
    if(!event){badge.hide();last='';}
    else if(event.id!==last){last=event.id;badge.play(event,Math.max(0,data.now-event.startsAt));}
  }catch{badge.hide();last='';}
  setTimeout(poll,350);
}
poll();
