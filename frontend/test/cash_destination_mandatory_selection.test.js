import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const read = (rel) => readFileSync(SRC + rel, 'utf8').replace(/\r\n/g, '\n');

describe('Cash destination mandatory selection (No default choice & scroll on missing)', () => {
  const walletsSrc = read('views/wallets/WalletsView.tsx');
  const epaySrc = read('views/epay/EpayView.tsx');

  it('WalletsView: paymentDestination has NO default selection (initialized to null)', () => {
    assert.match(
      walletsSrc,
      /const\s*\[paymentDestination,\s*setPaymentDestination\]\s*=\s*useState<['"]cash_drawer['"]\s*\|\s*['"]terminal_till['"]\s*\|\s*null>\(null\);/,
      'WalletsView must initialize paymentDestination to null'
    );
  });

  it('EpayView: paymentDestination has NO default selection (initialized to null)', () => {
    assert.match(
      epaySrc,
      /const\s*\[paymentDestination,\s*setPaymentDestination\]\s*=\s*useState<EpayPaymentDestination\s*\|\s*null>\(null\);/,
      'EpayView must initialize paymentDestination to null'
    );
  });

  it('Step 5 in both views has NO "الافتراضي" badge', () => {
    // Step 5 section in WalletsView
    const walletsStep5 = walletsSrc.slice(
      walletsSrc.indexOf('Step 5: Cash Destination'),
      walletsSrc.indexOf('Right Column: 5 Cols - Financial Summary')
    );
    assert.doesNotMatch(walletsStep5, /الافتراضي/, 'WalletsView Step 5 must not have الافتراضي badge');

    // Step 5 section in EpayView
    const epayStep5 = epaySrc.slice(
      epaySrc.indexOf('Step 5: Cash Destination'),
      epaySrc.indexOf('Right 5 Columns: Financial Summary & Confirmation')
    );
    assert.doesNotMatch(epayStep5, /الافتراضي/, 'EpayView Step 5 must not have الافتراضي badge');
  });

  it('WalletsView: validates paymentDestination on submit and scrolls down to section 5', () => {
    assert.match(walletsSrc, /ref=\{destinationSectionRef\}/, 'Section 5 must have destinationSectionRef attached');
    assert.match(walletsSrc, /if\s*\(!paymentDestination\)\s*\{[\s\S]*?destinationSectionRef\.current(?:\?)?\.scrollIntoView/, 'Must scroll into view when destination is missing');
    assert.match(walletsSrc, /setDestinationError\(true\)/, 'Must set destination error state');
    assert.match(walletsSrc, /يجب اختيار جهة النقدية/, 'Must display clear inline validation indication');
  });

  it('EpayView: validates paymentDestination on submit and scrolls down to section 5', () => {
    assert.match(epaySrc, /ref=\{destinationSectionRef\}/, 'Section 5 must have destinationSectionRef attached');
    assert.match(epaySrc, /if\s*\(!paymentDestination\)\s*\{[\s\S]*?destinationSectionRef\.current(?:\?)?\.scrollIntoView/, 'Must scroll into view when destination is missing');
    assert.match(epaySrc, /setDestinationError\(true\)/, 'Must set destination error state');
    assert.match(epaySrc, /يجب اختيار جهة النقدية/, 'Must display clear inline validation indication');
  });

  it('resetTransactionForm in both views resets paymentDestination to null for fresh selection each time', () => {
    const walletsReset = walletsSrc.slice(walletsSrc.indexOf('const resetTransactionForm ='), walletsSrc.indexOf('const transactionDraftDirty ='));
    assert.match(walletsReset, /setPaymentDestination\(null\)/, 'WalletsView resetTransactionForm must reset paymentDestination to null');
    assert.match(walletsReset, /setDestinationError\(false\)/, 'WalletsView resetTransactionForm must reset destinationError to false');

    const epayReset = epaySrc.slice(epaySrc.indexOf('const resetTransactionForm ='), epaySrc.indexOf('const transactionDraftDirty ='));
    assert.match(epayReset, /setPaymentDestination\(null\)/, 'EpayView resetTransactionForm must reset paymentDestination to null');
    assert.match(epayReset, /setDestinationError\(false\)/, 'EpayView resetTransactionForm must reset destinationError to false');
  });

  it('global error scroll-to-top does NOT override destination smooth scroll', () => {
    assert.match(walletsSrc, /if\s*\(errorMsg\s*&&\s*!destinationError\)\s*\{\s*scrollToTop\(\);?\s*\}/, 'WalletsView must guard scrollToTop against destinationError');
    assert.match(epaySrc, /if\s*\(errorMsg\s*&&\s*!destinationError\)\s*\{\s*scrollToTop\(\);?\s*\}/, 'EpayView must guard scrollToTop against destinationError');
  });
});
