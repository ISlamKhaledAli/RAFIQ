"""
Authoritative Empirical Adversarial Stress-Test Suite for Milestone 1 Iteration 2
Executed by Challenger 1 (Price Calibration & Statistical Stress Testing)
"""

import os
import sys
import json
import csv
import re
from collections import Counter

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
JSON_PATH = os.path.join(PROJECT_ROOT, "data", "catalog_audit_verified_prices.json")
CSV_PATH = os.path.join(PROJECT_ROOT, "data", "catalog_audit_verified_prices.csv")
CANONICAL_LIVE_PATH = os.path.join(PROJECT_ROOT, "data", "canonical_live_store_162.json")
TOOLS_SCRIPT_PATH = os.path.join(PROJECT_ROOT, "tools", "generate_verified_pricing_catalog.py")

TOTAL_CHECKS = 0
PASSED_CHECKS = 0
FAILED_CHECKS = 0
FAILURES = []

def check(condition: bool, description: str, details: str = ""):
    global TOTAL_CHECKS, PASSED_CHECKS, FAILED_CHECKS, FAILURES
    TOTAL_CHECKS += 1
    if condition:
        PASSED_CHECKS += 1
        print(f"  [PASS] {description}")
    else:
        FAILED_CHECKS += 1
        msg = f"[FAIL] {description}"
        if details:
            msg += f" -> {details}"
        print(f"  {msg}")
        FAILURES.append(msg)

def main():
    print("=" * 80)
    print("CHALLENGER 1 — EMPIRICAL ADVERSARIAL STRESS-TEST (MILESTONE 1 ITERATION 2)")
    print("=" * 80)

    # --------------------------------------------------------------------------
    # 1. Dataset Loading and Accounting
    # --------------------------------------------------------------------------
    print("\n[1] DATASET LOADING & PARITY CHECKS")
    assert os.path.exists(JSON_PATH), f"Missing {JSON_PATH}"
    assert os.path.exists(CSV_PATH), f"Missing {CSV_PATH}"
    assert os.path.exists(CANONICAL_LIVE_PATH), f"Missing {CANONICAL_LIVE_PATH}"

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        csv_reader = list(csv.DictReader(f))
    with open(CANONICAL_LIVE_PATH, "r", encoding="utf-8") as f:
        live_data = json.load(f)

    check(len(json_data) == 1811, f"JSON has exactly 1,811 records (actual: {len(json_data)})")
    check(len(csv_reader) == 1811, f"CSV has exactly 1,811 rows (actual: {len(csv_reader)})")
    check(len(live_data) == 162, f"Canonical live store has exactly 162 items (actual: {len(live_data)})")

    # Barcode uniqueness
    json_barcodes = [x["barcode"] for x in json_data]
    unique_barcodes = set(json_barcodes)
    check(len(unique_barcodes) == 1811, f"All 1,811 barcodes are 100% unique (unique count: {len(unique_barcodes)})")

    # Parity between JSON and CSV
    csv_barcodes = [row["barcode"] for row in csv_reader]
    check(json_barcodes == csv_barcodes, "JSON and CSV barcodes match in exact order and values")

    # --------------------------------------------------------------------------
    # 2. De-Clustering and Price Diversity Stress Test
    # --------------------------------------------------------------------------
    print("\n[2] PRICE DE-CLUSTERING & DIVERSITY STRESS TEST")
    price_counter = Counter(x["verified_price_piasters"] for x in json_data)
    distinct_price_points = len(price_counter)
    top_prices = price_counter.most_common(10)

    print(f"  Distinct Price Points Count: {distinct_price_points}")
    print("  Top 10 Most Frequent Price Points:")
    for price_piasters, count in top_prices:
        pct = (count / len(json_data)) * 100
        print(f"    - {price_piasters/100:6.2f} EGP ({price_piasters:5d} piasters): {count:3d} items ({pct:5.2f}%)")

    peak_price_piasters, peak_count = top_prices[0]
    peak_pct = (peak_count / len(json_data)) * 100

    check(distinct_price_points >= 180, 
          f"Distinct price points >= 180 (actual: {distinct_price_points})")
    check(peak_pct <= 6.0, 
          f"Peak price cluster <= 6.0% (actual: {peak_pct:.2f}% at {peak_price_piasters/100:.2f} EGP)")

    # Test the specific 32.00 EGP cluster that triggered REJECT in Iteration 1
    items_at_32 = [x for x in json_data if x["verified_price_piasters"] == 3200]
    check(len(items_at_32) == 0, 
          f"The 32.00 EGP cluster is completely dismantled (0 items at 32.00 EGP, actual: {len(items_at_32)})")

    # Check that no other single price exceeds 50 items (2.76%)
    high_cluster_items = [p for p, c in price_counter.items() if c > 50]
    check(len(high_cluster_items) == 0, 
          f"No single price has more than 50 items (actual high clusters: {high_cluster_items})")

    # -------------------------------------------------------------
    # 3. Commodity Staples & Category Margin Stress Test
    # -------------------------------------------------------------
    print("\n[3] COMMODITY STAPLES & CATEGORY MARGIN STRESS TEST")
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

    for item in json_data:
        if item.get("category") == "معلبات وبقوليات":
            name = item.get("product_name", "")
            if any(re.search(pat, name) for pat in staple_patterns):
                pure_staples.append(item)
                margin_str = str(item["margin_percent"]).replace("%", "").strip()
                m = float(margin_str)
                if m > 15.0:
                    pure_staple_violations.append((name, item["barcode"], m))

    print(f"  Identified pure commodity staple items: {len(pure_staples)}")
    check(len(pure_staple_violations) == 0, 
          f"0 staple margin violations (>15.0%) across {len(pure_staples)} staples (actual violations: {len(pure_staple_violations)})",
          f"{pure_staple_violations[:3]}")

    # Check cigarette margins:
    def parse_margin(x):
        return float(str(x["margin_percent"]).replace("%", "").strip())

    cig_items = [x for x in json_data if x["category"] == "دخان وسجائر" and "كبريت" not in x.get("product_name", "") and "ولاعة" not in x.get("product_name", "")]
    cig_margin_violations = [x for x in cig_items if parse_margin(x) > 8.0]
    check(len(cig_margin_violations) == 0,
          f"0 cigarette margin violations (>8.0%) across {len(cig_items)} cigarettes (actual violations: {len(cig_margin_violations)})")

    # Check dairy margins:
    dairy_items = [x for x in json_data if x["category"] == "ألبان وأجبان"]
    dairy_margin_violations = [x for x in dairy_items if parse_margin(x) > 20.0]
    check(len(dairy_margin_violations) == 0,
          f"0 dairy margin violations (>20.0%) across {len(dairy_items)} items (actual violations: {len(dairy_margin_violations)})")

    # --------------------------------------------------------------------------
    # 4. Strict Financial & Integer Piasters Invariants
    # --------------------------------------------------------------------------
    print("\n[4] STRICT FINANCIAL & INTEGER PIASTERS INVARIANTS")
    non_int_prices = [x for x in json_data if not isinstance(x["verified_price_piasters"], int) or isinstance(x["verified_price_piasters"], bool)]
    non_int_costs = [x for x in json_data if not isinstance(x["verified_cost_piasters"], int) or isinstance(x["verified_cost_piasters"], bool)]
    inversions = [x for x in json_data if x["verified_cost_piasters"] >= x["verified_price_piasters"]]
    negative_zero = [x for x in json_data if x["verified_cost_piasters"] <= 0 or x["verified_price_piasters"] <= 0]

    check(len(non_int_prices) == 0, "100% of verified_price_piasters are strict integers (zero floats)")
    check(len(non_int_costs) == 0, "100% of verified_cost_piasters are strict integers (zero floats)")
    check(len(inversions) == 0, "Zero margin inversions: price > cost for 100% of items")
    check(len(negative_zero) == 0, "Zero negative or zero prices/costs for 100% of items")

    # Verify CSV integer values parse without decimal loss
    csv_non_int = []
    for r in csv_reader:
        try:
            vp = int(r["verified_price_piasters"])
            vc = int(r["verified_cost_piasters"])
            if vp <= vc or vc <= 0:
                csv_non_int.append(r)
        except ValueError:
            csv_non_int.append(r)
    check(len(csv_non_int) == 0, "100% of CSV records parse cleanly as positive integers with price > cost")

    # --------------------------------------------------------------------------
    # 5. Semantic Sanity Spot-Checks
    # --------------------------------------------------------------------------
    print("\n[5] SEMANTIC SANITY & SPECIFIC ITEM VERIFICATION")
    spot_checks = [
        ("3161711001971", "جبنة بي جي إس كابريس فرنسية 300 جم", 20000, 35000, "Imported French cheese"),
        ("4103040144874", "سيباميد رول أون", 25000, 40000, "Imported Sebamed Deo"),
        ("8718951358874", "AJAX glass cleaning spray 750ml", 5000, 9000, "Ajax glass spray"),
        ("5000159553896", "جالكسي Ripple 4 X 30g", 10000, 18000, "Galaxy Ripple 4-pack"),
        ("0733603091785", "شيبس هانترز جورميه 40 جم", 6000, 12000, "Hunter's Gourmet chips"),
        ("4006381493499", "طقم أقلام ستاديلر/ستابيلو 8 ألوان", 20000, 35000, "Stabilo 8-pack pens"),
        ("3501170810958", "قلم ماركر شاربي 12 لون", 35000, 55000, "Sharpie 12-pack markers"),
        ("08601483",      "مناديل جيب فاين مفردة", 300, 700, "Pocket tissue single"),
        ("6223001877202", "المراعي مكس فراولة 200 مل", 1100, 1600, "Flavored milk 200ml"),
        ("6223001878018", "المراعي 1.5 لتر كامل الدسم", 7000, 9500, "1.5L full cream milk"),
        ("6222014318016", "كريمة طهي 1 لتر", 16000, 25000, "Cooking cream 1L"),
        ("5011417563687", "مناديل ديتول مطهرة 126 منديل", 15000, 25000, "Dettol wipes 126s"),
        ("8001090765185", "إريال أوتوماتيك 58 غسلة / 7 كجم", 40000, 50000, "Ariel 7kg / 58 washes"),
        ("6223001030508", "ملح طعام 700 جم", 400, 800, "Table salt 700g"),
        ("5053990101597", "برينجلز 165 جم مستورد", 9500, 13000, "Pringles 165g imported")
    ]

    item_by_barcode = {x["barcode"]: x for x in json_data}
    spot_failures = []
    for bc, name, min_p, max_p, desc in spot_checks:
        it = item_by_barcode.get(bc)
        if not it:
            spot_failures.append(f"Missing barcode {bc} ({desc})")
            continue
        p = it["verified_price_piasters"]
        if not (min_p <= p <= max_p):
            spot_failures.append(f"{desc} ({bc}): Price {p/100:.2f} EGP outside expected [{min_p/100:.2f}, {max_p/100:.2f}]")
        else:
            print(f"    - {desc:32s}: {p/100:6.2f} EGP ({it['verified_cost_piasters']/100:6.2f} cost, {it['margin_percent']}%) -> OK")

    check(len(spot_failures) == 0, 
          f"All {len(spot_checks)} semantic spot-checks pass with 100% accuracy",
          f"{spot_failures}")

    # --------------------------------------------------------------------------
    # 6. Zero Emojis and Character Cleanliness
    # --------------------------------------------------------------------------
    print("\n[6] ZERO EMOJIS & CHARACTER CLEANLINESS")
    with open(JSON_PATH, "rb") as f:
        json_bytes = f.read()
    with open(CSV_PATH, "rb") as f:
        csv_bytes = f.read()

    emoji_pattern = re.compile(rb"[\xf0-\xf4][\x80-\xbf]{3}")
    json_emojis = emoji_pattern.findall(json_bytes)
    csv_emojis = emoji_pattern.findall(csv_bytes)

    check(len(json_emojis) == 0, f"0 emojis in JSON bytes (found: {len(json_emojis)})")
    check(len(csv_emojis) == 0, f"0 emojis in CSV bytes (found: {len(csv_emojis)})")

    # Replacement character check (\ufffd / b'\xef\xbf\xbd')
    replacement_char = b"\xef\xbf\xbd"
    check(replacement_char not in json_bytes, "0 replacement characters (\\ufffd) in JSON")
    check(replacement_char not in csv_bytes, "0 replacement characters (\\ufffd) in CSV")

    # Juhayna milk name check
    juhayna_item = item_by_barcode.get("6223000350003")
    check(juhayna_item and juhayna_item.get("product_name") == "جهينة حليب", 
          f"Juhayna milk name sanitized: '{juhayna_item.get('product_name') if juhayna_item else 'NONE'}'")

    # --------------------------------------------------------------------------
    # 7. Code Independence & No Ephemeral Path Leakage
    # --------------------------------------------------------------------------
    print("\n[7] CODE INDEPENDENCE & NO RUNTIME DEPENDENCY ON .agents/teamwork")
    with open(TOOLS_SCRIPT_PATH, "r", encoding="utf-8") as f:
        tools_content = f.read()

    # Search for execution code referencing .agents/teamwork
    code_lines_with_agents = []
    for line_num, line in enumerate(tools_content.splitlines(), start=1):
        stripped = line.strip()
        if ".agents" in stripped:
            if not (stripped.startswith("#") or stripped.startswith("-") or stripped.startswith("*") or stripped.startswith('"""') or stripped.startswith("'''")):
                code_lines_with_agents.append((line_num, line))

    check(len(code_lines_with_agents) == 0, 
          f"Zero executable code references to .agents in {TOOLS_SCRIPT_PATH} (found: {len(code_lines_with_agents)})",
          f"{code_lines_with_agents}")

    # --------------------------------------------------------------------------
    # Summary and Verdict
    # --------------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("CHALLENGER 1 STRESS TEST SUMMARY")
    print("=" * 80)
    print(f"Total Checks:   {TOTAL_CHECKS}")
    print(f"Passed Checks:  {PASSED_CHECKS}")
    print(f"Failed Checks:  {FAILED_CHECKS}")

    if FAILED_CHECKS == 0:
        print("\nFINAL CHALLENGER VERDICT: APPROVE")
        return 0
    else:
        print("\nFINAL CHALLENGER VERDICT: REJECT")
        print("FAILURES:")
        for fail in FAILURES:
            print(f"  - {fail}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
