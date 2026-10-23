from PIL import Image
import json,math,io
from pathlib import Path
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
    # Reviewable pixel sources: pre-rasterized from the same SVG source using
    # Chromium. No native Cairo DLL or SVG rendering is needed at runtime.
    candidate=preset/(Path(svg).stem+'.png')
    if candidate.exists():
        return Image.open(candidate).convert('RGBA')
    try:
        import cairosvg
    except (ImportError,OSError) as error:
        raise RuntimeError('No baked bike PNG and CairoSVG unavailable: '+str(svg)) from error
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
BIKE_FRAMES=12
WALK_FRAMES=6

def pedal_pose(phase):
    # Preserve the original approved pedalTargets geometry from rider-runtime:
    # opposite feet circle the same crank with an exact 180-degree phase shift.
    crank=bike_geom['crank']
    cx,cy=crank['center'];rx,ry=crank['radius']
    a=phase*math.tau
    return {'leg_front':(cx+rx*math.cos(a),cy+ry*math.sin(a)),
            'leg_back': (cx-rx*math.cos(a),cy-ry*math.sin(a))}

def pedal_leg(canvas,name,target,lift):
    g=rig['limbs'][name]
    foot_x=g['x']+g['foot_anchor'][0]
    foot_y=g['y']+g['foot_anchor'][1]
    # The original runtime applies -12 to the core and compensates the visual
    # distance halfway towards the pedal, yielding pedal world Y + lift / 2.
    place(canvas,name,dx=target[0]-foot_x,dy=target[1]+lift/2-foot_y)

def export_frame(mode,i,backpack):
    c=Image.new('RGBA',(W,H))
    phase=i/(BIKE_FRAMES if mode=='bike' else WALK_FRAMES)
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
        feet=pedal_pose(phase)
        pedal_leg(c,'leg_back',feet['leg_back'],lift)
        if backpack:place(c,'backpack',dy=lift)
        place(c,'arm_back',dx=12,dy=lift)
        place(c,'body',dy=lift)
        pedal_leg(c,'leg_front',feet['leg_front'],lift)
        place(c,'arm_front',dx=12,dy=lift)
    d=out/mode/('pack' if backpack else 'plain')
    d.mkdir(parents=True,exist_ok=True)
    c.save(d/f'{i:02d}.png',optimize=True)
for mode in ['bike']:
    for pack in [False,True]:
        for i in range(BIKE_FRAMES):export_frame(mode,i,pack)
# walk art is intentionally left untouched: this patch only restores pedaling.
# Expression heads and the original walk PNGs are not regenerated.
print('exported', len(list(out.rglob('*.png'))),'PNG frames')
