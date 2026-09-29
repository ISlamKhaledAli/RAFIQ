# -*- coding: utf-8 -*-
"""
رفيق POS — اسكربت بناء وتوزيع أصول الهوية البصرية الرسمية 2026
يعتمد الشعار المعتمد الأصلي (Concept 2 - Corporate Swiss R + Barcode + Arrow)
مع الخطوط الجرافيكية العربية والإنجليزية الأصلية المعتمدة بنقاء فائق وخلفية مفرغة.
"""

import os
import sys
import shutil
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BRANDING_DIR = os.path.join(BASE_DIR, 'branding')
FRONTEND_PUBLIC = os.path.join(BASE_DIR, 'frontend', 'public')
FRONTEND_DIST = os.path.join(BASE_DIR, 'frontend', 'dist')
DESKTOP_DIR = os.path.join(BASE_DIR, 'desktop')
INSTALLER_DIR = os.path.join(BASE_DIR, 'installer')

print("=========================================================")
print("  رفيق POS — بناء وتوزيع الهوية البصرية المعتمدة (Concept 2)")
print("=========================================================")

# 1. تحميل صورة الماستر للشعار المعتمد (Corporate Swiss)
master_path = os.path.join(BRANDING_DIR, 'concept_2_corporate_swiss.jpg')
if not os.path.exists(master_path):
    print("خطأ: لم يتم العثور على concept_2_corporate_swiss.jpg")
    sys.exit(1)

src = Image.open(master_path).convert('RGB')
arr = np.array(src, dtype=float)

# 2. تفريغ الخلفية البيضاء بنعومة فائقة وإزالة خطوط الشبكة الإرشادية
bg_color = np.array([251.5, 252.5, 251.5])
dist = np.sqrt(np.sum((arr - bg_color)**2, axis=2))

low, high = 26.0, 56.0
alpha = np.clip((dist - low) / (high - low), 0.0, 1.0)
alpha = alpha * alpha * (3.0 - 2.0 * alpha)

alpha_3d = np.expand_dims(alpha, axis=2)
fg = (arr - (1.0 - alpha_3d) * bg_color) / np.maximum(alpha_3d, 1e-3)
fg = np.clip(fg, 0, 255)

full_rgba = np.dstack([fg, alpha * 255]).astype(np.uint8)
full_img = Image.fromarray(full_rgba, 'RGBA')

# -------------------------------------------------------------
# أ) تفريغ فائق النعومة بدقة 4x (4x Supersampling Anti-Aliasing)
# -------------------------------------------------------------
print("جاري المعالجة بدقة فائقة 4x Supersampling لمنع أي هبوط في الجودة...")

# رفع دقة المصدر إلى 4096x4096 للحصول على حواف فائقة الحدة بنظام Sub-pixel
src_4k = src.resize((4096, 4096), Image.Resampling.LANCZOS)
arr_4k = np.array(src_4k, dtype=float)

bg_color = np.array([251.5, 252.5, 251.5])
dist_4k = np.sqrt(np.sum((arr_4k - bg_color)**2, axis=2))

# تنعيم متدرج (Hermite Smoothstep) لعزل الخلفية بدون أي شرشرة
low, high = 24.0, 52.0
alpha_4k = np.clip((dist_4k - low) / (high - low), 0.0, 1.0)
alpha_4k = alpha_4k * alpha_4k * (3.0 - 2.0 * alpha_4k)

alpha_3d = np.expand_dims(alpha_4k, axis=2)
fg_4k = (arr_4k - (1.0 - alpha_3d) * bg_color) / np.maximum(alpha_3d, 1e-3)
fg_4k = np.clip(fg_4k, 0, 255)

full_rgba_4k = np.dstack([fg_4k, alpha_4k * 255]).astype(np.uint8)
full_img_4k = Image.fromarray(full_rgba_4k, 'RGBA')

# -------------------------------------------------------------
# ب) استخراج مجسم الشعار (Emblem Mark) بدقة 4K فائقة
# -------------------------------------------------------------
# الإحداثيات المناظرة في 4096x4096
emblem_crop = full_img_4k.crop((1440, 1080, 2660, 2260))
emblem_arr = np.array(emblem_crop, dtype=float)
er, eg, eb, ea = emblem_arr[:,:,0], emblem_arr[:,:,1], emblem_arr[:,:,2], emblem_arr[:,:,3]

# تنظيف خطوط الشبكة الإرشادية بدقة متناهية
is_emblem_grid = (ea > 0) & (np.abs(er - eg) < 14) & (np.abs(eg - eb) < 14) & (er > 165)
emblem_arr[is_emblem_grid, 3] = 0
emblem_arr[:16, :, 3] = 0
emblem_arr[-16:, :, 3] = 0
emblem_arr[:, :16, 3] = 0
emblem_arr[:, -16:, 3] = 0

emblem_clean = Image.fromarray(emblem_arr.astype(np.uint8), 'RGBA')
ebbox = emblem_clean.getbbox()
emblem_exact = emblem_clean.crop(ebbox)

# تصدير logo.png بدقة فائقة 1024x1024 مع ظل ناعم
ew, eh = emblem_exact.size
scale_logo = 860.0 / max(ew, eh)
nw_l, nh_l = int(ew * scale_logo), int(eh * scale_logo)
scaled_logo_emblem = emblem_exact.resize((nw_l, nh_l), Image.Resampling.LANCZOS)

canvas_logo = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
sx = (1024 - nw_l) // 2
sy = (1024 - nh_l) // 2 + 10
shadow_mask = scaled_logo_emblem.split()[3].point(lambda p: int(p * 0.28))
shadow = Image.new('RGBA', (nw_l, nh_l), (0, 20, 35, 255))
shadow.putalpha(shadow_mask)
canvas_logo.paste(shadow, (sx, sy), shadow)
canvas_logo = canvas_logo.filter(ImageFilter.GaussianBlur(radius=12))
canvas_logo.paste(scaled_logo_emblem, ((1024 - nw_l) // 2, (1024 - nh_l) // 2), scaled_logo_emblem)

logo_path = os.path.join(BRANDING_DIR, 'logo.png')
canvas_logo.save(logo_path, optimize=True)
print("✔ [1/6] تم حفظ الشعار المفرغ بدقة فائقة 1024x1024: branding/logo.png")

# -------------------------------------------------------------
# ج) الشعار الأبيض النقي بدقة 1024x1024 بدون أي ظل ضبابي
# -------------------------------------------------------------
# نأخذ المجسم الدقيق مباشرة بدون أي ظل ضبابي موروث
arr_lwe = np.array(scaled_logo_emblem).copy()
arr_lwe[:, :, :3] = 255  # بياض ناصع لكافة البكسلات مع الاحتفاظ بنعومة الحواف الأصلية
logo_white_exact = Image.fromarray(arr_lwe, 'RGBA')

canvas_logo_white = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
canvas_logo_white.paste(logo_white_exact, ((1024 - nw_l) // 2, (1024 - nh_l) // 2), logo_white_exact)
logo_white_path = os.path.join(BRANDING_DIR, 'logo_white.png')
canvas_logo_white.save(logo_white_path, optimize=True)
print("✔ [2/6] تم حفظ الشعار الأبيض النقي بدقة فائقة: branding/logo_white.png")

# -------------------------------------------------------------
# د) بناء كارت أيقونة التطبيق بدقة فائقة (Squircle App Icon - 512x512)
# -------------------------------------------------------------
# تصميم كارت أيقونة عصري فخم بتدرج زمردي غامق وشعار عالي التباين
app_icon = Image.new('RGBA', (512, 512), (0, 0, 0, 0))

# 1. ظل خفيف ناعم للأيقونة
shadow_box = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(shadow_box)
sdraw.rounded_rectangle([20, 24, 492, 496], radius=110, fill=(0, 20, 15, 60))
shadow_box = shadow_box.filter(ImageFilter.GaussianBlur(radius=8))
app_icon = Image.alpha_composite(shadow_box, app_icon)

# 2. جسم الأيقونة الدائري (Squircle)
base = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
mask = Image.new('L', (512, 512), 0)
mdraw = ImageDraw.Draw(mask)
mdraw.rounded_rectangle([20, 20, 492, 492], radius=110, fill=255)

# تدرج لوني فخم من الأخضر الزمردي الغامق إلى الكحلي
gradient = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(gradient)
for y in range(512):
    ratio = y / 512.0
    r_c = int(0 * (1 - ratio) + 0 * ratio)
    g_c = int(52 * (1 - ratio) + 26 * ratio)
    b_c = int(40 * (1 - ratio) + 20 * ratio)
    gdraw.line([(0, y), (512, y)], fill=(r_c, g_c, b_c, 255))

base.paste(gradient, (0, 0), mask)
bdraw_top = ImageDraw.Draw(base)
bdraw_top.rounded_rectangle([20, 20, 492, 492], radius=110, outline=(30, 190, 140, 180), width=3)
app_icon = Image.alpha_composite(app_icon, base)

# 3. وضع الشعار عالي التباين في المنتصف (يشغل 74% من مساحة الكارت)
# إبراز خطوط الباركود والسهم باللون الأبيض والنعناعي لتباين فائق على الخلفية الداكنة
arr_emb = np.array(emblem_exact, dtype=float).copy()
is_barcode = (arr_emb[:, :, 3] > 60) & (arr_emb[:, :, 0] < 70) & (arr_emb[:, :, 1] < 70) & (arr_emb[:, :, 2] < 70)
arr_emb[is_barcode, :3] = 255

high_contrast_emblem = Image.fromarray(arr_emb.astype(np.uint8), 'RGBA')
ebbox_hc = high_contrast_emblem.getbbox()
if ebbox_hc:
    high_contrast_emblem = high_contrast_emblem.crop(ebbox_hc)

target_icon_h = 360
scale_icon = target_icon_h / float(high_contrast_emblem.height)
target_icon_w = int(high_contrast_emblem.width * scale_icon)
scaled_icon_emblem = high_contrast_emblem.resize((target_icon_w, target_icon_h), Image.Resampling.LANCZOS)

ix = (512 - target_icon_w) // 2
iy = (512 - target_icon_h) // 2
app_icon.paste(scaled_icon_emblem, (ix, iy), scaled_icon_emblem)

app_icon_512_path = os.path.join(BRANDING_DIR, 'app_icon_512.png')
app_icon.save(app_icon_512_path, optimize=True)
print("✔ [3/6] تم حفظ كارت الأيقونة فائق الحدة: branding/app_icon_512.png")

# -------------------------------------------------------------
# هـ) توليد ملف الأيقونة لويندوز فائق النقاء (Pure Multi-Layer PNG ICO)
# -------------------------------------------------------------
# بناء ملف ICO احترافي يضم 7 طبقات قياسية (256, 128, 64, 48, 32, 24, 16)
# كل طبقة كـ PNG مشحوذ الحواف بدقة أجزاء البكسل لمنع أي غبش على سطح المكتب وشريط المهام
import io
import struct

ico_sizes = [256, 128, 64, 48, 32, 24, 16]
ico_frames = []
png_streams = []

for s in ico_sizes:
    frame = app_icon.resize((s, s), Image.Resampling.LANCZOS)
    if s <= 48:
        # شحذ حواف دقيق مخصص للمقاسات الصغيرة
        frame = frame.filter(ImageFilter.UnsharpMask(radius=1.0, percent=140, threshold=1))
    ico_frames.append(frame)
    buf = io.BytesIO()
    frame.save(buf, format='PNG', optimize=True)
    png_streams.append(buf.getvalue())

# هيكلة ترويسة ملف ICO القياسي
num_images = len(ico_frames)
header_offset = 6 + (num_images * 16)
ico_buf = io.BytesIO()
ico_buf.write(struct.pack('<HHH', 0, 1, num_images))

current_offset = header_offset
for s, stream in zip(ico_sizes, png_streams):
    b_w = 0 if s == 256 else s
    b_h = 0 if s == 256 else s
    ico_buf.write(struct.pack('<BBBBHHII', b_w, b_h, 0, 0, 1, 32, len(stream), current_offset))
    current_offset += len(stream)

for stream in png_streams:
    ico_buf.write(stream)

app_ico_path = os.path.join(BRANDING_DIR, 'app.ico')
with open(app_ico_path, 'wb') as f_ico:
    f_ico.write(ico_buf.getvalue())
print("✔ [4/6] تم حفظ الأيقونة متعددة المقاسات النقية 100% PNG: branding/app.ico")

# -------------------------------------------------------------
# و) استخراج النصوص الأصيلة وبناء الشعار الكامل بدقة Ultra-HD
# -------------------------------------------------------------
# اقتصاص النصوص من صورة الـ 4K بدقة عالية جداً
typo_crop = full_img_4k.crop((860, 2300, 3280, 3040))
typo_arr = np.array(typo_crop, dtype=float)
tr, tg, tb, ta = typo_arr[:,:,0], typo_arr[:,:,1], typo_arr[:,:,2], typo_arr[:,:,3]
is_typo_grid = (ta > 0) & (np.abs(tr - tg) < 14) & (np.abs(tg - tb) < 14) & (tr > 150)
typo_arr[is_typo_grid, 3] = 0
typo_arr[:20, :, 3] = 0
typo_clean = Image.fromarray(typo_arr.astype(np.uint8), 'RGBA')
tbbox = typo_clean.getbbox()
typo_exact = typo_clean.crop(tbbox)

# النسخة البيضاء النقية من النصوص
arr_tw = np.array(typo_exact)
arr_tw[:, :, :3] = 255
typo_white = Image.fromarray(arr_tw, 'RGBA')

# دقة Ultra-HD للشعار الكامل (Retina 2K Resolution: ~2100x600 px)
target_emblem_h = 520
scale_e = target_emblem_h / emblem_exact.height
target_emblem_w = int(emblem_exact.width * scale_e)

emblem_uhd_colored = emblem_exact.resize((target_emblem_w, target_emblem_h), Image.Resampling.LANCZOS)

# إنشاء نسخة بيضاء من المجسم بدقة UHD
arr_ew = np.array(emblem_uhd_colored)
arr_ew[:, :, :3] = 255
emblem_uhd_white = Image.fromarray(arr_ew, 'RGBA')

target_typo_h = 360
scale_t = target_typo_h / typo_exact.height
target_typo_w = int(typo_exact.width * scale_t)

typo_uhd_colored = typo_exact.resize((target_typo_w, target_typo_h), Image.Resampling.LANCZOS)
typo_uhd_white = typo_white.resize((target_typo_w, target_typo_h), Image.Resampling.LANCZOS)

gap_uhd = 90
tot_w_uhd = target_emblem_w + gap_uhd + target_typo_w
tot_h_uhd = max(target_emblem_h, target_typo_h) + 60

# 1. الشعار الكامل الملون بدقة Ultra-HD
canvas_full = Image.new('RGBA', (tot_w_uhd + 80, tot_h_uhd), (0, 0, 0, 0))
ey = (tot_h_uhd - target_emblem_h) // 2
ty_pos = (tot_h_uhd - target_typo_h) // 2
canvas_full.paste(emblem_uhd_colored, (40, ey), emblem_uhd_colored)
canvas_full.paste(typo_uhd_colored, (40 + target_emblem_w + gap_uhd, ty_pos), typo_uhd_colored)

logo_full_path = os.path.join(BRANDING_DIR, 'logo_full.png')
canvas_full.save(logo_full_path, optimize=True)

# 2. الشعار الكامل الأبيض بدقة Ultra-HD
canvas_fw = Image.new('RGBA', (tot_w_uhd + 80, tot_h_uhd), (0, 0, 0, 0))
canvas_fw.paste(emblem_uhd_white, (40, ey), emblem_uhd_white)
canvas_fw.paste(typo_uhd_white, (40 + target_emblem_w + gap_uhd, ty_pos), typo_uhd_white)

logo_full_white_path = os.path.join(BRANDING_DIR, 'logo_full_white.png')
canvas_fw.save(logo_full_white_path, optimize=True)
print(f"✔ [5/6] تم حفظ الشعار الكامل بدقة Ultra-HD ({canvas_full.width}x{canvas_full.height}): branding/logo_full.png و logo_full_white.png")

# -------------------------------------------------------------
# و) التوزيع الفوري على كافة موديولات النظام
# -------------------------------------------------------------
shutil.copyfile(logo_path, os.path.join(FRONTEND_PUBLIC, 'logo.png'))
shutil.copyfile(logo_full_path, os.path.join(FRONTEND_PUBLIC, 'logo_full.png'))
shutil.copyfile(logo_white_path, os.path.join(FRONTEND_PUBLIC, 'logo_white.png'))
shutil.copyfile(logo_full_white_path, os.path.join(FRONTEND_PUBLIC, 'logo_full_white.png'))
shutil.copyfile(app_ico_path, os.path.join(FRONTEND_PUBLIC, 'favicon.ico'))

if os.path.exists(FRONTEND_DIST):
    shutil.copyfile(logo_path, os.path.join(FRONTEND_DIST, 'logo.png'))
    shutil.copyfile(logo_full_path, os.path.join(FRONTEND_DIST, 'logo_full.png'))
    shutil.copyfile(logo_white_path, os.path.join(FRONTEND_DIST, 'logo_white.png'))
    shutil.copyfile(logo_full_white_path, os.path.join(FRONTEND_DIST, 'logo_full_white.png'))
    shutil.copyfile(app_ico_path, os.path.join(FRONTEND_DIST, 'favicon.ico'))

shutil.copyfile(app_ico_path, os.path.join(DESKTOP_DIR, 'app.ico'))
shutil.copyfile(app_ico_path, os.path.join(INSTALLER_DIR, 'app.ico'))

desktop_release = os.path.join(DESKTOP_DIR, 'bin', 'Release')
if os.path.exists(desktop_release):
    shutil.copyfile(app_ico_path, os.path.join(desktop_release, 'app.ico'))
    release_dist = os.path.join(desktop_release, 'dist')
    if os.path.exists(release_dist):
        shutil.copyfile(logo_path, os.path.join(release_dist, 'logo.png'))
        shutil.copyfile(logo_full_path, os.path.join(release_dist, 'logo_full.png'))
        shutil.copyfile(logo_white_path, os.path.join(release_dist, 'logo_white.png'))
        shutil.copyfile(logo_full_white_path, os.path.join(release_dist, 'logo_full_white.png'))
        shutil.copyfile(app_ico_path, os.path.join(release_dist, 'favicon.ico'))

print("✔ [6/6] تم توزيع كافة الأصول بنجاح على Frontend, Desktop, Installer.")

# -------------------------------------------------------------
# ز) بناء وتحديث جرافيكس برنامج التثبيت (1x و 2x High-DPI)
# -------------------------------------------------------------
try:
    import subprocess
    installer_script = os.path.join(INSTALLER_DIR, 'build_installer_graphics.py')
    res = subprocess.run([sys.executable, installer_script], check=True, capture_output=True, text=True, encoding='utf-8')
    for line in res.stdout.strip().splitlines():
        print(f"   {line}")
    print("✔ [7/7] تم بناء جرافيكس معالج التثبيت بدقة فائقة 1x و 2x High-DPI بنجاح.")
except Exception as e:
    print(f"تنبيه: تعذر استدعاء build_installer_graphics: {e}")

print("=== اكتمل بناء الهوية المعتمدة بنجاح تام وبأعلى معايير النقاء ===")

