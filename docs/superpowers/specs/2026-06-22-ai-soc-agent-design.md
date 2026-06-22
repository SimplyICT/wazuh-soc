# AI SOC Agent — Design Document

## Overview

Replace the current rule-based SOC Autopilot with an LLM-driven triage engine that
automatically handles low/medium alerts, intelligently triages high/critical alerts,
and only escalates to the human SOC operator when the AI lacks confidence.

## Architecture

```
                    ┌─────────────────────┐
                    │   Wazuh Alerts       │
                    │   (Supabase)         │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  AI Triage Engine   │  ai_triage.py
                    │  (every 5 min)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Confidence Gate     │
                    └────┬──────────┬─────┘
                         │          │
              ┌──────────▼──┐  ┌───▼────────────┐
              │  Auto-      │  │  Create Case    │
              │  Resolve    │  │  → Supabase     │
              │  + Audit    │  │  → Notify human │
              └─────────────┘  └────────────────┘
                         │
                    ┌────▼────┐
                    │  Daily  │
                    │  Digest │
                    └─────────┘
```

## Alert Processing Flow

Every scan cycle (configurable, default 5 min):

1. **Fetch** open/acknowledged alerts from Supabase
2. **Deduplicate** against already-processed alerts (check audit log)
3. **For each new alert** (or group of correlated alerts):
   a. Call Ollama with structured prompt containing alert context
   b. Parse response: `{action, confidence, analysis, recommendation, mitre_technique}`
   c. Route based on confidence and level:

| Level | Confidence > 90% | Confidence ≤ 90% |
|-------|------------------|-------------------|
| 0-11 (Low/Med) | Auto-resolve + audit | Auto-resolve + audit |
| 12-14 (High) | Auto-resolve + audit + notify | Create case → human approval |
| 15+ (Critical) | Auto-resolve + audit + urgent notify | Create case → human approval |

4. **Auto-resolve**: Update alert status to RESOLVED in Supabase, log AI reasoning to audit table
5. **Escalate**: Create case in Supabase cases table with AI analysis, confidence score, recommended actions
6. **Notify**: Telegram message for new cases and auto-resolution summaries

## Triage Prompt Design

The Ollama prompt receives:
- Alert ID, level, title, description
- Source device/agent info
- Number of similar alerts in last 24h
- Current MITRE technique (if any)
- OTX IOC matches (if any)

Prompt instructs the model to return JSON:
```json
{
  "analysis": "Brief 2-3 sentence analysis of the alert",
  "confidence": 0.85,
  "recommended_action": "resolve | escalate",
  "mitre_technique": "T1078",
  "response_plan": ["Check device connectivity", "Review auth logs"],
  "false_positive_likelihood": "low"
}
```

## Components

### 1. `mission-control-ui/ai_triage.py`
- `triage_alert(alert) → dict` — single alert triage via Ollama
- `triage_batch(alerts) → list[dict]` — batch process multiple alerts
- `_call_llm(prompt) → str` — abstracted LLM call (Ollama via HTTP API)
- `_parse_response(raw) → dict` — parse and validate model output

### 2. `mission-control-ui/ai_resolver.py`
- `auto_resolve(alert, analysis) → bool` — marks alert RESOLVED, logs to audit table
- `create_case(alerts, analysis) → int` — creates case in Supabase case table
- `_log_action(alert_id, action, analysis, confidence)` — writes to audit_log table

### 3. `mission-control-ui/ai_digest.py`
- `generate_digest() → str` — queries audit_log for past 24h, generates summary via LLM
- `send_digest(channels)` — sends to Telegram (and future channels)

### 4. Supabase Schema (new tables)

**`soc_cases`** (replaces autopilot_cases.json):
```sql
CREATE TABLE soc_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_approval',
  alert_ids JSONB,
  ai_analysis TEXT,
  confidence REAL,
  mitre_technique TEXT,
  response_plan JSONB,
  entities JSONB,
  events JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**`soc_audit_log`**:
```sql
CREATE TABLE soc_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id TEXT NOT NULL,
  alert_level INTEGER,
  action TEXT NOT NULL,         -- 'auto_resolve' | 'case_created' | 'notification'
  confidence REAL,
  analysis TEXT,
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5. Existing File Changes

**`app.py`** changes:
- Replace `autopilot_scan_and_generate()` with AI-driven version
- Replace `_generate_autopilot_case()` with AI version
- Remove JSON file reads/writes, use Supabase
- Add `/api/soc/digest` endpoint for manual digest trigger
- Update `/wazuh-api/autopilot/*` endpoints to read from Supabase

**`soc_agent.py`** changes:
- Triage cycle now calls AI triage instead of rule-based scan
- Escalation logic uses AI confidence thresholds
- Digest uses `ai_digest.py` instead of Telegram-only summary

### 6. Frontend Changes (minor)

**`AutopilotCase.jsx`**:
- Show `AI Analysis` section with confidence indicator
- Show AI's recommended response plan with accept/modify/reject option
- Add confidence badge (color-coded)

## Infrastructure

- Ollama installed on main server, serving on `http://localhost:11434`
- Model: `llama3.2:3b` (lightweight, ~2GB, runs on CPU)
- Future: Dedicated Ollama server if this server struggles

## Success Criteria

1. Alerts at level 0-11 are auto-resolved within one scan cycle (≤5 min)
2. Level 12-14 alerts with high confidence are auto-resolved
3. Level 12-14 alerts with low confidence create cases for human approval
4. Daily digest is generated and sent every 24h
5. All actions are auditable in Supabase
6. Human can review, approve, reject, or modify AI decisions through existing UI
