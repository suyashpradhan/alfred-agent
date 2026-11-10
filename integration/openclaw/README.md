# Alfred read-only evaluation package

Cloud-only Stage A prototype. Do not install this package into Alfred's live Gateway.

Candidate: OpenClaw 2026.11.2 (source b556fdf457b026574bf0f1e7b4914b15f3f179ce),
Node 24.16.0. Alfred's deployed version remains unknown.
The existing domain suite still runs separately on Node 22.23.1.

Only two optional tools exist:
- alfred_briefing_preview
- alfred_reminder_eligibility

Both accept an empty argument object. Trusted host configuration selects a disposable synthetic
SQLite file, fixed evaluation clock, agent identity and timezone/quiet hours.
No model argument can change those values or provide approval. A result is either a bounded preview
or a sanitized error; it never reserves, settles, sends or modifies commitments.

Both owner-private audience and current host authority are required. The test harness's explicit
synthetic contexts prove adapter behavior only. The separate actual Gateway test must report
whether its direct HTTP surface supplies that authority; missing authority is a denial, not a
successful preview and not a reason to weaken the guard.

## Cloud verification

Use the repository's Isolated OpenClaw evaluation workflow. It:
1. Installs exact top-level evaluation dependencies and strictly checks adapter source.
2. Bundles domain code into dist/index.js, leaving host SDK and TypeBox external.
3. Stages artifact/ separately from the host development installation.
4. Runs SDK contract tests, pinned CLI manifest validation and an actual temporary Gateway.
5. Evaluates runtime in a network namespace with only loopback, as the fixture owner.
6. Checks disabled-plugin and unauthenticated/denied calls, state digests/revision, read latency
   and bounded lock failures, and uploads sanitized evidence with the resolved dependency lock.

The workflow is for disposable Ubuntu cloud runners with namespace support. No Mac installation.
Third-party SDK declarations use skipLibCheck; strict checking remains enabled for our TypeScript.
No new domain behavior or migration is included. Top-level dependencies are pinned; the artifact
lock captures transitive resolution for each run. Do not describe future fresh resolution as identical.

Only generated package metadata, compiled code, dependency lock and synthetic evidence are uploaded.
Temporary Gateway configuration/authentication, databases and raw runtime logs are excluded.
Actual plugin loading, successful preview invocation and authorization are separate evidence claims.
See [ADR 0010](../../docs/decisions/0010-readonly-plugin-evaluation.md) for boundaries and rollback.

## Authorization prerequisites

The pinned host requires a native memory provider and a durable direct-chat root session to
mint the required owner-private audience. The harness uses a separate no-corpus native-provider
fixture and authenticated sessions.create RPC. Both tools are registered with contextVersion: 2.
The host supplies all authority; the plugin still checks identity, audience and both live guards.

Successful actual Gateway previews are covered alongside legacy-provider/chatless denials.
The test fixture is excluded from artifact/ and must not be installed on Railway.
This is conditional isolated compatibility, not a deployment-ready memory integration.
See [ADR 0011](../../docs/decisions/0011-readonly-authority-compatibility.md).
