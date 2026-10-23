import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";

// Local-only visual review; uses the SAME API/PNG allowlist and runtime as the product.
// No account/usage access, no login, no deploy, and no production DB is opened.
const publicDir=resolve(fileURLToPath(new URL("../public",import.meta.url)));
const {catalog,allowedFiles}=await loadRiderAssetRegistry(publicDir,{checkPng:true});
const port=Number(process.env.RIDER_PREVIEW_PORT||17881);
const host="127.0.0.1";
const types={".png":"image/png",".js":"text/javascript; charset=utf-8",
 ".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",
 ".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".webp":"image/webp"};
const staticFiles=new Set(["/rider-preview.html","/rider-frame-runtime.js","/rider-frame-runtime.css",
 "/rider-compare.html","/rider-runtime.js","/rider-runtime.css","/rider-hybrid-runtime.js",
 "/riders/manifest.json","/riders/rigs/compact-side-right-v1.json",
 "/riders/presets/helmet-commuter/manifest.json"]);
const approvedLegacyArt=/^\/riders\/presets\/helmet-commuter\/(?:head(?:-(?:happy|focused|tired))?|body|backpack|arm_(?:front|back)|leg_(?:front|back))\.webp$|^\/riders\/presets\/helmet-commuter\/(?:bike-(?:frame|wheel)|scooter|skateboard|surf|skate)\.svg$/;
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,"http://localhost").pathname;
  if(pathname==="/api/rider-catalog"){
   res.writeHead(200,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
   res.end(JSON.stringify(catalog));return;
  }
  const fileName=pathname==="/rider-preview"?"/rider-preview.html":pathname;
  if(!staticFiles.has(fileName)&&!allowedFiles.has(fileName)&&!approvedLegacyArt.test(fileName)){
   res.writeHead(404);res.end("Not in reviewed Rider Pack");return;
  }
  const file=resolve(publicDir,"."+fileName);
  if(!file.startsWith(publicDir+sep))throw Error("outside public root");
  const bytes=await readFile(file);
  res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream",
   "cache-control":"no-store"});
  res.end(bytes);
 }catch(error){res.writeHead(404);res.end("Not found");}
});
server.listen(port,host,()=>console.log(
 "蹬了吗 · Windows Rider Preview: http://"+host+":"+port+"/rider-preview"
));
