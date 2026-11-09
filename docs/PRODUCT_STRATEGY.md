# Alfred — Product strategy

## North star
An always-available, privacy-conscious personal companion that remembers commitments, notices meaningful changes and follows through with permission. A recognizable original character makes its state and actions understandable.

## Coaching critique
**Opportunity:** persistent context, proactive follow-through and a friendly mobile presence can be genuinely useful. **Risk:** an attractive mascot with generic chat is a wrapper, not a differentiated agent. Make state, evidence and reliable completion the primary product.

## Positioning
Build for one owner first. Do not optimize for market competition or marketing claims during exploration. The goal is excellent personal utility and a technically credible open-source learning project.

## Core user experience
- The owner can say, “Remember to check that reply next week.”
- Alfred records a specific commitment with source, due date and state.
- A scheduled/event-triggered check detects meaningful changes.
- Alfred sends a concise notification with context and why it matters.
- The owner can approve, snooze, dismiss, or mark complete.
- Alfred updates durable state and stops repeating resolved reminders.

## Character philosophy
Original, warm, practical, quietly playful. Animation maps to real states: idle, listening, thinking, working, waiting for approval, completed and failed. Never fake task progress or pretend a tool ran.

## Scope
**V1:** identity, memory, commitment ledger, calendar briefing, inbox triage, Telegram interaction, cost/run logs. **V2:** follow-up intelligence, meeting preparation, research monitoring, project progress, approval flows. **Later:** character-led mobile app, voice, more connectors and advanced workflows. See [Feature backlog](FEATURE_BACKLOG.md).

## Success metrics
- Useful notifications as a share of all notifications
- Percentage of actionable emails correctly identified in a labeled evaluation set
- Duplicate notifications per event
- Briefing delivery rate and median latency
- Percentage of claims with source evidence
- Monthly cloud + inference spending
- Approval/rejection rate for suggested actions

## Engineering principles
One cloud brain; interfaces are clients. Deterministic code for predictable tasks, LLMs for genuinely ambiguous judgment. Explicit permissions and testable state transitions. Never make unsupported claims of autonomy.
