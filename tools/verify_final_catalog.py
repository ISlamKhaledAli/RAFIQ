import openpyxl
import sys

sys.stdout.reconfigure(encoding='utf-8')

def is_valid_ean13(barcode_str):
    if not barcode_str:
        return False, "Empty"
    s = str(barcode_str).strip()
    if not s.isdigit():
        return False, f"Not digits: {s}"
    if len(s) == 8:
        digits = [int(c) for c in s]
        checksum = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(digits[:7]))
        check_digit = (10 - (checksum % 10)) % 10
        return check_digit == digits[7], "EAN-8"
    if len(s) == 12:
        digits = [int(c) for c in s]
        checksum = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(digits[:11]))
        check_digit = (10 - (checksum % 10)) % 10
        return check_digit == digits[11], "UPC-A"
    if len(s) == 13:
        digits = [int(c) for c in s]
        checksum = sum(d * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
        check_digit = (10 - (checksum % 10)) % 10
        return check_digit == digits[12], "EAN-13"
    if len(s) == 14:
        digits = [int(c) for c in s]
        checksum = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(digits[:13]))
        check_digit = (10 - (checksum % 10)) % 10
        return check_digit == digits[13], "GTIN-14"
    return False, f"Invalid length {len(s)}"

path = 'قوالب_أصناف_المحلات_Excel/01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx'
wb = openpyxl.load_workbook(path, data_only=False)

total_products = 0
all_barcodes = {}
invalid_barcodes = []
duplicate_barcodes = []
formula_errors = []

for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    sheet_products = 0
    
    last_r = ws.max_row
    summary_cell_a = ws.cell(last_r, 1).value
    summary_cell_b = ws.cell(last_r, 2).value
    
    for r in range(4, last_r):
        c1 = ws.cell(r, 1).value
        name = ws.cell(r, 2).value
        bc = ws.cell(r, 3).value
        price = ws.cell(r, 6).value
        cost = ws.cell(r, 7).value
        f10 = ws.cell(r, 10).value
        f11 = ws.cell(r, 11).value
        f12 = ws.cell(r, 12).value
        f13 = ws.cell(r, 13).value
        f14 = ws.cell(r, 14).value
        f15 = ws.cell(r, 15).value
        
        if not name:
            continue
            
        sheet_products += 1
        total_products += 1
        
        # Check barcode
        v, r_type = is_valid_ean13(bc)
        if not v:
            invalid_barcodes.append((sheet_name, r, name, bc, r_type))
            
        s_bc = str(bc).strip()
        if s_bc in all_barcodes:
            duplicate_barcodes.append((s_bc, name, all_barcodes[s_bc]))
        else:
            all_barcodes[s_bc] = (sheet_name, name)
            
        # Check formulas
        if f10 != f'=F{r}-G{r}':
            formula_errors.append((sheet_name, r, 'Col 10', f10))
        if f11 != f'=IF(G{r}>0, (F{r}-G{r})/G{r}, 0)':
            formula_errors.append((sheet_name, r, 'Col 11', f11))
        if f12 != f'=H{r}*G{r}':
            formula_errors.append((sheet_name, r, 'Col 12', f12))
        if f13 != f'=H{r}*F{r}':
            formula_errors.append((sheet_name, r, 'Col 13', f13))
        if f14 != f'=M{r}-L{r}':
            formula_errors.append((sheet_name, r, 'Col 14', f14))
            
    print(f"Sheet [{sheet_name}]: {sheet_products} products verified. Summary: A={summary_cell_a}, B=\"{summary_cell_b}\"")

print("=" * 60)
print(f"TOTAL PRODUCTS VERIFIED: {total_products}")
print(f"TOTAL UNIQUE BARCODES: {len(all_barcodes)}")
print(f"INVALID BARCODES: {len(invalid_barcodes)}")
print(f"DUPLICATE BARCODES: {len(duplicate_barcodes)}")
print(f"FORMULA ERRORS: {len(formula_errors)}")

if invalid_barcodes:
    print("Invalid barcodes sample:", invalid_barcodes[:5])
if duplicate_barcodes:
    print("Duplicates sample:", duplicate_barcodes[:5])
if formula_errors:
    print("Formula errors sample:", formula_errors[:5])

assert len(invalid_barcodes) == 0, "Invalid barcodes found!"
assert len(duplicate_barcodes) == 0, "Duplicates found!"
assert len(formula_errors) == 0, "Formula errors found!"
print("\n>>> ALL CHECKS PASSED 100%! EXCEL CATALOG IS COMPLETELY PRISTINE AND READY! <<<")

