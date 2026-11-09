import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Memory, MemoryError, SyntheticStore, DAY, RETRY_DELAY } from '../src/memory.ts';
import { SqliteStore, MAX_SNAPSHOT_BYTES } from '../src/sqlite-store.ts';

const yes = { approved: true } as const;
const now = Date.UTC(2026, 10, 9, 12);
const task = { id: 'synthetic-task', text: 'Return a fictional book', dueAt: now };
const error = (code: string) => (e: unknown) => e instanceof MemoryError && e.code === code && e.message === code;

test('asynchronous callbacks roll back and rejected promises do not escape either store', async t => {
  const { store } = fixture(t);
  for (const adapter of [store, new SyntheticStore()]) {
    const before = adapter.load();
    assert.throws(() => adapter.transact(async s => {
      s.facts.push({ id: 'async-reject', text: 'Must not commit' });
      await Promise.resolve();
      throw new Error('Synthetic asynchronous failure');
    }), error('INVALID'));
    assert.throws(() => adapter.transact(async s => {
      await Promise.resolve();
      s.facts.push({ id: 'async-resolve', text: 'Must not commit' });
    }), error('INVALID'));
    // Let the async continuations and unhandled-rejection processing run.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(adapter.load(), before);
    adapter.transact(s => s.facts.push({ id: 'sync', text: 'A subsequent synchronous update works' }));
  }
});

test('malformed read-only options fail closed without executing getters', t => {
  const { path, memory } = fixture(t); const before = memory.read();
  let getterCalled = false;
  const accessor = Object.defineProperty({}, 'readOnly', { get() { getterCalled = true; return true; } });
  for (const options of [{ readOnly: 'true' }, { readOnly: 0 }, { readonly: true },
    Object.create({ readOnly: true }), accessor, [], null]) {
    assert.throws(() => SqliteStore.open(path, options as { readOnly?: boolean }), error('STORAGE'));
  }
  assert.equal(getterCalled, false); assert.deepEqual(memory.read(), before);
  raw(path, db => assert.equal(db.prepare('SELECT revision FROM memory_state').get()!.revision, 0));
});
function fixture(t: TestContext) {
  const dir = mkdtempSync(join(tmpdir(), 'alfred-synthetic-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'memory.sqlite');
  const store = SqliteStore.create(path, yes);
  t.after(() => store.close());
  const memory = new Memory(store);
  return { dir, path, store, memory };
}
function raw(path: string, operation: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(path);
  try { operation(db); } finally { db.close(); }
}
function child(t: TestContext, mode: string, path: string, id = 'fact') {
  const worker = fork(new URL('./helpers/sqlite-worker.ts', import.meta.url), [mode, path, id], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  t.after(() => { if (worker.exitCode === null) worker.kill('SIGKILL'); });
  const deadline = setTimeout(() => worker.kill('SIGKILL'), 10000);
  let readyResolve!: () => void;
  let resultResolve!: (value: any) => void;
  let resultReject!: (e: Error) => void;
  const ready = new Promise<void>(resolve => { readyResolve = resolve; });
  const result = new Promise<any>((resolve, reject) => { resultResolve = resolve; resultReject = reject; });
  // Attach a handler immediately; early child failures still propagate when awaited.
  void result.catch(() => {});
  worker.on('message', (message: any) => {
    if (message.ready) readyResolve();
    else if (message.failure) resultReject(new Error('Synthetic worker failed'));
    else resultResolve(message);
  });
  worker.on('error', () => { readyResolve(); resultReject(new Error('Synthetic worker unavailable')); });
  const exited = new Promise<void>(resolve => worker.once('exit', () => {
    clearTimeout(deadline); readyResolve(); resultReject(new Error('Synthetic worker exited without a result')); resolve();
  }));
  return { ready, result, exited, go: () => worker.send('go'), kill: () => worker.kill('SIGKILL') };
}

test('facts, all commitment states, reminder ledger and revision survive process restart', async t => {
  const { path, store, memory } = fixture(t);
  memory.remember({ id: 'fact', text: 'Synthetic preference' }, yes);
  memory.create(task, now, yes);
  memory.transition(task.id, { type: 'wait' }, now, yes);
  assert.equal(memory.claim(task.id, now, yes), null);
  memory.transition(task.id, { type: 'snooze', until: now + 1000 }, now, yes);
  assert.equal(memory.claim(task.id, now + 999, yes), null);
  const r = memory.claim(task.id, now + 1000, yes)!;
  memory.settle(r.key, r.attempts, 'sent', yes);
  memory.transition(task.id, { type: 'resolve' }, now + 1000, yes);
  const expected = memory.read(); store.close();
  const worker = child(t, 'read', path); await worker.ready; worker.go();
  assert.deepEqual((await worker.result).result, expected); await worker.exited;
  raw(path, db => assert.equal(db.prepare('SELECT revision FROM memory_state').get()!.revision, 9));
});

test('competing processes keep both updates instead of losing one', async t => {
  const { path, memory } = fixture(t);
  const a = child(t, 'remember', path, 'fact-a'), b = child(t, 'remember', path, 'fact-b');
  await Promise.all([a.ready, b.ready]); a.go(); b.go();
  await Promise.all([a.result, b.result, a.exited, b.exited]);
  assert.deepEqual(memory.read().facts.map(f => f.id).sort(), ['fact-a', 'fact-b']);
});

test('competing processes reserve one reminder only', async t => {
  const { path, memory } = fixture(t); memory.create(task, now, yes);
  const a = child(t, 'claim', path), b = child(t, 'claim', path);
  await Promise.all([a.ready, b.ready]); a.go(); b.go();
  const results = await Promise.all([a.result, b.result]);
  await Promise.all([a.exited, b.exited]);
  assert.equal(results.filter(r => r.result !== null).length, 1);
  assert.equal(memory.read().reminders.length, 1);
});

test('killed process rolls back an uncommitted SQL write and preserves committed memory', async t => {
  const { path, store, memory } = fixture(t);
  memory.remember({ id: 'committed', text: 'Survives restart' }, yes);
  const expected = memory.read(); store.close();
  const worker = child(t, 'crash', path); await worker.ready; worker.go();
  assert.equal((await worker.result).staged, true); worker.kill(); await worker.exited;
  const fresh = SqliteStore.open(path);
  try { assert.deepEqual(fresh.load(), expected); } finally { fresh.close(); }
});

test('lock timeout fails without mutation; retry after lock release succeeds', t => {
  const { path, memory } = fixture(t);
  raw(path, locker => {
    locker.exec('BEGIN IMMEDIATE');
    const started = performance.now();
    assert.throws(() => memory.create(task, now, yes), error('STORAGE'));
    assert.ok(performance.now() - started < 2000);
    locker.exec('ROLLBACK');
  });
  assert.equal(memory.read().commitments.length, 0);
  memory.create(task, now, yes);
  assert.equal(memory.read().commitments.length, 1);
});

test('SQL write failure rolls back snapshot and revision, sanitizing provider detail', t => {
  const { path, memory } = fixture(t); memory.create(task, now, yes); const before = memory.read();
  raw(path, db => db.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON memory_state BEGIN SELECT RAISE(ABORT, 'synthetic private detail'); END;"));
  assert.throws(() => memory.claim(task.id, now, yes), error('STORAGE'));
  assert.deepEqual(memory.read(), before);
  raw(path, db => { assert.equal(db.prepare('SELECT revision FROM memory_state').get()!.revision, 1); db.exec('DROP TRIGGER fail_write'); });
  assert.ok(memory.claim(task.id, now, yes));
});

test('commit failure caused by reader lock rolls back the entire write', t => {
  const { path, memory } = fixture(t); memory.create(task, now, yes);
  raw(path, reader => {
    reader.exec('BEGIN'); reader.prepare('SELECT payload FROM memory_state').get();
    assert.throws(() => memory.claim(task.id, now, yes), error('STORAGE'));
    reader.exec('ROLLBACK');
  });
  assert.equal(memory.read().reminders.length, 0);
  assert.ok(memory.claim(task.id, now, yes));
});

test('validation failure and callback exceptions roll back, including retained references', t => {
  const { store, memory } = fixture(t); memory.create(task, now, yes); const before = memory.read();
  assert.throws(() => store.transact(s => { s.facts.push({ id: 'bad', text: '' }); }), error('INVALID'));
  assert.throws(() => store.transact(s => { s.commitments.length = 0; throw new Error('synthetic detail'); }), error('STORAGE'));
  assert.throws(() => store.transact(s => { s.commitments.length = 0; return () => {}; }), error('STORAGE'));
  assert.throws(() => store.transact(() => store.transact(() => {})), error('STORAGE'));
  assert.deepEqual(memory.read(), before);
  const returned = store.transact(s => s); returned.commitments.length = 0;
  assert.deepEqual(memory.read(), before);
});

test('approval denials never change database revision or create backups', t => {
  const { path, dir, store, memory } = fixture(t); memory.create(task, now, yes);
  const target = join(dir, 'denied.sqlite');
  for (const operation of [
    () => memory.remember({ id: 'fact', text: 'Synthetic' }), () => memory.create(task, now),
    () => memory.transition(task.id, { type: 'resolve' }, now), () => memory.claim(task.id, now),
    () => memory.settle('key', 1, 'sent'), () => store.backupTo(target),
    () => SqliteStore.create(target), () => SqliteStore.restore(path, target),
  ]) assert.throws(operation, error('DENIED'));
  assert.equal(existsSync(target), false);
  raw(path, db => assert.equal(db.prepare('SELECT revision FROM memory_state').get()!.revision, 1));
});

test('missing, empty, corrupt and unsupported databases fail closed without replacement', t => {
  const { path, dir, store } = fixture(t); store.close();
  const missing = join(dir, 'missing.sqlite');
  assert.throws(() => SqliteStore.open(missing), error('STORAGE')); assert.equal(existsSync(missing), false);
  for (const content of ['', 'not a SQLite database']) {
    const bad = join(dir, 'bad.sqlite'); writeFileSync(bad, content);
    assert.throws(() => SqliteStore.open(bad), error('STORAGE')); assert.equal(readFileSync(bad, 'utf8'), content);
  }
  raw(path, db => db.exec('PRAGMA user_version = 2'));
  const before = readFileSync(path);
  assert.throws(() => SqliteStore.open(path), error('STORAGE'));
  assert.throws(() => SqliteStore.create(path, yes), error('STORAGE'));
  assert.deepEqual(readFileSync(path), before);
});

test('malformed snapshots and missing singleton rows fail closed', t => {
  const { path, store } = fixture(t);
  raw(path, db => db.prepare('UPDATE memory_state SET payload = ?').run('{broken'));
  assert.throws(() => store.load(), error('STORAGE'));
  assert.throws(() => store.transact(() => {}), error('STORAGE'));
  raw(path, db => db.exec('DELETE FROM memory_state'));
  assert.throws(() => store.load(), error('STORAGE'));
});

test('read-only handles deny writes and closed handles fail safely', t => {
  const { path, store, memory } = fixture(t); const readOnly = SqliteStore.open(path, { readOnly: true });
  try { assert.throws(() => new Memory(readOnly).create(task, now, yes), error('STORAGE')); }
  finally { readOnly.close(); }
  assert.equal(memory.read().commitments.length, 0);
  store.close(); assert.throws(() => memory.read(), error('STORAGE'));
  assert.throws(() => memory.create(task, now, yes), error('STORAGE'));
});

test('backup and restore preserve ledger; restored handle is read-only and never overwrites', t => {
  const { dir, path, store, memory } = fixture(t);
  memory.remember({ id: 'fact', text: 'Synthetic backup fact' }, yes); memory.create(task, now, yes);
  const r = memory.claim(task.id, now, yes)!; memory.settle(r.key, 1, 'sent', yes);
  const expected = memory.read(); const backup = join(dir, 'backup.sqlite'), restoredPath = join(dir, 'restored.sqlite');
  store.backupTo(backup, yes);
  memory.transition(task.id, { type: 'resolve' }, now, yes);
  const restored = SqliteStore.restore(backup, restoredPath, yes);
  try {
    assert.deepEqual(restored.load(), expected);
    assert.throws(() => new Memory(restored).claim(task.id, now, yes), error('STORAGE'));
  } finally { restored.close(); }
  // Explicit offline reopening: proves duplicate suppression survives a restore.
  const writable = SqliteStore.open(restoredPath);
  try { assert.equal(new Memory(writable).claim(task.id, now, yes), null); } finally { writable.close(); }
  const preserved = readFileSync(backup);
  assert.throws(() => store.backupTo(backup, yes), error('STORAGE'));
  assert.throws(() => SqliteStore.restore(backup, path, yes), error('STORAGE'));
  assert.deepEqual(readFileSync(backup), preserved);
  assert.equal(memory.read().commitments[0].status, 'resolved');
  assert.equal(statSync(backup).mode & 0o777, 0o600);
});

test('pending and uncertain reminders block after reopen; failure retries retain backoff', t => {
  for (const outcome of ['pending', 'unknown', 'failed'] as const) {
    const dir = mkdtempSync(join(tmpdir(), 'alfred-delivery-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const path = join(dir, 'memory.sqlite'), store = SqliteStore.create(path, yes), memory = new Memory(store);
    memory.create(task, now, yes); const r = memory.claim(task.id, now, yes)!;
    if (outcome !== 'pending') memory.settle(r.key, 1, outcome, yes);
    store.close(); const fresh = SqliteStore.open(path);
    try {
      const next = new Memory(fresh);
      assert.equal(next.claim(task.id, now + RETRY_DELAY - 1, yes), null);
      if (outcome === 'failed') assert.equal(next.claim(task.id, now + RETRY_DELAY, yes)!.attempts, 2);
      else assert.equal(next.claim(task.id, now + DAY, yes), null);
    } finally { fresh.close(); }
  }
});

test('file restrictions, bounded snapshots and revision exhaustion fail without data loss', t => {
  const { path, dir, store } = fixture(t); const before = store.load();
  assert.equal(statSync(path).mode & 0o777, 0o600);
  const link = join(dir, 'link.sqlite'); symlinkSync(path, link);
  assert.throws(() => SqliteStore.open(link), error('STORAGE'));
  assert.throws(() => store.transact(s => {
    for (let i = 0; i < MAX_SNAPSHOT_BYTES / 500; i++) s.facts.push({ id: `fact-${i}`, text: 'x'.repeat(1000) });
  }), error('INVALID'));
  assert.deepEqual(store.load(), before);
  raw(path, db => db.prepare('UPDATE memory_state SET revision = ?').run(Number.MAX_SAFE_INTEGER));
  assert.throws(() => store.transact(s => s.facts.push({ id: 'overflow', text: 'Synthetic' })), error('STORAGE'));
  assert.deepEqual(store.load(), before);
});
