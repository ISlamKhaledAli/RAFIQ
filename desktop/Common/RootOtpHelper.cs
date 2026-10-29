using System;
using System.Security.Cryptography;
using System.Text;

namespace RafiqPOS.Common
{
    /// <summary>
    /// Helper to generate and verify dynamic 1-hour time-based Root OTP codes.
    /// Exclusively used to authenticate the vendor/developer root account (islam / root)
    /// without any hardcoded static passwords.
    /// </summary>
    public static class RootOtpHelper
    {
        public const string MASTER_OTP_SEED = "RafiqPOS_Super_Vendor_Secret_Master_Key_2026_IslamKhaled";
        public const string UNIVERSAL_MASTER_HWID = "RAFIQ_UNIVERSAL_MASTER_ROOT_KEY_2026";

        /// <summary>
        /// Generates a 6-digit numeric OTP for a specific device fingerprint (HWID) and hour window.
        /// </summary>
        public static string GenerateOtp(string hwid, long hourWindow)
        {
            if (string.IsNullOrEmpty(hwid)) return string.Empty;

            string cleanHwid = hwid.Trim().ToUpperInvariant();
            string message = string.Format("{0}:{1}", cleanHwid, hourWindow);
            byte[] keyBytes = Encoding.UTF8.GetBytes(MASTER_OTP_SEED);
            byte[] msgBytes = Encoding.UTF8.GetBytes(message);

            using (var hmac = new HMACSHA256(keyBytes))
            {
                byte[] hash = hmac.ComputeHash(msgBytes);
                int offset = hash[hash.Length - 1] & 0x0F;
                int binary = ((hash[offset] & 0x7F) << 24)
                           | ((hash[offset + 1] & 0xFF) << 16)
                           | ((hash[offset + 2] & 0xFF) << 8)
                           | (hash[offset + 3] & 0xFF);
                int pin = binary % 1000000;
                return pin.ToString("D6");
            }
        }

        /// <summary>
        /// Verifies whether the entered PIN matches the dynamic 1-hour OTP for this device.
        /// Checks the current hour, previous hour, and next hour to tolerate up to +/- 1 hour of clock skew.
        /// </summary>
        public static bool VerifyOtp(string hwid, string enteredPin)
        {
            if (string.IsNullOrEmpty(hwid) || string.IsNullOrEmpty(enteredPin)) return false;

            string cleanPin = enteredPin.Trim();
            if (cleanPin.Length != 6) return false;

            // Compute current hour window in UTC
            long currentHour = (long)(DateTime.UtcNow - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds / 3600;

            for (long h = currentHour - 1; h <= currentHour + 1; h++)
            {
                string expected = GenerateOtp(hwid, h);
                if (string.Equals(expected, cleanPin, StringComparison.Ordinal))
                {
                    return true;
                }
            }

            return false;
        }
        /// <summary>
        /// Verifies whether the entered PIN matches the universal master developer root OTP
        /// for any device across the world (used by vendor for universal emergency access).
        /// </summary>
        public static bool VerifyMasterUniversalOtp(string enteredPin)
        {
            return VerifyOtp(UNIVERSAL_MASTER_HWID, enteredPin);
        }
    }
}
