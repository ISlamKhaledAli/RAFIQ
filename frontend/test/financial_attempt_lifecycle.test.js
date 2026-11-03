import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import {
  createFinancialAttempt, readFinancialAttempt, FINANCIAL_ATTEMPT_STORAGE_KEY,
} from '../src/utils/financialAttempt.ts';

const actions = ['wallets:processTransaction', 'wallets:fundAccount', 'epay:createTransaction', 'epay:fundTerminal'];
const draft = action => action === actions[0]
  ? { accountId: 'wallet-a', txType: 'cash_in', amountPiasters: 10000, profitPiasters: 100, paymentDestination: 'external' }
  : action === actions[1] ? { accountId: 'wallet-a', amountPiasters: 10000, fundingSource: 'external' }
    : action === actions[2] ? { terminalId: 'terminal-a', serviceType: 'utility_bill', serviceName: 'Bill', billAmountPiasters: 10000, customerFeePiasters: 100, providerCommissionPiasters: 0, paymentChannel: 'external' }
      : { terminalId: 'terminal-a', amountPiasters: 10000, fundingSource: 'external' };
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
function backend(drop = true) {
  const rows = new Map(), barriers = new Set(), calls = [];
  let lost = drop;
  const send = async (action, payload) => {
    calls.push({ action, payload: JSON.parse(JSON.stringify(payload)) });
    if (action.endsWith('Attempt')) {
      const key = payload.payload.idempotencyKey;
      const row = rows.get(key);
      if (!row && action.endsWith('abandonAttempt')) barriers.add(key);
      return { status: row ? 'committed' : barriers.has(key) ? 'abandoned' : 'pending',
        operation: payload.operation, actorId: payload.actorId, idempotencyKey: key,
        requestFingerprint: 'fingerprint', data: row ?? null };
    }
    const key = payload.idempotencyKey;
    if (barriers.has(key)) throw new Error('Durable barrier');
    let row = rows.get(key);
    if (!row) {
      row = { ...payload, id: `row-${rows.size + 1}`, idempotencyKey: key, idempotencyFingerprint: 'fingerprint',
        createdBy: 'actor-a', previousBalancePiasters: 50000, newBalancePiasters: 50000 + (payload.amountPiasters ?? 0) };
      rows.set(key, row);
    }
    if (lost) { lost = false; throw new Error('Committed then response lost'); }
    return structuredClone(row);
  };
  return { rows, barriers, calls, send };
}
function actual(name, filename, context) {
  const source = ts.createSourceFile(filename, fs.readFileSync(new URL(filename, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) text = node.initializer.getText(source);
    if (ts.isFunctionDeclaration(node) && node.name?.getText(source) === name) text = node.getText(source);
    if (name === 'onResolved' && ts.isJsxAttribute(node) && node.name.getText(source) === name) text = node.initializer.expression.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(text, `Actual production ${name} handler exists`);
  vm.runInContext(ts.transpile(`globalThis.subject = ${text}`, { target: ts.ScriptTarget.ES2020 }), vm.createContext(context));
  return context.subject;
}
function ui(action, saved, server) {
  const ctx = {
    actorId: 'actor-a', window: { localStorage: saved }, running: { current: false }, financialWritePending: { current: false },
    createFinancialAttempt, readFinancialAttempt, invoke: server.send, refresh() {}, setBusy() {},
    selectedAccount: { id: 'wallet-a', balancePiasters: 50000 }, selectedAccountId: 'wallet-a', accounts: [{ id: 'wallet-a' }],
    currentTerminal: { id: 'terminal-a', balancePiasters: 50000 }, txType: 'cash_in', amountPiasters: 10000, profitPiasters: 100,
    fundingAccountId: 'wallet-a', fundingTerminalId: 'terminal-a', fundingAmountPiasters: 10000, fundingSource: 'external', fundingNotes: 'Original funding',
    customerPhone: '01012345678', customerName: 'Customer', referenceNumber: 'Ref-A', notes: 'Original note',
    hasInsufficientBalance: false, isBalanceInsufficient: false, liveDrawerCashPiasters: 50000,
    serviceType: 'utility_bill', serviceName: 'Bill', billAmountPiasters: 10000, machineCommissionPiasters: 0,
    shopProfitPiasters: 100, paymentDestination: 'external', deductedBalancePiasters: 10000, netProfitPiasters: 100,
    autoPrintReceipt: false, console: { error() {} }, formatArabicCurrency: String, loadData: async () => {}, fetchLiveDrawerCash: async () => {},
  };
  for (const name of ['Busy', 'FeedbackMsg', 'ActionLoading', 'LastProcessedTx', 'IsFundingModalOpen', 'FundingAccountId', 'FundingAmountPiasters',
    'FundingSource', 'FundingNotes', 'AmountPiasters', 'ProfitPiasters', 'CustomerPhone', 'CustomerName', 'ReferenceNumber', 'Notes',
    'ErrorMsg', 'SuccessMsg', 'IsSubmittingTx', 'IsSubmittingFunding', 'FundingModalError', 'ReceiptTx',
    'BillAmountPiasters', 'MachineCommissionPiasters', 'ShopProfitPiasters']) {
    ctx[`set${name}`] = value => { ctx[name[0].toLowerCase() + name.slice(1)] = value; };
  }
  const hook = '../src/hooks/useFinancialJournal.ts';
  ctx.financial = { get blocked() { return !!readFinancialAttempt(saved); }, run: actual('run', hook, ctx) };
  const wallet = action.startsWith('wallets:');
  const view = wallet ? '../src/views/wallets/WalletsView.tsx' : '../src/views/epay/EpayView.tsx';
  const name = action === actions[0] ? 'handleProcessTransaction' : action === actions[1] ? 'handleSaveFunding' :
    action === actions[2] ? 'handleCreateTransaction' : 'handleFundTerminal';
  return { ctx, submit: actual(name, view, ctx), recover: actual('recover', hook, ctx),
    resolved: actual('onResolved', view, ctx),
    reopen: wallet ? actual('handleOpenFundingModal', view, ctx) : () => {} };
}
for (const action of actions) {
  test(`${action}: actual submit/recovery handlers preserve frozen payload through close, remount and reload`, async () => {
    const saved = storage(), server = backend();
    const first = ui(action, saved, server);
    await first.submit({ preventDefault() {} });
    const original = readFinancialAttempt(saved);
    assert.ok(original);
    assert.equal(server.rows.size, 1);
    first.reopen();
    assert.deepEqual(readFinancialAttempt(saved), original);
    const restoredStorage = storage();
    restoredStorage.setItem(FINANCIAL_ATTEMPT_STORAGE_KEY, saved.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY));
    const remount = ui(action, restoredStorage, server);
    remount.ctx.amountPiasters = 99999;
    remount.ctx.fundingAmountPiasters = 99999;
    remount.ctx.billAmountPiasters = 99999;
    remount.ctx.notes = 'Edited after lost response';
    await remount.submit({ preventDefault() {} });
    assert.equal(server.calls.length, 1, 'Frozen form rejects edits/new writes after remount');
    const recovered = await remount.recover('replay');
    assert.equal(recovered.status, 'committed');
    remount.resolved();
    assert.equal(server.rows.size, 1, 'No second posting after the response was dropped');
    assert.deepEqual(server.calls[1].payload, original.payload);
    assert.equal(readFinancialAttempt(restoredStorage), null);
    assert.equal(remount.ctx.fundingAmountPiasters, 0);
    assert.equal(action.startsWith('wallets:') ? remount.ctx.amountPiasters : remount.ctx.billAmountPiasters, 0);
  });
  test(`${action}: null/unknown reconciliation is nonfinal; only strict durable acknowledgement releases`, async () => {
    const saved = storage();
    const controller = createFinancialAttempt(saved, 'actor-a', action, async () => { throw new Error('Queued, no known result'); });
    await assert.rejects(controller.execute(draft(action)));
    const original = readFinancialAttempt(saved);
    for (const response of [null, {}, { status: 'pending', operation: action, actorId: 'actor-a',
      idempotencyKey: original.payload.idempotencyKey, requestFingerprint: 'fingerprint', data: null }]) {
      const check = createFinancialAttempt(saved, 'actor-a', action, async () => response);
      if (response?.status === 'pending') assert.equal((await check.reconcile()).status, 'pending');
      else await assert.rejects(check.reconcile());
      assert.deepEqual(readFinancialAttempt(saved), original);
    }
    const server = backend(false);
    const acknowledgement = await createFinancialAttempt(saved, 'actor-a', action, server.send).abandon();
    assert.equal(acknowledgement.status, 'abandoned');
    assert.equal(readFinancialAttempt(saved), null);
    assert.equal(server.calls[0].payload.actorId, 'actor-a');
    assert.deepEqual(server.calls[0].payload.payload, original.payload);
    await assert.rejects(server.send(action, original.payload), /barrier/i);
    await createFinancialAttempt(saved, 'actor-a', action, server.send).execute(draft(action));
    assert.notEqual(server.calls.at(-1).payload.idempotencyKey, original.payload.idempotencyKey);
  });
  test(`${action}: actor switch, different scope, checkout conflict and malformed success cannot release or replace`, async () => {
    const saved = storage();
    saved.setItem('rafiq_pos_pending_checkout_v1', 'unresolved checkout');
    let calls = 0;
    const send = async () => { calls++; return null; };
    await assert.rejects(createFinancialAttempt(saved, 'actor-a', action, send).execute(draft(action)));
    assert.equal(calls, 0);
    saved.removeItem('rafiq_pos_pending_checkout_v1');
    await assert.rejects(createFinancialAttempt(saved, 'actor-a', action, send).execute(draft(action)));
    const original = readFinancialAttempt(saved);
    for (const method of ['reconcile', 'abandon']) await assert.rejects(createFinancialAttempt(saved, 'actor-b', action, send)[method]());
    await assert.rejects(createFinancialAttempt(saved, 'actor-b', action, send).execute(draft(action)));
    await assert.rejects(createFinancialAttempt(saved, 'actor-a', actions.find(other => other !== action), send).execute({}));
    assert.equal(calls, 1);
    assert.deepEqual(readFinancialAttempt(saved), original);
  });
}
test('Journal refuses credential fields, malformed storage and storage failures before sending', async () => {
  let calls = 0;
  const send = async () => { calls++; return null; };
  for (const secret of ['pin', 'supervisorPin', 'password', 'token', 'secret']) {
    const saved = storage();
    await assert.rejects(createFinancialAttempt(saved, 'actor-a', actions[1], send).execute({ ...draft(actions[1]), [secret]: 'never-persist' }));
    assert.equal(saved.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY), null);
  }
  const saved = storage();
  saved.setItem(FINANCIAL_ATTEMPT_STORAGE_KEY, '{broken');
  await assert.rejects(createFinancialAttempt(saved, 'actor-a', actions[1], send).execute(draft(actions[1])));
  assert.equal(saved.getItem(FINANCIAL_ATTEMPT_STORAGE_KEY), '{broken');
  await assert.rejects(createFinancialAttempt({ ...storage(), setItem() { throw new Error('Storage unavailable'); } }, 'actor-a', actions[1], send).execute(draft(actions[1])));
  assert.equal(calls, 0);
});
test('Wrong committed amounts, wrong abandonment key, and lost abandonment acknowledgement retain the original journal', async () => {
  const saved = storage(), action = actions[1];
  await assert.rejects(createFinancialAttempt(saved, 'actor-a', action, async () => null).execute(draft(action)));
  const original = readFinancialAttempt(saved);
  const wrongDto = { ...original.payload, id: 'row', idempotencyFingerprint: 'fingerprint', amountPiasters: 20000,
    createdBy: 'actor-a', previousBalancePiasters: 0, newBalancePiasters: 20000 };
  await assert.rejects(createFinancialAttempt(saved, 'actor-a', action, async () => wrongDto).execute({}));
  const wrongAck = { status: 'abandoned', operation: action, actorId: 'actor-a', idempotencyKey: 'wrong', requestFingerprint: 'fingerprint', data: null };
  await assert.rejects(createFinancialAttempt(saved, 'actor-a', action, async () => wrongAck).abandon());
  await assert.rejects(createFinancialAttempt(saved, 'actor-a', action, async () => { throw new Error('Ack lost'); }).abandon());
  assert.deepEqual(readFinancialAttempt(saved), original);
});
test('Actor namespace is credential-free RFC3986 text; a copied header cannot claim another actor key', async () => {
  const saved = storage();
  const actor = "actor /!'()*Ω";
  await assert.rejects(createFinancialAttempt(saved, actor, actions[1], async () => null).execute(draft(actions[1])));
  const original = readFinancialAttempt(saved);
  assert.ok(original.payload.idempotencyKey.startsWith('financial_v1:actor%20%2F%21%27%28%29%2A%CE%A9:'));
  saved.setItem(FINANCIAL_ATTEMPT_STORAGE_KEY, JSON.stringify({ ...original, actorId: 'actor-b' }));
  assert.throws(() => readFinancialAttempt(saved), /المستخدم/);
});
test('Legacy unbound journal remains available for reconciliation but is never blindly replayed', async () => {
  const saved = storage();
  saved.setItem(FINANCIAL_ATTEMPT_STORAGE_KEY, JSON.stringify({
    schemaVersion: 1, actorId: 'actor-a', action: actions[1], payload: { ...draft(actions[1]), idempotencyKey: 'legacy-key' },
    createdAt: new Date().toISOString(),
  }));
  let calls = 0;
  const attempt = createFinancialAttempt(saved, 'actor-a', actions[1], async () => { calls++; return null; });
  assert.equal(readFinancialAttempt(saved).payload.idempotencyKey, 'legacy-key');
  await assert.rejects(attempt.execute({}));
  assert.equal(calls, 0);
  await assert.rejects(attempt.reconcile());
  assert.equal(calls, 1);
  assert.ok(readFinancialAttempt(saved));
});
