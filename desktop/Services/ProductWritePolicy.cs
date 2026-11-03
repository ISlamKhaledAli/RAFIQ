using System;
using RafiqPOS.Models;

namespace RafiqPOS.Services
{
    public static class ProductWritePolicy
    {
        [ThreadStatic]
        private static RequestAdmission _request;
        [ThreadStatic]
        private static bool _trustedFixture = false;
        [ThreadStatic]
        private static Operation _operation;

        internal static RequestAdmission CurrentAdmission { get { return _request; } }
        internal static Operation CurrentOperation { get { return _operation; } }

        internal static IDisposable EnterRequest(RequestAdmission admission)
        {
            if (_trustedFixture || _request != null || _operation != null)
                throw new UnauthorizedAccessException("لا يمكن توريث سياق صلاحيات إلى طلب IPC.");
            if (!SecurityService.IsAdmissionCurrent(admission))
                throw new UnauthorizedAccessException("جلسة الطلب مفقودة أو تغيرت.");
            _request = admission;
            return new Scope(delegate { _request = null; });
        }

        internal static IDisposable EnterTrustedFixtureOperation()
        {
#if DEBUG
            if (_request != null || _operation != null)
                throw new UnauthorizedAccessException("لا يمكن رفع صلاحيات طلب المستخدم.");
            bool previous = _trustedFixture;
            _trustedFixture = true;
            return new Scope(delegate { _trustedFixture = previous; });
#else
            throw new InvalidOperationException("Fixture operations are available only in DEBUG builds.");
#endif
        }

        internal static Operation BeginOperation()
        {
            if (_operation != null) return new Operation(_operation);
            if (!_trustedFixture && (!SecurityService.IsAdmissionCurrent(_request) ||
                !_request.IsAuthenticated || _request.MustChangePin))
                throw new UnauthorizedAccessException("جلسة الطلب مفقودة أو تغيرت.");
            Operation operation = new Operation(_request, _trustedFixture);
            _operation = operation;
            return operation;
        }

        internal sealed class Operation : IDisposable
        {
            private readonly RequestAdmission _admission;
            private readonly bool _trusted;
            private readonly Operation _previous;
            private bool _disposed;
            internal string ActorId { get { return _trusted ? "usr_admin_default" : _admission.ActorId; } }
            internal string ActorName { get { return _trusted ? "Fixture" : _admission.ActorName; } }
            internal string Role { get { return _trusted ? null : _admission.Role; } }

            internal Operation(RequestAdmission admission, bool trusted)
            {
                _admission = admission;
                _trusted = trusted;
                _previous = _operation;
            }

            internal Operation(Operation previous) : this(previous._admission, previous._trusted)
            {
                _operation = this;
            }

            internal bool HasPermission(string permission)
            {
                if (!_trusted) return _admission.HasPermission(permission);
                return permission == "products.create" || permission == "products.edit" ||
                    permission == "products.edit_price" || permission == "products.edit_cost" ||
                    permission == "stock.adjust" || permission == "products.packaging.edit";
            }

            public void Dispose()
            {
                if (_disposed) return;
                _disposed = true;
                _operation = _previous;
            }
        }

        private sealed class Scope : IDisposable
        {
            private Action _cleanup;
            internal Scope(Action cleanup) { _cleanup = cleanup; }
            public void Dispose()
            {
                if (_cleanup == null) return;
                _cleanup();
                _cleanup = null;
            }
        }

        public static bool CurrentUserHasPermission(string permission)
        {
            if (_operation != null) return _operation.HasPermission(permission);
            if (_trustedFixture)
                return permission == "products.create" || permission == "products.edit" ||
                    permission == "products.edit_price" || permission == "products.edit_cost" ||
                    permission == "stock.adjust" || permission == "products.packaging.edit";
            return SecurityService.IsAdmissionCurrent(_request) && _request.IsAuthenticated &&
                !_request.MustChangePin && _request.HasPermission(permission);
        }

        private static void Demand(Func<string, bool> hasPermission, string permission)
        {
            if (hasPermission == null) throw new ArgumentNullException("hasPermission");
            if (!hasPermission(permission))
            {
                throw new UnauthorizedAccessException("ليس لديك الصلاحية المطلوبة لتغيير بيانات الصنف المالية: " + permission);
            }
        }

        public static void ValidateProduct(Product existing, Product requested, Func<string, bool> hasPermission)
        {
            if (requested == null) throw new ArgumentNullException("requested");
            Demand(hasPermission, existing == null ? "products.create" : "products.edit");
            if (existing == null) return;
            if (existing.PricePiasters != requested.PricePiasters ||
                existing.IsOpenPrice != requested.IsOpenPrice ||
                existing.TaxRatePercent != requested.TaxRatePercent ||
                !string.Equals(existing.TaxCategoryCode ?? "", requested.TaxCategoryCode ?? "", StringComparison.Ordinal))
            {
                Demand(hasPermission, "products.edit_price");
            }
            if (existing.CostPiasters != requested.CostPiasters)
            {
                Demand(hasPermission, "products.edit_cost");
            }
            if (requested.Units == null) return;
            if (existing.Units == null || existing.Units.Count != requested.Units.Count)
            {
                Demand(hasPermission, "products.edit_price");
                Demand(hasPermission, "products.edit_cost");
            }
            foreach (ProductUnit unit in requested.Units)
            {
                if (unit == null) throw new ArgumentException("بيانات وحدة الصنف غير صالحة.", "requested");
                ProductUnit previous = null;
                if (existing.Units != null)
                {
                    foreach (ProductUnit oldUnit in existing.Units)
                    {
                        if ((!string.IsNullOrEmpty(unit.Id) && oldUnit.Id == unit.Id) ||
                            (string.IsNullOrEmpty(unit.Id) && oldUnit.UnitName == unit.UnitName))
                        {
                            previous = oldUnit;
                            break;
                        }
                    }
                }
                ValidateUnit(previous, unit, hasPermission, requested.Id);
            }
        }

        public static void ValidateUnit(ProductUnit existing, ProductUnit requested, Func<string, bool> hasPermission, string containerProductId = null)
        {
            if (requested == null) throw new ArgumentNullException("requested");
            Demand(hasPermission, "products.edit");
            string owner = containerProductId ?? (existing != null ? existing.ProductId : requested.ProductId);
            if (!string.IsNullOrWhiteSpace(requested.ProductId) &&
                !string.Equals(requested.ProductId, owner, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("لا يمكن نقل وحدة بيع إلى صنف مختلف.");
            }
            if (existing != null && !string.Equals(existing.ProductId, owner, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("وحدة البيع لا تخص الصنف المطلوب.");
            }
            if (existing == null || existing.SellPricePiasters != requested.SellPricePiasters ||
                existing.ConversionFactor != requested.ConversionFactor || existing.IsBaseUnit != requested.IsBaseUnit)
            {
                Demand(hasPermission, "products.edit_price");
            }
            if (existing == null || existing.CostPricePiasters != requested.CostPricePiasters)
            {
                Demand(hasPermission, "products.edit_cost");
            }
        }

        public static void ValidateFinancialUnitStructure(Func<string, bool> hasPermission, string structurePermission = "products.edit")
        {
            Demand(hasPermission, structurePermission);
            Demand(hasPermission, "products.edit_price");
            Demand(hasPermission, "products.edit_cost");
        }
    }
}
