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

`src/memory.ts` adds deterministic synthetic facts, commitment transitions and reminder reservations behind a narrow Store interface. It has no OpenClaw, Railway, model or network integration. `SyntheticStore` is in-memory; serialized snapshot rehydration is tested, not production durability. The approved SQLite prototype now provides transactional local-file storage for synthetic data; Store.transact owns the complete read/change/validate/commit operation. It is not connected to OpenClaw. See [ADR 0004](decisions/0004-sqlite-storage.md) for initialization, concurrency, backup and restore boundaries. See [ADR 0003](decisions/0003-commitment-memory.md) for failure handling, approval, deduplication and operating cost.

## Synthetic briefing preview

`src/briefing.ts` projects one validated memory snapshot into a bounded plain-text preview, with explicit time and disconnected Calendar/Gmail labels. Its SQLite entry point opens storage read-only. It does not invoke commitment mutations, reminder claims, scheduling, models or delivery. See [ADR 0005](decisions/0005-briefing-preview.md) and the [synthetic example](testing/briefing-preview.md).

## Synthetic reminder recovery

Memory.blockedReminders reads blocked reservations and audit history. Memory.reviewReminder atomically checks the observed attempt/status/review count, records an explicit human decision and updates its outcome. The optional version-1 snapshot reviews extension is rejected by old readers; preserve reviewed files on rollback. No sender or provider lookup is present. See [ADR 0006](decisions/0006-reminder-recovery.md).

## Synthetic quiet hours and eligibility

The offline policy adds explicit timezone/quiet-hour evaluation, read-only reason previews and
policy-aware transactional reservations. UTC deduplication days and recovery safeguards are preserved.
Run `npm run eligibility:synthetic` in cloud development; see [ADR 0007](decisions/0007-reminder-eligibility.md)
and `docs/testing/reminder-eligibility.md`. The PR records cloud test evidence.
Legacy `Memory.claim` remains a policy-free synthetic API; future senders must use
`claimWithPolicy` with trusted explicit configuration. No live scheduling or Railway integration.
