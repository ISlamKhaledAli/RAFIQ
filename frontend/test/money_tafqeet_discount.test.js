import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { tafqeetCurrency, calculateDiscountAmount, poundsToPiasters } from '../src/utils/money.ts';

const egp = (pounds) => tafqeetCurrency(pounds * 100);
const words = (text) => text.replace(/^فقط /, '').replace(/ لا غير$/, '');

describe('tafqeetCurrency: Arabic number-noun agreement', () => {
  it('zero and the first pounds', () => {
    assert.equal(tafqeetCurrency(0), 'صفر جنيه');
    assert.equal(words(egp(1)), 'جنيه واحد');
    assert.equal(words(egp(2)), 'جنيهان');
  });

  it('3 to 10 take the plural, 11 to 99 the singular accusative', () => {
    assert.equal(words(egp(3)), 'ثلاثة جنيهات');
    assert.equal(words(egp(10)), 'عشرة جنيهات');
    assert.equal(words(egp(11)), 'أحد عشر جنيهاً مصرياً');
    assert.equal(words(egp(25)), 'خمسة وعشرون جنيهاً مصرياً');
    assert.equal(words(egp(99)), 'تسعة وتسعون جنيهاً مصرياً');
  });

  it('round numbers use the singular without tanween, a dual loses its nun', () => {
    assert.equal(words(egp(100)), 'مائة جنيه');
    assert.equal(words(egp(200)), 'مائتا جنيه');
    assert.equal(words(egp(300)), 'ثلاثمائة جنيه');
    assert.equal(words(egp(1000)), 'ألف جنيه');
    assert.equal(words(egp(2000)), 'ألفا جنيه');
    assert.equal(words(egp(3000)), 'ثلاثة آلاف جنيه');
    assert.equal(words(egp(20000)), 'عشرون ألف جنيه');
    assert.equal(words(egp(100000)), 'مائة ألف جنيه');
    assert.equal(words(egp(200000)), 'مائتا ألف جنيه');
    assert.equal(words(egp(1000000)), 'مليون جنيه');
    assert.equal(words(egp(2000000)), 'مليونا جنيه');
    assert.equal(words(egp(5000000)), 'خمسة ملايين جنيه');
  });

  it('a dual keeps its nun when more words follow', () => {
    assert.equal(words(egp(2050)), 'ألفان وخمسون جنيهاً مصرياً');
    assert.equal(words(egp(2500)), 'ألفان وخمسمائة جنيه');
    assert.equal(words(egp(202)), 'مائتان وجنيهان');
    assert.equal(words(egp(200200)), 'مائتا ألف ومائتا جنيه');
  });

  it('the noun follows the last two digits of compound numbers', () => {
    assert.equal(words(egp(101)), 'مائة وجنيه واحد');
    assert.equal(words(egp(102)), 'مائة وجنيهان');
    assert.equal(words(egp(103)), 'مائة وثلاثة جنيهات');
    assert.equal(words(egp(1001)), 'ألف وجنيه واحد');
    assert.equal(words(egp(1011)), 'ألف وأحد عشر جنيهاً مصرياً');
    assert.equal(words(egp(1100)), 'ألف ومائة جنيه');
    assert.equal(words(egp(150000)), 'مائة وخمسون ألف جنيه');
    assert.equal(words(egp(202000)), 'مائتان واثنا ألف جنيه');
    assert.equal(words(egp(15001)), 'خمسة عشر ألفاً وجنيه واحد');
  });

  it('piasters read with the right plural', () => {
    assert.equal(tafqeetCurrency(1), 'فقط قرش واحد لا غير');
    assert.equal(tafqeetCurrency(2), 'فقط قرشان لا غير');
    assert.equal(tafqeetCurrency(3), 'فقط ثلاثة قروش لا غير');
    assert.equal(tafqeetCurrency(10), 'فقط عشرة قروش لا غير');
    assert.equal(tafqeetCurrency(11), 'فقط أحد عشر قرشاً لا غير');
    assert.equal(tafqeetCurrency(99), 'فقط تسعة وتسعون قرشاً لا غير');
    assert.equal(tafqeetCurrency(150), 'فقط جنيه واحد وخمسون قرشاً لا غير');
    assert.equal(tafqeetCurrency(155050), 'فقط ألف وخمسمائة وخمسون جنيهاً مصرياً وخمسون قرشاً لا غير');
    assert.equal(tafqeetCurrency(10002), 'فقط مائة جنيه وقرشان لا غير');
  });

  it('negative amounts and invalid input', () => {
    assert.equal(tafqeetCurrency(-100), 'فقط سالب جنيه واحد لا غير');
    assert.equal(tafqeetCurrency(NaN), '');
    assert.equal(tafqeetCurrency(null), '');
    assert.equal(tafqeetCurrency(Infinity), '');
  });

  it('above 10^12 pounds degrades to an empty string, never the word undefined', () => {
    assert.equal(tafqeetCurrency(1e14), '');
    assert.equal(tafqeetCurrency(5e17), '');
    assert.equal(tafqeetCurrency(Number.MAX_SAFE_INTEGER), '');
    assert.ok(words(tafqeetCurrency(99999999999 * 100)).length > 0, 'the largest valid money amount still reads');
  });

  it('no amount reads "undefined" or double spaces', () => {
    const samples = [];
    for (let n = 0; n < 1500; n++) samples.push(n * 7 + 1);
    for (let n = 1; n < 12; n++) samples.push(10 ** n, 2 * 10 ** n, 10 ** n + 1, 10 ** n + 2, 12 * 10 ** n + 3);
    for (const piasters of samples) {
      const text = tafqeetCurrency(piasters);
      assert.ok(!/undefined|NaN/.test(text), `${piasters}: ${text}`);
      assert.ok(!/ {2}/.test(text), `${piasters}: ${text}`);
      assert.ok(text.startsWith('فقط ') && text.endsWith(' لا غير'), `${piasters}: ${text}`);
    }
  });
});

describe('calculateDiscountAmount: exact integer math', () => {
  it('amount discounts read decimals like poundsToPiasters, including 3-decimal input', () => {
    assert.equal(calculateDiscountAmount(100000, 'amount', 1.005), poundsToPiasters(1.005));
    assert.equal(calculateDiscountAmount(100000, 'amount', 1.005), 101);
    assert.equal(calculateDiscountAmount(100000, 'amount', 1.015), 102);
    assert.equal(calculateDiscountAmount(100000, 'amount', 0.285), poundsToPiasters(0.285));
    assert.equal(calculateDiscountAmount(100000, 'amount', 8.575), poundsToPiasters(8.575));
  });

  it('two-decimal behaviour is unchanged', () => {
    assert.equal(calculateDiscountAmount(5000, 'amount', 10.5), 1050);
    assert.equal(calculateDiscountAmount(2000, 'amount', 30), 2000);
    assert.equal(calculateDiscountAmount(1533, 'percent', 7), 107);
    assert.equal(calculateDiscountAmount(10000, 'percent', 12.5), 1250);
    assert.equal(calculateDiscountAmount(1000, 'percent', 100), 1000);
    assert.equal(calculateDiscountAmount(1000, 'percent', 250), 1000);
  });

  it('percent discounts round half up exactly where a float product would miss the half', () => {
    // 1.15 * 5 / 100 style cases: 5 piasters x 10% = 0.5 -> 1; 35 x 10% = 3.5 -> 4
    assert.equal(calculateDiscountAmount(5, 'percent', 10), 1);
    assert.equal(calculateDiscountAmount(35, 'percent', 10), 4);
    assert.equal(calculateDiscountAmount(145, 'percent', 10), 15);
    // 3-decimal percent: 1.005% of 100000 piasters = 1005
    assert.equal(calculateDiscountAmount(100000, 'percent', 1.005), 1005);
    assert.equal(calculateDiscountAmount(99999999999, 'percent', 99.999), 99998999999);
  });

  it('non-positive and invalid values give no discount', () => {
    assert.equal(calculateDiscountAmount(1000, 'amount', 0), 0);
    assert.equal(calculateDiscountAmount(1000, 'percent', -5), 0);
    assert.equal(calculateDiscountAmount(1000, 'percent', NaN), 0);
    assert.equal(calculateDiscountAmount(0, 'amount', 10), 0);
  });
});
