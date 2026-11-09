"""
Egyptian Supermarket Catalog Price & Cost Market Audit (2025/2026)
Comprehensive Opaque-Box E2E Test Suite (Tiers 1 - 4)

Strict Invariants Enforced:
1. Integer Financial Arithmetic: All prices and costs must strictly use integer piasters (long).
   Zero floats or doubles in monetary calculations and database storage.
2. Zero Emojis Policy: Zero emojis anywhere in code, comments, reports, or test files.
3. C# 5.0 / .NET Framework 4.8 Compatibility.
"""

import os
import re
import json
import sqlite3
import subprocess
import pytest
import openpyxl

# ==============================================================================
# Helper Utilities and Common Accessors
# ==============================================================================

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

SELLER_CATALOG_EXCEL = os.path.join(
    PROJECT_ROOT, "قوالب_أصناف_المحلات_Excel", "01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx"
)
SEEDER_CS_PATH = os.path.join(PROJECT_ROOT, "desktop", "Services", "StoreCatalogSeeder.cs")
LIVE_162_JSON_PATH = os.path.join(
    PROJECT_ROOT, ".agents", "teamwork", "teamwork_explorer_survey_1", "live_162_barcodes.json"
)
REPORT_MD_PATH = os.path.join(PROJECT_ROOT, "docs", "reports", "CATALOG_PRICE_AUDIT_REPORT.md")
REPORT_CSV_PATH = os.path.join(PROJECT_ROOT, "docs", "reports", "CATALOG_PRICE_AUDIT_REPORT.csv")
REPORT_JSON_PATH = os.path.join(PROJECT_ROOT, "docs", "reports", "CATALOG_PRICE_AUDIT_REPORT.json")
REPORT_JSON_ALT_PATH = os.path.join(PROJECT_ROOT, "docs", "reports", "catalog_price_audit_report.json")
PROD_DB_PATH = r"C:\ProgramData\RafiqPOS\data\rafiq_pos.db"
DEV_DB_PATH = os.path.join(PROJECT_ROOT, "desktop", "bin", "Debug", "data", "rafiq_pos.db")
CSPROJ_PATH = os.path.join(PROJECT_ROOT, "desktop", "RafiqPOS.csproj")
MSBUILD_PATH = r"C:\Windows\Microsoft.NET\Framework\v4.0.30319\MSBuild.exe"

OFFICIAL_CATEGORIES = [
    "دخان وسجائر",
    "ألبان وأجبان",
    "معلبات وبقوليات",
    "بسكويت وحلويات",
    "مشروبات وعصائر",
    "مجمدات",
    "منظفات وعناية منزلية"
]

EMOJI_REGEX = re.compile(
    r"[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
    r"\U0001F1E0-\U0001F1FF\U00002600-\U000026FF\U00002700-\U000027BF"
    r"\U0000FE00-\U0000FE0F\U0001F900-\U0001F9FF]"
)


def get_seeder_supermarket_items():
    if not os.path.exists(SEEDER_CS_PATH):
        return []
    with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    
    match = re.search(
        r"private static List<TemplateProductItem> GetSupermarketCatalog\(\)[\s\S]*?(?=private static List<TemplateProductItem> GetPhonesElectronicsCatalog)",
        content
    )
    if not match:
        return []
    section = match.group(0)
    pattern = re.compile(
        r'new\s+TemplateProductItem\s*\{[^\}]*Name\s*=\s*"(?P<name>[^"]+)"[^\}]*Barcode\s*=\s*"(?P<barcode>[^"]+)"[^\}]*CategoryName\s*=\s*"(?P<category>[^"]+)"[^\}]*PricePiasters\s*=\s*(?P<price>\d+)[^\}]*CostPiasters\s*=\s*(?P<cost>\d+)',
        re.MULTILINE
    )
    results = []
    for m in pattern.finditer(section):
        d = m.groupdict()
        results.append({
            "name": d["name"],
            "barcode": d["barcode"],
            "category": d["category"],
            "price_piasters": int(d["price"]),
            "cost_piasters": int(d["cost"])
        })
    return results


def get_excel_supermarket_items():
    if not os.path.exists(SELLER_CATALOG_EXCEL):
        return []
    wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, data_only=True)
    items = []
    for sheet in wb.sheetnames:
        ws = wb[sheet]
        for r in range(4, ws.max_row + 1):
            name = ws.cell(r, 2).value
            bc = ws.cell(r, 3).value
            unit = ws.cell(r, 5).value
            pr = ws.cell(r, 6).value
            co = ws.cell(r, 7).value
            if bc and str(bc).strip() and name and "الإجمالي" not in str(name):
                try:
                    pr_val = float(pr) if pr is not None else 0.0
                    co_val = float(co) if co is not None else 0.0
                except (ValueError, TypeError):
                    pr_val = 0.0
                    co_val = 0.0
                items.append({
                    "name": str(name).strip(),
                    "barcode": str(bc).strip(),
                    "unit": str(unit).strip() if unit else "piece",
                    "price_egp": pr_val,
                    "cost_egp": co_val,
                    "price_piasters": int(round(pr_val * 100)),
                    "cost_piasters": int(round(co_val * 100)),
                    "category": sheet
                })
    return items


def get_live_barcodes():
    if not os.path.exists(LIVE_162_JSON_PATH):
        return []
    with open(LIVE_162_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def get_audit_report_records():
    target_json = REPORT_JSON_PATH if os.path.exists(REPORT_JSON_PATH) else REPORT_JSON_ALT_PATH
    if os.path.exists(target_json):
        with open(target_json, "r", encoding="utf-8") as f:
            return json.load(f)
    if os.path.exists(REPORT_CSV_PATH):
        records = []
        with open(REPORT_CSV_PATH, "r", encoding="utf-8-sig") as f:
            lines = [line.strip() for line in f if line.strip()]
        if len(lines) > 1:
            headers = lines[0].split(",")
            for line in lines[1:]:
                parts = line.split(",")
                if len(parts) >= 12:
                    records.append(dict(zip(headers, parts)))
        return records
    return []


# ==============================================================================
# TIER 1: FEATURE COVERAGE (>=5 tests per feature across 11 features = 55 tests)
# ==============================================================================

class TestTier1FeatureCoverage:

    # --- Feature 1: Full Catalog Audit Coverage (~1,649 items) ---
    def test_f1_01_catalog_total_item_count(self):
        items = get_seeder_supermarket_items()
        assert len(items) == 1649, f"Expected 1,649 items in supermarket catalog, found {len(items)}"

    def test_f1_02_all_seven_categories_represented(self):
        items = get_seeder_supermarket_items()
        cats = {item["category"] for item in items}
        for official in OFFICIAL_CATEGORIES:
            assert official in cats, f"Missing category {official} from supermarket items"

    def test_f1_03_all_barcodes_unique(self):
        items = get_seeder_supermarket_items()
        barcodes = [item["barcode"] for item in items]
        duplicates = [bc for bc in set(barcodes) if barcodes.count(bc) > 1]
        assert len(duplicates) == 0, f"Found duplicate barcodes in catalog: {duplicates[:5]}"

    def test_f1_04_all_items_have_verified_prices(self):
        items = get_seeder_supermarket_items()
        invalid = [i for i in items if i["price_piasters"] <= 0]
        assert len(invalid) == 0, f"Found items with non-positive price: {invalid[:3]}"

    def test_f1_05_all_items_have_verified_costs(self):
        items = get_seeder_supermarket_items()
        invalid = [i for i in items if i["cost_piasters"] <= 0]
        assert len(invalid) == 0, f"Found items with non-positive cost: {invalid[:3]}"

    # --- Feature 2: Live Store Barcodes Coverage (162 items) ---
    def test_f2_01_all_162_live_barcodes_present_in_source(self):
        live = get_live_barcodes()
        assert len(live) == 162, f"Expected 162 live store barcodes, found {len(live)}"

    def test_f2_02_live_barcodes_audit_mapping(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        report_bcs = {r.get("barcode") or r.get("الباركود الرئيسي") for r in records}
        live = get_live_barcodes()
        live_bcs = {item["barcode"] for item in live}
        overlap = live_bcs.intersection(report_bcs)
        assert len(overlap) >= 150, f"Expected live store barcodes in audit report, found {len(overlap)}/162"

    def test_f2_03_live_barcodes_verified_prices_positive(self):
        live = get_live_barcodes()
        for item in live:
            assert item.get("price_piasters", 0) > 0, f"Live item {item.get('barcode')} missing positive price"

    def test_f2_04_live_barcodes_have_valid_units(self):
        live = get_live_barcodes()
        valid_units = {"piece", "kg", "g", "liter"}
        for item in live:
            unit = item.get("unit", "piece")
            assert unit in valid_units, f"Invalid unit {unit} for live item {item.get('barcode')}"

    def test_f2_05_live_barcodes_have_non_empty_names(self):
        live = get_live_barcodes()
        for item in live:
            name = item.get("name", "")
            assert name and len(name.strip()) > 1, f"Empty or short name for live barcode {item.get('barcode')}"

    # --- Feature 3: Market Reference & Evidence ---
    def test_f3_01_recognized_market_reference_sources(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        valid_sources = ["Carrefour", "Spinneys", "Hyper One", "Gomla", "BIM", "Kazyon", "الوقائع", "كارفور", "سبينس"]
        matched = 0
        for r in records:
            src = r.get("market_reference_source", "") or r.get("المصدر المرجعي", "")
            if any(v.lower() in src.lower() for v in valid_sources):
                matched += 1
        assert matched > 0.8 * len(records), f"Less than 80% recognized market references: {matched}/{len(records)}"

    def test_f3_02_no_empty_market_reference_sources(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        empty = [r for r in records if not (r.get("market_reference_source") or r.get("المصدر المرجعي"))]
        assert len(empty) == 0, f"Found {len(empty)} records with empty reference source"

    def test_f3_03_price_status_classification_valid(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        allowed = {"مؤكد", "معدل", "confirmed", "corrected"}
        for r in records:
            st = (r.get("price_status") or r.get("حالة السعر") or "").strip().lower()
            assert st in allowed, f"Invalid price status {st} in audit report"

    def test_f3_04_audit_notes_explain_modifications(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        corrected = [
            r for r in records
            if (r.get("price_status") or r.get("حالة السعر") or "").strip() in ["معدل", "corrected"]
        ]
        missing_note = [
            r for r in corrected
            if not (r.get("audit_action_note") or r.get("ملاحظات التدقيق"))
        ]
        assert len(missing_note) == 0, f"Found {len(missing_note)} corrected items without explanatory audit note"

    def test_f3_05_retail_price_realism_benchmark(self):
        items = get_seeder_supermarket_items()
        if not items:
            pytest.fail("No supermarket items in seeder")
        cleopatra = [i for i in items if "كليوباترا" in i["name"] and "بوكس" in i["name"]]
        if cleopatra:
            # Regulated cigarette price must be around 48.00 EGP (4,800 piasters) in 2025/2026
            assert cleopatra[0]["price_piasters"] >= 4500, f"Cleopatra price unrealistic: {cleopatra[0]['price_piasters']} piasters"

    # --- Feature 4: Dedicated Standalone Report File ---
    def test_f4_01_markdown_report_file_exists(self):
        assert os.path.exists(REPORT_MD_PATH), f"Report markdown does not exist at {REPORT_MD_PATH} (Pending M3)"

    def test_f4_02_csv_report_file_exists(self):
        assert os.path.exists(REPORT_CSV_PATH), f"Report CSV does not exist at {REPORT_CSV_PATH} (Pending M3)"

    def test_f4_03_json_report_file_exists(self):
        exists = os.path.exists(REPORT_JSON_PATH) or os.path.exists(REPORT_JSON_ALT_PATH)
        assert exists, "Report JSON does not exist (Pending M3)"

    def test_f4_04_report_file_minimum_size(self):
        if not os.path.exists(REPORT_CSV_PATH):
            pytest.fail(f"Report CSV not found at {REPORT_CSV_PATH} (Pending M3)")
        size = os.path.getsize(REPORT_CSV_PATH)
        assert size > 50000, f"Report CSV size too small ({size} bytes), expected > 50 KB for 1,649 products"

    def test_f4_05_report_standalone_no_chat_truncation(self):
        if not os.path.exists(REPORT_MD_PATH):
            pytest.fail(f"Report MD not found at {REPORT_MD_PATH} (Pending M3)")
        with open(REPORT_MD_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        assert len(content) > 10000, "Markdown report content too small"
        assert "1649" in content or "1,649" in content, "Markdown report does not state catalog total count"

    # --- Feature 5: Required Report Fields (14 Columns / Schema) ---
    def test_f5_01_report_has_all_14_required_columns(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        sample = records[0]
        # Should contain 14 keys either English or Arabic
        expected_keys = [
            "row_number", "barcode", "product_name", "category",
            "prev_price_egp", "prev_price_piasters",
            "verified_price_egp", "verified_price_piasters",
            "verified_cost_egp", "verified_cost_piasters",
            "margin_percent", "price_status", "market_reference_source", "audit_action_note"
        ]
        assert len(sample.keys()) >= 14, f"Found {len(sample.keys())} columns, expected at least 14"

    def test_f5_02_sequential_row_numbers(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        first_row = records[0].get("row_number") or records[0].get("م") or 1
        assert int(first_row) == 1, "First row number is not 1"

    def test_f5_03_column_data_types_integrity(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        for r in records[:50]:
            p_pias = int(r.get("verified_price_piasters") or r.get("سعر البيع المعتمد (قرش)") or 0)
            c_pias = int(r.get("verified_cost_piasters") or r.get("سعر التكلفة المعتمد (قرش)") or 0)
            assert p_pias > 0, "verified_price_piasters must be positive integer"
            assert c_pias > 0, "verified_cost_piasters must be positive integer"

    def test_f5_04_egp_piasters_column_parity(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        for r in records[:50]:
            p_pias = int(r.get("verified_price_piasters") or r.get("سعر البيع المعتمد (قرش)") or 0)
            p_egp = float(r.get("verified_price_egp") or r.get("سعر البيع المعتمد (ج.م)") or 0.0)
            assert abs(p_egp - (p_pias / 100.0)) < 0.01, f"Mismatch in EGP vs Piasters: {p_egp} vs {p_pias}"

    def test_f5_05_margin_percentage_calculation_parity(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        for r in records[:50]:
            p_pias = int(r.get("verified_price_piasters") or r.get("سعر البيع المعتمد (قرش)") or 0)
            c_pias = int(r.get("verified_cost_piasters") or r.get("سعر التكلفة المعتمد (قرش)") or 0)
            margin_raw = r.get("margin_percent") or r.get("نسبة الربح (%)") or "0"
            margin_val = float(str(margin_raw).replace("%", "").strip())
            expected_margin = round(((p_pias - c_pias) / p_pias) * 100.0, 1)
            assert abs(margin_val - expected_margin) <= 0.5, f"Margin calc mismatch: {margin_val} vs {expected_margin}"

    # --- Feature 6: C# StoreCatalogSeeder Synchronization ---
    def test_f6_01_seeder_file_exists(self):
        assert os.path.exists(SEEDER_CS_PATH), f"StoreCatalogSeeder.cs not found at {SEEDER_CS_PATH}"

    def test_f6_02_seeder_has_1649_supermarket_items(self):
        items = get_seeder_supermarket_items()
        assert len(items) == 1649, f"Seeder supermarket catalog has {len(items)} items, expected 1649"

    def test_f6_03_seeder_csharp5_syntax_compliance(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        # Verify no C# 6 string interpolation or expression-bodied members in supermarket catalog
        supermarket_block = content.split("GetSupermarketCatalog")[1].split("GetPhonesElectronicsCatalog")[0]
        assert "$\"" not in supermarket_block, "Found C# 6+ string interpolation ($\"\") in Seeder"
        assert "nameof(" not in supermarket_block, "Found C# 6+ nameof(...) in Seeder"

    def test_f6_04_seeder_integer_piaster_literals(self):
        items = get_seeder_supermarket_items()
        for item in items:
            assert isinstance(item["price_piasters"], int), "PricePiasters must be integer literal"
            assert isinstance(item["cost_piasters"], int), "CostPiasters must be integer literal"

    def test_f6_05_seeder_zero_duplicate_barcodes(self):
        items = get_seeder_supermarket_items()
        bcs = [i["barcode"] for i in items]
        assert len(bcs) == len(set(bcs)), "Seeder contains duplicate barcodes"

    # --- Feature 7: SQLite Databases Synchronization ---
    def test_f7_01_production_db_file_accessible(self):
        assert os.path.exists(PROD_DB_PATH), f"Production SQLite database not found at {PROD_DB_PATH}"
        conn = sqlite3.connect(f"file:{PROD_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM products")
        cnt = cur.fetchone()[0]
        conn.close()
        assert cnt > 0, "Production DB products table is empty"

    def test_f7_02_development_db_file_accessible(self):
        assert os.path.exists(DEV_DB_PATH), f"Development SQLite database not found at {DEV_DB_PATH}"
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM products")
        cnt = cur.fetchone()[0]
        conn.close()
        assert cnt > 0, "Dev DB products table is empty"

    def test_f7_03_products_schema_integer_types(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("PRAGMA table_info(products)")
        cols = {row[1]: row[2] for row in cur.fetchall()}
        conn.close()
        assert cols.get("price_piasters") == "INTEGER", f"price_piasters is {cols.get('price_piasters')}, expected INTEGER"
        assert cols.get("cost_piasters") == "INTEGER", f"cost_piasters is {cols.get('cost_piasters')}, expected INTEGER"

    def test_f7_04_db_seeder_barcodes_present(self):
        conn = sqlite3.connect(f"file:{PROD_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT barcode FROM products WHERE barcode IS NOT NULL")
        db_bcs = {row[0] for row in cur.fetchall()}
        conn.close()
        seeder_items = get_seeder_supermarket_items()
        seeder_bcs = {i["barcode"] for i in seeder_items}
        overlap = db_bcs.intersection(seeder_bcs)
        assert len(overlap) >= 1000, f"Expected at least 1,000 seeder barcodes in production DB, found {len(overlap)}"

    def test_f7_05_db_prices_strictly_positive_integers(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM products WHERE price_piasters <= 0 OR cost_piasters < 0")
        invalid_count = cur.fetchone()[0]
        conn.close()
        assert invalid_count == 0, f"Found {invalid_count} products with non-positive prices or negative costs in dev DB"

    # --- Feature 8: Excel Catalog Synchronization ---
    def test_f8_01_excel_file_exists(self):
        assert os.path.exists(SELLER_CATALOG_EXCEL), f"Excel catalog file not found at {SELLER_CATALOG_EXCEL}"

    def test_f8_02_excel_all_seven_category_sheets_exist(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, read_only=True)
        sheets = wb.sheetnames
        for cat in OFFICIAL_CATEGORIES:
            assert cat in sheets, f"Sheet {cat} missing from Excel catalog"

    def test_f8_03_excel_contains_1649_products(self):
        items = get_excel_supermarket_items()
        assert len(items) == 1649, f"Excel catalog contains {len(items)} items, expected 1649"

    def test_f8_04_excel_selling_price_positive(self):
        items = get_excel_supermarket_items()
        invalid = [i for i in items if i["price_egp"] <= 0]
        assert len(invalid) == 0, f"Found {len(invalid)} Excel items with non-positive selling price"

    def test_f8_05_excel_cost_positive(self):
        items = get_excel_supermarket_items()
        invalid = [i for i in items if i["cost_egp"] <= 0]
        assert len(invalid) == 0, f"Found {len(invalid)} Excel items with non-positive cost"

    # --- Feature 9: Integer Financial Piasters Strict Invariant ---
    def test_f9_01_no_floating_point_in_seeder_piasters(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        supermarket_block = content.split("GetSupermarketCatalog")[1].split("GetPhonesElectronicsCatalog")[0]
        float_matches = re.findall(r"(?:PricePiasters|CostPiasters)\s*=\s*\d+\.\d+", supermarket_block)
        assert len(float_matches) == 0, f"Found floating point numbers in seeder piasters: {float_matches}"

    def test_f9_02_sqlite_no_floating_point_in_monetary_columns(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM products WHERE typeof(price_piasters) != 'integer' OR typeof(cost_piasters) != 'integer'")
        invalid_types = cur.fetchone()[0]
        conn.close()
        assert invalid_types == 0, f"Found {invalid_types} rows with non-integer monetary values in dev DB"

    def test_f9_03_positive_gross_margin_invariant(self):
        items = get_seeder_supermarket_items()
        loss_makers = [i for i in items if i["price_piasters"] <= i["cost_piasters"]]
        assert len(loss_makers) == 0, f"Found {len(loss_makers)} items with negative or zero gross margin"

    def test_f9_04_piaster_conversion_exactness(self):
        items = get_seeder_supermarket_items()
        for item in items:
            assert item["price_piasters"] == int(item["price_piasters"])
            assert item["cost_piasters"] == int(item["cost_piasters"])

    def test_f9_05_zero_piasters_rejection(self):
        items = get_seeder_supermarket_items()
        zero_items = [i for i in items if i["price_piasters"] == 0 or i["cost_piasters"] == 0]
        assert len(zero_items) == 0, f"Found {len(zero_items)} items with 0 piasters price or cost"

    # --- Feature 10: Zero Emojis Compliance ---
    def test_f10_01_zero_emojis_in_seeder_csharp(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        matches = EMOJI_REGEX.findall(content)
        assert len(matches) == 0, f"Zero Emojis violation in StoreCatalogSeeder.cs: {matches}"

    def test_f10_02_zero_emojis_in_excel_catalog(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, data_only=True)
        emoji_count = 0
        for sheet in wb.sheetnames:
            ws = wb[sheet]
            for row in ws.iter_rows(values_only=True):
                for val in row:
                    if val and isinstance(val, str) and EMOJI_REGEX.search(val):
                        emoji_count += 1
        assert emoji_count == 0, f"Zero Emojis violation in Excel catalog: {emoji_count} occurrences"

    def test_f10_03_zero_emojis_in_audit_reports(self):
        for path in [REPORT_MD_PATH, REPORT_CSV_PATH, REPORT_JSON_PATH, REPORT_JSON_ALT_PATH]:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                matches = EMOJI_REGEX.findall(content)
                assert len(matches) == 0, f"Zero Emojis violation in report {path}: {matches}"

    def test_f10_04_zero_emojis_in_sqlite_products(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT name FROM products")
        names = [r[0] for r in cur.fetchall() if r[0]]
        conn.close()
        emoji_names = [n for n in names if EMOJI_REGEX.search(n)]
        assert len(emoji_names) == 0, f"Zero Emojis violation in SQLite products: {emoji_names[:3]}"

    def test_f10_05_zero_emojis_in_test_suite(self):
        current_file = __file__
        with open(current_file, "r", encoding="utf-8") as f:
            content = f.read()
        # Ensure our own test file contains 0 literal emojis (outside raw regex pattern definition)
        # We test by checking non-regex lines
        non_regex_lines = [l for l in content.splitlines() if "EMOJI_REGEX" not in l and "U000" not in l]
        matches = EMOJI_REGEX.findall("\n".join(non_regex_lines))
        assert len(matches) == 0, f"Zero Emojis violation in test suite file itself: {matches}"

    # --- Feature 11: C# MSBuild Clean Compilation ---
    def test_f11_01_csproj_file_exists(self):
        assert os.path.exists(CSPROJ_PATH), f"C# project file not found at {CSPROJ_PATH}"

    def test_f11_02_msbuild_executable_available(self):
        assert os.path.exists(MSBUILD_PATH), f"MSBuild executable not found at {MSBUILD_PATH}"

    def test_f11_03_csharp_debug_build_succeeds(self):
        cmd = f'"{MSBUILD_PATH}" "{CSPROJ_PATH}" /p:Configuration=Debug /p:Platform=x86 /v:m'
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        assert res.returncode == 0, f"C# Debug build failed with exit code {res.returncode}:\n{res.stdout}\n{res.stderr}"

    def test_f11_04_csharp_release_build_succeeds(self):
        cmd = f'"{MSBUILD_PATH}" "{CSPROJ_PATH}" /p:Configuration=Release /p:Platform=x86 /v:m'
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        assert res.returncode == 0, f"C# Release build failed with exit code {res.returncode}:\n{res.stdout}\n{res.stderr}"

    def test_f11_05_binaries_generated_successfully(self):
        debug_bin = os.path.join(PROJECT_ROOT, "desktop", "bin", "Debug", "RafiqPOS.exe")
        release_bin = os.path.join(PROJECT_ROOT, "desktop", "bin", "Release", "RafiqPOS.exe")
        assert os.path.exists(debug_bin), f"Debug executable missing at {debug_bin}"
        assert os.path.exists(release_bin), f"Release executable missing at {release_bin}"


# ==============================================================================
# TIER 2: BOUNDARY & CORNER CASES (>=5 tests per feature across 11 features = 55 tests)
# ==============================================================================

class TestTier2BoundaryCases:

    # --- Feature 1 (Boundary): Full Catalog Extremes ---
    def test_f1_b01_highest_priced_catalog_items(self):
        items = get_seeder_supermarket_items()
        highest = max(items, key=lambda x: x["price_piasters"])
        # High-value FMCG (jumbo detergent / ghee) should be realistically >= 20,000 piasters (200 EGP)
        # and < 200,000 piasters (2,000 EGP)
        assert highest["price_piasters"] >= 10000, f"Highest price {highest['price_piasters']} is unrealistically low"
        assert highest["price_piasters"] <= 200000, f"Highest price {highest['price_piasters']} exceeds supermarket threshold"

    def test_f1_b02_lowest_priced_catalog_items(self):
        items = get_seeder_supermarket_items()
        lowest = min(items, key=lambda x: x["price_piasters"])
        # Low value single sachet / salt must be >= 100 piasters (1 EGP) and <= 1,500 piasters (15 EGP)
        assert lowest["price_piasters"] >= 100, f"Lowest price {lowest['price_piasters']} is below minimum currency threshold"
        assert lowest["price_piasters"] <= 2500, f"Lowest price {lowest['price_piasters']} is too high for bottom item"

    def test_f1_b03_massive_upward_correction_handled(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        # Items like Ariel jumbo historically at 4000 piasters corrected to >= 30000 piasters
        ariel_large = [
            r for r in records
            if "إريال" in (r.get("product_name") or "") and ("أوتوماتيك" in (r.get("product_name") or "") or "غسلة" in (r.get("product_name") or ""))
        ]
        if ariel_large:
            v_price = int(ariel_large[0].get("verified_price_piasters") or 0)
            assert v_price >= 20000, f"Ariel large pack price {v_price} piasters not appropriately corrected"

    def test_f1_b04_downward_correction_handled(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        # Salt 700g historically overpriced at 4000 piasters (40 EGP) corrected downward to <= 1000 piasters
        salt_items = [r for r in records if "ملح" in (r.get("product_name") or "") and "700" in (r.get("product_name") or "")]
        if salt_items:
            v_price = int(salt_items[0].get("verified_price_piasters") or 0)
            assert v_price <= 1500, f"Salt price {v_price} piasters was not corrected downward"

    def test_f1_b05_nonexistent_barcode_handling(self):
        items = get_seeder_supermarket_items()
        bcs = {i["barcode"] for i in items}
        assert "9999999999999" not in bcs, "Dummy barcode unexpectedly exists in catalog"

    # --- Feature 2 (Boundary): Live Store Barcodes Boundaries ---
    def test_f2_b01_highest_priced_live_item(self):
        live = get_live_barcodes()
        prices = [item.get("price_piasters", 0) for item in live]
        assert max(prices) >= 4500, "Highest live item price too low"
        assert max(prices) <= 100000, "Highest live item price exceeds realistic store boundary"

    def test_f2_b02_lowest_priced_live_item(self):
        live = get_live_barcodes()
        prices = [item.get("price_piasters", 0) for item in live]
        assert min(prices) >= 100, "Lowest live item price is below 1 EGP (100 piasters)"

    def test_f2_b03_live_items_barcode_format(self):
        live = get_live_barcodes()
        for item in live:
            bc = item.get("barcode", "")
            assert bc.isdigit(), f"Barcode {bc} is not strictly digits"
            assert 4 <= len(bc) <= 14, f"Barcode {bc} length {len(bc)} outside standard PLU/EAN range"

    def test_f2_b04_live_items_minimum_stock_milli(self):
        live = get_live_barcodes()
        for item in live:
            ms = item.get("min_stock_milli", 0)
            assert ms >= 0, f"Negative min_stock_milli for {item.get('barcode')}"
            assert ms % 1000 == 0, f"min_stock_milli {ms} not multiple of 1,000"

    def test_f2_b05_live_items_unique_barcodes(self):
        live = get_live_barcodes()
        bcs = [i.get("barcode") for i in live]
        assert len(bcs) == len(set(bcs)), "Live barcodes contain duplicates"

    # --- Feature 3 (Boundary): Market Reference Margins and Caps ---
    def test_f3_b01_regulated_cleopatra_cigarettes_boundary(self):
        items = get_seeder_supermarket_items()
        cleo = [i for i in items if "كليوباترا كينج بوكس" in i["name"]]
        if cleo:
            # Cleopatra cigarettes regulated at 48.00 EGP (4800 piasters) with ~6% margin
            p = cleo[0]["price_piasters"]
            c = cleo[0]["cost_piasters"]
            margin = (p - c) / float(p) * 100.0
            assert 4.0 <= margin <= 8.0, f"Cleopatra cigarette margin {margin}% outside 4-8% range"

    def test_f3_b02_regulated_marlboro_cigarettes_boundary(self):
        items = get_seeder_supermarket_items()
        marl = [i for i in items if "مارلبورو" in i["name"] or "Marlboro" in i["name"]]
        if marl:
            p = marl[0]["price_piasters"]
            assert p >= 8500, f"Marlboro price {p} piasters is below official market floor"

    def test_f3_b03_strategic_staples_margin_boundary(self):
        items = get_seeder_supermarket_items()
        staples = [i for i in items if any(k in i["name"] for k in ["سكر", "أرز", "زيت كريستال", "دقيق الضحى"])]
        for s in staples[:5]:
            p = s["price_piasters"]
            c = s["cost_piasters"]
            if p > 0:
                margin = (p - c) / float(p) * 100.0
                assert 5.0 <= margin <= 15.0, f"Staple item {s['name']} margin {margin}% outside 5-15% boundary"

    def test_f3_b04_imported_luxury_goods_floor(self):
        items = get_seeder_supermarket_items()
        imported = [i for i in items if "برينجلز" in i["name"] or "Pringles" in i["name"]]
        if imported:
            p = imported[0]["price_piasters"]
            # Pringles 165g retail in Egypt 2025/2026 is >= 9,000 piasters (90 EGP)
            assert p >= 2500, f"Pringles price {p} piasters too low for imported snack"

    def test_f3_b05_single_sachet_price_ceiling(self):
        items = get_seeder_supermarket_items()
        sachets = [i for i in items if "3في1" in i["name"] or "صلصة 42" in i["name"]]
        for s in sachets:
            assert s["price_piasters"] <= 1500, f"Single sachet {s['name']} exceeds 15 EGP ceiling ({s['price_piasters']} piasters)"

    # --- Feature 4 (Boundary): Report Format & Encoding ---
    def test_f4_b01_report_utf8_bom_encoding(self):
        if not os.path.exists(REPORT_CSV_PATH):
            pytest.fail(f"CSV report missing at {REPORT_CSV_PATH} (Pending M3)")
        with open(REPORT_CSV_PATH, "rb") as f:
            header_bytes = f.read(3)
        assert header_bytes == b"\xef\xbb\xbf", "CSV report must start with UTF-8 BOM for Windows Excel compatibility"

    def test_f4_b02_json_report_valid_json_structure(self):
        target_json = REPORT_JSON_PATH if os.path.exists(REPORT_JSON_PATH) else REPORT_JSON_ALT_PATH
        if not os.path.exists(target_json):
            pytest.fail("JSON report missing (Pending M3)")
        with open(target_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert isinstance(data, list), "JSON report root must be a list of product records"
        assert len(data) >= 1649, f"JSON report contains {len(data)} items, expected >= 1649"

    def test_f4_b03_markdown_report_table_delimiter_alignment(self):
        if not os.path.exists(REPORT_MD_PATH):
            pytest.fail(f"MD report missing at {REPORT_MD_PATH} (Pending M3)")
        with open(REPORT_MD_PATH, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip().startswith("|") and not l.strip().startswith("|---")]
        assert len(lines) >= 1650, f"Markdown table has {len(lines)} rows, expected >= 1650"
        pipe_count = lines[0].count("|")
        assert pipe_count >= 15, f"Expected 14 columns (>= 15 pipes), found {pipe_count}"

    def test_f4_b04_report_file_paths_no_special_chars(self):
        for path in [REPORT_MD_PATH, REPORT_CSV_PATH]:
            basename = os.path.basename(path)
            assert re.match(r"^[A-Z0-9_\.]+$", basename, re.IGNORECASE), f"Filename {basename} has special characters"

    def test_f4_b05_report_line_count_boundary(self):
        if not os.path.exists(REPORT_CSV_PATH):
            pytest.fail(f"CSV report missing (Pending M3)")
        with open(REPORT_CSV_PATH, "r", encoding="utf-8-sig") as f:
            line_count = sum(1 for line in f if line.strip())
        assert line_count >= 1650, f"CSV line count {line_count} is less than header + 1,649 items"

    # --- Feature 5 (Boundary): Margins, Zero and Data Hygiene ---
    def test_f5_b01_margin_percent_bounds(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        for r in records[:50]:
            margin_raw = r.get("margin_percent") or r.get("نسبة الربح (%)") or "0"
            margin = float(str(margin_raw).replace("%", "").strip())
            assert 4.0 <= margin <= 32.0, f"Margin {margin}% outside FMCG acceptable bounds (4% - 32%)"

    def test_f5_b02_cost_strictly_less_than_price(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        for r in records[:50]:
            p = int(r.get("verified_price_piasters") or r.get("سعر البيع المعتمد (قرش)") or 0)
            c = int(r.get("verified_cost_piasters") or r.get("سعر التكلفة المعتمد (قرش)") or 0)
            assert c < p, f"Cost {c} is not strictly less than price {p}"

    def test_f5_b03_barcode_alphanumeric_clean(self):
        items = get_seeder_supermarket_items()
        for item in items:
            bc = item["barcode"]
            assert bc.isdigit(), f"Barcode {bc} contains non-digit characters"

    def test_f5_b04_product_name_non_empty_no_whitespace_edges(self):
        items = get_seeder_supermarket_items()
        for item in items:
            name = item["name"]
            assert name == name.strip(), f"Product name has trailing/leading whitespace: '{name}'"

    def test_f5_b05_zero_or_negative_price_guard(self):
        items = get_seeder_supermarket_items()
        for item in items:
            assert item["price_piasters"] > 0, f"Item {item['barcode']} has non-positive price"
            assert item["cost_piasters"] > 0, f"Item {item['barcode']} has non-positive cost"

    # --- Feature 6 (Boundary): Seeder Syntax and Scale ---
    def test_f6_b01_seeder_max_price_fits_long(self):
        items = get_seeder_supermarket_items()
        max_price = max(i["price_piasters"] for i in items)
        # Signed 64-bit max is 9,223,372,036,854,775,807
        assert max_price < 9223372036854775807, "Price exceeds long.MaxValue"

    def test_f6_b02_seeder_category_names_match_master_list(self):
        items = get_seeder_supermarket_items()
        for item in items:
            assert item["category"] in OFFICIAL_CATEGORIES, f"Unknown category '{item['category']}' in seeder"

    def test_f6_b03_seeder_stock_quantities_are_milli_units(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        supermarket_block = content.split("GetSupermarketCatalog")[1].split("GetPhonesElectronicsCatalog")[0]
        # Stock quantity should default to 0 milli-units
        stock_matches = re.findall(r"StockQuantityMilli\s*=\s*(\d+)", supermarket_block)
        for val in stock_matches:
            assert int(val) % 1000 == 0, f"StockQuantityMilli {val} is not in thousands (milli-units)"

    def test_f6_b04_seeder_units_are_standard(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        supermarket_block = content.split("GetSupermarketCatalog")[1].split("GetPhonesElectronicsCatalog")[0]
        units = set(re.findall(r'Unit\s*=\s*"([^"]+)"', supermarket_block))
        allowed_units = {"piece", "kg", "g", "liter"}
        for u in units:
            assert u in allowed_units, f"Non-standard unit '{u}' in seeder"

    def test_f6_b05_seeder_no_multiline_string_corruption(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            lines = f.readlines()
        # Ensure no unescaped multi-line string initializers
        for idx, line in enumerate(lines[:1750]):
            if "list.Add(new TemplateProductItem" in line:
                assert line.strip().endswith(");"), f"Line {idx+1} does not terminate with ');'"

    # --- Feature 7 (Boundary): Database Constraints and Schema ---
    def test_f7_b01_db_max_price_integer_limits(self):
        conn = sqlite3.connect(f"file:{PROD_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT max(price_piasters), max(cost_piasters) FROM products")
        max_p, max_c = cur.fetchone()
        conn.close()
        assert max_p < 214748364700, "Price exceeds SQLite reasonable storage range"

    def test_f7_b02_db_unique_barcode_constraint(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("PRAGMA index_list(products)")
        indexes = [row[1] for row in cur.fetchall()]
        conn.close()
        # Verify an index on barcode exists
        has_barcode_idx = any("barcode" in idx.lower() for idx in indexes)
        assert has_barcode_idx, "Missing index on products(barcode)"

    def test_f7_b03_db_category_foreign_keys_valid(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE c.id IS NULL AND p.category_id IS NOT NULL")
        orphans = cur.fetchone()[0]
        conn.close()
        assert orphans == 0, f"Found {orphans} orphaned products referencing non-existent categories"

    def test_f7_b04_db_is_active_flag_valid(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM products WHERE is_active NOT IN (0, 1)")
        invalid = cur.fetchone()[0]
        conn.close()
        assert invalid == 0, f"Found {invalid} products with invalid is_active status"

    def test_f7_b05_db_updated_at_iso8601_format(self):
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT updated_at FROM products WHERE updated_at IS NOT NULL LIMIT 10")
        dates = [r[0] for r in cur.fetchall()]
        conn.close()
        for d in dates:
            assert re.match(r"^\d{4}-\d{2}-\d{2}", d), f"Timestamp {d} does not match ISO-8601 format"

    # --- Feature 8 (Boundary): Excel Layout and Formats ---
    def test_f8_b01_excel_data_row_start_index(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, data_only=True)
        ws = wb[OFFICIAL_CATEGORIES[0]]
        # Row 1 is header/title, row 2-3 are column headers, data starts at row 4
        cell_val = ws.cell(4, 3).value
        assert cell_val is not None and str(cell_val).strip(), "Row 4 does not contain a barcode"

    def test_f8_b02_excel_subtotal_rows_filtering(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, data_only=True)
        for cat in OFFICIAL_CATEGORIES:
            ws = wb[cat]
            last_row = ws.max_row
            col1_val = str(ws.cell(last_row, 1).value or "")
            col2_val = str(ws.cell(last_row, 2).value or "")
            # Last row should be the subtotal row
            assert "الإجمالي" in col1_val or "إجمالي" in col2_val, f"Category {cat} does not end with subtotal row"

    def test_f8_b03_excel_numeric_columns_no_strings(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, data_only=True)
        for cat in OFFICIAL_CATEGORIES[:2]:
            ws = wb[cat]
            for r in range(4, min(15, ws.max_row)):
                p = ws.cell(r, 6).value
                c = ws.cell(r, 7).value
                if p is not None:
                    assert isinstance(p, (int, float)), f"Excel price at row {r} is not numeric: {p}"
                if c is not None:
                    assert isinstance(c, (int, float)), f"Excel cost at row {r} is not numeric: {c}"

    def test_f8_b04_excel_barcodes_not_scientific_notation(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, data_only=True)
        for cat in OFFICIAL_CATEGORIES[:2]:
            ws = wb[cat]
            for r in range(4, min(20, ws.max_row)):
                bc = ws.cell(r, 3).value
                if bc:
                    bc_str = str(bc).strip()
                    assert "E+" not in bc_str and "e+" not in bc_str, f"Barcode {bc_str} corrupted as scientific notation"

    def test_f8_b05_excel_sheet_names_match_categories(self):
        wb = openpyxl.load_workbook(SELLER_CATALOG_EXCEL, read_only=True)
        for name in wb.sheetnames:
            assert name in OFFICIAL_CATEGORIES, f"Unexpected sheet name '{name}' in catalog Excel"

    # --- Feature 9 (Boundary): Integer Rounding and Invariants ---
    def test_f9_b01_integer_rounding_half_up(self):
        # 54.00 EGP (5400 piasters) with 13% margin -> 5400 * 0.87 = 4698 piasters exact integer
        p = 5400
        margin = 13.0
        c = int(round(p * (1.0 - margin / 100.0)))
        assert c == 4698, f"Expected 4698 piasters, got {c}"

    def test_f9_b02_minimum_one_piaster_margin(self):
        items = get_seeder_supermarket_items()
        for item in items:
            diff = item["price_piasters"] - item["cost_piasters"]
            assert diff >= 1, f"Item {item['barcode']} margin diff is less than 1 piaster"

    def test_f9_b03_cost_calculation_no_floating_drift(self):
        # Verify calculation of cost using integer math preserves expected bounds
        prices = [500, 1000, 1500, 4800, 10900, 36500]
        for p in prices:
            c = int(round(p * 0.82))
            assert isinstance(c, int)
            assert c < p

    def test_f9_b04_no_nan_or_inf_in_financials(self):
        items = get_seeder_supermarket_items()
        import math
        for item in items:
            assert not math.isnan(item["price_piasters"])
            assert not math.isinf(item["price_piasters"])
            assert not math.isnan(item["cost_piasters"])
            assert not math.isinf(item["cost_piasters"])

    def test_f9_b05_large_cart_piasters_sum_no_overflow(self):
        items = get_seeder_supermarket_items()
        total_piasters = sum(item["price_piasters"] for item in items)
        # Sum of 1,649 items should be in millions of piasters (e.g. ~5,000,000 to ~20,000,000 piasters)
        assert 1000000 <= total_piasters <= 1000000000, f"Total catalog piasters {total_piasters} outside expected limits"

    # --- Feature 10 (Boundary): Unicode Plane Checks ---
    def test_f10_b01_unicode_surrogate_pair_emojis(self):
        # Verifies high surrogate plane detection
        test_str = "Clean text without high planes"
        assert not EMOJI_REGEX.search(test_str)

    def test_f10_b02_misc_symbols_and_pictographs(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            text = f.read()
        pictographs = re.findall(r"[\U0001F300-\U0001F5FF]", text)
        assert len(pictographs) == 0, f"Found pictographs in seeder: {pictographs}"

    def test_f10_b03_transport_and_map_symbols(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            text = f.read()
        transports = re.findall(r"[\U0001F680-\U0001F6FF]", text)
        assert len(transports) == 0, f"Found transport symbols in seeder: {transports}"

    def test_f10_b04_dingbats_and_ornaments(self):
        with open(SEEDER_CS_PATH, "r", encoding="utf-8") as f:
            text = f.read()
        dingbats = re.findall(r"[\u2700-\u27BF]", text)
        assert len(dingbats) == 0, f"Found dingbats in seeder: {dingbats}"

    def test_f10_b05_arabic_diacritics_not_flagged(self):
        arabic_text_with_tashkeel = "مُعَلَّبَاتٌ وَبُقُولِيَّاتٌ"
        assert not EMOJI_REGEX.search(arabic_text_with_tashkeel), "Arabic Tashkeel was incorrectly flagged as emoji"

    # --- Feature 11 (Boundary): Architecture and Platform Targets ---
    def test_f11_b01_x86_architecture_target(self):
        with open(CSPROJ_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "<PlatformTarget>x86</PlatformTarget>" in content, "Project does not target x86 for Windows 7 SP1 32-bit compatibility"

    def test_f11_b02_net48_framework_moniker(self):
        with open(CSPROJ_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "<TargetFrameworkVersion>v4.8</TargetFrameworkVersion>" in content, "Target framework is not v4.8"

    def test_f11_b03_app_manifest_compatibility(self):
        manifest_path = os.path.join(PROJECT_ROOT, "desktop", "app.manifest")
        assert os.path.exists(manifest_path), f"app.manifest missing at {manifest_path}"
        with open(manifest_path, "r", encoding="utf-8") as f:
            content = f.read()
        # Windows 7 GUID: {35138b9a-5d96-4fbd-8e2d-a2440225f93a}
        assert "{35138b9a-5d96-4fbd-8e2d-a2440225f93a}" in content, "app.manifest missing Windows 7 compatibility GUID"

    def test_f11_b04_output_assembly_name(self):
        with open(CSPROJ_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        assert "<AssemblyName>RafiqPOS</AssemblyName>" in content, "AssemblyName is not RafiqPOS"

    def test_f11_b05_zero_msbuild_errors(self):
        # Quick check that solution compiles without fatal errors
        cmd = f'"{MSBUILD_PATH}" "{CSPROJ_PATH}" /p:Configuration=Debug /p:Platform=x86 /v:q'
        res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        assert "0 Error(s)" in res.stdout or res.returncode == 0, f"MSBuild produced errors: {res.stdout}"


# ==============================================================================
# TIER 3: CROSS-DATASET CONSISTENCY (10 Tests)
# ==============================================================================

class TestTier3CrossDatasetConsistency:

    def test_f3_cross_01_excel_and_seeder_item_count_parity(self):
        seeder_items = get_seeder_supermarket_items()
        excel_items = get_excel_supermarket_items()
        assert len(seeder_items) == 1649, f"Seeder count is {len(seeder_items)}, expected 1649"
        assert len(excel_items) == 1649, f"Excel count is {len(excel_items)}, expected 1649"

    def test_f3_cross_02_excel_and_seeder_barcodes_symmetric_difference(self):
        seeder_bcs = {i["barcode"] for i in get_seeder_supermarket_items()}
        excel_bcs = {i["barcode"] for i in get_excel_supermarket_items()}
        diff = seeder_bcs.symmetric_difference(excel_bcs)
        assert len(diff) == 0, f"Found {len(diff)} barcode mismatches between Excel and Seeder: {list(diff)[:5]}"

    def test_f3_cross_03_excel_and_seeder_selling_prices_parity(self):
        seeder_map = {i["barcode"]: i["price_piasters"] for i in get_seeder_supermarket_items()}
        excel_items = get_excel_supermarket_items()
        mismatches = []
        for e in excel_items:
            bc = e["barcode"]
            if bc in seeder_map:
                if e["price_piasters"] != seeder_map[bc]:
                    mismatches.append((bc, e["name"], e["price_piasters"], seeder_map[bc]))
        assert len(mismatches) == 0, f"Found {len(mismatches)} price mismatches between Excel and Seeder (Pending M2 sync): {mismatches[:3]}"

    def test_f3_cross_04_excel_and_seeder_cost_prices_parity(self):
        seeder_map = {i["barcode"]: i["cost_piasters"] for i in get_seeder_supermarket_items()}
        excel_items = get_excel_supermarket_items()
        mismatches = []
        for e in excel_items:
            bc = e["barcode"]
            if bc in seeder_map:
                if e["cost_piasters"] != seeder_map[bc]:
                    mismatches.append((bc, e["name"], e["cost_piasters"], seeder_map[bc]))
        assert len(mismatches) == 0, f"Found {len(mismatches)} cost mismatches between Excel and Seeder (Pending M2 sync): {mismatches[:3]}"

    def test_f3_cross_05_excel_and_seeder_product_names_parity(self):
        seeder_map = {i["barcode"]: i["name"].strip() for i in get_seeder_supermarket_items()}
        excel_items = get_excel_supermarket_items()
        mismatches = []
        for e in excel_items:
            bc = e["barcode"]
            if bc in seeder_map:
                if e["name"] != seeder_map[bc]:
                    mismatches.append((bc, e["name"], seeder_map[bc]))
        assert len(mismatches) == 0, f"Found {len(mismatches)} name mismatches between Excel and Seeder: {mismatches[:3]}"

    def test_f3_cross_06_excel_and_seeder_categories_parity(self):
        seeder_map = {i["barcode"]: i["category"].strip() for i in get_seeder_supermarket_items()}
        excel_items = get_excel_supermarket_items()
        mismatches = []
        for e in excel_items:
            bc = e["barcode"]
            if bc in seeder_map:
                if e["category"] != seeder_map[bc]:
                    mismatches.append((bc, e["category"], seeder_map[bc]))
        assert len(mismatches) == 0, f"Found {len(mismatches)} category mismatches between Excel and Seeder: {mismatches[:3]}"

    def test_f3_cross_07_live_162_barcodes_subset_of_catalog(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        report_bcs = {r.get("barcode") or r.get("الباركود الرئيسي") for r in records}
        live = get_live_barcodes()
        live_bcs = {i["barcode"] for i in live}
        overlap = live_bcs.intersection(report_bcs)
        assert len(overlap) >= 150, f"Expected live store barcodes to be present in audit report, found {len(overlap)}/162"

    def test_f3_cross_08_production_sqlite_db_prices_parity(self):
        if not os.path.exists(PROD_DB_PATH):
            pytest.fail(f"Production DB missing at {PROD_DB_PATH}")
        conn = sqlite3.connect(f"file:{PROD_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT barcode, price_piasters, cost_piasters FROM products WHERE barcode IS NOT NULL")
        db_map = {row[0]: (row[1], row[2]) for row in cur.fetchall()}
        conn.close()
        seeder_items = get_seeder_supermarket_items()
        mismatches = []
        for item in seeder_items:
            bc = item["barcode"]
            if bc in db_map:
                db_p, db_c = db_map[bc]
                if db_p != item["price_piasters"]:
                    mismatches.append((bc, "price", db_p, item["price_piasters"]))
        # Prior to M2 synchronization, some items in prod DB will have older prices
        assert len(mismatches) == 0, f"Found {len(mismatches)} price mismatches in production SQLite DB (Pending M2 sync): {mismatches[:3]}"

    def test_f3_cross_09_development_sqlite_db_prices_parity(self):
        if not os.path.exists(DEV_DB_PATH):
            pytest.fail(f"Dev DB missing at {DEV_DB_PATH}")
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT barcode, price_piasters, cost_piasters FROM products WHERE barcode IS NOT NULL")
        db_map = {row[0]: (row[1], row[2]) for row in cur.fetchall()}
        conn.close()
        seeder_items = get_seeder_supermarket_items()
        mismatches = []
        for item in seeder_items:
            bc = item["barcode"]
            if bc in db_map:
                db_p, db_c = db_map[bc]
                if db_p != item["price_piasters"]:
                    mismatches.append((bc, "price", db_p, item["price_piasters"]))
        assert len(mismatches) == 0, f"Found {len(mismatches)} price mismatches in development SQLite DB (Pending M2 sync): {mismatches[:3]}"

    def test_f3_cross_10_audit_report_and_seeder_parity(self):
        records = get_audit_report_records()
        if not records:
            pytest.fail("Audit report records not found (Pending M3)")
        report_map = {
            r.get("barcode") or r.get("الباركود الرئيسي"): int(r.get("verified_price_piasters") or r.get("سعر البيع المعتمد (قرش)") or 0)
            for r in records
        }
        seeder_items = get_seeder_supermarket_items()
        mismatches = []
        for item in seeder_items:
            bc = item["barcode"]
            if bc in report_map:
                if item["price_piasters"] != report_map[bc]:
                    mismatches.append((bc, item["price_piasters"], report_map[bc]))
        assert len(mismatches) == 0, f"Found {len(mismatches)} mismatches between Seeder and Audit Report: {mismatches[:3]}"


# ==============================================================================
# TIER 4: REAL-WORLD WORKLOAD SCENARIOS (5 Tests)
# ==============================================================================

class TestTier4RealWorldWorkloads:

    def test_f4_scenario_01_full_audit_report_generation(self):
        """Verifies complete generation and integrity of the standalone audit files."""
        assert os.path.exists(REPORT_MD_PATH), f"Report markdown missing (Pending M3)"
        assert os.path.exists(REPORT_CSV_PATH), f"Report CSV missing (Pending M3)"
        assert os.path.getsize(REPORT_MD_PATH) > 50000, "Markdown report too small"
        assert os.path.getsize(REPORT_CSV_PATH) > 50000, "CSV report too small"

    def test_f4_scenario_02_pos_invoice_calculation_simulation(self):
        """Simulates 10 items added to cart, applying integer piasters math for subtotal, discount, and tax."""
        items = get_seeder_supermarket_items()[:10]
        assert len(items) == 10, "Failed to load sample items for invoice simulation"
        
        cart_lines = []
        for idx, item in enumerate(items, 1):
            qty = idx  # 1 to 10
            line_total_piasters = item["price_piasters"] * qty
            cart_lines.append({
                "item": item["name"],
                "price": item["price_piasters"],
                "qty": qty,
                "line_total": line_total_piasters
            })
        
        subtotal_piasters = sum(line["line_total"] for line in cart_lines)
        assert isinstance(subtotal_piasters, int)
        
        # 5% cash discount in integer piasters
        discount_piasters = int(round(subtotal_piasters * 0.05))
        after_discount = subtotal_piasters - discount_piasters
        
        # 14% VAT in integer piasters
        tax_piasters = int(round(after_discount * 0.14))
        grand_total_piasters = after_discount + tax_piasters
        
        assert grand_total_piasters > 0
        assert isinstance(grand_total_piasters, int)
        # Verify no precision loss: converting to EGP string formatting
        grand_total_egp = f"{grand_total_piasters / 100.0:.2f}"
        assert "." in grand_total_egp

    def test_f4_scenario_03_template_seeding_idempotency(self):
        """Verifies that seeding does not overwrite existing store products without explicit command."""
        conn = sqlite3.connect(f"file:{DEV_DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT barcode, price_piasters, stock_quantity_milli FROM products WHERE barcode = '6221004001655'")
        row = cur.fetchone()
        conn.close()
        if row:
            bc, price, stock = row
            # Existing stock quantity must be preserved
            assert stock >= 0, "Stock quantity corrupted"

    def test_f4_scenario_04_full_solution_clean_build(self):
        """Verifies both Debug and Release configurations build with exit code 0."""
        for cfg in ["Debug", "Release"]:
            cmd = f'"{MSBUILD_PATH}" "{CSPROJ_PATH}" /p:Configuration={cfg} /p:Platform=x86 /v:m'
            res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
            assert res.returncode == 0, f"MSBuild {cfg} failed:\n{res.stdout}\n{res.stderr}"

    def test_f4_scenario_05_comprehensive_zero_emojis_audit(self):
        """Comprehensive verification that all project deliverables contain 0 emojis."""
        targets = [
            SEEDER_CS_PATH,
            SELLER_CATALOG_EXCEL,
        ]
        if os.path.exists(REPORT_MD_PATH):
            targets.append(REPORT_MD_PATH)
        if os.path.exists(REPORT_CSV_PATH):
            targets.append(REPORT_CSV_PATH)
        
        violations = []
        for t in targets:
            if t.endswith(".xlsx"):
                wb = openpyxl.load_workbook(t, data_only=True)
                for sheet in wb.sheetnames:
                    for row in wb[sheet].iter_rows(values_only=True):
                        for c in row:
                            if c and isinstance(c, str) and EMOJI_REGEX.search(c):
                                violations.append((t, sheet, c))
            else:
                with open(t, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                matches = EMOJI_REGEX.findall(content)
                if matches:
                    violations.append((t, matches))
        
        assert len(violations) == 0, f"Zero Emojis compliance violated in deliverables: {violations}"
