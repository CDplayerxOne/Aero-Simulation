import {clamp,mod} from './circuits.js';
const mass=812,wheelbase=3.48,front=1.57,rear=wheelbase-front,gravity=9.81,ratios=[3.85,3.02,2.48,2.08,1.79,1.55,1.36,1.21];
export function makeDriver(track,s,lane,number){
 const p=track.sample(s,lane);return {x:p.x,z:p.z,heading:Math.atan2(p.tx,p.tz),speed:0,side:0,omega:0,steer:0,gear:0,rpm:1050,shift:0,acc:0,latAcc:0,
 progress:s,lap:0,best:Infinity,lastLap:0,lapStart:0,finished:false,finishTime:Infinity,number,lane,offset:lane,index:Math.floor(mod(s,track.length)/track.ds),surface:p,wheel:0,braking:0,throttle:0,handbrake:0};
}
export function advance(c,input,track,dt){
 const v=c.speed,abs=Math.abs(v),off=Math.abs(c.offset)>track.width+.65;
 const mu=off?.57:1.29,load=mass*gravity+2.5*v*v,transfer=clamp(c.acc*mass*.30/wheelbase,-2100,2100);
 const fzF=load*rear/wheelbase-transfer,fzR=load*front/wheelbase+transfer;
 c.steer+=(input.steer*(.55/(1+abs*.013))-c.steer)*(1-Math.exp(-dt*7.8));
 c.shift=Math.max(0,c.shift-dt);
 const wheelRpm=abs/.365*60/(2*Math.PI)*4.05;
 c.rpm=clamp(wheelRpm*ratios[c.gear],3200,12500);
 if(!c.shift){if(c.rpm>11850&&c.gear<ratios.length-1){c.gear++;c.shift=.06}else if(c.rpm<7400&&c.gear>0){c.gear--;c.shift=.1}}
 const torque=430+115*Math.sin(Math.PI*clamp((c.rpm-3200)/9300,0,1)),drive=c.shift?0:input.gas*torque*ratios[c.gear]*4.05*.90/.365;
 c.braking=input.brake;c.throttle=input.gas;
 const brake=input.brake*15500,dir=Math.sign(v||1),frontLong=clamp(-dir*brake*.62,-mu*fzF,mu*fzF);
 // Blend rear-wheel lock and release so grip returns progressively on corner exit.
 const lockTarget=input.handbrake ? 1 : 0;
 c.handbrake+=(lockTarget-c.handbrake)*(1-Math.exp(-dt*(lockTarget?9:4)));
 const rearLimit=mu*fzR*(1-.32*c.handbrake);
 const rearDrive=drive*(1-c.handbrake);
 const rearLong=clamp(rearDrive-dir*(brake*.38+c.handbrake*rearLimit*.94),-rearLimit*.96,rearLimit*.85);
 const denom=Math.max(4,abs),slipF=c.steer-Math.atan2(c.side+front*c.omega,denom),slipR=-Math.atan2(c.side-rear*c.omega,denom);
 const gripF=Math.sqrt(Math.max(0,(fzF*mu)**2-frontLong**2)),gripR=Math.sqrt(Math.max(0,rearLimit**2-rearLong**2));
 const fyF=gripF*Math.tanh(85000*slipF/Math.max(1,gripF)),fyR=gripR*Math.tanh(94000*slipR/Math.max(1,gripR));
 const cs=Math.cos(c.steer),sn=Math.sin(c.steer),yf=fyF*cs+frontLong*sn;
 const resist=.68*v*abs+(off?510:145)*Math.tanh(v)+(input.gas||abs<1?0:210);
 c.acc=(rearLong+frontLong*cs-fyF*sn-resist)/mass-gravity*c.surface.grade;
 c.latAcc=(yf+fyR)/mass+gravity*c.surface.bank;
 c.speed=clamp(v+dt*(c.acc+c.omega*c.side),0,88);
 c.side+=dt*(c.latAcc-c.omega*v);c.omega+=dt*(front*yf-rear*fyR)/1800;
 if(abs<6){const mix=(1-abs/6)*Math.min(1,dt*22);c.omega+=(v*Math.tan(c.steer)/wheelbase-c.omega)*mix;c.side*=1-mix}
 // Electronic stability control applies a corrective yaw moment as sideslip grows.
 const yawLimit=mu*gravity/Math.max(5,abs),desiredYaw=clamp(v*Math.tan(c.steer)/wheelbase,-yawLimit,yawLimit);
 const sideslip=Math.abs(Math.atan2(c.side,denom)),assist=(1.6+clamp(sideslip*18,0,8))*(1-.78*c.handbrake);
 c.omega+=(desiredYaw-c.omega)*(1-Math.exp(-dt*assist));
 c.heading+=c.omega*dt;const sin=Math.sin(c.heading),cos=Math.cos(c.heading);
 c.x+=dt*(sin*c.speed+cos*c.side);c.z+=dt*(cos*c.speed-sin*c.side);c.wheel+=c.speed*dt/.365;
 const hit=track.locate(c.x,c.z,c.index),limit=track.width+5.7;
 if(Math.abs(hit.offset)>limit){
   const excess=hit.offset-Math.sign(hit.offset)*limit;c.x-=excess*hit.p.tz;c.z+=excess*hit.p.tx;
   // Remove velocity into the rail while preserving travel along it.
   const normalX=Math.sign(hit.offset)*hit.p.tz,normalZ=-Math.sign(hit.offset)*hit.p.tx;
   const forwardDot=sin*normalX+cos*normalZ,rightDot=cos*normalX-sin*normalZ;
   const outward=Math.max(0,c.speed*forwardDot+c.side*rightDot);
   c.speed=Math.max(0,c.speed-outward*forwardDot)*Math.exp(-dt*.7);
   c.side-=outward*rightDot;
   c.omega*=Math.exp(-dt*5);
   if(c.speed<3 && input.gas && Math.abs(c.steer)>.04)c.heading+=c.steer*dt*1.8;
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
// Resolve oriented chassis contacts in world space, including crossing and opposing traffic.
function resolveContact(a,b){
 const dx=b.x-a.x,dz=b.z-a.z;
 if(dx*dx+dz*dz>34)return;
 const body=c=>{const sin=Math.sin(c.heading),cos=Math.cos(c.heading);return {forward:[sin,cos],right:[cos,-sin]}};
 const A=body(a),B=body(b);
 const dot=(u,v)=>u[0]*v[0]+u[1]*v[1];
 const radius=(basis,axis)=>2.74*Math.abs(dot(basis.forward,axis))+.99*Math.abs(dot(basis.right,axis));
 let depth=Infinity,normal;
 for(const axis of [A.right,A.forward,B.right,B.forward]){
   const distance=dx*axis[0]+dz*axis[1];
   const overlap=radius(A,axis)+radius(B,axis)-Math.abs(distance);
   if(overlap<=0)return;
   if(overlap<depth){depth=overlap;normal=distance<0?[-axis[0],-axis[1]]:axis}
 }
 const separation=(depth+.001)*.5;
 a.x-=normal[0]*separation;a.z-=normal[1]*separation;
 b.x+=normal[0]*separation;b.z+=normal[1]*separation;
 const af=dot(A.forward,normal),ar=dot(A.right,normal);
 const bf=dot(B.forward,normal),br=dot(B.right,normal);
 const closing=a.speed*af+a.side*ar-b.speed*bf-b.side*br;
 if(closing<=0)return;
 const impulse=closing*.5;
 a.speed=Math.max(0,a.speed-impulse*af);a.side-=impulse*ar;
 b.speed=Math.max(0,b.speed+impulse*bf);b.side+=impulse*br;
}
export function carContacts(cars){
 for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++)resolveContact(cars[i],cars[j]);
}
