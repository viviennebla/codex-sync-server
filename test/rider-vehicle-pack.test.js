import test from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile,cp,mkdir,mkdtemp,rm,copyFile} from "node:fs/promises";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";
const publicDir=join(dirname(fileURLToPath(import.meta.url)),"../public");

test("a reviewed reusable PNG vehicle can combine with an unrelated rider pack",async()=>{
 const temp=await mkdtemp(join(tmpdir(),"denglema-vehicle-"));
 const frames=join(temp,"riders/frames"),vehicles=join(temp,"riders/vehicles");
 try {
  await mkdir(frames,{recursive:true});
  await mkdir(join(vehicles,"city-scooter","back"),{recursive:true});
  await cp(join(publicDir,"riders/frames/helmet-commuter"),join(frames,"helmet-commuter"),{recursive:true});
  const rider=JSON.parse(await readFile(join(frames,"helmet-commuter","manifest.json"),"utf8"));
  rider.heads={neutral:rider.heads.neutral};
  // Isolate the one vehicle contract under test from production registrations.
  rider.transports={walk:rider.transports.walk};
  const framePaths=rider.transports.walk.layers.plain;
  rider.transports.walk.layers={plain:framePaths};
  rider.transports.scooter={...rider.transports.walk,vehicle_id:"city-scooter"};
  await writeFile(join(frames,"helmet-commuter","manifest.json"),JSON.stringify(rider));
  await copyFile(join(frames,"helmet-commuter",framePaths[0]),join(vehicles,"city-scooter","back","00.png"));
  const vehicle={schema_version:1,id:"city-scooter",label:"城市滑板车",transport:"scooter",
   canvas:{width:128,height:100},frames:1,fps:5,layers:{back:["back/00.png"]}};
  await writeFile(join(vehicles,"city-scooter","manifest.json"),JSON.stringify(vehicle));
  const root={schema_version:2,default_preset:"helmet-commuter",
   presets:{"helmet-commuter":"/riders/frames/helmet-commuter/manifest.json"},
   vehicles:{"city-scooter":"/riders/vehicles/city-scooter/manifest.json"}};
  await writeFile(join(frames,"manifest.json"),JSON.stringify(root));
  const registry=await loadRiderAssetRegistry(temp,{checkPng:true});
  const preset=registry.catalog.presets["helmet-commuter"];
  assert.equal(preset.transports.scooter.vehicle_id,"city-scooter");
  assert.equal(preset.transports.scooter.layers.pack[0],preset.transports.scooter.layers.plain[0]);
  assert.equal(preset.heads.happy,preset.heads.neutral);
  assert.ok(registry.catalog.vehicles["city-scooter"].layers.back[0].endsWith("/back/00.png"));
  assert.ok(registry.allowedFiles.has("/riders/vehicles/city-scooter/back/00.png"));
  vehicle.transport="surf";
  await writeFile(join(vehicles,"city-scooter","manifest.json"),JSON.stringify(vehicle));
  await assert.rejects(loadRiderAssetRegistry(temp),/unregistered or incompatible vehicle/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
