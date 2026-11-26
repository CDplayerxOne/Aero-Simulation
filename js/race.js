import * as T from '../vendor/three.module.min.js';
import {circuits,makeCircuit,clamp,mod} from './circuits.js';
import {makeDriver,advance,aiControl,carContacts} from './dynamics.js';
import {createControllerHost} from './controller-host.js';
import {createRaceAudio} from './race-audio.js';
import {raceCar,numbers,loadRaceCar} from './models.js';
import {buildWorld,disposeWorld} from './world.js';
const $=id=>document.getElementById(id),tracks=circuits.map(makeCircuit),keys=new Set();
const theme=getComputedStyle(document.documentElement);
const mapColors={
 selected:theme.getPropertyValue('--accent').trim(),
 unselected:theme.getPropertyValue('--muted').trim(),
 opponent:theme.getPropertyValue('--text').trim(),
 start:theme.getPropertyValue('--amber').trim()
};
const lapCount=5,clockText=t=>{const ms=Math.floor(t*1000);return Math.floor(ms/60000)+':'+String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+String(ms%1000).padStart(3,'0')};
let renderer,camera,world,track,cars=[],models=[],mode='garage',previous,elapsed=0,intro=0,gridTime=0,accumulator=0,prevStamp=0,hudTimer=0,closeCamera=false,active=0;
let audio,mixer,sound=false;
async function audioToggle(){
 const button=$('sound');
 button.disabled=true;
 try{
   if(!audio){audio=new AudioContext();mixer=createRaceAudio(audio)}
   if(!sound)await audio.resume();
   sound=!sound;
   button.textContent=sound?'Sound on':'Sound off';
   button.setAttribute('aria-pressed',String(sound));
   updateAudio();
   button.disabled=false;
 }catch{
   sound=false;button.textContent='Audio unavailable';button.setAttribute('aria-pressed','false');
 }
}
$('sound').onclick=audioToggle;
function updateAudio(){
 mixer?.update(cars[0],sound && !!cars[0] && mode!=='paused' && !document.hidden,mode);
}
function drawMap(canvas,t,list=[],selected=true){
 const w=canvas.width,h=canvas.height,ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);
 const b=t.bounds,scale=Math.min((w-18)/(b.maxX-b.minX),(h-18)/(b.maxZ-b.minZ)),point=(x,z)=>[(x-(b.minX+b.maxX)/2)*scale+w/2,h/2-(z-(b.minZ+b.maxZ)/2)*scale];
 ctx.beginPath();for(let i=0;i<t.count;i+=4){const p=t.nodes[i],v=point(p.x,p.z);if(i)ctx.lineTo(...v);else ctx.moveTo(...v)}ctx.closePath();ctx.lineWidth=list.length?3.7:4;ctx.strokeStyle=list.length||!selected?mapColors.unselected:mapColors.selected;ctx.stroke();ctx.fillStyle=mapColors.start;const [sx,sy]=point(t.nodes[0].x,t.nodes[0].z);ctx.fillRect(sx-3,sy-3,6,6);
 for(const c of [...list].reverse()){ctx.beginPath();ctx.arc(...point(c.x,c.z),c.number?3.3:5,0,Math.PI*2);ctx.fillStyle=c.number?mapColors.opponent:mapColors.selected;ctx.fill()}
}
for(const [i,t] of tracks.entries()){
 t.bounds={minX:Math.min(...t.nodes.map(p=>p.x)),maxX:Math.max(...t.nodes.map(p=>p.x)),minZ:Math.min(...t.nodes.map(p=>p.z)),maxZ:Math.max(...t.nodes.map(p=>p.z))};
 const button=document.createElement('button');button.className='track';button.disabled=true;button.innerHTML='<canvas width="120" height="80" aria-hidden="true"></canvas><span><b></b><small></small></span>';button.querySelector('b').textContent=t.def.name;button.querySelector('small').textContent=t.def.region+' · '+(t.length/1000).toFixed(2)+' km';button.onclick=()=>setup(i);$('tracks').append(button);drawMap(button.firstChild,t,[],i===0);
}
function resize(){const cv=$('world'),w=cv.clientWidth,h=cv.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;if(mode==='garage'&&w>760)camera.setViewOffset(w,h,-w*.16,0,w,h);else camera.clearViewOffset();camera.updateProjectionMatrix()}
function garagePoint(s,lane){
 const p=track.sample(s,lane);return new T.Vector3(p.x,p.y+.14,p.z)
}
function setup(i){
 active=i;mode='garage';keys.clear();elapsed=0;intro=0;gridTime=0;accumulator=0;track=tracks[i];
 if(world)disposeWorld(world.scene);world=buildWorld(track);cars=Array.from({length:6},(_,id)=>makeDriver(track,id===0?0:4+3.9*id,(id%2?1:-1)*2.15,id));
 models=cars.map((_,id)=>{const model=raceCar(id);world.scene.add(model.root);return model});
 const player=cars[0],p=world.pit.position;player.x=p.x;player.z=p.z;player.heading=world.pit.rotation.y;
 models[0].root.position.copy(p);models[0].root.position.y+=.115;
 for(let id=1;id<6;id++)updateModel(cars[id],models[id],0,true);
 models[0].root.rotation.y=player.heading;
 document.querySelectorAll('.track').forEach((b,n)=>{b.setAttribute('aria-pressed',String(n===i));drawMap(b.firstChild,tracks[n],[],n===i)});
 $('garage').hidden=false;for(const id of ['racehud','banner','pause','pausePanel','result','touch'])$(id).hidden=true;$('circuitName').textContent=track.def.name;
 resize();updateCamera(1,true);
}
function updateModel(c,m,dt,snap=false){
 const p=c.surface,s=track.sample(c.progress,c.offset);m.root.position.set(c.x,s.y+.14,c.z);m.root.rotation.order='YXZ';m.root.rotation.y=c.heading;
 const pitch=-Math.atan(p.grade)-clamp(c.acc*.0016,-.018,.018),roll=-p.bank+clamp(c.latAcc*.0032,-.054,.054);
 const f=snap?1:1-Math.exp(-dt*12);m.root.rotation.x+=(pitch-m.root.rotation.x)*f;m.shell.rotation.z+=(roll-m.shell.rotation.z)*f;
 for(const w of m.wheels){w.pivot.rotation.y=w.front?c.steer:0;w.wheel.rotation.x=c.wheel}m.tail.emissiveIntensity=c.braking>.1?2.5:.45;
}
const desired=new T.Vector3(),target=new T.Vector3(),aim=new T.Vector3();
function updateCamera(dt,snap=false){
 const c=cars[0],m=models[0].root,p=m.position,sn=Math.sin(c.heading),cs=Math.cos(c.heading);
 if(mode==='garage'){desired.set(p.x+sn*4.85+cs*3.38,p.y+1.95,p.z+cs*4.85-sn*3.38);target.set(p.x,p.y+.65,p.z)}
 else {const hood=closeCamera&&mode==='racing',dist=hood?-.25:mode==='intro'?5.2:6.4+c.speed*.018;
   desired.set(p.x-sn*dist,p.y+(hood?.9:mode==='intro'?2.22:2.72+c.speed*.007),p.z-cs*dist);target.set(p.x+sn*(hood?17:6.2),p.y+(hood?.81:1.10),p.z+cs*(hood?17:6.2));
   if(mode==='racing'||mode==='countdown'){desired.y-=c.surface.grade*dist;target.y+=c.surface.grade*(hood?17:6.2)}
 }
 const mounted=snap||(closeCamera&&mode==='racing');const blend=mounted?1:1-Math.exp(-dt*7);camera.position.lerp(desired,blend);aim.lerp(target,mounted?1:1-Math.exp(-dt*10));camera.lookAt(aim);const fov=mode==='garage'?48:59+c.speed*.10;if(Math.abs(camera.fov-fov)>.05){camera.fov=fov;camera.updateProjectionMatrix()}world.sky.position.copy(camera.position);
}
function banner(text){$('banner').textContent=text;$('banner').hidden=!text}
function begin(){
 mode='intro';$('garage').hidden=true;$('pause').hidden=false;intro=0;world.door.scale.y=1;resize();updateCamera(1,true);banner('Garage exit');
}
const controlsDialog=$('controlsDialog'),slider=$('sensitivity');
let sensitivity=100,briefed=false,launchAfterControls=false,resumeAfterControls=false;
try{
 const saved=Number(localStorage.getItem('groundline.steering'));
 if(saved>=40&&saved<=160)sensitivity=saved;
}catch{}
function displaySensitivity(){
 slider.value=String(sensitivity);
 $('sensitivityValue').value=sensitivity+'%';
 slider.setAttribute('aria-valuetext',sensitivity+' percent');
}
displaySensitivity();
slider.oninput=()=>{
 sensitivity=Number(slider.value);displaySensitivity();
 try{localStorage.setItem('groundline.steering',slider.value)}catch{}
};
const phone=createControllerHost({
  getMode:()=>mode,
  onLoss:()=>{if(mode==='racing')pause()},
  onAction(action){
    if(document.hidden||!cars.length)return;
    if(action==='garage'&&mode==='garage'){
      if(controlsDialog.open){launchAfterControls=true;controlsDialog.close('done')}
      else {briefed=true;begin()}
      return;
    }
    if(controlsDialog.open){
      if(action==='paused'&&mode==='paused')controlsDialog.close('done');
      return;
    }
    if(action==='finished'&&mode==='finished')setup(active);
    else if(action==='paused'&&mode==='paused')resume();
    else if(action===mode && ['intro','countdown','racing'].includes(mode))pause();
    else if(action==='camera'&&mode==='racing'){closeCamera=!closeCamera;updateCamera(1,true)}
    else if(action==='recover'&&mode==='racing')recover();
  }
});
$('garagePair').onclick=()=>{
  openControls();
  $('phoneDetails').open=true;
  if(!$('makePair').hidden)$('makePair').click();
  $('phoneDetails').scrollIntoView({block:'nearest'});
};
$('phoneDetails').ontoggle=()=>{if(!$('phoneDetails').open)phone.stopCamera()};
function openControls(launch=false){
 if(controlsDialog.open)return;
 launchAfterControls=launch;
 resumeAfterControls=['racing','intro','countdown'].includes(mode);
 if(resumeAfterControls)pause();
 $('controlsDone').textContent=launch?'Enter race':'Done';
 controlsDialog.showModal();
}
$('controlsButton').onclick=()=>openControls();
$('controlsDone').onclick=()=>controlsDialog.close('done');
controlsDialog.onclose=()=>{
 phone.stopCamera();
 const confirmed=controlsDialog.returnValue==='done';
 if(confirmed)briefed=true;
 if(launchAfterControls&&confirmed)begin();
 else if(resumeAfterControls&&!document.hidden&&document.hasFocus())resume();
 launchAfterControls=false;resumeAfterControls=false;controlsDialog.returnValue='';
};
$('start').onclick=()=>briefed?begin():openControls(true);
function rollout(dt){
 intro+=dt;const opened=clamp(intro/2.15,0,1);world.door.scale.y=1-opened*.98;world.door.position.y=opened*4.82;
 const u=clamp((intro-1.65)/5.45,0,1),s=-53+53*u*u*(3-2*u);
 const blend=clamp((u-.31)/.69,0,1),lane=-21+18.85*blend*blend*(3-2*blend);
 const start=world.pit.position,base=garagePoint(s,lane),offset=garagePoint(-53,-21),p=base.clone().addScaledVector(new T.Vector3(start.x-offset.x,0,start.z-offset.z),1-u);
 const c=cars[0],dx=p.x-c.x,dz=p.z-c.z;if(Math.hypot(dx,dz)>.0002)c.heading=Math.atan2(dx,dz);
 c.x=p.x;c.z=p.z;c.speed=Math.hypot(dx,dz)/dt;c.rpm=1000+190*c.speed;c.wheel+=c.speed*dt/.365;
 models[0].root.position.copy(p);models[0].root.rotation.y=c.heading;for(const w of models[0].wheels)w.wheel.rotation.x=c.wheel;
 if(intro>2.2)banner('');if(u>=1){cars[0]=makeDriver(track,0,-2.15,0);updateModel(cars[0],models[0],dt,true);mode='countdown';gridTime=0;$('racehud').hidden=false;banner('3');updateHud()}
}
function ranking(){return [...cars].sort((a,b)=>a.finished&&b.finished?a.finishTime-b.finishTime:a.finished?-1:b.finished?1:b.progress-a.progress)}
function finish(){mode='finished';keys.clear();banner('');$('touch').hidden=$('pause').hidden=true;$('result').hidden=false;const c=cars[0],order=ranking(),place=order.indexOf(c)+1;
 $('resultText').textContent='P'+place+' at '+track.def.name+' · '+clockText(c.finishTime)+' total · Best lap '+clockText(c.best);$('standings').replaceChildren();
 for(const row of order){const li=document.createElement('li'),time=document.createElement('span');li.textContent=row.number?'Groundline #'+numbers[row.number]:'You · #'+numbers[0];if(!row.number)li.className='you';time.textContent=row.finished?clockText(row.finishTime):Math.round(Math.max(0,5*track.length-row.progress))+' m to finish';li.append(time);$('standings').append(li)}
}
function step(dt){
 if(mode==='intro'){rollout(dt);return}
 if(mode==='countdown'){gridTime+=dt;if(gridTime>=3){mode='racing';banner('GO');$('touch').hidden=false}else banner(String(3-Math.floor(gridTime)));return}
 if(mode!=='racing')return;
 elapsed+=dt;if(elapsed>1.35&&!$('banner').hidden)banner('');
 const steering=Number(keys.has('ArrowLeft')||keys.has('KeyA'))-Number(keys.has('ArrowRight')||keys.has('KeyD'));
 const remote=phone.current();
 const playerInput={
   gas:Number(keys.has('ArrowUp')||keys.has('KeyW')||remote.gas),
   brake:Number(keys.has('ArrowDown')||keys.has('KeyS')||remote.brake),
   steer:(steering||remote.steer)*sensitivity/100,
   handbrake:keys.has('Space')||remote.drift
 };
 for(const c of cars){
   const before=c.progress;advance(c,c.number||c.finished?aiControl(c,track,cars):playerInput,track,dt);
   if(!c.finished&&c.progress>=(c.lap+1)*track.length){const fraction=clamp(((c.lap+1)*track.length-before)/Math.max(.0001,c.progress-before),0,1),crossing=elapsed-dt+dt*fraction;
     c.lap++;c.lastLap=crossing-c.lapStart;c.best=Math.min(c.best,c.lastLap);c.lapStart=crossing;if(c.lap===lapCount){c.finished=true;c.finishTime=crossing}}
 }
 carContacts(cars);for(let i=0;i<cars.length;i++)updateModel(cars[i],models[i],dt);if(cars[0].finished){updateHud();finish()}
}
function updateHud(){const c=cars[0];$('pos').innerHTML=(ranking().indexOf(c)+1)+'<em>/ 6</em>';$('lap').innerHTML=Math.min(5,c.lap+1)+'<em>/ 5</em>';
 $('time').textContent=clockText(c.finished?c.lastLap:elapsed-c.lapStart);$('best').textContent='Best lap '+(Number.isFinite(c.best)?clockText(c.best):'—');$('velocity').textContent=String(Math.round(c.speed*3.6)).padStart(3,'0');$('gear').textContent=c.gear+1;$('rev').style.width=100*c.rpm/12500+'%';drawMap($('map'),track,cars)}
function pause(){if(!['racing','intro','countdown'].includes(mode))return;previous=mode;mode='paused';keys.clear();document.querySelectorAll('[data-key]').forEach(b=>b.classList.remove('held'));$('pausePanel').hidden=false;$('pause').hidden=true;$('touch').hidden=true;$('recover').hidden=previous!=='racing';updateAudio()}
function resume(){if(mode!=='paused')return;mode=previous;$('pausePanel').hidden=true;$('pause').hidden=false;$('touch').hidden=mode!=='racing';prevStamp=0}
function recover(){const c=cars[0],fresh=makeDriver(track,c.progress,0,0);Object.assign(c,{x:fresh.x,z:fresh.z,heading:fresh.heading,speed:0,side:0,omega:0,steer:0,index:fresh.index,surface:fresh.surface,offset:0,acc:0,latAcc:0,gear:0,handbrake:0});updateModel(c,models[0],0,true);updateCamera(1,true)}
$('pause').onclick=pause;$('resume').onclick=resume;$('recover').onclick=()=>{resume();recover()};document.querySelectorAll('.return').forEach(b=>b.onclick=()=>setup(active));
const driveKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyS','KeyA','KeyD','Space'];
addEventListener('keydown',e=>{if(controlsDialog.open)return;if(e.code==='Escape'){if(mode==='paused')resume();else pause();return}
 if(mode!=='racing')return;if(driveKeys.includes(e.code)){e.preventDefault();keys.add(e.code)}else if(!e.repeat&&e.code==='KeyR')recover();else if(!e.repeat&&e.code==='KeyC'){closeCamera=!closeCamera;updateCamera(1,true)}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();updateAudio()});
for(const b of document.querySelectorAll('[data-key]')){b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);b.classList.add('held')};const release=()=>{keys.delete(b.dataset.key);b.classList.remove('held')};b.onpointerup=b.onpointercancel=b.onlostpointercapture=release}
function frame(stamp){const dt=prevStamp?Math.min(.12,(stamp-prevStamp)/1000):0;prevStamp=stamp;
 if(mode!=='paused'&&mode!=='finished'){accumulator+=dt;while(accumulator>=1/120){step(1/120);accumulator-=1/120}updateCamera(dt);hudTimer+=dt;if(hudTimer>.09&&!$('racehud').hidden){updateHud();hudTimer=0}}
 phone.sync();updateAudio();renderer.render(world.scene,camera)}
try{renderer=new T.WebGLRenderer({canvas:$('world'),antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));camera=new T.PerspectiveCamera(57,1,.08,2600);await loadRaceCar();setup(0);$('start').disabled=false;$('start').textContent='Start race';document.querySelectorAll('.track').forEach(button=>button.disabled=false);addEventListener('resize',resize);renderer.setAnimationLoop(frame)}
catch(error){console.error(error);$('garage').hidden=true;$('raceError').hidden=false;$('raceError').textContent='The racing renderer could not start. Enable WebGL and hardware acceleration, then reload the garage.'}
