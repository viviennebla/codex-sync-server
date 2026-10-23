#!/usr/bin/env python3
"""Render the three SELECTED mascots as true transparent layered pixel art.

Source of truth: docs/designs/characters/abstract-mascots-approved-2026-10-22.png.
The approved sheet is used for color/design reference only; never cropped as
a production sprite atlas. Draw directly on the final 128x100 pixel grid.
No AI screenshot/mockup imagery is used as a production PNG.

Run (from repository root): python scripts/generate-approved-mascot-packs.py
"""
from __future__ import annotations
import json
import math
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "public" / "riders" / "frames"
SIZE = (128, 100)
FRAME_COUNT = 8
ROLES = (
    ("bubble-suit", "泡泡套装客", "scooter"),
    ("raincoat-bean", "雨衣豆豆客", "walk"),
    ("fluffy-bun", "软萌团子客", "skate"),
)
INK = "#292054"
SHADOW = "#59448e"


def image():
    return Image.new("RGBA", SIZE, (0, 0, 0, 0))


class Art:
    def __init__(self):
        self.im = image()
        self.d = ImageDraw.Draw(self.im, "RGBA")

    def _draw(self, method, *args, **kwargs):
        """Blend translucent glints INTO the existing color, never erase it."""
        colors=(kwargs.get("fill"), kwargs.get("outline"))
        alpha=any(isinstance(c,str) and len(c)==9 and c.startswith("#") and int(c[-2:],16)<255 for c in colors)
        if alpha:
            layer=image()
            getattr(ImageDraw.Draw(layer,"RGBA"), method)(*args,**kwargs)
            self.im.alpha_composite(layer)
            self.d=ImageDraw.Draw(self.im,"RGBA")
        else:
            getattr(self.d,method)(*args,**kwargs)

    def ellipse(self, b, fill, outline=None, w=1):
        self._draw("ellipse",tuple(round(q) for q in b),fill=fill,outline=outline,width=w)

    def rect(self, b, fill, radius=0, outline=None, w=1):
        b=tuple(round(q) for q in b)
        if radius:self._draw("rounded_rectangle",b,radius,fill=fill,outline=outline,width=w)
        else:self._draw("rectangle",b,fill=fill,outline=outline,width=w)

    def line(self, pts, color, w=1):
        self._draw("line",[(round(x),round(y)) for x,y in pts],fill=color,width=w,joint="curve")

    def polygon(self, pts, color):
        self._draw("polygon",[(round(x),round(y)) for x,y in pts],fill=color)

    def arc(self, b, start, end, fill, w=1):
        self._draw("arc",tuple(round(q) for q in b),start,end,fill=fill,width=w)

    def gradient(self, shape, bbox, stops, ellipse=True, outline=INK, width=1):
        mask=Image.new("L",SIZE,0)
        md=ImageDraw.Draw(mask)
        if ellipse: md.ellipse(bbox,fill=255)
        else: md.polygon(shape,fill=255)
        top, bottom=bbox[1],bbox[3]
        paint=image()
        pix=paint.load()
        def rgba(c):
            c=c.lstrip("#")
            return tuple(int(c[k:k+2],16) for k in (0,2,4))+(255,)
        keys=[(t,rgba(c)) for t,c in stops]
        mp=mask.load()
        x0,y0,x1,y1=map(int,bbox)
        for y in range(max(0,y0),min(SIZE[1],y1+1)):
            position=(y-top)/max(1,bottom-top)
            a,b=keys[0],keys[-1]
            for n in range(len(keys)-1):
                if keys[n][0]<=position<=keys[n+1][0]:
                    a,b=keys[n],keys[n+1];break
            t=max(0,min(1,(position-a[0])/max(1e-7,b[0]-a[0])))
            col=tuple(round(a[1][i]*(1-t)+b[1][i]*t) for i in range(4))
            for x in range(max(0,x0),min(SIZE[0],x1+1)):
                if mp[x,y]:pix[x,y]=col
        self.im.alpha_composite(paint)
        self.d=ImageDraw.Draw(self.im,"RGBA")
        if outline:
            if ellipse:self.d.ellipse(bbox,outline=outline,width=width)
            else:self.d.line(shape+[shape[0]],fill=outline,width=width)

    def sparkle(self,x,y,c="#fff7df",k=2):
        self.line([(x-k,y),(x+k,y)],c)
        self.line([(x,y-k),(x,y+k)],c)
        self.rect((x,y,x,y),"#ffffff")

    def save(self, path):
        path.parent.mkdir(parents=True,exist_ok=True)
        self.im.save(path,format="PNG")


def eye(a, x,y, emotion, tone=INK):
    if emotion == "happy":
        a.arc((x-3,y-2,x+3,y+4),194,344,tone,2)
    elif emotion == "tired":
        a.line([(x-3,y+1),(x+3,y+2)],tone,2)
    elif emotion == "focused":
        a.rect((x-1,y-3,x+1,y+3),tone,1)
        a.rect((x,y-3,x,y-1),"#ffffff")
    else:
        a.ellipse((x-2,y-3,x+2,y+4),tone)
        a.rect((x-1,y-2,x-1,y-1),"#ffffffbb")


def bubble_head(emotion):
    a=Art()
    # Bubble contour uses multiple hue bands and specular star-shaped highlights.
    a.ellipse((46,15,100,67),"#372d7e",outline="#2b225b",w=2)
    a.gradient(None,(47,14,99,64),[(0,"#d5fbff"),(.40,"#a0bfff"),(.75,"#717ad9"),(1,"#ddceff")],
               outline="#eee7ff",width=2)
    a.ellipse((51,18,96,61),"#6695ee69")
    a.ellipse((51,22,96,63),"#ffffff18")
    a.ellipse((57,20,96,58),"#a8e8f357")
    # Face is a distinct warm luminous occupant, partially occluded by visor.
    a.gradient(None,(60,27,95,61),[(0,"#ffeaaa"),(.39,"#ffd278"),(1,"#f1a450")],
               outline="#e7a665",width=1)
    a.ellipse((64,30,93,54),"#ffd9838c")
    a.polygon([(61,47),(67,51),(77,53),(83,57),(69,60),(59,54)],"#fff1f3")
    a.ellipse((65,49,78,57),"#fff9fd")
    a.ellipse((74,53,91,61),"#f3f5ff")
    a.rect((76,55,84,57),"#b9cdf4")
    for x in (82,90):eye(a,x,43,emotion,INK)
    if emotion=="happy":a.arc((82,45,95,54),13,160,"#ad558f",1)
    if emotion=="tired":a.rect((88,50,92,51),"#ce7794")
    # Circular dome rim and pale blue inset glass; glints are deliberate pixels.
    a.arc((47,15,99,64),181,341,"#fcf9ff",3)
    a.arc((49,17,97,62),190,287,"#f8ffff",2)
    a.arc((48,17,99,65),17,116,"#8adfff",2)
    a.ellipse((55,23,64,28),"#fffefa")
    a.ellipse((55,29,59,32),"#fafdff")
    a.ellipse((86,19,92,23),"#f2faff")
    a.rect((51,37,53,42),"#d6fcffb6")
    a.rect((97,37,98,46),"#f8ffffba")
    a.sparkle(56,19,"#fafbff",2)
    # Distinct sprout at the top.
    a.line([(74,16),(74,10),(72,7)],"#3b8e72",3)
    a.line([(74,14),(74,8)],"#baf68d")
    a.gradient(None,(63,3,75,10),[(0,"#d8f78a"),(1,"#52cfa1")],outline="#4a966f")
    a.gradient(None,(74,3,87,9),[(0,"#bcfc84"),(1,"#35b997")],outline="#4a966f")
    a.rect((69,4,72,4),"#fff3b2")
    return a


def rain_head(emotion):
    a=Art()
    # Angular bright raincoat shell with differentiated fabric planes.
    pts=[(50,34),(52,25),(66,15),(84,15),(100,27),(105,41),(103,60),(91,68),(58,63),(49,52)]
    a.gradient(pts,(48,14,105,68),[(0,"#fff080"),(.36,"#ffda35"),(.74,"#fbb12f"),(1,"#db812e")],
               ellipse=False,outline="#8a4a50",width=2)
    a.polygon([(49,37),(54,22),(67,15),(79,17),(65,32),(54,41)],"#ffe872")
    a.polygon([(75,15),(91,19),(100,28),(99,34),(82,23)],"#ffb331")
    a.line([(58,22),(72,16),(87,18)],"#fff9a6",2)
    a.line([(94,23),(101,34)],"#fff5a4",2)
    a.polygon([(53,26),(45,27),(39,39),(48,45),(56,38)],"#ffce3f")
    a.polygon([(46,27),(53,27),(48,36),(43,36)],"#ffe978")
    # Separate face within hood edge; white warm insert and navy eyes.
    a.ellipse((61,25,104,65),"#e19737",outline="#5a3651",w=1)
    a.gradient(None,(64,28,105,64),[(0,"#ffffff"),(.47,"#f8fbff"),(1,"#d3eafc")],
               outline="#ac74b0",width=2)
    a.arc((61,26,105,66),174,293,"#fff7a7",2)
    a.arc((66,29,104,64),295,70,"#ffefbd",1)
    for x in (83,94):eye(a,x,45,emotion,"#22255e")
    if emotion=="happy":a.arc((82,47,95,56),12,159,"#b768ae",1)
    if emotion=="tired":a.ellipse((91,55,95,58),"#abdaf4")
    # Sewn patches and side button
    a.rect((48,43,54,52),"#fd9f3b",3,outline="#e8882e")
    a.ellipse((50,47,52,49),"#fff78f")
    a.ellipse((95,17,99,21),"#ffe477")
    a.line([(86,17),(94,23)],"#fffeca")
    a.sparkle(61,23,"#fff4bc",2)
    return a


def bun_head(emotion):
    a=Art()
    # Rabbit ears: each outline and inner salmon inlay stays readable at 32px.
    a.ellipse((67,5,81,38),"#bb75bc",outline="#674b94",w=1)
    a.gradient(None,(68,5,80,34),[(0,"#ffffff"),(.58,"#ffdbf5"),(1,"#eda4e8")],outline="#f9f3ff")
    a.ellipse((72,12,77,29),"#ff91bb")
    a.ellipse((86,5,101,37),"#bf78be",outline="#674b94",w=1)
    a.gradient(None,(87,6,100,35),[(0,"#ffffff"),(.65,"#ffe3f8"),(1,"#ef9bd7")],outline="#fdf5ff")
    a.ellipse((91,13,96,29),"#ff8dae")
    # Wool is intentionally scalloped instead of one ellipse.
    base=[(57,35),(62,27),(72,24),(85,25),(99,29),(110,37),(114,50),(111,63),(102,70),
          (92,74),(76,74),(63,71),(52,62),(50,48)]
    a.gradient(base,(50,24,114,74),[(0,"#fffaff"),(.31,"#ffe8f7"),(.63,"#fbd1f2"),(1,"#d49cde")],
               ellipse=False,outline="#79549e",width=2)
    scallops=[(55,41,66,55),(54,32,69,45),(61,26,75,39),(73,22,86,35),
              (84,23,101,38),(99,29,112,44),(106,43,115,58),
              (102,56,112,68),(91,62,105,74),(75,65,90,76),(61,59,77,72),
              (51,52,65,65)]
    for bx in scallops:
        a.ellipse(bx,"#fff2fb",outline="#f2d2f8")
    # Shaded tufts at the bottom with pixel highlights.
    for cx,cy in ((57,53),(70,32),(95,31),(105,51),(94,67),(67,69)):
        a.ellipse((cx-3,cy-3,cx+3,cy+1),"#ffffffb9")
        a.rect((cx-1,cy-3,cx,cy-3),"#ffffff")
    # Visible rosy muzzle contrasting against snowy hair.
    a.gradient(None,(69,36,104,65),[(0,"#ffcde6"),(.48,"#ffbbda"),(1,"#fbaac9")],
               outline="#f9e1f4")
    a.ellipse((73,40,100,62),"#ffd5e8b1")
    for x in (80,94):eye(a,x,48,"happy" if emotion=="neutral" else emotion,"#42215f")
    a.ellipse((71,52,78,57),"#f98fbc")
    a.ellipse((98,52,104,57),"#f98fbc")
    if emotion=="happy": a.arc((82,50,92,59),10,168,"#82366d",2)
    elif emotion=="tired":a.rect((86,56,92,56),"#9d5b98")
    else:a.ellipse((86,55,89,57),"#d85b9b")
    a.sparkle(63,34,"#ffffff",2)
    return a


def shadow(a):
    # low-opacity ground shadow below feet, not a baked rectangle.
    a.ellipse((43,91,112,96),"#29204644")


def leg(a,x,y,knee,footx,fy,sock,shoe):
    a.line([(x,y),(knee,fy-7),(footx,fy)],"#534483",6)
    a.line([(x,y),(knee,fy-7)],sock,4)
    a.rect((knee-3,fy-9,knee+2,fy-5),sock,2,outline="#bfb1ff")
    a.ellipse((footx-7,fy-4,footx+6,fy+3),shoe,outline="#665493",w=2)
    a.line([(footx,fy-2),(footx+5,fy-2)],"#f7fdff",2)


def backpack(a,role):
    if role=="bubble-suit":
        a.ellipse((36,51,61,78),"#5e3b93",outline="#392957",w=2)
        a.gradient(None,(37,51,60,75),[(0,"#ffcfed"),(.45,"#f49ade"),(1,"#a965d1")],outline="#fef1ff")
        a.ellipse((36,56,46,72),"#e8bbff",outline="#ffffff")
        a.rect((39,58,43,63),"#fff3ff")
        a.ellipse((48,54,58,61),"#ffe3fe")
        a.line([(47,72),(57,77)],"#dc83c9",2)
    elif role=="raincoat-bean":
        a.ellipse((34,46,63,81),"#244f5e",outline="#273c5e",w=2)
        a.gradient(None,(36,47,61,78),[(0,"#8ee89f"),(.46,"#38b994"),(1,"#168c8b")],outline="#b6ffbd")
        a.rect((40,54,54,65),"#21867c",4,outline="#90e9ad")
        a.rect((46,55,49,58),"#effac9")
        a.line([(40,66),(54,70)],"#c4f5aa",2)
        a.rect((37,64,43,70),"#f5c663",2)
    else:
        a.ellipse((39,46,64,77),"#8f459f",outline="#533776",w=2)
        a.gradient(None,(40,45,63,74),[(0,"#ffddf3"),(.40,"#f875cd"),(1,"#c04cbd")],outline="#ffb8fc")
        a.rect((42,52,52,62),"#ff92d6",4,outline="#ffe4f7")
        a.ellipse((45,54,48,57),"#ffffff")
        a.rect((48,63,58,68),"#ffbcdf",3)


def footwear(a,role,mode,frame):
    s=math.sin(frame*math.tau/FRAME_COUNT)
    if mode=="walk":
        leg(a,66,75,56-5*s,52-10*s,88,"#fbf6ff","#b5e7ff" if role=="raincoat-bean" else "#f5d9ff")
        leg(a,83,77,84+4*s,89+10*s,89,"#ffffff","#9dd8fa" if role=="raincoat-bean" else "#f4d6ff")
    elif mode=="scooter":
        leg(a,66,75,63,63-2*s,86,"#edf1ff","#c4b5ff")
        leg(a,84,76,89,91+5*s,85,"#fff5ff","#ebdefd")
    elif mode=="skate":
        leg(a,66,77,59,57+7*s,85,"#ffdef6","#ff9aba")
        leg(a,83,77,90,92-7*s,84,"#ffe9fc","#ff9aba")


def vehicle(a,mode,frame):
    s=math.sin(frame*math.tau/FRAME_COUNT)
    if mode=="scooter":
        # Wheels, deck, steering post, aqua kick-scooter with specular pixels.
        for x in (52,103):
            a.ellipse((x-6,86,x+6,98),"#372858",outline="#b8a5ff",w=1)
            a.ellipse((x-3,89,x+3,95),"#70def6")
            a.rect((x,91,x+1,92),"#ffffff")
        a.rect((50,85,104,89),"#2673a1",3,outline="#222761",w=1)
        a.line([(57,86),(96,86)],"#affdff",2)
        a.line([(98,87),(100,52)],"#25779d",4)
        a.line([(99,86),(101,52)],"#8ef4fc",2)
        a.line([(95,50),(108,50)],"#3b2d5f",3)
        a.line([(103,49),(108,49)],"#d7fcff")
        if frame%2:a.sparkle(46,87,"#c9e9ff",1)
    if mode=="skate":
        for x in (62,93):
            a.rect((x-10,84,x+5,88),"#6f458c",2,outline="#f8b7e9")
            a.rect((x-8,82,x+5,85),"#ffc2eb",2,outline="#f8eaff")
            for dx in (-5,2):
                a.ellipse((x+dx-3,89,x+dx+3,96),"#6551a4",outline="#ffd1f0")
                a.ellipse((x+dx-1,91,x+dx+1,94),"#ffd65d")
        a.line([(42,91),(36,92)],"#f6c7ff")


def clothing(a,role):
    if role=="bubble-suit":
        a.gradient(None,(56,55,89,82),[(0,"#fffbff"),(.54,"#d3d7ff"),(1,"#9189d5")],
                   outline="#4b407f",width=2)
        a.ellipse((59,58,77,71),"#faf6ff")
        a.polygon([(76,62),(86,60),(88,70),(78,76),(73,69)],"#adacf3")
        a.rect((65,71,84,75),"#6550a1",3)
        a.rect((66,72,80,73),"#b0e7ee")
        a.rect((76,68,81,72),"#ffdc82",2,outline="#d99298")
        a.line([(69,61),(72,67)],"#ffffff",2)
        a.rect((59,64,61,69),"#93a8ee")
    elif role=="raincoat-bean":
        poly=[(59,55),(83,55),(91,65),(94,83),(52,83),(57,66)]
        a.gradient(poly,(52,55,94,83),[(0,"#ffe873"),(.50,"#ffc532"),(1,"#ed852f")],
                   ellipse=False,outline="#975258",width=2)
        a.polygon([(57,57),(69,56),(64,78),(54,81)],"#ffde58")
        a.polygon([(84,61),(91,66),(95,82),(84,79)],"#d99231")
        a.line([(77,60),(76,80)],"#d47b41",2)
        a.line([(80,61),(80,79)],"#fff09b")
        a.rect((75,73,84,76),"#6c648e",2)
        a.rect((77,72,81,76),"#fff4cf",1)
        a.line([(56,80),(92,81)],"#ffd054",2)
        a.line([(67,62),(69,74)],"#fff3aa")
    else:
        # Large, fluffy round coat (the main distinguishing silhouette).
        a.ellipse((53,53,93,86),"#9760ae",outline="#65448c",w=2)
        a.gradient(None,(52,54,92,84),[(0,"#fff4ff"),(.44,"#ffe7f9"),(1,"#dca2e3")],
                   outline="#fdf5ff",width=1)
        for x,y,r in [(55,64,8),(64,55,9),(75,56,9),(90,65,9),(86,80,8),(68,84,8),(55,78,7)]:
            a.ellipse((x-r/2,y-r/2,x+r/2,y+r/2),"#fff5fb",outline="#e7b9e8")
        a.ellipse((64,64,84,78),"#fffbff")
        a.ellipse((68,67,82,78),"#fce7f8")
        a.rect((80,76,83,79),"#d18abc",1)


def gloves(a,role,frame,mode):
    s=math.sin(frame*math.tau/FRAME_COUNT)
    sleeve = {"bubble-suit":"#d3cbff","raincoat-bean":"#ffc02e","fluffy-bun":"#ffe2f8"}[role]
    cuff = {"bubble-suit":"#fff8ff","raincoat-bean":"#fff6ef","fluffy-bun":"#fffdfd"}[role]
    # Rear mittens swing, front reaches scooter handle on scooter.
    a.line([(61,65),(52-4*s,75-3*s)],"#59488d",8)
    a.line([(61,65),(52-4*s,75-3*s)],sleeve,5)
    a.ellipse((48-4*s,71-3*s,57-4*s,81-3*s),cuff,outline="#8671b7",w=1)
    a.rect((49-4*s,71-3*s,53-4*s,72-3*s),"#ffffff")
    tx,ty=((100,49) if mode=="scooter" else (96+2*s,70+3*s))
    a.line([(85,63),(tx-5,ty)],"#66518f",8)
    a.line([(85,63),(tx-5,ty)],sleeve,5)
    a.ellipse((tx-8,ty-3,tx,ty+5),cuff,outline="#8c69af",w=1)
    a.rect((tx-6,ty-2,tx-4,ty-1),"#ffffff")


def body(role,mode,frame,pack):
    a=Art()
    shadow(a)
    if mode in ("scooter","skate"): vehicle(a,mode,frame)
    footwear(a,role,mode,frame)
    if pack:backpack(a,role)
    clothing(a,role)
    gloves(a,role,frame,mode)
    # Stylish motion accents, but transparent and small.
    if frame in (1,5):
        a.rect((37,88,39,89),"#d9e8ffcc")
        a.rect((32,91,34,91),"#bcd5ffb2")
    if role=="raincoat-bean" and frame%2==0:
        a.rect((40,86,42,90),"#9feafa")
        a.rect((34,82,35,85),"#bfefff")
    if role=="fluffy-bun" and frame%3==0:
        a.sparkle(42,73,"#ffbde9",1)
    return a


def render():
    root_manifest=json.loads((ROOT/"manifest.json").read_text("utf8"))
    root_manifest["presets"]={
        key:url for key,url in root_manifest["presets"].items()
        if key=="helmet-commuter" or key in {r[0] for r in ROLES}
    }
    for old in ("capsule-hoodie","mini-robot"):
        obsolete=ROOT/old
        if obsolete.is_dir():shutil.rmtree(obsolete)
    for name,label,feature in ROLES:
        root=ROOT/name
        heads={}
        for emotion in ("neutral","happy","focused","tired"):
            rel=f"heads/{emotion}.png"
            head={"bubble-suit":bubble_head,"raincoat-bean":rain_head,"fluffy-bun":bun_head}[name](emotion)
            head.save(root/rel)
            heads[emotion]=rel
        modes={}
        for mode in dict.fromkeys(("walk",feature)):
            layers={}
            for variant in ("plain","pack"):
                files=[]
                for frame in range(FRAME_COUNT):
                    rel=f"{mode}/{variant}/{frame:02}.png"
                    body(name,mode,frame,variant=="pack").save(root/rel)
                    files.append(rel)
                layers[variant]=files
            modes[mode]={"fps":10 if mode!="walk" else 8, "frames":FRAME_COUNT,
                         "head_offset":{"x":0,"y":0},"layers":layers}
        manifest={
            "schema_version":1,"id":name,"label":label,
            "description":"2026-10-22 审定稿：精细像素人物，逐帧绘制，透明分层。",
            "canvas":{"width":128,"height":100},
            "heads":heads,
            "emoji_head":{"left_percent":68,"top_percent":45,"font_size_px":18,
                          "visor_width_px":22,"visor_height_px":24},
            "fallback_transport":"walk","transports":modes
        }
        (root/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n","utf8")
        print(label, len(modes), "modes", 4, "heads", FRAME_COUNT, "frames/mode")
    (ROOT/"manifest.json").write_text(json.dumps(root_manifest,ensure_ascii=False,indent=2)+"\n","utf8")

if __name__=="__main__":
    render()
