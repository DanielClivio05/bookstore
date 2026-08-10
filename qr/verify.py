import cv2, numpy as np
from PIL import Image

EXPECT = "https://booknooklane.com"
det = cv2.QRCodeDetector()

def check(path, px):
    im = Image.open(path).convert("RGB").resize((px, px), Image.LANCZOS)
    arr = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR)
    data, pts, _ = det.detectAndDecode(arr)
    return data

for path in ["booknooklane-qr-logo.png", "booknooklane-qr-plain.png"]:
    print(f"\n{path}")
    for px in (2400, 1200, 600, 300, 150, 100, 72):
        got = check(path, px)
        mm = px / 300 * 25.4   # if printed at 300dpi
        ok = "OK " if got == EXPECT else "FAIL"
        print(f"  {px:>5}px (~{mm:5.1f}mm @300dpi)  {ok}  {got[:40] if got else '(no read)'}")
