#!/usr/bin/env python3
"""Reconnect ALL SOC agents via Tactical RMM.

Runs the SOC installer (fetched live from the SOC box) on every online
Windows TRMM agent. The installer:
  - ensures Python (installs 3.12 when missing)
  - downloads the current agent_unified.py
  - writes start.cmd pointing at SOC_SERVER with the shared WS key
  - recreates the SOCAgent scheduled task and starts it

Works uniformly whether a box already has python or none at all.

Usage:
    export TRMM_API_KEY="your-api-key"
    ./trmm-reconnect-agents.py
"""
import argparse
import concurrent.futures
import fnmatch
import json
import os
import ssl
import sys
import urllib.request

TRMM_API = "https://api.simplyict.com.au"
DEFAULT_SERVER = "http://173.208.232.91:8095"
INSTALL_URL = f"{DEFAULT_SERVER}/api/agent/install/windows-batch"

# NOTE: parenthesized 'cmd /c (echo ... ) > file' and even plain chained
# 'echo x > file & echo y >> file' writes were tried; the chained form works.
# The full installer is used instead: it is idempotent and also handles
# machines that have no Python at all (installs 3.12 silently).


def api_get(path: str, key: str):
    req = urllib.request.Request(f"{TRMM_API}{path}", headers={"X-API-Key": key})
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
        return json.loads(r.read())


def api_post(path: str, data: dict, key: str, timeout: int = 300):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{TRMM_API}{path}", data=body, method="POST",
        headers={"X-API-Key": key, "Content-Type": "application/json"})
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout + 30) as r:
            return r.status, r.read().decode()[:200]
    except Exception as e:
        return None, str(e)


def reconnect_one(agent: dict, key: str, results: list):
    host = agent.get("hostname", "?")
    aid = agent.get("agent_id", "?")
    install_cmd = (
        f'curl -sL --max-time 120 {INSTALL_URL} -o "%TEMP%\\socagent-install.cmd"'
        f' && "%TEMP%\\socagent-install.cmd"'
    )
    st, body = api_post(f"/agents/{aid}/cmd/",
                        {"cmd": install_cmd, "shell": "cmd",
                         "timeout": 300, "run_as_user": False}, key, timeout=300)
    ok = st == 200
    results.append((host, st, body[:120]))
    if ok:
        print(f"{host}: installer ran (task recreated + started)")
    else:
        print(f"{host}: FAILED http={st} {body[:120]}")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("TRMM_API_KEY", ""))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--host", action="append", default=[],
                    help="limit to these hosts (exact name, glob or substring; repeatable)")
    ap.add_argument("--dry-run", action="store_true",
                    help="list the agents that would be targeted and exit")
    args = ap.parse_args()
    if not args.key:
        print("error: set TRMM_API_KEY or pass --key", file=sys.stderr)
        sys.exit(1)

    agents = api_get("/agents/", args.key)
    windows = [a for a in agents if a.get("plat") == "windows"]
    online = [a for a in windows if a.get("status") == "online"]
    targets = online
    if args.host:
        pats = [h.strip().lower() for h in args.host]

        def matches(name):
            low = name.lower()
            return any(fnmatch.fnmatch(low, p) or p in low for p in pats)

        targets = [a for a in online if matches(a.get("hostname", ""))]
        print(f"--host filter -> {len(targets)} target(s): "
              f"{', '.join(a.get('hostname', '?') for a in targets) or 'none'}")

    print(f"TRMM: {len(windows)} windows, {len(online)} online, {len(targets)} targeted")
    print(f"Installer URL: {INSTALL_URL}")
    if args.dry_run:
        for a in targets:
            print(f"  would install: {a.get('hostname')}")
        return

    results: list = []
    ok = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(reconnect_one, a, args.key, results) for a in targets]
        for f in concurrent.futures.as_completed(futs):
            if f.result():
                ok += 1

    failed = [(h, st, b) for h, st, b in results if st != 200]
    print(f"\nDone: {ok}/{len(targets)} installers dispatched (HTTP 200)")
    for host, st, body in failed:
        print(f"  FAILED {host}: http={st} {body}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()