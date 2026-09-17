# SOC Agent Deployment Status

## Current State

### What's deployed
- **38 Windows agents** installed via TRMM API (api.simplyict.com.au)
- Agent path: `C:\ProgramData\SOCAgent\agent.py`
- Scheduled task: `SOCAgent` (runs as SYSTEM on startup)
- Python 3.12 + aiohttp installed on each
- Persistent agent ID fix applied (agent.id file)

### Agent configuration
- Connects to: `http://173.208.232.91:8095/api/agent/ws` (gpu-ajob box, public IP; ufw 8095 open)
- Shared WS key required: `--key <EDR_WS_KEY>` (env `EDR_WS_KEY` on the box); handshake without it → 403

> Status 2026-09-04: mission-soc (incl. `/api/agent/ws`) now runs on gpu-ajob at
> `10.121.16.163:8095` — the `.84:8095` endpoints below are historical.

> **Resolved 2026-09-07**: all agents reconnected via TRMM sweep
> (`trmm-reconnect-agents.py` in repo root — runs the current
> `/api/agent/install/windows-batch` installer on each online Windows agent,
> which fixes python, start.cmd, the SOCAgent task and the stale `.84`-era
> process lock on agent.log). 30/32 online agents registered; see git log
> `080cff9`/`baa703a` for the WS key gate + installer fixes.

## The Problem

**All 53 agent entries in the backend show offline.** Root cause chain:

1. Agent starts → opens WebSocket to `208.87.135.84:8095/api/agent/ws`
2. Server returns **HTTP 403 Forbidden** (WebSocket handshake rejected)
3. Agent logs `"Unclosed connection"` warnings and retries with backoff
4. It connects and fails. `208.87.135.185:5000` backend was already shut down. The proxy at `208.87.135.84:8095` can still see the endpoint, but something is reject the websocket connections now.

## What we know about the infrastructure

| Host:Port | Service | Status |
|---|---|---|
| `208.87.135.84:8095` | SOC Dashboard SPA / proxy | Up, returns 403 on WS |
| `208.87.135.84:8080` | Server Monitor dashboard | Up |
| `208.87.135.84:3000` | Next.js app (unknown) | Up |
| `208.87.135.185:5000` | Old SOC backend | Turned off |

## Agent Details (via TRMM)

- **TRMM API**: `https://api.simplyict.com.au` (key available)
- **Deployed clients**: CCCEX, Elite LP, Currimundi Vet, Click Physio, Riversdale Early Learning, Business SouthBank, Harvest Church, Molti, SimplyICT, and others
- **Elite LP pilot**: 10 agents confirmed working initially, database shows 53 entries total (25 valid + 28 stale duplicates)

## What the SOC team needs to fix

1. **Restore the WebSocket endpoint** at `/api/agent/ws` — it's returning 403
   - Needs to accept connections from agents at `208.87.135.84:8095`
   - If auth is required, tell us what header/key to use so we can update agent.py
2. **Update agent registration** to merge by hostname rather than creating new entries on reconnect
3. **Clean up the 28 stale entries** with `windows-*` / `linux-*` prefixed IDs and `unknown` platform

## Quick fix on agent side (if needed)

The agent accepts `--key` and sends `X-EDR-Key` header if provided. If the backend now requires an auth key, we just need to know the key and we can update the deployed agents remotely via TRMM.

## Scripts available

- `~/soc-ui/trmm-deploy.py` — Run commands/scripts on TRMM agents
- `~/soc-ui/trmm-fix-agent.py` — Fix/restart agents
- `~/.local/bin/soc-browser` — Headless browser for dashboard
- `~/.local/bin/soc-agents` — Dump Our Agents page content

---

## Agent auto-update (2026-09-17)

**One published artifact.** `agent_unified.py` is the agent for every platform.
`GET /api/agent/download/agent?platform=<os>` serves it with `X-Agent-Version` +
`X-Agent-Sha256` (`/api/agent/download/windows` stays for installer/back-compat).

**The version comes from the file.** `soc_api.agent_meta()` parses `AGENT_VERSION`
out of `agent_unified.py` (mtime-cached) and hashes it, so releasing is:

1. edit `AGENT_VERSION` in `agent_unified.py`
2. deploy that file to the running server (`/home/aiagent/mission-control-ui/`)
3. agents self-update on their next connect; force stragglers with
   `POST /api/agents/update {"outdated": true}` (or `{"all": true}`)

**What an agent does with an update** (on-connect ack, pushed `self_update`
command, or the poll hint for agents without a WebSocket): download → sha256 check
→ parse the payload `AGENT_VERSION` and refuse equal/older → syntax-compile →
`agent.py.bak` backup → `os.replace` (atomic) → report `{"type":"update"}` to the
server → re-exec. One attempt per process; any failure leaves the running agent
untouched, and `~/.soc-agent-update.json` holds the last outcome.

**One-time catch-up for the currently deployed agents (all 1.1.0).** Agents running
the old code cannot self-update — their update handlers were registered after the
`__main__` guard (never loaded) and the on-connect check raised `NameError`. So the
first hop needs an installer push:

- Windows, one host: `cmd /c "curl -o install.cmd http://173.208.232.91:8095/api/agent/install/windows-batch && install.cmd"`
- Windows, fleet (TRMM): `TRMM_API_KEY=... ./trmm-reconnect-agents.py`
  (`--dry-run` lists targets, `--host NAME` limits the sweep to a canary)
- Linux: `curl -s http://173.208.232.91:8095/api/edr/install | sudo bash`

From 1.1.1/1.1.2 onward updates are automatic — verified in production on
DESKTOP-37759RK (installer 1.1.0 → 1.1.1, then pushed self_update 1.1.1 → 1.1.2).

**Where to look when an agent does not update.** `/api/agents/all` (needs_update,
latest_version, update, update_requested_at) and the Agents page chips
(`→ 1.1.x`, `updating…`, `updated`, `update failed`); per-agent history in
`agent_telemetry.json` under the agent key (`update: {at, from, to, success, error}`).

**Gotcha for future edits:** every `@handler(...)` must be defined *above* the
`if __name__ == "__main__": main()` block at the end of `agent_unified.py`.
Handlers below it never register when the agent runs as a script.
