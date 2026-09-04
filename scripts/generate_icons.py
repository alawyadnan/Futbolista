from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def build_icon(size: int, safe_padding: float, output: str) -> None:
    image = Image.new("RGB", (size, size), "#07110d")
    draw = ImageDraw.Draw(image)
    pad = int(size * safe_padding)
    draw.rounded_rectangle((pad, pad, size - pad, size - pad), radius=int(size * 0.22), fill="#10251a", outline="#43df87", width=max(2, size // 64))

    center = size / 2
    radius = size * 0.235
    ball_box = (center - radius, center - radius, center + radius, center + radius)
    draw.ellipse(ball_box, fill="#f1fbf5", outline="#43df87", width=max(2, size // 72))

    pentagon = []
    import math
    for index in range(5):
        angle = -math.pi / 2 + index * 2 * math.pi / 5
        pentagon.append((center + radius * 0.36 * math.cos(angle), center + radius * 0.36 * math.sin(angle)))
    draw.polygon(pentagon, fill="#07110d")
    for point in pentagon:
        draw.line((center, center, point[0], point[1]), fill="#43df87", width=max(2, size // 80))

    image.save(ROOT / output, format="PNG", optimize=True)


build_icon(192, 0.09, "icon-192.png")
build_icon(512, 0.09, "icon-512.png")
build_icon(512, 0.20, "icon-maskable-512.png")
build_icon(180, 0.08, "apple-touch-icon.png")
