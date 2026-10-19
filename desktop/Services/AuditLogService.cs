using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class AuditLogService
    {
        private readonly AuditLogRepository _repo;

        public AuditLogService(AuditLogRepository repo)
        {
            _repo = repo;
        }

        public List<AuditLog> GetLogs(
            int limit = 100,
            string action = null,
            string userId = null,
            string startDate = null,
            string endDate = null,
            string search = null)
        {
            return _repo.GetLogs(limit, action, userId, startDate, endDate, search);
        }

        public void Log(string action, string entityType, string entityId, string detailsJson, string userId = null)
        {
            _repo.Log(new AuditLog
            {
                UserId = userId,
                Action = action,
                EntityType = entityType,
                EntityId = entityId,
                DetailsJson = detailsJson
            });
        }

        public AuditChainVerificationResult VerifyChainIntegrity()
        {
            return _repo.VerifyChainIntegrity();
        }

        public int ResealChain()
        {
            return _repo.ResealChain();
        }
    }
}
