# Synthetic reminder recovery

In cloud development on Node 22.23.1, run:

```sh
npm test
npm run recovery:synthetic
```

The example creates a disposable synthetic SQLite file, reserves a reminder
without sending it, displays the blocked queue, records an uncertain human review,
replays that exact decision, and confirms the reminder remains blocked. It then
closes storage and removes its temporary directory. All reviewer IDs and evidence
are fictional. No runtime dependency installation is required.

The workflow APIs are Memory.blockedReminders() and Memory.reviewReminder(). Use
the queue's reminder key, attempts, current pending/unknown status and reviewVersion
in a review request. Supply a unique decision ID and explicit trusted-host approval.
To retry the same request after an acknowledgement failure, reuse its exact fields
and decision ID; the original receipt is returned. Do not manufacture a newer
review version to bypass a conflict: reload the queue and review the new state.

Twenty-four recovery tests exercise both SyntheticStore and SQLite: queue reads,
three outcomes, exact replay/conflicts, permissions, malformed requests, timestamp
validation, stale reviewers/callbacks, cooldown and attempt cap, commitment state
preservation, session reopening, failed transactions/SQL writes, backup/restore,
malformed audit state, and exclusion of review evidence from briefing output.
The existing suite remains enabled. CI also runs both examples and strict source/
test type checking. The PR records results for the exact commit; no local or
production test run is claimed.

Read ADR 0006 before using this workflow. In particular, reviewed snapshots cannot
be read by old binaries, and a future real sender must be stopped/fenced before a
human confirms non-delivery. No automatic retry is allowed while uncertainty remains.
