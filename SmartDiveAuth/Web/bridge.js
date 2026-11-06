import {tr,initializeLanguage} from './ui-language.js';
import {drawCockpit} from './display.js';
import {newPairing,readPairing} from './pairing.js';
import {waitForEvenAppBridge,CreateStartUpPageContainer,RebuildPageContainer,TextContainerProperty,TextContainerUpgrade,ImageContainerProperty,ImageRawDataUpdate,OsEventTypeList as E} from './sdk.js';
const el=id=>document.getElementById(id);
let snapshot=null,index=0,bridge=null,ready=false,stopped=false,painting=false,dirty=false;
let lastContact=0,probing=false,online=null,busy=false,generation=0;
const angles=['Summary','What can I learn?','What should I know?'];
let aiAnswer=null,aiWaiting=false,keywordOptions=[],selectedKeywords=[],lastAIChoice=0,lastDiveKeywords=null;
let catalog=null,findFilter='All',catalogNote='';
const filters=['Near venue','AI','Security','Data','Compute','Network','Cost','All'];
const startTime=x=>Date.parse(x.date+'T'+String(x.time).slice(0,5)+':00-08:00');
const byTime=(a,b)=>startTime(a)-startTime(b)||a.code.localeCompare(b.code);
function nearby(){return (catalog?.sessions||[]).filter(x=>venueCode(x.venue)===selectedVenue&&startTime(x)>=Date.now()&&(x.isReservable===false||x.seatAvailability==='walkUp')&&!savedSchedule?.sessions.some(r=>r.id===x.id)).sort(byTime)[0]||null;}
// Plain-text fallback also handles older, cached model answers.
export function plainText(value){
 return String(value||'').replace(/\r\n?/g,'\n')
  .replace(/^\s*(```|~~~)[^\n]*$/gm,'')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g,'$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
  .replace(/^ {0,3}#{1,6}\s+/gm,'')
  .replace(/^[ \t]*>\s?/gm,'')
  .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/gm,'')
  .replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/__([^_\n]+)__/g,'$1')
  .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s.,!?:;)])/g,'$1$2')
  .replace(/`+([^`\n]+)`+/g,'$1')
  .replace(/^[ \t]*[-+*]\s+/gm,'- ')
  .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
  .replace(/[\u2013\u2014]/g,'-').replace(/\n{3,}/g,'\n\n').trim();
}
const aiLines=()=>wrap(plainText(aiAnswer?.text));
function openKeywords(){
 const text=plainText([current()?.title,current()?.abstract,aiAnswer?.text].filter(Boolean).join(' '));
 const stop=new Set(('a an the and or but if as at by for in of on to up out off ' +
 'is are was were be been being do does did can could may might must shall should would ' +
 'this that these those with without from will your you yours we our ours us have has had ' +
 'it its they them their there then than how why when where which who what into through ' +
 'not no yes also more most less very each other some any all both such same new ' +
 'learn session about using use used uses first useful explanation official abstract overview summary learning ' +
 'general knowledge selected concepts combination generated based').split(' '));
 const words=text.match(/\b[A-Za-z][A-Za-z0-9+-]{1,30}\b/g)||[],count=new Map();
 for(const w of words){const key=w.toLowerCase();if(!stop.has(key)){const v=count.get(key);count.set(key,{word:v?.word||w,n:(v?.n||0)+1});}}
 keywordOptions=[...count.values()].sort((a,b)=>b.n-a.n||a.word.localeCompare(b.word)).slice(0,12).map(x=>x.word);
 selectedKeywords=[];choice=0;view='keywords';
}
function keywordWindow(){const total=keywordOptions.length+1,start=Math.max(0,choice-5);return {start,end:Math.min(start+6,total),total};}
function keywordRows(){return [...keywordOptions.map(w=>(selectedKeywords.includes(w)?'[x] ':'[ ] ')+w),'Run Dive ('+selectedKeywords.length+'/3)'];}
function showFind(){if(busy||stopped||!online)return;view='find';activeTab=2;choice=0;confirmation=null;render();}
async function ensureCatalog(){if(catalog)return;const run=generation;let next='',total=null;const found=new Map(),seen=new Set();do{const data=await api('/catalog'+(next?'?nextToken='+encodeURIComponent(next):''));if(run!==generation||!online)throw Error('Connection changed.');if(!Array.isArray(data.sessions)||!Number.isInteger(data.total)||data.total<0||total!==null&&total!==data.total)throw Error('Catalog changed. Retry Find.');total=data.total;for(const x of data.sessions){if(typeof x.id!=='string'||found.has(x.id))throw Error('Repeated catalog session. Retry Find.');found.set(x.id,x);}next=data.nextToken;if(next&&(typeof next!=='string'||seen.has(next)||seen.size>=1000))throw Error('Invalid catalog pagination.');if(next)seen.add(next);}while(next);if(found.size!==total)throw Error('Incomplete catalog. Retry Find.');catalog={sessions:[...found.values()],fetched:new Date().toISOString()};}
async function searchCatalog(filter){if(busy||stopped||!online)return;busy=true;const run=generation;message=tr('カタログを検索しています…','Searching session catalog…');render();try{await ensureCatalog();if(run!==generation)return;findFilter=filter;const reserved=new Set(savedSchedule?.sessions.map(x=>x.id)||[]);const pattern={AI:/\b(?:AI|ML|artificial intelligence|machine learning|bedrock|agents?|generative)\b/i,Network:/network|vpc/i,Cost:/cost|finops/i}[filter]||new RegExp(filter,'i');const sessions=catalog.sessions.filter(x=>filter==='All'||filter==='Near venue'?filter==='All'||venueCode(x.venue)===selectedVenue&&startTime(x)>=Date.now():pattern.test([x.code,x.title,x.abstract,...(x.topics||[]),...(x.services||[])].join(' '))).map(x=>({...x,reserved:reserved.has(x.id)})).sort(byTime);snapshot={...catalog,sessions};source='catalog';activeTab=2;index=0;choice=0;view='list';message=tr('検索結果: ','Search results: ')+sessions.length;}catch(e){if(run===generation){view='find';message=e.message;}}finally{if(run===generation){busy=false;render();}}}
async function loadNearby(){const run=generation;try{await ensureCatalog();if(run!==generation||!online){catalog=null;return;}catalogNote='';}catch(e){if(run===generation)catalogNote='Nearby unavailable. Open Find to retry.';}if(run===generation)render();}
let view='list',source='schedule',choice=0,page=0,confirmation=null,message='',resultText='';
let selectedVenue='VEN';
let activeTab=1,publicMode=false,pairing=null,pairingBusy=false;
let savedSchedule=null,favoritesCount=null,g2Error='',connecting=false;
const isG2=typeof location!=='undefined'&&new URLSearchParams(location.search).get('g2')==='1';
function nextReserved(){const list=savedSchedule?.sessions||[];return list.filter(x=>Date.parse(x.date+'T'+String(x.time).slice(0,5)+':00-08:00')>=Date.now()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time))[0]||null;}
function homeContent(){const n=nextReserved(),near=nearby();return [mark(0,n?'Next: '+n.code+' [R]':'Open my schedule'),n?n.date.slice(5)+' '+n.time+' '+(venueCode(n.venue)||'TBC'):'No upcoming reservations.',n?wrap(n.title)[0]:'',mark(1,near?'Walk-up: '+near.code:catalogNote?'Nearby unavailable':catalog?'No walk-up at venue':'Find walk-up at venue'),near?near.date.slice(5)+' '+near.time+' '+(venueCode(near.venue)||'TBC'):'No GPS / selected venue',near?wrap(near.title)[0]:'',mark(2,'Change venue: '+selectedVenue)];}

const venues=[['VEN','Venetian'],['WYN','Wynn/Encore'],['CF','Caesars Forum'],['CP','Caesars Palace'],['MGM','MGM Grand']];
const tiles=[[0,0],[288,0],[0,144],[288,144]],lastTiles=new Map();
const venueCode=name=>venues.find(([,n])=>String(name||'').toLowerCase().includes(n.toLowerCase()))?.[0]||(/wynn|encore/i.test(name||'')?'WYN':null);
export function wrap(text,width=25){
 const words=String(text||'').replace(/[^\x20-\x7e]/g,' ').split(/\s+/).filter(Boolean),lines=[];let line='';
 for(let word of words){if(line&&line.length+1+word.length>width){lines.push(line);line='';}while(word.length>width){lines.push(word.slice(0,width));word=word.slice(width);}line+=(line?' ':'')+word;}
 if(line)lines.push(line);return lines;
}
const current=()=>snapshot?.sessions?.[index];
const mark=(i,text)=>`${i===choice?'>>':'  '} ${text}`;
const meta=s=>[s.code,s.date+' '+s.time+' PST',...wrap(s.title).slice(0,2),String(s.venue||'Venue TBC').slice(0,45)];
const abstractLines=()=>wrap(current()?.abstract||'No abstract in snapshot. Load this list online.');
function frame(){
 if(!snapshot)return 'Smart Dive / Waiting for iPhone';
 if(busy)return ['Smart Dive / Please wait',...wrap(message).slice(0,7),aiWaiting?'2Tap: stop waiting':'No repeated taps needed.'].join('\n');
 const s=current();
 if(view==='home')return ['HOME / DASHBOARD',...homeContent()].join('\n');
 if(view==='venue')return ['CHOOSE VENUE',...venues.map((v,i)=>mark(i,v[1])),'Map is schematic.'].join('\n');
 if(view==='angles')return ['AI DIVE / '+s?.code,'Choose a focus',...angles.map((x,i)=>mark(i,x)),'AI uses the official abstract.','Tap: generate/read | 2Tap: details'].join('\n');
 if(view==='aiError')return ['AI DIVE / UNAVAILABLE',...wrap(message).slice(0,6),'Tap: AI options | 2Tap: details'].join('\n');
 if(view==='ai'){const lines=aiLines(),n=Math.max(1,Math.ceil(lines.length/5));return ['AI DIVE / '+s?.code+' '+(page+1)+'/'+n,aiAnswer.angle,aiAnswer.angle==='Keyword Dive'?'General AI / No web search':'AI-generated / Abstract-based',...lines.slice(page*5,page*5+5),'Up/Down: page | Tap: Dive menu','2Tap: session details'].join('\n');}
 if(view==='menu')return ['SMART DIVE 0.9 / DASHBOARD',...homeContent()].join('\n');
 if(view==='find')return ['FIND / SEARCH',...filters.slice(Math.max(0,choice-5),Math.max(0,choice-5)+6).map((x,i)=>mark(Math.max(0,choice-5)+i,x))].join('\n');
 if(view==='aiActions')return ['AI / NEXT ACTION',mark(0,'Back to explanation'),mark(1,'Dive with keywords'),mark(2,'Other AI focus')].join('\n');
 if(view==='keywords'){const rows=keywordRows(),{start,end,total}=keywordWindow();return ['DIVE / SELECT UP TO 3',...rows.slice(start,end).map((x,i)=>mark(start+i,x)),end<total?'More below | Run Dive at end':choice===total-1?'Tap to run selected terms':'End of list | Run Dive below'].join('\n');}
 if(view==='result')return ['RESERVATION RESULT',...wrap(resultText).slice(0,7),'Tap: back to session','2Tap: list | Hold: refresh'].join('\n');
 if(view==='confirm')return ['RESERVE ONE SEAT?',...meta(confirmation.session),mark(0,'Cancel'),mark(1,'Confirm reservation'),'Expires in '+Math.max(0,Math.ceil((confirmation.until-Date.now())/1000))+'s','2Tap: cancel'].join('\n');
 if(view==='abstract'){
  const lines=abstractLines(),n=Math.max(1,Math.ceil(lines.length/7));
  return [s?.code+' / ABSTRACT '+(page+1)+'/'+n,...lines.slice(page*7,page*7+7),'Up/Down: page | Tap: back','2Tap: back to details'].join('\n');
 }
 if(view==='detail'&&s)return [...meta(s),String([s.level,s.type,s.length?s.length+' min':''].filter(Boolean).join(' / ')).slice(0,45),mark(0,'Read abstract'),mark(1,'AI Dive'),mark(2,s.reserved?'Already reserved':'Reserve one seat'),mark(3,'Back to list')].join('\n');
 const list=snapshot.sessions||[];
 if(!list.length)return ['SMART DIVE / '+source.toUpperCase(),'No sessions in this list.','2Tap: menu | Hold: refresh'].join('\n');
 const start=Math.floor(index/2)*2,rows=[source.toUpperCase()+' '+(index+1)+'/'+list.length];
 for(let i=start;i<Math.min(start+2,list.length);i++){
  const x=list[i];rows.push((i===index?'>> ':'   ')+x.code+' '+x.date.slice(5)+' '+x.time+(x.reserved?' [R]':''),...wrap(x.title).slice(0,2),String(x.venue||'Venue TBC').slice(0,45));
 }
 rows.push('Tap: details | 2Tap: menu');return rows.join('\n');
}
function cockpitFrame(){
 const s=current();let lines=frame().split('\n'),title=lines.shift()||'Smart Dive',content=lines;
 if(view==='list'&&!busy){
  title=source==='schedule'?'My Schedule':source==='catalog'?'Find / '+findFilter:'Favorites';
  content=s?['>> '+s.code+(s.reserved?' [R]':''),s.date.slice(5)+' '+s.time+' PST',...wrap(s.title).slice(0,3),String(s.venue||'Venue TBC').slice(0,25)]:['No sessions in this list.','2Tap: menu'];
 }else if(view==='detail'&&!busy&&s){title=s.code;content=[s.date.slice(5)+' '+s.time+' PST',...wrap(s.title).slice(0,2),mark(0,'Read abstract'),mark(1,'AI Dive'),mark(2,s.reserved?'Already reserved':'Reserve one seat'),mark(3,'Back to list')];}
 else if(view==='confirm'&&!busy){const x=confirmation.session;title='Confirm / '+x.code;content=[x.date+' '+x.time,...wrap(x.title).slice(0,2),String(x.venue||'Venue TBC').slice(0,25),mark(0,'Cancel'),mark(1,'Confirm reservation'),'Expires '+Math.max(0,Math.ceil((confirmation.until-Date.now())/1000))+'s'];}
 else if(view==='ai'&&!busy){title='AI / '+s?.code;content=[aiAnswer.angle.slice(0,25),aiAnswer.angle==='Keyword Dive'?'General AI / No web search':'AI-generated / Abstract',...aiLines().slice(page*5,page*5+5)];}
 else if(view==='abstract'&&!busy){title=s?.code+' / Abstract';content=abstractLines().slice(page*7,page*7+7);}
 else if(busy){title=aiWaiting?'AI Dive / Working':'Please wait';content=[aiWaiting?'Generating with Bedrock...':'Loading session data...','Please wait.'];}
 if(view==='menu'&&!busy){title='Dashboard / Next up';content=homeContent().map(x=>x.replace(/^>> /,'   '));}
 if(view==='home'&&!busy){title='Dashboard / Next up';content=homeContent();}
 const reading=view==='ai'||view==='abstract',pages=reading?Math.max(1,Math.ceil((view==='ai'?aiLines().length:abstractLines().length)/(view==='ai'?5:7))):0;
 const dt=z=>new Intl.DateTimeFormat('en-US',{timeZone:z,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date()).replace(',','');
 const vc=['list','detail','abstract','angles','ai','confirm','result','keywords','aiActions'].includes(view)&&activeTab!==0?venueCode((confirmation?.session||s)?.venue):null;
 const footers={home:'Up/Down: Action | Tap: Select | 2Tap: Menu',list:'Up/Down: Session | Tap: Details | 2Tap: Menu',menu:'Up/Down: Menu | Tap: Open | 2Tap: Back',venue:'Up/Down: Venue | Tap: Set | 2Tap: Back',detail:'Up/Down: Action | Tap: Select | 2Tap: List',abstract:'Up/Down: Page | Tap/2Tap: Back',angles:'Up/Down: Focus | Tap: AI Dive | 2Tap: Details',ai:'Up/Down: Page | Tap: Dive menu | 2Tap: Back',find:'Up/Down: Filter | Tap: Search | 2Tap: Menu',keywords:'Up/Down: Term | Tap: Toggle/Dive | 2Tap: Back',aiActions:'Up/Down: Action | Tap: Select | 2Tap: Back',aiError:'Tap: AI options | 2Tap: Details',confirm:'Up/Down: Choose | Tap: Select | 2Tap: Cancel',result:'Tap: Details | 2Tap: List'};
 content=content.filter(x=>!/^\s*(2Tap:|Tap:|Up\/Down:)/.test(x));
 const f={header:dt('America/Los_Angeles')+' | JP '+dt('Asia/Tokyo'),title:title.slice(0,28),position:view==='keywords'?selectedKeywords.length+'/3 | Rows '+(keywordWindow().start+1)+'-'+keywordWindow().end+'/'+keywordWindow().total:reading?'Page '+(page+1)+'/'+pages:['home','menu'].includes(view)?String(savedSchedule?.sessions?.length??0)+' reserved'+(favoritesCount===null?'':' | '+favoritesCount+' favorites'):view==='list'?(index+1)+'/'+(snapshot?.sessions?.length||0):view==='menu'?'':'',content:content.slice(0,7).map(x=>x.slice(0,28)).join('\n'),footer:busy?(aiWaiting?'Working... | 2Tap: Stop waiting':'Loading...'):footers[view]||'2Tap: Back',venue:{code:vc||selectedVenue,kind:vc?'Session venue':'Your venue'}};
 return {f,state:{tab:activeTab,focusTab:choice,focus:busy?'busy':view==='menu'?'menu':'content'}};
}
function render(){
 el('status').textContent=(ready?tr('G2 接続済み','G2 connected'):isG2?tr('Even G2 モード','Even G2 mode'):tr('Web 補助ビュー','Optional Web view'))+' · '+(online?tr('認証済み','Signed in'):tr('接続待ち','Awaiting connection'))+(g2Error?' · '+g2Error:'');
 el('check-pair').disabled=pairingBusy||!pairing;el('new-pair').disabled=pairingBusy;el('copy-pair').disabled=pairingBusy||!pairing;
 el('pair-panel').hidden=!publicMode||!!online;
 el('cockpit-panel').hidden=!online;
 el('screen').textContent=frame();el('online').textContent=message;
 const {f,state}=cockpitFrame();
 if(online){drawCockpit(el('cockpit').getContext('2d'),f,state);}else{const ctx=el('cockpit').getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,576,288);ctx.fillStyle='#fff';ctx.font='16px monospace';ctx.fillText('SMART DIVE / Connect on iPhone',20,140);}
 el('contact').textContent=lastContact?'iPhone contact '+Math.floor((Date.now()-lastContact)/1000)+'s ago / Fetched '+snapshot?.fetched:'';
 for(const id of ['refresh','favorites','schedule','home','up','down','tap','back'])el(id).disabled=busy||!online;
 if(aiWaiting)el('back').disabled=false;
 el('connect').disabled=!online||connecting||ready;
 dirty=true;void paint();
}
async function paint(){if(!ready||painting||stopped)return;painting=true;try{while(dirty&&!stopped){dirty=false;
 const frozen=document.createElement('canvas');frozen.width=576;frozen.height=288;frozen.getContext('2d').drawImage(el('cockpit'),0,0);
 for(const [i,[x,y]]of tiles.entries()){
  if(stopped)break;const tile=document.createElement('canvas');tile.width=288;tile.height=144;tile.getContext('2d').drawImage(frozen,x,y,288,144,0,0,288,144);
  const blob=await new Promise(r=>tile.toBlob(r,'image/png'));if(!blob)throw Error('Screen encode failed');const bytes=new Uint8Array(await blob.arrayBuffer());
  const prev=lastTiles.get(i);if(prev&&prev.length===bytes.length&&prev.every((v,j)=>v===bytes[j]))continue;
  const ok=await bridge.updateImageRawData(new ImageRawDataUpdate({containerID:i+2,containerName:'tile'+i,imageData:bytes}));if(ok!=='success')throw Error('G2 image update failed');lastTiles.set(i,bytes);
 }
 }}catch(e){lastTiles.clear();el('status').textContent='G2: '+e.message;}finally{painting=false;}}
async function api(path,payload){
 if(!online)throw Error('Sign in and hand off again.');
 if(Date.now()>=online.expiresAt){clearOnline();throw Error('Sign-in expired.');}
 const credential=online;
 const r=await fetch(credential.relay+path,{method:payload?'POST':'GET',headers:{Authorization:'Bearer '+credential.accessToken,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(32000)});
 if(!r.ok){if(r.status===401)clearOnline();let msg='HTTP '+r.status;try{const j=await r.json();if(typeof j.error==='string')msg+=': '+j.error;}catch{}throw Error(msg);}
 return r.json();
}
async function load(which=source,goHome=false){
 if(busy||stopped)return;busy=true;const run=generation;message=tr('読み込み中: ','Loading ')+which+'…';render();
 try{const data=await api(which==='favorites'?'/favorites':'/schedule');if(run!==generation)return;
  if(!Array.isArray(data.sessions)||typeof data.fetched!=='string')throw Error('Invalid reply');
  snapshot=data;if(which==='schedule'){savedSchedule=data;if(Number.isInteger(data.counts?.favorites))favoritesCount=data.counts.favorites;}else favoritesCount=data.sessions.length;source=which;activeTab=goHome?0:which==='schedule'?1:2;index=0;choice=0;view=goHome?'home':'list';confirmation=null;message=tr('最新取得: ','Updated: ')+data.sessions.length+tr('件 · ',' sessions · ')+data.fetched;
 }catch(e){if(run===generation)message=tr('取得失敗: ','Load failed: ')+e.message;}
 finally{if(run===generation){busy=false;render();if(goHome&&online)void loadNearby();}}
}
async function prepare(){
 const s=current();if(!s?.id){message=tr('先に一覧を取得してください。','Load this list first.');render();return;}
 if(s.reserved){message=tr('予約済みです。','Already reserved.');render();return;}
 if(busy||!online)return;busy=true;const run=generation;message='Checking session and schedule...';render();
 try{const data=await api('/reservation/prepare',{id:s.id});if(run!==generation)return;
  if(data.status==='confirm'&&data.session?.id===s.id&&typeof data.ticket==='string'&&Number.isFinite(data.until)){
   confirmation=data;choice=0;view='confirm';message=tr('日時と会場を確認。初期選択はCancelです。','Check the date and venue. Cancel is selected first.');
  }else{resultText=data.text||'No reservation sent.';view='result';message=resultText;if(data.status==='reserved')s.reserved=true;}
 }catch(e){if(run===generation){resultText='No reservation sent. '+e.message;message=resultText;view='result';}}
 finally{if(run===generation){busy=false;render();}}
}
async function book(){
 if(busy||!confirmation||stopped)return;
 if(Date.now()>=confirmation.until){confirmation=null;view='detail';choice=0;message=tr('確認期限切れ。予約を開き直してください。','Confirmation expired. Open the reservation again.');render();return;}
 const c=confirmation;confirmation=null;busy=true;const run=generation;message='Reserving one seat, then checking schedule...';render();
 try{const data=await api('/reservation/confirm',{ticket:c.ticket});if(run!==generation)return;
  resultText=data.text||'Result unknown. Check official schedule. Do not resend.';
  if(data.status==='reserved'&&current()?.id===c.session.id)current().reserved=true;
  view='result';message=resultText;
 }catch(e){if(run===generation){resultText='Result unknown. Check official schedule. No automatic retry. '+e.message;view='result';message=resultText;}}
 finally{if(run===generation){
  if(online){try{const latest=await api('/schedule');if(run===generation&&Array.isArray(latest.sessions)){savedSchedule=latest;if(Number.isInteger(latest.counts?.favorites))favoritesCount=latest.counts.favorites;const reserved=new Set(latest.sessions.map(x=>x.id));for(const x of snapshot?.sessions||[])x.reserved=reserved.has(x.id);}}catch{if(run===generation)message+=' '+tr('予定の再取得に失敗しました。公式スケジュールを確認してください。','Schedule refresh failed. Check the official schedule.');}}
  if(run===generation){busy=false;render();}
 }}
}
async function dive(keywords=null){
 if(busy)return;
 if(!online||!current()?.id){view='aiError';message='Sign in with online mode, then hand off again.';render();return;}
 const selected=current(),angle=keywords?'Keyword Dive':angles[choice];lastDiveKeywords=keywords?[...keywords]:null;if(!keywords)lastAIChoice=choice;busy=true;aiWaiting=true;const run=generation;
 message='Starting AI Dive with Amazon Bedrock...';render();
 try{
  let job=await api('/dive',{id:selected.id,angle,...(keywords?{keywords}:{})});
  if(run!==generation)return;
  const until=Date.now()+120000;
  while(job.status==='pending'||job.status==='running'){
   if(typeof job.job!=='string'||!/^ai:[a-f0-9]{64}$/.test(job.job))throw Error('Invalid AI job.');
   if(Date.now()>=until)throw Error('Still processing. Select the same focus later to check the result.');
   message=job.status==='running'?'Amazon Bedrock is explaining the abstract...':'AI Dive queued. Waiting for generation...';render();
   await new Promise(resolve=>setTimeout(resolve,3000));if(run!==generation)return;
   job=await api('/dive?job='+encodeURIComponent(job.job));if(run!==generation)return;
  }
  if(job.status!=='done'||typeof job.answer?.text!=='string')throw Error(job.error||'AI generation failed.');
  aiAnswer=job.answer;view='ai';page=0;
  message='AI / '+aiAnswer.model+' / '+aiAnswer.generatedAt+' / '+aiAnswer.basis;
 }catch(e){if(run===generation){view='aiError';message='AI Dive: '+e.message;}}
 finally{if(run===generation){aiWaiting=false;busy=false;render();}}
}
function action(a){
 if(stopped||!snapshot||(publicMode&&!online))return;
 if(busy){if(aiWaiting&&a==='back'){generation++;aiWaiting=false;busy=false;view=lastDiveKeywords?'keywords':'angles';choice=lastDiveKeywords?keywordOptions.length:lastAIChoice;message=tr('待機を終了しました。同じ観点で結果を確認できます。','Stopped waiting. Select the same focus to check later.');render();}return;}
 if(a==='refresh'){catalog=null;void (source==='catalog'&&view!=='home'?searchCatalog(findFilter):load(view==='home'?'schedule':source,view==='home'));return;}
 if(a==='back'){
  confirmation=null;choice=0;
  if(['abstract','angles','ai','aiError'].includes(view))view='detail';else if(view==='keywords')view='aiActions';else if(view==='aiActions')view='ai';else if(view==='find')view='menu';else if(view==='home')view='menu';else if(view==='venue')view='home';else if(view==='list')view=source==='catalog'?'find':'menu';else if(view==='menu')view=activeTab===0?'home':activeTab===2?'find':'list';else view='list';if(view==='menu'){choice=activeTab;}render();return;
 }
 const delta=a==='up'?-1:a==='down'?1:0;
 if(view==='menu'){
  if(delta)choice=(choice+delta+4)%4;
  if(a==='tap'){if(choice===0){view='home';activeTab=0;choice=0;render();}else if(choice===1)void load('schedule');else if(choice===2)showFind();else {catalog=null;void load('schedule',true);}return;}
 }else if(view==='home'){
  if(delta)choice=(choice+delta+3)%3;
  if(a==='tap'){if(choice===2){view='venue';choice=venues.findIndex(v=>v[0]===selectedVenue);}else{const n=choice===0?nextReserved():nearby();if(n){snapshot=choice===0?savedSchedule:{...catalog,sessions:[n]};source=choice===0?'schedule':'catalog';if(choice===1)findFilter='Near venue';index=snapshot.sessions.findIndex(x=>x.id===n.id);activeTab=choice===0?1:2;view='detail';choice=0;}else{if(choice===0)void load('schedule');else void searchCatalog('Near venue');return;}}}
 }else if(view==='find'){if(delta)choice=(choice+delta+filters.length)%filters.length;if(a==='tap'){void searchCatalog(filters[choice]);return;}
 }else if(view==='aiActions'){if(delta)choice=(choice+delta+3)%3;if(a==='tap'){if(choice===0)view='ai';else if(choice===1)openKeywords();else{view='angles';choice=lastAIChoice;}}
 }else if(view==='keywords'){if(delta)choice=(choice+delta+keywordOptions.length+1)%(keywordOptions.length+1);if(a==='tap'){if(choice===keywordOptions.length){if(selectedKeywords.length){void dive([...selectedKeywords]);return;}message=tr('用語を1〜3個選んでください。','Select 1–3 terms first.');}else{const word=keywordOptions[choice],i=selectedKeywords.indexOf(word);if(i>=0)selectedKeywords.splice(i,1);else if(selectedKeywords.length<3)selectedKeywords.push(word);else message=tr('選べる用語は3個までです。','You can select up to 3 terms.');}}
 }else if(view==='venue'){
  if(delta)choice=(choice+delta+venues.length)%venues.length;
  if(a==='tap'){selectedVenue=venues[choice][0];view='home';choice=0;}
 }else if(view==='list'){
  const n=snapshot.sessions.length;if(delta&&n)index=(index+delta+n)%n;
  if(a==='tap'&&n){view='detail';choice=0;}
 }else if(view==='detail'){
  if(delta)choice=(choice+delta+4)%4;
  if(a==='tap'){if(choice===0){view='abstract';page=0;}else if(choice===1){view='angles';choice=0;}else if(choice===2){void prepare();return;}else view='list';}
 }else if(view==='angles'){
  if(delta)choice=(choice+delta+3)%3;if(a==='tap'){void dive();return;}
 }else if(view==='ai'){
  const n=Math.max(1,Math.ceil(aiLines().length/5));if(delta)page=Math.max(0,Math.min(n-1,page+delta));if(a==='tap'){view='aiActions';choice=0;}
 }else if(view==='aiError'&&a==='tap'){view=lastDiveKeywords?'keywords':'angles';choice=lastDiveKeywords?keywordOptions.length:lastAIChoice;
 }else if(view==='abstract'){
  const n=Math.max(1,Math.ceil(abstractLines().length/7));if(delta)page=Math.max(0,Math.min(n-1,page+delta));if(a==='tap'){view='detail';choice=0;}
 }else if(view==='confirm'){
  if(delta)choice=choice===0?1:0;
  if(a==='tap'){if(choice===1){void book();return;}confirmation=null;view='detail';choice=0;message=tr('予約せずに戻りました。','Returned without booking.');}
 }else if(view==='result'&&a==='tap'){view='detail';choice=0;}
 render();
}
async function connect(){if(ready||connecting||stopped||!online)return;connecting=true;g2Error='';const run=generation;render();try{
 bridge=await waitForEvenAppBridge();if(run!==generation||!online){bridge=null;return;}
 const layout={containerTotalNum:5,textObject:[new TextContainerProperty({containerID:1,containerName:'input',xPosition:0,yPosition:0,width:576,height:288,paddingLength:0,borderWidth:0,isEventCapture:1,content:' '})],imageObject:tiles.map(([x,y],i)=>new ImageContainerProperty({containerID:i+2,containerName:'tile'+i,xPosition:x,yPosition:y,width:288,height:144}))};
 const result=await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(layout));
 if(result!==0){if(result!==1||!await bridge.rebuildPageContainer(new RebuildPageContainer(layout)))throw Error('Display initialization failed ('+result+'). Reopen Smart Dive in Even.');}
 if(run!==generation||!online){bridge=null;return;}
 lastTiles.clear();
 bridge.onEvenHubEvent(e=>{
  const ts=[e.sysEvent,e.textEvent,e.listEvent].filter(Boolean).map(x=>x.eventType??E.CLICK_EVENT);
  if(ts.some(t=>t===E.SYSTEM_EXIT_EVENT||t===E.ABNORMAL_EXIT_EVENT)){stopped=true;clearOnline();return;}
  if(ts.includes(E.LONG_PRESS_EVENT))action('refresh');else if(ts.includes(E.DOUBLE_CLICK_EVENT))action('back');else if(ts.includes(E.SCROLL_TOP_EVENT))action('up');else if(ts.includes(E.SCROLL_BOTTOM_EVENT))action('down');else if(ts.includes(E.CLICK_EVENT))action('tap');
 });ready=true;el('status').textContent='G2 connected / R1 Up・Down・Tap・Double tap / Hold: refresh';render();
 }catch(e){bridge=null;ready=false;g2Error=e.message;}finally{connecting=false;render();}}
async function probe(){if(probing||stopped||!snapshot)return;probing=true;try{const r=await fetch('probe',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(r.ok&&(await r.json()).alive===true)lastContact=Date.now();}catch{}finally{probing=false;render();}}
function clearOnline(){generation++;catalog=null;savedSchedule=null;catalogNote='';selectedKeywords=[];online=null;confirmation=null;aiWaiting=false;aiAnswer=null;busy=false;view='list';if(publicMode){pairing=null;el('pair-code').value='';el('pair-panel').hidden=false;}message=tr('接続情報を消去しました。予約は取り消されません。','Connection cleared. Existing reservations are unchanged.');render();}
el('refresh').onclick=()=>action('refresh');el('favorites').onclick=showFind;el('schedule').onclick=()=>void load('schedule');el('clear').onclick=clearOnline;
el('home').onclick=()=>{if(busy||stopped||!online)return;confirmation=null;choice=0;view='home';activeTab=0;render();};
for(const a of ['up','down','tap','back'])el(a).onclick=()=>action(a);el('connect').onclick=()=>void connect();
el('new-pair').onclick=()=>{if(!publicMode||pairingBusy)return;pairing=newPairing();el('pair-code').value=pairing.code;message=tr('コードをConnectへ貼り付けてからログイン・連携し、この画面へ戻ってください。','Paste the code into Connect, sign in, send connection, then return here.');render();};
el('copy-pair').onclick=async()=>{try{await navigator.clipboard.writeText(el('pair-code').value);message=tr('コードをコピーしました。Connectへ貼り付けてください。','Code copied. Paste it into Smart Dive Connect.');}catch{message=tr('コード欄を選択してコピーしてください。','Select and copy the code manually.');}render();};
let publicRelay='';
el('check-pair').onclick=async()=>{
 if(!publicMode||!pairing||pairingBusy||stopped)return;pairingBusy=true;render();const run=generation;
 try{const data=await readPairing(publicRelay,pairing);if(run!==generation)return;if(!data){message=tr('未受信です。Connectから連携してください。','Not received yet. Send the connection from Connect.');render();return;}
  online=data;pairing=null;el('pair-code').value='';el('pair-panel').hidden=true;message=tr('接続しました。','Connected.');render();if(isG2)void connect();await load('schedule',true);
 }catch(e){if(run===generation){message=tr('接続確認: ','Connection: ')+e.message;render();}}finally{pairingBusy=false;render();}
};
initializeLanguage(()=>{message=online?tr('認証済み。操作を続けられます。','Signed in. Ready to continue.'):tr('コードをConnectへ貼り付けてからログイン・連携し、この画面へ戻ってください。','Paste the code into Connect, sign in, send connection, then return here.');if(snapshot)render();});
try{
 if(typeof location!=='undefined'&&location.protocol==='https:'){
  publicMode=true;const r=await fetch('config.json',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Hosting configuration missing.');const config=await r.json();
  if(!/^https:\/\/[a-z0-9]+\.execute-api\.ap-northeast-1\.amazonaws\.com$/.test(config.relay))throw Error('Invalid relay configuration.');publicRelay=config.relay;
  snapshot={fetched:'',sessions:[]};view='home';activeTab=0;el('pair-panel').hidden=false;el('new-pair').onclick();render();
  // G2 display creation is deferred until the connection has been authenticated.
 }else{
 const r=await fetch('snapshot',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('HTTP '+r.status);
 const data=await r.json();online=data.online||null;delete data.online;for(const s of data.sessions||[])s.reserved=true;snapshot=data;savedSchedule=data;lastContact=Date.now();message=tr('接続情報を受信しました。','Connection received.');render();void connect();setInterval(()=>void probe(),10000);
 }
}catch(e){el('status').textContent=(publicMode?tr('公開Web設定を確認してください: ','Check hosting configuration: '):tr('Connectから再接続してください: ','Reconnect using Connect: '))+e.message;}
