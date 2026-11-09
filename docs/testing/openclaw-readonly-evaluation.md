# Stage A read-only plugin evaluation

## Result and compatibility limit

The candidate plugin compiles, its manifest validates, and OpenClaw 2026.11.2 loads the staged
artifact in an isolated Gateway. The actual HTTP tools endpoint reaches both plugin tools, but
both return DENIED because the route does not supply live owner-private memory audience authority.
This is a successful fail-closed test, NOT a successful authenticated preview.

Positive briefing/eligibility tests use synthetic SDK factory contexts. Successful real-host
owner-session preview invocation remains unverified. Stage A's positive host-authorization
acceptance is therefore incomplete; Stage B and production deployment remain blocked.
The recommended follow-up is a separately reviewed host-session evaluation using the pinned
release's actual audience lifecycle, without relaxing guards or treating an operator token as
memory-audience proof. No paid model or provider account was used in this evaluation.

Pinned source confirms the context passes through the prepared memory audience; the HTTP tool
resolution route does not prepare one:
- [Plugin context](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/agents/openclaw-tools.plugin-context.ts)
- [Gateway tool resolution](https://github.com/openclaw/openclaw/blob/b556fdf457b026574bf0f1e7b4914b15f3f179ce/src/gateway/tool-resolution.ts)

## Verified evidence

[Cloud evaluation run #12](https://github.com/suyashpradhan/alfred-agent/actions/runs/42660207344)
passed 18 evaluation checks with Node 24.16.0 and OpenClaw 2026.11.2.
These are assertion groups in the evaluation harness, separate from the existing 117 domain tests.
The final PR records checks on its current head.

| Check | Evidence |
| --- | --- |
| SDK registration | Exactly two optional read tools |
| Positive preview | Synthetic host-context fixtures succeed |
| Permission failures | Missing/wrong/stale audience, missing guards, wrong identity and abort deny |
| Input/policy/storage | Extra arguments, invalid policy, clock rollback, missing/corrupt storage fail closed |
| Bounds | 20-entry limit, omitted count and 64-KiB serialized output rejection |
| No module writes | Fixture hash and revision unchanged; no reminder reservation |
| Packaging | Strict own-source TypeScript build, CLI manifest validation, staged distributable |
| Gateway disabled/auth/policy | Disabled plugin unavailable, unauthenticated request rejected, mutating/message tools unavailable |
| Gateway enabled | Both tools reached; both denied absent memory-audience authority |
| Isolation | Runtime namespace exposes loopback only; no real channel credentials or provider calls |

Measured in run #12 on a small synthetic fixture: read median 0.39 ms, maximum 0.78 ms,
exclusive-lock failure 252 ms. These are fixture measurements, not production latency guarantees.
The 250-ms lock wait blocks the event loop synchronously: a future rollout needs a latency budget
and may require worker isolation or the service alternative if contention is material.

Initial startup failures exposed a packaging boundary: embedding the host development installation
inside the plugin source root caused the pinned Gateway to reject source capture. Staging a
self-contained artifact root separately from the host installation resolved startup without
changing OpenClaw or bypassing its source guard. Readiness, not /healthz liveness, gates invocation.

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
