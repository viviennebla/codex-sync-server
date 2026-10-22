from PIL import Image
import json,math,io
from pathlib import Path
import cairosvg
ROOT=Path(__file__).resolve().parents[1]
preset=ROOT/'public/riders/presets/helmet-commuter'
out=ROOT/'public/riders/frames/helmet-commuter'
rig=json.loads((ROOT/'public/riders/rigs/compact-side-right-v1.json').read_text())
out.mkdir(parents=True,exist_ok=True)
W,H=128,100
def src(n):
    return Image.open(preset/(n+'.webp')).convert('RGBA')
parts={n:src(n) for n in ['head','body','backpack','arm_back','arm_front','leg_back','leg_front']}
def place(canvas,n,dx=0,dy=0,angle=0):
    g=rig['slots'].get(n) or rig['limbs'].get(n)
    w,h=g['width'],g['height']
    im=parts[n].resize((w,h),Image.Resampling.LANCZOS)
    if angle: im=im.rotate(-angle,Image.Resampling.BICUBIC,expand=False)
    canvas.alpha_composite(im,(round(g['x']+dx),round(g['y']+dy)))
bike_geom=rig['vehicles']['bike']
def raster(svg):
    return Image.open(io.BytesIO(cairosvg.svg2png(url=str(preset/svg)))).convert('RGBA')
bike_frame=raster('bike-frame.svg')
bike_wheel=raster('bike-wheel.svg')
def vehicle(canvas,phase):
    bg=Image.new('RGBA',(124,64))
    for role in ['rear','front']:
        x,y=bike_geom['wheels'][role]['center']
        s=bike_geom['wheels'][role]['size']
        wheel=bike_wheel.resize((s,s),Image.Resampling.LANCZOS).rotate(-phase*360,Image.Resampling.BICUBIC)
        bg.alpha_composite(wheel,(int(x-s/2),int(y-s/2)))
    bg.alpha_composite(bike_frame.resize((124,64),Image.Resampling.LANCZOS))
    bg=bg.resize((bike_geom['width'],bike_geom['height']),Image.Resampling.LANCZOS)
    canvas.alpha_composite(bg,(bike_geom['x'],bike_geom['y']))
def export_frame(mode,i,backpack):
    c=Image.new('RGBA',(W,H))
    phase=i/6
    if mode=='bike':vehicle(c,phase)
    if mode=='walk':
        x=math.sin(phase*2*math.pi)
        place(c,'leg_back',dx=-7*x,dy=-2*max(0,x),angle=12*x)
        if backpack:place(c,'backpack')
        place(c,'arm_back',dx=-3*x,angle=-13*x)
        place(c,'body',dy=-abs(x)*1)
        place(c,'leg_front',dx=7*x,dy=-2*max(0,-x),angle=-12*x)
        place(c,'arm_front',dx=3*x,angle=13*x)
    else:
        lift=-12
        b=math.sin(phase*2*math.pi)
        place(c,'leg_back',dx=5*b,dy=lift+3*b)
        if backpack:place(c,'backpack',dy=lift)
        place(c,'arm_back',dx=12,dy=lift)
        place(c,'body',dy=lift)
        place(c,'leg_front',dx=-5*b,dy=lift-3*b)
        place(c,'arm_front',dx=12,dy=lift)
    d=out/mode/('pack' if backpack else 'plain')
    d.mkdir(parents=True,exist_ok=True)
    c.save(d/f'{i:02d}.png',optimize=True)
for mode in ['walk','bike']:
    for pack in [False,True]:
        for i in range(6):export_frame(mode,i,pack)
for emotion,source in [('neutral','head'),('happy','head-happy'),('focused','head-focused'),('tired','head-tired')]:
    im=Image.open(preset/(source+'.webp')).convert('RGBA')
    g=rig['slots']['head']
    im=im.resize((g['width'],g['height']),Image.Resampling.LANCZOS)
    c=Image.new('RGBA',(W,H));c.alpha_composite(im,(g['x'],g['y']))
    hd=out/'heads';hd.mkdir(exist_ok=True)
    c.save(hd/(emotion+'.png'),optimize=True)
print('exported', len(list(out.rglob('*.png'))),'PNG frames')
