import assert from "node:assert/strict";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {readFile} from "node:fs/promises";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";
import {frameState} from "../public/rider-frame-runtime.js";

const publicDir=join(dirname(fileURLToPath(import.meta.url)),"../public");
const modes=["bike","walk","scooter","skateboard","surf","skate"];

test("default PNG rider has a visible authored render path for all six transports",async()=>{
 const {catalog,allowedFiles}=await loadRiderAssetRegistry(publicDir,{checkPng:true});
 const rider=catalog.presets[catalog.default_preset];
 assert.deepEqual(Object.keys(rider.transports).sort(),modes.slice().sort());
 for(const mode of modes){
  assert.equal(frameState(mode,rider),mode,`${mode} must not fall back to walking`);
  const state=rider.transports[mode];
  assert.equal(state.layers.plain.length,state.frames);
  assert.equal(state.layers.pack.length,state.frames);
  for(const url of [...state.layers.plain,...state.layers.pack]){
   assert.ok(allowedFiles.has(url),`${mode} missing body PNG: ${url}`);
  }
 }
 const ids=new Set();
 for(const mode of ["scooter","skateboard","surf","skate"]){
  const state=rider.transports[mode];
  assert.ok(state.vehicle_id,`${mode} cannot be rendered without its vehicle`);
  const pack=catalog.vehicles[state.vehicle_id];
  assert.ok(pack,`${mode} missing registered vehicle pack`);
  assert.equal(pack.transport,mode);
  assert.ok(!ids.has(pack.id),`${mode} incorrectly shares another transport`);
  ids.add(pack.id);
  const paths=[...pack.layers.back,...pack.layers.front];
  assert.ok(paths.length>0);
  for(const path of paths){
   assert.ok(allowedFiles.has(path),`${mode} asset not in server allowlist`);
   const file=await readFile(join(publicDir,path.slice(1)));
   assert.equal(file.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
   assert.equal(file.readUInt32BE(16),128);
   assert.equal(file.readUInt32BE(20),100);
  }
 }
 assert.equal(rider.transports.walk.vehicle_id,null);
});
