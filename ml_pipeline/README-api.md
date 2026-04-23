# F1 2026 Predictor — Live API

A FastAPI server that exposes the `APEX V7` XGBoost + FastF1 predictor to
the React frontend. When the user picks a Grand Prix in the UI, the
frontend kicks off a job here, polls for progress, and renders the
results.

---

## How it works

```
   User picks GP                   FastAPI (api.py)               Predictor
   ──────────────                  ────────────────               ─────────
  Predictions.tsx ───POST /predict──▶  submit job ──thread────▶  load_historical
        │                                   │                         │
        │ ◀──── { job_id, status } ─────────┤                         │
        │                                   │   FastF1 sessions       │
        └──GET /jobs/{id} (poll every 1.5s)─▶  build_features
                                                │   XGBoost train + predict
        ◀──── { status, progress, result } ─────┤
                                                └──▶ cache 24h in-memory
```

- **Submit → poll** pattern, because the predictor takes 2–10 minutes per
  GP on a cold FastF1 cache (30–90s on warm cache).
- **In-memory cache** with a 24h TTL. First user pays the cost, everyone
  after gets an instant result for the same GP.
- **Single-worker thread pool**, so concurrent requests queue up —
  FastF1's local parquet cache and XGBoost training don't like fighting
  over disk and CPU.

---

## Endpoints

| Method  | Path                | Purpose                                                    |
| ------- | ------------------- | ---------------------------------------------------------- |
| `GET`   | `/`                 | Health check                                                |
| `GET`   | `/gps`              | List of all 2026 Grand Prix names                           |
| `POST`  | `/predict`          | Submit a prediction job, body `{ "gp": "...", "force": false }` |
| `GET`   | `/jobs/{job_id}`    | Poll job status + progress + result                        |
| `GET`   | `/cache/{gp}`       | Fetch a cached result directly (404 if none)               |
| `DELETE`| `/cache/{gp}`       | Drop the cached result for a GP                            |
| `GET`   | `/debug/jobs`       | Snapshot of every job in memory                            |

`POST /predict` returns `200 { job_id, status, gp, cached }`. If
`cached: true` and `status: "done"`, you can skip polling and call
`/jobs/{job_id}` once.

---

## Running locally

```bash
cd ml_pipeline
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Start the server
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Then in another terminal, run the frontend. It reads the API URL from
`VITE_PREDICTION_API_URL`, which defaults to `http://localhost:8000`.

```bash
# In the project root
npm run dev
```

### Smoke test

```bash
curl -s http://localhost:8000/gps | jq
curl -s -X POST http://localhost:8000/predict \
  -H 'Content-Type: application/json' \
  -d '{"gp":"Japanese Grand Prix"}' | jq
```

Grab the `job_id` and poll:

```bash
JOB_ID=... 
watch -n 2 "curl -s http://localhost:8000/jobs/$JOB_ID | jq '.status, .progress'"
```

---

## Environment variables

| Variable          | Default           | What it does                                              |
| ----------------- | ----------------- | --------------------------------------------------------- |
| `F1_CACHE_DIR`    | `./f1_cache`      | Where FastF1 caches downloaded sessions (parquet)          |
| `PREDICTION_TTL`  | `86400` (24h)     | How long a computed result stays cached in memory         |
| `ALLOW_ORIGINS`   | `*`               | Comma-separated list of allowed CORS origins              |

> Warm the FastF1 cache in advance by running the predictor once per GP,
> e.g. as part of your container image build. This cuts cold-start time
> from ~10min → ~2min per prediction.

---

## Deployment notes

The server is a normal ASGI app, deploy it wherever you host Python:

### Railway (simplest)

1. `railway login` → `railway init`
2. Add a service, point it at this repo subdirectory `ml_pipeline/`
3. Set start command: `uvicorn api:app --host 0.0.0.0 --port $PORT`
4. Add env var `ALLOW_ORIGINS=https://your-frontend.vercel.app`
5. Copy the public URL into `VITE_PREDICTION_API_URL` in the frontend `.env`.

### Render

1. New Web Service → point at this repo.
2. Root directory: `ml_pipeline`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn api:app --host 0.0.0.0 --port $PORT`
5. Instance size: at least 1GB RAM + 1 vCPU (XGBoost + pandas).

### Fly.io (Dockerfile)

Write a Dockerfile:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*
COPY ml_pipeline/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY ml_pipeline/ .
ENV F1_CACHE_DIR=/app/f1_cache
EXPOSE 8080
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8080"]
```

Then `fly launch`.

### Modal (great for ML workloads, scales to zero)

Modal handles long-running ML tasks natively; worth exploring if you
want on-demand GPU/large-RAM containers.

---

## Scaling considerations

- **FastF1 rate limits**: the Ergast API behind FastF1 can throttle. With
  a warm cache this is a non-issue.
- **Cold starts**: first call per GP is slow. Mitigation: run a warm-up
  script on server boot that calls `run_prediction()` for the upcoming
  GPs once.
- **Persistence**: the current cache is in-memory. If the process
  restarts, results are lost. For production, persist results to
  Supabase (`race_predictions` / `quali_predictions` tables) inside
  `_run_job()`. The existing `supabase_upload.py` module already knows
  how — wire it up when ready.
- **Concurrency**: single-worker by design. If you expect many
  simultaneous users requesting _different_ GPs, bump `max_workers` in
  `api.py` and ensure your host has enough RAM/CPU per worker.

---

## Frontend contract

The frontend client lives at `src/api/predictions.ts`.

```ts
import { predictForRace } from '../api/predictions';

const { raceItems, qualiItems, raw } = await predictForRace(race, {
  onProgress: ({ percent, message }) => console.log(percent, message),
});
```

`raceItems` and `qualiItems` are already shaped for the UI
(`PredictionList`). `raw` is the full payload (useful for driver details,
circuit laps, etc.).
