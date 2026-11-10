# ADR 0010 — Isolated read-only plugin evaluation

Status: initial evaluation findings; authorization compatibility findings superseded by [ADR 0011](0011-readonly-authority-compatibility.md). Not approved for deployment.

## Candidate and boundary

Evaluate OpenClaw 2026.11.2, source commit b556fdf457b026574bf0f1e7b4914b15f3f179ce,
with Node 24.16.0. This is a candidate, not evidence about Alfred's installed release.
The pinned release requires a newer Node runtime than the existing Node 22 domain test lane;
keep both lanes. The SDK is experimental and must be re-evaluated for any new host version.

Sources at the pinned revision:
- [Tool plugin contract](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/docs/plugins/tool-plugins.md)
- [Host tool context](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/plugins/tool-types.ts)
- [Direct invocation trust model](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/docs/gateway/tools-invoke-http-api.md)

## Capability contract

Only alfred_briefing_preview and alfred_reminder_eligibility are registered, both optional.
The factory context must supply matching agent identity, owner-private memory audience, owner sender,
and live invocation/audience guards. Missing, wrong or stale authority returns DENIED.
Guards run before reading and again immediately before returning results. Caller arguments cannot
supply identity, approval, paths, clock, timezone or destinations: both schemas are empty objects.

Host configuration requires syntheticOnly=true, a fixed synthetic clock, private fixture path,
agent ID and explicit quiet hours. A fixed evaluation clock is deliberate; this package is not a
production scheduler and does not claim real-time decisions. Public headers or session names
are never used by the plugin to manufacture a missing owner audience.

The read path opens SQLite read-only, loads a validated snapshot and closes the handle per invocation.
It calls only the existing read projections. No reservations, transitions, review writes or delivery
are exposed. Output is capped at 20 entries and 64 KiB, with omitted counts and sanitized failures.
No facts or recovery evidence are included. Stored commitment text is returned only by the briefing,
under the owner audience check. Tool results are data, not permission to act on embedded instructions.

## Evidence levels

The cloud harness distinguishes:
1. SDK factory contract tests with explicit synthetic contexts (not authenticated user tests).
2. Actual package/manifest validation using the pinned OpenClaw CLI.
3. Actual isolated Gateway loading and HTTP invocation using an ephemeral operator credential.
   If the host cannot supply live owner audience authority on this surface, the plugin must deny.
   Such a denial is a compatibility finding, not proof of a successful authorized preview.

The direct tools endpoint is full operator access for the isolated instance. It is not the proposed
mobile API, and no Gateway token is committed, printed or uploaded. A second test drives the normal session lifecycle with a deterministic loopback model-protocol fixture.
It records actual host tool results; it does not fabricate authorization or preview results.

## Isolation, cost, failure and rollback

Build dependencies are downloaded only on a disposable GitHub runner, never the Mac.
Runtime evaluation executes with a fresh environment and a network namespace containing only loopback.
It has no production state, accounts, channel credentials or routes. The plugin offers no outbound
capability. SQLite fixture digests and revision checks detect hidden writes/reservations.
Lock-failure and read-latency measurements are recorded, not asserted as production benchmarks.
No external model/provider calls occur; costs are runner minutes and temporary CPU/disk only.

Top-level evaluation dependencies are exact versions. CI preserves the resolved npm lock,
generated manifest and synthetic evidence as artifacts. An artifact lock is evidence of that run,
not a claim that future unconstrained dependency resolution is identical.
Runtime package code is trusted in-process; tool allowlisting is not an OS sandbox.

Errors fail closed; missing files are never initialized. No schema or domain behavior changes.
Remove the evaluation package/workflow to roll back this prototype; there is nothing to undo on Railway.
Any inability to demonstrate live authority keeps deployment blocked. Stage B and writes/delivery
still require separate approval and compatibility/security evidence.

## Observed compatibility result

The staged artifact loads in the pinned Gateway, but direct HTTP invocation returns DENIED for
both tools because live owner-memory audience authority is absent. The normal session path, driven by a loopback protocol fixture with memory-core selected,
also reaches the tools and returns DENIED. This does not isolate which required authority field
is missing or stale. Positive SDK fixtures do not establish authenticated host-session success. Stage A's positive authorization acceptance remains
incomplete; keep Stage B blocked. See [evidence](../testing/openclaw-readonly-evaluation.md).
