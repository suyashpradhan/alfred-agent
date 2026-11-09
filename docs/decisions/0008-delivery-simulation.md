# ADR 0008 — Bounded synthetic reminder delivery simulation

Status: approved scope; implementation proposed for review.

## Decision

Add simulateReminder: one explicitly approved synthetic attempt for one commitment at explicit time.
It composes eligibilityPreview, claimWithPolicy and settle without changing their contracts or storage schema.
Preview explains a deferral; a fresh atomic reservation is still mandatory before the fake attempt.
A null reservation after an eligible preview reports state_changed rather than claiming delivery.

The closed fake sender supports only success, confirmed_failure, timeout and crash_after_delivery.
It accepts no provider, callback, address, message text, credentials or endpoint.
No network call, timer, scheduler, polling or automatic retry exists.
Timeout is a deterministic unknown-result fixture, not a real elapsed-time timeout test.
A microtask boundary after fake delivery allows overlapping invocations and settlement races to be tested.

- Success records sent; subsequent same-UTC-day runs are suppressed.
- Confirmed failure records failed; a later explicit run still needs cooldown and remaining attempts.
- Timeout records unknown and requires review; it is not evidence of non-delivery.
- Crash after fake delivery deliberately skips settlement, leaving pending across restart.
- Settlement failure reports needs_review, never failed delivery, and performs no retry.
- Reservation failure prevents the fake attempt and reports a sanitized failure requiring inspection.
- Denied approval, invalid inputs and failed preview reads reject with sanitized MemoryError.

## Summaries and safety

Results distinguish fake attempt, simulated delivery, successful outcome save and need for review.
The readable formatter is for trusted results from this function; it is not a parser for untrusted input.
It never includes commitment text, source exceptions or recovery evidence.
Summaries are returned, not a durable run-history ledger. A killed process cannot promise a summary.
Existing pending/unknown records and the review queue remain the durable evidence.

Memory and Store remain trusted host capabilities; use disposable synthetic fixtures only.
Approval is synthetic metadata, not authentication. No real sender can be plugged into this API.
Tests include an actual child-process kill after the fake delivery barrier and competing SQLite processes.
The synthetic crash result itself returns normally so examples can show it; the test also kills its process.
A future real provider needs a separate design for cancellation/fencing, provider idempotency, delayed
callbacks, authentication and the gap between reservation and sending. This simulation does not establish
exactly-once external delivery. Recovery still requires stopping/fencing a real sender first.

## Failure modes, cost and rollback

No new dependency, model/API cost, production data or Railway access. Work is bounded to one attempt per call.
Lock contention may fail closed; the simulator does not retry storage or delivery automatically.
UTC daily limits, quiet hours, permission checks and recovery attempt fencing remain unchanged.
The entire cloud suite, strict TypeScript and examples verify compatibility.
Remove the module/example/tests to roll back; no schema migration. Preserve existing pending/unknown records
and recovery audits, and follow ADR 0006's older-reader restrictions.
