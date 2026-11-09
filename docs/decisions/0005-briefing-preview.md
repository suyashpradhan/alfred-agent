# ADR 0005 — Read-only synthetic evening briefing preview

Status: Accepted for isolated synthetic testing, 2026-11-09. PR #2 was verified
merged before implementation. No production access or deployment.

## Decision and behavior

Use a deterministic TypeScript formatter over a single validated snapshot. The
caller supplies the preview timestamp explicitly; there is no clock lookup, LLM,
scheduler or delivery adapter. `previewBriefing` receives only a load capability.
`previewSqliteBriefing` opens an existing synthetic SQLite file with readOnly=true,
closes it after the read, and never initializes, repairs or writes memory.

Output is labeled synthetic and preview-only. Calendar and Gmail are always marked
not connected. The prototype has no integrations and cannot claim there are no
events or messages. Facts and resolved commitment contents are excluded.

| Stored state | Display behavior |
| --- | --- |
| active, dueAt <= preview time | Due, with the exact due timestamp |
| active, dueAt > preview time | Upcoming, explicitly not due yet |
| waiting | Waiting, informational only regardless of due date |
| snoozed, snoozedUntil > preview time | Snoozed, not actionable even if overdue |
| snoozed, snoozedUntil <= preview time | Due or Upcoming based on dueAt; explains elapsed snooze |
| resolved | Excluded |

Elapsed snoozes are a display projection, not a state transition. Preview never
calls claim or settle, advances retry counts, or reserves a reminder. A due item
is not a promise that a notification is eligible or will be sent. Existing pending,
sent or uncertain delivery records remain unchanged.

Order is fixed: Due, Waiting, Snoozed, Upcoming. Each group sorts by due timestamp
(snooze deadline for Snoozed), then ASCII commitment ID. At most 20 items appear;
the preview states how many other unresolved commitments were omitted. It never
labels a truncated list complete. All timestamps use ISO UTC explicitly, avoiding
host timezone dependence and ambiguous "today/tomorrow" labels. Calendar-day and
quiet-hour policy remains separate future work.

## Failure handling and security

Invalid preview times fail before accessing storage. Failed reads or invalid
snapshots return a sanitized unavailable result with task status unknown, never an
empty-memory message or partial task list. Preview times earlier than stored
commitment updates/reminder attempts fail instead of presenting future state as
historical truth. Valid empty/all-resolved memory is explicitly distinguished.

Text is rendered as quoted plain text with line breaks, terminal controls and bidi
formatting neutralized. Stored content cannot introduce new headings, execute
tools or alter inclusion rules. This output is NOT HTML-safe markup: any future
web client must use textContent or equivalent escaping. No network or commands
are derived from stored text. Database paths remain trusted host configuration;
the example only uses generated temporary paths and synthetic fixtures.

## Cost, limits and rollback

No model/provider charges or new service. CI uses account minutes; formatting
sorts commitments in O(n log n) and reads one snapshot within the SQLite adapter's
existing size bound. Runtime tests need no dependency installation; type checking
uses the existing pinned tools in disposable cloud CI, with no Mac installations.

Revert this formatter, example and documentation to remove the preview. No schema
migration or live rollback is needed. This demonstrates a synthetic briefing
format; Stage 1 live OpenClaw acceptance and real evening delivery remain untested.
