# Alfred roadmap

Updated: November 9, 2030. This is the ordered execution plan. The feature backlog is not an implementation commitment.

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
- [ ] Format an evening briefing using synthetic data; clearly mark disconnected sources.
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

- [x] TypeScript synthetic memory and commitment state machine: 26 tests passing, including permissions, failure injection, retries and duplicate prevention.
- [x] Strict module type checking with existing TypeScript 5.9.3.

See `testing/commitment-memory.md` and ADR 0003. Stage 1 live validation and Stage 2 durable production storage, quiet hours and real delivery remain outstanding.
