import{assetUrl}from'./asset-url.js';
import * as THREE from 'three';
import {sampleGrid,advectRK2} from './flow-core.js';

export async function loadUrbanModel(url='/data/compound.json'){
 const meta=await fetch(assetUrl(url)).then(r=>{if(!r.ok)throw Error('城市洪水结果尚未就绪');return r.json()});
 const [field,ground,mask]=await Promise.all([meta.grid.fields_url,meta.grid.ground_url,meta.grid.building_mask_url].map(u=>fetch(assetUrl(u)).then(r=>{if(!r.ok)throw Error('洪水资源加载失败 '+u);return r.arrayBuffer()})));
 const n=meta.grid.count,frames=meta.grid.frames;
 if(field.byteLength!==n*frames*4*4)throw Error('洪水结果帧大小校验失败');
 meta.fields=new Float32Array(field);meta.ground=new Float32Array(ground);meta.buildingMask=new Uint8Array(mask);
 meta.depth=[];for(let f=0;f<frames;f++){const d=new Float32Array(n);for(let i=0;i<n;i++)d[i]=meta.fields[(f*n+i)*4+1];meta.depth.push(d)}
 return meta;
}

export class FlowField{
 constructor(meta,sceneOrigin){
  this.meta=meta;this.grid=meta.grid;this.n=meta.grid.count;this.x0=meta.bounds[0]-sceneOrigin[0];this.z0=sceneOrigin[1]-meta.bounds[3];this.width=meta.grid.width;this.height=meta.grid.height;
  this.data=new Float32Array(this.n*4);this.depth=new Float32Array(this.n);this.active=[];this.enabledUniform={value:1};
  this.texture=new THREE.DataTexture(this.data,this.grid.cols,this.grid.rows,THREE.RGBAFormat,THREE.FloatType);this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.generateMipmaps=false;
  this.groundTexture=new THREE.DataTexture(meta.ground,this.grid.cols,this.grid.rows,THREE.RedFormat,THREE.FloatType);this.groundTexture.minFilter=THREE.LinearFilter;this.groundTexture.magFilter=THREE.LinearFilter;this.groundTexture.needsUpdate=true;
  this.maskTexture=new THREE.DataTexture(meta.buildingMask,this.grid.cols,this.grid.rows,THREE.RedFormat,THREE.UnsignedByteType);this.maskTexture.needsUpdate=true;
  this.bounds=new THREE.Vector4(this.x0,this.z0,this.width,this.height);this.setTime(0);
 }
 setTime(time){
  this.time=THREE.MathUtils.clamp(time,0,this.meta.duration);const frame=this.time/this.meta.step,a=Math.floor(frame),b=Math.min(a+1,this.grid.frames-1),u=frame-a;
  const src=this.meta.fields,offsetA=a*this.n*4,offsetB=b*this.n*4;this.active.length=0;
  for(let i=0;i<this.n*4;i++)this.data[i]=src[offsetA+i]*(1-u)+src[offsetB+i]*u;
  for(let i=0;i<this.n;i++){this.depth[i]=this.data[i*4+1];if(this.depth[i]>.12&&!this.meta.buildingMask[i]&&Math.hypot(this.data[i*4+2],this.data[i*4+3])>.06)this.active.push(i)}
  this.texture.needsUpdate=true;
 }
 nearest(x,z){if(x<this.x0||z<this.z0||x>this.x0+this.width||z>this.z0+this.height)return-1;return Math.round((z-this.z0)/this.height*(this.grid.rows-1))*this.grid.cols+Math.round((x-this.x0)/this.width*(this.grid.cols-1))}
 sample(x,z){return sampleGrid(this.data,this.grid.cols,this.grid.rows,this.width,this.height,x-this.x0,z-this.z0,this.meta.buildingMask)}
 sampleFrame(x,z,f){return sampleGrid(this.meta.fields.subarray(f*this.n*4,(f+1)*this.n*4),this.grid.cols,this.grid.rows,this.width,this.height,x-this.x0,z-this.z0,this.meta.buildingMask)}
 series(x,z){if(this.nearest(x,z)<0)return[];return Array.from({length:this.grid.frames},(_,f)=>({t:f*this.meta.step,value:this.sampleFrame(x,z,f).depth}))}
 useModel(meta){
  if(meta.grid.count!==this.n||meta.grid.cols!==this.grid.cols||meta.bounds.some((v,i)=>v!==this.meta.bounds[i]))throw Error('情景网格不匹配');
  this.meta=meta;this.grid=meta.grid;this.groundTexture.image.data=meta.ground;this.maskTexture.image.data=meta.buildingMask;
  this.groundTexture.needsUpdate=true;this.maskTexture.needsUpdate=true;this.setTime(0);
 }
}

const WATER_VERTEX=`
 uniform sampler2D uField;
 uniform vec2 uGridSize;
 varying vec2 vUv;
 varying vec3 vWorld;
 void main(){
  vUv=uv;vec3 p=position;p.y=texture2D(uField,(uv*(uGridSize-1.)+.5)/uGridSize).r+0.018;
  vWorld=(modelMatrix*vec4(p,1.)).xyz;
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
 }`;
const WATER_FRAGMENT=`
 uniform sampler2D uField;
 uniform vec2 uGridSize;
 uniform float uVisualTime;
 uniform float uOpacity;
 uniform float uDepthScale;
 uniform vec2 uWorldSize;
 uniform float uEdgeFade;
 varying vec2 vUv;
 varying vec3 vWorld;
 void main(){
  vec4 field=texture2D(uField,(vUv*(uGridSize-1.)+.5)/uGridSize);float d=field.g;
  if(d<0.045)discard;
  vec2 flow=vec2(field.b,-field.a);
  vec2 q=vWorld.xz-flow*uVisualTime*1.8;
  float a=sin(q.x*.20+q.y*.11)+.45*sin(q.x*.47-q.y*.31);
  float b=cos(q.y*.23-q.x*.09)+.4*cos(q.y*.51+q.x*.32);
  vec3 n=normalize(vec3(a*.045,1.,b*.045));
  vec3 eye=normalize(cameraPosition-vWorld);float fresnel=pow(1.-max(dot(eye,n),0.),4.);
  vec3 shallow=vec3(.075,.35,.39),deep=vec3(.012,.105,.19);
  vec3 colour=mix(shallow,deep,1.-exp(-d*uDepthScale));
  vec3 reflected=mix(vec3(.22,.39,.48),vec3(.69,.80,.84),clamp(reflect(-eye,n).y,0.,1.));
  colour=mix(colour,reflected,.14+fresnel*.48);
  vec3 sun=normalize(vec3(-.45,.8,-.25));
  float spec=pow(max(dot(reflect(-sun,n),eye),0.),105.);
  colour+=vec3(1.,.94,.78)*spec*.20;
  float shore=1.-smoothstep(.05,.48,d);
  float foam=shore*(.25+.2*sin(q.x*.9+q.y*.8));
  colour=mix(colour,vec3(.70,.85,.80),foam);
  float streak=pow(max(0.,sin(dot(q,normalize(flow+vec2(.003)))*.55+a*.6)),32.)*min(length(flow)*.018,.025);
  colour+=vec3(.50,.76,.73)*streak;
  vec2 edge=min(vUv,1.-vUv)*uWorldSize;float edgeAlpha=smoothstep(0.,uEdgeFade,min(edge.x,edge.y));
  gl_FragColor=vec4(colour,mix(.77,.97,1.-exp(-d*.55))*uOpacity*smoothstep(.045,.12,d)*edgeAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;

/** Share the exact displayed water field with buildings and vehicles. */
export function applyInundationMaterial(material,field,exaggeration){
 material.onBeforeCompile=shader=>{
  shader.uniforms.uFloodField={value:field.texture};shader.uniforms.uFloodBounds={value:field.bounds};shader.uniforms.uFloodSize={value:new THREE.Vector2(field.grid.cols,field.grid.rows)};shader.uniforms.uFloodExag=exaggeration;shader.uniforms.uFloodEnabled=field.enabledUniform;
  shader.vertexShader='varying vec3 vFloodWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
   vec4 floodP=vec4(transformed,1.);
   #ifdef USE_BATCHING
    floodP=batchingMatrix*floodP;
   #endif
   #ifdef USE_INSTANCING
    floodP=instanceMatrix*floodP;
   #endif
   vFloodWorld=(modelMatrix*floodP).xyz;`);
  shader.fragmentShader='uniform sampler2D uFloodField;\nuniform vec4 uFloodBounds;\nuniform vec2 uFloodSize;\nuniform float uFloodExag;\nuniform float uFloodEnabled;\nvarying vec3 vFloodWorld;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`
   vec2 fuv=(vFloodWorld.xz-uFloodBounds.xy)/uFloodBounds.zw;
   if(uFloodEnabled>.5&&all(greaterThanEqual(fuv,vec2(0.)))&&all(lessThanEqual(fuv,vec2(1.)))){
    vec4 fq=texture2D(uFloodField,(fuv*(uFloodSize-1.)+.5)/uFloodSize);float under=fq.r-vFloodWorld.y/uFloodExag;
    if(fq.g>.05&&under>-.08){
     float amount=smoothstep(-.08,.35,under);
     gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.11,.27,.29),amount*min(.93,.36+max(under,0.)*.23));
     gl_FragColor.rgb*=1.-.18*amount;
    }
   }
   #include <dithering_fragment>`);
 };
 material.customProgramCacheKey=()=>`flood-wet-v2-${material.type}`;
 return material;
}

export class FloodWater{
 constructor(world,field){
  this.field=field;this.group=new THREE.Group();this.flow=new THREE.Group();this.vectors=new THREE.Group();this.exagUniform={value:1};this.world=world;this.visualTime=0;this.density=1700;this.capacity=2400;this.segments=8;this.seed=7341;this.lastTime=null;this.lastPhysicalTime=0;this.lastTrail=0;
  const {cols,rows}=field.grid,pos=[],uv=[],indices=[];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){pos.push(field.x0+c/(cols-1)*field.width,0,field.z0+r/(rows-1)*field.height);uv.push(c/(cols-1),r/(rows-1))}
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const i=r*cols+c;indices.push(i,i+cols,i+1,i+1,i+cols,i+cols+1)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
  this.uniforms={uField:{value:field.texture},uGridSize:{value:new THREE.Vector2(cols,rows)},uVisualTime:{value:0},uWorldSize:{value:new THREE.Vector2(field.width,field.height)},uEdgeFade:{value:60},uOpacity:{value:1},uDepthScale:{value:field.meta.kind.includes('historical')?2.5:.25}};
  const m=new THREE.ShaderMaterial({vertexShader:WATER_VERTEX,fragmentShader:WATER_FRAGMENT,uniforms:this.uniforms,transparent:true,depthWrite:true,side:THREE.DoubleSide});
  this.mesh=new THREE.Mesh(g,m);this.mesh.frustumCulled=false;this.mesh.renderOrder=3;this.group.add(this.mesh);world.add(this.group,this.flow,this.vectors);
  this.createTracers();this.createArrows();this.resetParticles();
 }
 rand(){this.seed=this.seed*16807%2147483647;return(this.seed-1)/2147483646}
 createTracers(){
  this.history=new Float32Array(this.capacity*(this.segments+1)*3);this.particles=Array.from({length:this.capacity},()=>({x:0,z:0,age:999,life:1,alive:false}));
  this.linePositions=new Float32Array(this.capacity*this.segments*6);const alphas=new Float32Array(this.capacity*this.segments*2);
  for(let i=0;i<this.capacity;i++)for(let s=0;s<this.segments;s++){const o=(i*this.segments+s)*2;alphas[o]=.7*(1-s/this.segments);alphas[o+1]=.7*(1-(s+1)/this.segments)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(this.linePositions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('aAlpha',new THREE.BufferAttribute(alphas,1));
  const vertex=`attribute float aAlpha;varying float vAlpha;varying vec3 vWorld;void main(){vAlpha=aAlpha;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`;
  const mask=`uniform sampler2D uField;uniform sampler2D uBuildings;uniform vec4 uBounds;uniform vec2 uGridSize;varying vec3 vWorld;bool invalidWater(){vec2 q=(vWorld.xz-uBounds.xy)/uBounds.zw;if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))return true;vec2 tq=(q*(uGridSize-1.)+.5)/uGridSize;vec4 f=texture2D(uField,tq);return f.g<.12||texture2D(uBuildings,tq).r>.001;}`;
  const uniforms={uField:{value:this.field.texture},uBuildings:{value:this.field.maskTexture},uBounds:{value:this.field.bounds},uGridSize:{value:new THREE.Vector2(this.field.grid.cols,this.field.grid.rows)}};
  const m=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:mask+'varying float vAlpha;void main(){if(invalidWater())discard;gl_FragColor=vec4(.73,.94,.90,vAlpha);}',transparent:true,depthWrite:false});
  this.lines=new THREE.LineSegments(g,m);this.lines.frustumCulled=false;this.lines.renderOrder=5;this.flow.add(this.lines);
  this.headPositions=new Float32Array(this.capacity*3);const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(this.headPositions,3).setUsage(THREE.DynamicDrawUsage));
  const pm=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.)).xyz;vec4 mv=viewMatrix*vec4(vWorld,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(2.+600./max(1.,-mv.z),2.,4.8);}',fragmentShader:mask+'void main(){if(invalidWater())discard;float a=1.-smoothstep(.15,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(.83,.99,.94,a*.92);}',transparent:true,depthWrite:false});
  this.heads=new THREE.Points(pg,pm);this.heads.frustumCulled=false;this.heads.renderOrder=6;this.flow.add(this.heads);this.setDensity(this.density);
 }
 createArrows(){
  this.arrows=[];for(let r=10;r<this.field.grid.rows;r+=22)for(let c=10;c<this.field.grid.cols;c+=22){const a=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),12,'#e0f7e8',5,2.5);a.userData.xy=[this.field.x0+c/(this.field.grid.cols-1)*this.field.width,this.field.z0+r/(this.field.grid.rows-1)*this.field.height];this.arrows.push(a);this.vectors.add(a)}this.vectors.visible=false;
 }
 setDensity(count){this.density=Math.max(200,Math.min(this.capacity,Number(count)));this.lines?.geometry.setDrawRange(0,this.density*this.segments*2);this.heads?.geometry.setDrawRange(0,this.density)}
 setView(camera,target){this.view={x:target.x,z:target.z,radius:Math.max(150,camera.position.distanceTo(target)*.60)}}
 spawn(i){
  const f=this.field,p=this.particles[i];let q=null,x=0,z=0;
  for(let attempt=0;attempt<18;attempt++){
   if(!f.active.length){p.alive=false;return false}
   const k=f.active[Math.floor(this.rand()*f.active.length)],r=Math.floor(k/f.grid.cols),c=k%f.grid.cols;
   x=f.x0+c/(f.grid.cols-1)*f.width+(this.rand()-.5)*5;z=f.z0+r/(f.grid.rows-1)*f.height+(this.rand()-.5)*5;
   q=f.sample(x,z);if(q&&q.depth>.12&&q.solid<.25&&Math.hypot(q.vx,q.vz)>.055){if(attempt<12&&this.view&&Math.hypot(x-this.view.x,z-this.view.z)>this.view.radius)continue;break}q=null;
  }
  if(!q){p.alive=false;return false}p.x=x;p.z=z;p.age=0;p.life=4+this.rand()*10;p.alive=true;
  const base=i*(this.segments+1)*3;for(let j=0;j<=this.segments;j++){this.history[base+j*3]=x;this.history[base+j*3+1]=q.stage+.10;this.history[base+j*3+2]=z}return true;
 }
 resetParticles(){for(let i=0;i<this.capacity;i++)this.spawn(i)}
 setTime(t){
  if(Math.abs(t-this.lastPhysicalTime)>240)this.resetOnUpdate=true;this.lastPhysicalTime=t;
  for(const a of this.arrows){const xy=a.userData.xy,s=this.field.sample(...xy),speed=s?Math.hypot(s.vx,s.vz):0;a.visible=!!s&&s.depth>.15&&s.solid<.25&&speed>.06;if(a.visible){a.position.set(xy[0],s.stage+.2,xy[1]);a.setDirection(new THREE.Vector3(s.vx,0,s.vz).normalize());a.setLength(Math.min(30,10+speed*7),5,2.5)}}
 }
 update(now,camera,target){
  let dt=this.lastTime==null?0:Math.min(.05,(now-this.lastTime)/1000);this.lastTime=now;this.visualTime+=dt;this.uniforms.uVisualTime.value=this.visualTime;
  this.setView(camera,target);if(!this.flow.visible)return;
  if(this.resetOnUpdate){this.resetParticles();this.resetOnUpdate=false}
  const store=this.visualTime-this.lastTrail>.18;if(store)this.lastTrail=this.visualTime;
  const viewDensityScale=THREE.MathUtils.clamp(camera.position.distanceTo(target)/1400,.35,1),drawCount=Math.round(this.density*viewDensityScale);
  this.lines.geometry.setDrawRange(0,drawCount*this.segments*2);this.heads.geometry.setDrawRange(0,drawCount);
  let alive=0,minDepth=Infinity,aligned=0,moving=0;
  for(let i=0;i<drawCount;i++){
   const p=this.particles[i];p.age+=dt;
   if(!p.alive||p.age>p.life)this.spawn(i);
   let next=p.alive?advectRK2(p.x,p.z,dt*8,(x,z)=>this.field.sample(x,z)):null;
   if(!next){this.spawn(i);next=p.alive?this.field.sample(p.x,p.z):null}
   const base=i*(this.segments+1)*3;
   if(next&&p.alive){
    if('x'in next){const dx=next.x-p.x,dz=next.z-p.z;if(Math.hypot(dx,dz)>.000001){moving++;if(dx*next.vx+dz*next.vz>=0)aligned++}p.x=next.x;p.z=next.z}
    if(store)for(let j=this.segments;j>=1;j--)for(let k=0;k<3;k++)this.history[base+j*3+k]=this.history[base+(j-1)*3+k];
    this.history[base]=p.x;this.history[base+1]=next.stage+.10;this.history[base+2]=p.z;alive++;minDepth=Math.min(minDepth,next.depth);
   }else for(let j=0;j<=this.segments;j++){this.history[base+j*3]=0;this.history[base+j*3+1]=-100;this.history[base+j*3+2]=0}
   this.headPositions.set(this.history.subarray(base,base+3),i*3);
   for(let j=0;j<this.segments;j++){const at=(i*this.segments+j)*6;this.linePositions.set(this.history.subarray(base+j*3,base+j*3+6),at)}
  }
  this.lines.geometry.attributes.position.needsUpdate=true;this.heads.geometry.attributes.position.needsUpdate=true;
  this.stats={active:alive,requested:this.density,drawCount,viewDensityScale,eligibleCells:this.field.active.length,minDepth:Number.isFinite(minDepth)?minDepth:0,aligned,moving,visualPhaseSeconds:this.visualTime,visualTimeScale:8,physicalTime:this.field.time};
 }
}
