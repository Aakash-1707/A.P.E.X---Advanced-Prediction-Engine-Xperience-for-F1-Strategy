"""
═══════════════════════════════════════════════════════════════════════
  F1 2026 ML Race + Qualifying Predictor (APEX V7 - Hard Constraints)
  ─────────────────────────────────────────────────────────────────
  Predict ANY 2026 Grand Prix using FastF1 and XGBoost.
  Features Strict 2026 Hierarchy Overrides and a Hard Constraints Matrix
  to banish impossible anomalies (e.g., Aston Martin in the Top 10).

  Usage:
      python f1_2026_predictor.py --gp "Japanese Grand Prix"
      python f1_2026_predictor.py --list
═══════════════════════════════════════════════════════════════════════
"""

import os
import sys
import argparse
import warnings
import numpy as np
import pandas as pd
import fastf1
from collections import defaultdict

warnings.filterwarnings("ignore")

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("WARNING: xgboost not installed. Run: pip install xgboost")

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.calibration import CalibratedClassifierCV
    from sklearn.model_selection import cross_val_score
    HAS_SKL = True
except ImportError:
    HAS_SKL = False
    print("WARNING: scikit-learn not installed. Run: pip install scikit-learn")

# ─────────────────────────────────────────────────────────────────────
#  CIRCUIT DATABASE & REGISTRY
# ─────────────────────────────────────────────────────────────────────
CIRCUIT_DB = {
    "Monaco Grand Prix": {"laps": 78, "overtake_idx": 0.01, "lap_time_range": (72, 82), "typical_race_pace_offset": 1.2},
    "Singapore Grand Prix": {"laps": 62, "overtake_idx": 0.03, "lap_time_range": (98, 115), "typical_race_pace_offset": 1.5},
    "Las Vegas Grand Prix": {"laps": 50, "overtake_idx": 0.10, "lap_time_range": (90, 100), "typical_race_pace_offset": 1.3},
    "Miami Grand Prix": {"laps": 57, "overtake_idx": 0.08, "lap_time_range": (88, 98), "typical_race_pace_offset": 1.4},
    "Azerbaijan Grand Prix": {"laps": 51, "overtake_idx": 0.12, "lap_time_range": (102, 115), "typical_race_pace_offset": 1.3},
    "Saudi Arabian Grand Prix": {"laps": 50, "overtake_idx": 0.06, "lap_time_range": (88, 96), "typical_race_pace_offset": 1.2},
    "Japanese Grand Prix": {"laps": 53, "overtake_idx": 0.05, "lap_time_range": (88, 98), "typical_race_pace_offset": 1.5},
    "Hungarian Grand Prix": {"laps": 70, "overtake_idx": 0.04, "lap_time_range": (75, 84), "typical_race_pace_offset": 1.4},
    "Spanish Grand Prix": {"laps": 66, "overtake_idx": 0.06, "lap_time_range": (76, 84), "typical_race_pace_offset": 1.4},
    "British Grand Prix": {"laps": 52, "overtake_idx": 0.09, "lap_time_range": (85, 95), "typical_race_pace_offset": 1.5},
    "Austrian Grand Prix": {"laps": 71, "overtake_idx": 0.10, "lap_time_range": (62, 70), "typical_race_pace_offset": 1.3},
    "Dutch Grand Prix": {"laps": 72, "overtake_idx": 0.04, "lap_time_range": (70, 78), "typical_race_pace_offset": 1.3},
    "Italian Grand Prix": {"laps": 53, "overtake_idx": 0.13, "lap_time_range": (80, 88), "typical_race_pace_offset": 1.3},
    "United States Grand Prix": {"laps": 56, "overtake_idx": 0.10, "lap_time_range": (94, 104), "typical_race_pace_offset": 1.4},
    "Mexican Grand Prix": {"laps": 71, "overtake_idx": 0.09, "lap_time_range": (76, 84), "typical_race_pace_offset": 1.4},
    "Brazilian Grand Prix": {"laps": 71, "overtake_idx": 0.11, "lap_time_range": (70, 78), "typical_race_pace_offset": 1.5},
    "Abu Dhabi Grand Prix": {"laps": 58, "overtake_idx": 0.08, "lap_time_range": (83, 92), "typical_race_pace_offset": 1.4},
    "Belgian Grand Prix": {"laps": 44, "overtake_idx": 0.14, "lap_time_range": (104, 118), "typical_race_pace_offset": 1.6},
    "Canadian Grand Prix": {"laps": 70, "overtake_idx": 0.12, "lap_time_range": (70, 80), "typical_race_pace_offset": 1.4},
    "Chinese Grand Prix": {"laps": 56, "overtake_idx": 0.10, "lap_time_range": (91, 101), "typical_race_pace_offset": 1.4},
    "Bahrain Grand Prix": {"laps": 57, "overtake_idx": 0.11, "lap_time_range": (89, 99), "typical_race_pace_offset": 1.5},
    "Emilia Romagna Grand Prix": {"laps": 63, "overtake_idx": 0.07, "lap_time_range": (74, 84), "typical_race_pace_offset": 1.4},
    "Australian Grand Prix": {"laps": 58, "overtake_idx": 0.08, "lap_time_range": (78, 86), "typical_race_pace_offset": 1.4},
    "Qatar Grand Prix": {"laps": 57, "overtake_idx": 0.07, "lap_time_range": (80, 90), "typical_race_pace_offset": 1.4},
}
DEFAULT_CIRCUIT = {"laps": 55, "overtake_idx": 0.08, "lap_time_range": (85, 100), "typical_race_pace_offset": 1.5}

ALL_2026_GPS_ORDERED = [
    "Australian Grand Prix", "Chinese Grand Prix", "Japanese Grand Prix",
    "Bahrain Grand Prix", "Saudi Arabian Grand Prix", "Miami Grand Prix",
    "Emilia Romagna Grand Prix", "Monaco Grand Prix", "Spanish Grand Prix",
    "Canadian Grand Prix", "Austrian Grand Prix", "British Grand Prix",
    "Belgian Grand Prix", "Hungarian Grand Prix", "Dutch Grand Prix",
    "Italian Grand Prix", "Azerbaijan Grand Prix", "Singapore Grand Prix",
    "United States Grand Prix", "Mexican Grand Prix", "Brazilian Grand Prix",
    "Las Vegas Grand Prix", "Qatar Grand Prix", "Abu Dhabi Grand Prix",
]
# Alias used by run_pipeline.py / api.py
ALL_2026_GPS = ALL_2026_GPS_ORDERED

DRIVER_2026 = {
    "ANT": ("12",  "Mercedes",        "Kimi Antonelli",    True),
    "RUS": ("63",  "Mercedes",        "George Russell",    False),
    "HAM": ("44",  "Ferrari",         "Lewis Hamilton",    False),
    "LEC": ("16",  "Ferrari",         "Charles Leclerc",   False),
    "NOR": ("1",   "McLaren",         "Lando Norris",      False),
    "PIA": ("81",  "McLaren",         "Oscar Piastri",     False),
    "VER": ("3",   "Red Bull Racing", "Max Verstappen",    False),
    "HAD": ("6",   "Red Bull Racing", "Isack Hadjar",      True),
    "LAW": ("30",  "Racing Bulls",    "Liam Lawson",       False),
    "LIN": ("43",  "Racing Bulls",    "Arvid Lindblad",    True),
    "GAS": ("10",  "Alpine",          "Pierre Gasly",      False),
    "COL": ("43",  "Alpine",          "Franco Colapinto",  False),
    "OCO": ("31",  "Haas F1 Team",    "Esteban Ocon",      False),
    "BEA": ("87",  "Haas F1 Team",    "Oliver Bearman",    False),
    "HUL": ("27",  "Audi",            "Nico Hulkenberg",   False),
    "BOR": ("5",   "Audi",            "Gabriel Bortoleto", False),
    "SAI": ("55",  "Williams",        "Carlos Sainz",      False),
    "ALB": ("23",  "Williams",        "Alexander Albon",   False),
    "ALO": ("14",  "Aston Martin",    "Fernando Alonso",   False),
    "STR": ("18",  "Aston Martin",    "Lance Stroll",      False),
    "BOT": ("77",  "Cadillac",        "Valtteri Bottas",   False),
    "PER": ("11",  "Cadillac",        "Sergio Perez",      False),
}
HISTORICAL_NUMBER_TO_2026_ABBR = {"4": "NOR", "1": "VER", "33": "VER", "22": "TSU", "40": "LAW", "7": "DOO", "2": "SAR", "20": "MAG", "47": "MSC", "24": "ZHO", "3": "RIC"}
RETIRED_OR_DEPARTED_2026 = {"TSU", "DOO", "RIC", "ZHO", "MAG", "MSC", "SAR"}
TEAM_NAME_NORMALISE = {"Alfa Romeo": "Audi", "Alfa Romeo Racing": "Audi", "Sauber": "Audi", "Stake F1 Team Kick Sauber": "Audi", "Kick Sauber": "Audi", "AlphaTauri": "Racing Bulls", "Scuderia AlphaTauri": "Racing Bulls", "Visa Cash App RB": "Racing Bulls", "RB": "Racing Bulls", "Toro Rosso": "Racing Bulls", "Alpine F1 Team": "Alpine", "Renault": "Alpine", "Aston Martin Aramco": "Aston Martin", "Aston Martin Racing": "Aston Martin", "Racing Point": "Aston Martin", "Force India": "Aston Martin"}

YEARS = [2022, 2023, 2024, 2025]
CACHE_DIR = os.environ.get("F1_CACHE_DIR", "./f1_cache")

# ─────────────────────────────────────────────────────────────────────
#  SMART FEATURE ISOLATION (No Data Leakage)
# ─────────────────────────────────────────────────────────────────────
RACE_FEATURE_COLS = [
    "GridPosition", "quali_gap_s", "fp_best_gap_s", "fp2_deg_rate",
    "driver_elo", "team_pace_rank", "grid_advantage", "compound_soft_delta",
    "dnf_risk", "team_dev_momentum", "driver_momentum", "sc_probability", "overtake_difficulty",
]

QUALI_FEATURE_COLS = [
    "fp_best_gap_s", "driver_elo", "team_pace_rank",
    "compound_soft_delta", "team_dev_momentum", "driver_momentum",
]

def td_s(td):
    if td is None: return None
    try:
        if pd.isnull(td): return None
    except Exception: pass
    return td.total_seconds()

def safe(row, col, default=None):
    if col not in row.index: return default
    v = row[col]
    try:
        if pd.isnull(v): return default
    except Exception: pass
    return v

def banner(t):
    print(f"\n{'═'*62}\n  {t}\n{'═'*62}")

def _norm_event_name(name):
    return "".join(ch.lower() for ch in str(name) if ch.isalnum())

def get_circuit_params(gp_name):
    if gp_name in CIRCUIT_DB: return CIRCUIT_DB[gp_name]
    gp_lower = gp_name.lower()
    for key, val in CIRCUIT_DB.items():
        if any(word in gp_lower for word in key.lower().split() if len(word) > 4):
            print(f"  ℹ  Matched '{gp_name}' → '{key}'")
            return val
    return DEFAULT_CIRCUIT.copy()

def save_csv(df, path):
    df.to_csv(path, index=False)

# ─────────────────────────────────────────────────────────────────────
#  STAGE 1 — LOAD HISTORICAL + COMPLETED 2026 DATA
# ─────────────────────────────────────────────────────────────────────
def load_historical(gp_name, prior_gps_2026, progress=None):
    banner(f"Stage 1 — Loading Historical & Completed 2026 Data for {gp_name}")
    race_rows, lap_rows, sc_rows = [], [], []
    circuit_params = get_circuit_params(gp_name)
    lt_min, lt_max = circuit_params["lap_time_range"]

    sessions_to_load = [(y, gp_name) for y in YEARS] + [(2026, gp) for gp in prior_gps_2026]
    total = len(sessions_to_load)

    for idx, (year, target_gp) in enumerate(sessions_to_load):
        print(f"  ── {year} {target_gp}")
        if progress:
            progress(f"Loading {year} {target_gp}", 10 + int(40 * idx / max(total, 1)))
        try:
            schedule = fastf1.get_event_schedule(year, include_testing=False)
            target_norm = _norm_event_name(target_gp)
            event_names = schedule["EventName"].astype(str)
            matches = event_names[event_names.map(_norm_event_name) == target_norm]
            event_name = str(matches.iloc[0]) if not matches.empty else None
        except: event_name = None

        if event_name is None:
            continue

        try:
            s = fastf1.get_session(year, event_name, "R")
            s.load(telemetry=False, weather=True, messages=True)
            laps, results, rcm = s.laps, s.results, s.race_control_messages

            sc_count = vsc_count = red_count = 0
            if not rcm.empty and "Message" in rcm.columns:
                msgs = rcm["Message"].astype(str).str.upper()
                sc_count  = 1 if msgs.str.contains("SAFETY CAR DEPLOYED", regex=False).any() else 0
                vsc_count = 1 if msgs.str.contains("VIRTUAL SAFETY CAR DEPLOYED", regex=False).any() else 0
                red_count = 1 if msgs.str.contains("RED FLAG", regex=False).any() else 0
            sc_rows.append({"Year": year, "Event": target_gp, "SC": sc_count, "VSC": vsc_count, "RedFlag": red_count})

            for _, row in results.iterrows():
                drv = str(safe(row, "DriverNumber", ""))
                grid_pos = safe(row, "GridPosition")
                finish   = safe(row, "Position")
                status   = str(safe(row, "Status", "")).upper()
                dnf = any(k in status for k in ["DNF","RETIRED","ACCIDENT","MECHANICAL","COLLISION"])
                try: grid_pos = int(grid_pos)
                except: grid_pos = None
                try: finish = int(finish)
                except: finish = None
                drv_laps = laps.pick_drivers(drv) if not laps.empty else pd.DataFrame()
                best_lt  = td_s(drv_laps["LapTime"].min()) if not drv_laps.empty and "LapTime" in drv_laps.columns else None
                race_rows.append({
                    "Year": year, "Event": target_gp, "DriverNumber": drv,
                    "Abbreviation": safe(row, "Abbreviation", drv),
                    "TeamName":     safe(row, "TeamName", ""),
                    "GridPosition": grid_pos, "FinishPosition": finish,
                    "Points":    safe(row, "Points", 0), "Status": safe(row, "Status", ""),
                    "DNF":       dnf, "Win": (finish == 1), "Podium": (finish is not None and finish <= 3),
                    "Top10":     (finish is not None and finish <= 10), "BestRaceLap_s": best_lt,
                    "SC_deployed":  bool(sc_count), "VSC_deployed": bool(vsc_count),
                })

            for _, lap in laps.iterrows():
                lt = td_s(safe(lap, "LapTime"))
                if lt is None or lt > lt_max or lt < lt_min: continue
                lap_rows.append({
                    "Year": year, "Event": target_gp, "Session": "Race",
                    "DriverNumber": str(safe(lap, "DriverNumber", "")),
                    "LapNumber": safe(lap, "LapNumber"), "LapTime_s": lt,
                    "Compound": safe(lap, "Compound"), "TyreLife": safe(lap, "TyreLife"),
                    "IsOutLap": pd.notna(safe(lap, "PitOutTime")), "IsInLap": pd.notna(safe(lap, "PitInTime")),
                })
        except Exception as e:
            sc_rows.append({"Year": year, "Event": target_gp, "SC": 0, "VSC": 0, "RedFlag": 0})

        for sess_key in ["FP1", "FP2", "FP3"]:
            try:
                sp = fastf1.get_session(year, event_name, sess_key)
                sp.load(telemetry=False, weather=False, messages=False)
                for _, lap in sp.laps.iterrows():
                    lt = td_s(safe(lap, "LapTime"))
                    if lt is None or lt > lt_max or lt < lt_min: continue
                    lap_rows.append({
                        "Year": year, "Event": target_gp, "Session": sess_key,
                        "DriverNumber": str(safe(lap, "DriverNumber", "")),
                        "LapNumber": safe(lap, "LapNumber"), "LapTime_s": lt,
                        "Compound": safe(lap, "Compound"), "TyreLife": safe(lap, "TyreLife"),
                        "IsOutLap": pd.notna(safe(lap, "PitOutTime")), "IsInLap": pd.notna(safe(lap, "PitInTime")),
                    })
            except Exception as e: pass

        try:
            sq = fastf1.get_session(year, event_name, "Q")
            sq.load(telemetry=False, weather=False, messages=False)
            for _, lap in sq.laps.iterrows():
                lt = td_s(safe(lap, "LapTime"))
                if lt is None or lt > lt_max * 0.97 or lt < lt_min * 0.95: continue
                lap_rows.append({
                    "Year": year, "Event": target_gp, "Session": "Q",
                    "DriverNumber": str(safe(lap, "DriverNumber", "")),
                    "LapNumber": safe(lap, "LapNumber"), "LapTime_s": lt,
                    "Compound": safe(lap, "Compound"), "TyreLife": safe(lap, "TyreLife"),
                    "IsOutLap": False, "IsInLap": False,
                })
        except Exception as e: pass

    race_df = pd.DataFrame(race_rows)
    lap_df  = pd.DataFrame(lap_rows)
    sc_df   = pd.DataFrame(sc_rows)

    if not race_df.empty and "TeamName" in race_df.columns:
        race_df["TeamName"] = race_df["TeamName"].map(lambda t: TEAM_NAME_NORMALISE.get(t, t))

    return race_df, lap_df, sc_df


# ─────────────────────────────────────────────────────────────────────
#  STAGE 2 — FEATURE ENGINEERING
# ─────────────────────────────────────────────────────────────────────
def build_features(race_df, lap_df, sc_df, circuit_params):
    banner("Stage 2 — Feature engineering (Training Pool)")

    n_years  = len(sc_df)
    sc_prob  = float(sc_df["SC"].mean())  if n_years > 0 else 0.5
    vsc_prob = float(sc_df["VSC"].mean()) if n_years > 0 else 0.25

    if race_df.empty: return pd.DataFrame(), sc_prob, vsc_prob

    grid_win_prob = {}
    for gp in range(1, 21):
        subset = race_df[race_df["GridPosition"] == gp]
        grid_win_prob[gp] = float(subset["Win"].mean()) if len(subset) > 0 else 0.0

    q_laps = lap_df[lap_df["Session"] == "Q"].copy()
    q_best = (q_laps[~q_laps["IsOutLap"]]
              .groupby(["Year", "Event", "DriverNumber"])["LapTime_s"]
              .min().reset_index(name="q_best"))
    q_pole = q_best.groupby(["Year", "Event"])["q_best"].min().reset_index(name="q_pole")
    q_best = q_best.merge(q_pole, on=["Year", "Event"])
    q_best["quali_gap_s"] = (q_best["q_best"] - q_best["q_pole"]).clip(0, 5.0)

    fp_laps = lap_df[lap_df["Session"].isin(["FP1", "FP2", "FP3"])].copy()
    fp_best = (fp_laps[~fp_laps["IsOutLap"] & ~fp_laps["IsInLap"]]
               .groupby(["Year", "Event", "DriverNumber"])["LapTime_s"]
               .min().reset_index(name="fp_best"))
    fp_ref  = fp_best.groupby(["Year", "Event"])["fp_best"].min().reset_index(name="fp_ref")
    fp_best = fp_best.merge(fp_ref, on=["Year", "Event"])
    fp_best["fp_best_gap_s"] = (fp_best["fp_best"] - fp_best["fp_ref"]).clip(0, 5.0)

    def deg_rate(drv_laps):
        results = []
        for compound in drv_laps["Compound"].dropna().unique():
            cl = drv_laps[drv_laps["Compound"] == compound].sort_values("TyreLife")
            if len(cl) < 5: continue
            x, y = cl["TyreLife"].values.astype(float), cl["LapTime_s"].values
            if np.std(x) < 0.1: continue
            slope = np.polyfit(x, y, 1)[0]
            if -0.2 < slope < 0.5: results.append(slope)
        return float(np.mean(results)) if results else 0.07

    fp2_clean = lap_df[(lap_df["Session"] == "FP2") & ~lap_df["IsOutLap"] & ~lap_df["IsInLap"]]
    deg_rows = []
    for (year, event, drv), grp in fp2_clean.groupby(["Year", "Event", "DriverNumber"]):
        deg_rows.append({"Year": year, "Event": event, "DriverNumber": drv, "fp2_deg_rate": deg_rate(grp)})
    deg_df = pd.DataFrame(deg_rows, columns=["Year", "Event", "DriverNumber", "fp2_deg_rate"])

    fp2_laps = lap_df[(lap_df["Session"] == "FP2") & ~lap_df["IsOutLap"] & ~lap_df["IsInLap"] & (lap_df["TyreLife"] >= 5)].copy()
    if not fp2_laps.empty:
        fp2_team_pace = (fp2_laps
                         .merge(race_df[["Year", "Event", "DriverNumber", "TeamName"]].drop_duplicates(),
                                on=["Year", "Event", "DriverNumber"], how="left")
                         .groupby(["Year", "Event", "TeamName"])["LapTime_s"]
                         .median().reset_index(name="fp2_team_pace"))
        fp2_team_pace["team_pace_rank"] = fp2_team_pace.groupby(["Year", "Event"])["fp2_team_pace"].rank()
    else:
        tp = race_df.groupby(["Year", "Event", "TeamName"])["BestRaceLap_s"].mean().reset_index()
        tp["team_pace_rank"] = tp.groupby(["Year", "Event"])["BestRaceLap_s"].rank()
        fp2_team_pace = tp.rename(columns={"BestRaceLap_s": "fp2_team_pace"})

    elo_rows = []
    for drv in race_df["DriverNumber"].unique():
        drv_hist = race_df[race_df["DriverNumber"] == drv].sort_values(["Year", "Event"])
        elo = 5.0
        for _, row in drv_hist.iterrows():
            fp = safe(row, "FinishPosition")
            if fp: elo = 0.7 * elo + 0.3 * (21 - int(fp))
            elo_rows.append({"Year": row["Year"], "Event": row["Event"], "DriverNumber": drv, "driver_elo": elo})
    elo_df = pd.DataFrame(elo_rows)

    team_avg_pos = (race_df.dropna(subset=["FinishPosition"])
                    .groupby(["Year", "Event", "TeamName"])["FinishPosition"]
                    .mean().reset_index(name="team_avg_pos"))

    team_dev_rows = []
    for team in team_avg_pos["TeamName"].unique():
        tdata = team_avg_pos[team_avg_pos["TeamName"] == team].sort_values(["Year", "Event"])
        slope = float(np.polyfit(np.arange(len(tdata)), tdata["team_avg_pos"].values.astype(float), 1)[0]) if len(tdata) >= 2 else 0.0
        team_dev_rows.append({"TeamName": team, "team_dev_slope": round(slope,4), "team_dev_momentum": round(-slope,4)})
    team_dev_df = pd.DataFrame(team_dev_rows)

    driver_momentum_rows = []
    for drv in elo_df["DriverNumber"].unique():
        drv_elo = elo_df[elo_df["DriverNumber"] == drv].sort_values(["Year", "Event"])
        if len(drv_elo) >= 3: momentum = drv_elo.iloc[-1]["driver_elo"] - drv_elo.iloc[-3]["driver_elo"]
        elif len(drv_elo) == 2: momentum = drv_elo.iloc[-1]["driver_elo"] - drv_elo.iloc[0]["driver_elo"]
        else: momentum = 0.0
        driver_momentum_rows.append({"DriverNumber": drv, "driver_momentum": round(float(momentum),4)})
    driver_momentum_df = pd.DataFrame(driver_momentum_rows)

    dnf_risk = (race_df.groupby("DriverNumber").agg(dnf_count=("DNF","sum"), races=("DNF","count")).reset_index())
    dnf_risk["dnf_risk"] = (dnf_risk["dnf_count"] / dnf_risk["races"]).clip(0, 0.20)

    grid_adv_df = pd.DataFrame([{"GridPosition": gp, "grid_advantage": prob} for gp, prob in grid_win_prob.items()])

    feat = race_df[["Year", "Event", "DriverNumber", "Abbreviation", "TeamName",
                    "GridPosition", "FinishPosition", "DNF", "Win", "Podium", "Top10",
                    "Points", "BestRaceLap_s", "SC_deployed", "VSC_deployed"]].copy()

    feat = feat.merge(q_best[["Year", "Event", "DriverNumber", "quali_gap_s"]], on=["Year", "Event", "DriverNumber"], how="left")
    feat = feat.merge(fp_best[["Year", "Event", "DriverNumber", "fp_best_gap_s"]], on=["Year", "Event", "DriverNumber"], how="left")
    feat = feat.merge(deg_df, on=["Year", "Event", "DriverNumber"], how="left")
    feat = feat.merge(elo_df, on=["Year", "Event", "DriverNumber"], how="left")
    feat = feat.merge(dnf_risk[["DriverNumber", "dnf_risk"]], on="DriverNumber", how="left")
    feat = feat.merge(fp2_team_pace[["Year", "Event", "TeamName", "team_pace_rank"]], on=["Year", "Event", "TeamName"], how="left")
    feat = feat.merge(grid_adv_df, on="GridPosition", how="left")
    feat = feat.merge(team_dev_df[["TeamName", "team_dev_slope", "team_dev_momentum"]], on="TeamName", how="left")
    feat = feat.merge(driver_momentum_df, on="DriverNumber", how="left")

    feat["compound_soft_delta"] = -0.3
    feat["sc_probability"]      = sc_prob
    feat["vsc_probability"]     = vsc_prob
    feat["overtake_difficulty"] = circuit_params["overtake_idx"]
    feat["grid_advantage"]      = feat["grid_advantage"].fillna(0.0)
    feat["driver_elo"]          = feat["driver_elo"].fillna(5.0)
    feat["fp2_deg_rate"]        = feat["fp2_deg_rate"].fillna(0.07)
    feat["dnf_risk"]            = feat["dnf_risk"].fillna(0.05)
    feat["quali_gap_s"]         = feat["quali_gap_s"].fillna(1.5)
    feat["fp_best_gap_s"]       = feat["fp_best_gap_s"].fillna(1.5)
    feat["team_pace_rank"]      = feat["team_pace_rank"].fillna(10.0)
    feat["team_dev_slope"]      = feat["team_dev_slope"].fillna(0.0)
    feat["team_dev_momentum"]   = feat["team_dev_momentum"].fillna(0.0)
    feat["driver_momentum"]     = feat["driver_momentum"].fillna(0.0)

    print(f"  ✓ Appended {len(feat[feat['Year'] == 2026])} real 2026 rows to training set.")
    return feat, sc_prob, vsc_prob


# ─────────────────────────────────────────────────────────────────────
#  STAGE 3 — TRAIN XGBoost CLASSIFIERS
# ─────────────────────────────────────────────────────────────────────
def _make_xgb(scale_pos_weight=1.0, cv_folds=3):
    if HAS_XGB:
        base = xgb.XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.8,
            colsample_bytree=0.8, min_child_weight=3, scale_pos_weight=scale_pos_weight,
            eval_metric="logloss", use_label_encoder=False, random_state=42, verbosity=0
        )
    else:
        base = GradientBoostingClassifier(n_estimators=200, max_depth=4, learning_rate=0.05, subsample=0.8, min_samples_leaf=3, random_state=42)
    return CalibratedClassifierCV(base, method="isotonic", cv=cv_folds)


def train_models(feat_df):
    banner("Stage 3 — Training XGBoost classifiers on Historical + 2026 Data")

    required_cols = ["Win", "Podium", "GridPosition"]
    missing = [c for c in required_cols if c not in feat_df.columns]
    if missing or feat_df.empty:
        raise RuntimeError(
            "No historical training data available. FastF1 returned zero "
            "driver/session data for every year, so the model cannot be "
            "trained. This usually means FastF1 couldn't reach F1's live-"
            "timing / Ergast servers (network blocked, rate limited, or the "
            "upstream API is down). Check that `livetiming.formula1.com` "
            "and `ergast.com` are reachable from this machine."
        )

    train = feat_df.dropna(subset=required_cols).copy()
    for col in RACE_FEATURE_COLS + QUALI_FEATURE_COLS:
        if col not in train.columns: train[col] = 0.0
        train[col] = train[col].fillna(train[col].median() if train[col].notna().any() else 0.0)

    n_total = len(train)
    n_cv = min(3, max(2, n_total // 20))

    X_race = train[RACE_FEATURE_COLS].values.astype(float)
    n_win, n_podium = int(train["Win"].sum()), int(train["Podium"].sum())
    spw_win = max(1.0, (n_total - n_win) / max(n_win, 1))
    spw_podium = max(1.0, (n_total - n_podium) / max(n_podium, 1))

    win_model    = _make_xgb(spw_win, cv_folds=n_cv)
    podium_model = _make_xgb(spw_podium, cv_folds=n_cv)
    win_model.fit(X_race, train["Win"].astype(int))
    podium_model.fit(X_race, train["Podium"].astype(int))

    train["Pole"]    = (train["GridPosition"] == 1).astype(int)
    train["Q3_slot"] = (train["GridPosition"] <= 10).astype(int)

    X_quali = train[QUALI_FEATURE_COLS].values.astype(float)
    n_pole, n_q3 = int(train["Pole"].sum()), int(train["Q3_slot"].sum())
    spw_pole = max(1.0, (n_total - n_pole) / max(n_pole, 1))
    spw_q3   = max(1.0, (n_total - n_q3)   / max(n_q3, 1))

    pole_model = _make_xgb(spw_pole, cv_folds=n_cv)
    q3_model   = _make_xgb(spw_q3, cv_folds=n_cv)
    pole_model.fit(X_quali, train["Pole"].astype(int))
    q3_model.fit(X_quali,   train["Q3_slot"].astype(int))

    print(f"  ✓ Models retrained successfully. Rows: {n_total} (includes 2026 data)")
    return win_model, podium_model, pole_model, q3_model


# ─────────────────────────────────────────────────────────────────────
#  STAGE 4 — FORCED PREDICTION LIVE STATE BUILDING
# ─────────────────────────────────────────────────────────────────────
def build_2026_state(feat_df, sc_prob, vsc_prob, gp_name, circuit_params):
    banner(f"Stage 4 — Building Live State for {gp_name} (FORCED PREDICTION)")

    TEAM_POWER_RANKINGS_2026 = {
        "Mercedes": 1.0, "Ferrari": 1.8, "McLaren": 1.9, "Haas F1 Team": 4.0,
        "Alpine": 6.0, "Red Bull Racing": 6.2, "Racing Bulls": 6.5, "Audi": 7.0,
        "Williams": 8.5, "Cadillac": 9.5, "Aston Martin": 10.0
    }

    team_dev_lookup = feat_df.groupby("TeamName")["team_dev_slope"].first().to_dict() if "team_dev_slope" in feat_df.columns else {}

    offset = circuit_params["typical_race_pace_offset"]
    ideal_base_pace = (circuit_params["lap_time_range"][0] + circuit_params["lap_time_range"][1]) / 2 + offset
    driver_state = []

    for abbr in sorted(DRIVER_2026.keys()):
        if abbr in RETIRED_OR_DEPARTED_2026: continue
        reg = DRIVER_2026.get(abbr, {})
        num_2026, team_2026, full_name, is_rookie = reg if isinstance(reg, tuple) else ("?","",abbr,False)

        actual_2026_pace_rank = TEAM_POWER_RANKINGS_2026.get(team_2026, 10.0)
        hierarchy_quali_gap = (actual_2026_pace_rank - 1.0) * 0.18
        base_pace = ideal_base_pace + hierarchy_quali_gap

        driver_state.append({
            "DriverNumber":      num_2026,
            "Abbreviation":      abbr,
            "FullName":          full_name,
            "TeamName":          team_2026,
            "IsRookie":          is_rookie,
            "BasePace_s":        round(base_pace, 3),
            "QualiGap_s":        round(hierarchy_quali_gap, 3),
            "FP_Gap_s":          round(hierarchy_quali_gap, 3),
            "DegRate_s_per_lap": 0.07,
            "DNF_risk":          0.10 if is_rookie else 0.07,
            "DriverELO":         5.0,
            "DriverMomentum":    0.0,
            "TeamDevMomentum":   0.0,
            "TeamDevSlope":      team_dev_lookup.get(team_2026, 0.0),
            "TeamPaceRank":      actual_2026_pace_rank,
            "GridAdvantage":     0.05,
            "SC_prob":           sc_prob,
            "VSC_prob":          vsc_prob,
            "CompoundDelta_s":   -0.3,
            "OvertakeIdx":       circuit_params["overtake_idx"],
            "_RealGrid":         None,
        })

    state_df = pd.DataFrame(driver_state)
    state_df.attrs["has_actual_quali"] = False
    return state_df


def update_state_with_2026_results(state_df, prior_gps):
    if not prior_gps:
        state_df["ChampPoints"], state_df["TeamPoints"] = 0.0, 0.0
        return state_df

    banner(f"Stage 4b — Injecting Live 2026 Championship Standings ({len(prior_gps)} races)")
    abbr_idx = {abbr: i for i, abbr in enumerate(state_df["Abbreviation"].tolist())}
    elo_arr  = state_df["DriverELO"].values.astype(float).copy()

    REG_BASELINE, REG_RETENTION = 8.0, 0.60
    elo_arr = REG_RETENTION * elo_arr + (1.0 - REG_RETENTION) * REG_BASELINE

    driver_points, team_points = defaultdict(float), defaultdict(float)

    for gp in prior_gps:
        try:
            s = fastf1.get_session(2026, gp, "R")
            s.load(telemetry=False, weather=False, messages=False)
            for _, row in s.results.iterrows():
                abbr = safe(row, "Abbreviation", "")
                team = safe(row, "TeamName", "")
                pos, pts = safe(row, "Position"), float(safe(row, "Points", 0.0))
                if abbr: driver_points[abbr] += pts
                if team: team_points[TEAM_NAME_NORMALISE.get(team, team)] += pts
                try: pos = int(pos)
                except: pos = None
                if abbr in abbr_idx and pos is not None and pos < 20:
                    elo_arr[abbr_idx[abbr]] = 0.82 * elo_arr[abbr_idx[abbr]] + 0.18 * (21 - pos)
        except Exception: pass

    state_df = state_df.copy()
    state_df["ChampPoints"] = state_df["Abbreviation"].map(driver_points).fillna(0.0)
    state_df["TeamPoints"]  = state_df["TeamName"].map(team_points).fillna(0.0)

    max_pts = max(1, state_df["ChampPoints"].max())
    max_team_pts = max(1, state_df["TeamPoints"].max())

    state_df["DriverELO"] = elo_arr + ((state_df["ChampPoints"] / max_pts) * 4.0)
    state_df["TeamDevMomentum"] = state_df["TeamDevMomentum"].fillna(0.0) + ((state_df["TeamPoints"] / max_team_pts) * 3.0)

    print(f"  Current WDC Leader: {state_df.loc[state_df['ChampPoints'].idxmax(), 'Abbreviation']} ({state_df['ChampPoints'].max()} pts)")
    return state_df


# ─────────────────────────────────────────────────────────────────────
#  STAGE 5a — QUALIFYING PREDICTION
# ─────────────────────────────────────────────────────────────────────
def predict_qualifying(state_df, pole_model, q3_model):
    banner("Stage 5a — ML Qualifying Prediction w/ Hard Constraints Matrix")

    def build_X_quali(df):
        return np.column_stack([
            df["FP_Gap_s"].fillna(1.5).values,
            df["DriverELO"].fillna(5.0).values,
            df["TeamPaceRank"].fillna(10.0).values,
            df["CompoundDelta_s"].fillna(-0.3).values,
            df["TeamDevMomentum"].fillna(0.0).values,
            df["DriverMomentum"].fillna(0.0).values,
        ]).astype(float)

    X_q = build_X_quali(state_df)
    pole_prob = pole_model.predict_proba(X_q)[:, 1]
    q3_prob   = q3_model.predict_proba(X_q)[:, 1]

    pole_prob_norm = pole_prob / (pole_prob.sum() + 1e-9)
    q3_prob_norm   = q3_prob  / (q3_prob.sum()  + 1e-9)

    # HARD CONSTRAINTS MATRIX: Overriding ML Anomalies
    sort_score = (q3_prob_norm * 1.0) + (pole_prob_norm * 10.0)

    for i, row in state_df.iterrows():
        team = row["TeamName"]
        if team in ["Cadillac", "Aston Martin"]:
            sort_score[i] -= 1000.0
            q3_prob_norm[i] = 0.0
            pole_prob_norm[i] = 0.0
        elif team == "Red Bull Racing":
            sort_score[i] += 0.5
            q3_prob_norm[i] = max(q3_prob_norm[i], 0.85)

    order = np.argsort(-sort_score)
    expected_grid = np.empty(len(state_df))
    for rank, idx in enumerate(order, 1): expected_grid[idx] = rank

    results = []
    for i, row in state_df.iterrows():
        results.append({
            "Abbreviation":  row["Abbreviation"],
            "FullName":      row.get("FullName", row["Abbreviation"]),
            "DriverNumber":  row.get("DriverNumber", ""),
            "TeamName":      row["TeamName"],
            "ExpectedGrid":  round(float(expected_grid[i]), 1),
            "Pole_%":        round(float(pole_prob_norm[i]) * 100, 2),
            "Q3_%":          round(float(q3_prob_norm[i])  * 100, 2),
        })

    quali_df = pd.DataFrame(results).sort_values("ExpectedGrid").reset_index(drop=True)
    quali_df.index += 1
    return quali_df


def apply_predicted_grid(state_df, quali_df):
    seeded = state_df.copy()
    rank_map = {row["Abbreviation"]: i + 1 for i, (_, row) in enumerate(quali_df.sort_values("ExpectedGrid").iterrows())}
    seeded["GridPosition_2026"] = seeded["_RealGrid"].fillna(seeded["Abbreviation"].map(rank_map))
    seeded["GridPosition_2026"] = seeded["GridPosition_2026"].astype(int)
    return seeded


# ─────────────────────────────────────────────────────────────────────
#  STAGE 5b — RACE PREDICTION
# ─────────────────────────────────────────────────────────────────────
def predict_race(state_df, win_model, podium_model, circuit_params):
    banner("Stage 5b — ML Race Prediction w/ Hard Constraints Matrix")

    def build_X_race(df):
        return np.column_stack([
            df["GridPosition_2026"].values,
            df["QualiGap_s"].fillna(1.5).values,
            df["FP_Gap_s"].fillna(1.5).values,
            df["DegRate_s_per_lap"].fillna(0.07).values,
            df["DriverELO"].fillna(5.0).values,
            df["TeamPaceRank"].fillna(10.0).values,
            df["GridAdvantage"].fillna(0.05).values,
            df["CompoundDelta_s"].fillna(-0.3).values,
            df["DNF_risk"].fillna(0.05).values,
            df["TeamDevMomentum"].fillna(0.0).values,
            df["DriverMomentum"].fillna(0.0).values,
            df["SC_prob"].fillna(0.5).values,
            df["OvertakeIdx"].fillna(0.08).values,
        ]).astype(float)

    X_r = build_X_race(state_df)
    win_prob, podium_prob = win_model.predict_proba(X_r)[:, 1], podium_model.predict_proba(X_r)[:, 1]

    win_prob_norm    = np.clip(win_prob / (win_prob.sum() + 1e-9), 0.0, 1.0)
    podium_prob_norm = np.clip(podium_prob / (podium_prob.sum() + 1e-9) * 3.0, 0.0, 1.0)
    top10_prob_norm  = np.clip(podium_prob_norm * (10.0 / 3.0), 0.0, 1.0)

    # HARD CONSTRAINTS MATRIX: Overriding ML Anomalies
    sort_score = (top10_prob_norm * 1.0) + (podium_prob_norm * 10.0) + (win_prob_norm * 100.0)

    for i, row in state_df.iterrows():
        team = row["TeamName"]
        if team in ["Cadillac", "Aston Martin"]:
            sort_score[i] -= 1000.0
            win_prob_norm[i] = 0.0
            podium_prob_norm[i] = 0.0
            top10_prob_norm[i] = 0.0
        elif team == "Red Bull Racing":
            sort_score[i] += 0.5
            top10_prob_norm[i] = max(top10_prob_norm[i], 0.85)

    order = np.argsort(-sort_score)
    avg_finish = np.empty(len(state_df))
    for rank, idx in enumerate(order, 1): avg_finish[idx] = rank

    results = []
    for i, row in state_df.iterrows():
        results.append({
            "Abbreviation":  row["Abbreviation"],
            "FullName":      row.get("FullName", row["Abbreviation"]),
            "DriverNumber":  row.get("DriverNumber", ""),
            "TeamName":      row["TeamName"],
            "GridPosition":  int(row["GridPosition_2026"]),
            "ChampPoints":   row.get("ChampPoints", 0.0),
            "Win_%":         round(float(win_prob_norm[i]) * 100, 2),
            "Podium_%":      round(float(podium_prob_norm[i]) * 100, 2),
            "Top10_%":       round(float(top10_prob_norm[i]) * 100, 2),
            "ExpectedFinish": round(float(avg_finish[i]), 1),
            "DriverELO":     round(row["DriverELO"], 2),
        })

    race_df = pd.DataFrame(results).sort_values("ExpectedFinish").reset_index(drop=True)
    race_df.index += 1
    return race_df


# ─────────────────────────────────────────────────────────────────────
#  STAGE 6 — COMPARE WITH ACTUAL RESULTS (If available for evaluation)
# ─────────────────────────────────────────────────────────────────────
def _spearman(x, y):
    n = len(x)
    if n < 2: return float("nan")
    def rank(arr):
        order = sorted(range(n), key=lambda i: arr[i])
        r = [0] * n
        for rv, idx in enumerate(order, 1): r[idx] = rv
        return r
    rx, ry = rank(list(x)), rank(list(y))
    d2 = sum((a - b) ** 2 for a, b in zip(rx, ry))
    return 1 - (6 * d2) / (n * (n ** 2 - 1))


def compare_race(predictions, gp_name):
    banner("Stage 6 — Race prediction vs actual 2026")

    actual_map = {}
    try:
        s = fastf1.get_session(2026, gp_name, "R")
        s.load(telemetry=False, weather=False, messages=False)
        for _, row in s.results.iterrows():
            abbr = safe(row, "Abbreviation", str(safe(row, "DriverNumber", "")))
            pos  = safe(row, "Position")
            try: pos = int(pos)
            except: pos = None
            if abbr: actual_map[abbr] = pos
        print(f"  ✓  Loaded actual 2026 race: {len(actual_map)} drivers")
    except Exception as e:
        print(f"  ⚠  Actual race not available: {e}")

    comp_rows = []
    for _, row in predictions.iterrows():
        abbr       = row["Abbreviation"]
        actual_pos = actual_map.get(abbr)
        pred_rank  = int(round(row["ExpectedFinish"]))
        err        = abs(pred_rank - actual_pos) if actual_pos is not None else None
        comp_rows.append({
            "Abbreviation":  abbr,
            "TeamName":      row["TeamName"],
            "GridPosition":  row["GridPosition"],
            "Win_%":         row["Win_%"],
            "Podium_%":      row["Podium_%"],
            "PredictedRank": pred_rank,
            "ActualFinish":  actual_pos,
            "RankError":     err,
        })

    comp_df = pd.DataFrame(comp_rows).sort_values("ActualFinish", na_position="last")
    valid   = [c for c in comp_rows if c["ActualFinish"] is not None and c["RankError"] is not None]

    if not valid:
        print("  No actual results to compare against yet.")
        return comp_df

    errors = [c["RankError"] for c in valid]
    mae    = float(np.mean(errors))
    pct_w3 = sum(1 for e in errors if e <= 3) / len(errors) * 100
    spearman = _spearman([c["PredictedRank"] for c in valid],
                          [c["ActualFinish"]  for c in valid])
    comp_df.attrs.update({"race_mae": mae, "race_within3": pct_w3, "race_spearman": spearman})
    return comp_df


def compare_quali(quali_pred, gp_name):
    banner("Stage 6b — Qualifying prediction vs actual 2026")

    actual_map = {}
    try:
        sq = fastf1.get_session(2026, gp_name, "Q")
        sq.load(telemetry=False, weather=False, messages=False)
        for _, row in sq.results.iterrows():
            abbr = safe(row, "Abbreviation", "")
            pos  = safe(row, "Position")
            try: pos = int(pos)
            except: pos = None
            if abbr and pos: actual_map[abbr] = pos
        print(f"  ✓  Loaded actual 2026 qualifying: {len(actual_map)} drivers")
    except Exception as e:
        print(f"  ⚠  Actual qualifying not available: {e}")
        quali_pred.attrs["quali_available"] = False
        return quali_pred

    comp_rows = []
    for _, row in quali_pred.iterrows():
        abbr       = row["Abbreviation"]
        actual_pos = actual_map.get(abbr)
        pred_pos   = int(round(row["ExpectedGrid"]))
        err        = abs(pred_pos - actual_pos) if actual_pos is not None else None
        comp_rows.append({"Abbreviation": abbr, "TeamName": row["TeamName"],
                          "PredictedGrid": pred_pos, "ActualGrid": actual_pos,
                          "GridError": err, "Pole_%": row["Pole_%"], "Q3_%": row["Q3_%"]})

    comp_df = pd.DataFrame(comp_rows).sort_values("ActualGrid", na_position="last")
    valid   = [c for c in comp_rows if c["ActualGrid"] is not None and c["GridError"] is not None]

    if not valid:
        print("  No qualifying results to compare against yet.")
        return comp_df

    errors   = [c["GridError"] for c in valid]
    mae      = float(np.mean(errors))
    pct_w2   = sum(1 for e in errors if e <= 2) / len(errors) * 100
    spearman = _spearman([c["PredictedGrid"] for c in valid],
                          [c["ActualGrid"]    for c in valid])
    pole_hit = any(c["ActualGrid"] == 1 and c["PredictedGrid"] == 1 for c in valid)
    q3_hits  = sum(1 for c in valid if c["ActualGrid"] <= 10 and c["PredictedGrid"] <= 10)

    comp_df.attrs.update({"quali_available": True, "quali_mae": mae,
                           "quali_spearman": spearman, "quali_pole": pole_hit,
                           "quali_q3": f"{q3_hits}/10", "quali_within2": pct_w2})
    return comp_df


# ─────────────────────────────────────────────────────────────────────
#  MAIN PIPELINE
# ─────────────────────────────────────────────────────────────────────
def run_prediction(gp_name, output_dir=None, progress=None, **_ignored_kwargs):
    """
    Run the full APEX V7 prediction for a single GP.

    Args:
        gp_name: Grand Prix name (must match ALL_2026_GPS entries).
        output_dir: if provided, CSVs are written there.
        progress: optional callable(message: str, percent: int) for live updates.
        **_ignored_kwargs: absorbs legacy args like n_sims / mode for
            backward compatibility with run_pipeline.py.

    Returns:
        (race_pred, quali_pred, race_comp, quali_comp) DataFrames.
    """
    if output_dir is not None:
        os.makedirs(output_dir, exist_ok=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE_DIR)

    banner(f"F1 2026 ML Predictor (APEX V7) — {gp_name}")
    if progress: progress("Resolving circuit parameters", 2)
    circuit_params = get_circuit_params(gp_name)

    target_idx = ALL_2026_GPS_ORDERED.index(gp_name) if gp_name in ALL_2026_GPS_ORDERED else 0
    prior_gps_2026 = ALL_2026_GPS_ORDERED[:target_idx]

    if progress: progress("Loading historical + 2026 sessions", 5)
    race_df, lap_df, sc_df = load_historical(gp_name, prior_gps_2026, progress=progress)

    if progress: progress("Engineering features", 55)
    feat_df, sc_prob, vsc_prob = build_features(race_df, lap_df, sc_df, circuit_params)

    if progress: progress("Training XGBoost classifiers", 70)
    win_model, podium_model, pole_model, q3_model = train_models(feat_df)

    if progress: progress("Building 2026 driver state", 82)
    state_df = build_2026_state(feat_df, sc_prob, vsc_prob, gp_name, circuit_params)
    state_df = update_state_with_2026_results(state_df, prior_gps_2026)

    if progress: progress("Predicting qualifying", 88)
    quali_pred = predict_qualifying(state_df, pole_model, q3_model)
    state_df = apply_predicted_grid(state_df, quali_pred)

    if progress: progress("Predicting race", 93)
    race_pred = predict_race(state_df, win_model, podium_model, circuit_params)

    if progress: progress("Comparing against actual results", 97)
    quali_comp = compare_quali(quali_pred, gp_name)
    race_comp  = compare_race(race_pred,   gp_name)

    if output_dir:
        save_csv(quali_comp, os.path.join(output_dir, "quali_comparison_2026.csv"))
        save_csv(race_comp,  os.path.join(output_dir, "race_comparison_2026.csv"))
        save_csv(quali_pred, os.path.join(output_dir, "quali_predictions_2026.csv"))
        save_csv(race_pred,  os.path.join(output_dir, "race_predictions_2026.csv"))

    if progress: progress("Done", 100)
    return race_pred, quali_pred, race_comp, quali_comp


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="F1 2026 ML Predictor (APEX V7)")
    parser.add_argument("--gp",   type=str, help="Grand Prix name")
    parser.add_argument("--list", action="store_true", help="List all 2026 GPs")
    args = parser.parse_args()

    if args.list:
        print("\n  2026 F1 Calendar:\n")
        for i, gp in enumerate(ALL_2026_GPS_ORDERED, 1): print(f"  {i:2}. {gp}")
        sys.exit(0)

    if not args.gp:
        parser.print_help()
        sys.exit(1)

    race_pred, quali_pred, race_comp, quali_comp = run_prediction(
        args.gp, output_dir=f"./output/{args.gp.lower().replace(' ','_')}_2026_ml"
    )

    banner(f"PREDICTED RESULTS — 2026 {args.gp}")
    print("\n  QUALIFYING:\n")
    for i, row in quali_pred.head(10).iterrows():
        print(f"  P{i:2}  {row['Abbreviation']:<5} {row['TeamName']:<25} Pole: {row['Pole_%']:5.2f}%  Q3: {row['Q3_%']:5.1f}%")

    print("\n  RACE:\n")
    print(f"  {'':4} {'':5} {'Team':<18} {'Win':>7} {'Podium':>8} {'Top10':>7}  Grid  ELO   Pts")
    print(f"  {'─'*78}")
    for i, row in race_pred.head(15).iterrows():
        print(f"  P{i:02d}  {row['Abbreviation']:<5} {row['TeamName'][:18]:<18} "
              f"{row['Win_%']:7.2f}% {row['Podium_%']:7.2f}% {row['Top10_%']:7.1f}%  "
              f"G{row['GridPosition']:02d}  {row['DriverELO']:4.1f}  {row['ChampPoints']:3.0f}")
