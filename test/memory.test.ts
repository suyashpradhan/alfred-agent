import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Memory, SyntheticStore, emptySnapshot, parseSnapshot, DAY, RETRY_DELAY } from '../src/memory.ts';
import type { Approval, Command, Snapshot, Status, Store } from '../src/memory.ts';

const yes: Approval = { approved: true };
const now = Date.UTC(2026, 10, 9, 12);
const input = { id: 'synthetic-library', text: 'Return the imaginary library book', dueAt: now };
function setup() {
  const store = new SyntheticStore(); const memory = new Memory(store);
  memory.create(input, now, yes); return { memory, store };
}
function error(code: string) { return (e: unknown) => (e as { code: string }).code === code; }

test('approval must be an explicit own data property, never inherited or an accessor', () => {
  const { memory } = setup(); const before = memory.read();
  let getterCalled = false;
  const accessor = Object.defineProperty({}, 'approved', { get() { getterCalled = true; return true; } });
  for (const approval of [Object.create({ approved: true }), accessor, { approved: 'true' }, [], {}]) {
    const forged = approval as Approval;
    for (const operation of [
      () => memory.remember({ id: 'fact', text: 'Synthetic fact' }, forged),
      () => memory.create(input, now, forged),
      () => memory.transition(input.id, { type: 'resolve' }, now, forged),
      () => memory.claim(input.id, now, forged),
      () => memory.settle('key', 1, 'sent', forged),
    ]) assert.throws(operation, error('DENIED'));
  }
  assert.equal(getterCalled, false);
  assert.deepEqual(memory.read(), before);
});

test('retry backoff survives the UTC midnight boundary and snapshot reload', () => {
  const { memory } = setup();
  const midnight = (Math.floor(now / DAY) + 1) * DAY;
  const first = memory.claim(input.id, midnight - 1000, yes)!;
  memory.settle(first.key, first.attempts, 'failed', yes);
  const fresh = new Memory(new SyntheticStore(memory.read()));
  assert.equal(fresh.claim(input.id, midnight, yes), null);
  assert.equal(fresh.claim(input.id, midnight - 1000 + RETRY_DELAY - 1, yes), null);
  assert.ok(fresh.claim(input.id, midnight - 1000 + RETRY_DELAY, yes));
});

test('clock rollback cannot reserve an earlier day after a later delivery', () => {
  const { memory } = setup(); const r = memory.claim(input.id, now + DAY, yes)!;
  memory.settle(r.key, 1, 'sent', yes);
  const fresh = new Memory(new SyntheticStore(memory.read())); const before = fresh.read();
  assert.throws(() => fresh.claim(input.id, now, yes), error('INVALID'));
  assert.deepEqual(fresh.read(), before);
});

test('clock rollback cannot backdate transitions before the latest reminder attempt', () => {
  const { memory } = setup(); memory.claim(input.id, now + 1000, yes);
  const before = memory.read();
  assert.throws(() => memory.transition(input.id, { type: 'resolve' }, now, yes), error('INVALID'));
  assert.deepEqual(memory.read(), before);
});

test('approved synthetic fact and commitment survive serialized session handoff', () => {
  const { memory } = setup();
  memory.remember({ id: 'synthetic-preference', text: 'The fictional user prefers blue notebooks' }, yes);
  const fresh = new Memory(new SyntheticStore(JSON.parse(JSON.stringify(memory.read()))));
  assert.deepEqual(fresh.read(), memory.read());
  const copy = fresh.read(); copy.facts[0].text = 'changed';
  assert.notEqual(fresh.read().facts[0].text, 'changed');
});

const statuses: Status[] = ['active', 'waiting', 'snoozed', 'resolved'];
const commands: Command[] = [{ type: 'activate' }, { type: 'wait' }, { type: 'snooze', until: now + 1000 }, { type: 'resolve' }];
for (const status of statuses) for (const command of commands) {
  test(`${status} -> ${command.type}`, () => {
    const { memory } = setup();
    if (status !== 'active') memory.transition(input.id, status === 'waiting' ? { type: 'wait' } : status === 'resolved' ? { type: 'resolve' } : { type: 'snooze', until: now + 500 }, now, yes);
    if (status === 'resolved' && command.type !== 'resolve') {
      assert.throws(() => memory.transition(input.id, command, now, yes), error('TRANSITION')); return;
    }
    const c = memory.transition(input.id, command, now, yes);
    assert.equal(c.status, command.type === 'activate' ? 'active' : command.type === 'wait' ? 'waiting' : command.type === 'resolve' ? 'resolved' : 'snoozed');
  });
}

test('all mutation methods deny missing approval without changing state', () => {
  const { memory } = setup(); const before = memory.read();
  for (const operation of [
    () => memory.remember({ id: 'fact', text: 'Synthetic fact' }),
    () => memory.create(input, now), () => memory.transition(input.id, { type: 'resolve' }, now),
    () => memory.claim(input.id, now), () => memory.settle('key', 1, 'sent'),
  ]) assert.throws(operation, error('DENIED'));
  assert.deepEqual(memory.read(), before);
});

test('duplicate creation and fact retries are idempotent; conflicting IDs fail', () => {
  const { memory } = setup(); memory.create(input, now, yes);
  memory.remember({ id: 'fact', text: 'Synthetic fact' }, yes);
  memory.remember({ id: 'fact', text: 'Synthetic fact' }, yes);
  assert.equal(memory.read().commitments.length, 1); assert.equal(memory.read().facts.length, 1);
  assert.throws(() => memory.create({ ...input, text: 'Other synthetic task' }, now, yes), error('CONFLICT'));
  assert.throws(() => memory.remember({ id: 'fact', text: 'Different fact' }, yes), error('CONFLICT'));
});

test('waiting, resolved, future-due and snoozed commitments do not alert early', () => {
  for (const type of ['wait', 'resolve'] as const) {
    const { memory } = setup(); memory.transition(input.id, { type }, now, yes);
    assert.equal(memory.claim(input.id, now + DAY, yes), null);
  }
  const { memory } = setup();
  memory.create({ ...input, id: 'future', dueAt: now + DAY }, now, yes);
  assert.equal(memory.claim('future', now, yes), null);
  memory.transition(input.id, { type: 'snooze', until: now + 1000 }, now, yes);
  assert.equal(memory.claim(input.id, now + 999, yes), null);
  assert.ok(memory.claim(input.id, now + 1000, yes));
  assert.equal(memory.read().commitments[0].status, 'active');
});

test('shared store reserves once; sent ledger survives restart and allows next UTC day', () => {
  const { memory, store } = setup(); const second = new Memory(store);
  const r = memory.claim(input.id, now, yes)!;
  assert.equal(second.claim(input.id, now, yes), null);
  memory.settle(r.key, r.attempts, 'sent', yes); memory.settle(r.key, r.attempts, 'sent', yes);
  memory.transition(input.id, { type: 'wait' }, now, yes);
  memory.transition(input.id, { type: 'activate' }, now, yes);
  const fresh = new Memory(new SyntheticStore(JSON.parse(JSON.stringify(memory.read()))));
  assert.equal(fresh.claim(input.id, now + 1000, yes), null);
  assert.ok(fresh.claim(input.id, now + DAY, yes));
});

test('confirmed failure retries with backoff, caps attempts, fences stale acknowledgements', () => {
  const { memory } = setup(); let r = memory.claim(input.id, now, yes)!;
  memory.settle(r.key, 1, 'failed', yes);
  assert.equal(memory.claim(input.id, now + RETRY_DELAY - 1, yes), null);
  for (let attempt = 2; attempt <= 3; attempt++) {
    r = memory.claim(input.id, now + (attempt - 1) * RETRY_DELAY, yes)!;
    assert.equal(r.attempts, attempt);
    assert.throws(() => memory.settle(r.key, attempt - 1, 'sent', yes), error('CONFLICT'));
    memory.settle(r.key, attempt, 'failed', yes);
  }
  assert.equal(memory.claim(input.id, now + 3 * RETRY_DELAY, yes), null);
});

test('pending crash and unknown delivery block retries even on later days after restart', () => {
  for (const outcome of ['pending', 'unknown'] as const) {
    const { memory } = setup(); const r = memory.claim(input.id, now, yes)!;
    if (outcome === 'unknown') memory.settle(r.key, 1, outcome, yes);
    const fresh = new Memory(new SyntheticStore(memory.read()));
    assert.equal(fresh.claim(input.id, now + DAY, yes), null);
  }
});

test('load/transaction failures are explicit, sanitized, and atomic', () => {
  const base = new SyntheticStore(); let fail = false;
  const store: Store = { load: () => base.load(), transact: change => base.transact(s => {
    const result = change(s);
    if (fail) throw new Error('private provider detail');
    return result;
  }) };
  const memory = new Memory(store); memory.create(input, now, yes); fail = true;
  assert.throws(() => memory.claim(input.id, now, yes), error('STORAGE'));
  assert.equal(memory.read().reminders.length, 0);
  fail = false; const r = memory.claim(input.id, now, yes)!; fail = true;
  assert.throws(() => memory.settle(r.key, 1, 'sent', yes), error('STORAGE'));
  assert.equal(memory.read().reminders[0].status, 'pending');
  const broken = new Memory({ load: () => { throw new Error('private detail'); }, transact: () => { throw new Error('private detail'); } });
  assert.throws(() => broken.read(), error('STORAGE'));
});

test('malformed/versioned snapshots fail closed instead of resetting memory', () => {
  for (const bad of [null, {}, { ...emptySnapshot(), version: 2 }, { ...emptySnapshot(), extra: true }, { ...emptySnapshot(), facts: [{ id: 'bad', text: '' }] }]) {
    assert.throws(() => parseSnapshot(bad), error('INVALID'));
  }
  const { memory } = setup(); const valid = memory.read();
  const mutations: ((s: Snapshot) => void)[] = [
    s => { s.commitments[0].dueAt = NaN; }, s => { s.commitments[0].status = 'bad' as Status; },
    s => { s.commitments.push(s.commitments[0]); }, s => { s.commitments[0].snoozedUntil = now; },
    s => { s.commitments[0].text = ''; },
  ];
  for (const mutate of mutations) { const s = structuredClone(valid); mutate(s); assert.throws(() => parseSnapshot(s), error('INVALID')); }
  memory.claim(input.id, now, yes); const corrupt = memory.read(); corrupt.reminders[0].key = 'forged';
  assert.throws(() => parseSnapshot(corrupt), error('INVALID'));
});

test('invalid commands, dates, stale clock, and missing IDs leave state unchanged', () => {
  const { memory } = setup(); const before = memory.read();
  for (const command of [{ type: 'delete' }, { type: 'snooze', until: now }, { type: 'resolve', extra: true }]) {
    assert.throws(() => memory.transition(input.id, command as Command, now, yes), error('INVALID'));
  }
  assert.throws(() => memory.claim(input.id, now - 1, yes), error('INVALID'));
  assert.throws(() => memory.transition('missing', { type: 'wait' }, now, yes), error('NOT_FOUND'));
  assert.throws(() => memory.claim('missing', now, yes), error('NOT_FOUND'));
  assert.throws(() => memory.create({ ...input, dueAt: Infinity }, now, yes), error('INVALID'));
  assert.deepEqual(memory.read(), before);
});
