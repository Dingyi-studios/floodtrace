export const WORKSPACES={incident:'灾情推演',monitor:'监测证据',drones:'无人机侦察',response:'应急处置',evacuation:'疏散与安全'};
export function createState(){return{workspace:'incident',tab:'layers',scenario:'surface',time:2400,playing:false,speed:1,selected:'P02',mode:'3D',exag:1,layers:{terrain:true,buildings:true,roads:true,rivers:true,flood:true,flow:true,vectors:false,network:false,sensors:true,domain:false,rain:true,risk:true,people:true,patrol:true,assembly:true,evacRoutes:true,drones:true,missionRoutes:true,resources:true,deliveries:true},opacities:{flood:1,network:.55,rain:.55,risk:.31},particleDensity:1700,savedTimes:{surface:2400,history:9000}}}
/** Single-active-result cache: geometry stays, inactive 40–47 MB water arrays are released. */
export class ScenarioStore{
 constructor(loader){this.loader=loader;this.pending=new Map();this.active=null}
 async load(key){if(this.active?.key===key)return this.active.value;if(!this.pending.has(key))this.pending.set(key,this.loader(key));try{const value=await this.pending.get(key);return value}finally{this.pending.delete(key)}}
 activate(key,value){this.active={key,value};return value}
}
