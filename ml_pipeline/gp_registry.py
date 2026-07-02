"""
Canonical 2026 Grand Prix name registry (shared with frontend via gp_registry.json).

Resolves OpenF1 meeting names, user aliases, and FastF1 schedule names to the
single predictor_name stored in Supabase.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

REGISTRY_PATH = Path(__file__).resolve().parent.parent / "gp_registry.json"


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(name).lower())


@lru_cache(maxsize=1)
def load_registry() -> dict[str, Any]:
    with REGISTRY_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def get_grand_prix_entries() -> list[dict[str, Any]]:
    return load_registry().get("grand_prix", [])


def get_ordered_predictor_names() -> list[str]:
    return [gp["predictor_name"] for gp in get_grand_prix_entries()]


def get_entry_by_predictor_name(name: str) -> dict[str, Any] | None:
    norm = _norm(name)
    for gp in get_grand_prix_entries():
        if _norm(gp["predictor_name"]) == norm:
            return gp
    return None


def resolve_predictor_name(name: str) -> str | None:
    """Map OpenF1 / alias / partial input → canonical predictor_name."""
    if not name or not str(name).strip():
        return None

    raw = str(name).strip()
    norm = _norm(raw)

    for gp in get_grand_prix_entries():
        candidates = [gp["predictor_name"]]
        candidates.extend(gp.get("openf1_names", []))
        candidates.extend(gp.get("aliases", []))
        for candidate in candidates:
            if _norm(candidate) == norm:
                return gp["predictor_name"]

    # Fuzzy: substring match on aliases (e.g. "Madring" → Spanish Grand Prix)
    for gp in get_grand_prix_entries():
        for candidate in [gp["predictor_name"], *gp.get("openf1_names", []), *gp.get("aliases", [])]:
            cnorm = _norm(candidate)
            if norm in cnorm or cnorm in norm:
                return gp["predictor_name"]

    return None


def resolve_openf1_meeting_name(meeting_name: str, country: str | None = None) -> str | None:
    """Map an OpenF1 meeting_name (+ country disambiguation) → predictor_name."""
    if not meeting_name:
        return None

    norm = _norm(meeting_name)
    matches: list[dict[str, Any]] = []

    for gp in get_grand_prix_entries():
        for candidate in [gp["predictor_name"], *gp.get("openf1_names", [])]:
            if _norm(candidate) == norm:
                matches.append(gp)

    if len(matches) == 1:
        return matches[0]["predictor_name"]

    # Spain: disambiguate Barcelona vs Madrid by meeting name keywords
    if country and country.lower() in ("spain",):
        lower = meeting_name.lower()
        if "barcelona" in lower or "catalunya" in lower:
            return "Barcelona Grand Prix"
        if "spanish" in lower or "madrid" in lower or "madring" in lower:
            return "Spanish Grand Prix"

    if matches:
        return matches[0]["predictor_name"]

    return resolve_predictor_name(meeting_name)


def fastf1_name_candidates(predictor_name: str, year: int) -> list[str]:
    entry = get_entry_by_predictor_name(predictor_name)
    if not entry:
        return [predictor_name]

    names: list[str] = []
    if year >= 2026:
        names.extend(entry.get("fastf1_2026_names", []))
    names.extend(entry.get("fastf1_historical_names", []))
    names.append(entry["predictor_name"])
    names.extend(entry.get("openf1_names", []))

    # unique preserve order
    seen: set[str] = set()
    out: list[str] = []
    for n in names:
        key = _norm(n)
        if key not in seen:
            seen.add(key)
            out.append(n)
    return out


def resolve_fastf1_event_name(predictor_name: str, year: int, schedule_event_names: list[str]) -> str | None:
    """Pick the FastF1 EventName from a schedule for a canonical GP."""
    schedule_norm = {_norm(n): n for n in schedule_event_names}
    for candidate in fastf1_name_candidates(predictor_name, year):
        hit = schedule_norm.get(_norm(candidate))
        if hit:
            return hit
    return None


def gp_country(predictor_name: str) -> str | None:
    entry = get_entry_by_predictor_name(predictor_name)
    return entry.get("country") if entry else None


def list_gps_for_cli() -> None:
    print("\n  2026 Grand Prix registry (canonical → OpenF1 names):\n")
    for i, gp in enumerate(get_grand_prix_entries(), 1):
        openf1 = ", ".join(gp.get("openf1_names", []))
        print(f"  {i:2}. {gp['predictor_name']}")
        if openf1 and openf1 != gp["predictor_name"]:
            print(f"      OpenF1: {openf1}")
        aliases = gp.get("aliases", [])
        if aliases:
            print(f"      Aliases: {', '.join(aliases[:4])}{'…' if len(aliases) > 4 else ''}")


def fetch_openf1_meetings(year: int) -> list[dict[str, Any]]:
    """Return OpenF1 meetings for a season (requires requests)."""
    import requests

    url = f"https://api.openf1.org/v1/meetings?year={year}"
    r = requests.get(url, timeout=25)
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else []


def latest_completed_predictor_gp(year: int = 2026) -> str | None:
    """
    Return the canonical predictor_name for the most recent meeting that has
    a finished Race session on OpenF1 (for CI / manual runs without typing names).
    """
    import requests

    sessions = requests.get(
        f"https://api.openf1.org/v1/sessions?year={year}",
        timeout=25,
    ).json()
    if not isinstance(sessions, list):
        return None

    race_sessions = [
        s for s in sessions
        if s.get("session_name") == "Race" and s.get("meeting_key") and s.get("date_end")
    ]
    if not race_sessions:
        return None

    race_sessions.sort(key=lambda s: s.get("date_end", ""), reverse=True)

    meetings = {m.get("meeting_key"): m for m in fetch_openf1_meetings(year)}
    for sess in race_sessions:
        mk = sess["meeting_key"]
        meeting = meetings.get(mk)
        if not meeting:
            continue
        meeting_name = meeting.get("meeting_name") or meeting.get("meeting_official_name") or ""
        country = meeting.get("country_name") or meeting.get("country_code")
        resolved = resolve_openf1_meeting_name(meeting_name, country)
        if resolved:
            results = requests.get(
                f"https://api.openf1.org/v1/session_result?session_key={sess['session_key']}",
                timeout=25,
            ).json()
            if isinstance(results, list) and len(results) > 0:
                return resolved
    return None


def print_openf1_calendar(year: int = 2026) -> None:
    """Print OpenF1 meetings mapped to predictor names (debug / CI)."""
    print(f"\n  OpenF1 {year} calendar → predictor names:\n")
    for m in fetch_openf1_meetings(year):
        name = m.get("meeting_name") or m.get("meeting_official_name") or "?"
        country = m.get("country_name") or m.get("country_code")
        resolved = resolve_openf1_meeting_name(name, country) or "— UNMAPPED —"
        print(f"  mk={m.get('meeting_key'):4}  {name}")
        print(f"         → {resolved}")
