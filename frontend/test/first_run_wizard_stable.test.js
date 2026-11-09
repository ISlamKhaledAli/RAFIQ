import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pickWizardTemplateId, resolveWizardTemplates } from '../src/utils/wizardTemplates.ts';
import { INITIAL_STORE_TEMPLATES } from '../src/constants/storeTemplates.ts';

const source = fs.readFileSync(path.resolve('src', 'components', 'FirstRunWizardModal.tsx'), 'utf8');

describe('First-run wizard: no flash of intermediate content', () => {
  it('does not seed the visible template list with the bundled mirror before the host list arrives', () => {
    assert.ok(!/useState<StoreTemplateDto\[\]>\(INITIAL_STORE_TEMPLATES\)/.test(source));
    assert.ok(!source.includes('INITIAL_STORE_TEMPLATES'), 'the bundled list is only a fallback inside resolveWizardTemplates');
  });

  it('renders neutral same-size placeholders until templates and saved selection are resolved together', () => {
    assert.ok(source.includes('const [isReady, setIsReady] = useState(false)'));
    assert.ok(source.includes('isReady ? renderTemplates() : renderTemplatePlaceholders()'));
    assert.ok(/min-h-\[8\.25rem\]/.test(source.slice(source.indexOf('renderTemplatePlaceholders'))));
    const effect = source.slice(source.indexOf('resolved together'), source.indexOf('const selectedTemplate ='));
    assert.equal((effect.match(/setTemplates\(/g) || []).length, 1, 'one commit for the list');
    assert.equal((effect.match(/setSelectedTemplateId\(/g) || []).length, 1, 'the selection is set once, never moved after paint');
    assert.ok(effect.indexOf("'templates:getAll'") < effect.indexOf("'settings:getAll'"));
    assert.ok(effect.indexOf("'settings:getAll'") < effect.indexOf('setTemplates('), 'state is only set after every request finished');
    assert.ok(effect.includes('setIsReady(true)'));
  });

  it('blocks advancing from step 1 while the cards are not ready', () => {
    assert.ok(source.includes('(step === 1 && !isReady)'));
    assert.ok(source.includes('disabled={isApplying || !isReady}'));
  });

  it('mounts the content only while open so every opening starts fresh at step 1', () => {
    assert.ok(source.includes('const FirstRunWizardContent'));
    assert.ok(/isOpen \? <FirstRunWizardContent \{\.\.\.props\} \/> : null/.test(source));
    assert.ok(!source.includes('prefilledRef'));
  });

  it('keeps the content free of remounting keys on the step container', () => {
    const panel = source.slice(source.indexOf('{...motionPanel}'), source.indexOf('{...motionPanel}') + 160);
    assert.ok(!/key=/.test(panel));
  });
});

describe('wizardTemplates helpers', () => {
  const list = INITIAL_STORE_TEMPLATES.slice(0, 3);

  it('falls back to the bundled list when the host list is unusable', () => {
    assert.equal(resolveWizardTemplates(null), INITIAL_STORE_TEMPLATES);
    assert.equal(resolveWizardTemplates([]), INITIAL_STORE_TEMPLATES);
    assert.equal(resolveWizardTemplates([{ id: 'accessories_gifts' }]), INITIAL_STORE_TEMPLATES);
  });

  it('drops hidden templates from the host list', () => {
    const result = resolveWizardTemplates([{ id: 'accessories_gifts' }, { id: 'pharmacy' }]);
    assert.deepEqual(result.map((t) => t.id), ['pharmacy']);
  });

  it('picks the first candidate present in the list, else the first template', () => {
    assert.equal(pickWizardTemplateId(list, 'missing', list[1].id), list[1].id);
    assert.equal(pickWizardTemplateId(list, undefined, 'missing'), list[0].id);
    assert.equal(pickWizardTemplateId([], 'x'), '');
  });
});
