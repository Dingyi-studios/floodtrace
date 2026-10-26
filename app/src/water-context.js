import * as THREE from 'three';
import{makeContextTracks,trackPoint,insideBounds,localMapBounds}from'./context-flow-core.js';
/** Source river/lake surfaces span the full map; outer flow is explicitly schematic. */
export class WaterContext{
 constructor(scene){
  this.scene=scene;const field=scene.field;this.bounds=localMapBounds(scene.data);this.tracks=makeContextTracks(scene.data.geography.watercourses);
  this.material=new THREE.ShaderMaterial({uniforms:{uTime:scene.waterView.uniforms.uVisualTime,uField:{value:field.texture},uBounds:{value:field.bounds},uGrid:{value:new THREE.Vector2(field.grid.cols,field.grid.rows)},uEnabled:field.enabledUniform},vertexShader:'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}',fragmentShader:`uniform float uTime;uniform sampler2D uField;uniform vec4 uBounds;uniform vec2 uGrid;uniform float uEnabled;varying vec3 vWorld;void main(){vec2 uv=(vWorld.xz-uBounds.xy)/uBounds.zw;bool inside=all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));if(inside&&uEnabled>.5){vec4 f=texture2D(uField,(uv*(uGrid-1.)+.5)/uGrid);vec2 edge=min(uv,1.-uv)*uBounds.zw;if(f.g>.045&&min(edge.x,edge.y)>60.)discard;}float ripple=sin(vWorld.x*.21+vWorld.z*.13-uTime*.8)*cos(vWorld.z*.15-uTime*.5);vec3 colour=mix(vec3(.16,.38,.42),vec3(.34,.57,.57),.55+ripple*.16);colour+=vec3(.13,.20,.18)*pow(max(0.,ripple),12.);gl_FragColor=vec4(colour,.94);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  scene.layers.rivers.traverse(o=>{if(o.isMesh){o.material.dispose();o.material=this.material;o.renderOrder=2}});
  this.flow=new THREE.Group();scene.waterView.flow.add(this.flow);this.capacity=420;this.positions=new Float32Array(this.capacity*6);this.headPositions=new Float32Array(this.capacity*3);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#c3e4d8',transparent:true,opacity:.68,depthWrite:false}));this.lines.frustumCulled=false;this.lines.renderOrder=5;this.flow.add(this.lines);
  const hg=new THREE.BufferGeometry();hg.setAttribute('position',new THREE.BufferAttribute(this.headPositions,3).setUsage(THREE.DynamicDrawUsage));this.heads=new THREE.Points(hg,new THREE.PointsMaterial({color:'#e3f3e4',size:2,sizeAttenuation:false,transparent:true,opacity:.7,depthWrite:false}));this.heads.frustumCulled=false;this.heads.renderOrder=6;this.flow.add(this.heads);
  const total=this.tracks.reduce((s,t)=>s+t.length,0);this.particles=Array.from({length:this.capacity},(_,i)=>{let d=((i*.61803398875)%1)*total,t=this.tracks[0];for(const track of this.tracks){t=track;if(d<=t.length)break;d-=t.length}return{track:t,phase:(i*.41421356237)%1}});
  this.stats={source:'mapped watercourses and lakes',visualOnly:true,directionSource:'source polyline order; illustrative, not model velocity',displayBounds:[...scene.data.bounds],modelBounds:[...field.meta.bounds],mappedTracks:this.tracks.length,active:0};
 }
 update(){
  this.flow.visible=this.scene.layers.rivers.visible;if(!this.flow.visible||!this.scene.waterView.flow.visible)return;
  const f=this.scene.field,core=[f.x0,f.z0,f.x0+f.width,f.z0+f.height],time=this.scene.waterView.visualTime;let n=0;
  for(const p of this.particles){const d=(p.phase*p.track.length+time*6)%p.track.length,a=trackPoint(p.track,Math.max(0,d-10)),b=trackPoint(p.track,d);if(insideBounds(...a,core)||insideBounds(...b,core)||!insideBounds(...b,this.bounds))continue;
   const y=this.scene.height(...a)+.75,z=this.scene.height(...b)+.75;this.positions.set([a[0],y,a[1],b[0],z,b[1]],n*6);this.headPositions.set([b[0],z,b[1]],n*3);n++;
  }
  this.lines.geometry.setDrawRange(0,n*2);this.heads.geometry.setDrawRange(0,n);this.lines.geometry.attributes.position.needsUpdate=true;this.heads.geometry.attributes.position.needsUpdate=true;this.stats.active=n;
 }
}
