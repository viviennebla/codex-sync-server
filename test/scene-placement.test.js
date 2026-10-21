import test from "node:test";
import assert from "node:assert/strict";
import {planRiderPlacement, canShiftRider} from "../public/scene-placement.js";

const layout = (width, ids=[1,3]) => ({
  mode: "halloween-two-road",
  lanes: ids.map((id) => ({id, rect: {left:0,top:id===1?400:600,width,height:90}})),
});
const riders = (n, lane=1) => Array.from({length:n}, (_,i)=>({
  user_id:"user-"+i,lane,x:26+i*11,
}));
test("desktop rider sizes do not stack 1.06-1.20 randomness with inner 1.13 zoom",()=>{
 const xs=planRiderPlacement(riders(3),layout(1440));
 assert.equal(xs.size,3);
 assert.ok([...xs.values()].every(v=>v.scale===0.9));
});
test("mobile three riders fit physically within a 375px lane",()=>{
 const width=375;
 const xs=planRiderPlacement(riders(3),layout(width));
 const values=[...xs.values()].sort((a,b)=>a.x-b.x);
 assert.ok(values.every(v=>v.scale>=0.54&&v.scale<0.72));
 assert.ok(values.every(v=>!v.crowded));
 for(let i=0;i<values.length;i++){
   const center=values[i].x*width/100;
   assert.ok(center-values[i].widthPx/2>=7);
   assert.ok(center+values[i].widthPx/2<=width-7);
   if(i) {
     const prev=values[i-1];
     assert.ok(center-prev.x*width/100 >= (prev.widthPx+values[i].widthPx)/2+5);
   }
 }
});
test("manual anchor has priority without permanently changing stored x",()=>{
 const people=[{user_id:"auto",x:50,lane:1},{user_id:"manual",x:50,lane:1,office_position:{lane:1,x:50}}];
 const out=planRiderPlacement(people,layout(700));
 assert.equal(out.get("manual").x,50);
 assert.notEqual(out.get("auto").x,50);
 assert.equal(people[0].x,50);
});
test("two road placement never creates a third lane and is stable across refresh",()=>{
 const rs=[...riders(3,1),...riders(3,3).map((r,i)=>({...r,user_id:"b-"+i}))];
 const first=planRiderPlacement(rs,layout(375));
 const second=planRiderPlacement([...rs].reverse(),layout(375));
 assert.deepEqual([...first.entries()].sort(),[...second.entries()].sort());
 assert.ok([...first.values()].every(v=>[1,3].includes(v.lane)));
});
test("invalid dimensions fail instead of producing invalid coordinates",()=>{
 assert.equal(planRiderPlacement(riders(2),{lanes:[{id:1,rect:{width:0}}]}),null);
 assert.equal(planRiderPlacement(null,layout(375)),null);
});

test("ambient drift stays inside existing road and cannot pass through a neighbor", () => {
  const lane={left:0,right:375};
  const actor={left:110,right:210};
  assert.equal(canShiftRider(actor,lane,10,[]),true);
  assert.equal(canShiftRider(actor,lane,-120,[]),false);
  assert.equal(canShiftRider(actor,lane,190,[]),false);
  assert.equal(canShiftRider(actor,lane,10,[{left:215,right:300}]),false);
  assert.equal(canShiftRider(actor,lane,0,[{left:230,right:300}]),true);
  assert.equal(canShiftRider(actor,lane,NaN,[]),false);
});
