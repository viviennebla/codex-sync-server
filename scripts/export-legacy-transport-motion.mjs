#!/usr/bin/env node
// Authoring tool, not a runtime dependency. Export the reviewed PR #80 motion
// poses into transparent PNG Rider + Vehicle Packs for the PNG-only renderer.
// Requires optional Playwright and a local Chromium executable.
import {createServer} from "node:http";
import {readFile, writeFile, mkdir} from "node:fs/promises";
import {join, dirname, resolve, relative, extname} from "node:path";
import {fileURLToPath} from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"../public");
const repo=resolve(root,"..");
const transports={scooter:"city-scooter",skateboard:"street-skateboard",surf:"office-surfboard",skate:"roller-skates"};
const original=await readFile(join(root,"rider-runtime.js"),"utf8");
if(!original.includes("function startTicker() {")||!original.includes("function drawFrame(entry, now)"))
  throw Error("PR #80 legacy motion source changed; inspect before regenerating");
const runtime=original.replace("function startTicker() {","function startTicker() { if (window.__CAPTURE_NO_TICKER) return;")+`
export function captureLegacyFrame(node,mode,now,coasting) {
 const e=mounted.get(node);if(!e)throw Error("rider not mounted");
 node.classList.toggle("is-coasting",coasting);
 e.transport=mode;
 e.state=resolveSpriteState(mode,{coasting});
 e.stateStarted=0;e.mountUntil=0;
 e.lastWheelAt=Math.max(0,now-111);e.wheelAngle=(now*.43)%360;
 drawFrame(e,now);
}`;
const html=`<!doctype html><html><head><style>
html,body{margin:0;background:transparent}
.rider{width:128px;height:100px;position:relative}
.rider-motion{position:absolute;inset:0}
.pixel-rider-art{position:absolute;inset:0;width:128px;height:100px}
.pixel-rider-svg{display:block;width:128px;height:100px;overflow:visible}
.pixel-rider-svg image{image-rendering:pixelated}
</style></head><body><div class="rider" id="rider"><div class="rider-motion"></div></div>
<script type="module">
window.__CAPTURE_NO_TICKER=true;
window.motion=await import('/__authoring_motion.js');
window.catalog=await window.motion.loadRiderCatalog();
window.motion.mountRiderSprite(document.getElementById('rider'),'scooter',window.catalog);
window.ready=true;
</script></body></html>`;
const mime={".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",
".webp":"image/webp",".png":"image/png"};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://127.0.0.1");
  if(url.pathname==="/__authoring_motion.js"||url.pathname==="/__authoring.html"){
   res.writeHead(200,{"content-type":url.pathname.endsWith(".js")?mime[".js"]:mime[".html"]});
   res.end(url.pathname.endsWith(".js")?runtime:html);return;
  }
  const full=resolve(root,"."+decodeURIComponent(url.pathname));
  if(full!==root&&!relative(root,full).startsWith("..")){
   const data=await readFile(full);
   res.writeHead(200,{"content-type":mime[extname(full)]||"application/octet-stream"});
   res.end(data);return;
  }
  res.writeHead(403);res.end();
 }catch{res.writeHead(404);res.end();}
});
await new Promise(res=>server.listen(0,"127.0.0.1",res));
const port=server.address().port;
let browser;
try {
 const modulePath=process.env.PLAYWRIGHT_MODULE;
 const {chromium}=modulePath?await import(modulePath):await import("playwright");
 browser=await chromium.launch({headless:true,
   ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}) ,
   args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:256,height:150},deviceScaleFactor:1});
 await page.goto(`http://127.0.0.1:${port}/__authoring.html`,{waitUntil:"networkidle"});
 await page.waitForFunction(()=>window.ready===true);
 for(const [mode,vehicleId] of Object.entries(transports)){
  for(const [phase,frames,fps] of [["ride",6,9],["glide",2,4]]){
   for(let i=0;i<frames;i++){
    const now=Math.floor((i+.25)*1000/fps);
    await page.evaluate(({mode,now,phase})=>{
      window.motion.captureLegacyFrame(document.getElementById("rider"),mode,now,phase==="glide");
    },{mode,now,phase});
    for(const variant of ["plain","pack"]){
      await page.evaluate(variant=>{
       const svg=document.querySelector(".pixel-rider-svg");
       svg.querySelector("ellipse")?.setAttribute("display","none");
       svg.querySelector(".pixel-vehicle")?.setAttribute("display","none");
       svg.querySelector(".pixel-other-vehicles")?.setAttribute("display","none");
       svg.querySelector(".pixel-bike-brake")?.setAttribute("display","none");
       svg.querySelector(".sprite-head")?.setAttribute("display","none");
       svg.querySelector(".pixel-rider-core")?.setAttribute("display","");
       svg.querySelector(".sprite-backpack")?.setAttribute("display",variant==="pack"?"":"none");
      },variant);
      const file=join(root,"riders/frames/helmet-commuter",mode,
       ...(phase==="glide"?["glide"]:[]),variant,String(i).padStart(2,"0")+".png");
      await mkdir(dirname(file),{recursive:true});
      await page.locator(".pixel-rider-svg").screenshot({path:file,omitBackground:true,animations:"disabled"});
    }
    await page.evaluate(mode=>{
      const svg=document.querySelector(".pixel-rider-svg");
      svg.querySelector(".pixel-rider-core")?.setAttribute("display","none");
      svg.querySelector(".pixel-other-vehicles")?.setAttribute("display","");
      for(const el of svg.querySelectorAll(".pixel-other-vehicles > g"))
        el.setAttribute("display",el.classList.contains("pixel-vehicle-"+mode)?"":"none");
    },mode);
    const file=join(root,"riders/vehicles",vehicleId,
      ...(phase==="glide"?["glide"]:[]),"back",String(i).padStart(2,"0")+".png");
    await mkdir(dirname(file),{recursive:true});
    await page.locator(".pixel-rider-svg").screenshot({path:file,omitBackground:true,animations:"disabled"});
   }
  }
  process.stdout.write(mode+" completed\n");
 }
 console.log("Review the PNG diff, then run npm run riders:validate and npm test.");
} finally{
 if(browser)await browser.close();
 await new Promise(res=>server.close(res));
}
