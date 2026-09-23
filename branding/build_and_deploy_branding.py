import os
import sys
import shutil
from PIL import Image, ImageFilter, ImageEnhance
import numpy as np

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BRANDING_DIR = os.path.join(BASE_DIR, 'branding')
FRONTEND_PUBLIC = os.path.join(BASE_DIR, 'frontend', 'public')
DESKTOP_DIR = os.path.join(BASE_DIR, 'desktop')
INSTALLER_DIR = os.path.join(BASE_DIR, 'installer')

print("=== بناء وتوزيع هوية وأيقونات رفيق (RAFIQ Branding) ===")

# 1. Load Concept 2 Master
concept2_path = os.path.join(BRANDING_DIR, 'concept_2_corporate_swiss.jpg')
src = Image.open(concept2_path).convert('RGB')
arr = np.array(src, dtype=float)

# Background color in concept 2
bg_color = np.array([251.0, 252.0, 251.0])
dist = np.sqrt(np.sum((arr - bg_color)**2, axis=2))

# Smooth anti-aliased alpha
low, high = 14.0, 42.0
alpha = np.clip((dist - low) / (high - low), 0.0, 1.0)
alpha = alpha * alpha * (3.0 - 2.0 * alpha) # Hermite smoothstep

# De-fringe colors against white
alpha_3d = np.expand_dims(alpha, axis=2)
fg = (arr - (1.0 - alpha_3d) * bg_color) / np.maximum(alpha_3d, 1e-3)
fg = np.clip(fg, 0, 255)

full_rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
full_img = Image.fromarray(full_rgba, 'RGBA')

# -----------------------------------------------------------------
# 2. Extract Central Emblem Mark (Y: 278..560, X: 368..656)
# -----------------------------------------------------------------
emblem_crop = full_img.crop((368, 278, 656, 560))

# Color enhancement for vibrant enterprise punch
r, g, b, a = emblem_crop.split()
rgb = Image.merge('RGB', (r, g, b))
rgb = ImageEnhance.Color(rgb).enhance(1.15)
rgb = ImageEnhance.Contrast(rgb).enhance(1.08)
emblem_enhanced = Image.merge('RGBA', (*rgb.split(), a))

# Scale to 512x512 with 10% breathing room
ew, eh = emblem_enhanced.size
scale = 430.0 / max(ew, eh)
nw, nh = int(ew * scale), int(eh * scale)
scaled_emblem = emblem_enhanced.resize((nw, nh), Image.Resampling.LANCZOS)

# Create subtle elevation drop-shadow
shadow_canvas = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
sx = (512 - nw) // 2
sy = (512 - nh) // 2 + 5
shadow_mask = scaled_emblem.split()[3].point(lambda p: int(p * 0.28))
black = Image.new('RGBA', (nw, nh), (0, 15, 30, 255))
black.putalpha(shadow_mask)
shadow_canvas.paste(black, (sx, sy), black)
shadow_canvas = shadow_canvas.filter(ImageFilter.GaussianBlur(radius=8))

# Composite emblem over shadow
icon_master = Image.alpha_composite(shadow_canvas, Image.new('RGBA', (512, 512), (0, 0, 0, 0)))
ox = (512 - nw) // 2
oy = (512 - nh) // 2
icon_master.paste(scaled_emblem, (ox, oy), scaled_emblem)

# Save Master Logo Emblem (Transparent PNG)
logo_path = os.path.join(BRANDING_DIR, 'logo.png')
icon_master.save(logo_path, optimize=True)
print("✔ تم حفظ اللوجو المفرغ: branding/logo.png")

# -----------------------------------------------------------------
# 3. Create Multi-Resolution Windows ICO (7 Resolutions)
# -----------------------------------------------------------------
ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
frames = []
for s in ico_sizes:
    frame = icon_master.resize(s, Image.Resampling.LANCZOS)
    if s[0] <= 32:
        fr, fg_c, fb, fa = frame.split()
        frgb = Image.merge('RGB', (fr, fg_c, fb))
        frgb = frgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=140, threshold=2))
        frame = Image.merge('RGBA', (*frgb.split(), fa))
    frames.append(frame)

app_ico_path = os.path.join(BRANDING_DIR, 'app.ico')
frames[0].save(app_ico_path, format='ICO', append_images=frames[1:], sizes=ico_sizes)
print("✔ تم إنشاء الأيقونة متعددة المقاسات (7 مقاسات): branding/app.ico")

# -----------------------------------------------------------------
# 4. Extract Full Brand Logo (Emblem + "RAFIQ" + "رفيق")
# -----------------------------------------------------------------
full_crop = full_img.crop((232, 278, 794, 748))
fw, fh = full_crop.size
pad = 24
full_canvas = Image.new('RGBA', (fw + pad*2, fh + pad*2), (0, 0, 0, 0))
full_canvas.paste(full_crop, (pad, pad), full_crop)

fr, fg_c, fb, fa = full_canvas.split()
frgb = Image.merge('RGB', (fr, fg_c, fb))
frgb = ImageEnhance.Color(frgb).enhance(1.1)
frgb = ImageEnhance.Contrast(frgb).enhance(1.05)
full_canvas = Image.merge('RGBA', (*frgb.split(), fa))

logo_full_path = os.path.join(BRANDING_DIR, 'logo_full.png')
full_canvas.save(logo_full_path, optimize=True)
print("✔ تم حفظ الشعار الكامل مفرغ: branding/logo_full.png")

# -----------------------------------------------------------------
# 5. Distribute Assets Across All Modules
# -----------------------------------------------------------------
# Frontend
shutil.copyfile(logo_path, os.path.join(FRONTEND_PUBLIC, 'logo.png'))
shutil.copyfile(logo_full_path, os.path.join(FRONTEND_PUBLIC, 'logo_full.png'))
shutil.copyfile(app_ico_path, os.path.join(FRONTEND_PUBLIC, 'favicon.ico'))
print("✔ تم التوزيع إلى Frontend (public)")

# Desktop project
shutil.copyfile(app_ico_path, os.path.join(DESKTOP_DIR, 'app.ico'))
print("✔ تم التوزيع إلى Desktop (C#)")

# Installer project
shutil.copyfile(app_ico_path, os.path.join(INSTALLER_DIR, 'app.ico'))
print("✔ تم التوزيع إلى Installer (Inno Setup)")

# Desktop Release bin if exists
desktop_release = os.path.join(DESKTOP_DIR, 'bin', 'Release')
if os.path.exists(desktop_release):
    shutil.copyfile(app_ico_path, os.path.join(desktop_release, 'app.ico'))
    release_dist = os.path.join(desktop_release, 'dist')
    if os.path.exists(release_dist):
        shutil.copyfile(logo_path, os.path.join(release_dist, 'logo.png'))
        shutil.copyfile(app_ico_path, os.path.join(release_dist, 'favicon.ico'))
    print("✔ تم التحديث في desktop/bin/Release")

print("=== تم تحديث ونشر الشعار والأيقونة بنجاح فائق! ===")
