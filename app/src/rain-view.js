import * as THREE from 'three';
import{rainAppearance}from'./rain-core.js';
export function rainAt(model,time){const rows=model?.rainSeries;if(!rows?.length)return 0;const i=Math.min(rows.length-1,Math.max(0,Math.floor(time/60)));return rows[i].value}
export class RainView{
 constructor(world){
  this.capacity=900;this.rate=0;this.strength=.55;this.enabled=true;this.seed=515;
  this.drops=Array.from({length:this.capacity},()=>({x:this.rand(),phase:this.rand(),length:7+this.rand()*8,speed:.65+this.rand()*.6}));
  this.positions=new Float32Array(this.capacity*6);const alpha=new Float32Array(this.capacity*2);for(let i=0;i<this.capacity;i++){alpha[i*2]=.16;alpha[i*2+1]=1}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1));
  const material=new THREE.ShaderMaterial({uniforms:{uOpacity:{value:.35}},vertexShader:'attribute float aAlpha;varying float vAlpha;void main(){vAlpha=aAlpha;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'uniform float uOpacity;varying float vAlpha;void main(){gl_FragColor=vec4(.22,.40,.49,uOpacity*vAlpha);}',transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
  this.group=new THREE.Group();this.lines=new THREE.LineSegments(geometry,material);this.lines.frustumCulled=false;this.lines.renderOrder=20;this.group.add(this.lines);world.add(this.group);
 }
 rand(){this.seed=this.seed*16807%2147483647;return(this.seed-1)/2147483646}
 setRate(rate){this.rate=Math.max(0,rate)}
 update(now,camera,target,viewport={width:1166,height:640}){
  const {width,height}=viewport,appearance=rainAppearance(this.rate,this.strength,width,height,this.enabled),seconds=now/1000,count=appearance.count;
  this.lines.geometry.setDrawRange(0,count*2);this.lines.material.uniforms.uOpacity.value=appearance.opacity;this.group.visible=count>0;
  for(let i=0;i<count;i++){
   const p=this.drops[i],y=1.06-((p.phase+seconds*p.speed)%1)*2.12,x=((p.x+seconds*.012)%1)*2-1,len=p.length*2/Math.max(1,height),dx=p.length*.22*2/Math.max(1,width),j=i*6;
   this.positions.set([x-dx,y+len,0,x,y,0],j);
  }
  this.lines.geometry.attributes.position.needsUpdate=true;
  this.stats={rainMmH:this.rate,drawCount:count,maximum:this.capacity,opacity:appearance.opacity,screenSpace:true,streakLengthPx:[7,15],visualOnly:true};
 }
}
