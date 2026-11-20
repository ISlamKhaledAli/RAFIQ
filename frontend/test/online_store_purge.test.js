import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');

test('Online Store Purge & Zeroing Integration', async (t) => {
  await t.test('1. DatabaseService wipes sync tables and triggers cloud purge in FactoryReset and TrialDataPurge', () => {
    const dbServicePath = path.join(root, 'desktop', 'Services', 'DatabaseService.cs');
    const content = fs.readFileSync(dbServicePath, 'utf8');

    // FactoryReset checks
    assert.ok(content.includes('"sync_inbox", "sync_outbox", "product_images"'), 'FactoryReset must include sync tables in delete order');
    assert.ok(content.includes("DELETE FROM sync_state WHERE key = 'last_sync_timestamp';"), 'Must clear last_sync_timestamp in FactoryReset');
    assert.ok(content.includes('Sync.PurgeAllOrders()'), 'FactoryReset must trigger PurgeAllOrders');
    assert.ok(content.includes('Sync.PurgeCloudCatalog()'), 'FactoryReset must trigger PurgeCloudCatalog');

    // TrialDataPurge checks
    assert.ok(content.includes('"sync_inbox"') && content.includes('"sync_outbox"'), 'TrialDataPurge must include sync_inbox and sync_outbox');
  });

  await t.test('2. Products:clearAll triggers Sync.PurgeCloudCatalog()', () => {
    const productsIpcPath = path.join(root, 'desktop', 'Bridge', 'IpcDispatcher.Products.cs');
    const content = fs.readFileSync(productsIpcPath, 'utf8');

    assert.ok(content.includes('case "products:clearAll":'), 'Must have products:clearAll');
    assert.ok(content.includes('DatabaseService.Sync.PurgeCloudCatalog()'), 'Must call PurgeCloudCatalog on clear all products');
  });

  await t.test('3. IpcDispatcher registers onlineStore:purgeOrders and onlineStore:purgeCatalog with write lock & permissions', () => {
    const dispatcherPath = path.join(root, 'desktop', 'Bridge', 'IpcDispatcher.cs');
    const content = fs.readFileSync(dispatcherPath, 'utf8');

    assert.ok(content.includes('request.Action == "onlineStore:purgeOrders"'), 'Must be in isExclusive write lock list');
    assert.ok(content.includes('request.Action == "onlineStore:purgeCatalog"'), 'Must be in isExclusive write lock list');
    assert.ok(content.includes('{ "onlineStore:purgeOrders", "online_store.manage" }'), 'Must map purgeOrders permission to online_store.manage');
    assert.ok(content.includes('{ "onlineStore:purgeCatalog", "online_store.manage" }'), 'Must map purgeCatalog permission to online_store.manage');

    const onlineStoreIpcCs = path.join(root, 'desktop', 'Bridge', 'IpcDispatcher.OnlineStore.cs');
    const osContent = fs.readFileSync(onlineStoreIpcCs, 'utf8');
    assert.ok(osContent.includes('action == "onlineStore:purgeOrders"'), 'Must handle purgeOrders action');
    assert.ok(osContent.includes('action == "onlineStore:purgeCatalog"'), 'Must handle purgeCatalog action');
    assert.ok(osContent.includes('DatabaseService.Sync.PurgeAllOrders()'), 'Must invoke PurgeAllOrders');
    assert.ok(osContent.includes('DatabaseService.Sync.PurgeCloudCatalog()'), 'Must invoke PurgeCloudCatalog');
  });

  await t.test('4. Frontend IPC bridge exports purgeOnlineStoreOrders and purgeOnlineStoreCatalog', () => {
    const bridgePath = path.join(root, 'frontend', 'src', 'bridge', 'onlineStoreIpc.ts');
    const content = fs.readFileSync(bridgePath, 'utf8');

    assert.ok(content.includes('export function purgeOnlineStoreOrders'), 'Must export purgeOnlineStoreOrders');
    assert.ok(content.includes('onlineStore:purgeOrders'), 'Must invoke onlineStore:purgeOrders');
    assert.ok(content.includes('export function purgeOnlineStoreCatalog'), 'Must export purgeOnlineStoreCatalog');
    assert.ok(content.includes('onlineStore:purgeCatalog'), 'Must invoke onlineStore:purgeCatalog');
  });

  await t.test('5. OnlineOrdersDispatch has onPurgeOrders button with Trash2 icon', () => {
    const dispatchPath = path.join(root, 'frontend', 'src', 'components', 'onlineStore', 'OnlineOrdersDispatch.tsx');
    const content = fs.readFileSync(dispatchPath, 'utf8');

    assert.ok(content.includes('Trash2'), 'Must import and use Trash2 icon');
    assert.ok(content.includes('onPurgeOrders'), 'Must accept onPurgeOrders prop');
    assert.ok(content.includes('تصفير الطلبات'), 'Must have button with Arabic text "تصفير الطلبات"');
    assert.ok(content.includes('canManage && onPurgeOrders'), 'Button must be guarded by canManage permission');
  });

  await t.test('6. OnlineStoreView has ConfirmModal for purging orders with clear warning', () => {
    const viewPath = path.join(root, 'frontend', 'src', 'views', 'OnlineStoreView.tsx');
    const content = fs.readFileSync(viewPath, 'utf8');

    assert.ok(content.includes('ConfirmModal'), 'Must import ConfirmModal');
    assert.ok(content.includes('purgeOnlineStoreOrders'), 'Must import purgeOnlineStoreOrders');
    assert.ok(content.includes('showPurgeOrdersConfirm'), 'Must have showPurgeOrdersConfirm state');
    assert.ok(content.includes('تصفير ومسح طلبات المتجر الإلكتروني'), 'Must have confirmation title');
    assert.ok(content.includes('onPurgeOrders={() => setShowPurgeOrdersConfirm(true)}'), 'Must pass trigger to OnlineOrdersDispatch');
  });

  await t.test('7. Cloud API endpoints exist in sync.ts', () => {
    const cloudSyncPath = path.join(root, 'online-store', 'api', 'src', 'handlers', 'sync.ts');
    const content = fs.readFileSync(cloudSyncPath, 'utf8');

    assert.ok(content.includes('handlePurgeStoreOrders'), 'Must export handlePurgeStoreOrders');
    assert.ok(content.includes('handlePurgeCatalog'), 'Must export handlePurgeCatalog');
    assert.ok(/DELETE\s+FROM\s+orders\s+WHERE\s+store_id\s*=\s*\?/i.test(content), 'Must delete orders for the store');
    assert.ok(/DELETE\s+FROM\s+products\s+WHERE\s+store_id\s*=\s*\?/i.test(content), 'Must delete products for the store');
  });
});
