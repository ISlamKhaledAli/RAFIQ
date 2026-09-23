using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class ProductService
    {
        private readonly ProductRepository _repo;

        public ProductService(ProductRepository repo)
        {
            _repo = repo;
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

        public Product SaveProduct(Product product)
        {
            if (product == null)
            {
                throw new ArgumentNullException("product");
            }

            if (string.IsNullOrWhiteSpace(product.Name))
            {
                throw new ArgumentException("اسم المنتج مطلوب ولا يمكن أن يكون فارغاً");
            }

            if (product.PricePiasters < 0)
            {
                throw new ArgumentException("سعر البيع لا يمكن أن يكون سالباً");
            }

            if (string.IsNullOrWhiteSpace(product.Id))
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
            return product;
        }
    }
}
