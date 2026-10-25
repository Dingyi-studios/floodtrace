/** Coordinates are local east/south metres; source velocities are east/north. */
export function sampleGrid(values,cols,rows,width,height,x,z,buildingMask=null){
 if(x<0||z<0||x>width||z>height)return null;
 const fx=Math.min(cols-1.000001,x/width*(cols-1)),fz=Math.min(rows-1.000001,z/height*(rows-1));
 const ix=Math.floor(fx),iz=Math.floor(fz),a=fx-ix,b=fz-iz,i=iz*cols+ix;
 const p=i*4,q=p+4,r=p+cols*4,s=r+4,w0=(1-a)*(1-b),w1=a*(1-b),w2=(1-a)*b,w3=a*b;
 return {
  stage:values[p]*w0+values[q]*w1+values[r]*w2+values[s]*w3,
  depth:values[p+1]*w0+values[q+1]*w1+values[r+1]*w2+values[s+1]*w3,
  vx:values[p+2]*w0+values[q+2]*w1+values[r+2]*w2+values[s+2]*w3,
  vz:-(values[p+3]*w0+values[q+3]*w1+values[r+3]*w2+values[s+3]*w3),
  solid:buildingMask?buildingMask[i]*w0+buildingMask[i+1]*w1+buildingMask[i+cols]*w2+buildingMask[i+cols+1]*w3:0
 };
}
export function advectRK2(x,z,dt,sample){
 const a=sample(x,z);if(!a||a.depth<.12||a.solid>.35||!Number.isFinite(a.vx+a.vz)||Math.hypot(a.vx,a.vz)<.04)return null;
 const mid=sample(x+a.vx*dt*.5,z+a.vz*dt*.5);if(!mid||mid.depth<.12||mid.solid>.35)return null;
 const nx=x+mid.vx*dt,nz=z+mid.vz*dt,b=sample(nx,nz);if(!b||b.depth<.12||b.solid>.35)return null;
 return {x:nx,z:nz,stage:b.stage,depth:b.depth,vx:mid.vx,vz:mid.vz};
}
