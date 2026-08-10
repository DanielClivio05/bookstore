from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader

INK   = HexColor("#101010")
SOFT  = HexColor("#5A5A5A")
SLATE = HexColor("#3F5165")
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

# Logo
logo = ImageReader("../landing/logo.png")
lw, lh = logo.getSize()
tw = 96*mm
top = H - 20*mm
c.drawImage(logo, (W-tw)/2, top - tw*lh/lw, width=tw, height=tw*lh/lw,
            mask='auto', preserveAspectRatio=True)
y = top - tw*lh/lw - 14*mm

# Four-colour shelf stripe, echoing the website
sw = 150*mm; sx = (W-sw)/2
for i, col in enumerate(SHELF):
    c.setFillColor(HexColor(col))
    c.rect(sx + i*sw/4, y, sw/4, 6, stroke=0, fill=1)
y -= 24*mm

# Heading
c.setFillColor(INK); c.setFont("Helvetica-Bold", 36)
c.drawCentredString(W/2, y, "Opening hours")
y -= 11*mm
c.setFillColor(SOFT); c.setFont("Helvetica-Oblique", 19)
c.drawCentredString(W/2, y, "Orari di apertura")
area_top = y - 16*mm

# Rows — measure the block first, then centre it in the space that's left,
# so the poster doesn't sit top-heavy with dead space above the footer.
L, R = 26*mm, W - 26*mm
GAP = 9*mm
def row_height(times): return 21*mm + (len(times)-1) * 12*mm
block = sum(row_height(t) + GAP for _,_,t,_ in ROWS) - GAP
area_bottom = 46*mm
y = (area_top + area_bottom)/2 + block/2

for en, it, times, closed in ROWS:
    row_h = row_height(times)
    if closed:
        c.setFillColor(PAGE)
        c.roundRect(L-7*mm, y - row_h + 8*mm, (R-L)+14*mm, row_h + 2*mm, 5*mm, stroke=0, fill=1)

    c.setFillColor(MUTED if closed else INK); c.setFont("Helvetica-Bold", 27)
    c.drawString(L, y, en)
    c.setFillColor(MUTED if closed else SOFT); c.setFont("Helvetica-Oblique", 16)
    c.drawString(L, y - 8.4*mm, it)

    c.setFillColor(MUTED if closed else INK)
    ty = y
    for t in times:
        c.setFont("Helvetica-Oblique" if closed else "Helvetica-Bold", 27)
        c.drawRightString(R, ty, t)
        ty -= 12*mm

    y -= row_h
    if (en, it) != (ROWS[-1][0], ROWS[-1][1]):
        c.setStrokeColor(LINE); c.setLineWidth(0.7)
        c.line(L, y + 5*mm, R, y + 5*mm)
    y -= GAP

# Footer
c.setFillColor(SLATE); c.setFont("Helvetica-Bold", 15)
c.drawCentredString(W/2, 30*mm, "Corso XXV Aprile 44  ·  21026 Gavirate (VA)")
c.setFillColor(SOFT);  c.setFont("Helvetica", 13)
c.drawCentredString(W/2, 21*mm, "booknooklane.com")

c.showPage(); c.save()
print("poster built")
