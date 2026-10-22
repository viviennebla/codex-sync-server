import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWebUser, readDenglemaUser, normalizeRiderAppearance,
  updateWebUserEmoji, updateWebUserAvatar, updateWebUserRiderAppearance
} from "../src/denglema-state.js";
import { resolveAppearance } from "../public/rider-frame-runtime.js";

const catalog={default_preset:"helmet-commuter",presets:{"helmet-commuter":{}}};
const head=(appearance,user)=>resolveAppearance(appearance,catalog,user);
test("unset head selection follows customized emoji or uploaded avatar, not the default bicycle",()=>{
  assert.equal(head(null,{avatar_emoji:"🐱"}).head_mode,"avatar");
  assert.equal(head(null,{avatar_emoji:"🐱"}).head_emoji,"🐱");
  assert.equal(head(null,{avatar_emoji:"🚴"}).head_mode,"art");
  assert.equal(head({}, {avatar_emoji:"🍊"}).head_emoji,"🍊");
  const pic="/api/avatars/usr-example.jpg?v=234";
  assert.deepEqual(
    [head(null,{avatar_url:pic,avatar_emoji:"🐱"}).head_mode,head(null,{avatar_url:pic}).head_image_url],
    ["avatar",pic]
  );
  assert.equal(head(null,{avatar_url:"https://bad.example/picture",avatar_emoji:"🐱"}).head_image_url,null);
});
test("explicit original and avatar choices override inheritance and old emoji settings",()=>{
  assert.equal(head({head_mode:"art"},{avatar_emoji:"🐱"}).head_mode,"art");
  assert.equal(head({head_mode:"avatar"},{avatar_emoji:"🚴"}).head_mode,"avatar");
  assert.equal(head({head_mode:"emoji",head_emoji:"😎"},{avatar_emoji:"🐱"}).head_emoji,"🐱");
  assert.equal(head({head_mode:"auto"},{avatar_emoji:"🍊"}).head_mode,"avatar");
  assert.equal(normalizeRiderAppearance({head_mode:"avatar"}).head_mode,"avatar");
  assert.equal(normalizeRiderAppearance({head_mode:"emoji"}).head_mode,"emoji");
});
test("avatar edits update inherited face, but cannot override manually selected original",async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),"avatar-inherited-face-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const {user}=await createWebUser({display_name:"小骑手",avatar_emoji:"🍊"},dir);
  assert.equal(head(null,await readDenglemaUser(user.id,dir)).head_emoji,"🍊");
  await updateWebUserEmoji(user.id,"🐙",dir);
  assert.equal(head(null,await readDenglemaUser(user.id,dir)).head_emoji,"🐙");
  await updateWebUserRiderAppearance(user.id,{head_mode:"art",backpack:false},dir);
  await updateWebUserEmoji(user.id,"🦊",dir);
  const manual=await readDenglemaUser(user.id,dir);
  assert.equal(head(manual.rider_appearance,manual).head_mode,"art");
  assert.equal(head(manual.rider_appearance,manual).backpack,false);
  await updateWebUserRiderAppearance(user.id,{head_mode:"avatar"},dir);
  const picture="/api/avatars/"+user.id+".jpg?v=123";
  await updateWebUserAvatar(user.id,picture,dir);
  const withPhoto=await readDenglemaUser(user.id,dir);
  assert.equal(head(withPhoto.rider_appearance,withPhoto).head_image_url,picture);
});
test("profile is a two-card one-tap selector, without duplicate emoji editing controls",async()=>{
  const html=await readFile(new URL("../public/profile.html",import.meta.url),"utf8");
  const js=await readFile(new URL("../public/profile.js",import.meta.url),"utf8");
  const runtime=await readFile(new URL("../public/rider-frame-runtime.js",import.meta.url),"utf8");
  assert.match(html,/data-head-choice="avatar"/);
  assert.match(html,/data-head-choice="art"/);
  assert.doesNotMatch(html,/id="riderHeadEmoji"|id="riderHeadVariant"|id="riderSaveAppearance"/);
  assert.match(js,/riderHeadButtons\.forEach/);
  assert.match(js,/function saveAppearance/);
  assert.match(runtime,/faceAvatar/);
  assert.match(runtime,/e\.head\.hidden=false/);
});
