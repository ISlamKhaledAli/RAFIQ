import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  attendAll,
  blockingEntries,
  canSaveAll,
  createGuardRegistry,
  createLeaveController,
  decideLeave,
  describeEntries,
  discardAll,
  saveAll,
  unsavedChangesMessage,
} from '../src/utils/unsavedChangesGuard.ts';
import { isCashDrawerBlocked } from '../src/views/purchases/supplierPaymentState.ts';

const entry = (over = {}) => ({
  id: 'form',
  label: 'بيانات المحل',
  dirty: true,
  active: true,
  keepsStateWithinPage: false,
  ...over,
});

/** Silences the guard's own error log for tests that provoke a failure on purpose. */
const quietly = async (fn) => {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
};

describe('unsaved-changes guard: who blocks a move', () => {
  it('nothing registered or everything clean means the move goes straight through', () => {
    assert.deepEqual(decideLeave([]), { kind: 'proceed' });
    assert.deepEqual(decideLeave([entry({ dirty: false })]), { kind: 'proceed' });
  });

  it('a dirty visible form asks, and the answer lists exactly the dirty forms', () => {
    const dirty = entry({ id: 'a' });
    const clean = entry({ id: 'b', dirty: false });
    const decision = decideLeave([dirty, clean]);
    assert.equal(decision.kind, 'confirm');
    assert.deepEqual(decision.entries.map((e) => e.id), ['a']);
  });

  it('a hidden keep-alive page never blocks a move made from another page', () => {
    assert.equal(decideLeave([entry({ active: false })]).kind, 'proceed');
  });

  it('a sub-tab switch inside the page ignores drafts that survive it but not drafts that would be lost', () => {
    const survives = entry({ id: 'kept', keepsStateWithinPage: true });
    const lost = entry({ id: 'lost' });
    assert.equal(decideLeave([survives], { withinPage: true }).kind, 'proceed');
    assert.deepEqual(blockingEntries([survives, lost], { withinPage: true }).map((e) => e.id), ['lost']);
  });

  it('leaving the page asks even for drafts that survive sub-tab switches', () => {
    assert.equal(decideLeave([entry({ keepsStateWithinPage: true })], { withinPage: false }).kind, 'confirm');
    assert.equal(decideLeave([entry({ keepsStateWithinPage: true })]).kind, 'confirm');
  });
});

describe('unsaved-changes guard: registry', () => {
  it('keeps registration order, replaces an entry by id and forgets removed ones', () => {
    const registry = createGuardRegistry();
    registry.upsert(entry({ id: 'a' }));
    registry.upsert(entry({ id: 'b' }));
    registry.upsert(entry({ id: 'a', label: 'تغيّر' }));
    assert.deepEqual(registry.snapshot().map((e) => [e.id, e.label]), [['a', 'تغيّر'], ['b', 'بيانات المحل']]);
    registry.remove('a');
    assert.deepEqual(registry.snapshot().map((e) => e.id), ['b']);
  });

  it('dirty to clean and back changes the decision, so typing then reverting is quiet', () => {
    const registry = createGuardRegistry();
    registry.upsert(entry({ dirty: true }));
    assert.equal(decideLeave(registry.snapshot()).kind, 'confirm');
    registry.upsert(entry({ dirty: false }));
    assert.equal(decideLeave(registry.snapshot()).kind, 'proceed');
    registry.upsert(entry({ dirty: true }));
    assert.equal(decideLeave(registry.snapshot()).kind, 'confirm');
  });

  it('notifies subscribers on change and stops after unsubscribe; removing an unknown id is silent', () => {
    const registry = createGuardRegistry();
    let calls = 0;
    const stop = registry.subscribe(() => {
      calls += 1;
    });
    registry.upsert(entry());
    registry.remove('missing');
    assert.equal(calls, 1);
    registry.remove('form');
    assert.equal(calls, 2);
    stop();
    registry.upsert(entry());
    assert.equal(calls, 2);
  });
});

describe('unsaved-changes guard: helpers', () => {
  it('"save then continue" is offered only when every dirty form can save', () => {
    const save = async () => true;
    assert.equal(canSaveAll([entry({ save }), entry({ id: 'b', save })]), true);
    assert.equal(canSaveAll([entry({ save }), entry({ id: 'b' })]), false);
    assert.equal(canSaveAll([]), false);
  });

  it('names each page once, in order, and the message names them', () => {
    const names = describeEntries([entry({ id: 'a', label: 'الطابعة' }), entry({ id: 'b', label: 'الطابعة' }), entry({ id: 'c', label: 'السياسات' })]);
    assert.deepEqual(names, ['الطابعة', 'السياسات']);
    assert.match(unsavedChangesMessage(['بيانات المحل']), /«بيانات المحل»/);
    assert.match(unsavedChangesMessage(names), /الطابعة، السياسات/);
  });

  it('saveAll saves in order and stops at the first failure', async () => {
    const calls = [];
    const make = (id, result) => entry({ id, save: async () => { calls.push(id); return result; } });
    assert.equal(await saveAll([make('a', true), make('b', true)]), true);
    calls.length = 0;
    assert.equal(await saveAll([make('a', false), make('b', true)]), false);
    assert.deepEqual(calls, ['a'], 'the second form is not saved after the first failed');
  });

  it('a rejected or missing save counts as failed (never as success)', async () => {
    await quietly(async () => {
      assert.equal(await saveAll([entry({ save: async () => { throw new Error('boom'); } })]), false);
    });
    assert.equal(await saveAll([entry()]), false);
  });

  it('a failing discard or attention callback does not stop the others', () => {
    const ran = [];
    const bad = entry({ id: 'bad', discard: () => { throw new Error('x'); }, onAttention: () => { throw new Error('y'); } });
    const good = entry({ id: 'good', discard: () => ran.push('discard'), onAttention: () => ran.push('attention') });
    const original = console.error;
    console.error = () => {};
    try {
      discardAll([bad, good]);
      attendAll([bad, good]);
    } finally {
      console.error = original;
    }
    assert.deepEqual(ran, ['discard', 'attention']);
  });
});

describe('unsaved-changes guard: leave controller (the question and its three answers)', () => {
  const setup = (over = {}) => {
    const registry = createGuardRegistry();
    const log = [];
    const controller = createLeaveController(registry);
    registry.upsert(entry({
      save: async () => { log.push('save'); return true; },
      discard: () => log.push('discard'),
      onAttention: () => log.push('attention'),
      ...over,
    }));
    const proceed = () => log.push('proceed');
    return { registry, controller, log, proceed };
  };

  it('proceeds immediately and opens nothing when the page is clean', () => {
    const { registry, controller, log, proceed } = setup({ dirty: false });
    controller.request(proceed);
    assert.deepEqual(log, ['proceed']);
    assert.equal(controller.getState(), null);
    registry.remove('form');
  });

  it('opens the question for a dirty page without moving, and ignores a second request while it is open', () => {
    const { controller, log, proceed } = setup();
    controller.request(proceed);
    assert.equal(controller.getState()?.entries.length, 1);
    controller.request(proceed);
    assert.deepEqual(log, [], 'neither request ran');
  });

  it('stay: nothing is lost, the page is pointed at its save bar, the move never happens', () => {
    const { controller, log, proceed } = setup();
    controller.request(proceed);
    controller.stay();
    assert.deepEqual(log, ['attention']);
    assert.equal(controller.getState(), null);
  });

  it('discard: the draft is reset first, then the move happens once', () => {
    const { controller, log, proceed } = setup();
    controller.request(proceed);
    controller.discard();
    assert.deepEqual(log, ['discard', 'proceed']);
    controller.discard();
    assert.deepEqual(log, ['discard', 'proceed'], 'a second click does nothing');
  });

  it('save success: saved, then the move happens', async () => {
    const { controller, log, proceed } = setup();
    controller.request(proceed);
    await controller.save();
    assert.deepEqual(log, ['save', 'proceed']);
    assert.equal(controller.getState(), null);
  });

  it('save failure: the move does not happen, the user stays and is pointed at the save bar', async () => {
    const { controller, log, proceed } = setup({ save: async () => false });
    controller.request(proceed);
    await controller.save();
    assert.deepEqual(log, ['attention']);
    assert.equal(controller.getState(), null);
  });

  it('a save that throws is a failure too', async () => {
    const { controller, log, proceed } = setup({ save: async () => { throw new Error('disk'); } });
    controller.request(proceed);
    await quietly(() => controller.save());
    assert.deepEqual(log, ['attention']);
  });

  it('while saving, a second save, discard or stay is ignored (no double save, no escape mid-save)', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { controller, log, proceed } = setup({ save: async () => { log.push('save'); await gate; return true; } });
    controller.request(proceed);
    const first = controller.save();
    assert.equal(controller.getState()?.saving, true);
    await controller.save();
    controller.discard();
    controller.stay();
    release();
    await first;
    assert.deepEqual(log, ['save', 'proceed']);
  });

  it('closes by itself, without moving, once nothing is left to lose (page saved or unmounted)', () => {
    const { registry, controller, log, proceed } = setup();
    const stop = controller.start();
    controller.request(proceed);
    registry.upsert(entry({ dirty: false }));
    assert.equal(controller.getState(), null);
    assert.deepEqual(log, []);
    stop();
  });

  it('notifies listeners when the question opens and closes', () => {
    const { controller, proceed } = setup();
    let calls = 0;
    controller.subscribe(() => {
      calls += 1;
    });
    controller.request(proceed);
    controller.stay();
    assert.equal(calls, 2);
  });

  it('a sub-tab switch inside the page does not ask when the draft survives it', () => {
    const { controller, log, proceed } = setup({ keepsStateWithinPage: true });
    controller.request(proceed, { withinPage: true });
    assert.deepEqual(log, ['proceed']);
  });
});

describe('purchase drawer-cash rule shared by the save button and the dialog save', () => {
  it('blocks a cash-drawer payment above the cash in the drawer, or with an empty drawer', () => {
    assert.equal(isCashDrawerBlocked('cash_drawer', 5000, 4999), true);
    assert.equal(isCashDrawerBlocked('cash_drawer', 100, 0), true);
    assert.equal(isCashDrawerBlocked('cash_drawer', 5000, 5000), false, 'exactly the drawer cash is allowed');
  });

  it('never blocks external cash, an unpaid invoice or an unknown drawer balance (the server still checks)', () => {
    assert.equal(isCashDrawerBlocked('external_cash', 999999, 0), false);
    assert.equal(isCashDrawerBlocked('cash_drawer', 0, 0), false);
    assert.equal(isCashDrawerBlocked('cash_drawer', 5000, null), false);
  });
});
