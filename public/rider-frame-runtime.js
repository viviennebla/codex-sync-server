// Reviewed PNG character packs only; no SVG/CSS fallback and no runtime joint rotations.
const CATALOG_URL="/api/rider-catalog";
let catalogPromise;
const mounted=new Map();
const imagePromises=new Map();
let raf=0,last=0;
export function loadFrameCatalog(){
 return catalogPromise ||=fetch(CATALOG_URL,{credentials:"same-origin"})
  .then(async r=>{if(!r.ok)throw Error("Rider catalog HTTP "+r.status);return r.json();})
  .then(c=>{if(c.schema_version!==2||!c.presets?.[c.default_preset])throw Error("Bad rider catalog");return c;})
  .catch(e=>{catalogPromise=null;throw e;});
}
export function frameState(transport,preset) {
 return preset ? (preset.transports?.[transport]?transport:preset.fallback_transport) : (transport==="bike"?"bike":"walk");
}
export function frameNumber(ms,fps,count){return Math.floor(Math.max(0,ms)*fps/1000)%count;}
// The only user-facing head choices are current avatar or original helmet.
// Legacy "emoji" and unset "auto" preferences stay readable; separate
// head_emoji is no longer used when displaying the rider.
export function resolveAppearance(value={},catalog,identity={}) {
 const a=value&&typeof value==="object"?value:{};
 const preset=typeof a.preset==="string"&&catalog?.presets?.[a.preset]?a.preset:(catalog?.default_preset||"helmet-commuter");
 const raw=typeof a.head_mode==="string"?a.head_mode:"auto";
 const avatar=typeof identity?.avatar_emoji==="string"?identity.avatar_emoji.trim():"";
 const image=typeof identity?.avatar_url==="string"&&/^\\/api\\/avatars\\/[^?#]+\\.jpg(?:\\?v=\\d+)?$/.test(identity.avatar_url)
   ? identity.avatar_url:null;
 const customized=Boolean(image||(avatar&&avatar!=="🚴"));
 const showAvatar=raw==="avatar"||raw==="emoji"||(!["art","avatar","emoji"].includes(raw)&&customized);
 return {
   preset,head_mode:showAvatar?"avatar":"art",
   head_variant:"auto",head_emoji:avatar||"🚴",head_image_url:showAvatar?image:null,
   backpack:a.backpack!==false
 };
}
function assetUrl(src,catalog){return src+"?v="+encodeURIComponent(catalog.asset_revision||"dev");}
function preload(src){
 if(!src||imagePromises.has(src)||typeof Image==="undefined")return;
 const img=new Image();img.decoding="async";img.src=src;
 imagePromises.set(src,img.decode?.().catch(()=>{})||Promise.resolve());
}
function preloadPreset(preset,transport,appearance,catalog) {
 const mode=frameState(transport,preset),animation=preset.transports[mode];
 for(const src of animation.layers[appearance.backpack?"pack":"plain"])preload(assetUrl(src,catalog));
 for(const src of Object.values(preset.heads))preload(assetUrl(src,catalog));
 const vehicle=evaluateVehicle(preset,mode,catalog);
 if(vehicle)for(const src of [...vehicle.layers.back,...vehicle.layers.front])preload(assetUrl(src,catalog));
}
function evaluateVehicle(preset,mode,catalog){
 const id=preset.transports[mode]?.vehicle_id;
 return id?(catalog?.vehicles?.[id]||null):null;
}
function img(role){const el=document.createElement("img");el.className="frame-"+role;el.alt="";el.draggable=false;el.decoding="async";return el;}
function emotionFor(node) {
 if(node.classList.contains("is-tired")||node.classList.contains("is-bonking"))return "tired";
 if(node.classList.contains("is-celebrating")||node.classList.contains("is-waving"))return "happy";
 if(node.classList.contains("is-fast")||node.classList.contains("is-sprinting"))return "focused";
 return "neutral";
}
function draw(e,now){
 const {preset,appearance}=e;
 const mode=frameState(e.transport,preset),animation=preset.transports[mode];
 if(!animation)return;
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const index=reduced?0:frameNumber(now-e.started,animation.fps,animation.frames);
 const source=assetUrl(animation.layers[appearance.backpack?"pack":"plain"][index],e.catalog);
 if(e.body.getAttribute("src")!==source)e.body.src=source;
 const vehicle=evaluateVehicle(preset,mode,e.catalog);
 for(const part of ["back","front"]){
   const el=part==="back"?e.vehicleBack:e.vehicleFront;
   const frames=vehicle?.layers?.[part];
   if(!frames?.length){el.hidden=true;continue;}
   const vehicleIndex=reduced?0:frameNumber(now-e.started,vehicle.fps,vehicle.frames);
   const image=assetUrl(frames[vehicleIndex],e.catalog);
   el.hidden=false;
   if(el.getAttribute("src")!==image)el.src=image;
 }
 const emotion=appearance.head_variant==="auto"?emotionFor(e.node):appearance.head_variant;
 const head=assetUrl(preset.heads[emotion]||preset.heads.neutral,e.catalog);
 const offset=animation.head_offset||{x:0,y:0};
 e.head.style.transform=`translate(${offset.x}px, ${offset.y}px)`;
 // A leader crown belongs to the animated PNG helmet, not the rider shell.
 // Reparent dynamically as ranks can change after the initial mount.
 const crown=e.node.querySelector(".leader-crown");
 if(crown){
   if(crown.parentElement!==e.art)e.art.append(crown);
   crown.style.transform=`translate(-50%,-78%) translate(${offset.x}px,${offset.y}px) rotate(-12deg)`;
 }
 // PNG head always remains visible: emoji only covers the visor expression.
 e.head.hidden=false;
 e.emoji.hidden=appearance.head_mode!=="avatar"||Boolean(appearance.head_image_url);
 e.faceAvatar.hidden=appearance.head_mode!=="avatar"||!appearance.head_image_url;
 if(!e.faceAvatar.hidden&&e.faceAvatar.getAttribute("src")!==appearance.head_image_url) e.faceAvatar.src=appearance.head_image_url;
 if(e.head.getAttribute("src")!==head)e.head.src=head;
 const layout=preset.emoji_head||{left_percent:65,top_percent:46,font_size_px:22,visor_width_px:23,visor_height_px:24};
 for(const face of [e.emoji,e.faceAvatar]){
   face.style.left=layout.left_percent+"%";
   face.style.top=layout.top_percent+"%";
   face.style.width=(layout.visor_width_px||layout.diameter_px||23)+"px";
   face.style.height=(layout.visor_height_px||layout.diameter_px||24)+"px";
   face.style.transform=`translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`;
 }
 e.emoji.style.fontSize=layout.font_size_px+"px";
 if(!e.emoji.hidden&&e.emoji.textContent!==appearance.head_emoji)e.emoji.textContent=appearance.head_emoji;
}
function tick(now){raf=0;if(document.hidden)return;
 if(now-last>=85){last=now;for(const [node,e] of mounted){
  if(!node.isConnected||!node.classList.contains("has-frame-rider")){mounted.delete(node);continue;}
  draw(e,now);
 }}
 if(mounted.size)start();
}
function start(){if(!raf&&!document.hidden&&mounted.size)raf=requestAnimationFrame(tick);}
if(typeof document!=="undefined")document.addEventListener("visibilitychange",start);
export function mountFrameRider(node,transport,catalog,settings,identity={}){
 const appearance=resolveAppearance(settings,catalog,identity);
 const preset=catalog.presets[appearance.preset];
 if(!preset)return;
 let e=mounted.get(node);
 if(e){
  if(e.transport!==transport||e.appearance.preset!==appearance.preset){e.started=performance.now();}
  const changed=e.transport!==transport||e.appearance.preset!==appearance.preset||e.appearance.backpack!==appearance.backpack;
  e.transport=transport;e.appearance=appearance;e.preset=preset;
  if(changed)preloadPreset(preset,transport,appearance,catalog);
  draw(e,performance.now());start();return;
 }
 const parent=node.querySelector(".rider-motion");if(!parent)return;
 const art=document.createElement("div");art.className="frame-rider-art";art.setAttribute("aria-hidden","true");
 const body=img("body"),head=img("head"),vehicleBack=img("vehicle-back"),vehicleFront=img("vehicle-front"),emoji=document.createElement("span");emoji.className="frame-head-emoji";
 const faceAvatar=img("face-avatar");
 vehicleBack.hidden=true;vehicleFront.hidden=true;faceAvatar.hidden=true;
 art.append(vehicleBack,body,vehicleFront,head,emoji,faceAvatar);parent.append(art);
 node.classList.add("has-frame-rider");
 e={node,transport,catalog,preset,appearance,art,body,head,vehicleBack,vehicleFront,emoji,faceAvatar,started:performance.now()};
 mounted.set(node,e);preloadPreset(preset,transport,appearance,catalog);draw(e,performance.now());start();
}
export function disposeFrameRider(node){
 mounted.delete(node);node.querySelector(".frame-rider-art")?.remove();node.classList.remove("has-frame-rider");
}
