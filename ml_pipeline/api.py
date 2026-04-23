"""
═══════════════════════════════════════════════════════════════════════
  F1 2026 Predictor — FastAPI Live Inference Server
  ─────────────────────────────────────────────────────────────────
  Exposes the heavy XGBoost + FastF1 predictor as a web API so the
  React frontend can kick off predictions on-demand.

  Design
  ──────
  The predictor takes 1-10 minutes per GP (depending on FastF1 cache
  state), which is way beyond any sane synchronous HTTP timeout, so
  this API uses a submit/poll pattern:

    1. Client POSTs /predict with a gp name → server returns a job_id
       immediately and starts computing in a background thread.
    2. Client polls GET /jobs/{job_id} every second or two. Response
       contains status (queued | running | done | error), a progress
       message + percent, and the result when finished.
    3. Completed results are cached in-process (24h TTL) so repeat
       requests for the same GP return instantly.

  Run
  ───
    cd ml_pipeline
    pip install -r requirements.txt
    uvicorn api:app --host 0.0.0.0 --port 8000 --reload

  Env (optional)
  ──────────────
    F1_CACHE_DIR   : FastF1 cache directory (default ./f1_cache)
    PREDICTION_TTL : Result cache TTL in seconds (default 86400 = 24h)
    ALLOW_ORIGINS  : Comma-separated list of CORS origins
                     (default "*" for local dev)
═══════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import os
import time
import uuid
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from f1_2026_predictor import (
    run_prediction,
    ALL_2026_GPS_ORDERED,
    get_circuit_params,
)

# ─────────────────────────────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────────────────────────────
PREDICTION_TTL = int(os.environ.get("PREDICTION_TTL", "86400"))  # 24h
ALLOW_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOW_ORIGINS", "*").split(",")
    if o.strip()
]

# We only want ONE predictor running at a time — FastF1 caches and
# XGBoost training don't like concurrent heavy IO.
EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="f1-predict")

# ─────────────────────────────────────────────────────────────────────
#  IN-MEMORY STATE
# ─────────────────────────────────────────────────────────────────────
# jobs[job_id] = {
#   "status": "queued" | "running" | "done" | "error",
#   "progress": {"percent": int, "message": str},
#   "result": {...} | None,
#   "error":  str | None,
#   "gp":     str,
#   "started": float,
#   "finished": float | None,
# }
_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()

# results[gp] = (timestamp, result_dict)
_results: Dict[str, tuple] = {}
_results_lock = threading.Lock()

# gp → latest job_id (so we can dedupe concurrent calls for the same GP)
_active_by_gp: Dict[str, str] = {}


# ─────────────────────────────────────────────────────────────────────
#  SCHEMAS
# ─────────────────────────────────────────────────────────────────────
class PredictRequest(BaseModel):
    gp: str
    force: bool = False   # bypass cache and recompute


class JobResponse(BaseModel):
    job_id: str
    status: str
    gp: str
    cached: bool = False


class ProgressInfo(BaseModel):
    percent: int
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    gp: str
    progress: ProgressInfo
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None


# ─────────────────────────────────────────────────────────────────────
#  HELPERS
# ─────────────────────────────────────────────────────────────────────
def _df_to_records(df) -> list[dict]:
    """DataFrame → list of dicts, NaN stripped out."""
    if df is None or df.empty:
        return []
    cleaned = df.where(df.notnull(), None)
    return cleaned.to_dict(orient="records")


def _cache_get(gp: str) -> Optional[Dict[str, Any]]:
    with _results_lock:
        entry = _results.get(gp)
    if entry is None:
        return None
    ts, payload = entry
    if time.time() - ts > PREDICTION_TTL:
        with _results_lock:
            _results.pop(gp, None)
        return None
    return payload


def _cache_put(gp: str, payload: Dict[str, Any]):
    with _results_lock:
        _results[gp] = (time.time(), payload)


def _update_progress(job_id: str, message: str, percent: int):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job["progress"] = {"percent": max(0, min(100, percent)), "message": message}


def _run_job(job_id: str, gp: str):
    """Executed in the worker thread."""
    with _jobs_lock:
        _jobs[job_id]["status"] = "running"
        _jobs[job_id]["progress"] = {"percent": 1, "message": "Starting"}
        _jobs[job_id]["started"] = time.time()

    try:
        race_pred, quali_pred, race_comp, quali_comp = run_prediction(
            gp,
            progress=lambda msg, pct: _update_progress(job_id, msg, pct),
        )

        circuit = get_circuit_params(gp)
        payload = {
            "gp": gp,
            "circuit": {
                "laps":             int(circuit.get("laps", 55)),
                "overtake_index":   float(circuit.get("overtake_idx", 0.08)),
            },
            "quali": _df_to_records(quali_pred),
            "race":  _df_to_records(race_pred),
            "computed_at": time.time(),
        }
        _cache_put(gp, payload)

        with _jobs_lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["progress"] = {"percent": 100, "message": "Done"}
            _jobs[job_id]["result"] = payload
            _jobs[job_id]["finished"] = time.time()

    except Exception as e:
        tb = traceback.format_exc()
        print(f"[api] job {job_id} failed:\n{tb}")
        with _jobs_lock:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = f"{type(e).__name__}: {e}"
            _jobs[job_id]["finished"] = time.time()
    finally:
        with _jobs_lock:
            if _active_by_gp.get(gp) == job_id:
                _active_by_gp.pop(gp, None)


# ─────────────────────────────────────────────────────────────────────
#  APP
# ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="F1 2026 Predictor API",
    description="Live XGBoost + FastF1 inference for qualifying and race predictions.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS if ALLOW_ORIGINS else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", summary="Health check")
def root():
    return {"service": "f1-2026-predictor", "status": "ok"}


@app.get("/gps", summary="List 2026 Grand Prix")
def list_gps():
    return {
        "count": len(ALL_2026_GPS_ORDERED),
        "gps": ALL_2026_GPS_ORDERED,
    }


@app.post("/predict", response_model=JobResponse, summary="Kick off a prediction")
def submit_prediction(req: PredictRequest):
    gp = req.gp.strip()
    if gp not in ALL_2026_GPS_ORDERED:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown GP '{gp}'. Call /gps for valid options.",
        )

    # Hit cache?
    if not req.force:
        cached = _cache_get(gp)
        if cached:
            job_id = str(uuid.uuid4())
            with _jobs_lock:
                _jobs[job_id] = {
                    "status":   "done",
                    "progress": {"percent": 100, "message": "Cached"},
                    "result":   cached,
                    "error":    None,
                    "gp":       gp,
                    "started":  time.time(),
                    "finished": time.time(),
                }
            return JobResponse(job_id=job_id, status="done", gp=gp, cached=True)

    # Already computing this GP?
    with _jobs_lock:
        existing = _active_by_gp.get(gp)
        if existing and _jobs.get(existing, {}).get("status") in ("queued", "running"):
            return JobResponse(
                job_id=existing,
                status=_jobs[existing]["status"],
                gp=gp,
                cached=False,
            )

    # New job
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "status":   "queued",
            "progress": {"percent": 0, "message": "Queued"},
            "result":   None,
            "error":    None,
            "gp":       gp,
            "started":  None,
            "finished": None,
        }
        _active_by_gp[gp] = job_id

    EXECUTOR.submit(_run_job, job_id, gp)
    return JobResponse(job_id=job_id, status="queued", gp=gp, cached=False)


@app.get("/jobs/{job_id}", response_model=JobStatusResponse, summary="Poll a job")
def job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown job_id")
        return JobStatusResponse(
            job_id=job_id,
            status=job["status"],
            gp=job["gp"],
            progress=ProgressInfo(**job["progress"]),
            result=job.get("result"),
            error=job.get("error"),
            started_at=job.get("started"),
            finished_at=job.get("finished"),
        )


@app.get("/cache/{gp:path}", summary="Return a cached prediction if present")
def get_cached(gp: str):
    cached = _cache_get(gp)
    if not cached:
        raise HTTPException(status_code=404, detail="No cached prediction for that GP")
    return cached


@app.delete("/cache/{gp:path}", summary="Drop cached prediction for a GP")
def drop_cached(gp: str):
    with _results_lock:
        _results.pop(gp, None)
    return {"cleared": gp}


@app.get("/debug/jobs", summary="Snapshot of all jobs (for debugging)")
def debug_jobs():
    with _jobs_lock:
        return {
            "count": len(_jobs),
            "active_by_gp": dict(_active_by_gp),
            "jobs": {
                jid: {
                    "status":   j["status"],
                    "gp":       j["gp"],
                    "progress": j["progress"],
                    "started":  j.get("started"),
                    "finished": j.get("finished"),
                    "error":    j.get("error"),
                }
                for jid, j in _jobs.items()
            },
        }
