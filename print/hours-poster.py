"""Opening-hours poster for the shop window.

Typeface note: C059 is URW's Century Schoolbook, which was drawn for school
readers — children learning to read is literally what it was designed for, so
it suits a children's bookshop far better than Helvetica, and its sturdy
bracketed serifs are the nearest thing available to the site's Zilla Slab.
The .otf originals use CFF outlines that ReportLab can't embed, so they were
converted to TrueType once and committed alongside this script.
"""

import pathlib
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

FONTS = pathlib.Path(__file__).parent / "fonts"
for name, file in [
    ("Book",       "C059-Roman.ttf"),
    ("Book-Bold",  "C059-Bold.ttf"),
    ("Book-It",    "C059-Italic.ttf"),
    ("Book-BoldIt","C059-BdIta.ttf"),
    ("Sans",       "Carlito-Regular.ttf"),
    ("Sans-Bold",  "Carlito-Bold.ttf"),
]:
    pdfmetrics.registerFont(TTFont(name, str(FONTS / file)))

INK   = HexColor("#141414")
SOFT  = HexColor("#5A5A5A")
SLATE = HexColor("#5B7189")   # the logo's script blue — used for all Italian
DEEP  = HexColor("#3F5165")
GOLD  = HexColor("#A97B18")
MUTED = HexColor("#A9A296")
LINE  = HexColor("#E6E0D6")
PAGE  = HexColor("#F3EBDC")
SHELF = ["#5B7189", "#8EAD84", "#DDAE54", "#D06756"]

# (English day, Italian day, [shifts], [Italian for a closed day])
ROWS = [
    ("Monday",             "Lunedì",           ["15:00 – 19:00"],                 None),
    ("Tuesday – Saturday", "Martedì – Sabato", ["9:00 – 12:30", "15:00 – 19:00"], None),
    ("Sunday",             "Domenica",         ["Closed"],                        "Chiuso"),
]

W, H = A4
c = canvas.Canvas("booknooklane-opening-hours-A4.pdf", pagesize=A4)
c.setTitle("Book Nook Lane — Opening hours")

# ---- Logo ----------------------------------------------------------------
logo = ImageReader("../landing/logo.png")
lw, lh = logo.getSize()
tw = 44*mm
top = H - 18*mm
c.drawImage(logo, (W-tw)/2, top - tw*lh/lw, width=tw, height=tw*lh/lw,
            mask='auto', preserveAspectRatio=True)
y = top - tw*lh/lw - 9*mm

# ---- Four-colour shelf stripe, echoing the website -----------------------
sw = 150*mm; sx = (W-sw)/2
for i, col in enumerate(SHELF):
    c.setFillColor(HexColor(col))
    c.rect(sx + i*sw/4, y, sw/4, 6, stroke=0, fill=1)
y -= 17*mm

# ---- Heading -------------------------------------------------------------
c.setFillColor(INK); c.setFont("Book-Bold", 33)
c.drawCentredString(W/2, y, "Opening hours")
y -= 9.5*mm
c.setFillColor(SLATE); c.setFont("Book-It", 18)
c.drawCentredString(W/2, y, "Orari di apertura")
area_top = y - 11*mm

# ---- Rows ----------------------------------------------------------------
# Both columns follow the same rule: English on top, Italian in slate italic
# beneath it. That includes "Closed / Chiuso", which used to be jammed onto
# one line and broke the pattern everywhere else on the page.
L, R = 26*mm, W - 26*mm
GAP = 6*mm
def row_height(times): return 16*mm + (len(times)-1) * 9.5*mm
block = sum(row_height(t) + GAP for _, _, t, _ in ROWS) - GAP
area_bottom = 130*mm
available = area_top - area_bottom
assert block <= available, (
    f"rows block {block/mm:.1f}mm doesn't fit in {available/mm:.1f}mm of space — "
    "shrink the type or move the QR panel down")
y = min((area_top + area_bottom)/2 + block/2, area_top)

for en, it, times, closed_it in ROWS:
    closed = closed_it is not None
    row_h = row_height(times)

    if closed:
        c.setFillColor(PAGE)
        c.roundRect(L-7*mm, y - row_h + 7*mm, (R-L)+14*mm, row_h + 3*mm, 5*mm, stroke=0, fill=1)

    # left column
    c.setFillColor(MUTED if closed else INK); c.setFont("Book-Bold", 23)
    c.drawString(L, y, en)
    c.setFillColor(MUTED if closed else SLATE); c.setFont("Book-It", 15)
    c.drawString(L, y - 7.5*mm, it)

    # right column, mirroring the same two-language structure
    ty = y
    for t in times:
        c.setFillColor(MUTED if closed else INK)
        c.setFont("Book-It" if closed else "Book-Bold", 23)
        c.drawRightString(R, ty, t)
        ty -= 9.5*mm
    if closed:
        c.setFillColor(MUTED); c.setFont("Book-It", 15)
        c.drawRightString(R, y - 7.5*mm, closed_it)

    y -= row_h
    if (en, it) != (ROWS[-1][0], ROWS[-1][1]):
        c.setStrokeColor(LINE); c.setLineWidth(0.7)
        c.line(L, y + 5*mm, R, y + 5*mm)
    y -= GAP

# ---- QR panel ------------------------------------------------------------
# The code is the point of this block, so it takes the space. One line of
# English underneath, nothing else.
BAND_W, BAND_H, BAND_Y = 118*mm, 96*mm, 28*mm
BAND_X = (W - BAND_W)/2
c.setFillColor(PAGE)
c.roundRect(BAND_X, BAND_Y, BAND_W, BAND_H, 7*mm, stroke=0, fill=1)

q = 66*mm
qx = (W - q)/2
qy = BAND_Y + BAND_H - 7*mm - q
c.setFillColor(HexColor("#FFFFFF"))
c.roundRect(qx - 5*mm, qy - 5*mm, q + 10*mm, q + 10*mm, 5*mm, stroke=0, fill=1)
c.drawImage(ImageReader("../qr/booknooklane-qr-plain.png"), qx, qy,
            width=q, height=q, preserveAspectRatio=True)

c.setFillColor(GOLD); c.setFont("Book-BoldIt", 18)
c.drawCentredString(W/2, BAND_Y + 10*mm, "Scan to see what's on")

# ---- Footer --------------------------------------------------------------
c.setFillColor(DEEP); c.setFont("Sans-Bold", 13)
c.drawCentredString(W/2, 18*mm, "Corso XXV Aprile 44  ·  21026 Gavirate (VA)")
c.setFillColor(SOFT); c.setFont("Sans", 12)
c.drawCentredString(W/2, 11*mm, "booknooklane.com")

c.showPage(); c.save()
print(f"  block {block/mm:.1f}mm in {available/mm:.1f}mm — poster built")
