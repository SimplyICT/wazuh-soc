#!/usr/bin/env bash
# Periodic SOC fleet maintenance — run by soc-fleet-maintenance.timer (every 15 min).
#
#   1. converge agent versions  (installer for stragglers, self_update for the rest)
#   2. retire Wazuh/OSSEC on every Windows host that is online right now
#
# Both steps are idempotent and report per host; nothing happens on a host that is
# already current/clean. Machines that come online later are picked up on the next
# run, which is the point of the timer.
set -u

cd "$(dirname "$(readlink -f "$0")")"
: "${TRMM_API_KEY:?TRMM_API_KEY missing — expected from /home/aiagent/.config/soc/fleet.env}"

stamp() { date -Is; }
echo "[$(stamp)] --- fleet maintenance start ---"

echo "[$(stamp)] converge agent versions"
python3 trmm-converge-agents.py --workers 6 --cooldown 6 2>&1 | tail -n 40 || true

echo "[$(stamp)] retire Wazuh/OSSEC on online Windows hosts"
python3 wazuh-remove-win.py --workers 8 2>&1 | tail -n 40 || true

echo "[$(stamp)] --- fleet maintenance done ---"
