using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class DeliveryService
    {
        private readonly DeliveryRepository _deliveryRepo;

        public DeliveryService(DeliveryRepository deliveryRepo)
        {
            _deliveryRepo = deliveryRepo;
        }

        public List<DeliveryZone> GetZones(bool includeInactive = false)
        {
            return _deliveryRepo.GetZones(includeInactive);
        }

        public DeliveryZone SaveZone(DeliveryZone zone)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.SaveZone(zone);
            }
        }

        public bool DeleteZone(string zoneId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.DeleteZone(zoneId);
            }
        }

        public List<DeliveryRider> GetRiders(bool includeInactive = false)
        {
            return _deliveryRepo.GetRiders(includeInactive);
        }

        public DeliveryRider SaveRider(DeliveryRider rider)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.SaveRider(rider);
            }
        }

        public bool DeleteRider(string riderId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.DeleteRider(riderId);
            }
        }

        public List<DeliveryOrder> GetOrders(string statusFilter = null, string riderId = null, bool? unsettledOnly = null, int limit = 100)
        {
            return _deliveryRepo.GetOrders(statusFilter, riderId, unsettledOnly, limit);
        }

        public DeliveryOrder AssignOrderToRider(string orderId, string riderId, string userId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.AssignOrderToRider(orderId, riderId, userId);
            }
        }

        public DeliveryOrder UpdateOrderStatus(string orderId, string status, string userId)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.UpdateOrderStatus(orderId, status, userId);
            }
        }

        public RiderSettlementSummary GetRiderSettlementSummary(string riderId)
        {
            return _deliveryRepo.GetRiderSettlementSummary(riderId);
        }

        public RiderSettlementSummary SettleRider(string riderId, string userId, bool recordCommissionExpense = true)
        {
            lock (SaleService.FinancialWriteLock)
            {
                return _deliveryRepo.SettleRider(riderId, userId, recordCommissionExpense);
            }
        }
    }
}
