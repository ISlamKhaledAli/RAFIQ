import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { formatPhoneDisplay } from '../src/utils/phoneFormat.ts';

const read = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

describe('formatPhoneDisplay', () => {
  const table = [
    ['01012345678', '010-1234-5678'],
    ['01234567890', '012-3456-7890'],
    ['0101 234 5678', '010-1234-5678'],
    ['010-1234-5678', '010-1234-5678'],
    ['(010) 1234 5678', '010-1234-5678'],
    ['  01012345678  ', '010-1234-5678'],
    ['+201012345678', '010-1234-5678'],
    ['+20 101 234 5678', '010-1234-5678'],
    ['+20 (0) 101 234 5678', '010-1234-5678'],
    ['00201012345678', '010-1234-5678'],
    ['٠١٠١٢٣٤٥٦٧٨', '010-1234-5678'],
    ['۰۱۰۱۲۳۴۵۶۷۸', '010-1234-5678'],
    ['0223456789', '02-2345-6789'],
    ['02 2345 6789', '02-2345-6789'],
    ['+20 2 2345 6789', '02-2345-6789'],
    ['0482345678', '048-234-5678'],
    ['1012345678', '101-234-5678'],
    ['', ''],
    ['   ', ''],
    [null, ''],
    [undefined, ''],
  ];
  for (const [input, expected] of table) {
    it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      assert.equal(formatPhoneDisplay(input), expected);
    });
  }

  it('returns anything unrecognised exactly as given and never drops digits', () => {
    for (const input of [
      '0101234',
      '010123456789012',
      '9876543210123456',
      'shop.market@instapay',
      'abc 0101 234 5678',
      '0101234567x',
      '+1 555 123 4567',
      '+20',
      '0020',
      '010/1234/5678',
      '01012345678, 01112345678',
      '123',
    ]) {
      assert.equal(formatPhoneDisplay(input), input);
    }
  });

  it('never throws and is idempotent', () => {
    assert.equal(formatPhoneDisplay(formatPhoneDisplay('01012345678')), '010-1234-5678');
    assert.equal(formatPhoneDisplay(1012345678), '101-234-5678');
    assert.doesNotThrow(() => formatPhoneDisplay({ toString: () => 'x' }));
  });
});

describe('phone display call sites', () => {
  const wallets = read('views/wallets/WalletsView.tsx');
  const card = read('components/payment/ReceivingAccountCard.tsx');
  const accounts = read('utils/digitalAccounts.ts');

  it('WalletsView and ReceivingAccountCard format through the shared util', () => {
    assert.match(wallets, /import \{ formatPhoneDisplay \} from '..\/..\/utils\/phoneFormat'/);
    assert.match(card, /import \{ formatPhoneDisplay \} from '..\/..\/utils\/phoneFormat'/);
    assert.match(wallets, /display: formatPhoneDisplay\(raw\)/);
    assert.match(card, /display: formatPhoneDisplay\(numbers\.primary\)/);
    assert.match(card, /display: formatPhoneDisplay\(storeRaw\)/);
    assert.match(wallets, /formatPhoneDisplay\(t\.customerPhone\)/);
  });

  it('the old space-grouping helper is gone', () => {
    assert.doesNotMatch(accounts, /formatAccountValue|EGYPT_MOBILE|slice\(4, 7\)/);
    assert.doesNotMatch(wallets, /formatAccountValue/);
    assert.doesNotMatch(card, /formatAccountValue|slice\(/);
  });

  it('read-only phone texts in lists use the util', () => {
    const sites = {
      'views/CustomersView.tsx': /formatPhoneDisplay\(cust\.phone\)/,
      'views/purchases/SuppliersTab.tsx': /formatPhoneDisplay\(sup\.phone\)/,
      'views/epay/EpayView.tsx': /formatPhoneDisplay\(tx\.customerPhone\)/,
      'views/SalesHistoryView.tsx': /formatPhoneDisplay\(selectedSale\.customerPhone\)/,
      'components/DebtorsReportModal.tsx': /formatPhoneDisplay\(d\.phone\)/,
      'views/customers/CustomerPrintStatementModal.tsx': /formatPhoneDisplay\(selectedCustomer\.phone\)/,
    };
    for (const [file, pattern] of Object.entries(sites)) {
      assert.match(read(file), pattern, file);
    }
  });

  it('keeps the number span LTR and leaves receipts untouched', () => {
    assert.match(card, /dir="ltr"\s+className=\{`min-w-0 text-left/);
    assert.match(wallets, /dir="ltr"\s+className=\{`min-w-0 text-left text-sm font-bold font-mono/);
    for (const file of ['components/ReceiptPaper.tsx', 'components/ReceiptModal.tsx', 'utils/receiptLayout.ts']) {
      assert.doesNotMatch(read(file), /formatPhoneDisplay/, file);
    }
  });
});
