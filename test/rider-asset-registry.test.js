import test from "node:test";
import assert from "node:assert/strict";
import {readFile, writeFile, cp, mkdir, mkdtemp, rm} from "node:fs/promises";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";
import {normalizeRiderAppearance} from "../src/denglema-state.js";

const local=join(dirname(fileURLToPath(import.meta.url)),"../public");
test("repository registry exposes approved default preset and only declared frame URLs",async()=>{
 const {catalog,allowedFiles}=await loadRiderAssetRegistry(local,{checkPng:true});
 assert.equal(catalog.schema_version,2);
 assert.match(catalog.asset_revision,/^[a-f0-9]{16}$/);
 assert.ok(catalog.presets[catalog.default_preset]);
 assert.ok(allowedFiles.has("/riders/frames/helmet-commuter/heads/neutral.png"));
 assert.ok(!allowedFiles.has("/riders/frames/helmet-commuter/heads/unlisted.png"));
 assert.ok(!allowedFiles.has("/riders/frames/helmet-commuter/../../private"));
});

test("agent can register a second PNG character with zero server/runtime edits",async()=>{
 const temp=await mkdtemp(join(tmpdir(),"rider-registry-"));
 const frames=join(temp,"riders/frames");
 try {
  await mkdir(frames,{recursive:true});
  const origin=join(local,"riders/frames/helmet-commuter");
  const copy=join(frames,"pixel-cat");
  await cp(origin,copy,{recursive:true});
  const manifest=JSON.parse(await readFile(join(copy,"manifest.json"),"utf8"));
  manifest.id="pixel-cat";manifest.label="像素猫猫";
  await writeFile(join(copy,"manifest.json"),JSON.stringify(manifest));
  const catalog={schema_version:2,default_preset:"helmet-commuter",presets:{
   "helmet-commuter":"/riders/frames/helmet-commuter/manifest.json",
   "pixel-cat":"/riders/frames/pixel-cat/manifest.json"
  }};
  await cp(origin,join(frames,"helmet-commuter"),{recursive:true});
  await writeFile(join(frames,"manifest.json"),JSON.stringify(catalog));
  const registry=await loadRiderAssetRegistry(temp,{checkPng:true});
  assert.equal(Object.keys(registry.catalog.presets).length,2);
  assert.equal(registry.catalog.presets["pixel-cat"].label,"像素猫猫");
  assert.ok(registry.allowedFiles.has("/riders/frames/pixel-cat/bike/pack/00.png"));
  assert.equal(normalizeRiderAppearance({preset:"pixel-cat",head_mode:"emoji",head_emoji:"🐱"},
    {allowedPresets:Object.keys(registry.catalog.presets)}).preset,"pixel-cat");
  assert.throws(()=>normalizeRiderAppearance({preset:"unreviewed"},
    {allowedPresets:Object.keys(registry.catalog.presets)}),/Unknown/);
  manifest.heads.neutral="../somewhere.png";
  await writeFile(join(copy,"manifest.json"),JSON.stringify(manifest));
  await assert.rejects(loadRiderAssetRegistry(temp),/invalid relative PNG path/);
 }finally{await rm(temp,{recursive:true,force:true});}
});
