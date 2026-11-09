# Alfred — Codex Cloud handoff

## How to start
1. Open Codex in your browser and select the GitHub repo `suyashpradhan/alfred-agent`.
2. Work in a Codex cloud environment; no local Mac installation.
3. Read the repository's root `AGENTS.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` and `docs/SECURITY.md`.
4. Create a branch and PR for the first small change. Do not change Railway production.

## First Codex task — paste into Codex

> You are working on Alfred, an existing personal AI agent hosted as OpenClaw on Railway. Telegram replies and an 8 PM IST scheduled message already work. Preserve that deployment; do not reinstall OpenClaw or build a replacement runtime.
>
> Audit this repository for documentation consistency and security. Implement a small **offline, synthetic memory test harness** in TypeScript that defines a durable commitment record and exercises transitions `active -> waiting -> resolved`, corrections, snoozing, and duplicate reminder suppression. Include tests and a README for executing them in Codex Cloud. Avoid any live account connections and never commit secrets or real user information.
>
> Deliver a PR with architecture rationale, test results, known limitations and rollback implications. Keep it narrow and reviewable.

## Follow-up tasks
- Inspect and version Alfred's OpenClaw identity and operational prompt templates.
- Plan a controlled comparison with the *existing* Railway workspace; user approval required for runtime writes.
- Prototype a briefing using synthetic events and emails.
- Only then add narrow authorized personal Google integrations.

## Definition of successful handoff
Codex can open the repo, read relevant context, produce testable code in a PR, and leave the running Railway bot unchanged.

## Implemented offline module

Run `npm test` on Node 22.23.1 without installing dependencies. All 30 runtime tests passed using the existing Node runtime. Strict module type checking also passed with the existing TypeScript 5.9.3 compiler; test typing passed with skipLibCheck due to existing bundled Node declaration incompatibilities. CI now runs runtime tests and strict source/test type checking using pinned tools in a disposable cloud runner. Read ADR 0003 and `docs/testing/commitment-memory.md` before adding adapters. Durable storage, quiet hours, authenticated approvals and delivery remain separate approved integration work.

## SQLite prototype handoff

Read ADR 0004 and `docs/testing/sqlite-storage.md`. Store now exposes load/transact, not load/save: adapters must lock before reading and commit before returning. Run `npm test` on Node 22.23.1 in cloud CI; node:sqlite is built in and experimental. Create only synthetic databases in private temporary directories. Opening never initializes or repairs missing data. Restore creates a new file and returns a read-only handle. Production adoption, operator reconciliation and authenticated approvals remain separate decisions.

## Briefing preview handoff

PR #2 was verified merged before this work. Run `npm run preview:synthetic` in cloud development to create, read and remove a disposable synthetic SQLite fixture. Read ADR 0005 before changing inclusion or timezone rules. Preview takes explicit UTC time, excludes resolved contents and reports source failures rather than an empty list. No live sources, delivery, schedules or memory changes occur during preview. Future live integration still requires a separate decision.

## Reminder recovery handoff

Run `npm run recovery:synthetic` in cloud development. Read ADR 0006 and `docs/testing/reminder-recovery.md` before changing recovery behavior. Exact decision-ID replays return the original receipt; stale or conflicting reviews fail. Uncertain outcomes remain blocked, non-delivery preserves retry caps/cooldown, and delivered reviews suppress the confirmation day. Optional audit records are not readable by older binaries. A future sender must be stopped/fenced before non-delivery review. No production integration is authorized by this milestone.

## Synthetic quiet hours and eligibility

The offline policy adds explicit timezone/quiet-hour evaluation, read-only reason previews and
policy-aware transactional reservations. UTC deduplication days and recovery safeguards are preserved.
Run `npm run eligibility:synthetic` in cloud development; see [ADR 0007](decisions/0007-reminder-eligibility.md)
and `docs/testing/reminder-eligibility.md`. The PR records cloud test evidence.
Legacy `Memory.claim` remains a policy-free synthetic API; future senders must use
`claimWithPolicy` with trusted explicit configuration. No live scheduling or Railway integration.
