import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {createHash} from "node:crypto";
import {frameState,frameNumber,resolveAppearance} from "../public/rider-frame-runtime.js";
import {normalizeRiderAppearance,createWebUser,updateWebUserRiderAppearance,readDenglemaUser} from "../src/denglema-state.js";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
const root=join(dirname(fileURLToPath(import.meta.url)),"../public");
test("PNG character catalog provides real transparent 128x100 frames in all variants",async()=>{
 const manifest=JSON.parse(await readFile(join(root,"riders/frames/manifest.json"),"utf8"));
 assert.equal(manifest.schema_version,2);
 const preset=JSON.parse(await readFile(join(root,"riders/frames/helmet-commuter/manifest.json"),"utf8"));
 const paths=[...Object.values(preset.heads),...Object.values(preset.transports).flatMap(t=>Object.values(t.layers).flat())];
 assert.equal(preset.transports.bike.frames,12,"pedaling is baked in twelve crank phases");
 assert.equal(preset.transports.bike.fps,12);
 assert.equal(paths.length,4+2*(12+6));
 for(const url of paths){
   assert.match(url,/^[a-z0-9/_-]+\.png$/);
   const buffer=await readFile(join(root,"riders/frames/helmet-commuter",url));
   assert.equal(buffer.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
   assert.equal(buffer.readUInt32BE(16),128);
   assert.equal(buffer.readUInt32BE(20),100);
   assert.equal(buffer[25],6,"RGBA PNG alpha required");
 }
});
test("helmet bike uses a complete distinct 12-phase pedal cycle in both pack variants",async()=>{
 const preset=JSON.parse(await readFile(join(root,"riders/frames/helmet-commuter/manifest.json"),"utf8"));
 const bike=preset.transports.bike;
 assert.equal(bike.frames,12);
 assert.equal(bike.fps,12);
 for(const variant of ["plain","pack"]){
  const hashes=[];
  for(const name of bike.layers[variant]){
   const data=await readFile(join(root,"riders/frames/helmet-commuter",name));
   hashes.push(createHash("sha256").update(data).digest("hex"));
  }
  assert.equal(new Set(hashes).size,12,"every pedal/wheel phase should render a distinct PNG: "+variant);
 }
});
test("frame presenter is PNG-only, supports emoji head and honors reduced-motion frame zero",()=>{
 assert.equal(frameState("bike"),"bike");
 assert.equal(frameState("surf"),"walk");
 const catalog={default_preset:"helmet-commuter",presets:{"helmet-commuter":{},"pixel-cat":{}}};
 assert.equal(resolveAppearance({preset:"pixel-cat"},catalog).preset,"pixel-cat");
 assert.equal(resolveAppearance({preset:"unknown"},catalog).preset,"helmet-commuter");
 assert.equal(frameNumber(0,10,6),0);
 assert.equal(frameNumber(700,10,6),1);
 assert.deepEqual(resolveAppearance({head_mode:"avatar",backpack:false},undefined,{avatar_emoji:"🐱"}),
  {preset:"helmet-commuter",head_mode:"avatar",head_variant:"auto",head_emoji:"🐱",head_image_url:null,backpack:false});
});
test("appearance input is bounded and saved independently of transport",async()=>{
 for(const value of [{head_mode:"svg"},{head_variant:"unknown"},{head_emoji:"abcde"},{backpack:"yes"},{preset:"unknown"}]){
 assert.throws(()=>normalizeRiderAppearance(value));
 }
 const tmp=await mkdtemp(join(tmpdir(),"denglema-appearance-"));
 try{
 const {user}=await createWebUser({display_name:"测试骑手",avatar_emoji:"🚴"},tmp);
 const updated=await updateWebUserRiderAppearance(user.id,{head_mode:"avatar",backpack:false},tmp);
 assert.equal(updated.transport,"bike");
 assert.equal(updated.rider_appearance.head_mode,"avatar");
 assert.equal((await readDenglemaUser(user.id,tmp)).rider_appearance.backpack,false);
 }finally{await rm(tmp,{recursive:true,force:true})}
});
test("homepage uses only the new frame presenter and no legacy sprite mounting",async()=>{
 const app=await readFile(join(root,"app.js"),"utf8");
 assert.match(app,/mountFrameRider/);
 assert.doesNotMatch(app,/mountRiderSprite|loadRiderCatalog|disposeRiderSprite/);
 const server=await readFile(join(root,"../src/server.js"),"utf8");
 assert.match(server,/loadRiderAssetRegistry/);
 assert.match(server,/\/api\/rider-catalog/);
 assert.match(server,/rider-frame-runtime\.js/);
});
