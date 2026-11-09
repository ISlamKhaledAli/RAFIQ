import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// The "log of all terminal and wallet movements" section of the daily closing must stay roomy and readable.
const src = fs.readFileSync(path.resolve('src', 'components', 'DailyClosingModal.tsx'), 'utf8').replace(/\r\n/g, '\n');
const section = src.slice(
  src.indexOf('2.B Detailed Accordion'),
  src.indexOf('Profit & Zero-cost alert'),
);

describe('DailyClosingModal epay/wallet log section', () => {
  it('has a real toggle header: expanded state, count badge, chevron, comfortable padding', () => {
    assert.ok(section.includes('aria-expanded={showEpayDetails}') && section.includes('aria-controls="daily-closing-epay-log"'));
    assert.ok(section.includes('px-4 py-3') && section.includes('<ChevronDown'));
    assert.ok(section.includes('معاملة مسجلة'));
  });

  it('sub-tabs are spaced pills with a tablist role', () => {
    assert.ok(section.includes('role="tablist"') && section.includes('h-10'));
    assert.ok((section.match(/role="tab"/g) || []).length === 2);
  });

  it('tables: sticky header, bounded internal scroll, h-12 zebra rows, tabular ltr amounts, no horizontal scroll', () => {
    assert.ok(src.includes("const LOG_TH = 'sticky top-0 z-10 h-10"));
    assert.ok(src.includes("const LOG_ROW = 'h-12 even:bg-surface-2/40 dark:even:bg-surface-dark-2/40 hover:"));
    assert.ok(src.includes('tabular-nums') && section.includes('dir="ltr"'));
    assert.ok(section.includes('max-h-80 overflow-y-auto overflow-x-hidden'));
    assert.ok(!section.includes('overflow-x-auto'));
  });

  it('no tiny text, empty states carry an icon, theme tokens with dark pairs only', () => {
    assert.ok(!/text-\[(9|10|11)px\]|text-micro/.test(section));
    assert.ok(section.includes('<LogEmptyState icon={CreditCard}') && section.includes('<LogEmptyState icon={Smartphone}'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(section));
    assert.ok(!/-(slate|gray|emerald|amber|red|green)-\d{2,3}/.test(section));
  });

  it('keeps the data and logic: same lists and counts feed the section', () => {
    for (const token of ['epayTxList.map', 'walletTxList.map', 'epayTerminalsList.map', 'walletsSummaryList.map', 'totalEpayAndWalletTxCount', "setActiveEpaySubTab('wallets')"]) {
      assert.ok(section.includes(token), token);
    }
  });
});
