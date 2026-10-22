import test from "node:test";
import assert from "node:assert/strict";
import {planBubbles} from "../public/bubble-layout.js";

function rect(p,h=32){return {left:p.left,top:p.top,right:p.left+p.width,bottom:p.top+h};}
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;

test("global bubbles avoid each other and viewport edges",()=>{
  const items=[
    {id:"a",width:130,height:36,anchor:{x:200,y:400},priority:200},
    {id:"b",width:130,height:36,anchor:{x:220,y:405},priority:200},
    {id:"c",width:130,height:36,anchor:{x:210,y:410},priority:100}
  ];
  const result=planBubbles(items,{width:375,height:800});
  const shown=result.filter(p=>p.visible).map(p=>rect(p,36));
  assert.ok(shown.length>=2);
  for(const r of shown){
    assert.ok(r.left>=8&&r.right<=367&&r.top>=8&&r.bottom<=792);
  }
  for(let i=0;i<shown.length;i++)for(let j=i+1;j<shown.length;j++)assert.equal(overlap(shown[i],shown[j]),false);
});

test("pinned comment goes first even if action bubble is enumerated first",()=>{
 const list=[
  {id:"action",width:160,height:40,anchor:{x:220,y:420},priority:100},
  {id:"pinned",width:160,height:40,anchor:{x:220,y:420},priority:300},
 ];
 const result=planBubbles(list,{width:375,height:800});
 assert.equal(result[0].id,"pinned");
 assert.equal(result[0].visible,true);
});

test("topbar and event rail are reserved without hiding available road bubbles",()=>{
 const blockers=[{left:0,top:0,right:375,bottom:85},
                 {left:8,top:95,right:212,bottom:380}];
 const list=[{id:"one",width:180,height:42,anchor:{x:160,y:495},priority:200}];
 const [p]=planBubbles(list,{width:375,height:812},blockers);
 assert.equal(p.visible,true);
 const b=rect(p,42);for(const other of blockers)assert.equal(overlap(b,other),false);
});
test("impossible candidate is hidden rather than masking an existing message",()=>{
 const list=[{id:"a",width:110,height:80,anchor:{x:50,y:50},priority:100}];
 const result=planBubbles(list,{width:110,height:90},[{left:0,top:0,right:110,bottom:90}]);
 assert.deepEqual(result,[{id:"a",visible:false}]);
});
