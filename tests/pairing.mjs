import test from 'node:test';
import assert from 'node:assert/strict';
import {pairing} from '../worker/pairing.mjs';

const offer='GL1-T'+'a'.repeat(30);
const answer='GL1-T'+'b'.repeat(30);
function fixture(){
  const rows=new Map();
  const bucket={
    async get(key){return rows.get(key)},
    async put(key,value,options){
      if(options.onlyIf && options.onlyIf.etagMatches!==rows.get(key)?.etag)return null;
      const entry={etag:crypto.randomUUID(),json:async()=>JSON.parse(value)};
      rows.set(key,entry);
      return entry;
    }
  };
  return (action,body,player='driver')=>pairing(new Request('https://groundline.test/api/pair/'+action,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  }),bucket,player);
}

test('six digits pair once, and only the creating laptop can read the reply',async()=>{
  const send=fixture();
  assert.equal((await send('create',{offer},null)).status,401);
  const {code,token}=await (await send('create',{offer})).json();
  assert.match(code,/^\d{6}$/);
  assert.equal((await send('join',{code},'another driver')).status,410);
  const wrong=code==='000000'?'000001':'000000';
  assert.equal((await send('join',{code:wrong})).status,404);
  assert.deepEqual(await (await send('join',{code})).json(),{offer});
  assert.deepEqual(await (await send('poll',{token})).json(),{answer:null});
  const claims=await Promise.all([send('answer',{code,answer}),send('answer',{code,answer})]);
  assert.equal(claims.filter(r=>r.ok).length,1);
  assert.equal((await send('join',{code})).status,409);
  assert.equal((await send('poll',{token:code})).status,410);
  assert.deepEqual(await (await send('poll',{token})).json(),{answer});
  await send('cancel',{token});
  assert.equal((await send('join',{code})).status,410);
});

test('replaced and expired sessions cannot consume a fresh code',async t=>{
  const send=fixture();
  t.mock.timers.enable({apis:['Date'],now:Date.UTC(2025,0,1)});
  const first=await (await send('create',{offer})).json();
  const next=await (await send('create',{offer})).json();
  assert.equal((await send('cancel',{token:first.token})).status,410);
  assert.equal((await send('join',{code:next.code})).status,200);
  t.mock.timers.tick(300001);
  assert.equal((await send('join',{code:next.code})).status,410);
  assert.equal((await send('answer',{code:next.code,answer})).status,410);
});
