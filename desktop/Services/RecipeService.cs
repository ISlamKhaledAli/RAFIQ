using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class RecipeService
    {
        private readonly RecipeRepository _recipeRepo;

        public RecipeService(RecipeRepository recipeRepo)
        {
            _recipeRepo = recipeRepo;
        }

        public List<Recipe> GetAllRecipes()
        {
            return _recipeRepo.GetAllRecipes();
        }

        public Recipe GetByProductId(string productId)
        {
            return _recipeRepo.GetByProductId(productId);
        }

        public Recipe SaveRecipe(Recipe recipe, bool updateProductCost = true)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _recipeRepo.SaveRecipe(recipe, updateProductCost);
            }
        }

        public bool DeleteRecipe(string recipeId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _recipeRepo.DeleteRecipe(recipeId);
            }
        }

        public ProductionBatch ProduceBatch(string recipeId, long producedQtyMilli, string notes, string userId, string userName)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _recipeRepo.ProduceBatch(recipeId, producedQtyMilli, notes, userId, userName);
            }
        }

        public List<ProductionBatch> GetProductionLog(int limit = 100)
        {
            return _recipeRepo.GetProductionLog(limit);
        }
    }
}
