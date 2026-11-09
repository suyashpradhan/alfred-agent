# ADR 0004 — Transactional SQLite prototype

Status: Accepted for isolated synthetic testing, 2026-11-09. User approved the
storage design before implementation. No Railway or OpenClaw integration.

## Decision

Use Node 22.23.1's bundled `node:sqlite` with a single validated JSON snapshot in
`memory_state`. The singleton has an ID constraint, schema version, monotonically
increasing safe-integer revision and payload. SQLite user_version is also checked.
There are no npm runtime dependencies. The Node SQLite API is experimental in this
pinned runtime; changing versions requires rerunning the suite.

Replace Store.load/save with Store.load/transact. The complete read/change/validate/
write operation runs after BEGIN IMMEDIATE. Return a defensive copy only after
COMMIT succeeds. This prevents lost updates and duplicate reservations between
processes sharing the same local database. SyntheticStore implements the same
contract. Store access is a trusted-host capability; application writes still go
through Memory's explicit approval check. Transaction callbacks must be synchronous,
deterministic and free of network or other external side effects. Do not expose
the adapter, callback interface or database paths to model output or clients.

## Durability and failure behavior

- Explicit approved create initializes version 1. It reserves a new owner-only
  file and never overwrites one. Ordinary open requires an existing regular file;
  missing, empty, corrupt, unsupported or incomplete databases fail closed.
- Use SQLite's default rollback journal and synchronous=FULL on every connection.
  Keep the database and its journal together on a local filesystem. No network
  filesystems or multi-host shared-volume operation are supported.
- A 250 ms busy timeout bounds SQLite lock waiting. There are no automatic callback
  retries. A caller may retry a failed operation with the same stable IDs; it must
  not retry external delivery merely because a database acknowledgement failed.
- Validation, SQL or COMMIT errors roll back the transaction. If rollback fails,
  close the connection. Errors expose generic STORAGE codes, never raw paths,
  provider messages or snapshot contents. Domain errors retain their existing codes.
- JSON payloads are capped at 1 MiB. Revision exhaustion fails rather than wrapping.
  A revision counts committed transactions, including accepted no-ops.
- Killed-process recovery is tested. This is not a hardware power-loss certification;
  filesystem/storage durability still matters, including initial directory entries.
- No automatic migration or database reset. Future schema changes require a new
  reviewed migration and recovery plan. Version 1 snapshot validation remains intact.

## Backup and restore

backupTo uses SQLite VACUUM INTO with a bound destination path, then validates the
copy and syncs its file. Existing destinations are rejected. Failed backups are
not reported as successful. Keep parent directories private and owned by the host;
the path checks do not defend against an attacker controlling the filesystem.

restore validates the source, creates a NEW destination through the same SQLite
backup mechanism, and returns a read-only handle. It never overwrites an active
database. Offline tests explicitly reopen the restored file to verify deduplication.
A future live host MUST pause delivery after restoring older state until an operator
reconciles the delivery ledger. The read-only handle is a safeguard, not an
authenticated recovery workflow. No sender or automatic unpause exists here.

Pending and unknown reservations remain blocked after restart/restore; they do not
expire or retry automatically. Operator reconciliation and provider idempotency
remain future integration work. SQLite transactions do not guarantee exactly-once
delivery to an external messaging provider.

## Security, cost and tradeoffs

Only synthetic data is allowed in this prototype. Created files have mode 0600;
SQLite extension loading is disabled and trusted_schema is OFF. Snapshots and
backups are plaintext, not encrypted. They must never be committed or published
as CI artifacts; the workflow uses disposable temporary directories. Before real
data, decide authentication, encryption, retention, deletion and backup access.

One snapshot keeps the PR small and preserves the state machine. Each transaction
copies and validates all records, with a bounded payload; a future larger workload
may need tables/indexes or PostgreSQL. SQLite serializes writers. There is no new
database service, provider bill or model token usage; CI consumes account minutes.
No software is installed on the owner's Mac for this milestone.

## Rollback

This PR changes the internal Store interface. Revert the adapter and interface
change together to restore the in-memory prototype. Preserve any synthetic database
for inspection; the old module cannot open SQLite. No production deployment,
runtime migration, Railway backup or live rollback is involved.

References:
- https://nodejs.org/download/release/v22.23.1/docs/api/sqlite.html
- https://www.sqlite.org/lang_transaction.html
- https://www.sqlite.org/lang_vacuum.html
