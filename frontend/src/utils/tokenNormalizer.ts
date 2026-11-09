/**
 * Normalizes user input for license keys, support tokens, and recovery codes.
 *
 * Rules:
 * - Cryptographic RS256 JWT tokens (RFQ-REC-, RFQ-SUP-, RFQ-TIME-, RFQ-ROOT-) carry
 *   case-sensitive Base64URL signatures. Changing case corrupts the token.
 *   For these, the prefix is standardized to uppercase and the payload is preserved as-is.
 * - Standard alphanumeric license keys (RFQ-PERM-..., etc.) and local recovery codes (RFK-...)
 *   are safely uppercased.
 */
export function normalizeTokenOrKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();

  const tokenPrefixes = ['RFQ-REC-', 'RFQ-SUP-', 'RFQ-TIME-', 'RFQ-ROOT-'];
  for (const prefix of tokenPrefixes) {
    if (upper.startsWith(prefix)) {
      return prefix + trimmed.slice(prefix.length).trim();
    }
  }

  return upper;
}

/**
 * Checks if a string is a cryptographic RS256 JWT token from Rafiq License Server.
 */
export function isSignedLicenseToken(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const upper = raw.trim().toUpperCase();
  return (
    upper.startsWith('RFQ-REC-') ||
    upper.startsWith('RFQ-SUP-') ||
    upper.startsWith('RFQ-TIME-') ||
    upper.startsWith('RFQ-ROOT-')
  );
}
