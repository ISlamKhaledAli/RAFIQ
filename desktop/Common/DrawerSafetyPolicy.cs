using System;
using RafiqPOS.Models;

namespace RafiqPOS.Common
{
    public static class DrawerSafetyPolicy
    {
        public const string WarningCode = "DRAWER_HARDWARE_NOT_APPROVED";
        public const string BlockReason = "لم تُرسل نبضة للدرج: لا يوجد توافق كهربائي معتمد. خرج درج XP-Q801K المعلن 24 فولت والدرج Seething 405A المحدد 12 فولت. تقليل مدة النبضة لا يغيّر الجهد. يلزم الرجوع للمورّد قبل الفتح الكهربائي.";

        public static bool HasCashPayment(Sale sale)
        {
            if (sale == null) return false;
            if (sale.Payments != null && sale.Payments.Count > 0)
            {
                for (int i = 0; i < sale.Payments.Count; i++)
                {
                    if (sale.Payments[i] != null &&
                        string.Equals(sale.Payments[i].Method, "cash", StringComparison.OrdinalIgnoreCase) &&
                        sale.Payments[i].AmountPiasters > 0)
                    {
                        return true;
                    }
                }
                return false;
            }
            return string.Equals(sale.PaymentMethod, "cash", StringComparison.OrdinalIgnoreCase) &&
                sale.PaidPiasters > 0;
        }
    }
}
