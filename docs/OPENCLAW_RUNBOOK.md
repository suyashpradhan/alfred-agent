# OpenClaw on Railway — Operating runbook

All commands run in the **Railway cloud shell**. Nothing is installed on the owner's Mac.

## Baseline health
```bash
openclaw --version
openclaw models status
openclaw channels status --probe
openclaw devices list
openclaw automations status
openclaw automations list
```
The owner has confirmed OpenRouter model responses, Telegram replies and an 8 PM IST test delivery.

## Inspect an automation
```bash
openclaw automations list
openclaw automations show YOUR_JOB_ID
openclaw automations runs YOUR_JOB_ID --limit 5
```
Check `openclaw automations --help` for exact flags supported by the installed version. To manually trigger a *reviewed* job:
```bash
openclaw automations run YOUR_JOB_ID --wait
```
Inspect execution success and Telegram delivery separately.

## Identity and memory changes
In the existing OpenClaw dashboard, inspect the agent workspace files before editing. Compare the templates under `openclaw/workspace/`. Preserve existing state and privately back it up; do not overwrite `MEMORY.md` or `USER.md` with example text. Test identity, a synthetic memory fact, Telegram response and the existing cron after each change.

## Deployment discipline
Do **not** auto-deploy every GitHub commit into production. Keep source-controlled templates and live runtime state separate until a reviewable sync/rollback workflow exists.

References: https://docs.openclaw.ai/concepts/agent-workspace and https://docs.openclaw.ai/cli/cron
