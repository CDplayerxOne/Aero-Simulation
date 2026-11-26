import assert from 'node:assert/strict';
import test from 'node:test';
import {readMesh} from '../js/mesh-reader.js';
import {maxFileBytes,maxTriangles} from '../js/mesh-limits.js';

const points=[[0,0,0],[2,0,0],[2,1,0],[0,1,0]];
const quad=points.map(p=>'v '+p.join(' ')).join('\n')+'\n';

function binarySTL(faces,header='solid mesh'){
  const bytes=new Uint8Array(84+50*faces.length);
  bytes.set(new TextEncoder().encode(header));
  const view=new DataView(bytes.buffer);
  view.setUint32(80,faces.length,true);
  faces.forEach((face,f)=>face.flat().forEach((v,i)=>view.setFloat32(96+50*f+4*i,v,true)));
  return bytes;
}

test('OBJ faces survive chunk boundaries, CRLF continuations, negative indices and unused attributes',async()=>{
  const prefix=quad+'g wing\nvt 0 0\nvn 0 0 1\n';
  const firstPart='f -4/1/1 -3/1/1 '+String.fromCharCode(92);
  const padding='#'.padEnd(512*1024-prefix.length-firstPart.length-2,'x')+'\n';
  const text=prefix+padding+firstPart+'\r\n-2/1/1 -1/1/1 # quad';
  const vertices=await readMesh(new Blob([text]),'obj');
  const expected=await readMesh(new Blob([binarySTL([[points[0],points[1],points[2]],[points[0],points[2],points[3]]])]),'stl');
  assert.equal(vertices.length,18);
  assert.deepEqual(vertices,expected);
});

test('ASCII STL supports multiple solids, and detects incomplete facets',async()=>{
  const facet='facet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 2 1 0\nendloop\n';
  const body='solid part\n'+facet+'endfacet\nendsolid part\n';
  const vertices=await readMesh(new Blob([body,body]),'stl');
  assert.equal(vertices.length,18);
  await assert.rejects(readMesh(new Blob([body,'solid two\n',facet]),'stl'),/Incomplete STL facet/);
});

test('independent file and triangle caps reject oversized inputs before reading triangle data',async()=>{
  await assert.rejects(readMesh({size:maxFileBytes+1},'obj'),/no larger than/);
  const count=maxTriangles+1;
  const header=new ArrayBuffer(84);
  new DataView(header).setUint32(80,count,true);
  const file={size:84+50*count,slice(start,end){
    assert.equal(start,0);assert.equal(end,84);
    return new Blob([header]);
  }};
  await assert.rejects(readMesh(file,'stl'),/at most/);
  await assert.rejects(readMesh(new Blob([quad,'f 1 2 9']),'obj'),/vertex index/);
  await assert.rejects(readMesh(new Blob(['v 0 0 0\nv Infinity 1 1\nv 2 2 1\nf 1 2 3']),'obj'),/finite/);
});

test('dense display geometry is reduced independently of the full fitted mesh',async()=>{
  const side=110,positions=[],indices=[];
  for(let y=0;y<=side;y++)for(let x=0;x<=side;x++)positions.push(`v ${x} ${y} 0`);
  for(let y=0;y<side;y++)for(let x=0;x<side;x++){
    const a=y*(side+1)+x+1;
    indices.push(`f ${a} ${a+1} ${a+side+2} ${a+side+1}`);
  }
  let result;globalThis.self={postMessage(data){result=data}};
  try{
    await import('../js/mesh-worker.js');
    await self.onmessage({data:{file:new Blob([positions.concat(indices).join('\n')]),type:'obj'}});
    assert.ifError(result.error);
    assert.equal(result.vertices.length,side*side*2*9);
    assert.ok(result.preview.length>0 && result.preview.length<result.vertices.length);
    assert.equal(result.normals.length,result.preview.length);
    assert.ok(Math.abs(result.box.max.x-result.box.min.x-3.05)<1e-5);
  }finally{delete globalThis.self}
});
