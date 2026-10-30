using System;
using System.Security.Cryptography;
using System.Text;

namespace RafiqPOS.Common
{
    /// <summary>
    /// Cryptographic challenge-response manager for developer root sessions (SEC-01).
    /// Completely eliminates hardcoded master keys or seeds.
    /// The client presents a challenge (XXXX-XXXX-CC) and the developer signs it on the license server.
    /// </summary>
    public static class RootChallengeManager
    {
        private static string _currentChallenge = null;
        private static DateTime _challengeExpiresAt = DateTime.MinValue;
        private static readonly object _syncLock = new object();

        /// <summary>
        /// Generates a fresh random challenge tied to the current device fingerprint.
        /// Format: XXXX-XXXX-CC where CC is the SHA-256 fingerprint tag.
        /// Valid for 10 minutes.
        /// </summary>
        public static string GenerateChallenge(string deviceFingerprint)
        {
            lock (_syncLock)
            {
                const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                byte[] randomBytes = new byte[8];
                using (var rng = new RNGCryptoServiceProvider())
                {
                    rng.GetBytes(randomBytes);
                }

                char[] part1 = new char[4];
                char[] part2 = new char[4];
                for (int i = 0; i < 4; i++)
                {
                    part1[i] = chars[randomBytes[i] % chars.Length];
                    part2[i] = chars[randomBytes[i + 4] % chars.Length];
                }

                string tag = LicenseTokenVerifier.ComputeFingerprintTag(deviceFingerprint);
                _currentChallenge = string.Format("{0}-{1}-{2}", new string(part1), new string(part2), tag);
                _challengeExpiresAt = DateTime.UtcNow.AddMinutes(10);
                return _currentChallenge;
            }
        }

        /// <summary>
        /// Gets the active challenge if not expired, or generates a new one.
        /// </summary>
        public static string GetOrGenerateChallenge(string deviceFingerprint)
        {
            lock (_syncLock)
            {
                if (!string.IsNullOrEmpty(_currentChallenge) && DateTime.UtcNow < _challengeExpiresAt)
                {
                    return _currentChallenge;
                }
                return GenerateChallenge(deviceFingerprint);
            }
        }

        /// <summary>
        /// Verifies a signed root session token response issued by the license server.
        /// </summary>
        public static bool VerifyRootResponse(string responseToken, string deviceFingerprint, out string error)
        {
            error = null;
            lock (_syncLock)
            {
                if (string.IsNullOrEmpty(_currentChallenge) || DateTime.UtcNow > _challengeExpiresAt)
                {
                    error = "انتهت صلاحية كود التحدي. يرجى طلب كود جديد.";
                    return false;
                }

                if (string.IsNullOrEmpty(responseToken))
                {
                    error = "تصريح دخول Root فارغ.";
                    return false;
                }

                string cleanToken = responseToken.Trim();
                if (cleanToken.StartsWith("RFQ-ROOT-", StringComparison.OrdinalIgnoreCase))
                {
                    cleanToken = cleanToken.Substring("RFQ-ROOT-".Length);
                }

                string verifyError;
                VerifiedLicenseToken verified = LicenseTokenVerifier.Verify(cleanToken, deviceFingerprint, "root_session", out verifyError);
                if (verified == null)
                {
                    error = verifyError ?? "تصريح دخول Root غير صالح أو التوقيع غير مطابق.";
                    return false;
                }

                if (verified.IsExpired(DateTime.UtcNow))
                {
                    error = "انتهت فترة صلاحية تصريح الدخول (صالح لمدة 15 دقيقة فقط).";
                    return false;
                }

                // Verify challenge nonce matches
                string expectedChallenge = _currentChallenge.Replace("-", "").ToUpperInvariant();
                string actualNonce = (verified.Nonce ?? "").Replace("-", "").ToUpperInvariant();
                if (!string.Equals(expectedChallenge, actualNonce, StringComparison.OrdinalIgnoreCase))
                {
                    error = "تصريح الدخول لا يطابق كود التحدي الحالي المعروض على الشاشة.";
                    return false;
                }

                // Single use: consume challenge
                _currentChallenge = null;
                _challengeExpiresAt = DateTime.MinValue;
                return true;
            }
        }
    }

    /// <summary>
    /// Legacy shim keeping backward compatibility while disabling any backdoor seeds.
    /// </summary>
    public static class RootOtpHelper
    {
        public static bool VerifyOtp(string hwid, string enteredPin)
        {
            // SEC-01 FIX: Static OTP verification is completely removed
            return false;
        }

        public static bool VerifyMasterUniversalOtp(string enteredPin)
        {
            // SEC-01 FIX: Universal master key is permanently disabled
            return false;
        }
    }
}
