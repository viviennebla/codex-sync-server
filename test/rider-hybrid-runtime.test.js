import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {preferredRiderRenderer} from "../public/rider-hybrid-runtime.js";

test("use the continuous modular rig where it improves the original helmet animation",()=>{
 assert.equal(preferredRiderRenderer("helmet-commuter","bike"),"rig");
 assert.equal(preferredRiderRenderer("helmet-commuter","walk"),"rig");
 for(const mode of ["scooter","skateboard","surf","skate"])
  assert.equal(preferredRiderRenderer("helmet-commuter",mode),"png");
 for(const rider of ["bubble-suit","raincoat-bean","fluffy-bun"])
  for(const mode of ["walk","bike","scooter","skate"])
   assert.equal(preferredRiderRenderer(rider,mode),"png");
});
test("homepage and existing preview share the same hybrid dispatch",async()=>{
 const [app,preview,server,index]=await Promise.all([
  readFile(new URL("../public/app.js",import.meta.url),"utf8"),
  readFile(new URL("../public/rider-preview.html",import.meta.url),"utf8"),
  readFile(new URL("../src/server.js",import.meta.url),"utf8"),
  readFile(new URL("../public/index.html",import.meta.url),"utf8")]);
 assert.match(app,/from "\.\/rider-hybrid-runtime\.js"/);
 assert.match(preview,/from "\/rider-hybrid-runtime\.js"/);
 assert.match(server,/rider-hybrid-runtime\.js/);
 assert.match(server,/rider-compare\.html/);
 assert.match(index,/rider-runtime\.css/);
 assert.match(preview,/rider-runtime\.css/);
});