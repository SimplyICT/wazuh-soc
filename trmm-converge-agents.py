#!/usr/bin/env python3
"""Converge the SOC agent fleet onto the published build.

Runs on the SOC box (needs the SOC telemetry + soc_store). For every Windows
machine that TRMM can reach:

  * already on the published version            -> skip
  * on >= 1.1.1 (can self-update)               -> queue a self_update command and,
                                                   if the agent is not running,
                                                   start the SOCAgent task so it
                                                   connects and updates itself
  * on 1.1.0 / unknown (cannot self-update)     -> run the one-time installer

Per-host state (deploy/converge-state.json) stops it re-pushing the same host for
the same version within --cooldown hours, so it is safe to run from a timer or a
loop. Exit code is 0 unless TRMM itself failed.

Usage:
    export TRMM_API_KEY=...
    ./trmm-converge-agents.py                 # one pass
    ./trmm-converge-agents.py --dry-run
    ./trmm-converge-agents.py --host NAME --host OTHER
    ./trmm-converge-agents.py --loop 600      # keep converging (seconds between passes)
"""
import argparse
import concurrent.futures
import fnmatch
import json
import os
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TRMM_API = "https://api.simplyict.com.au"
SOC_DIR = Path("/home/aiagent/mission-control-ui")
TELEMETRY = SOC_DIR / "agent_telemetry.json"
STATE_FILE = Path(__file__).resolve().parent / "converge-state.json"
INSTALL_URL = "http://173.208.232.91:8095/api/agent/install/windows-batch"
EXE_INSTALL_URL = "http://173.208.232.91:8095/api/agent/install/windows-exe"
CAN_SELF_UPDATE = (1, 1, 1)

sys.path.insert(0, str(SOC_DIR))


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def version_tuple(v) -> tuple:
    parts = [int(n) for n in str(v or "").replace(".", " ").split() if n.isdigit()]
    return tuple(parts[:3]) or (0,)


def published() -> dict:
    """Published versions for script and packaged agents, straight from the server."""
    import soc_api
    return {"script": soc_api.agent_meta(), "exe": soc_api.exe_meta()}


def telemetry() -> dict:
    try:
        return json.loads(TELEMETRY.read_text())
    except Exception:
        return {}


def load_state() -> dict:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {}


def save_state(state: dict) -> None:
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, default=str))
    tmp.replace(STATE_FILE)


# ── TRMM ─────────────────────────────────────────────────────────────────

def trmm_get(path: str, key: str, timeout: int = 60):
    req = urllib.request.Request(f"{TRMM_API}{path}", headers={"X-API-Key": key})
    with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=timeout) as r:
        return json.loads(r.read())


def trmm_cmd(agent_id: str, cmd: str, key: str, timeout: int = 240):
    body = json.dumps({"cmd": cmd, "shell": "cmd", "timeout": timeout,
                       "run_as_user": False}).encode()
    req = urllib.request.Request(f"{TRMM_API}/agents/{agent_id}/cmd/", data=body, method="POST",
                                 headers={"X-API-Key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(),
                                    timeout=timeout + 30) as r:
            return r.status, r.read().decode()[:200]
    except Exception as e:                     # 502/504 = gateway gave up waiting
        return None, str(e)[:200]


# ── Actions ──────────────────────────────────────────────────────────────

def queue_self_update(key: str, kind: str, meta: dict) -> bool:
    """Hand the agent a self_update command; delivered on its next connect."""
    import soc_store
    platform = "windows"
    url = (f"{EXE_INSTALL_URL.rsplit('/install/', 1)[0]}/download/exe" if kind == "exe"
           else f"{EXE_INSTALL_URL.rsplit('/install/', 1)[0]}/download/agent?platform={platform}")
    for cmd in soc_store.pending_commands(key, include_sent=True):
        if cmd.get("command") == "self_update":
            args = json.loads(cmd.get("args") or "{}")
            if args.get("version") == meta["version"]:
                return True                    # already queued for this version
    soc_store.enqueue_command(key, "self_update", {
        "server": "173.208.232.91:8095", "url": url,
        "sha256": meta["sha256"], "version": meta["version"]})
    return True


def run_installer(agent_id: str, key: str, kind: str, host: str) -> str:
    url = EXE_INSTALL_URL if kind == "exe" else INSTALL_URL
    cmd = (f'curl.exe -sSL {url} -o "%TEMP%\\socagent-install.cmd"'
           f' && "%TEMP%\\socagent-install.cmd"')
    code, body = trmm_cmd(agent_id, cmd, key, timeout=1500)
    if code == 200:
        return "installed"
    if code is None and ("502" in body or "504" in body or "timed out" in body.lower()):
        return "installer dispatched (TRMM gateway timed out)"
    return f"installer failed: {body[:80]}"


def converge_host(a: dict, key: str, tele: dict, pub: dict, state: dict,
                  cooldown_h: float, dry: bool, connected: set) -> tuple:
    host = a.get("hostname", "?")
    aid = a.get("agent_id", "?")
    entry = tele.get(f"windows-{host}") or {}
    system = (entry.get("data") or {}).get("system") or {}
    ver = system.get("agent_version") or "?"
    kind = "exe" if str(system.get("build", "")).lower() == "exe" else "script"
    meta = pub[kind]
    want = meta["version"]

    if version_tuple(ver) >= version_tuple(want):
        return host, ver, "current", ""

    prev = state.get(host) or {}
    if prev.get("target") == want and prev.get("at"):
        age_h = (time.time() - float(prev["at"])) / 3600
        if age_h < cooldown_h:
            return host, ver, "cooldown", f"({age_h:.1f}h ago: {prev.get('action')})"

    live = f"windows-{host}" in connected
    if live and version_tuple(ver) >= CAN_SELF_UPDATE:
        # Connected and able to update itself: hand it the command, no restart needed.
        action = "queued self_update"
        if not dry:
            queue_self_update(f"windows-{host}", kind, meta)
    else:
        # Offline/stale agent, or too old to self-update: the installer is the
        # only lever that both upgrades and leaves exactly one agent running.
        why = "not connected" if not live else f"v{ver} cannot self-update"
        action = f"installer ({kind}, {why})"
        if not dry:
            action = run_installer(aid, key, kind, host)

    state[host] = {"at": time.time(), "from": ver, "target": want, "action": action}
    return host, ver, "pushed", action


def host_state(a: dict, tele: dict, pub: dict) -> tuple:
    """(version, kind, published_version, needs_work) for a TRMM host."""
    host = a.get("hostname", "?")
    entry = tele.get(f"windows-{host}") or {}
    system = (entry.get("data") or {}).get("system") or {}
    ver = system.get("agent_version") or "?"
    kind = "exe" if str(system.get("build", "")).lower() == "exe" else "script"
    want = pub[kind]["version"]
    return ver, kind, want, version_tuple(ver) < version_tuple(want)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("TRMM_API_KEY", ""))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--host", action="append", default=[],
                    help="limit to these hosts (glob or substring, repeatable)")
    ap.add_argument("--cooldown", type=float, default=6.0,
                    help="hours before re-pushing the same host for the same version")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--loop", type=int, default=0,
                    help="seconds between passes (0 = run once)")
    args = ap.parse_args()
    if not args.key:
        print("error: set TRMM_API_KEY or pass --key", file=sys.stderr)
        return 1

    while True:
        from soc_api import connected_agents
        import datetime as _dt
        pub = published()
        tele = telemetry()
        state = load_state()
        # "Connected" = live WS in either worker, or a check-in inside the window
        # the API uses. TRMM-online-but-not-connected is the stuck-agent case.
        cutoff = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(minutes=10)
        connected = set(connected_agents())
        for k, v in tele.items():
            try:
                seen = _dt.datetime.fromisoformat(str(v.get("last_seen", "")).replace("Z", "+00:00"))
            except Exception:
                continue
            if seen >= cutoff and (v.get("data") or {}).get("status") == "online":
                connected.add(k)
        log(f"published: script {pub['script']['version']} / exe {pub['exe']['version']}"
            f"{' (dry run)' if args.dry_run else ''}")

        agents = [a for a in trmm_get("/agents/", args.key) if a.get("plat") == "windows"]
        online = [a for a in agents if a.get("status") == "online"]
        targets = online
        if args.host:
            pats = [h.strip().lower() for h in args.host]

            def matches(name):
                low = name.lower()
                return any(fnmatch.fnmatch(low, p) or p in low for p in pats)
            targets = [a for a in online if matches(a.get("hostname", ""))]

        behind = [a for a in targets if host_state(a, tele, pub)[3]]
        log(f"TRMM windows: {len(agents)} ({len(online)} online); "
            f"online and behind: {len(behind)}")

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = [ex.submit(converge_host, a, args.key, tele, pub, state,
                              args.cooldown, args.dry_run, connected) for a in behind]
            for f in concurrent.futures.as_completed(futs):
                results.append(f.result())
        for host, ver, status, action in sorted(results):
            log(f"  {host:<28} {ver:<7} {status:<9} {action}")

        if not args.dry_run:
            save_state(state)
        if not args.loop:
            break
        time.sleep(args.loop)
    return 0


if __name__ == "__main__":
    sys.exit(main())
