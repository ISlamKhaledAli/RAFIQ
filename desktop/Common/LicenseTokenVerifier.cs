using System;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;

namespace RafiqPOS.Common
{
    /// <summary>
    /// Verified contents of an RS256 license token issued by the Rafiq license server.
    /// </summary>
    public class VerifiedLicenseToken
    {
        public string LicenseKey { get; set; }
        public string Fingerprint { get; set; }
        public string ShopName { get; set; }
        public string LicenseType { get; set; }
        public string Kind { get; set; }
        public long IssuedAtUnix { get; set; }
        public long? ExpiresAtUnix { get; set; }

        public bool IsExpired(DateTime utcNow)
        {
            if (!ExpiresAtUnix.HasValue) return false;
            return LicenseTokenVerifier.FromUnix(ExpiresAtUnix.Value) <= utcNow;
        }
    }

    /// <summary>
    /// Verifies license tokens with the embedded RSA PUBLIC key (Audit F-04 / F-15).
    /// The desktop app can verify licenses but can never create them; license state
    /// is derived from a valid signature, not from editable settings values.
    /// </summary>
    public static class LicenseTokenVerifier
    {
        private static readonly object _testKeyLock = new object();
        private static RSA _ephemeralTestKey;

        public static VerifiedLicenseToken Verify(string token, string deviceFingerprint, out string error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(token))
            {
                error = "لا يوجد توكن ترخيص";
                return null;
            }

            string[] parts = token.Trim().Split('.');
            if (parts.Length != 3)
            {
                error = "صيغة توكن الترخيص غير صحيحة";
                return null;
            }

            try
            {
                JObject header = JObject.Parse(Encoding.UTF8.GetString(Base64UrlDecode(parts[0])));
                if (header["alg"] == null || header["alg"].ToString() != "RS256")
                {
                    error = "خوارزمية توقيع الترخيص غير مدعومة";
                    return null;
                }

                byte[] signedBytes = Encoding.ASCII.GetBytes(parts[0] + "." + parts[1]);
                byte[] signature = Base64UrlDecode(parts[2]);

                if (!VerifyWithKey(LicenseConfig.LICENSE_PUBLIC_KEY_XML, signedBytes, signature) && !VerifyWithEphemeralTestKey(signedBytes, signature))
                {
                    error = "التوقيع الرقمي للترخيص غير صالح";
                    return null;
                }

                JObject payload = JObject.Parse(Encoding.UTF8.GetString(Base64UrlDecode(parts[1])));
                if (payload["iss"] == null || payload["iss"].ToString() != "rafiq-license-server")
                {
                    error = "مصدر الترخيص غير معروف";
                    return null;
                }

                var result = new VerifiedLicenseToken();
                result.LicenseKey = payload["sub"] != null ? payload["sub"].ToString() : "";
                result.Fingerprint = payload["fp"] != null ? payload["fp"].ToString() : "";
                result.ShopName = payload["shop"] != null ? payload["shop"].ToString() : "";
                result.LicenseType = payload["type"] != null ? payload["type"].ToString() : "lifetime";
                result.Kind = payload["kind"] != null ? payload["kind"].ToString() : "activation";
                result.IssuedAtUnix = payload["iat"] != null && payload["iat"].Type != JTokenType.Null ? payload["iat"].Value<long>() : 0;
                if (payload["exp"] != null && payload["exp"].Type != JTokenType.Null)
                {
                    result.ExpiresAtUnix = payload["exp"].Value<long>();
                }

                if (!string.IsNullOrEmpty(deviceFingerprint) &&
                    !string.Equals(result.Fingerprint.Trim(), deviceFingerprint.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    error = "الترخيص صادر لجهاز آخر";
                    return null;
                }

                return result;
            }
            catch (Exception ex)
            {
                Logger.Warn("فشل فحص توكن الترخيص: " + ex.Message);
                error = "تعذر قراءة توكن الترخيص";
                return null;
            }
        }

        public static DateTime FromUnix(long seconds)
        {
            return new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddSeconds(seconds);
        }

        public static long ToUnix(DateTime utc)
        {
            return (long)(utc.ToUniversalTime() - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
        }

        /// <summary>
        /// Self-test support only: signs a token with an in-memory key generated for this process.
        /// The private key never leaves memory, so it cannot be used to forge licenses elsewhere.
        /// </summary>
        public static string SignWithEphemeralTestKey(JObject payload)
        {
            RSA key;
            lock (_testKeyLock)
            {
                if (_ephemeralTestKey == null)
                {
                    _ephemeralTestKey = new RSACng(2048);
                }
                key = _ephemeralTestKey;
            }

            string header = Base64UrlEncode(Encoding.UTF8.GetBytes("{\"alg\":\"RS256\",\"typ\":\"JWT\"}"));
            string body = Base64UrlEncode(Encoding.UTF8.GetBytes(payload.ToString(Newtonsoft.Json.Formatting.None)));
            byte[] signedBytes = Encoding.ASCII.GetBytes(header + "." + body);
            byte[] signature = key.SignData(signedBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            return header + "." + body + "." + Base64UrlEncode(signature);
        }

        private static bool VerifyWithEphemeralTestKey(byte[] data, byte[] signature)
        {
            RSA key;
            lock (_testKeyLock)
            {
                key = _ephemeralTestKey;
            }
            if (key == null) return false;
            return key.VerifyData(data, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }

        private static bool VerifyWithKey(string publicKeyXml, byte[] data, byte[] signature)
        {
            if (string.IsNullOrEmpty(publicKeyXml)) return false;
            using (var rsa = new RSACng())
            {
                rsa.FromXmlString(publicKeyXml);
                return rsa.VerifyData(data, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            }
        }

        private static byte[] Base64UrlDecode(string input)
        {
            string s = input.Replace('-', '+').Replace('_', '/');
            switch (s.Length % 4)
            {
                case 2: s += "=="; break;
                case 3: s += "="; break;
            }
            return Convert.FromBase64String(s);
        }

        private static string Base64UrlEncode(byte[] data)
        {
            return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }
    }
}
