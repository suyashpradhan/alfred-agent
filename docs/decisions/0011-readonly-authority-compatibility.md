# ADR 0011 — Read-only plugin authority compatibility

Status: isolated implementation; see PR #9 for current-head cloud validation. No production approval.

## Cause

OpenClaw 2026.11.2 (b556fdf457b026574bf0f1e7b4914b15f3f179ce) only resolves
a session memory audience when a native memory provider is loaded. The previous test selected
memory-core, whose registered runtime is legacy in this release. Selecting it cannot satisfy
Alfred's owner-private audience requirement.

There is a second independent prerequisite: the root session must have durable direct-chat
provenance and an authenticated owner sender. Creating a row through the OpenAI-compatible HTTP
endpoint alone leaves it without a durable chat type. A session key or bearer token by itself
does not supply that provenance.

## Decision

Keep every check in authorized(): owner sender, matching agent and owner-private audience,
plus invocation and audience currency checks before reading and immediately before returning.
Opt into the public contextVersion: 2 tool factory contract, which requires admitted invocation
authority. The pinned defineToolPlugin convenience helper emits v1 factories, so a small
registration adapter forwards those factories through the public v2 API while retaining generated
manifest metadata. No OpenClaw internals are imported, patched or replaced.

For cloud evaluation only, register a separate native-provider fixture. It exposes no tools,
corpus, hooks or writes; open checks caller currency and returns unavailable. It does not create
audiences or identity. The real host creates audiences and owns their generation leases.
The fixture is staged separately and excluded from the Alfred distributable artifact.

Create a fresh direct-chat session through the pinned CLI's authenticated sessions.create RPC.
Then drive the actual Gateway session with the existing deterministic loopback model-protocol
fixture. Tool results must match the current unique call ID, preventing historical successes
from satisfying the current assertion.

## Evidence and limits

The harness verifies successful owner previews under the native-provider/direct-session setup;
legacy-provider and chatless sessions still deny, as does a request without authentication.
Factory tests cover missing/wrong owner, mismatched agents, conversation audiences, absent guards,
stale guards at entry and at release for both tools, and aborted calls.
Stale-authority tests use explicit SDK contexts; they do not claim end-to-end host revocation coverage.
Database digests, existing bounds, lock/error tests and the domain suite remain required.

This establishes conditional compatibility in an isolated candidate. The fixture is NOT a
production memory provider. Selecting a real native provider, verifying Alfred's deployed version
and preserving its existing memory behavior require a separate reviewed decision. Do not install
the fixture, change a live memory slot or describe Stage B as approved.

## Security, failures, cost and rollback

Missing prerequisites continue to deny; there is no fallback that fabricates audience authority.
Direct /tools/invoke remains unsuitable for these private previews. Only synthetic sessions and
temporary host state are created. Real SQLite commitment state remains read-only; there are no
reminder claims, sends or new external capabilities.

No external model calls or account credentials are used. Costs are cloud runner time and temporary
disk/CPU. No Mac dependencies or Railway access. Pinning/transitive-lock limitations and synchronous
SQLite latency limitations from ADR 0010 still apply. Revert this evaluation PR to roll back;
production has nothing to undo.

## Pinned primary sources

- [Audience preparation](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/agents/embedded-agent-runner/run/attempt-memory-audience.ts)
- [Memory-core legacy runtime registration](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/extensions/memory-core/index.ts)
- [Host audience and session checks](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/plugins/memory-audience.ts)
- [V2 factory authority](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/plugins/tool-factory-context.ts)
- [Convenience helper registration](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/plugin-sdk/tool-plugin.ts)
