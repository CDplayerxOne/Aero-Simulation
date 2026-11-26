import {localDescription,remoteDescription,drawCode,neutral,wheelAngle,wheelSteering} from './controller-link.js';
const el=id=>document.getElementById(id);
let peer,channel,timer,angle=null,center=null,tilt=0,motionEnabled=false;
const held=new Map();
function send(packet){
  if(channel?.readyState==='open'&&channel.bufferedAmount<8192)channel.send(JSON.stringify(packet));
}
function sendInput(){
  const buttons=new Set(held.values());
  const steer=buttons.has('left')||buttons.has('right')?Number(buttons.has('left'))-Number(buttons.has('right')):tilt;
  send({type:'input',steer,gas:buttons.has('gas'),brake:buttons.has('brake'),drift:buttons.has('drift')});
  el('wheelMarker').style.left=(50-47*steer)+'%';
}
function release(){
  held.clear();tilt=0;center=null;
  document.querySelectorAll('.held').forEach(button=>button.classList.remove('held'));
  send({type:'input',...neutral()});
}
async function enableMotion(){
  try{
    const sensor=window.DeviceOrientationEvent;
    if(!sensor)throw Error();
    if(typeof sensor.requestPermission==='function'&&await sensor.requestPermission()!=='granted')throw Error();
    motionEnabled=true;el('motionStatus').textContent='Hold upright and still to set the centre. Touch steering is also available.';
    window.addEventListener('deviceorientation',onTilt);
  }catch{el('motionStatus').textContent='Tilt unavailable. Use Steer left and Steer right, or allow motion access and try again.'}
}
function onTilt(e){
  if(document.hidden||!motionEnabled)return;
  angle=wheelAngle(e.beta,e.gamma);
  if(angle===null){tilt=0;return}
  if(center===null){center=angle;el('motionStatus').textContent='Rotate to steer. Tap Recenter to set a new straight-ahead position.'}
  tilt=wheelSteering(angle,center);
}
el('motion').onclick=enableMotion;
el('center').onclick=()=>{center=angle;tilt=0;sendInput()};
screen.orientation?.addEventListener('change',()=>{center=null;tilt=0});
function updateMode(mode){
  const names={garage:'Start race',intro:'Pause',countdown:'Pause',racing:'Pause',paused:'Resume',finished:'Return to garage'};
  el('mainAction').textContent=names[mode]||'Pause';el('mainAction').dataset.mode=mode;
  for(const b of document.querySelectorAll('[data-hold],[data-action]'))b.disabled=mode!=='racing';
  release();
}
el('mainAction').onclick=()=>send({type:'action',action:el('mainAction').dataset.mode});
document.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>send({type:'action',action:button.dataset.action}));
for(const b of document.querySelectorAll('[data-hold]')){
  b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.set(e.pointerId,b.dataset.hold);b.classList.add('held');sendInput()};
  b.onlostpointercapture=b.onpointercancel=b.onpointerup=e=>{held.delete(e.pointerId);if(![...held.values()].includes(b.dataset.hold))b.classList.remove('held');sendInput()};
}
function disconnected(message){
  const old=peer;peer=null;channel=null;clearInterval(timer);old?.close();release();
  el('pad').hidden=true;el('pairPhone').hidden=false;el('reply').hidden=true;el('join').disabled=false;
  el('linkEntry').hidden=false;el('hostLink').value='';el('linkState').textContent='Disconnected';
  el('pairHelp').textContent=message;
}
const offer=location.hash.slice(1);el('linkEntry').hidden=!!offer;
el('join').onclick=async()=>{
  const value=el('linkEntry').hidden?offer:el('hostLink').value.trim().split('#').pop();
  if(!value){el('pairHelp').textContent='In the race garage, choose Pair phone and scan or paste the pairing link.';return}
  // iOS requires the motion prompt to start directly inside a tap handler.
  void enableMotion();
  el('join').disabled=true;el('linkState').textContent='Pairing…';
  let session;
  try{
    session=new RTCPeerConnection({iceServers:[]});peer=session;
    session.ondatachannel=e=>{
      if(peer!==session)return;channel=e.channel;
      channel.onmessage=({data})=>{try{const packet=JSON.parse(data);if(typeof packet.mode==='string')updateMode(packet.mode)}catch{}};
      function connected(){
        if(peer!==session)return;
        el('pad').hidden=false;el('pairPhone').hidden=true;el('linkState').textContent='Connected';
        clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)sendInput()},40);sendInput();
      }
      channel.onopen=connected;if(channel.readyState==='open')connected();
      channel.onclose=()=>{if(peer===session)disconnected('Connection ended. Start a fresh pairing on the race computer.')};
    };
    session.onconnectionstatechange=()=>{if(peer===session&&session.connectionState==='failed')disconnected('Could not connect. Use the same Wi-Fi and request a new link from the race computer.')};
    await remoteDescription(session,'offer',value);
    const answer=await localDescription(session,'answer');
    if(peer!==session)return;
    el('replyCode').value=answer;el('reply').hidden=false;
    try{await drawCode(el('returnQr'),answer)}catch{el('returnQr').hidden=true}
    el('pairHelp').textContent='Finish pairing on the race computer.';
  }catch(error){if(!peer||peer===session)disconnected(error.message||'Pairing failed. Request a fresh link and try again.')}
};
el('copyReturn').onclick=async()=>{try{await navigator.clipboard.writeText(el('replyCode').value);el('copyReturn').textContent='Copied'}catch{el('replyCode').select()}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)release()});
addEventListener('blur',release);addEventListener('pagehide',()=>{release();peer?.close()});
