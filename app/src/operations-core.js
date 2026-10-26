import{assetUrl}from'./asset-url.js';
export const PEOPLE_STATUS=['待疏散','疏散途中','已到达','受阻待援'];
export const PATROL_STATUS={1:'安全区巡查',2:'检查安全边界',3:'集结点引导',4:'返回集结点'};
export function sampleTrack(track,time){
 let lo=0,hi=track.length-1;
 while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(track[mid][0]<=time)lo=mid;else hi=mid-1}
 const a=track[lo],b=track[Math.min(lo+1,track.length-1)],u=b[0]>a[0]?Math.max(0,Math.min(1,(time-a[0])/(b[0]-a[0]))):0,dx=b[1]-a[1],dz=b[2]-a[2];
 return{xy:[a[1]+dx*u,a[2]+dz*u],status:a[3],target:a[4],heading:Math.atan2(dx,dz),moving:Math.hypot(dx,dz)>.001};
}
export function sampleOperations(plan,time){
 const counts={waiting:0,moving:0,arrived:0,blocked:0},occupancy=plan.shelters.map(()=>0),reserved=plan.shelters.map(()=>0);
 const groups=plan.agents.map(a=>{const s=sampleTrack(a.track,time);counts[['waiting','moving','arrived','blocked'][s.status]]+=a.count;if(s.target>=0){if(s.status===2)occupancy[s.target]+=a.count;else if(s.status===1)reserved[s.target]+=a.count}return{...s,id:a.id,count:a.count}});
 const patrols=plan.patrols.map(a=>({...sampleTrack(a.track,time),id:a.id,count:a.count}));
 return{time,counts,occupancy,reserved,groups,patrols,total:Object.values(counts).reduce((a,b)=>a+b,0)};
}
export async function loadOperations(url){
 const plan=await fetch(assetUrl(url)).then(r=>{if(!r.ok)throw Error('疏散数据未就绪');return r.json()});
 const bytes=await fetch(assetUrl(plan.risk.url)).then(r=>{if(!r.ok)throw Error('安全分区未就绪');return r.arrayBuffer()});
 if(bytes.byteLength!==plan.risk.cols*plan.risk.rows*plan.risk.frames)throw Error('安全分区帧大小错误');plan.riskData=new Uint8Array(bytes);return plan;
}
