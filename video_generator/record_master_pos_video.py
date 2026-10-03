import sys
import os
import json
import time
import subprocess
import shutil
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
TEMP_VIDEO_DIR = os.path.abspath("video_generator/renders/temp_recording")
FINAL_OUTPUT_DIR = os.path.abspath("frontend/public/videos")
os.makedirs(TEMP_VIDEO_DIR, exist_ok=True)
os.makedirs(FINAL_OUTPUT_DIR, exist_ok=True)

# Clean out old temp recordings
for f in os.listdir(TEMP_VIDEO_DIR):
    try:
        os.remove(os.path.join(TEMP_VIDEO_DIR, f))
    except Exception:
        pass

STUDIO_ENGINE_JS = """
(function() {
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.width = '1920px';
  document.body.style.height = '1080px';

  const root = document.getElementById('root');
  if (root) {
    root.style.transformOrigin = '0px 0px';
    root.style.transition = 'transform 0.75s cubic-bezier(0.16, 1, 0.3, 1)';
    root.style.width = '1920px';
    root.style.height = '1080px';
    root.style.willChange = 'transform';
  }

  window.__ZOOM_TO_POINT = function(cx, cy, scale = 1.35) {
    if (!root) return;
    const currentTransform = new DOMMatrix(getComputedStyle(root).transform);
    const inv = currentTransform.inverse();
    const pCenter = inv.transformPoint(new DOMPoint(cx, cy));

    let ocx = pCenter.x;
    let ocy = pCenter.y;

    let dx = 960 - ocx * scale;
    let dy = 540 - ocy * scale;

    const maxDx = 0;
    const minDx = 1920 * (1 - scale);
    const maxDy = 0;
    const minDy = 1080 * (1 - scale);

    dx = Math.max(minDx, Math.min(maxDx, dx));
    dy = Math.max(minDy, Math.min(maxDy, dy));

    root.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
  };

  window.__ZOOM_TO = function(target, scale = 1.35) {
    if (!root) return;
    let el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) {
      root.style.transform = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    window.__ZOOM_TO_POINT(rect.left + rect.width / 2, rect.top + rect.height / 2, scale);
  };

  window.__RESET_ZOOM = function() {
    if (root) root.style.transform = 'none';
  };

  // 2. Cursor
  const cursor = document.createElement('div');
  cursor.id = '__screen_studio_cursor';
  cursor.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.45));">
      <path d="M5.5 3.2L18.5 13.5L12.5 14.5L16 21L13.5 22.2L10 15.7L6 19.5V3.2Z" fill="#0f172a" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
    <div id="__cursor_ripple" style="position:absolute; top:-12px; left:-12px; width:48px; height:48px; border-radius:50%; border:3px solid #00e599; opacity:0; pointer-events:none; transition: all 0.4s ease-out;"></div>
  `;
  cursor.style.position = 'fixed';
  cursor.style.top = '0px';
  cursor.style.left = '0px';
  cursor.style.pointerEvents = 'none';
  cursor.style.zIndex = '9999999';
  cursor.style.transition = 'transform 0.48s cubic-bezier(0.2, 0.8, 0.2, 1)';
  cursor.style.transform = 'translate(960px, 540px)';
  document.body.appendChild(cursor);

  window.__MOVE_CURSOR_TO_POINT = function(x, y) {
    cursor.style.transform = `translate(${x}px, ${y}px)`;
  };

  window.__MOVE_CURSOR_TO = function(target, offsetX = 0, offsetY = 0) {
    let el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    window.__MOVE_CURSOR_TO_POINT(rect.left + rect.width / 2 + offsetX, rect.top + rect.height / 2 + offsetY);
  };

  window.__TRIGGER_CLICK_ANIM = function() {
    const ripple = document.getElementById('__cursor_ripple');
    if (!ripple) return;
    ripple.style.transform = 'scale(0.2)';
    ripple.style.opacity = '1';
    setTimeout(() => {
      ripple.style.transform = 'scale(1.8)';
      ripple.style.opacity = '0';
    }, 20);
  };

  // 3. Lower-Third HUD Badge Card
  const hud = document.createElement('div');
  hud.id = '__pos_hud_card';
  hud.style.position = 'fixed';
  hud.style.bottom = '32px';
  hud.style.right = '36px';
  hud.style.zIndex = '999999';
  hud.style.pointerEvents = 'none';
  hud.style.direction = 'rtl';
  hud.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
  hud.style.transform = 'translateY(140px)';
  hud.style.opacity = '0';
  hud.innerHTML = `
    <div style="background: rgba(0, 43, 35, 0.90); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1.5px solid rgba(0, 229, 153, 0.4); border-radius: 18px; padding: 18px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.55); max-width: 500px; font-family: 'Cairo', system-ui, sans-serif;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <span id="__hud_step" style="background: linear-gradient(135deg, #006d41 0%, #00995c 100%); color: #ffffff; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; letter-spacing: 0.5px;">1/8</span>
        <h4 id="__hud_title" style="color: #ffffff; font-size: 17px; font-weight: 800; margin: 0; line-height: 1.3;">عنوان الخطوة</h4>
      </div>
      <p id="__hud_desc" style="color: #c4e8da; font-size: 13.5px; font-weight: 500; margin: 0; line-height: 1.6;">شرح الميزة بالتفصيل...</p>
    </div>
  `;
  document.body.appendChild(hud);

  window.__SHOW_HUD = function(step, title, desc) {
    document.getElementById('__hud_step').innerText = step;
    document.getElementById('__hud_title').innerText = title;
    document.getElementById('__hud_desc').innerText = desc;
    hud.style.transform = 'translateY(0)';
    hud.style.opacity = '1';
  };

  window.__HIDE_HUD = function() {
    hud.style.transform = 'translateY(140px)';
    hud.style.opacity = '0';
  };

  // 4. SFX Logger
  window.__POS_RECORDING_START_TIME = performance.now();
  window.__POS_SFX_EVENTS = [];
  window.__LOG_SFX = function(name) {
    const elapsedSec = (performance.now() - window.__POS_RECORDING_START_TIME) / 1000.0;
    window.__POS_SFX_EVENTS.push({
      name: name,
      timeSec: elapsedSec
    });
  };
})();
"""

def record_pos_demo():
    print("🎬 Starting Master POS Studio Recording...")

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--window-size=1920,1080',
            ]
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=TEMP_VIDEO_DIR,
            record_video_size={"width": 1920, "height": 1080}
        )

        page = context.new_page()
        page.goto("http://localhost:5173")
        page.evaluate("""
          localStorage.setItem('rafiq_first_run_completed', 'true');
          localStorage.removeItem('rafiq_pos_cart_draft');
        """)
        page.reload()
        page.wait_for_timeout(2000)

        # Inject cinematic studio engine
        page.evaluate(STUDIO_ENGINE_JS)
        page.wait_for_timeout(500)

        # ---------------------------------------------------------
        # SCENE 0: POS Welcome & Overview
        # ---------------------------------------------------------
        print("  -> Scene 0: POS Overview")
        page.evaluate("""
          window.__SHOW_HUD('مرحباً بكم', 'شاشة نقاط البيع الشاملة — رفيق POS', 'نظام كاشير فائق السرعة، مصمم لخدمة محلات السوبرماركت بأعلى كفاءة وأمان مالي مطلق');
          window.__MOVE_CURSOR_TO('input[placeholder*="امسح الباركود"]');
        """)
        page.wait_for_timeout(2500)

        # ---------------------------------------------------------
        # SCENE 1: Instant Barcode Scan with Auto Layout Fix
        # ---------------------------------------------------------
        print("  -> Scene 1: Instant Barcode Scan")
        page.evaluate("""
          window.__SHOW_HUD('1/8', 'مسح الباركود الفوري وتصحيح لوحة المفاتيح', 'قراءة فورية لباركود السلع بدون لمس الماوس، مع تحويل أوتوماتيكي من الحروف العربية إلى الإنجليزية');
          window.__MOVE_CURSOR_TO('input[placeholder*="امسح الباركود"]');
          window.__ZOOM_TO('input[placeholder*="امسح الباركود"]', 1.35);
        """)
        page.wait_for_timeout(1000)

        def zoom_to(loc, scale=1.35):
            try:
                box = loc.bounding_box()
                if box:
                    cx = box['x'] + box['width'] / 2
                    cy = box['y'] + box['height'] / 2
                    page.evaluate(f"window.__ZOOM_TO_POINT({cx}, {cy}, {scale});")
            except Exception as e:
                print("zoom error:", e)

        def glide_to(loc, offset_x=0, offset_y=0):
            try:
                box = loc.bounding_box()
                if box:
                    x = box['x'] + box['width'] / 2 + offset_x
                    y = box['y'] + box['height'] / 2 + offset_y
                    page.evaluate(f"window.__MOVE_CURSOR_TO_POINT({x}, {y});")
            except Exception as e:
                print("glide error:", e)

        # ---------------------------------------------------------
        # SCENE 0: POS Welcome & Overview
        # ---------------------------------------------------------
        print("  -> Scene 0: POS Overview")
        page.evaluate("""
          window.__SHOW_HUD('مرحباً بكم', 'شاشة نقاط البيع الشاملة — رفيق POS', 'نظام كاشير فائق السرعة، مصمم لخدمة محلات السوبرماركت بأعلى كفاءة وأمان مالي مطلق');
        """)
        barcode_input = page.locator('input[placeholder*="امسح الباركود"]').first
        glide_to(barcode_input)
        page.wait_for_timeout(2500)

        # ---------------------------------------------------------
        # SCENE 1: Instant Barcode Scan with Auto Layout Fix
        # ---------------------------------------------------------
        print("  -> Scene 1: Instant Barcode Scan")
        page.evaluate("""
          window.__SHOW_HUD('1/8', 'مسح الباركود الفوري وتصحيح لوحة المفاتيح', 'قراءة فورية لباركود السلع بدون لمس الماوس، مع تحويل أوتوماتيكي من الحروف العربية إلى الإنجليزية');
        """)
        zoom_to(barcode_input, 1.35)
        glide_to(barcode_input)
        page.wait_for_timeout(1000)

        barcode_input.click()
        page.evaluate("window.__TRIGGER_CLICK_ANIM();")
        page.wait_for_timeout(300)

        # Type barcode
        barcode_input.type("6223001234567", delay=50)
        page.wait_for_timeout(400)
        page.keyboard.press("Enter")
        page.evaluate("window.__LOG_SFX('beep');")
        page.wait_for_timeout(1500)

        # ---------------------------------------------------------
        # SCENE 2: Smart Search by Name & Dropdown Suggestion
        # ---------------------------------------------------------
        print("  -> Scene 2: Smart Search by Name")
        page.evaluate("""
          window.__SHOW_HUD('2/8', 'البحث الذكي بالاسم والكود (F2)', 'البحث الفوري بأي جزء من اسم الصنف مع قائمة اقتراحات فورية واختيار الصنف بضغطة واحدة');
        """)
        glide_to(barcode_input)
        page.wait_for_timeout(800)

        barcode_input.fill("")
        barcode_input.type("شاي", delay=100)
        page.wait_for_timeout(600)

        dropdown_item = page.locator("text=شاي العروسة").first
        if dropdown_item.is_visible():
            zoom_to(dropdown_item, 1.35)
            glide_to(dropdown_item)
            page.wait_for_timeout(700)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            dropdown_item.click()
            page.evaluate("window.__LOG_SFX('beep');")
        else:
            page.keyboard.press("Enter")
            page.evaluate("window.__LOG_SFX('beep');")
        page.wait_for_timeout(1500)

        # ---------------------------------------------------------
        # SCENE 3: Fast Product Catalog & Categories
        # ---------------------------------------------------------
        print("  -> Scene 3: Fast Catalog & Categories")
        rice_card = page.locator("text=أرز مصري فاخر 1 كجم").first
        page.evaluate("""
          window.__SHOW_HUD('3/8', 'كروت الأصناف السريعة والتصنيفات', 'أزرار سريعة للأصناف الأكثر طلباً ومبيعاً، مع سهولة التنقل بين أقسام السوبرماركت بلمسة واحدة');
        """)
        if rice_card.is_visible():
            zoom_to(rice_card, 1.30)
            glide_to(rice_card)
            page.wait_for_timeout(1200)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            rice_card.click()
            page.evaluate("window.__LOG_SFX('beep');")
            page.wait_for_timeout(1500)

        # ---------------------------------------------------------
        # SCENE 4: Weighed Items & Electronic Scale Modal
        # ---------------------------------------------------------
        print("  -> Scene 4: Weighed Products & Scale Modal")
        tomato_card = page.locator("text=طماطم بلدي طازجة").first
        if tomato_card.is_visible():
            page.evaluate("""
              window.__SHOW_HUD('4/8', 'بيع الأصناف الموزونة وميزان الباركود', 'نافذة تفاعلية لإدخال الوزن بالكيلو أو الجرام مع حساب السعر الدقيق بالمليم والقرش بدون خطأ');
            """)
            zoom_to(tomato_card, 1.25)
            glide_to(tomato_card)
            page.wait_for_timeout(900)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            tomato_card.click(force=True)
            page.wait_for_timeout(1000)

            # Zoom to scale modal
            confirm_scale_btn = page.locator("button:has-text('تأكيد الوزن')").first
            if confirm_scale_btn.is_visible():
                zoom_to(confirm_scale_btn, 1.20)
                glide_to(confirm_scale_btn)
                page.wait_for_timeout(1200)
                page.evaluate("window.__TRIGGER_CLICK_ANIM();")
                confirm_scale_btn.click(force=True)
                page.evaluate("window.__LOG_SFX('chime');")
                page.wait_for_timeout(1500)

        # ---------------------------------------------------------
        # SCENE 5: Multi-Variant / Sizes & Flavors Picker
        # ---------------------------------------------------------
        print("  -> Scene 5: Multi-Variant Products")
        shirt_card = page.locator("text=قميص كاجوال رجالي فاخر").first
        if shirt_card.is_visible():
            page.evaluate("""
              window.__SHOW_HUD('5/8', 'الأصناف متعددة المقاسات والألوان', 'نافذة ذكية لاختيار المقاس واللون والنوع بسهولة تامة وبباركود منفصل لكل متغير');
            """)
            zoom_to(shirt_card, 1.25)
            glide_to(shirt_card)
            page.wait_for_timeout(1000)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            shirt_card.click(force=True)
            page.wait_for_timeout(1000)

            variant_row = page.locator("div.fixed.inset-0 button:has-text('إضافة للسلة')").first
            if variant_row.is_visible():
                zoom_to(variant_row, 1.25)
                glide_to(variant_row)
                page.wait_for_timeout(800)
                page.evaluate("window.__TRIGGER_CLICK_ANIM();")
                variant_row.click(force=True)
                page.evaluate("window.__LOG_SFX('beep');")
                page.wait_for_timeout(1000)
            
            # If dialog still open, click close X button
            modal_backdrop = page.locator("div.fixed.inset-0").first
            if modal_backdrop.is_visible():
                page.locator("div.fixed.inset-0 button").first.click(force=True)
                page.wait_for_timeout(600)

        # ---------------------------------------------------------
        # SCENE 6: Cart Controls, Quantities & Discounts
        # ---------------------------------------------------------
        print("  -> Scene 6: Cart Management & Quantities")
        qty_plus_btn = page.locator('button[title="زيادة الكمية"]').first
        page.evaluate("""
          window.__SHOW_HUD('6/8', 'التحكم في السلة وتعديل الكميات والخصم', 'تعديل الكميات بضغطة زر (+) أو (-)، وتطبيق خصومات الفاتورة مع ميزة التراجع الفوري');
        """)
        if qty_plus_btn.is_visible():
            zoom_to(qty_plus_btn, 1.35)
            glide_to(qty_plus_btn)
            page.wait_for_timeout(1200)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            qty_plus_btn.click(force=True)
            page.evaluate("window.__LOG_SFX('click');")
            page.wait_for_timeout(600)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            qty_plus_btn.click(force=True)
            page.evaluate("window.__LOG_SFX('click');")
            page.wait_for_timeout(1500)

        # ---------------------------------------------------------
        # SCENE 7: Hold Bill & Retrieve (تعليق الفواتير)
        # ---------------------------------------------------------
        print("  -> Scene 7: Hold & Retrieve Sales")
        hold_btn = page.locator('button:has-text("تعليق F6")').first
        page.evaluate("""
          window.__SHOW_HUD('7/8', 'تعليق واسترجاع الفواتير (Hold & Recall)', 'خدمة الزبائن بدون تعطيل الطابور — تعليق الفاتورة وحفظها مؤقتاً واسترجاعها بضغطة واحدة');
        """)
        if hold_btn.is_visible():
            zoom_to(hold_btn, 1.30)
            glide_to(hold_btn)
            page.wait_for_timeout(1200)
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            hold_btn.click(force=True)
            page.evaluate("window.__LOG_SFX('click');")
            page.wait_for_timeout(1800)

            # Move cursor to held bills button
            held_btn = page.locator('button:has-text("معلقة")').first
            if held_btn.is_visible():
                zoom_to(held_btn, 1.35)
                glide_to(held_btn)
                page.wait_for_timeout(1000)
                page.evaluate("window.__TRIGGER_CLICK_ANIM();")
                held_btn.click(force=True)
                page.evaluate("window.__LOG_SFX('click');")
                page.wait_for_timeout(1200)

                # Click restore bill
                restore_btn = page.locator('button:has-text("استرجاع")').first
                if restore_btn.is_visible():
                    zoom_to(restore_btn, 1.25)
                    glide_to(restore_btn)
                    page.wait_for_timeout(700)
                    page.evaluate("window.__TRIGGER_CLICK_ANIM();")
                    restore_btn.click(force=True)
                    page.evaluate("window.__LOG_SFX('chime');")
                    page.wait_for_timeout(1500)
                else:
                    page.keyboard.press("Escape")

        # ---------------------------------------------------------
        # SCENE 8: Customer Selection & Credit / Debt Option
        # ---------------------------------------------------------
        print("  -> Scene 8: Customer Accounts & Credit")
        pay_trigger = page.locator('button:has-text("طباعة"), button:has-text("نقدى")').first
        page.evaluate("""
          window.__SHOW_HUD('8/8', 'حسابات العملاء، الآجل، وسقف المديونية', 'ربط الفاتورة بدفتر ديون العميل ومتابعة سقف الائتمان وسجل المشتريات مباشرة');
        """)
        if pay_trigger.is_visible():
            zoom_to(pay_trigger, 1.30)
            glide_to(pay_trigger)
        page.wait_for_timeout(1500)

        # ---------------------------------------------------------
        # SCENE 9: Fast Cash Payment, Change Due & Receipt
        # ---------------------------------------------------------
        print("  -> Scene 9: Fast Checkout & Thermal Receipt")
        if pay_trigger.is_visible():
            page.evaluate("window.__TRIGGER_CLICK_ANIM();")
            pay_trigger.click(force=True)
            page.evaluate("window.__LOG_SFX('click');")
            page.wait_for_timeout(1200)

            # Zoom to payment modal
            confirm_pay_btn = page.locator('button:has-text("تأكيد الدفع وطباعة الفاتورة")').first
            page.evaluate("""
              window.__SHOW_HUD('التحصيل والطباعة', 'إنهاء الفاتورة وطباعة الإيصال الحراري', 'حساب الباقي بالقرش لمنع أخطاء الكاشير، فتح درج النقدية تلقائياً، وإيصال حراري فوري 80mm');
            """)
            if confirm_pay_btn.is_visible():
                zoom_to(confirm_pay_btn, 1.20)
                glide_to(confirm_pay_btn)
                page.wait_for_timeout(1200)
                page.evaluate("window.__TRIGGER_CLICK_ANIM();")
                confirm_pay_btn.click(force=True)
                page.evaluate("window.__LOG_SFX('kaching');")
                page.wait_for_timeout(1800)

            # Receipt modal is now open!
            receipt_close_btn = page.locator('button:has-text("إغلاق (Esc)")').first
            if receipt_close_btn.is_visible():
                zoom_to(receipt_close_btn, 1.20)
                page.evaluate("window.__LOG_SFX('printer');")
                page.wait_for_timeout(2500)
                glide_to(receipt_close_btn)
                page.wait_for_timeout(600)
                page.evaluate("window.__TRIGGER_CLICK_ANIM();")
                receipt_close_btn.click(force=True)
                page.wait_for_timeout(800)

        # ---------------------------------------------------------
        # SCENE 10: Outro Brand Finale
        # ---------------------------------------------------------
        print("  -> Scene 10: Brand Finale")
        page.evaluate("""
          window.__RESET_ZOOM();
          window.__SHOW_HUD('رفيق POS', 'رفيقك الأول لإدارة متجرك بأمان واحترافية', 'سرعة فائقة في البيع، استقرار تام أوفلاين، وحماية مالية مطلقة بدون أخطاء');
          window.__MOVE_CURSOR_TO_POINT(960, 540);
        """)
        page.wait_for_timeout(3000)

        # Retrieve all recorded audio events
        sfx_events = page.evaluate("window.__POS_SFX_EVENTS")
        print(f"Total SFX Events logged: {len(sfx_events)}")
        for ev in sfx_events:
            print(f"  - {ev['timeSec']:.2f}s: {ev['name']}")

        # Save event timestamps to JSON
        with open("video_generator/pos_sfx_events.json", "w", encoding="utf-8") as jf:
            json.dump(sfx_events, jf, ensure_ascii=False, indent=2)

        # Close page to ensure video is fully written to disk
        page.close()
        context.close()
        browser.close()

    print("✅ Screen capture complete! Locating recorded WebM...")
    recorded_files = [os.path.join(TEMP_VIDEO_DIR, f) for f in os.listdir(TEMP_VIDEO_DIR) if f.endswith(".webm")]
    if not recorded_files:
        raise RuntimeError("No recorded WebM file found in " + TEMP_VIDEO_DIR)

    raw_video_path = recorded_files[0]
    print(f"Raw video path: {raw_video_path}")
    return raw_video_path, sfx_events

def mux_final_video(raw_video_path, sfx_events):
    print("🎵 Starting High-End Multi-Track Audio Muxing & Encoding...")

    final_mp4_public = os.path.join(FINAL_OUTPUT_DIR, "video1_first_sale.mp4")
    final_mp4_generator = os.path.abspath("video_generator/renders/video1_first_sale.mp4")

    # Map of SFX files
    sfx_paths = {
        'beep': os.path.abspath("video_generator/sfx/beep.wav"),
        'click': os.path.abspath("video_generator/sfx/click.wav"),
        'chime': os.path.abspath("video_generator/sfx/chime.wav"),
        'kaching': os.path.abspath("video_generator/sfx/kaching.wav"),
        'printer': os.path.abspath("video_generator/sfx/printer.wav"),
    }
    bg_music_path = os.path.abspath("video_generator/sfx/bg_music.mp3") if os.path.exists("video_generator/sfx/bg_music.mp3") else os.path.abspath("video_generator/sfx/bg_music.wav")

    # Build FFmpeg command with filter_complex
    # Input 0: Raw video
    # Input 1: Background ambient music
    # Inputs 2..N: SFX instances
    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", raw_video_path,
        "-i", bg_music_path,
    ]

    filter_complex_parts = []
    # Background music lowered to subtle ambient -22dB
    filter_complex_parts.append("[1:a]volume=0.08[bg];")

    amix_inputs = ["[bg]"]

    input_index = 2
    for idx, ev in enumerate(sfx_events):
        sfx_name = ev.get('name')
        if sfx_name not in sfx_paths:
            continue
        sfx_file = sfx_paths[sfx_name]
        time_ms = int(ev.get('timeSec', 0) * 1000)

        cmd.extend(["-i", sfx_file])

        # Delay audio by time_ms
        label = f"[sfx{idx}]"
        filter_complex_parts.append(f"[{input_index}:a]adelay={time_ms}|{time_ms},volume=0.9{label};")
        amix_inputs.append(label)
        input_index += 1

    # Mix all audio streams
    total_mix = len(amix_inputs)
    filter_complex_parts.append(f"{''.join(amix_inputs)}amix=inputs={total_mix}:duration=first:dropout_transition=2[aout]")

    full_filter = "".join(filter_complex_parts)

    cmd.extend([
        "-filter_complex", full_filter,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        final_mp4_public
    ])

    print("Running FFmpeg command...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        raise RuntimeError(f"FFmpeg failed with exit code {res.returncode}")

    # Copy to generator folder as well
    shutil.copy2(final_mp4_public, final_mp4_generator)

    size_mb = os.path.getsize(final_mp4_public) / (1024 * 1024)
    print(f"🎉 MASTER VIDEO CREATED SUCCESSFULLY!")
    print(f"   Location: {final_mp4_public}")
    print(f"   Size: {size_mb:.2f} MB")
    print(f"   Resolution: 1080p 60fps, AAC 192k, H.264 High Profile")

if __name__ == "__main__":
    raw_video, events = record_pos_demo()
    mux_final_video(raw_video, events)
