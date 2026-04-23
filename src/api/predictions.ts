// F1 2026 predictor API client.
//
// The predictor runs as a FastAPI server (see ml_pipeline/api.py).
// We submit a job, then poll until done.
//
//   const { race, quali } = await runPrediction(
//     gpName,
//     { onProgress: ({ percent, message }) => setProgress({ percent, message }) }
//   );
//

import { Race, teamColors } from '../data/mock';

const API_URL =
  import.meta.env.VITE_PREDICTION_API_URL ?? 'http://localhost:8000';

// ── Types that mirror the FastAPI response ───────────────────────────
export interface RacePredictionRow {
  Abbreviation: string;
  FullName: string;
  DriverNumber: string;
  TeamName: string;
  GridPosition: number;
  ChampPoints: number;
  'Win_%': number;
  'Podium_%': number;
  'Top10_%': number;
  ExpectedFinish: number;
  DriverELO: number;
}

export interface QualiPredictionRow {
  Abbreviation: string;
  FullName: string;
  DriverNumber: string;
  TeamName: string;
  ExpectedGrid: number;
  'Pole_%': number;
  'Q3_%': number;
}

export interface PredictionResult {
  gp: string;
  circuit: { laps: number; overtake_index: number };
  race: RacePredictionRow[];
  quali: QualiPredictionRow[];
  computed_at: number;
}

export interface JobProgress {
  percent: number;
  message: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error';

interface JobStatusResponse {
  job_id: string;
  status: JobStatus;
  gp: string;
  progress: JobProgress;
  result: PredictionResult | null;
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
}

interface SubmitResponse {
  job_id: string;
  status: JobStatus;
  gp: string;
  cached: boolean;
}

// ── UI-friendly shape used by the PredictionList component ───────────
export interface PredictionItem {
  driver: string;          // 3-letter abbreviation
  name: string;            // full driver name
  team: string;
  prob: number;            // 0-100
  color: string;
  // Extra fields available if needed
  gridPosition?: number;
  expectedFinish?: number;
  podiumPct?: number;
  top10Pct?: number;
  poleHint?: number;
  q3Hint?: number;
}

// ─────────────────────────────────────────────────────────────────────
//  Team colour resolution
// ─────────────────────────────────────────────────────────────────────
function resolveTeamColor(teamName: string | null | undefined): string {
  if (!teamName) return '#6b7280';
  const n = teamName.toLowerCase();
  if (n.includes('mclaren')) return teamColors['McLaren'];
  if (n.includes('ferrari')) return teamColors['Ferrari'];
  if (n.includes('red bull')) return teamColors['Red Bull Racing'];
  if (n.includes('mercedes')) return teamColors['Mercedes'];
  if (n.includes('aston martin')) return teamColors['Aston Martin'];
  if (n.includes('alpine')) return teamColors['Alpine'];
  if (n.includes('williams')) return teamColors['Williams'];
  if (n.includes('racing bulls') || n.includes('visa cash') || n === 'rb')
    return teamColors['RB'] ?? '#6692FF';
  if (n.includes('haas')) return teamColors['Haas'] ?? '#B6BABD';
  if (n.includes('audi') || n.includes('kick') || n.includes('sauber'))
    return teamColors['Kick Sauber'] ?? '#52E252';
  if (n.includes('cadillac')) return '#C0C0C0';
  return '#6b7280';
}

// ─────────────────────────────────────────────────────────────────────
//  Shape conversion for the UI
// ─────────────────────────────────────────────────────────────────────
export function racePredictionsToItems(
  rows: RacePredictionRow[],
  limit = 10,
): PredictionItem[] {
  return [...rows]
    .sort((a, b) => a.ExpectedFinish - b.ExpectedFinish)
    .slice(0, limit)
    .map(r => ({
      driver: r.Abbreviation,
      name: r.FullName ?? r.Abbreviation,
      team: r.TeamName,
      prob: r['Win_%'],
      color: resolveTeamColor(r.TeamName),
      gridPosition: r.GridPosition,
      expectedFinish: r.ExpectedFinish,
      podiumPct: r['Podium_%'],
      top10Pct: r['Top10_%'],
    }));
}

export function qualiPredictionsToItems(
  rows: QualiPredictionRow[],
  limit = 10,
): PredictionItem[] {
  return [...rows]
    .sort((a, b) => a.ExpectedGrid - b.ExpectedGrid)
    .slice(0, limit)
    .map(r => ({
      driver: r.Abbreviation,
      name: r.FullName ?? r.Abbreviation,
      team: r.TeamName,
      prob: r['Pole_%'],
      color: resolveTeamColor(r.TeamName),
      poleHint: r['Pole_%'],
      q3Hint: r['Q3_%'],
    }));
}

// ─────────────────────────────────────────────────────────────────────
//  GP-name mapping:  Race (from OpenF1)  →  full "XYZ Grand Prix"
//
//  The predictor API uses canonical names like "Japanese Grand Prix".
//  OpenF1 meeting names can vary (e.g. "Japanese Grand Prix", "Italian
//  Grand Prix", "Las Vegas Grand Prix"), and some calendar events
//  include things like "São Paulo Grand Prix" ≈ "Brazilian Grand Prix".
// ─────────────────────────────────────────────────────────────────────
const OPENF1_TO_PREDICTOR: Record<string, string> = {
  'São Paulo Grand Prix':    'Brazilian Grand Prix',
  'Sao Paulo Grand Prix':    'Brazilian Grand Prix',
  'Grande Prêmio de São Paulo': 'Brazilian Grand Prix',
};

const COUNTRY_TO_PREDICTOR: Record<string, string> = {
  'Australia':          'Australian Grand Prix',
  'China':              'Chinese Grand Prix',
  'Japan':              'Japanese Grand Prix',
  'Bahrain':            'Bahrain Grand Prix',
  'Saudi Arabia':       'Saudi Arabian Grand Prix',
  'USA':                'United States Grand Prix',
  'United States':      'United States Grand Prix',
  'Italy':              'Italian Grand Prix',  // Imola is also Italy → must override via event name
  'Monaco':             'Monaco Grand Prix',
  'Spain':              'Spanish Grand Prix',
  'Canada':             'Canadian Grand Prix',
  'Austria':            'Austrian Grand Prix',
  'UK':                 'British Grand Prix',
  'United Kingdom':     'British Grand Prix',
  'Hungary':            'Hungarian Grand Prix',
  'Belgium':            'Belgian Grand Prix',
  'Netherlands':        'Dutch Grand Prix',
  'Azerbaijan':         'Azerbaijan Grand Prix',
  'Singapore':          'Singapore Grand Prix',
  'Mexico':             'Mexican Grand Prix',
  'Brazil':             'Brazilian Grand Prix',
  'Qatar':              'Qatar Grand Prix',
  'UAE':                'Abu Dhabi Grand Prix',
  'Abu Dhabi':          'Abu Dhabi Grand Prix',
  'United Arab Emirates': 'Abu Dhabi Grand Prix',
};

export function resolvePredictorGpName(race: Race): string {
  if (OPENF1_TO_PREDICTOR[race.name]) return OPENF1_TO_PREDICTOR[race.name];
  if (/emilia[\s-]*romagna/i.test(race.name) || /imola/i.test(race.name))
    return 'Emilia Romagna Grand Prix';
  if (/miami/i.test(race.name))                return 'Miami Grand Prix';
  if (/las vegas/i.test(race.name))            return 'Las Vegas Grand Prix';
  if (race.name.toLowerCase().endsWith('grand prix')) return race.name;
  return COUNTRY_TO_PREDICTOR[race.country] ?? race.name;
}

// ─────────────────────────────────────────────────────────────────────
//  HTTP helpers
// ─────────────────────────────────────────────────────────────────────
async function postPredict(gp: string, force = false): Promise<SubmitResponse> {
  const res = await fetch(`${API_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gp, force }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`POST /predict → ${res.status}: ${msg}`);
  }
  return res.json();
}

async function getJob(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${API_URL}/jobs/${jobId}`);
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`GET /jobs/${jobId} → ${res.status}: ${msg}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────
//  MAIN ENTRY — submit + poll until done
// ─────────────────────────────────────────────────────────────────────
export interface RunPredictionOptions {
  force?: boolean;
  pollMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (p: JobProgress & { cached: boolean }) => void;
}

export async function runPrediction(
  gpName: string,
  opts: RunPredictionOptions = {},
): Promise<PredictionResult> {
  const { force = false, pollMs = 1500, timeoutMs = 20 * 60 * 1000, onProgress, signal } = opts;

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const submit = await postPredict(gpName, force);

  if (submit.cached && submit.status === 'done') {
    const snap = await getJob(submit.job_id);
    if (snap.result) {
      onProgress?.({ percent: 100, message: 'Cached', cached: true });
      return snap.result;
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() > deadline) {
      throw new Error(`Prediction timeout after ${Math.round(timeoutMs / 1000)}s`);
    }

    const snap = await getJob(submit.job_id);
    onProgress?.({ ...snap.progress, cached: submit.cached });

    if (snap.status === 'done' && snap.result) return snap.result;
    if (snap.status === 'error') {
      throw new Error(snap.error ?? 'Prediction failed');
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Utility: wrapper that takes a Race (not a string) and returns UI items
// ─────────────────────────────────────────────────────────────────────
export async function predictForRace(
  race: Race,
  opts: RunPredictionOptions = {},
): Promise<{
  raw: PredictionResult;
  raceItems: PredictionItem[];
  qualiItems: PredictionItem[];
  predictorGp: string;
}> {
  const predictorGp = resolvePredictorGpName(race);
  const raw = await runPrediction(predictorGp, opts);
  return {
    raw,
    predictorGp,
    raceItems:  racePredictionsToItems(raw.race),
    qualiItems: qualiPredictionsToItems(raw.quali),
  };
}
