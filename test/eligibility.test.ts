import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { quietAt } from '../src/quiet-hours.ts';
import { Memory, MemoryError, SyntheticStore, DAY, RETRY_DELAY } from '../src/memory.ts';
import type { Store } from '../src/memory.ts';
import { SqliteStore } from '../src/sqlite-store.ts';
const yes = { approved: true } as const;
const policy = { timeZone: 'Asia/Kolkata', start: '22:00', end: '07:00' };
const at = (s: string) => Date.parse(s);
const now = at('2026-11-09T12:00:00Z');
const error = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
const create = (store: Store) => {
  const m = new Memory(store);
  m.create({ id: 'task', text: 'Synthetic task', dueAt: now }, now, yes);
  return m;
};
test('overnight boundaries are inclusive at start and exclusive at end in explicit timezone', () => {
  for (const [date, expected] of [
    ['2026-11-09T16:29:59.999Z', false], ['2026-11-09T16:30:00Z', true],
    ['2026-11-09T18:30:00Z', true], ['2026-11-10T01:29:59.999Z', true],
    ['2026-11-10T01:30:00Z', false],
  ] as const) assert.equal(quietAt(policy, at(date)), expected);
});
test('same-day interval and fractional-offset timezone', () => {
  const p = { timeZone: 'Asia/Kathmandu', start: '12:00', end: '13:00' };
  assert.equal(quietAt(p, at('2026-11-09T06:14:59Z')), false);
  assert.equal(quietAt(p, at('2026-11-09T06:15:00Z')), true);
  assert.equal(quietAt(p, at('2026-11-09T07:15:00Z')), false);
});
test('spring gap uses actual local time without inventing a missing end instant', () => {
  const p = { timeZone: 'America/New_York', start: '01:30', end: '02:30' };
  assert.equal(quietAt(p, at('2026-03-08T06:29:59Z')), false);
  assert.equal(quietAt(p, at('2026-03-08T06:30:00Z')), true);
  assert.equal(quietAt(p, at('2026-03-08T06:59:59Z')), true);
  assert.equal(quietAt(p, at('2026-03-08T07:00:00Z')), false);
});
test('fall fold applies quiet hours to both occurrences of the repeated hour', () => {
  const p = { timeZone: 'America/New_York', start: '01:00', end: '02:00' };
  for (const date of ['2026-11-01T05:00:00Z', '2026-11-01T05:59:59Z',
    '2026-11-01T06:00:00Z', '2026-11-01T06:59:59Z']) assert.equal(quietAt(p, at(date)), true);
  assert.equal(quietAt(p, at('2026-11-01T07:00:00Z')), false);
});
test('invalid policies and times fail closed without evaluating accessors', () => {
  let called = false;
  const accessor = { ...policy, get start() { called = true; return '22:00'; } };
  for (const p of [undefined, null, {}, [], { ...policy, timeZone: 'Missing/Zone' },
    { ...policy, timeZone: '+05:30' }, { ...policy, timeZone: '' }, { ...policy, start: '7:00' },
    { ...policy, end: '24:00' }, { ...policy, end: '22:00' }, { ...policy, extra: 1 },
    Object.create(policy), accessor, { ...policy, [Symbol('extra')]: true }]) {
    assert.throws(() => quietAt(p, now), /INVALID_POLICY/);
    assert.throws(() => new Memory(new SyntheticStore()).eligibilityPreview(now, p as never), error('INVALID'));
  }
  for (const n of [NaN, Infinity, -1, 0.5, 8_640_000_000_000_001]) assert.throws(() => quietAt(policy, n), /INVALID_POLICY/);
  assert.equal(called, false);
});
for (const kind of ['synthetic', 'sqlite'] as const) {
  test(`${kind}: preview is read-only; quiet deferral does not consume attempts or wake a snooze`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'alfred-quiet-')), path = join(dir, 'memory.sqlite');
    const store = kind === 'sqlite' ? SqliteStore.create(path, yes) : new SyntheticStore();
    t.after(() => { if (store instanceof SqliteStore) store.close(); rmSync(dir, { recursive: true, force: true }); });
    const m = create(store), quiet = at('2026-11-09T17:00:00Z'), open = at('2026-11-10T01:30:00Z');
    m.transition('task', { type: 'snooze', until: quiet }, now, yes);
    const before = m.read();
    assert.deepEqual(m.eligibilityPreview(quiet, policy), [{ commitmentId: 'task', eligible: false, reason: 'quiet_hours' }]);
    assert.equal(m.claimWithPolicy('task', quiet, policy, yes), null);
    assert.deepEqual(m.read(), before);
    if (store instanceof SqliteStore) {
      const readOnly = SqliteStore.open(path, { readOnly: true });
      try { assert.deepEqual(new Memory(readOnly).eligibilityPreview(quiet, policy), m.eligibilityPreview(quiet, policy)); }
      finally { readOnly.close(); }
    }
    const reopened = kind === 'sqlite' ? SqliteStore.open(path) : new SyntheticStore(store.load());
    try {
      const fresh = new Memory(reopened);
      assert.equal(fresh.claimWithPolicy('task', quiet, policy, yes), null);
      assert.equal(fresh.claimWithPolicy('task', open, policy, yes)!.attempts, 1);
      assert.equal(m.read().commitments[0].status, kind === 'sqlite' ? 'active' : 'snoozed');
      assert.equal(fresh.claimWithPolicy('task', open, policy, yes), null);
    } finally { if (reopened instanceof SqliteStore) reopened.close(); }
  });
}
test('all commitment states explain eligibility in deterministic ID order without leaking text', () => {
  const m = create(new SyntheticStore());
  for (const id of ['waiting', 'resolved', 'snoozed', 'future']) m.create({ id, text: 'PRIVATE SYNTHETIC CONTENT', dueAt: id === 'future' ? now + DAY : now }, now, yes);
  m.transition('waiting', { type: 'wait' }, now, yes);
  m.transition('resolved', { type: 'resolve' }, now, yes);
  m.transition('snoozed', { type: 'snooze', until: now + DAY }, now, yes);
  const before = m.read(), preview = m.eligibilityPreview(now, policy);
  assert.deepEqual(preview.map(p => p.reason), ['not_due', 'resolved', 'snoozed', 'eligible', 'waiting']);
  assert.doesNotMatch(JSON.stringify(preview), /PRIVATE/);
  assert.deepEqual(m.read(), before);
});
test('preview is advisory: a later reservation is rechecked and pending/unknown block across days', () => {
  const m = create(new SyntheticStore());
  assert.equal(m.eligibilityPreview(now, policy)[0].eligible, true);
  const r = m.claimWithPolicy('task', now, policy, yes)!;
  assert.equal(m.claimWithPolicy('task', now, policy, yes), null);
  m.settle(r.key, 1, 'unknown', yes);
  assert.equal(m.eligibilityPreview(now + DAY, policy)[0].reason, 'delivery_unresolved');
  assert.equal(m.claimWithPolicy('task', now + DAY, policy, yes), null);
});
test('timezone changes and local midnight cannot reset UTC duplicate suppression', () => {
  const m = create(new SyntheticStore()), r = m.claimWithPolicy('task', now, policy, yes)!;
  m.settle(r.key, 1, 'sent', yes);
  const other = { timeZone: 'Pacific/Auckland', start: '03:00', end: '04:00' };
  assert.equal(m.eligibilityPreview(now + 3600000, other)[0].reason, 'already_delivered');
  assert.equal(m.claimWithPolicy('task', now + 3600000, other, yes), null);
});
test('retry cooldown and cap survive policy evaluation', () => {
  const m = create(new SyntheticStore());
  for (let i = 0; i < 3; i++) {
    const n = now + i * RETRY_DELAY, r = m.claimWithPolicy('task', n, policy, yes)!;
    assert.equal(r.attempts, i + 1); m.settle(r.key, r.attempts, 'failed', yes);
    assert.equal(m.eligibilityPreview(n + RETRY_DELAY - 1, policy)[0].reason, 'cooldown');
  }
  assert.equal(m.eligibilityPreview(now + 3 * RETRY_DELAY, policy)[0].reason, 'attempt_limit');
  assert.equal(m.claimWithPolicy('task', now + 3 * RETRY_DELAY, policy, yes), null);
});
test('review cooldown and delivered confirmation remain authoritative', () => {
  for (const outcome of ['not_delivered', 'delivered', 'uncertain'] as const) {
    const m = create(new SyntheticStore()), r = m.claimWithPolicy('task', now, policy, yes)!;
    m.reviewReminder({ id: 'review', reminderKey: r.key, attempt: 1, expectedStatus: 'pending',
      expectedReview: 0, outcome, reviewer: 'synthetic', evidence: 'Synthetic decision' }, now + DAY, yes);
    assert.equal(m.eligibilityPreview(now + DAY, policy)[0].reason,
      outcome === 'not_delivered' ? 'cooldown' : outcome === 'delivered' ? 'already_delivered' : 'delivery_unresolved');
    assert.equal(m.claimWithPolicy('task', now + DAY, policy, yes), null);
    assert.throws(() => m.eligibilityPreview(now, policy), error('INVALID'));
  }
});
test('denied, invalid and missing claims cannot change state', () => {
  const m = create(new SyntheticStore()), before = m.read();
  assert.throws(() => m.claimWithPolicy('task', now, policy), error('DENIED'));
  assert.throws(() => m.claimWithPolicy('task', now, policy, Object.create(yes)), error('DENIED'));
  assert.throws(() => m.claimWithPolicy('task', now, undefined as never, yes), error('INVALID'));
  assert.throws(() => m.claimWithPolicy('task', now - 1, policy, yes), error('INVALID'));
  assert.throws(() => m.claimWithPolicy('missing', now, policy, yes), error('NOT_FOUND'));
  assert.deepEqual(m.read(), before);
});
test('storage errors and corrupt snapshots never become an empty eligible preview', () => {
  for (const source of [{ load: () => { throw new Error('private detail'); } }, { load: () => ({}) }]) {
    const m = new Memory({ ...source, transact: () => { throw new Error('private detail'); } });
    assert.throws(() => m.eligibilityPreview(now, policy), e => e instanceof MemoryError && !e.message.includes('private'));
    assert.throws(() => m.claimWithPolicy('task', now, policy, yes), error('STORAGE'));
  }
});
test('failed reservation transaction rolls back and can be retried once', () => {
  const store = new SyntheticStore(), m = create(store), before = m.read();
  const failing: Store = { load: () => store.load(), transact: change => store.transact(s => {
    change(s); throw new Error('synthetic save failure');
  }) };
  assert.throws(() => new Memory(failing).claimWithPolicy('task', now, policy, yes), error('STORAGE'));
  assert.deepEqual(m.read(), before);
  assert.equal(m.claimWithPolicy('task', now, policy, yes)!.attempts, 1);
});
