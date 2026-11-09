# Proposed OpenClaw integration evaluation plan

This is a review plan, not an executable runbook or authorization to access Railway.
All stages after this design require separate approval. No commands here are intended for production.

## Evidence currently available

PRs #1–#6 implement an offline TypeScript prototype. PR #6's cloud run passed 117 tests,
strict TypeScript checking and four synthetic examples:
[run #23](https://github.com/suyashpradhan/alfred-agent/actions/runs/42654422895).
This verifies those fixtures, not OpenClaw plugin loading, authenticated approvals, provider delivery,
production storage, or retrieval across actual OpenClaw sessions. Stage 1 live acceptance remains open.

## Compatibility inventory — unknown until verified

| Required evidence | Why it matters | Safe collection plan |
| --- | --- | --- |
| Installed OpenClaw version and immutable image/release reference | Latest docs may not match deployed interfaces | Owner-provided sanitized metadata or separately approved read-only inspection |
| Node/runtime and module loading support | Prototype CI uses Node 22.23.1 and experimental node:sqlite | Compare exact selected runtime in isolated cloud tests |
| Supported plugin SDK, manifest and build/loading rules | Avoid guessed APIs and unsupported TS entrypoints | Pin matching public release; inspect its source/docs and CLI help in cloud |
| Tool discovery, audience identity and policy enforcement | Tool availability is not authorization | Positive/negative contract tests on pinned release |
| Current scheduler, output paths, retries and job ownership | Prevent duplicate dispatch or accidental announcement | Sanitized inventory later; no schedule changes during discovery |
| Persistent-volume/local-filesystem layout and replica count | SQLite durability/locking assumptions | Later approved metadata inspection; never expose paths containing secrets |
| Existing private backup and restore procedure | Protect original state and recover previous runtime | Later owner-approved private backup plus isolated restore rehearsal |

Do not request tokens, raw environment dumps, gateway URLs, private workspace content, calendar/email
data or Telegram identifiers in chat or GitHub. Record non-sensitive compatibility findings only.
Do not use an auto-fix/upgrade/install command as a discovery step. The current Railway image remains
unchanged even if it lacks the SDK shown in current public documentation.

## Stage A — next proposed implementation, isolated read-only plugin

After owner approval of ADR 0009 and this stage:
1. Select an explicit OpenClaw release for evaluation, recording whether it matches the installed
   version or is only a candidate. Pin SDK and build dependencies in cloud; install nothing on the Mac.
2. Create the smallest plugin wrapping briefing and eligibility reads. Keep the domain module's
   tests unchanged except for justified adapter contract coverage.
3. Use disposable synthetic SQLite data and a separate host configuration with no production tokens,
   mounted production state, real channel routes or delivery credentials. Limit runtime egress to
   deny external sends; dependency downloads occur only in the build environment.
4. Expose only the two proposed read tools, explicitly enabled for the test principal. Open SQLite
   read-only. Exclude mutation, scheduler management, shell, browser and messaging capabilities.
5. Use a headless/local-to-cloud test harness to invoke tools; no real messaging account required.
   If model-assisted invocation is needed, propose a separate synthetic-only credential/budget decision.
6. Validate package/manifests and actual invocation in that isolated Gateway. Test disabled plugin,
   missing audience, stale identity, denied tool, bad input, corrupt/missing database, invalid policy,
   clock rollback and oversized output. Check database content and revision remain unchanged.
7. Confirm no attempted outbound messages, no hidden reservation and no fallback to an empty-success
   preview. Measure latency and lock contention so synchronous storage cannot silently degrade the host.

Exit: reproducible artifact, pinned compatibility matrix, test results and measured cost/latency
presented in a PR. No production install is part of Stage A.

## Stage B — later preview-only trial

Requires a separate concrete approval with target instance, artifact digest, exact config diff,
duration, disable procedure and verified rollback. Start with an isolated instance; any eventual
Railway-hosted preview is a new production change requiring explicit authorization.

A preview is visible only in the approved review interface, never through automatic announcements,
direct message tools, progress messages, source replies, webhooks or failure-alert routes.
Use test data and read-only storage. Retain existing Telegram behavior and 8 PM schedule.
A preview-only plugin must not reserve reminders or consume attempts. Missing storage/identity
must show unavailable/denied rather than fabricating a briefing. Stop if isolation cannot be proven.

## Stage C — later approved writes and delivery pilot

Requires a new design/implementation review. Before any real send:
- Establish authenticated, expiring, operation-bound approvals and durable action identity.
- Implement one dispatch path and verify no competing job or transport retry bypasses the ledger.
- Establish authority fencing across waits, cancellation, crash/restart and operator recovery.
- Verify definitive delivery receipts versus acceptance/unknown outcomes using the selected provider.
- Persist validated host policy and establish clock behavior; model input cannot change either.
- Define caps, monitoring, private audit retention and a kill switch before enabling any recurring work.
- Use a separately approved synthetic destination and bounded one-shot trial before recurring delivery.
  Production commitment data and real recipients require their own explicit scope.

A successful synthetic delivery simulation does not satisfy these conditions.

## Failure and rollback rehearsal for any later rollout

| Trigger | Required response |
| --- | --- |
| Plugin breaks loading or raises latency beyond agreed limit | Disable only the new capability; restore pinned previous artifact/config using version-supported procedure |
| Database unavailable/corrupt or schema unsupported | Fail closed; preserve files and logs privately; no reset or automatic empty initialization |
| Delivery result uncertain or settlement missing | Block retries; stop/fence dispatch before operator reconciliation |
| Duplicate send or unexpected destination | Halt the new dispatch path immediately; retain evidence; do not replay on restart |
| Permission/audience test fails | Disable capability; do not widen permissions to make a test pass |
| Restore from older backup | Keep sending disabled until all possibly delivered attempts have been reconciled |

Back up private runtime state before any future mutation and rehearse restoration outside production.
Keep the original schedule/config available without publishing its private routing details.
After rollback, verify the original Telegram interaction and 8 PM scheduling under the separately
approved live test plan. Preserve reviewed SQLite files; old binaries reject the audit extension
from ADR 0006. Never strip audit history to make rollback appear successful.

## Owner review decision

Approve or revise the recommendation in ADR 0009 first. The next implementation request should
authorize Stage A only, with a pinned evaluation release. Design approval or merging this PR does
not authorize production inspection, deployment, authenticated writes or real delivery.
