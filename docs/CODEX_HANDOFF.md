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
