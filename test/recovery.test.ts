import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { Memory, MemoryError, SyntheticStore, parseSnapshot, DAY, RETRY_DELAY, MAX_ATTEMPTS } from '../src/memory.ts';
import type { RecoveryDecision, Store } from '../src/memory.ts';
import { SqliteStore } from '../src/sqlite-store.ts';
import { previewBriefing } from '../src/briefing.ts';

const yes = { approved: true } as const;
const now = Date.UTC(2026, 10, 9, 12);
const error = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
function setup(kind: 'synthetic' | 'sqlite', t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'alfred-recovery-')), path = join(dir, 'memory.sqlite');
  const store = kind === 'sqlite' ? SqliteStore.create(path, yes) : new SyntheticStore();
  t.after(() => { if (store instanceof SqliteStore) store.close(); rmSync(dir, { force: true, recursive: true }); });
  const memory = new Memory(store);
  memory.create({ id: 'task', text: 'Synthetic recovery task', dueAt: now }, now, yes);
  const reservation = memory.claim('task', now, yes)!;
  function decision(outcome: RecoveryDecision['outcome'], id = 'decision-one'): RecoveryDecision {
    const item = memory.blockedReminders()[0];
    return { id, reminderKey: item.reminder.key, attempt: item.reminder.attempts,
      expectedStatus: item.reminder.status as 'pending' | 'unknown', expectedReview: item.reviewVersion,
      outcome, reviewer: 'synthetic-reviewer', evidence: 'Synthetic fixture confirmation; no provider contacted' };
  }
  return { memory, store, decision, reservation, dir, path };
}

for (const kind of ['synthetic', 'sqlite'] as const) {
  test(`${kind}: queue reads are repeatable and expose reason/history without mutation`, t => {
    const { memory } = setup(kind, t); const before = memory.read();
    const queue = memory.blockedReminders(); assert.equal(queue.length, 1);
    assert.equal(queue[0].reviewVersion, 0); assert.equal(queue[0].attemptHistory[0].attempts, 1);
    assert.match(queue[0].reason, /no confirmed delivery/);
    assert.deepEqual(memory.blockedReminders(), queue);
    queue[0].reminder.status = 'sent'; queue[0].reviews.push({} as never);
    assert.deepEqual(memory.read(), before);
  });

  test(`${kind}: delivered review is audited and suppresses duplicate claims`, t => {
    const { memory, decision, reservation } = setup(kind, t);
    const command = decision('delivered'); const receipt = memory.reviewReminder(command, now + DAY, yes);
    assert.equal(receipt.reviewedAt, now + DAY); assert.equal(memory.blockedReminders().length, 0);
    assert.equal(memory.read().reminders[0].status, 'sent');
    assert.equal(memory.claim('task', now + DAY, yes), null); // also suppress confirmation day
    assert.throws(() => memory.claim('task', now, yes), error('INVALID'));
    assert.throws(() => memory.settle(reservation.key, 1, 'failed', yes), error('CONFLICT'));
    assert.ok(memory.claim('task', now + 2 * DAY, yes)); // future daily reminder policy unchanged
    const before = memory.read(); assert.deepEqual(memory.reviewReminder(command, now + 2 * DAY, yes), receipt);
    assert.deepEqual(memory.read(), before); // exact replay never changes the newer reservation
  });

  test(`${kind}: non-delivery requires cooldown and preserves the attempt cap`, t => {
    const { memory, decision } = setup(kind, t);
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const at = now + (attempt - 1) * RETRY_DELAY;
      memory.reviewReminder(decision('not_delivered', `decision-${attempt}`), at, yes);
      assert.equal(memory.claim('task', at + RETRY_DELAY - 1, yes), null);
      const next = memory.claim('task', at + RETRY_DELAY, yes);
      if (attempt < MAX_ATTEMPTS) assert.equal(next!.attempts, attempt + 1);
      else assert.equal(next, null);
    }
    assert.equal(memory.read().reviews!.length, MAX_ATTEMPTS);
    assert.equal(memory.read().reminders[0].attempts, MAX_ATTEMPTS);
  });

  test(`${kind}: uncertain stays blocked, stale decisions and late callbacks are rejected`, t => {
    const { memory, decision, reservation } = setup(kind, t);
    const stale = decision('delivered', 'stale');
    memory.reviewReminder(decision('uncertain'), now, yes);
    assert.equal(memory.claim('task', now + DAY, yes), null);
    assert.equal(memory.blockedReminders()[0].reviewVersion, 1);
    assert.equal(memory.blockedReminders()[0].reminder.status, 'unknown');
    assert.throws(() => memory.reviewReminder(stale, now, yes), error('CONFLICT'));
    assert.throws(() => memory.settle(reservation.key, 1, 'sent', yes), error('CONFLICT'));
    memory.reviewReminder(decision('delivered', 'fresh'), now + 1, yes);
    assert.equal(memory.read().reviews!.length, 2);
  });

  test(`${kind}: approval, evidence and optimistic concurrency checks fail without mutation`, t => {
    const { memory, decision } = setup(kind, t); const before = memory.read(); const valid = decision('delivered');
    assert.throws(() => memory.reviewReminder(valid, now), error('DENIED'));
    assert.throws(() => memory.reviewReminder(valid, now, Object.create({ approved: true })), error('DENIED'));
    for (const invalid of [{ ...valid, evidence: '' }, { ...valid, reviewer: '' }, { ...valid, outcome: 'retry' },
      { ...valid, extra: true }, { ...valid, attempt: 0 }, { ...valid, expectedReview: -1 }]) {
      assert.throws(() => memory.reviewReminder(invalid as RecoveryDecision, now, yes), error('INVALID'));
    }
    assert.throws(() => memory.reviewReminder({ ...valid, attempt: 2 }, now, yes), error('CONFLICT'));
    assert.throws(() => memory.reviewReminder({ ...valid, expectedReview: 1 }, now, yes), error('CONFLICT'));
    assert.throws(() => memory.reviewReminder(valid, now - 1, yes), error('INVALID'));
    assert.throws(() => memory.reviewReminder({ ...valid, reminderKey: 'missing:1' }, now, yes), error('NOT_FOUND'));
    assert.deepEqual(memory.read(), before);
  });

  test(`${kind}: decision ID reuse with changed content conflicts`, t => {
    const { memory, decision } = setup(kind, t); const command = decision('uncertain');
    memory.reviewReminder(command, now, yes); const before = memory.read();
    for (const changed of [{ ...command, outcome: 'delivered' as const }, { ...command, evidence: 'Changed evidence' },
      { ...command, reviewer: 'another-reviewer' }, { ...command, expectedReview: 1 }]) {
      assert.throws(() => memory.reviewReminder(changed, now, yes), error('CONFLICT'));
    }
    assert.deepEqual(memory.read(), before);
  });

  test(`${kind}: a recovered retry can settle normally while the old attempt stays fenced`, t => {
    const { memory, decision, reservation } = setup(kind, t);
    const command = decision('not_delivered'); memory.reviewReminder(command, now, yes);
    const retry = memory.claim('task', now + RETRY_DELAY, yes)!;
    assert.equal(retry.attempts, 2);
    assert.throws(() => memory.settle(reservation.key, 1, 'sent', yes), error('CONFLICT'));
    memory.settle(retry.key, 2, 'sent', yes);
    assert.equal(memory.claim('task', now + 2 * RETRY_DELAY, yes), null);
    const before = memory.read(); memory.reviewReminder(command, now + 2 * RETRY_DELAY, yes);
    assert.deepEqual(memory.read(), before);
  });

  test(`${kind}: recovery never activates waiting/snoozed/resolved commitments`, t => {
    for (const command of [{ type: 'wait' } as const, { type: 'snooze', until: now + DAY } as const, { type: 'resolve' } as const]) {
      const f = setup(kind, t); f.memory.transition('task', command, now, yes);
      f.memory.reviewReminder(f.decision('not_delivered'), now, yes);
      assert.equal(f.memory.claim('task', now + RETRY_DELAY, yes), null);
    }
  });

  test(`${kind}: restarted sessions preserve decisions, blocked state and exact replays`, t => {
    const { memory, store, decision, path } = setup(kind, t); const command = decision('uncertain');
    const receipt = memory.reviewReminder(command, now, yes);
    if (store instanceof SqliteStore) store.close();
    const reopened = kind === 'sqlite' ? SqliteStore.open(path) : new SyntheticStore(JSON.parse(JSON.stringify(store.load())));
    try {
      const fresh = new Memory(reopened); assert.equal(fresh.claim('task', now + DAY, yes), null);
      assert.deepEqual(fresh.reviewReminder(command, now + DAY, yes), receipt);
      assert.equal(fresh.read().reviews!.length, 1);
      assert.equal(fresh.blockedReminders()[0].reviews[0].evidence, command.evidence);
    } finally { if (reopened instanceof SqliteStore) reopened.close(); }
  });
}

test('failed storage transaction rolls back both recovery outcome and audit', t => {
  const { store, memory, decision } = setup('sqlite', t); const before = memory.read();
  const failing: Store = { load: () => store.load(), transact: change => store.transact(s => { change(s); throw new Error('synthetic failure'); }) };
  assert.throws(() => new Memory(failing).reviewReminder(decision('delivered'), now, yes), error('STORAGE'));
  assert.deepEqual(memory.read(), before);
});

test('independent SQLite reviewers cannot both apply the same observed version', t => {
  const { memory, decision, path } = setup('sqlite', t); const other = SqliteStore.open(path);
  try {
    const stale = decision('not_delivered', 'second');
    memory.reviewReminder(decision('uncertain', 'first'), now, yes);
    assert.throws(() => new Memory(other).reviewReminder(stale, now, yes), error('CONFLICT'));
    assert.equal(memory.read().reviews!.length, 1);
  } finally { other.close(); }
});

test('backup and read-only restore retain recovery audit and decision identity', t => {
  const { memory, store, decision, dir } = setup('sqlite', t); const command = decision('not_delivered');
  memory.reviewReminder(command, now, yes); const before = memory.read();
  const backup = join(dir, 'backup.sqlite'), dest = join(dir, 'restore.sqlite');
  (store as SqliteStore).backupTo(backup, yes); const restored = SqliteStore.restore(backup, dest, yes);
  try {
    assert.deepEqual(restored.load(), before);
    assert.throws(() => new Memory(restored).reviewReminder(command, now, yes), error('STORAGE'));
  } finally { restored.close(); }
});

test('malformed audit history fails validation rather than losing recovery safeguards', t => {
  const { memory, decision } = setup('synthetic', t); memory.reviewReminder(decision('uncertain'), now, yes);
  const state = memory.read();
  for (const mutate of [
    (s: typeof state) => { s.reviews!.push(s.reviews![0]); },
    (s: typeof state) => { s.reviews![0].expectedReview = 2; },
    (s: typeof state) => { s.reviews![0].attempt = 2; },
    (s: typeof state) => { s.reviews![0].reviewedAt = now - 1; },
    (s: typeof state) => { s.reviews![0].reminderKey = 'missing:1'; },
    (s: typeof state) => { s.reminders[0].status = 'sent'; },
  ]) { const copy = structuredClone(state); mutate(copy); assert.throws(() => parseSnapshot(copy), error('INVALID')); }
});

test('decision time participates in clock checks, and review data stays out of briefing', t => {
  const { memory, store, decision } = setup('synthetic', t);
  memory.reviewReminder(decision('uncertain'), now + 1000, yes);
  assert.throws(() => memory.transition('task', { type: 'resolve' }, now, yes), error('INVALID'));
  assert.equal(previewBriefing(store, now).ok, false);
  const preview = previewBriefing(store, now + 1000);
  assert.equal(preview.ok, true); assert.doesNotMatch(preview.text, /synthetic-reviewer|Synthetic fixture confirmation/);
});

test('SQL update failure leaves review queue and revision unchanged', t => {
  const { memory, decision, path } = setup('sqlite', t); const before = memory.read();
  const db = new DatabaseSync(path);
  try {
    const revision = db.prepare('SELECT revision FROM memory_state').get()!.revision;
    db.exec("CREATE TRIGGER fail_review BEFORE UPDATE ON memory_state BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;");
    assert.throws(() => memory.reviewReminder(decision('delivered'), now, yes), error('STORAGE'));
    assert.deepEqual(memory.read(), before);
    assert.equal(db.prepare('SELECT revision FROM memory_state').get()!.revision, revision);
  } finally { db.close(); }
});
