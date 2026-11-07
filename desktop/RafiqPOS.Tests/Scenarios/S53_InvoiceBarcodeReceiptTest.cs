using System.Collections.Generic;
using System.Drawing;
using NUnit.Framework;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// باركود الفاتورة على إيصال البيع: القيمة (رقم الفاتورة بثمانية أرقام) والترميز (Code 128 Subset C) وهندسة الطباعة بنقاط صحيحة،
    /// وهي نفس جداول receipt_layout.test.js في الواجهة، ثم رسم الإيصال فعلياً والتحقق من البكسلات (80mm و57mm، أصل ونسخة، ولا باركود للحساب المبدئي والتجريبية).
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S53_InvoiceBarcodeReceiptTest : S48_ReceiptPrintFixtureBase
    {
        // الحساب المبدئي يُعرَّف بهذا المعرّف في PrinterService (ثابت خاص)
        private const string PreBillId = "PRE-BILL";

        private const string Bits00001042 = "1101001110011011001100110110011001100100010010110111000111101010001100011101011";
        private const string BitsRfqInv00001042 = "1101001000011000101110100011000101101000111010011011100110001000101011100011011101011000100110111001011101111011011001100110110011001100100010010110111000100101100001100011101011";
        private const string Bits12345678 = "1101001110010110011100100010110001110001011011000010100100011101101100011101011";

        [Test]
        public void FormatInvoiceBarcodeValue_MatchesTheFrontendTable()
        {
            // The same rows are asserted in receipt_layout.test.js (formatInvoiceBarcodeValue)
            string[] table = new string[]
            {
                "1|RFQ-INV-00000001",
                "42|RFQ-INV-00000042",
                "1042|RFQ-INV-00001042",
                "99999999|RFQ-INV-99999999",
                "100000000|RFQ-INV-100000000",
                "2147483647|RFQ-INV-2147483647",
                "0|",
                "-5|"
            };
            for (int i = 0; i < table.Length; i++)
            {
                string[] parts = table[i].Split('|');
                Assert.AreEqual(parts[1], PrinterService.FormatInvoiceBarcodeValue(int.Parse(parts[0])), table[i]);
            }
        }

        [Test]
        public void EncodeCode128Digits_MatchesTheFrontendBitsAndDecodes()
        {
            // The same bit strings are asserted in receipt_layout.test.js (encodeInvoiceBarcode, jsbarcode CODE128)
            Assert.AreEqual(Bits00001042, BarcodeGenerator.EncodeCode128Digits("00001042"));
            Assert.AreEqual(BitsRfqInv00001042, BarcodeGenerator.EncodeCode128Digits("RFQ-INV-00001042"));
            Assert.AreEqual(Bits12345678, BarcodeGenerator.EncodeCode128Digits("12345678"));
            Assert.AreEqual(79, BarcodeGenerator.EncodeCode128Digits("00001042").Length, "start + 4 pairs + check = 6 x 11, stop = 13");
            Assert.AreEqual(178, BarcodeGenerator.EncodeCode128Digits("RFQ-INV-00001042").Length, "RFQ-INV- in subset B + 4 pairs in subset C + check + stop");
            Assert.AreEqual(90, BarcodeGenerator.EncodeCode128Digits("1234567890").Length);
            Assert.AreEqual(101, BarcodeGenerator.EncodeCode128Digits("123456789").Length, "odd count: switch to B for the last digit");
            Assert.AreEqual(BarcodeGenerator.EncodeCode128("AB1"), BarcodeGenerator.EncodeCode128Digits("AB1"), "letters keep subset B");
            Assert.AreEqual(BarcodeGenerator.EncodeCode128("7"), BarcodeGenerator.EncodeCode128Digits("7"), "one digit keeps subset B");
            Assert.AreEqual("", BarcodeGenerator.EncodeCode128Digits(""));
        }

        [Test]
        public void ComputeInvoiceBarcodeModuleDots_WholeDotsThatFitWithQuietZones()
        {
            // The same rows are asserted in receipt_layout.test.js (layoutReceiptBarcode): modules|paperDots|moduleDots
            string[] table = new string[]
            {
                "79|576|5",
                "79|384|3",
                "90|576|5",
                "90|384|3",
                "101|576|4",
                "101|384|3",
                "178|576|2",
                "178|384|1"
            };
            for (int i = 0; i < table.Length; i++)
            {
                string[] parts = table[i].Split('|');
                int modules = int.Parse(parts[0]);
                int paper = int.Parse(parts[1]);
                int dots = PrinterService.ComputeInvoiceBarcodeModuleDots(modules, paper);
                Assert.AreEqual(int.Parse(parts[2]), dots, table[i]);
                Assert.LessOrEqual((modules + 20) * dots, paper - 20, table[i] + ": bars + both quiet zones fit inside the printable width");
            }
            Assert.AreEqual(68, PrinterService.InvoiceBarcodeHeightDots(false));
            Assert.AreEqual(60, PrinterService.InvoiceBarcodeHeightDots(true));
        }

        [Test]
        public void SaleReceipt_80mm_PrintsTheRealBarcodeAtWholeDotModules()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            string value = PrinterService.FormatInvoiceBarcodeValue(sale.InvoiceNumber);
            Assert.AreEqual(16, value.Length);
            AssertBarcodeDrawn(sale, "80mm", false, value, 576, 2, 68);
        }

        [Test]
        public void SaleReceipt_57mm_PrintsTheRealBarcodeAtWholeDotModules()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            AssertBarcodeDrawn(sale, "57mm", false, PrinterService.FormatInvoiceBarcodeValue(sale.InvoiceNumber), 384, 1, 60);
        }

        [Test]
        public void SaleReceipt_Reprint_StillPrintsTheBarcode()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            AssertBarcodeDrawn(sale, "80mm", true, PrinterService.FormatInvoiceBarcodeValue(sale.InvoiceNumber), 576, 2, 68);
        }

        [Test]
        public void SaleReceipt_WithoutAValidInvoiceNumber_PrintsNoBarcode()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            int stored = sale.InvoiceNumber;
            sale.InvoiceNumber = 0;
            Assert.AreEqual(-1, FindBarcodeTop(sale, "80mm", PrinterService.FormatInvoiceBarcodeValue(stored), 576, 2, 68));
        }

        [Test]
        public void PreBillAndTrainingReceipts_PrintNoBarcode()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            string value = PrinterService.FormatInvoiceBarcodeValue(sale.InvoiceNumber);

            sale.Status = "TEST_PILOT";
            Assert.AreEqual(-1, FindBarcodeTop(sale, "80mm", value, 576, 2, 68), "training receipt");

            sale.Status = "completed";
            sale.Id = PreBillId;
            Assert.AreEqual(-1, FindBarcodeTop(sale, "80mm", value, 576, 2, 68), "pre-bill");
        }

        // ---------- hideable receipt lines (receipt_show_invoice_number / receipt_show_paid / receipt_show_change): display only ----------

        private int RenderedHeight(Sale sale)
        {
            using (Bitmap bitmap = PrinterSvc.RenderReceiptToBitmap(sale, "80mm", false))
            {
                return bitmap.Height;
            }
        }

        private int BlackPixels(Sale sale)
        {
            int count = 0;
            using (Bitmap bitmap = PrinterSvc.RenderReceiptToBitmap(sale, "80mm", false))
            {
                for (int y = 0; y < bitmap.Height; y++)
                {
                    for (int x = 0; x < bitmap.Width; x++)
                    {
                        if (IsBlack(bitmap, x, y)) count++;
                    }
                }
            }
            return count;
        }

        private static void SetPayments(Sale sale, long cashPiasters)
        {
            sale.Payments = new List<SalePayment> { new SalePayment { Method = "cash", AmountPiasters = cashPiasters } };
            sale.PaidPiasters = cashPiasters;
        }

        [Test]
        public void HiddenInvoiceNumber_DropsTheTextOnly_TheBarcodeStillPrints()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            string value = PrinterService.FormatInvoiceBarcodeValue(sale.InvoiceNumber);
            int shown = BlackPixels(sale);

            SettingsRepo.Set("receipt_show_invoice_number", "0");
            Assert.Less(BlackPixels(sale), shown, "the number line is gone");
            AssertBarcodeDrawn(sale, "80mm", false, value, 576, 5, 68);

            sale.Id = PreBillId;
            int preBillHidden = BlackPixels(sale);
            SettingsRepo.Set("receipt_show_invoice_number", "1");
            Assert.AreEqual(preBillHidden, BlackPixels(sale), "the pre-bill label ignores the switch");
        }

        [Test]
        public void HiddenPaid_RemovesThePaymentRows_ButKeepsTheCreditRemainder()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            long total = sale.TotalPiasters;
            SetPayments(sale, total);
            int fullyPaidShown = RenderedHeight(sale);

            SettingsRepo.Set("receipt_show_paid", "0");
            int fullyPaidHidden = RenderedHeight(sale);
            Assert.Less(fullyPaidHidden, fullyPaidShown, "the whole payments block is gone");
            AssertBarcodeDrawn(sale, "80mm", false, PrinterService.FormatInvoiceBarcodeValue(sale.InvoiceNumber), 576, 5, 68);

            SetPayments(sale, total - 2000);
            int partlyPaidHidden = RenderedHeight(sale);
            Assert.Greater(partlyPaidHidden, fullyPaidHidden, "the remaining-on-account row still prints");

            SettingsRepo.Set("receipt_show_paid", "1");
            Assert.Greater(RenderedHeight(sale), partlyPaidHidden, "shown again: the paid row returns");
        }

        [Test]
        public void HiddenChange_RemovesOnlyTheChangeRow_TotalsAndPaidStay()
        {
            Sale sale = CreateStoredSale(null, 1000, 5000);
            long total = sale.TotalPiasters;
            SetPayments(sale, total + 5000);
            sale.ChangePiasters = 5000;
            int shown = RenderedHeight(sale);

            SettingsRepo.Set("receipt_show_change", "0");
            int hidden = RenderedHeight(sale);
            Assert.Less(hidden, shown, "one row fewer");

            SetPayments(sale, total);
            sale.ChangePiasters = 0;
            SettingsRepo.Set("receipt_show_change", "1");
            Assert.AreEqual(hidden, RenderedHeight(sale), "what is left is exactly the paid row of an exact payment");
        }

        private void AssertBarcodeDrawn(Sale sale, string paper, bool isCopy, string value, int paperDots, int moduleDots, int heightDots)
        {
            int top = FindBarcodeTop(sale, paper, value, paperDots, moduleDots, heightDots, isCopy);
            Assert.GreaterOrEqual(top, 0, "the " + paper + " receipt must contain the bars of " + value + " at " + moduleDots + " dots per module and " + heightDots + " dots high");
        }

        private int FindBarcodeTop(Sale sale, string paper, string value, int paperDots, int moduleDots, int heightDots)
        {
            return FindBarcodeTop(sale, paper, value, paperDots, moduleDots, heightDots, false);
        }

        /// <summary>أول صف يبدأ منه عمود باركود كامل الارتفاع تتطابق خلاياه مع بتات Code 128 وكل موديول لونه موحّد، والمنطقتان الهادئتان بيضاوان؛ -1 إن لم يوجد</summary>
        private int FindBarcodeTop(Sale sale, string paper, string value, int paperDots, int moduleDots, int heightDots, bool isCopy)
        {
            string bits = BarcodeGenerator.EncodeCode128Digits(value);
            int widthDots = bits.Length * moduleDots;
            int left = (paperDots - widthDots) / 2;
            int quiet = 10 * moduleDots;
            Assert.GreaterOrEqual(left, quiet, "quiet zone fits the paper");

            using (Bitmap bitmap = PrinterSvc.RenderReceiptToBitmap(sale, paper, isCopy))
            {
                Assert.AreEqual(paperDots, bitmap.Width, "paper width in dots");
                int run = 0;
                for (int y = 0; y < bitmap.Height; y++)
                {
                    if (RowMatches(bitmap, y, bits, left, moduleDots, quiet)) run++;
                    else run = 0;
                    if (run == heightDots) return y - heightDots + 1;
                }
            }
            return -1;
        }

        private static bool IsBlack(Bitmap bitmap, int x, int y)
        {
            Color c = bitmap.GetPixel(x, y);
            return c.R < 128 && c.G < 128 && c.B < 128;
        }

        private static bool RowMatches(Bitmap bitmap, int y, string bits, int left, int moduleDots, int quiet)
        {
            if (!IsBlack(bitmap, left, y)) return false;
            for (int k = 0; k < bits.Length; k++)
            {
                bool expected = bits[k] == '1';
                for (int d = 0; d < moduleDots; d++)
                {
                    if (IsBlack(bitmap, left + k * moduleDots + d, y) != expected) return false;
                }
            }
            for (int d = 1; d <= quiet; d++)
            {
                if (IsBlack(bitmap, left - d, y) || IsBlack(bitmap, left + bits.Length * moduleDots + d - 1, y)) return false;
            }
            return true;
        }
    }
}
