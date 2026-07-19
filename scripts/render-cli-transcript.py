from pathlib import Path
import sys

from PIL import Image, ImageDraw, ImageFont


source = Path(sys.argv[1])
target = Path(sys.argv[2])
lines = source.read_text(encoding="utf-8").splitlines()[-42:]
font_path = Path("/System/Library/Fonts/Menlo.ttc")
if font_path.exists():
    font = ImageFont.truetype(str(font_path), 16)
else:
    font = ImageFont.load_default()

width = 1280
line_height = 23
padding = 28
height = max(180, padding * 2 + line_height * max(1, len(lines)))
image = Image.new("RGB", (width, height), "#0d1117")
draw = ImageDraw.Draw(image)
for index, line in enumerate(lines):
    draw.text(
        (padding, padding + index * line_height),
        line[:132],
        fill="#e6edf3",
        font=font,
    )
target.parent.mkdir(parents=True, exist_ok=True)
image.save(target, "PNG", optimize=True)
