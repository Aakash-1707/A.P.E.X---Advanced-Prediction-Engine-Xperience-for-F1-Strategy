#!/usr/bin/env python3
"""
F1 Telemetry Ingest Script
==========================
Fetches all data required by the APEX telemetry tab and stores it in Supabase.

Data sources
------------
  Ergast / Jolpica  →  race calendar, driver standings
  OpenF1            →  sessions, lap times, car telemetry, GPS location

Run order (per season)
-----------------------
  1. f1_races          — one row per Grand Prix
  2. f1_drivers        — full championship standings snapshot
  3. f1_sessions       — OpenF1 sessions per meeting (FP1…Race)
  4. f1_fastest_laps   — one row per driver per session
  5. f1_car_telemetry  — raw speed/throttle/brake/rpm/gear samples
  6. f1_location_telemetry — raw GPS x/y/z samples

Usage
-----
  pip install requests supabase python-dotenv
  export SUPABASE_URL="https://xxxx.supabase.co"
  export SUPABASE_SERVICE_KEY="eyJ..."   # use service role key, NOT anon
  python ingest_telemetry.py

  # Or for a specific season:
  SEASON=2024 python ingest_telemetry.py

  # Skip expensive telemetry step (just races + sessions):
  SKIP_TELEMETRY=1 python ingest_telemetry.py
"""

import os
import sys
import time
import logging
from datetime import datetime, timezone, timedelta

import requests
from supabase import create_client, Client

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("f1_ingest")

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")  # service role key

OPENF1_URL = "https://api.openf1.org/v1"
ERGAST_URL = "https://api.jolpi.ca/ergast/f1"

# Season to ingest. OpenF1 has confirmed data from 2023 onward.
# Use 2024 for a full season with rich telemetry data.
SEASON = int(os.environ.get("SEASON", 2024))
SKIP_TELEMETRY = os.environ.get("SKIP_TELEMETRY", "0") == "1"

# Seconds to sleep between API calls — be polite to free-tier APIs.
RATE_LIMIT = float(os.environ.get("RATE_LIMIT", 0.4))

# Supabase insert batch size (hard cap is 1000 rows per request).
BATCH_SIZE = 500

TEAM_COLORS: dict[str, str] = {
    "mclaren": "#FF8000",
    "red bull racing": "#1E5BC6",
    "red bull": "#1E5BC6",
    "racing bulls": "#6692FF",
    "ferrari": "#E8002D",
    "mercedes": "#00B2A9",
    "aston martin": "#229971",
    "alpine": "#2293D1",
    "williams": "#1868DB",
    "rb": "#6692FF",
    "haas": "#B6BABD",
    "kick sauber": "#52E252",
    "sauber": "#52E252",
}

# ── Supabase client ───────────────────────────────────────────────────────────
if not SUPABASE_URL or not SUPABASE_KEY:
    log.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.")
    sys.exit(1)

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Helpers ───────────────────────────────────────────────────────────────────

def resolve_color(team_name: str) -> str:
    norm = team_name.lower()
    for key, color in TEAM_COLORS.items():
        if key in norm:
            return color
    return "#6b7280"


def api_get(url: str, retries: int = 3) -> list | dict | None:
    """GET with exponential back-off. Returns parsed JSON or None on failure."""
    for attempt in range(retries):
        try:
            r = requests.get(url, timeout=20)
            r.raise_for_status()
            time.sleep(RATE_LIMIT)
            return r.json()
        except requests.HTTPError as e:
            if r.status_code == 429:
                wait = 10 * (attempt + 1)
                log.warning("Rate-limited. Sleeping %ds...", wait)
                time.sleep(wait)
            else:
                log.warning("HTTP %s for %s (attempt %d)", r.status_code, url, attempt + 1)
                time.sleep(2 ** attempt)
        except Exception as e:
            log.warning("Request error (%s) for %s (attempt %d)", e, url, attempt + 1)
            time.sleep(2 ** attempt)
    log.error("Giving up on %s", url)
    return None


def supabase_upsert(table: str, rows: list[dict], conflict: str) -> None:
    if not rows:
        return
    try:
        sb.table(table).upsert(rows, on_conflict=conflict).execute()
    except Exception as e:
        log.error("Upsert failed for %s: %s", table, e)


def supabase_insert_batched(table: str, rows: list[dict]) -> None:
    """Insert rows in batches. Skips duplicates silently via ignore_duplicates."""
    if not rows:
        return
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        try:
            sb.table(table).insert(chunk, returning="minimal").execute()
        except Exception as e:
            log.error("Batch insert failed for %s (chunk %d): %s", table, i, e)


def already_exists(table: str, **filters) -> bool:
    """Returns True if at least one row matching all filters exists."""
    try:
        q = sb.table(table).select("id", count="exact")
        for col, val in filters.items():
            q = q.eq(col, val)
        res = q.limit(1).execute()
        return (res.count or 0) > 0
    except Exception:
        return False


# ── Step 1 — Races ────────────────────────────────────────────────────────────

def ingest_races(season: int) -> list[dict]:
    log.info("━━ [1] Races — season %d", season)
    data = api_get(f"{ERGAST_URL}/{season}.json")
    if not data:
        return []

    races_raw = data["MRData"]["RaceTable"]["Races"]
    now = datetime.now(timezone.utc)
    rows = []

    for r in races_raw:
        time_str = r.get("time", "12:00:00Z")
        race_dt = datetime.fromisoformat(
            f"{r['date']}T{time_str}".replace("Z", "+00:00")
        )
        race_end = race_dt + timedelta(hours=2)

        if now > race_end:
            status = "completed"
        elif race_dt <= now <= race_end:
            status = "live"
        else:
            status = "upcoming"

        rows.append({
            "season": season,
            "round": int(r["round"]),
            "race_name": r["raceName"],
            "circuit_name": r["Circuit"]["circuitName"],
            "country": r["Circuit"]["Location"]["country"],
            "race_date": race_dt.isoformat(),
            "status": status,
            # meeting_key backfilled in step 3
        })

    supabase_upsert("f1_races", rows, "season,round")
    log.info("    ✓ %d races upserted", len(rows))
    return rows


# ── Step 2 — Drivers ─────────────────────────────────────────────────────────

def ingest_drivers(season: int) -> list[dict]:
    log.info("━━ [2] Drivers — season %d", season)
    data = api_get(f"{ERGAST_URL}/{season}/driverStandings.json")
    if not data:
        return []

    lists = data["MRData"]["StandingsTable"]["StandingsLists"]
    if not lists:
        log.warning("    No standings data for season %d", season)
        return []

    rows = []
    for d in lists[0]["DriverStandings"]:
        drv = d["Driver"]
        code = drv.get("code") or drv["familyName"][:3].upper()
        team = (d["Constructors"][0]["name"]) if d.get("Constructors") else "Unknown"
        number = drv.get("permanentNumber")
        rows.append({
            "season": season,
            "driver_number": int(number) if number else 0,
            "abbreviation": code,
            "full_name": f"{drv['givenName']} {drv['familyName']}",
            "team": team,
            "team_color": resolve_color(team),
            "standing_position": int(d["position"]),
            "points": float(d["points"]),
        })

    # Filter out rows with driver_number = 0 (test/reserve entries with no number)
    rows = [r for r in rows if r["driver_number"] > 0]
    supabase_upsert("f1_drivers", rows, "season,driver_number")
    log.info("    ✓ %d drivers upserted", len(rows))
    return rows


# ── Step 3 — Sessions ─────────────────────────────────────────────────────────

def ingest_sessions(race: dict, race_db_id: int) -> list[dict]:
    race_name = race["race_name"]
    season = race["season"]
    log.info("  ── [3] Sessions — %s (%d)", race_name, season)

    meetings = api_get(
        f"{OPENF1_URL}/meetings"
        f"?meeting_name={requests.utils.quote(race_name)}&year={season}"
    )
    if not meetings or len(meetings) == 0:
        log.warning("      No OpenF1 meeting for '%s' %d — skipping", race_name, season)
        return []

    meeting = meetings[0]
    meeting_key = meeting["meeting_key"]

    # Backfill meeting_key on the race row
    try:
        sb.table("f1_races").update({"meeting_key": meeting_key}).eq("id", race_db_id).execute()
    except Exception as e:
        log.warning("      Could not backfill meeting_key: %s", e)

    sessions_raw = api_get(f"{OPENF1_URL}/sessions?meeting_key={meeting_key}")
    if not sessions_raw:
        return []

    rows = []
    for s in sessions_raw:
        rows.append({
            "session_key": s["session_key"],
            "meeting_key": meeting_key,
            "race_id": race_db_id,
            "session_name": s.get("session_name", ""),
            "session_type": s.get("session_type"),
            "date_start": s.get("date_start"),
            "date_end": s.get("date_end"),
            "year": s.get("year", season),
        })

    supabase_upsert("f1_sessions", rows, "session_key")
    log.info("      ✓ %d sessions upserted", len(rows))
    return rows


# ── Step 4–6 — Fastest Lap + Telemetry ───────────────────────────────────────

def ingest_telemetry(session_key: int, driver_number: int) -> None:
    log.info("    ── [4-6] Telemetry: session=%d driver=%d", session_key, driver_number)

    # Idempotency check — skip if we already have this driver's fastest lap
    if already_exists("f1_fastest_laps", session_key=session_key, driver_number=driver_number):
        log.info("        [SKIP] Already ingested")
        return

    # 4a. Fetch all laps for this driver
    laps = api_get(
        f"{OPENF1_URL}/laps?session_key={session_key}&driver_number={driver_number}"
    )
    if not laps or not isinstance(laps, list):
        log.info("        [SKIP] No lap data")
        return

    valid_laps = [l for l in laps if l.get("lap_duration") and l.get("date_start")]
    if not valid_laps:
        log.info("        [SKIP] No valid laps (all missing duration/start)")
        return

    # 4b. Pick the genuinely fastest lap
    fastest = min(valid_laps, key=lambda l: l["lap_duration"])

    lap_start_dt = datetime.fromisoformat(fastest["date_start"].replace("Z", "+00:00"))
    lap_end_dt   = lap_start_dt + timedelta(seconds=fastest["lap_duration"])
    start_iso    = lap_start_dt.isoformat()
    end_iso      = lap_end_dt.isoformat()

    # 4c. Store fastest lap row
    supabase_upsert("f1_fastest_laps", [{
        "session_key":   session_key,
        "driver_number": driver_number,
        "lap_number":    fastest.get("lap_number"),
        "lap_duration":  fastest["lap_duration"],
        "lap_start":     fastest["date_start"],
    }], "session_key,driver_number")

    # 5. Car telemetry (speed, throttle, brake, rpm, gear, drs)
    car_data = api_get(
        f"{OPENF1_URL}/car_data"
        f"?session_key={session_key}&driver_number={driver_number}"
        f"&date>={start_iso}&date<={end_iso}"
    )
    if car_data and isinstance(car_data, list) and len(car_data) > 0:
        car_rows = [{
            "session_key":   session_key,
            "driver_number": driver_number,
            "sample_date":   pt["date"],
            "speed":         pt.get("speed"),
            "throttle":      pt.get("throttle"),
            "brake":         pt.get("brake"),
            "rpm":           pt.get("rpm"),
            "n_gear":        pt.get("n_gear"),
            "drs":           pt.get("drs"),
        } for pt in car_data]
        supabase_insert_batched("f1_car_telemetry", car_rows)
        log.info("        ✓ %d car telemetry samples", len(car_rows))
    else:
        log.warning("        [WARN] No car_data returned")

    # 6. GPS location (x, y, z) for track map
    loc_data = api_get(
        f"{OPENF1_URL}/location"
        f"?session_key={session_key}&driver_number={driver_number}"
        f"&date>={start_iso}&date<={end_iso}"
    )
    if loc_data and isinstance(loc_data, list) and len(loc_data) > 0:
        loc_rows = [{
            "session_key":   session_key,
            "driver_number": driver_number,
            "sample_date":   pt["date"],
            "x":             pt.get("x"),
            "y":             pt.get("y"),
            "z":             pt.get("z"),
        } for pt in loc_data]
        supabase_insert_batched("f1_location_telemetry", loc_rows)
        log.info("        ✓ %d location samples", len(loc_rows))
    else:
        log.warning("        [WARN] No location data returned (track map will be hidden)")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("Starting F1 telemetry ingest — season %d", SEASON)
    if SKIP_TELEMETRY:
        log.info("SKIP_TELEMETRY=1 → skipping car/location step")

    # ── 1. Races
    races = ingest_races(SEASON)
    if not races:
        log.error("No races fetched — aborting.")
        return

    # ── 2. Drivers
    drivers = ingest_drivers(SEASON)
    driver_numbers = [d["driver_number"] for d in drivers]
    if not driver_numbers:
        log.error("No drivers fetched — aborting.")
        return

    # Re-fetch DB rows to get auto-assigned IDs
    db_races = sb.table("f1_races").select("id,round").eq("season", SEASON).execute().data
    id_by_round: dict[int, int] = {r["round"]: r["id"] for r in db_races}

    # ── 3–6. Per race
    for race in races:
        race_db_id = id_by_round.get(race["round"])
        if not race_db_id:
            log.warning("No DB id for round %d — skipping", race["round"])
            continue

        sessions = ingest_sessions(race, race_db_id)

        if SKIP_TELEMETRY or not sessions:
            continue

        for session in sessions:
            session_key = session["session_key"]
            for driver_number in driver_numbers:
                ingest_telemetry(session_key, driver_number)

    log.info("Ingest complete.")


if __name__ == "__main__":
    main()
