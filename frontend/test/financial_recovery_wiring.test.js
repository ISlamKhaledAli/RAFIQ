import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { BridgeResponseError } from '../src/bridge/errors.ts';

const source = readFileSync(new URL('../src/bridge/ipc.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ipc.ts', source, ts.ScriptTarget.Latest, true);
function actualFunction(name) {
  const node = ast.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `Production function ${name} must exist`);
  const compiled = ts.transpileModule(node.getText(ast), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const context = {
    exports: {}, BridgeResponseError, setTimeout, console,
    mockCurrentUserId: 'test-cashier',
  };
  vm.runInNewContext(compiled, context);
  return context.exports[name] ?? vm.runInNewContext(name, context);
}
const recoveries = [
  'wallets:reconcileAttempt', 'wallets:abandonAttempt',
  'epay:reconcileAttempt', 'epay:abandonAttempt',
];

describe('Integrated financial recovery routes', () => {
  it('does not publish financial changes or trigger query loops for recovery metadata', () => {
    const topics = actualFunction('getAutoTopicsForAction');
    for (const action of recoveries) assert.equal(topics(action).length, 0, action);
    assert.ok(topics('wallets:fundAccount').includes('wallets'));
    assert.ok(topics('epay:createTransaction').includes('epay'));
  });

  it('requires the real native host instead of reporting browser financial writes or resolutions as success', async () => {
    const handler = actualFunction('mockHandler');
    for (const action of [
      ...recoveries, 'wallets:processTransaction', 'wallets:fundAccount',
      'epay:createTransaction', 'epay:fundTerminal',
    ]) {
      await assert.rejects(handler(action, {}), (error) =>
        error instanceof BridgeResponseError && error.code === 'DEV_MOCK_NATIVE_HOST_REQUIRED', action);
    }
  });
});
