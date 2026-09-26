/**
 * Rafiq POS License Server Types
 */

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  APP_API_KEY: string;
  ADMIN_SECRET: string;
  TOKEN_SIGNING_SECRET: string;
}

export type LicenseStatus = 'pending' | 'active' | 'disabled' | 'expired';
export type LicenseType = 'lifetime' | 'annual' | 'monthly' | 'trial';

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
}
