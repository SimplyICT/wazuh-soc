# SOC Platform — Remaining Roadmap

## P1 — Next Build
1. **Agent auto-update polish** — fix chicken-and-egg: agents check version on connect, auto-download if outdated
2. **Windows agent .exe** — PyInstaller compile to standalone exe (no Python install needed)

## P2 — Future
3. **Mobile MDM integration** — iOS/Android device monitoring via Intune Graph API
4. **Dashboard customization** — pick KPIs, widgets, layout per user

## P3 — Nice to have
5. **macOS agent testing** — requires newer Mac
6. **Performance/scale tuning** — handle 1000+ agents
7. **Agent telemetry explorer** — click agent in Our Agents to see live processes/network/disks

---

## Quick Reference
- **SOC URL**: `http://208.87.135.84:8095/soc/`
- **Agents online**: `http://208.87.135.84:8095/api/agents/online`
- **Windows deploy (RMM)**: `cmd /c "curl -o install.cmd http://208.87.135.84:8095/api/agent/install/windows-batch && install.cmd"`
- **Linux deploy**: `curl -s http://208.87.135.84:8095/api/edr/install | sudo bash`
- **macOS deploy**: `curl -sL http://208.87.135.84:8095/api/agent/install/macos | sudo bash`
