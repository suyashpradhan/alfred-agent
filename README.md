# Alfred 🧭

**A cloud-first personal AI agent: one persistent brain, multiple interfaces.**

Alfred is an engineering-led project exploring a proactive personal assistant that remembers commitments, notices relevant changes, and follows through under explicit permissions. Telegram is the first interface; a future original character-led mobile app will connect to the **same cloud agent**.

> **Current direction (November 2026):** Keep the existing Railway-hosted OpenClaw runtime. Learn and extend it before considering a custom runtime. No software needs to be installed on the owner's Mac.

## Verified starting point

- [x] OpenClaw Gateway deployed on Railway.
- [x] OpenRouter model responds to an agent request.
- [x] Telegram connected and replying.
- [x] Scheduled 8:00 PM IST test message delivered.
- [ ] Alfred identity and memory conventions applied to the runtime.
- [ ] Useful briefing with authorized calendar and inbox data.
- [ ] Explicit task/commitment tracking.
- [ ] Reviewable activity history and approvals.
- [ ] Mobile companion experience.

These are reports from the working deployment, not automatic tests performed by this repository.

## Guiding principles

1. **One cloud brain, many interfaces.** Telegram now, character-led mobile client later.
2. **OpenClaw first, replaceable later.** Extend intentionally; do not rewrite what already works.
3. **State before personality.** Character animation must reflect real workflow status.
4. **Least privilege.** Read-only tools first; explicit approval for consequential actions.
5. **Reliable before autonomous.** Idempotency, failure reporting, provenance and measured costs.
6. **Cloud-only development.** GitHub + Codex Cloud + Railway; no local runtime installation.

## System overview

```text
Telegram  ──────────────────┐
                            v
                    OpenClaw Gateway (Railway)
                    Agent • Sessions • Cron • Tools
                            |
                     Persistent volume
                            |
                 Model API / narrow integrations
                            ^
                            |
Future iPhone app -> Authenticated companion API
                    (not Gateway admin access)
```

The phone app is a client, not a 24/7 background process. A separate authenticated API will mediate access; no Gateway administrator token should be embedded in the mobile app.

## Repository navigation

- [Roadmap](docs/ROADMAP.md): ordered milestones and definitions of done.
- [Architecture](docs/ARCHITECTURE.md): responsibilities, trust boundaries, deployment evolution.
- [Product strategy](docs/PRODUCT_STRATEGY.md): vision, scope, companion character and sequencing.
- [Feature backlog](docs/FEATURE_BACKLOG.md): full feature inventory and proposed priorities.
- [Security](docs/SECURITY.md): current constraints and permissions.
- [OpenClaw runbook](docs/OPENCLAW_RUNBOOK.md): Railway-only operations.
- [Codex handoff](docs/CODEX_HANDOFF.md): first task for Codex Cloud.
- [Coding-agent rules](AGENTS.md) and [OpenClaw workspace templates](openclaw/workspace/).

## First milestone: identity + memory, without breaking production

1. Inspect the **existing** OpenClaw workspace and preserve its state.
2. Compare the versioned templates in `openclaw/workspace/` with the actual files.
3. Apply deliberate, reviewed changes to identity and instructions.
4. Test a synthetic memory fact across new sessions.
5. Confirm Telegram still responds and the daily scheduled delivery still works.
6. Record results, rollback steps and learning.

**GitHub does not automatically deploy to Railway.** Changes must be reviewed and deliberately applied.

## Data and licensing

No real secrets, OAuth tokens, live agent state, work data or private memories belong in this repository. It is currently **public**: treat everything committed as public. We can choose an open-source license after auditing code and assets. The future mascot must be original rather than a copy of Meta Muse artwork.

## Offline commitment memory prototype

`src/memory.ts` implements approved synthetic facts and active/waiting/snoozed/resolved commitments, with validated snapshots and duplicate reminder reservations. Run `npm test` using Node 22.23.1; no install is required. See [test results](docs/testing/commitment-memory.md) and [ADR 0003](docs/decisions/0003-commitment-memory.md). This does not change OpenClaw or complete live Stage 1 acceptance.
