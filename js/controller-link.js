// Gather LAN candidates before exchanging descriptions so the peer can connect with one exchange.
export async function localDescription(peer, type){
  const description=type==='offer'?await peer.createOffer():await peer.createAnswer();
  await peer.setLocalDescription(description);
  if(peer.iceGatheringState!=='complete'){
    await new Promise(resolve=>{
      const done=()=>{
        clearTimeout(timer);
        peer.removeEventListener('icegatheringstatechange',change);
        resolve();
      };
      const change=()=>{if(peer.iceGatheringState==='complete')done()};
      const timer=setTimeout(done,3500);
      peer.addEventListener('icegatheringstatechange',change);
      change();
    });
  }
  const sdp=peer.localDescription?.sdp;
  if(!sdp?.includes('a=candidate:'))throw Error('No local network address was available. Check Wi-Fi access and pair again.');
  const compressed=typeof CompressionStream!=='undefined';
  let bytes=new TextEncoder().encode(sdp);
  if(compressed){
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return 'GL1-'+(compressed?'Z':'T')+btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export async function remoteDescription(peer,type,value){
  const code=value.trim();
  if(!/^GL1-[ZT][\w-]{20,24000}$/.test(code))throw Error('Invalid connection details. Create a new pairing code.');
  const bytes=Uint8Array.from(atob(code.slice(5).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  let buffer=bytes;
  if(code[4]==='Z'){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    buffer=await new Response(stream).arrayBuffer();
  }
  await peer.setRemoteDescription({type,sdp:new TextDecoder().decode(buffer)});
}
export async function drawCode(canvas,text){
  const {default:encode}=await import('../vendor/pairing/qrcode.js');
  const qr=encode(0,'L');qr.addData(text);qr.make();
  const cells=qr.getModuleCount(),scale=5;
  canvas.width=canvas.height=(cells+8)*scale;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#0d1b29';
  for(let y=0;y<cells;y++)for(let x=0;x<cells;x++)if(qr.isDark(y,x))ctx.fillRect((x+4)*scale,(y+4)*scale,scale,scale);
}
export const neutral=()=>({steer:0,gas:false,brake:false,drift:false});
export function readInput(packet){
  return {steer:Number.isFinite(packet.steer)?Math.max(-1,Math.min(1,packet.steer)):0,
    gas:packet.gas===true,brake:packet.brake===true,drift:packet.drift===true};
}
// Gravity projected into the phone's screen plane. Subtracting the calibrated
// angle makes the same wheel gesture work in either landscape or portrait.
export function wheelAngle(beta,gamma){
  if(!Number.isFinite(beta)||!Number.isFinite(gamma))return null;
  const radians=Math.PI/180,x=Math.sin(gamma*radians)*Math.cos(beta*radians),y=Math.sin(beta*radians);
  return Math.hypot(x,y)<.18?null:Math.atan2(x,y);
}
export function wheelSteering(angle,center){
  const turn=Math.atan2(Math.sin(angle-center),Math.cos(angle-center));
  return -Math.sign(turn)*Math.min(1,Math.max(0,Math.abs(turn)-.035)/.70);
}
