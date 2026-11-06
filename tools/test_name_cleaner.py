# -*- coding: utf-8 -*-
import openpyxl
import re

wb = openpyxl.load_workbook(r'قوالب_أصناف_المحلات_Excel\01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx', data_only=True)

def clean_item_name(name):
    orig = name.strip()
    s = orig
    
    # 1. Individual unit filler tags
    # Remove " - باكو فردي", " - كيس فردي", " (باكو فردي)", " عبوة فردية", etc.
    s = re.sub(r'\s*-\s*باكو فردي', '', s)
    s = re.sub(r'\s*-\s*كيس فردي', '', s)
    s = re.sub(r'\s*-\s*ظرف فردي', '', s)
    s = re.sub(r'\s*-\s*قطعة فردية', '', s)
    s = re.sub(r'\s*-\s*علبة فردية', '', s)
    s = re.sub(r'\s*-\s*زجاجة فردية', '', s)
    s = re.sub(r'\s*-\s*كوب فردي', '', s)
    s = re.sub(r'\s*-\s*دفتر فردي', '', s)
    s = re.sub(r'\s*\((باكو فردي|كيس فردي|ظرف فردي|قطعة فردية|علبة فردية|زجاجة فردية|كوب فردي|دفتر فردي)\)', '', s)
    s = re.sub(r'\s+(عبوة فردية|قطعة فردية|باكو فردي|علبة فردية|كوب فردي|كيس فردي|ظرف فردي|زجاجة فردية|علبة صفيح فردية|زجاجة بلاستيك فردية)', '', s)
    
    # 2. General fillers
    s = re.sub(r'\s*-\s*باكو كبير', '', s)
    
    # 3. Nescafe / Instant coffee simplification
    # "قهوة سريعة التحضير نسكافيه" -> "نسكافيه"
    s = re.sub(r'^قهوة سريعة التحضير نسكافيه\b', 'نسكافيه', s)
    # "قهوة سريعة التحضير علي كافيه" -> "علي كافيه"
    s = re.sub(r'^قهوة سريعة التحضير علي كافيه\b', 'علي كافيه', s)
    # "قهوة سريعة التحضير كوفي بريك" -> "كوفي بريك"
    s = re.sub(r'^قهوة سريعة التحضير كوفي بريك\b', 'كوفي بريك', s)
    # "قهوة سريعة التحضير بونجورنو" -> "بونجورنو"
    s = re.sub(r'^قهوة سريعة التحضير بونجورنو\b', 'بونجورنو', s)
    # "قهوة سريعة التحضير مصر كافيه" -> "مصر كافيه"
    s = re.sub(r'^قهوة سريعة التحضير مصر كافيه\b', 'مصر كافيه', s)
    
    # 4. Indomie / Instant noodles simplification
    # "شعرية سريعة التحضير ... إندومي" -> "إندومي ..."
    if 'شعرية سريعة التحضير' in s and ('إندومي' in s or 'اندومي' in s):
        # Remove "شعرية سريعة التحضير" and reorganize if needed
        s = re.sub(r'^شعرية سريعة التحضير\s*', '', s)
        # remove "كيس صغير"
        s = re.sub(r'\s*كيس صغير\s*', ' صغير ', s)
        # if إندومي is at the end before paren: e.g. "بطعم الخضار إندومي (75 جم)" -> "إندومي خضار (75 جم)"
        m = re.match(r'^(?:بطعم\s+)?(.+?)\s+(إندومي|اندومي)\s*(\(.*\)|-.*)?$', s)
        if m:
            flavor = m.group(1).strip()
            # simplify flavor "الفراخ" -> "فراخ", "اللحمة" -> "لحمة", "الخضار" -> "خضار"
            flavor = re.sub(r'^بطعم\s+', '', flavor)
            flavor = re.sub(r'^ال', '', flavor)
            suffix = (' ' + m.group(3).strip()) if m.group(3) else ''
            s = f'إندومي {flavor}{suffix}'
        else:
            s = f'إندومي {s}'
            s = re.sub(r'إندومي\s+.*(إندومي|اندومي)', 'إندومي', s)
    elif 'شعرية سريعة التحضير' in s:
        s = re.sub(r'^شعرية سريعة التحضير\s*', 'نودلز ', s)

    # 5. Diapers weight range cleanup: e.g. " - 12-20ك - مقاس 5" -> " مقاس 5"
    s = re.sub(r'\s*-\s*\d+[\s\-\+]*(?:\d+)?ك\s*-\s*', ' - ', s)

    # 6. Repetitive "طويل جدا جدا" -> "طويل جداً"
    s = re.sub(r'طويل جدا جدا', 'طويل جداً', s)
    
    # 7. "مضاد التعرق رول اون" -> "مزيل عرق رول أون"
    s = re.sub(r'مضاد التعرق رول اون\s*', 'مزيل عرق رول أون ', s)

    # Cleanup whitespace and dangling hyphens
    s = re.sub(r'\s*-\s*\)', ')', s)
    s = re.sub(r'\(\s*-\s*', '(', s)
    s = re.sub(r'\(\s*\)', '', s)
    s = re.sub(r'\s{2,}', ' ', s)
    s = s.strip()
    return s

changes = []
for name in wb.sheetnames:
    ws = wb[name]
    sheet_changes = []
    for r in range(4, ws.max_row):
        val = str(ws.cell(r, 2).value or '').strip()
        cleaned = clean_item_name(val)
        if cleaned != val:
            sheet_changes.append((name, r, val, cleaned, len(val), len(cleaned)))
            changes.append((name, r, val, cleaned, len(val), len(cleaned)))
    print(f'=== Sheet [{name}]: {len(sheet_changes)} changes ===')
    for c in sheet_changes[:5]:
        print(f'   R{c[1]}: \"{c[2]}\"\n      -> \"{c[3]}\"')

print(f'\nTotal proposed improvements: {len(changes)}')

still_long = []
for name in wb.sheetnames:
    ws = wb[name]
    for r in range(4, ws.max_row):
        val = str(ws.cell(r, 2).value or '').strip()
        cleaned = clean_item_name(val)
        if len(cleaned) >= 65:
            still_long.append((name, r, cleaned, len(cleaned)))

print(f'\nItems still >= 65 chars: {len(still_long)}')
for item in still_long[:30]:
    print(f'[{item[0]} R{item[1]}] ({item[3]} chars): {item[2]}')
