import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sampleMission} from '../../app/src/mission-core.js';
const checks=[];
for(const name of ['compound','historical']){
 const p=JSON.parse(fs.readFileSync(new URL(`../../app/public/data/${name}-missions.json`,import.meta.url)));
 assert.equal(p.drones.length,6);assert.equal(p.resources.length,13);assert.equal(new Set([...p.drones,...p.resources].map(a=>a.id)).size,19);
 for(const r of [...p.drones,...p.resources]){assert.equal(r.track[0][0],0);assert.equal(r.track.at(-1)[0],p.duration);for(let i=0;i<r.track.length;i++){const a=r.track[i];assert([a[0],a[1],a[2],a[3],a[5]].every(Number.isFinite));if(i)assert(a[0]>r.track[i-1][0]);assert(a[5]>=0);assert(a[5]<=(r.capacity??0));}}
 checks.push({case:name,check:'19 stable identities / complete finite bounded tracks',passed:true});
 let lastDelivered=-1;
 for(const t of [...new Set([0,p.duration,...Array.from({length:Math.ceil(p.duration/17.37)},(_,i)=>i*17.37),...p.events.flatMap(e=>[e.t,(e.t+(e.until??e.t))/2,e.until??e.t])])].sort((a,b)=>a-b)){
  const s=sampleMission(p,t);assert(Math.abs(s.totals.loaded-s.totals.delivered-s.totals.onboard)<.015,`inventory ${name}@${t}: ${JSON.stringify(s.totals)}`);assert(Math.abs(s.totals.loaded+s.totals.depot-6000)<.01);assert(s.totals.delivered>=lastDelivered-.01);lastDelivered=s.totals.delivered;assert.equal(s.totals.personnel,30);assert(s.events.every(e=>e.t<=t));assert(s.detections.every(e=>e.t<=t));assert(s.drones.every(d=>d.battery>=0&&d.battery<=100&&d.agl>=65));
 }
 assert.equal(sampleMission(p,p.duration).totals.delivered,330);checks.push({case:name,check:'inventory conserved throughout load/drop/reload; final delivered330 / crews30',passed:true});
 const a=sampleMission(p,p.duration*.32);sampleMission(p,p.duration);assert.deepEqual(sampleMission(p,p.duration*.32),a);assert.deepEqual(sampleMission(p,p.duration*.32),a);assert(sampleMission(p,p.duration).resources.find(r=>r.id==='V03').status==='blocked');checks.push({case:name,check:'deterministic seek/pause/rewind and wet-road stop',passed:true});
}
fs.mkdirSync(new URL('../../validation/v4',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../../validation/v4/mission-checks.json',import.meta.url),JSON.stringify({passed:checks.length,failed:0,checks},null,2));console.log(`${checks.length} mission checks passed`);
