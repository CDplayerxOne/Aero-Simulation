import assert from 'node:assert/strict';
import {test} from 'node:test';
import {wheelAngle,wheelSteering,readInput} from '../js/controller-link.js';

test('steering is continuous across the angle wrap and around a landscape neutral position',()=>{
  for(const center of [0,Math.PI/2,-Math.PI/2,Math.PI-.05]){
    const rotate=turn=>Math.atan2(Math.sin(center+turn),Math.cos(center+turn));
    assert.equal(Math.abs(wheelSteering(rotate(.02),center)),0);
    assert.ok(wheelSteering(rotate(.35),center)<-.4);
    assert.ok(wheelSteering(rotate(-.35),center)>.4);
    assert.equal(wheelSteering(rotate(1.2),center),-1);
  }
  assert.equal(wheelAngle(0,0),null);
  assert.equal(wheelAngle(null,0),null);
  assert.equal(wheelAngle(0,90),Math.PI/2);
});
test('received inputs stay in the allowed control range',()=>{
  assert.deepEqual(readInput({steer:NaN,gas:'pressed'}),{steer:0,gas:false,brake:false,drift:false});
  assert.deepEqual(readInput({steer:-3,gas:true,drift:true}),{steer:-1,gas:true,brake:false,drift:true});
});
