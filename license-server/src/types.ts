/**
 * Rafiq POS License Server Types
 */

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  APP_API_KEY: string;
  ADMIN_SECRET: string;
  /** RSA private key (PKCS#8 PEM) used to sign license tokens and support codes. Worker secret only. */
  LICENSE_PRIVATE_KEY: string;
  /** Optional comma-separated hosts allowed for release download_url (default: GitHub release hosts). */
  RELEASE_DOWNLOAD_HOSTS?: string;
  /** Optional shared Cloudflare KV namespace for instant online-store edge gating (Design Doc Section 8.1.1). */
  STORE_LICENSES?: KVNamespace;
  /** Cross-account governance webhook endpoint on rafiq-store-api. */
  ONLINE_STORE_WEBHOOK_URL?: string;
  /** Shared HMAC-SHA256 secret (>= 32 chars) stored as Worker secret on both license-server and online-store/api. */
  GOVERNANCE_WEBHOOK_SECRET?: string;
}

export type LicenseStatus = 'pending' | 'active' | 'disabled' | 'expired';
export type LicenseType = 'lifetime' | 'annual' | 'monthly' | 'trial';
export type OnlineStorePlan = 'none' | 'trial' | 'basic' | 'pro' | 'premium';
export type TokenKind = 'activation' | 'support' | 'root_session' | 'pin_reset' | 'clock_reset';

export interface LicenseRecord {
  id: string;
  license_key: string;
  shop_name: string;
  owner_phone: string | null;
  license_type: LicenseType;
  status: LicenseStatus;
  machine_fingerprint: string | null;
  max_devices: number;
  activated_at: string | null;
  expires_at: string | null;
  can_receive_updates: number; // 1 = eligible, 0 = blocked
  updates_until: string | null; // ISO datetime or null for lifetime
  max_allowed_version: string | null;
  online_store_enabled?: number; // 1 = enabled, 0 = disabled
  online_store_plan?: OnlineStorePlan | string;
  online_store_expires_at?: string | null;
  online_store_slug?: string | null;
  online_store_sync_key?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivationLogRecord {
  id: string;
  license_key: string;
  machine_fingerprint: string | null;
  action: 'activate' | 'verify' | 'revoke' | 'reactivate' | 'transfer';
  status: 'success' | 'failed';
  failure_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface ActivateRequest {
  license_key: string;
  machine_fingerprint: string;
  shop_name?: string;
  app_version?: string;
}

export interface ActivationTokenPayload {
  iss: 'rafiq-license-server';
  sub: string; // license_key
  fp: string;  // machine_fingerprint
  shop: string;
  type: LicenseType;
  iat: number;
  exp: number | null;
  /** Kind identifies the purpose of the cryptographically signed token */
  kind?: TokenKind;
  /** Ephemeral challenge nonce for root challenge-response */
  nonce?: string;
  /** Unique token identifier used to prevent replay attacks and burn on single-use */
  jti?: string;
}

export interface ReleaseRecord {
  id: string;
  version: string;
  release_date: string;
  title: string;
  changelog: string;
  download_url: string;
  sha256: string;
  file_size_bytes: number;
  is_mandatory: number;
  is_published: number;
  min_client_version: string;
  created_at: string;
  updated_at: string;
}

export interface CheckUpdateRequest {
  license_key?: string;
  machine_fingerprint?: string;
  current_version?: string;
}

export interface CheckUpdateResponse {
  hasUpdate: boolean;
  isEligible?: boolean;
  currentVersion?: string;
  latestVersion?: string;
  releaseDate?: string;
  title?: string;
  changelog?: string;
  downloadUrl?: string;
  sha256?: string;
  isMandatory?: boolean;
  fileSizeBytes?: number;
  message?: string;
}
