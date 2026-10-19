import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { pickArtwork, validThemeAsset, loadThemeManifest } from "../public/theme-runtime.js";

const localManifest = async (url) => {
  const filename = new URL("../public" + url, import.meta.url);
  const content = await readFile(filename, "utf8");
  return { ok: true, json: async () => JSON.parse(content) };
};

test("halloween art selection is device-pixel-ratio aware", async () => {
  const cfg = await loadThemeManifest("halloween", localManifest);
  assert.equal(pickArtwork(cfg.base.variants, 1440, 1), "/themes/halloween/art/base-1920.webp");
  assert.equal(pickArtwork(cfg.base.variants, 1440, 2), "/themes/halloween/art/base-3840.webp");
  assert.equal(pickArtwork(cfg.base.variants, 2560, 1), "/themes/halloween/art/base-2560.webp");
  assert.equal(pickArtwork(cfg.base.variants, 5000, 1), "/themes/halloween/art/base-3840.webp");
});

test("halloween theme assets are all present, with aligned master geometry", async () => {
  const cfg = await loadThemeManifest("halloween",localManifest);
  assert.deepEqual(cfg.designCanvas,{width:3840,height:1440});
  assert.equal(cfg.base.variants.length,3);
  assert.deepEqual(cfg.layers.map(x=>x.id),["bats-static","cats-static","pumpkin-glow"]);
  assert.equal(cfg.layers[2].src,"/themes/halloween/art/glow-pumpkins.webp");
  assert.deepEqual(cfg.artworkRegistration.canvas,{width:2048,height:768});
  assert.deepEqual(cfg.artworkRegistration.renderOrder,["base","bats-static","cats-static","pumpkin-glow","riders"]);
  assert.ok(cfg.flyovers.every(x=>x.src.endsWith(".webp")));
  assert.equal(cfg.sourceArt.width,2048);
  assert.equal(cfg.sourceArt.height,768);
  for(const width of [1920,2560,3840]) assert.equal(Math.round(width*3/8)*8,width*3);
  const files=[...cfg.base.variants.map(x=>x.src),...cfg.layers.map(x=>x.src),...cfg.flyovers.map(x=>x.src)];
  for(const src of files){
    assert.equal(validThemeAsset(src,"halloween"),true,src);
    const file=new URL("../public"+src,import.meta.url);
    assert.ok((await stat(file)).size>200,src);
  }
});

test("untrusted paths cannot escape theme root",() => {
  assert.equal(validThemeAsset("/themes/halloween/manifest.json","halloween"),false);
  assert.equal(validThemeAsset("/themes/halloween/art/../../private.json","halloween"),false);
  assert.equal(validThemeAsset("/themes/christmas/art/base.webp","halloween"),false);
  assert.equal(validThemeAsset("/themes/halloween/art/base-3840.webp","halloween"),true);
});

test("theme assets cannot break rider interactions",async()=>{
  const css=await readFile(new URL("../public/halloween-theme.css",import.meta.url),"utf8");
  assert.match(css,/\.season-layer-host[\s\S]*?pointer-events:\s*none/);
  assert.match(css,/\.season-bat-flyover[\s\S]*?pointer-events:\s*none/);
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  const app=await readFile(new URL("../public/app.js",import.meta.url),"utf8");
  assert.match(app,/stage\.setPointerCapture\(pointerId\)/);
  assert.match(app,/mountThemeLayers\("halloween"\)/);
});
