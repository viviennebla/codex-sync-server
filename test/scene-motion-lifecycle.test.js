import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Director owns the action duration, not short CSS keyframe animationend", async ()=>{
 const app=await readFile(new URL("../public/app.js", import.meta.url),"utf8");
 const start=app.indexOf("function triggerMotion(");
 const end=app.indexOf("function nearbyRiderPairs(",start);
 assert.ok(start>=0&&end>start);
 const source=app.slice(start,end);
 assert.match(source,/window\.setTimeout\(finish, action\.duration\)/);
 assert.doesNotMatch(source,/addEventListener\("animationend"/);
 assert.match(source,/activeMotion\.delete\(rider\.user_id\)/);
 assert.match(source,/if \(finished\) return;/);
});

test("single scene overlay is wired without changing stored comment timers",async()=>{
 const app=await readFile(new URL("../public/app.js", import.meta.url),"utf8");
 const css=await readFile(new URL("../public/halloween-theme.css", import.meta.url),"utf8");
 const runtime=await readFile(new URL("../public/scene-bubble-runtime.js", import.meta.url),"utf8");
 assert.match(app,/syncSceneBubbles\(hasOpenBubble, pinnedMessageRiderId\)/);
 assert.match(app,/COMMENT_BUBBLE_MS = 7000/);
 assert.match(app,/if \(options\.pinned\)/);
 assert.match(runtime,/planBubbles/);
 assert.match(runtime,/setInterval\(\(\)\s*=>/);
 assert.match(css,/\.scene-bubble-overlay/);
 assert.match(css,/pointer-events: none;/);
});
