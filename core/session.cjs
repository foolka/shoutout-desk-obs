const HOUR_MS=60*60*1000;
const HEARTBEAT_MS=30000;

class ObsSession {
  constructor(store){
    this.store=store;
    const previous=store.meta('obsSession',null),now=store.now(),account=store.lastAccount().id;
    const reference=previous?.closedAt??(previous?.lastSeenAt+HEARTBEAT_MS);
    this.didReset=!!(account&&previous?.account===account&&previous.resetAfterLongClose&&store.prefs().resetAfterLongClose&&
      Number.isSafeInteger(reference)&&reference>0&&now-reference>HOUR_MS&&store.resetCooldowns(account));
    this.touch();
  }
  touch(closed=false){
    const {store}=this,now=store.now();
    store.setMeta('obsSession',{account:store.lastAccount().id,lastSeenAt:now,closedAt:closed?now:null,resetAfterLongClose:store.prefs().resetAfterLongClose});
  }
  close(){this.touch(true);}
}
module.exports={ObsSession,HOUR_MS,HEARTBEAT_MS};
