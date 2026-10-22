import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("emoji mode preserves complete PNG helmet and only overlays the visor", async () => {
  const runtime = await read("public/rider-frame-runtime.js");
  const css = await read("public/rider-frame-runtime.css");
  const manifest = JSON.parse(await read("public/riders/frames/helmet-commuter/manifest.json"));
  assert.match(runtime, /e\.head\.hidden=false/);
  assert.doesNotMatch(runtime, /e\.head\.hidden=appearance\.head_mode===["']emoji["']/);
  assert.match(runtime, /e\.emoji\.hidden=appearance\.head_mode!=="emoji"/);
  assert.match(runtime, /if\(e\.head\.getAttribute\("src"\)!==head\)e\.head\.src=head/);
  assert.match(runtime, /calc\(-50% \+ \$\{offset\.y\}px\)/);
  assert.equal(manifest.emoji_head.font_size_px, 22);
  assert.equal(manifest.emoji_head.visor_width_px, 23);
  assert.equal(manifest.emoji_head.visor_height_px, 24);
  assert.ok(manifest.emoji_head.left_percent >= 60);
  assert.ok(manifest.emoji_head.top_percent >= 30);
  assert.match(css, /\.frame-head-emoji\s*\{[^}]*background:#1a1138/s);
  assert.match(css, /\.frame-rider-art\s+img/);
});

test("existing saved emoji preference and backpack selector are retained", async () => {
  const profile = await read("public/profile.html");
  const js = await read("public/profile.js");
  assert.match(profile, /Emoji 贴脸/);
  assert.doesNotMatch(profile, /Emoji 换头/);
  assert.match(profile, /id="riderBackpack"/);
  assert.match(js, /\/api\/me\/rider-appearance/);
  assert.match(js, /head_emoji/);
});

test("leader crown follows PNG helmet and tooltip opens only from the identity label", async () => {
  const runtime = await read("public/rider-frame-runtime.js");
  const style = await read("public/rider-identity.css");
  assert.match(runtime, /e\.node\.querySelector\("\.leader-crown"\)/);
  assert.match(runtime, /e\.art\.append\(crown\)/);
  assert.match(runtime, /crown\.style\.transform=.*offset\.x.*offset\.y/s);
  assert.match(style, /\.frame-rider-art > \.leader-crown/);
  assert.match(style, /\.name-chip:hover \.rider-title-tooltip/);
  assert.doesNotMatch(style, /\.rider\.is-clickable:hover \.rider-title-tooltip/);
});
