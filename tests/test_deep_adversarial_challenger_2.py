#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
tests/test_deep_adversarial_challenger_2.py
============================================
Adversarial Stress Test Suite — Challenger 2
Milestone 1 Iteration 2: Financial Integrity, Barcode Accounting, Encoding & Market Calibrations
"""

import os
import sys
import re
import csv
import json
import random
import unicodedata
from collections import Counter
import openpyxl

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
JSON_PATH = os.path.join(PROJECT_ROOT, "data", "catalog_audit_verified_prices.json")
CSV_PATH = os.path.join(PROJECT_ROOT, "data", "catalog_audit_verified_prices.csv")
LIVE_JSON = os.path.join(PROJECT_ROOT, "data", "canonical_live_store_162.json")
EXCEL_PATH = os.path.join(PROJECT_ROOT, "قوالب_أصناف_المحلات_Excel", "01_سوبرماركت_وبقالة_ومواد_غذائية.xlsx")
SEEDER_PATH = os.path.join(PROJECT_ROOT, "desktop", "Services", "StoreCatalogSeeder.cs")

EMOJI_PATTERN = re.compile(
    r"[\U00010000-\U0010ffff"
    r"\u2600-\u26ff"
    r"\u2700-\u27bf"
    r"\ufe00-\ufe0f"
    r"\u2300-\u23ff"
    r"\u2b50\u2b55\u200d]"
)

CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

def log(section, msg):
    print(f"[{section}] {msg}")

def test_1_strict_types_and_no_floats():
    log("TEST 1", "Verifying strict integer types and absence of floats...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    
    assert len(json_data) == 1811, f"Expected 1811 records, got {len(json_data)}"

    int_keys = ["verified_price_piasters", "verified_cost_piasters", "prev_price_piasters", "row_number"]
    
    for idx, row in enumerate(json_data, 1):
        for k in int_keys:
            val = row[k]
            assert isinstance(val, int) and not isinstance(val, bool), f"Row {idx}: {k} is {type(val)} ({val}), not int"
            assert val >= 0, f"Row {idx}: {k} is negative ({val})"
        
        # Financial invariant: price > cost > 0
        p = row["verified_price_piasters"]
        c = row["verified_cost_piasters"]
        assert p > 0, f"Row {idx}: price <= 0 ({p})"
        assert c > 0, f"Row {idx}: cost <= 0 ({c})"
        assert p > c, f"Row {idx}: price ({p}) <= cost ({c}) - negative or zero margin!"
        
        # Max bound: <= 5,000,000 piasters (50,000 EGP)
        assert p <= 5000000, f"Row {idx}: price exceeds 50,000 EGP ({p})"
    
    # Check raw text for any decimal points in integer fields
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        raw_text = f.read()
    
    for k in int_keys:
        matches = re.findall(rf'"{k}"\s*:\s*([^,\s\}}\]]+)', raw_text)
        assert len(matches) == 1811, f"Expected 1811 matches for {k}, got {len(matches)}"
        for m in matches:
            assert m.isdigit(), f"Raw JSON field {k} is not digit string: {m}"
            assert "." not in m, f"Decimal point in {k}: {m}"

    log("TEST 1", "PASS: 100% strict integer piasters, zero floats, price > cost > 0.")

def test_2_barcode_cardinality_and_disjointness():
    log("TEST 2", "Verifying barcode accounting, 1-to-1 parity, and disjoint sets...")
    
    # 1. Load Excel
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    excel_barcodes = []
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        for row in sheet.iter_rows(min_row=4, values_only=True):
            if not row or row[1] is None:
                continue
            name = str(row[1]).strip()
            if not name or "إجمالي" in name or "الاجمالي" in name:
                continue
            bc = str(row[2]).strip() if len(row) > 2 and row[2] is not None else ""
            if not bc or bc == "None":
                continue
            if bc.endswith(".0"):
                bc = bc[:-2]
            excel_barcodes.append(bc)
    
    assert len(excel_barcodes) == 1649, f"Excel barcodes: {len(excel_barcodes)} != 1649"
    assert len(set(excel_barcodes)) == 1649, f"Excel has duplicate barcodes! Unique: {len(set(excel_barcodes))}"

    # 2. Load Live Store
    with open(LIVE_JSON, "r", encoding="utf-8") as f:
        live_data = json.load(f)
    live_barcodes = [x["barcode"] for x in live_data]
    assert len(live_barcodes) == 162, f"Live barcodes: {len(live_barcodes)} != 162"
    assert len(set(live_barcodes)) == 162, f"Live data has duplicates! Unique: {len(set(live_barcodes))}"

    # 3. Disjointness check
    overlap = set(excel_barcodes) & set(live_barcodes)
    assert len(overlap) == 0, f"Excel and Live store datasets overlap by {len(overlap)} barcodes: {overlap}"

    # 4. JSON check
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    json_barcodes = [x["barcode"] for x in json_data]
    assert len(json_barcodes) == 1811, f"JSON barcode count: {len(json_barcodes)} != 1811"
    assert len(set(json_barcodes)) == 1811, f"JSON barcodes not unique! Unique: {len(set(json_barcodes))}"

    # 5. Exact set union parity
    expected_barcodes = set(excel_barcodes) | set(live_barcodes)
    assert set(json_barcodes) == expected_barcodes, "Mismatch between JSON barcodes and union of (Excel + Live)"
    
    # 6. Format verification
    for bc in json_barcodes:
        assert bc.isdigit(), f"Barcode contains non-digit: {bc}"
        assert 4 <= len(bc) <= 18, f"Barcode length abnormal: {bc} (len {len(bc)})"

    # 7. CSV parity
    with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
        csv_rows = list(csv.DictReader(f))
    assert len(csv_rows) == 1811, f"CSV row count: {len(csv_rows)} != 1811"
    csv_barcodes = [r["barcode"] for r in csv_rows]
    assert csv_barcodes == json_barcodes, "Order or barcode mismatch between CSV and JSON!"

    log("TEST 2", "PASS: Exactly 1,649 Excel + 162 Live = 1,811 unique barcodes with 0 overlap.")

def test_3_unicode_cleanliness_and_replacement_chars():
    log("TEST 3", "Verifying zero replacement characters, zero emojis, and zero control characters...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    
    findings_replacement = []
    findings_emojis = []
    findings_ctrl = []

    for idx, row in enumerate(json_data, 1):
        for k, v in row.items():
            if isinstance(v, str):
                if "\ufffd" in v:
                    findings_replacement.append(f"Row {idx} [{k}]: '{v}'")
                emojis = EMOJI_PATTERN.findall(v)
                if emojis:
                    findings_emojis.append(f"Row {idx} [{k}]: {emojis} in '{v}'")
                ctrl = CONTROL_CHAR_PATTERN.findall(v)
                if ctrl:
                    findings_ctrl.append(f"Row {idx} [{k}]: {ctrl} in '{v}'")

    assert len(findings_replacement) == 0, f"Found {len(findings_replacement)} replacement characters: {findings_replacement[:5]}"
    assert len(findings_emojis) == 0, f"Found {len(findings_emojis)} emojis: {findings_emojis[:5]}"
    assert len(findings_ctrl) == 0, f"Found {len(findings_ctrl)} control characters: {findings_ctrl[:5]}"

    # Check CSV bytes
    with open(CSV_PATH, "rb") as f:
        raw_csv = f.read()
    assert b"\xef\xbb\xbf" in raw_csv[:3], "CSV must have UTF-8 BOM for Excel Arabic compatibility"
    text_csv = raw_csv.decode("utf-8-sig")
    assert "\ufffd" not in text_csv, "Replacement char in CSV!"
    assert not EMOJI_PATTERN.search(text_csv), "Emoji found in CSV!"

    log("TEST 3", "PASS: 0 replacement characters (U+FFFD), 0 emojis, 0 corrupt control bytes.")

def test_4_price_clustering_and_diversity():
    log("TEST 4", "Verifying price de-clustering, diversity >= 180, and zero 32.00 EGP items...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    
    prices = [x["verified_price_piasters"] for x in json_data]
    price_counts = Counter(prices)

    distinct_count = len(price_counts)
    assert distinct_count >= 180, f"Price diversity too low: {distinct_count} < 180"

    top_price, top_freq = price_counts.most_common(1)[0]
    top_pct = (top_freq / len(prices)) * 100.0
    assert top_pct <= 6.0, f"Price clustering too high: {top_price/100:.2f} EGP has {top_freq} items ({top_pct:.2f}% > 6.0%)"

    items_at_3200 = [x for x in json_data if x["verified_price_piasters"] == 3200]
    assert len(items_at_3200) == 0, f"Found {len(items_at_3200)} items still priced at old 32.00 EGP fallback bucket!"

    log("TEST 4", f"PASS: {distinct_count} distinct prices, top cluster {top_pct:.2f}% (<=6%), 0 items at 32.00 EGP.")

def test_5_staples_and_regulated_margins():
    log("TEST 5", "Verifying staples margins <= 15% and cigarettes margins <= 8%...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)

    staple_keywords = ["سكر", "أرز", "ارز", "زيت", "دقيق", "عدس", "فول", "ملح"]
    staple_count = 0
    staple_violations = []

    tobacco_count = 0
    tobacco_violations = []

    for row in json_data:
        cat = row["category"]
        name = row["product_name"]
        p = row["verified_price_piasters"]
        c = row["verified_cost_piasters"]
        margin = round((p - c) / p * 100.0, 1)

        if cat == "دخان وسجائر" and any(k in name for k in ["سجائر", "مارلبورو", "ميريت", "كليوباترا", "إل إم", "وينستون", "فايسروي", "تارجت"]):
            tobacco_count += 1
            if margin > 8.0:
                tobacco_violations.append((name, margin))

        if cat == "معلبات وبقوليات":
            if any(k in name for k in staple_keywords) and not any(ex in name for ex in ["شيبسي", "مقرمشات", "بسكويت"]):
                staple_count += 1
                if margin > 15.0:
                    staple_violations.append((name, margin))

    assert len(tobacco_violations) == 0, f"Cigarette margin violations (>8%): {tobacco_violations}"
    assert len(staple_violations) == 0, f"Staple margin violations (>15%): {staple_violations}"
    
    log("TEST 5", f"PASS: {tobacco_count} cigarette SKUs (all <= 8%), {staple_count} staples (all <= 15%).")

# Largest remainder method matching C# implementation
def distribute_invoice_discount(item_gross_piasters, total_discount_piasters):
    subtotal_gross = sum(g for g in item_gross_piasters if g > 0)
    if subtotal_gross <= 0 or total_discount_piasters <= 0:
        return [0] * len(item_gross_piasters)
    
    actual_discount = min(total_discount_piasters, subtotal_gross)
    shares = [0] * len(item_gross_piasters)
    remainders = [0] * len(item_gross_piasters)
    indices = list(range(len(item_gross_piasters)))
    sum_distributed = 0

    for i in range(len(item_gross_piasters)):
        gross = max(0, item_gross_piasters[i])
        raw_product = gross * actual_discount
        share = raw_product // subtotal_gross
        rem = raw_product % subtotal_gross
        shares[i] = share
        remainders[i] = rem
        sum_distributed += share

    leftover = actual_discount - sum_distributed
    indices.sort(key=lambda idx: remainders[idx], reverse=True)

    for i in range(min(leftover, len(indices))):
        shares[indices[i]] += 1

    return shares

def multiply_by_milli_units(price_piasters, qty_milli):
    total_scaled = price_piasters * qty_milli
    rounded = (total_scaled + 500) // 1000
    return rounded

def test_6_chaotic_1000_shopping_carts_stress_test():
    log("TEST 6", "Simulating 1,000 chaotic shopping carts with extreme weights and discounts...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    rng = random.Random(1337)
    total_lines = 0

    # Chaotic milli-unit weights from 1 milli-unit (1 mg) to 25,000 milli-units (25 kg)
    qty_pool = [1, 7, 13, 100, 250, 333, 500, 750, 999, 1000, 1250, 1500, 2000, 3750, 5000, 10000, 25000]

    for cart_idx in range(1, 1001):
        num_items = rng.randint(1, 40)
        chosen = rng.sample(catalog, num_items)

        cart_lines = []
        for item in chosen:
            p = item["verified_price_piasters"]
            qty = rng.choice(qty_pool)
            gross = multiply_by_milli_units(p, qty)
            assert gross > 0 or (p * qty < 500), f"Gross anomaly: p={p}, qty={qty}, gross={gross}"
            
            # Line discount 0% to 30%
            disc_pct = rng.choice([0, 0, 5, 10, 15, 20, 25, 30])
            line_disc = (gross * disc_pct + 50) // 100
            net = max(0, gross - line_disc)
            
            cart_lines.append({
                "price": p,
                "qty": qty,
                "gross": gross,
                "line_disc": line_disc,
                "net": net
            })
            total_lines += 1

        subtotal_gross = sum(l["gross"] for l in cart_lines)
        sum_line_disc = sum(l["line_disc"] for l in cart_lines)
        subtotal_net = sum(l["net"] for l in cart_lines)
        assert subtotal_gross == sum_line_disc + subtotal_net

        # Invoice discount 0% to 15%
        inv_disc_pct = rng.choice([0, 1, 3, 5, 8, 10, 15])
        inv_disc = (subtotal_net * inv_disc_pct + 50) // 100

        shares = distribute_invoice_discount([l["net"] for l in cart_lines], inv_disc)
        assert sum(shares) == min(inv_disc, subtotal_net), f"Cart {cart_idx}: discount distribution drift!"

        line_finals = [max(0, l["net"] - shares[i]) for i, l in enumerate(cart_lines)]
        invoice_total = sum(line_finals)
        expected_total = subtotal_net - min(inv_disc, subtotal_net)
        assert invoice_total == expected_total, f"Cart {cart_idx}: invoice total mismatch!"

    log("TEST 6", f"PASS: 1,000 chaotic carts simulated ({total_lines} lines). 0 rounding drift, 0 lost piasters.")

def run_all():
    print("=" * 80)
    print("EMPIRICAL CHALLENGER 2: DEEP ADVERSARIAL TEST SUITE")
    print("=" * 80)
    test_1_strict_types_and_no_floats()
    test_2_barcode_cardinality_and_disjointness()
    test_3_unicode_cleanliness_and_replacement_chars()
    test_4_price_clustering_and_diversity()
    test_5_staples_and_regulated_margins()
    test_6_chaotic_1000_shopping_carts_stress_test()
    print("=" * 80)
    print("ALL 6 DEEP ADVERSARIAL SUITES PASSED WITH 100% COMPLIANCE!")
    print("FINAL VERDICT: APPROVE")
    print("=" * 80)

if __name__ == "__main__":
    run_all()
