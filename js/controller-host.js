import {localDescription,remoteDescription,drawCode,neutral,readInput} from './controller-link.js';
export function createControllerHost({onAction,onLoss,getMode}){
  const el=id=>document.getElementById(id);
  let peer,channel,stream,scanTimer,lastPacket=0,input=neutral(),sentMode='',waitingTimer,scanVersion=0;
  function status(message){el('pairStatus').textContent=message}
  function stopCamera(){
    scanVersion++;
    clearTimeout(scanTimer);
    stream?.getTracks().forEach(track=>track.stop());
    stream=null;el('answerCamera').srcObject=null;el('answerCamera').hidden=true;
  }
  function reset(){
    stopCamera();clearTimeout(waitingTimer);
    const old=peer;peer=null;channel=null;old?.close();
    lastPacket=0;input=neutral();sentMode='';
    el('pairSteps').hidden=true;el('pairAnswer').value='';el('applyAnswer').disabled=false;
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
        stopCamera();clearTimeout(waitingTimer);lastPacket=performance.now();
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
      const url=new URL('controller.html',location.href);url.hash=offer;
      el('pairLink').value=url.href;
      el('pairSteps').hidden=false;
      try{await drawCode(el('offerQr'),url.href);el('offerQr').hidden=false}catch{el('offerQr').hidden=true}
      if(session===peer)status('On the same Wi-Fi, open this link on your phone or scan the QR code.');
    }catch(error){if(session===peer||!peer){reset();status(error.message||'Pairing could not start.')}}
  }
  async function accept(code){
    const session=peer;if(!session||el('applyAnswer').disabled)return;
    stopCamera();el('applyAnswer').disabled=true;
    try{
      await remoteDescription(session,'answer',code);
      if(peer!==session)return;
      status('Connecting to phone…');
      if(channel.readyState!=='open')waitingTimer=setTimeout(()=>{
        if(peer===session&&channel.readyState!=='open'){reset();status('Connection timed out. Use the same Wi-Fi with device-to-device access, then pair again.')}
      },15000);
    }catch{if(peer===session){el('applyAnswer').disabled=false;status('Could not read the return code. Paste it again or start a new pairing.')}}
  }
  async function scan(){
    stopCamera();const version=scanVersion;
    try{
      const media=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      if(version!==scanVersion){media.getTracks().forEach(t=>t.stop());return}
      stream=media;
      await import('../vendor/pairing/jsQR.js');
      if(version!==scanVersion)return;
      const video=el('answerCamera');video.srcObject=media;video.hidden=false;await video.play();
      const frame=document.createElement('canvas'),ctx=frame.getContext('2d',{willReadFrequently:true});
      function read(){
        if(version!==scanVersion)return;
        if(video.videoWidth){
          frame.width=Math.min(800,video.videoWidth);frame.height=Math.round(frame.width*video.videoHeight/video.videoWidth);
          ctx.drawImage(video,0,0,frame.width,frame.height);
          const pixels=ctx.getImageData(0,0,frame.width,frame.height);
          const result=globalThis.jsQR(pixels.data,frame.width,frame.height,{inversionAttempts:'dontInvert'});
          if(result?.data.startsWith('GL1-')){accept(result.data);return}
        }
        scanTimer=setTimeout(read,125);
      }
      read();
    }catch{if(version===scanVersion){stopCamera();status('Camera unavailable. Paste the return code from your phone.')}}
  }
  el('makePair').onclick=pair;
  el('endPair').onclick=()=>{const connected=channel?.readyState==='open';reset();status('Pairing ended.');if(connected)onLoss()};
  el('readQr').onclick=scan;
  el('applyAnswer').onclick=()=>accept(el('pairAnswer').value);
  el('copyPair').onclick=async()=>{try{await navigator.clipboard.writeText(el('pairLink').value);status('Link copied. Open it on your phone.')}catch{el('pairLink').select()}};
  addEventListener('pagehide',reset);
  return {
    stopCamera,
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
