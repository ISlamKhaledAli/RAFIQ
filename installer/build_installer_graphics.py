from PIL import Image, ImageDraw, ImageFont
import os

def create_sidebar(output_path, width=164, height=314):
    img = Image.new('RGB', (width, height), (0, 36, 28))
    draw = ImageDraw.Draw(img)

    # Vertical gradient from #00372d (0, 55, 45) to #001712 (0, 23, 18)
    for y in range(height):
        ratio = y / float(height)
        r = int(0 * (1 - ratio) + 0 * ratio)
        g = int(55 * (1 - ratio) + 20 * ratio)
        b = int(45 * (1 - ratio) + 16 * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # Ambient radial glow behind the logo
    glow_center_x, glow_center_y = width // 2, 70
    for rad in range(65, 0, -1):
        alpha = int((1.0 - (rad / 65.0)) * 50)
        glow_color = (0, min(255, 65 + alpha * 2), min(255, 45 + alpha * 2))
        draw.ellipse([
            (glow_center_x - rad, glow_center_y - rad),
            (glow_center_x + rad, glow_center_y + rad)
        ], outline=glow_color)

    # Load app.ico and place scaled logo
    ico_path = os.path.join(os.path.dirname(output_path), 'app.ico')
    if os.path.exists(ico_path):
        ico = Image.open(ico_path)
        ico.seek(0)
        ico_rgba = ico.convert('RGBA')
        logo_size = 64
        ico_resized = ico_rgba.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
        img.paste(ico_resized, ((width - logo_size) // 2, 38), ico_resized)

    # Typography
    try:
        font_bold = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 16)
        font_sub = ImageFont.truetype("C:\\Windows\\Fonts\\segoeui.ttf", 9)
        font_badge = ImageFont.truetype("C:\\Windows\\Fonts\\segoeuib.ttf", 8)
    except Exception:
        font_bold = ImageFont.load_default()
        font_sub = font_bold
        font_badge = font_bold

    # Title: RAFIQ POS
    title = "RAFIQ POS"
    bbox = draw.textbbox((0, 0), title, font=font_bold)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, 118), title, fill=(255, 255, 255), font=font_bold)

    # Subtitle: Point of Sale System
    sub = "POINT OF SALE SYSTEM"
    bbox = draw.textbbox((0, 0), sub, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, 140), sub, fill=(110, 231, 183), font=font_sub)

    # Subtle divider line
    line_y = 160
    draw.line([(24, line_y), (width - 24, line_y)], fill=(0, 85, 65))

    # Feature pills / trust points
    badges = [
        "100% OFFLINE",
        "SQLITE WAL ENGINE",
        "WINDOWS 7 / 8 / 10 / 11"
    ]

    badge_y = 175
    for b in badges:
        # Draw small pill container
        pw, ph = width - 36, 22
        px = 18
        draw.rounded_rectangle([px, badge_y, px + pw, badge_y + ph], radius=5, fill=(0, 48, 38), outline=(0, 80, 60))
        # Text
        bbox = draw.textbbox((0, 0), b, font=font_badge)
        bw = bbox[2] - bbox[0]
        bh = bbox[3] - bbox[1]
        draw.text((px + (pw - bw) // 2, badge_y + (ph - bh) // 2 - 1), b, fill=(209, 250, 229), font=font_badge)
        badge_y += 28

    # Bottom watermark
    watermark = "ENTERPRISE RETAIL"
    bbox = draw.textbbox((0, 0), watermark, font=font_sub)
    tw = bbox[2] - bbox[0]
    draw.text(((width - tw) // 2, height - 24), watermark, fill=(52, 120, 95), font=font_sub)

    # Clean right edge border to separate from white page
    draw.line([(width - 1, 0), (width - 1, height)], fill=(0, 75, 55))

    img.save(output_path, 'BMP')
    print(f"Created {output_path} ({width}x{height})")

def create_small_image(output_path, width=55, height=55):
    img = Image.new('RGB', (width, height), (0, 55, 45))
    draw = ImageDraw.Draw(img)

    # Subtle vertical gradient
    for y in range(height):
        ratio = y / float(height)
        g = int(55 * (1 - ratio) + 28 * ratio)
        b = int(45 * (1 - ratio) + 22 * ratio)
        draw.line([(0, y), (width, y)], fill=(0, g, b))

    # Load app.ico and place scaled logo
    ico_path = os.path.join(os.path.dirname(output_path), 'app.ico')
    if os.path.exists(ico_path):
        ico = Image.open(ico_path)
        ico.seek(0)
        ico_rgba = ico.convert('RGBA')
        logo_size = 38
        ico_resized = ico_rgba.resize((logo_size, logo_size), Image.Resampling.LANCZOS)
        img.paste(ico_resized, ((width - logo_size) // 2, (height - logo_size) // 2), ico_resized)

    img.save(output_path, 'BMP')
    print(f"Created {output_path} ({width}x{height})")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.abspath(__file__))
    create_sidebar(os.path.join(base_dir, 'wizard_sidebar.bmp'))
    create_small_image(os.path.join(base_dir, 'wizard_small.bmp'))
