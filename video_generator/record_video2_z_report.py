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
TEMP_VIDEO_DIR = os.path.abspath("video_generator/renders/temp_video2")
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

  // Cursor
  let cursor = document.getElementById('__screen_studio_cursor');
  if (!cursor) {
    cursor = document.createElement('div');
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
  }

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

  // Lower-Third HUD Badge Card
  let hud = document.getElementById('__pos_hud_card');
  if (!hud) {
    hud = document.createElement('div');
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
      <div style="background: rgba(0, 43, 35, 0.92); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border: 1.5px solid rgba(0, 229, 153, 0.4); border-radius: 18px; padding: 18px 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.55); max-width: 520px; font-family: 'Cairo', system-ui, sans-serif;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <span id="__hud_step" style="background: linear-gradient(135deg, #006d41 0%, #00995c 100%); color: #ffffff; font-size: 12px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; letter-spacing: 0.5px;">1/5</span>
          <h4 id="__hud_title" style="color: #ffffff; font-size: 17px; font-weight: 800; margin: 0; line-height: 1.3;">عنوان الخطوة</h4>
        </div>
        <p id="__hud_desc" style="color: #c4e8da; font-size: 13.5px; font-weight: 500; margin: 0; line-height: 1.6;">شرح الميزة بالتفصيل...</p>
      </div>
    `;
    document.body.appendChild(hud);
  }

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

  // SFX Logger
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

def record_video2():
    print("🎬 Starting Recording for Video 2 (Z-Report & Cash Drawer Reconciliation)...")

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
        """)
        page.reload()
        page.wait_for_timeout(2000)

        # Inject studio engine
        page.evaluate(STUDIO_ENGINE_JS)
        page.wait_for_timeout(500)

        # ========================================================
        # SCENE 1: Intro & Navigation to Daily Closing (F11)
        # ========================================================
        print("Scene 1: Opening Daily Closing Modal from Dashboard...")
        page.evaluate("""
          window.__SHOW_HUD('1/5', 'إقفال اليومية ومطابقة الخزينة', 'صمام الأمان المالي لمتجرك في نهاية كل وردية، مطابقة بالمليم وطباعة تقرير Z-Report.');
          window.__MOVE_CURSOR_TO_POINT(1750, 200);
        """)
        page.wait_for_timeout(1800)

        # Click Dashboard in navigation
        dash_nav = page.locator("button:has-text('لوحة اليوم والمتابعة'), button:has(svg.lucide-layout-dashboard)").first
        box = dash_nav.bounding_box()
        if box:
            page.evaluate(f"window.__MOVE_CURSOR_TO_POINT({box['x'] + box['width']/2}, {box['y'] + box['height']/2});")
        page.wait_for_timeout(600)
        page.evaluate("window.__TRIGGER_CLICK_ANIM(); window.__LOG_SFX('click');")
        dash_nav.click()
        page.wait_for_timeout(1000)

        # Move to "قفل اليومية (Z)" button
        closing_btn = page.locator("button:has-text('قفل اليومية')").first
        cbox = closing_btn.bounding_box()
        if cbox:
            cx, cy = cbox['x'] + cbox['width']/2, cbox['y'] + cbox['height']/2
            page.evaluate(f"window.__ZOOM_TO_POINT({cx}, {cy}, 1.25); window.__MOVE_CURSOR_TO_POINT({cx}, {cy});")
        page.wait_for_timeout(1200)
        page.evaluate("window.__TRIGGER_CLICK_ANIM(); window.__LOG_SFX('click');")
        closing_btn.click(force=True)
        page.wait_for_timeout(1800)

        # ========================================================
        # SCENE 2: The 4 Financial Summary Cards
        # ========================================================
        print("Scene 2: Inspecting Automated Financial Summary Cards...")
        page.evaluate("""
          window.__RESET_ZOOM();
          window.__SHOW_HUD('2/5', 'الملخص المالي المحسوب آلياً', 'حساب تلقائي دقيق للمبيعات الكاش، مبيعات الآجل، المرتجعات، وسداد الديون مع عدد الفواتير المنفذة.');
          window.__MOVE_CURSOR_TO_POINT(960, 360);
          window.__LOG_SFX('chime');
        """)
        page.wait_for_timeout(1500)

        # Zoom into the financial summary grid
        fin_grid = page.locator("div:has-text('إجمالي المبيعات')").first
        gbox = fin_grid.bounding_box()
        if gbox:
            page.evaluate(f"window.__ZOOM_TO_POINT(960, 400, 1.30); window.__MOVE_CURSOR_TO_POINT(1250, 420);")
        page.wait_for_timeout(1800)
        page.evaluate("window.__MOVE_CURSOR_TO_POINT(700, 420);")
        page.wait_for_timeout(1500)

        # ========================================================
        # SCENE 3: Counting Cash & Discrepancy Detection
        # ========================================================
        print("Scene 3: Drawer Cash Counting & Live Discrepancy Calculation...")
        page.evaluate("""
          window.__SHOW_HUD('3/5', 'جرد نقدية الدرج ومطابقة الفارق', 'عد النقود الفعلية في الدرج وإدخالها فوراً لكشف أي عجز أو زيادة بالقرش في سجل الرقابة.');
          window.__ZOOM_TO_POINT(960, 580, 1.35);
        """)
        page.wait_for_timeout(1500)

        # Move to cash input
        cash_input = page.locator("input[placeholder='0.00'], div:has-text('النقد المعدود فعلياً') input").first
        ibox = cash_input.bounding_box()
        if ibox:
            page.evaluate(f"window.__MOVE_CURSOR_TO_POINT({ibox['x'] + ibox['width']/2}, {ibox['y'] + ibox['height']/2});")
        page.wait_for_timeout(800)
        page.evaluate("window.__TRIGGER_CLICK_ANIM(); window.__LOG_SFX('click');")
        cash_input.click(force=True)
        page.wait_for_timeout(400)

        # Step 3a: Type 4800 (deficit scenario)
        cash_input.fill("")
        cash_input.type("4800", delay=120)
        page.evaluate("window.__LOG_SFX('beep');")
        page.wait_for_timeout(1800)

        # Step 3b: Correct to 4850 (100% perfect match)
        cash_input.fill("")
        cash_input.type("4850", delay=120)
        page.evaluate("""
          window.__SHOW_HUD('3/5', 'تطابق تام بنسبة 100%', 'تحول حالة المطابقة للون الأخضر الصريح: الدرج متطابق تماماً مع حركة المبيعات والفارق 0.00 ج.م.');
          window.__LOG_SFX('chime');
        """)
        page.wait_for_timeout(2500)

        # ========================================================
        # SCENE 4: Notes and Freezing Closing Record (ACID/WAL)
        # ========================================================
        print("Scene 4: Adding Audit Note & Freezing Shift Record...")
        notes_input = page.locator("input[placeholder*='سداد مصاريف'], input[placeholder*='ملاحظات']").first
        if notes_input.count() > 0:
            nbox = notes_input.bounding_box()
            if nbox:
                page.evaluate(f"window.__MOVE_CURSOR_TO_POINT({nbox['x'] + nbox['width']/2}, {nbox['y'] + nbox['height']/2});")
            page.wait_for_timeout(600)
            notes_input.click(force=True)
            notes_input.fill("تم جرد الدرج ومطابقة النقدية مع الكاشير وتسليم العهدة بالكامل")
            page.wait_for_timeout(1000)

        # Zoom down to the action button: "اعتماد وقفل اليومية نهائياً"
        page.evaluate("""
          window.__SHOW_HUD('4/5', 'تجميد السجل وطباعة الـ Z-Report', 'تجميد الوردية في قاعدة بيانات SQLite WAL المقاومة للتعديل أو الحذف، وطباعة شريط Z-Report.');
        """)
        confirm_close_btn = page.locator("button:has-text('اعتماد وقفل اليومية')").first
        sbox = confirm_close_btn.bounding_box()
        if sbox:
            cx, cy = sbox['x'] + sbox['width']/2, sbox['y'] + sbox['height']/2
            page.evaluate(f"window.__ZOOM_TO_POINT({cx}, {cy}, 1.30); window.__MOVE_CURSOR_TO_POINT({cx}, {cy});")
        page.wait_for_timeout(1500)
        page.evaluate("window.__TRIGGER_CLICK_ANIM(); window.__LOG_SFX('click');")
        confirm_close_btn.dispatch_event('click')
        page.wait_for_timeout(1800)

        # The button now becomes "طباعة إيصال Z-Report"
        print_btn = page.locator("button:has-text('طباعة إيصال'), button:has-text('Z-Report')").first
        pbox = print_btn.bounding_box()
        if pbox:
            page.evaluate(f"window.__MOVE_CURSOR_TO_POINT({pbox['x'] + pbox['width']/2}, {pbox['y'] + pbox['height']/2});")
        page.evaluate("window.__LOG_SFX('chime');")
        page.wait_for_timeout(1200)
        page.evaluate("window.__TRIGGER_CLICK_ANIM(); window.__LOG_SFX('printer'); window.__LOG_SFX('kaching');")
        print_btn.dispatch_event('click')
        page.wait_for_timeout(2800)

        # ========================================================
        # SCENE 5: Brand Outro
        # ========================================================
        print("Scene 5: Brand Outro...")
        page.evaluate("""
          window.__RESET_ZOOM();
          window.__HIDE_HUD();
        """)
        page.wait_for_timeout(500)
        page.evaluate("""
          const outro = document.createElement('div');
          outro.id = '__brand_outro';
          outro.style.position = 'fixed';
          outro.style.inset = '0';
          outro.style.background = 'radial-gradient(circle at center, #004D3F 0%, #00221B 100%)';
          outro.style.display = 'flex';
          outro.style.flexDirection = 'column';
          outro.style.alignItems = 'center';
          outro.style.justifyContent = 'center';
          outro.style.zIndex = '99999999';
          outro.style.opacity = '0';
          outro.style.transition = 'opacity 0.8s ease-in-out';
          outro.style.color = '#ffffff';
          outro.style.fontFamily = "'Cairo', sans-serif";
          outro.style.direction = 'rtl';
          outro.innerHTML = `
            <div style="width: 88px; height: 88px; border-radius: 26px; background: rgba(0, 229, 153, 0.15); border: 2px solid #00e599; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; box-shadow: 0 0 50px rgba(0, 229, 153, 0.35);">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#00e599" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </div>
            <h1 style="font-size: 38px; font-weight: 900; margin: 0 0 12px 0; color: #ffffff; letter-spacing: -0.5px;">رفيق POS — انضباط مالي في كل وردية</h1>
            <p style="font-size: 19px; color: #a3e0c8; font-weight: 600; margin: 0 0 32px 0;">تصفية الدرج ومطابقة النقدية بالمليم مع حماية تامة ضد التلاعب</p>
            <div style="display: flex; gap: 16px;">
              <span style="background: rgba(255,255,255,0.12); padding: 8px 22px; border-radius: 9999px; font-size: 13.5px; font-weight: 700; border: 1px solid rgba(255,255,255,0.2);">🔒 تقارير Z-Report مجمدة</span>
              <span style="background: rgba(255,255,255,0.12); padding: 8px 22px; border-radius: 9999px; font-size: 13.5px; font-weight: 700; border: 1px solid rgba(255,255,255,0.2);">⚡ قاعدة بيانات SQLite WAL</span>
              <span style="background: rgba(255,255,255,0.12); padding: 8px 22px; border-radius: 9999px; font-size: 13.5px; font-weight: 700; border: 1px solid rgba(255,255,255,0.2);">🖨️ طباعة إيصال حراري فوري</span>
            </div>
          `;
          document.body.appendChild(outro);
          setTimeout(() => outro.style.opacity = '1', 50);
        """)
        page.wait_for_timeout(3500)

        # Retrieve SFX events
        sfx_events = page.evaluate("window.__POS_SFX_EVENTS")
        print(f"Total SFX Events logged for Video 2: {len(sfx_events)}")

        page.close()
        context.close()
        browser.close()

    print("✅ Screen capture complete! Locating recorded WebM for Video 2...")
    recorded_files = [os.path.join(TEMP_VIDEO_DIR, f) for f in os.listdir(TEMP_VIDEO_DIR) if f.endswith(".webm")]
    if not recorded_files:
        raise RuntimeError("No recorded WebM file found in " + TEMP_VIDEO_DIR)

    raw_video_path = recorded_files[0]
    return raw_video_path, sfx_events

def mux_final_video2(raw_video_path, sfx_events):
    print("🎵 Starting Audio Muxing for Video 2...")

    final_mp4_public = os.path.join(FINAL_OUTPUT_DIR, "video2_z_report.mp4")
    final_mp4_generator = os.path.abspath("video_generator/renders/video2_z_report.mp4")

    sfx_paths = {
        'beep': os.path.abspath("video_generator/sfx/beep.wav"),
        'click': os.path.abspath("video_generator/sfx/click.wav"),
        'chime': os.path.abspath("video_generator/sfx/chime.wav"),
        'kaching': os.path.abspath("video_generator/sfx/kaching.wav"),
        'printer': os.path.abspath("video_generator/sfx/printer.wav"),
    }
    bg_music_path = os.path.abspath("video_generator/sfx/bg_music.mp3") if os.path.exists("video_generator/sfx/bg_music.mp3") else os.path.abspath("video_generator/sfx/bg_music.wav")

    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", raw_video_path,
        "-i", bg_music_path,
    ]

    filter_complex_parts = []
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
        label = f"[sfx{idx}]"
        filter_complex_parts.append(f"[{input_index}:a]adelay={time_ms}|{time_ms},volume=0.9{label};")
        amix_inputs.append(label)
        input_index += 1

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

    print("Running FFmpeg command for Video 2...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        raise RuntimeError(f"FFmpeg failed with exit code {res.returncode}")

    shutil.copy2(final_mp4_public, final_mp4_generator)
    size_mb = os.path.getsize(final_mp4_public) / (1024 * 1024)
    print(f"🎉 VIDEO 2 CREATED SUCCESSFULLY!")
    print(f"   Location: {final_mp4_public}")
    print(f"   Size: {size_mb:.2f} MB")

if __name__ == "__main__":
    raw_video, events = record_video2()
    mux_final_video2(raw_video, events)
