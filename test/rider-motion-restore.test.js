import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import test from "node:test";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";
import {frameState} from "../public/rider-frame-runtime.js";

const publicDir=join(dirname(fileURLToPath(import.meta.url)),"../public");
const modes=["scooter","skateboard","surf","skate"];
test("all four rebuilt motions use transport-specific legacy v0.1 ride and glide frames",async()=>{
  const {catalog,allowedFiles}=await loadRiderAssetRegistry(publicDir,{checkPng:true});
  const rider=catalog.presets[catalog.default_preset];
  const shapes=new Map();
  for(const mode of modes){
    assert.equal(frameState(mode,rider),mode);
    const a=rider.transports[mode];
    assert.equal(a.frames,6);
    assert.equal(a.glide?.frames,2);
    assert.equal(a.glide?.fps,4);
    assert.ok(a.vehicle_id);
    const vehicle=catalog.vehicles[a.vehicle_id];
    assert.ok(vehicle);
    assert.equal(vehicle.frames,6);
    assert.equal(vehicle.glide?.frames,2);
    const sequence=new Set();
    for(const profile of [a,a.glide]){
      for(const variant of ["pack","plain"]){
        assert.equal(profile.layers[variant].length,profile.frames);
        for(const src of profile.layers[variant]){
          assert.ok(src.includes("/"+mode+"/"),"wrong body transport: "+src);
          assert.ok(allowedFiles.has(src));
          sequence.add(src);
        }
      }
    }
    for(const profile of [vehicle,vehicle.glide]){
      for(const src of [...profile.layers.back,...profile.layers.front]){
        assert.ok(allowedFiles.has(src),"missing vehicle layer: "+src);
      }
    }
    const digests=new Set();
    for(const url of a.layers.plain){
      const bytes=await readFile(join(publicDir,url.slice(1)));
      digests.add(createHash("sha256").update(bytes).digest("hex"));
    }
    assert.ok(digests.size>=3,"not enough distinct poses for "+mode);
    shapes.set(mode,[...digests].sort().join("|"));
  }
  assert.equal(new Set(shapes.values()).size,4,"different vehicles must not all reuse a single pedestrian sequence");
});
test("glide is optional for third-party rider packs and runtime uses reduced-motion first frame",async()=>{
  const source=await readFile(join(publicDir,"rider-frame-runtime.js"),"utf8");
  assert.match(source,/coasting&&regular\.glide\?regular\.glide:regular/);
  assert.match(source,/coasting&&vehicle\?\.glide\?vehicle\.glide:vehicle/);
  assert.match(source,/reduced\?0:frameNumber/);
  assert.match(source,/e\.motionKey!==motionKey/);
});
test("legacy SVG motion source remains archived but never drives production rider directly",async()=>{
  const runtime=await readFile(join(publicDir,"rider-frame-runtime.js"),"utf8");
  const html=await readFile(join(publicDir,"index.html"),"utf8");
  assert.doesNotMatch(html,/legacy-motion-capture|rider-runtime\.js/);
  assert.doesNotMatch(runtime,/createElementNS|requestAnimationFrame\(drawLegacy/);
});
