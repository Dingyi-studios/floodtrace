import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {sampleGrid,advectRK2} from '../../app/src/flow-core.js';
const root=new URL('../../',import.meta.url);const checks=[];
function pass(name,details){checks.push({name,pass:true,details})}
const n=4,values=new Float32Array(n*n*4);for(let i=0;i<n*n;i++)values.set([20,3,1.25,.75],i*4);
const f=(x,z)=>sampleGrid(values,n,n,30,30,x,z);const p=advectRK2(12,17,2,f);
assert(Math.abs(p.x-14.5)<1e-8&&Math.abs(p.z-15.5)<1e-8);pass('constant-flow analytic advection / east-north to east-south conversion',p);
const circular=(x,z)=>({stage:20,depth:3,vx:-(z-20)*.1,vz:(x-20)*.1,solid:0});let q={x:30,z:20};
for(let i=0;i<100;i++)q=advectRK2(q.x,q.z,.1,circular);
const error=Math.hypot(q.x-(20+10*Math.cos(1)),q.z-(20+10*Math.sin(1)));assert(error<.001);pass('rotational-flow analytic integration', {position_error_m:error});
assert.equal(advectRK2(1,1,1,()=>({depth:.05,vx:1,vz:0,solid:0})),null);assert.equal(advectRK2(1,1,1,()=>({depth:3,vx:1,vz:0,solid:1})),null);assert.equal(advectRK2(1,1,1,()=>({depth:3,vx:0,vz:0,solid:0})),null);assert.equal(sampleGrid(values,4,4,30,30,-1,5),null);pass('dry, shallow, solid, stagnant and outside masks',{});
const meta=JSON.parse(await readFile(new URL('app/public/data/urban.json',root),'utf8')),bytes=await readFile(new URL('app/public/data/urban-fields.bin',root)),all=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),mask=await readFile(new URL('app/public/data/urban-buildings.bin',root));
const count=meta.grid.count,frame=all.subarray(30*count*4,31*count*4),real=(x,z)=>sampleGrid(frame,meta.grid.cols,meta.grid.rows,1600,1600,x,z,mask);let successful=0,rejected=0;
for(let i=0;i<count;i+=131){if(frame[i*4+1]<.3||mask[i])continue;let x=i%201*8,z=Math.floor(i/201)*8;for(let k=0;k<30;k++){const result=advectRK2(x,z,.8,real);if(!result){rejected++;break}assert(result.depth>=.12);assert(result.x>=0&&result.x<=1600&&result.z>=0&&result.z<=1600);const local=real(result.x,result.z);assert(local.solid<=.35);successful++;x=result.x;z=result.z}}
assert(successful>1000);pass('actual model-field trajectories remain on eligible wet field',{successful_steps:successful,masked_terminations:rejected});
const report={checked_on:'2026-10-25',passed:checks.length,failed:0,checks};await writeFile(new URL('validation/v2/tracer-checks.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
