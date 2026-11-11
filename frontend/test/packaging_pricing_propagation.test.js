import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Packaging pricing propagation: ProductFormModal passes base prices to ProductUnitsEditor', () => {
  const formCode = fs.readFileSync(path.resolve('src', 'views', 'products', 'ProductFormModal.tsx'), 'utf8');
  assert.ok(formCode.includes('basePricePiasters='), 'passes basePricePiasters to ProductUnitsEditor');
  assert.ok(formCode.includes('baseCostPiasters='), 'passes baseCostPiasters to ProductUnitsEditor');
  assert.ok(formCode.includes('baseUnitName={baseUnitName}'), 'passes baseUnitName to ProductUnitsEditor');
  assert.ok(formCode.includes('primaryBarcode={barcode}'), 'passes primaryBarcode to ProductUnitsEditor');
});

test('PackagingWizardModal: Table layout, wide sell price column, and zero clipping invariants', () => {
  const wizardCode = fs.readFileSync(path.resolve('src', 'components', 'PackagingWizardModal.tsx'), 'utf8');

  // Assert table has horizontal scroll resilience and min width
  assert.ok(wizardCode.includes('min-w-[58rem]'), 'table has min-width to avoid column cramping at 1024x768');
  assert.ok(wizardCode.includes('overflow-x-auto'), 'table wrapper has overflow-x-auto');

  // Assert sell price column is wide (at least 18%)
  assert.ok(wizardCode.includes('w-[18%] whitespace-nowrap">سعر البيع'), 'sell price column is allocated sufficient width (18%)');

  // Assert compact auto-calc button to preserve input space
  assert.ok(wizardCode.includes('min-w-[5.5rem]'), 'MoneyInput has min-width in sell price cell');
  assert.ok(wizardCode.includes('مزامنة كافة الأسعار'), 'top toolbar provides global sync all prices button');
});

test('PackagingWizardModal: Financial calculation logic and below-cost warning with one-click heal', () => {
  const wizardCode = fs.readFileSync(path.resolve('src', 'components', 'PackagingWizardModal.tsx'), 'utf8');

  // Auto calculate row logic
  assert.ok(wizardCode.includes('index < levels.length - 1'), 'calculates upwards from child when child exists');
  assert.ok(wizardCode.includes('child.sellPricePiasters * r'), 'multiplies child sell price by ratio');

  // Financial safety warnings
  assert.ok(wizardCode.includes('below-cost-'), 'includes below-cost financial loss warning check');
  assert.ok(wizardCode.includes('pack-less-than-parts-'), 'includes package cheaper than parts warning check');
  assert.ok(wizardCode.includes('warning.actionLabel && warning.onFix'), 'warnings provide interactive one-click fix button');
});

test('MoneyInput: Comfortable currency badge spacing and zero-clipping input width', () => {
  const moneyCode = fs.readFileSync(path.resolve('src', 'components', 'MoneyInput.tsx'), 'utf8');
  assert.ok(moneyCode.includes('pl-8'), 'uses compact pl-8 to maximize numeric display space');
  assert.ok(moneyCode.includes('left-2 text-micro'), 'currency label is positioned snugly at left-2');
});
