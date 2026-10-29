/** Return an exact terminal time, even when the final UI interval is shorter. */
export function advancePlayback(time,dt,speed,duration){
 const next=Math.min(duration,Math.max(0,time+Math.max(0,dt)*60*speed));
 return{time:next,ended:next>=duration};
}
