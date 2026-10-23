import {readFile, lstat, realpath} from "node:fs/promises";
import {join, resolve, sep} from "node:path";
import {PNG} from "pngjs";
import {createHash} from "node:crypto";

const ROOT="/riders/frames/";
const IDS=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PNG_FILE=/^[a-z0-9][a-z0-9/_-]*\.png$/;
const TRANSPORTS=new Set(["bike","walk","scooter","skateboard","surf","skate"]);
const EMOTIONS=["neutral","happy","focused","tired"];
const fail=(message)=>{throw new Error("Rider asset rejected: "+message);};
const isObject=(v)=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);

async function checkInside(path, publicDir) {
 const entry=await lstat(path);
 if(!entry.isFile()||entry.isSymbolicLink()) fail("not a regular asset "+path);
 const actual=await realpath(path);
 const root=await realpath(publicDir);
 if(!actual.startsWith(root+sep))fail("asset escaped public root "+path);
 return entry;
}
async function readJSON(path, publicDir) {
  try {await checkInside(path,publicDir);return JSON.parse(await readFile(path,"utf8"));}
  catch(err){fail(path+": "+err.message);}
}
function checkEntry(path) {
  if(typeof path!=="string" || !PNG_FILE.test(path) || path.startsWith("/") ||
      path.split("/").some(part=>!part || part==="." || part==="..")) fail("invalid relative PNG path "+path);
  return path;
}
function validateLabel(value) {
  return typeof value==="string" && value.trim() && [...value].length<=36;
}
async function inspectPNG(file, options) {
  const entry=await checkInside(file,options.publicDir);
  if(!entry.isFile() || entry.isSymbolicLink() || entry.size>512*1024 || entry.size<80) fail("invalid asset "+file);
  if(!options.checkPng) return entry.size;
  const data=await readFile(file);
  if(data.length<33 || data.subarray(0,8).toString("hex")!=="89504e470d0a1a0a" ||
     data.readUInt32BE(16)!==128 || data.readUInt32BE(20)!==100 ||
     data[24]!==8 || data[25]!==6) fail("PNG must be 128x100 RGBA8: "+file);
  let png; try {png=PNG.sync.read(data,{checkCRC:true});}catch(err){fail("broken PNG "+file+": "+err.message);}
  if(png.width!==128 || png.height!==100 || png.depth!==8 || png.colorType!==6)
    fail("PNG must be 128x100 RGBA8: "+file);
  let transparent=false, visible=false;
  for(let i=0;i<png.data.length;i+=4){transparent ||=png.data[i+3]<255;visible ||=png.data[i+3]>0;}
  if(!transparent || !visible) fail("PNG must have visible art and transparent background: "+file);
  return entry.size;
}
/** Single reviewed repository manifest is the publish gate. All URLs are derived here. */
export async function loadRiderAssetRegistry(publicDir, options={}) {
  options={...options,publicDir};
  const root=await readJSON(join(publicDir,"riders/frames/manifest.json"),publicDir);
  if(root.schema_version!==2 || !isObject(root.presets)) fail("catalog schema 2 required");
  const entries=Object.entries(root.presets);
  if(!entries.length || entries.length>24) fail("catalog must contain 1..24 presets");
  if(!entries.some(([id])=>id===root.default_preset)) fail("unknown default preset");
  const allowedFiles=new Set([ROOT+"manifest.json"]);
  const presets={}, vehicles={};
  let totalFiles=0,totalBytes=0;
  const digest=createHash("sha256");
  const vehicleEntries=Object.entries(root.vehicles||{});
  if(vehicleEntries.length>24)fail("too many vehicle packs");
  for(const [id,path] of vehicleEntries){
    if(!IDS.test(id)||path!=="/riders/vehicles/"+id+"/manifest.json")fail("invalid vehicle registration "+id);
    const vehicle=await readJSON(join(publicDir,path.slice(1)),publicDir);
    if(vehicle.schema_version!==1||vehicle.id!==id||!validateLabel(vehicle.label)||
       !TRANSPORTS.has(vehicle.transport)||vehicle.canvas?.width!==128||vehicle.canvas?.height!==100)
      fail("invalid vehicle manifest "+id);
    if(!Number.isInteger(vehicle.frames)||vehicle.frames<1||vehicle.frames>24||
       !Number.isFinite(vehicle.fps)||vehicle.fps<1||vehicle.fps>24||
       !isObject(vehicle.layers)||!Array.isArray(vehicle.layers.back)||vehicle.layers.back.length!==vehicle.frames)
      fail("invalid vehicle frames "+id);
    const layers={};
    for(const part of ["back","front"]){
      if(!vehicle.layers[part]){layers[part]=[];continue;}
      if(!Array.isArray(vehicle.layers[part])||vehicle.layers[part].length!==vehicle.frames)
        fail("invalid vehicle layer "+id+"/"+part);
      layers[part]=[];
      for(const relative of vehicle.layers[part]){
        const name=checkEntry(relative), url="/riders/vehicles/"+id+"/"+name;
        if(!allowedFiles.has(url)){
          const file=join(publicDir,url.slice(1));
          totalBytes+=await inspectPNG(file,options);
          if(++totalFiles>800 || totalBytes>64*1024*1024) fail("catalog exceeds asset size/count limit");
          digest.update(url).update(await readFile(file));
          allowedFiles.add(url);
        }
        layers[part].push(url);
      }
    }
    // Optional coasting asset sequence: same registered PNG-only contract.
    // Keep existing one-state vehicle packs fully compatible.
    let glide=null;
    if(vehicle.glide!==undefined){
      const g=vehicle.glide;
      if(!isObject(g)||!Number.isInteger(g.frames)||g.frames<1||g.frames>24||
         !Number.isFinite(g.fps)||g.fps<1||g.fps>24||
         !isObject(g.layers)||!Array.isArray(g.layers.back)||g.layers.back.length!==g.frames)
        fail("invalid vehicle glide "+id);
      const alternate={};
      for(const part of ["back","front"]){
        const paths=g.layers[part]||[];
        if(!Array.isArray(paths)||(paths.length!==0&&paths.length!==g.frames))
          fail("invalid vehicle glide layer "+id+"/"+part);
        alternate[part]=[];
        for(const relative of paths){
          const name=checkEntry(relative),url="/riders/vehicles/"+id+"/"+name;
          if(!allowedFiles.has(url)){
            const file=join(publicDir,url.slice(1));
            totalBytes+=await inspectPNG(file,options);
            if(++totalFiles>800||totalBytes>64*1024*1024)fail("catalog exceeds asset size/count limit");
            digest.update(url).update(await readFile(file));allowedFiles.add(url);
          }
          alternate[part].push(url);
        }
      }
      glide={frames:g.frames,fps:g.fps,layers:alternate};
    }
    allowedFiles.add(path);
    vehicles[id]={id,label:vehicle.label,transport:vehicle.transport,frames:vehicle.frames,fps:vehicle.fps,layers,...(glide?{glide}:{})};
  }
  for(const [id, path] of entries){
    if(!IDS.test(id) || path!==ROOT+id+"/manifest.json") fail("invalid preset registration "+id);
    const preset=await readJSON(join(publicDir,path.slice(1)),publicDir);
    if(preset.schema_version!==1 || preset.id!==id || !validateLabel(preset.label)) fail("bad preset identity "+id);
    if(preset.canvas?.width!==128 || preset.canvas?.height!==100) fail("unsupported canvas "+id);
    if(!isObject(preset.heads) || !isObject(preset.transports)) fail("missing head/transport "+id);
    const modes=Object.entries(preset.transports);
    if(!modes.length || modes.length>6) fail("missing or excessive transport "+id);
    const fallback=preset.fallback_transport||"walk";
    if(!Object.hasOwn(preset.transports,fallback)) fail("fallback transport absent "+id);
    const base=ROOT+id+"/";
    const addAsset=async relative=>{
      const name=checkEntry(relative);
      const url=base+name;
      if(!allowedFiles.has(url)){
        totalFiles++;
        const file=join(publicDir,url.slice(1));
        totalBytes+=await inspectPNG(file,options);
        if(totalFiles>800 || totalBytes>64*1024*1024) fail("catalog exceeds asset size/count limit");
        digest.update(url).update(await readFile(file));
        allowedFiles.add(url);
      }
      return url;
    };
    const heads={};
    if(!preset.heads.neutral)fail("missing neutral head "+id);
    for(const emotion of EMOTIONS)
      heads[emotion]=await addAsset(preset.heads[emotion]||preset.heads.neutral);
    const transports={};
    for(const [mode,animation] of modes){
      if(!TRANSPORTS.has(mode)||!isObject(animation)) fail("unknown transport "+mode);
      if(!Number.isInteger(animation.frames)||animation.frames<1||animation.frames>24 ||
         !Number.isFinite(animation.fps)||animation.fps<1||animation.fps>24) fail("invalid frame timing "+id+"/"+mode);
      if(!isObject(animation.layers)||!Array.isArray(animation.layers.plain)||
          (animation.layers.pack&&!Array.isArray(animation.layers.pack)))
        fail("missing plain frames "+id+"/"+mode);
      const layers={};
      for(const variant of ["plain","pack"]){
        const paths=animation.layers[variant]||animation.layers.plain;
        if(paths.length!==animation.frames) fail("frame count mismatch "+id+"/"+mode+"/"+variant);
        layers[variant]=[];
        for(const path of paths) layers[variant].push(await addAsset(path));
      }
      let glide=null;
      if(animation.glide!==undefined){
        const g=animation.glide;
        if(!isObject(g)||!Number.isInteger(g.frames)||g.frames<1||g.frames>24||
           !Number.isFinite(g.fps)||g.fps<1||g.fps>24||
           !isObject(g.layers)||!Array.isArray(g.layers.plain)||
           (g.layers.pack!==undefined&&!Array.isArray(g.layers.pack)))
          fail("invalid rider glide "+id+"/"+mode);
        const alternate={};
        for(const variant of ["plain","pack"]){
          const paths=g.layers[variant]||g.layers.plain;
          if(paths.length!==g.frames)fail("invalid rider glide frames "+id+"/"+mode+"/"+variant);
          alternate[variant]=[];
          for(const path of paths)alternate[variant].push(await addAsset(path));
        }
        glide={frames:g.frames,fps:g.fps,layers:alternate};
      }
      const o=animation.head_offset||{x:0,y:0};
      if(!Number.isInteger(o.x)||!Number.isInteger(o.y)||Math.abs(o.x)>40||Math.abs(o.y)>40) fail("invalid head offset "+id+"/"+mode);
      const vehicleId=animation.vehicle_id||null;
      if(vehicleId&&(!vehicles[vehicleId]||vehicles[vehicleId].transport!==mode))
        fail("unregistered or incompatible vehicle "+id+"/"+mode);
      transports[mode]={frames:animation.frames,fps:animation.fps,layers,head_offset:o,vehicle_id:vehicleId,
        supports_backpack:Boolean(animation.layers.pack),...(glide?{glide}:{})};
    }
    allowedFiles.add(path);
    const emoji=preset.emoji_head||{left_percent:55,top_percent:16,font_size_px:39};
    if(!Number.isFinite(emoji.left_percent)||!Number.isFinite(emoji.top_percent)||
       !Number.isFinite(emoji.font_size_px)||emoji.left_percent<5||emoji.left_percent>95||
       emoji.top_percent<0||emoji.top_percent>95||emoji.font_size_px<12||emoji.font_size_px>80)
      fail("invalid emoji head placement "+id);
    presets[id]={id,label:preset.label,description:String(preset.description||"").slice(0,120),
      canvas:preset.canvas,heads,transports,fallback_transport:fallback,emoji_head:emoji};
  }
  return {catalog:{schema_version:2,default_preset:root.default_preset,presets,vehicles,asset_revision:digest.digest("hex").slice(0,16)},allowedFiles};
}
