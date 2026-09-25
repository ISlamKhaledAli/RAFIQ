using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class CategoryService
    {
        private readonly CategoryRepository _repo;

        public CategoryService(CategoryRepository repo)
        {
            _repo = repo;
        }

        public List<Category> GetAll(bool includeArchived = false)
        {
            return _repo.GetAll(includeArchived);
        }

        public Category GetById(string id)
        {
            return _repo.GetById(id);
        }

        public Category SaveCategory(Category category)
        {
            if (category == null) throw new ArgumentNullException("category");
            if (string.IsNullOrWhiteSpace(category.Name))
            {
                throw new ArgumentException("اسم التصنيف مطلوب ولا يمكن أن يكون فارغاً");
            }

            category.Name = category.Name.Trim();

            // Check duplicate name
            var existingWithName = _repo.GetByName(category.Name);
            if (existingWithName != null && existingWithName.Id != category.Id)
            {
                throw new InvalidOperationException("يوجد تصنيف مسجل بالفعل بهذا الاسم: " + category.Name);
            }

            if (string.IsNullOrWhiteSpace(category.Id))
            {
                category.Id = "cat_" + Guid.NewGuid().ToString("N").Substring(0, 12);
                category.CreatedAt = DateTime.UtcNow.ToString("o");
                category.IsActive = true;
            }

            category.UpdatedAt = DateTime.UtcNow.ToString("o");

            _repo.Upsert(category);
            return category;
        }

        public void ArchiveCategory(string id, bool isArchived = true)
        {
            if (string.IsNullOrWhiteSpace(id)) return;
            _repo.Archive(id, isArchived);
        }

        public void ReorderCategories(List<string> orderedIds)
        {
            if (orderedIds == null || orderedIds.Count == 0) return;
            _repo.Reorder(orderedIds);
        }
    }
}
