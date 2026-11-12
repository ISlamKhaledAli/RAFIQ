import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND_DIR = fileURLToPath(new URL('../', import.meta.url));
function read(rel) {
  return fs.readFileSync(path.resolve(FRONTEND_DIR, rel), 'utf8');
}

describe('Low Stock & Purchase Order Suggestion Optimization', () => {
  it('InventoryAnalyticsView does not fetch low stock on initial load', () => {
    const inv = read('src/views/analytics/InventoryAnalyticsView.tsx');
    // Ensure reports:getLowStock is not in the initial Promise.all in loadData
    assert.doesNotMatch(inv, /invoke<InventoryOverviewReport>[\s\S]*?invoke<LowStockReportItem\[\]>\('reports:getLowStock'\)[\s\S]*?invoke<BatchSummary>/);
  });

  it('InventoryAnalyticsView implements lazy loading, search, filter and pagination for low stock', () => {
    const inv = read('src/views/analytics/InventoryAnalyticsView.tsx');
    assert.match(inv, /loadLowStockData/);
    assert.match(inv, /LOW_STOCK_PAGE_SIZE\s*=\s*50/);
    assert.match(inv, /lowStockSearch/);
    assert.match(inv, /lowStockFilter/);
    assert.match(inv, /lowStockPage/);
    assert.match(inv, /SearchInput/);
    assert.match(inv, /ChevronRight/);
    assert.match(inv, /ChevronLeft/);
    assert.doesNotMatch(inv, /ArrowRight/);
  });

  it('LowStockReportModal implements client pagination to prevent DOM freezing', () => {
    const modal = read('src/components/LowStockReportModal.tsx');
    assert.match(modal, /PAGE_SIZE\s*=\s*50/);
    assert.match(modal, /currentPage/);
    assert.match(modal, /paginatedItems/);
    assert.match(modal, /displayItems/);
  });

  it('IPC bridge supports paged request and returns LowStockReportResponse shape', async () => {
    const ipcSource = read('src/bridge/ipc.ts');
    assert.match(ipcSource, /case 'reports:getLowStock':/);
    assert.match(ipcSource, /totalSuggestedBudgetPiasters/);
    assert.match(ipcSource, /zeroStockCount/);
    assert.match(ipcSource, /lowStockCount/);
  });

  it('Enforces zero emojis and strict design tokens in the modified views', () => {
    const inv = read('src/views/analytics/InventoryAnalyticsView.tsx');
    const modal = read('src/components/LowStockReportModal.tsx');
    const combined = inv + modal;

    // Check for emojis
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    assert.doesNotMatch(combined, emojiRegex, 'No emojis allowed in POS system');

    // No raw unapproved colors
    assert.doesNotMatch(combined, /#(?:[0-9a-fA-F]{3}){1,2}\b/);
  });
});

