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

## Read-only OpenClaw candidate evaluation

The two-tool synthetic plugin now uses v2 invocation authority. The pinned OpenClaw 2026.11.2
host requires a native memory provider and durable direct-chat provenance to grant an owner-private
audience. An isolated no-corpus provider fixture and authenticated sessions.create RPC demonstrate
successful real-host previews; missing prerequisites still deny. Security checks remain intact.
See [ADR 0011](decisions/0011-readonly-authority-compatibility.md) and
[evaluation evidence](testing/openclaw-readonly-evaluation.md); PR #9 records final cloud results.

This is conditional candidate compatibility, not a production memory integration. The fixture
is not shipped in Alfred's artifact. A production provider decision and deployed-version verification
remain separate approval gates; Stage B is not authorized. No Railway access or deployment.
