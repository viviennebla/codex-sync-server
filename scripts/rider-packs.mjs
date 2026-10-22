#!/usr/bin/env node
// Local Agent workflow only: import an authored package, validate, then open a GitHub PR.
import {cp, lstat, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {dirname, resolve, join, basename} from "node:path";
import {fileURLToPath} from "node:url";
import {loadRiderAssetRegistry} from "../src/rider-assets.js";

const repository=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const publicDir=join(repository,"public");
const registryFile=join(publicDir,"riders/frames/manifest.json");
async function noSymlinks(directory){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    const info=await lstat(path);
    if(info.isSymbolicLink())throw Error("Symlink forbidden in rider pack: "+path);
    if(info.isDirectory())await noSymlinks(path);
    else if(!info.isFile())throw Error("Invalid rider pack file "+path);
  }
}
async function run(){
 const [, , action, input]=process.argv;
 if(action==="validate"){
  const {catalog,allowedFiles}=await loadRiderAssetRegistry(publicDir,{checkPng:true});
  console.log("Verified",Object.keys(catalog.presets).length,"riders,",Object.keys(catalog.vehicles).length,"vehicles /",allowedFiles.size,"allowed files");
  for(const preset of Object.values(catalog.presets)){
    console.log("-",preset.id,"("+preset.label+"):",Object.keys(preset.transports).join(", "));
  }
  return;
 }
 if(!["import","import-vehicle"].includes(action) || !input){
  throw Error("Usage: npm run riders:import -- /path/to/rider OR npm run vehicles:import -- /path/to/vehicle OR npm run riders:validate");
 }
 const source=resolve(input);
 await noSymlinks(source);
 const pack=JSON.parse(await readFile(join(source,"manifest.json"),"utf8"));
 const id=pack.id;
 if(typeof id!=="string"||!(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).test(id)) throw Error("Invalid pack id");
 const original=await readFile(registryFile,"utf8");
 const root=JSON.parse(original);
 if(root.presets[id]||root.vehicles?.[id])throw Error("Pack already registered; edit checked-in files and validate instead");
 const vehicle=action==="import-vehicle";
 const rootKey=vehicle?"vehicles":"presets";
 const subfolder=vehicle?"riders/vehicles":"riders/frames";
 const destination=join(publicDir,subfolder,id);
 const existing=await lstat(destination).catch(error=>{if(error.code==="ENOENT")return null;throw error;});
 if(existing)throw Error("Destination already exists: "+destination);
 try{
   await cp(source,destination,{recursive:true,errorOnExist:true,force:false});
   root[rootKey]||={};
   root[rootKey][id]="/"+subfolder+"/"+id+"/manifest.json";
   await writeFile(registryFile,JSON.stringify(root,null,2)+"\n");
   await loadRiderAssetRegistry(publicDir,{checkPng:true});
   console.log("Imported",vehicle?"vehicle":"rider",id,". Review git diff; commit files and open PR. No deployment performed.");
 }catch(error){
   await writeFile(registryFile,original);
   await rm(destination,{recursive:true,force:true});
   throw error;
 }
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
