using System;
using System.Collections.Generic;
using NUnit.Framework;
using RafiqPOS.Models;
using RafiqPOS.Services;

namespace RafiqPOS.Tests.Scenarios
{
    /// <summary>
    /// إيصال المرتجع المقسّم: سطر عربي لكل جزء استرداد (نقدي / بطاقة / إنستاباي / محفظة / حساب العميل)،
    /// والدرج يُفتح إذا كان أحد الأجزاء نقدياً فقط.
    /// </summary>
    [TestFixture]
    [NonParallelizable]
    public class S83_SplitRefundReceiptTest : S48_ReceiptPrintFixtureBase
    {
        private static Return SplitReturn(string id, string method1, long amount1, string method2, long amount2)
        {
            return new Return
            {
                Id = id,
                ReturnNumber = 9,
                SaleId = "sale_fixture",
                InvoiceNumber = 3,
                CashierId = "usr_cashier_1",
                TotalPiasters = amount1 + amount2,
                RefundMethod = method1,
                Reason = "test",
                CreatedAt = "2026-01-01T10:00:00",
                Refunds = new List<ReturnRefundPart>
                {
                    new ReturnRefundPart { Method = method1, AmountPiasters = amount1 },
                    new ReturnRefundPart { Method = method2, AmountPiasters = amount2 }
                },
                Items = new List<ReturnItem>
                {
                    new ReturnItem { ProductName = "item", QuantityMilli = 1000, UnitPricePiasters = 5000, TotalPiasters = 5000, Unit = "piece" }
                }
            };
        }

        [TestCase("cash", "نقداً من الخزينة")]
        [TestCase("card", "على البطاقة")]
        [TestCase("instapay", "تحويل انستاباي")]
        [TestCase("vodafone_cash", "تحويل فودافون كاش")]
        [TestCase("wallet", "تحويل إلى المحفظة")]
        [TestCase("credit", "خصم من حساب العميل")]
        public void RefundMethodReceiptLabel_IsArabicForEveryMethod(string method, string expected)
        {
            Assert.AreEqual(expected, PrinterService.RefundMethodReceiptLabel(method));
        }

        [Test]
        public void SplitReceipt_RendersADifferentLinePerPart_NotJustTheMasterMethod()
        {
            byte[] cashCard = ExpectedReturnBytes(SplitReturn("ret_split_a", "cash", 3000, "card", 2000), false, false);
            byte[] cashInstapay = ExpectedReturnBytes(SplitReturn("ret_split_b", "cash", 3000, "instapay", 2000), false, false);
            byte[] cashCardAgain = ExpectedReturnBytes(SplitReturn("ret_split_a", "cash", 3000, "card", 2000), false, false);
            Return singleCash = SplitReturn("ret_split_a", "cash", 3000, "card", 2000);
            singleCash.Refunds = null;
            singleCash.TotalPiasters = 5000;
            byte[] cashOnly = ExpectedReturnBytes(singleCash, false, false);

            Assert.IsTrue(BytesEqual(cashCard, cashCardAgain), "الرسم ثابت لنفس البيانات");
            Assert.IsFalse(BytesEqual(cashCard, cashInstapay), "اسم الطريقة الثانية يظهر على الإيصال (بطاقة مقابل إنستاباي)");
            Assert.IsFalse(BytesEqual(cashCard, cashOnly), "الإيصال المقسّم يختلف عن الإيصال النقدي الواحد");
        }

        [Test]
        public void SplitReceipt_OpensTheDrawerOnlyWhenAPartIsCash()
        {
            Assert.IsTrue(PrinterService.RefundOpensDrawer(SplitReturn("ret_s1", "cash", 3000, "card", 2000)));
            Assert.IsFalse(PrinterService.RefundOpensDrawer(SplitReturn("ret_s2", "card", 3000, "instapay", 2000)));

            PrintResult withCash = PrinterSvc.PrintReturnReceipt(SplitReturn("ret_s3", "cash", 3000, "card", 2000), Fake.Target, null, true);
            Assert.IsTrue(withCash.Success, withCash.Message);
            AssertDrawerKick(Fake.WaitForJob(0), "جزء نقدي ضمن الاسترداد المقسّم");

            PrintResult noCash = PrinterSvc.PrintReturnReceipt(SplitReturn("ret_s4", "card", 3000, "instapay", 2000), Fake.Target, null, true);
            Assert.IsTrue(noCash.Success, noCash.Message);
            AssertNoDrawerKick(Fake.WaitForJob(1), "لا جزء نقدي");
        }
    }
}
