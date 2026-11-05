import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isFeatureEffectivelyEnabled } from '../src/context/featureRequires.ts';
import { DEFAULT_FLAGS, DEFAULT_REGISTRY } from '../src/context/featureTypes.ts';

const PHARMACY_PREREQS = {
  feature_expiry_dates: true,
  feature_multi_units: true,
  feature_loose_selling: true,
};

describe('Feature flags honour the registry "requires" list', () => {
  it('drug interactions are off by default (supermarket / no pharmacy)', () => {
    assert.equal(DEFAULT_FLAGS.feature_drug_interactions, false);
    assert.equal(isFeatureEffectivelyEnabled('feature_drug_interactions', DEFAULT_FLAGS, DEFAULT_REGISTRY), false);
  });

  it('drug interactions stay off when the flag is on but pharmacy is off', () => {
    const flags = { ...DEFAULT_FLAGS, feature_drug_interactions: true, feature_pharmacy: false };
    assert.equal(isFeatureEffectivelyEnabled('feature_drug_interactions', flags, DEFAULT_REGISTRY), false);
  });

  it('drug interactions are on when both the flag and pharmacy (with its prerequisites) are on', () => {
    const flags = { ...DEFAULT_FLAGS, ...PHARMACY_PREREQS, feature_pharmacy: true, feature_drug_interactions: true };
    assert.equal(isFeatureEffectivelyEnabled('feature_pharmacy', flags, DEFAULT_REGISTRY), true);
    assert.equal(isFeatureEffectivelyEnabled('feature_drug_interactions', flags, DEFAULT_REGISTRY), true);
  });

  it('a feature whose own flag is off is off even when its requirements are on', () => {
    const flags = { ...DEFAULT_FLAGS, ...PHARMACY_PREREQS, feature_pharmacy: true, feature_drug_interactions: false };
    assert.equal(isFeatureEffectivelyEnabled('feature_drug_interactions', flags, DEFAULT_REGISTRY), false);
  });

  it('requirements are resolved recursively (cafe sub-feature needs the cafe module)', () => {
    const off = { ...DEFAULT_FLAGS, feature_cafe_restaurant: false, feature_table_management: true };
    assert.equal(isFeatureEffectivelyEnabled('feature_table_management', off, DEFAULT_REGISTRY), false);
    const on = { ...off, feature_cafe_restaurant: true };
    assert.equal(isFeatureEffectivelyEnabled('feature_table_management', on, DEFAULT_REGISTRY), true);
  });

  it('missing flags and unknown keys are disabled; features without requirements follow their flag', () => {
    assert.equal(isFeatureEffectivelyEnabled('feature_does_not_exist', {}, DEFAULT_REGISTRY), false);
    assert.equal(isFeatureEffectivelyEnabled('feature_credit_debts', { feature_credit_debts: true }, DEFAULT_REGISTRY), true);
    assert.equal(isFeatureEffectivelyEnabled('feature_credit_debts', {}, DEFAULT_REGISTRY), false);
  });

  it('cyclic requirements terminate', () => {
    const registry = [
      { key: 'a', requires: ['b'] },
      { key: 'b', requires: ['a'] },
    ];
    assert.equal(isFeatureEffectivelyEnabled('a', { a: true, b: true }, registry), true);
    assert.equal(isFeatureEffectivelyEnabled('a', { a: true, b: false }, registry), false);
  });
});
