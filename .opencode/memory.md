# Wazuh SOC — Session Memory

## 2026-06-22: AI SOC Agent — Full AI triage system built

### What was done
- Replaced rule-based SOC Autopilot with AI-powered triage engine
- Built `ai_triage.py` — alert analysis via DeepSeek API (OpenAI-compatible) with rule-based fallback
- Built `ai_resolver.py` — auto-resolution and case creation (Supabase or local JSON)
- Built `ai_digest.py` — daily SOC digest generator
- Installed Ollama (later removed — CPU too slow), switched to DeepSeek API ($5 credit)
- Fixed React hooks ordering bugs in Dashboard.jsx and Autopilot.jsx (useMemo after early returns)
- Added AI analysis display to Autopilot case detail and list pages
- Restyled SPA with base path `/wazuh-soc-v2/` and deployed via Python backend

### Key files
- `/home/aiagent/mission-control-ui/ai_triage.py` — LLM + rule-based triage
- `/home/aiagent/mission-control-ui/ai_resolver.py` — case/resolution management
- `/home/aiagent/mission-control-ui/ai_digest.py` — daily digest
- `/home/aiagent/wazuh-soc/src/pages/Autopilot.jsx` — case list with AI confidence
- `/home/aiagent/wazuh-soc/src/pages/AutopilotCase.jsx` — case detail with AI analysis card

### Access
- SPA: `/wazuh-soc-v2` (port 8095, behind auth)
- Old HTML: `/wazuh-soc.html` (fixed — was blank due to missing DOM elements + CSS vars)
- API: DeepSeek via `AI_API_URL` in `.env`

### Alert flow
Wazuh alerts (port 5000 SOC API) → AI triage (DeepSeek or rule fallback) → auto-resolve (level ≤7 or confident) or case creation → human approve/reject/execute

### Issues fixed
- Old wazuh-soc.html: JS crash from missing DOM elements (#refreshBtn etc.) + CSS var mismatch
- Dashboard.jsx: "Rendered more hooks" error (useMemo after early return)
- Autopilot.jsx: Same hooks ordering bug
- AI scan was fetching 200 alerts × 30s each (fixed: batch limit 5/cycle, rule fallback instant)
