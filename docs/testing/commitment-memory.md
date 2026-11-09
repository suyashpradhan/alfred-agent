# Synthetic memory verification

## Reproduce

In Codex Cloud or a GitHub runner with Node 22.23.1, run `npm test`.
No `npm install`, build step, secrets, network, Railway account, or real user data
is required. The existing Node 22.23.1 on the development machine was used for
the recorded run; no development dependencies were installed on the Mac.

## Recorded results — 2026-11-09

`npm test`: **26 passed, 0 failed, 0 skipped**.

Covered: all 16 state/command combinations; synthetic fact and commitment recovery
through JSON serialization into a fresh store; defensive copies; missing approvals;
duplicate IDs and conflicting content; due/snooze boundaries; waiting and resolved
suppression; duplicate reservations through shared stores and session restart;
next-day reminders; retry delay and exhaustion; stale callback rejection; pending
crashes and uncertain delivery; atomic save and load failures; malformed snapshots,
unsupported versions, invalid timestamps, commands and missing records.

The test source itself is the synthetic example: `test/memory.test.ts`. No real
messages are sent. The GitHub workflow is prepared but has not been run in GitHub.
Node executes TypeScript by stripping types. Separately, strict static checking
passed with the already-installed TypeScript 5.9.3 bundled with Vercel:

```sh
tsc --noEmit --strict --target es2022 --module nodenext --allowImportingTsExtensions src/memory.ts
```

The source and test file also passed together with `--skipLibCheck`, `--types node`
and the existing bundled Node type roots. Without `--skipLibCheck`, that bundled
dependency has Buffer/ArrayBuffer declaration incompatibilities. No compiler or
types were installed for this task, and CI currently runs runtime tests only.

## Review and future integration gate

Read ADR 0003 before supplying a Store or delivery adapter. Confirm atomic storage,
serialized writes, authenticated approval, quiet hours, a timezone policy, durable
provider idempotency and operator reconciliation of ambiguous sends before any
live trial. Those integrations need a separately approved rollback plan. This
synthetic result does not complete Stage 1's cross-session OpenClaw memory test,
nor Stage 2's durable production commitments or briefing acceptance criteria.
