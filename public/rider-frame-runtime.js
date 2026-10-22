// PNG-only character presenter. Business movement and interaction remain owned by app.js.
const URL="/riders/frames/manifest.json";
let catalogPromise;
const mounted=new Map();
let raf=0,last=0;
const loadJSON=async path=>{const r=await fetch(path);if(!r.ok)throw Error("Character asset "+r.status);return r.json();};
export function loadFrameCatalog(){return catalogPromise ||= loadJSON(URL).catch(e=>{catalogPromise=null;throw e;});}
export function frameState(transport){return transport==="bike"?"bike":"walk";}
export function frameNumber(ms,fps,count){return Math.floor(Math.max(0,ms)*fps/1000)%count;}
export function resolveAppearance(a={}) {
 return {preset:"helmet-commuter",head_mode:a.head_mode==="emoji"?"emoji":"art",
 head_variant:["auto","neutral","happy","focused","tired"].includes(a.head_variant)?a.head_variant:"auto",
 head_emoji:typeof a.head_emoji==="string"?a.head_emoji:"",backpack:a.backpack!==false};
}
function url(path){return /^\/riders\/frames\/[a-z0-9/-]+\.png$/.test(path)?path:null;}
function img(role){const im=document.createElement("img");im.className="frame-"+role;im.alt="";im.draggable=false;im.decoding="async";return im;}
function state(node){if(node.classList.contains("is-tired")||node.classList.contains("is-bonking"))return "tired";
 if(node.classList.contains("is-celebrating")||node.classList.contains("is-waving"))return "happy";
 if(node.classList.contains("is-fast")||node.classList.contains("is-sprinting"))return "focused";return "neutral";}
function draw(e,now){const mode=frameState(e.transport),data=e.catalog.transports[mode],appearance=e.appearance;
 const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const index=reduced?0:frameNumber(now-e.started,data.fps,data.frames);
 const frame=url(data.layers[appearance.backpack?"pack":"plain"][index]);
 if(frame&&e.body.getAttribute("src")!==frame)e.body.src=frame;
 const emotion=appearance.head_variant==="auto"?state(e.node):appearance.head_variant;
 const head=url(e.catalog.heads[emotion]||e.catalog.heads.neutral);
 e.head.style.transform=mode==="bike"?"translateY(-14px)":"";
 e.emoji.style.transform=mode==="bike"?"translate(-50%,-16px)":"translate(-50%,-2px)";
 e.head.hidden=appearance.head_mode==="emoji";
 e.emoji.hidden=appearance.head_mode!=="emoji";
 if(head&&!e.head.hidden&&e.head.getAttribute("src")!==head)e.head.src=head;
 if(!e.emoji.hidden)e.emoji.textContent=appearance.head_emoji||"🙂";
}
function tick(now){raf=0;if(document.hidden)return;if(now-last>=85){last=now;for(const [node,e] of mounted){if(!node.isConnected){mounted.delete(node);continue;}draw(e,now);}}if(mounted.size)start();}
function start(){if(!raf&&!document.hidden&&mounted.size)raf=requestAnimationFrame(tick);}
if(typeof document!=="undefined")document.addEventListener("visibilitychange",start);
export function mountFrameRider(node,transport,catalog,appearance) {
 const normalized=resolveAppearance(appearance);let e=mounted.get(node);
 if(e){if(e.transport!==transport){e.transport=transport;e.started=performance.now();}
 e.appearance=normalized;draw(e,performance.now());return;}
 const root=node.querySelector(".rider-motion");if(!root)return;
 const layer=document.createElement("div");layer.className="frame-rider-art";layer.setAttribute("aria-hidden","true");
 const body=img("body"),head=img("head"),emoji=document.createElement("span");emoji.className="frame-head-emoji";
 layer.append(body,head,emoji);root.append(layer);
 node.classList.add("has-frame-rider");
 e={node,transport,catalog,appearance:normalized,body,head,emoji,started:performance.now()};
 mounted.set(node,e);draw(e,performance.now());start();
}
export function disposeFrameRider(node){mounted.delete(node);node.querySelector(".frame-rider-art")?.remove();node.classList.remove("has-frame-rider");}
