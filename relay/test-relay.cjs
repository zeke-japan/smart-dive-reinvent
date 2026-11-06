const assert=require('node:assert/strict'),{makeHandler}=require('./index.js');
let clock=1700000000000;const now=()=>clock;
const token='x.'+Buffer.from(JSON.stringify({exp:1700003600,sub:'tester'})).toString('base64url')+'.x';
const event=(path='/schedule',body,auth=token)=>({rawPath:path,requestContext:{http:{method:body===undefined?'GET':'POST'}},headers:{authorization:'Bearer '+auth},...(body===undefined?{}:{body:JSON.stringify(body)})});
const json=r=>{assert.equal(r.statusCode,200,r.body);return JSON.parse(r.body)};
function memory(){const map=new Map();return {map,async get(k){return structuredClone(map.get(k)||null)},async put(k,v,newOnly){if(newOnly&&map.has(k))return false;map.set(k,structuredClone(v));return true}}}
function fixture({mode='success',reserved=[],favorites=['new1'],reservable=true,seat='unavailable',db=memory()}={}){
 let posts=0,calls=[],ids=[...reserved],active=0,max=0;
 const request=async(url,o)=>{
  calls.push({url,o});assert.ok(url.startsWith('https://api.awsevents.com/v1/events/reinvent2026/'));assert.equal(o.redirect,'error');
  assert.ok(o.headers.Authorization.startsWith('Bearer '));
  if(url.endsWith('/reservations')){
   assert.equal(o.method,'POST');posts++;assert.deepEqual(JSON.parse(o.body),{sessionIds:['new1']});
   if(mode==='success'||mode==='lost')ids.push('new1');
   if(mode==='lost'||mode==='unknown')throw Error('private token '+token);
   return {ok:true,json:async()=>mode==='failed'?{result:{failed:[{sessionId:'new1',reason:{code:'scheduleConflict'}}]}}:{result:{succeeded:['new1'],failed:[]}}};
  }
  assert.equal(o.method,'GET');
  if(url.endsWith('/schedule')){
   if(posts&&mode==='read-fails')throw Error('private token '+token);
   return {ok:true,json:async()=>({schedule:{reserved:ids,favorites,personalTime:[]}})};
  }
  active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;
  const id=url.split('/').pop();return {ok:true,json:async()=>({session:{sessionId:id,abbreviation:id,title:'Session '+id,isReservable:reservable,seatAvailability:seat,venue:'MGM',room:'Grand 116',level:'400',abstract:'Official abstract',sessionTime:{date:'2026-11-30',time:'08:30',length:'120'}}})};
 };
 return {db,request,handler:()=>makeHandler({request,now,store:db}),posts:()=>posts,calls,max:()=>max};
}
(async()=>{
 let f=fixture({reserved:['old1','old2']});let h=f.handler();let r=json(await h(event()));assert.equal(r.sessions[0].id,'old1');assert.equal(f.max(),2);
 r=json(await h(event('/favorites')));assert.equal(r.sessions[0].reserved,false);assert.equal(r.sessions[0].room,'Grand 116');assert.equal(f.posts(),0);
 // Prepare never books; availability=unavailable stays advisory, following live 0.5.1 behavior.
 const prepared=json(await h(event('/reservation/prepare',{id:'new1'})));assert.equal(prepared.status,'confirm');assert.equal(f.posts(),0);
 // New handler simulates a cold Lambda instance. Concurrent confirmations share durable lock.
 const replies=await Promise.all([f.handler()(event('/reservation/confirm',{ticket:prepared.ticket})),f.handler()(event('/reservation/confirm',{ticket:prepared.ticket}))]);
 assert.equal(f.posts(),1);assert.ok(replies.some(x=>json(x).status==='reserved'));
 assert.equal(json(await f.handler()(event('/reservation/confirm',{ticket:prepared.ticket}))).status,'reserved');assert.equal(f.posts(),1);
 assert.equal(json(await h(event('/reservation/prepare',{id:'new1'}))).status,'reserved');
 for(const mode of ['lost','failed','unknown','read-fails']){
  f=fixture({mode});h=f.handler();const p=json(await h(event('/reservation/prepare',{id:'new1'})));
  const x=json(await h(event('/reservation/confirm',{ticket:p.ticket})));
  assert.equal(x.status,mode==='lost'?'reserved':mode==='failed'?'failed':'unknown');
  if(mode==='failed')assert.match(x.text,/scheduleConflict/);
  assert.ok(!JSON.stringify(x).includes(token));
  await f.handler()(event('/reservation/confirm',{ticket:p.ticket}));await f.handler()(event('/reservation/prepare',{id:'new1'}));assert.equal(f.posts(),1,mode);
 }
 f=fixture();h=f.handler();let p=json(await h(event('/reservation/prepare',{id:'new1'})));
 clock+=120001;assert.equal((await h(event('/reservation/confirm',{ticket:p.ticket}))).statusCode,409);assert.equal(f.posts(),0);clock-=120001;
 const other='x.'+Buffer.from(JSON.stringify({exp:1700003600,sub:'other'})).toString('base64url')+'.x';
 assert.equal((await h(event('/reservation/confirm',{ticket:p.ticket},other))).statusCode,409);assert.equal(f.posts(),0);
 // A venue/time/title change after the user read the confirmation requires a fresh confirmation.
 const original=f.request;
 const changed=makeHandler({now,store:f.db,request:async(url,o)=>{
  const r=await original(url,o);if(!url.includes('/sessions/'))return r;
  const data=await r.json();data.session.venue='Different venue';return {...r,json:async()=>data};
 }});
 assert.equal((await changed(event('/reservation/confirm',{ticket:p.ticket}))).statusCode,409);assert.equal(f.posts(),0);
 for(const setup of [{reservable:false},{seat:'walkUp'}]){f=fixture(setup);assert.equal((await f.handler()(event('/reservation/prepare',{id:'new1'}))).statusCode,409);assert.equal(f.posts(),0);}
 for(const body of [{id:'../evil'},{id:'new1',url:'https://evil'},null])assert.equal((await h(event('/reservation/prepare',body))).statusCode,400);
 for(const auth of ['', 'garbage','x.e30.x'])assert.equal((await h(event('/schedule',undefined,auth))).statusCode,401);
 for(const ev of [event('/cancel',{}),event('/schedule',{}),event('/session')])assert.equal((await h(ev)).statusCode,404);
 for(const status of [401,403,429]){let touched=false;const fail=makeHandler({now,store:{get:async()=>{touched=true}},request:async()=>({ok:false,status})});assert.equal((await fail(event('/reservation/prepare',{id:'new1'}))).statusCode,status);assert.equal(touched,false);}
 for(const ids of [['../x'],['a','a'],Array.from({length:51},(_,i)=>'id'+i)]){f=fixture({favorites:ids});assert.notEqual((await f.handler()(event('/favorites'))).statusCode,200);assert.equal(f.posts(),0);}
 // If result persistence fails, initial lock still suppresses all future upstream writes.
 const db=memory(),put=db.put.bind(db);db.put=async(k,v,newOnly)=>{if(k.startsWith('op:')&&!newOnly)throw Error('store down');return put(k,v,newOnly)};
 f=fixture({mode:'unknown',db});h=f.handler();p=json(await h(event('/reservation/prepare',{id:'new1'})));await h(event('/reservation/confirm',{ticket:p.ticket}));await f.handler()(event('/reservation/confirm',{ticket:p.ticket}));assert.equal(f.posts(),1);
 const fs=require('node:fs'),t=JSON.parse(fs.readFileSync(__dirname+'/template.json'));
 assert.equal(t.Resources.Function.Properties.Code.ZipFile,fs.readFileSync(__dirname+'/index.js','utf8'));
 assert.deepEqual(t.Resources.Api.Properties.CorsConfiguration.AllowMethods,['GET','POST']);
 assert.equal(t.Resources.Operations.Properties.TimeToLiveSpecification.Enabled,true);
 assert.equal(t.Resources.PrepareRoute.Properties.RouteKey,'POST /reservation/prepare');assert.equal(t.Resources.ConfirmRoute.Properties.RouteKey,'POST /reservation/confirm');
 assert.match(t.Resources.ConfirmRoutePermission.Properties.SourceArn['Fn::Sub'],/POST\/reservation\/confirm$/);
 // Every Lambda-backed route must have its own narrowly scoped invoke permission.
 for(const [name,route] of Object.entries(t.Resources).filter(([,v])=>v.Type==='AWS::ApiGatewayV2::Route')){
  const [method,path]=route.Properties.RouteKey.split(' ');
  const expected='arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${Api}/*/'+method+path;
  assert.ok(Object.values(t.Resources).some(v=>v.Type==='AWS::Lambda::Permission'&&v.Properties.Action==='lambda:InvokeFunction'&&v.Properties.Principal==='apigateway.amazonaws.com'&&v.Properties.FunctionName?.Ref==='Function'&&v.Properties.SourceArn?.['Fn::Sub']===expected),'Missing invoke permission for '+name);
 }
 assert.ok(!JSON.stringify(t.Resources.Role.Properties.Policies).includes('dynamodb:*'));
 console.log('PASS relay: favorites/read auth, preparation without booking, explicit ticket, expiry/owner binding, cold/concurrent single POST, repeated-ticket and new-ticket suppression, lost response reconciliation, 200 per-session failure, unknown and failed-persistence retention, fixed routes/CORS/least-privilege template');
})().catch(e=>{console.error(e);process.exit(1)});
