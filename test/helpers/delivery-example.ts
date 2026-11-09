import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Memory, DAY } from '../../src/memory.ts';
import { SqliteStore } from '../../src/sqlite-store.ts';
import { simulateReminder, formatSimulation } from '../../src/delivery-simulation.ts';
const dir = mkdtempSync(join(tmpdir(), 'alfred-delivery-example-')), path = join(dir, 'memory.sqlite');
const yes = { approved: true } as const, now = Date.UTC(2026, 10, 9, 12);
const policy = { timeZone: 'Asia/Kolkata', start: '22:00', end: '07:00' };
let store = SqliteStore.create(path, yes);
try {
  const memory = new Memory(store);
  for (const scenario of ['success', 'confirmed_failure', 'timeout', 'crash_after_delivery'] as const) {
    const id = scenario.replaceAll('_', '-');
    memory.create({ id, text: 'Synthetic delivery fixture', dueAt: now }, now, yes);
    console.log(formatSimulation(await simulateReminder(memory, id, now, policy, scenario, yes)));
  }
  memory.create({ id: 'quiet', text: 'Synthetic quiet task', dueAt: now }, now, yes);
  console.log(formatSimulation(await simulateReminder(memory, 'quiet', now + 5 * 3600000, policy, 'success', yes)));
  store.close(); store = SqliteStore.open(path);
  console.log('After reopening SQLite on the next day:');
  console.log(formatSimulation(await simulateReminder(new Memory(store), 'crash-after-delivery', now + DAY, policy, 'success', yes)));
} finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
