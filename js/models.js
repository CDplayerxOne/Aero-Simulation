import * as T from '../vendor/three.module.min.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
export function material(color,metalness=0,roughness=.7){return new T.MeshStandardMaterial({color,metalness,roughness})}
export function mesh(group,geo,mat,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);group.add(m);return m}
export function box(group,size,mat,x=0,y=0,z=0){return mesh(group,new T.BoxGeometry(...size),mat,x,y,z)}
export function labelTexture(text,fg,bg,w=512,h=128,italic=false){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,w,h)}ctx.fillStyle=fg;ctx.font=(italic?'italic ':'')+'bold '+Math.round(h*.70)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h*.53,w*.94);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;return tex}
export function batch(group){
 const buckets=new Map();group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert();
 for(const m of [...group.children]){if(!m.isMesh||Array.isArray(m.material))continue;const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
   if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
   g.applyMatrix4(new T.Matrix4().multiplyMatrices(inverse,m.matrixWorld));if(!buckets.has(m.material))buckets.set(m.material,[]);buckets.get(m.material).push(g);group.remove(m);m.geometry.dispose()}
 for(const [mat,parts] of buckets){const g=mergeGeometries(parts);if(g)mesh(group,g,mat);parts.forEach(p=>p.dispose())}
}
export const numbers=['22','16','24','36','52','81'];
const liveries=[0xc6f137,0xf68565,0x90b9ff,0x71e1d1,0xb391f5,0xf2be69];
let chassis;
export async function loadRaceCar(){
 const asset=await new GLTFLoader().loadAsync(new URL('../assets/formula.glb',import.meta.url).href);
 chassis=asset.scene;
}
function raceGraphics(number){
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
 const ctx=canvas.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';
 function print(text,y,size,color,italic=false){
   ctx.font=(italic?'italic ':'')+'bold '+size+'px sans-serif';ctx.fillStyle=color;ctx.fillText(text,256,y,470);
 }
 print('GROUNDLINE',28,51,'#eef6f5');print('A E R O D Y N A M I C S',54,13,'#c8dddb');
 print(number,95,65,'white',true);print('T R A X E N',158,42,'#dbc984',true);print(number,225,62,'#14293b',true);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
export function raceCar(id){
 const root=new T.Group(),shell=new T.Group(),wheels=[];
 const model=chassis.clone(true),atlas=raceGraphics(numbers[id]);
 const livery=material(liveries[id],.32,.34);
 const graphics=new T.MeshStandardMaterial({map:atlas,alphaTest:.28,side:T.DoubleSide});
 const tail=material(0xff594a);tail.emissive.setHex(0xff4332);
 model.traverse(node=>{
   if(!node.isMesh)return;
   const paints={livery,graphics,rainLight:tail};
   node.material=paints[node.material.name]||node.material;
 });
 root.add(shell);
 for(const part of [...model.children]){
   if(part.name==='body'){shell.add(part);continue}
   const pivot=new T.Group();pivot.position.copy(part.position);part.position.set(0,0,0);
   pivot.add(part);root.add(pivot);wheels.push({pivot,wheel:part,front:pivot.position.z>0});
 }
 const shadow=mesh(root,new T.CircleGeometry(1,32),new T.MeshBasicMaterial({color:0x0b1421,transparent:true,opacity:.34,depthWrite:false}),0,.018,0);
 shadow.rotation.x=-Math.PI/2;shadow.scale.set(.85,2.55,1);
 return {root,shell,wheels,tail};
}
