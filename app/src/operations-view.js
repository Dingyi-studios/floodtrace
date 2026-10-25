import * as THREE from 'three';
import {sampleOperations} from './operations-core.js';
export class OperationsView{
 constructor(scene){
  this.scene=scene;this.field=scene.field;this.root=new THREE.Group();scene.world.add(this.root);this.risk=new THREE.Group();this.root.add(this.risk);
  this.people=new THREE.Group();this.patrol=new THREE.Group();this.assembly=new THREE.Group();this.routes=new THREE.Group();this.root.add(this.people,this.patrol,this.assembly,this.routes);
  this.buildRisk();this.buildPeople();this.routeMeshes=[];this.markers=[];this.visible=true;
 }
 buildRisk(){
  const g=this.scene.terrain.geometry.clone();g.deleteAttribute('normal');g.deleteAttribute('uv');
  this.riskBytes=new Uint8Array(10000);this.riskTexture=new THREE.DataTexture(this.riskBytes,100,100,THREE.RedFormat,THREE.UnsignedByteType);this.riskTexture.needsUpdate=true;
  this.riskUniforms={uField:{value:this.field.texture},uRisk:{value:this.riskTexture},uBounds:{value:this.field.bounds},uGrid:{value:new THREE.Vector2(this.field.grid.cols,this.field.grid.rows)},uOpacity:{value:.31}};
  const material=new THREE.ShaderMaterial({uniforms:this.riskUniforms,vertexShader:`uniform sampler2D uField;uniform vec4 uBounds;uniform vec2 uGrid;varying vec2 vModel;void main(){vec3 p=position;p.y+=.12;vModel=(p.xz-uBounds.xy)/uBounds.zw;if(all(greaterThanEqual(vModel,vec2(0.)))&&all(lessThanEqual(vModel,vec2(1.)))){vec4 f=texture2D(uField,(vModel*(uGrid-1.)+.5)/uGrid);if(f.g>.03)p.y=max(p.y,f.r+.10);}gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`uniform sampler2D uRisk;uniform float uOpacity;varying vec2 vModel;void main(){float code=0.;bool inside=all(greaterThanEqual(vModel,vec2(0.)))&&all(lessThanEqual(vModel,vec2(1.)));if(inside)code=texture2D(uRisk,vModel).r*255.;vec3 color=vec3(.52,.57,.55);if(code>.5&&code<1.5)color=vec3(.22,.59,.36);else if(code>1.5&&code<2.5)color=vec3(.88,.62,.21);else if(code>2.5)color=vec3(.85,.24,.19);gl_FragColor=vec4(color,code<.5?uOpacity*.35:code>2.5?min(.8,uOpacity*1.5):uOpacity*1.2);}`,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  this.riskMesh=new THREE.Mesh(g,material);this.riskMesh.renderOrder=4;this.riskMesh.frustumCulled=false;this.risk.add(this.riskMesh);
 }
 buildPeople(){
  const total=366,material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.9});
  const bodyGeo=new THREE.CapsuleGeometry(.3,.75,3,5);bodyGeo.translate(0,1.02,0);const headGeo=new THREE.SphereGeometry(.23,7,5);headGeo.translate(0,1.83,0);const legGeo=new THREE.BoxGeometry(.21,.6,.23);legGeo.translate(0,.4,0);
  this.body=new THREE.InstancedMesh(bodyGeo,material,total);this.head=new THREE.InstancedMesh(headGeo,new THREE.MeshStandardMaterial({color:'#e7d5b7',roughness:1}),total);this.legL=new THREE.InstancedMesh(legGeo,new THREE.MeshStandardMaterial({color:'#475753'}),total);this.legR=new THREE.InstancedMesh(legGeo,this.legL.material,total);const armGeo=new THREE.BoxGeometry(.18,.65,.18);armGeo.translate(0,-.25,0);const armMaterial=new THREE.MeshStandardMaterial({color:'#718680'});this.armL=new THREE.InstancedMesh(armGeo,armMaterial,total);this.armR=new THREE.InstancedMesh(armGeo,armMaterial,total);this.armQ=new THREE.Quaternion();this.armAxis=new THREE.Vector3(0,0,1);this.swingAxis=new THREE.Vector3(1,0,0);this.localQ=new THREE.Quaternion();
  for(const mesh of[this.body,this.head,this.legL,this.legR,this.armL,this.armR]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;this.people.add(mesh)}
  this.pointPositions=new Float32Array(21*3);const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(this.pointPositions,3));this.groupPoints=new THREE.Points(pg,new THREE.PointsMaterial({color:'#f6f8e9',size:7,sizeAttenuation:false,depthWrite:false,transparent:true,opacity:.9}));this.groupPoints.frustumCulled=false;this.people.add(this.groupPoints);this.owner=[];this.matrix=new THREE.Matrix4();this.quaternion=new THREE.Quaternion();this.vec=new THREE.Vector3();this.scale=new THREE.Vector3(1.5,1.5,1.5);this.axis=new THREE.Vector3(0,1,0);this.color=new THREE.Color();
 }
 setPlan(plan){
  this.plan=plan;this.riskFrame=-1;this.clearGroup(this.assembly);this.clearGroup(this.routes);this.routeMeshes=[];this.markers=[];
  plan.shelters.forEach(s=>{
   const q=new THREE.Group();q.position.set(s.xy[0],this.scene.height(...s.xy)+.4,s.xy[1]);
   const halo=new THREE.Mesh(new THREE.RingGeometry(8,12,36),new THREE.MeshBasicMaterial({color:'#72a574',transparent:true,opacity:.65,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;q.add(halo);
   const pole=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,7,6),new THREE.MeshStandardMaterial({color:'#ece8cc'}));pole.position.y=3.5;q.add(pole);
   const flag=new THREE.Mesh(new THREE.BoxGeometry(4,2.7,.3),new THREE.MeshStandardMaterial({color:'#3e8d64'}));flag.position.set(1.9,6,0);q.add(flag);q.traverse(o=>o.userData.id=s.id);this.assembly.add(q);this.markers.push(q);
  });
  for(const route of plan.routes){if(route.points.length<2)continue;const mesh=this.scene.line(route.points,'#6fbbac',.72,.7,true);mesh.userData.route=route;this.routes.add(mesh);this.routeMeshes.push(mesh)}
 }
 clearGroup(group){for(const q of[...group.children]){group.remove(q);q.traverse(o=>{o.geometry?.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose()}})}}
 setLayer(id,value){if(id==='risk')this.risk.visible=value;if(id==='assembly')this.assembly.visible=value;if(id==='people'){this.peopleEnabled=value;this.people.visible=value||this.patrolEnabled}if(id==='patrol'){this.patrolEnabled=value;this.people.visible=value||this.peopleEnabled}if(id==='evacRoutes')this.routes.visible=value}
 setTime(time){
  if(!this.plan)return;this.current=sampleOperations(this.plan,time);this.time=time;const r=this.plan.risk,index=Math.min(r.frames-1,Math.floor(time/r.step));
  if(index!==this.riskFrame){this.riskFrame=index;this.riskBytes.set(this.plan.riskData.subarray(index*r.cols*r.rows,(index+1)*r.cols*r.rows));this.riskTexture.needsUpdate=true}
 }
 update(time){
  if(!this.plan||!this.root.visible)return;this.setTime(time);const s=this.current,palette=['#b49962','#427e90','#5b986b','#c56251'];let instance=0,point=0;
  for(const a of[...s.groups,...s.patrols]){
   const crew=a.id.startsWith('T'),show=crew?this.patrolEnabled:this.peopleEnabled,formation=crew?2:4,n=crew?2:a.count,c=Math.cos(a.heading),sn=Math.sin(a.heading),baseY=this.scene.height(...a.xy),colour=crew?'#e6b45e':palette[a.status];
   this.pointPositions[point*3]=a.xy[0];this.pointPositions[point*3+1]=show?Math.max(baseY+5,(this.field.sample(...a.xy)?.stage??baseY)+.6):-100;this.pointPositions[point*3+2]=a.xy[1];point++;
   for(let j=0;j<n;j++,instance++){
    let across=(j%formation-(formation-1)/2)*1.05,back=Math.floor(j/formation)*1.25;if(a.status===2){across=(j%5-2)*1.5+(Number(a.id.slice(1))%3-1)*11;back=Math.floor(j/5)*1.6+5+(Math.floor(Number(a.id.slice(1))/3)%3)*7}
    const x=a.xy[0]+across*c-back*sn,z=a.xy[1]-across*sn-back*c,y=show?this.scene.height(x,z)+.12:-100,walk=a.moving&&((crew&&[1,4].includes(a.status))||(!crew&&a.status===1))?Math.sin(time*5+j*.7)*.12:0;
    this.quaternion.setFromAxisAngle(this.axis,a.heading);this.vec.set(x,y,z);this.matrix.compose(this.vec,this.quaternion,this.scale);this.body.setMatrixAt(instance,this.matrix);this.head.setMatrixAt(instance,this.matrix);this.body.setColorAt(instance,this.color.set(colour));
    this.vec.set(x-.16*c,y+walk,z+.16*sn);this.matrix.compose(this.vec,this.quaternion,this.scale);this.legL.setMatrixAt(instance,this.matrix);this.vec.set(x+.16*c,y-walk,z-.16*sn);this.matrix.compose(this.vec,this.quaternion,this.scale);this.legR.setMatrixAt(instance,this.matrix);for(const side of[-1,1]){const gesture=crew&&a.status===3?1.25:crew&&a.status===2?.55:.08;this.armQ.copy(this.quaternion).multiply(this.localQ.setFromAxisAngle(this.armAxis,side*gesture)).multiply(this.localQ.setFromAxisAngle(this.swingAxis,walk*side*2));this.vec.set(x+side*.56*c,y+2.05,z-side*.56*sn);this.matrix.compose(this.vec,this.armQ,this.scale);(side<0?this.armL:this.armR).setMatrixAt(instance,this.matrix)}this.owner[instance]=a.id;
   }
  }
  for(const mesh of[this.body,this.head,this.legL,this.legR,this.armL,this.armR])mesh.instanceMatrix.needsUpdate=true;this.body.instanceColor.needsUpdate=true;this.groupPoints.geometry.attributes.position.needsUpdate=true;
  const latest={};for(const route of this.plan.routes)if(route.t<=time)latest[route.agent]=route;
  for(const mesh of this.routeMeshes){const a=s.groups.find(a=>a.id===mesh.userData.route.agent);mesh.visible=a?.status===1&&latest[a.id]===mesh.userData.route;mesh.material.color.set(a?.id===this.scene.selected?'#d3a250':'#6fbbac')}
 }
 pick(ray){if(!this.root.visible)return null;const targets=[];if(this.assembly.visible)targets.push(...this.markers);if(this.people.visible)targets.push(this.body,this.head);const hit=ray.intersectObjects(targets,true)[0];if(!hit)return null;return{id:hit.object===this.body||hit.object===this.head?this.owner[hit.instanceId]:hit.object.userData.id,distance:hit.distance}}
 snapshot(){return this.current?{...this.current,riskFrame:this.riskFrame,riskVisible:this.risk.visible,peopleVisible:this.peopleEnabled,patrolVisible:this.patrolEnabled}:null}
}
