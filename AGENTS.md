# Codex instructions — Alfred

## Context
Alfred is a *running* personal OpenClaw agent hosted on Railway. Telegram and a scheduled 8 PM IST message already work. This repository is its source-controlled documentation and future extensions, not yet its deployment source.

## Rules
- Do not reinstall, replace, or redeploy production OpenClaw.
- Do not install anything on the owner's Mac; work in browser/cloud environments.
- Read `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY.md` before changes.
- Never commit live `openclaw.json`, session state, memory, user data, OAuth tokens, API keys, or Telegram identifiers.
- Use only synthetic fixtures. Company Workspace is out of scope without approval.
- Prefer TypeScript for new narrow integrations; add tests for failures, permissions, retries and idempotency.
- Keep tools least-privileged. Prompts and personality are not enforceable security controls.
- Make small reviewable PRs with purpose, tests and rollback notes; don't claim tests passed unless actually run.
- A future iOS client must use a restricted authenticated API, not Gateway administrator credentials.

## First Codex task
Review this repo for consistency, propose a small first milestone for Alfred's identity and memory, add synthetic memory test cases, and open a PR. **Do not touch the Railway runtime.**
