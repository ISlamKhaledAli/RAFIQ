---
name: rafiq-pos
description: Architecture invariants, integer financial arithmetic, concurrency locks, and senior QA guidelines for Rafiq POS desktop offline system.
---

# Rafiq POS (رفيق) — Senior Architecture & Invariants Guide

This skill encapsulates the immutable core engineering principles and architectural invariants for **Rafiq POS (رفيق)**.
Any AI agent or developer modifying the codebase must adhere strictly to these rules.

---

## 1. Core Technical Constraints
- **Target OS:** Offline desktop supporting **Windows 7 SP1 (32-bit & 64-bit)** up to **Windows 11**.
- **C# / .NET Host:** Strictly **.NET Framework 4.8 (`net48`)** using **C# 5.0 syntax**. Never use C# 6+ features (`=>` expression-bodied members, `nameof(...)`, or pattern matching `is Type var`).
- **Database Engine:** SQLite in **WAL (Write-Ahead Logging)** mode via `Stub.System.Data.SQLite.Core.NetFramework`.
- **Frontend Target:** Vite targeting `chrome109` / `es2020` with Tailwind CSS v3.4 (never v4).
- **Zero Emojis Policy:** Emojis are strictly prohibited anywhere (UI, receipts, toasts, Excel, logs). Use SVG icons exclusively (`lucide-react`).

---

## 2. Senior Financial & Concurrency Invariants

### 🔴 Integer Financial Arithmetic (Integer Piasters Only)
- Never use `float` or `double` for currency or pricing calculations.
- Store all money values in **Piasters (`long` in C#, `number` in TS)** as exact integers.
- Quantities and weights are stored in **milli-units (1/1000)** as integers.
- Division for display (`amount / 100.0`) is only permitted in the presentation layer.

### 🔴 Concurrency & Write Lock (`SaleService.FinancialWriteLock`)
- All database write operations touching money, inventory, or balances must be serialized via:
  ```csharp
  lock (SaleService.FinancialWriteLock)
  {
      // Atomic ACID transaction
  }
  ```
- This includes:
  - Sales & Invoices (`SaleService`)
  - Returns & Refunds (`ReturnService` / `ReturnRepository`)
  - Shift / Daily Closing (`DailyClosingService`)
  - Purchases & Supplier Payments (`PurchaseService`, `SupplierService`)
  - Customer Payments & Debt Settlements (`CustomerService`)
  - Batch Product/Customer Imports (`ProductService`, `CustomerService`)

### 🔴 Double-Entry Ledger Invariant (Never Update Balance Directly)
- **Stock:** Never update `products.stock_quantity_milli` directly without recording a corresponding ledger row in `stock_movements`.
- **Customer Debts:** Never update `customers.balance_piasters` directly without recording a corresponding ledger row in `customer_ledger`.
- **Undamaged Returns:** Must restore stock, synchronize parent-variant aggregates, and emit `REFUND` movements.
- **Damaged Returns:** Must NOT enter sellable stock; emit `DAMAGED_RETURN` movements.
- **Cash Refund Guard:** Cash refunds on returns may never exceed cash actually received on the original invoice (`allowableCashRefund`).

---

## 3. IPC Bridge & RBAC Security Invariant
- The UI communicates with the backend exclusively via typed IPC commands (`IpcDispatcher`).
- All sensitive reporting, closing, administrative, and inventory adjusting endpoints must be mapped in `PERMISSION_MAP` in `IpcDispatcher.cs`.
- Pass `SecurityService.CurrentUser.Id` to audit logging calls.

---

## 4. Timezone & DateTime Standards
- Store all timestamps in UTC ISO-8601 format: `DateTime.UtcNow.ToString("o")`.
- SQLite date queries against business days must align with `business_date` or explicitly offset UTC to avoid double-offset skew.

---

## 5. Verification Commands
- **Compile C# Backend:**
  `& "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe" desktop\RafiqPOS.csproj /p:Configuration=Debug /v:m`
- **Run Chaos Engineering Suite:**
  `powershell -Command "Start-Process desktop\bin\Debug\RafiqPOS.exe -ArgumentList '--run-chaos-tests' -Wait"`
- **Run Deep Audit Suite:**
  `powershell -Command "Start-Process desktop\bin\Debug\RafiqPOS.exe -ArgumentList '--run-deep-audit-tests' -Wait"`
- **Lint Frontend:**
  `cd frontend && npm run lint`
- **Build Frontend:**
  `cd frontend && npm run build`
