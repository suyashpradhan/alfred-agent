import { parseSnapshot } from './memory.ts';
import type { Commitment, Store } from './memory.ts';
import { SqliteStore } from './sqlite-store.ts';

export const MAX_PREVIEW_ITEMS = 20;
export type Preview = { ok: true; text: string; shown: number; omitted: number } |
  { ok: false; code: 'INVALID_TIME' | 'MEMORY_UNAVAILABLE' | 'CLOCK_BEHIND'; text: string };
type Section = 'Due' | 'Waiting' | 'Snoozed' | 'Upcoming';
type Item = { commitment: Commitment; section: Section; reason: string; orderAt: number };
const sections: Section[] = ['Due', 'Waiting', 'Snoozed', 'Upcoming'];
const heading = 'Alfred — Synthetic evening briefing preview';
const sources = ['Calendar: Not connected.', 'Gmail: Not connected.'];
const footer = 'Preview only. No notifications sent; no memory or reminder changes.';
function validTime(now: number): boolean {
  return Number.isSafeInteger(now) && now >= 0 && now <= 8_640_000_000_000_000;
}
function failed(code: Extract<Preview, { ok: false }>['code']): Preview {
  const message = code === 'INVALID_TIME' ? 'Preview unavailable: invalid preview time.' :
    code === 'CLOCK_BEHIND' ? 'Preview unavailable: preview time predates stored activity.' :
    'Commitments unavailable: memory could not be read or validated. Task status is unknown.';
  return { ok: false, code, text: [heading, message, ...sources, footer].join('\n') };
}
const iso = (time: number) => new Date(time).toISOString();
// Plain-text rendering only. Keep stored text on one quoted line and neutralize
// terminal controls/bidi formatting so it cannot impersonate headings or outcomes.
function quote(text: string): string {
  return JSON.stringify(text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' '));
}
function classify(c: Commitment, now: number): Item | null {
  if (c.status === 'resolved') return null;
  if (c.status === 'waiting') return { commitment: c, section: 'Waiting', orderAt: c.dueAt,
    reason: 'Marked waiting; informational only, not an action reminder.' };
  if (c.status === 'snoozed' && c.snoozedUntil! > now) return { commitment: c, section: 'Snoozed',
    orderAt: c.snoozedUntil!, reason: `Snoozed until ${iso(c.snoozedUntil!)}; not actionable yet.` };
  const expired = c.status === 'snoozed' ? 'Snooze has elapsed; ' : '';
  return c.dueAt <= now
    ? { commitment: c, section: 'Due', orderAt: c.dueAt, reason: `${expired}due at ${iso(c.dueAt)} (at or before preview time).` }
    : { commitment: c, section: 'Upcoming', orderAt: c.dueAt, reason: `${expired}due at ${iso(c.dueAt)}; not due yet.` };
}

/** A deterministic, read-only view of one validated snapshot. No LLM, clock or sender. */
export function previewBriefing(source: Pick<Store, 'load'>, now: number): Preview {
  if (!validTime(now)) return failed('INVALID_TIME');
  let snapshot;
  try { snapshot = parseSnapshot(source.load()); } catch { return failed('MEMORY_UNAVAILABLE'); }
  if (snapshot.commitments.some(c => c.updatedAt > now) || snapshot.reminders.some(r => r.attemptedAt > now)) {
    return failed('CLOCK_BEHIND');
  }
  const items = snapshot.commitments.map(c => classify(c, now)).filter((item): item is Item => item !== null);
  items.sort((a, b) => sections.indexOf(a.section) - sections.indexOf(b.section) || a.orderAt - b.orderAt ||
    (a.commitment.id < b.commitment.id ? -1 : a.commitment.id > b.commitment.id ? 1 : 0));
  const visible = items.slice(0, MAX_PREVIEW_ITEMS), omitted = items.length - visible.length;
  const lines = [heading, `As of: ${iso(now)} (UTC)`, ...sources];
  if (!items.length) lines.push('No unresolved commitments in the loaded memory.');
  for (const section of sections) {
    const group = visible.filter(item => item.section === section);
    if (!group.length) continue;
    lines.push('', `${section}:`);
    for (const item of group) lines.push(`- [${item.commitment.id}] ${quote(item.commitment.text)} — ${item.reason}`);
  }
  if (omitted) lines.push('', `${omitted} additional unresolved commitment(s) omitted from this bounded preview.`);
  lines.push('', footer);
  return { ok: true, text: lines.join('\n'), shown: visible.length, omitted };
}

/** Host-configured synthetic database only. Never create or open it for writes. */
export function previewSqliteBriefing(path: string, now: number): Preview {
  if (!validTime(now)) return failed('INVALID_TIME');
  try {
    const store = SqliteStore.open(path, { readOnly: true });
    try { return previewBriefing(store, now); } finally { store.close(); }
  } catch { return failed('MEMORY_UNAVAILABLE'); }
}
