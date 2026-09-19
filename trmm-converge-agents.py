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
from datetime import datetime, timezone
import urllib.request
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
            # Keep a useful slice: the installer's output is what explains a no-effect push,
            # and 200 chars only ever captured the script banner.
            return r.status, r.read().decode(errors="replace")[:4000]
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


INSTALL_OUT: dict = {}


def run_installer(agent_id: str, key: str, kind: str, host: str) -> str:
    """Push the installer and keep its output — a bare HTTP 200 says nothing."""
    url = EXE_INSTALL_URL if kind == "exe" else INSTALL_URL
    # Try curl, then certutil: Harvest-remote runs a curl that cannot even open a
    # socket ("getsockname() failed with errno 10022"), and with the download behind
    # && the installer never ran — so the push did nothing while looking successful.
    cmd = (f'curl.exe -sSL {url} -o "%TEMP%\\socagent-install.cmd"'
           f' || certutil -urlcache -split -f {url} "%TEMP%\\socagent-install.cmd"'
           f' & "%TEMP%\\socagent-install.cmd"')
    code, body = trmm_cmd(agent_id, cmd, key, timeout=1500)
    # TRMM returns 200 as soon as the command is accepted; the host can still be on the
    # old version afterwards (four hosts sat on 1.1.0 while this reported "installed").
    # The tail of the command output is kept so a no-effect push can explain itself.
    text = " ".join((body or "").replace(chr(13), "").split())
    INSTALL_OUT[host] = {"kind": kind, "http": code, "output": text[-600:]}
    tail = text[-160:]
    if code == 200:
        return f"installed (rc=200) {tail}"
    if code is None and ("502" in body or "504" in body or "timed out" in body.lower()):
        return "installer dispatched (TRMM gateway timed out)"
    return f"installer failed: {tail or body[:80]}"


def converge_host(a: dict, key: str, tele: dict, pub: dict, state: dict,
                  cooldown_h: float, dry: bool, connected: set,
                  retry_after_h: float = 0.5, kind_override: str = "auto") -> tuple:
    host = a.get("hostname", "?")
    aid = a.get("agent_id", "?")
    entry = tele.get(f"windows-{host}") or {}
    system = (entry.get("data") or {}).get("system") or {}
    ver = system.get("agent_version") or "?"
    kind = "exe" if str(system.get("build", "")).lower() == "exe" else "script"
    if kind_override != "auto":
        kind = kind_override
    meta = pub[kind]
    want = meta["version"]

    if version_tuple(ver) >= version_tuple(want):
        state.pop(host, None)        # resolved: drop it so the SOC "needs hands" list clears
        return host, ver, "current", ""

    prev = state.get(host) or {}
    deferred = prev.get("deferred")
    if deferred:
        # Marked for a site visit (--defer): do not push, do not age the cooldown.
        return host, ver, "ON SITE", str(deferred.get("reason") or "waiting on a site visit")
    if prev.get("target") == want and prev.get("at"):
        age_h = (time.time() - float(prev["at"])) / 3600
        was_push = str(prev.get("outcome", "")).startswith(("installed", "installer dispatched", "installer failed"))
        attempts = int(prev.get("attempts", 1))
        # An installer push that reported success but left the host behind is the
        # failure this tool exists to catch: retry with the OTHER installer rather
        # than sitting in the full cooldown showing a green "installed".
        if was_push and age_h >= retry_after_h and attempts < 3:
            alt = "exe" if prev.get("kind", kind) == "script" else "script"
            why = f"previous {prev.get('kind')} push had no effect {age_h:.1f}h ago"
            action = f"installer ({alt}, retry {attempts + 1}: {why})"
            if not dry:
                action = run_installer(aid, key, alt, host)
            state[host] = {"at": time.time(), "from": ver, "target": want, "action": action,
                           "outcome": action, "kind": alt, "attempts": attempts + 1,
                           "output": (INSTALL_OUT.get(host) or {}).get("output", "")}
            return host, ver, "retry", action
        if was_push and attempts >= 3 and age_h < cooldown_h:
            return host, ver, "STUCK", (f"still v{ver} after {attempts} installer attempts — "
                                        f"last output: {str(prev.get('output') or '')[:160]}")
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

    state[host] = {"at": time.time(), "from": ver, "target": want, "action": action,
                   "outcome": action, "kind": kind, "attempts": 1,
                   "output": (INSTALL_OUT.get(host) or {}).get("output", "")}
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


SOC_STATUS_FILE = Path(os.environ.get("SOC_CONVERGE_STATUS",
                                        "/home/aiagent/mission-control-ui/agent_converge.json"))


def publish_status(statuses: list, pub: dict) -> None:
    """Hand the SOC what only a human can resolve.

    The Agents page shows these with the captured installer output, so a host that
    cannot converge stops looking identical to one that simply has not checked in.
    """
    items = []
    for host, ver, status, action in statuses:
        if status not in ("STUCK", "NEEDS RMM", "ON SITE"):
            continue
        items.append({"host": host, "version": ver, "status": status,
                      "reason": action, "at": datetime.now(timezone.utc).isoformat()})
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(),
               "published": {"script": pub["script"]["version"], "exe": pub["exe"]["version"]},
               "items": sorted(items, key=lambda i: i["host"].lower())}
    try:
        SOC_STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
        SOC_STATUS_FILE.write_text(json.dumps(payload, indent=2))
        log(f"published {len(items)} host(s) needing hands to {SOC_STATUS_FILE}")
    except Exception as e:
        log(f"could not publish needs-hands status: {e}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.environ.get("TRMM_API_KEY", ""))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--host", action="append", default=[],
                    help="limit to these hosts (glob or substring, repeatable)")
    ap.add_argument("--cooldown", type=float, default=6.0,
                    help="hours before re-pushing the same host for the same version")
    ap.add_argument("--retry-after", type=float, default=0.5, dest="retry_after",
                    help="hours after an ineffective installer push before retrying with the other installer")
    ap.add_argument("--kind", choices=("auto", "exe", "script"), default="auto",
                    help="force the installer kind instead of following the host's current build")
    ap.add_argument("--defer", action="append", default=[], metavar="HOST",
                    help="stop pushing to this host until --resume (for hosts needing a site visit)")
    ap.add_argument("--defer-reason", default="", help="why the host is deferred (shown in the SOC)")
    ap.add_argument("--resume", action="append", default=[], metavar="HOST",
                    help="clear a deferral so the host is converged again")
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
        for h in args.resume:
            if state.get(h, {}).pop("deferred", None) is not None:
                log(f"{h}: deferral cleared - back in the convergence set")
        for h in args.defer:
            entry = state.setdefault(h, {"from": "?", "target": pub["script"]["version"]})
            entry["deferred"] = {"at": time.time(),
                                "reason": args.defer_reason or "waiting on a site visit"}
            log(f"{h}: deferred - {entry['deferred']['reason']}")
        if args.defer or args.resume:
            save_state(state)
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
        # A host whose agent is checking in but whose RMM agent is offline is invisible to
        # the loop above, so it would sit on an old version forever without a word.
        trmm_hosts = {str(a.get("hostname", "")).lower() for a in agents}
        trmm_online = {str(a.get("hostname", "")).lower() for a in online}
        rmm_blind = []
        for key, entry in tele.items():
            host = key.split("-", 1)[-1]
            if host.lower() in trmm_online:
                continue        # already handled as a normal target
            try:
                seen = _dt.datetime.fromisoformat(str(entry.get("last_seen", "")).replace("Z", "+00:00"))
            except Exception:
                continue
            sysd = (entry.get("data") or {}).get("system") or {}
            ver = sysd.get("agent_version") or "?"
            kind = "exe" if str(sysd.get("build", "")).lower() == "exe" else "script"
            if seen >= _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(hours=24) \
                    and version_tuple(ver) < version_tuple(pub[kind]["version"]):
                why = "RMM record offline" if host.lower() in trmm_hosts else "no RMM record"
                rmm_blind.append((host, ver, round((_dt.datetime.now(_dt.timezone.utc) - seen).total_seconds() / 60), why))
        log(f"TRMM windows: {len(agents)} ({len(online)} online); "
            f"online and behind: {len(behind)}")
        for host, ver, age_m, why in sorted(rmm_blind):
            log(f"  {host:<28} {ver:<7} NEEDS RMM  {why}, agent seen {age_m}m ago — "
                f"installer cannot be pushed until the RMM agent is reachable")
        rmm_rows = [(h, v, "NEEDS RMM", f"{w}, agent seen {a}m ago") for h, v, a, w in rmm_blind]

        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = [ex.submit(converge_host, a, args.key, tele, pub, state,
                              args.cooldown, args.dry_run, connected,
                              args.retry_after, args.kind) for a in behind]
            for f in concurrent.futures.as_completed(futs):
                results.append(f.result())
        for host, ver, status, action in sorted(results):
            log(f"  {host:<28} {ver:<7} {status:<9} {action}")

        if not args.dry_run:
            publish_status(results + rmm_rows, pub)

        if not args.dry_run:
            save_state(state)
        if not args.loop:
            break
        time.sleep(args.loop)
    return 0


if __name__ == "__main__":
    sys.exit(main())
