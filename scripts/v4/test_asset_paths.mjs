import assert from 'node:assert/strict';
import fs from 'node:fs';
import{assetUrl}from'../../app/src/asset-url.js';
assert.equal(assetUrl('/data/city.json'),'/data/city.json');
for(const base of ['/floodtrace/','/floodtrace']){
 for(const path of ['/data/city.json','data/city.json'])assert.equal(assetUrl(path,base),'/floodtrace/data/city.json');
 for(const name of ['compound','historical']){
  const model=JSON.parse(fs.readFileSync(new URL(`../../app/public/data/${name}.json`,import.meta.url)));
  for(const key of ['fields_url','ground_url','building_mask_url'])assert(assetUrl(model.grid[key],base).startsWith('/floodtrace/data/'));
  const op=JSON.parse(fs.readFileSync(new URL(`../../app/public/data/${name}-operations.json`,import.meta.url)));
  assert.equal(assetUrl(op.risk.url,base),`/floodtrace/data/${name}-risk.bin`);
 }
}
for(const url of ['https://example.com/data.bin','data:image/png;base64,abc','//example.com/data.bin'])assert.equal(assetUrl(url,'/floodtrace/'),url);
console.log('Root, nested data/texture paths and absolute URLs passed');
