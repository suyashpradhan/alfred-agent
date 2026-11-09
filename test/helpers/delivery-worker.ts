// Cloud test worker only. No network or actual message delivery.
import { Memory } from '../../src/memory.ts';
import { SqliteStore } from '../../src/sqlite-store.ts';
import { simulateReminder } from '../../src/delivery-simulation.ts';
const [path, mode] = process.argv.slice(2);
process.send?.({ ready: true });
process.once('message', async () => {
  let store: SqliteStore | undefined;
  try {
    store = SqliteStore.open(path);
    const result = await simulateReminder(new Memory(store), 'task', Date.UTC(2026, 10, 9, 12),
      { timeZone: 'Asia/Kolkata', start: '22:00', end: '07:00' },
      mode === 'crash' ? 'crash_after_delivery' : 'success', { approved: true });
    process.send?.({ result });
    if (mode === 'crash') {
      setInterval(() => {}, 1000); // parent kills after the durable pending reservation
      return;
    }
    store.close(); process.disconnect();
  } catch {
    store?.close(); process.send?.({ failure: true }); process.exitCode = 1; process.disconnect();
  }
});
