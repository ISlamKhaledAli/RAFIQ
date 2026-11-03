import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual TSX submit callback, not a copied cash algorithm or a source-pattern assertion.
// React state is the input boundary for this single scenario; this is not browser/render coverage.
function actualCashSubmit(bindings) {
  const path = new URL('../src/components/PaymentModal.tsx', import.meta.url);
  const source = ts.createSourceFile(
    path.pathname, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const callbacks = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleConfirm') {
      callbacks.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(callbacks.length, 1, 'Locate the one actual PaymentModal submit callback.');
  assert.ok(callbacks[0] && ts.isArrowFunction(callbacks[0]));
  const compiled = ts.transpileModule(
    `const actualSubmit = ${callbacks[0].getText(source)};\nactualSubmit;`,
    {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
      reportDiagnostics: true,
    },
  );
  assert.deepEqual(
    (compiled.diagnostics || []).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error),
    [],
  );
  return vm.runInNewContext(compiled.outputText, bindings, { filename: 'actual-PaymentModal-submit.js' });
}

it('actual 84-pound cash submit with 100 received preserves gross tender and 16 change for the host', async () => {
  const expected = JSON.parse(readFileSync(new URL(
    '../../desktop/RafiqPOS.Tests/Fixtures/cash_tender_84_100.json', import.meta.url,
  ), 'utf8'));
  const submitted = [];
  const unexpectedDialog = async () => { throw new Error('Normal full cash must not require a credit or shortage dialog.'); };
  const submit = actualCashSubmit({
    selectedCustomer: null,
    currentCustomerId: null,
    isFullCreditMode: false,
    receivedPiasters: 10000,
    netTotalPiasters: 8400,
    isShortPayment: false,
    saveChangeToCustomerAccount: false,
    changeDuePiasters: 1600,
    rafiqAlert: unexpectedDialog,
    rafiqConfirm: unexpectedDialog,
    onConfirmPayment: data => { submitted.push(JSON.parse(JSON.stringify(data))); },
  });
  await submit();
  assert.equal(submitted.length, 1);
  assert.deepEqual(submitted[0], expected,
    'The shared host fixture is gross cash tender, not net cash allocation. Do not lose receipt metadata.');
});
