// Run only in cloud development. Setup writes a disposable synthetic fixture;
// previewSqliteBriefing itself opens that fixture read-only. Always clean up.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Memory } from '../../src/memory.ts';
import { SqliteStore } from '../../src/sqlite-store.ts';
import { previewSqliteBriefing } from '../../src/briefing.ts';

const dir = mkdtempSync(join(tmpdir(), 'alfred-preview-example-'));
try {
  const path = join(dir, 'synthetic.sqlite');
  const store = SqliteStore.create(path, { approved: true });
  const now = Date.UTC(2026, 10, 9, 14, 30), yes = { approved: true } as const;
  try {
    const memory = new Memory(store);
    memory.create({ id: 'library-book', text: 'Return the fictional library book', dueAt: now }, now, yes);
    memory.create({ id: 'appointment', text: 'Response about the imaginary appointment', dueAt: now }, now, yes);
    memory.transition('appointment', { type: 'wait' }, now, yes);
    memory.create({ id: 'notebook', text: 'Choose a fictional notebook', dueAt: now }, now, yes);
    memory.transition('notebook', { type: 'snooze', until: now + 86400000 }, now, yes);
  } finally { store.close(); }
  const result = previewSqliteBriefing(path, now);
  console.log(result.text);
  if (!result.ok) process.exitCode = 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
