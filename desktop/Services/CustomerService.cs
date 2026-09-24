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

        public Customer SaveCustomer(Customer customer)
        {
            if (customer == null) throw new ArgumentNullException("customer");
            return _repo.SaveCustomer(customer);
        }

        public Customer RecordPayment(string customerId, long amountPiasters, string notes)
        {
            return _repo.RecordPayment(customerId, amountPiasters, notes);
        }

        public List<CustomerLedgerEntry> GetStatement(string customerId, int limit = 50)
        {
            return _repo.GetStatement(customerId, limit);
        }
    }
}
