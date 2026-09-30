const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TwitchAuth,SCOPES,clientId,verificationUrl,loadSdk}=require('../core/twitch-auth.cjs');
const {DirectBridge}=require('../core/twitch-direct.cjs');
const CLIENT='a'.repeat(30),token={accessToken:'private-access',refreshToken:'private-refresh',scope:SCOPES};
const saved=()=>({clientId:CLIENT,user:{id:'actor',login:'owner'},token:{...token}});
function authFixture(t,overrides={}){
  const writes=[];let now=1800000000000;
  const sdk={
    startDeviceCodeFlow:async()=>({deviceCode:'private-device',userCode:'ABCD',verificationUri:'https://www.twitch.tv/activate',expiresIn:1800,interval:1}),
    exchangeDeviceCode:async()=>token,
    getTokenInfo:async()=>({clientId:CLIENT,userId:'actor',userName:'owner',scopes:SCOPES}),...overrides,
  };
  const auth=new TwitchAuth({sdk:async()=>sdk,save:value=>writes.push(value),now:()=>now});
  t.after(()=>auth.dispose());return {auth,writes,sdk,advance:ms=>now+=ms};
}
test('installed SDK exports public-client auth, API and EventSub classes',async()=>{
  const sdk=await loadSdk();for(const key of ['startDeviceCodeFlow','exchangeDeviceCode','RefreshingAuthProvider','ApiClient','EventSubWsListener'])assert.equal(typeof sdk[key],'function');
  const provider=new sdk.RefreshingAuthProvider({clientId:CLIENT});assert.ok(provider);
  for(const key of ['onChannelChatMessage','onChannelShoutoutCreate','onChannelRaidTo'])assert.equal(typeof sdk.EventSubWsListener.prototype[key],'function');
});
test('OAuth accepts only public client ID shape and official activation URL',()=>{
  assert.equal(clientId(' '+CLIENT+' '),CLIENT);assert.throws(()=>clientId('secret?=token'));
  for(const url of ['http://www.twitch.tv/activate','https://evil.test/activate','https://www.twitch.tv/other'])assert.throws(()=>verificationUrl(url));
});
test('real SDK public-data endpoints accept explicit user context without an app token',async()=>{
  const sdk=await loadSdk(),seen=[],marker=Error('stop before network');
  const api=new sdk.ApiClient({authProvider:{clientId:CLIENT,getAnyAccessToken:async user=>{seen.push(user);throw marker;},getAppAccessToken:async()=>{throw Error('Client Secret must not be needed');}}});
  await assert.rejects(api.asUser('actor',ctx=>ctx.streams.getStreamByUserId('other_channel')),error=>error===marker);
  await assert.rejects(api.asUser('actor',ctx=>ctx.users.getUserByName('viewer')),error=>error===marker);
  assert.deepEqual(seen,['actor','actor']);
});
test('device login stores credentials but never exposes tokens or device code to UI',async t=>{
  const {auth,writes}=authFixture(t);await auth.start(CLIENT);
  assert.equal(auth.pending.interval,5000);assert.equal(auth.view().pending.code,'ABCD');
  assert.ok(!JSON.stringify(auth.view()).includes('private'));
  await auth.poll();assert.equal(writes.length,1);assert.equal(auth.view().user.login,'owner');assert.equal(auth.view().pending,null);
  assert.ok(!JSON.stringify(auth.view()).includes('private'));
});

test('an unfinished device login survives disposal and resumes after restart without another browser login',async t=>{
  const f=authFixture(t);let diskPending=null,diskAuth=null;
  f.auth.savePending=value=>{diskPending=structuredClone(value);};
  await f.auth.start(CLIENT);assert.ok(diskPending.deviceCode);f.auth.dispose();assert.ok(diskPending);
  const next=new TwitchAuth({pending:diskPending,savePending:v=>{diskPending=v;},save:v=>{diskAuth=v;},sdk:async()=>f.sdk,now:f.auth.now});
  t.after(()=>next.dispose());assert.ok(!JSON.stringify(next.view()).includes('private-device'));
  await next.poll();assert.equal(next.view().user.login,'owner');assert.equal(diskPending,null);assert.ok(diskAuth.token);
  const third=new TwitchAuth({saved:diskAuth,save:()=>{}});assert.equal(third.view().user.login,'owner');third.dispose();
});

test('expired or foreign pending login cannot resume and cancellation forgets it',async t=>{
  const f=authFixture(t);let pending;
  f.auth.savePending=value=>{pending=structuredClone(value);};await f.auth.start(CLIENT);const original=pending;
  f.auth.cancel();assert.equal(pending,null);
  for(const bad of [{...original,expiresAt:1},{...original,url:'https://invalid.example/activate'}]){
    let cleared=false;const auth=new TwitchAuth({pending:bad,save:()=>{},savePending:v=>{cleared=v===null;},now:f.auth.now});
    assert.equal(auth.pending,null);assert.equal(cleared,true);auth.dispose();
  }
});
test('pending and slow-down keep polling; expired device code stops',async t=>{
  let message='authorization_pending';const {auth,advance}=authFixture(t,{exchangeDeviceCode:async()=>{throw {statusCode:400,body:{message}};}});
  await auth.start(CLIENT);await auth.poll();assert.ok(auth.pending);message='slow_down';await auth.poll();assert.equal(auth.pending.interval,10000);
  advance(1800001);await auth.poll();assert.equal(auth.pending,null);
});
test('cancelled login ignores a late token response',async t=>{
  let resolve;const {auth,writes}=authFixture(t,{exchangeDeviceCode:()=>new Promise(r=>resolve=r)});await auth.start(CLIENT);
  const pending=auth.poll();await new Promise(setImmediate);auth.cancel();resolve(token);await pending;assert.equal(writes.length,0);assert.equal(auth.saved,null);
});
test('wrong client or missing scopes cannot be saved',async t=>{
  for(const info of [{clientId:'other',userId:'actor',scopes:SCOPES},{clientId:CLIENT,userId:'actor',scopes:[]}]){
    const {auth,writes}=authFixture(t,{getTokenInfo:async()=>info});await auth.start(CLIENT);await auth.poll();assert.equal(writes.length,0);assert.equal(auth.pending,null);
  }
});
test('vault error terminates device flow instead of retrying an already consumed code',async t=>{
  const {auth}=authFixture(t);auth.save=()=>{throw Error('disk error');};await auth.start(CLIENT);await auth.poll();assert.equal(auth.pending,null);assert.match(auth.message,/хранилище/);
});
test('token refresh persists after closing wizard; stale refresh after logout is ignored',async t=>{
  let provider;
  class Provider{
    constructor(options){assert.deepEqual(options,{clientId:CLIENT});provider=this;}
    onRefresh(cb){this.refresh=cb;} onRefreshFailure(cb){this.failure=cb;}
    addUser(){} async refreshAccessTokenForUser(){return token;} async getAccessTokenForUser(){return token;}
  }
  const {auth,writes}=authFixture(t,{RefreshingAuthProvider:Provider});auth.saved=saved();await auth.getProvider();auth.cancel();
  provider.refresh('actor',{...token,refreshToken:'rotated'});assert.equal(writes.at(-1).token.refreshToken,'rotated');
  auth.logout();const count=writes.length;provider.refresh('actor',token);assert.equal(writes.length,count);assert.equal(auth.saved,null);
});
test('failed refresh closes authorization until a new login',async t=>{
  let provider;
  class Provider{constructor(){provider=this;}onRefresh(){}onRefreshFailure(cb){this.failure=cb;}addUser(){}async refreshAccessTokenForUser(){return token;}async getAccessTokenForUser(){return token;}}
  const {auth}=authFixture(t,{RefreshingAuthProvider:Provider});auth.saved=saved();await auth.getProvider();provider.failure('actor',{statusCode:400,body:{message:'Invalid refresh token'}});assert.equal(auth.invalid,true);await assert.rejects(auth.getProvider());
});
test('logout during provider initialization cannot restore the old session',async t=>{
  let resolve;
  class Provider{onRefresh(){}onRefreshFailure(){}addUser(){}async refreshAccessTokenForUser(){return token;}async getAccessTokenForUser(){return token;}}
  const {auth,writes}=authFixture(t,{RefreshingAuthProvider:Provider,getTokenInfo:()=>new Promise(r=>resolve=r)});auth.saved=saved();const pending=auth.getProvider();await new Promise(setImmediate);auth.logout();resolve({userId:'actor',clientId:CLIENT,scopes:SCOPES});await assert.rejects(pending);assert.equal(writes.at(-1),null);assert.equal(auth.saved,null);
});
function directFixture(t,{role='streamer',channel='actor',moderated=['channel'],response=204,live=true}={}){
  let listener;const requests=[],observed=[],subs=[];let refreshes=0;
  class Listener{
    constructor(){listener=this;}
    onSubscriptionCreateSuccess(cb){this.success=cb;} onSubscriptionCreateFailure(cb){this.failure=cb;}
    onRevoke(cb){this.revoke=cb;} onUserSocketDisconnect(cb){this.disconnect=cb;}
    onChannelChatMessage(broadcaster,actor,cb){this.chat=cb;this.chatArgs=[broadcaster,actor];const sub={chat:true};subs.push(sub);return sub;}
    onChannelShoutoutCreate(broadcaster,actor,cb){this.shout=cb;this.shoutArgs=[broadcaster,actor];const sub={shout:true};subs.push(sub);return sub;}
    onChannelRaidTo(broadcaster,cb){this.raid=cb;this.raidArgs=[broadcaster];const sub={raid:true};subs.push(sub);return sub;}
    start(){}stop(){this.stopped=true;}
  }
  class Api{
    get streams(){throw Error('Use explicit user context for a public OAuth client');}
    get users(){throw Error('Use explicit user context for a public OAuth client');}
    async asUser(actor,runner){assert.equal(actor,'actor');return runner({streams:{getStreamByUserId:async()=>live?{id:'stream'}:null},users:{getUserByName:async name=>({id:'recipient',name})}});}
  }
  const provider={getAccessTokenForUser:async()=>token,refreshAccessTokenForUser:async()=>{refreshes++;return {accessToken:'fresh'};}};
  const auth={saved:saved(),getProvider:async()=>provider,validate:async()=>{},channels:async()=>moderated.map(id=>({id}))};
  const bridge=new DirectBridge({auth,target:{id:channel,login:'owner'},role,store:{observeShoutout:(...args)=>observed.push(args)},sdk:async()=>({ApiClient:Api,EventSubWsListener:Listener}),fetchImpl:async(url,options)=>{requests.push({url,options});if(response instanceof Error)throw response;return {status:Array.isArray(response)?response.shift():response};}});
  t.after(()=>bridge.close());return {bridge,auth,requests,observed,subs,get listener(){return listener;},get refreshes(){return refreshes;},async ready(){await bridge.connect();for(const sub of subs)listener.success(sub);}};
}
test('direct connection waits for all three subscriptions and refuses another broadcaster',async t=>{
  const f=directFixture(t);let ready=0;f.bridge.on('ready',()=>ready++);await f.bridge.connect();
  assert.deepEqual(f.listener.chatArgs,['actor','actor']);assert.deepEqual(f.listener.raidArgs,['actor']);f.listener.success(f.subs[0]);assert.equal(ready,0);f.listener.success(f.subs[1]);assert.equal(ready,0);f.listener.success(f.subs[2]);assert.equal(ready,1);
  const bad=directFixture(t,{channel:'other'});await bad.bridge.connect();assert.equal(bad.listener,undefined);assert.equal(bad.requests.length,0);
});
test('direct subscription forwards chat and records observed shoutouts without posting',async t=>{
  const f=directFixture(t);await f.ready();let chat;f.bridge.on('event',(_type,data)=>chat=data);
  f.listener.chat({chatterId:'u',chatterName:'viewer',broadcasterId:'actor',sourceBroadcasterId:'guest'});assert.equal(chat.user.login,'viewer');assert.equal(chat.sharedChatSource.id,'guest');
  f.listener.shout({broadcasterId:'actor',shoutedOutBroadcasterName:'viewer',startDate:new Date(1800000000000)});assert.deepEqual(f.observed,[['actor','viewer',1800000000000]]);assert.equal(f.requests.length,0);
});
test('incoming raids forward only for the current broadcaster and live connection',async t=>{
  const f=directFixture(t);await f.ready();const events=[];f.bridge.on('event',(...args)=>events.push(args));
  const event={raidedBroadcasterId:'actor',raidingBroadcasterId:'raider-id',raidingBroadcasterName:'raider'};
  f.listener.raid({...event,raidedBroadcasterId:'other'});assert.equal(events.length,0);
  f.listener.raid(event);assert.deepEqual(events,[['Raid',{raider:{id:'raider-id',login:'raider'},broadcaster:{id:'actor'}}]]);
  f.listener.disconnect();f.listener.raid(event);assert.equal(events.length,1);
  const old=f.listener;f.bridge.reset();old.raid(event);assert.equal(events.length,1);
});

test('direct POST uses the signed-in broadcaster for both required Twitch IDs',async t=>{
  const f=directFixture(t);await f.ready();const result=await f.bridge.call('send',{account:'actor',login:'viewer'});assert.equal(result.status,'sent');assert.equal(f.requests.length,1);
  const request=f.requests[0],url=new URL(request.url);assert.equal(url.searchParams.get('from_broadcaster_id'),'actor');assert.equal(url.searchParams.get('moderator_id'),'actor');assert.equal(request.options.method,'POST');
});
test('offline and closed connections never post',async t=>{
  const f=directFixture(t,{live:false});await f.ready();assert.equal((await f.bridge.call('send',{account:'actor',login:'viewer'})).status,'offline');assert.equal(f.requests.length,0);
  f.bridge.close();await assert.rejects(f.bridge.call('send',{account:'actor',login:'viewer'}));assert.equal(f.requests.length,0);
});
test('network loss and HTTP 500 never automatically repeat a shoutout',async t=>{
  for(const response of [new Error('lost'),500]){const f=directFixture(t,{response});await f.ready();assert.equal((await f.bridge.call('send',{account:'actor',login:'viewer'})).status,'unknown');assert.equal(f.requests.length,1);}
});
test('401 allows one refresh; 429 reports rate limit; 403 stops the connection',async t=>{
  const f=directFixture(t,{response:[401,204]});await f.ready();assert.equal((await f.bridge.call('send',{account:'actor',login:'viewer'})).status,'sent');assert.equal(f.refreshes,1);assert.equal(f.requests.length,2);
  const rate=directFixture(t,{response:429});await rate.ready();assert.equal((await rate.bridge.call('send',{account:'actor',login:'viewer'})).status,'rate_limited');assert.equal(rate.requests.length,1);
  const forbidden=directFixture(t,{response:403});await forbidden.ready();assert.equal((await forbidden.bridge.call('send',{account:'actor',login:'viewer'})).status,'failed');assert.equal(forbidden.bridge.ready,false);assert.equal(forbidden.listener.stopped,true);
});
test('disconnect gates chat until all subscriptions reconnect, stale events are ignored',async t=>{
  const f=directFixture(t);await f.ready();let chats=0;f.bridge.on('event',()=>chats++);f.listener.disconnect();f.listener.chat({});assert.equal(chats,0);
  f.listener.success(f.subs[0]);assert.equal(f.bridge.ready,false);f.listener.success(f.subs[1]);assert.equal(f.bridge.ready,false);f.listener.success(f.subs[2]);assert.equal(f.bridge.ready,true);
  const old=f.listener;f.bridge.reset();old.chat({});assert.equal(chats,0);old.shout({broadcasterId:'actor'});assert.equal(f.observed.length,0);
});
test('direct send rechecks external cooldown after asynchronous token preparation',async t=>{
  const f=directFixture(t);await f.ready();let allowed=true;
  f.bridge.provider.getAccessTokenForUser=async()=>{allowed=false;return token;};
  const result=await f.bridge.call('send',{account:'actor',login:'viewer',canSend:()=>allowed});
  assert.equal(result.status,'cancelled');assert.equal(f.requests.length,0);
});
test('direct send rechecks external cooldown before a 401 retry',async t=>{
  const f=directFixture(t,{response:[401,204]});await f.ready();let allowed=true;
  f.bridge.provider.refreshAccessTokenForUser=async()=>{allowed=false;return {accessToken:'fresh'};};
  const result=await f.bridge.call('send',{account:'actor',login:'viewer',canSend:()=>allowed});
  assert.equal(result.status,'cancelled');assert.equal(f.requests.length,1);
});
