from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader

INK   = HexColor("#101010")
SOFT  = HexColor("#5A5A5A")
SLATE = HexColor("#3F5165")
GOLD  = HexColor("#B8860B")
MUTED = HexColor("#A9A296")
LINE  = HexColor("#E6E0D6")
PAGE  = HexColor("#F3EBDC")
SHELF = ["#5B7189", "#8EAD84", "#DDAE54", "#D06756"]

# Exactly the hours from the website
ROWS = [
    ("Monday",            "Lunedì",            ["15:00 – 19:00"],                  False),
    ("Tuesday – Saturday","Martedì – Sabato",  ["9:00 – 12:30", "15:00 – 19:00"],  False),
    ("Sunday",            "Domenica",          ["Closed  ·  Chiuso"],              True),
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
y -= 18*mm

# ---- Heading -------------------------------------------------------------
c.setFillColor(INK); c.setFont("Helvetica-Bold", 31)
c.drawCentredString(W/2, y, "Opening hours")
y -= 8*mm
c.setFillColor(SOFT); c.setFont("Helvetica-Oblique", 16)
c.drawCentredString(W/2, y, "Orari di apertura")
area_top = y - 11*mm

# ---- Rows: measured, then centred in the space between heading and QR band
L, R = 26*mm, W - 26*mm
GAP = 6*mm
def row_height(times): return 16*mm + (len(times)-1) * 9.5*mm
block = sum(row_height(t) + GAP for _, _, t, _ in ROWS) - GAP
area_bottom = 130*mm
# Centre the block in the space available — but never let it climb above
# area_top, or the first row rides up into the Italian subtitle.
available = area_top - area_bottom
assert block <= available, (
    f"rows block {block/mm:.1f}mm doesn't fit in {available/mm:.1f}mm of space — "
    "shrink the type or move the QR band down")
y = min((area_top + area_bottom)/2 + block/2, area_top)
print(f"  area {area_bottom/mm:.0f}–{area_top/mm:.0f}mm, block {block/mm:.1f}mm, "
      f"rows run {(y-block)/mm:.1f}–{y/mm:.1f}mm, band top {(40+46)}mm")

for en, it, times, closed in ROWS:
    row_h = row_height(times)
    if closed:
        c.setFillColor(PAGE)
        c.roundRect(L-7*mm, y - row_h + 8*mm, (R-L)+14*mm, row_h + 2*mm, 5*mm, stroke=0, fill=1)

    c.setFillColor(MUTED if closed else INK); c.setFont("Helvetica-Bold", 22)
    c.drawString(L, y, en)
    c.setFillColor(MUTED if closed else SOFT); c.setFont("Helvetica-Oblique", 14)
    c.drawString(L, y - 7.5*mm, it)

    c.setFillColor(MUTED if closed else INK)
    ty = y
    for t in times:
        c.setFont("Helvetica-Oblique" if closed else "Helvetica-Bold", 22)
        c.drawRightString(R, ty, t)
        ty -= 10*mm

    y -= row_h
    if (en, it) != (ROWS[-1][0], ROWS[-1][1]):
        c.setStrokeColor(LINE); c.setLineWidth(0.7)
        c.line(L, y + 5*mm, R, y + 5*mm)
    y -= GAP

# ---- QR band -------------------------------------------------------------
# The code is the point of this block, so it takes the space. One line of
# English underneath, nothing else. Panel is narrowed to frame the code
# rather than leaving it stranded in a wide field of cream.
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

c.setFillColor(GOLD); c.setFont("Helvetica-BoldOblique", 17)
c.drawCentredString(W/2, BAND_Y + 10*mm, "Scan to see what's on")

# ---- Footer --------------------------------------------------------------
c.setFillColor(SLATE); c.setFont("Helvetica-Bold", 14)
c.drawCentredString(W/2, 18*mm, "Corso XXV Aprile 44  ·  21026 Gavirate (VA)")
c.setFillColor(SOFT);  c.setFont("Helvetica", 12)
c.drawCentredString(W/2, 11*mm, "booknooklane.com")

c.showPage(); c.save()
print("poster built")
