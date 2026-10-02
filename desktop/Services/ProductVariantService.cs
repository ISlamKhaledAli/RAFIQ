using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ProductVariantService
    {
        private readonly ProductVariantRepository _repository;

        public ProductVariantService(string connectionString)
        {
            _repository = new ProductVariantRepository(connectionString);
        }

        public ParentProductWithVariants CreateVariantMatrix(CreateVariantMatrixRequest request)
        {
            return _repository.CreateMatrix(request);
        }

        public List<ProductVariant> GetVariantsByParentId(string parentId)
        {
            return _repository.GetVariantsByParentId(parentId);
        }

        public ParentProductWithVariants GetParentWithVariants(string parentId)
        {
            return _repository.GetParentWithVariants(parentId);
        }

        public List<ParentProductWithVariants> GetVariantMatrixReport()
        {
            return _repository.GetVariantMatrixReport();
        }
    }
}

