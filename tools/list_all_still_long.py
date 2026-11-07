# -*- coding: utf-8 -*-
import openpyxl
from test_name_cleaner import clean_item_name

wb = openpyxl.load_workbook(r'قوالب_أصناف_المحلات_Excel\01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx', data_only=True)

all_still_long = []
for name in wb.sheetnames:
    ws = wb[name]
    for r in range(4, ws.max_row):
        val = str(ws.cell(r, 2).value or '').strip()
        cleaned = clean_item_name(val)
        if len(cleaned) >= 65:
            all_still_long.append((name, r, val, cleaned, len(cleaned)))

print(f'Total still >= 65 chars: {len(all_still_long)}')
for item in all_still_long:
    print(f'[{item[0]} R{item[1]}] ({item[4]} chars):\n   ORIG: {item[2]}\n   CLEAN: {item[3]}')
