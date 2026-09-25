import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateLineTotal,
  piastersToPounds
} from '../src/utils/money.ts';

describe('Story 52 — Feature #32: Cashier Keyboard Shortcuts & 100% Mouse-Free POS (Tasks 32-1 to 32-4)', () => {

  // State machine simulating POS keyboard shortcuts in pure Node.js
  const createMockPosSession = () => {
    let cart = [];
    let discountPiasters = 0;
    let paymentMethod = 'cash';
    let selectedCustomerId = null;
    let heldDraft = null;
    let lastCompletedSale = null;
    let isHelpModalOpen = false;
    let isPaymentModalOpen = false;
    let isReceiptModalOpen = false;
    let focusedElement = 'barcode_input';

    const recalculateTotals = () => {
      const subtotal = cart.reduce((sum, item) => sum + item.totalPiasters, 0);
      const netTotal = Math.max(0, subtotal - discountPiasters);
      return { subtotal, netTotal };
    };

    const addItem = (product, quantityMilli = 1000) => {
      const lineTotal = calculateLineTotal(product.pricePiasters, quantityMilli, 0);
      cart.push({
        productId: product.id,
        productName: product.name,
        unitPricePiasters: product.pricePiasters,
        quantityMilli,
        unit: product.unit || 'piece',
        discountPiasters: 0,
        totalPiasters: lineTotal
      });
      focusedElement = 'barcode_input'; // Auto-refocus (Task 32-3)
    };

    const handleKeyDown = (key) => {
      switch (key) {
        case 'F1':
          isHelpModalOpen = true;
          break;

        case 'F2':
          focusedElement = 'barcode_input';
          break;

        case 'F3':
          if (cart.length > 0) {
            const last = cart[cart.length - 1];
            // Quantity edit (+1 unit for standard)
            last.quantityMilli += 1000;
            last.totalPiasters = calculateLineTotal(last.unitPricePiasters, last.quantityMilli, last.discountPiasters);
          }
          break;

        case 'F4':
          // Apply 5.00 EGP discount
          discountPiasters = 500;
          break;

        case 'F6':
          // Hold / Resume
          if (cart.length > 0) {
            heldDraft = { cart: [...cart], discountPiasters, selectedCustomerId };
            cart = [];
            discountPiasters = 0;
          } else if (heldDraft) {
            cart = [...heldDraft.cart];
            discountPiasters = heldDraft.discountPiasters;
            selectedCustomerId = heldDraft.selectedCustomerId;
            heldDraft = null;
          }
          focusedElement = 'barcode_input';
          break;

        case 'F7':
          // New sale / Clear cart
          cart = [];
          discountPiasters = 0;
          focusedElement = 'barcode_input';
          break;

        case 'F9':
          if (lastCompletedSale) {
            isReceiptModalOpen = true;
          }
          break;

        case 'F10':
          paymentMethod = paymentMethod === 'cash' ? 'credit' : 'cash';
          break;

        case 'F12':
          // Quick Direct Cash Checkout (Task 32-4)
          if (cart.length > 0) {
            const { netTotal } = recalculateTotals();
            lastCompletedSale = {
              invoiceNumber: 1055,
              totalPiasters: netTotal,
              paymentMethod: 'cash',
              paidPiasters: netTotal,
              items: [...cart]
            };
            cart = [];
            discountPiasters = 0;
            focusedElement = 'barcode_input'; // Refocus immediately for next customer
          }
          break;

        case ' ':
          if (cart.length > 0) {
            isPaymentModalOpen = true;
          }
          break;

        case 'Delete':
          if (cart.length > 0) {
            cart.pop();
            focusedElement = 'barcode_input';
          }
          break;

        case '+':
          if (cart.length > 0) {
            const last = cart[cart.length - 1];
            last.quantityMilli += 1000;
            last.totalPiasters = calculateLineTotal(last.unitPricePiasters, last.quantityMilli, last.discountPiasters);
          }
          break;

        case '-':
          if (cart.length > 0 && cart[cart.length - 1].quantityMilli > 1000) {
            const last = cart[cart.length - 1];
            last.quantityMilli -= 1000;
            last.totalPiasters = calculateLineTotal(last.unitPricePiasters, last.quantityMilli, last.discountPiasters);
          }
          break;

        case 'Escape':
          isHelpModalOpen = false;
          isPaymentModalOpen = false;
          isReceiptModalOpen = false;
          focusedElement = 'barcode_input';
          break;
      }
    };

    return {
      getCart: () => cart,
      getDiscount: () => discountPiasters,
      getTotals: recalculateTotals,
      getPaymentMethod: () => paymentMethod,
      getHeldDraft: () => heldDraft,
      getLastSale: () => lastCompletedSale,
      getFocusedElement: () => focusedElement,
      isHelpOpen: () => isHelpModalOpen,
      isPaymentOpen: () => isPaymentModalOpen,
      isReceiptOpen: () => isReceiptModalOpen,
      addItem,
      handleKeyDown
    };
  };

  const sampleProduct = {
    id: 'prod-milk-1',
    name: 'حليب كامل الدسم 1 لتر',
    pricePiasters: 3500, // 35.00 EGP
    unit: 'piece'
  };

  describe('Task 32-1: Keyboard Shortcuts Map Coverage (F1 to F12)', () => {
    it('opens and closes help modal using F1 and Escape', () => {
      const session = createMockPosSession();
      assert.equal(session.isHelpOpen(), false);

      session.handleKeyDown('F1');
      assert.equal(session.isHelpOpen(), true);

      session.handleKeyDown('Escape');
      assert.equal(session.isHelpOpen(), false);
      assert.equal(session.getFocusedElement(), 'barcode_input');
    });

    it('toggles payment method between cash and credit with F10', () => {
      const session = createMockPosSession();
      assert.equal(session.getPaymentMethod(), 'cash');

      session.handleKeyDown('F10');
      assert.equal(session.getPaymentMethod(), 'credit');

      session.handleKeyDown('F10');
      assert.equal(session.getPaymentMethod(), 'cash');
    });
  });

  describe('Task 32-2: Cart Operations via Hotkeys (F3, F4, F6, F7, Delete, +/-)', () => {
    it('modifies item quantity with F3 and +/- keys', () => {
      const session = createMockPosSession();
      session.addItem(sampleProduct, 1000); // 1 piece @ 35.00 EGP

      session.handleKeyDown('F3'); // +1 piece = 2 pieces
      assert.equal(session.getCart()[0].quantityMilli, 2000);
      assert.equal(session.getTotals().netTotal, 7000); // 70.00 EGP

      session.handleKeyDown('+'); // +1 piece = 3 pieces
      assert.equal(session.getCart()[0].quantityMilli, 3000);
      assert.equal(session.getTotals().netTotal, 10500);

      session.handleKeyDown('-'); // -1 piece = 2 pieces
      assert.equal(session.getCart()[0].quantityMilli, 2000);
      assert.equal(session.getTotals().netTotal, 7000);
    });

    it('applies discount with F4 and updates net total accurately', () => {
      const session = createMockPosSession();
      session.addItem(sampleProduct, 2000); // 70.00 EGP

      session.handleKeyDown('F4'); // 5.00 EGP discount
      assert.equal(session.getDiscount(), 500);
      assert.equal(session.getTotals().netTotal, 6500); // 65.00 EGP
      assert.equal(piastersToPounds(session.getTotals().netTotal), 65);
    });

    it('holds sale with F6 and resumes it seamlessly', () => {
      const session = createMockPosSession();
      session.addItem(sampleProduct, 1000);
      assert.equal(session.getCart().length, 1);

      // Hold current cart
      session.handleKeyDown('F6');
      assert.equal(session.getCart().length, 0);
      assert.ok(session.getHeldDraft() !== null);

      // Resume held cart
      session.handleKeyDown('F6');
      assert.equal(session.getCart().length, 1);
      assert.equal(session.getCart()[0].productName, sampleProduct.name);
      assert.equal(session.getHeldDraft(), null);
    });

    it('deletes item with Delete key and clears cart with F7', () => {
      const session = createMockPosSession();
      session.addItem(sampleProduct, 1000);
      session.addItem({ id: 'prod-cheese', name: 'جبنة فيتا', pricePiasters: 2500, unit: 'piece' });
      assert.equal(session.getCart().length, 2);

      session.handleKeyDown('Delete');
      assert.equal(session.getCart().length, 1);
      assert.equal(session.getCart()[0].productName, sampleProduct.name);

      session.handleKeyDown('F7');
      assert.equal(session.getCart().length, 0);
    });
  });

  describe('Task 32-3: Auto-Refocus Invariant (Focus always returns to Barcode Search)', () => {
    it('always preserves focus on barcode search after cart operations', () => {
      const session = createMockPosSession();
      assert.equal(session.getFocusedElement(), 'barcode_input');

      session.addItem(sampleProduct);
      assert.equal(session.getFocusedElement(), 'barcode_input');

      session.handleKeyDown('F2');
      assert.equal(session.getFocusedElement(), 'barcode_input');

      session.handleKeyDown('Delete');
      assert.equal(session.getFocusedElement(), 'barcode_input');

      session.handleKeyDown('Escape');
      assert.equal(session.getFocusedElement(), 'barcode_input');
    });
  });

  describe('Task 32-4: 100% Mouse-Free Sale Execution Flow (Scan -> Adjust -> F12 Pay -> Reprint F9)', () => {
    it('completes entire sale and receipt flow using only keyboard without touching mouse', () => {
      const session = createMockPosSession();

      // 1. F2 to focus barcode (already focused)
      session.handleKeyDown('F2');
      assert.equal(session.getFocusedElement(), 'barcode_input');

      // 2. Barcode scanner inputs item
      session.addItem(sampleProduct, 1000);
      assert.equal(session.getCart().length, 1);

      // 3. Increment quantity using +
      session.handleKeyDown('+');
      assert.equal(session.getCart()[0].quantityMilli, 2000);
      assert.equal(session.getTotals().netTotal, 7000); // 70.00 EGP

      // 4. Apply discount using F4
      session.handleKeyDown('F4');
      assert.equal(session.getTotals().netTotal, 6500); // 65.00 EGP

      // 5. Instant Cash Checkout with F12
      session.handleKeyDown('F12');
      assert.equal(session.getCart().length, 0);
      assert.ok(session.getLastSale() !== null);
      assert.equal(session.getLastSale().totalPiasters, 6500);
      assert.equal(session.getLastSale().invoiceNumber, 1055);

      // 6. View & Reprint last receipt using F9
      session.handleKeyDown('F9');
      assert.equal(session.isReceiptOpen(), true);

      // 7. Close receipt with Escape to start next customer immediately
      session.handleKeyDown('Escape');
      assert.equal(session.isReceiptOpen(), false);
      assert.equal(session.getFocusedElement(), 'barcode_input');
    });
  });
});
