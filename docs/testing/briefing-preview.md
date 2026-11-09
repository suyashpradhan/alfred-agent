# Synthetic briefing preview

In cloud development with Node 22.23.1:

```sh
npm test
npm run preview:synthetic
```

The example builds a disposable synthetic SQLite fixture, closes it, previews it
through a read-only handle, and deletes the temporary directory. It never accepts
a production path, connects an account, sends a message or creates a schedule.
No runtime dependency installation is needed. Cloud CI also strictly type-checks
the formatter, tests and example using its existing pinned development tools.

The example prints:

```text
Alfred — Synthetic evening briefing preview
As of: 2026-11-09T14:30:00.000Z (UTC)
Calendar: Not connected.
Gmail: Not connected.

Due:
- [library-book] "Return the fictional library book" — due at 2026-11-09T14:30:00.000Z (at or before preview time).

Waiting:
- [appointment] "Response about the imaginary appointment" — Marked waiting; informational only, not an action reminder.

Snoozed:
- [notebook] "Choose a fictional notebook" — Snoozed until 2026-11-10T14:30:00.000Z; not actionable yet.

Preview only. No notifications sent; no memory or reminder changes.
```

Thirteen new tests cover grouping and reasons, due/snooze boundaries, elapsed
snoozes without mutation, exclusion of resolved items, empty versus failed sources,
invalid snapshots and times, clock regression, deterministic ordering, truncation,
untrusted text, repeated reads, SQLite byte/revision/ledger invariance, and missing
or corrupt files without initialization. The PR records cloud results for the
exact commit; no local test run or production verification is claimed.

See ADR 0005 for display semantics and limits. Preview is not notification
eligibility: uncertain/sent reminder history does not suppress a due item from
this informational view and is never modified.
