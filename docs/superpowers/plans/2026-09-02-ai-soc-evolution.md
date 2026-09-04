# AI-SOC Evolution — AI Everywhere, Human Only for Major Change

> **Date**: 2026-09-02 · **Status**: Active roadmap
> **Owner**: aiagent + SimplyICT SOC team
> **Vision**: "Integrate AI into every aspect of the SOC. Human intervention only for
> the really bad situations — alerts that cause major change on hardware and software.
> Tie the SOC into every Microsoft 365 tenant we manage. Reports must show actively
> hunting threats based on the latest available intelligence. Our SOC is good. Make it better."

---

## 1. Current State (verified 2026-09-02)

### Working today
| Capability | Where | Status |
|---|---|---|
| EDR agents (38+ endpoints), telemetry, FIM, vuln, SCA, process tree, persistence, network, isolate/release | `soc_api.py` `/api/edr/*`, `/api/fim/*`, `/api/vuln/*`, agents via WebSocket | Live |
| SIEM log ingestion (syslog/HTTP) | `siem_ingest.py`, `/api/siem/*` — collecting actively | Live |
| AI alert triage → auto-resolve or case | `ai_triage.py` + `ai_resolver.py`; `app.py` autopilot scanner; `ai_cases.json` | Live |
| AI remediation on approved cases (block IP / suppress rule / notify / watchlist / ping) | `ai_remediate.py`; invoked from `app.py` on approve | Live, human-gated |
| AI chat assistant + NL search | `/api/ai/chat` (SSE, streaming) + `/api/nl/search` + `NLPanel.jsx` | Live |
| Playbooks (CRUD, actions, audit) | `/api/playbooks/*` | Built |
| Threat intel — AlienVault OTX + VirusTotal | `threat_intel.py`, `/api/threat-intel/*`, `otx_rules.xml` (2,013 IOCs / 60 pulses, last refresh 2026-07-05) | Live, OTX only |
| Monthly SOC report (Huntress-style HTML): cover, summary, EDR, ITDR, SIEM, vuln, incidents, recommendations | `report_generator.py`, `/api/reports/*`, `Reports.jsx` | Live (Aug-2026 PDF in `wazuh-soc/docs/`) |
| Orgs / roles / webhooks / onboarding tokens | `platform_core.py`, `/api/platform/*` | Name-only registry |
| Review queue w/ claim / resolve / escalate / notes | `/api/socqueue/*` + `ReviewQueue.jsx` | Built |

### Gaps found in audit
1. **ITDR / M365 is dormant**: `itdr_poller.py` exists (sign-ins, audit logs, risk
   detections, risky users via Graph API) but is **single-tenant** (one `ITDR_*` env
   pair) and **`poll_cycle()` is not scheduled anywhere** — no timer, no cron, no
   app.py hook. `itdr_events.json` is seed data. The Itdr page renders, but nothing
   feeds it.
2. **No action-tiering policy**: every case including trivial reversible actions
   waits on a human approve/reject. There is no "auto-execute safe, gate only major"
   layer. `/api/autopilot/cases/{id}/execute` is a stub in `soc_api.py` ("Execution
   triggered" — no task spawned); real execution lives inline in `app.py`.
3. **Reports are static-template**: no "active threat hunting" section, no live intel
   trends, no AI-written narrative, no per-tenant reports, no SOC PDF export.
   Recommendations are rule-generated (`_get_recommendations`), not LLM-authored.
4. **No cross-source correlation**: SIEM + EDR + ITDR + intel are siloed. No
   unified incident that chains e.g. M365 impossible-travel → EDR process → SIEM
   C2 beacon → intel IOC hit.
5. **Org ↔ tenant linkage absent**: `platform_core.create_org(name)` — no M365
   tenant fields, no per-org isolation of ITDR events/cases/reports.

---

## 2. Target Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │              SOC Autopilot (AI core)            │
                    │  triage → resolve/case → ACTION TIER ENGINE    │
                    │  ├─ Tier 1 auto-execute (reversible, low risk) │
                    │  ├─ Tier 2 human-gated (destructive/tenant/    │
                    │  │   hardware/software-major) ──► ReviewQueue  │
                    │  └─ every action → audit log                   │
                    └───────┬──────────────┬──────────────┬──────────┘
                            │              │              │
         ┌──────────────────┘    ┌─────────┘     ┌────────┘
         ▼                       ▼               ▼
   ┌────────────┐        ┌─────────────┐   ┌───────────────┐
   │ M365 Tenant│        │ EDR/SIEM/   │   │ Threat Intel  │
   │ Connector  │        │ FIM/Vuln    │   │ OTX+VT+MISP  │
   │ (N tenants │        │ (existing)  │   │ + advisories  │
   │ , Graph)   │        │             │   │               │
   └────────────┘        └─────────────┘   └───────────────┘
        │                      │                  │
        └──────────┬───────────┴──────────────────┘
                   ▼
        ┌──────────────────────┐
        │   Correlation Engine │  cross-source incident assembly
        └──────────┬───────────┘
                   ▼
        ┌──────────────────────┐
        │  Hunting & Reports   │  AI narrative + active hunt list +
        │                      │  per-tenant PDF, latest-intel-fed
        └──────────────────────┘
```

---

## 3. Phased Work

### Phase 1 — M365 Multi-Tenant Connector (✅ SHIPPED 2026-09-02; restart pending)
- `itdr_tenants.json` registry (name, tenant_id, org link, enable/disable, poll status).
  Secrets stay in `.env` as `ITDR_<PREFIX>_TENANT_ID/_CLIENT_ID/_CLIENT_SECRET`
  (per-tenant prefix from registration; legacy `ITDR_*` vars keep working as tenant
  id `default` — no migration needed).
- `itdr_poller.py` rewritten multi-tenant: per-tenant token cache, tenant-scoped
  fetch/store/detections, detection→case creation wired (was never called before),
  dedup by (tenant, detection_type, user) within 24h, `poll_all_tenants()`.
- **Scheduler**: in-process daemon thread from `app.py` startup hook; flock-guarded
  so only one of the 4 uvicorn workers polls per cycle; interval env
  `ITDR_POLL_INTERVAL_MIN` (default 5).
- API (`soc_api.py`): `GET/POST /api/itdr/tenants`, `PATCH/DELETE /api/itdr/tenants/{id}`,
  `POST /api/itdr/poll`, `POST /api/itdr/poll/{tenant_id}`, `tenant=` filter on
  events/cases, per-tenant summary breakdown.
- Frontend: `Organizations.jsx` gained the M365 Tenants management card (register /
  toggle / poll / remove + env-var instructions); `Itdr.jsx` gained Tenants tab,
  per-tenant filter, tenant badges, "Poll all tenants now".
- **Verified**: unit tests (registry CRUD, credential resolution, tenant-scoped
  detections, case dedup), API tests (all endpoints), UI render tests (both pages,
  zero console errors). **Live validation**: prod service auto-restarted a worker on
  new code (Restart=always), the poller fetched 75 real sign-in events
  (info@simplyict.com.au tenant) and created 4 real cases (account status change,
  bulk security-info reset, OAuth consent) before this doc was updated.
- **Pending**: clean `systemctl restart mission-soc` to bring all 4 workers onto
  uniform code (mixed workers currently → /api/itdr/tenants 404s ~75% of the time).
- **Needs user**: app registrations per customer tenant (scopes
  `AuditLog.Read.All`, `IdentityRiskEvent.Read.All`, `Directory.Read.All`,
  `MailboxSettings.Read`), secrets into `.env`, register tenants in Organizations.
- `tenants.json` registry (name, tenant_id, enable/disable, org link; secrets stay
  in `.env` as `M365_TENANT_<n>_CLIENT_ID/SECRET` or encrypted store).
- Refactor `itdr_poller.py`: per-tenant token cache + poll; store events/cases
  tagged `tenant_id`; org↔tenant mapping via `platform_core`.
- `itdr_detections.py`: the 10 detection rules already designed (MFA fatigue,
  impossible travel, mailbox forwarding, GA grant, legacy auth, OAuth consent,
  anonymous IP, password spray, risky SP, MFA disabled on inactive).
- Scheduler: systemd `soc-itdr-poller.timer` every 5 min → `poll_all_tenants()`.
- API: `/api/itdr/tenants` (list/status/last-poll), extend `/api/itdr/*` to filter
  by tenant. Frontend: Organizations page gains tenant fields + per-tenant status.
- **Needs user**: one app registration per customer tenant (+/or partner
  consolidation via GDAP), scopes `AuditLog.Read.All`, `IdentityRiskEvent.Read.All`,
  `Directory.Read.All`, `User.Read.All`.

### Phase 2 — Action Tier Engine (AI everywhere, humans only for major change)
- Classify every response action into tiers in `ai_remediate.py`:
  - **Tier 1 — auto (reversible / contained)**: add watchlist, suppress known-FP
    rule for a source, notify, session-ish/sign-in revoke for one user, isolate a
    single endpoint, block a single IOC at edge.
  - **Tier 2 — human-gated (major change)** ★ the user's line: firmware/driver/
    hardware changes, tenant-wide config or policy changes, mass Isolations,
    deleting data, changing MFA requirements, network-wide firewall changes, geo-
    blocking an entire region, offboarding domains.
- Autopilot flow: `triage → decision {resolve | auto-act (Tier1) | case (Tier2)}`
  → Tier-1 actions execute immediately with full audit trail; Tier-2 lands in
  ReviewQueue with SLA + escalate. Confidence < threshold → always human.
- Fix the `execute` stub: real background task invoking `ai_remediate.execute_case`,
  with dry-run + rollback notes for Tier-2.

### Phase 3 — Active Threat-Hunting Reports
- `report_generator.py` gains a **Threat Hunting section**: for each active
  campaign/pulse in OTX (plus MISP if enabled), show (a) what the intel says is
  current, (b) whether we've seen matching IOCs/behavior in this tenant's
  telemetry (SIEM hits, EDR network, ITDR sign-ins), (c) AI-written hunt status.
- AI-authored executive summary (existing `/api/ai/chat` stack / DeepSeek) with
  human-edit pass before send.
- Per-tenant PDF export (HTML→PDF via existing toolchain); monthly auto-generate
  timer exists as pattern (`report_generator.generate_report` on the 1st).

### Phase 4 — Cross-Source Correlation (the "make it better" layer)
- `siem_correlate.py`: time-window correlation across M365 sign-ins + SIEM failed
  logins + EDR C2 beacon + intel IOC hit → unified incident with MITRE chain.
- Feed correlated incidents into the same tier engine (Phase 2).

---

## 4. Execution Order & Dependencies

| Order | Work | Depends on | User action needed |
|---|---|---|---|
| 1 | M365 connector (Phase 1) | — | App registrations per tenant |
| 2 | Action tier engine (Phase 2) | Tier policy sign-off | Approve Tier-1/Tier-2 split |
| 3 | Hunting reports (Phase 3) | Phases 1–2 data | None |
| 4 | Correlation (Phase 4) | 1–3 | None |

Recommended first build: **Phase 1** — biggest delta (currently zero working M365
coverage), explicitly requested, fully additive (no change to current security
posture), and unlocks tenant-scoped reports/hunting afterward.