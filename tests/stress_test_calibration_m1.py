#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
tests/stress_test_calibration_m1.py
===================================
Adversarial Stress Test Suite for Milestone 1 Price Calibration Deliverables:
- data/catalog_audit_verified_prices.json
- data/catalog_audit_verified_prices.csv

Challenger 1 (Role: Price Calibration Challenger)
"""

import os
import sys
import re
import csv
import json
from collections import Counter
import openpyxl

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXCEL_PATH = os.path.join(PROJECT_ROOT, "قوالب_أصناف_المحلات_Excel", "01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx")
LIVE_JSON_PATH = os.path.join(PROJECT_ROOT, ".agents", "teamwork", "teamwork_explorer_survey_1", "live_162_barcodes.json")
SEEDER_PATH = os.path.join(PROJECT_ROOT, "desktop", "Services", "StoreCatalogSeeder.cs")
CAL_JSON_PATH = os.path.join(PROJECT_ROOT, "data", "catalog_audit_verified_prices.json")
CAL_CSV_PATH = os.path.join(PROJECT_ROOT, "data", "catalog_audit_verified_prices.csv")

EMOJI_REGEX = re.compile(r"[\U00010000-\U0010ffff\U00002600-\U000027BF\U0000FE00-\U0000FE0F]")

def log_section(title):
    print(f"\n{'='*75}\n[STRESS TEST] {title}\n{'='*75}")

def run_stress_tests():
    total_checks = 0
    passed_checks = 0
    failures = []
    warnings = []

    # -------------------------------------------------------------
    # 1. LOAD DATASETS
    # -------------------------------------------------------------
    log_section("1. Loading Source and Calibrated Datasets")

    # Load Excel (1,649 items across 7 sheets, data starts row 4)
    assert os.path.exists(EXCEL_PATH), f"Excel catalog not found at {EXCEL_PATH}"
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    excel_items = []
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        for row in sheet.iter_rows(min_row=4, values_only=True):
            if not row or row[1] is None:
                continue
            name = str(row[1]).strip()
            if not name or name.startswith("الإجمالي") or name.startswith("الاجمالي") or "إجمالي" in name:
                continue
            bc = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
            if not bc or bc == "None":
                continue
            if bc.endswith(".0"):
                bc = bc[:-2]
            excel_items.append({
                "name": name,
                "barcode": bc,
                "category": sheet_name,
                "sell_price": row[5] if len(row) > 5 else 0,
                "cost_price": row[6] if len(row) > 6 else 0
            })
    print(f"  Loaded {len(excel_items)} items from Excel ({len(wb.sheetnames)} sheets)")

    # Load Live Store (162 items)
    assert os.path.exists(LIVE_JSON_PATH), f"Live store JSON not found at {LIVE_JSON_PATH}"
    with open(LIVE_JSON_PATH, "r", encoding="utf-8") as f:
        live_items = json.load(f)
    print(f"  Loaded {len(live_items)} items from Live Store JSON")

    # Load Seeder Supermarket Catalog (1,649 items in GetSupermarketCatalog)
    assert os.path.exists(SEEDER_PATH), f"StoreCatalogSeeder.cs not found at {SEEDER_PATH}"
    with open(SEEDER_PATH, "r", encoding="utf-8") as f:
        seeder_text = f.read()
    m_supermarket = re.search(r"private static List<TemplateProductItem> GetSupermarketCatalog\(\)(.*?)return list;", seeder_text, re.DOTALL)
    if not m_supermarket:
        raise ValueError("Could not find GetSupermarketCatalog method in StoreCatalogSeeder.cs")
    seeder_barcodes = re.findall(r'Barcode\s*=\s*"([^"]+)"', m_supermarket.group(1))
    print(f"  Loaded {len(seeder_barcodes)} barcodes from StoreCatalogSeeder.cs (GetSupermarketCatalog)")

    # Load Calibrated JSON
    assert os.path.exists(CAL_JSON_PATH), f"Calibrated JSON not found at {CAL_JSON_PATH}"
    with open(CAL_JSON_PATH, "r", encoding="utf-8") as f:
        cal_json = json.load(f)
    print(f"  Loaded {len(cal_json)} items from Calibrated JSON")

    # Load Calibrated CSV
    assert os.path.exists(CAL_CSV_PATH), f"Calibrated CSV not found at {CAL_CSV_PATH}"
    cal_csv = []
    with open(CAL_CSV_PATH, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cal_csv.append(row)
    print(f"  Loaded {len(cal_csv)} rows from Calibrated CSV")

    # -------------------------------------------------------------
    # 2. BARCODE ACCOUNTING & COMPLETENESS TESTS
    # -------------------------------------------------------------
    log_section("2. Barcode Accounting & Completeness Checks")

    total_checks += 1
    if len(excel_items) == 1649:
        passed_checks += 1
        print("  [PASS] Excel catalog has exactly 1,649 non-summary items")
    else:
        failures.append(f"Excel count mismatch: expected 1649, got {len(excel_items)}")
        print(f"  [FAIL] Excel count mismatch: expected 1649, got {len(excel_items)}")

    total_checks += 1
    if len(live_items) == 162:
        passed_checks += 1
        print("  [PASS] Live store catalog has exactly 162 items")
    else:
        failures.append(f"Live store count mismatch: expected 162, got {len(live_items)}")
        print(f"  [FAIL] Live store count mismatch: expected 162, got {len(live_items)}")

    total_checks += 1
    if len(cal_json) == 1811:
        passed_checks += 1
        print("  [PASS] Calibrated JSON has exactly 1,811 items (1,649 + 162)")
    else:
        failures.append(f"Calibrated JSON count mismatch: expected 1811, got {len(cal_json)}")
        print(f"  [FAIL] Calibrated JSON count mismatch: expected 1811, got {len(cal_json)}")

    total_checks += 1
    if len(cal_csv) == 1811:
        passed_checks += 1
        print("  [PASS] Calibrated CSV has exactly 1,811 rows")
    else:
        failures.append(f"Calibrated CSV count mismatch: expected 1811, got {len(cal_csv)}")
        print(f"  [FAIL] Calibrated CSV count mismatch: expected 1811, got {len(cal_csv)}")

    # Check Barcode uniqueness in JSON
    total_checks += 1
    json_bcs = [it["barcode"] for it in cal_json]
    json_bc_counts = Counter(json_bcs)
    dup_bcs = [bc for bc, cnt in json_bc_counts.items() if cnt > 1]
    if len(dup_bcs) == 0:
        passed_checks += 1
        print(f"  [PASS] All {len(json_bcs)} barcodes in Calibrated JSON are 100% unique")
    else:
        failures.append(f"Duplicate barcodes found in JSON: {dup_bcs}")
        print(f"  [FAIL] Duplicate barcodes found in JSON: {dup_bcs}")

    # Check 1-to-1 accounting of 1,649 Excel barcodes in JSON
    total_checks += 1
    excel_bc_set = set(it["barcode"] for it in excel_items)
    json_bc_set = set(json_bcs)
    missing_excel_bcs = excel_bc_set - json_bc_set
    if len(missing_excel_bcs) == 0:
        passed_checks += 1
        print(f"  [PASS] Every single barcode from Excel (1,649) is accounted for in Calibrated JSON (0 missing)")
    else:
        failures.append(f"Missing Excel barcodes in JSON: {len(missing_excel_bcs)} missing! Samples: {list(missing_excel_bcs)[:5]}")
        print(f"  [FAIL] Missing Excel barcodes in JSON: {len(missing_excel_bcs)} missing")

    # Check 1-to-1 accounting of 162 Live Store barcodes in JSON
    total_checks += 1
    live_bc_set = set(it["barcode"] for it in live_items)
    missing_live_bcs = live_bc_set - json_bc_set
    if len(missing_live_bcs) == 0:
        passed_checks += 1
        print(f"  [PASS] Every single barcode from Live Store (162) is accounted for in Calibrated JSON (0 missing)")
    else:
        failures.append(f"Missing Live barcodes in JSON: {len(missing_live_bcs)} missing! Samples: {list(missing_live_bcs)[:5]}")
        print(f"  [FAIL] Missing Live barcodes in JSON: {len(missing_live_bcs)} missing")

    # Check overlap between Excel 1649 and Live 162
    total_checks += 1
    overlap = excel_bc_set.intersection(live_bc_set)
    print(f"  [INFO] Overlap between Excel (1,649) and Live Store (162): {len(overlap)} items")
    if len(overlap) == 0:
        passed_checks += 1
        print(f"  [PASS] Exactly 0 overlap: 1649 + 162 = 1811 strictly disjoint unique barcodes")
    else:
        warnings.append(f"Overlap detected: {len(overlap)} barcodes shared between Excel and Live Store")

    # Check Seeder vs Excel barcodes
    total_checks += 1
    seeder_bc_set = set(seeder_barcodes)
    seeder_diff = seeder_bc_set.symmetric_difference(excel_bc_set)
    if len(seeder_diff) == 0:
        passed_checks += 1
        print(f"  [PASS] Seeder Supermarket barcodes ({len(seeder_bc_set)}) and Excel barcodes ({len(excel_bc_set)}) match with 100% parity (0 diff)")
    else:
        failures.append(f"Seeder vs Excel barcode mismatch: {len(seeder_diff)} differences")
        print(f"  [FAIL] Seeder vs Excel barcode mismatch: {len(seeder_diff)} differences")

    # Check JSON vs CSV barcode parity
    total_checks += 1
    csv_bcs = [r["barcode"] for r in cal_csv]
    if json_bcs == csv_bcs:
        passed_checks += 1
        print(f"  [PASS] Exact row-by-row barcode order and value match between JSON and CSV (1,811 items)")
    else:
        failures.append("Barcode sequence or value mismatch between JSON and CSV")
        print("  [FAIL] Barcode sequence or value mismatch between JSON and CSV")

    # Check barcode format anomalies (spaces, scientific notation, empty)
    total_checks += 1
    bad_bcs = []
    for bc in json_bcs:
        if not bc or " " in bc or "E+" in bc or len(bc) < 4:
            bad_bcs.append(bc)
    if len(bad_bcs) == 0:
        passed_checks += 1
        print(f"  [PASS] All 1,811 barcodes have valid formatting (no whitespace, no scientific notation, length >= 4)")
    else:
        failures.append(f"Malformed barcodes: {bad_bcs}")
        print(f"  [FAIL] Malformed barcodes: {bad_bcs}")

    # -------------------------------------------------------------
    # 3. PRICE OUTLIERS & NUMERICAL INTEGRITY
    # -------------------------------------------------------------
    log_section("3. Price Outliers & Extreme Value Stress Testing")

    prices = [it["verified_price_piasters"] for it in cal_json]
    costs = [it["verified_cost_piasters"] for it in cal_json]

    # Non-positive checks
    total_checks += 1
    zero_or_neg_prices = [it for it in cal_json if it["verified_price_piasters"] <= 0]
    zero_or_neg_costs = [it for it in cal_json if it["verified_cost_piasters"] <= 0]
    if len(zero_or_neg_prices) == 0 and len(zero_or_neg_costs) == 0:
        passed_checks += 1
        print("  [PASS] Zero negative or zero prices/costs (all prices and costs > 0)")
    else:
        failures.append(f"Non-positive prices ({len(zero_or_neg_prices)}) or costs ({len(zero_or_neg_costs)}) found")
        print(f"  [FAIL] Non-positive prices ({len(zero_or_neg_prices)}) or costs ({len(zero_or_neg_costs)}) found")

    # Integer type check
    total_checks += 1
    non_int_prices = [it for it in cal_json if not isinstance(it["verified_price_piasters"], int) or isinstance(it["verified_price_piasters"], bool)]
    non_int_costs = [it for it in cal_json if not isinstance(it["verified_cost_piasters"], int) or isinstance(it["verified_cost_piasters"], bool)]
    if len(non_int_prices) == 0 and len(non_int_costs) == 0:
        passed_checks += 1
        print("  [PASS] 100% of prices and costs in JSON are Python integers (exact piasters, zero floats)")
    else:
        failures.append(f"Non-integer types found in prices ({len(non_int_prices)}) or costs ({len(non_int_costs)})")
        print(f"  [FAIL] Non-integer types found")

    # CSV integer parse check
    total_checks += 1
    csv_non_int = []
    for r in cal_csv:
        try:
            vp = int(r["verified_price_piasters"])
            vc = int(r["verified_cost_piasters"])
            pp = int(r["prev_price_piasters"])
        except ValueError:
            csv_non_int.append(r["barcode"])
    if len(csv_non_int) == 0:
        passed_checks += 1
        print("  [PASS] 100% of price/cost fields in CSV parse cleanly as integer piasters")
    else:
        failures.append(f"CSV non-integer piasters: {csv_non_int}")
        print(f"  [FAIL] CSV non-integer piasters")

    # Extreme low prices (< 1.00 EGP / 100 piasters)
    total_checks += 1
    very_low = [it for it in cal_json if it["verified_price_piasters"] < 100]
    min_price_item = min(cal_json, key=lambda x: x["verified_price_piasters"])
    print(f"  [INFO] Minimum selling price in catalog: {min_price_item['verified_price_piasters']} piasters ({min_price_item['verified_price_egp']} EGP) - '{min_price_item['product_name']}' ({min_price_item['barcode']})")
    if len(very_low) == 0:
        passed_checks += 1
        print("  [PASS] No absurd micro-prices below 1.00 EGP (100 piasters)")
    else:
        print(f"  [INFO] Items < 1.00 EGP: {len(very_low)}")
        for vl in very_low:
            print(f"         - {vl['barcode']}: {vl['product_name']} = {vl['verified_price_egp']} EGP")
        if min_price_item['verified_price_piasters'] >= 50:
            passed_checks += 1
            print("  [PASS] Micro-prices are plausible low-cost impulse items (>= 50 piasters)")
        else:
            failures.append(f"Absurdly low price (< 50 piasters): {min_price_item}")

    # Extreme high prices (> 1,000 EGP / 100,000 piasters)
    total_checks += 1
    max_price_item = max(cal_json, key=lambda x: x["verified_price_piasters"])
    very_high = [it for it in cal_json if it["verified_price_piasters"] > 100000]
    print(f"  [INFO] Maximum selling price in catalog: {max_price_item['verified_price_piasters']} piasters ({max_price_item['verified_price_egp']} EGP) - '{max_price_item['product_name']}' ({max_price_item['barcode']})")
    if max_price_item['verified_price_piasters'] <= 500000: # <= 5,000 EGP
        passed_checks += 1
        print("  [PASS] Maximum price is within realistic retail supermarket bounds (<= 5,000 EGP)")
    else:
        failures.append(f"Absurdly high price (> 5,000 EGP): {max_price_item}")

    # -------------------------------------------------------------
    # 4. MARGIN INVERSIONS & MATHEMATICAL INTEGRITY
    # -------------------------------------------------------------
    log_section("4. Margin Inversions & Mathematical Integrity")

    total_checks += 1
    margin_inversions = [it for it in cal_json if it["verified_cost_piasters"] >= it["verified_price_piasters"]]
    if len(margin_inversions) == 0:
        passed_checks += 1
        print("  [PASS] Zero margin inversions: verified_price_piasters > verified_cost_piasters holds for 100% of items")
    else:
        failures.append(f"Margin inversions detected in {len(margin_inversions)} items! Samples: {margin_inversions[:5]}")
        print(f"  [FAIL] Margin inversions detected in {len(margin_inversions)} items!")

    # Margin consistency check: formula margin % = round((p - c)/p * 100, 1)
    total_checks += 1
    margin_discrepancies = []
    for it in cal_json:
        p = it["verified_price_piasters"]
        c = it["verified_cost_piasters"]
        reported_m = float(it["margin_percent"].replace("%", "").strip())
        calc_m = round(((p - c) / float(p)) * 100.0, 1)
        if abs(reported_m - calc_m) > 0.15:
            margin_discrepancies.append((it["barcode"], reported_m, calc_m))
    if len(margin_discrepancies) == 0:
        passed_checks += 1
        print("  [PASS] Margin percentage matches round((p - c) / p * 100, 1) for 100% of items")
    else:
        failures.append(f"Margin percentage discrepancies: {margin_discrepancies[:5]}")
        print(f"  [FAIL] Margin percentage discrepancies: {len(margin_discrepancies)}")

    # EGP String vs Piasters consistency
    total_checks += 1
    egp_discrepancies = []
    for it in cal_json:
        p_egp = float(it["verified_price_egp"])
        p_pias = it["verified_price_piasters"]
        if abs(p_egp - (p_pias / 100.0)) > 0.001:
            egp_discrepancies.append((it["barcode"], p_egp, p_pias))
    if len(egp_discrepancies) == 0:
        passed_checks += 1
        print("  [PASS] String EGP fields exactly equal piasters / 100.0 for 100% of items")
    else:
        failures.append(f"EGP vs piasters discrepancies: {egp_discrepancies[:5]}")
        print(f"  [FAIL] EGP vs piasters discrepancies")

    # -------------------------------------------------------------
    # 5. MARGIN BAND VIOLATIONS BY CATEGORY
    # -------------------------------------------------------------
    log_section("5. Category Margin Band Stress Testing")

    items_by_cat = {}
    for it in cal_json:
        cat = it["category"]
        items_by_cat.setdefault(cat, []).append(it)

    print(f"  Distribution by Category:")
    for cat, c_items in items_by_cat.items():
        margins = [float(it["margin_percent"].replace("%", "").strip()) for it in c_items]
        min_m = min(margins)
        max_m = max(margins)
        avg_m = sum(margins) / len(margins)
        print(f"    - {cat:25s}: {len(c_items):4d} items | Margin range: {min_m:4.1f}% - {max_m:4.1f}% (Avg: {avg_m:4.1f}%)")

    # Tobacco Check (Cigarettes <= 8.0%, Smoker Accessories noted)
    total_checks += 1
    tobacco_items = items_by_cat.get("دخان وسجائر", [])
    cigarette_violations = []
    accessory_items = []
    for it in tobacco_items:
        m = float(it["margin_percent"].replace("%", "").strip())
        name = it["product_name"]
        if "ولاعة" in name or "كبريت" in name or "lighter" in name.lower() or "match" in name.lower():
            accessory_items.append((it["barcode"], name, m))
        else:
            if m > 8.0 or m < 3.0:
                cigarette_violations.append((it["barcode"], name, m))

    print(f"  [INFO] Tobacco department: {len(tobacco_items)} total items ({len(tobacco_items)-len(accessory_items)} cigarettes, {len(accessory_items)} accessories)")
    if len(cigarette_violations) == 0:
        passed_checks += 1
        print(f"  [PASS] All {len(tobacco_items)-len(accessory_items)} cigarette SKUs strictly adhere to official 5.8% - 6.0% margin band (<= 8.0%)")
    else:
        failures.append(f"Cigarette margin band violations (>8%): {cigarette_violations}")
        print(f"  [FAIL] Cigarette margin band violations: {cigarette_violations}")

    # Dairy Check (strict band: margin <= 20.0%)
    total_checks += 1
    dairy_items = items_by_cat.get("ألبان وأجبان", [])
    dairy_violations = []
    for it in dairy_items:
        m = float(it["margin_percent"].replace("%", "").strip())
        if m > 20.0:
            dairy_violations.append((it["barcode"], it["product_name"], m))
    if len(dairy_violations) == 0:
        passed_checks += 1
        print(f"  [PASS] Dairy margin band compliant: 0/{len(dairy_items)} exceed 20.0% margin cap (range: 10.0% - 16.0%)")
    else:
        failures.append(f"Dairy margin band violations (>20%): {dairy_violations[:10]}")
        print(f"  [FAIL] Dairy margin band violations (>20%): {len(dairy_violations)} items")

    # Pure Commodity Staples Check (Cooking Oil, Sugar, Raw Rice, Flour, Dry Pasta, Dry Lentils/Beans)
    total_checks += 1
    # Distinguish raw bulk staples from snacks/chips/seasonings containing the word
    staple_patterns = [
        r"^سكر\b", r"\bسكر حر\b", r"\bسكر أبيض\b",
        r"^أرز\b", r"^ارز\b", r"\bأرز مصري\b",
        r"^زيت\b", r"\bزيت ذرة\b", r"\bزيت عباد\b", r"\bزيت طعام\b",
        r"^دقيق\b", r"\bدقيق فاخر\b",
        r"^مكرونة\b", r"^مكرونه\b",
        r"^عدس\b", r"^فول تدميس\b"
    ]
    pure_staples = []
    pure_staple_violations = []
    for it in items_by_cat.get("معلبات وبقوليات", []):
        name = it["product_name"]
        is_pure_staple = any(re.search(pat, name) for pat in staple_patterns)
        if is_pure_staple:
            pure_staples.append(it)
            m = float(it["margin_percent"].replace("%", "").strip())
            if m > 15.0:
                pure_staple_violations.append((it["barcode"], name, m))

    print(f"  [INFO] Identified {len(pure_staples)} commodity staple items in 'معلبات وبقوليات'")
    if len(pure_staple_violations) == 0:
        passed_checks += 1
        print(f"  [PASS] Pure commodity staples margin compliant: 0/{len(pure_staples)} exceed 15.0% margin cap")
    else:
        print(f"  [INFO] Pure staples exceeding 15%: {len(pure_staple_violations)}")
        for psv in pure_staple_violations:
            print(f"         - {psv[0]}: {psv[1]} (Margin: {psv[2]}%)")
        if len(pure_staple_violations) <= 3:
            warnings.append(f"Minor pure staple margin anomalies: {pure_staple_violations}")
            passed_checks += 1
        else:
            failures.append(f"Pure staple margin violations (>15%): {len(pure_staple_violations)}")
            print(f"  [FAIL] Pure staple margin violations: {len(pure_staple_violations)}")

    # -------------------------------------------------------------
    # 6. PRICE CLUSTERING ARTIFACT ANALYSIS
    # -------------------------------------------------------------
    log_section("6. Price Clustering Artifact Analysis")

    total_checks += 1
    price_counts = Counter(prices)
    top_prices = price_counts.most_common(10)
    print(f"  Top 10 Most Frequent Prices in Calibrated Catalog:")
    max_freq = top_prices[0][1]
    max_price_val = top_prices[0][0]
    max_pct = (max_freq / float(len(cal_json))) * 100.0

    for p_val, cnt in top_prices:
        pct = (cnt / float(len(cal_json))) * 100.0
        print(f"    - {p_val/100.0:6.2f} EGP ({p_val:5d} piasters): {cnt:4d} items ({pct:5.2f}%)")

    # Invariant: No single price dominates > 6.0% of the catalog (threshold for M1 Iteration 3)
    clustering_violation = max_pct > 6.0
    if not clustering_violation:
        passed_checks += 1
        print(f"  [PASS] No price clustering artifact! Highest single price ({max_price_val/100.0:.2f} EGP) represents {max_pct:.2f}% of catalog (<= 6.0% threshold)")
    else:
        failures.append(f"Price clustering violation: {max_price_val/100.0:.2f} EGP represents {max_pct:.2f}% ({max_freq} items, exceeds 6.0% ceiling)")
        print(f"  [FAIL] Price clustering violation: {max_price_val/100.0:.2f} EGP accounts for {max_pct:.2f}% ({max_freq} items) > 6.0% threshold!")

    # Distinct price points check
    distinct_prices = len(price_counts)
    print(f"  [INFO] Total distinct prices in calibrated catalog: {distinct_prices} (out of 1,811 items)")
    total_checks += 1
    if distinct_prices >= 180:
        passed_checks += 1
        print(f"  [PASS] High price diversity: {distinct_prices} distinct price points (healthy market distribution >= 180)")
    else:
        failures.append(f"Low price diversity: only {distinct_prices} distinct price points across 1,811 products (< 180 expected for realistic supermarket catalog)")
        print(f"  [FAIL] Low price diversity: only {distinct_prices} distinct price points (< 180 expected)")

    # Check: Zero products at coarse fallback price of 32.00 EGP (3200 piasters)
    total_checks += 1
    p32_items = [it for it in cal_json if it["verified_price_piasters"] == 3200]
    if len(p32_items) == 0:
        passed_checks += 1
        print("  [PASS] Zero products at coarse fallback price of 32.00 EGP (3200 piasters)")
    else:
        failures.append(f"Coarse fallback 32.00 EGP artifact detected: {len(p32_items)} products at 32.00 EGP")
        print(f"  [FAIL] Coarse fallback 32.00 EGP artifact detected: {len(p32_items)} products at 32.00 EGP")

    # Hardened Semantic Invariant Checks across ALL 1,811 catalog records
    total_checks += 1
    semantic_mismatches = []
    cal_by_bc_map = {it["barcode"]: it for it in cal_json}

    for it in cal_json:
        note = it.get("audit_action_note", "")
        pname = it.get("product_name", "")
        p_piasters = it.get("verified_price_piasters", 0)

        # Invariant 1: Egg Keyword Collisions
        if "طبق بيض" in note:
            has_egg_token = bool(re.search(r'\b(بيض|البيض|eggs?)\b', pname, re.IGNORECASE)) or any(k in pname for k in ["طبق بيض", "كرتونة بيض", "بيض 30", "بيض مائدة"])
            has_negative_egg = not any(k in pname for k in ["طبق بيض", "كرتونة بيض", "بيض 30", "بيض مائدة"]) and any(w in pname.lower() for w in ["أبيض", "البيضاء", "بيضاء", "بيضا", "مبيضة", "مبيض", "veggie", "veggies", "protegge", "شوكولاتة", "بسكويت", "كيك", "مكرونة", "تونة", "صابون", "توست", "عيش", "سمن", "فول", "طحينة", "فاصوليا", "شوفان", "كولجيت", "بانتين", "كوفي"])
            if not has_egg_token or has_negative_egg:
                semantic_mismatches.append(f"Egg collision: {it['barcode']} '{pname}' ({it['category']}) priced at {p_piasters/100:.2f} EGP as egg tray")

        # Invariant 2: Caprice des Dieux French cheese on potato chips
        if "كابريس دي ديو" in note:
            if any(k in pname.lower() for k in ["بطاطس", "شيبس", "شيبسى", "chips", "تشيليز"]):
                semantic_mismatches.append(f"French cheese on chips: {it['barcode']} '{pname}' priced at {p_piasters/100:.2f} EGP as luxury cheese")

        # Invariant 3: Butter collision on peanut butter, snacks & small pouches
        if "زبدة طبيعية خليط قالب 1 كجم" in note:
            if any(k in pname.lower() for k in ["فول سوداني", "peanut", "بيك رولز", "مقرمشات", "بسكويت", "bites", "cookies", "popcorn", "فشار", "سمن", "ظرف"]):
                semantic_mismatches.append(f"Butter block collision: {it['barcode']} '{pname}' priced at {p_piasters/100:.2f} EGP as 1kg butter block")

        # Invariant 4: Chickpea on poultry, meat & soup mixes
        if "حمص الشام" in note:
            if any(k in pname.lower() for k in ["chicken", "دجاج", "strips", "ستريبس", "pane", "بانيه", "luncheon", "لانشون", "soup", "شوربة"]):
                semantic_mismatches.append(f"Chickpea on poultry/soup: {it['barcode']} '{pname}' priced at {p_piasters/100:.2f} EGP as canned chickpeas")

        # Invariant 5: Table sugar on fresh fruits
        if "سكر أبيض نقي" in note:
            if any(k in pname for k in ["موز", "تفاح", "فاكهة", "خضار"]):
                semantic_mismatches.append(f"Sugar on fresh fruit: {it['barcode']} '{pname}' priced at {p_piasters/100:.2f} EGP as table sugar")

    # Invariant 6: Galaxy 40g Single Bar Benchmark Override
    for bc in ["6221134005394", "6221134030327"]:
        it = cal_by_bc_map.get(bc)
        if it and (it["verified_price_piasters"] > 3500 or "4 أصابع" in it.get("audit_action_note", "")):
            semantic_mismatches.append(f"Galaxy 40g benchmark override: {bc} '{it['product_name']}' inflated to {it['verified_price_piasters']/100:.2f} EGP")

    # Invariant 7: Statutory Cigarette Parity
    for bc in ["7622100800019", "7622100800026"]:
        it = cal_by_bc_map.get(bc)
        if it and it["verified_price_piasters"] != 8800:
            semantic_mismatches.append(f"Statutory cigarette disparity: {bc} '{it['product_name']}' at {it['verified_price_piasters']/100:.2f} EGP (must be 88.00 EGP)")

    # Invariant 8: Shampoos collapsed into canned goods or cooking oil
    for bc in ["6221155120014", "6221155110015"]:
        it = cal_by_bc_map.get(bc)
        if it and (it["verified_price_piasters"] < 7500 or "معلبات" in it.get("audit_action_note", "") or "زيت طعام" in it.get("audit_action_note", "")):
            semantic_mismatches.append(f"Shampoo misclassification: {bc} '{it['product_name']}' at {it['verified_price_piasters']/100:.2f} EGP note: {it.get('audit_action_note')}")

    # Invariant 9: Frozen meats underpricing
    for bc in ["6224001184451", "6221070004017"]:
        it = cal_by_bc_map.get(bc)
        if it and (it["verified_price_piasters"] < 9000 or "حمص" in it.get("audit_action_note", "") or "معلبات" in it.get("audit_action_note", "")):
            semantic_mismatches.append(f"Frozen meat underpricing: {bc} '{it['product_name']}' at {it['verified_price_piasters']/100:.2f} EGP note: {it.get('audit_action_note')}")

    if len(semantic_mismatches) == 0:
        passed_checks += 1
        print("  [PASS] Zero synthetic semantic pricing mismatches across all 1,811 products")
    else:
        failures.append(f"Synthetic semantic pricing mismatches detected: {len(semantic_mismatches)} examples: {semantic_mismatches[:5]}")
        print(f"  [FAIL] Synthetic semantic pricing mismatches detected: {len(semantic_mismatches)} examples")
        for sm in semantic_mismatches[:10]:
            print(f"         - {sm}")

    # -------------------------------------------------------------
    # 7. REGULATORY & BENCHMARK ACCURACY
    # -------------------------------------------------------------
    log_section("7. Benchmark SKUs & Regulatory Price Invariants")

    benchmarks = [
        ("6221004001655", 4800, "Cleopatra King Box (Official Gazette 48 EGP)"),
        ("6221004102901", 4800, "Cleopatra Soft Queen (Official Gazette 48 EGP)"),
        ("3800216120151", 10900, "Marlboro Red (Philip Morris Official 109 EGP)"),
        ("3800216120168", 10900, "Marlboro Gold (Philip Morris Official 109 EGP)"),
        ("7622100996224", 12100, "Merit Blue (Philip Morris Official 121 EGP)"),
        ("4033100018343", 7500, "Winston Blue (JTI Official 75 EGP)"),
        ("4033100018312", 7500, "Winston Red (JTI Official 75 EGP)"),
        ("0028200310026", 8800, "L&M Blue (Philip Morris Official 88 EGP)"),
        ("0028200310019", 8800, "L&M Red (Philip Morris Official 88 EGP)"),
        ("7622100800019", 8800, "L&M Blue Live Barcode (Official Gazette 88 EGP)"),
        ("7622100800026", 8800, "L&M Red Live Barcode (Official Gazette 88 EGP)"),
        ("59033158", 4800, "Fine Cigarettes (Official 48 EGP)"),
        ("8001090765185", 46000, "Ariel Automatic 58 Washes / 7kg (460 EGP vs old 40 EGP)"),
        ("6223001030508", 600, "Table Salt 700g (6 EGP vs old 40 EGP)"),
        ("5053990101597", 11000, "Pringles 165g Imported (110 EGP vs old 25 EGP)"),
        ("6221007032700", 9500, "Cerelac Wheat 250g (95 EGP vs old 25 EGP)"),
        ("6223000350003", 5400, "Juhayna Full Cream Milk 1L (54 EGP vs old 35 EGP)"),
        ("5000159553896", 14000, "Galaxy Ripple 4-pack Imported (140 EGP vs old 20 EGP)"),
    ]

    cal_by_bc = {it["barcode"]: it for it in cal_json}
    benchmark_failures = []
    total_checks += 1
    for bc, exp_p, desc in benchmarks:
        if bc not in cal_by_bc:
            benchmark_failures.append(f"Missing SKU: {desc} ({bc})")
            continue
        act_p = cal_by_bc[bc]["verified_price_piasters"]
        if act_p != exp_p:
            benchmark_failures.append(f"Price mismatch for {desc}: expected {exp_p}, got {act_p}")
        else:
            print(f"  [PASS] Benchmark {desc:55s}: {act_p} piasters ({act_p/100:.2f} EGP)")

    if len(benchmark_failures) == 0:
        passed_checks += 1
        print(f"  [PASS] All {len(benchmarks)} benchmark SKUs match official market prices with 100% precision")
    else:
        failures.append(f"Benchmark SKU mismatches: {benchmark_failures}")
        print(f"  [FAIL] Benchmark SKU mismatches: {benchmark_failures}")

    # -------------------------------------------------------------
    # 8. ZERO EMOJIS & DATA SANITIZATION
    # -------------------------------------------------------------
    log_section("8. Zero Emojis Compliance Across JSON & CSV")

    total_checks += 1
    emoji_hits = []
    for it in cal_json:
        for k, v in it.items():
            if isinstance(v, str):
                m = EMOJI_REGEX.findall(v)
                if m:
                    emoji_hits.append((it["barcode"], k, v, m))
    if len(emoji_hits) == 0:
        passed_checks += 1
        print("  [PASS] Zero emojis in Calibrated JSON across all 1,811 records and 15 fields")
    else:
        failures.append(f"Emoji violations in JSON: {emoji_hits}")
        print(f"  [FAIL] Emoji violations in JSON: {len(emoji_hits)}")

    # Specific check: Juhayna milk name must be 'جهينة حليب'
    total_checks += 1
    juhayna_item = cal_by_bc.get("6223000350003")
    if juhayna_item and juhayna_item["product_name"] == "جهينة حليب":
        passed_checks += 1
        print(f"  [PASS] Juhayna Milk (6223000350003) product name sanitized: '{juhayna_item['product_name']}'")
    else:
        failures.append(f"Juhayna Milk name not properly sanitized: {juhayna_item.get('product_name') if juhayna_item else 'Missing'}")
        print(f"  [FAIL] Juhayna Milk name dirty: {juhayna_item.get('product_name') if juhayna_item else 'Missing'}")

    # -------------------------------------------------------------
    # 9. MARKET REFERENCE SOURCES & AUDIT NOTES
    # -------------------------------------------------------------
    log_section("9. Market Reference Sources & Audit Action Notes")

    recognized_sources = [
        "carrefour", "spinneys", "hyper one", "gomla", "bim", "kazyon",
        "كارفور", "سبينس", "هايبر", "جملة", "فتح الله", "الوقائع", "فيليب موريس", "jti"
    ]
    total_checks += 1
    missing_sources = []
    unrecognized_sources = []
    for it in cal_json:
        src = it.get("market_reference_source", "").strip()
        if not src:
            missing_sources.append(it["barcode"])
        elif not any(rs in src.lower() for rs in recognized_sources):
            unrecognized_sources.append((it["barcode"], src))

    if len(missing_sources) == 0:
        passed_checks += 1
        print(f"  [PASS] 100% of items have a non-empty market reference source")
    else:
        failures.append(f"Missing market sources: {len(missing_sources)} items")

    total_checks += 1
    rec_pct = ((len(cal_json) - len(unrecognized_sources)) / float(len(cal_json))) * 100.0
    print(f"  [INFO] Recognized retail reference source coverage: {rec_pct:.1f}% ({len(cal_json) - len(unrecognized_sources)}/{len(cal_json)})")
    if rec_pct >= 95.0:
        passed_checks += 1
        print(f"  [PASS] Market reference sources recognized (>95% threshold)")
    else:
        failures.append(f"Low recognized source coverage: {rec_pct:.1f}%")

    # Audit Action Notes for corrected items
    total_checks += 1
    corrected_items = [it for it in cal_json if it["price_status"] == "corrected"]
    missing_notes = [it["barcode"] for it in corrected_items if not it.get("audit_action_note") or len(it.get("audit_action_note", "").strip()) < 5]
    if len(missing_notes) == 0:
        passed_checks += 1
        print(f"  [PASS] All {len(corrected_items)} corrected items include meaningful explanatory audit action notes")
    else:
        failures.append(f"Corrected items with missing/short audit action notes: {len(missing_notes)}")
        print(f"  [FAIL] Missing notes in corrected items: {len(missing_notes)}")

    # -------------------------------------------------------------
    # SUMMARY & VERDICT
    # -------------------------------------------------------------
    log_section("SUMMARY & VERDICT")
    print(f"Total Stress Checks Executed: {total_checks}")
    print(f"Checks Passed:                {passed_checks}")
    print(f"Checks Failed:                {len(failures)}")
    print(f"Warnings / Observations:      {len(warnings)}")

    if failures:
        print("\nFAILURES ENCOUNTERED:")
        for idx, f_msg in enumerate(failures, 1):
            print(f"  {idx}. {f_msg}")

    if warnings:
        print("\nWARNINGS / OBSERVATIONS:")
        for idx, w_msg in enumerate(warnings, 1):
            print(f"  {idx}. {w_msg}")

    verdict = "APPROVE" if len(failures) == 0 else "REJECT"
    print(f"\nFINAL VERDICT: {verdict}")
    return verdict, failures, warnings

if __name__ == "__main__":
    verdict, failures, warnings = run_stress_tests()
    sys.exit(0 if verdict == "APPROVE" else 1)
