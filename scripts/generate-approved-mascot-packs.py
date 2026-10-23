#!/usr/bin/env python3
"""Generate layered, hand-composed 128x100 RGBA rider frames inspired by the approved six-mascot concept.

The concept sheet is reference-only: no pixels or crops are copied from it.
Usage: python3 scripts/generate-approved-mascot-packs.py
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

S = 4
W, H = 128, 100
ROOT = Path(__file__).resolve().parents[1] / "public/riders/frames"
FRAMES = 6
ROLES = [
    ("bubble-suit", "泡泡套装客", "scooter", "#dfd9ff", "#a6ccff", "#ffbf5d"),
    ("capsule-hoodie", "胶囊连帽客", "skateboard", "#b4a2f5", "#7967dd", "#f9ba57"),
    ("raincoat-bean", "雨衣豆豆客", "walk", "#ffdc42", "#ffad44", "#e5f9ff"),
    ("mini-robot", "迷你机器人客", "surf", "#e3e5ff", "#86b9fd", "#61d8ff"),
    ("fluffy-bun", "软萌团子客", "skate", "#ffd5f6", "#eaa1ea", "#ffe8f6"),
]

class P:
    def __init__(self):
        self.im = Image.new("RGBA", (W * S, H * S))
        self.d = ImageDraw.Draw(self.im)
    def box(self, xy, c, r=0, outline=None, width=1):
        xy = tuple(round(v*S) for v in xy)
        self.d.rounded_rectangle(xy, radius=round(r*S), fill=c, outline=outline, width=round(width*S) if outline else 1)
    def ell(self, xy, c, outline=None, width=1):
        xy=tuple(round(v*S) for v in xy)
        self.d.ellipse(xy, fill=c, outline=outline, width=round(width*S) if outline else 1)
    def line(self, points, c, w=1, joint="curve"):
        self.d.line([(round(x*S),round(y*S)) for x,y in points],fill=c,width=round(w*S),joint=joint)
    def poly(self, points,c):
        self.d.polygon([(round(x*S),round(y*S)) for x,y in points],fill=c)
    def arc(self, box, start,end,c,w=1):
        self.d.arc(tuple(round(t*S) for t in box),start,end,fill=c,width=round(w*S))
    def save(self, path):
        path.parent.mkdir(parents=True,exist_ok=True)
        self.im.resize((W,H),Image.Resampling.LANCZOS).save(path,format="PNG")

def glint(p,x,y,k=1):
    p.ell((x-1*k,y-1*k,x+1*k,y+1*k),"#ffffffd9")
    p.line([(x-2*k,y),(x+2*k,y)],"#ffffff88",.65)
    p.line([(x,y-2*k),(x,y+2*k)],"#ffffff88",.65)

def eyes(p,role,emotion,x,y,scale=1):
    dark = "#21104d" if role!="raincoat-bean" else "#2b2347"
    if role in ("mini-robot","capsule-hoodie"):
        bright = "#70f9ff" if role=="mini-robot" else "#fff56f"
        if emotion=="tired":
            for dx in (-5,5): p.line([(x+dx-2,y),(x+dx+2,y+1)],bright,1.5)
        elif emotion=="happy":
            for dx in (-5,5): p.arc((x+dx-3,y-2,x+dx+3,y+4),195,345,bright,2.3)
        else:
            for dx in (-5,5): p.box((x+dx-1.6,y-3,x+dx+1.5,y+2),bright,1.25)
        if emotion in ("happy","neutral"):
            p.arc((x-4,y+4,x+5,y+10),14,165,bright,1.6)
    else:
        if emotion=="tired":
            for dx in (-5,5): p.line([(x+dx-2.5,y),(x+dx+2.5,y)],dark,1.5)
        elif emotion=="happy":
            for dx in (-5,5): p.arc((x+dx-3,y-2,x+dx+3,y+4),198,344,dark,1.9)
        else:
            for dx in (-5,5): p.ell((x+dx-1.3,y-2.8,x+dx+1.3,y+2.2),dark)
        if emotion=="happy":p.arc((x-4,y+3,x+5,y+10),12,168,"#8f338d",1.8)
        if emotion=="tired":p.ell((x+5,y+7,x+8,y+10),"#ac93dd")
        if role=="fluffy-bun":
            p.ell((x-15,y+3,x-9,y+7),"#fb9dd1a0")
            p.ell((x+9,y+3,x+15,y+7),"#fb9dd1a0")

def head(role, emotion):
    p=P()
    if role=="bubble-suit":
        # Enclosing transparent bubble, yellow cheek-face and little green sprout.
        p.ell((44,13,96,66),"#afdcffc2",outline="#8b75d6",width=2.3)
        p.ell((46,14,93,62),"#e3faff8a",outline="#ffffffed",width=2.5)
        p.ell((52,26,90,61),"#ffbf63",outline="#d99657",width=1.3)
        p.ell((54,28,85,58),"#ffda82")
        p.arc((48,19,81,45),185,272,"#ffffffff",2.6)
        p.ell((46,32,51,39),"#ffffffc9");p.ell((47,46,50,49),"#ffffffff")
        p.line([(71,15),(71,9)],"#5bbd78",2.2)
        p.ell((63,6,73,12),"#84da9b");p.ell((72,5,81,11),"#58c989")
        eyes(p,role,emotion,73,43)
    elif role=="capsule-hoodie":
        p.ell((47,16,98,65),"#7058c6",outline="#48347f",width=2)
        p.ell((45,13,95,61),"#c3b5ff",outline="#ffffff",width=2.1)
        p.ell((56,28,95,59),"#28104f",outline="#6b43aa",width=1.5)
        p.ell((53,19,81,24),"#f2dbff77")
        p.ell((65,12,77,20),"#ffd6fa",outline="#b46cd5",width=1)
        p.ell((68,9,75,16),"#ffa4a7")
        p.ell((46,40,52,48),"#ff99df",outline="#b67cc8",width=1)
        eyes(p,role,emotion,76,42)
    elif role=="raincoat-bean":
        p.poly([(45,37),(54,19),(68,12),(85,17),(98,34),(99,51),(88,65),(56,65),(45,55)],"#df9030")
        p.ell((44,17,98,64),"#ffca3c",outline="#ffef78",width=2)
        p.poly([(46,29),(59,16),(73,13),(85,21),(79,26),(57,34)],"#ffe970")
        p.ell((54,28,97,60),"#fcfbff",outline="#bdabcf",width=1.5)
        p.ell((59,31,94,58),"#fffdf9")
        p.ell((76,16,86,22),"#f8af43");p.ell((81,13,89,17),"#f4a942")
        p.box((43,36,50,46),"#f19a39",3)
        eyes(p,role,emotion,78,43)
    elif role=="mini-robot":
        p.line([(70,15),(70,7)],"#7b72b1",2.8)
        p.ell((65,3,76,13),"#ffbb4e",outline="#a56b91",width=1)
        p.ell((41,29,52,47),"#b5bdf4",outline="#777acb",width=2)
        p.ell((92,29,102,47),"#b5bdf4",outline="#777acb",width=2)
        p.box((45,16,99,65),"#dcddff",12,outline="#7569bd",width=2.1)
        p.box((50,20,96,62),"#f7edff",10,outline="#ffffff",width=1.5)
        p.box((55,27,91,55),"#170e40",7,outline="#6357b4",width=1.5)
        p.ell((58,30,65,33),"#ffffffa0")
        p.ell((43,34,48,41),"#81e6ff")
        eyes(p,role,emotion,75,41)
    elif role=="fluffy-bun":
        # Two full-length plush ears are part of the single stable head layer.
        for x,t in [(54,11),(79,7)]:
            p.ell((x-8,t,x+5,t+32),"#ffcafa",outline="#da8ad6",width=2)
            p.ell((x-3,t+5,x+1,t+23),"#ff9fcf")
        p.ell((40,27,100,71),"#df9ce4",outline="#a65bad",width=1.7)
        for x,y,r in [(43,39,10),(49,30,10),(59,25,10),(75,25,10),(91,33,10),(96,49,10),(49,60,9)]:
            p.ell((x-r/2,y-r/2,x+r/2,y+r/2),"#ffd4f9")
        p.ell((45,29,98,69),"#ffe2fb",outline="#f8f0ff",width=1.3)
        p.ell((53,33,93,64),"#ffeaf6")
        eyes(p,role,emotion,75,47)
        p.ell((72,56,77,59),"#f2a6c7")
    glint(p,49,25,.65)
    return p

def leg(p, x0,y0,x1,y1, shoe, swing):
    p.line([(x0,y0),(x1-2,y1-6),(x1,y1)],"#5f438b",5.2)
    p.line([(x0,y0),(x1-2,y1-6)],"#f8e4ff",3.5)
    p.ell((x1-7,y1-3,x1+5,y1+3),shoe,outline="#765aa3",width=1.1)
    p.ell((x1,y1-2,x1+4,y1),"#ffffffcd")

def draw_vehicle(p,mode,phase):
    wobble=math.sin(phase*math.tau/6)
    if mode=="scooter":
        p.line([(93,77),(98,47)],"#91eaff",3.5)
        p.line([(96,46),(105,46)],"#62509b",4.5)
        p.line([(93,77),(100,78)],"#e6fbff",2)
        p.box((38,85,110,91),"#61d6ec",3,outline="#4957a1",width=1.5)
        p.box((44,84,98,87),"#f4f6ff",1.5)
        for x in (50,100):
            p.ell((x-5,88,x+5,98),"#343154",outline="#958cef",width=1)
            p.ell((x-2,91,x+2,95),"#aeefff")
    elif mode=="skateboard":
        p.box((34,89,111,94),"#ed9b44",3,outline="#6a427c",width=1.5)
        p.box((41,88,105,90),"#ffe66e",2)
        for x in (48,97):
            p.ell((x-4,92,x+4,99),"#4b3d73")
            p.ell((x-1.5,94,x+1.5,97),"#99e5fb")
        p.line([(24,87),(17,88)],"#ffffffa8",1.5)
    elif mode=="surf":
        p.ell((26,86+2*wobble,116,96+2*wobble),"#6dd8d5",outline="#4b80bb",width=1)
        p.ell((34,87+2*wobble,105,91+2*wobble),"#faffff")
        for x in (17,25,112):
            p.arc((x-5,85,x+6,100),190,320,"#93f6ff",2)
        p.ell((14,92,24,95),"#c6fdff")
    elif mode=="skate":
        for x in (52,82):
            p.box((x-10,83,x+6,89),"#f9a6e2",3,outline="#9a5db4",width=1)
            for xx in (x-5,x+2):
                p.ell((xx-3,88,xx+3,94),"#9875c9",outline="#eee3ff",width=.8)
    if mode in ("skateboard","skate") and phase%2:
        glint(p,110,83,.7)

def body(role, mode, f, has_pack):
    p=P()
    phi=f*math.tau/FRAMES
    stride=math.sin(phi); bob=1.1*math.sin(phi*2)
    palette={r[0]:r[3:] for r in ROLES}
    suit,trim,face=palette[role]
    shoe = {"bubble-suit":"#fff6fe","capsule-hoodie":"#fbf2ff","raincoat-bean":"#ffb14c","mini-robot":"#eee9ff","fluffy-bun":"#ffb2e9"}[role]
    # Dim ground contact shadow, separate from the avatar's head.
    p.ell((33,91,106,97),"#30234f29")
    if mode not in ("walk",):
        draw_vehicle(p,mode,f)
    x=65
    y=63+bob
    if mode=="surf":y=60+bob
    if mode=="skateboard":y=64+bob
    if has_pack:
        rear={"bubble-suit":"#ec91d2","capsule-hoodie":"#ff9f60","raincoat-bean":"#399f9a","mini-robot":"#7ca7f3","fluffy-bun":"#f28fcb"}[role]
        p.ell((40,y-15,60,y+10),rear,outline="#77569d",width=1.3)
        p.ell((41,y-12,48,y-6),"#ffffff6a")
        p.box((40,y-9,45,y+3),"#ffd66c",2)
        p.box((48,y-13,52,y-2),"#6550aa",2)
    else:
        p.ell((42,y-12,50,y),"#ffffff78")
    # Animated legs are not rotated copies: knee/stride endpoints change.
    if mode=="walk":
        leg(p,57,y+4,54+9*stride,85+max(0,-stride)*2,shoe,stride)
        leg(p,73,y+5,78-9*stride,85+max(0,stride)*2,shoe,-stride)
    elif mode=="scooter":
        leg(p,58,y+2,69+2*stride,83,shoe,0)
        leg(p,73,y+3,81-4*stride,85,shoe,0)
    elif mode=="skateboard":
        leg(p,57,y+3,50+2*stride,86,shoe,0)
        leg(p,76,y+3,86-2*stride,86,shoe,0)
    elif mode=="surf":
        leg(p,58,y+1,51-2*stride,83,shoe,0)
        leg(p,77,y+2,86+2*stride,83,shoe,0)
    elif mode=="skate":
        leg(p,57,y+3,53+5*stride,83,shoe,0)
        leg(p,73,y+3,81-5*stride,83,shoe,0)
    # Main body silhouette: a colored suit with chest shine and visible sleeves.
    if role=="raincoat-bean":
        p.poly([(51,y-17),(73,y-19),(82,y-8),(88,y+12),(44,y+13),(48,y-5)],"#ffb333")
        p.ell((49,y-18,82,y+11),"#ffd84b",outline="#e79b37",width=1.5)
        p.poly([(45,y+7),(86,y+7),(90,y+14),(42,y+14)],"#ffbd37")
    elif role=="mini-robot":
        p.box((49,y-18,82,y+13),suit,9,outline="#8073bb",width=1.5)
        p.box((59,y-7,76,y+4),"#5eacd9",3)
        p.ell((65,y-5,71,y+1),"#85ffee")
    else:
        p.ell((47,y-18,84,y+13),suit,outline="#795ca8",width=1.3)
        p.ell((51,y-14,76,y+5),"#ffffff55")
        p.ell((57,y-9,68,y+2),trim)
        p.ell((60,y-7,64,y-3),"#ffffffc8")
        if role=="fluffy-bun":
            p.ell((48,y-12,55,y-4),"#fff0fd")
    # Rear arm with swing.
    ax=46-4*stride if mode=="walk" else 43
    p.line([(52,y-9),(ax,y+3)],"#765cb2",7.5)
    p.line([(52,y-9),(ax,y+3)],suit,5.4)
    p.ell((ax-4,y,ax+4,y+7),trim,outline="#f8ebff",width=1)
    # Front arm: handle grip for scooter, raised balance arm for surf.
    arm_to=(89,y-1-6*stride) if mode=="walk" else (91,y-10)
    if mode=="scooter": arm_to=(98,47)
    if mode=="surf":arm_to=(95,42+3*stride)
    if mode=="skateboard":arm_to=(96,54-2*stride)
    p.line([(77,y-9),arm_to],"#634a99",7.6)
    p.line([(77,y-9),arm_to],suit,5)
    p.ell((arm_to[0]-4,arm_to[1]-3.5,arm_to[0]+4,arm_to[1]+4),trim,outline="#fff0ff",width=1)
    # Costume-specific chest + cute effects.
    if role=="capsule-hoodie":
        p.line([(72,y-14),(70,y-3)],"#f59ace",1.6)
    if role=="bubble-suit":p.ell((80,y-6,83,y-3),"#fff8cf")
    if role=="raincoat-bean":
        p.poly([(53,y+9),(56,y+15),(60,y+9)],"#ffe77b")
        if f%2: p.ell((26,84,29,88),"#76ddf9")
    if role=="mini-robot":p.ell((80,y-9,84,y-5),"#7aeefa")
    if role=="fluffy-bun":p.ell((72,y+6,77,y+10),"#ffd5fa")
    if mode=="walk" and f in (1,4):
        p.ell((28,90,32,92),"#e2dbff9c")
    return p

def main():
    registry=json.loads((ROOT/"manifest.json").read_text())
    for role,label,feature,*_ in ROLES:
        dest=ROOT/role
        heads={}
        for emotion in ("neutral","happy","focused","tired"):
            rel="heads/"+emotion+".png"
            head(role,emotion).save(dest/rel)
            heads[emotion]=rel
        transports={}
        for mode in dict.fromkeys(["walk",feature]):
            layers={"plain":[],"pack":[]}
            for variant in ("plain","pack"):
                for f in range(FRAMES):
                    rel=f"{mode}/{variant}/{f:02d}.png"
                    body(role,mode,f,variant=="pack").save(dest/rel)
                    layers[variant].append(rel)
            transports[mode]={"frames":FRAMES,"fps":8 if mode=="walk" else 10,
                "head_offset":{"x":0,"y":0},"layers":layers}
        manifest={"schema_version":1,"id":role,"label":label,
            "description":"基于 2026-10-22 六角色审定原稿独立绘制的逐帧 PNG 角色。",
            "canvas":{"width":W,"height":H},"heads":heads,
            "emoji_head":{"left_percent":58,"top_percent":42,"font_size_px":22,
                          "visor_width_px":23,"visor_height_px":24},
            "fallback_transport":"walk","transports":transports}
        (dest/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n")
        registry["presets"][role]=f"/riders/frames/{role}/manifest.json"
        print(f"{label} {role}: {len(transports)} transports, 4 heads, {12*len(transports)} body frames")
    (ROOT/"manifest.json").write_text(json.dumps(registry,ensure_ascii=False,indent=2)+"\n")

if __name__=="__main__":
    main()
