import { planBubbles } from "./bubble-layout.js";

// One visual overlay for every message/action bubble. The original rider
// message nodes remain as data sources so pin/7s/ARIA lifecycle stays owned
// by app.js, while rendering avoids transformed rider containing blocks.
let overlay;
let trackingTimer;
let currentPinnedRider = null;
const actionClasses = [
  "is-waving","is-sipping","is-stretching","is-yawning","is-coasting",
  "is-sprinting","is-quota-rushing","is-wheelie","is-bonking","is-celebrating",
];

function ensureOverlay() {
  if (overlay?.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.className = "scene-bubble-overlay";
  document.body.append(overlay);
  return overlay;
}

function sceneItems() {
  const rows = [];
  for(const rider of document.querySelectorAll(".race-stage .rider[data-rider-id]")) {
    const id=rider.dataset.riderId;
    const r=rider.getBoundingClientRect();
    if(!r.width || !r.height) continue;
    // Keep anchors on the head/sprite, independent from wrapper x offsets.
    const avatar=rider.querySelector(".avatar-ring");
    const a=avatar?.getBoundingClientRect();
    const head=a?.width && a?.height ? a : r;
    const anchor={x:head.left+head.width*.56,y:head.top+Math.min(head.height*.35,28)};
    if (rider.classList.contains("has-message")) {
      const text=rider.querySelector(".rider-message-bubble")?.textContent?.trim();
      if(text)rows.push({
        id:id+":message",type:"message",text,anchor,
        priority:currentPinnedRider===id?300:200,
      });
    }
    if(actionClasses.some(name=>rider.classList.contains(name))) {
      const text=rider.querySelector(".effect-burst")?.textContent?.trim();
      if(text)rows.push({id:id+":action",type:"action",text,anchor,priority:100});
    }
  }
  return rows;
}

export function layoutSceneBubbles() {
  if (!overlay?.isConnected) return;
  if (document.hidden) return;
  const scene=sceneItems();
  const keep=new Set(scene.map(row=>row.id));
  for(const node of [...overlay.children])if(!keep.has(node.dataset.bubbleId))node.remove();
  if(!scene.length)return;
  const measured=scene.map(row=>{
    let node=[...overlay.children].find(el=>el.dataset.bubbleId===row.id);
    if(!node) {
      node=document.createElement("div");
      node.className="scene-bubble scene-bubble-"+row.type;
      node.dataset.bubbleId=row.id;
      if(row.type==="message"){node.setAttribute("role","status");node.setAttribute("aria-live","polite");}
      overlay.append(node);
    }
    if(node.textContent!==row.text)node.textContent=row.text;
    node.style.visibility="hidden";
    node.style.display="block";
    node.style.width="";
    const r=node.getBoundingClientRect();
    return {...row,node,width:r.width,height:r.height};
  });
  const obstacles=[];
  for(const selector of [".topbar","#eventRail"]) {
    const el=document.querySelector(selector);
    if(!el || el.classList.contains("hidden"))continue;
    const r=el.getBoundingClientRect();
    if(r.width && r.height)obstacles.push(r);
  }
  const result=planBubbles(measured, {width:window.innerWidth,height:window.innerHeight},obstacles);
  const byId=new Map(result.map(p=>[p.id,p]));
  for(const row of measured){
    const place=byId.get(row.id);
    row.node.style.display=place?.visible?"block":"none";
    if(!place?.visible)continue;
    row.node.style.width=place.width+"px";
    row.node.style.left=place.left+"px";
    row.node.style.top=place.top+"px";
    row.node.style.visibility="visible";
  }
}

export function syncSceneBubbles(enabled,pinnedRiderId) {
  if(!enabled){
    if(trackingTimer)clearInterval(trackingTimer);
    trackingTimer=null;
    overlay?.remove();overlay=null;
    return;
  }
  currentPinnedRider=pinnedRiderId;
  const host=ensureOverlay();
  void host;
  layoutSceneBubbles();
  if(!trackingTimer){
    // A single bounded tracker handles CSS left transitions, not one per
    // rider; no timers at all when nothing is displaying.
    trackingTimer=setInterval(()=>{
      if(document.hidden)return;
      if(!sceneItems().length) {
        clearInterval(trackingTimer);trackingTimer=null;
        overlay?.replaceChildren();
        return;
      }
      layoutSceneBubbles();
    },160);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (trackingTimer) clearInterval(trackingTimer);
      trackingTimer = null;
    } else if (overlay?.isConnected && overlay.children.length) {
      syncSceneBubbles(true, currentPinnedRider);
    }
  });
}
