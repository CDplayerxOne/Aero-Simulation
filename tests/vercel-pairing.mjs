import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handlePairing} from '../worker/vercel-pairing.mjs';

function localStore(){
  const rows=new Map();
  return {
    async read(key){return rows.get(key)},
    async write(key,body,expected){
      if(rows.get(key)?.etag!==expected)return false;
      rows.set(key,{body,etag:crypto.randomUUID()});
      return true;
    },
    async remove(key,expected){if(rows.get(key)?.etag===expected)rows.delete(key)}
  };
}
const description='GL1-T'+'a'.repeat(24);

test('Vercel pairs separate visitors using a one-time code and a laptop-only poll token',async()=>{
  const store=localStore();
  const send=(action,body,ip,host='groundline.test')=>handlePairing(action,body,host,ip,store);
  const {body:{code,token}}=await send('create',{offer:description},'laptop');
  assert.match(code,/^\d{6}$/);
  assert.equal((await send('join',{code},'phone','preview.test')).status,404);
  const joined=await send('join',{code},'phone');
  assert.deepEqual(Object.keys(joined.body).sort(),['offer','ticket']);
  const payload={code,ticket:joined.body.ticket,answer:description};
  assert.equal((await send('answer',{...payload,ticket:crypto.randomUUID()},'other')).status,410);
  const claims=await Promise.all([send('answer',payload,'phone'),send('answer',payload,'other')]);
  assert.deepEqual(claims.map(r=>r.status).sort(),[200,409]);
  assert.equal((await send('join',{code},'phone')).status,409);
  assert.equal((await send('cancel',{token:code+'.'+crypto.randomUUID()},'other')).status,410);
  assert.deepEqual((await send('poll',{token},'laptop')).body,{answer:description});
  await send('cancel',{token},'laptop');
  assert.equal((await send('poll',{token},'laptop')).status,410);
});

test('Vercel refuses expired codes even before storage cleanup',async t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2025,0,1)});
  const store=localStore();
  const send=(action,body)=>handlePairing(action,body,'groundline.test','driver',store);
  const {body:{code,token}}=await send('create',{offer:description});
  t.mock.timers.tick(300001);
  assert.equal((await send('join',{code})).status,410);
  assert.equal((await send('poll',{token})).status,410);
});
