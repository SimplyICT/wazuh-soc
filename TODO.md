# SOC Platform — Remaining Roadmap

## Shipped
- **Agent auto-update (P1.1)** — 2026-09-17. Agents check the published version on
  connect (and via pushed `self_update` / poll), download `/api/agent/download/agent`,
  verify sha256 + version, replace atomically with a `.bak`, report back and restart.
  Version is derived from `agent_unified.py`, so a release is a one-line version bump.
  Agents below 1.1.1 needed one installer push before auto-update took over (swept
  2026-09-17) — see `SOC-AGENT-DEPLOYMENT.md`.
- **Windows agent .exe (P1.2)** — 2026-09-17. Standalone PyInstaller build (no Python on
  the target): `build_windows_exe.ps1` -> `POST /api/agent/upload-exe` (version/sha256
  sidecar) -> `install_windows_exe.cmd`. Packaged agents report `build: exe`, are handed
  the exe by the ack, and self-update by staging `SOCAgent.new.exe` + swapping the binary
  with a retrying shim (verified in production 1.1.4 -> 1.1.5 on DESKTOP-37759RK;
  retry/fallback shim + POSIX in-place replace in 1.1.6).

## P1 — Next Build
1. **Dashboard/agent polish backlog** — whatever the fleet rollout turns up (see the
   Agents page update chips and `agent_telemetry.json` update events).

## P2 — Future
2. **Mobile MDM integration** — iOS/Android device monitoring via Intune Graph API
3. **Dashboard customization** — pick KPIs, widgets, layout per user

## P3 — Nice to have
4. **macOS agent testing** — requires newer Mac
5. **Performance/scale tuning** — handle 1000+ agents
6. **Agent telemetry explorer** — click agent in Our Agents to see live processes/network/disks

---

## Quick Reference
- **SOC URL**: `http://10.121.16.163:8095/soc/` (Asgard ZeroTier mesh — gpu-ajob box)
- **Agents online**: `http://10.121.16.163:8095/api/agents/online`
- **Windows deploy (RMM)**: `cmd /c "curl -o install.cmd http://173.208.232.91:8095/api/agent/install/windows-batch && install.cmd"`
- **Windows deploy (packaged, no Python)**: `cmd /c "curl -o install-exe.cmd http://173.208.232.91:8095/api/agent/install/windows-exe && install-exe.cmd"`
- **Linux deploy**: `curl -s http://173.208.232.91:8095/api/edr/install | sudo bash`
- **macOS deploy**: `curl -sL http://173.208.232.91:8095/api/agent/install/macos | sudo bash`
- **Release an agent**: bump `AGENT_VERSION` in `agent_unified.py`, deploy the file; for
  the packaged agent rebuild with `build_windows_exe.ps1` (uploads itself).
