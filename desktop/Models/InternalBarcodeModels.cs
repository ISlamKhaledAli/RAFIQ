using System;
using System.Collections.Generic;

namespace RafiqPOS.Models
{
    /// <summary>
    /// صنف محدث بباركود داخلي في العمليات الجماعية
    /// </summary>
    public class BulkBarcodeProductItem
    {
        public string ProductId { get; set; }
        public string ProductName { get; set; }
        public string Barcode { get; set; }
        public long PricePiasters { get; set; }

        public BulkBarcodeProductItem()
        {
            ProductId = "";
            ProductName = "";
            Barcode = "";
            PricePiasters = 0;
        }
    }

    /// <summary>
    /// نتيجة التوليد الجماعي للباركودات الداخلية (Story 108 / Feature #119)
    /// </summary>
    public class BulkGenerateBarcodesResult
    {
        public bool Success { get; set; }
        public int Count { get; set; }
        public List<BulkBarcodeProductItem> Products { get; set; }
        public string Message { get; set; }

        public BulkGenerateBarcodesResult()
        {
            Success = false;
            Count = 0;
            Products = new List<BulkBarcodeProductItem>();
            Message = "";
        }
    }

    /// <summary>
    /// نتيجة تعيين باركود داخلي لمنتج محدد
    /// </summary>
    public class AssignBarcodeResult
    {
        public bool Success { get; set; }
        public string ProductId { get; set; }
        public string Barcode { get; set; }
        public string Message { get; set; }

        public AssignBarcodeResult()
        {
            Success = false;
            ProductId = "";
            Barcode = "";
            Message = "";
        }
    }
}
