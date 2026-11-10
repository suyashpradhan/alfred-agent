# Stage A read-only plugin evaluation

## Current result

Both tools succeed in an actual isolated OpenClaw 2026.11.2 Gateway when it has a native memory
provider and a host-created direct-chat session with owner authority. The initial successful
[cloud run #27](https://github.com/suyashpradhan/alfred-agent/actions/runs/42805677232) passed 20
assertion groups. PR #9 records the final expanded suite and checks on its current head.

The plugin's existing authorization checks remain intact, and registration now requires v2 live
invocation authority. See [ADR 0011](../decisions/0011-readonly-authority-compatibility.md).
PR #8's denials were caused by unmet prerequisites: memory-core is legacy in this pinned version,
and HTTP-only session creation does not establish durable direct-chat provenance.

## What is tested

| Boundary | Required outcome |
| --- | --- |
| Native provider plus authenticated host-created direct session | Both actual Gateway previews succeed |
| Legacy provider | Private preview denied |
| Native provider plus chatless HTTP-created session | Private preview denied |
| Owner session key without authentication | HTTP 401; no tool result |
| Direct tools endpoint | Private preview denied |
| Disabled plugin / excluded mutation tools | Unavailable |
| SDK authority failures | Missing/wrong identity/audience, missing or stale guards, abort deny |
| Final guard failures | Both tools deny if either guard becomes stale before release |
| Inputs and storage | Invalid arguments/policy/time, missing/corrupt/locked storage fail closed |
| Read-only bounds | At most 20 entries, 64 KiB, unchanged SQLite digest/revision |
| Packaging | Strict own-source build, generated manifest validation, staged runtime package |
| Fixture isolation | Native fixture has no readable corpus or tools; not shipped with Alfred |

SDK contexts test adapter behavior; only the native session test demonstrates host-issued authority.
Stale-guard coverage is at the adapter boundary, not an end-to-end session-reset test.
The protocol fixture filters responses by unique current call ID so prior transcript results cannot
satisfy a new invocation. No real model or provider account is involved.

## Scope and limitations

The native provider is an evaluation fixture whose reads return unavailable. The real host,
not the fixture or Alfred, mints the audience and validates its leases. A deployable native memory
provider has NOT been selected or built. Production compatibility, deployed version and preservation
of Alfred's existing memory remain unverified. Stage B still requires separate review and approval.

Read measurements from run #27: median 0.37 ms, maximum 0.83 ms; lock failure 251 ms.
These are small synthetic fixture measurements, not production guarantees. The synchronous SQLite
lock wait can block the event loop; retain the rollout latency-budget decision.

## Reproduction and artifacts

Use the Isolated OpenClaw evaluation workflow on a disposable Ubuntu cloud runner.
Its runtime phase uses a fresh environment, no persisted checkout credential and a network namespace
with loopback only, then drops to the fixture-owning runner user. Dependencies download before
network isolation. It performs no production discovery or deployment and installs nothing on the Mac.

The artifact includes the built plugin, package metadata, generated manifest, resolved npm lock
and synthetic evidence JSON. Temporary Gateway tokens/config, private host databases and raw logs
are not uploaded. All evaluation fixtures are synthetic and removed. Reproducing an existing run
requires its preserved dependency lock; a new npm install can resolve different transitive versions.
Third-party declarations are skipped with skipLibCheck, while our adapter is checked strictly.
The domain suite retains its original strict check on Node 22.

See [ADR 0010](../decisions/0010-readonly-plugin-evaluation.md) and
[package README](../../integration/openclaw/README.md). Do not install the artifact on Railway.
