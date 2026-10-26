import{sampleMission,eventFraction}from'./mission-core.js';
import{sampleOperations}from'./operations-core.js';
const NEAR=40;
function nearestShelter(shelters,xy){let best=null,dist=NEAR;for(const s of shelters){const d=Math.hypot(s.xy[0]-xy[0],s.xy[1]-xy[1]);if(d<=dist){best=s.id;dist=d}}return best}
/** Station inventory is transferred by existing mission events; no new supplies or people. */
export function summarizeAssemblies(operationPlan,operations,missionPlan,mission){
 const rows=operationPlan.shelters.map((s,i)=>({id:s.id,name:s.name,xy:s.xy,capacity:s.capacity,people:operations.occupancy[i],reserved:operations.reserved[i],available:s.capacity-operations.occupancy[i]-operations.reserved[i],supplies:0,received:0,loaded:0,depots:[],dispatchedTeams:0,dispatchedPeople:0,patrolTeams:0,patrolPeople:0,onsite:[]}));
 const byId=new Map(rows.map(s=>[s.id,s])),shelters=operationPlan.shelters;
 for(const r of missionPlan.resources){
  const q=mission.resources.find(q=>q.id===r.id),home=nearestShelter(shelters,r.track[0].slice(1,3)),station=byId.get(home);
  if(r.type==='depot'&&station){station.supplies+=r.capacity;station.depots.push(r.id)}
  if(r.type==='crew'&&station&&r.track.some(a=>a[0]<=mission.time&&['outbound','patrolling','guiding','returning','complete'].includes(a[4]))){station.dispatchedTeams++;station.dispatchedPeople+=r.crew}
  if(r.sharedPatrol){const patrol=operationPlan.patrols.find(a=>a.id===r.id),s=rows[patrol?.shelter];if(s){s.patrolTeams++;s.patrolPeople+=r.crew}}
  if(q&&r.type!=='depot'&&q.agl<=5){const onsite=byId.get(nearestShelter(shelters,q.xy));if(onsite)onsite.onsite.push({id:r.id,name:r.name,type:r.type,status:q.status})}
 }
 for(const e of missionPlan.events){const s=byId.get(nearestShelter(shelters,e.xy));if(!s)continue;const amount=e.amount*eventFraction(e,mission.time);if(e.kind==='load'||e.kind==='reload'){s.supplies-=amount;s.loaded+=amount}else if(e.kind==='deliver'){s.supplies+=amount;s.received+=amount}}
 return rows;
}
export function assemblySeries(operationPlan,missionPlan,id){
 const times=[...new Set([0,missionPlan.duration,...operationPlan.frames.map(f=>f.t),...operationPlan.agents.flatMap(a=>a.track.filter((r,i)=>!i||r[3]!==a.track[i-1][3]||r[4]!==a.track[i-1][4]).map(r=>r[0])),...missionPlan.events.flatMap(e=>[e.t,e.until??e.t]),...missionPlan.resources.filter(r=>r.type==='crew').flatMap(r=>r.track.map(a=>a[0]))])].sort((a,b)=>a-b);
 const rows=times.map(t=>({t,s:summarizeAssemblies(operationPlan,sampleOperations(operationPlan,t),missionPlan,sampleMission(missionPlan,t)).find(s=>s.id===id)}));
 return Object.fromEntries(['people','reserved','supplies','dispatchedTeams'].map(key=>{const series=rows.map(r=>({t:r.t,value:r.s[key]}));return[key,key==='supplies'?series:series.flatMap((p,i)=>i?[{t:p.t,value:series[i-1].value},p]:[p])]}));
}
