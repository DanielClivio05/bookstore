import qrcode
from qrcode.image.svg import SvgPathImage
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw

URL   = "https://booknooklane.com"
SLATE = "#3F5165"   # darkened brand slate — stays on-brand, keeps scanner contrast
LOGO  = "../landing/logo.png"

def build(ec=ERROR_CORRECT_H):
    qr = qrcode.QRCode(version=None, error_correction=ec, box_size=10, border=4)
    qr.add_data(URL); qr.make(fit=True)
    return qr

qr = build()
print(f"version={qr.version}  modules={qr.modules_count}  ec=H(30%)  chars={len(URL)}")

# 1. Vector SVG (plain, no logo) — the one to hand a printer
svg = qr.make_image(image_factory=SvgPathImage)
svg.save("booknooklane-qr.svg")

# 2. High-res PNG, brand slate on white, with the logo knocked into the middle
img = qr.make_image(fill_color=SLATE, back_color="white").convert("RGBA")
scale = 2400 / img.size[0]
img = img.resize((2400, 2400), Image.NEAREST)

logo = Image.open(LOGO).convert("RGBA")
# Logo covers ~19% of the width. Error correction H tolerates 30% damage,
# so this stays comfortably inside the recoverable budget.
target = int(2400 * 0.19)
lw, lh = logo.size
logo = logo.resize((target, int(lh * target / lw)), Image.LANCZOS)

pad = int(target * 0.10)
plate = Image.new("RGBA", (logo.size[0] + pad*2, logo.size[1] + pad*2), (255,255,255,255))
d = ImageDraw.Draw(plate)
d.rounded_rectangle([0,0,plate.size[0]-1, plate.size[1]-1], radius=int(pad*1.4), fill="white")
plate.paste(logo, (pad, pad), logo)

pos = ((2400 - plate.size[0])//2, (2400 - plate.size[1])//2)
img.paste(plate, pos, plate)
img.convert("RGB").save("booknooklane-qr-logo.png", dpi=(600,600))

# 3. Plain PNG without the logo — the safest option for tiny prints
plain = build().make_image(fill_color=SLATE, back_color="white").convert("RGB")
plain = plain.resize((2400,2400), Image.NEAREST)
plain.save("booknooklane-qr-plain.png", dpi=(600,600))
print("built svg + 2 pngs")
