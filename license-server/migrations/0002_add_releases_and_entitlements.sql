-- Migration: 0002_add_releases_and_entitlements.sql
-- Rafiq POS: Support for Over-the-Air updates & selective license update entitlements

-- 1. Add update entitlement fields to licenses table
ALTER TABLE licenses ADD COLUMN can_receive_updates INTEGER NOT NULL DEFAULT 1;
ALTER TABLE licenses ADD COLUMN updates_until TEXT DEFAULT NULL;
ALTER TABLE licenses ADD COLUMN max_allowed_version TEXT DEFAULT 'latest';

-- 2. Create app_releases table for managing system versions & download metadata
CREATE TABLE IF NOT EXISTS app_releases (
    id TEXT PRIMARY KEY,                       -- UUID v4
    version TEXT UNIQUE NOT NULL,             -- e.g. '1.1.0'
    release_date TEXT NOT NULL,               -- e.g. '2026-11-01'
    title TEXT NOT NULL,                      -- Arabic release title
    changelog TEXT NOT NULL,                  -- Arabic release changelog / release notes
    download_url TEXT NOT NULL,               -- Direct download URL (GitHub Releases / R2)
    sha256 TEXT NOT NULL,                     -- Cryptographic SHA-256 integrity hash
    file_size_bytes INTEGER NOT NULL,         -- File size in bytes
    is_mandatory INTEGER NOT NULL DEFAULT 0,  -- 1 if mandatory, 0 if optional
    is_published INTEGER NOT NULL DEFAULT 1,  -- 1 if active, 0 if draft / killed
    min_client_version TEXT DEFAULT '1.0.0',  -- Minimum supported client version
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_releases_version ON app_releases(version);
CREATE INDEX IF NOT EXISTS idx_releases_published ON app_releases(is_published);

