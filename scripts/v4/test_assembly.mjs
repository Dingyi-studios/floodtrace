import assert from 'node:assert/strict';
import fs from 'node:fs';
import{sampleMission}from'../../app/src/mission-core.js';
import{sampleOperations}from'../../app/src/operations-core.js';
import{summarizeAssemblies,assemblySeries}from'../../app/src/assembly-core.js';
import{placeMapLabels}from'../../app/src/label-layout.js';
const root=new URL('../../',import.meta.url),checks=[];
for(const name of ['compound','historical']){
 const op=JSON.parse(fs.readFileSync(new URL(`app/public/data/${name}-operations.json`,root))),mp=JSON.parse(fs.readFileSync(new URL(`app/public/data/${name}-missions.json`,root)));
 const at=t=>summarizeAssemblies(op,sampleOperations(op,t),mp,sampleMission(mp,t));
 const start=at(0);assert.deepEqual(start.map(s=>s.supplies),[6000,0,0]);assert(start.every(s=>s.people===0&&s.dispatchedTeams===0&&s.patrolTeams===1&&s.patrolPeople===2));assert.deepEqual(start[0].depots,['S01']);checks.push({case:name,name:'initial station inventory, separate people and patrol homes',passed:true});
 const end=at(mp.duration);assert.deepEqual(end.map(s=>s.supplies),[5440,200,130]);assert.deepEqual(end.map(s=>s.dispatchedTeams),[2,0,0]);assert.equal(end[0].dispatchedPeople,8);checks.push({case:name,name:'completed transfers and two rescue teams assigned to departure station',passed:true});
 const first=mp.events.find(e=>e.kind==='deliver');const mid=at((first.t+first.until)/2);assert(Math.abs(mid.reduce((a,s)=>a+s.received,0)-first.amount/2)<.01);const depart=mp.resources.find(r=>r.id==='G01').track.find(r=>r[4]==='outbound')[0];assert.equal(at(depart-.01)[0].dispatchedTeams,0);assert.equal(at(depart)[0].dispatchedTeams,1);checks.push({case:name,name:'partial delivery and exact dispatch-time boundary',passed:true});
 const times=[0,mp.duration,...mp.events.flatMap(e=>[e.t,(e.t+(e.until??e.t))/2,e.until??e.t]),...Array.from({length:Math.ceil(mp.duration/37.7)},(_,i)=>i*37.7)];
 for(const t of times){const a=at(t),m=sampleMission(mp,t),o=sampleOperations(op,t);assert(Math.abs(a.reduce((sum,s)=>sum+s.supplies,0)+m.totals.onboard-6000)<.02);a.forEach((s,i)=>{assert.equal(s.people,o.occupancy[i]);assert.equal(s.reserved,o.reserved[i]);assert(s.available>=0);assert(s.supplies>=-.01);assert(s.onsite.every(r=>r.id!=='S01'))})}
 const earlier=at(mp.duration*.26);at(mp.duration);assert.deepEqual(at(mp.duration*.26),earlier);const series=assemblySeries(op,mp,'A01');assert.equal(series.supplies.at(-1).value,5440);for(const a of op.agents)for(const row of a.track){const s=at(row[0])[0];assert.equal(series.people.findLast(p=>p.t<=row[0]).value,s.people);assert.equal(series.reserved.findLast(p=>p.t<=row[0]).value,s.reserved)}checks.push({case:name,name:'station conservation, capacities, deterministic rewind and charts',passed:true});
}
const items=Array.from({length:13},(_,i)=>({id:String(i),x:350,y:250,width:100,height:24,visible:true,selected:i===12}));const p=placeMapLabels(items,800,500);assert(p.find(a=>a.id==='12').visible);assert(p.filter(a=>a.visible).length<=3);assert(p.filter(a=>a.visible).every(a=>Math.abs(a.y-250)<=30));for(let i=0;i<100;i++)assert.deepEqual(placeMapLabels(items,800,500),p);checks.push({name:'crowded labels have bounded one-row offsets and no accumulating stack',passed:true});
const two=placeMapLabels([{id:'hidden',x:350,y:250,width:100,height:24,visible:false},{id:'shown',x:350,y:250,width:100,height:24,visible:true}],800,500);assert.equal(two[1].y,250);assert(two[1].visible);assert(!placeMapLabels([items[0]],800,500,[{left:200,right:500,top:100,bottom:400}])[0].visible);checks.push({name:'hidden/off-screen labels and camera obstacles do not cause phantom stacking',passed:true});
fs.mkdirSync(new URL('validation/v4.1/',root),{recursive:true});fs.writeFileSync(new URL('validation/v4.1/assembly-checks.json',root),JSON.stringify({version:'0.4.1',passed:checks.length,failed:0,checks},null,2));console.log(checks.length+' station/label checks passed');
