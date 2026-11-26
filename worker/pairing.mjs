// Each signed-in player can have one pending pairing and any number of active
// direct connections. The object contains only the offer/answer handshake.
const lifetime=5*60*1000;
const validDescription=s=>typeof s==='string' && /^GL1-[ZT][\w-]{20,24000}$/.test(s);
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const failure=(message,status)=>reply({error:message},status);
const inactive=()=>failure('Code expired or replaced. Choose Pair phone on the laptop for a fresh code.',410);

export async function pairing(request,bucket,player){
  if(!player)return failure('Open the site signed in to the same account on both devices.',401);
  if(request.method!=='POST')return failure('Use POST.',405);
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return failure('Invalid request origin.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return failure('Expected JSON.',415);
  const raw=await request.text();
  if(raw.length>25000)return failure('Pairing message is too large.',413);
  let body;try{body=JSON.parse(raw)}catch{return failure('Invalid pairing message.',400)}
  if(!body||typeof body!=='object')return failure('Invalid pairing message.',400);
  const action=new URL(request.url).pathname.split('/').pop();
  const key='pairing/'+encodeURIComponent(player);
  const store=(record,etag)=>bucket.put(key,JSON.stringify(record),etag?{onlyIf:{etagMatches:etag}}:{});
  if(action==='create'){
    if(!validDescription(body.offer))return failure('Invalid connection offer.',400);
    const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
    const token=crypto.randomUUID(),expires=Date.now()+lifetime;
    await store({token,code,expires,offer:body.offer});
    return reply({token,code,expires},201);
  }
  const object=await bucket.get(key);
  if(!object)return inactive();
  const room=await object.json();
  if(!room.expires)return inactive();
  if(room.expires<=Date.now()){
    await store({expires:0},object.etag);
    return inactive();
  }
  if(action==='poll'||action==='cancel'){
    if(body.token!==room.token)return inactive();
    if(action==='cancel')await store({expires:0},object.etag);
    return reply({answer:action==='poll'?room.answer||null:null});
  }
  if(!/^\d{6}$/.test(body.code)||body.code!==room.code)return failure('Check the six-digit code on your laptop and try again.',404);
  if(room.answer)return failure('This code has already been used. Create a new code on the laptop.',409);
  if(action==='join')return reply({offer:room.offer});
  if(action==='answer'&&validDescription(body.answer)){
    const written=await store({...room,offer:null,answer:body.answer},object.etag);
    return written?reply({ok:true}):inactive();
  }
  return failure('Invalid pairing request.',400);
}
