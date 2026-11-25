import { OBJLoader } from '../vendor/OBJLoader.js';
import { STLLoader } from '../vendor/STLLoader.js';
self.onmessage=({data:{buffer,type}})=>{
  try{
    let parts=[];
    if(type==='obj'){const model=new OBJLoader().parse(new TextDecoder().decode(buffer));model.traverse(m=>{if(m.isMesh)parts.push(m.geometry.attributes.position.array)})}
    else parts=[new STLLoader().parse(buffer).attributes.position.array];
    const count=parts.reduce((sum,p)=>sum+p.length,0);
    if(!count||count%9)throw Error('No triangular faces found.');
    if(count>9*350000)throw Error('Use a mesh with at most 350,000 triangles.');
    const result=new Float32Array(count);let start=0;const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const part of parts){result.set(part,start);start+=part.length}
    for(let i=0;i<count;i++){const t=i%3,v=result[i];if(!Number.isFinite(v))throw Error('Mesh coordinates must be finite.');min[t]=Math.min(min[t],v);max[t]=Math.max(max[t],v)}
    const extent=Math.max(...max.map((v,i)=>v-min[i]));if(extent<=0)throw Error('The mesh has no measurable size.');
    for(let i=0;i<count;i++){const t=i%3;result[i]=(result[i]-(min[t]+max[t])/2)*3.05/extent}
    self.postMessage({vertices:result},[result.buffer]);
  }catch(e){self.postMessage({error:e.message||'Could not read this mesh.'})}
};
