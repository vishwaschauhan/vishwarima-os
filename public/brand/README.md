# Brand assets

The app serves the family portrait from this folder:

- `portrait-720.webp`, `portrait-1440.webp` (preferred)
- `portrait-720.jpg`, `portrait-1440.jpg` (fallback)

The original, uncompressed artwork is kept in `/brand/vishwarima-family-sunset-portrait.png`
and is not served.

To replace the portrait, put the new PNG at `/brand/vishwarima-family-sunset-portrait.png` and
regenerate the sizes (needs Python with Pillow):

```sh
python3 - <<'PY'
from PIL import Image
src = Image.open('brand/vishwarima-family-sunset-portrait.png').convert('RGB')
for w in (720, 1440):
    im = src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
    im.save(f'public/brand/portrait-{w}.webp', 'WEBP', quality=82, method=6)
    im.save(f'public/brand/portrait-{w}.jpg', 'JPEG', quality=84, optimize=True, progressive=True)
PY
```

If the files are missing, the app still works and shows the VishwarimaOS wordmark instead.
