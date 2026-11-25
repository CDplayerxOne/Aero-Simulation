// A four-stroke six-cylinder cycle repeats every two crank revolutions.
// Model the two exhaust banks separately so their pulse trains combine at the collector.
function exhaustWave(context,bank){
  const real=new Float32Array(49),imag=new Float32Array(49);
  const strength=[1,.93,.96,.97,1,.91];
  for(let harmonic=1;harmonic<real.length;harmonic++){
    const envelope=Math.exp(-harmonic/19)/(1+(harmonic/9)**1.35);
    for(let cylinder=bank;cylinder<6;cylinder+=2){
      const phase=2*Math.PI*harmonic*(cylinder/6+bank*.006);
      real[harmonic]+=strength[cylinder]*envelope*Math.cos(phase);
      imag[harmonic]+=strength[cylinder]*envelope*Math.sin(phase);
    }
  }
  // Bound each bank before filtering so their summed exhaust has mixing headroom.
  let amplitude=0;
  for(let h=1;h<real.length;h++)amplitude+=Math.hypot(real[h],imag[h]);
  for(let h=1;h<real.length;h++){real[h]/=amplitude;imag[h]/=amplitude}
  return context.createPeriodicWave(real,imag,{disableNormalization:true});
}

export function createRaceAudio(context){
  function gain(level,destination){
    const node=context.createGain();node.gain.value=level;node.connect(destination);return node;
  }
  function filter(type,hz,q,destination){
    const node=context.createBiquadFilter();
    node.type=type;node.frequency.value=hz;node.Q.value=q;node.connect(destination);return node;
  }
  const master=gain(0,context.destination);
  const exhaustLevel=gain(.15,master);
  const collector=filter('lowpass',850,.55,exhaustLevel);
  const lowCut=filter('highpass',44,.6,collector);
  const banks=[0,1].map(bank=>{
    const source=context.createOscillator();
    source.setPeriodicWave(exhaustWave(context,bank));source.frequency.value=18;
    const muffler=filter('peaking',bank?760:460,.9,lowCut);
    muffler.gain.value=bank?2:3;
    source.connect(muffler);source.start();return source;
  });
  // Shared broadband source for intake, airflow and tire scrub. Filters keep
  // each tied to a different audible band and independent driving input.
  const noise=context.createBufferSource();
  const buffer=context.createBuffer(1,Math.round(2*context.sampleRate),context.sampleRate);
  const samples=buffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=2*Math.random()-1;
  noise.buffer=buffer;noise.loop=true;
  const intakeLevel=gain(0,master),windLevel=gain(0,master),tireLevel=gain(0,master);
  const intake=filter('bandpass',510,.65,intakeLevel);
  const tires=filter('bandpass',1100,3.4,tireLevel);
  noise.connect(intake);noise.connect(tires);noise.connect(filter('lowpass',630,.7,windLevel));noise.start();
  let lastGear=null;
  const smooth=(param,value,time=.045)=>param.setTargetAtTime(value,context.currentTime,time);
  return {
    update(car,audible){
      smooth(master.gain,audible?.8:0,.022);
      if(!audible||!car)return;
      const speed=Math.abs(car.speed),rpm=Math.max(1050,car.rpm);
      const revs=Math.min(1,rpm/12500),load=car.throttle||0;
      // Retain engine pitch when lifting. A shift briefly cuts combustion load.
      const firing=car.shift>0?.24:1;
      const idleVariation=speed<3?.012*Math.sin(context.currentTime*11):0;
      for(const bank of banks)smooth(bank.frequency,rpm/120*(1+idleVariation),lastGear===car.gear?.032:.012);
      lastGear=car.gear;
      smooth(collector.frequency,490+revs*990+load*firing*1320);
      smooth(exhaustLevel.gain,(.16+.11*load+.035*revs)*firing,.018);
      smooth(intake.frequency,340+880*revs);
      smooth(intakeLevel.gain,(.013+.104*load)*firing);
      smooth(windLevel.gain,Math.min(.12,.12*(speed/72)**2),.16);
      const slip=Math.abs(car.side)/Math.max(4,speed);
      const scrub=Math.min(1,Math.max(0,(slip-.07)*3.6)+.24*(car.handbrake||0));
      smooth(tires.frequency,840+430*scrub+speed*2.4);
      smooth(tireLevel.gain,.16*scrub*Math.min(1,speed/12),.065);
    }
  };
}
