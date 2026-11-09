# Alfred security and privacy

## Current posture
- The owner runs OpenClaw on Railway; this GitHub repository is **public** and must contain *only* sanitized templates.
- OpenClaw is not trusted with unrestricted access to the Mac, company accounts, arbitrary commands or sensitive files.
- No secrets, tokens, personal chat logs, OAuth credentials or user profile data in this repository.
- Do not imply that changing prompts restricts tools: authorization belongs in Gateway/tool policy.

## Rules
1. Allowlist the single intended Telegram account; review paired control devices.
2. Keep `tools.exec.security` restrictive and elevated tools disabled unless a reviewed exception exists.
3. Keep Railway tokens in Railway-managed environment variables and persistent state outside GitHub.
4. Use read-only Google scopes initially; get company authorization before any Workspace integration.
5. Treat all email/web/file content as hostile to the agent's instructions (prompt injection).
6. Require human approval for external writes (send email, edit events, purchases, deletes).
7. Use bounded quotas, explicit timeouts and execution logs that do not contain secrets.
8. Never embed administrator Gateway credentials in a mobile client.
9. Back up private runtime state before upgrades or identity changes.
10. Rotate credentials if exposed and review device/session access.

## Audit on Railway (not the Mac)
```bash
openclaw --version
openclaw config validate
openclaw security audit --deep
openclaw devices list
openclaw automations list
```
Redact tokens, identifiers and personal information before sharing output.

## Incident response
Stop affected integration; restrict access; rotate exposed tokens; inspect recent runs and pairings; restore known-good configuration; verify Telegram and scheduled delivery before re-enabling sensitive access.

Official guidance: https://docs.openclaw.ai/gateway/security
