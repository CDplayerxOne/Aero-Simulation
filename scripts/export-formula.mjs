// Bake a race-resolution version of the demo chassis without rebuilding its surfaces in every browser.
import {readFileSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const source=readFileSync(new URL('wind-tunnel.html',root),'utf8');
const start=source.indexOf('const $=id=>'),end=source.indexOf('// Cell-centred disturbance');
if(start<0||end<start)throw Error('Cannot find the wind tunnel geometry builder.');
const geometry=source.slice(start,end);
const {vertices,indices,wheels}=runInNewContext(geometry+`
 const fullSurface=surface;
 surface=(nu,nv,...args)=>fullSurface(Math.max(1,Math.ceil(nu*.46)),Math.max(1,Math.ceil(nv*.46)),...args);
 const wheels=[],fullWheel=wheel;
 wheel=(x,z,width)=>{const begin=indices.length;fullWheel(x,z,width);wheels.push({begin,end:indices.length,x,z})};
 buildCar(18);
 ({vertices,indices,wheels})
`);
const roles=['chassis','livery','graphics','rainLight'];
const gltf={asset:{version:'2.0',generator:'Groundline wind tunnel'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],
 materials:roles.map(name=>({name,doubleSided:true,pbrMetallicRoughness:{metallicFactor:.21,roughnessFactor:.48}})),buffers:[{}],bufferViews:[],accessors:[]};
const chunks=[];let bytes=0;
function accessor(array,type,components,bounds=false){
 const data=Buffer.from(array.buffer);const pad=(4-bytes%4)%4;chunks.push(Buffer.alloc(pad),data);bytes+=pad;
 const view=gltf.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:data.length})-1;bytes+=data.length;
 const entry={bufferView:view,componentType:array instanceof Uint16Array?5123:5126,count:array.length/components,type};
 if(bounds){entry.min=[Infinity,Infinity,Infinity];entry.max=[-Infinity,-Infinity,-Infinity];array.forEach((v,i)=>{const k=i%3;entry.min[k]=Math.min(entry.min[k],v);entry.max[k]=Math.max(entry.max[k],v)})}
 return gltf.accessors.push(entry)-1;
}
const parts=new Map();
for(let i=0;i<indices.length;i+=3){
 const w=wheels.find(w=>i>=w.begin&&i<w.end);
 const name=w?'wheel'+wheels.indexOf(w):'body';
 if(!parts.has(name))parts.set(name,{center:w?[w.z,.37,-w.x]:[0,0,0],groups:new Map()});
 const part=parts.get(name),offset=indices[i]*13;
 const hex=vertices.slice(offset+6,offset+9).map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
 const role=vertices[offset+9]===6?2:hex==='c6f137'||hex==='e7fc80'?1:hex==='fb6854'?3:0;
 if(!part.groups.has(role))part.groups.set(role,{map:new Map(),indices:[],positions:[],normals:[],colors:[],uv:[]});
 const g=part.groups.get(role),tri=[];
 for(const id of indices.slice(i,i+3)){
   if(!g.map.has(id)){
     const k=id*13,[cx,cy,cz]=part.center;g.map.set(id,g.map.size);
     g.positions.push(vertices[k+2]-cx,vertices[k+1]-cy,-vertices[k]-cz);
     g.normals.push(vertices[k+5],vertices[k+4],-vertices[k+3]);
     for(const c of vertices.slice(k+6,k+9))g.colors.push(role===1||role===2?1:c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
     g.uv.push(vertices[k+10],vertices[k+11]);
   }
   tri.push(g.map.get(id));
 }
 // Some tunnel surfaces use an explicit normal flip. Match triangle winding for PBR shading.
 const [a,b,c]=tri.map(j=>g.positions.slice(j*3,j*3+3)),u=b.map((v,j)=>v-a[j]),v=c.map((v,j)=>v-a[j]);
 const n=g.normals.slice(tri[0]*3,tri[0]*3+3);
 if((u[1]*v[2]-u[2]*v[1])*n[0]+(u[2]*v[0]-u[0]*v[2])*n[1]+(u[0]*v[1]-u[1]*v[0])*n[2]<0)tri.reverse();
 g.indices.push(...tri);
}
for(const [name,part] of parts){
 const primitives=[];
 for(const [material,g] of part.groups){
   if(g.map.size>65535)throw Error('Index exceeds 16-bit primitive limit.');
   const floats=(values,type,n,bounds)=>accessor(new Float32Array(values),type,n,bounds);
   const attributes={POSITION:floats(g.positions,'VEC3',3,true),NORMAL:floats(g.normals,'VEC3',3),COLOR_0:floats(g.colors,'VEC3',3)};
   if(material===2)attributes.TEXCOORD_0=floats(g.uv,'VEC2',2);
   primitives.push({attributes,material,indices:accessor(new Uint16Array(g.indices),'SCALAR',1)});
 }
 const mesh=gltf.meshes.push({primitives})-1;
 gltf.scenes[0].nodes.push(gltf.nodes.push({name,mesh,translation:part.center})-1);
}
const bin=Buffer.concat(chunks);gltf.buffers[0].byteLength=bin.length;
const json=Buffer.from(JSON.stringify(gltf));
function chunk(type,buf,pad){const len=Math.ceil(buf.length/4)*4,header=Buffer.alloc(8);header.writeUInt32LE(len);header.write(type,4,4,'ascii');return Buffer.concat([header,buf,Buffer.alloc(len-buf.length,pad)])}
const payload=Buffer.concat([chunk('JSON',json,32),chunk('BIN\0',bin,0)]),header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(payload.length+12,8);
writeFileSync(new URL('assets/formula.glb',root),Buffer.concat([header,payload]));
