-- ============================================================================
-- Migration 0004: Auto-Provisioned Online Store Sync Key
-- Stores the per-store sync secret in D1 so bound POS devices auto-configure
-- on /api/verify without manual copy-paste, while only the SHA-256 hash is
-- sent to rafiq-store-api via the signed governance webhook.
-- ============================================================================

ALTER TABLE licenses ADD COLUMN online_store_sync_key TEXT;
