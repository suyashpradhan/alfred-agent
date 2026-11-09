# Alfred roadmap

Updated: November 9, 2026. This is the ordered execution plan. The feature backlog is not an implementation commitment.

## Stage 0 — Cloud foundation ✅
Owner-confirmed: Railway OpenClaw running, OpenRouter responds, Telegram connected, 8 PM IST scheduled test delivered.

## Stage 1 — Identity, memory and reproducibility (CURRENT)
- [ ] Connect GitHub repository to Codex Cloud.
- [ ] Audit live OpenClaw workspace through the existing Railway dashboard, then take a private backup.
- [ ] Review and carefully merge versioned `IDENTITY.md`, `SOUL.md`, and workspace `AGENTS.md`.
- [ ] Test one synthetic fact across separate agent sessions; distinguish session history from durable memory.
- [ ] Preserve existing Telegram and 8 PM cron functionality.
- [ ] Record evidence, rollback notes and model costs.

**Done:** Alfred consistently identifies itself, retrieves the approved test fact in a fresh session, and existing messaging and scheduling remain intact.

## Stage 2 — Useful proactive routines (V1)
- [x] Format an evening briefing using synthetic data; clearly mark disconnected sources (read-only preview, ADR 0005; cloud test results in the PR).
- [ ] Persist commitments with states `active`, `waiting`, `snoozed`, `resolved`.
- [ ] Suppress duplicate messages and respect quiet hours.
- [ ] Read tomorrow's personal calendar through a narrowly scoped approved integration.
- [ ] Add bounded personal Gmail triage *after* Calendar.
- [ ] Test email-action extraction against labeled fixtures.

**Done:** An 8 PM briefing presents grounded next-day calendar events and unresolved tasks, clearly shows source failures, and does not invent or duplicate actions.

## Stage 3 — Controlled autonomy (V2)
- [ ] Introduce explicit tool registry and permission boundaries.
- [ ] Approval queue for writes and sensitive operations.
- [ ] Run history: started/finished/error, model costs, tool calls, delivery outcome.
- [ ] Retry/backoff and idempotent completion markers.
- [ ] Proactive follow-up detection, meeting prep, project tracking, research monitoring.

**Done:** Relevant tasks can be initiated proactively with source evidence, audit trail, and approval before any consequential external write.

## Stage 4 — Original character-led mobile client
- [ ] Define real agent states: idle, listening, thinking, working, awaiting approval, completed, failed.
- [ ] Build authenticated companion API with minimal capabilities.
- [ ] Prototype responsive app, then Expo/React Native.
- [ ] Add native push notifications; backend remains cloud-hosted.
- [ ] Confirm no privileged Gateway token ships to the device.

**Done:** Telegram and phone show consistent Alfred state and commitments from one cloud backend.

## Stage 5 — Open-source quality
- [ ] Reproducible setup docs and sample configuration.
- [ ] Integration mocks, CI checks, model evals, privacy controls, threat model.
- [ ] Cost dashboard and incident runbook.
- [ ] License and original artwork review.

## Non-goals for now
Rewriting OpenClaw; unsupervised email sending; company data ingestion; autonomous buying; always-running phone background agents; production self-modifying code.

## Offline prototype evidence — 2026-11-09

- [x] TypeScript synthetic memory and commitment state machine: 30 tests passing, including permissions, failure injection, retries and duplicate prevention.
- [x] Strict module type checking with existing TypeScript 5.9.3.

See `testing/commitment-memory.md` and ADR 0003. Stage 1 live validation and Stage 2 durable production storage, quiet hours and real delivery remain outstanding.

## Approved storage prototype

SQLite storage adds atomic transactions, explicit versioned initialization, backup/restore and synthetic restart/concurrency/failure tests. See ADR 0004 and `testing/sqlite-storage.md`; the PR records cloud CI results. This does not complete production persistence or Stage 1's OpenClaw memory acceptance. Railway remains untouched.

## Synthetic reminder recovery

Explicit reviewed recovery for blocked reminders now has a queue, transactional audit receipts, stale-decision checks and restart/retry tests. See ADR 0006 and `testing/reminder-recovery.md`; the PR records cloud results. No real sender, authenticated approval integration or Railway change is included.

## Synthetic quiet hours and eligibility

The offline policy adds explicit timezone/quiet-hour evaluation, read-only reason previews and
policy-aware transactional reservations. UTC deduplication days and recovery safeguards are preserved.
Run `npm run eligibility:synthetic` in cloud development; see [ADR 0007](decisions/0007-reminder-eligibility.md)
and `docs/testing/reminder-eligibility.md`. The PR records cloud test evidence.
Legacy `Memory.claim` remains a policy-free synthetic API; future senders must use
`claimWithPolicy` with trusted explicit configuration. No live scheduling or Railway integration.

## Synthetic delivery simulation

`src/delivery-simulation.ts` connects eligibility, atomic reservation, a closed fake sender and
outcome recording. Run `npm run delivery:synthetic` in cloud development. Timeout and crash fixtures
remain blocked for review across restarts; no automatic resend occurs. See
[ADR 0008](decisions/0008-delivery-simulation.md) and [test guide](testing/delivery-simulation.md).
The PR records cloud results. No real messages, scheduler, provider integration or Railway access.
Live Stage 1 validation remains outstanding; this is offline evidence only.

## Proposed OpenClaw integration — design only

[ADR 0009](decisions/0009-openclaw-integration.md) recommends an isolated, read-only tool-plugin
prototype while OpenClaw retains runtime, channels and scheduling. A restricted service remains
an alternative if compatibility or measured isolation needs justify it. The installed version is
unverified. See the [evaluation plan](testing/openclaw-integration-plan.md) for separate approval
gates, permissions, single-delivery ownership and rollback. No adapter is implemented by this design;
no Railway access or deployment has occurred. Stage 1 live validation remains outstanding.
