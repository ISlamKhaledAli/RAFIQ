import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect(r'C:\ProgramData\RafiqPOS\data\rafiq_pos.db')
c = conn.cursor()

cutoff = 4
bdate = '2026-10-11'

sql = """
    SELECT 
        COALESCE(SUM(s.total_piasters), 0) AS total_sales,
        COALESCE(SUM(
            CASE 
                WHEN s.payment_method = 'cash' THEN MIN(s.paid_piasters, s.total_piasters)
                WHEN s.payment_method = 'multi' THEN (
                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                    FROM payments p 
                    WHERE p.sale_id = s.id AND p.method = 'cash'
                )
                ELSE 0 
            END
        ), 0) AS cash_sales,
        COALESCE(SUM(
            CASE 
                WHEN s.payment_method = 'instapay' THEN s.paid_piasters
                WHEN s.payment_method = 'multi' THEN (
                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                    FROM payments p 
                    WHERE p.sale_id = s.id AND p.method = 'instapay'
                )
                ELSE 0 
            END
        ), 0) AS instapay_sales,
        COALESCE(SUM(
            CASE 
                WHEN s.payment_method = 'vodafone_cash' THEN s.paid_piasters
                WHEN s.payment_method = 'multi' THEN (
                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                    FROM payments p 
                    WHERE p.sale_id = s.id AND p.method = 'vodafone_cash'
                )
                ELSE 0 
            END
        ), 0) AS vodafone_cash_sales,
        COALESCE(SUM(
            CASE 
                WHEN s.payment_method = 'card' THEN s.paid_piasters
                WHEN s.payment_method = 'multi' THEN (
                    SELECT COALESCE(SUM(p.amount_piasters), 0) 
                    FROM payments p 
                    WHERE p.sale_id = s.id AND p.method = 'card'
                )
                ELSE 0 
            END
        ), 0) AS card_sales,
        COALESCE(SUM(CASE WHEN s.total_piasters > s.paid_piasters THEN (s.total_piasters - s.paid_piasters) ELSE 0 END), 0) AS credit_sales,
        COUNT(*) AS inv_count
    FROM sales s
    WHERE date(datetime(s.created_at, 'localtime', '-' || ? || ' hours')) = ?
      AND s.status != 'cancelled'
      AND s.id NOT LIKE 'demo_%'
      AND s.id NOT LIKE 'stress_%';
"""

c.execute(sql, (cutoff, bdate))
row = c.fetchone()
print("Updated DailyClosing query result:")
print("total_sales:", row[0], "piasters (", row[0]/100.0, "EGP )")
print("cash_sales:", row[1], "piasters (", row[1]/100.0, "EGP )")
print("instapay_sales:", row[2], "piasters (", row[2]/100.0, "EGP )")
print("vodafone_cash_sales:", row[3], "piasters (", row[3]/100.0, "EGP )")
print("card_sales:", row[4], "piasters (", row[4]/100.0, "EGP )")
print("credit_sales:", row[5], "piasters (", row[5]/100.0, "EGP )")
print("inv_count:", row[6])

# Customer debt payments today
c.execute("""
    SELECT COALESCE(SUM(
        CASE 
            WHEN type = 'payment' THEN amount_piasters 
            WHEN type = 'payment_cancel' THEN -amount_piasters 
            ELSE 0 
        END
    ), 0) AS total_debt_payments
    FROM customer_ledger
    WHERE type IN ('payment', 'payment_cancel')
      AND sale_id IS NULL
      AND (date(created_at, 'localtime') = '2026-10-11' OR date(created_at) = '2026-10-11');
""")
debt_cash = c.fetchone()[0]
print("Debt payments cash:", debt_cash, "piasters (", debt_cash/100.0, "EGP )")

expected_drawer = row[1] + debt_cash
print("Expected drawer cash:", expected_drawer, "piasters (", expected_drawer/100.0, "EGP )")
