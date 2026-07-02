// F1 2026 predictions client (Supabase-backed).
import { Race, teamColors } from '../data/mock';
import { resolvePredictorGpName } from '../data/gp-registry';
import { supabase } from '../lib/supabase';
import { fetchT } from './f1';

export { resolvePredictorGpName };

export interface RacePredictionRow {
  gp_name: string;
  driver_abbr: string;
  driver_name: string | null;
  driver_number: string | null;
  team_name: string | null;
  grid_position: number | null;
  win_pct: number | null;
  podium_pct: number | null;
  top10_pct: number | null;
  expected_finish: number | null;
  predicted_rank: number | null;
  created_at: string | null;
}

export interface QualiPredictionRow {
  gp_name: string;
  driver_abbr: string;
  driver_name: string | null;
  driver_number: string | null;
  team_name: string | null;
  expected_grid: number | null;
  pole_pct: number | null;
  q3_pct: number | null;
  predicted_grid: number | null;
  created_at: string | null;
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
  // Actual result (filled when race is completed)
  actualPosition?: number;
  predictedPosition?: number;
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
    .sort((a, b) => (a.predicted_rank ?? 999) - (b.predicted_rank ?? 999))
    .slice(0, limit)
    .map(r => ({
      driver: r.driver_abbr,
      name: r.driver_name ?? r.driver_abbr,
      team: r.team_name ?? 'Unknown',
      prob: r.win_pct ?? 0,
      color: resolveTeamColor(r.team_name),
      gridPosition: r.grid_position ?? undefined,
      expectedFinish: r.expected_finish ?? undefined,
      podiumPct: r.podium_pct ?? undefined,
      top10Pct: r.top10_pct ?? undefined,
      predictedPosition: r.predicted_rank ?? undefined,
    }));
}

export function qualiPredictionsToItems(
  rows: QualiPredictionRow[],
  limit = 10,
): PredictionItem[] {
  return [...rows]
    .sort((a, b) => (a.predicted_grid ?? 999) - (b.predicted_grid ?? 999))
    .slice(0, limit)
    .map(r => ({
      driver: r.driver_abbr,
      name: r.driver_name ?? r.driver_abbr,
      team: r.team_name ?? 'Unknown',
      prob: r.pole_pct ?? 0,
      color: resolveTeamColor(r.team_name),
      poleHint: r.pole_pct ?? undefined,
      q3Hint: r.q3_pct ?? undefined,
      predictedPosition: r.predicted_grid ?? undefined,
    }));
}

// ─────────────────────────────────────────────────────────────────────
//  Actual results (OpenF1 — same source as standings sync)
// ─────────────────────────────────────────────────────────────────────
export interface ActualResults {
  race: Map<string, number>;   // driver code → finishing position
  quali: Map<string, number>;  // driver code → qualifying position
}

const OPENF1_URL = 'https://api.openf1.org/v1';

type OpenF1SessionRow = { session_key: number; session_name?: string };

function setDriverPosition(target: Map<string, number>, abbr: string, position: number) {
  target.set(abbr.toUpperCase(), position);
}

export function getDriverPosition(
  map: Map<string, number>,
  abbr: string,
): number | undefined {
  return map.get(abbr.toUpperCase());
}

/** Main-race qualifying session (not Sprint Qualifying on sprint weekends). */
function pickQualifyingSession(sessions: OpenF1SessionRow[]): OpenF1SessionRow | null {
  const main = sessions.find((s) => s.session_name === 'Qualifying');
  if (main) return main;

  return (
    sessions.find((s) => /sprint qualifying|sprint shootout/i.test(s.session_name ?? '')) ??
    null
  );
}

async function buildDriverAbbrMap(sessionKey: number): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const drvRes = await fetchT(`${OPENF1_URL}/drivers?session_key=${sessionKey}`, 12000);
  if (!drvRes.ok) return map;

  const drivers = await drvRes.json();
  if (!Array.isArray(drivers)) return map;

  for (const d of drivers) {
    if (d.name_acronym && typeof d.driver_number === 'number') {
      map.set(d.driver_number, String(d.name_acronym).toUpperCase());
    }
  }
  return map;
}

function applyPositions(
  rows: { driver_number?: number; position?: number; grid_position?: number }[],
  abbrMap: Map<number, string>,
  target: Map<string, number>,
) {
  for (const row of rows) {
    if (typeof row.driver_number !== 'number') continue;
    const abbr = abbrMap.get(row.driver_number);
    const pos = row.position ?? row.grid_position;
    if (abbr && typeof pos === 'number' && pos > 0) {
      setDriverPosition(target, abbr, pos);
    }
  }
}

async function loadSessionResultPositions(
  sessionKey: number,
  abbrMap: Map<number, string>,
  target: Map<string, number>,
): Promise<void> {
  const resRes = await fetchT(`${OPENF1_URL}/session_result?session_key=${sessionKey}`, 12000);
  if (!resRes.ok) return;

  const results = await resRes.json();
  if (!Array.isArray(results)) return;
  applyPositions(results, abbrMap, target);
}

async function loadStartingGridPositions(
  sessionKey: number,
  abbrMap: Map<number, string>,
  target: Map<string, number>,
): Promise<void> {
  const gridRes = await fetchT(`${OPENF1_URL}/starting_grid?session_key=${sessionKey}`, 12000);
  if (!gridRes.ok) return;

  const grid = await gridRes.json();
  if (!Array.isArray(grid)) return;
  applyPositions(grid, abbrMap, target);
}

async function loadQualifyingActuals(
  qualiSession: OpenF1SessionRow,
  abbrMap: Map<number, string>,
  target: Map<string, number>,
): Promise<void> {
  const sk = qualiSession.session_key;
  // starting_grid is often more complete than session_result for Qualifying
  await loadStartingGridPositions(sk, abbrMap, target);
  await loadSessionResultPositions(sk, abbrMap, target);
}

async function fetchActualResultsOpenF1(raceObj: Race): Promise<ActualResults> {
  const race = new Map<string, number>();
  const quali = new Map<string, number>();

  if (!raceObj.meeting_key) {
    return { race, quali };
  }

  const sessionsRes = await fetchT(
    `${OPENF1_URL}/sessions?meeting_key=${raceObj.meeting_key}`,
    12000,
  );
  if (!sessionsRes.ok) return { race, quali };

  const sessions = await sessionsRes.json();
  if (!Array.isArray(sessions)) return { race, quali };

  const raceSession = sessions.find((s: OpenF1SessionRow) => s.session_name === 'Race');
  const qualiSession = pickQualifyingSession(sessions);

  if (!raceSession) return { race, quali };

  const abbrMap = await buildDriverAbbrMap(raceSession.session_key);

  await loadSessionResultPositions(raceSession.session_key, abbrMap, race);

  if (qualiSession) {
    await loadQualifyingActuals(qualiSession, abbrMap, quali);
  }

  return { race, quali };
}

export async function fetchActualResults(raceObj: Race): Promise<ActualResults> {
  const openF1 = await fetchActualResultsOpenF1(raceObj);
  if (openF1.race.size > 0 || openF1.quali.size > 0) {
    console.log(
      `[Predictions] Actuals from OpenF1 for "${raceObj.name}":`,
      openF1.race.size,
      'race,',
      openF1.quali.size,
      'quali',
    );
    return openF1;
  }

  console.warn(`[Predictions] No OpenF1 results for "${raceObj.name}" (meeting_key=${raceObj.meeting_key})`);
  return openF1;
}

// ─────────────────────────────────────────────────────────────────────
//  Supabase reads
// ─────────────────────────────────────────────────────────────────────
export async function fetchPredictionsForRace(
  race: Race,
): Promise<{
  raceItems: PredictionItem[];
  qualiItems: PredictionItem[];
  predictorGp: string;
}> {
  const predictorGp = resolvePredictorGpName(race);

  // Fetch predictions and actual results in parallel
  const [raceRes, qualiRes, actuals] = await Promise.all([
    supabase
      .from('race_predictions')
      .select('*')
      .eq('gp_name', predictorGp)
      .order('predicted_rank', { ascending: true }),
    supabase
      .from('quali_predictions')
      .select('*')
      .eq('gp_name', predictorGp)
      .order('predicted_grid', { ascending: true }),
    race.status === 'completed' ? fetchActualResults(race) : Promise.resolve(null),
  ]);

  if (raceRes.error) throw new Error(`Race predictions fetch failed: ${raceRes.error.message}`);
  if (qualiRes.error) throw new Error(`Qualifying predictions fetch failed: ${qualiRes.error.message}`);

  const raceRows = (raceRes.data ?? []) as RacePredictionRow[];
  const qualiRows = (qualiRes.data ?? []) as QualiPredictionRow[];

  let raceItems = racePredictionsToItems(raceRows);
  let qualiItems = qualiPredictionsToItems(qualiRows);

  // Merge actual positions into prediction items
  if (actuals) {
    raceItems = raceItems.map((item) => ({
      ...item,
      actualPosition: getDriverPosition(actuals.race, item.driver),
    }));
    qualiItems = qualiItems.map((item) => ({
      ...item,
      actualPosition: getDriverPosition(actuals.quali, item.driver),
    }));
  }

  return {
    predictorGp,
    raceItems,
    qualiItems,
  };
}
