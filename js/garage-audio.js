// Decode on first use and keep the buffer for repeat visits to the garage.
export function createGarageAudio(context){
  let wanted=false, loading, buffer, playing;
  async function load(){
    const url=new URL('../assets/garage.mp3',import.meta.url);
    const response=await fetch(url);
    if(!response.ok)throw new Error('Garage soundtrack unavailable');
    return context.decodeAudioData(await response.arrayBuffer());
  }
  function start(){
    if(!wanted || playing || !buffer)return;
    const source=context.createBufferSource();
    const bus=context.createGain();
    const now=context.currentTime;
    source.buffer=buffer;
    source.loop=true;
    bus.gain.setValueAtTime(0,now);
    bus.gain.linearRampToValueAtTime(.48,now+.45);
    source.connect(bus);bus.connect(context.destination);
    source.onended=()=>{source.disconnect();bus.disconnect()};
    source.start();
    playing={source,bus,started:now};
  }
  return function setGarageAudible(active,leavingGarage=false){
    if(active===wanted)return;
    wanted=active;
    if(active){
      if(buffer){start();return}
      if(!loading){
        loading=load().then(decoded=>{buffer=decoded;start()})
          .catch(error=>console.warn('Garage soundtrack could not be loaded.',error))
          .finally(()=>{loading=null});
      }
    }else if(playing){
      const {source,bus,started}=playing;
      playing=null;
      const now=context.currentTime,end=now+(leavingGarage?.8:.06);
      const level=.48*Math.min(1,(now-started)/.45);
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(level,now);
      bus.gain.linearRampToValueAtTime(0,end);
      source.stop(end);
    }
  };
}
