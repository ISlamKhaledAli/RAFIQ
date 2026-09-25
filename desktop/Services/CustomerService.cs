using System;
using System.Collections.Generic;
using RafiqPOS.Models;
using RafiqPOS.Repositories;

namespace RafiqPOS.Services
{
    public class CustomerService
    {
        private readonly CustomerRepository _repo;

        public CustomerService(CustomerRepository repo)
        {
            _repo = repo;
        }

        public List<Customer> GetAll(int limit = 100)
        {
            return _repo.GetAll(limit);
        }

        public List<Customer> Search(string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return _repo.GetAll(100);
            }
            return _repo.Search(query);
        }

        public Customer GetById(string id)
        {
            return _repo.GetById(id);
        }

        public Customer FindByPhone(string phone, string excludeId)
        {
            return _repo.FindByPhone(phone, excludeId);
        }

        public Customer SaveCustomer(Customer customer)
        {
            if (customer == null) throw new ArgumentNullException("customer");
            return _repo.SaveCustomer(customer);
        }

        public Customer RecordPayment(string customerId, long amountPiasters, string notes)
        {
            return _repo.RecordPayment(customerId, amountPiasters, notes);
        }

        public Customer CancelPayment(string customerId, string ledgerEntryId, string reason, string userName)
        {
            return _repo.CancelPayment(customerId, ledgerEntryId, reason, userName);
        }

        public List<CustomerLedgerEntry> GetStatement(string customerId, int limit = 50)
        {
            return _repo.GetStatement(customerId, limit);
        }

        public CustomerStatementReport GetDetailedStatement(string customerId, string startDate, string endDate)
        {
            return _repo.GetDetailedStatement(customerId, startDate, endDate);
        }

        public CustomerBalanceVerification VerifyBalance(string customerId)
        {
            return _repo.VerifyBalance(customerId);
        }

        public Customer RecalculateAndFixBalance(string customerId)
        {
            return _repo.RecalculateAndFixBalance(customerId);
        }

        public CustomerImportResult BatchImportCustomers(List<CustomerImportRow> rows)
        {
            return _repo.BatchImportCustomers(rows);
        }
    }
}
