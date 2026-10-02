using System;
using System.Collections.Generic;

namespace RafiqPOS.Models
{
    /// <summary>
    /// صنف واحد مطلوب طباعة ملصقات باركود له
    /// </summary>
    public class BarcodeLabelItem
    {
        public string ProductId { get; set; }
        public string ProductName { get; set; }
        public string Barcode { get; set; }
        public long PricePiasters { get; set; }
        public string VariantInfo { get; set; }
        public int Copies { get; set; }
        public string ExpiryDate { get; set; }

        public BarcodeLabelItem()
        {
            Copies = 1;
            VariantInfo = "";
            ExpiryDate = "";
        }
    }

    /// <summary>
    /// إعدادات وتخصيص مقاس وشكل ملصق الباركود
    /// </summary>
    public class BarcodeLabelConfig
    {
        /// <summary>
        /// اسم طابعة الملصقات المستهدفة في ويندوز
        /// </summary>
        public string PrinterName { get; set; }

        /// <summary>
        /// مقاس الورق: 38x25, 40x30, 50x25, 50x30, 50x40, a4_24, a4_40
        /// </summary>
        public string PaperSize { get; set; }

        public int CustomWidthMm { get; set; }
        public int CustomHeightMm { get; set; }

        public bool ShowStoreName { get; set; }
        public string StoreName { get; set; }

        public bool ShowPrice { get; set; }
        public bool ShowBarcodeText { get; set; }
        public bool ShowExpiryDate { get; set; }

        public BarcodeLabelConfig()
        {
            PaperSize = "38x25";
            ShowStoreName = true;
            ShowPrice = true;
            ShowBarcodeText = true;
            ShowExpiryDate = false;
            StoreName = "";
        }
    }

    /// <summary>
    /// طلب طباعة الملصقات القادم من الواجهة
    /// </summary>
    public class PrintLabelsRequest
    {
        public List<BarcodeLabelItem> Items { get; set; }
        public BarcodeLabelConfig Config { get; set; }

        public PrintLabelsRequest()
        {
            Items = new List<BarcodeLabelItem>();
            Config = new BarcodeLabelConfig();
        }
    }

    /// <summary>
    /// نتيجة أمر الطباعة
    /// </summary>
    public class PrintLabelsResult
    {
        public bool Success { get; set; }
        public int TotalLabelsPrinted { get; set; }
        public string PrinterUsed { get; set; }
        public string Message { get; set; }

        public PrintLabelsResult()
        {
            Success = false;
            TotalLabelsPrinted = 0;
            PrinterUsed = "";
            Message = "";
        }
    }
}
