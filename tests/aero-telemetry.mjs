import assert from 'node:assert/strict';
import test from 'node:test';
import {integratePressure,referenceDimensions,telemetry} from '../js/aero-telemetry.js';

test('surface pressure produces positive downstream drag and upward lift',()=>{
  const solid=new Uint8Array(125),vel=new Float32Array(375);
  solid[62]=1;
  for(let i=0;i<125;i++)vel[3*i]=1;
  assert.deepEqual(integratePressure(solid,vel,5,5,5,.5),{dragArea:0,liftArea:0,minCp:0,maxCp:0});
  vel[3*61]=0; // Stagnation pressure on the upstream face.
  vel[3*67]=2; // Suction on the top face.
  const loads=integratePressure(solid,vel,5,5,5,.5);
  assert.deepEqual(loads,{dragArea:.25,liftArea:.75,minCp:-3,maxCp:1});
  const ref=referenceDimensions({min:{x:-1,y:-.1,z:-2},max:{x:1,y:.1,z:2}});
  assert.deepEqual(ref,{length:2,area:8});
  const a=telemetry(20,ref,loads),b=telemetry(40,ref,loads);
  assert.ok(Math.abs(a.pressure-245)<1e-10);
  assert.equal(a.drag,a.pressure*.25);
  assert.equal(b.lift,a.lift*4);
  assert.equal(b.reynolds,a.reynolds*2);
  assert.equal(b.cl,a.cl);
  assert.equal(a.cd,.25/8);
});

test('an unresolved mesh leaves force and coefficient readings unavailable',()=>{
  const loads=integratePressure(new Uint8Array(125),new Float32Array(375),5,5,5,.5);
  assert.equal(loads,null);
  assert.deepEqual(telemetry(20,{length:0,area:0},loads),{
    minCp:null,maxCp:null,peakSpeed:null,pressure:.5*1.225*20**2,reynolds:null,drag:null,lift:null,cd:null,cl:null
  });
});

test('pitching an uploaded flat plate changes its solved surface pressures',async()=>{
  let result;
  globalThis.self={postMessage(data){result=data}};
  try{
    await import('../js/mesh-worker.js');
    const source='v -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nf 1 2 3 4';
    self.onmessage({data:{buffer:new TextEncoder().encode(source).buffer,type:'obj'}});
    const {vertices}=result;
    await import('../js/flow-worker.js');
    function pitch(angle){
      const mesh=vertices.slice();
      for(let i=0;i<mesh.length;i+=3){
        mesh[i]=vertices[i]*Math.cos(angle);
        mesh[i+1]=vertices[i]*Math.sin(angle);
      }
      self.onmessage({data:mesh});
      assert.ok(result.paths.length);
      assert.ok(result.pressure.texels.length);
      return result.loads;
    }
    const level=pitch(0),inclined=pitch(.20);
    assert.ok(inclined.minCp<level.minCp-.01);
    assert.ok(Math.abs(inclined.liftArea-level.liftArea)>1e-6);
    assert.ok(inclined.maxCp<=1 && inclined.maxCp>inclined.minCp);
  }finally{delete globalThis.self}
});
