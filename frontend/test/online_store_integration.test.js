import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

describe('Online Store Desktop Integration & Architecture Invariants', () => {
  it('registers feature_online_store with safe default=false in both C# FeatureRegistry and TS featureTypes', () => {
    const csRegistry = read('desktop/Common/FeatureRegistry.cs');
    const tsTypes = read('frontend/src/context/featureTypes.ts');

    assert.ok(csRegistry.includes('"feature_online_store"'), 'C# FeatureRegistry must declare feature_online_store');
    assert.ok(tsTypes.includes("'feature_online_store'") || tsTypes.includes('feature_online_store: false'), 'TS featureTypes must declare feature_online_store');
    assert.ok(tsTypes.includes('feature_online_store: false'), 'feature_online_store must default to false (opt-in)');
  });

  it('registers all 5 online_store.* permissions in both C# SecurityService and TS permissionGroups', () => {
    const csSecurity = read('desktop/Services/SecurityService.cs');
    const tsGroups = read('frontend/src/constants/permissionGroups.ts');

    const keys = [
      'online_store.manage',
      'online_store.view_orders',
      'online_store.process_orders',
      'online_store.sync',
      'online_store.images',
    ];

    for (const key of keys) {
      assert.ok(csSecurity.includes(`"${key}"`), `SecurityService.cs missing ${key}`);
      assert.ok(tsGroups.includes(`'${key}'`), `permissionGroups.ts missing ${key}`);
    }
  });

  it('dispatches and whitelists all onlineStore:* IPC commands in C# IpcDispatcher', () => {
    const dispatcher = read('desktop/Bridge/IpcDispatcher.cs');
    const onlineDispatcher = read('desktop/Bridge/IpcDispatcher.OnlineStore.cs');

    const commands = [
      'onlineStore:getState',
      'onlineStore:saveConfig',
      'onlineStore:triggerSync',
      'onlineStore:getCatalogStats',
      'onlineStore:getCategoryProducts',
      'onlineStore:getOrders',
      'onlineStore:processOrder',
      'onlineStore:updateProductOnline',
      'onlineStore:setCashierBusy',
    ];

    for (const cmd of commands) {
      assert.ok(dispatcher.includes(`"${cmd}"`), `IpcDispatcher.cs missing permission mapping for ${cmd}`);
      assert.ok(onlineDispatcher.includes(`"${cmd}"`), `IpcDispatcher.OnlineStore.cs missing handler for ${cmd}`);
    }
  });

  it('lazy-loads OnlineStoreView in App.tsx and gates it by feature_online_store and RBAC permissions', () => {
    const app = read('frontend/src/App.tsx');
    assert.ok(app.includes("import('./views/OnlineStoreView')"), 'OnlineStoreView must be lazy-loaded');
    assert.ok(!app.includes("from './views/OnlineStoreView'"), 'OnlineStoreView must never be statically imported');
    assert.ok(app.includes("isEnabled('feature_online_store')"), 'OnlineStore tab must be gated by feature_online_store');
    assert.ok(app.includes("hasPermission('online_store.view_orders')"), 'OnlineStore tab must check online_store.view_orders');
    assert.ok(app.includes('<SidebarGroupPanel open={isOnlineStoreMenuExpanded && !isSidebarCollapsed}>'), 'OnlineStore must use SidebarGroupPanel tree navigation');
    assert.ok(app.includes('activeSubTab={onlineStoreSubTab}'), 'App.tsx must drive OnlineStoreView sub-tabs from sidebar state');
  });

  it('enforces strict design tokens, zero emojis, zero native selects, sidebar-driven sub-tabs, and motion primitive in OnlineStoreView', () => {
    const view = read('frontend/src/views/OnlineStoreView.tsx');
    assert.ok(!/<select[\s>]/i.test(view), 'Must not use native <select>');
    assert.ok(view.includes('CustomSelect'), 'Must use CustomSelect');
    assert.ok(view.includes('ToggleSwitch'), 'Must use ToggleSwitch');
    assert.ok(view.includes('useMotionPanel'), 'Must use useMotionPanel for tab transitions');
    assert.ok(!view.includes('Sub-navigation Tabs'), 'Sub-navigation tabs must live in the sidebar tree, not inside OnlineStoreView');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(view), 'Must not contain ad-hoc hex colors');
    assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(view), 'Must not contain emojis');
  });

  it('preserves C# 5 compatibility and integer financial arithmetic in SyncEngine and Migration v67', () => {
    const migration = read('desktop/Database/MigrationRunner.OnlineStore.cs');
    const syncEngine = read('desktop/Services/SyncEngine.cs');

    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS sync_outbox'), 'Migration v67 must create sync_outbox');
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS sync_inbox'), 'Migration v67 must create sync_inbox');
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS sync_state'), 'Migration v67 must create sync_state');
    assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS product_images'), 'Migration v67 must create product_images');
    assert.ok(migration.includes('BackupDatabaseBeforeMigration'), 'Migration v67 must take a pre-migration backup');
    assert.ok(!/\bnameof\s*\(/.test(syncEngine), 'SyncEngine.cs must stay C# 5 compatible (no nameof)');
    assert.ok(!/\bfloat\b|\bdouble\b/.test(syncEngine), 'SyncEngine.cs must not use float/double');
  });

  it('blocks web dashboard from advancing order status to ready (out for delivery) and enforces POS receipt printing', () => {
    const kanban = read('online-store/web/src/components/admin/KanbanBoardView.tsx');
    const details = read('online-store/web/src/components/admin/OrderDetailsPanel.tsx');
    const dashboardHandler = read('online-store/api/src/handlers/dashboard.ts');
    const adminPage = read('online-store/web/src/pages/AdminDashboardPage.tsx');

    // Kanban accepted column must NOT have nextStatus: 'ready'
    assert.ok(!/id:\s*'accepted'[^}]*nextStatus:\s*'ready'/s.test(kanban), 'Kanban accepted column must not transition to ready');
    assert.ok(kanban.includes('بانتظار فوترة الكاشير'), 'Kanban accepted column must display pending cashier invoice');

    // OrderDetailsPanel must not have button transitioning to ready
    assert.ok(!/onUpdateStatus\s*\(\s*order\.id\s*,\s*['"]ready['"]\s*\)/.test(details), 'OrderDetailsPanel must not have a button to set ready');
    assert.ok(details.includes('تسليم الطلب للدليفري وطباعة البون يتم حصراً من شاشة الكاشير في رفيق POS'), 'OrderDetailsPanel must explain POS exclusive ready handover');

    // DashboardPage client guard
    assert.ok(adminPage.includes("newStatus === 'ready'"), 'AdminDashboardPage must guard against ready transition');

    // Backend Cloudflare API guard
    assert.ok(dashboardHandler.includes("body.status === 'ready'"), 'API dashboard.ts must block body.status === ready');
  });

  it('provides selective catalog upload modal with scope, category picker, stock filters, and safe pruning', () => {
    const modal = read('frontend/src/components/onlineStore/UploadCatalogModal.tsx');
    const view = read('frontend/src/views/OnlineStoreView.tsx');
    const syncEngine = read('desktop/Services/SyncEngine.cs');
    const productRepo = read('desktop/Repositories/ProductRepository.OnlineStore.cs');

    // Modal invariants
    assert.ok(!/<select[\s>]/i.test(modal), 'UploadCatalogModal must not use native <select>');
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(modal), 'UploadCatalogModal must not contain ad-hoc hex colors');
    assert.ok(modal.includes('UploadCloud'), 'UploadCatalogModal must use Lucide UploadCloud');
    assert.ok(modal.includes('ToggleSwitch'), 'UploadCatalogModal must use ToggleSwitch');
    assert.ok(modal.includes('getCatalogSyncStats'), 'UploadCatalogModal must call getCatalogSyncStats for live count preview');
    assert.ok(modal.includes('selectedCategoryIds'), 'UploadCatalogModal must support category selection');

    // OnlineStoreView integration
    assert.ok(view.includes('UploadCatalogModal'), 'OnlineStoreView must integrate UploadCatalogModal');
    assert.ok(view.includes('isUploadModalOpen'), 'OnlineStoreView must track isUploadModalOpen state');
    assert.ok(view.includes('handleCustomCatalogUpload'), 'OnlineStoreView must handle custom upload');

    // C# backend safety: selective upload must NOT prune unselected categories from cloud
    assert.ok(
      syncEngine.includes('canPrune = pruneOutOfStock && (categoryIds == null || categoryIds.Count == 0)'),
      'SyncEngine must only prune when performing full catalog push without category filter'
    );
    assert.ok(
      productRepo.includes('CountProductsForCloudSync'),
      'ProductRepository must define CountProductsForCloudSync'
    );
  });
});
