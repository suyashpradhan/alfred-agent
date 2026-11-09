// Cloud-only synthetic workflow. There is deliberately no messaging provider.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Memory } from '../../src/memory.ts';
import { SqliteStore } from '../../src/sqlite-store.ts';

const dir = mkdtempSync(join(tmpdir(), 'alfred-recovery-example-'));
try {
  const store = SqliteStore.create(join(dir, 'synthetic.sqlite'), { approved: true });
  try {
    const memory = new Memory(store), now = Date.UTC(2026, 10, 9, 12), yes = { approved: true } as const;
    memory.create({ id: 'library-book', text: 'Return the fictional library book', dueAt: now }, now, yes);
    memory.claim('library-book', now, yes); // reservation only, no send
    const blocked = memory.blockedReminders()[0];
    console.log('Synthetic recovery queue:', JSON.stringify(blocked));
    const request = { id: 'synthetic-review-one', reminderKey: blocked.reminder.key,
      attempt: blocked.reminder.attempts, expectedStatus: 'pending' as const,
      expectedReview: blocked.reviewVersion, outcome: 'uncertain' as const,
      reviewer: 'synthetic-human', evidence: 'Synthetic scenario: delivery outcome cannot be established' };
    console.log('Review receipt:', JSON.stringify(memory.reviewReminder(request, now, yes)));
    console.log('Exact replay:', JSON.stringify(memory.reviewReminder(request, now + 1, yes)));
    console.log('Still blocked:', memory.blockedReminders().length);
    console.log('No messages sent. No external accounts connected.');
  } finally { store.close(); }
} finally { rmSync(dir, { recursive: true, force: true }); }
