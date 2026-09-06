#!/usr/bin/env python3
"""Reconnect ALL SOC agents via Tactical RMM.

Rewrites C:\\ProgramData\\SOCAgent\\start.cmd on every online Windows TRMM
agent to point at the current SOC server (+ shared WS key), then restarts
the SOCAgent scheduled task so the agent re-registers.

Usage:
    export TRMM_API_KEY="your-api-key"
    ./trmm-reconnect-agents.py
    # or
    ./trmm-reconnect-agents.py --key <your-key> [--server http://173.208.232.91:8095]
"""
import argparse
import json
import os
import ssl
import sys
import time
import urllib.request

TRMM_API = "https://api.simplyict.com.au"
DEFAULT_SERVER = "http://173.208.232.91:8095"
DEFAULT_AGENT_KEY = "ac819555a88829a086d429cfec5daa45"
AGENT_DIR = r"C:\ProgramData\SOCAgent"

# Keep in sync with install_windows.cmd's start.cmd layout.
START_CMD = (
    'cmd /c (echo @echo off'
    ' && echo cd /d "%s"'
    ' && echo "C:\\Program Files\\Python312\\python.exe" agent.py --server %s --key %s'
    ' ^>^> "C:\\ProgramData\\SOCAgent\\agent.log" 2^>^&1'
    ') > "%s\\start.cmd"'
) % (AGENT_DIR, "%s", "%s", AGENT_DIR)


def api(method: str, path: str, key: str, data: dict | None = None, timeout: int = 120):
    url = f"{TRMM_API}{path}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("X-API-Key", key)
    if body:
        req.add_header("Content-Type", "application/json")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return json.loads(r.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("TRMM_API_KEY", ""))
    ap.add_argument("--server", default=os.environ.get("SOC_SERVER", DEFAULT_SERVER))
    ap.add_argument("--agent-key", default=DEFAULT_AGENT_KEY)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.key:
        print("error: set TRMM_API_KEY or pass --key", file=sys.stderr)
        sys.exit(1)

    server = args.server.rstrip("/")
    # normalize server to host:port form the agent's --server flag expects
    hostport = server.replace("http://", "").replace("https://", "")

    print(f"Server: {server} (agent --server {hostport})")
    agents = api("GET", "/agents/", args.key)
    windows = [a for a in agents if a.get("plat") == "windows"]
    online = [a for a in windows if a.get("status") == "online"]
    print(f"TRMM agents: {len(windows)} windows, {len(online)} online")

    ok = failed = skipped = 0
    for a in online:
        host = a.get("hostname", "?")
        aid = a.get("agent_id", "?")
        cmd = START_CMD % (hostport, args.agent_key)
        if args.dry_run:
            print(f"[dry-run] {host}: rewrite start.cmd -> {hostport}")
            continue
        try:
            api("POST", f"/agents/{aid}/cmd/",
                args.key, {"cmd": cmd, "shell": "cmd", "timeout": 15,
                           "run_as_user": False})
        except Exception as e:
            print(f"{host}: start.cmd rewrite FAILED ({e})")
            failed += 1
            continue
        time.sleep(1)
        try:
            api("POST", f"/agents/{aid}/cmd/",
                args.key, {"cmd": "schtasks /run /tn SOCAgent", "shell": "cmd",
                           "timeout": 15, "run_as_user": False})
            print(f"{host}: start.cmd rewritten, task started")
            ok += 1
        except Exception as e:
            print(f"{host}: rewrite ok but task start FAILED ({e})")
            failed += 1

    skipped = len(windows) - len(online)
    print(f"\nDone: {ok} reconnected, {failed} failed, {skipped} offline skipped")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()