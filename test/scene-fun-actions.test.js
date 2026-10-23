import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../",import.meta.url);
const source = path=>readFile(new URL(path,root),"utf8");

test("overheat and flop are single Director actions with owned durations",async()=>{
 const app=await source("public/app.js");
 const motions=app.match(/const MOTION_ACTIONS = \{([\s\S]*?)^\};/m)?.[1]||"";
 assert.match(motions,/overheat: \{\s*className: "is-overheating",\s*duration: 2900,/);
 assert.match(motions,/flop: \{\s*className: "is-flopping",\s*duration: 3350,/);
 assert.match(app,/window\.setTimeout\(finish, action\.duration\)/);
 assert.match(app,/riderDragState\?\.riderId === rider\.user_id/);
 assert.match(app,/return MOTION_ACTIONS\.overheat/);
 assert.match(app,/return MOTION_ACTIONS\.flop/);
 assert.match(app,/MOTION_ACTIONS\[forcedMotion\]/);
});

test("action decoration attaches to rider-motion without altering PNG sprites",async()=>{
 const app=await source("public/app.js");
 const css=await source("public/scene-fun-actions.css");
 const frameRuntime=await source("public/rider-frame-runtime.js");
 assert.ok(app.includes('rider-motion'));
 assert.match(app, /'<div class="scene-fun-flames"/);
 assert.match(app,/'<span class="scene-flop-stars"/);
 assert.doesNotMatch(css,/@media \(min-width: 761px\)/);
 assert.match(css,/\.rider\.is-overheating \.frame-rider-art/);
 assert.match(css,/\.rider\.is-flopping \.frame-rider-art/);
 assert.match(css,/\.rider\.is-near-right\.is-flopping \.frame-rider-art/);
 assert.match(css,/@keyframes sceneFlopInward/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(frameRuntime,/mountFrameRider/);
});

test("action bubbles share existing overlay and public CSS route",async()=>{
 const app=await source("public/app.js");
 const overlay=await source("public/scene-bubble-runtime.js");
 const server=await source("src/server.js");
 const html=await source("public/index.html");
 assert.match(app,/\.rider\.is-overheating/);
 assert.match(app,/\.rider\.is-flopping/);
 assert.match(overlay,/"is-overheating","is-flopping"/);
 assert.match(html,/href="\/scene-fun-actions\.css"/);
 assert.match(server,/url\.pathname === "\/scene-fun-actions\.css"/);
});


test("flop keeps the sprite centered with bounded vertical travel",async()=>{
 const css=await source("public/scene-fun-actions.css");
 const rule=css.match(/\.rider\.is-flopping \.frame-rider-art \{([\s\S]*?)\n\}/)?.[1]||"";
 assert.match(rule,/transform-origin:\s*50% 50%/);
 assert.doesNotMatch(rule,/54% 82%\s*;/);
 for(const name of ["sceneFlop","sceneFlopInward"]){
  const start=css.indexOf("@keyframes "+name+" {");
  const end=css.indexOf("\n}",start);
  const body=start<0||end<0?null:css.slice(start,end);
  assert.ok(body,"missing "+name);
  const transforms=[...body.matchAll(/transform:\s*([^;]+);/g)].map(v=>v[1]);
  assert.equal(transforms.length,7,name+" should retain every staging phase");
  for(const transform of transforms){
   assert.ok(transform.startsWith("translate(-50%,-50%)"),name+" must keep the centered anchor");
   assert.doesNotMatch(transform,/translateX\(/);
   const y=Number(transform.match(/translateY\((-?[\d.]+)px\)/)?.[1]||0);
   assert.ok(Math.abs(y)<=12,name+" must not hop outside the lane vertically");
   const angle=Math.abs(Number(transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]||0));
   assert.ok(angle<=68,name+" must not pivot more than 68deg");
  }
 }
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.rider\.is-near-right\.is-flopping \.frame-rider-art \{transform:translate\(-50%,-50%\) translateY\(12px\) rotate\(-68deg\)/);
});
