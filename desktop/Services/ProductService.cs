using System;
using System.Collections.Generic;
using RafiqPOS.Common;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class SimilarProductException : InvalidOperationException
    {
        public string SimilarProductName { get; private set; }
        public string Reason { get; private set; }

        public SimilarProductException(string similarProductName, string reason)
            : base(string.Format("يوجد منتج مسجل بالفعل باسم مطابق أو مشابه جداً: '{0}' ({1}). هل تريد المتابعة وحفظ المنتج؟", similarProductName, reason))
        {
            SimilarProductName = similarProductName;
            Reason = reason;
        }
    }

    public class BelowCostPriceException : InvalidOperationException
    {
        public long PricePiasters { get; private set; }
        public long CostPiasters { get; private set; }
        public long LossPiasters { get; private set; }

        public BelowCostPriceException(long pricePiasters, long costPiasters)
            : base(string.Format("سعر البيع ({0:N2} ج.م) أقل من سعر التكلفة ({1:N2} ج.م). هل تريد بالتأكيد المتابعة وحفظ المنتج بهذا السعر؟", pricePiasters / 100.0, costPiasters / 100.0))
        {
            PricePiasters = pricePiasters;
            CostPiasters = costPiasters;
            LossPiasters = costPiasters - pricePiasters;
        }
    }

    public class ProductService
    {
        private readonly ProductRepository _repo;
        private readonly AuditLogRepository _auditRepo;
        private readonly ProductPriceHistoryRepository _priceHistoryRepo;

        public ProductService(ProductRepository repo, AuditLogRepository auditRepo = null, ProductPriceHistoryRepository priceHistoryRepo = null)
        {
            _repo = repo;
            _auditRepo = auditRepo;
            _priceHistoryRepo = priceHistoryRepo;
        }

        public static long CalculateProfitPiasters(long pricePiasters, long costPiasters)
        {
            return pricePiasters - costPiasters;
        }

        public static double CalculateMarkupPercent(long pricePiasters, long costPiasters)
        {
            if (costPiasters <= 0) return 0.0;
            return Math.Round(((double)(pricePiasters - costPiasters) / costPiasters) * 100.0, 2);
        }

        public static double CalculateMarginPercent(long pricePiasters, long costPiasters)
        {
            if (pricePiasters <= 0) return 0.0;
            return Math.Round(((double)(pricePiasters - costPiasters) / pricePiasters) * 100.0, 2);
        }

        public Product FindSimilarProduct(string name, string excludeId, out string reason)
        {
            reason = null;
            if (string.IsNullOrWhiteSpace(name)) return null;

            var allProducts = _repo.GetAll(1000);
            foreach (var prod in allProducts)
            {
                if (!string.IsNullOrEmpty(excludeId) && prod.Id == excludeId)
                    continue;

                if (ArabicTextNormalizer.AreNamesSimilar(name, prod.Name, out reason))
                {
                    return prod;
                }
            }
            return null;
        }

        public Product GetById(string id)
        {
            return _repo.GetById(id);
        }

        public Product GetByBarcode(string barcode)
        {
            return _repo.GetByBarcode(barcode);
        }

        public List<Product> Search(string query, int limit = 50)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return _repo.GetAll(limit);
            }
            return _repo.Search(query, limit);
        }

        public List<Product> GetAll(int limit = 100)
        {
            return _repo.GetAll(limit);
        }

        public Product SaveProduct(Product product, bool confirmSimilarName = false, bool confirmBelowCost = false)
        {
            if (product == null)
            {
                throw new ArgumentNullException("product");
            }

            if (string.IsNullOrWhiteSpace(product.Name))
            {
                throw new ArgumentException("اسم المنتج مطلوب ولا يمكن أن يكون فارغاً");
            }

            // Similar Name check with Arabic letter normalization (Feature #134 / Task 134-2)
            if (!confirmSimilarName)
            {
                string similarityReason;
                var similarProduct = FindSimilarProduct(product.Name, product.Id, out similarityReason);
                if (similarProduct != null)
                {
                    throw new SimilarProductException(similarProduct.Name, similarityReason);
                }
            }

            if (product.PricePiasters < 0)
            {
                throw new ArgumentException("سعر البيع لا يمكن أن يكون سالباً");
            }

            if (product.CostPiasters < 0)
            {
                throw new ArgumentException("سعر التكلفة لا يمكن أن يكون سالباً");
            }

            // Task 17-1: تنبيه (وليس منع) لو سعر البيع أقل من التكلفة
            if (product.PricePiasters < product.CostPiasters && !confirmBelowCost)
            {
                throw new BelowCostPriceException(product.PricePiasters, product.CostPiasters);
            }

            var codesToCheck = new List<string>();
            if (!string.IsNullOrWhiteSpace(product.Barcode))
            {
                product.Barcode = product.Barcode.Trim();
                codesToCheck.Add(product.Barcode);
            }
            if (product.Barcodes != null)
            {
                for (int i = 0; i < product.Barcodes.Count; i++)
                {
                    if (!string.IsNullOrWhiteSpace(product.Barcodes[i]))
                    {
                        string trimmed = product.Barcodes[i].Trim();
                        product.Barcodes[i] = trimmed;
                        codesToCheck.Add(trimmed);
                    }
                }
            }

            var uniqueCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var code in codesToCheck)
            {
                if (uniqueCodes.Contains(code))
                {
                    throw new InvalidOperationException("الباركود '" + code + "' مكرر في قائمة باركودات نفس المنتج");
                }
                uniqueCodes.Add(code);

                var existingOwner = _repo.GetOwnerOfBarcode(code);
                if (existingOwner != null && existingOwner.Id != product.Id)
                {
                    throw new InvalidOperationException("الباركود '" + code + "' مسجل بالفعل لمنتج آخر: " + existingOwner.Name);
                }
            }

            Product existing = null;
            if (!string.IsNullOrWhiteSpace(product.Id))
            {
                existing = _repo.GetById(product.Id);
            }
            else
            {
                product.Id = Guid.NewGuid().ToString();
            }

            if (string.IsNullOrWhiteSpace(product.CreatedAt))
            {
                product.CreatedAt = DateTime.UtcNow.ToString("o");
            }

            product.UpdatedAt = DateTime.UtcNow.ToString("o");
            product.IsActive = true;

            _repo.Upsert(product);

            // Audit logging for sensitive changes (Feature #7)
            if (_auditRepo != null)
            {
                try
                {
                    if (existing != null)
                    {
                        if (existing.PricePiasters != product.PricePiasters)
                        {
                            _auditRepo.Log(new AuditLog
                            {
                                Action = "price_update",
                                EntityType = "product",
                                EntityId = product.Id,
                                DetailsJson = string.Format("{{\"productName\":\"{0}\",\"oldPrice\":{1},\"newPrice\":{2}}}", product.Name, existing.PricePiasters, product.PricePiasters)
                            });
                        }
                        if (existing.CostPiasters != product.CostPiasters)
                        {
                            _auditRepo.Log(new AuditLog
                            {
                                Action = "cost_update",
                                EntityType = "product",
                                EntityId = product.Id,
                                DetailsJson = string.Format("{{\"productName\":\"{0}\",\"oldCost\":{1},\"newCost\":{2}}}", product.Name, existing.CostPiasters, product.CostPiasters)
                            });
                        }
                        if (existing.StockQuantityMilli != product.StockQuantityMilli)
                        {
                            _auditRepo.Log(new AuditLog
                            {
                                Action = "stock_adjust",
                                EntityType = "product",
                                EntityId = product.Id,
                                DetailsJson = string.Format("{{\"productName\":\"{0}\",\"oldStock\":{1},\"newStock\":{2}}}", product.Name, existing.StockQuantityMilli, product.StockQuantityMilli)
                            });
                        }
                    }
                    else
                    {
                        _auditRepo.Log(new AuditLog
                        {
                            Action = "product_create",
                            EntityType = "product",
                            EntityId = product.Id,
                            DetailsJson = string.Format("{{\"productName\":\"{0}\",\"price\":{1}}}", product.Name, product.PricePiasters)
                        });
                    }
                }
                catch
                {
                    // Audit failure should not break product flow if non-critical
                }
            }

            // Price history tracking (Feature #17 / Task 17-3)
            if (_priceHistoryRepo != null)
            {
                try
                {
                    if (existing != null)
                    {
                        if (existing.PricePiasters != product.PricePiasters || existing.CostPiasters != product.CostPiasters)
                        {
                            _priceHistoryRepo.Add(new ProductPriceHistory
                            {
                                ProductId = product.Id,
                                OldPricePiasters = existing.PricePiasters,
                                NewPricePiasters = product.PricePiasters,
                                OldCostPiasters = existing.CostPiasters,
                                NewCostPiasters = product.CostPiasters,
                                ChangeReason = "تعديل سعر وتكلفة يدوي"
                            });
                        }
                    }
                    else
                    {
                        _priceHistoryRepo.Add(new ProductPriceHistory
                        {
                            ProductId = product.Id,
                            OldPricePiasters = 0,
                            NewPricePiasters = product.PricePiasters,
                            OldCostPiasters = 0,
                            NewCostPiasters = product.CostPiasters,
                            ChangeReason = "تسجيل السعر الأولي للصنف الجديد"
                        });
                    }
                }
                catch
                {
                }
            }

            return product;
        }

        public List<ProductPriceHistory> GetPriceHistory(string productId, int limit = 50)
        {
            if (_priceHistoryRepo == null || string.IsNullOrWhiteSpace(productId))
            {
                return new List<ProductPriceHistory>();
            }
            return _priceHistoryRepo.GetByProductId(productId, limit);
        }

        public void DeleteProduct(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return;
            var existing = _repo.GetById(id);
            _repo.SoftDelete(id);

            if (_auditRepo != null && existing != null)
            {
                try
                {
                    _auditRepo.Log(new AuditLog
                    {
                        Action = "product_delete",
                        EntityType = "product",
                        EntityId = id,
                        DetailsJson = string.Format("{{\"productName\":\"{0}\"}}", existing.Name)
                    });
                }
                catch
                {
                }
            }
        }

        public void BulkUpdateMinStock(List<string> productIds, long minStockMilli)
        {
            if (productIds == null || productIds.Count == 0) return;
            if (minStockMilli < 0)
            {
                throw new ArgumentException("الحد الأدنى للمخزون لا يمكن أن يكون سالباً");
            }
            _repo.BulkUpdateMinStock(productIds, minStockMilli);
        }

        public BatchImportResult ImportBatch(BatchImportRequest request, string userId = "usr_admin_default")
        {
            if (request == null || request.Items == null || request.Items.Count == 0)
            {
                return new BatchImportResult();
            }

            return _repo.ImportBatchAtomic(request.Items, request.DuplicateStrategy, userId);
        }
    }
}
