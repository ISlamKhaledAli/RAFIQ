-- ============================================================================
-- Migration 0003: Online Store Central Governance (Design Doc Section 8.1)
-- Additive-only columns on licenses table for remote storefront control.
-- ============================================================================

ALTER TABLE licenses ADD COLUMN online_store_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE licenses ADD COLUMN online_store_plan TEXT NOT NULL DEFAULT 'none';
ALTER TABLE licenses ADD COLUMN online_store_expires_at TEXT;
ALTER TABLE licenses ADD COLUMN online_store_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_online_store_slug
  ON licenses(online_store_slug)
  WHERE online_store_slug IS NOT NULL;
