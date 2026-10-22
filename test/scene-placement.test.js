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


test("five auto riders use both ends of the entire painted road", () => {
 const width = 1528; // actual screenshot width
 const rs = [
  {user_id:"a",lane:1,x:22},{user_id:"b",lane:1,x:36},
  {user_id:"c",lane:1,x:50},{user_id:"d",lane:1,x:64},
  {user_id:"e",lane:1,x:78},
 ];
 const spots = planRiderPlacement(rs, layout(width));
 const xs=[...spots.values()].sort((a,b)=>a.x-b.x);
 // 22%-78% confinement was the regression: both ends must now be usable.
 assert.ok(xs[0].x<10, "first rider should fit near the left road edge");
 assert.ok(xs.at(-1).x>90, "last rider should fit near the right road edge");
 assert.equal(xs.some(x=>x.crowded),false);
 for(let i=1;i<xs.length;i++){
   const between=(xs[i].x-xs[i-1].x)*width/100;
   assert.ok(between>=(xs[i].widthPx+xs[i-1].widthPx)/2+7);
 }
});

test("saved edge anchor keeps priority without writing back a new office position", () => {
 const manual={user_id:"manual",lane:1,x:94,office_position:{lane:1,x:94}};
 const auto={user_id:"auto",lane:1,x:70};
 const result=planRiderPlacement([auto,manual],layout(1528));
 assert.equal(result.get("manual").x,94);
 assert.ok(result.get("auto").x<90);
 assert.equal(manual.office_position.x,94);
});

test("too-narrow road does not fabricate a wider usable range", () => {
 const out=planRiderPlacement(riders(3),layout(375));
 for(const slot of out.values()){
  const center=slot.x*375/100;
  assert.ok(center-slot.widthPx/2>=9);
  assert.ok(center+slot.widthPx/2<=366);
 }
});
