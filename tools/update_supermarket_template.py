import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Rafiq POS Official Brand Identity Colors (HEX ARGB)
FOREST_DARK = 'FF00372D'     # brand-dark: #00372D
FOREST_MID = 'FF004D3F'      # brand: #004D3F
EMERALD_GREEN = 'FF006D41'   # paid: #006D41
SOFT_MINT = 'FFE6F2ED'       # brand-soft: #E6F2ED
WHITE = 'FFFFFFFF'           # surface: #FFFFFF
ZEBRA_LIGHT = 'FFF8FAFC'     # canvas: #F8FAFC
LINE_GRAY = 'FFDCE1DC'       # line: #DCE1DC
INK_DARK = 'FF0F172A'        # ink: #0F172A

FONT_FAMILY = 'Segoe UI'

# Fills
fill_title = PatternFill(start_color=FOREST_DARK, end_color=FOREST_DARK, fill_type='solid')
fill_subtitle = PatternFill(start_color=SOFT_MINT, end_color=SOFT_MINT, fill_type='solid')
fill_header = PatternFill(start_color=EMERALD_GREEN, end_color=EMERALD_GREEN, fill_type='solid')
fill_summary = PatternFill(start_color=FOREST_DARK, end_color=FOREST_DARK, fill_type='solid')
fill_zebra_even = PatternFill(start_color=WHITE, end_color=WHITE, fill_type='solid')
fill_zebra_odd = PatternFill(start_color=ZEBRA_LIGHT, end_color=ZEBRA_LIGHT, fill_type='solid')

# Fonts
font_title = Font(name=FONT_FAMILY, size=13, bold=True, color='FFFFFF')
font_subtitle = Font(name=FONT_FAMILY, size=9.5, bold=True, color='004D3F')
font_header = Font(name=FONT_FAMILY, size=10, bold=True, color='FFFFFF')
font_data_bold = Font(name=FONT_FAMILY, size=10, bold=True, color='0F172A')
font_data_regular = Font(name=FONT_FAMILY, size=10, bold=False, color='0F172A')
font_summary = Font(name=FONT_FAMILY, size=10, bold=True, color='FFFFFF')

# Alignments
align_center = Alignment(horizontal='center', vertical='center', wrap_text=False)
align_right = Alignment(horizontal='right', vertical='center', wrap_text=False)

# Borders
thin_line = Side(border_style='thin', color=LINE_GRAY)
thin_header = Side(border_style='thin', color=FOREST_MID)
border_data = Border(left=thin_line, right=thin_line, top=thin_line, bottom=thin_line)
border_header = Border(left=thin_header, right=thin_header, top=thin_header, bottom=thin_header)
border_summary = Border(left=thin_header, right=thin_header, top=thin_header, bottom=thin_header)

STANDARD_COL_WIDTHS = [
    6,   # A: م
    38,  # B: اسم الصنف *
    20,  # C: الباركود الرئيسي
    24,  # D: باركودات إضافية
    14,  # E: الوحدة
    16,  # F: سعر البيع
    16,  # G: سعر التكلفة
    16,  # H: الرصيد الافتتاحي
    16,  # I: حد الطلب الأدنى
    18,  # J: هامش الربح للقطعة
    15,  # K: نسبة الربح
    22,  # L: إجمالي قيمة التكلفة
    22,  # M: إجمالي القيمة البيعية
    22,  # N: إجمالي الربح المتوقع
    18,  # O: حالة المخزون التلقائية
    14,  # P: نسبة الضريبة
    20,  # Q: كود الصنف الداخلي
    16,  # R: اللون
    16,  # S: المقاس
    22   # T: كود التصنيف الضريبي
]

def update_catalog(file_path):
    print(f"Loading workbook: {file_path}...")
    wb = openpyxl.load_workbook(file_path, data_only=False)
    
    total_items = 0
    
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        ws.sheet_view.rightToLeft = True
        if hasattr(ws.views, 'sheetView') and len(ws.views.sheetView) > 0:
            ws.views.sheetView[0].showGridLines = True
        
        last_row = ws.max_row
        item_count = last_row - 4
        total_items += item_count
        print(f"Processing sheet [{sheet_name}]: {item_count} items (rows 4 to {last_row-1})...")
        
        # 1. Row 1: Title Banner
        ws.row_dimensions[1].height = 40
        for col in range(1, 21):
            cell = ws.cell(1, col)
            cell.fill = fill_title
            cell.font = font_title
            cell.alignment = align_center
            
        # 2. Row 2: Subtitle Banner
        ws.row_dimensions[2].height = 26
        for col in range(1, 21):
            cell = ws.cell(2, col)
            cell.fill = fill_subtitle
            cell.font = font_subtitle
            cell.alignment = align_center
            
        # 3. Row 3: Headers
        ws.row_dimensions[3].height = 32
        for col in range(1, 21):
            cell = ws.cell(3, col)
            cell.fill = fill_header
            cell.font = font_header
            cell.alignment = align_center
            cell.border = border_header
            
        # 4. Data Rows (4 to last_row - 1)
        for r in range(4, last_row):
            ws.row_dimensions[r].height = 22
            is_odd = (r % 2 == 1)
            row_fill = fill_zebra_odd if is_odd else fill_zebra_even
            
            # Reset Tax (col 16) to 0
            cell_tax = ws.cell(r, 16)
            cell_tax.value = 0
            cell_tax.number_format = '0'
            
            # Clear Color (col 18) and Size (col 19)
            cell_color = ws.cell(r, 18)
            cell_color.value = None
            cell_color.number_format = '@'
            
            cell_size = ws.cell(r, 19)
            cell_size.value = None
            cell_size.number_format = '@'
            
            # Apply cell-by-cell styles
            for col in range(1, 21):
                cell = ws.cell(r, col)
                cell.fill = row_fill
                cell.border = border_data
                
                # Name column (2) is bold & right-aligned
                if col == 2:
                    cell.font = font_data_bold
                    cell.alignment = align_right
                else:
                    cell.font = font_data_regular
                    cell.alignment = align_center
                    
                # Ensure Barcode & SKU text format
                if col in (3, 4, 17, 20):
                    cell.number_format = '@'
                elif col in (6, 7, 10, 12, 13, 14):
                    cell.number_format = '#,##0.00'
                elif col in (8, 9):
                    cell.number_format = '#,##0'
                elif col == 11:
                    cell.number_format = '0.0%'
                    
        # 5. Summary Row (last_row)
        ws.row_dimensions[last_row].height = 28
        for col in range(1, 21):
            cell = ws.cell(last_row, col)
            cell.fill = fill_summary
            cell.font = font_summary
            cell.alignment = align_center
            cell.border = border_summary
            
            # Maintain number formatting on formulas
            if col in (6, 7, 10, 12, 13, 14):
                cell.number_format = '#,##0.00'
            elif col in (8, 9):
                cell.number_format = '#,##0'
            elif col == 11:
                cell.number_format = '0.0%'
                
        # 6. Column widths
        for idx, width in enumerate(STANDARD_COL_WIDTHS, start=1):
            col_letter = get_column_letter(idx)
            ws.column_dimensions[col_letter].width = width
            
    print(f"Saving workbook to {file_path}...")
    wb.save(file_path)
    print(f"Done! Successfully updated {total_items} items across {len(wb.sheetnames)} sheets.")

if __name__ == '__main__':
    target_path = 'قوالب_أصناف_المحلات_Excel/01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx'
    update_catalog(target_path)

