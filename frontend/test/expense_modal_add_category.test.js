import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('ExpenseModal: Add Category Inline Input & Overflow Guard', async (t) => {
  const modalPath = path.resolve(__dirname, '../src/components/ExpenseModal.tsx');
  const content = fs.readFileSync(modalPath, 'utf8');

  await t.test('1. Body has overflow-x-hidden to prevent horizontal scrollbar', () => {
    assert.match(
      content,
      /overflow-x-hidden/,
      'ExpenseModal body must specify overflow-x-hidden so horizontal scrollbars never appear'
    );
  });

  await t.test('2. Add category input has min-w-0 to prevent flexbox overflow', () => {
    assert.match(
      content,
      /min-w-0 h-\[(?:38px|2\.375rem)\]/,
      'New category input must have min-w-0 and match CustomSelect height (38px / 2.375rem)'
    );
  });

  await t.test('3. New category action button is shrink-0 and type="button"', () => {
    assert.match(
      content,
      /<AppButton\s+type="button"\s+variant="primary"\s+size="sm"\s+className="h-\[(?:38px|2\.375rem)\] px-3 shrink-0"/,
      'Save button must have type="button", shrink-0, and height 38px / 2.375rem'
    );
  });

  await t.test('4. Enter key prevents form submit and submits category only', () => {
    assert.match(
      content,
      /if\s*\(\s*e\.key\s*===\s*'Enter'\s*\)\s*\{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*void handleCreateCategory\(\);/,
      'Enter key must preventDefault and stopPropagation so parent expense-form is not submitted'
    );
  });

  await t.test('5. Modal container has max-h-[90vh] for compact screen fit', () => {
    assert.match(
      content,
      /max-h-\[(?:90|92)vh\]/,
      'Modal container must use max-h-[90vh] or max-h-[92vh] to fit comfortably on 1024x768 / 574px screens'
    );
  });
});

