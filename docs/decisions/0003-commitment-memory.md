# ADR 0003 — Offline commitment memory prototype

**Status:** Accepted for synthetic testing only, 2026-11-09.

## Context and decision

The owner explicitly requested the first testable TypeScript memory and commitment
module. This advances a bounded Stage 2 prototype while Stage 1 live validation
remains outstanding. OpenClaw remains the runtime; this module is not deployed,
loaded into its workspace, or connected to Railway.

Use a deterministic module with explicit timestamps, strict runtime input and
snapshot validation, immutable reads, stable caller-supplied IDs, and an approved
write boundary. Node's built-in runner executes erasable TypeScript without
installing development dependencies. Runtime execution does not type-check code.
There are no model calls, network clients, credentials, or production fixtures.

The version 1 snapshot holds approved facts, commitments and reminder reservations.
`SyntheticStore` is an in-memory adapter. Serialization and rehydration demonstrate
session continuity; they do not establish production durability or OpenClaw memory
integration. A future durable adapter must provide atomic saves and a single
serialized writer across the entire load/change/save operation. Multi-process
storage needs transactions/CAS before deployment.

## State and reminders

| State | Allowed commands | Reminder eligibility |
| --- | --- | --- |
| active | activate, wait, snooze, resolve | At or after dueAt |
| waiting | activate, wait, snooze, resolve | Suppressed until explicitly activated |
| snoozed | activate, wait, snooze, resolve | At or after both dueAt and snoozedUntil |
| resolved | resolve (idempotent) | Never; terminal in this prototype |

An eligible snoozed commitment becomes active when a reminder is reserved. IDs
cannot be reused to change a commitment or fact; conflicting duplicates fail.
Dates are nonnegative integer Unix milliseconds. Snooze deadlines must be future
relative to the command time; clocks older than the commitment update are rejected.

Reserve a reminder before invoking any future delivery adapter. The key combines
commitment ID and UTC day. A sent reminder suppresses subsequent claims for that
day, even after state changes or snapshot reload. Only a confirmed non-delivery
(`failed`) permits retries, with a 60-second delay and at most three attempts per
UTC day. A new day permits a new daily reminder. An attempt number fences stale
callbacks. `pending` and `unknown` block all later claims for that commitment,
including later days. No automatic recovery or expiry is implemented: deliberate
operator reconciliation is required before a future deployment can safely resume
an ambiguous delivery. This favors avoiding duplicates over guaranteed delivery.

## Failure modes and security

- Corrupt or unsupported snapshots fail closed; they never become empty memory.
- Store errors expose only a generic STORAGE code, not provider error details.
- Failed reservation saves return no claim. Failed delivery acknowledgements leave
  a pending reservation, preventing automatic resends.
- Reads return independent copies; callers cannot bypass approval by mutating them.
- Approval is a trusted-host API contract, **not authentication**. Never accept an
  `approved` field directly from model output or an untrusted client. A future
  integration must authenticate the human and bind approval to the exact operation.
- This is not an exactly-once delivery guarantee. A future sender must honor
  reservations and enforce provider idempotency, resolution races, and quiet hours.
- Snapshot/ledger storage grows with usage; retention and deletion policies remain
  future integration work. Only synthetic data belongs in this repository.

## Operating cost and rollback

No inference or provider cost; tests use CPU and memory only. Snapshot operations
copy/scan all stored records (linear cost). GitHub Actions uses the account's CI
minute allowance. Production capacity, encryption, retention and provider pricing
are undecided. Revert this module and its CI workflow to remove the prototype;
there is no Railway deployment or runtime migration to roll back.
