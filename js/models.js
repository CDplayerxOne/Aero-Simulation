import * as T from '../vendor/three.module.min.js';
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
function hull(group,sections,mat){
 const v=[],idx=[];for(const [z,y,w,h] of sections){for(const [side,up] of [[-.78,0],[-1,.19],[-1,.63],[-.88,.92],[-.55,1],[.55,1],[.88,.92],[1,.63],[1,.19],[.78,0]])v.push(w*side,y+h*up,z)}
 for(let i=0;i<sections.length-1;i++)for(let j=0;j<10;j++){const a=i*10+j,b=i*10+(j+1)%10;idx.push(a,b,a+10,b,b+10,a+10)}
 for(let i=1;i<9;i++){idx.push(0,i+1,i);const last=(sections.length-1)*10;idx.push(last,last+i,last+i+1)}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();mat.side=T.DoubleSide;return mesh(group,g,mat)
}
function strut(group,a,b,r,mat){const av=new T.Vector3(...a),bv=new T.Vector3(...b),dir=bv.clone().sub(av);const m=mesh(group,new T.CylinderGeometry(r,r,dir.length(),8),mat);m.position.copy(av).lerp(bv,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());return m}
const bodyPaint=[0x152c3b,0xd64b21,0xe6dfc8,0x277e86,0x58754c,0xcc9a34];
export const numbers=['07','16','24','36','52','81'];
export function raceCar(id){
 const root=new T.Group(),shell=new T.Group();root.add(shell);
 const paint=material(bodyPaint[id],.48,.28),black=material(0x192028,.27,.48),rubber=material(0x171b20,0,.94),rim=material(0xa69d84,.72,.3),glass=material(0x263d49,.60,.18);
 const trim=material(0x111a20,.22,.35),orange=material(0xef582e,.32,.36),gold=material(0xedab45,.39,.38),bright=material(0xf3e3b1,.2,.33);bright.emissive.setHex(0xf5ca7a);bright.emissiveIntensity=.65;
 hull(shell,[[-2.14,.39,.82,.46],[-1.94,.31,.96,.63],[-1.44,.30,1.02,.72],[-.78,.29,.96,.60],[.48,.29,.94,.60],[1.22,.3,1.01,.59],[1.80,.28,.98,.52],[2.12,.28,.85,.37]],paint);
 hull(shell,[[-1.45,.84,.80,.09],[-.86,.85,.77,.49],[-.42,.85,.73,.60],[.22,.86,.72,.58],[.84,.83,.78,.15],[.93,.82,.80,.03]],glass);
 hull(shell,[[-.79,1.31,.65,.06],[-.46,1.41,.72,.065],[.16,1.39,.70,.068],[.31,1.34,.67,.045]],paint);
 box(shell,[1.98,.07,3.99],black,0,.23,-.04);box(shell,[2.04,.055,.60],trim,0,.22,1.94);
 const tail=material(0xc62524,.12,.28);tail.emissive.setHex(0xe82e20);tail.emissiveIntensity=.5;
 box(shell,[1.60,.11,.06],trim,0,.75,-2.13);
 for(const side of [-1,1]){
   box(shell,[.63,.085,.055],tail,side*.46,.76,-2.17);
   box(shell,[.06,.095,3.62],orange,side*.967,.52,-.03);
   box(shell,[.057,.047,3.58],gold,side*.97,.59,-.05);
   box(shell,[.14,.11,2.8],black,side*.94,.28,-.02);
   strut(shell,[side*.80,.88,.84],[side*.64,1.42,.23],.035,paint);
   strut(shell,[side*.74,.88,-.45],[side*.68,1.45,-.41],.032,black);
   strut(shell,[side*.81,.88,-1.32],[side*.65,1.35,-.77],.056,paint);
   strut(shell,[side*.8,.91,.54],[side*1.04,.98,.51],.022,black);
   const mirror=mesh(shell,new T.SphereGeometry(1,10,8),paint,side*1.035,.99,.51);mirror.scale.set(.12,.071,.16);
   const lamp=mesh(shell,new T.SphereGeometry(1,16,10),bright,side*.70,.70,1.83);lamp.scale.set(.17,.095,.15);
   strut(shell,[side*.64,.79,-1.91],[side*.60,1.24,-2.00],.046,trim);
   box(shell,[.05,.19,.56],paint,side*1.07,1.25,-2.03);
   const exhaust=mesh(shell,new T.CylinderGeometry(.075,.075,.22,12),trim,side*.59,.37,-2.13);exhaust.rotation.x=Math.PI/2;
 }
 for(let i=-3;i<=3;i++)box(shell,[.04,.17,.49],black,i*.20,.28,-1.98);
 box(shell,[2.14,.09,.48],black,0,1.24,-2.00).rotation.x=-.09;
 box(shell,[1.44,.14,.06],black,0,.47,2.105);
 for(let i=0;i<7;i++)box(shell,[.74,.025,.035],black,0,.96,-1.42-i*.057);
 const numberMat=new T.MeshBasicMaterial({map:labelTexture(numbers[id],'#17232b','#f2eddb',128,128,true),side:T.DoubleSide});
 for(const side of [-1,1]){const badge=mesh(shell,new T.CircleGeometry(.234,32),numberMat,side*.999,.70,-.04);badge.rotation.y=side*Math.PI/2}
 const plateMat=new T.MeshBasicMaterial({map:labelTexture('GROUNDLINE','#efe3c9','#1a252c',256,64,true)});mesh(shell,new T.PlaneGeometry(.70,.175),plateMat,0,.58,-2.162).rotation.y=Math.PI;
 const frontGlass=new T.MeshBasicMaterial({map:labelTexture('GROUNDLINE','#f3eee1','#212b30',512,80,true),side:T.DoubleSide});const strip=mesh(shell,new T.PlaneGeometry(1.28,.115),frontGlass,0,1.33,.38);strip.rotation.x=-.80;
 batch(shell);
 const wheels=[];
 for(const z of [-1.35,1.29])for(const side of [-1,1]){
   const pivot=new T.Group(),wheel=new T.Group();root.add(pivot);pivot.add(wheel);pivot.position.set(side*.9,.365,z);
   const tyre=mesh(wheel,new T.CylinderGeometry(.365,.365,.265,32),rubber);tyre.rotation.z=Math.PI/2;
   const disc=mesh(wheel,new T.CylinderGeometry(.258,.258,.271,28),black);disc.rotation.z=Math.PI/2;
   const ring=mesh(wheel,new T.TorusGeometry(.237,.018,6,28),rim,side*.141,0,0);ring.rotation.y=Math.PI/2;
   for(let i=0;i<9;i++){const a=i*Math.PI*2/9;const spoke=box(wheel,[.023,.040,.206],rim,side*.145,Math.sin(a)*.111,Math.cos(a)*.111);spoke.rotation.x=-a}
   const hub=mesh(wheel,new T.CylinderGeometry(.063,.063,.30,12),gold);hub.rotation.z=Math.PI/2;batch(wheel);wheels.push({pivot,wheel,front:z>0});
 }
 const shadowMat=new T.MeshBasicMaterial({color:0x141b1c,transparent:true,opacity:.35,depthWrite:false});const shadow=mesh(root,new T.CircleGeometry(1,32),shadowMat,0,.035,0);shadow.rotation.x=-Math.PI/2;shadow.scale.set(1.14,2.38,1);
 return {root,shell,wheels,tail};
}
