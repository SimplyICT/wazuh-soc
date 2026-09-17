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
    if st == 200:
        outcome = "ran"
    elif st is None and ("502" in body or "504" in body or "timed out" in body.lower()):
        # TRMM's gateway gave up waiting; the job itself keeps running on the
        # machine (verified in the SOC afterwards — see verify()).
        outcome = "dispatched"
    else:
        outcome = "failed"
    results.append((host, outcome, body[:120]))
    if outcome == "ran":
        print(f"{host}: installer ran (task recreated + started)")
    elif outcome == "dispatched":
        print(f"{host}: dispatched — TRMM timed out waiting, verify in the SOC")
    else:
        print(f"{host}: FAILED http={st} {body[:120]}")
    return outcome


def verify(results: list, telemetry: str, wait: int):
    """Report what the SOC sees for the targeted hosts after the dust settles."""
    import time as _time
    if wait:
        print(f"\nWaiting {wait}s before verifying in the SOC...")
        _time.sleep(wait)
    try:
        with open(telemetry) as f:
            tel = json.load(f)
    except Exception as e:
        print(f"verify: cannot read {telemetry}: {e}")
        return
    print("\nSOC view of the targeted hosts:")
    for host, outcome, _ in sorted(results):
        entry = tel.get(f"windows-{host}") or {}
        system = (entry.get("data") or {}).get("system") or {}
        print(f"  {host:<28} v{system.get('agent_version', '?'):<7} "
              f"{(entry.get('data') or {}).get('status', '?'):<8} dispatch={outcome}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("TRMM_API_KEY", ""))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--host", action="append", default=[],
                    help="limit to these hosts (exact name, glob or substring; repeatable)")
    ap.add_argument("--dry-run", action="store_true",
                    help="list the agents that would be targeted and exit")
    ap.add_argument("--no-verify", action="store_true",
                    help="skip the post-sweep SOC version check")
    ap.add_argument("--verify-wait", type=int, default=120,
                    help="seconds to wait before the SOC version check (default 120)")
    ap.add_argument("--telemetry", default="/home/aiagent/mission-control-ui/agent_telemetry.json",
                    help="SOC telemetry file used by the version check")
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
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(reconnect_one, a, args.key, results) for a in targets]
        for f in concurrent.futures.as_completed(futs):
            f.result()

    ran = [r for r in results if r[1] == "ran"]
    dispatched = [r for r in results if r[1] == "dispatched"]
    failed = [r for r in results if r[1] == "failed"]
    print(f"\nDispatched: {len(ran)} ran, {len(dispatched)} timed out at the TRMM gateway "
          f"(still running on the machine), {len(failed)} failed")
    for host, _, body in failed:
        print(f"  FAILED {host}: {body}")

    if not args.no_verify and not args.dry_run and results:
        verify(results, args.telemetry, args.verify_wait)

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()