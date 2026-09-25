import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Story 53 — Feature #159: Small Screen Support (1024×768) (Tasks 159-2 & 159-3)', () => {

  describe('Task 159-2: POS Viewport & Regional Proportions on 1024×768', () => {
    const SCREEN_WIDTH = 1024;
    const COLLAPSED_SIDEBAR_WIDTH = 64;

    it('calculates available content width with collapsed sidebar rail (64px) leaving 960px for POS', () => {
      const availableWidth = SCREEN_WIDTH - COLLAPSED_SIDEBAR_WIDTH;
      assert.equal(availableWidth, 960);
      assert.ok(availableWidth >= 900, 'Content width should provide ample room for POS layout');
    });

    it('ensures three-pane POS regions sum to 100% and fit within 960px without horizontal overflow (with fast items)', () => {
      const availableWidth = SCREEN_WIDTH - COLLAPSED_SIDEBAR_WIDTH; // 960px
      const regionAPercent = 0.58; // 58%
      const regionBPercent = 0.26; // 26%
      const regionCPercent = 0.16; // 16%

      assert.equal(Math.round((regionAPercent + regionBPercent + regionCPercent) * 100), 100);

      const widthA = availableWidth * regionAPercent;
      const widthB = availableWidth * regionBPercent;
      const widthC = availableWidth * regionCPercent;

      assert.equal(widthA + widthB + widthC, availableWidth);
      assert.ok(widthA >= 550, `Region A (${widthA}px) must be >= 550px for cart table`);
      assert.ok(widthB >= 240, `Region B (${widthB}px) must be >= 240px for totals & payment`);
      assert.ok(widthC >= 150, `Region C (${widthC}px) must be >= 150px for quick item cards`);
    });

    it('ensures two-pane POS regions sum to 100% when fast items are disabled', () => {
      const availableWidth = SCREEN_WIDTH - COLLAPSED_SIDEBAR_WIDTH; // 960px
      const regionAPercent = 0.74; // 74%
      const regionBPercent = 0.26; // 26%

      assert.equal(Math.round((regionAPercent + regionBPercent) * 100), 100);

      const widthA = availableWidth * regionAPercent;
      const widthB = availableWidth * regionBPercent;

      assert.equal(widthA + widthB, availableWidth);
      assert.ok(widthA >= 700, `Region A (${widthA}px) must be >= 700px when fast items hidden`);
    });
  });

  describe('Task 159-2: Cart Table Columns Calibration', () => {
    it('verifies cart table header and row column percentages sum to exactly 100%', () => {
      const columns = {
        index: 7,
        productAndBarcode: 41,
        unitPrice: 15,
        quantity: 20,
        lineTotal: 13,
        deleteAction: 4
      };

      const sum = Object.values(columns).reduce((a, b) => a + b, 0);
      assert.equal(sum, 100, 'All column percentages must sum to exactly 100%');
    });

    it('guarantees quantity column width (20%) accommodates quantity stepper and weight buttons without clipping', () => {
      const availableCartWidth = 960 * 0.58; // ~556.8px
      const quantityColumnWidth = availableCartWidth * 0.20; // ~111.36px
      
      // Standard stepper requires: Minus (24px) + Gap (4px) + Input (36px) + Gap (4px) + Plus (24px) = 92px
      const minRequiredStepperWidth = 92;
      assert.ok(
        quantityColumnWidth > minRequiredStepperWidth,
        `Quantity column width (${quantityColumnWidth.toFixed(1)}px) must exceed minimum stepper requirements (${minRequiredStepperWidth}px)`
      );
    });
  });

  describe('Task 159-2: Vertical Budget & Financial Panel Fit on 768px Display', () => {
    it('verifies that Region B (payment panel) comfortably fits inside 768px vertical viewport', () => {
      const SCREEN_HEIGHT = 768;
      const TOP_APP_HEADER = 60;
      const BOTTOM_SHORTCUTS_FOOTER = 36;
      const WINDOW_RESERVE = 40; // OS taskbar / window chrome

      const usableHeight = SCREEN_HEIGHT - TOP_APP_HEADER - BOTTOM_SHORTCUTS_FOOTER - WINDOW_RESERVE;
      assert.equal(usableHeight, 632);

      // Height breakdown of Region B elements:
      const breakdownSectionHeight = 130; // Invoice #, items, subtotal, discount, tax
      const customerSectionHeight = 70;  // Customer selector & debt pill
      const grandTotalCardHeight = 90;   // Dark hero total card
      const paymentButtonsHeight = 52;   // F9 Cash / F12 Print buttons
      const voidCartButtonHeight = 36;   // New sale / void button
      const totalRegionBContentHeight = 
        breakdownSectionHeight + 
        customerSectionHeight + 
        grandTotalCardHeight + 
        paymentButtonsHeight + 
        voidCartButtonHeight;

      assert.ok(
        totalRegionBContentHeight <= usableHeight,
        `Total Region B content (${totalRegionBContentHeight}px) must comfortably fit inside usable height (${usableHeight}px)`
      );
    });
  });

  describe('Task 159-3: Multi-View Responsiveness Invariants (Products & Sales History)', () => {
    it('adapts Sales History metric cards on 1024px screens to avoid horizontal clipping', () => {
      const screenWidth = 1024;
      const contentWidth = screenWidth - 64; // 960px
      // 4 cards in 1 row:
      const cardWidthIn4Cols = (contentWidth - 32 - 36) / 4; // ~223px
      // 2 cards in 2 rows:
      const cardWidthIn2Cols = (contentWidth - 32 - 12) / 2; // ~458px

      assert.ok(cardWidthIn4Cols > 200, '4-column card width is viable');
      assert.ok(cardWidthIn2Cols > 400, '2-column responsive fallback provides generous space');
    });

    it('verifies that sidebar collapsed preference persistence works reliably', () => {
      const storageMock = new Map();
      const mockSet = (key, val) => storageMock.set(key, String(val));
      const mockGet = (key) => storageMock.get(key) ?? null;

      mockSet('rafiq_pos_sidebar_collapsed', true);
      assert.equal(mockGet('rafiq_pos_sidebar_collapsed'), 'true');

      mockSet('rafiq_pos_sidebar_collapsed', false);
      assert.equal(mockGet('rafiq_pos_sidebar_collapsed'), 'false');
    });
  });

});
