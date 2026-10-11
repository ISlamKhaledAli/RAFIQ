import sqlite3

conn = sqlite3.connect(r'C:\ProgramData\RafiqPOS\data\rafiq_pos.db')
c = conn.cursor()

statements = [
    'ALTER TABLE epay_terminals ADD COLUMN customer_fee_type TEXT NOT NULL DEFAULT "fixed"',
    'ALTER TABLE epay_terminals ADD COLUMN customer_fee_value INTEGER NOT NULL DEFAULT 200',
    'ALTER TABLE epay_terminals ADD COLUMN provider_commission_type TEXT NOT NULL DEFAULT "fixed"',
    'ALTER TABLE epay_terminals ADD COLUMN provider_commission_value INTEGER NOT NULL DEFAULT 100',
    'INSERT OR REPLACE INTO schema_migrations (version, name, applied_at) VALUES (28, "Electronic Payment Terminals Dynamic Fee and Commission Rules", datetime("now"))'
]

for stmt in statements:
    try:
        c.execute(stmt)
        print("Executed:", stmt[:50])
    except Exception as e:
        print("Note:", e)

conn.commit()
c.execute("PRAGMA table_info(epay_terminals)")
for row in c.fetchall():
    print("Col:", row[1], row[2], row[4])
conn.close()
