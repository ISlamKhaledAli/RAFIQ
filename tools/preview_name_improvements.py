# -*- coding: utf-8 -*-
import openpyxl

wb = openpyxl.load_workbook(r'قوالب_أصناف_المحلات_Excel\01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx', data_only=True)

for name in wb.sheetnames:
    ws = wb[name]
    items = []
    for r in range(4, ws.max_row):
        val = str(ws.cell(r, 2).value or '').strip()
        if len(val) >= 50:
            items.append((r, val, len(val)))
    items.sort(key=lambda x: x[2], reverse=True)
    print(f'=== {name}: {len(items)} items >= 50 chars ===')
    for r, val, l in items[:15]:
        print(f'  R{r} ({l}): {val}')
