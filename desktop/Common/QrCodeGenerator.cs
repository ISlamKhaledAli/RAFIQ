using System;
using System.Collections.Generic;
using System.Drawing;
using System.Text;

namespace RafiqPOS.Common
{
    /// <summary>
    /// مولّد رموز الاستجابة السريعة QR Code عالي الدقة بدون أي مكتبات خارجية
    /// متوافق 100% مع معيار ISO/IEC 18004 ويدعم جميع الطابعات الحرارية وإصدارات ويندوز (Windows 7 SP1 .. 11)
    /// </summary>
    public static class QrCodeGenerator
    {
        public enum EccLevel
        {
            Low = 0,
            Medium = 1,
            Quartile = 2,
            High = 3
        }

        private static readonly int[] FORMAT_BITS = new int[] { 1, 0, 3, 2 };

        public static bool[,] Encode(string text, EccLevel ecl = EccLevel.Medium)
        {
            if (string.IsNullOrEmpty(text)) return null;
            byte[] bytes = Encoding.UTF8.GetBytes(text);
            return EncodeBytes(bytes, ecl);
        }

        public static bool[,] EncodeBytes(byte[] data, EccLevel ecl = EccLevel.Medium)
        {
            if (data == null || data.Length == 0) return null;

            List<bool> bitData = new List<bool>(data.Length * 8);
            for (int b = 0; b < data.Length; b++)
            {
                for (int i = 7; i >= 0; i--)
                {
                    bitData.Add(((data[b] >> i) & 1) != 0);
                }
            }

            for (int ver = 1; ver <= 40; ver++)
            {
                int dataCapacityBits = GetNumDataCodewords(ver, ecl) * 8;
                int ccBits = GetCharCountBits(0x4, ver);
                if (data.Length >= (1 << ccBits)) continue;
                int totalBits = 4 + ccBits + bitData.Count;
                if (totalBits <= dataCapacityBits)
                {
                    return GenerateMatrix(ver, ecl, 0x4, data.Length, ccBits, bitData, dataCapacityBits);
                }
            }

            return null; // Data too long
        }

        private static bool[,] GenerateMatrix(int ver, EccLevel ecl, int mode, int charCount, int ccBits, List<bool> bitData, int dataCapacityBits)
        {
            List<bool> bb = new List<bool>(dataCapacityBits);
            // Mode indicator (4 bits)
            AppendBits(mode, 4, bb);
            // Character count indicator
            AppendBits(charCount, ccBits, bb);
            // Payload bits
            bb.AddRange(bitData);
            // Terminator
            int termLen = Math.Min(4, dataCapacityBits - bb.Count);
            AppendBits(0, termLen, bb);
            // Pad to byte
            while (bb.Count % 8 != 0) bb.Add(false);
            // Pad bytes
            int[] padBytes = new int[] { 0xEC, 0x11 };
            for (int i = 0; bb.Count < dataCapacityBits; i++)
            {
                AppendBits(padBytes[i % 2], 8, bb);
            }

            // Convert to codewords
            List<byte> dataCodewords = new List<byte>(bb.Count / 8);
            for (int i = 0; i < bb.Count; i += 8)
            {
                int byteVal = 0;
                for (int j = 0; j < 8; j++) byteVal = (byteVal << 1) | (bb[i + j] ? 1 : 0);
                dataCodewords.Add((byte)byteVal);
            }

            int size = ver * 4 + 17;
            bool[,] modules = new bool[size, size];
            bool[,] isFunction = new bool[size, size];

            DrawFunctionPatterns(ver, ecl, size, modules, isFunction);
            byte[] allCodewords = AddEccAndInterleave(ver, ecl, dataCodewords.ToArray());
            DrawCodewords(size, allCodewords, modules, isFunction);

            // Select optimal mask pattern
            int bestMask = 0;
            int minPenalty = int.MaxValue;
            for (int msk = 0; msk < 8; msk++)
            {
                ApplyMask(size, msk, modules, isFunction);
                DrawFormatBits(size, ecl, msk, modules, isFunction);
                int penalty = GetPenaltyScore(size, modules);
                if (penalty < minPenalty)
                {
                    minPenalty = penalty;
                    bestMask = msk;
                }
                ApplyMask(size, msk, modules, isFunction); // Undo mask
            }

            ApplyMask(size, bestMask, modules, isFunction);
            DrawFormatBits(size, ecl, bestMask, modules, isFunction);
            return modules;
        }

        private static void AppendBits(int val, int len, List<bool> bb)
        {
            for (int i = len - 1; i >= 0; i--)
            {
                bb.Add(((val >> i) & 1) != 0);
            }
        }

        private static int GetCharCountBits(int mode, int ver)
        {
            int i = (ver + 7) / 17;
            if (mode == 0x4) return i == 0 ? 8 : 16;
            return 8;
        }

        private static void DrawFunctionPatterns(int ver, EccLevel ecl, int size, bool[,] modules, bool[,] isFunction)
        {
            DrawFinderPattern(0, 0, size, modules, isFunction);
            DrawFinderPattern(size - 7, 0, size, modules, isFunction);
            DrawFinderPattern(0, size - 7, size, modules, isFunction);

            // Timing patterns
            for (int i = 0; i < size; i++)
            {
                SetFunctionModule(6, i, i % 2 == 0, modules, isFunction);
                SetFunctionModule(i, 6, i % 2 == 0, modules, isFunction);
            }

            // Alignment patterns
            int[] alignPos = GetAlignmentPatternPositions(ver);
            int numAlign = alignPos.Length;
            for (int i = 0; i < numAlign; i++)
            {
                for (int j = 0; j < numAlign; j++)
                {
                    if ((i == 0 && j == 0) || (i == 0 && j == numAlign - 1) || (i == numAlign - 1 && j == 0)) continue;
                    DrawAlignmentPattern(alignPos[i], alignPos[j], size, modules, isFunction);
                }
            }

            DrawFormatBits(size, ecl, 0, modules, isFunction);
            DrawVersion(ver, size, modules, isFunction);
        }

        private static void DrawFinderPattern(int x, int y, int size, bool[,] modules, bool[,] isFunction)
        {
            for (int dy = -1; dy <= 7; dy++)
            {
                for (int dx = -1; dx <= 7; dx++)
                {
                    int dist = Math.Max(Math.Abs(dx - 3), Math.Abs(dy - 3));
                    int xx = x + dx;
                    int yy = y + dy;
                    if (xx >= 0 && xx < size && yy >= 0 && yy < size)
                    {
                        SetFunctionModule(xx, yy, dist != 2 && dist != 4, modules, isFunction);
                    }
                }
            }
        }

        private static void DrawAlignmentPattern(int x, int y, int size, bool[,] modules, bool[,] isFunction)
        {
            for (int dy = -2; dy <= 2; dy++)
            {
                for (int dx = -2; dx <= 2; dx++)
                {
                    int dist = Math.Max(Math.Abs(dx), Math.Abs(dy));
                    SetFunctionModule(x + dx, y + dy, dist != 1, modules, isFunction);
                }
            }
        }

        private static void SetFunctionModule(int x, int y, bool isDark, bool[,] modules, bool[,] isFunction)
        {
            modules[y, x] = isDark;
            isFunction[y, x] = true;
        }

        private static void DrawFormatBits(int size, EccLevel ecl, int mask, bool[,] modules, bool[,] isFunction)
        {
            int data = (FORMAT_BITS[(int)ecl] << 3) | mask;
            int rem = data;
            for (int i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
            int bits = ((data << 10) | rem) ^ 0x5412;

            for (int i = 0; i <= 5; i++) SetFunctionModule(8, i, ((bits >> i) & 1) != 0, modules, isFunction);
            SetFunctionModule(8, 7, ((bits >> 6) & 1) != 0, modules, isFunction);
            SetFunctionModule(8, 8, ((bits >> 7) & 1) != 0, modules, isFunction);
            SetFunctionModule(7, 8, ((bits >> 8) & 1) != 0, modules, isFunction);
            for (int i = 9; i < 15; i++) SetFunctionModule(14 - i, 8, ((bits >> i) & 1) != 0, modules, isFunction);

            for (int i = 0; i < 8; i++) SetFunctionModule(size - 1 - i, 8, ((bits >> i) & 1) != 0, modules, isFunction);
            for (int i = 8; i < 15; i++) SetFunctionModule(8, size - 15 + i, ((bits >> i) & 1) != 0, modules, isFunction);
            SetFunctionModule(8, size - 8, true, modules, isFunction); // Dark module
        }

        private static void DrawVersion(int ver, int size, bool[,] modules, bool[,] isFunction)
        {
            if (ver < 7) return;
            int rem = ver;
            for (int i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
            int bits = (ver << 12) | rem;
            for (int i = 0; i < 18; i++)
            {
                bool bit = ((bits >> i) & 1) != 0;
                int a = size - 11 + (i % 3);
                int b = i / 3;
                SetFunctionModule(a, b, bit, modules, isFunction);
                SetFunctionModule(b, a, bit, modules, isFunction);
            }
        }

        private static byte[] AddEccAndInterleave(int ver, EccLevel ecl, byte[] data)
        {
            int numBlocks = NUM_ERROR_CORRECTION_BLOCKS[(int)ecl, ver];
            int blockEccLen = ECC_CODEWORDS_PER_BLOCK[(int)ecl, ver];
            int rawCodewords = GetNumRawDataModules(ver) / 8;
            int numShortBlocks = numBlocks - (rawCodewords % numBlocks);
            int shortBlockLen = rawCodewords / numBlocks;

            List<byte[]> blocksData = new List<byte[]>();
            List<byte[]> blocksEcc = new List<byte[]>();
            ReedSolomonGenerator rs = new ReedSolomonGenerator(blockEccLen);

            int k = 0;
            for (int i = 0; i < numBlocks; i++)
            {
                int datLen = shortBlockLen - blockEccLen + (i >= numShortBlocks ? 1 : 0);
                byte[] dat = new byte[datLen];
                Array.Copy(data, k, dat, 0, datLen);
                k += datLen;
                byte[] ecc = rs.GetRemainder(dat);
                blocksData.Add(dat);
                blocksEcc.Add(ecc);
            }

            byte[] result = new byte[rawCodewords];
            int idx = 0;
            for (int i = 0; i < shortBlockLen - blockEccLen + 1; i++)
            {
                for (int j = 0; j < numBlocks; j++)
                {
                    if (i < blocksData[j].Length)
                    {
                        result[idx++] = blocksData[j][i];
                    }
                }
            }
            for (int i = 0; i < blockEccLen; i++)
            {
                for (int j = 0; j < numBlocks; j++)
                {
                    result[idx++] = blocksEcc[j][i];
                }
            }
            return result;
        }

        private static void DrawCodewords(int size, byte[] data, bool[,] modules, bool[,] isFunction)
        {
            int i = 0;
            for (int right = size - 1; right > 0; right -= 2)
            {
                if (right == 6) right = 5;
                for (int vert = 0; vert < size; vert++)
                {
                    for (int j = 0; j < 2; j++)
                    {
                        int x = right - j;
                        bool upward = ((right + 1) & 2) == 0;
                        int y = upward ? size - 1 - vert : vert;
                        if (!isFunction[y, x] && i < data.Length * 8)
                        {
                            modules[y, x] = ((data[i >> 3] >> (7 - (i & 7))) & 1) != 0;
                            i++;
                        }
                    }
                }
            }
        }

        private static void ApplyMask(int size, int mask, bool[,] modules, bool[,] isFunction)
        {
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    if (isFunction[y, x]) continue;
                    bool invert = false;
                    switch (mask)
                    {
                        case 0: invert = (x + y) % 2 == 0; break;
                        case 1: invert = y % 2 == 0; break;
                        case 2: invert = x % 3 == 0; break;
                        case 3: invert = (x + y) % 3 == 0; break;
                        case 4: invert = ((x / 3) + (y / 2)) % 2 == 0; break;
                        case 5: invert = ((x * y) % 2) + ((x * y) % 3) == 0; break;
                        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 == 0; break;
                        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 == 0; break;
                    }
                    if (invert) modules[y, x] = !modules[y, x];
                }
            }
        }

        private static int GetPenaltyScore(int size, bool[,] modules)
        {
            int result = 0;
            // Condition 1: 5 or more adjacent modules of the same color
            for (int y = 0; y < size; y++)
            {
                bool runColor = false;
                int runVal = 0;
                for (int x = 0; x < size; x++)
                {
                    if (x == 0 || modules[y, x] != runColor)
                    {
                        runColor = modules[y, x];
                        runVal = 1;
                    }
                    else
                    {
                        runVal++;
                        if (runVal == 5) result += 3;
                        else if (runVal > 5) result += 1;
                    }
                }
            }
            for (int x = 0; x < size; x++)
            {
                bool runColor = false;
                int runVal = 0;
                for (int y = 0; y < size; y++)
                {
                    if (y == 0 || modules[y, x] != runColor)
                    {
                        runColor = modules[y, x];
                        runVal = 1;
                    }
                    else
                    {
                        runVal++;
                        if (runVal == 5) result += 3;
                        else if (runVal > 5) result += 1;
                    }
                }
            }
            // Condition 2: 2x2 blocks of same color
            for (int y = 0; y < size - 1; y++)
            {
                for (int x = 0; x < size - 1; x++)
                {
                    bool color = modules[y, x];
                    if (color == modules[y, x + 1] && color == modules[y + 1, x] && color == modules[y + 1, x + 1])
                    {
                        result += 3;
                    }
                }
            }
            // Condition 4: Dark/light balance
            int totalDark = 0;
            for (int y = 0; y < size; y++)
            {
                for (int x = 0; x < size; x++)
                {
                    if (modules[y, x]) totalDark++;
                }
            }
            int total = size * size;
            int k = Math.Abs(totalDark * 20 - total * 10) / total;
            result += k * 10;
            return result;
        }

        private static int GetNumDataCodewords(int ver, EccLevel ecl)
        {
            return (GetNumRawDataModules(ver) / 8) -
                ECC_CODEWORDS_PER_BLOCK[(int)ecl, ver] *
                NUM_ERROR_CORRECTION_BLOCKS[(int)ecl, ver];
        }

        private static int GetNumRawDataModules(int ver)
        {
            int result = (16 * ver + 128) * ver + 64;
            if (ver >= 2)
            {
                int numAlign = (ver / 7) + 2;
                result -= (25 * numAlign - 10) * numAlign - 55;
                if (ver >= 7) result -= 36;
            }
            return result;
        }

        private static int[] GetAlignmentPatternPositions(int ver)
        {
            if (ver == 1) return new int[0];
            int numAlign = (ver / 7) + 2;
            int step = ver == 32 ? 26 : (int)Math.Ceiling((ver * 4.0 + 4.0) / (numAlign * 2 - 2)) * 2;
            List<int> result = new List<int>();
            result.Add(6);
            for (int pos = ver * 4 + 10; result.Count < numAlign; pos -= step)
            {
                result.Insert(1, pos);
            }
            return result.ToArray();
        }

        public static void DrawQrCode(Graphics g, string text, RectangleF targetRect, int quietModules = 1)
        {
            if (g == null || string.IsNullOrEmpty(text)) return;
            bool[,] matrix = Encode(text, EccLevel.Medium);
            if (matrix == null) return;

            int size = matrix.GetLength(0);
            int totalModules = size + quietModules * 2;
            float moduleSize = Math.Min(targetRect.Width, targetRect.Height) / totalModules;
            if (moduleSize < 1f) moduleSize = 1f;

            float qrTotalSize = totalModules * moduleSize;
            float left = targetRect.Left + (targetRect.Width - qrTotalSize) / 2f + quietModules * moduleSize;
            float top = targetRect.Top + (targetRect.Height - qrTotalSize) / 2f + quietModules * moduleSize;

            for (int r = 0; r < size; r++)
            {
                for (int c = 0; c < size; c++)
                {
                    if (matrix[r, c])
                    {
                        g.FillRectangle(Brushes.Black, left + c * moduleSize, top + r * moduleSize, moduleSize, moduleSize);
                    }
                }
            }
        }

        private sealed class ReedSolomonGenerator
        {
            private readonly byte[] _coefficients;

            public ReedSolomonGenerator(int degree)
            {
                List<byte> root = new List<byte>();
                root.Add(1);
                for (int i = 0; i < degree; i++)
                {
                    root.Add(0);
                    for (int j = root.Count - 1; j >= 1; j--)
                    {
                        root[j] = (byte)(Multiply(root[j], EXP_TABLE[i]) ^ root[j - 1]);
                    }
                    root[0] = (byte)Multiply(root[0], EXP_TABLE[i]);
                }
                root.Reverse();
                _coefficients = root.ToArray();
            }

            public byte[] GetRemainder(byte[] data)
            {
                int deg = _coefficients.Length - 1;
                byte[] result = new byte[deg];
                for (int d = 0; d < data.Length; d++)
                {
                    byte factor = (byte)(data[d] ^ result[0]);
                    for (int i = 0; i < deg - 1; i++) result[i] = result[i + 1];
                    result[deg - 1] = 0;
                    for (int i = 0; i < deg; i++)
                    {
                        result[i] ^= (byte)Multiply(_coefficients[i], factor);
                    }
                }
                return result;
            }

            private static readonly byte[] EXP_TABLE = new byte[256];
            private static readonly byte[] LOG_TABLE = new byte[256];

            static ReedSolomonGenerator()
            {
                int x = 1;
                for (int i = 0; i < 255; i++)
                {
                    EXP_TABLE[i] = (byte)x;
                    LOG_TABLE[x] = (byte)i;
                    x = (x << 1) ^ (x >= 128 ? 0x11D : 0);
                }
                EXP_TABLE[255] = EXP_TABLE[0];
            }

            private static int Multiply(int x, int y)
            {
                if (x == 0 || y == 0) return 0;
                return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
            }
        }

        private static readonly int[,] ECC_CODEWORDS_PER_BLOCK = new int[,]
        {
            // L
            { -1,  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 },
            // M
            { -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28 },
            // Q
            { -1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 },
            // H
            { -1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30 }
        };

        private static readonly int[,] NUM_ERROR_CORRECTION_BLOCKS = new int[,]
        {
            // L
            { -1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25 },
            // M
            { -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49 },
            // Q
            { -1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68 },
            // H
            { -1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81 }
        };
    }
}
