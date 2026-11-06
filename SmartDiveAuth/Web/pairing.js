const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const unhex=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
export function newPairing(){
 const id=hex(crypto.getRandomValues(new Uint8Array(16))),key=hex(crypto.getRandomValues(new Uint8Array(32)));
 return {id,key,createdAt:Date.now(),code:'sd1.'+id+'.'+key};
}
export async function readPairing(relay,pair){
 if(Date.now()-pair.createdAt>600000)throw Error('Connection code expired. Create a new code.');
 const r=await fetch(relay+'/pair?slot='+pair.id,{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Connection check failed: '+r.status);const j=await r.json();if(j.status==='pending')return null;
 if(j.status!=='ready'||typeof j.sealed!=='string'||j.sealed.length>16000)throw Error('Invalid connection reply.');
 const combined=Uint8Array.from(atob(j.sealed),x=>x.charCodeAt(0));
 if(combined.length<29)throw Error('Invalid encrypted data.');
 const key=await crypto.subtle.importKey('raw',unhex(pair.key),'AES-GCM',false,['decrypt']);
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:combined.slice(0,12),additionalData:new TextEncoder().encode(pair.id),tagLength:128},key,combined.slice(12));
 const data=JSON.parse(new TextDecoder().decode(plain));
 if(data.relay!==relay||typeof data.accessToken!=='string'||data.accessToken.length>8192||!Number.isFinite(data.expiresAt)||data.expiresAt<=Date.now())throw Error('Sign-in expired or relay does not match.');
 return data;
}
