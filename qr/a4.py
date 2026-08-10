from reportlab.lib.pagesizes import A4, A6
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader

SLATE = HexColor("#3F5165")
SOFT  = HexColor("#7C8896")
RULE  = HexColor("#E2DDD3")
LOGO  = ImageReader("../landing/logo.png")
QR    = ImageReader("booknooklane-qr-plain.png")
lw, lh = LOGO.getSize()

def card(c, x, y, w, h, s=1.0, rules=True):
    """Draw one card inside the box at (x,y) size (w,h). s scales type."""
    logo_w = w * 0.46
    logo_h = logo_w * lh / lw
    logo_y = y + h - h*0.09 - logo_h
    c.drawImage(LOGO, x + (w-logo_w)/2, logo_y, width=logo_w, height=logo_h,
                mask='auto', preserveAspectRatio=True)

    if rules:
        c.setStrokeColor(RULE); c.setLineWidth(0.5)
        c.line(x+w*0.18, logo_y + logo_h + h*0.035, x+w*0.82, logo_y + logo_h + h*0.035)
        c.line(x+w*0.18, logo_y - h*0.025,           x+w*0.82, logo_y - h*0.025)

    q  = w * 0.60
    qy = y + h * 0.235
    c.drawImage(QR, x + (w-q)/2, qy, width=q, height=q, preserveAspectRatio=True)

    c.setFillColor(SLATE); c.setFont("Helvetica-Bold", 11*s)
    c.drawCentredString(x+w/2, qy - h*0.062, "Scan for events & opening hours")
    c.setFillColor(SOFT);  c.setFont("Helvetica", 9.5*s)
    c.drawCentredString(x+w/2, qy - h*0.100, "Inquadra per eventi e orari")
    c.setFillColor(SLATE); c.setFont("Helvetica-Bold", 10.5*s)
    c.drawCentredString(x+w/2, y + h*0.065, "booknooklane.com")

# ---- A4 poster: one card, full page ----
W, H = A4
c = canvas.Canvas("booknooklane-qr-A4-poster.pdf", pagesize=A4)
c.setTitle("Book Nook Lane — A4 poster")
card(c, 0, 0, W, H, s=2.0, rules=False)
c.showPage(); c.save()

# ---- A4 sheet: four A6 cards to cut out ----
c = canvas.Canvas("booknooklane-qr-A4-4up.pdf", pagesize=A4)
c.setTitle("Book Nook Lane — 4 cards per A4")
cw, ch = W/2, H/2
for col in (0, 1):
    for row in (0, 1):
        card(c, col*cw, row*ch, cw, ch, s=1.0)
# trim guides
c.setStrokeColor(HexColor("#C9C2B4")); c.setLineWidth(0.4); c.setDash(2, 4)
c.line(W/2, 0, W/2, H); c.line(0, H/2, W, H/2)
c.showPage(); c.save()
print("built A4 poster + A4 4-up")
