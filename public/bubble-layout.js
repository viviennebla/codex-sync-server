// Global bubble placement. Head anchors, not rider DOM parents, determine
// visual positions. The planner is pure and can be tested without a browser.
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const collides = (a,b,pad=4) =>
  a.left < b.right + pad && a.right + pad > b.left &&
  a.top < b.bottom + pad && a.bottom + pad > b.top;

export function planBubbles(items, viewport, obstacles = [], padding = 8) {
  if (!Array.isArray(items) || !(viewport?.width > 0) || !(viewport.height > 0)) return [];
  const taken = obstacles.filter(Boolean);
  const output = [];
  const sorted = [...items].sort((a,b) =>
    (b.priority||0)-(a.priority||0) || String(a.id).localeCompare(String(b.id)));
  for (const bubble of sorted) {
    const width = Math.min(bubble.width||0, viewport.width - padding*2);
    const height = bubble.height||0;
    const {x,y}=bubble.anchor||{};
    if (!(width > 0 && height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) {
      output.push({id:bubble.id,visible:false});continue;
    }
    const candidates = [
      [x+12,y-height-20],
      [x-width-12,y-height-20],
      [x-width/2,y-height-26],
      [x+12,y+18],
      [x-width-12,y+18],
      [x-width/2,y+22],
      [x+18,y-height/2],
      [x-width-18,y-height/2],
    ];
    let chosen=null;
    for (const [xx,yy] of candidates) {
      const left=clamp(xx,padding,Math.max(padding,viewport.width-width-padding));
      const top=clamp(yy,padding,Math.max(padding,viewport.height-height-padding));
      const box={left,top,right:left+width,bottom:top+height};
      if(taken.every(other=>!collides(box,other))) {chosen=box;break}
    }
    if(!chosen){output.push({id:bubble.id,visible:false});continue;}
    taken.push(chosen);
    output.push({id:bubble.id,visible:true,left:chosen.left,top:chosen.top,width});
  }
  return output;
}
