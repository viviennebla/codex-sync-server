import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";
import {PNG} from "pngjs";

const publicDir=fileURLToPath(new URL("../public",import.meta.url));
const expected={
 "helmet-commuter":["bike","walk","scooter","skateboard","surf","skate"],
 "bubble-suit":["walk","scooter"],
 "raincoat-bean":["walk"],
 "fluffy-bun":["walk","skate"]
};
test("only selected approved mascots are published with real animation PNGs",async()=>{
 const {catalog}=await loadRiderAssetRegistry(publicDir,{checkPng:true});
 assert.deepEqual(Object.keys(catalog.presets),Object.keys(expected));
 for(const [id,modes] of Object.entries(expected)){
  const role=catalog.presets[id];
  assert.deepEqual(Object.keys(role.transports),modes);
  if(id==="helmet-commuter")continue;
  assert.equal(Object.keys(role.heads).length,4);
  const headHashes=new Set();
  for(const url of Object.values(role.heads)){
   const bytes=await readFile(join(publicDir,url.slice(1)));
   headHashes.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(headHashes.size,4,id+": emotion heads must be different");
  for(const [transport,motion] of Object.entries(role.transports)){
   assert.equal(motion.frames,8);
   assert.equal(motion.layers.plain.length,8);
   assert.equal(motion.layers.pack.length,8);
   const hashes=[];
   for(const url of motion.layers.plain){
    const bytes=await readFile(join(publicDir,url.slice(1)));
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
   }
   assert.ok(new Set(hashes).size>=4,id+"/"+transport+": needs real animation frames");
  }
 }
});

test("all selected movement packs change the actual boot and wheel pixel region",async()=>{
 const selected=[["bubble-suit","walk"],["bubble-suit","scooter"],
                 ["raincoat-bean","walk"],["fluffy-bun","walk"],["fluffy-bun","skate"]];
 for(const [id,transport] of selected){
  const frames=[];
  for(let i=0;i<8;i++){
   const relative="riders/frames/"+id+"/"+transport+"/plain/"+String(i).padStart(2,"0")+".png";
   const bytes=await readFile(join(publicDir,relative));
   frames.push(PNG.sync.read(bytes).data);
  }
  const changed=frames.map((p,i)=>{
   const next=frames[(i+1)%frames.length];let difference=0;
   // Shoes, contact shadow and (for skate) foot-bound wheels are below the coat.
   for(let y=78;y<99;y++)for(let x=37;x<111;x++){
    const z=(y*128+x)*4;
    for(let c=0;c<4;c++)if(p[z+c]!==next[z+c]){difference++;break;}
   }
   return difference;
  });
  assert.ok(changed.every(n=>n>=70),id+"/"+transport+" has a frozen foot-frame transition: "+changed.join(","));
 }
});
