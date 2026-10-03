import asyncio
import os
import sys
import json
import subprocess
import shutil
import edge_tts
import imageio_ffmpeg

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = "ar-EG-ShakirNeural"
TEMP_VOICE_DIR = os.path.abspath("video_generator/voiceovers")
os.makedirs(TEMP_VOICE_DIR, exist_ok=True)

SCRIPTS = {
    "video1": {
        "video_input": os.path.abspath("video_generator/renders/video1_first_sale.mp4"),
        "final_output": os.path.abspath("frontend/public/videos/video1_first_sale.mp4"),
        "backup_output": os.path.abspath("video_generator/renders/video1_first_sale.mp4"),
        "segments": [
            ("v1_seg1", "في شاشة البيع، مرر الباركود وهتلاقي الصنف نزل في السلة فوراً، مع تصحيح تلقائي للوحة المفاتيح العربية بدون أي أخطاء.", 0.5),
            ("v1_seg2", "اضغط F2 للبحث السريع بالاسم، واختار الصنف بالأسهم و Enter بدون ما تلمس الماوس.", 10.0),
            ("v1_seg3", "تقدر تختار من أقسام الأصناف، وبالنسبة للموزونات، نافذة الميزان بتحسب الوزن الصافي والسعر بالمليم.", 15.0),
            ("v1_seg4", "الأصناف متعددة المقاسات والنكهات بتحدد خياراتها بضغطة واحدة، وتقدر تعدل الكمية وتضيف خصم بسهولة.", 22.0),
            ("v1_seg5", "تقدر تعلق الفاتورة بـ F6 عشان تخدم عميل تاني، وترجعها بكامل أصنافها في ثانية واحدة.", 28.5),
            ("v1_seg6", "أدخل المبلغ المستلم في السداد النقدي، البرنامج يحسب الباقي، ويفتح درج النقدية ويطبع إيصال 80mm فوراً.", 32.5),
            ("v1_seg7", "رفيق POS، سرعة واستقرار وأمان في كل عملية بيع.", 41.5)
        ]
    },
    "video2": {
        "video_input": os.path.abspath("video_generator/renders/video2_z_report.mp4"),
        "final_output": os.path.abspath("frontend/public/videos/video2_z_report.mp4"),
        "backup_output": os.path.abspath("video_generator/renders/video2_z_report.mp4"),
        "segments": [
            ("v2_seg1", "في نهاية الوردية وقبل ما تسلم العهدة، بنفتح شاشة إقفال اليومية ومطابقة الخزينة Z-Report.", 0.5),
            ("v2_seg2", "النظام بيحسبلك تلقائياً مبيعات الكاش، ومبيعات الآجل، والمرتجعات، والنقدية المفترض وجودها في الدرج.", 7.0),
            ("v2_seg3", "بتعد الفلوس الفعلية في الدرج؛ لو فيه عجز البرنامج بينبهك بالمليم، ولما تطابق المبلغ تظهر علامة التطابق التام 100% بدون أي فروق.", 16.5),
            ("v2_seg4", "بمجرد اعتماد الإقفال، السجل بيتجمد في قاعدة البيانات المقاومة للتعديل أو الحذف SQLite WAL.", 27.5),
            ("v2_seg5", "وبيخرج شريط تقرير Z-Report مطبوع بكل التفاصيل عشان تسلم العهدة وأنت مرتاح البال.", 34.0)
        ]
    },
    "video3": {
        "video_input": os.path.abspath("video_generator/renders/video3_backup_migration.mp4"),
        "final_output": os.path.abspath("frontend/public/videos/video3_backup_migration.mp4"),
        "backup_output": os.path.abspath("video_generator/renders/video3_backup_migration.mp4"),
        "segments": [
            ("v3_seg1", "بيانات متجرك هي رأس مالك؛ حط أي فلاشة USB في الكمبيوتر وادخل على إعدادات النسخ الاحتياطي وحماية البيانات.", 0.5),
            ("v3_seg2", "بضغطة زر واحدة، بتاخد نسخة احتياطية حية مع فحص فوري لسلامة قاعدة البيانات PRAGMA Integrity Check.", 8.0),
            ("v3_seg3", "النظام بيعمل نسخ تلقائي عند قفل الوردية، ومحمي بنمط SQLite WAL المقاوم لانقطاع الكهرباء الفجائي.", 16.0),
            ("v3_seg4", "عايز تنقل المحل لجهاز جديد؟ بضغطة واحدة بتنشئ حزمة نقل متكاملة مشفرة ببصمة أمان SHA256.", 23.5),
            ("v3_seg5", "على الجهاز الجديد، بتسترجع الحزمة وتطابق الأصناف والديون والفواتير بنسبة 100% بدون ما تحتاج مبرمج.", 32.0)
        ]
    }
}

async def synthesize_all_voiceovers():
    print("🎙️ Synthesizing Natural Human Voiceover Clips (ar-EG-ShakirNeural)...")
    for vid_key, cfg in SCRIPTS.items():
        for name, text, _ in cfg["segments"]:
            file_path = os.path.join(TEMP_VOICE_DIR, f"{name}.mp3")
            if not os.path.exists(file_path):
                print(f"  - Generating {name}...")
                comm = edge_tts.Communicate(text, VOICE, rate="+1%", pitch="+0Hz")
                await comm.save(file_path)
            else:
                print(f"  - Exists: {name}")

def mux_video_with_voice(vid_key):
    cfg = SCRIPTS[vid_key]
    print(f"\n🎬 Processing {vid_key} Audio Pipeline...")

    video_input = cfg["video_input"]
    final_output = cfg["final_output"]
    backup_output = cfg["backup_output"]
    temp_out = os.path.join(TEMP_VOICE_DIR, f"{vid_key}_temp_muxed.mp4")

    # We take the video stream from video_input, and its existing audio (which has the sfx & bg music)
    # OR we mix:
    # 0: video from video_input
    # 1: audio from video_input (lowered slightly: volume=0.55 so SFX remain crisp but music doesn't clash)
    # 2..N: voiceover segments delayed to their exact start times (with volume=1.40 for prominent clear human speech)

    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", video_input,
    ]

    filter_complex_parts = []
    # Existing audio track (SFX + ambient music) gently balanced
    filter_complex_parts.append("[0:a]volume=0.55[base_audio];")
    amix_inputs = ["[base_audio]"]

    input_index = 1
    for name, _, start_sec in cfg["segments"]:
        voice_file = os.path.join(TEMP_VOICE_DIR, f"{name}.mp3")
        time_ms = int(start_sec * 1000)

        cmd.extend(["-i", voice_file])
        label = f"[v_{name}]"
        # Voiceover given clarity boost and delayed precisely
        filter_complex_parts.append(f"[{input_index}:a]volume=1.35,adelay={time_ms}|{time_ms}{label};")
        amix_inputs.append(label)
        input_index += 1

    total_mix = len(amix_inputs)
    filter_complex_parts.append(f"{''.join(amix_inputs)}amix=inputs={total_mix}:duration=first:dropout_transition=2:normalize=0[mixed];")
    filter_complex_parts.append("[mixed]loudnorm=I=-16:TP=-1.5:LRA=11[aout]")
    full_filter = "".join(filter_complex_parts)

    cmd.extend([
        "-filter_complex", full_filter,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        "-movflags", "+faststart",
        temp_out
    ])

    print(f"Running FFmpeg mux for {vid_key}...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print("FFmpeg error:", res.stderr)
        raise RuntimeError(f"FFmpeg failed for {vid_key}")

    shutil.copy2(temp_out, final_output)
    shutil.copy2(temp_out, backup_output)
    try:
        os.remove(temp_out)
    except Exception:
        pass

    size_mb = os.path.getsize(final_output) / (1024 * 1024)
    print(f"✅ {vid_key} Voiceover Muxing Complete! ({size_mb:.2f} MB)")

if __name__ == "__main__":
    asyncio.run(synthesize_all_voiceovers())
    for k in ["video1", "video2", "video3"]:
        mux_video_with_voice(k)
    print("\n🎉 ALL 3 VIDEOS NOW HAVE ULTRA-REALISTIC PROFESSIONAL HUMAN VOICEOVER!")
