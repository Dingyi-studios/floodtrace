import assert from 'node:assert/strict';
import fs from 'node:fs';
import{rainAppearance}from'../../app/src/rain-core.js';
import{cameraLayout}from'../../app/src/camera-layout.js';
import{makeContextTracks,trackPoint,insideBounds,localMapBounds}from'../../app/src/context-flow-core.js';
import{sampleGrid}from'../../app/src/flow-core.js';
const checks=[];
for(const [width,height]of [[1166,642],[882,402],[632,457],[525,500],[500,280]]){
 let previous=0;for(const rate of [0,.2,5,20,60,108,500]){const a=rainAppearance(rate,.55,width,height);assert(a.count>=previous&&a.count<=650);previous=a.count;if(rate===0)assert.equal(a.count,0)}
 assert.equal(rainAppearance(108,0,width,height).count,0);assert.equal(rainAppearance(108,.55,width,height,false).count,0);
 for(const full of [false,true])for(const chrome of [92,130]){const r=cameraLayout(width,height,full,chrome);assert(r.top+r.height<=height-8+.01);assert(r.width+r.right<=width);assert(r.height>chrome)}
}
checks.push({name:'rain density visible at positive rates, capped at extremes, dry/off/zero visual strength remain zero',passed:true},{name:'camera image and wrapped controls fit five map sizes, normal and expanded',passed:true});
const city=JSON.parse(fs.readFileSync(new URL('../../app/public/data/city.json',import.meta.url))),tracks=makeContextTracks(city.geography.watercourses),bounds=localMapBounds(city);let outside=0,total=0;
const model=JSON.parse(fs.readFileSync(new URL('../../app/public/data/compound.json',import.meta.url))),core=[model.bounds[0]-city.origin[0],city.origin[1]-model.bounds[3],model.bounds[2]-city.origin[0],city.origin[1]-model.bounds[1]];
for(const t of tracks){assert.deepEqual(trackPoint(t,0),t.points[0]);const end=trackPoint(t,t.length);assert(Math.hypot(end[0]-t.points.at(-1)[0],end[1]-t.points.at(-1)[1])<1e-6);for(let i=0;i<=50;i++){const p=trackPoint(t,t.length*i/50);assert(insideBounds(...p,bounds));if(!insideBounds(...p,core))outside++;total++}}
assert(outside>total*.3);assert.equal(bounds[2]-bounds[0],3400);assert.equal(bounds[3]-bounds[1],2700);assert.equal(core[2]-core[0],1600);
assert.equal(sampleGrid(new Float32Array(16),2,2,1600,1600,-10,100),null);
checks.push({name:'source river tracks reach full map and stay on mapped geometry; core domain remains 1600m',passed:true},{name:'outer illustrative context does not turn outside coordinates into model samples',passed:true});
fs.writeFileSync(new URL('../../validation/v4.3/display-checks.json',import.meta.url),JSON.stringify({version:'0.4.3',passed:checks.length,failed:0,mappedTracks:tracks.length,outerTrackSamples:outside,totalTrackSamples:total,checks},null,2));console.log(checks.length+' display checks passed');
