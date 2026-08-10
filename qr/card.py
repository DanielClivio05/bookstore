from reportlab.lib.pagesizes import A6
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader

SLATE = HexColor("#3F5165")
SOFT  = HexColor("#7C8896")
W, H  = A6                       # 105 x 148 mm — window card / bookmark size

c = canvas.Canvas("booknooklane-qr-card.pdf", pagesize=A6)
c.setTitle("Book Nook Lane — scan card")

# Wordmark
logo = ImageReader("../landing/logo.png")
lw, lh = logo.getSize()
tw = 48*mm
c.drawImage(logo, (W-tw)/2, H - 14*mm - tw*lh/lw, width=tw, height=tw*lh/lw,
            mask='auto', preserveAspectRatio=True)

# QR — plain version, most reliable at small print sizes
q = 62*mm
qy = 34*mm
c.drawImage(ImageReader("booknooklane-qr-plain.png"), (W-q)/2, qy,
            width=q, height=q, preserveAspectRatio=True)

# Captions, both languages
c.setFillColor(SLATE)
c.setFont("Helvetica-Bold", 11)
c.drawCentredString(W/2, qy - 9*mm,  "Scan for events & opening hours")
c.setFillColor(SOFT)
c.setFont("Helvetica", 9.5)
c.drawCentredString(W/2, qy - 14.5*mm, "Inquadra per eventi e orari")

c.setFillColor(SLATE)
c.setFont("Helvetica-Bold", 10)
c.drawCentredString(W/2, 12*mm, "booknooklane.com")

# Hairline trim guide
c.setStrokeColor(HexColor("#E2DDD3")); c.setLineWidth(0.4)
c.rect(5*mm, 5*mm, W-10*mm, H-10*mm)
c.showPage(); c.save()
print("card built")
