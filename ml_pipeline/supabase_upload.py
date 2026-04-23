"""
═══════════════════════════════════════════════════════════════════════
  F1 2026 Predictor — Supabase Upload Module
  ─────────────────────────────────────────────────────────────────
  Maps the APEX V7 predictor output DataFrames directly into the
  Supabase `race_predictions` and `quali_predictions` tables.

  Uses upsert on (gp_name, driver_abbr) so re-runs replace stale rows
  in place instead of growing the table forever.

  Environment:
    SUPABASE_URL          — your project URL
    SUPABASE_SERVICE_KEY  — service role key (write access, bypasses RLS)
═══════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import os
import sys
import warnings
from datetime import datetime, timezone
from typing import Optional

import pandas as pd

warnings.filterwarnings("ignore")

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

try:
    from f1_2026_predictor import ALL_2026_GPS_ORDERED
except ImportError:
    ALL_2026_GPS_ORDERED = []


# ─────────────────────────────────────────────────────────────────────
#  GP → country + round metadata
#  (mirrors the frontend's expectations so the Supabase `country` and
#   `round` columns can be used for filtering / joins if needed)
# ─────────────────────────────────────────────────────────────────────
GP_COUNTRY: dict[str, str] = {
    "Australian Grand Prix":      "Australia",
    "Chinese Grand Prix":         "China",
    "Japanese Grand Prix":        "Japan",
    "Bahrain Grand Prix":         "Bahrain",
    "Saudi Arabian Grand Prix":   "Saudi Arabia",
    "Miami Grand Prix":           "USA",
    "Emilia Romagna Grand Prix":  "Italy",
    "Monaco Grand Prix":          "Monaco",
    "Spanish Grand Prix":         "Spain",
    "Canadian Grand Prix":        "Canada",
    "Austrian Grand Prix":        "Austria",
    "British Grand Prix":         "UK",
    "Belgian Grand Prix":         "Belgium",
    "Hungarian Grand Prix":       "Hungary",
    "Dutch Grand Prix":           "Netherlands",
    "Italian Grand Prix":         "Italy",
    "Azerbaijan Grand Prix":      "Azerbaijan",
    "Singapore Grand Prix":       "Singapore",
    "United States Grand Prix":   "USA",
    "Mexican Grand Prix":         "Mexico",
    "Brazilian Grand Prix":       "Brazil",
    "Las Vegas Grand Prix":       "USA",
    "Qatar Grand Prix":           "Qatar",
    "Abu Dhabi Grand Prix":       "Abu Dhabi",
}

def _gp_round(gp_name: str) -> Optional[int]:
    if gp_name in ALL_2026_GPS_ORDERED:
        return ALL_2026_GPS_ORDERED.index(gp_name) + 1
    return None


# ─────────────────────────────────────────────────────────────────────
#  CLIENT
# ─────────────────────────────────────────────────────────────────────
def get_client() -> Client:
    # Accept either SUPABASE_URL (GitHub Actions) or VITE_SUPABASE_URL (.env
    # shared with the Vite frontend) so you don't have to duplicate it.
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("VITE_SUPABASE_URL")
        or ""
    )
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise EnvironmentError(
            "Supabase credentials missing.\n"
            "  Need:  SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_KEY\n"
            "  Add them to ml_pipeline/.env locally, or to GitHub Secrets in CI."
        )
    return create_client(url, key)


# ─────────────────────────────────────────────────────────────────────
#  SAFE COERCION HELPERS
# ─────────────────────────────────────────────────────────────────────
def _safe_float(val, default=None):
    if val is None:
        return default
    try:
        f = float(val)
        return f if f == f else default   # NaN check
    except (TypeError, ValueError):
        return default


def _safe_int(val, default=None):
    if val is None:
        return default
    try:
        if isinstance(val, float) and val != val:
            return default
        return int(val)
    except (TypeError, ValueError):
        return default


def _safe_str(val, default=""):
    if val is None:
        return default
    try:
        if isinstance(val, float) and val != val:
            return default
    except Exception:
        pass
    return str(val)


# ─────────────────────────────────────────────────────────────────────
#  UPLOADERS
# ─────────────────────────────────────────────────────────────────────
def _race_row(gp_name: str, rank: int, row: pd.Series) -> dict:
    return {
        "gp_name":         gp_name,
        "country":         GP_COUNTRY.get(gp_name),
        "round":           _gp_round(gp_name),

        "driver_abbr":     _safe_str(row.get("Abbreviation")),
        "driver_name":     _safe_str(row.get("FullName", row.get("Abbreviation"))),
        "driver_number":   _safe_str(row.get("DriverNumber")),
        "team_name":       _safe_str(row.get("TeamName")),

        "grid_position":   _safe_int(row.get("GridPosition")),
        "win_pct":         _safe_float(row.get("Win_%"), 0.0),
        "podium_pct":      _safe_float(row.get("Podium_%"), 0.0),
        "top10_pct":       _safe_float(row.get("Top10_%"), 0.0),
        "expected_finish": _safe_float(row.get("ExpectedFinish")),
        "predicted_rank":  rank,

        "driver_elo":      _safe_float(row.get("DriverELO")),
        "champ_points":    _safe_float(row.get("ChampPoints"), 0.0),
        "model_version":   "APEX_V7",
    }


def _quali_row(gp_name: str, rank: int, row: pd.Series) -> dict:
    return {
        "gp_name":        gp_name,
        "country":        GP_COUNTRY.get(gp_name),
        "round":          _gp_round(gp_name),

        "driver_abbr":    _safe_str(row.get("Abbreviation")),
        "driver_name":    _safe_str(row.get("FullName", row.get("Abbreviation"))),
        "driver_number":  _safe_str(row.get("DriverNumber")),
        "team_name":      _safe_str(row.get("TeamName")),

        "expected_grid":  _safe_float(row.get("ExpectedGrid")),
        "pole_pct":       _safe_float(row.get("Pole_%"), 0.0),
        "q3_pct":         _safe_float(row.get("Q3_%"), 0.0),
        "predicted_grid": rank,

        "model_version":  "APEX_V7",
    }


def upload_race_predictions(
    supabase: Client,
    gp_name: str,
    race_pred_df: pd.DataFrame,
) -> int:
    if race_pred_df is None or race_pred_df.empty:
        print(f"  ⚠  [{gp_name}] no race predictions to upload")
        return 0

    # DataFrame rows are already sorted by ExpectedFinish ascending
    # (that's how predict_race() returns them), so rank = i+1.
    rows = [
        _race_row(gp_name, i + 1, row)
        for i, (_, row) in enumerate(race_pred_df.iterrows())
        if row.get("Abbreviation")
    ]
    if not rows:
        return 0

    (supabase.table("race_predictions")
        .upsert(rows, on_conflict="gp_name,driver_abbr")
        .execute())

    print(f"  ✓  [{gp_name}] {len(rows)} race rows upserted")
    return len(rows)


def upload_quali_predictions(
    supabase: Client,
    gp_name: str,
    quali_pred_df: pd.DataFrame,
) -> int:
    if quali_pred_df is None or quali_pred_df.empty:
        print(f"  ⚠  [{gp_name}] no quali predictions to upload")
        return 0

    rows = [
        _quali_row(gp_name, i + 1, row)
        for i, (_, row) in enumerate(quali_pred_df.iterrows())
        if row.get("Abbreviation")
    ]
    if not rows:
        return 0

    (supabase.table("quali_predictions")
        .upsert(rows, on_conflict="gp_name,driver_abbr")
        .execute())

    print(f"  ✓  [{gp_name}] {len(rows)} quali rows upserted")
    return len(rows)


# ─────────────────────────────────────────────────────────────────────
#  MAIN ENTRY POINT  — called from run_pipeline.py
# ─────────────────────────────────────────────────────────────────────
def upload_predictions(
    gp_name: str,
    race_pred_df: pd.DataFrame,
    quali_pred_df: pd.DataFrame,
    circuit_params: Optional[dict] = None,   # kept for backward compat
) -> dict:
    print(f"\n  📤  Uploading to Supabase: {gp_name}")
    supabase = get_client()

    n_race  = upload_race_predictions(supabase,  gp_name, race_pred_df)
    n_quali = upload_quali_predictions(supabase, gp_name, quali_pred_df)

    print(f"  ✅  Supabase upload complete for {gp_name} "
          f"(race={n_race}, quali={n_quali})\n")
    return {"race_rows": n_race, "quali_rows": n_quali}
