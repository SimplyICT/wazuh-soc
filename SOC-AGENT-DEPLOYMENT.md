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

---

## Packaged agent (.exe) — no Python on the target (roadmap P1.2)

**Build** (any Windows box with Python; the SOC's own admin machine is fine):

```powershell
powershell -ExecutionPolicy Bypass -File build_windows_exe.ps1 -Server 173.208.232.91:8095
```

It downloads the current agent, stamps the build with the agent's `AGENT_VERSION`,
runs PyInstaller onefile, then uploads `SOCAgent.exe` + its version/sha256 sidecar to
`POST /api/agent/upload-exe`. The script is served at
`/api/agent/build-exe-script`.

**Install** (admin, on a machine without Python):

```
cmd /c "curl -o install-exe.cmd http://173.208.232.91:8095/api/agent/install/windows-exe && install-exe.cmd"
```

`install_windows_exe.cmd` stops any existing agent (task, `SOCAgent.exe`, and a legacy
`python.exe … SOCAgent …` process), downloads the exe, writes `start.cmd` running
`SOCAgent.exe --server … --key …`, recreates the `SOCAgent` scheduled task and starts it.

**Updates for packaged agents.** A frozen build reports `"build": "exe"`, so the
registration ack hands it `/api/agent/download/exe` + the exe's version and sha256
(the server keeps the exe's version in `SOCAgent.exe.meta.json`, since a binary cannot
be parsed for it). On update the agent downloads the new exe, verifies the sha256,
requires a strictly newer version from the server, stages it as `SOCAgent.new.exe` and
spawns a detached `soc-agent-update.cmd` that waits for the agent to exit, moves the
running exe aside, puts the new one in place and relaunches it with the original
arguments. A failed download/verification leaves the running exe untouched.

**Version skew is expected and safe:** script agents compare against
`agent_unified.py`'s version, packaged agents against the uploaded exe's version, so
the two artifacts can be released independently.

**Operational notes learned building the exe (2026-09-17):**

- Build with a **long timeout**: dispatched over TRMM/RMM the build takes 3-5 min and the
  caller can be cut off before the upload step — the script now uploads with `curl.exe`
  and keeps the build if the upload fails (path printed, one-line manual upload).
- Do not build inside a `*-build` directory (PyInstaller refuses); the script uses
  `%ProgramData%\socagent-exe`.
- The `.ps1` must be pure ASCII — PowerShell 5.1 mis-parses UTF-8 punctuation.
- A `SOCAgent.1.x.y.exe.bak` next to the agent means a packaged self-update completed;
  `soc-agent-update.log` records each swap attempt.

---

## Fleet convergence and Wazuh retirement (2026-09-17)

### Keeping the fleet on the published build
`trmm-converge-agents.py` (run on the SOC box, needs `TRMM_API_KEY`) reconciles the
Windows fleet with what is published:

| host state | action |
|---|---|
| on the published version for its kind | skip |
| connected and >= 1.1.1 | queue `self_update` (no restart) |
| not connected, or < 1.1.1 | run the installer (upgrades **and** leaves exactly one agent running) |

Per-host state in `converge-state.json` suppresses re-pushing the same host for the same
version inside `--cooldown` hours (default 6), so it is safe from a loop or timer:
`--loop 900` keeps converging while machines come online; `--dry-run` lists the plan.

### Removing the legacy Wazuh/OSSEC agent
Inventory first (`--detect`), then remove. Both removers print one summary line per host:
`CLEAN` / `REMOVED ...` / `PARTIAL ...`.

- **Windows** (TRMM, as SYSTEM): `wazuh-remove-win.py [--host NAME | --detect]`
  ships `wazuh-remove.ps1` as a base64 `-EncodedCommand`, so nothing has to be served
  over HTTP. It stops and deletes `WazuhSvc`/`OssecSvc`, uninstalls the MSI, removes
  `C:\Program Files (x86)\ossec-agent` (+ `ProgramData\ossec`), wazuh/ossec scheduled
  tasks and firewall rules, then verifies.
- **Linux** (root): `wazuh-remove.sh` — disables and deletes any wazuh/ossec unit
  (files included), purges the package (apt/dnf/yum), drops the wazuh repo files and
  keyring, removes `/var/ossec`, then verifies.

Known state 2026-09-17: `.183` removed and verified; `.84`/`.185` already clean;
`.193` still runs `wazuh-agent.service` (needs root — sudo there asks for a password).
Windows: 23 of 30 online hosts had the agent (service + MSI + install dir) — removal is
dispatched from the same tool.

### Scheduled maintenance (installed 2026-09-17)

`soc-fleet-maintenance.timer` runs `soc-fleet-maintenance.sh` 15 minutes after the
previous run finishes (and 5 min after boot):

1. `trmm-converge-agents.py` — push the published build to whoever is online and behind
2. `wazuh-remove-win.py` — retire Wazuh/OSSEC on every online Windows host

Machines that come online later are picked up on the next tick, which is the point of
the timer. Both steps are idempotent and print per-host results to the journal
(`journalctl -u soc-fleet-maintenance`).

- units: `soc-fleet-maintenance.{service,timer}` (copied to `/etc/systemd/system/`)
- secrets: `/home/aiagent/.config/soc/fleet.env` (mode 600) holds `TRMM_API_KEY` and
  `SOC_AGENT_BASE`
- `SOC_AGENT_BASE` is the address agents fetch artifacts from. Update pushes always use
  it — never the operator's request Host, because the dashboard is browsed through the
  Cloudflare domain and agents pointed there receive the Access login page instead of
  the artifact.

### Update state shown in the dashboard

The agents API reports `update_state` (`updating` / `updated` / `failed` / empty) computed
server-side: a request goes stale as soon as the agent reports the published version, an
`updating` chip only shows while the agent is still behind and the request is under 30 min
old, `updated` shows for 2 h, `failed` for 24 h. A push to an agent that is already current
is skipped (and its pending marker cleared) instead of queueing a no-op command that left
the row spinning forever.

---

## M365 / Defender monitoring (multi-tenant)

**What runs today.** `itdr_poller.py` polls Microsoft Graph per tenant every
`ITDR_POLL_INTERVAL_MIN` (default 5 min) and turns hits into cases:

| Area | Endpoint | State |
|---|---|---|
| Sign-ins | `auditLogs/signIns` | live (520 events stored) |
| Directory audit | `auditLogs/directoryAudits` | live |
| Entra risk | `identityProtection/riskDetections`, `riskyUsers` | live |
| **Defender XDR** | `security/alerts_v2`, `security/incidents` | code ready, **roles not granted** (Graph 403) |

**Onboarding a tenant** — ITDR page → Tenants → *+ Tenant*: name, directory
(tenant) ID, application (client) ID, client secret. Credentials are written to
`itdr_tenant_creds.json` (mode 600) and take effect immediately (no restart); the
env-var route (`ITDR_<PREFIX>_TENANT_ID/_CLIENT_ID/_CLIENT_SECRET`) still wins if
set. *Test* on a row re-probes Graph and reports the outcome per area.

**App registration, per customer tenant** (Entra ID → App registrations → the app →
API permissions → Microsoft Graph → *Application* permissions):

- `AuditLog.Read.All`, `IdentityRiskEvent.Read.All`, `Directory.Read.All` — identity
- `SecurityAlert.Read.All`, `SecurityIncident.Read.All` — Defender threat pickup

Then **Grant admin consent**. Until that is done the tenant shows
`Identity: ok · Defender: not granted` and identity polling continues normally;
`security/incidents` and `security/alerts_v2` answer 403 *"Missing application
roles"* (which the poller treats as a status, never an error).

For MSP-style estate-wide access (one app, many customer tenants) use GDAP /
delegated admin relationships, or make the app multi-tenant and have each
customer admin consent once at
`https://login.microsoftonline.com/<tenant-id>/adminconsent?client_id=<client-id>`.

**API:** `GET /api/itdr/tenants?health=true` (per-tenant probe),
`GET /api/itdr/tenants/{id}/health`, `POST /api/itdr/tenants` (name + credentials),
`POST /api/itdr/tenants/{id}/credentials`, `POST /api/itdr/poll[/{tenant_id}]`.


### M365 Defender section (2026-09-18)

The sidebar has a dedicated **M365 Defender** page (`#/defender`) next to Identity (ITDR):

- KPIs: Defender XDR alerts, incidents, Defender-for-Endpoint alerts, open Defender cases
  and how many were raised into the human review queue.
- Per-tenant connection table: **Identity** (Graph audit/risk), **M365 Defender (XDR)**
  (`SecurityAlert.Read.All` + `SecurityIncident.Read.All`) and **Defender for Endpoint**
  (`Alert.Read.All`, `Machine.Read.All` on the *WindowsDefenderATP* API — a different
  resource from Microsoft Graph, granted on the same app registration). Each row has
  Test (fresh probe) and Poll now.
- Alerts / Incidents / Endpoint tabs over the stored events (severity, status, device,
  user, MITRE technique, service source).

High/critical Defender findings are also handed to the SOC review queue
(`soc_queue`, source `m365-defender`) so they appear on the dashboard/SLA board with
every other alert; identity-only detections stay as ITDR cases only. Endpoint alerts are
fetched from `https://api.security.microsoft.com/api/alerts` once the roles are granted —
until then the poller records the status and keeps polling the other sources.

API: `GET /api/defender/summary`, `GET /api/defender/alerts?source=alerts|incidents|endpoint`,
`GET /api/itdr/tenants?health=true`.
