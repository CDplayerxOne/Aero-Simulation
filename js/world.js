import * as T from '../vendor/three.module.min.js';
import {clamp,mod} from './circuits.js';
import {material,box,mesh,labelTexture,batch} from './models.js';
function rand(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function asphalt(random){
 const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),pixels=g.createImageData(256,256);
 for(let i=0;i<pixels.data.length;i+=4){const n=82+random()*31;pixels.data.set([n,n,n+1,255],i)}
 g.putImageData(pixels,0,0);const tex=new T.CanvasTexture(c);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;
}
function strip(track,left,right,height,mat,colorFn,skip){
 const positions=[],colors=[],uv=[],C=new T.Color();
 for(let i=0;i<track.count;i++){const s=i*track.ds;if(skip?.(s))continue;const color=colorFn?.(i,s);
   const a=track.sample(s,left),b=track.sample(s,right),c=track.sample(s+track.ds,left),d=track.sample(s+track.ds,right);
   for(const [p,u,v] of [[a,0,s],[c,0,s+track.ds],[b,1,s],[b,1,s],[c,0,s+track.ds],[d,1,s+track.ds]]){
     positions.push(p.x,p.y+height,p.z);uv.push(u*(right-left)/9,v/9);if(color!==undefined){C.set(color);colors.push(C.r,C.g,C.b)}
   }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 if(colors.length)g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();mat.side=T.DoubleSide;return new T.Mesh(g,mat);
}
function local(track,s,offset,y=0){const p=track.sample(s,offset),g=new T.Group();g.position.set(p.x,p.y+y,p.z);g.rotation.y=Math.atan2(p.tx,p.tz);return g}
export function buildWorld(track){
 const scene=new T.Scene(),def=track.def,random=rand(def.length*847),hue=new T.Color(def.fog);
 scene.background=new T.Color(def.sky);scene.fog=new T.FogExp2(def.fog,.00126);
 scene.add(new T.HemisphereLight(0xfff2d9,0x9caca5,1.85));const sun=new T.DirectionalLight(0xffe0aa,2.45);sun.position.set(380,380,-210);scene.add(sun);
 // A gradient sky and distant silhouettes give each circuit its own horizon.
 const sky=new T.Mesh(new T.SphereGeometry(1900,40,20),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{upper:{value:new T.Color(def.sky)},low:{value:hue}},vertexShader:'varying vec3 d;void main(){d=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 d;uniform vec3 low;uniform vec3 upper;void main(){vec3 n=normalize(d);float h=smoothstep(-.05,.55,n.y);vec3 c=mix(low,upper,h);float sun=max(dot(n,normalize(vec3(.68,.32,-.64))),0.);c+=vec3(1.,.67,.32)*(.23*pow(sun,13.)+.65*smoothstep(.9983,.9995,sun));gl_FragColor=vec4(c,1.);\n#include <colorspace_fragment>\n}'}));scene.add(sky);
 for(let ring=0;ring<2;ring++){
   const v=[],idx=[],radius=ring?840:1120;for(let i=0;i<=160;i++){const a=i/160*Math.PI*2;
     const ridge=70+65*Math.sin(a*5+ring)+38*Math.sin(a*13.0)+20*Math.cos(a*27)+(def.theme==='alpine'?70:10);
     const x=Math.sin(a)*radius,z=Math.cos(a)*radius;v.push(x,-55,z,x*.94,ridge*(ring?.84:1),z*.94);
     if(i){const j=i*2;idx.push(j-2,j-1,j,j-1,j+1,j)}
   }
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const m=material(new T.Color(def.rock).lerp(hue,ring?.23:.49));m.side=T.DoubleSide;mesh(scene,g,m,100,0,30);
 }
 function nearest(x,z){let best=0,d=Infinity;for(let i=0;i<track.count;i+=5){const p=track.nodes[i],v=(x-p.x)**2+(z-p.z)**2;if(v<d){d=v;best=i}}
   return track.locate(x,z,best)}
 function ground(x,z){const q=nearest(x,z),distance=Math.hypot(x-q.p.x,z-q.p.z);const mix=clamp((distance-17)/40,0,1);return q.p.y-clamp(q.offset,-24,24)*q.p.bank-2.5+mix*(3.5*Math.sin(x*.018)*Math.cos(z*.022)+7*Math.sin(z*.008+x*.009))}
 const terrain=new T.PlaneGeometry(1780,1710,100,100);terrain.rotateX(-Math.PI/2);terrain.translate(110,0,30);const pos=terrain.attributes.position,tints=[],C=new T.Color();
 for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);pos.setY(i,ground(x,z));C.set(def.grass).multiplyScalar(.76+random()*.37);tints.push(C.r,C.g,C.b)}
 terrain.setAttribute('color',new T.Float32BufferAttribute(tints,3));terrain.computeVertexNormals();mesh(scene,terrain,new T.MeshStandardMaterial({vertexColors:true,flatShading:true,roughness:1}));
 const W=track.width,roadMat=material(0xc6c5c2);roadMat.map=asphalt(random);
 scene.add(strip(track,-W,W,.04,roadMat));const verge=material(0xaa997c);scene.add(strip(track,-W-8,-W,.012,verge),strip(track,W,W+8,.012,verge));
 const white=material(0xf1ead7),rails=material(0xa6b2b1,.54,.48),steel=material(0x3d4b4d,.35),red=material(0xc84327,.22),navy=material(0x1c303b,.34),concrete=material(0xaaa79a),wood=material(0x635340);
 for(const side of [-1,1]){
   scene.add(strip(track,side*(W-.20),side*(W-.05),.065,white));
   const curb=new T.MeshStandardMaterial({vertexColors:true});scene.add(strip(track,side*W,side*(W+.83),.09,curb,i=>Math.floor(i/2)%2?0xf0e9d7:0xb9442b,s=>Math.abs(track.nodes[Math.round(s/track.ds)%track.count].k)<.005));
 }
 const pitGap=s=>s>track.length-100||s<40;
 const objects=new T.Group();scene.add(objects);
 function placeBox(s,o,y,dim,mat){const p=track.sample(s,o),m=box(objects,dim,mat,p.x,p.y+y,p.z);m.rotation.y=Math.atan2(p.tx,p.tz);return m}
 for(const side of [-1,1])for(let s=0;s<track.length;s+=7){
   if(side<0&&pitGap(s))continue;
   const offset=side*(W+6.7),a=track.sample(s,offset),b=track.sample(s+7,offset);
   const len=Math.hypot(a.x-b.x,a.z-b.z),rot=Math.atan2(b.x-a.x,b.z-a.z);
   for(const h of [.59,.95]){const m=box(objects,[.14,.23,len+.12],rails,(a.x+b.x)/2,(a.y+b.y)/2+h,(a.z+b.z)/2);m.rotation.y=rot;m.rotation.x=-Math.atan2(b.y-a.y,len)}
   placeBox(s,offset,.51,[.19,1.13,.22],steel);
 }
 for(let j=0;j<6;j++){const s=(5-j>>1)*8,o=(j%2?1:-1)*2.4;placeBox(s,o,.075,[2.5,.012,.16],white);placeBox(s-1.2,o-1.16,.07,[.13,.012,2.3],white);placeBox(s-1.2,o+1.16,.07,[.13,.012,2.3],white)}
 for(let i=0;i<20;i++)for(let j=0;j<2;j++)placeBox(28+j*.72,(i-9.5)*.75,.085,[.75,.015,.72],(i+j)%2?white:navy);
 function textBoard(group,text,x,y,z,w,h,fg='#f5e9cf',bg='#1b2c35'){
   const mat=new T.MeshBasicMaterial({map:labelTexture(text,fg,bg),side:T.DoubleSide});const m=mesh(group,new T.PlaneGeometry(w,h),mat,x,y,z);m.rotation.y=Math.PI;return m;
 }
 const gantry=local(track,31,0);scene.add(gantry);box(gantry,[.45,6,.50],rails,-W-.9,3,0);box(gantry,[.45,6,.50],rails,W+.9,3,0);box(gantry,[2*W+2.5,1.7,.5],navy,0,6,0);textBoard(gantry,'GROUNDLINE',0,6,-.26,14,1.55);batch(gantry);
 const pitMat=material(0x777f7e);scene.add(strip(track,-32,-W,.055,pitMat,undefined,s=>!pitGap(s)));
 const pit=local(track,-53,-21,.05);scene.add(pit);
 box(pit,[10,.16,19],concrete,0,0,-1);box(pit,[.30,5.50,18],concrete,-4.85,2.7,-1);box(pit,[.30,5.50,18],concrete,4.85,2.7,-1);
 box(pit,[10,5.5,.30],navy,0,2.7,-10);box(pit,[10.5,.28,19],steel,0,5.55,-1);
 for(let z=-8;z<8;z+=3.4){box(pit,[9.6,.13,.18],steel,0,5.28,z);box(pit,[4,.08,.20],new T.MeshBasicMaterial({color:0xfff0c4}),0,5.13,z)}
 for(const side of [-1,1]){box(pit,[.08,.5,17.8],red,side*4.66,1.65,-1);box(pit,[.30,5.6,.45],steel,side*4.75,2.75,7.85)}
 box(pit,[10,.70,.55],red,0,5.2,7.86);textBoard(pit,'GROUNDLINE  /  22',0,5.22,7.56,7.4,.55);batch(pit);
 const door=new T.Group();door.position.z=7.82;pit.add(door);
 for(let i=0;i<14;i++){box(door,[9.15,.338,.17],i%2?rails:pitMat,0,.19+i*.345,0);box(door,[9.1,.025,.035],steel,0,.345+i*.345,-.10)}
 textBoard(door,'GROUNDLINE',0,2.55,-.115,5.2,.80);batch(door);
 // Grandstand, pit boxes and spectator colors along the start straight.
 for(let s=42;s<142;s+=20){const g=local(track,s,24);scene.add(g);
   for(let r=0;r<5;r++){box(g,[1.6,.35,18.3],concrete,r*1.28,r*.68+.25,0);
     for(let a=-8;a<=8;a+=1.65){box(g,[.45,.75,.46],[navy,red,white,wood][Math.floor(random()*4)],r*1.28,r*.68+.78,a+random()*.3)}}
   box(g,[9,.24,20],navy,2.8,5.9,0);for(const z of [-8,8])box(g,[.18,6,.19],steel,5.8,2.9,z);batch(g)}
 for(let s=75;s<175;s+=24){const g=local(track,s,-25);scene.add(g);box(g,[11,5.2,22],concrete,0,2.45,0);box(g,[11.8,.4,23],red,0,5.1,0);for(let z=-7;z<10;z+=7)box(g,[.08,3.75,5.9],steel,5.54,1.84,z);batch(g)}
 for(let s=140;s<track.length;s+=250){const g=local(track,s,18);scene.add(g);box(g,[8,2.1,.32],navy,0,3,0);for(const x of [-3,3])box(g,[.18,3,.18],steel,x,1.4,0);textBoard(g,def.theme==='desert'?'COPPER CANYON':'GROUNDLINE',0,3,-.18,7.7,1.6);batch(g)}
 batch(objects);
 const placements=[];for(let i=0;i<(def.theme==='forest'?1250:720);i++){
   const x=random()*1180-430,z=random()*1100-520,q=nearest(x,z),d=Math.hypot(x-q.p.x,z-q.p.z);
   if(d<30||(pitGap(q.s)&&d<53)||(q.s<180&&d<48))continue;
   placements.push([x,ground(x,z),z,3+random()*(def.theme==='desert'?3.8:9),random()*6.28]);
 }
 function instances(geo,mat,fn){const obj=new T.InstancedMesh(geo,mat,placements.length),dummy=new T.Object3D();placements.forEach((p,i)=>{fn(dummy,...p);dummy.updateMatrix();obj.setMatrixAt(i,dummy.matrix);obj.setColorAt(i,new T.Color().setScalar(.69+random()*.40))});scene.add(obj)}
 if(def.theme!=='desert'){
   instances(new T.CylinderGeometry(.06,.10,1,5),wood,(o,x,y,z,h,a)=>{o.position.set(x,y+h*.31,z);o.scale.setScalar(h*.65);o.rotation.y=a});
   for(let layer=0;layer<2;layer++)instances(new T.ConeGeometry(1,1,7),material(def.trees),(o,x,y,z,h,a)=>{o.position.set(x,y+h*(.52+layer*.23),z);o.scale.set(h*(.24-layer*.07),h*(.66-layer*.14),h*(.25-layer*.07));o.rotation.y=a});
 }else instances(new T.DodecahedronGeometry(1,0),material(def.rock),(o,x,y,z,h,a)=>{o.position.set(x,y+.6,z);o.scale.set(h*.67,h*.43,h*.56);o.rotation.y=a});
 return {scene,pit,door,sky};
}
export function disposeWorld(scene){const geometries=new Set(),mats=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material)){mats.add(m);if(m.map)textures.add(m.map)}});geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose())}
