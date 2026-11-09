# ADR 0007 — Synthetic quiet hours and reminder eligibility

Status: approved scope; implementation proposed for review. No production integration.

## Decision

Add an explicit host-supplied policy: named IANA timezone (or UTC), start and end in strict HH:mm.
Use Node Intl timezone data, never the process timezone or implicit current clock.
One daily interval is supported. Start is inclusive, end exclusive; start after end crosses midnight.
Equal endpoints are rejected rather than guessing disabled versus all-day.
Unknown zones, fixed-offset syntax, extra fields, inherited fields, accessors, invalid times and missing policy fail closed.

Map each UTC instant into local wall time. During a spring gap, nonexistent minutes never occur.
During a fall fold, both occurrences of a quiet minute are quiet. We do not calculate a next-run
timestamp or promise delivery when quiet hours end; a future scheduler must re-evaluate.

Memory.eligibilityPreview reads one validated snapshot and returns ID, eligible flag and the first
blocking reason in deterministic ID order. It exposes no commitment text or recovery evidence.
Priority: clock validation, commitment state/due/snooze, unresolved delivery, delivered confirmation,
recovery/retry cooldown, daily duplicate/attempt cap, quiet hours, eligible.
Errors throw sanitized MemoryError, never an empty success or a partial preview.

Memory.claimWithPolicy requires approval and explicit policy. It uses the same decision function
inside Store.transact, rechecking current state rather than trusting a previous preview.
A quiet deferral never reserves an attempt or activates an expired snooze. A store may still advance
its transaction revision for a no-op claim; previews do not write.
Legacy Memory.claim remains compatible for existing synthetic callers; it has no quiet-hours policy.
Any future sender must use the policy-aware entry point; this module is not an authentication boundary.

## Compatibility and duplicate prevention

UTC daily reservation keys, retry caps and cooldowns remain unchanged. Local midnight and timezone
changes do not reset them. Quiet hours govern interruption time, not the deduplication day.
Consequently two different UTC days can permit reminders in one local calendar day; local-day quotas
are not promised. Pending/unknown reservations and recovery audit checks remain authoritative.
No snapshot migration or persisted policy is introduced. The trusted host must supply the same explicit
configuration after restart; absence is an error in the new API. Persistence/authenticated preference
editing and real scheduling are separate work.

## Failure, security, cost and rollback

No providers, accounts, models, network, Railway or actual delivery. Policy is trusted host
configuration, not extracted instructions from reminder text. Approval remains synthetic metadata,
not authenticated user identity. Preview is advisory and must not be used as a sending capability.
Storage and clock failures block evaluation/reservation. Failed writes roll back through existing stores.

Runtime uses built-in Intl with the pinned cloud Node version; timezone-rule changes require
runtime updates and fixture review. No new runtime dependencies or model/API costs.
Preview scans existing bounded SQLite snapshots; there is no polling loop or scheduler.
Tests and strict type checking run in disposable GitHub Actions, with no Mac installations.

Rollback this commit to remove the APIs and example; storage format is unchanged by this feature.
Preserve the prior recovery audit compatibility requirements from ADR 0006.
