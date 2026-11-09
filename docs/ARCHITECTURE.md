# Alfred architecture

## Today — verified deployment
```text
Telegram chat <--> OpenClaw Gateway (Railway)
                       |-- sessions / agent runtime / tool policy
                       |-- 8 PM IST cron / delivery
                       |-- persistent /data volume
                       +-- hosted OpenRouter model API
```
GitHub is a **versioned source of documentation, prompts, and eventually code**, not yet an auto-deployment pipeline. The owner has verified a Telegram response and one scheduled delivery. No Calendar/Gmail access is yet claimed.

## Major components
- **Channel**: Telegram receives and delivers messages, while pairing and allowlists restrict users.
- **Gateway**: Long-running cloud process orchestrates sessions, model requests, tools, and scheduled work.
- **Scheduler**: Triggers jobs without user requests; delivery must be tested separately from execution.
- **LLM provider**: OpenRouter runs inference remotely; OpenClaw does not host a GPU.
- **Persistent state**: Railway volume preserves runtime state across ordinary restarts; back it up privately.
- **Workspace**: Identity, behavior, user preferences, long-term memory and dated notes have distinct purposes.

## Later — one brain, multiple interfaces
```text
Telegram ------------------> Cloud agent (Railway/OpenClaw)
Mobile app -> Authenticated companion API -----^
                       |
              Policy / authorization
                       |
             Narrow connector services
              Personal Calendar / Gmail
```
The mobile app is not the agent runtime. iOS background execution restrictions are handled through cloud scheduling and push notifications. Add an authenticated API rather than exposing an OpenClaw admin Gateway or embedding its token in the app.

## Trust boundaries
1. Untrusted content (webpages, emails, files) is data, not instructions.
2. Agent and Gateway permissions must be enforced by runtime configuration or tool adapters; system prompts are insufficient security controls.
3. OAuth secrets remain in a managed secrets store and never in GitHub, mobile bundles or agent memory.
4. Separate personal and work accounts; work data requires organizational authorization.
5. External writes require explicit approval and durable audit records.

## Future custom components — only when justified
- TypeScript connector proxy for Google OAuth and read-only access
- Commitment ledger with explicit states and idempotency keys
- Activity and approval API for mobile
- Observable execution log and model evaluation harness

The migration target is *capability extraction*, not a complete rewrite by default. Document architecture decisions before changing components.

## Offline memory prototype

`src/memory.ts` adds deterministic synthetic facts, commitment transitions and reminder reservations behind a narrow Store interface. It has no OpenClaw, Railway, model or network integration. `SyntheticStore` is in-memory; serialized snapshot rehydration is tested, not production durability. A future adapter must provide atomic storage and serialize the entire read/change/save operation. See [ADR 0003](decisions/0003-commitment-memory.md) for failure handling, approval, deduplication and operating cost.
