#!/usr/bin/env python3
"""Rebuild the reviewed, static PNG vehicle layers from checked-in SVG source art.

Authoring-only tool: Pillow + CairoSVG required. The published runtime remains
PNG-only; the SVG assets are never downloaded or rendered by that runtime.
"""
import copy
import io
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "public/riders/presets/helmet-commuter"
DEST = ROOT / "public/riders/vehicles"
PRESET = ROOT / "public/riders/frames/helmet-commuter/manifest.json"
REGISTRY = ROOT / "public/riders/frames/manifest.json"
MODES = {
    "scooter": ("city-scooter", "滑板车"),
    "skateboard": ("street-skateboard", "滑板"),
    "surf": ("office-surfboard", "冲浪板"),
    "skate": ("roller-skates", "轮滑鞋"),
}
NS = "{http://www.w3.org/2000/svg}"


def svg_image(mode, part="back"):
    root = ET.parse(ART / f"{mode}.svg").getroot()
    if mode == "scooter":
        # Keep the deck and highlights behind the rider, the stem/handlebar in front.
        paths = [n for n in root if n.tag == NS + "path"]
        indices = {0, 1, 6} if part == "back" else {2, 3, 4, 5}
        keep = {paths[i] for i in indices}
        for item in list(root):
            if item.tag == NS + "path" and item not in keep:
                root.remove(item)
            if part == "front" and item.tag in (NS + "rect", NS + "circle"):
                root.remove(item)
    elif part == "front":
        return Image.new("RGBA", (128, 100))
    output = cairosvg.svg2png(bytestring=ET.tostring(root, encoding="utf-8"),
                              output_width=128, output_height=100)
    return Image.open(io.BytesIO(output)).convert("RGBA")


def add_wheels(mode, art):
    wheels = Image.new("RGBA", (128, 100))
    draw = ImageDraw.Draw(wheels)
    wheel_sets = {
        "scooter": [(36, 91, 6), (99, 88, 6)],
        "skateboard": [(42, 93, 5), (101, 93, 5)],
        "skate": [(50, 92, 3), (60, 92, 3), (76, 92, 3), (85, 92, 3)],
    }
    for x, y, r in wheel_sets.get(mode, []):
        draw.ellipse((x-r, y-r, x+r, y+r), fill="#30234f")
        inner = max(1, r-2)
        draw.ellipse((x-inner, y-inner, x+inner, y+inner), fill="#9985d0")
        draw.ellipse((x-1, y-1, x+1, y+1), fill="#ffe1a5")
    return Image.alpha_composite(wheels, art)


def save_image(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def main():
    default = json.loads(PRESET.read_text())
    root = json.loads(REGISTRY.read_text())
    root.setdefault("vehicles", {})
    walk = default["transports"]["walk"]
    for mode, (id, label) in MODES.items():
        directory = DEST / id
        back = svg_image(mode)
        if mode in ("scooter", "skateboard", "skate"):
            back = add_wheels(mode, back)
        save_image(back, directory / "back/00.png")
        layers = {"back": ["back/00.png"]}
        if mode == "scooter":
            save_image(svg_image(mode, "front"), directory / "front/00.png")
            layers["front"] = ["front/00.png"]
        vehicle = {
            "schema_version": 1, "id": id, "label": label,
            "transport": mode, "canvas": {"width": 128, "height": 100},
            "frames": 1, "fps": 9, "layers": layers,
        }
        (directory / "manifest.json").write_text(
            json.dumps(vehicle, ensure_ascii=False, indent=2) + "\n")
        root["vehicles"][id] = f"/riders/vehicles/{id}/manifest.json"
        default["transports"][mode] = {
            "frames": 6, "fps": 9,
            "head_offset": {"x": 0, "y": 0},
            "layers": copy.deepcopy(walk["layers"]),
            "vehicle_id": id,
        }
    PRESET.write_text(json.dumps(default, ensure_ascii=False, indent=2) + "\n")
    REGISTRY.write_text(json.dumps(root, ensure_ascii=False, indent=2) + "\n")
    print("Exported:", ", ".join(MODES))


if __name__ == "__main__":
    main()
