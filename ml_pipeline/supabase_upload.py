"""
═══════════════════════════════════════════════════════════════════════
  F1 2026 Predictor — Supabase Upload Module
  ─────────────────────────────────────────────────────────────────
  Handles uploading predictions AND actual results to Supabase.
  
  Used by:
    - run_pipeline.py  (offline compute job)
    - fetch_actuals.py (post-race result sync)
  
  Environment variables required:
    SUPABASE_URL         — your project URL
    SUPABASE_SERVICE_KEY — service role key (write access)
═══════════════════════════════════════════════════════════════════════
"""

import os
import sys
import warnings
from datetime import datetime, timezone

import fastf1
import pandas as pd

warnings.filterwarnings("ignore")

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: supabase-py not installed. Run: pip install supabase")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────
#  CLIENT
# ─────────────────────────────────────────────────────────────────────
def get_client() -> "Client":
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise EnvironmentError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set as environment variables."
        )
    return create_client(url, key)


# ─────────────────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────────────────
def _safe_float(val, default=0.0):
    try:
        v = float(val)
        return v if v == v else default   # NaN check
    except (TypeError, ValueError):
        return default


def _safe_int(val, default=0):
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _now():
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────────────────────────────────
#  UPSERT GP ROW  →  returns gp_id
# ─────────────────────────────────────────────────────────────────────
def upsert_grand_prix(supabase, gp_name: str, circuit_params: dict) -> int:
    row = {
        "name":             gp_name,
        "season":           2026,
        "circuit_laps":     _safe_int(circuit_params.get("laps", 55)),
        "overtake_index":   _safe_float(circuit_params.get("overtake_idx", 0.08)),
        "sc_probability":   _safe_float(circuit_params.get("sc_factor", 1.0)),
        "last_computed":    _now(),
    }
    res = (supabase.table("grand_prix")
           .upsert(row, on_conflict="name")
           .execute())
    gp_id = res.data[0]["id"]
    print(f"  ✓  grand_prix '{gp_name}' → id={gp_id}")
    return gp_id


# ─────────────────────────────────────────────────────────────────────
#  UPLOAD RACE PREDICTIONS
# ─────────────────────────────────────────────────────────────────────
def upload_race_predictions(supabase, gp_id: int, race_pred_df: pd.DataFrame):
    if race_pred_df is None or race_pred_df.empty:
        print("  ⚠  No race predictions to upload")
        return

    # Clear previous predictions for this GP
    supabase.table("race_predictions").delete().eq("gp_id", gp_id).execute()

    rows = []
    for _, row in race_pred_df.iterrows():
        rows.append({
            "gp_id":          gp_id,
            "abbreviation":   str(row.get("Abbreviation", "")),
            "full_name":      str(row.get("FullName", row.get("Abbreviation", ""))),
            "team_name":      str(row.get("TeamName", "")),
            "driver_number":  str(row.get("DriverNumber", "")),
            "grid_position":  _safe_int(row.get("GridPosition", 20)),
            "win_pct":        _safe_float(row.get("Win_%")),
            "podium_pct":     _safe_float(row.get("Podium_%")),
            "top5_pct":       _safe_float(row.get("Top5_%")),
            "top10_pct":      _safe_float(row.get("Top10_%")),
            "top15_pct":      _safe_float(row.get("Top15_%")),
            "avg_finish_pos": _safe_float(row.get("AvgFinishPos")),
            "clean_avg_pos":  _safe_float(row.get("CleanRaceAvgPos")),
            "dnf_pct":        _safe_float(row.get("DNF_%")),
            "zone_p1_5":      _safe_float(row.get("Zone_P1_5_%")),
            "zone_p6_10":     _safe_float(row.get("Zone_P6_10_%")),
            "zone_p11_15":    _safe_float(row.get("Zone_P11_15_%")),
            "zone_p16p":      _safe_float(row.get("Zone_P16p_%")),
            "p1_pct":         _safe_float(row.get("P1_%")),
            "p2_pct":         _safe_float(row.get("P2_%")),
            "p3_pct":         _safe_float(row.get("P3_%")),
            "computed_at":    _now(),
        })

    supabase.table("race_predictions").insert(rows).execute()
    print(f"  ✓  {len(rows)} race prediction rows uploaded")


# ─────────────────────────────────────────────────────────────────────
#  UPLOAD QUALIFYING PREDICTIONS
# ─────────────────────────────────────────────────────────────────────
def upload_quali_predictions(supabase, gp_id: int, quali_pred_df: pd.DataFrame):
    if quali_pred_df is None or quali_pred_df.empty:
        print("  ⚠  No quali predictions to upload")
        return

    supabase.table("quali_predictions").delete().eq("gp_id", gp_id).execute()

    rows = []
    for _, row in quali_pred_df.iterrows():
        rows.append({
            "gp_id":         gp_id,
            "abbreviation":  str(row.get("Abbreviation", "")),
            "team_name":     str(row.get("TeamName", "")),
            "expected_grid": _safe_float(row.get("ExpectedGrid")),
            "pole_pct":      _safe_float(row.get("Pole_%")),
            "front3_pct":    _safe_float(row.get("Front3_%")),
            "q3_pct":        _safe_float(row.get("Q3_%")),
            "quali_gap_s":   _safe_float(row.get("QualiGap_s")),
            "computed_at":   _now(),
        })

    supabase.table("quali_predictions").insert(rows).execute()
    print(f"  ✓  {len(rows)} quali prediction rows uploaded")


# ─────────────────────────────────────────────────────────────────────
#  FETCH + UPLOAD ACTUAL RESULTS  (called post-race / post-quali)
# ─────────────────────────────────────────────────────────────────────
def fetch_and_upload_actuals(gp_name: str, session_type: str = "both"):
    """
    Pulls actual race/qualifying results from FastF1 for a completed session
    and writes them to Supabase `actual_results` table.

    session_type: "race" | "quali" | "both"

    Call this after each session completes — typically:
      - Saturday evening after qualifying
      - Sunday evening after the race
    """
    supabase = get_client()

    # Get the GP id
    res = supabase.table("grand_prix").select("id").eq("name", gp_name).execute()
    if not res.data:
        print(f"  ⚠  '{gp_name}' not found in grand_prix table. Run predictor first.")
        return
    gp_id = res.data[0]["id"]

    CACHE_DIR = "./f1_cache"
    os.makedirs(CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE_DIR)

    sessions_to_fetch = []
    if session_type in ("race", "both"):
        sessions_to_fetch.append(("R", "race"))
    if session_type in ("quali", "both"):
        sessions_to_fetch.append(("Q", "quali"))

    for ff1_key, label in sessions_to_fetch:
        try:
            s = fastf1.get_session(2026, gp_name, ff1_key)
            s.load(telemetry=False, weather=False, messages=False)
            results = s.results
            if results is None or results.empty:
                print(f"  ⚠  No {label} results found for {gp_name}")
                continue

            # Clear old actuals for this GP+session
            (supabase.table("actual_results")
             .delete()
             .eq("gp_id", gp_id)
             .eq("session", label)
             .execute())

            rows = []
            for _, row in results.iterrows():
                abbr = str(row.get("Abbreviation", ""))
                pos  = row.get("Position")
                try:
                    pos = int(pos)
                except (TypeError, ValueError):
                    pos = None

                if not abbr:
                    continue

                status = str(row.get("Status", "")).upper()
                dnf = any(k in status for k in
                          ["DNF", "RETIRED", "ACCIDENT", "MECHANICAL", "COLLISION"])

                rows.append({
                    "gp_id":       gp_id,
                    "session":     label,
                    "abbreviation": abbr,
                    "position":    pos,
                    "is_dnf":      dnf,
                    "status":      str(row.get("Status", "")),
                    "recorded_at": _now(),
                })

            if rows:
                supabase.table("actual_results").insert(rows).execute()
                print(f"  ✓  {len(rows)} actual {label} results uploaded for {gp_name}")

            # Mark the GP row as having actual results
            flag_col = "has_actual_race" if label == "race" else "has_actual_quali"
            (supabase.table("grand_prix")
             .update({flag_col: True})
             .eq("id", gp_id)
             .execute())

        except Exception as e:
            print(f"  ⚠  Could not fetch {label} results for {gp_name}: {e}")


# ─────────────────────────────────────────────────────────────────────
#  MAIN ENTRY — upload predictions  (called from run_pipeline.py)
# ─────────────────────────────────────────────────────────────────────
def upload_predictions(
    gp_name: str,
    race_pred_df: pd.DataFrame,
    quali_pred_df: pd.DataFrame,
    circuit_params: dict,
):
    """
    Main function called at the end of run_prediction() in f1_2026_predictor.py
    """
    print(f"\n  📤  Uploading predictions to Supabase: {gp_name}")
    supabase = get_client()

    gp_id = upsert_grand_prix(supabase, gp_name, circuit_params)
    upload_race_predictions(supabase, gp_id, race_pred_df)
    upload_quali_predictions(supabase, gp_id, quali_pred_df)

    print(f"  ✅  Supabase upload complete for {gp_name}\n")
    return gp_id