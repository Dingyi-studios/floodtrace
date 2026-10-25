import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FlowField,FloodWater,applyInundationMaterial} from './flood-water.js';

export class FloodScene{
 constructor(container,data,surface,onInspect,onHover){
  this.container=container;this.data=data;this.surface=surface;this.onInspect=onInspect;this.onHover=onHover;this.exag=1;this.exagUniform={value:1};this.field=new FlowField(surface,data.origin);this.mode='3D';this.layers={};this.markers=new Map();this.fly=null;this.frame=0;
  const w=container.clientWidth,h=container.clientHeight;
  this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(w,h);this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.setClearColor('#dce6e7');this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;container.appendChild(this.renderer.domElement);
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#dce6e7');this.scene.fog=new THREE.Fog('#dce6e7',3200,7200);
  this.camera=new THREE.PerspectiveCamera(40,w/h,1,18000);this.camera.position.set(950,950,1900);
  this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.set(140,30,470);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.minDistance=65;this.controls.maxDistance=4500;this.controls.maxPolarAngle=Math.PI*.475;this.controls.minPolarAngle=.03;this.controls.zoomSpeed=.8;this.controls.panSpeed=.8;this.controls.autoRotateSpeed=.35;
  this.controls.addEventListener('start',()=>{this.fly=null;this.controls.autoRotate=false});
  this.scene.add(new THREE.HemisphereLight('#dfeef2','#7c8b69',1.65));
  const sun=new THREE.DirectionalLight('#ffefcf',2.7);sun.position.set(-1300,2200,-900);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-2100;sun.shadow.camera.right=2100;sun.shadow.camera.top=1800;sun.shadow.camera.bottom=-1800;sun.shadow.camera.near=100;sun.shadow.camera.far=7000;sun.shadow.bias=-.0002;sun.shadow.normalBias=.45;this.scene.add(sun);this.sun=sun;
  this.world=new THREE.Group();this.scene.add(this.world);
  this.buildTerrain();this.buildBuildings();this.buildLines();this.buildParkedCars();this.buildVegetation();this.buildWater();this.buildMarkers();
  this.ray=new THREE.Raycaster();this.pointer=new THREE.Vector2();let down;
  container.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY});
  container.addEventListener('pointermove',e=>this.hover(e));
  container.addEventListener('pointerleave',()=>this.onHover(null));
  container.addEventListener('click',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<4)this.pick(e)});
  this.resize=new ResizeObserver(()=>{const w=container.clientWidth,h=container.clientHeight;this.renderer.setSize(w,h);if(this.camera.isOrthographicCamera){this.camera.left=-this.orthoHeight*w/h/2;this.camera.right=this.orthoHeight*w/h/2}else this.camera.aspect=w/h;this.camera.updateProjectionMatrix()});this.resize.observe(container);
  this.animate();
 }
 height(x,z){
  const {bounds,terrain,origin}=this.data;let fx=(x+origin[0]-bounds[0])/(bounds[2]-bounds[0])*(terrain.cols-1),fy=(z+bounds[3]-origin[1])/(bounds[3]-bounds[1])*(terrain.rows-1);fx=THREE.MathUtils.clamp(fx,0,terrain.cols-1.001);fy=THREE.MathUtils.clamp(fy,0,terrain.rows-1.001);const ix=Math.floor(fx),iy=Math.floor(fy),a=fx-ix,b=fy-iy,i=iy*terrain.cols+ix,hh=terrain.heights;return hh[i]*(1-a)*(1-b)+hh[i+1]*a*(1-b)+hh[i+terrain.cols]*(1-a)*b+hh[i+terrain.cols+1]*a*b;
 }
 buildTerrain(){
  const {bounds,origin,terrain}=this.data,{cols,rows,heights}=terrain,positions=[],uv=[],indices=[];
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){positions.push(bounds[0]+c/(cols-1)*(bounds[2]-bounds[0])-origin[0],heights[r*cols+c],origin[1]-bounds[3]+r/(rows-1)*(bounds[3]-bounds[1]));uv.push(c/(cols-1),1-r/(rows-1))}
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c;indices.push(a,a+cols,a+1,a+1,a+cols,a+cols+1)}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  const tex=new THREE.TextureLoader().load('/data/city-ground.jpg');tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
  this.terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:tex,roughness:1,color:'#e7eddf'}));this.terrain.receiveShadow=true;
  this.world.add(this.terrain);this.layers.terrain=new THREE.Group();
  const skirtP=[],skirtI=[];let edge=[];
  for(let c=0;c<cols;c++)edge.push(c);for(let r=1;r<rows;r++)edge.push(r*cols+cols-1);for(let c=cols-2;c>=0;c--)edge.push((rows-1)*cols+c);for(let r=rows-2;r>0;r--)edge.push(r*cols);
  for(const i of edge)skirtP.push(positions[i*3],positions[i*3+1]-.2,positions[i*3+2],positions[i*3],-9,positions[i*3+2]);
  for(let i=0;i<edge.length;i++){let a=i*2,b=(i*2+2)%(edge.length*2);skirtI.push(a,b,a+1,b,b+1,a+1)}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(skirtP,3));sg.setIndex(skirtI);sg.computeVertexNormals();this.skirt=new THREE.Mesh(sg,new THREE.MeshStandardMaterial({color:'#9da991',roughness:1,side:THREE.DoubleSide}));this.world.add(this.skirt);
  const grid=new THREE.GridHelper(7000,28,'#c4d2c0','#d2decf');grid.position.y=-9;grid.material.transparent=true;grid.material.opacity=.3;this.scene.add(grid);
  // Domain outline is the actual computational extent, not an inundation polygon.
  const d=this.data.domain,o=this.data.origin,pts=[[d[0]-o[0],o[1]-d[1]],[d[2]-o[0],o[1]-d[1]],[d[2]-o[0],o[1]-d[3]],[d[0]-o[0],o[1]-d[3]],[d[0]-o[0],o[1]-d[1]]];
  this.layers.domain=new THREE.Group();this.layers.domain.add(this.line(pts,'#669c91',2,3,true));this.world.add(this.layers.domain);
 }
 buildBuildings(){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=192;const ctx=canvas.getContext('2d');ctx.fillStyle='#ede9df';ctx.fillRect(0,0,256,192);
  let seed=23;for(let i=0;i<2200;i++){seed=(seed*16807)%2147483647;const x=seed%256;seed=(seed*16807)%2147483647;const y=seed%192;ctx.fillStyle=i%2?'#d8d4ca':'#f7f4ec';ctx.globalAlpha=.22;ctx.fillRect(x,y,1,1)}ctx.globalAlpha=1;
  ctx.fillStyle='#b9b7af';ctx.fillRect(0,188,256,4);ctx.fillStyle='#f9f7ef';ctx.fillRect(0,183,256,4);
  ctx.fillStyle='#aaaba4';ctx.fillRect(78,44,100,100);ctx.fillStyle='#f9f8f2';ctx.fillRect(81,46,94,94);
  const gradient=ctx.createLinearGradient(0,52,0,133);gradient.addColorStop(0,'#8ca8b5');gradient.addColorStop(.48,'#5d7b8b');gradient.addColorStop(1,'#314b58');ctx.fillStyle=gradient;ctx.fillRect(87,52,82,81);
  ctx.fillStyle='#e2e4da';ctx.fillRect(125,52,4,81);ctx.fillRect(87,91,82,4);ctx.fillStyle='#b7b7a9';ctx.fillRect(76,141,104,5);
  const facade=new THREE.CanvasTexture(canvas);facade.colorSpace=THREE.SRGBColorSpace;facade.wrapS=facade.wrapT=THREE.RepeatWrapping;facade.anisotropy=8;
  const wp=[],wc=[],wu=[],rp=[],rc=[],wallOwners=[],roofOwners=[];
  const wallPalette=['#f1e6d2','#d9dfd9','#e5cdb3','#e6e5da','#d9c0a6','#cbd5d0'],roofPalette=['#946b57','#6b797e','#a57e65','#677778','#8e7664'];
  const add=(a,b,c,color,uv)=>{for(const p of[a,b,c])wp.push(...p);for(let k=0;k<3;k++)wc.push(color.r,color.g,color.b);wu.push(...uv)};
  this.data.geography.buildings.forEach((b,index)=>{
   const colour=new THREE.Color(wallPalette[Number(b.id)%wallPalette.length]),roof=new THREE.Color(roofPalette[Number(b.id)%roofPalette.length]);
   for(const ring of b.rings)for(let i=0;i<ring.length-1;i++){
    const a=ring[i],c=ring[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<.05)continue;
    const ba=this.height(...a)-.15,bc=this.height(...c)-.15,top=b.ground+b.height;
    const q0=[a[0],ba,a[1]],q1=[c[0],bc,c[1]],q2=[c[0],top,c[1]],q3=[a[0],top,a[1]],v0=(ba-b.ground)/2.9,v1=(bc-b.ground)/2.9,vt=b.height/2.9;
    add(q0,q1,q2,colour,[0,v0,l/4,v1,l/4,vt]);add(q0,q2,q3,colour,[0,v0,l/4,vt,0,vt]);wallOwners.push(index,index);
   }
   if(b.roofType==='pitched'){
    const cross=[-Math.sin(b.orientation),Math.cos(b.orientation)],all=b.rings[0].map(p=>(p[0]-b.xy[0])*cross[0]+(p[1]-b.xy[1])*cross[1]),half=(Math.max(...all)-Math.min(...all))/2,top=b.ground+b.height;
    const roofH=p=>top+b.roofRise*Math.max(0,1-Math.abs((p[0]-b.xy[0])*cross[0]+(p[1]-b.xy[1])*cross[1])/Math.max(1,half));
    for(const ring of b.rings)for(let i=0;i<ring.length-1;i++){
     const a=ring[i],c=ring[i+1],da=(a[0]-b.xy[0])*cross[0]+(a[1]-b.xy[1])*cross[1],dc=(c[0]-b.xy[0])*cross[0]+(c[1]-b.xy[1])*cross[1],ps=[a];
     if(da*dc<0){const t=-da/(dc-da);ps.push([a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t])}ps.push(c);
     for(let j=0;j<ps.length-1;j++){const p=ps[j],q=ps[j+1],hp=roofH(p),hq=roofH(q),len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(Math.max(hp,hq)-top<.03)continue;const v0=top/2.9,vp=(hp-b.ground)/2.9,vq=(hq-b.ground)/2.9;
      add([p[0],top,p[1]],[q[0],top,q[1]],[q[0],hq,q[1]],colour,[0,b.height/2.9,len/4,b.height/2.9,len/4,vq]);add([p[0],top,p[1]],[q[0],hq,q[1]],[p[0],hp,p[1]],colour,[0,b.height/2.9,len/4,vq,0,vp]);wallOwners.push(index,index);
     }
    }
   }
   const verts=b.roofVertices||[];for(let i=0;i<verts.length;i+=3){for(const j of[i,i+2,i+1]){const v=verts[j];rp.push(v[0],b.ground+v[1],v[2]);rc.push(roof.r,roof.g,roof.b)}roofOwners.push(index)}
  });
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));wg.setAttribute('color',new THREE.Float32BufferAttribute(wc,3));wg.setAttribute('uv',new THREE.Float32BufferAttribute(wu,2));wg.computeVertexNormals();
  const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));rg.setAttribute('color',new THREE.Float32BufferAttribute(rc,3));rg.computeVertexNormals();
  const wm=applyInundationMaterial(new THREE.MeshStandardMaterial({map:facade,vertexColors:true,roughness:.86,side:THREE.DoubleSide}),this.field,this.exagUniform),rm=applyInundationMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,side:THREE.DoubleSide}),this.field,this.exagUniform);
  this.layers.buildings=new THREE.Group();this.buildingMesh=new THREE.Mesh(wg,wm);this.roofMesh=new THREE.Mesh(rg,rm);this.buildingMesh.userData.owners=wallOwners;this.roofMesh.userData.owners=roofOwners;
  for(const m of[this.buildingMesh,this.roofMesh]){m.castShadow=true;m.receiveShadow=true;this.layers.buildings.add(m)}this.world.add(this.layers.buildings);
 }
 ribbon(points,width,color,offset=.35){
  const pts=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/12));for(let j=0;j<n;j++)pts.push([THREE.MathUtils.lerp(a[0],b[0],j/n),THREE.MathUtils.lerp(a[1],b[1],j/n)])}pts.push(points.at(-1));
  const pos=[],idx=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];let dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;for(const sign of [-1,1]){const x=pts[i][0]+dz*width/2*sign,z=pts[i][1]-dx*width/2*sign;pos.push(x,this.height(x,z)+offset,z)}if(i<pts.length-1){const n=i*2;idx.push(n,n+2,n+1,n+1,n+2,n+3)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:.95,side:THREE.DoubleSide}));m.receiveShadow=true;return m;
 }
 line(points,color,opacity=1,offset=1,dashed=false){
  const pts=[];for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/15));for(let j=0;j<n;j++){let x=THREE.MathUtils.lerp(a[0],b[0],j/n),z=THREE.MathUtils.lerp(a[1],b[1],j/n);pts.push(new THREE.Vector3(x,this.height(x,z)+offset,z))}}const p=points.at(-1);pts.push(new THREE.Vector3(p[0],this.height(...p)+offset,p[1]));
  const geo=new THREE.BufferGeometry().setFromPoints(pts);const material=dashed?new THREE.LineDashedMaterial({color,dashSize:10,gapSize:7,transparent:true,opacity}):new THREE.LineBasicMaterial({color,transparent:true,opacity});const line=new THREE.Line(geo,material);line.computeLineDistances();return line;
 }
 buildLines(){
  this.layers.roads=new THREE.Group();const roadGeos=[],edgeGeos=[];
  for(const r of this.data.geography.roads){const path=r.kind==='Sti',w=path?2:5.6;const a=this.ribbon(r.points,w,path?'#c6c8a7':'#a7b0a0',.44);roadGeos.push(a.geometry);a.material.dispose();if(!path){const b=this.ribbon(r.points,w+2,'#d1d5bb',.34);edgeGeos.push(b.geometry);b.material.dispose()}}
  for(const [geos,color] of [[edgeGeos,'#d4dac2'],[roadGeos,'#929b98']]){const g=mergeGeometries(geos,false),m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,roughness:1,side:THREE.DoubleSide}));m.receiveShadow=true;this.layers.roads.add(m);geos.forEach(g=>g.dispose())}this.world.add(this.layers.roads);
  this.layers.rivers=new THREE.Group();for(const r of this.data.geography.watercourses)this.layers.rivers.add(this.ribbon(r.points,5,'#7fa9a1',.5));
  for(const l of this.data.geography.lakes){const s=new THREE.Shape(l.rings[0].map(p=>new THREE.Vector2(p[0],-p[1])));const geo=new THREE.ShapeGeometry(s);geo.rotateX(-Math.PI/2);let pos=geo.attributes.position;for(let i=0;i<pos.count;i++)pos.setY(i,this.height(pos.getX(i),pos.getZ(i))+.45);geo.computeVertexNormals();this.layers.rivers.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#81b2ad',roughness:.32,metalness:.05,side:THREE.DoubleSide})))}this.world.add(this.layers.rivers);
  this.layers.network=new THREE.Group();const p=[];for(const l of this.data.links){for(let i=0;i<l.points.length-1;i++){for(const q of [l.points[i],l.points[i+1]])p.push(q[0],this.height(...q)+1.6,q[1])}}
  const ng=new THREE.BufferGeometry();ng.setAttribute('position',new THREE.Float32BufferAttribute(p,3));this.layers.network.add(new THREE.LineSegments(ng,new THREE.LineBasicMaterial({color:'#256f69',transparent:true,opacity:.55})));
  const dots=new THREE.InstancedMesh(new THREE.CylinderGeometry(2.7,2.7,1.5,6),new THREE.MeshBasicMaterial({color:'#327b70'}),this.data.nodes.length);const m=new THREE.Matrix4();this.data.nodes.forEach((n,i)=>{m.makeTranslation(n.xy[0],this.height(...n.xy)+2,n.xy[1]);dots.setMatrixAt(i,m)});dots.userData.type='network';this.networkDots=dots;this.layers.network.add(dots);this.world.add(this.layers.network);
 }
 buildVegetation(){
  // Deterministic symbolic planting beside source watercourses, never presented
  // as a tree inventory. Avoid occupied building cells and mapped road surfaces.
  const occupied=new Set(),key=(x,z)=>`${Math.floor(x/12)},${Math.floor(z/12)}`;
  for(const b of this.data.geography.buildings){const ps=b.rings[0],xs=ps.map(p=>p[0]),zs=ps.map(p=>p[1]);for(let x=Math.min(...xs)-5;x<=Math.max(...xs)+8;x+=8)for(let z=Math.min(...zs)-5;z<=Math.max(...zs)+8;z+=8)occupied.add(key(x,z))}
  for(const r of this.data.geography.roads)for(let i=0;i<r.points.length-1;i++){const a=r.points[i],b=r.points[i+1],n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/7);for(let j=0;j<=n;j++)occupied.add(key(THREE.MathUtils.lerp(a[0],b[0],j/n),THREE.MathUtils.lerp(a[1],b[1],j/n)))}
  let seed=61;const rand=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};const spots=[];
  for(const r of this.data.geography.watercourses)for(let i=0;i<r.points.length-1;i++){const a=r.points[i],b=r.points[i+1],n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/9);for(let j=0;j<n;j++){const x=THREE.MathUtils.lerp(a[0],b[0],j/n)+(rand()-.5)*70,z=THREE.MathUtils.lerp(a[1],b[1],j/n)+(rand()-.5)*70;if(!occupied.has(key(x,z))&&x>-1680&&x<1680&&z>-1330&&z<1330)spots.push([x,z,4+rand()*4,rand()])}}
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#879b73',roughness:1}),spots.length),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.45,.65,1,5),new THREE.MeshStandardMaterial({color:'#8d8c6f'}),spots.length),m=new THREE.Matrix4(),p=new THREE.Vector3(),s=new THREE.Vector3(),q=new THREE.Quaternion();
  spots.forEach(([x,z,h,r],i)=>{const y=this.height(x,z);p.set(x,y+h*.7,z);s.set(h*.52,h*.6,h*.52);m.compose(p,q,s);crowns.setMatrixAt(i,m);crowns.setColorAt(i,new THREE.Color().setHSL(.22+r*.07,.16+r*.1,.27+r*.16));p.set(x,y+h*.24,z);s.set(1,h*.48,1);m.compose(p,q,s);trunks.setMatrixAt(i,m)});crowns.castShadow=true;crowns.receiveShadow=true;this.vegetation=new THREE.Group();this.vegetation.add(crowns,trunks);this.world.add(this.vegetation);
 }
 buildParkedCars(){
  let seed=313;const rand=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646},spots=[];
  for(const road of this.data.geography.roads){if(road.kind==='Sti')continue;for(let i=0;i<road.points.length-1&&spots.length<280;i++){
   const a=road.points[i],b=road.points[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<26||rand()>.4)continue;
   const t=.15+rand()*.7,sign=rand()>.5?1:-1,x=a[0]+(b[0]-a[0])*t+(b[1]-a[1])/len*2*sign,z=a[1]+(b[1]-a[1])*t-(b[0]-a[0])/len*2*sign;
   if(this.field.nearest(x,z)>=0)spots.push({x,z,y:this.height(x,z)+.1,heading:Math.atan2(b[0]-a[0],b[1]-a[1]),colour:new THREE.Color(['#e3dfd1','#8a9f9a','#b3815e','#c1c8c4','#6e8791'][Math.floor(rand()*5)])});
  }}
  const bodyGeo=new THREE.BoxGeometry(1.9,.65,4.25);bodyGeo.translate(0,.66,0);const cabGeo=new THREE.BoxGeometry(1.65,.60,2.05);cabGeo.translate(0,1.26,-.3);const roofGeo=new THREE.BoxGeometry(1.68,.13,2.1);roofGeo.translate(0,1.6,-.3);
  const body=new THREE.InstancedMesh(bodyGeo,applyInundationMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.58}),this.field,this.exagUniform),spots.length),cab=new THREE.InstancedMesh(cabGeo,applyInundationMaterial(new THREE.MeshStandardMaterial({color:'#4c6872',roughness:.35}),this.field,this.exagUniform),spots.length),roof=new THREE.InstancedMesh(roofGeo,applyInundationMaterial(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.58}),this.field,this.exagUniform),spots.length);
  const wheelGeo=new THREE.CylinderGeometry(.32,.32,.24,8);wheelGeo.rotateZ(Math.PI/2);const wheels=new THREE.InstancedMesh(wheelGeo,new THREE.MeshStandardMaterial({color:'#394345'}),spots.length*4);const m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3(1,1,1);
  spots.forEach((car,i)=>{q.setFromAxisAngle(new THREE.Vector3(0,1,0),car.heading);p.set(car.x,car.y,car.z);m.compose(p,q,s);for(const mesh of[body,cab,roof])mesh.setMatrixAt(i,m);body.setColorAt(i,car.colour);roof.setColorAt(i,car.colour);for(let k=0;k<4;k++){const local=new THREE.Vector3(k<2?-1:1,.35,k%2?-1.4:1.4).applyQuaternion(q).add(p);m.compose(local,q,s);wheels.setMatrixAt(i*4+k,m)}});
  this.parkedCars=new THREE.Group();for(const m of[body,cab,roof,wheels]){m.castShadow=true;m.receiveShadow=true;this.parkedCars.add(m)}this.layers.roads.add(this.parkedCars);this.parkedCarCount=spots.length;
  // Road markings are schematic street detail, not a surveyed lane inventory.
  const marks=[];for(const road of this.data.geography.roads){if(road.kind==='Sti')continue;for(let i=0;i<road.points.length-1;i++){const a=road.points[i],b=road.points[i+1],l=Math.hypot(a[0]-b[0],a[1]-b[1]);for(let d=4;d+3<l;d+=10){for(const k of[d,d+3]){const x=a[0]+(b[0]-a[0])*k/l,z=a[1]+(b[1]-a[1])*k/l;marks.push(x,this.height(x,z)+.50,z)}}}}
  const mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.Float32BufferAttribute(marks,3));this.layers.roads.add(new THREE.LineSegments(mg,new THREE.LineBasicMaterial({color:'#e4e3ca',transparent:true,opacity:.75})));
 }
 buildWater(){
  this.waterView=new FloodWater(this.world,this.field);this.layers.flood=this.waterView.group;this.layers.flow=this.waterView.flow;this.layers.vectors=this.waterView.vectors;this.water=this.waterView.mesh;this.currentDepth=this.field.depth;this.setTime(3600);
 }
 buildMarkers(){
  this.layers.sensors=new THREE.Group();this.world.add(this.layers.sensors);
  const select=new THREE.Mesh(new THREE.RingGeometry(15,18,48),new THREE.MeshBasicMaterial({color:'#efbb6c',side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:.95}));select.rotation.x=-Math.PI/2;select.renderOrder=6;this.selectionRing=select;this.world.add(select);select.visible=false;
 }
 addMarker(id,xy,kind='sensor'){
  if(id==='R01'){
   const van=new THREE.Group();const body=new THREE.MeshStandardMaterial({color:'#d39850',roughness:.8}),glass=new THREE.MeshStandardMaterial({color:'#4f7777',roughness:.4}),dark=new THREE.MeshStandardMaterial({color:'#465347'});
   const part=(size,pos,mat)=>{const box=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);box.position.set(...pos);box.castShadow=true;van.add(box)};
   part([2.6,1.7,5.4],[0,1.6,0],body);part([2.55,.85,1.5],[0,2.45,1.1],glass);part([2.65,.2,1.8],[0,2.95,1.1],body);part([2.45,.12,2.8],[0,2.52,-1.2],new THREE.MeshStandardMaterial({color:'#e9e9cf'}));part([1.6,.25,.35],[0,3.18,1.1],new THREE.MeshBasicMaterial({color:'#eab675'}));
   for(const x of [-1.35,1.35])for(const z of [-1.7,1.7]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.56,.56,.35,10),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.65,z);van.add(wheel)}
   van.position.set(xy[0],this.height(...xy)+.5,xy[1]);van.traverse(o=>o.userData.id=id);this.layers.sensors.add(van);this.markers.set(id,{mesh:van,xy,kind});return van;
  }
  const geo=new THREE.CylinderGeometry(kind==='resource'?3:1.8,kind==='resource'?3:1.8,kind==='resource'?.8:.4,kind==='resource'?4:24),mat=new THREE.MeshStandardMaterial({color:kind==='sensor'?'#32888b':'#d19752',emissive:kind==='sensor'?'#236d6c':'#aa6f2a',emissiveIntensity:.15});
  const m=new THREE.Mesh(geo,mat);m.position.set(xy[0],this.height(...xy)+(kind==='resource'?.8:.3),xy[1]);m.userData.id=id;this.layers.sensors.add(m);this.markers.set(id,{mesh:m,xy,kind});return m;
 }
 setTime(t){this.time=t;this.field.setTime(t);this.currentDepth=this.field.depth;this.waterView.setTime(t);this.updateSelection()}
 depthSeries(xy){return this.field.series(...xy)}
 nearestCell(x,z){return this.field.nearest(x,z)}
 depthAt(x,z){return this.field.sample(x,z)?.depth??null}
 buildingSamples(index){
  const b=this.data.geography.buildings[index],out=[b.xy];
  for(const ring of b.rings)for(let i=0;i<ring.length-1;i++){const a=ring[i],c=ring[i+1],x=(a[0]+c[0])/2,z=(a[1]+c[1])/2,dx=x-b.xy[0],dz=z-b.xy[1],l=Math.hypot(dx,dz)||1;out.push([x+dx/l*4,z+dz/l*4])}return out;
 }
 buildingReading(index){
  const b=this.data.geography.buildings[index];let stage=-Infinity;
  for(const xy of this.buildingSamples(index)){const q=this.field.sample(...xy);if(q&&q.depth>.05)stage=Math.max(stage,q.stage)}
  const depth=Number.isFinite(stage)?Math.max(0,stage-b.ground):0,roof=b.height+b.roofRise,status=depth>roof?'屋顶被淹':depth>b.height?'仅屋顶露出':depth>.12?`${Math.min(b.floors,Math.max(1,Math.ceil(depth/2.9)))} 层受淹`:'尚未进水';
  return {depth,stage:Number.isFinite(stage)?stage:null,floors:Math.min(b.floors,Math.floor(depth/2.9)),status,roofLevel:b.ground+roof};
 }
 buildingSeries(index){const b=this.data.geography.buildings[index],points=this.buildingSamples(index);return Array.from({length:this.field.grid.frames},(_,f)=>{let stage=-Infinity;for(const xy of points){const q=this.field.sampleFrame(...xy,f);if(q&&q.depth>.05)stage=Math.max(stage,q.stage)}return{t:f*this.surface.step,value:Number.isFinite(stage)?Math.max(0,stage-b.ground):0}})}
 setParticleDensity(count){this.waterView.setDensity(count)}
 viewPreset(kind){
  this.controls.autoRotate=false;
  if(kind==='overview')return this.overview();
  const xy=kind==='inflow'?[-525,1060]:(this.surface.viewpoints?.district||[-65,820]);
  this.focus(xy,kind==='inflow'?680:380);
 }
 setLayer(id,value){if(id==='terrain'){this.terrain.visible=value;this.skirt.visible=value;if(this.vegetation)this.vegetation.visible=value;return}if(id==='flood')this.field.enabledUniform.value=value?1:0;if(this.layers[id])this.layers[id].visible=value}
 setOpacity(id,value){if(id==='flood'){this.waterView.uniforms.uOpacity.value=value;return}if(!this.layers[id])return;this.layers[id].traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=value}})}
 setExaggeration(value){this.exag=Number(value);this.exagUniform.value=this.exag;this.world.scale.y=this.exag;this.updateSelection()}
 setMode(mode){
  if(mode===this.mode)return;this.fly=null;const target=this.controls.target.clone(),dist=this.camera.position.distanceTo(target),aspect=this.container.clientWidth/this.container.clientHeight;
  this.mode=mode;this.controls.enableRotate=mode==='3D';this.controls.mouseButtons.LEFT=mode==='2D'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
  if(mode==='2D'){
   this.saved3D=this.camera.position.clone().sub(target);this.perspectiveCamera=this.camera;this.orthoHeight=dist*Math.tan(this.camera.fov*Math.PI/360)*2;
   this.camera=new THREE.OrthographicCamera(-this.orthoHeight*aspect/2,this.orthoHeight*aspect/2,this.orthoHeight/2,-this.orthoHeight/2,3,18000);this.camera.up.set(0,0,-1);this.camera.position.copy(target).add(new THREE.Vector3(0,3000,.01));this.camera.lookAt(target);
  }else{
   this.camera=this.perspectiveCamera;this.camera.aspect=aspect;this.camera.position.copy(target).add(this.saved3D||new THREE.Vector3(1000,1500,1700));this.camera.lookAt(target);
  }this.camera.updateProjectionMatrix();this.controls.object=this.camera;this.controls.update();
 }
 focus(xy,distance=900){this.controls.autoRotate=false;const target=new THREE.Vector3(xy[0],this.height(...xy)*this.exag,xy[1]);if(this.camera.isOrthographicCamera){this.camera.zoom=this.orthoHeight/(distance*.75);this.camera.updateProjectionMatrix()}const offset=this.mode==='2D'?new THREE.Vector3(0,3000,.01):new THREE.Vector3(distance*.46,distance*.66,distance*.7);this.flyTo(target.clone().add(offset),target)}
 overview(){this.controls.autoRotate=false;if(this.camera.isOrthographicCamera){this.camera.zoom=this.orthoHeight/1650;this.camera.updateProjectionMatrix()}const target=new THREE.Vector3(140,30,470),p=this.mode==='2D'?new THREE.Vector3(140,3030,470.01):new THREE.Vector3(950,950,1900);this.flyTo(p,target)}
 flyTo(pos,target){this.fly={start:performance.now(),from:this.camera.position.clone(),fromTarget:this.controls.target.clone(),to:pos,target}}
 zoom(factor){if(this.camera.isOrthographicCamera){this.camera.zoom/=factor;this.camera.updateProjectionMatrix()}else this.camera.position.sub(this.controls.target).multiplyScalar(factor).add(this.controls.target);this.controls.update()}
 select(id,xy){this.selected=id;this.selectedXY=xy;this.updateSelection()}
 updateSelection(){if(!this.selectedXY)return;this.selectionRing.visible=true;this.selectionRing.position.set(this.selectedXY[0],Math.max(this.height(...this.selectedXY)+.25,this.field.sample(...this.selectedXY)?.stage+.20||0),this.selectedXY[1])}
 addRoute(points){if(this.route){this.world.remove(this.route)}this.route=new THREE.Group();this.route.add(this.line(points,'#c6944f',1,3,true));this.route.add(this.ribbon(points,4,'#d8a965',2));this.world.add(this.route);this.route.visible=false}
 showRoute(show){if(this.route)this.route.visible=show}
 moveMarker(id,xy){const m=this.markers.get(id);if(!m)return;if(id==='R01'&&Math.hypot(xy[0]-m.xy[0],xy[1]-m.xy[1])>.01)m.mesh.rotation.y=Math.atan2(xy[0]-m.xy[0],xy[1]-m.xy[1]);m.xy=xy;m.mesh.position.set(xy[0],this.height(...xy)+(id==='R01'?.5:5),xy[1]);if(this.selected===id){this.selectedXY=xy;this.updateSelection()}}
 pointerRay(e){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera)}
 pick(e){this.pointerRay(e);let hit=this.ray.intersectObjects([...this.markers.values()].filter(m=>m.mesh.visible&&this.layers.sensors.visible).map(m=>m.mesh),true)[0];if(hit){this.onInspect(hit.object.userData.id);return}if(this.layers.network.visible){hit=this.ray.intersectObject(this.networkDots)[0];if(hit){this.onInspect(this.data.nodes[hit.instanceId].id);return}}if(this.layers.buildings.visible){hit=this.ray.intersectObjects([this.buildingMesh,this.roofMesh],false)[0];if(hit){const index=hit.object.userData.owners[hit.faceIndex];this.onInspect('B'+String(index).padStart(4,'0'))}}}
 hover(e){if(this.frame%3!==0)return;this.pointerRay(e);const hit=this.ray.intersectObject(this.terrain)[0];if(!hit){this.onHover(null);return}const p=hit.point;this.onHover({x:e.offsetX,y:e.offsetY,xy:[p.x,p.z],elevation:this.height(p.x,p.z),depth:this.layers.flood.visible?this.depthAt(p.x,p.z):null})}
 project(xy,offset=24){const p=new THREE.Vector3(xy[0],(this.height(...xy)+offset)*this.exag,xy[1]).project(this.camera);return{x:(p.x+1)/2*this.container.clientWidth,y:(1-p.y)/2*this.container.clientHeight,visible:p.z<1&&Math.abs(p.x)<1.1&&Math.abs(p.y)<1.1}}
 animate(){requestAnimationFrame(()=>this.animate());this.frame++;if(this.fly){let t=Math.min(1,(performance.now()-this.fly.start)/850);t=1-Math.pow(1-t,3);this.camera.position.lerpVectors(this.fly.from,this.fly.to,t);this.controls.target.lerpVectors(this.fly.fromTarget,this.fly.target,t);if(t>=1)this.fly=null}this.controls.update();this.waterView?.update(performance.now(),this.camera,this.controls.target);this.renderer.render(this.scene,this.camera);this.onRender?.();}
}
