const badge=new BadgeView(document.getElementById('stage'));
const key=location.pathname.split('/').pop();let last='';
const client=crypto.randomUUID(),build=document.querySelector('meta[name="badge-build"]').content;
async function poll(){
  try{
    const response=await fetch('/api/view/'+key+'?'+new URLSearchParams({client,build}),{cache:'no-store',signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw Error('Unavailable');const data=await response.json(),event=data.event;
    if(data.build&&data.build!==build){location.reload();return;}
    if(!event){badge.hide();last='';}
    else if(event.id!==last){last=event.id;badge.play(event,Math.max(0,data.now-event.startsAt));}
  }catch{badge.hide();last='';}
  setTimeout(poll,350);
}
poll();
