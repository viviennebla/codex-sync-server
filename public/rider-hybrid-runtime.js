// Choose the renderer by motion quality without sacrificing each mascot's art.
import {
  loadFrameCatalog,
  mountFrameRider as mountPng,
  disposeFrameRider as disposePng,
  resolveAppearance
} from "./rider-frame-runtime.js";
import {loadRiderCatalog,mountRiderSprite,disposeRiderSprite} from "./rider-runtime.js";

export {loadFrameCatalog};
export function preferredRiderRenderer(preset,transport){
  return preset==="helmet-commuter" && (transport==="bike"||transport==="walk") ? "rig" : "png";
}
const requested=new WeakMap();
let rigCatalogPromise;
let rigCatalog;
function rigCatalogLoad(){
  return rigCatalogPromise ||=loadRiderCatalog()
    .then(result=>(rigCatalog=result))
    .catch(error=>{rigCatalogPromise=undefined;throw error;});
}
function preserveCrown(node){
  const crown=node.querySelector(".leader-crown");
  if(crown && crown.parentElement!==node){
    node.append(crown);
    for(const name of ["left","top","right","transform"])crown.style.removeProperty(name);
  }
  return crown;
}
function configureRigAppearance(node,appearance,transport){
  const art=node.querySelector(".pixel-rider-art");
  if(!art)return;
  const pack=art.querySelector(".sprite-backpack");
  if(pack)pack.style.display=appearance.backpack?"":"none";
  for(const key of ["emoji","avatar"]){
    const className=key==="emoji"?"rig-visor-emoji":"rig-visor-avatar";
    const old=art.querySelector("."+className);
    const needed=appearance.head_mode==="avatar" &&
      (key==="avatar"?Boolean(appearance.head_image_url):!appearance.head_image_url);
    if(!needed){old?.remove();continue;}
    let face=old;
    if(!face){
      face=key==="avatar"?document.createElement("img"):document.createElement("span");
      face.className=className;
      if(key==="avatar"){face.alt="";face.draggable=false;}
      art.append(face);
    }
    face.style.top=transport==="bike"?"31%":"43%";
    if(key==="avatar"){
      if(face.getAttribute("src")!==appearance.head_image_url)face.src=appearance.head_image_url;
    }else face.textContent=appearance.head_emoji;
  }
  const crown=preserveCrown(node);
  if(crown){
    art.append(crown);
    crown.style.left="64%";
    crown.style.top="12%";
    crown.style.right="auto";
    crown.style.transform="translate(-50%,-80%) rotate(-12deg)";
  }
}
function showPng(node,transport,catalog,settings,identity,entry){
  if(entry.kind==="rig"){
    preserveCrown(node);
    disposeRiderSprite(node);
    entry.kind=null;
  }
  mountPng(node,transport,catalog,settings,identity);
  entry.kind="png";
}
function showRig(node,transport,appearance,entry){
  if(entry.kind==="png"){
    preserveCrown(node);
    disposePng(node);
    entry.kind=null;
  }
  mountRiderSprite(node,transport,rigCatalog);
  entry.kind="rig";
  configureRigAppearance(node,appearance,transport);
}
export function mountFrameRider(node,transport,catalog,settings,identity={}){
  const appearance=resolveAppearance(settings,catalog,identity);
  const mode=preferredRiderRenderer(appearance.preset,transport);
  let entry=requested.get(node);
  if(!entry){entry={revision:0,kind:null};requested.set(node,entry);}
  const revision=++entry.revision;
  if(mode==="png"){
    showPng(node,transport,catalog,settings,identity,entry);
    return;
  }
  if(rigCatalog){
    showRig(node,transport,appearance,entry);
    return;
  }
  showPng(node,transport,catalog,settings,identity,entry);
  void rigCatalogLoad().then(()=>{
    if(requested.get(node)===entry && entry.revision===revision && node.isConnected)
      showRig(node,transport,appearance,entry);
  }).catch(()=>{});
}
export function disposeFrameRider(node){
  requested.delete(node);
  preserveCrown(node);
  disposeRiderSprite(node);
  disposePng(node);
}
