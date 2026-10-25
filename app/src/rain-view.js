import * as THREE from 'three';

export function rainAt(model,time){const rows=model?.rainSeries;if(!rows?.length)return 0;const i=Math.min(rows.length-1,Math.max(0,Math.floor(time/60)));return rows[i].value}
export class RainView{
 constructor(world,height){
  this.height=height;this.capacity=900;this.time=0;this.rate=0;this.strength=.55;this.enabled=true;this.seed=515;
  this.drops=Array.from({length:this.capacity},()=>({x:this.rand(),z:this.rand(),phase:this.rand(),length:2+this.rand()*3}));
  this.positions=new Float32Array(this.capacity*6);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.LineBasicMaterial({color:'#b7d1d3',transparent:true,opacity:.3,depthWrite:false});
  this.group=new THREE.Group();this.lines=new THREE.LineSegments(geometry,material);this.lines.frustumCulled=false;this.lines.renderOrder=8;this.group.add(this.lines);world.add(this.group);
 }
 rand(){this.seed=this.seed*16807%2147483647;return(this.seed-1)/2147483646}
 setRate(rate){this.rate=Math.max(0,rate)}
 update(now,camera,target){
  const seconds=now/1000,distance=camera.position.distanceTo(target),radius=THREE.MathUtils.clamp(distance*.5,130,900),height=THREE.MathUtils.clamp(distance*.2,65,220);
  // A saturating mapping deliberately preserves visibility at 108+ mm/h.
  const fraction=1-Math.exp(-this.rate/26),count=this.enabled&&this.rate>.001?Math.round(this.capacity*fraction*this.strength):0;
  this.lines.geometry.setDrawRange(0,count*2);this.lines.material.opacity=.13+.17*fraction;this.group.visible=this.enabled&&count>0;
  for(let i=0;i<count;i++){
   const p=this.drops[i],x=target.x+(p.x-.5)*radius*2,z=target.z+(p.z-.5)*radius*2,ground=this.height(x,z),phase=(p.phase+seconds*27/height)%1,y=ground+height*(1-phase)+3,j=i*6;
   this.positions[j]=x;this.positions[j+1]=y;this.positions[j+2]=z;this.positions[j+3]=x+.35;this.positions[j+4]=y-p.length;this.positions[j+5]=z+.7;
  }
  this.lines.geometry.attributes.position.needsUpdate=true;
  this.stats={rainMmH:this.rate,drawCount:count,maximum:this.capacity,opacity:this.lines.material.opacity,visualOnly:true};
 }
}
