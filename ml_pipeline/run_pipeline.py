"""
═══════════════════════════════════════════════════════════════════════
  run_pipeline.py — F1 2026 Offline Compute + Supabase Upload
  ─────────────────────────────────────────────────────────────────
  Runs the APEX V7 predictor for one or all 2026 Grand Prix, then
  upserts the output into Supabase. This is the script GitHub Actions
  invokes on a weekly cron so the public frontend always has fresh
  predictions to read.

  Usage:
    # single GP
    python run_pipeline.py --gp "Japanese Grand Prix"

    # whole 2026 calendar
    python run_pipeline.py --all

    # list all GP names in order
    python run_pipeline.py --list

    # skip GPs that already have fresh rows (< N hours old)
    python run_pipeline.py --all --skip-fresh 24

  Environment (.env or shell):
    SUPABASE_URL         — https://xxxxx.supabase.co
    SUPABASE_SERVICE_KEY — service role key (keep secret!)
═══════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv()

try:
    from f1_2026_predictor import run_prediction, ALL_2026_GPS_ORDERED
except ImportError:
    print("ERROR: f1_2026_predictor.py not importable from this directory.")
    sys.exit(1)

from supabase_upload import upload_predictions, get_client


# ─────────────────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────────────────
def _fmt_secs(s: float) -> str:
    if s < 60:  return f"{s:5.1f}s"
    m, s = divmod(int(s), 60)
    return f"{m}m {s:02d}s"


def _gp_last_updated(supabase, gp_name: str) -> datetime | None:
    res = (
        supabase.table("race_predictions")
        .select("created_at")
        .eq("gp_name", gp_name)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if res.data:
        ts = res.data[0]["created_at"]
        # Supabase returns ISO8601 with Z or +00:00
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return None


def run_for_gp(gp_name: str) -> dict:
    banner = f"═══  PIPELINE: {gp_name}  ═══"
    print("\n" + banner)

    t0 = time.time()
    race_pred, quali_pred, race_comp, quali_comp = run_prediction(gp_name)
    elapsed_pred = time.time() - t0

    t1 = time.time()
    result = upload_predictions(
        gp_name=gp_name,
        race_pred_df=race_pred,
        quali_pred_df=quali_pred,
    )
    elapsed_up = time.time() - t1

    result["elapsed_predict"] = elapsed_pred
    result["elapsed_upload"]  = elapsed_up
    result["gp"]              = gp_name

    print(f"  ⏱  predict={_fmt_secs(elapsed_pred)} · upload={_fmt_secs(elapsed_up)}")
    return result


# ─────────────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="F1 2026 Predictor Pipeline — compute + upload to Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py --gp "Japanese Grand Prix"
  python run_pipeline.py --all
  python run_pipeline.py --all --skip-fresh 24
  python run_pipeline.py --list
""",
    )
    parser.add_argument("--gp",          type=str, help="Grand Prix name")
    parser.add_argument("--all",         action="store_true",
                        help="Run every 2026 Grand Prix in order")
    parser.add_argument("--list",        action="store_true",
                        help="List all 2026 GP names")
    parser.add_argument("--skip-fresh",  type=int, default=0, metavar="HOURS",
                        help="With --all: skip GPs whose rows were updated within N hours")
    parser.add_argument("--continue-on-error", action="store_true", default=True,
                        help="With --all: don't abort the loop if one GP fails (default: on)")
    args = parser.parse_args()

    if args.list:
        print("\n  2026 Formula 1 Calendar:\n")
        for i, gp in enumerate(ALL_2026_GPS_ORDERED, 1):
            print(f"  {i:2}. {gp}")
        sys.exit(0)

    # ── single GP ─────────────────────────────────────────────────────
    if args.gp:
        if args.gp not in ALL_2026_GPS_ORDERED:
            print(f"ERROR: unknown GP '{args.gp}'. Use --list to see valid names.")
            sys.exit(1)
        run_for_gp(args.gp)
        print("\n  ✅  Done\n")
        sys.exit(0)

    # ── full calendar ─────────────────────────────────────────────────
    if args.all:
        supabase = get_client() if args.skip_fresh > 0 else None
        threshold = (
            datetime.now(timezone.utc) - timedelta(hours=args.skip_fresh)
            if args.skip_fresh > 0 else None
        )

        totals   = {"race": 0, "quali": 0, "time": 0.0}
        skipped, succeeded, failed = [], [], []

        print(f"\n  Running full pipeline for {len(ALL_2026_GPS_ORDERED)} GPs")
        if args.skip_fresh > 0:
            print(f"  (skipping GPs updated in the last {args.skip_fresh}h)\n")

        overall_t0 = time.time()
        for i, gp in enumerate(ALL_2026_GPS_ORDERED, 1):
            print(f"\n[{i:2}/{len(ALL_2026_GPS_ORDERED)}]", end=" ")

            if threshold is not None and supabase is not None:
                last = _gp_last_updated(supabase, gp)
                if last and last > threshold:
                    print(f"SKIP {gp} (fresh, updated {last:%Y-%m-%d %H:%M UTC})")
                    skipped.append(gp)
                    continue

            try:
                r = run_for_gp(gp)
                totals["race"]  += r.get("race_rows", 0)
                totals["quali"] += r.get("quali_rows", 0)
                totals["time"]  += r.get("elapsed_predict", 0) + r.get("elapsed_upload", 0)
                succeeded.append(gp)
            except Exception as e:
                print(f"\n  ✗  FAILED: {gp} — {type(e).__name__}: {e}")
                if not args.continue_on_error:
                    raise
                traceback.print_exc()
                failed.append((gp, f"{type(e).__name__}: {e}"))

        overall_t = time.time() - overall_t0
        print("\n" + "═" * 62)
        print(f"  Pipeline summary ({_fmt_secs(overall_t)} wall, {_fmt_secs(totals['time'])} worked)")
        print("═" * 62)
        print(f"  ✅  Succeeded : {len(succeeded):2} GPs")
        print(f"  ⏭  Skipped   : {len(skipped):2} GPs")
        print(f"  ❌  Failed    : {len(failed):2} GPs")
        print(f"  📤  Total rows: {totals['race']} race + {totals['quali']} quali")
        if failed:
            print("\n  Failures:")
            for gp, err in failed:
                print(f"    - {gp}: {err}")
            sys.exit(2)   # non-zero exit so CI marks the run as failed
        sys.exit(0)

    # ── nothing specified ─────────────────────────────────────────────
    parser.print_help()
    print("\n  ⚠  Provide --gp <name> or --all\n")
    sys.exit(1)


if __name__ == "__main__":
    main()
