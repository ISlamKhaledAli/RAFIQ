using System;
using System.Text;
using System.Text.RegularExpressions;

namespace RafiqPOS.Common
{
    public static class ArabicTextNormalizer
    {
        public static string Normalize(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return string.Empty;

            var sb = new StringBuilder(text.Length);
            for (int i = 0; i < text.Length; i++)
            {
                char c = text[i];

                // Remove Arabic Tashkeel / Harakat
                // Fathatan (0x064B), Dammatan (0x064C), Kasratan (0x064D), Fatha (0x064E), Damma (0x064F), Kasra (0x0650), Shadda (0x0651), Sukun (0x0652)
                if (c >= '\u064B' && c <= '\u0652')
                    continue;

                // Remove Tatweel / Kashida
                if (c == '\u0640')
                    continue;

                // Normalize Alef variants (أ, إ, آ, ٱ) -> ا
                if (c == 'أ' || c == 'إ' || c == 'آ' || c == 'ٱ')
                {
                    sb.Append('ا');
                }
                // Normalize Teh Marbuta (ة) -> ه
                else if (c == 'ة')
                {
                    sb.Append('ه');
                }
                // Normalize Alef Maksura (ى) -> ي
                else if (c == 'ى')
                {
                    sb.Append('ي');
                }
                else
                {
                    sb.Append(char.ToLowerInvariant(c));
                }
            }

            string result = sb.ToString();
            // Collapse whitespaces
            result = Regex.Replace(result, @"\s+", " ").Trim();
            return result;
        }

        public static int LevenshteinDistance(string s, string t)
        {
            if (string.IsNullOrEmpty(s)) return string.IsNullOrEmpty(t) ? 0 : t.Length;
            if (string.IsNullOrEmpty(t)) return s.Length;

            int n = s.Length;
            int m = t.Length;
            int[,] d = new int[n + 1, m + 1];

            for (int i = 0; i <= n; i++) d[i, 0] = i;
            for (int j = 0; j <= m; j++) d[0, j] = j;

            for (int i = 1; i <= n; i++)
            {
                for (int j = 1; j <= m; j++)
                {
                    int cost = (t[j - 1] == s[i - 1]) ? 0 : 1;
                    d[i, j] = Math.Min(
                        Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                        d[i - 1, j - 1] + cost);
                }
            }
            return d[n, m];
        }

        public static bool AreNamesSimilar(string name1, string name2, out string reason)
        {
            reason = null;
            string norm1 = Normalize(name1);
            string norm2 = Normalize(name2);

            if (string.IsNullOrEmpty(norm1) || string.IsNullOrEmpty(norm2))
                return false;

            // 1. Exact match after Arabic normalization
            if (norm1 == norm2)
            {
                reason = "تطابق تام بعد توحيد الحروف والهمزات";
                return true;
            }

            // 2. High Levenshtein similarity for names
            int maxLen = Math.Max(norm1.Length, norm2.Length);
            if (maxLen >= 5 && Math.Abs(norm1.Length - norm2.Length) <= 1)
            {
                int dist = LevenshteinDistance(norm1, norm2);
                if (dist == 1)
                {
                    reason = "تشابه كبير جداً باختلاف حرف واحد فقط";
                    return true;
                }
            }

            return false;
        }
    }
}
