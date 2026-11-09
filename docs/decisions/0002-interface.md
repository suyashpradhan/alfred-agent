# ADR 0002 — One cloud agent, multiple interfaces

**Status:** Accepted, 2026-11-09

**Decision:** Telegram is the initial interface. A future original character-led mobile app is a client of the same cloud agent, with a dedicated authenticated, capability-limited API. No always-on on-device agent or embedded Gateway admin token.

**Reasons:** iOS background limitations, simpler state consistency, reusable orchestration, safer permissions.

**Consequences:** Need an authenticated mobile API, push notifications, reliable activity-state events and original character art. Mobile development is deferred until core workflows are useful.
