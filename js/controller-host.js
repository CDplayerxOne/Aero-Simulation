import {localDescription,remoteDescription,drawCode,neutral,readInput} from './controller-link.js';
import {signal} from './pairing-api.js';
export function createControllerHost({onAction,onLoss,getMode}){
  const el=id=>document.getElementById(id);
  let peer,channel,room,lastPacket=0,input=neutral(),sentMode='',waitingTimer;
  function status(message){el('pairStatus').textContent=message}
  function cancelRoom(token){
    if(token)void signal('cancel',{token}).catch(()=>{});
  }
  function reset(){
    clearTimeout(waitingTimer);cancelRoom(room?.token);room=null;
    const old=peer;peer=null;channel=null;old?.close();
    lastPacket=0;input=neutral();sentMode='';
    el('pairSteps').hidden=true;
    el('endPair').hidden=true;el('makePair').hidden=false;
  }
  function lost(){
    reset();status('Phone disconnected. Pair again to reconnect.');onLoss();
  }
  async function pair(){
    reset();el('makePair').hidden=true;el('endPair').hidden=false;status('Preparing connection…');
    let session;
    try{
      session=new RTCPeerConnection({iceServers:[]});peer=session;
      const data=session.createDataChannel('groundline-controls');channel=data;
      data.onopen=()=>{
        if(session!==peer)return;
        clearTimeout(waitingTimer);cancelRoom(room?.token);room=null;lastPacket=performance.now();
        el('pairSteps').hidden=true;status('Phone connected.');data.send(JSON.stringify({mode:getMode()}));
      };
      data.onmessage=event=>{
        if(session!==peer||typeof event.data!=='string'||event.data.length>400)return;
        let packet;try{packet=JSON.parse(event.data)}catch{return}
        if(!packet)return;
        if(packet.type==='input'){input=readInput(packet);lastPacket=performance.now()}
        if(packet.type==='action')onAction(packet.action);
      };
      data.onclose=()=>{if(session===peer)lost()};
      session.onconnectionstatechange=()=>{if(session===peer&&session.connectionState==='failed')lost()};
      const offer=await localDescription(session,'offer');
      if(session!==peer)return;
      const created=await signal('create',{offer});
      if(session!==peer){cancelRoom(created.token);return}
      room=created;
      const url=new URL('controller.html',location.href);url.searchParams.set('code',room.code);
      el('pairCode').textContent=room.code.slice(0,3)+' '+room.code.slice(3);
      el('pairSteps').hidden=false;el('offerQr').hidden=true;
      status('Waiting for your phone…');
      drawCode(el('offerQr'),url.href).then(()=>{if(session===peer)el('offerQr').hidden=false}).catch(()=>{});
      waitForPhone(session,created);
    }catch(error){if(session===peer||!peer){reset();status(error.message||'Pairing could not start.')}}
  }
  async function waitForPhone(session,created){
    if(session!==peer)return;
    try{
      if(Date.now()>=created.expires)throw Error('Code expired. Create a new code to pair.');
      let response;
      try{response=await signal('poll',{token:created.token})}
      catch(error){if(error.status && error.status<500)throw error}
      if(session!==peer)return;
      if(!response?.answer){
        waitingTimer=setTimeout(()=>waitForPhone(session,created),1200);
        return;
      }
      status('Connecting to your phone…');
      await remoteDescription(session,'answer',response.answer);
      if(session!==peer||channel.readyState==='open')return;
      waitingTimer=setTimeout(()=>{
        if(session===peer&&channel.readyState!=='open'){
          reset();status('Connection timed out. Check that both devices are on the same Wi-Fi and create a new code.');
        }
      },20000);
    }catch(error){if(session===peer){reset();status(error.message)}}
  }
  el('makePair').onclick=pair;
  el('endPair').onclick=()=>{const connected=channel?.readyState==='open';reset();status('Pairing ended.');if(connected)onLoss()};
  addEventListener('pagehide',reset);
  return {
    current(){
      if(performance.now()-lastPacket>350)return neutralState;
      return input;
    },
    sync(){
      const mode=getMode();
      if(channel?.readyState==='open'&&mode!==sentMode){channel.send(JSON.stringify({mode}));sentMode=mode}
    }
  };
}
const neutralState=Object.freeze(neutral());
