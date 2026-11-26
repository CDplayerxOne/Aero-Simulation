import {createHash,randomInt,randomUUID} from 'node:crypto';
import {lifetime,validDescription} from './pairing.mjs';

const seconds=lifetime/1000;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const reply=(body,status=200)=>({status,body});
const fail=(status,error)=>reply({error},status);
const missing=()=>fail(410,'Code expired or replaced. Get a fresh code from the garage.');
const used=()=>fail(409,'This code has already been used. Get a new code from the garage.');

export function redisCommand(url,token){
  return async (...args)=>{
    const response=await fetch(url,{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(args),signal:AbortSignal.timeout(5000),redirect:'error',cache:'no-store'
    });
    if(!response.ok)throw Error('Redis request failed');
    const data=await response.json();
    if(data.error)throw Error('Redis command failed');
    return data.result;
  };
}

// Atomically accept one answer or cancel the matching room. Retain its original TTL.
const changeRoom=`
local data=redis.call('GET',KEYS[1])
if not data then return 0 end
local room=cjson.decode(data)
if ARGV[1]=='cancel' then
  if room.token~=ARGV[2] then return 0 end
  return redis.call('DEL',KEYS[1])
end
if room.ticket~=ARGV[2] then return 0 end
if room.answer then return 2 end
room.answer=ARGV[3]
room.offer=nil
redis.call('SET',KEYS[1],cjson.encode(room),'KEEPTTL')
return 1`;
const rateLimit=`
local n=redis.call('INCR',KEYS[1])
if n==1 then redis.call('EXPIRE',KEYS[1],60) end
return n`;

export async function handlePairing(action,body,host,address,command){
  if(!['create','join','answer','poll','cancel'].includes(action))return fail(404,'Unknown pairing action.');
  if(!body || typeof body!=='object')return fail(400,'Expected a pairing message.');
  const prefix='groundline:'+hash(host)+':';
  if(action==='create' || action==='join' || action==='answer'){
    const count=await command('EVAL',rateLimit,1,prefix+'attempts:'+hash(String(address)));
    if(count>40)return fail(429,'Too many pairing attempts. Try again in one minute.');
  }
  if(action==='create'){
    if(!validDescription(body.offer))return fail(400,'Invalid connection offer.');
    for(let attempt=0;attempt<5;attempt++){
      const code=String(randomInt(1000000)).padStart(6,'0');
      const token=code+'.'+randomUUID();
      const room={token,ticket:randomUUID(),offer:body.offer};
      if(await command('SET',prefix+code,JSON.stringify(room),'EX',seconds,'NX')){
        return reply({code,token,expires:Date.now()+lifetime},201);
      }
    }
    return fail(503,'Could not allocate a code. Try again.');
  }
  const hostAction=action==='poll' || action==='cancel';
  const [code,secret]=hostAction?String(body.token).split('.'): [body.code,body.ticket];
  if(typeof code!=='string' || !/^\d{6}$/.test(code))return fail(400,'Enter the six-digit garage code.');
  const key=prefix+code;
  if(hostAction && !uuid.test(secret))return missing();
  if(action==='answer' || action==='cancel'){
    if(action==='answer' && (!uuid.test(secret) || !validDescription(body.answer)))return fail(400,'Invalid connection answer.');
    const result=await command('EVAL',changeRoom,1,key,action,hostAction?body.token:secret,body.answer||'');
    if(!result)return missing();
    return result===2?used():reply({ok:true});
  }
  const data=await command('GET',key);
  if(!data)return action==='join'?fail(404,'Check the six-digit code and open the same site on both devices.'):missing();
  const room=JSON.parse(data);
  if(action==='poll')return body.token===room.token?reply({answer:room.answer||null}):missing();
  return room.answer?used():reply({offer:room.offer,ticket:room.ticket});
}
