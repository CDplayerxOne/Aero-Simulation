import {clamp,mod} from './circuits.js';
const mass=1220,wheelbase=2.66,front=1.21,rear=wheelbase-front,gravity=9.81,ratios=[3.16,2.14,1.63,1.31,1.09,.90];
export function makeDriver(track,s,lane,number){
 const p=track.sample(s,lane);return {x:p.x,z:p.z,heading:Math.atan2(p.tx,p.tz),speed:0,side:0,omega:0,steer:0,gear:0,rpm:1050,shift:0,acc:0,latAcc:0,
 progress:s,lap:0,best:Infinity,lastLap:0,lapStart:0,finished:false,finishTime:Infinity,number,lane,offset:lane,index:Math.floor(mod(s,track.length)/track.ds),surface:p,wheel:0,braking:0,throttle:0};
}
export function advance(c,input,track,dt){
 const v=c.speed,abs=Math.abs(v),off=Math.abs(c.offset)>track.width+.65;
 const mu=off?.57:1.29,load=mass*gravity+1.1*v*v,transfer=clamp(c.acc*mass*.43/wheelbase,-2100,2100);
 const fzF=load*rear/wheelbase-transfer,fzR=load*front/wheelbase+transfer;
 c.steer+=(input.steer*(.55/(1+abs*.013))-c.steer)*(1-Math.exp(-dt*7.8));
 c.shift=Math.max(0,c.shift-dt);
 const wheelRpm=abs/.33*60/(2*Math.PI)*3.72;
 c.rpm=clamp(wheelRpm*ratios[c.gear],1050,8250);
 if(!c.shift){if(c.rpm>7620&&c.gear<5){c.gear++;c.shift=.13}else if(c.rpm<3850&&c.gear>0){c.gear--;c.shift=.1}}
 const torque=380+112*Math.sin(Math.PI*clamp((c.rpm-1000)/7400,0,1)),drive=c.shift?0:input.gas*torque*ratios[c.gear]*3.72*.90/.33;
 c.braking=input.brake;c.throttle=input.gas;
 const brake=input.brake*15500,dir=Math.sign(v||1),frontLong=clamp(-dir*brake*.62,-mu*fzF,mu*fzF);
 const rearLong=clamp(drive-dir*brake*.38,-mu*fzR*.91,mu*fzR*.85);
 const denom=Math.max(4,abs),slipF=c.steer-Math.atan2(c.side+front*c.omega,denom),slipR=-Math.atan2(c.side-rear*c.omega,denom);
 const gripF=Math.sqrt(Math.max(0,(fzF*mu)**2-frontLong**2)),gripR=Math.sqrt(Math.max(0,(fzR*mu)**2-rearLong**2));
 const fyF=gripF*Math.tanh(85000*slipF/Math.max(1,gripF)),fyR=gripR*Math.tanh(94000*slipR/Math.max(1,gripR));
 const cs=Math.cos(c.steer),sn=Math.sin(c.steer),yf=fyF*cs+frontLong*sn;
 const resist=.43*v*abs+(off?510:145)*Math.tanh(v)+(input.gas||abs<1?0:210);
 c.acc=(rearLong+frontLong*cs-fyF*sn-resist)/mass-gravity*c.surface.grade;
 c.latAcc=(yf+fyR)/mass+gravity*c.surface.bank;
 c.speed=clamp(v+dt*(c.acc+c.omega*c.side),0,88);
 c.side+=dt*(c.latAcc-c.omega*v);c.omega+=dt*(front*yf-rear*fyR)/1800;
 if(abs<6){const mix=(1-abs/6)*Math.min(1,dt*22);c.omega+=(v*Math.tan(c.steer)/wheelbase-c.omega)*mix;c.side*=1-mix}
 // Electronic stability control applies a corrective yaw moment as sideslip grows.
 const yawLimit=mu*gravity/Math.max(5,abs),desiredYaw=clamp(v*Math.tan(c.steer)/wheelbase,-yawLimit,yawLimit);
 const sideslip=Math.abs(Math.atan2(c.side,denom)),assist=1.6+clamp(sideslip*18,0,8);
 c.omega+=(desiredYaw-c.omega)*(1-Math.exp(-dt*assist));
 c.heading+=c.omega*dt;const sin=Math.sin(c.heading),cos=Math.cos(c.heading);
 c.x+=dt*(sin*c.speed+cos*c.side);c.z+=dt*(cos*c.speed-sin*c.side);c.wheel+=c.speed*dt/.33;
 const hit=track.locate(c.x,c.z,c.index),limit=track.width+5.7;
 if(Math.abs(hit.offset)>limit){
   const excess=hit.offset-Math.sign(hit.offset)*limit;c.x-=excess*hit.p.tz;c.z+=excess*hit.p.tx;
   const tangent=Math.atan2(hit.p.tx,hit.p.tz),angle=Math.atan2(Math.sin(tangent-c.heading),Math.cos(tangent-c.heading));
   c.heading+=clamp(angle,-.055,.055);c.speed*=Math.exp(-dt*2.1);c.side*=Math.exp(-dt*12);c.omega*=.94;
 }
 const prev=mod(c.progress,track.length),delta=mod(hit.s-prev+track.length*.5,track.length)-track.length*.5;c.progress+=delta;c.index=hit.i;c.surface=hit.p;c.offset=clamp(hit.offset,-limit,limit);
}
export function aiControl(c,track,field){
 const v=c.speed,look=clamp(9+v*.42,10,35);let lane=c.lane;
 const ahead=field.find(other=>other!==c&&other.progress>c.progress&&other.progress-c.progress<23&&Math.abs(other.offset-c.offset)<2.35);
 if(ahead)lane=clamp(ahead.offset+(ahead.offset>0?-3.2:3.2),-4.8,4.8);
 const target=track.sample(c.progress+look,lane),angle=Math.atan2(target.x-c.x,target.z-c.z)-c.heading;
 const steer=clamp(Math.atan(2*wheelbase*Math.sin(angle)/look)/(.55/(1+v*.013))*1.18-c.omega*.035,-1,1);
 let targetSpeed=73;
 for(let d=0;d<=135;d+=9){const p=track.sample(c.progress+d),corner=Math.sqrt((9.25+c.number*.12)/Math.max(.001,Math.abs(p.k)));targetSpeed=Math.min(targetSpeed,Math.sqrt(corner**2+2*6.9*d))}
 if(Math.abs(c.offset)>track.width)targetSpeed=Math.min(targetSpeed,22);
 if(ahead&&ahead.progress-c.progress<7&&Math.abs(c.offset-ahead.offset)<1.9)targetSpeed=Math.min(targetSpeed,Math.max(10,ahead.speed-2));
 return {steer,gas:clamp((targetSpeed-v)*.32,0,1),brake:clamp((v-targetSpeed)*.13,0,.86)};
}
export function carContacts(cars){
 for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
   const a=cars[i],b=cars[j],dx=b.x-a.x,dz=b.z-a.z;if(Math.abs(dx)>5||Math.abs(dz)>5)continue;
   const sn=Math.sin(a.heading),cs=Math.cos(a.heading),ax=dx*cs-dz*sn,az=dx*sn+dz*cs;
   const overlapX=1.87-Math.abs(ax),overlapZ=4.3-Math.abs(az);if(overlapX<=0||overlapZ<=0)continue;
   if(overlapX<overlapZ){const p=(Math.sign(ax)||1)*overlapX*.51;a.x-=cs*p;a.z+=sn*p;b.x+=cs*p;b.z-=sn*p;
     const closing=(a.side-b.side)*Math.sign(ax);if(closing>0){a.side-=closing*Math.sign(ax)*.52;b.side+=closing*Math.sign(ax)*.52}}
   else {const p=(Math.sign(az)||1)*overlapZ*.51;a.x-=sn*p;a.z-=cs*p;b.x+=sn*p;b.z+=cs*p;const rel=(a.speed-b.speed)*Math.sign(az);if(rel>0){a.speed-=rel*Math.sign(az)*.54;b.speed+=rel*Math.sign(az)*.54}}
 }
}
