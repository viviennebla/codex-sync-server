import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../public/halloween-theme.css", import.meta.url),"utf8");
const manifest = JSON.parse(await readFile(new URL("../public/themes/halloween/manifest.json",import.meta.url),"utf8"));
const declaration = (selector) => {
  const anchor=selector+" {";
  const start=css.indexOf(anchor);
  if(start<0)throw Error("Missing: "+selector);
  return css.slice(start+anchor.length,css.indexOf("}",start));
};

test("Halloween loads canonical four-art-layer scene with independent cats and bats",()=>{
  assert.deepEqual(manifest.layers.map(x=>x.id),["bats-static","cats-static","pumpkin-glow"]);
  assert.equal(manifest.layers[2].src,"/themes/halloween/art/glow-pumpkins.webp");
  assert.match(manifest.base.variants[0].src,/base-1920/);
  assert.equal(manifest.staticBats.enabled,true);
  assert.ok(manifest.layers.every(x=>x.sourceCanvas?.width===2048&&x.sourceCanvas?.height===768));
  assert.match(css,/\.season-bats-static,\s*body\.season-halloween \.season-cats-static\s*\{ opacity: 1; \}/);
  assert.deepEqual(manifest.artworkRegistration.canvas,manifest.sourceArt&&{width:manifest.sourceArt.width,height:manifest.sourceArt.height});
  assert.match(declaration("body.season-halloween .app-shell::before"),/filter:\s*none/);
  assert.match(declaration("body.season-halloween .season-glow-pumpkins"),/mix-blend-mode:\s*screen/);
  assert.match(css,/@keyframes halloweenPumpkinBreath[\s\S]*?from\s*\{\s*opacity:\s*\.10;\s*\}[\s\S]*?to\s*\{\s*opacity:\s*1;/);
  assert.doesNotMatch(css,/\.season-glow-lamps\s*\{/);
  assert.match(declaration("body.season-halloween .season-layer-host"),/pointer-events:\s*none\s*!important/);
});
test("Reduced motion retains a fixed glow and does not disable rider controls",()=>{
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/\.season-glow-pumpkins\s*\{\s*opacity:\s*\.55/);
  assert.doesNotMatch(declaration("body.season-halloween .race-stage"),/filter:/);
});
