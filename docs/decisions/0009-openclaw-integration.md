# ADR 0009 — Proposed OpenClaw integration boundary

Status: proposed for owner review. Approval to write this design is not approval to implement or deploy it.
Research date: 2026-11-09. No Railway access or installed-version inspection performed.

## Recommendation

Keep OpenClaw as Alfred's runtime, channel and scheduling owner. Prototype a small, read-only
tool plugin in an isolated cloud environment first. It should expose briefing and eligibility
projections from synthetic SQLite data. Do not replace OpenClaw's memory provider or session store.

This is an architectural recommendation, not verified compatibility with the deployed version.
If the installed release cannot support the required interfaces safely, stop and revise the design;
do not upgrade production as a prerequisite hidden inside an integration task.

## Options

| Option | Benefit | Cost and risk | Recommendation |
| --- | --- | --- | --- |
| Native tool plugin wrapping the TypeScript module | Small adapter; no new network service or credentials; OpenClaw retains orchestration | Runs in the Gateway trust boundary; SDK/runtime coupling; SQLite work can block its process | Preferred isolated preview prototype, conditional on version checks |
| Restricted service plus a thin OpenClaw adapter | Separate process/resource limits and independent module runtime; service owns its database | Additional hosting, authenticated transport, secret rotation, timeouts and observability; still needs a supported host adapter | Reconsider if runtime incompatibility or measured blocking/isolation needs justify it |
| Skill/prompt calling shell commands | Superficially little adapter code | Shell authority, fragile parsing and prose-based permissions; harder to guarantee one delivery path | Reject |
| Replace the runtime or memory plugin | Could unify storage | Unnecessary migration of working sessions, memory and scheduling | Out of scope |

These are design tradeoffs, not vendor price estimates. A plugin adds no separately hosted service,
but still uses CPU/disk and may invoke model turns through its host. A service adds hosting and
operational costs. Measure latency, lock contention, memory and model usage in the isolated prototype
before setting a deployment budget; no extra model calls are needed for deterministic policy evaluation.

## What documentation establishes, and what it does not

Current public documentation describes tool-only plugins, manifests, explicit tool allowlisting and
structured outputs. A plugin can wrap existing domain operations; this does not establish that Alfred's
installed release implements the same SDK. Use a strict schema and keep domain status fields nested
inside a result envelope to avoid host-level outcome interpretation.
Source: [Tool plugins](https://docs.openclaw.ai/plugins/tool-plugins).

Plugins run in-process and must be treated as trusted code. A tool allowlist limits model invocation,
not the operating-system authority of a malicious plugin. Isolation therefore starts with an entirely
separate synthetic environment, not a production-loaded plugin labeled read-only.
Source: [Tool and agent permissions](https://docs.openclaw.ai/gateway/security/tool-permissions).

Plugin inspection is not proof that an already-running Gateway loaded the same artifact. Pin the
artifact and verify actual behavior in the isolated instance. Public pages also describe differing
reload/restart behavior; use the selected release's documentation and CLI help rather than copying
latest-page commands into production.
Sources: [Plugins](https://docs.openclaw.ai/tools/plugin),
[Tool and agent permissions](https://docs.openclaw.ai/gateway/security/tool-permissions).

Automation delivery modes control automatic output; disabling that output does not by itself remove
an agent's message-tool capability. Failure notification routes also need separate consideration.
Preview isolation must remove send capabilities and credentials, not rely on a quiet final reply.
Source: [Automation delivery](https://docs.openclaw.ai/automation/cron-jobs/delivery).

## Ownership contract

| Concern | Proposed owner | Boundary |
| --- | --- | --- |
| Conversation, identity and existing long-term memory | Existing OpenClaw runtime | No replacement or import of private memory into this repo |
| Commitment state, attempts and recovery audit | Alfred module through one storage owner | Separate database, not OpenClaw's internal tables; no second commitment ledger |
| Timezone/quiet-hour preferences | Trusted host configuration | Validate at startup and per use; missing policy fails closed; model cannot supply overrides |
| Wakeups and scheduling | OpenClaw | No second cron, polling service or plugin timer; existing 8 PM job untouched |
| Eligibility, cooldown and reservation | Deterministic module | Preserve UTC-day keys; local quiet hours do not reset attempts |
| Future outbound transport | One OpenClaw-owned channel path | Adapter may request delivery only through this path; no parallel Telegram client |
| Final delivery settlement | Trusted delivery adapter | Correlate reservation key and attempt to authoritative transport evidence |
| Recovery review | Authenticated operator flow | Stop/fence original sender first; append audit atomically |

The first plugin is a reader only. Existing read-only file support is useful but is not an end-to-end
security or performance certification. A separate service, if later selected, must own its SQLite
file on its own local persistent filesystem. Do not share one SQLite file across network-mounted
replicas or let both a service and plugin independently own migrations.

## Proposed capability surface

Names below are design labels, not implemented OpenClaw APIs.

| Capability | Initial preview | Later mutation scope |
| --- | --- | --- |
| alfred_briefing_preview | Allowed for authenticated owner audience | Remains read-only |
| alfred_reminder_eligibility | Allowed; bounded IDs/reasons | Remains read-only |
| commitment create/transition | Absent | Exact approved operation with version precondition |
| reservation/settlement | Absent from model tools | Internal trusted dispatch only |
| recovery review | Absent | Separate authenticated operator route |

Host chooses the database path, synthetic fixture, policy and clock. Tool arguments cannot select
a filesystem path, URL, recipient, account, SQL, arbitrary code, approval boolean or reminder outcome.
Inputs and outputs need strict schemas, bounded sizes and explicit unavailable/denied errors.
Only the permitted audience may read results; conversation content is not identity proof.
No grant when identity/audience is absent or stale. Do not treat a paired connection as blanket
authorization to disclose owner-private data to every session.

For later writes, the approval record must bind the authenticated principal, exact operation and
payload digest, target/version, destination where relevant, expiry and single-use request ID.
Revalidate authority immediately before effects; reject changed, expired or replayed approvals.
The existing approved:true and reviewer strings are prototype inputs, not authentication.
Binding to available host identity/approval APIs must be demonstrated for the pinned release.
If it cannot be demonstrated, keep writes unavailable rather than synthesizing owner identity.

## Single delivery path and unresolved design work

A future scheduled run must pass a deterministic gate before output becomes sendable:
validated policy and clock -> atomic claimWithPolicy -> one channel send -> correlated settlement.
A preview does not authorize delivery. The simulator is a test fixture, not a production sender.

Do not combine an automatic scheduled announcement with a second direct-send reminder path.
For new commitment delivery, choose one route only after the version-specific transport can bind
its outcome to the reservation and attempt. Generic job success, model prose and generated reply
text are insufficient evidence of delivery. If the host's announcement path cannot expose the
required correlation/outcome, leave delivery disabled and revisit the adapter design.

Before any pilot, define and test host/transport retry behavior and ensure it cannot create
untracked duplicate sends. Timeouts and ambiguous disconnects remain pending/unknown; confirmed
failure requires evidence of non-delivery. A crash after accepted delivery but before settlement
requires reconciliation, not automatic retry. No exactly-once external delivery claim is made.

A future dispatch needs durable fencing/cancellation authority across asynchronous sends and
recovery, plus a policy recheck immediately before transport if queueing crosses quiet hours.
Existing claim/settle fencing alone does not stop an already-running external sender.
These are implementation prerequisites, not capabilities added by this design.

## Verification and rollback

See [integration evaluation plan](../testing/openclaw-integration-plan.md) for evidence gates.
This PR changes documentation only. Removing these documents rolls back this PR without storage
or deployment changes. Any later runtime rollout requires its own approved, rehearsed rollback;
a code revert or database backup alone cannot undo an external message.
