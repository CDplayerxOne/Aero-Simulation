import {createHash,randomInt,randomUUID} from 'node:crypto';
import {lifetime,validDescription} from './pairing.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(body,status=200)=>({status,body});
const fail=(status,error)=>reply({error},status);
const missing=()=>fail(410,'Code expired or replaced. Get a fresh code from the garage.');
const used=()=>fail(409,'This code has already been used. Get a new code from the garage.');

async function allowAttempt(store,path){
  const entry=await store.read(path);
  const count=entry?.body.count||0;
  if(count>=40)return false;
  // Compare-and-swap also bounds concurrent attempts from one address.
  return store.write(path,{count:count+1},entry?.etag);
}

export async function handlePairing(action,body,host,address,store){
  if(!['create','join','answer','poll','cancel'].includes(action))return fail(404,'Unknown pairing action.');
  if(!body || typeof body!=='object')return fail(400,'Expected a pairing message.');
  const prefix='groundline/'+hash(host)+'/';
  if(action==='create' || action==='join'){
    const minute=Math.floor(Date.now()/60000);
    const allowed=await allowAttempt(store,prefix+'attempts/'+hash(String(address))+'-'+minute);
    if(!allowed)return fail(429,'Too many simultaneous pairing attempts. Try again shortly.');
  }
  if(action==='create'){
    if(!validDescription(body.offer))return fail(400,'Invalid connection offer.');
    for(let attempt=0;attempt<5;attempt++){
      const code=String(randomInt(1000000)).padStart(6,'0');
      const token=code+'.'+randomUUID(),expires=Date.now()+lifetime;
      const room={token,ticket:randomUUID(),offer:body.offer,expires};
      if(await store.write(prefix+'rooms/'+code,room))return reply({code,token,expires},201);
    }
    return fail(503,'Could not allocate a code. Try again.');
  }
  const hostAction=action==='poll' || action==='cancel';
  const [code,secret]=hostAction?String(body.token).split('.'): [body.code,body.ticket];
  if(typeof code!=='string' || !/^\d{6}$/.test(code))return fail(400,'Enter the six-digit garage code.');
  if(hostAction && !uuid.test(secret))return missing();
  if(action==='answer' && (!uuid.test(secret) || !validDescription(body.answer)))return fail(400,'Invalid connection answer.');
  const path=prefix+'rooms/'+code;
  const entry=await store.read(path);
  if(!entry)return action==='join'?fail(404,'Check the six-digit code and open the same site on both devices.'):missing();
  const {body:room,etag}=entry;
  if(Date.now()>=room.expires)return missing();
  if(hostAction){
    if(body.token!==room.token)return missing();
    if(action==='cancel')await store.remove(path,etag);
    return reply({answer:room.answer||null});
  }
  if(room.answer)return used();
  if(action==='join')return reply({offer:room.offer,ticket:room.ticket});
  if(secret!==room.ticket)return missing();
  const written=await store.write(path,{...room,offer:null,answer:body.answer},etag);
  return written?reply({ok:true}):used();
}
