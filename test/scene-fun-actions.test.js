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
 assert.match(app,/'<div class="rider-motion">' \+\s*'<div class="scene-fun-flames"/);
 assert.match(app,/'<span class="scene-flop-stars"/);
 assert.match(css,/@media \(min-width: 761px\)/);
 assert.match(css,/\.rider\.is-overheating \.frame-rider-art/);
 assert.match(css,/\.rider\.is-flopping \.frame-rider-art/);
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
