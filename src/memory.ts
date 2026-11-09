/** Offline prototype. All times are integer Unix milliseconds supplied by the caller. */
export type Status = 'active' | 'waiting' | 'snoozed' | 'resolved';
export type Commitment = {
  id: string; text: string; status: Status; dueAt: number; updatedAt: number;
  snoozedUntil: number | null;
};
export type Fact = { id: string; text: string };
export type Reminder = {
  key: string; commitmentId: string; day: number;
  status: 'pending' | 'sent' | 'failed' | 'unknown';
  attempts: number; attemptedAt: number;
};
export type RecoveryDecision = {
  id: string; reminderKey: string; attempt: number; expectedStatus: 'pending' | 'unknown';
  expectedReview: number; outcome: 'delivered' | 'not_delivered' | 'uncertain';
  reviewer: string; evidence: string;
};
export type RecoveryReview = RecoveryDecision & { reviewedAt: number };
export type Snapshot = { version: 1; facts: Fact[]; commitments: Commitment[]; reminders: Reminder[]; reviews?: RecoveryReview[] };
export type BlockedReminder = {
  commitment: Commitment; reminder: Reminder; reviewVersion: number; reason: string;
  attemptHistory: Reminder[]; reviews: RecoveryReview[];
};
export type Command = { type: 'activate' | 'wait' | 'resolve' } | { type: 'snooze'; until: number };
export type Approval = { approved: true };
export const DAY = 86_400_000;
export const RETRY_DELAY = 60_000;
export const MAX_ATTEMPTS = 3;

export class MemoryError extends Error {
  code: 'INVALID' | 'DENIED' | 'NOT_FOUND' | 'CONFLICT' | 'STORAGE' | 'TRANSITION';
  constructor(code: MemoryError['code']) {
    super(code); this.code = code;
  }
}
function check(value: unknown): asserts value { if (!value) throw new MemoryError('INVALID'); }
function record(value: unknown): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, names: string[]) {
  check(Object.keys(value).length === names.length && names.every(n => Object.hasOwn(value, n)));
}
function id(value: unknown): asserts value is string { check(typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value)); }
function prose(value: unknown): asserts value is string { check(typeof value === 'string' && value.trim().length > 0 && value.length <= 1000); }
function time(value: unknown): asserts value is number { check(Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000); }
export function approve(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MemoryError('DENIED');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'approved');
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.value !== true) throw new MemoryError('DENIED');
}
function unique(values: string[]) { check(new Set(values).size === values.length); }
function reviewTime(s: Snapshot, commitmentId: string): number {
  return (s.reviews ?? []).reduce((latest, r) => r.reminderKey.startsWith(`${commitmentId}:`) ? Math.max(latest, r.reviewedAt) : latest, 0);
}
function decisionFields(value: unknown, persisted = false): Record<string, unknown> {
  const d = record(value);
  fields(d, ['id', 'reminderKey', 'attempt', 'expectedStatus', 'expectedReview', 'outcome', 'reviewer', 'evidence', ...(persisted ? ['reviewedAt'] : [])]);
  id(d.id); id(d.reviewer); prose(d.evidence);
  check(typeof d.reminderKey === 'string' && /^[a-z0-9-]{1,64}:\d{1,9}$/.test(d.reminderKey));
  check(Number.isInteger(d.attempt) && (d.attempt as number) >= 1 && (d.attempt as number) <= MAX_ATTEMPTS);
  check(Number.isSafeInteger(d.expectedReview) && (d.expectedReview as number) >= 0);
  check(d.expectedStatus === 'pending' || d.expectedStatus === 'unknown');
  check(['delivered', 'not_delivered', 'uncertain'].includes(d.outcome as string));
  if (persisted) time(d.reviewedAt);
  return d;
}
function reviewedStatus(outcome: RecoveryDecision['outcome']): Reminder['status'] {
  return outcome === 'delivered' ? 'sent' : outcome === 'not_delivered' ? 'failed' : 'unknown';
}
function latestReminder(s: Snapshot, commitmentId: string): Reminder | undefined {
  let latest: Reminder | undefined;
  for (const r of s.reminders) {
    if (r.commitmentId === commitmentId && (!latest || r.attemptedAt > latest.attemptedAt)) latest = r;
  }
  return latest;
}
export function emptySnapshot(): Snapshot { return { version: 1, facts: [], commitments: [], reminders: [] }; }

/** Strict runtime validation at persistence boundaries; never treat corrupt state as empty. */
export function parseSnapshot(value: unknown): Snapshot {
  const s = record(value);
  fields(s, ['version', 'facts', 'commitments', 'reminders', ...(Object.hasOwn(s, 'reviews') ? ['reviews'] : [])]);
  check(s.version === 1 && Array.isArray(s.facts) && Array.isArray(s.commitments) && Array.isArray(s.reminders));
  const facts = s.facts as unknown[], commitments = s.commitments as unknown[], reminders = s.reminders as unknown[];
  for (const item of facts) { const f = record(item); fields(f, ['id', 'text']); id(f.id); prose(f.text); }
  for (const item of commitments) {
    const c = record(item); fields(c, ['id', 'text', 'status', 'dueAt', 'updatedAt', 'snoozedUntil']);
    id(c.id); prose(c.text); time(c.dueAt); time(c.updatedAt);
    check(['active', 'waiting', 'snoozed', 'resolved'].includes(c.status as string));
    if (c.status === 'snoozed') { time(c.snoozedUntil); check(c.snoozedUntil > c.updatedAt); }
    else check(c.snoozedUntil === null);
  }
  const typed = s as unknown as Snapshot;
  unique(typed.facts.map(f => f.id)); unique(typed.commitments.map(c => c.id));
  const commitmentIds = new Set(typed.commitments.map(c => c.id));
  for (const item of reminders) {
    const r = record(item); fields(r, ['key', 'commitmentId', 'day', 'status', 'attempts', 'attemptedAt']);
    id(r.commitmentId); time(r.day); time(r.attemptedAt);
    check(r.day === Math.floor(r.attemptedAt / DAY));
    check(r.key === `${r.commitmentId}:${r.day}`);
    check(['pending', 'sent', 'failed', 'unknown'].includes(r.status as string));
    check(Number.isInteger(r.attempts) && (r.attempts as number) >= 1 && (r.attempts as number) <= MAX_ATTEMPTS);
    check(commitmentIds.has(r.commitmentId));
  }
  unique(typed.reminders.map(r => r.key));
  if (Object.hasOwn(s, 'reviews')) {
    check(Array.isArray(s.reviews));
    const reviews = typed.reviews!;
    const remindersByKey = new Map(typed.reminders.map(r => [r.key, r]));
    const previous = new Map<string, RecoveryReview>();
    unique(reviews.map(r => { decisionFields(r, true); return r.id; }));
    for (const review of reviews) {
      const reminder = remindersByKey.get(review.reminderKey); check(reminder);
      const last = previous.get(review.reminderKey);
      check(review.expectedReview === (last ? last.expectedReview + 1 : 0));
      check(review.attempt <= reminder.attempts);
      check(review.reviewedAt >= reminder.day * DAY);
      if (last) {
        check(review.reviewedAt >= last.reviewedAt && review.attempt >= last.attempt);
        if (review.attempt === last.attempt) check(last.outcome === 'uncertain' && review.expectedStatus === 'unknown');
        else check(last.outcome === 'not_delivered');
      }
      if (review.attempt === reminder.attempts) check(review.reviewedAt >= reminder.attemptedAt);
      else check(review.reviewedAt <= reminder.attemptedAt);
      previous.set(review.reminderKey, review);
    }
    for (const review of previous.values()) {
      const reminder = remindersByKey.get(review.reminderKey)!;
      if (review.attempt === reminder.attempts) check(reminder.status === reviewedStatus(review.outcome));
      else check(review.outcome === 'not_delivered');
    }
  }
  return structuredClone(typed);
}

/** Trusted host interface. transact must lock BEFORE reading and commit before returning.
 * Callbacks are synchronous, deterministic, and must not perform external side effects. */
export interface Store { load(): unknown; transact<T>(change: (snapshot: Snapshot) => T): T }

/** Reject asynchronous callbacks without leaving a rejected Promise unobserved.
 * A detached draft may still be changed asynchronously, but it must never commit. */
export function transactionResult<T>(result: T): T {
  if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
      typeof (result as { then?: unknown }).then === 'function') {
    void Promise.resolve(result).catch(() => {});
    throw new MemoryError('INVALID');
  }
  return structuredClone(result);
}
export class SyntheticStore implements Store {
  private snapshot: Snapshot;
  private writing = false;
  constructor(snapshot: unknown = emptySnapshot()) { this.snapshot = parseSnapshot(snapshot); }
  load(): Snapshot { return structuredClone(this.snapshot); }
  transact<T>(change: (snapshot: Snapshot) => T): T {
    if (this.writing) throw new MemoryError('STORAGE');
    this.writing = true;
    try {
      const next = this.load();
      const result = transactionResult(change(next));
      this.snapshot = parseSnapshot(next);
      return result;
    } finally { this.writing = false; }
  }
}

export class Memory {
  private store: Store;
  constructor(store: Store) { this.store = store; }
  read(): Snapshot {
    let raw: unknown;
    try { raw = this.store.load(); } catch { throw new MemoryError('STORAGE'); }
    return parseSnapshot(raw);
  }
  private write<T>(approval: Approval | undefined, change: (s: Snapshot) => T): T {
    approve(approval);
    try { return this.store.transact(change); }
    catch (e) { throw e instanceof MemoryError ? e : new MemoryError('STORAGE'); }
  }
  remember(fact: Fact, approval?: Approval): void {
    this.write(approval, s => {
      const f = record(fact); fields(f, ['id', 'text']); id(f.id); prose(f.text);
      const existing = s.facts.find(x => x.id === fact.id);
      if (existing && existing.text !== fact.text) throw new MemoryError('CONFLICT');
      if (!existing) s.facts.push(structuredClone(fact));
    });
  }
  create(input: { id: string; text: string; dueAt: number }, now: number, approval?: Approval): Commitment {
    return this.write(approval, s => {
      const v = record(input); fields(v, ['id', 'text', 'dueAt']); id(v.id); prose(v.text); time(v.dueAt); time(now);
      const existing = s.commitments.find(c => c.id === input.id);
      if (existing) {
        if (existing.text !== input.text || existing.dueAt !== input.dueAt) throw new MemoryError('CONFLICT');
        return existing;
      }
      const c: Commitment = { ...input, status: 'active', updatedAt: now, snoozedUntil: null };
      s.commitments.push(c); return c;
    });
  }
  transition(commitmentId: string, command: Command, now: number, approval?: Approval): Commitment {
    return this.write(approval, s => {
      id(commitmentId); time(now); const cmd = record(command);
      fields(cmd, cmd.type === 'snooze' ? ['type', 'until'] : ['type']);
      check(['activate', 'wait', 'resolve', 'snooze'].includes(cmd.type as string));
      const c = s.commitments.find(x => x.id === commitmentId);
      if (!c) throw new MemoryError('NOT_FOUND');
      check(now >= c.updatedAt);
      check(now >= (latestReminder(s, commitmentId)?.attemptedAt ?? 0));
      check(now >= reviewTime(s, commitmentId));
      if (c.status === 'resolved' && command.type !== 'resolve') throw new MemoryError('TRANSITION');
      if (command.type === 'snooze') { time(command.until); check(command.until > now); }
      c.status = command.type === 'activate' ? 'active' : command.type === 'wait' ? 'waiting' : command.type === 'resolve' ? 'resolved' : 'snoozed';
      c.snoozedUntil = command.type === 'snooze' ? command.until : null;
      c.updatedAt = now; return c;
    });
  }
  /** Reserve before delivery. Return null when not eligible or already reserved. Never sends anything. */
  claim(commitmentId: string, now: number, approval?: Approval): Reminder | null {
    return this.write(approval, s => {
      id(commitmentId); time(now);
      const c = s.commitments.find(x => x.id === commitmentId);
      if (!c) throw new MemoryError('NOT_FOUND');
      check(now >= c.updatedAt);
      const latest = latestReminder(s, commitmentId);
      check(now >= (latest?.attemptedAt ?? 0));
      check(now >= reviewTime(s, commitmentId));
      if (c.status === 'resolved' || c.status === 'waiting' || now < c.dueAt || (c.snoozedUntil !== null && now < c.snoozedUntil)) return null;
      // An unresolved delivery blocks later days too: a crash is not evidence of non-delivery.
      if (s.reminders.some(r => r.commitmentId === commitmentId && ['pending', 'unknown'].includes(r.status))) return null;
      const reviews = (s.reviews ?? []).filter(r => r.reminderKey.startsWith(`${commitmentId}:`));
      // A confirmation on a later day must not immediately produce another alert.
      if (reviews.some(r => r.outcome === 'delivered' && Math.floor(r.reviewedAt / DAY) === Math.floor(now / DAY))) return null;
      if (reviews.some(r => r.outcome === 'not_delivered' && now < r.reviewedAt + RETRY_DELAY)) return null;
      // Backoff is per commitment, including when a new UTC day changes the key.
      if (latest?.status === 'failed' && now < latest.attemptedAt + RETRY_DELAY) return null;
      const day = Math.floor(now / DAY), key = `${commitmentId}:${day}`;
      const old = s.reminders.find(r => r.key === key);
      if (old && (old.status !== 'failed' || old.attempts >= MAX_ATTEMPTS || now < old.attemptedAt + RETRY_DELAY)) return null;
      const r: Reminder = { key, commitmentId, day, status: 'pending', attempts: (old?.attempts ?? 0) + 1, attemptedAt: now };
      if (old) Object.assign(old, r); else s.reminders.push(r);
      if (c.status === 'snoozed') { c.status = 'active'; c.snoozedUntil = null; c.updatedAt = now; }
      return r;
    });
  }
  /** Attempt fencing rejects late callbacks. 'failed' means confirmed NOT delivered. */
  settle(key: string, attempt: number, outcome: 'sent' | 'failed' | 'unknown', approval?: Approval): void {
    this.write(approval, s => {
      check(typeof key === 'string' && Number.isInteger(attempt) && ['sent', 'failed', 'unknown'].includes(outcome));
      const r = s.reminders.find(x => x.key === key);
      if (!r) throw new MemoryError('NOT_FOUND');
      if ((s.reviews ?? []).some(review => review.reminderKey === key && review.attempt === attempt)) throw new MemoryError('CONFLICT');
      if (r.attempts !== attempt || (r.status !== 'pending' && r.status !== outcome)) throw new MemoryError('CONFLICT');
      r.status = outcome;
    });
  }

  /** Read-only review queue. Historical rows are daily attempt summaries, not invented receipts. */
  blockedReminders(): BlockedReminder[] {
    const s = this.read();
    return s.reminders.filter(r => r.status === 'pending' || r.status === 'unknown')
      .sort((a, b) => a.attemptedAt - b.attemptedAt || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map(r => {
        const reviews = (s.reviews ?? []).filter(review => review.reminderKey === r.key);
        return { commitment: s.commitments.find(c => c.id === r.commitmentId)!, reminder: r, reviewVersion: reviews.length,
          reason: r.status === 'pending' ? 'Reservation has no confirmed delivery outcome; review before retrying.' : 'Delivery remains uncertain; automatic retry is blocked.',
          attemptHistory: s.reminders.filter(item => item.commitmentId === r.commitmentId).sort((a, b) => a.day - b.day), reviews };
      });
  }

  /** Synthetic trusted-host review only. Caller must stop/fence any original sender first. */
  reviewReminder(decision: RecoveryDecision, now: number, approval?: Approval): RecoveryReview {
    return this.write(approval, s => {
      decisionFields(decision); time(now);
      const reviews = s.reviews ?? [];
      const duplicate = reviews.find(r => r.id === decision.id);
      if (duplicate) {
        for (const key of Object.keys(decision) as (keyof RecoveryDecision)[]) {
          if (duplicate[key] !== decision[key]) throw new MemoryError('CONFLICT');
        }
        return duplicate; // return the original receipt; never replay the decision
      }
      const reminder = s.reminders.find(r => r.key === decision.reminderKey);
      if (!reminder) throw new MemoryError('NOT_FOUND');
      const matching = reviews.filter(r => r.reminderKey === reminder.key);
      if (reminder.attempts !== decision.attempt || reminder.status !== decision.expectedStatus ||
          matching.length !== decision.expectedReview) throw new MemoryError('CONFLICT');
      const c = s.commitments.find(c => c.id === reminder.commitmentId)!;
      check(now >= c.updatedAt && now >= (latestReminder(s, c.id)?.attemptedAt ?? 0) && now >= reviewTime(s, c.id));
      const review: RecoveryReview = { ...decision, reviewedAt: now };
      reminder.status = reviewedStatus(decision.outcome);
      s.reviews = [...reviews, review];
      return review;
    });
  }
}
