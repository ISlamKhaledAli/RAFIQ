import { test } from 'node:test';
import assert from 'node:assert';

test('Feature #40: Customer Phone Duplicate Warning & Quick Add (Story 63 / Task 40-4)', async (t) => {
  // Existing customers database mock
  const existingCustomers = [
    {
      id: 'cust_101',
      name: 'أحمد محمود العطار',
      phone: '01012345678',
      balancePiasters: 25000, // 250.00 EGP debt
      creditLimitPiasters: 100000,
    },
    {
      id: 'cust_102',
      name: 'محمد إبراهيم حسنين',
      phone: '01198765432',
      balancePiasters: 0,
      creditLimitPiasters: 50000,
    },
    {
      id: 'cust_103',
      name: 'عم خليل البقال',
      phone: '012-3456-7890',
      balancePiasters: 15000,
      creditLimitPiasters: 80000,
    },
  ];

  // Pure logic for checking phone duplication matching CustomerRepository & IpcDispatcher
  const checkDuplicatePhone = (phone, excludeId, customerList = existingCustomers) => {
    if (!phone) return { isDuplicate: false, existingCustomer: null };

    // Normalize phone: strip spaces and dashes
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    if (cleanPhone.length < 7) {
      return { isDuplicate: false, existingCustomer: null };
    }

    const found = customerList.find(c => {
      if (excludeId && c.id === excludeId) return false;
      const cPhone = (c.phone || '').trim().replace(/[\s-]/g, '');
      return cPhone.length >= 7 && cPhone === cleanPhone;
    });

    return {
      isDuplicate: Boolean(found),
      existingCustomer: found || null,
    };
  };

  await t.test('1. Normalizes phone numbers with spaces, dashes, and identifies duplicate exactly', () => {
    // Exact match
    const check1 = checkDuplicatePhone('01012345678');
    assert.strictEqual(check1.isDuplicate, true);
    assert.strictEqual(check1.existingCustomer.id, 'cust_101');
    assert.strictEqual(check1.existingCustomer.name, 'أحمد محمود العطار');
    assert.strictEqual(check1.existingCustomer.balancePiasters, 25000);

    // Formatted match with spaces and dashes: '012 3456 7890' vs '012-3456-7890'
    const check2 = checkDuplicatePhone('012 3456 7890');
    assert.strictEqual(check2.isDuplicate, true);
    assert.strictEqual(check2.existingCustomer.id, 'cust_103');
  });

  await t.test('2. Self-exclusion: editing an existing customer does not report their own phone as duplicate', () => {
    // When editing cust_101 with their own phone
    const checkSelf = checkDuplicatePhone('01012345678', 'cust_101');
    assert.strictEqual(checkSelf.isDuplicate, false);
    assert.strictEqual(checkSelf.existingCustomer, null);

    // But if editing cust_102 and changing phone to cust_101's phone, it flags duplicate!
    const checkOther = checkDuplicatePhone('01012345678', 'cust_102');
    assert.strictEqual(checkOther.isDuplicate, true);
    assert.strictEqual(checkOther.existingCustomer.id, 'cust_101');
  });

  await t.test('3. Incomplete / short phone numbers (< 7 digits) do not trigger false positive warnings', () => {
    assert.strictEqual(checkDuplicatePhone('010').isDuplicate, false);
    assert.strictEqual(checkDuplicatePhone('01').isDuplicate, false);
    assert.strictEqual(checkDuplicatePhone('').isDuplicate, false);
    assert.strictEqual(checkDuplicatePhone(null).isDuplicate, false);
  });

  await t.test('4. Unique phone returns isDuplicate: false', () => {
    const unique = checkDuplicatePhone('01599988877');
    assert.strictEqual(unique.isDuplicate, false);
    assert.strictEqual(unique.existingCustomer, null);
  });

  await t.test('5. Quick Add Customer during checkout handles duplicate redirection or new customer creation', () => {
    const quickAdd = ({ name, phone, customerList }) => {
      const dup = checkDuplicatePhone(phone, undefined, customerList);
      if (dup.isDuplicate) {
        return {
          action: 'SELECT_EXISTING',
          customer: dup.existingCustomer,
          message: `رقم الهاتف مسجل بالفعل للعميل: ${dup.existingCustomer.name}`,
        };
      }

      const newCust = {
        id: `cust_${Date.now()}`,
        name: name.trim(),
        phone: phone ? phone.trim() : '',
        balancePiasters: 0,
        creditLimitPiasters: 100000,
      };
      customerList.push(newCust);
      return {
        action: 'CREATED_NEW',
        customer: newCust,
      };
    };

    const currentCustomers = [...existingCustomers];

    // Attempt quick add with duplicate phone -> redirects to existing customer
    const resDup = quickAdd({
      name: 'أحمد محمود',
      phone: '01012345678',
      customerList: currentCustomers,
    });
    assert.strictEqual(resDup.action, 'SELECT_EXISTING');
    assert.strictEqual(resDup.customer.id, 'cust_101');
    assert.strictEqual(currentCustomers.length, 3); // No duplicate added

    // Quick add with new unique phone -> creates new customer successfully
    const resNew = quickAdd({
      name: 'كريم عبد العزيز',
      phone: '01511223344',
      customerList: currentCustomers,
    });
    assert.strictEqual(resNew.action, 'CREATED_NEW');
    assert.strictEqual(resNew.customer.name, 'كريم عبد العزيز');
    assert.strictEqual(resNew.customer.balancePiasters, 0);
    assert.strictEqual(currentCustomers.length, 4);
  });
});
