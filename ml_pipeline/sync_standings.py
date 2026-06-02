#!/usr/bin/env python3
"""
Sync 2026 championship standings into Supabase.

The frontend reads `vw_driver_standings` and `vw_constructor_standings`, which
are built from OpenF1 session results stored in Supabase. The prediction
pipeline (run_pipeline.py) does NOT update those views — this script does.

Run locally or from GitHub Actions after the pipeline:

  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python sync_standings.py

  python sync_standings.py --year 2026
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from typing import Any

import requests

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: pip install supabase")
    sys.exit(1)


def get_client() -> Client:
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or ""
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise EnvironmentError(
            "Missing SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.\n"
            "Add them as GitHub Actions secrets for CI."
        )
    return create_client(url, key)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("sync_standings")

OPENF1_URL = "https://api.openf1.org/v1"
DEFAULT_YEAR = int(os.environ.get("STANDINGS_YEAR", "2026"))
RATE_LIMIT = float(os.environ.get("RATE_LIMIT", "0.35"))
BATCH_SIZE = 500
SCORING_SESSIONS = frozenset({"Race", "Sprint"})


def api_get(url: str, timeout: int = 25, retries: int = 3) -> list | dict | None:
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=timeout)
            r.raise_for_status()
            time.sleep(RATE_LIMIT)
            return r.json()
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status == 429:
                time.sleep(10 * (attempt + 1))
            else:
                log.warning("HTTP %s for %s (attempt %d)", status, url, attempt + 1)
                time.sleep(2**attempt)
        except Exception as exc:
            log.warning("Request error (%s) for %s (attempt %d)", exc, url, attempt + 1)
            time.sleep(2**attempt)
    log.error("Giving up on %s", url)
    return None


def batched_upsert(sb, table: str, rows: list[dict], on_conflict: str) -> int:
    if not rows:
        return 0
    total = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        sb.table(table).upsert(chunk, on_conflict=on_conflict).execute()
        total += len(chunk)
    return total


def fetch_scoring_sessions(year: int) -> list[dict]:
    raw = api_get(f"{OPENF1_URL}/sessions?year={year}")
    if not isinstance(raw, list):
        return []
    return [s for s in raw if s.get("session_name") in SCORING_SESSIONS]


def sync_session(sb, session: dict) -> tuple[int, int, int]:
    session_key = session["session_key"]
    meeting_key = session.get("meeting_key")

    results = api_get(f"{OPENF1_URL}/session_result?session_key={session_key}")
    drivers = api_get(f"{OPENF1_URL}/drivers?session_key={session_key}")

    if not isinstance(results, list) or len(results) == 0:
        log.info("  session %s (%s): no results yet — skip", session_key, session.get("session_name"))
        return 0, 0, 0

    if not isinstance(drivers, list):
        drivers = []

    session_rows = [{
        "session_key": session_key,
        "meeting_key": meeting_key,
        "session_name": session.get("session_name"),
        "session_type": session.get("session_type"),
        "date_start": session.get("date_start"),
        "date_end": session.get("date_end"),
        "year": session.get("year", DEFAULT_YEAR),
    }]

    driver_rows: list[dict] = []
    seen_drivers: set[int] = set()
    for d in drivers:
        num = d.get("driver_number")
        if num is None or num in seen_drivers:
            continue
        seen_drivers.add(num)
        driver_rows.append({
            "session_key": session_key,
            "meeting_key": meeting_key,
            "driver_number": num,
            "full_name": d.get("full_name") or f"{d.get('first_name', '')} {d.get('last_name', '')}".strip(),
            "name_acronym": d.get("name_acronym"),
            "first_name": d.get("first_name"),
            "last_name": d.get("last_name"),
            "team_name": d.get("team_name"),
            "team_colour": d.get("team_colour"),
            "broadcast_name": d.get("broadcast_name"),
            "country_code": d.get("country_code"),
        })

    result_rows: list[dict] = []
    for row in results:
        if row.get("driver_number") is None:
            continue
        result_rows.append({
            "session_key": session_key,
            "meeting_key": row.get("meeting_key", meeting_key),
            "driver_number": row["driver_number"],
            "position": row.get("position"),
            "points": row.get("points") if row.get("points") is not None else 0,
            "number_of_laps": row.get("number_of_laps"),
            "dnf": row.get("dnf", False),
            "dns": row.get("dns", False),
            "dsq": row.get("dsq", False),
            "duration": row.get("duration"),
            "gap_to_leader": row.get("gap_to_leader"),
        })

    n_sessions = batched_upsert(sb, "sessions", session_rows, "session_key")
    n_drivers = batched_upsert(sb, "drivers", driver_rows, "session_key,driver_number")
    n_results = batched_upsert(sb, "session_results", result_rows, "session_key,driver_number")

    log.info(
        "  session %s (%s): %d results, %d drivers",
        session_key,
        session.get("session_name"),
        n_results,
        n_drivers,
    )
    return n_sessions, n_drivers, n_results


def sync_standings(year: int = DEFAULT_YEAR) -> dict[str, Any]:
    sb = get_client()
    sessions = fetch_scoring_sessions(year)
    if not sessions:
        raise RuntimeError(f"No Race/Sprint sessions found on OpenF1 for {year}")

    log.info("Syncing standings for %d scoring sessions (%d)", len(sessions), year)

    totals = {"sessions": 0, "drivers": 0, "results": 0}
    for session in sorted(sessions, key=lambda s: s.get("date_start") or ""):
        try:
            s, d, r = sync_session(sb, session)
            totals["sessions"] += s
            totals["drivers"] += d
            totals["results"] += r
        except Exception as exc:
            log.error(
                "Failed session %s (%s): %s",
                session.get("session_key"),
                session.get("session_name"),
                exc,
            )

    # Sanity check: read aggregated view (same source the app uses)
    try:
        top = (
            sb.table("vw_driver_standings")
            .select("position,driver,points")
            .order("position")
            .limit(3)
            .execute()
        )
        if top.data:
            log.info("Top 3 after sync:")
            for row in top.data:
                log.info("  P%d  %s  %s pts", row["position"], row["driver"], row["points"])
    except Exception as exc:
        log.warning("Could not read vw_driver_standings: %s", exc)

    if totals["results"] == 0:
        raise RuntimeError(
            "No session_results were written. Check Supabase table columns / upsert keys."
        )

    return totals


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync F1 championship standings to Supabase")
    parser.add_argument("--year", type=int, default=DEFAULT_YEAR, help="Season year (default: 2026)")
    args = parser.parse_args()

    try:
        totals = sync_standings(args.year)
    except Exception as exc:
        log.error("Standings sync failed: %s", exc)
        sys.exit(1)

    log.info(
        "Done — upserted %d session rows, %d driver rows, %d result rows",
        totals["sessions"],
        totals["drivers"],
        totals["results"],
    )


if __name__ == "__main__":
    main()
