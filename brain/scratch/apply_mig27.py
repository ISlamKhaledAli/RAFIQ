import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect(r'C:\ProgramData\RafiqPOS\data\rafiq_pos.db')
c = conn.cursor()

c.execute("SELECT MAX(version) FROM schema_migrations")
print("Current schema version:", c.fetchone()[0])

# Run migration 27 SQL
mig27_sql = """
CREATE TABLE IF NOT EXISTS epay_terminals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'super_pay',
    terminal_code TEXT,
    balance_piasters INTEGER NOT NULL DEFAULT 0,
    low_balance_alert_piasters INTEGER NOT NULL DEFAULT 50000,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS epay_transactions (
    id TEXT PRIMARY KEY,
    terminal_id TEXT NOT NULL REFERENCES epay_terminals(id),
    service_type TEXT NOT NULL,
    service_name TEXT NOT NULL,
    reference_number TEXT,
    customer_phone TEXT,
    customer_name TEXT,
    bill_amount_piasters INTEGER NOT NULL DEFAULT 0,
    customer_fee_piasters INTEGER NOT NULL DEFAULT 0,
    total_received_piasters INTEGER NOT NULL DEFAULT 0,
    machine_deducted_piasters INTEGER NOT NULL DEFAULT 0,
    provider_commission_piasters INTEGER NOT NULL DEFAULT 0,
    net_profit_piasters INTEGER NOT NULL DEFAULT 0,
    payment_channel TEXT NOT NULL DEFAULT 'cash_drawer',
    cashier_name TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS epay_terminal_fundings (
    id TEXT PRIMARY KEY,
    terminal_id TEXT NOT NULL REFERENCES epay_terminals(id),
    amount_piasters INTEGER NOT NULL,
    funding_source TEXT NOT NULL DEFAULT 'cash_drawer',
    previous_balance_piasters INTEGER NOT NULL,
    new_balance_piasters INTEGER NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_epay_tx_terminal ON epay_transactions(terminal_id);
CREATE INDEX IF NOT EXISTS idx_epay_tx_created ON epay_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_epay_tx_type ON epay_transactions(service_type);

INSERT OR IGNORE INTO epay_terminals (
    id, name, provider, terminal_code, balance_piasters, low_balance_alert_piasters, is_active, created_at, updated_at
) VALUES (
    'terminal_superpay_main', 'ماكينة سوبر باي (SuperPay)', 'super_pay', 'SP-01', 100000, 30000, 1, datetime('now'), datetime('now')
);

INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
VALUES (27, 'Electronic Payment Terminals and Services System (SuperPay / Fawry / Aman)', datetime('now'));
"""

try:
    c.executescript(mig27_sql)
    conn.commit()
    print("Migration 27 applied successfully!")
except Exception as e:
    print("Error applying Migration 27:", e)

c.execute("SELECT version, name FROM schema_migrations WHERE version = 27")
print("Migration 27 in DB:", c.fetchone())

c.execute("SELECT * FROM epay_terminals")
print("Terminals:", c.fetchall())
