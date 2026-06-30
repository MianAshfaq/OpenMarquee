from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent
SIZE = 1024

image = Image.new("RGBA", (SIZE, SIZE), "#13261f")
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((136, 136, 888, 888), radius=160, fill="#236247")
draw.rounded_rectangle((232, 256, 792, 624), radius=88, fill="#d6f26a")

# The dark marquee wave remains readable from a full-size installer down to a taskbar icon.
wave = [(184, 536), (248, 536), (312, 488), (376, 416), (448, 368), (520, 352),
        (592, 376), (656, 432), (720, 504), (776, 536), (840, 536), (840, 616),
        (776, 616), (712, 584), (648, 528), (584, 472), (520, 448), (456, 456),
        (392, 496), (328, 552), (264, 600), (184, 616)]
draw.polygon(wave, fill="#13261f")
draw.rounded_rectangle((344, 704, 680, 760), radius=28, fill="#ecf5f1")

png_path = ROOT / "OpenMarquee.png"
ico_path = ROOT / "OpenMarquee.ico"
image.save(png_path, optimize=True)
image.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
