# ADR 0001 — Keep OpenClaw as the current runtime

**Status:** Accepted, 2026-11-09

**Decision:** Continue with the existing Railway-hosted OpenClaw Gateway for several sessions. It already provides Telegram, scheduled tasks, sessions, tool orchestration and model access. Avoid a premature TypeScript agent rewrite.

**Reasons:** Faster learning from a functioning agent; less duplicated infrastructure; smaller operational burden; enables focused extensions.

**Consequences:** Maintain careful trust boundaries, runtime-specific knowledge and a documented replacement path. Extract custom TypeScript services only when permission isolation or missing capabilities justify them.
