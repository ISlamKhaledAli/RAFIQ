-- Migration 0001: Initial schema
CREATE TABLE IF NOT EXISTS licenses (
    id TEXT PRIMARY KEY,
    license_key TEXT UNIQUE NOT NULL,
    shop_name TEXT NOT NULL,
    owner_phone TEXT,
    license_type TEXT NOT NULL DEFAULT 'lifetime' CHECK(license_type IN ('lifetime', 'annual', 'monthly', 'trial')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'disabled', 'expired')),
    machine_fingerprint TEXT,
    max_devices INTEGER NOT NULL DEFAULT 1,
    activated_at TEXT,
    expires_at TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_fingerprint ON licenses(machine_fingerprint);

CREATE TABLE IF NOT EXISTS activation_logs (
    id TEXT PRIMARY KEY,
    license_key TEXT NOT NULL,
    machine_fingerprint TEXT,
    action TEXT NOT NULL CHECK(action IN ('activate', 'verify', 'revoke', 'reactivate', 'transfer')),
    status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
    failure_reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activation_logs_key ON activation_logs(license_key);
CREATE INDEX IF NOT EXISTS idx_activation_logs_created_at ON activation_logs(created_at);
