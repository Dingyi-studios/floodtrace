import assert from 'node:assert/strict';
import fs from 'node:fs';
import {advancePlayback} from '../../app/src/playback.js';
const checks=[];
for(const duration of [7200,21600]){
 for(const speed of [.25,1,2,4]){
  // The former 80ms UI throttle could leave the field and readout before the end.
  const last=advancePlayback(duration-.01,.016,speed,duration);
  assert.equal(last.time,duration);assert(last.ended);
  assert.deepEqual(advancePlayback(duration,0,speed,duration),{time:duration,ended:true});
  const step=advancePlayback(1200,.2,speed,duration);
  assert.equal(step.time,1200+12*speed);assert(!step.ended);
 }
 checks.push({name:`exact playback end and speed progression in ${duration}s scenario`,passed:true});
}
assert.deepEqual(advancePlayback(1200,-1,1,7200),{time:1200,ended:false});
checks.push({name:'a negative visual clock interval does not rewind model time',passed:true});
fs.writeFileSync(new URL('../../validation/v4.4/playback-checks.json',import.meta.url),JSON.stringify({version:'0.4.4',passed:checks.length,failed:0,checks},null,2));
console.log(checks.length+' playback checks passed');
