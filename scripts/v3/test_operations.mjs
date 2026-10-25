import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sampleTrack,sampleOperations} from '../../app/src/operations-core.js';
const root=new URL('../../',import.meta.url),checks=[];const pass=(name,details)=>checks.push({name,pass:true,details});
const track=[[0,0,0,0,-1],[10,10,0,1,0],[20,10,10,2,0]];
assert.deepEqual(sampleTrack(track,5).xy,[5,0]);assert.equal(sampleTrack(track,10).status,1);assert.deepEqual(sampleTrack(track,20).xy,[10,10]);assert.equal(sampleTrack(track,20).status,2);pass('trajectory interpolation and exact status boundaries',{});
for(const name of ['compound','historical']){
 const p=JSON.parse(await readFile(new URL(`app/public/data/${name}-operations.json`,root),'utf8'));let maxMoving=0,states=new Set(),patrolStates=new Set();
 for(const a of[...p.agents,...p.patrols]){assert(a.track.every((r,i)=>r.every(Number.isFinite)&&(!i||r[0]>=a.track[i-1][0])));assert(a.track[0][0]===0);assert(a.track.at(-1)[0]>=p.duration)}
 for(let t=0;t<=p.duration;t+=17.37){const s=sampleOperations(p,t);assert.equal(s.total,360);assert(s.groups.every(a=>a.count===20));for(let i=0;i<p.shelters.length;i++)assert(s.occupancy[i]+s.reserved[i]<=p.shelters[i].capacity);maxMoving=Math.max(maxMoving,s.counts.moving);s.groups.forEach(a=>states.add(a.status));s.patrols.forEach(a=>patrolStates.add(a.status))}
 for(const f of p.frames){const s=sampleOperations(p,f.t);assert.deepEqual(s.counts,{waiting:f.waiting,moving:f.moving,arrived:f.arrived,blocked:f.blocked});assert.deepEqual(s.occupancy,f.occupancy);assert.deepEqual(s.reserved,f.reserved)}
 const old=sampleOperations(p,1000);sampleOperations(p,p.duration);assert.deepEqual(sampleOperations(p,1000),old);assert(maxMoving>0);assert(patrolStates.has(1)&&patrolStates.has(2)&&patrolStates.has(3)&&patrolStates.has(4));
 pass(name+' mass, capacity, deterministic rewind, movement and patrol duty states',{groups:p.agents.length,people:p.totalPeople,maximumPeopleMoving:maxMoving,groupStates:[...states],patrolStates:[...patrolStates]});
}
const report={checked_on:'2026-10-25',passed:checks.length,failed:0,checks};await writeFile(new URL('validation/v3/operations-checks.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
