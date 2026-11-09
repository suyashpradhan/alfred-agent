// Synthetic child process used only by the test suite. No network or provider access.
import { DatabaseSync } from 'node:sqlite';
import { Memory, MemoryError } from '../../src/memory.ts';
import { SqliteStore } from '../../src/sqlite-store.ts';

const [mode, path, id] = process.argv.slice(2);
const now = Date.UTC(2026, 10, 9, 12);
const yes = { approved: true } as const;
process.send?.({ ready: true });
process.once('message', () => {
  try {
    if (mode === 'crash') {
      const db = new DatabaseSync(path);
      db.exec('BEGIN IMMEDIATE');
      const row = db.prepare('SELECT payload FROM memory_state WHERE id = 1').get()!;
      const state = JSON.parse(row.payload as string);
      state.facts.push({ id: 'uncommitted', text: 'Must never survive' });
      db.prepare('UPDATE memory_state SET payload = ?, revision = revision + 1 WHERE id = 1').run(JSON.stringify(state));
      process.send?.({ staged: true });
      setInterval(() => {}, 1000); // parent kills this process before COMMIT
      return;
    }
    // The adapter intentionally has a bounded lock wait. A busy CI runner can
    // deschedule the other process longer than that budget. Retry only these
    // synthetic, stable-ID operations, never external delivery or arbitrary work.
    for (let attempt = 0; attempt < 5; attempt++) {
      let store: SqliteStore | undefined;
      try {
        store = SqliteStore.open(path);
        const connected = store;
        // Hold the transaction briefly to ensure overlapping process contention.
        const memory = new Memory({ load: () => connected.load(), transact: change => connected.transact(s => {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
          return change(s);
        }) });
        let result: unknown;
        if (mode === 'read') result = memory.read();
        else if (mode === 'claim') result = memory.claim('synthetic-task', now, yes);
        else { memory.remember({ id, text: 'Synthetic concurrent fact' }, yes); result = true; }
        process.send?.({ result });
        break;
      } catch (e) {
        if (!(e instanceof MemoryError) || e.code !== 'STORAGE' || attempt === 4) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      } finally { store?.close(); }
    }
    process.disconnect();
  } catch {
    process.send?.({ failure: true });
    process.exitCode = 1;
    process.disconnect();
  }
});
