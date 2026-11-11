-- ============================================================================
-- Rafiq POS - Cloudflare D1 Licensing & Updates Database Schema
-- Version: 1.1.0
-- ============================================================================

-- جدول التراخيص الأساسي
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
    can_receive_updates INTEGER NOT NULL DEFAULT 1,
    updates_until TEXT,
    max_allowed_version TEXT DEFAULT 'latest',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- فهارس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_fingerprint ON licenses(machine_fingerprint);

-- سجل حركات وتدقيق التفعيل والمحاولات (Audit Log)
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

-- جدول الإصدارات والتحديثات الهوائية
CREATE TABLE IF NOT EXISTS app_releases (
    id TEXT PRIMARY KEY,
    version TEXT UNIQUE NOT NULL,
    release_date TEXT NOT NULL,
    title TEXT NOT NULL,
    changelog TEXT NOT NULL,
    download_url TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    is_mandatory INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    min_client_version TEXT DEFAULT '1.0.0',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_releases_version ON app_releases(version);
CREATE INDEX IF NOT EXISTS idx_releases_published ON app_releases(is_published);
