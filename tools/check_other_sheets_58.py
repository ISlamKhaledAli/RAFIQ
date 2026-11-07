# -*- coding: utf-8 -*-
import openpyxl
from test_name_cleaner import clean_item_name

wb = openpyxl.load_workbook(r'قوالب_أصناف_المحلات_Excel\01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx', data_only=True)

for name in ['ألبان وأجبان', 'معلبات وبقوليات', 'بسكويت وحلويات', 'مشروبات وعصائر', 'مجمدات']:
    ws = wb[name]
    items = []
    for r in range(4, ws.max_row):
        val = str(ws.cell(r, 2).value or '').strip()
        cleaned = clean_item_name(val)
        if len(cleaned) >= 58:
            items.append((r, val, cleaned, len(cleaned)))
    if items:
        print(f'=== {name} ({len(items)} items >= 58 chars) ===')
        for r, orig, cl, l in items:
            print(f'R{r} ({len(orig)} -> {l}):\n   {orig}\n   -> {cl}')
