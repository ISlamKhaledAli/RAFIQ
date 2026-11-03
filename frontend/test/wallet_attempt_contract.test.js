import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createFinancialAttempt, readFinancialAttempt } from '../src/utils/financialAttempt.ts';

const sourcePath = process.env.RAFIQ_WALLET_UI_SOURCE ||
  path.resolve(import.meta.dirname, '../src/views/wallets/WalletsView.tsx');
const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function handler(name, context) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(initializer, `Production handler ${name} must exist`);
  const compiled = ts.transpile(`globalThis.subject = ${initializer.getText(source)};`,
    { target: ts.ScriptTarget.ES2020 });
  const sandbox = vm.createContext(context);
  vm.runInContext(compiled, sandbox);
  return sandbox.subject;
}

function fixture(funding) {
  const requests = [];
  const saved = new Map();
  const storage = {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: key => saved.delete(key),
  };
  let timeout = true;
  const state = {
    selectedAccount: { id: 'wallet-a', balancePiasters: 50000 },
    selectedAccountId: 'wallet-a',
    accounts: [{ id: 'wallet-a' }],
    txType: 'cash_out',
    amountPiasters: 10000,
    profitPiasters: 100,
    customerPhone: '01012345678',
    customerName: 'Customer',
    referenceNumber: 'Ref-A',
    notes: 'Transaction note',
    currentUserName: 'Not an authoritative actor',
    hasInsufficientBalance: false,
    fundingAccountId: 'wallet-a',
    fundingAmountPiasters: 10000,
    fundingSource: 'external',
    fundingNotes: 'Funding note',
    liveDrawerCashPiasters: 50000,
    financialWritePending: { current: false },
    console: { error() {} },
    formatArabicCurrency: String,
    setFeedbackMsg() {},
    setActionLoading() {},
    setLastProcessedTx() {},
    setIsFundingModalOpen() {},
    loadData: async () => {},
    fetchLiveDrawerCash: async () => {},
    invoke: async (action, payload) => {
      requests.push({ action, payload });
      if (timeout) {
        timeout = false;
        throw new Error('Ambiguous timeout after commit');
      }
      return { ...payload, id: 'persisted-id', transactionNumber: '12345678', createdBy: 'actor-a',
        previousBalancePiasters: 50000, newBalancePiasters: 50000 + payload.amountPiasters,
        idempotencyKey: payload.idempotencyKey, idempotencyFingerprint: 'verified-fingerprint' };
    },
  };
  for (const [setter, property] of Object.entries({
    setAmountPiasters: 'amountPiasters', setProfitPiasters: 'profitPiasters',
    setCustomerPhone: 'customerPhone', setCustomerName: 'customerName',
    setReferenceNumber: 'referenceNumber', setNotes: 'notes',
    setFundingAccountId: 'fundingAccountId', setFundingAmountPiasters: 'fundingAmountPiasters',
    setFundingSource: 'fundingSource', setFundingNotes: 'fundingNotes',
  })) state[setter] = value => { state[property] = value; };
  const action = funding ? 'wallets:fundAccount' : 'wallets:processTransaction';
  const controller = createFinancialAttempt(storage, 'actor-a', action, (...args) => state.invoke(...args));
  state.financial = { get blocked() { return !!readFinancialAttempt(storage); }, run: (_, payload) => controller.execute(payload) };
  return { state, requests, storage, controller, submit: handler(funding ? 'handleSaveFunding' : 'handleProcessTransaction', state) };
}

for (const funding of [false, true]) {
  const operation = funding ? 'funding' : 'transaction';
  test(`Wallet ${operation}: actual submit handler preserves attempt across timeout and rotates after success`, async () => {
    const { state, requests, submit, controller } = fixture(funding);
    await submit();
    await submit();
    assert.equal(requests.length, 1, 'An unresolved form cannot start another write');
    await controller.execute({});
    assert.ok(requests[0].payload.idempotencyKey, 'Financial IPC requires a stable attempt identity');
    assert.equal(requests[1].payload.idempotencyKey, requests[0].payload.idempotencyKey);
    state.amountPiasters = 10000;
    await submit();
    assert.notEqual(requests[2].payload.idempotencyKey, requests[1].payload.idempotencyKey);
    assert.equal(requests[0].payload.performedBy, undefined, 'Actor comes from the authenticated backend');
    if (funding) {
      assert.equal(requests[0].payload.fundingSource, 'external');
      assert.equal(requests[0].payload.source, undefined);
    } else assert.equal(requests[0].payload.paymentDestination, 'cash_drawer');
  });

  test(`Wallet ${operation}: an ambiguous committed attempt can replay despite changed local balance`, async () => {
    const { state, requests, submit, controller } = fixture(funding);
    if (funding) state.fundingSource = 'cash_drawer';
    await submit();
    state.hasInsufficientBalance = true;
    state.liveDrawerCashPiasters = 0;
    await submit();
    assert.equal(requests.length, 1, 'The frozen form is blocked until recovery');
    await controller.execute({});
    assert.equal(requests.length, 2, 'Local balance is not a replay guard; the server decides if the attempt already committed');
    assert.equal(requests[1].payload.idempotencyKey, requests[0].payload.idempotencyKey);
  });

  test(`Wallet ${operation}: actual handler suppresses simultaneous submits`, async () => {
    const { state, requests, submit } = fixture(funding);
    const finish = [];
    state.invoke = (action, payload) => {
      requests.push({ action, payload });
      return new Promise(resolve => { finish.push(resolve); });
    };
    const first = submit();
    const second = submit();
    for (const resolve of finish) resolve({ id: 'persisted-id', transactionNumber: '12345678',
      ...requests[0].payload, createdBy: 'actor-a', previousBalancePiasters: 50000,
      newBalancePiasters: 50000 + requests[0].payload.amountPiasters,
      idempotencyKey: requests[0].payload.idempotencyKey, idempotencyFingerprint: 'verified-fingerprint' });
    await Promise.all([first, second]);
    assert.equal(requests.length, 1);
  });
}

test('Wallet funding: close/reopen cannot rotate an unresolved attempt', async () => {
  const { state, requests, submit, controller, storage } = fixture(true);
  await submit();
  const original = JSON.stringify(readFinancialAttempt(storage));
  handler('handleOpenFundingModal', state)('wallet-a');
  state.fundingSource = 'external';
  state.fundingAmountPiasters = 10000;
  await submit();
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(readFinancialAttempt(storage)), original);
  await controller.execute({});
  assert.ok(requests[0].payload.idempotencyKey);
  assert.equal(requests[1].payload.idempotencyKey, requests[0].payload.idempotencyKey);
});
