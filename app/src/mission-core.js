import{assetUrl}from'./asset-url.js';
/** All operational state is a pure function of model seconds. No wall clock writes. */
export const MISSION_STATUS={standby:'待命',loading:'装载中',outbound:'前往任务点',delivering:'物资投送',returning:'返程',reloading:'补给中',complete:'任务完成',blocked:'受阻停驶',checking:'现场检查',patrolling:'巡查中',guiding:'集结点引导',supplying:'物资保障',mapping:'边界测绘',surveying:'任务飞行'};
export const RESOURCE_TYPE={helicopter:'直升机',boat:'救援舟艇',vehicle:'抢险车辆',patrol:'安全巡检',crew:'救援队伍',depot:'补给站'};
export const EVENT_KIND={load:'装载',reload:'补给',deliver:'投送完成',blocked:'道路受阻',support:'抵达支援点'};
export function bracket(rows,t){let lo=0,hi=rows.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(rows[mid][0]<=t)lo=mid;else hi=mid-1}const a=rows[lo],b=rows[Math.min(lo+1,rows.length-1)];return[a,b,b[0]>a[0]?Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))):0]}
export function missionTrack(rows,t){const[a,b,u]=bracket(rows,t),dx=b[1]-a[1],dz=b[2]-a[2];return{xy:[a[1]+dx*u,a[2]+dz*u],agl:a[3]+(b[3]-a[3])*u,status:a[4],payload:a[5]+(b[5]-a[5])*u,heading:(Math.atan2(dx,-dz)*180/Math.PI+360)%360,speed:b[0]>a[0]?Math.hypot(dx,dz)/(b[0]-a[0]):0}}
export function eventFraction(e,t){return t<e.t?0:e.until>e.t?Math.min(1,(t-e.t)/(e.until-e.t)):1}
export function sampleMission(plan,time){
 const t=Math.max(0,Math.min(plan.duration,time));let loaded=0,delivered=0;
 const events=plan.events.filter(e=>e.t<=t).map(e=>{const progress=eventFraction(e,t);if(e.kind==='load'||e.kind==='reload')loaded+=e.amount*progress;if(e.kind==='deliver')delivered+=e.amount*progress;return{...e,progress,completed:progress>=1}});
 const resources=plan.resources.map(r=>{const q=missionTrack(r.track,t);return{...q,id:r.id,type:r.type,crew:r.crew,capacity:r.capacity,unit:r.unit,delivered:events.filter(e=>e.resourceId===r.id&&e.kind==='deliver').reduce((a,e)=>a+e.amount*e.progress,0),blockedReason:r.blockedReason||null,...(r.type==='depot'?{payload:r.capacity-loaded}:{})}});
 const drones=plan.drones.map(d=>{const[a,b,u]=bracket(d.telemetry,t);return{...missionTrack(d.track,t),id:d.id,battery:a[1]+(b[1]-a[1])*u,link:a[2]+(b[2]-a[2])*u,target:d.target}});
 return{time:t,modelId:plan.modelId,sourceKind:plan.sourceKind,drones,resources,events,detections:plan.detections.filter(d=>d.t<=t),totals:{loaded,delivered,onboard:resources.filter(r=>r.type!=='depot').reduce((a,r)=>a+r.payload,0),depot:6000-loaded,personnel:resources.reduce((a,r)=>a+r.crew,0),active:resources.filter(r=>!['standby','complete','supplying'].includes(r.status)).length}};
}
export function missionSeries(plan,id,field){
 const source=plan.drones.find(d=>d.id===id),rows=source?.track||plan.resources.find(d=>d.id===id)?.track;
 if(!rows)return null;const times=[...new Set([0,plan.duration,...rows.map(r=>r[0]),...plan.events.flatMap(e=>[e.t,e.until??e.t])])].sort((a,b)=>a-b);
 const data=times.map(t=>{const s=sampleMission(plan,t),o=[...s.drones,...s.resources].find(d=>d.id===id);return{t,o,s,depth:source&&field?field.sampleFrame(...source.target,Math.min(field.grid.frames-1,Math.round(t/field.meta.step)))?.depth:null}});
 return{altitude:data.map(d=>({t:d.t,value:d.o.agl})),battery:data.map(d=>({t:d.t,value:d.o.battery??0})),depth:data.map(d=>({t:d.t,value:d.depth})),payload:data.map(d=>({t:d.t,value:d.o.payload})),delivered:data.map(d=>({t:d.t,value:d.s.totals.delivered})),personnel:data.map(d=>({t:d.t,value:d.s.totals.personnel})),active:data.map(d=>({t:d.t,value:d.s.totals.active}))};
}
export async function loadMissionPlan(url){const r=await fetch(assetUrl(url));if(!r.ok)throw Error('侦察与资源资料加载失败，请重试');const p=await r.json();if(p.schemaVersion!==1||p.drones?.length!==6||p.resources?.length!==13||!p.modelId)throw Error('侦察与资源资料版本不匹配');return p}
