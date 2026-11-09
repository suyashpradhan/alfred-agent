import { Memory, SyntheticStore } from '../../src/memory.ts';
const memory = new Memory(new SyntheticStore());
const now = Date.parse('2026-11-09T12:00:00Z');
memory.create({ id: 'synthetic-task', text: 'Synthetic reminder', dueAt: now }, now, { approved: true });
const policy = { timeZone: 'Asia/Kolkata', start: '22:00', end: '07:00' };
for (const instant of ['2026-11-09T16:30:00Z', '2026-11-10T01:30:00Z']) {
  console.log(JSON.stringify({ synthetic: true, instant, policy,
    reminders: memory.eligibilityPreview(Date.parse(instant), policy) }));
}
console.log('Read-only eligibility preview. No reminders reserved or messages sent.');
