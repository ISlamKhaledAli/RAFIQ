import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source-level wiring checks for the unsaved-changes guard (no browser): every user-initiated way out of a page
// goes through requestLeave, the forced exits never do, and each page registers a real dirty flag.
const SRC = path.resolve('src');
const read = (...parts) => fs.readFileSync(path.join(SRC, ...parts), 'utf8').replace(/\r\n/g, '\n');
const slice = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `missing marker: ${from}`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end > start, `missing end marker: ${to}`);
  return src.slice(start, end);
};

const app = read('App.tsx');

describe('App routes every user-initiated move through the guard', () => {
  it('has one wrapper per kind of move, built on requestLeave', () => {
    assert.ok(app.includes("import { useLeaveGuard } from './context/useUnsavedChanges';"));
    const nav = slice(app, 'const navigateTo = useCallback', 'const switchWithinPage');
    assert.ok(nav.includes('requestLeave(() => {') && nav.includes('setActiveTab(tab);') && nav.includes('afterSwitch?.()'));
    assert.ok(nav.includes('withinPage: tab === effectiveActiveTab'), 'a move inside the open page is a within-page move');
    const within = slice(app, 'const switchWithinPage', '[requestLeave]);');
    assert.ok(within.includes('requestLeave(apply, { withinPage: true })'));
  });

  it('the plain tab setter is only used by the wrapper and by programmatic moves', () => {
    const uses = [...app.matchAll(/setActiveTab\(/g)].map((m) => ({ at: m.index, before: app.slice(Math.max(0, m.index - 240), m.index), after: app.slice(m.index, m.index + 200) }));
    const allowed = [
      (u) => u.before.includes('requestLeave(() => {') && u.after.startsWith('setActiveTab(tab)'), // the wrapper itself
      (u) => u.after.includes("setActiveTab('pos')") && u.before.includes('!navItems.some'), // access lost: forced
      (u) => u.after.startsWith("setActiveTab('pos')") && u.before.includes('setIsFirstRunWizardOpen(false)'), // wizard finished (reloads)
      (u) => u.after.startsWith("setActiveTab('pos')") && u.before.includes('setHasDemoData(true)'), // demo data loaded (reloads)
      (u) => u.after.startsWith("setActiveTab('dashboard')") && u.before.includes('setIsLicenseReadOnlyMode(true)'), // licence lock: forced
    ];
    for (const u of uses) {
      assert.ok(allowed.some((ok) => ok(u)), `unguarded setActiveTab near: ${u.before.slice(-120)}${u.after.slice(0, 40)}`);
    }
    assert.ok(uses.length <= 6, 'new unguarded call sites need a reason in this list');
  });

  it('sidebar main items, collapsed rail and every sub-item go through navigateTo', () => {
    assert.ok(app.includes('navigateTo(tabId, subAction);'), 'handleNavClick (main items, expanded and collapsed)');
    for (const call of [
      "navigateTo('epay', () => setEpaySubTab(sub.id))",
      "navigateTo('wallets', () => setWalletsSubTab(sub.id))",
      "navigateTo('insurance', () => setInsuranceSubTab(sub.id))",
      "navigateTo('dashboard', () => setDashboardSubTab(sub.id))",
      "navigateTo('products', () => setProductsSubView('catalog'))",
      "navigateTo('products', () => setProductsSubView('movements'))",
      "navigateTo('products', () => setProductsSubView('batches'))",
      "navigateTo('purchases', () => setPurchasesSubView('new_invoice'))",
      "navigateTo('purchases', () => setPurchasesSubView('shortages'))",
      "navigateTo('purchases', () => setPurchasesSubView('invoices'))",
      "navigateTo('purchases', () => setPurchasesSubView('suppliers'))",
      "navigateTo('root', () => setRootSubTab(sub.id))",
      "navigateTo('settings', () => setSettingsSubTab(sub.id))",
    ]) {
      assert.ok(app.includes(call), `sidebar sub-item: ${call}`);
    }
    const rawClicks = [...app.matchAll(/onClick=\{[^}]*\bset(?:ActiveTab|\w+SubTab|\w+SubView)\(/g)].filter((m) => !/handleNavClick\(|navigateTo\(/.test(m[0]));
    assert.deepEqual(rawClicks.map((m) => m[0]), [], 'no click handler calls a raw tab setter');
  });

  it('in-page sub-tab callbacks and cross-page callbacks handed to the views are guarded', () => {
    for (const call of [
      'onSubTabChange={(tab) => switchWithinPage(() => setEpaySubTab(tab))}',
      'onSubTabChange={(tab) => switchWithinPage(() => setWalletsSubTab(tab))}',
      'onSubTabChange={(tab) => switchWithinPage(() => setInsuranceSubTab(tab))}',
      'onSubTabChange={(tab) => switchWithinPage(() => setSettingsSubTab(tab))}',
      'onSubViewChange={(tab) => switchWithinPage(() => setProductsSubView(tab))}',
      'onSubViewChange={(tab) => switchWithinPage(() => setPurchasesSubView(tab))}',
      'onNavigateSubTab={(sub) => switchWithinPage(() => setDashboardSubTab(sub))}',
      "onNavigateToPos={() => navigateTo('pos')}",
      "onNavigateToCustomers={() => navigateTo('customers')}",
      "onNavigateToSales={() => navigateTo('sales')}",
      'onNavigateToProducts={openProductsWithFilter}',
      'onNavigateToTab={(tab) => navigateTo(tab as TabType)}',
      "onNavigateToEpay={() => navigateTo('epay'",
      "onNavigateToWallets={(subTab = 'accounts') => navigateTo('wallets'",
    ]) {
      assert.ok(app.includes(call), call);
    }
    const open = slice(app, 'const openProductsWithFilter', 'const allSystemNotifications');
    assert.ok(open.includes("navigateTo('products'") && !open.includes('setActiveTab'), 'dashboard to products callbacks');
    const notifications = slice(app, 'onOpenBackupSettings:', 'onOpenDemoManagement');
    assert.ok(notifications.includes("navigateTo('settings'"));
    assert.ok(!/onSubTabChange=\{\(tab\) => set|onSubViewChange=\{\(tab\) => set|onNavigateSubTab=\{\(sub\) => set/.test(app));
  });

  it('Alt+1..9 and F1-to-cashier are guarded', () => {
    const alt = slice(app, '// 1. Alt + Number shortcuts', '// 2. F11 toggles');
    assert.ok(!alt.includes('setActiveTab'));
    assert.equal(alt.match(/navigateTo\('/g).length, 9, 'one guarded move per Alt+digit');
    const f1 = slice(app, '// 3. If NOT on POS view', '// 4. Ctrl+R');
    assert.ok(f1.includes("navigateTo('pos')") && !f1.includes('setActiveTab'));
    assert.ok(/\}, \[[^\]]*\bnavigateTo\b[^\]]*\]\);\n\n  const confirmAndExitApp/.test(app), 'the shortcut effect re-binds with the guarded navigateTo');
  });

  it('logout, switching user and closing the program ask first (the exit confirmation still follows)', () => {
    assert.ok(/const handleExitApp = \(\) => \{\n\s*requestLeave\(\(\) => void confirmAndExitApp\(\)\);/.test(app));
    const exit = slice(app, 'const confirmAndExitApp', 'const handleExitApp');
    assert.ok(exit.includes('rafiqConfirm') && exit.includes("invoke('window:close')"));
    assert.ok(/const handleLogoutClick = \(\) => \{\n\s*requestLeave\(\(\) => void confirmAndLogout\(\)\);/.test(app));
    assert.ok(app.includes("onSelect: handleLogoutClick"));
    const logout = slice(app, 'const confirmAndLogout', 'const handleLogoutClick');
    assert.ok(logout.includes('rafiqConfirm') && logout.includes('await logout()'));
  });

  it('the post-setup navigation goes through the guard', () => {
    const post = slice(app, 'onNavigateToSettings={(subTab) =>', 'window.location.reload();');
    assert.ok(post.includes('requestLeave(() => {'));
  });

  it('automatic and forced exits are never blocked', () => {
    const idle = slice(app, '// Track user idle timeout', 'const handleToggleFullscreen');
    assert.ok(idle.includes('void logoutRef.current();'));
    assert.ok(!/requestLeave|navigateTo|switchWithinPage/.test(idle), 'idle auto-logout is not guarded');
    const refresh = slice(app, 'const handleUniversalRefresh', '// Global keyboard shortcuts');
    assert.ok(!/requestLeave|navigateTo/.test(refresh), 'in-page refresh only reloads data');
    const lock = slice(app, 'onEnterReadOnlyMode={() => {', 'onLicenseUpdated');
    assert.ok(!/requestLeave|navigateTo/.test(lock), 'licence lock moves are forced');
    const access = slice(app, '!navItems.some', '[navItems, activeTab]');
    assert.ok(!/requestLeave|navigateTo/.test(access), 'losing access moves are forced');
    assert.ok(app.includes('onClick={() => void logout()}'), 'the forced PIN screen (no page mounted) keeps its plain logout');
  });

  it('help, shortcuts and other modals open over the page and are not guarded', () => {
    assert.ok(app.includes("onSelect: () => setIsShortcutsModalOpen(true)"));
    assert.ok(app.includes("onSelect: () => openHelpCenterModal()"));
    assert.ok(app.includes("onSelect: () => setIsUserManagerOpen(true)"));
  });

  it('no beforeunload handler: it would not fire on window close in the WebView2 host and would add native prompts to the app reloads', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    for (const file of walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f))) {
      assert.ok(!fs.readFileSync(file, 'utf8').includes('beforeunload'), `${path.relative(SRC, file)} must not add beforeunload`);
    }
  });

  it('the provider wraps the app below the auth provider', () => {
    const main = read('main.tsx');
    assert.ok(main.includes('<UnsavedChangesProvider>') && main.indexOf('<AuthProvider>') < main.indexOf('<UnsavedChangesProvider>'));
  });
});

describe('pages register a real dirty flag', () => {
  const settings = read('views', 'SettingsView.tsx');

  it('settings: three forms, each saved through its own handler, drafts survive sub-tab switches', () => {
    for (const [id, dirty, save] of [
      ['settings-profile', 'profileUnsaved', 'handleSave()'],
      ['settings-policies', 'policiesUnsaved', 'handleSavePolicies()'],
      ['settings-printer', 'printerDirty', 'handleSavePrinterSettings()'],
    ]) {
      const block = slice(settings, `id: '${id}'`, '});');
      assert.ok(block.includes(`isDirty: ${dirty}`) && block.includes(`save: () => ${save}`) && block.includes('keepsStateWithinPage: true') && block.includes('isActive,'), id);
      assert.ok(block.includes('discard: onDiscardDrafts'), `${id} resets to the saved values on discard`);
    }
    assert.ok(settings.includes('isActive?: boolean') && app.includes("isActive={effectiveActiveTab === 'settings'}"));
  });

  it('settings: dirty is a comparison with the loaded baseline, never "touched", and quiet until loaded', () => {
    assert.ok(settings.includes('const profileUnsaved = profileBaseline !== null && profileDirty;'));
    assert.ok(settings.includes('const printerUnsaved = printerBaseline !== null && printerSnapshot !== printerBaseline;'));
    assert.ok(settings.includes('const policiesUnsaved = defaultCustomerCreditLimitEgp !== savedCreditLimitEgp;'));
    assert.ok(settings.includes('setPrinterBaseline(printerSnapshot);') && settings.includes('setProfileBaseline(profileSnapshot);'), 'a successful save resets the baselines');
  });

  it('settings: a failed save keeps the page dirty and reports false', () => {
    for (const handler of ['const handleSave =', 'const handleSavePolicies =', 'const handleSavePrinterSettings =']) {
      const body = slice(settings, handler, 'finally {');
      assert.ok(body.includes('return true') || body.includes('return extrasSaved'), `${handler} reports success`);
      assert.ok(/catch[\s\S]*return false/.test(body), `${handler} reports failure`);
    }
    const save = slice(settings, 'const handleSave =', 'const handleSavePolicies');
    assert.ok(save.indexOf('setProfileBaseline(profileSnapshot)') > save.indexOf("invoke('settings:save', payload)"), 'the baseline only moves after the save went through');
  });

  it('settings: the tax number that auto-saves from the policies screen has its own saved value', () => {
    assert.ok(settings.includes('setSavedTaxNumber(settings.tax_number.trim())'));
    assert.ok(settings.includes("setSavedTaxNumber(val.trim())"));
    const snapshot = slice(settings, 'const profileSnapshot', 'const profileDirty');
    assert.ok(!snapshot.includes('taxNumber'), 'the tax number is compared to its own saved value');
  });

  it('settings: the barcode-label and kitchen routing choices live in the page (a sub-tab switch cannot lose them)', () => {
    assert.ok(settings.includes('usePrinterExtras(isEnabled(\'feature_kitchen_printer\'))'));
    const extras = read('views', 'settings', 'usePrinterExtras.ts');
    assert.ok(extras.includes('const dirty = baseline !== null && snapshot !== baseline;'));
    assert.ok(extras.includes('if (ok) setBaseline(savedSnapshot);'));
    const tab = read('views', 'settings', 'PrinterSettingsTab.tsx');
    assert.ok(!tab.includes('useState(\'38x25\')') && tab.includes('} = extras;'));
    assert.ok(tab.includes('onClick={() => void onSavePrinterSettings()}'));
  });

  it('every settings tab hands its save bar to the guard and shows the shared chip', () => {
    const profile = read('views', 'settings', 'StoreProfileTab.tsx');
    const policies = read('views', 'settings', 'SalesPoliciesTab.tsx');
    const printer = read('views', 'settings', 'PrinterSettingsTab.tsx');
    assert.ok(profile.includes('ref={saveBarRef}') && profile.includes('<UnsavedChangesChip dirty='));
    assert.ok(policies.includes('ref={saveBarRef}') && policies.includes('<UnsavedChangesChip dirty='));
    assert.ok(printer.includes('ref={saveBarRef}') && printer.includes('<UnsavedChangesChip dirty='));
    assert.ok(settings.includes('saveBarRef={profileGuard.saveBarRef}') && settings.includes('saveBarRef={policiesGuard.saveBarRef}') && settings.includes('saveBarRef={printerGuard.saveBarRef}'));
  });

  it('settings: discarding restarts the screen from the saved values', () => {
    assert.ok(/export const SettingsView = \(props: SettingsViewProps\) => \{\n\s*const \[draftGeneration, setDraftGeneration\] = useState\(0\);/.test(settings));
    assert.ok(settings.includes('key={draftGeneration}'));
  });

  it('root receipt page: signature draft is guarded, discards by restarting, loses state on sub-tab switch (so it asks there too)', () => {
    const page = read('views', 'root', 'RootReceiptPage.tsx');
    const block = slice(page, "id: 'root-receipt-signature'", '});');
    assert.ok(block.includes('isDirty: dirty') && block.includes('save: () => handleSave()') && block.includes('discard: onDiscard') && block.includes('isActive,'));
    assert.ok(!block.includes('keepsStateWithinPage'), 'the page unmounts on a sub-tab switch, so that move must ask');
    assert.ok(page.includes('const dirty = loaded && snapshot !== baseline;') && page.includes('ref={saveBarRef}') && page.includes('<UnsavedChangesChip dirty='));
    const console_ = read('views', 'root', 'RootConsoleView.tsx');
    assert.ok(console_.includes('key={receiptGeneration}') && console_.includes('isActive={isActive}'));
  });

  it('root features page applies toggles at once (no draft), so it is deliberately not guarded', () => {
    assert.ok(!read('views', 'root', 'RootFeaturesPage.tsx').includes('useUnsavedChangesGuard'));
  });
});

describe('guard UI', () => {
  const dialog = read('components', 'UnsavedChangesDialog.tsx');
  const hook = read('context', 'useUnsavedChanges.ts');
  const css = read('index.css');

  it('dialog: three Arabic actions, save only when possible, stay is focused by default', () => {
    for (const text of ['تغييرات غير محفوظة', 'حفظ ثم المتابعة', 'تجاهل التغييرات والمتابعة', 'البقاء في الصفحة']) {
      assert.ok(dialog.includes(text), text);
    }
    assert.ok(dialog.includes('{canSave && ('));
    assert.ok(dialog.includes('stayRef.current?.focus()') && dialog.includes('ref={stayRef}'));
    assert.ok(dialog.includes('role="alertdialog"') && dialog.includes('aria-modal="true"'));
  });

  it('dialog: Esc stays, Enter has no handler of its own (it only presses the focused "stay" button), Tab is trapped, focus is restored', () => {
    assert.ok(/e\.key === 'Escape'[\s\S]*onStay\(\)/.test(dialog));
    assert.ok(!dialog.includes("'Enter'"), 'Enter must never discard');
    assert.ok(dialog.includes("e.key !== 'Tab'") && dialog.includes('first.focus()') && dialog.includes('last.focus()'));
    assert.ok(dialog.includes('previouslyFocused'));
  });

  it('dialog and chip use theme tokens with dark pairs only: no hex, no palette colours, no emoji, no native select', () => {
    for (const [name, src] of [['dialog', dialog], ['chip', read('components', 'UnsavedChangesChip.tsx')]]) {
      assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), `${name}: hex colour`);
      assert.ok(!/-(slate|gray|emerald|amber|red|green)-\d{2,3}/.test(src), `${name}: palette colour`);
      assert.ok(!/<select/.test(src), `${name}: native select`);
      assert.ok(!/\p{Extended_Pictographic}/u.test(src), `${name}: emoji`);
      assert.ok(src.includes('dark:'), `${name}: dark pair`);
    }
  });

  it('save bar pulse: stylesheet rule with tokens, reduced-motion fallback, restarted by the hook', () => {
    const block = slice(css, 'Ring that draws the eye', 'PRINT MEDIA RULES');
    assert.ok(block.includes('.unsaved-pulse') && block.includes('@media (prefers-reduced-motion: reduce)'));
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'no hex in the pulse CSS');
    assert.ok(block.includes("theme('colors.warn.DEFAULT") && block.includes("theme('colors.warn-bright"), 'light and dark tokens');
    assert.ok(hook.includes("matchMedia('(prefers-reduced-motion: reduce)')") && hook.includes("bar.classList.add(PULSE_CLASS)") && hook.includes('scrollIntoView'));
  });

  it('adopting the guard is one hook call and one ref', () => {
    assert.ok(hook.includes('export function useUnsavedChangesGuard') && hook.includes('saveBarRef'));
    assert.ok(hook.includes('registry.remove(id)'), 'unregisters on unmount so a closed page never blocks');
  });
});

describe('pass 2: money drafts are guarded without bypassing their validation', () => {
  const purchases = read('views', 'PurchasesView.tsx');
  const newTab = read('views', 'purchases', 'NewPurchaseTab.tsx');

  it('purchase invoice draft: every draft field is part of dirty, compared with its empty value', () => {
    const dirty = slice(purchases, 'const purchaseDraftDirty =', ';\n');
    for (const field of ['lineItems.length > 0', "selectedSupplierId !== ''", "supplierInvoiceNumber.trim() !== ''", "purchaseNotes.trim() !== ''", 'discountPiasters !== 0', 'customPaidAmountPiasters !== null', "paymentSource !== 'cash_drawer'", "costingMethod !== 'WEIGHTED_AVERAGE'"]) {
      assert.ok(dirty.includes(field), field);
    }
  });

  it('purchase invoice draft: registered with the guard (kept within the page, hidden page never blocks, save only with lines)', () => {
    const block = slice(purchases, "id: 'purchases-new-invoice'", '});');
    assert.ok(block.includes('isDirty: purchaseDraftDirty') && block.includes('isActive,') && block.includes('keepsStateWithinPage: true'));
    assert.ok(block.includes('save: lineItems.length > 0 ? savePurchaseFromGuard : undefined'));
    assert.ok(block.includes('discard: resetPurchaseDraft'));
    assert.ok(purchases.includes('saveBarRef={purchaseSaveBarRef}') && purchases.includes('dirty={purchaseDraftDirty}'));
  });

  it('purchase save: resolves true only after purchases:create succeeded; every validation path is false', () => {
    const handler = slice(purchases, 'const handleSavePurchase = async (): Promise<boolean> => {', 'const savePurchaseFromGuard');
    assert.ok(!/\n\s*return;/.test(handler), 'no bare return: every early exit reports false');
    assert.ok(handler.indexOf("invoke<Purchase>('purchases:create'") < handler.indexOf('saved = true;'), 'success is only recorded after the server accepted it');
    assert.ok(handler.includes('return saved;'));
    assert.ok(handler.includes('purchaseInFlightRef.current') && handler.includes('purchaseAttemptRef.current.current()'), 'the idempotency key and in-flight lock are unchanged');
  });

  it('dialog save uses the same drawer-cash rule and then the very same handler', () => {
    const fromGuard = slice(purchases, 'const savePurchaseFromGuard', 'const { saveBarRef: purchaseSaveBarRef }');
    assert.ok(fromGuard.includes("invoke<{ availableCashPiasters: number }>('drawer:getBalance')"));
    assert.ok(fromGuard.includes('isCashDrawerBlocked(paymentSource, paidAmountPiasters, liveDrawerCashPiasters)'));
    assert.ok(fromGuard.includes('const saved = await handleSavePurchase();') && fromGuard.includes('return saved;'));
    assert.ok(fromGuard.includes('setConfirmDialog((prev) => ({ ...prev, isOpen: false }))'), 'no label prompt waits on the hidden page');
    assert.ok(newTab.includes('const cashDrawerBlocked = isCashDrawerBlocked(paymentSource, paidAmountPiasters, liveDrawerCashPiasters);'), 'the button and the dialog share one rule');
  });

  it('reset: one empty-invoice function for save, cancel and discard, and it never touches the attempt key', () => {
    const reset = slice(purchases, 'const resetPurchaseDraft = () => {', 'const purchaseDraftDirty');
    assert.ok(!reset.includes('purchaseAttemptRef'));
    for (const setter of ['setLineItems([])', "setSelectedSupplierId('')", "setSupplierInvoiceNumber('')", "setPurchaseNotes('')", 'setDiscountPiasters(0)', 'setCustomPaidAmountPiasters(null)', "setPaymentSource('cash_drawer')", "setCostingMethod('WEIGHTED_AVERAGE')"]) {
      assert.ok(reset.includes(setter), setter);
    }
    const cancel = slice(purchases, 'const handleRequestCancelNewPurchase', 'const totalSupplierDebtsAmount');
    assert.equal(cancel.match(/resetPurchaseDraft\(\)/g).length, 2, 'both cancel paths leave an empty invoice, so the guard stays quiet');
    assert.ok(cancel.includes("title: 'إلغاء الفاتورة'") && cancel.includes('setConfirmDialog'), 'the existing confirm flow is untouched');
  });

  it('the action bar gets the ref and the chip; the payment status area is not touched', () => {
    assert.ok(newTab.includes('<div ref={saveBarRef} className="shrink-0 bg-surface'), 'ref on the sticky action bar');
    assert.ok(newTab.includes('<UnsavedChangesChip dirty={dirty} />'), 'chip stays mounted and only toggles visibility');
    assert.ok(newTab.includes('onClick={handleSaveClick}') && newTab.includes('disabled={isSaving || lineItems.length === 0 || cashDrawerBlocked}'));
  });

  for (const [name, file, handler, id, amount, submit] of [
    ['wallet transact', ['views', 'wallets', 'WalletsView.tsx'], 'const handleProcessTransaction', 'wallets-transact', 'amountPiasters > 0', 'handleProcessTransaction'],
    ['epay pos', ['views', 'epay', 'EpayView.tsx'], 'const handleCreateTransaction', 'epay-transaction', 'billAmountPiasters > 0', 'saveTransactionFromGuard'],
  ]) {
    it(`${name}: the handler reports a boolean, has no confirm step, and the dialog calls it as is`, () => {
      const src = read(...file);
      const body = slice(src, handler, src.includes('saveTransactionFromGuard') ? 'const saveTransactionFromGuard' : 'const { saveBarRef: transactSaveBarRef }');
      assert.ok(/Promise<boolean>/.test(body.slice(0, 160)));
      assert.ok(!/\n\s*return;/.test(body), 'every early exit reports false');
      assert.ok(!/rafiqConfirm|setConfirm|ConfirmModal/.test(body), 'a plain save: there is no confirmation to bypass');
      assert.ok(body.includes('saved = true;') && body.includes('return saved;'));
      const block = slice(src, `id: '${id}'`, '});');
      assert.ok(block.includes(`save: ${amount} ? ${submit} : undefined`), 'save only offered when there is an amount');
      assert.ok(block.includes('keepsStateWithinPage: true') && block.includes('isActive,') && block.includes('discard: resetTransactionForm'));
      assert.ok(src.includes('ref={transactSaveBarRef}') && src.includes('<UnsavedChangesChip dirty={transactionDraftDirty} />'));
    });
  }

  it('wallet and epay drafts: any amount or typed text is dirty, defaults are clean', () => {
    const wallets = slice(read('views', 'wallets', 'WalletsView.tsx'), 'const transactionDraftDirty =', ';\n');
    for (const f of ['amountPiasters > 0', 'profitPiasters > 0', 'customerPhone.trim()', 'customerName.trim()', 'referenceNumber.trim()', 'notes.trim()']) assert.ok(wallets.includes(f), f);
    const epay = slice(read('views', 'epay', 'EpayView.tsx'), 'const transactionDraftDirty =', ';\n');
    for (const f of ['billAmountPiasters > 0', 'machineCommissionPiasters > 0', 'shopProfitPiasters > 0', 'customerPhone.trim()', 'notes.trim()']) assert.ok(epay.includes(f), f);
    assert.ok(!epay.includes('serviceName') && !epay.includes('paymentDestination'), 'preset choices are not a draft');
  });

  it('epay receives isActive so a hidden page never blocks other pages', () => {
    assert.ok(app.includes("isActive={effectiveActiveTab === 'epay'}"));
    assert.ok(read('views', 'epay', 'EpayView.tsx').includes('isActive?: boolean'));
  });

  it('backup policy form: baseline from the loaded/saved values, toggles excluded, form unmounts with its sub-tab (so it asks there)', () => {
    const backup = read('components', 'BackupManager.tsx');
    const snap = slice(backup, 'function policySnapshotOf', '\n}');
    assert.ok(snap.includes('folder.trim()') && snap.includes('|| DEFAULT_RETENTION_DAYS') && snap.includes('|| DEFAULT_MAX_COPIES'));
    assert.ok(!/autoOnClose|autoDaily/.test(snap), 'the two auto-saving switches are not part of dirty');
    assert.equal(backup.match(/setPolicyBaseline\(policySnapshotOf\(/g).length, 2, 'both loads set the baseline');
    const save = slice(backup, 'const handleSavePolicy = async (): Promise<boolean> =>', 'const { saveBarRef: policySaveBarRef }');
    assert.ok(save.indexOf("invoke('backup:configure'") < save.indexOf('setPolicyBaseline(policySnapshot)'));
    assert.ok(save.includes('return true;') && save.includes('return false;'));
    const block = slice(backup, "id: 'backup-policy'", '});');
    assert.ok(block.includes('save: handleSavePolicy') && block.includes('isActive,') && !block.includes('keepsStateWithinPage'));
    assert.ok(backup.includes('ref={policySaveBarRef}') && backup.includes('<UnsavedChangesChip dirty={policyDirty} />'));
    assert.ok(settingsHasBackupActive());
  });

  function settingsHasBackupActive() {
    return read('views', 'SettingsView.tsx').includes('<BackupManager onOpenLicenseModal={onOpenLicenseModal} isActive={isActive} />');
  }
});

describe('pass 2: F1 opens the guide only on the cashier screen', () => {
  it('App has no global F1 toggle (it used to stack a second guide on the cashier and open it over other pages)', () => {
    assert.ok(!app.includes('handleGlobalF1') && !app.includes('setIsShortcutsModalOpen((prev)'));
    assert.ok(app.includes("e.key === 'F1' && activeTab !== 'pos'"), 'other pages: F1 returns to the cashier through the guard');
  });

  it('the cashier opens the guide itself and the menu entry shows just the key (F1)', () => {
    const keys = read('views', 'pos', 'usePosShortcuts.ts');
    assert.ok(/e\.key === 'F1'[\s\S]{0,120}setIsHelpModalOpen\(true\)/.test(keys));
    assert.ok(app.includes("hint: 'F1'"));
  });
});
