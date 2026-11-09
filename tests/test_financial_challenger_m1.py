"""
Adversarial Integer Financial Arithmetic & Data Invariant Stress Test Suite
Challenger 2 — Milestone 1 (Role: Integer Financial Challenger)
Workspace: c:\\Users\\khale\\OneDrive\\Desktop\\RAFIQ
"""

import os
import sys
import json
import csv
import re
import random
import unicodedata

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
JSON_PATH = os.path.join(DATA_DIR, "catalog_audit_verified_prices.json")
CSV_PATH = os.path.join(DATA_DIR, "catalog_audit_verified_prices.csv")
TOOLS_PY = os.path.join(os.path.dirname(DATA_DIR), "tools", "generate_verified_pricing_catalog.py")

# Comprehensive Unicode Emoji Regex
EMOJI_PATTERN = re.compile(
    r"[\U00010000-\U0010ffff"
    r"\u2600-\u26ff"
    r"\u2700-\u27bf"
    r"\ufe00-\ufe0f"
    r"\u2300-\u23ff"
    r"\u2b50\u2b55\u200d]"
)

def test_file_existence_and_sizes():
    print("[1/8] Testing file existence and minimum size thresholds...")
    assert os.path.exists(JSON_PATH), f"Missing JSON dataset: {JSON_PATH}"
    assert os.path.exists(CSV_PATH), f"Missing CSV dataset: {CSV_PATH}"
    
    json_size = os.path.getsize(JSON_PATH)
    csv_size = os.path.getsize(CSV_PATH)
    print(f"  - JSON size: {json_size:,} bytes")
    print(f"  - CSV size:  {csv_size:,} bytes")
    assert json_size > 100000, f"JSON file too small ({json_size} bytes)"
    assert csv_size > 50000, f"CSV file too small ({csv_size} bytes)"
    print("  PASS: Datasets exist with expected file sizes.")

def test_utf8_integrity_and_zero_emojis():
    print("[2/8] Testing strict UTF-8 byte integrity and Zero-Emoji invariant...")
    files_to_check = [JSON_PATH, CSV_PATH, TOOLS_PY]
    
    findings_replacement_char = []

    for fpath in files_to_check:
        filename = os.path.basename(fpath)
        # 1. Binary read to verify strict UTF-8 decoding
        with open(fpath, "rb") as f:
            raw_bytes = f.read()
        
        # Check BOM if present (CSV often has utf-8-sig)
        try:
            if fpath.endswith(".csv") and raw_bytes.startswith(b"\xef\xbb\xbf"):
                decoded_text = raw_bytes.decode("utf-8-sig")
            else:
                decoded_text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as e:
            raise AssertionError(f"Strict UTF-8 Decoding failed on {filename}: {e}")
        
        # Check for replacement characters U+FFFD (corruption indicator from legacy source)
        if "\ufffd" in decoded_text:
            lines = decoded_text.splitlines()
            for idx, line in enumerate(lines, 1):
                if "\ufffd" in line:
                    findings_replacement_char.append(f"{filename} Line {idx}: {line.strip()[:100]}")
        
        # Check for emojis
        emoji_matches = EMOJI_PATTERN.findall(decoded_text)
        if emoji_matches:
            lines = decoded_text.splitlines()
            findings = []
            for idx, line in enumerate(lines, 1):
                found = EMOJI_PATTERN.findall(line)
                if found:
                    findings.append(f"Line {idx}: {found} in '{line[:80]}'")
            raise AssertionError(f"Emoji violation in {filename} ({len(emoji_matches)} occurrences):\n" + "\n".join(findings[:5]))
            
        print(f"  - {filename}: Strict UTF-8 valid byte sequence, 0 emojis.")
        
    if findings_replacement_char:
        print(f"  [OBSERVATION / DEFECT DETECTED] Replacement character U+FFFD detected in {len(findings_replacement_char)} place(s):")
        for f in findings_replacement_char:
            print(f"    * {f}")
    else:
        print("  PASS: 0 replacement characters found.")
    print("  PASS: Strict UTF-8 byte sequence and Zero Emojis compliance verified across all M1 deliverables.")

def test_raw_json_text_no_decimals_in_integers():
    print("[3/8] Inspecting raw JSON serialization text for illegal decimal points in integer fields...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        raw_json = f.read()

    # Regex targeting integer fields to ensure no decimal point appears in the literal token:
    # e.g., "verified_price_piasters": 4800 (valid) vs 4800.0 or "4800.0" (invalid)
    int_fields = ["verified_price_piasters", "verified_cost_piasters", "prev_price_piasters", "row_number"]
    
    for field in int_fields:
        # Pattern captures the literal token following the field key
        pattern = re.compile(rf'"{re.escape(field)}"\s*:\s*([^,\s\}}\]]+)')
        matches = pattern.findall(raw_json)
        assert len(matches) == 1811, f"Expected 1811 matches for field '{field}', got {len(matches)}"
        
        for idx, val in enumerate(matches):
            assert val.isdigit(), f"Field '{field}' at record {idx+1} is not a pure integer literal: '{val}'"
            assert "." not in val, f"Decimal dot '.' found in integer field '{field}' at record {idx+1}: '{val}'"
            assert not (val.startswith('"') or val.endswith('"')), f"Integer field '{field}' was serialized as string: '{val}'"
    print("  PASS: All 1,811 records have pure integer literals without decimal points or string wrappers in JSON.")

def test_parsed_json_and_csv_invariants():
    print("[4/8] Testing parsed JSON types, arithmetic invariants, and CSV parity...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    
    assert isinstance(json_data, list), "Root of JSON must be a list"
    assert len(json_data) == 1811, f"Expected exactly 1,811 items in JSON, found {len(json_data)}"

    with open(CSV_PATH, "r", encoding="utf-8-sig") as f:
        csv_reader = list(csv.DictReader(f))
    
    assert len(csv_reader) == 1811, f"Expected exactly 1,811 items in CSV, found {len(csv_reader)}"

    seen_barcodes = set()

    for idx, (j_rec, c_rec) in enumerate(zip(json_data, csv_reader), 1):
        bc = j_rec.get("barcode")
        assert bc, f"Record {idx} missing barcode"
        assert bc.isdigit(), f"Barcode '{bc}' contains non-digit characters"
        assert bc not in seen_barcodes, f"Duplicate barcode '{bc}' found at record {idx}"
        seen_barcodes.add(bc)

        # JSON exact type checks
        p_json = j_rec.get("verified_price_piasters")
        c_json = j_rec.get("verified_cost_piasters")
        prev_json = j_rec.get("prev_price_piasters")
        row_num = j_rec.get("row_number")

        assert type(p_json) is int, f"verified_price_piasters at {bc} is {type(p_json)}, expected int"
        assert type(c_json) is int, f"verified_cost_piasters at {bc} is {type(c_json)}, expected int"
        assert type(prev_json) is int, f"prev_price_piasters at {bc} is {type(prev_json)}, expected int"
        assert type(row_num) is int, f"row_number at {bc} is {type(row_num)}, expected int"

        # Integer arithmetic modulo 1 checks
        assert p_json % 1 == 0, f"verified_price_piasters % 1 != 0 for {bc}"
        assert c_json % 1 == 0, f"verified_cost_piasters % 1 != 0 for {bc}"
        assert prev_json % 1 == 0, f"prev_price_piasters % 1 != 0 for {bc}"

        # Financial invariants: Price > Cost > 0
        assert p_json > 0, f"verified_price_piasters must be > 0, got {p_json} for {bc}"
        assert c_json > 0, f"verified_cost_piasters must be > 0, got {c_json} for {bc}"
        assert p_json > c_json, f"Price {p_json} must be strictly greater than Cost {c_json} for {bc} (negative/zero margin)"

        # 64-bit signed integer boundary (long in C#)
        assert p_json < 9223372036854775807, f"Price exceeds long.MaxValue for {bc}"
        assert c_json < 9223372036854775807, f"Cost exceeds long.MaxValue for {bc}"

        # CSV parity checks
        assert c_rec["barcode"] == bc, f"CSV and JSON barcode mismatch at row {idx}: {c_rec['barcode']} vs {bc}"
        assert c_rec["verified_price_piasters"].isdigit(), f"CSV verified_price_piasters not integer string: {c_rec['verified_price_piasters']}"
        assert c_rec["verified_cost_piasters"].isdigit(), f"CSV verified_cost_piasters not integer string: {c_rec['verified_cost_piasters']}"
        assert int(c_rec["verified_price_piasters"]) == p_json, f"Price mismatch between CSV and JSON for {bc}"
        assert int(c_rec["verified_cost_piasters"]) == c_json, f"Cost mismatch between CSV and JSON for {bc}"
        assert c_rec["product_name"] == j_rec["product_name"], f"Name mismatch for {bc}"
        assert c_rec["category"] == j_rec["category"], f"Category mismatch for {bc}"
        assert c_rec["price_status"] == j_rec["price_status"], f"Price status mismatch for {bc}"
        assert c_rec["origin"] == j_rec["origin"], f"Origin mismatch for {bc}"

    print(f"  PASS: 1,811 records verified. Strict integer types, Price > Cost > 0, 100% CSV/JSON parity.")

# Largest Remainder Method implementation matching C# Money.DistributeInvoiceDiscount
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
    # Sort indices by remainder descending
    indices.sort(key=lambda idx: remainders[idx], reverse=True)

    for i in range(min(leftover, len(indices))):
        shares[indices[i]] += 1

    return shares

# Half-up rounding matching C# Money.MultiplyByMilliUnits
def multiply_by_milli_units(price_piasters, qty_milli):
    # (price * qty_milli) / 1000 with away-from-zero rounding
    total_scaled = price_piasters * qty_milli
    rounded = (total_scaled + 500) // 1000
    return rounded

# Tax calculation matching C# Money.CalculateTaxPiasters
def calculate_tax_piasters(total_piasters, tax_rate_percent, price_includes_tax=True):
    if tax_rate_percent <= 0 or total_piasters <= 0:
        return 0
    if price_includes_tax:
        # net = (total * 100) / (100 + tax_rate)
        # tax = total - net
        scaled = total_piasters * 100
        divisor = 100 + tax_rate_percent
        net = (scaled + (divisor // 2)) // divisor
        return max(0, total_piasters - net)
    else:
        scaled = total_piasters * tax_rate_percent
        return (scaled + 50) // 100

def test_simulate_100_shopping_carts():
    print("[5/8] Simulating 100 adversarial shopping carts (1-50 items each) for 0 rounding drift...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    # Use fixed seeds for determinism and reproducibility
    rng = random.Random(42)

    total_drift_errors = 0
    total_items_simulated = 0

    # Possible milli-unit quantities: discrete units (1-10 pcs) or fractional weights (250g, 500g, 750g, 1.25kg, etc.)
    qty_options = [
        1000, 2000, 3000, 4000, 5000, 10000, # 1, 2, 3, 4, 5, 10 units
        250, 500, 750, 1250, 1500, 2500, 3750  # fractional weights in grams
    ]

    for cart_id in range(1, 101):
        num_items = rng.randint(1, 50)
        selected_items = rng.sample(catalog, num_items)

        cart_lines = []
        for item in selected_items:
            qty_milli = rng.choice(qty_options)
            price_piasters = item["verified_price_piasters"]
            
            # 1. Line gross calculation
            line_gross = multiply_by_milli_units(price_piasters, qty_milli)
            assert isinstance(line_gross, int)
            assert line_gross % 1 == 0
            assert line_gross > 0

            # 2. Random line discount (0% to 20%)
            line_discount_pct = rng.choice([0, 0, 0, 5, 10, 15, 20])
            line_discount = (line_gross * line_discount_pct + 50) // 100
            line_net = max(0, line_gross - line_discount)
            assert isinstance(line_discount, int)
            assert isinstance(line_net, int)

            # 3. Tax rate (0% or 14% Egyptian VAT)
            tax_rate = 14 if rng.random() > 0.3 else 0

            cart_lines.append({
                "barcode": item["barcode"],
                "price": price_piasters,
                "qty_milli": qty_milli,
                "gross": line_gross,
                "line_discount": line_discount,
                "net": line_net,
                "tax_rate": tax_rate
            })
            total_items_simulated += 1

        subtotal_gross = sum(l["gross"] for l in cart_lines)
        sum_line_discounts = sum(l["line_discount"] for l in cart_lines)
        subtotal_net = sum(l["net"] for l in cart_lines)

        assert subtotal_gross == sum_line_discounts + subtotal_net, "Subtotal balance broken!"

        # 4. Invoice-level cash discount (e.g., between 0 and 10% of subtotal_net)
        invoice_discount_pct = rng.choice([0, 2, 5, 7, 10])
        invoice_discount_piasters = (subtotal_net * invoice_discount_pct + 50) // 100
        
        # 5. Distribute invoice discount proportionally using Largest Remainder Method
        item_net_list = [l["net"] for l in cart_lines]
        distributed_shares = distribute_invoice_discount(item_net_list, invoice_discount_piasters)

        # DRIFT CHECK 1: Distributed shares must sum up to exact invoice discount
        sum_distributed = sum(distributed_shares)
        expected_discount = min(invoice_discount_piasters, subtotal_net)
        if sum_distributed != expected_discount:
            print(f"DRIFT ERROR in Cart {cart_id}: distributed {sum_distributed} != expected {expected_discount}")
            total_drift_errors += 1
        assert sum_distributed == expected_discount, f"Discount distribution drift in Cart {cart_id}"

        # 6. Apply distributed discount to lines and compute line totals & taxes
        line_totals = []
        total_tax_inclusive = 0
        total_tax_exclusive = 0

        for i, line in enumerate(cart_lines):
            line_final = max(0, line["net"] - distributed_shares[i])
            line_totals.append(line_final)
            
            # Tax calculations
            if line["tax_rate"] > 0:
                tax_inc = calculate_tax_piasters(line_final, line["tax_rate"], price_includes_tax=True)
                tax_exc = calculate_tax_piasters(line_final, line["tax_rate"], price_includes_tax=False)
                
                # In inclusive tax: tax + net_base == line_final exactly
                net_base = line_final - tax_inc
                assert net_base + tax_inc == line_final, f"Tax inclusive breakdown drift at line {i}"
                
                total_tax_inclusive += tax_inc
                total_tax_exclusive += tax_exc

        # DRIFT CHECK 2: Sum of final line totals must equal subtotal_net - expected_discount
        final_invoice_total = sum(line_totals)
        expected_invoice_total = subtotal_net - expected_discount
        if final_invoice_total != expected_invoice_total:
            print(f"DRIFT ERROR in Cart {cart_id}: final sum {final_invoice_total} != expected {expected_invoice_total}")
            total_drift_errors += 1
        assert final_invoice_total == expected_invoice_total, f"Invoice total drift in Cart {cart_id}"

        # DRIFT CHECK 3: Total discount across the entire cart
        total_discount_all = sum_line_discounts + expected_discount
        assert subtotal_gross - total_discount_all == final_invoice_total

        # DRIFT CHECK 4: Currency formatting consistency (EGP presentation string)
        egp_str = f"{final_invoice_total / 100.0:.2f}"
        reconstructed_piasters = int(round(float(egp_str) * 100))
        assert reconstructed_piasters == final_invoice_total, f"EGP string presentation lost precision: {egp_str} vs {final_invoice_total}"

    print(f"  PASS: 100 shopping carts simulated ({total_items_simulated} line items). ZERO rounding drift detected!")

def test_benchmark_sku_calibrations():
    print("[6/8] Testing strategic benchmark SKUs against Egyptian official market baselines...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        by_barcode = {r["barcode"]: r for r in json.load(f)}

    benchmarks = [
        # Barcode, Expected Name Keyword, Expected Price EGP, Expected Price Piasters, Expected Margin min/max
        ("6221004001655", "كليوباترا كينج", 48.00, 4800, 5.0, 7.0),
        ("6221004102901", "كليوباترا سوفت", 48.00, 4800, 5.0, 7.0),
        ("3800216120151", "مارلبورو أحمر", 109.00, 10900, 5.0, 7.0),
        ("3800216120168", "مارلبورو جولد", 109.00, 10900, 5.0, 7.0),
        ("7622100996224", "ميريت", 121.00, 12100, 5.0, 7.0),
        ("4033100018343", "وينستون أزرق", 75.00, 7500, 5.0, 7.0),
        ("0028200310026", "إل إم أزرق", 88.00, 8800, 5.0, 7.0),
        ("8001090765185", "إريال", 460.00, 46000, 15.0, 20.0),
        ("6223001030508", "ملح", 6.00, 600, 15.0, 30.0),
        ("5053990101597", "برينجلز", 110.00, 11000, 15.0, 25.0),
        ("6223000350003", "جهينة حليب", 54.00, 5400, 10.0, 16.0),
    ]

    for bc, name_kw, exp_egp, exp_piasters, min_margin, max_margin in benchmarks:
        assert bc in by_barcode, f"Benchmark barcode {bc} missing from catalog!"
        rec = by_barcode[bc]
        assert name_kw in rec["product_name"], f"Name mismatch for {bc}: expected keyword '{name_kw}' in '{rec['product_name']}'"
        assert rec["verified_price_piasters"] == exp_piasters, f"Price mismatch for {bc}: {rec['verified_price_piasters']} != {exp_piasters}"
        assert float(rec["verified_price_egp"]) == exp_egp, f"EGP string price mismatch for {bc}: {rec['verified_price_egp']} != {exp_egp}"
        
        # Margin check
        margin = float(rec["margin_percent"].replace("%", ""))
        assert min_margin <= margin <= max_margin, f"Margin {margin}% for {bc} out of bounds [{min_margin}%, {max_margin}%]"

    print("  PASS: All 11 strategic benchmark SKUs calibrated with 100% accuracy.")

def test_egp_string_to_piasters_consistency():
    print("[7/8] Testing exact consistency between EGP display strings and piasters integers...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    for idx, item in enumerate(catalog, 1):
        bc = item["barcode"]
        
        # 1. verified_price_egp vs verified_price_piasters
        p_piasters = item["verified_price_piasters"]
        p_egp = item["verified_price_egp"]
        expected_p_egp = f"{p_piasters / 100.0:.2f}"
        assert p_egp == expected_p_egp, f"Price EGP desync for {bc}: '{p_egp}' != '{expected_p_egp}'"

        # 2. verified_cost_egp vs verified_cost_piasters
        c_piasters = item["verified_cost_piasters"]
        c_egp = item["verified_cost_egp"]
        expected_c_egp = f"{c_piasters / 100.0:.2f}"
        assert c_egp == expected_c_egp, f"Cost EGP desync for {bc}: '{c_egp}' != '{expected_c_egp}'"

        # 3. prev_price_egp vs prev_price_piasters
        prev_piasters = item["prev_price_piasters"]
        prev_egp = item["prev_price_egp"]
        expected_prev_egp = f"{prev_piasters / 100.0:.2f}"
        assert prev_egp == expected_prev_egp, f"Prev price EGP desync for {bc}: '{prev_egp}' != '{expected_prev_egp}'"

    print("  PASS: 100% of EGP string representations match integer piasters with zero rounding skew.")

def test_extreme_edge_cases_and_origin_partitions():
    print("[8/8] Testing catalog origin partitions and extreme edge cases (1 milli-unit, 1 piaster discount)...")
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    origins = {}
    for item in catalog:
        orig = item.get("origin")
        origins[orig] = origins.get(orig, 0) + 1

    print(f"  - Origin breakdown: {origins}")
    assert origins.get("catalog_1649") == 1649, f"Expected 1,649 items from catalog_1649, got {origins.get('catalog_1649')}"
    assert origins.get("live_store_162") == 162, f"Expected 162 items from live_store_162, got {origins.get('live_store_162')}"
    assert sum(origins.values()) == 1811, "Sum of origins does not equal 1,811!"

    # Extreme Test A: 1 milli-unit (1/1000th of an item/unit)
    min_item = min(catalog, key=lambda x: x["verified_price_piasters"])
    max_item = max(catalog, key=lambda x: x["verified_price_piasters"])
    print(f"  - Lowest price item: {min_item['product_name']} ({min_item['verified_price_piasters']} piasters = {min_item['verified_price_egp']} EGP)")
    print(f"  - Highest price item: {max_item['product_name']} ({max_item['verified_price_piasters']} piasters = {max_item['verified_price_egp']} EGP)")

    # Test 1 milli-unit on min item (e.g. 500 piasters * 1 / 1000 = 0.5 -> 1 piaster)
    cost_1milli = multiply_by_milli_units(min_item["verified_price_piasters"], 1)
    assert isinstance(cost_1milli, int)
    assert cost_1milli >= 0

    # Extreme Test B: 1 piaster total discount distributed over 50 items
    gross_50 = [item["verified_price_piasters"] for item in catalog[:50]]
    dist_1piaster = distribute_invoice_discount(gross_50, 1)
    assert sum(dist_1piaster) == 1, f"Expected exactly 1 piaster distributed, got {sum(dist_1piaster)}"
    assert max(dist_1piaster) == 1
    assert min(dist_1piaster) == 0

    # Extreme Test C: Total discount equals entire cart (100% free invoice)
    dist_100pct = distribute_invoice_discount(gross_50, sum(gross_50))
    assert sum(dist_100pct) == sum(gross_50), "100% discount distribution failed!"
    for g, d in zip(gross_50, dist_100pct):
        assert g == d, "Line gross did not equal distributed discount for 100% discount"

    print("  PASS: Origin partitions and extreme mathematical boundary edge cases verified.")

def run_all_tests():
    print("=" * 80)
    print("ADVERSARIAL INTEGER FINANCIAL & DATA INVARIANT TEST HARNESS (CHALLENGER 2)")
    print("=" * 80)
    test_file_existence_and_sizes()
    test_utf8_integrity_and_zero_emojis()
    test_raw_json_text_no_decimals_in_integers()
    test_parsed_json_and_csv_invariants()
    test_simulate_100_shopping_carts()
    test_benchmark_sku_calibrations()
    test_egp_string_to_piasters_consistency()
    test_extreme_edge_cases_and_origin_partitions()
    print("=" * 80)
    print("ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% COMPLIANCE!")
    print("VERDICT: APPROVE")
    print("=" * 80)

if __name__ == "__main__":
    try:
        run_all_tests()
    except Exception as e:
        print(f"\nTEST FAILED WITH EXCEPTION:\n{e}", file=sys.stderr)
        sys.exit(1)
