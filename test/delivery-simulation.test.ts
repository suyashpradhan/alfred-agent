import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Memory, MemoryError, SyntheticStore, DAY, RETRY_DELAY } from '../src/memory.ts';
import type { Store } from '../src/memory.ts';
import { SqliteStore } from '../src/sqlite-store.ts';
import { simulateReminder, formatSimulation } from '../src/delivery-simulation.ts';
import type { SimulationResult, SimulationScenario } from '../src/delivery-simulation.ts';
const yes = { approved: true } as const;
const now = Date.UTC(2026, 10, 9, 12);
const policy = { timeZone: 'Asia/Kolkata', start: '22:00', end: '07:00' };
const error = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code;
function fixture(t: TestContext, kind: 'synthetic' | 'sqlite' = 'sqlite') {
  const dir = mkdtempSync(join(tmpdir(), 'alfred-simulation-')), path = join(dir, 'memory.sqlite');
  const store = kind === 'sqlite' ? SqliteStore.create(path, yes) : new SyntheticStore();
  const memory = new Memory(store);
  memory.create({ id: 'task', text: 'Synthetic private content', dueAt: now }, now, yes);
  t.after(() => { if (store instanceof SqliteStore) store.close(); rmSync(dir, { recursive: true, force: true }); });
  return { path, store, memory };
}
const run = (m: Memory, scenario: SimulationScenario = 'success', at = now) =>
  simulateReminder(m, 'task', at, policy, scenario, yes);

for (const kind of ['synthetic', 'sqlite'] as const) {
  test(`${kind}: success records outcome and replay does not attempt again`, async t => {
    const { memory } = fixture(t, kind);
    const first = await run(memory);
    assert.equal(first.status, 'completed'); assert.equal(first.attempted, true);
    assert.equal(first.outcomeSaved, true); assert.equal(first.simulatedDelivery, 'delivered');
    assert.equal(memory.read().reminders[0].status, 'sent');
    const replay = await run(memory);
    assert.equal(replay.reason, 'already_delivered'); assert.equal(replay.attempted, false);
    assert.equal(memory.read().reminders[0].attempts, 1);
    assert.doesNotMatch(formatSimulation(first), /private content/);
  });
  test(`${kind}: confirmed failure retries only after cooldown and respects the cap`, async t => {
    const { memory } = fixture(t, kind);
    for (let i = 0; i < 3; i++) {
      const result = await run(memory, 'confirmed_failure', now + i * RETRY_DELAY);
      assert.equal(result.attempt, i + 1); assert.equal(result.simulatedDelivery, 'not_delivered');
      assert.equal(result.outcomeSaved, true); assert.equal(result.needsReview, false);
      assert.equal((await run(memory, 'success', now + i * RETRY_DELAY + 1)).reason, 'cooldown');
    }
    const capped = await run(memory, 'success', now + 3 * RETRY_DELAY);
    assert.equal(capped.reason, 'attempt_limit'); assert.equal(capped.attempted, false);
  });
  for (const scenario of ['timeout', 'crash_after_delivery'] as const) {
    test(`${kind}: ${scenario} blocks after reopen and across days until review`, async t => {
      const { memory, store, path } = fixture(t, kind);
      const first = await run(memory, scenario);
      assert.equal(first.needsReview, true);
      assert.equal(first.outcomeSaved, scenario === 'timeout');
      assert.equal(memory.read().reminders[0].status, scenario === 'timeout' ? 'unknown' : 'pending');
      const snapshot = memory.read();
      if (store instanceof SqliteStore) store.close();
      const reopened = kind === 'sqlite' ? SqliteStore.open(path) : new SyntheticStore(snapshot);
      try {
        const fresh = new Memory(reopened), blocked = await run(fresh, 'success', now + DAY);
        assert.equal(blocked.reason, 'delivery_unresolved'); assert.equal(blocked.attempted, false);
        const item = fresh.blockedReminders()[0];
        fresh.reviewReminder({ id: 'review', reminderKey: item.reminder.key, attempt: 1,
          expectedStatus: scenario === 'timeout' ? 'unknown' : 'pending', expectedReview: 0,
          outcome: 'delivered', reviewer: 'synthetic-reviewer', evidence: 'Synthetic confirmation' }, now + DAY, yes);
        assert.equal((await run(fresh, 'success', now + DAY)).reason, 'already_delivered');
      } finally { if (reopened instanceof SqliteStore) reopened.close(); }
    });
  }
}
test('quiet hours and waiting/resolved/snoozed states prevent any fake attempt', async t => {
  const { memory } = fixture(t); const before = memory.read();
  assert.equal((await run(memory, 'success', Date.UTC(2026, 10, 9, 17))).reason, 'quiet_hours');
  assert.deepEqual(memory.read(), before);
  for (const command of [{ type: 'wait' } as const, { type: 'snooze', until: now + DAY } as const, { type: 'resolve' } as const]) {
    memory.transition('task', command, now, yes);
    assert.equal((await run(memory)).attempted, false);
  }
  assert.equal(memory.read().reminders.length, 0);
});
test('invalid input and denied approval fail before reservation', async t => {
  const { memory } = fixture(t); const before = memory.read();
  await assert.rejects(simulateReminder(memory, 'task', now, policy, 'success'), error('DENIED'));
  await assert.rejects(simulateReminder(memory, 'task', now, policy, 'success', Object.create(yes)), error('DENIED'));
  await assert.rejects(simulateReminder(memory, 'task', now, policy, 'send-real' as never, yes), error('INVALID'));
  await assert.rejects(simulateReminder(memory, 'task', now, { ...policy, timeZone: 'Missing/Zone' }, 'success', yes), error('INVALID'));
  await assert.rejects(run(memory, 'success', NaN), error('INVALID'));
  await assert.rejects(simulateReminder(memory, 'missing', now, policy, 'success', yes), error('NOT_FOUND'));
  assert.deepEqual(memory.read(), before);
});
test('overlapping runs reserve once while outcome persistence is pending', async t => {
  const { memory } = fixture(t);
  const results = await Promise.all([run(memory), run(memory), run(memory)]);
  assert.equal(results.filter(r => r.attempted).length, 1);
  assert.equal(results.filter(r => r.reason === 'delivery_unresolved').length, 2);
  assert.equal(memory.read().reminders[0].attempts, 1);
});
test('stale eligible preview cannot bypass transactional recheck', async t => {
  const { memory, store } = fixture(t);
  const racing: Store = { load: () => store.load(), transact: change => {
    memory.claimWithPolicy('task', now, policy, yes);
    return store.transact(change);
  } };
  const result = await run(new Memory(racing));
  assert.equal(result.reason, 'state_changed'); assert.equal(result.attempted, false);
  assert.equal(memory.read().reminders[0].attempts, 1);
});
test('reservation save failure prevents fake delivery and rolls back', async t => {
  const { store, memory } = fixture(t); const before = memory.read();
  const failing: Store = { load: () => store.load(), transact: change => store.transact(s => {
    change(s); throw new Error('private storage detail');
  }) };
  const result = await run(new Memory(failing));
  assert.equal(result.reason, 'reservation_failed'); assert.equal(result.attempted, false);
  assert.doesNotMatch(JSON.stringify(result), /private/); assert.deepEqual(memory.read(), before);
});
test('SQL settlement failure leaves pending; reopening cannot resend', async t => {
  const { memory, path, store } = fixture(t);
  const inFlight = run(memory); // fake delivery happened; settlement awaits a microtask
  const db = new DatabaseSync(path);
  db.exec("CREATE TRIGGER fail_settle BEFORE UPDATE ON memory_state BEGIN SELECT RAISE(ABORT, 'synthetic private detail'); END;");
  const result = await inFlight;
  assert.equal(result.reason, 'outcome_save_failed'); assert.equal(result.simulatedDelivery, 'delivered');
  assert.equal(result.outcomeSaved, false); assert.equal(result.needsReview, true);
  db.exec('DROP TRIGGER fail_settle'); db.close(); (store as SqliteStore).close();
  const fresh = SqliteStore.open(path);
  try {
    assert.equal((await run(new Memory(fresh), 'success', now + DAY)).attempted, false);
    assert.equal(new Memory(fresh).read().reminders[0].status, 'pending');
  } finally { fresh.close(); }
});
test('review during pending settlement fences the stale callback', async t => {
  const { memory } = fixture(t); const inFlight = run(memory);
  const item = memory.blockedReminders()[0];
  memory.reviewReminder({ id: 'review', reminderKey: item.reminder.key, attempt: 1,
    expectedStatus: 'pending', expectedReview: 0, outcome: 'uncertain',
    reviewer: 'synthetic', evidence: 'Synthetic review race' }, now, yes);
  assert.equal((await inFlight).reason, 'outcome_save_failed');
  assert.equal(memory.read().reminders[0].status, 'unknown');
  assert.equal((await run(memory, 'success', now + DAY)).attempted, false);
});
test('source failures never become an empty successful run', async () => {
  const memory = new Memory({ load: () => { throw new Error('private detail'); },
    transact: () => { throw new Error('must not reserve'); } });
  await assert.rejects(run(memory), error('STORAGE'));
});

function worker(t: TestContext, path: string, mode: string) {
  const child = fork(new URL('./helpers/delivery-worker.ts', import.meta.url), [path, mode],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  let readyResolve!: () => void, resolve!: (r: SimulationResult) => void, reject!: (e: Error) => void;
  const ready = new Promise<void>(r => { readyResolve = r; });
  const result = new Promise<SimulationResult>((r, j) => { resolve = r; reject = j; });
  void result.catch(() => {});
  child.on('message', (m: { ready?: boolean; failure?: boolean; result?: SimulationResult }) => {
    if (m.ready) readyResolve();
    else if (m.result) resolve(m.result);
    else reject(new Error('Synthetic worker failure'));
  });
  child.on('error', () => { readyResolve(); reject(new Error('Synthetic worker unavailable')); });
  const exited = new Promise<void>(r => child.once('exit', () => {
    clearTimeout(timer); readyResolve(); reject(new Error('Synthetic worker exited')); r();
  }));
  return { ready, result, exited, go: () => child.send('go'), kill: () => child.kill('SIGKILL') };
}
test('two independent SQLite processes make at most one fake attempt', async t => {
  const { path, memory } = fixture(t);
  const a = worker(t, path, 'success'), b = worker(t, path, 'success');
  await Promise.all([a.ready, b.ready]); a.go(); b.go();
  const results = await Promise.all([a.result, b.result]);
  await Promise.all([a.exited, b.exited]);
  assert.equal(results.filter(r => r.attempted).length, 1);
  assert.equal(memory.read().reminders[0].attempts, 1);
});
test('process killed after fake delivery retains pending reservation and cannot resend', async t => {
  const { path, memory } = fixture(t);
  const child = worker(t, path, 'crash'); await child.ready; child.go();
  const result = await child.result; assert.equal(result.simulatedDelivery, 'delivered');
  child.kill(); await child.exited;
  assert.equal(memory.read().reminders[0].status, 'pending');
  const restarted = worker(t, path, 'success'); await restarted.ready; restarted.go();
  assert.equal((await restarted.result).attempted, false); await restarted.exited;
});
