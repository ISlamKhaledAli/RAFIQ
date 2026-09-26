-- ============================================================================
-- Rafiq POS - Cloudflare D1 Licensing Database Schema
-- Version: 1.0.0
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

-- بيانات تجريبية للتطوير والاختبار
INSERT OR IGNORE INTO licenses (id, license_key, shop_name, owner_phone, license_type, status, max_devices, notes)
VALUES 
('demo-lic-1', 'RFQ-TEST-2026-DEMO', 'سوبرماركت البركة للتجربة', '01012345678', 'lifetime', 'pending', 1, 'ترخيص تجريبي للاختبار التلقائي'),
('demo-lic-2', 'RFQ-PERM-8899-A1B2', 'أولاد رجب - فرع النزهة', '01123456789', 'lifetime', 'active', 1, 'ترخيص دائم جاهز ومفعل'),
('demo-lic-3', 'RFQ-DISA-0000-DEAD', 'محل ملغي الصلاحية', '01234567890', 'annual', 'disabled', 1, 'ترخيص معطل من الإدارة');
