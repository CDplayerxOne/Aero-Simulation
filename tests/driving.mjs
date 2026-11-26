import assert from 'node:assert/strict';
import {test} from 'node:test';
import {advance,carContacts,makeDriver} from '../js/dynamics.js';
import {makeCircuit,circuits} from '../js/circuits.js';

test('an equal-speed head-on collision comes to rest after one contact',()=>{
  const a={x:0,z:0,heading:0,speed:25,side:0};
  const b={...a,z:5.45,heading:Math.PI};
  let contacts=0;
  for(let i=0;i<120;i++){
    a.z+=a.speed/120;
    b.z-=b.speed/120;
    if(b.z-a.z<5.48)contacts++;
    carContacts([a,b]);
  }
  assert.equal(contacts,1);
  assert.ok(a.speed<.001 && b.speed<.001);
});

test('the handbrake induces sideslip and releases the rear axle',()=>{
  const track=makeCircuit(circuits[0]);
  function corner(handbrake){
    const driver=makeDriver(track,65,0,0);
    driver.speed=24;
    for(let i=0;i<65;i++){
      advance(driver,{gas:.2,brake:0,steer:.4,handbrake},track,1/120);
    }
    return driver;
  }
  const slide=corner(true),ordinary=corner(false);
  assert.ok(Math.abs(slide.side)>Math.abs(ordinary.side)+1);
  assert.ok(slide.handbrake>.95);
  for(let i=0;i<180;i++)advance(slide,{gas:0,brake:0,steer:0},track,1/120);
  assert.ok(slide.handbrake<.005 && Number.isFinite(slide.heading));
});

test('a glancing rail impact removes outward velocity without snapping the heading',()=>{
  const track=makeCircuit(circuits[0]);
  const driver=makeDriver(track,65,track.width+5.69,0);
  driver.speed=32;
  driver.heading+=.6;
  const initialHeading=driver.heading;
  const input={gas:0,brake:0,steer:0};
  advance(driver,input,track,1/120);
  const {tx,tz}=driver.surface;
  const sin=Math.sin(driver.heading),cos=Math.cos(driver.heading);
  const outward=driver.speed*(sin*tz-cos*tx)+driver.side*(cos*tz+sin*tx);
  assert.ok(Math.abs(outward)<.05);
  assert.ok(Math.abs(driver.heading-initialHeading)<.01);
});

test('a powered turn builds cornering force without spinning and settles on release',()=>{
  // A level skidpad isolates tire behavior from barriers, banking and curbs.
  const surface={x:0,z:0,tx:0,tz:1,grade:0,bank:0};
  const skidpad={
    length:100000,width:10000,ds:1,sample:()=>surface,
    locate:(x,z)=>({s:z,offset:x,p:surface,i:0})
  };
  for(const speed of [25,40,60]){
    for(const direction of [-1,1]){
      const car=makeDriver(skidpad,0,0,0);
      car.speed=speed;
      let peakSlip=0,peakCornering=0;
      for(let i=0;i<240;i++){
        const steer=i<150?direction:0;
        advance(car,{steer,gas:1,brake:0},skidpad,1/120);
        peakSlip=Math.max(peakSlip,Math.abs(Math.atan2(car.side,car.speed)));
        peakCornering=Math.max(peakCornering,direction*car.latAcc);
      }
      assert.ok(peakSlip<9*Math.PI/180,'rear slides more than nine degrees');
      assert.ok(peakCornering>10,'car must still corner at over 1 g');
      assert.ok(Math.abs(car.omega)<.1,'rotation persists after steering release');
    }
  }
});
