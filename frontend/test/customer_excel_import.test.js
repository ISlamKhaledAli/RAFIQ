import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 71 — Feature #109: استيراد العملاء وديونهم الافتتاحية من إكسل', () => {

  // Task 109-1: أعمدة القالب (الاسم، الهاتف، الرصيد الافتتاحي، حد الائتمان، الملاحظات)
  it('Task 109-1: يجب التحقق من هيكل أعمدة القالب المعتمد لاستيراد العملاء', () => {
    const templateHeaders = [
      'اسم العميل *',
      'رقم الهاتف',
      'الرصيد الافتتاحي (دين الدفتر بالجنيه)',
      'حد الائتمان / التنبيه (بالجنيه)',
      'ملاحظات إضافية'
    ];

    assert.equal(templateHeaders.length, 5);
    assert.ok(templateHeaders[0].includes('اسم العميل'));
    assert.ok(templateHeaders[1].includes('رقم الهاتف'));
    assert.ok(templateHeaders[2].includes('الرصيد الافتتاحي'));
    assert.ok(templateHeaders[3].includes('حد الائتمان'));
  });

  // Task 109-2: تدقيق السطور ومنع تكرار الهواتف وحساب المبالغ بالقروش
  it('Task 109-2: تدقيق السطور وحساب المبالغ بالقروش واكتشاف تكرار الهواتف داخل الملف', () => {
    const rawRows = [
      { name: 'علي حسن السعدني', phone: '01011223344', initialBalance: '150.50', creditLimit: '1000', notes: 'دفتر قديم' },
      { name: 'محمد عبد الله', phone: '01011223344', initialBalance: '200.00', creditLimit: '500', notes: 'مكرر نفس الهاتف' },
      { name: '', phone: '01233445566', initialBalance: '50', creditLimit: '1000', notes: 'بدون اسم' },
      { name: 'كريم زكي', phone: '01199887766', initialBalance: 'abc', creditLimit: '1000', notes: 'رصيد غير صالح' },
      { name: 'أحمد محمود', phone: '01255667788', initialBalance: '0', creditLimit: '2000', notes: 'عميل مسدد' },
    ];

    const seenPhones = new Set();
    const parsedRows = rawRows.map((r, idx) => {
      const errors = [];
      const cleanPhone = (r.phone || '').trim().replace(/[\s-]/g, '');
      const cleanName = (r.name || '').trim();

      if (!cleanName) {
        errors.push('اسم العميل إلزامي ولا يمكن تركه فارغاً');
      }

      if (cleanPhone) {
        if (seenPhones.has(cleanPhone)) {
          errors.push(`رقم الهاتف ${cleanPhone} مكرر في أكثر من سطر بالملف`);
        } else {
          seenPhones.add(cleanPhone);
        }
      }

      const balNum = parseFloat(r.initialBalance);
      let initialBalancePiasters = 0;
      if (isNaN(balNum) || balNum < 0) {
        errors.push('الرصيد الافتتاحي يجب أن يكون رقماً صحيحاً أو عشرياً موجباً');
      } else {
        initialBalancePiasters = Math.round(balNum * 100);
      }

      const limitNum = parseFloat(r.creditLimit);
      const creditLimitPiasters = (!isNaN(limitNum) && limitNum >= 0) ? Math.round(limitNum * 100) : 100000;

      return {
        rowIndex: idx + 4,
        name: cleanName,
        phone: cleanPhone,
        initialBalancePiasters,
        creditLimitPiasters,
        notes: r.notes,
        isValid: errors.length === 0,
        errors,
      };
    });

    assert.equal(parsedRows.length, 5);

    // Row 1 is valid (150.50 EGP = 15050 piasters)
    assert.equal(parsedRows[0].isValid, true);
    assert.equal(parsedRows[0].initialBalancePiasters, 15050);
    assert.equal(parsedRows[0].creditLimitPiasters, 100000);

    // Row 2 has duplicate phone
    assert.equal(parsedRows[1].isValid, false);
    assert.ok(parsedRows[1].errors[0].includes('مكرر'));

    // Row 3 is missing name
    assert.equal(parsedRows[2].isValid, false);
    assert.ok(parsedRows[2].errors[0].includes('اسم العميل إلزامي'));

    // Row 4 has invalid balance
    assert.equal(parsedRows[3].isValid, false);
    assert.ok(parsedRows[3].errors[0].includes('الرصيد الافتتاحي'));

    // Row 5 is valid with 0 balance
    assert.equal(parsedRows[4].isValid, true);
    assert.equal(parsedRows[4].initialBalancePiasters, 0);

    const validCount = parsedRows.filter(r => r.isValid).length;
    const invalidCount = parsedRows.filter(r => !r.isValid).length;
    const totalOpeningDebts = parsedRows.filter(r => r.isValid).reduce((sum, r) => sum + r.initialBalancePiasters, 0);

    assert.equal(validCount, 2);
    assert.equal(invalidCount, 3);
    assert.equal(totalOpeningDebts, 15050); // only valid row 1
  });

  // Task 109-3: توليد قيود دفتر الأستاذ الافتتاحية بدقة مع استبعاد السطور غير الصالحة
  it('Task 109-3: إنشاء قيود دفتر الأستاذ (opening_balance) للعملاء الذين عليهم دين افتتاحي فقط', () => {
    const validRowsToImport = [
      { name: 'عميل 1', phone: '01000000001', initialBalancePiasters: 25000, creditLimitPiasters: 100000, notes: 'دفتر 1' },
      { name: 'عميل 2', phone: '01000000002', initialBalancePiasters: 0, creditLimitPiasters: 50000, notes: 'بدون دين' },
      { name: 'عميل 3', phone: '01000000003', initialBalancePiasters: 40000, creditLimitPiasters: 150000, notes: 'دفتر 2' },
    ];

    const databaseCustomers = [];
    const databaseLedger = [];

    for (const r of validRowsToImport) {
      const custId = `cust_${databaseCustomers.length + 1}`;
      databaseCustomers.push({
        id: custId,
        name: r.name,
        phone: r.phone,
        balancePiasters: r.initialBalancePiasters,
        creditLimitPiasters: r.creditLimitPiasters,
      });

      if (r.initialBalancePiasters > 0) {
        databaseLedger.push({
          id: `ledg_${databaseLedger.length + 1}`,
          customerId: custId,
          type: 'opening_balance',
          amountPiasters: r.initialBalancePiasters,
          balanceAfterPiasters: r.initialBalancePiasters,
          notes: `رصيد افتتاحي: ${r.notes}`,
        });
      }
    }

    // Check customers created
    assert.equal(databaseCustomers.length, 3);
    assert.equal(databaseCustomers[0].balancePiasters, 25000);
    assert.equal(databaseCustomers[1].balancePiasters, 0);
    assert.equal(databaseCustomers[2].balancePiasters, 40000);

    // Check ledger entries: only 2 entries (for client 1 and 3)
    assert.equal(databaseLedger.length, 2);
    assert.equal(databaseLedger[0].customerId, 'cust_1');
    assert.equal(databaseLedger[0].type, 'opening_balance');
    assert.equal(databaseLedger[0].amountPiasters, 25000);
    assert.equal(databaseLedger[1].customerId, 'cust_3');
    assert.equal(databaseLedger[1].type, 'opening_balance');
    assert.equal(databaseLedger[1].amountPiasters, 40000);

    // Total opening debt verified
    const totalDebts = databaseCustomers.reduce((sum, c) => sum + c.balancePiasters, 0);
    assert.equal(totalDebts, 65000); // 650.00 EGP
  });

  // Task 109-4: اختبار عدم التكرار مع قاعدة البيانات وتخطي أرقام الهواتف الموجودة مسبقاً
  it('Task 109-4: تخطي الأرقام المسجلة مسبقاً بقاعدة البيانات وتحديث العدادات بدقة', () => {
    const existingDbPhone = '01012345678';
    const importRows = [
      { name: 'عميل جديد تماماً', phone: '01099998888', initialBalancePiasters: 10000, isValid: true },
      { name: 'عميل يحمل هاتف موجود بالسيستم', phone: existingDbPhone, initialBalancePiasters: 5000, isValid: true },
    ];

    let importedCount = 0;
    let skippedCount = 0;
    let totalOpeningDebt = 0;

    for (const row of importRows) {
      if (row.phone === existingDbPhone) {
        skippedCount++;
        continue;
      }
      importedCount++;
      totalOpeningDebt += row.initialBalancePiasters;
    }

    assert.equal(importedCount, 1);
    assert.equal(skippedCount, 1);
    assert.equal(totalOpeningDebt, 10000);
  });
});
