import test from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Matrix4} from '../vendor/three.module.min.js';

test('combined mesh alignment precedes tunnel incidence for pressure and reference dimensions',async()=>{
  let result;
  globalThis.self={postMessage(data){result=data}};
  try{
    await import('../js/flow-worker.js');
    const solve=(vertices,orientation)=>{
      self.onmessage({data:{vertices:vertices.slice(),angle:-.13,orientation}});
      assert.ok(result.loads);
      return result;
    };
    const panel=Float32Array.of(-.7,0,-1.45,.7,0,-1.45,.7,0,1.45,
                                -.7,0,-1.45,.7,0,1.45,-.7,0,1.45);
    const before=solve(panel);
    const aligned=panel.map((_,i)=>{
      const v=i-i%3;
      // +90° about X, then +90° about Y maps (x,y,z) to (y,-z,-x).
      return [panel[v+1],-panel[v+2],-panel[v]][i%3];
    });
    const expected=solve(aligned);
    const orientation=new Matrix4().makeRotationFromEuler(new Euler(Math.PI/2,Math.PI/2,0,'ZYX'));
    const rotated=solve(panel,orientation.elements);
    assert.deepEqual(rotated.pressure.texels,expected.pressure.texels);
    assert.deepEqual(rotated.loads,expected.loads);
    assert.notDeepEqual(rotated.loads,before.loads);
    assert.ok(Math.abs(rotated.reference.length-expected.reference.length)<1e-9);
    assert.ok(Math.abs(rotated.reference.area-expected.reference.area)<1e-9);
    assert.deepEqual(solve(panel).loads,before.loads);
  }finally{delete globalThis.self}
});

test('fitted mesh corners stay in the tunnel through a full rotation',async()=>{
  let result;
  globalThis.self={postMessage(data){result=data}};
  try{
    await import('../js/mesh-worker.js');
    const obj='v -1 -1 -1\nv 1 -1 -1\nv 1 1 1\nf 1 2 3';
    await self.onmessage({data:{file:new Blob([obj]),type:'obj'}});
    assert.ifError(result.error);
    for(let i=0;i<result.vertices.length;i+=3){
      const radius=Math.hypot(...result.vertices.subarray(i,i+3));
      assert.ok(Math.abs(radius-2.28)<1e-6);
    }
    assert.ok(Math.abs(result.box.max.x-result.vertices[3])<1e-6);
  }finally{delete globalThis.self}
});
