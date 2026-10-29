using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class TableManagementService
    {
        private readonly TableRepository _tableRepo;

        public TableManagementService(TableRepository tableRepo)
        {
            _tableRepo = tableRepo;
        }

        public List<RestaurantTable> GetAllTables(bool includeInactive = false)
        {
            return _tableRepo.GetAll(includeInactive);
        }

        public RestaurantTable GetTableById(string tableId)
        {
            return _tableRepo.GetById(tableId);
        }

        public RestaurantTable SaveTable(RestaurantTable table)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.SaveTable(table);
            }
        }

        public bool DeleteTable(string tableId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.DeleteTable(tableId);
            }
        }

        public RestaurantTable OpenTable(string tableId, string waiterName, int guestsCount, string cashierId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.OpenTable(tableId, waiterName, guestsCount, cashierId);
            }
        }

        public RestaurantTable UpdateTableOrder(
            string tableId,
            string cartJson,
            long subtotalPiasters,
            long discountPiasters,
            long totalPiasters,
            int itemsCount,
            string notes,
            string waiterName,
            int guestsCount,
            string cashierId,
            string printedKotQuantitiesJson = null)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.UpdateTableOrder(
                    tableId,
                    cartJson,
                    subtotalPiasters,
                    discountPiasters,
                    totalPiasters,
                    itemsCount,
                    notes,
                    waiterName,
                    guestsCount,
                    cashierId,
                    printedKotQuantitiesJson
                );
            }
        }

        public RestaurantTable TransferTable(string fromTableId, string toTableId, string userId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.TransferTable(fromTableId, toTableId, userId);
            }
        }

        public RestaurantTable MergeTables(string sourceTableId, string targetTableId, string userId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.MergeTables(sourceTableId, targetTableId, userId);
            }
        }

        public TableSplitResult SplitTableBill(string tableId, List<TableSplitItemRequest> splitItems, string userId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.SplitTableBill(tableId, splitItems, userId);
            }
        }

        public RestaurantTable SetTableStatus(string tableId, string status)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.SetStatus(tableId, status);
            }
        }

        public RestaurantTable CloseTable(string tableId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _tableRepo.CloseTable(tableId);
            }
        }
    }
}
