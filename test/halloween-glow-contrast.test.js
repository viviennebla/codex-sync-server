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

test("Halloween renders only registered two-layer pumpkin composition",()=>{
  assert.equal(manifest.layers.length,1);
  assert.equal(manifest.layers[0].id,"pumpkin-glow");
  assert.match(manifest.base.variants[0].src,/base-dark-/);
  assert.deepEqual(manifest.artworkRegistration.canvas,manifest.sourceArt&&{width:manifest.sourceArt.width,height:manifest.sourceArt.height});
  assert.match(declaration("body.season-halloween .app-shell::before"),/filter:\s*none/);
  assert.match(declaration("body.season-halloween .season-glow-pumpkins"),/mix-blend-mode:\s*screen/);
  assert.match(css,/@keyframes halloweenPumpkinBreath[\s\S]*?from\s*\{\s*opacity:\s*\.06;\s*\}[\s\S]*?to\s*\{\s*opacity:\s*1;/);
  assert.doesNotMatch(css,/\.season-glow-lamps\s*\{/);
  assert.match(declaration("body.season-halloween .season-layer-host"),/pointer-events:\s*none\s*!important/);
});
test("Reduced motion retains a fixed glow and does not disable rider controls",()=>{
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/\.season-glow-pumpkins\s*\{\s*opacity:\s*\.55/);
  assert.doesNotMatch(declaration("body.season-halloween .race-stage"),/filter:/);
});
