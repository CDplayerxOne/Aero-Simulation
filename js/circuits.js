import * as T from '../vendor/three.module.min.js';
export const circuits=[
 {name:'Sierra Vista',region:'Mountain circuit',length:2110,sky:0x94bfd6,fog:0xb9c4bd,grass:0x807e4b,rock:0x7b7364,trees:0x465b3d,height:11,theme:'alpine',points:[[0,0],[0,150],[50,225],[155,245],[235,195],[235,80],[160,20],[195,-65],[245,-130],[190,-211],[60,-230],[-60,-170],[-90,-85],[-20,-60]]},
 {name:'Copper Canyon',region:'Desert circuit',length:1750,sky:0xe4b78c,fog:0xd5a884,grass:0xba8350,rock:0x985b40,trees:0x68633e,height:20,theme:'desert',points:[[0,0],[0,115],[-70,195],[-30,265],[90,246],[127,155],[200,177],[281,108],[239,31],[281,-74],[215,-169],[72,-182],[48,-95],[3,-75]]},
 {name:'Northwood Park',region:'Forest circuit',length:2070,sky:0xa6c4cc,fog:0xa1b8b6,grass:0x607b4b,rock:0x667567,trees:0x304f3b,height:7,theme:'forest',points:[[0,0],[0,170],[45,235],[185,238],[238,180],[185,110],[140,60],[185,2],[290,12],[337,-86],[245,-193],[89,-213],[72,-114],[10,-80]]}
];
export const mod=(x,n)=>(x%n+n)%n;
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function makeCircuit(def){
 const raw=def.points.map(([x,z])=>new T.Vector3(x,0,z)),curve=new T.CatmullRomCurve3(raw,true);
 curve.arcLengthDivisions=4000;const scale=def.length/curve.getLength();raw.forEach(p=>p.multiplyScalar(scale));curve.updateArcLengths();
 const count=Math.round(def.length/2.8),ds=def.length/count,width=7.7;
 const nodes=Array.from({length:count},(_,i)=>{
   const u=i/count,p=curve.getPointAt(u),t=curve.getTangentAt(u),theta=u*Math.PI*2;
   const y=def.height*(.53*Math.sin(theta)+.28*Math.sin(3*theta)+.19*Math.sin(5*theta));
   return {x:p.x,z:p.z,y,tx:t.x,tz:t.z,s:i*ds};
 });
 nodes.forEach((p,i)=>{const a=nodes[mod(i-2,count)],b=nodes[mod(i+2,count)];p.k=Math.atan2(b.tx*a.tz-b.tz*a.tx,b.tz*a.tz+b.tx*a.tx)/(4*ds);p.bank=clamp(p.k*1.2,-.075,.075);p.grade=(b.y-a.y)/(4*ds)});
 function sample(s,offset=0){const u=mod(s,def.length)/ds,i=Math.floor(u)%count,p=nodes[i],q=nodes[(i+1)%count],f=u%1,lerp=(a,b)=>a+(b-a)*f;
   const tx=lerp(p.tx,q.tx),tz=lerp(p.tz,q.tz);return {x:lerp(p.x,q.x)+tz*offset,z:lerp(p.z,q.z)-tx*offset,y:lerp(p.y,q.y)-offset*lerp(p.bank,q.bank),tx,tz,k:lerp(p.k,q.k),grade:lerp(p.grade,q.grade),bank:lerp(p.bank,q.bank)}}
 function locate(x,z,hint){let best=hint,min=Infinity;
   function consider(i){const j=mod(i,count),p=nodes[j],d=(x-p.x)**2+(z-p.z)**2;if(d<min){min=d;best=j}}
   for(let d=-9;d<=9;d++)consider(hint+d);
   if(min>45**2)for(let i=0;i<count;i++)consider(i);
   const p=nodes[best],dx=x-p.x,dz=z-p.z;
   return {i:best,s:mod(p.s+dx*p.tx+dz*p.tz,def.length),offset:dx*p.tz-dz*p.tx,p};
 }
 return {def,nodes,count,ds,width,sample,locate,length:def.length};
}
