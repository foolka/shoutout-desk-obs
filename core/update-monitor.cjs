const {checkUpdate,newer,REPO}=require('./update.cjs');
const DAY=24*3600000;
class UpdateMonitor{
  constructor(store,version,onChange=()=>{},check=checkUpdate){
    Object.assign(this,{store,version,onChange,check});this.stopped=false;this.pending=null;
    const cached=store.meta('availableUpdate',null);
    try{this.release=cached?.url===`https://github.com/${REPO}/releases/tag/${cached.version}`&&newer(cached.version,version)?cached:null;}catch{this.release=null;}
  }
  view(){return this.release;}
  async refresh(force=false){
    if(this.stopped||(!force&&!this.store.prefs().autoUpdates))return null;
    if(this.pending)return this.pending;
    if(!force&&this.store.meta('nextUpdateCheck',0)>this.store.now())return this.release;
    this.pending=(async()=>{
      try{
        const result=await this.check(this.version);
        if(this.stopped)return null;
        this.store.setMeta('nextUpdateCheck',this.store.now()+DAY);
        this.release=result.available?result:null;
        this.store.setMeta('availableUpdate',this.release);this.onChange(this.release);return result;
      }catch(error){
        if(!this.stopped)this.store.setMeta('nextUpdateCheck',this.store.now()+3600000);
        if(force)throw error;return null;
      }finally{this.pending=null;}
    })();
    return this.pending;
  }
  start(){
    this.timer=setTimeout(()=>void this.refresh(),15000);this.timer.unref?.();
    this.interval=setInterval(()=>void this.refresh(),3600000);this.interval.unref?.();
  }
  stop(){this.stopped=true;clearTimeout(this.timer);clearInterval(this.interval);}
}
module.exports={UpdateMonitor};
