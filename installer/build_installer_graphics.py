# -*- coding: utf-8 -*-
"""
رفيق POS — اسكربت بناء جرافيكس معالج التثبيت الاحترافي (Inno Setup)
يقوم بتوليد:
1. wizard_sidebar.bmp (164x314) و wizard_sidebar_2x.bmp (328x628) للشاشات عالية الدقة.
2. wizard_small.bmp (58x58) و wizard_small_2x.bmp (116x116) لترويسة معالج التثبيت.
يعتمد على تشكيل وتوصيل الحروف العربية بنسبة 100% (arabic_reshaper + bidi)
وتصميم هوية فاخرة تليق ببرامج المؤسسات الكبرى.
"""

import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

try:
    import arabic_reshaper  # type: ignore
    from bidi.algorithm import get_display  # type: ignore
    HAS_RESHAPER = True
except ImportError:
    HAS_RESHAPER = False

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BRANDING_DIR = os.path.join(BASE_DIR, 'branding')
INSTALLER_DIR = os.path.join(BASE_DIR, 'installer')

def reshape_ar(text):
    if HAS_RESHAPER:
        return get_display(arabic_reshaper.reshape(text))
    return text

def create_sidebar(output_path, width=164, height=314, is_2x=False):
    """
    إنشاء الشريط الجانبي بتصميم مؤسسي راقٍ:
    خلفية زمردية كحلية عميقة مع خطوط إرشادية خفيفة، وشعار مجسم طافٍ بهالة ضوئية،
    وتيبوجرافي عربي وإنجليزي متناسق وموصول بدقة.
    """
    scale = 2.0 if is_2x else 1.0
    w, h = width, height
    img = Image.new('RGB', (w, h), (0, 16, 12))
    draw = ImageDraw.Draw(img)

    # 1. تدرج رأسي فاخر متعدد الوقفات من الأخضر الزمردي الغامق للكحلي المسود
    for y in range(h):
        ratio = y / float(h)
        r = int(0 * (1 - ratio) + 0 * ratio)
        g = int(24 * (1 - ratio) + 52 * ratio)
        b = int(18 * (1 - ratio) + 40 * ratio)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # 2. شبكة خطوط تقنية رقيقة لإضفاء طابع برمجي حديث
    overlay = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    diag_step = int(40 * scale)
    for x in range(-h, w + h, diag_step):
        odraw.line([(x, 0), (x + h, h)], fill=(20, 220, 150, 10), width=1)
    horiz_step = int(32 * scale)
    for y in range(0, h, horiz_step):
        odraw.line([(0, y), (w, y)], fill=(0, 255, 180, 7), width=1)
    img.paste(Image.alpha_composite(Image.new('RGBA', (w, h), (0, 0, 0, 0)), overlay), (0, 0), overlay)

    # 3. هالة ضوئية زمردية محيطية خلف الشعار (Ambient Volumetric Glow)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    cx, cy = w // 2, int(165 * scale)
    max_rad = int(130 * scale)
    for rad in range(max_rad, 0, -2):
        alpha = int((1.0 - (rad / float(max_rad))) ** 1.9 * 95)
        gdraw.ellipse([(cx - rad, cy - rad), (cx + rad, cy + rad)], fill=(0, 240, 170, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(10 * scale)))
    img.paste(glow, (0, 0), glow)

    # 4. الشعار المجسم الطافي (Floating Hero Emblem)
    logo_path = os.path.join(BRANDING_DIR, 'logo.png')
    if os.path.exists(logo_path):
        emb_raw = Image.open(logo_path).convert('RGBA')
        arr_e = np.array(emb_raw, dtype=float)
        # إبراز خطوط الباركود بالأبيض الناصع لتباين فائق على الخلفية الداكنة
        is_dark = (arr_e[:, :, 3] > 60) & (arr_e[:, :, 0] < 70) & (arr_e[:, :, 1] < 70) & (arr_e[:, :, 2] < 70)
        arr_e[is_dark, :3] = 255
        arr_e[:, :, 3] = np.where(arr_e[:, :, 3] > 180, arr_e[:, :, 3], 0)

        emb_clean = Image.fromarray(arr_e.astype(np.uint8), 'RGBA')
        ebbox = emb_clean.getbbox()
        if ebbox:
            emb_clean = emb_clean.crop(ebbox)

        target_h = int(160 * scale)
        scale_e = target_h / float(emb_clean.height)
        target_w = int(emb_clean.width * scale_e)
        emb_res = emb_clean.resize((target_w, target_h), Image.Resampling.LANCZOS)
        emb_res = emb_res.filter(ImageFilter.UnsharpMask(radius=1.1, percent=140, threshold=1))

        # ظل ناعم تحت الشعار
        shadow = Image.new('RGBA', (target_w, target_h), (0, 10, 8, 255))
        shadow.putalpha(emb_res.split()[3].point(lambda p: int(p * 0.45)))
        sx = (w - target_w) // 2
        sy = cy - (target_h // 2)
        img.paste(shadow, (sx, sy + int(6 * scale)), shadow)
        img.paste(emb_res, (sx, sy), emb_res)

    # 5. التيبوجرافي والخطوط الرسمية
    try:
        font_tag = ImageFont.truetype('C:\\Windows\\Fonts\\segoeui.ttf', int(11 * scale))
        font_title_en = ImageFont.truetype('C:\\Windows\\Fonts\\segoeuib.ttf', int(31 * scale))
        font_title_ar = ImageFont.truetype('C:\\Windows\\Fonts\\tahomabd.ttf', int(21 * scale))
        font_sub = ImageFont.truetype('C:\\Windows\\Fonts\\tahoma.ttf', int(13 * scale))
        font_badge = ImageFont.truetype('C:\\Windows\\Fonts\\segoeuib.ttf', int(12 * scale))
    except Exception:
        font_title_en = ImageFont.load_default()
        font_tag = font_title_en
        font_title_ar = font_title_en
        font_sub = font_title_en
        font_badge = font_title_en

    # وسم علوي هادئ
    tag_text = reshape_ar('● نظام رفيق المعتمد لإدارة المتاجر')
    bbox = draw.textbbox((0, 0), tag_text, font=font_tag)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, int(38 * scale)), tag_text, fill=(70, 190, 150), font=font_tag)

    # العنوان الإنجليزي العريض
    title_en = 'RAFIQ POS'
    bbox = draw.textbbox((0, 0), title_en, font=font_title_en)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, int(290 * scale)), title_en, fill=(255, 255, 255), font=font_title_en)

    # العنوان العربي الموصول بحروف عربية أصيلة
    title_ar = reshape_ar('رفيق لنقاط البيع')
    bbox = draw.textbbox((0, 0), title_ar, font=font_title_ar)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, int(335 * scale)), title_ar, fill=(167, 243, 208), font=font_title_ar)

    # خط فاصل مضيء متدرج
    sep_y = int(380 * scale)
    sep_w = int(90 * scale)
    for dx in range(-sep_w // 2, sep_w // 2):
        intensity = 1.0 - abs(dx) / float(sep_w // 2)
        c_g = int(240 * intensity)
        c_b = int(180 * intensity)
        draw.point((w // 2 + dx, sep_y), fill=(0, c_g, c_b))
        if scale > 1:
            draw.point((w // 2 + dx, sep_y + 1), fill=(0, c_g, c_b))

    # النصوص التوضيحية
    sub_ar = reshape_ar('المنصة التجارية الذكية للسوبرماركت')
    bbox = draw.textbbox((0, 0), sub_ar, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, int(400 * scale)), sub_ar, fill=(210, 240, 230), font=font_sub)

    sub_en = 'Smart Supermarket Management'
    bbox = draw.textbbox((0, 0), sub_en, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((w - tw) // 2, int(426 * scale)), sub_en, fill=(125, 195, 170), font=font_sub)

    # بدج أسفل الشريط الجانبي
    pill_w, pill_h = int(246 * scale), int(38 * scale)
    px = (w - pill_w) // 2
    py = h - int(72 * scale)
    draw.rounded_rectangle([px, py, px + pill_w, py + pill_h], radius=int(19 * scale), fill=(0, 36, 26), outline=(0, 160, 115), width=1)

    badge_text = reshape_ar('نسخة المؤسسات • 100% أوفلاين')
    bbox = draw.textbbox((0, 0), badge_text, font=font_badge)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((px + (pill_w - tw) // 2, py + (pill_h - th) // 2 - int(2 * scale)), badge_text, fill=(225, 255, 242), font=font_badge)

    # حد فاصل مضيء على يمين الشريط الجانبي
    for y_p in range(h):
        intensity = math.sin(y_p / float(h) * math.pi)
        g_val = int(80 + 175 * intensity)
        b_val = int(60 + 140 * intensity)
        draw.point((w - 1, y_p), fill=(0, g_val, b_val))

    img.save(output_path, 'BMP')
    print(f"✔ تم إنشاء الشريط الجانبي: {output_path} ({width}x{height})")

def create_small_image(output_path, width=58, height=58, is_2x=False):
    """
    إنشاء أيقونة الترويسة العلوية بمعايير Inno Setup الحديثة مع دمج فائق الحدة
    بدقة 58x58 للنسخة العادية و 116x116 لنسخة High-DPI 2x.
    """
    scale = 2.0 if is_2x else 1.0
    bg = Image.new('RGB', (width, height), (255, 255, 255))

    badge_size = int(50 * scale)
    bx = (width - badge_size) // 2
    by = (height - badge_size) // 2

    # ظل ناعم خفيف تحت البدج
    shadow = Image.new('RGBA', (width, height), (255, 255, 255, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle([bx + 1, by + int(2 * scale), bx + badge_size - 1, by + badge_size], radius=int(11 * scale), fill=(0, 30, 20, 35))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=int(1.5 * scale)))

    # مجسم البدج بتدرج زمردي فخم
    squircle = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    qdraw = ImageDraw.Draw(squircle)

    smask = Image.new('L', (width, height), 0)
    smdraw = ImageDraw.Draw(smask)
    smdraw.rounded_rectangle([bx, by, bx + badge_size - 1, by + badge_size - 1], radius=int(11 * scale), fill=255)

    sgrad = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(sgrad)
    for y in range(by, by + badge_size):
        ratio = (y - by) / float(badge_size)
        r = int(0 * (1 - ratio) + 0 * ratio)
        g = int(64 * (1 - ratio) + 32 * ratio)
        b = int(50 * (1 - ratio) + 24 * ratio)
        gdraw.line([(bx, y), (bx + badge_size, y)], fill=(r, g, b, 255))

    squircle.paste(sgrad, (0, 0), smask)

    # إطار زمردي ناصع
    qdraw.rounded_rectangle([bx, by, bx + badge_size - 1, by + badge_size - 1], radius=int(11 * scale), outline=(30, 190, 140, 255), width=int(1 * scale))

    # دمج الشعار الأبيض فائق النقاء في منتصف البدج (يشغل 74% من مساحة البدج لوضوح فائق)
    logo_white_path = os.path.join(BRANDING_DIR, 'logo_white.png')
    if os.path.exists(logo_white_path):
        logo_white = Image.open(logo_white_path).convert('RGBA')
        lbbox = logo_white.getbbox()
        if lbbox:
            logo_white = logo_white.crop(lbbox)

        emb_size = int(37 * scale)
        scale_emb = emb_size / float(max(logo_white.width, logo_white.height))
        ew, eh = int(logo_white.width * scale_emb), int(logo_white.height * scale_emb)
        emblem_resized = logo_white.resize((ew, eh), Image.Resampling.LANCZOS)
        if not is_2x:
            emblem_resized = emblem_resized.filter(ImageFilter.UnsharpMask(radius=1.0, percent=140, threshold=1))
        ex = (width - ew) // 2
        ey = (height - eh) // 2
        squircle.paste(emblem_resized, (ex, ey), emblem_resized)

    # دمج الطبقات
    combined = Image.new('RGBA', (width, height), (255, 255, 255, 255))
    combined = Image.alpha_composite(combined, shadow)
    combined = Image.alpha_composite(combined, squircle)

    result = combined.convert('RGB')
    result.save(output_path, 'BMP')
    print(f"✔ تم إنشاء شعار الترويسة: {output_path} ({width}x{height})")

def build_all_graphics():
    os.makedirs(INSTALLER_DIR, exist_ok=True)
    # 1. شريط الشاشة الترحيبية (1x و 2x High-DPI)
    create_sidebar(os.path.join(INSTALLER_DIR, 'wizard_sidebar.bmp'), width=164, height=314, is_2x=False)
    create_sidebar(os.path.join(INSTALLER_DIR, 'wizard_sidebar_2x.bmp'), width=328, height=628, is_2x=True)

    # 2. أيقونة الترويسة العلوية (1x و 2x High-DPI)
    create_small_image(os.path.join(INSTALLER_DIR, 'wizard_small.bmp'), width=58, height=58, is_2x=False)
    create_small_image(os.path.join(INSTALLER_DIR, 'wizard_small_2x.bmp'), width=116, height=116, is_2x=True)

if __name__ == '__main__':
    build_all_graphics()
