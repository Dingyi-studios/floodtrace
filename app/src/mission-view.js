import * as THREE from 'three';
import{sampleMission}from'./mission-core.js';
const bodyMat=new THREE.MeshStandardMaterial({color:'#dfd9bb',roughness:.65}),darkMat=new THREE.MeshStandardMaterial({color:'#344749',roughness:.55}),redMat=new THREE.MeshStandardMaterial({color:'#bd6848',roughness:.65}),glassMat=new THREE.MeshStandardMaterial({color:'#72939b',roughness:.25,metalness:.12}),whiteMat=new THREE.MeshStandardMaterial({color:'#efe9d9'});
function box(group,size,pos,material){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;group.add(m);return m}
function cylinder(group,radius,length,pos,material,axis='y'){const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,10),material);if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;m.position.set(...pos);m.castShadow=true;group.add(m);return m}
function aircraft(type){const q=new THREE.Group();const rotor=[];
 if(type==='helicopter'){
  const cabin=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),redMat);cabin.scale.set(1.8,1.5,3.2);cabin.position.y=1.6;q.add(cabin);box(q,[2.8,1.7,1.4],[0,1.9,-2.2],glassMat);box(q,[.6,.65,5.7],[0,1.5,4.2],redMat);box(q,[3,.16,1],[0,2,6],whiteMat);box(q,[.3,2.2,.9],[0,2.4,6.5],redMat);
  cylinder(q,.13,1.2,[0,3.3,0],darkMat);const main=new THREE.Group();box(main,[13,.12,.35],[0,3.9,0],darkMat);box(main,[.35,.12,13],[0,3.9,0],darkMat);q.add(main);rotor.push(main);
  for(const x of[-1.8,1.8]){box(q,[.14,.14,6],[x,-.05,.3],darkMat);box(q,[.1,1.2,.1],[x,.5,-1],darkMat);box(q,[.1,1.2,.1],[x,.5,1.8],darkMat)}
 }else if(type==='fixed-wing'){
  box(q,[.8,.65,5],[0,0,0],whiteMat);box(q,[8,.12,1.2],[0,.1,0],whiteMat);box(q,[2.5,.12,.7],[0,.35,2.1],redMat);box(q,[.15,1,.8],[0,.8,2.1],redMat);box(q,[.4,.35,.7],[0,-.4,-1.4],darkMat);
 }else{
  box(q,[1.6,.5,1.6],[0,0,0],whiteMat);box(q,[.5,.5,.7],[0,-.5,-.5],glassMat);
  for(const x of[-1.7,1.7])for(const z of[-1.7,1.7]){const a=box(q,[2.8,.17,.17],[x/2,0,z/2],darkMat);a.rotation.y=-Math.atan2(z,x);cylinder(q,.18,.4,[x,.2,z],darkMat);const p=new THREE.Group();box(p,[1.8,.06,.15],[x,.5,z],darkMat);q.add(p);rotor.push(p)}
 }
 return{mesh:q,rotors:rotor};
}
function vehicle(type){const q=new THREE.Group();
 if(type==='boat'){
  const hull=new THREE.Mesh(new THREE.SphereGeometry(1,10,6),redMat);hull.scale.set(1.35,.65,3.2);hull.position.y=.4;q.add(hull);box(q,[2,.5,3.3],[0,.7,.2],darkMat);box(q,[1.2,.8,1.3],[0,1.2,.8],whiteMat);box(q,[1.2,.5,.1],[0,1.7,.2],glassMat);box(q,[.65,.7,.45],[0,.5,3],darkMat);
 }else if(type==='depot'){
  box(q,[16,.25,13],[0,.2,0],bodyMat);box(q,[14,1,11],[0,5,0],whiteMat);for(const x of[-6.5,6.5])for(const z of[-5,5])box(q,[.3,5,.3],[x,2.5,z],darkMat);for(let i=0;i<10;i++)box(q,[1.4,1.4,1.4],[i%5*2-4,.9,Math.floor(i/5)*2-2],bodyMat);box(q,[3,2,.2],[0,3,-5.6],redMat);
 }else if(type==='crew'){
  for(let i=0;i<4;i++){const person=new THREE.Group();cylinder(person,.32,1.2,[0,1.2,0],redMat);const head=new THREE.Mesh(new THREE.SphereGeometry(.25,8,6),bodyMat);head.position.y=2.05;person.add(head);for(const x of[-.18,.18])box(person,[.22,.8,.25],[x,.35,0],darkMat);person.position.set(i%2*1.2-.6,0,Math.floor(i/2)*1.2);q.add(person)}
 }else{
  box(q,[2.5,1.7,5.5],[0,1.6,0],redMat);box(q,[2.45,.9,1.6],[0,2.4,-1.3],glassMat);box(q,[2.55,.16,1.9],[0,2.95,-1.3],whiteMat);box(q,[2.3,.15,2.8],[0,2.55,1.2],bodyMat);box(q,[1.5,.2,.35],[0,3.15,-1.3],redMat);for(const x of[-1.3,1.3])for(const z of[-1.7,1.7])cylinder(q,.55,.3,[x,.6,z],darkMat,'x');
 }return q;
}
export class MissionView{
 constructor(scene){this.scene=scene;this.root=new THREE.Group();scene.world.add(this.root);this.drones=new THREE.Group();this.resources=new THREE.Group();this.routes=new THREE.Group();this.deliveries=new THREE.Group();this.root.add(this.drones,this.resources,this.routes,this.deliveries);this.models=new Map();this.deliveryMeshes=[];this.dropMeshes=[];this.options={drones:true,resources:true,missionRoutes:true,deliveries:true};this.root.visible=false;this.workspace='incident'}
 clear(group){for(const m of[...group.children]){group.remove(m);m.traverse(o=>{o.geometry?.dispose();if(o.userData.uniqueMaterial)o.material?.dispose()})}}
 setPlan(plan){for(const q of[this.drones,this.resources,this.routes,this.deliveries])this.clear(q);this.models.clear();this.deliveryMeshes=[];this.dropMeshes=[];this.plan=plan;this.lastTime=-1;
  for(const d of plan.drones){const a=aircraft(d.type);a.mesh.traverse(o=>o.userData.id=d.id);this.drones.add(a.mesh);this.models.set(d.id,{...a,source:d});const tail=new THREE.BufferGeometry();tail.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(60*3),3));const line=new THREE.Line(tail,new THREE.LineBasicMaterial({color:'#e1e8dc',transparent:true,opacity:.85}));line.frustumCulled=false;line.userData.uniqueMaterial=true;line.userData.droneId=d.id;this.routes.add(line)}
  for(const r of plan.resources){if(r.sharedPatrol)continue;const a=r.type==='helicopter'?aircraft('helicopter'):{mesh:vehicle(r.type),rotors:[]};a.mesh.traverse(o=>o.userData.id=r.id);this.resources.add(a.mesh);this.models.set(r.id,{...a,source:r});if(r.route.length>1){const line=this.scene.line(r.route,r.type==='boat'?'#70b6bf':'#c99357',.55,r.type==='helicopter'?115:.9,true);line.userData.resourceId=r.id;line.userData.uniqueMaterial=true;this.routes.add(line)}}
  for(const e of plan.events.filter(e=>e.kind==='deliver')){const q=new THREE.Group();for(let i=0;i<6;i++)box(q,[1.5,1.5,1.5],[i%3*1.8-1.8,.75,Math.floor(i/3)*1.8],bodyMat);q.position.set(e.xy[0]+8,this.scene.height(...e.xy)+.2,e.xy[1]+8);q.userData.event=e;q.traverse(o=>o.userData.id=e.resourceId);this.deliveries.add(q);this.deliveryMeshes.push(q);const drop=new THREE.Group();box(drop,[1.8,1.8,1.8],[0,0,0],bodyMat);const canopy=new THREE.Mesh(new THREE.SphereGeometry(2.8,10,6,0,Math.PI*2,0,Math.PI/2),whiteMat);canopy.position.y=5;drop.add(canopy);drop.userData.event=e;this.deliveries.add(drop);this.dropMeshes.push(drop)}
 }
 setWorkspace(workspace){this.workspace=workspace;this.root.visible=['drones','response'].includes(workspace);this.applyOptions()}
 setLayer(id,value){if(id in this.options){this.options[id]=value;this.lastTime=-1;this.applyOptions()}}
 applyOptions(){this.drones.visible=this.workspace==='drones'&&this.options.drones;this.resources.visible=this.workspace==='response'&&this.options.resources;this.routes.visible=this.options.missionRoutes;this.deliveries.visible=this.workspace==='response'&&this.options.deliveries}
 update(t){if(!this.plan)return;if(this.lastTime===t&&this.lastSelected===this.scene.selected&&this.lastWorkspace===this.workspace)return;this.lastTime=t;this.lastSelected=this.scene.selected;this.lastWorkspace=this.workspace;this.current=sampleMission(this.plan,t);
  for(const s of[...this.current.drones,...this.current.resources]){const a=this.models.get(s.id);if(!a)continue;const ground=this.scene.height(...s.xy),water=this.scene.field.sample(...s.xy);let y=ground+s.agl;if(s.type==='boat'&&a.source.route.length)y=Math.max(ground,water?.stage??ground)+.08;a.mesh.position.set(s.xy[0],y,s.xy[1]);a.mesh.rotation.y=(180-s.heading)*Math.PI/180;for(const r of a.rotors)r.rotation.y=t*24;}
  for(const line of this.routes.children){if(line.userData.droneId){line.visible=this.workspace==='drones'&&this.options.drones;const d=this.plan.drones.find(a=>a.id===line.userData.droneId),pos=line.geometry.attributes.position;const end=Math.min(d.track.length-1,Math.floor(t/10));const start=Math.max(0,end-59);let n=0;for(let i=start;i<=end;i++,n++){const r=d.track[i];pos.setXYZ(n,r[1],this.scene.height(r[1],r[2])+r[3],r[2])}line.geometry.setDrawRange(0,n);pos.needsUpdate=true;}else{line.visible=this.workspace==='response'&&line.userData.resourceId===this.scene.selected;const r=this.plan.resources.find(r=>r.id===line.userData.resourceId);if(r?.type==='boat'&&line.visible){const a=line.geometry.attributes.position;for(let i=0;i<a.count;i++){const x=a.getX(i),z=a.getZ(i);a.setY(i,Math.max(this.scene.height(x,z),this.scene.field.sample(x,z)?.stage??0)+.25)}a.needsUpdate=true}}}
  for(const m of this.deliveryMeshes)m.visible=t>=(m.userData.event.until??m.userData.event.t);for(const m of this.dropMeshes){const e=m.userData.event;m.visible=t>=e.t&&t<e.until;if(m.visible){const u=(t-e.t)/(e.until-e.t),ground=this.scene.height(...e.xy);m.position.set(e.xy[0]+8,ground+2+(1-u)*85,e.xy[1]+8)}}
 }
 worldPosition(id){const a=this.models.get(id);return a?a.mesh.getWorldPosition(new THREE.Vector3()):null}
 pick(ray){if(!this.root.visible)return null;const hits=ray.intersectObjects([...(this.drones.visible?this.drones.children:[]),...(this.resources.visible?this.resources.children:[])],true);const h=hits[0];return h?{id:h.object.userData.id,distance:h.distance}:null}
}
