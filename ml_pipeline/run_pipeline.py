"""
═══════════════════════════════════════════════════════════════════════
  run_pipeline.py  —  F1 2026 Offline Compute + Supabase Upload
  ─────────────────────────────────────────────────────────────────
  This is the script you run OFFLINE (on your machine, a VPS, or
  GitHub Actions). It calls the predictor and uploads results.

  Usage:
    # Run + upload predictions for one GP
    python run_pipeline.py --gp "Spanish Grand Prix"

    # Run all upcoming GPs in the calendar
    python run_pipeline.py --all

    # Sync actual results for a completed session
    python run_pipeline.py --gp "Spanish Grand Prix" --actuals race
    python run_pipeline.py --gp "Spanish Grand Prix" --actuals quali
    python run_pipeline.py --gp "Spanish Grand Prix" --actuals both

    # Run with fewer sims (faster, e.g. for testing)
    python run_pipeline.py --gp "Spanish Grand Prix" --sims 10000

  Environment:
    export SUPABASE_URL=https://xxxx.supabase.co
    export SUPABASE_SERVICE_KEY=your-service-role-key
═══════════════════════════════════════════════════════════════════════
"""

import argparse
import os
import sys

from dotenv import load_dotenv
load_dotenv()

# ── Import your existing predictor ───────────────────────────────────
# Make sure f1_2026_predictor.py is in the same directory
try:
    from f1_2026_predictor import run_prediction, get_circuit_params, ALL_2026_GPS
except ImportError:
    print("ERROR: f1_2026_predictor.py not found in the same directory.")
    sys.exit(1)

from supabase_upload import upload_predictions, fetch_and_upload_actuals


# ─────────────────────────────────────────────────────────────────────
#  PATCHED run_prediction  — wraps the original to add upload step
# ─────────────────────────────────────────────────────────────────────
def run_and_upload(gp_name: str, n_sims: int = 100_000, mode: str = "both"):
    """
    Runs the full F1 predictor pipeline for a given GP and uploads
    the results to Supabase.
    """
    print(f"\n{'═'*62}")
    print(f"  PIPELINE: {gp_name}  ({n_sims:,} sims, mode={mode})")
    print(f"{'═'*62}")

    circuit_params = get_circuit_params(gp_name)

    # Run the predictor (returns DataFrames)
    race_pred, quali_pred, race_comp, quali_comp = run_prediction(
        gp_name,
        n_sims=n_sims,
        mode=mode,
    )

    # Upload to Supabase
    upload_predictions(
        gp_name=gp_name,
        race_pred_df=race_pred,
        quali_pred_df=quali_pred,
        circuit_params=circuit_params,
    )

    return race_pred, quali_pred


# ─────────────────────────────────────────────────────────────────────
#  CLI
# ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="F1 2026 Predictor Pipeline — compute + upload to Supabase",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_pipeline.py --gp "Spanish Grand Prix"
  python run_pipeline.py --gp "Monaco Grand Prix" --sims 50000
  python run_pipeline.py --all --sims 50000
  python run_pipeline.py --gp "Spanish Grand Prix" --actuals race
  python run_pipeline.py --gp "Spanish Grand Prix" --actuals both
        """
    )
    parser.add_argument("--gp",      type=str, help="Grand Prix name")
    parser.add_argument("--sims",    type=int, default=100_000, help="Number of simulations")
    parser.add_argument("--mode",    type=str, default="both",
                        choices=["both", "quali", "race"])
    parser.add_argument("--all",     action="store_true",
                        help="Run predictions for all 2026 GPs")
    parser.add_argument("--actuals", type=str, default=None,
                        choices=["race", "quali", "both"],
                        help="Fetch + upload actual results for a completed session")
    parser.add_argument("--list",    action="store_true",
                        help="List all 2026 GPs")
    args = parser.parse_args()

    if args.list:
        print("\n  2026 Formula 1 Calendar:\n")
        for i, gp in enumerate(ALL_2026_GPS, 1):
            print(f"  {i:2}. {gp}")
        sys.exit(0)

    # ── Sync actuals only  ────────────────────────────────────────────
    if args.actuals:
        if not args.gp:
            print("ERROR: --actuals requires --gp")
            sys.exit(1)
        print(f"\n  Fetching actual {args.actuals} results for: {args.gp}")
        fetch_and_upload_actuals(args.gp, session_type=args.actuals)
        sys.exit(0)

    # ── Run predictions ───────────────────────────────────────────────
    if args.all:
        failed = []
        for gp in ALL_2026_GPS:
            try:
                run_and_upload(gp, n_sims=args.sims, mode=args.mode)
            except Exception as e:
                print(f"\n  ✗  FAILED: {gp}  —  {e}")
                failed.append(gp)
        if failed:
            print(f"\n  Failed GPs: {', '.join(failed)}")
        else:
            print("\n  ✅  All GPs processed successfully")
        sys.exit(0)

    if not args.gp:
        parser.print_help()
        print("\n  ⚠  Provide --gp or --all\n")
        sys.exit(1)

    run_and_upload(args.gp, n_sims=args.sims, mode=args.mode)