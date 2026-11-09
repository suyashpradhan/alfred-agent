# ADR 0006 — Synthetic human-reviewed reminder recovery

Status: Accepted for isolated synthetic testing, 2026-11-09. No live sender,
provider lookup, authentication service, deployment or Railway access.

## Decision

Add Memory.blockedReminders() and Memory.reviewReminder(). A queue read returns
pending/unknown reservations, the commitment, why it is blocked, its daily attempt
summaries, and review history. Reads do not change state. Earlier versions stored
only daily attempt counts/latest timestamps, not individual attempt receipts;
the workflow explicitly reports those summaries without inventing missing history.

A review request requires a stable decision ID, reminder key, exact attempt,
observed pending/unknown status, observed review count, outcome, synthetic reviewer
ID and nonempty evidence. Trusted-host approval is required. All comparisons,
outcome changes and audit append happen in the same Store transaction.

| Review outcome | Reminder result | Retry effect |
| --- | --- | --- |
| delivered | sent | Blocks original reminder day and confirmation UTC day |
| not_delivered | failed | At least 60 seconds after review; existing attempt cap and commitment eligibility still apply |
| uncertain | unknown | Remains blocked across days until another explicit review |

The existing cap is three attempts per UTC day. A new day may allow a new daily
reminder after review cooldown. Confirmation on a later day suppresses that day's
reminder conservatively, avoiding an immediate duplicate. Recovery never activates
waiting, snoozed or resolved commitments and never sends anything itself.

Exact decision-ID retries return the original receipt even after newer activity,
without replaying changes or appending another audit row. Changed content under
the same ID conflicts. A different reviewer using an old status/attempt/review
count conflicts. An uncertain review increments the review count too. Delivery
callbacks for an already-reviewed attempt are rejected, preventing stale callbacks
from overturning the human decision. New attempts retain ordinary settlement.

## Persistence and compatibility

Version 1 snapshots gain an optional, strictly validated reviews array. Existing
snapshots without it remain readable and are not rewritten on reads. The field is
added lazily by the first successful recovery transaction; there is no SQL schema
migration or reset. Each audit record stores the exact command and reviewedAt.
Validation checks unique IDs, contiguous per-reminder review counts, timestamps,
attempt ordering, references and consistency with the current reminder outcome.

This is an additive format extension, not backward-readable reviewed state: older
parsers reject the extra field rather than silently dropping recovery safeguards.
Do not downgrade a database containing reviews to an old reader. Rollback code
only against a separate pre-feature synthetic backup, with delivery disabled;
preserve the reviewed file for inspection. Never strip the audit field to downgrade.
SQLite's existing 1 MiB payload bound still applies. No automatic audit pruning.

## Failure and security boundaries

- Invalid inputs, absent approval, stale decisions and unsupported state fail
  without changing the reservation or audit. Store failures roll back both.
- Queue read failures throw; they never masquerade as an empty queue.
- Review time cannot predate commitment activity, reminder attempts or earlier
  recovery decisions. Preview/claim/transition clock checks include review times.
- Exact replay is state-idempotent; the store may still increment its transaction
  revision for an accepted no-op, as documented in ADR 0004.
- Reviewer/evidence are synthetic metadata, not proof of identity or delivery.
  Approval remains a trusted-host contract. No client/model-provided boolean can
  substitute for authentication in a future integration.
- A live integration MUST stop or fence the original sender before accepting a
  non-delivery decision. This module has no sender to stop and cannot prevent an
  external in-flight request from completing. It does not promise exactly-once
  delivery. Restoring an older backup still requires paused delivery/reconciliation.
- Evidence is data, never executed, and is omitted from briefing output. The audit
  is append-only through these domain APIs, not cryptographically tamper-proof.
  Direct Store/database access remains a trusted administrative capability.

## Cost and scope

No models, network calls or new services. Work is deterministic and bounded by the
existing snapshot limit; audit validation is linear and queue grouping scans the
small in-memory snapshot. CI consumes account minutes. All tests/examples use
disposable synthetic files in cloud CI; no dependencies installed on the Mac.
This closes an offline recovery gap only. Production retention, approvals,
provider receipts, sender fencing and live OpenClaw integration remain future work.
