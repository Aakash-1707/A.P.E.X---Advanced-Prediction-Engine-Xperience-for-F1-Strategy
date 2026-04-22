/**
 * A.P.E.X — Client-side Tyre Degradation Analysis Engine
 * ======================================================
 * Ports the Python apex_tyre_deg.py logic to TypeScript.
 * Fetches practice session laps from OpenF1, extracts long-run stints,
 * fits linear degradation curves, detects tyre cliffs, and simulates strategies.
 */

import { fetchT } from './f1';

const OPENF1_URL = 'https://api.openf1.org/v1';

// ─── Constants ────────────────────────────────────────────────────────────────

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#e8002d',
  MEDIUM: '#ffd700',
  HARD: '#c8c8c8',
  INTERMEDIATE: '#39b54a',
  WET: '#0067ff',
};

const DEG_THRESHOLDS: Record<string, { low: number; high: number }> = {
  SOFT:   { low: 0.050, high: 0.090 },
  MEDIUM: { low: 0.035, high: 0.065 },
  HARD:   { low: 0.020, high: 0.040 },
};

const PIT_LOSS = 22.0; // seconds

const STRATEGY_TEMPLATES = [
  { label: '1-stop · M → H',     compounds: ['MEDIUM', 'HARD'] },
  { label: '1-stop · S → H',     compounds: ['SOFT',   'HARD'] },
  { label: '1-stop · H → M',     compounds: ['HARD',   'MEDIUM'] },
  { label: '2-stop · S → M → H', compounds: ['SOFT',   'MEDIUM', 'HARD'] },
  { label: '2-stop · M → H → M', compounds: ['MEDIUM', 'HARD',   'MEDIUM'] },
  { label: '2-stop · S → H → M', compounds: ['SOFT',   'HARD',   'MEDIUM'] },
];

// Race laps per circuit (for strategy simulation accuracy)
const RACE_LAPS: Record<string, number> = {
  'Australian':  58, 'Bahrain':   57, 'Saudi Arabian': 50, 'Japanese':    53,
  'Chinese':     56, 'Miami':     57, 'Emilia Romagna': 63, 'Monaco':     78,
  'Spanish':     66, 'Canadian':  70, 'Austrian':  71, 'British':     52,
  'Belgian':     44, 'Hungarian': 70, 'Dutch':     72, 'Italian':     53,
  'Azerbaijan':  51, 'Singapore': 62, 'United States': 56, 'Mexico City': 71,
  'São Paulo':   71, 'Las Vegas': 50, 'Qatar':     57, 'Abu Dhabi':   58,
};

const DEFAULT_RACE_LAPS = 57;
const MIN_STINT_LAPS = 5;
const VALID_COMPOUNDS = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'];
const COMPOUND_ORDER = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET'];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompoundData {
  degRate: number;
  baseTime: number;
  laps: number;
  cliffLap: number;
  times: number[];
  slope: number;
  intercept: number;
  r2: number;
  severity: 'LOW' | 'MED' | 'HIGH';
  color: string;
}

export interface DriverDegData {
  name: string;
  fullName: string;
  team: string;
  teamColor: string;
  compounds: Record<string, CompoundData>;
}

export interface StintLength {
  min: number;
  max: number;
  median: number;
  color: string;
}

export interface StrategyResult {
  label: string;
  time: number;
  delta: number;
  optimal: boolean;
  historicalCount: number;
}

export interface TyreAnalysisResult {
  drivers: Record<string, DriverDegData>;
  stintLengths: Record<string, StintLength>;
  strategies: StrategyResult[];
  sessionLabel: string;
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────

function linregress(x: number[], y: number[]): { slope: number; intercept: number; r2: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] || 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - (intercept + slope * x[i])) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (p / 100));
  return sorted[Math.min(idx, sorted.length - 1)];
}

function zscore(values: number[]): number[] {
  const n = values.length;
  if (n < 2) return values.map(() => 0);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
  if (std === 0) return values.map(() => 0);
  return values.map(v => Math.abs((v - mean) / std));
}

// ─── Team Color Resolver ──────────────────────────────────────────────────────

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3b82f6', 'Ferrari': '#e8002d', 'Mercedes': '#27f4d2',
  'McLaren': '#ff8000', 'Aston Martin': '#00605e', 'Alpine': '#ff87bc',
  'Williams': '#64c4ff', 'RB': '#6692ff', 'Kick Sauber': '#52e252',
  'Haas F1 Team': '#b6babd',
};

function resolveTeamColor(team: string): string {
  for (const [key, color] of Object.entries(TEAM_COLORS)) {
    if (team.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#888888';
}

import { supabase } from '../lib/supabase';

// ─── Data Fetching ────────────────────────────────────────────────────────────

interface OpenF1Lap {
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  compound?: string;  // SOFT, MEDIUM, HARD, etc.
  stint?: number;
  is_pit_out_lap?: boolean;
  date_start?: string;
}

interface OpenF1Driver {
  driver_number: number;
  name_acronym: string;
  full_name: string;
  first_name: string;
  last_name: string;
  team_name: string;
  team_colour: string;
}

async function fetchSessionLaps(sessionKey: number): Promise<OpenF1Lap[]> {
  try {
    const res = await fetchT(`${OPENF1_URL}/laps?session_key=${sessionKey}`, 15000);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

interface OpenF1Stint {
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
}

async function fetchSessionStints(sessionKey: number): Promise<OpenF1Stint[]> {
  try {
    const res = await fetchT(`${OPENF1_URL}/stints?session_key=${sessionKey}`, 10000);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchSessionDrivers(sessionKey: number): Promise<OpenF1Driver[]> {
  try {
    const res = await fetchT(`${OPENF1_URL}/drivers?session_key=${sessionKey}`, 10000);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    // Deduplicate by driver_number
    const seen = new Set<number>();
    return data.filter((d: OpenF1Driver) => {
      if (seen.has(d.driver_number)) return false;
      seen.add(d.driver_number);
      return true;
    });
  } catch {
    return [];
  }
}

// ─── Stint Extraction ─────────────────────────────────────────────────────────

function extractStintsForDriver(
  laps: OpenF1Lap[],
  driverNumber: number,
  driverInfo: OpenF1Driver | undefined
): DriverDegData | null {

  // Filter to this driver's valid laps
  const driverLaps = laps
    .filter(l =>
      l.driver_number === driverNumber &&
      l.lap_duration != null &&
      l.lap_duration > 0 &&
      l.compound &&
      VALID_COMPOUNDS.includes(l.compound.toUpperCase()) &&
      !l.is_pit_out_lap
    )
    .sort((a, b) => a.lap_number - b.lap_number);

  if (driverLaps.length === 0) return null;

  const name = driverInfo?.name_acronym || `D${driverNumber}`;
  const fullName = driverInfo?.full_name || `${driverInfo?.first_name || ''} ${driverInfo?.last_name || ''}`.trim() || name;
  const team = driverInfo?.team_name || 'Unknown';
  const teamColor = driverInfo?.team_colour ? `#${driverInfo.team_colour}` : resolveTeamColor(team);

  const compounds: Record<string, CompoundData> = {};

  // Group laps by compound
  const byCompound = new Map<string, OpenF1Lap[]>();
  for (const lap of driverLaps) {
    const cmp = lap.compound!.toUpperCase();
    if (!byCompound.has(cmp)) byCompound.set(cmp, []);
    byCompound.get(cmp)!.push(lap);
  }

  for (const [compound, cmpLaps] of byCompound) {
    // Split into consecutive stints
    const stints: OpenF1Lap[][] = [];
    let current: OpenF1Lap[] = [];

    for (const lap of cmpLaps) {
      if (current.length === 0 || lap.lap_number === current[current.length - 1].lap_number + 1) {
        current.push(lap);
      } else {
        if (current.length >= MIN_STINT_LAPS) stints.push(current);
        current = [lap];
      }
    }
    if (current.length >= MIN_STINT_LAPS) stints.push(current);

    // Also try grouping by stint number if OpenF1 provides it
    if (stints.length === 0 && cmpLaps.some(l => l.stint != null)) {
      const byStint = new Map<number, OpenF1Lap[]>();
      for (const lap of cmpLaps) {
        const s = lap.stint ?? 0;
        if (!byStint.has(s)) byStint.set(s, []);
        byStint.get(s)!.push(lap);
      }
      for (const stintLaps of byStint.values()) {
        if (stintLaps.length >= MIN_STINT_LAPS) stints.push(stintLaps);
      }
    }

    if (stints.length === 0) continue;

    // Pick the longest stint for analysis
    const bestStint = stints.reduce((a, b) => a.length > b.length ? a : b);
    let times = bestStint.map(l => l.lap_duration!);

    // Outlier removal using z-scores
    if (times.length >= 3) {
      const zScores = zscore(times);
      const filtered = times.filter((_, i) => zScores[i] < 3);
      if (filtered.length >= MIN_STINT_LAPS) times = filtered;
    }

    const lapNums = times.map((_, i) => i + 1);

    // Linear regression
    const { slope, intercept, r2 } = linregress(lapNums, times);
    const degRate = Math.max(slope, 0);

    // Cliff detection via residual acceleration
    const fitted = lapNums.map(x => intercept + slope * x);
    const residuals = times.map((t, i) => t - fitted[i]);
    let cliffLap = times.length;

    if (residuals.length > 3) {
      const accel: number[] = [];
      for (let i = 1; i < residuals.length; i++) {
        accel.push(residuals[i] - residuals[i - 1]);
      }
      const meanAccel = accel.reduce((a, v) => a + Math.abs(v), 0) / accel.length;
      if (meanAccel > 0) {
        for (let i = 0; i < accel.length; i++) {
          if (accel[i] > meanAccel * 2.5 && i > accel.length * 0.5) {
            cliffLap = i + 2;
            break;
          }
        }
      }
    }

    // Severity classification
    const thr = DEG_THRESHOLDS[compound] || { low: 0.04, high: 0.08 };
    const severity: 'LOW' | 'MED' | 'HIGH' =
      degRate < thr.low ? 'LOW' : degRate < thr.high ? 'MED' : 'HIGH';

    compounds[compound] = {
      degRate: Math.round(degRate * 10000) / 10000,
      baseTime: Math.round(intercept * 1000) / 1000,
      laps: times.length,
      cliffLap,
      times: times.map(t => Math.round(t * 1000) / 1000),
      slope: Math.round(slope * 10000) / 10000,
      intercept: Math.round(intercept * 1000) / 1000,
      r2: Math.round(r2 * 1000) / 1000,
      severity,
      color: COMPOUND_COLORS[compound] || '#888',
    };
  }

  if (Object.keys(compounds).length === 0) return null;

  return { name, fullName, team, teamColor, compounds };
}

// ─── Aggregate Analysis ───────────────────────────────────────────────────────

function computeStintLengths(driverData: Record<string, DriverDegData>): Record<string, StintLength> {
  const degsByCompound: Record<string, number[]> = {};

  const TIME_LOSS_LIMITS: Record<string, number> = {
    SOFT: 1.5,
    MEDIUM: 2.0,
    HARD: 2.5,
    INTERMEDIATE: 2.0,
    WET: 2.0,
  };

  const DEFAULT_DEGS: Record<string, number> = {
    SOFT: 0.080,
    MEDIUM: 0.050,
    HARD: 0.030,
  };

  const COMPOUND_MAX_LAPS: Record<string, number> = {
    SOFT: 30,
    MEDIUM: 45,
    HARD: 65,
    INTERMEDIATE: 40,
    WET: 60,
  };

  for (const driver of Object.values(driverData)) {
    for (const [compound, d] of Object.entries(driver.compounds)) {
      if (!degsByCompound[compound]) degsByCompound[compound] = [];
      // Only include sensible degradation rates to avoid massive outliers
      if (d.degRate > 0.005 && d.degRate < 0.4) {
        degsByCompound[compound].push(d.degRate);
      }
    }
  }

  const result: Record<string, StintLength> = {};
  for (const compound of ['SOFT', 'MEDIUM', 'HARD']) {
    let degs = degsByCompound[compound];
    if (!degs || degs.length === 0) {
      // Fallback if no valid data exists for this compound in practice
      const baseDeg = DEFAULT_DEGS[compound] || 0.05;
      degs = [baseDeg * 0.8, baseDeg, baseDeg * 1.2]; // create a realistic spread
    }

    const limit = TIME_LOSS_LIMITS[compound] || 2.0;
    const compoundMaxLaps = COMPOUND_MAX_LAPS[compound] || 60;

    // We use the 20th percentile for best-case deg (highest laps)
    // and the 80th percentile for worst-case deg (lowest laps).
    // Bounded between 0.02 and 0.25 to prevent absurd numbers.
    const degMin = Math.max(percentile(degs, 20), 0.02);
    const degMax = Math.min(percentile(degs, 80), 0.25);
    const degMed = Math.max(median(degs), 0.02);

    const maxLaps = Math.min(Math.round(limit / degMin), compoundMaxLaps);
    const minLaps = Math.max(Math.round(limit / degMax), 5);
    const medLaps = Math.min(Math.round(limit / degMed), compoundMaxLaps);

    result[compound] = {
      min: Math.min(minLaps, maxLaps),
      max: Math.max(minLaps, maxLaps),
      median: medLaps,
      color: COMPOUND_COLORS[compound] || '#888',
    };
  }

  // Enforce logical tyre life hierarchy: SOFT < MEDIUM < HARD
  // Practice data can be noisy (e.g. drivers pushing harder on Hards, causing higher deg than Softs).
  // This ensures the visual output always follows the physical reality of the compounds.
  if (result['SOFT'] && result['MEDIUM']) {
    result['MEDIUM'].min = Math.min(Math.max(result['MEDIUM'].min, result['SOFT'].min + 4), COMPOUND_MAX_LAPS['MEDIUM']);
    result['MEDIUM'].max = Math.min(Math.max(result['MEDIUM'].max, result['SOFT'].max + 6), COMPOUND_MAX_LAPS['MEDIUM']);
    result['MEDIUM'].median = Math.min(Math.max(result['MEDIUM'].median, result['SOFT'].median + 5), COMPOUND_MAX_LAPS['MEDIUM']);
  }
  if (result['MEDIUM'] && result['HARD']) {
    result['HARD'].min = Math.min(Math.max(result['HARD'].min, result['MEDIUM'].min + 5), COMPOUND_MAX_LAPS['HARD']);
    result['HARD'].max = Math.min(Math.max(result['HARD'].max, result['MEDIUM'].max + 8), COMPOUND_MAX_LAPS['HARD']);
    result['HARD'].median = Math.min(Math.max(result['HARD'].median, result['MEDIUM'].median + 6), COMPOUND_MAX_LAPS['HARD']);
  }

  return result;
}

function simulateStrategies(
  driverData: Record<string, DriverDegData>,
  raceLaps: number,
  historicalStrategies: Record<string, number>
): StrategyResult[] {
  // Compute field-average deg rate and base time per compound
  const compoundStats: Record<string, { deg: number[]; base: number[] }> = {};

  for (const driver of Object.values(driverData)) {
    for (const [compound, d] of Object.entries(driver.compounds)) {
      if (!compoundStats[compound]) compoundStats[compound] = { deg: [], base: [] };
      if (d.degRate > 0.005 && d.degRate < 0.4) {
        compoundStats[compound].deg.push(d.degRate);
        compoundStats[compound].base.push(d.baseTime);
      }
    }
  }

  // Find a reference pace to extrapolate missing compounds
  let refPace = 90.0;
  for (const c of ['MEDIUM', 'SOFT', 'HARD']) {
    if (compoundStats[c] && compoundStats[c].base.length > 0) {
      refPace = median(compoundStats[c].base);
      if (c === 'MEDIUM') refPace -= 0.6;
      if (c === 'HARD') refPace -= 1.2;
      break;
    }
  }

  const DEFAULT_DEGS: Record<string, number> = { SOFT: 0.080, MEDIUM: 0.050, HARD: 0.030 };
  const PACE_OFFSETS: Record<string, number> = { SOFT: 0.0, MEDIUM: 0.6, HARD: 1.2 };

  const avg: Record<string, { deg: number; base: number }> = {};
  for (const compound of ['SOFT', 'MEDIUM', 'HARD']) {
    if (compoundStats[compound] && compoundStats[compound].deg.length > 0) {
      avg[compound] = {
        deg: median(compoundStats[compound].deg),
        base: median(compoundStats[compound].base),
      };
    } else {
      // Extrapolate missing compound data
      avg[compound] = {
        deg: DEFAULT_DEGS[compound] || 0.050,
        base: refPace + (PACE_OFFSETS[compound] || 0),
      };
    }
  }

  function stintTime(compound: string, laps: number): number | null {
    if (!avg[compound]) return null;
    const { base, deg } = avg[compound];
    return laps * base + deg * (laps * (laps + 1) / 2);
  }

  function simulate(compounds: string[]): number | null {
    const nStints = compounds.length;
    
    if (nStints === 1) {
      const t = stintTime(compounds[0], raceLaps);
      return t === null ? null : t;
    }

    if (nStints === 2) {
      let bestTime = Infinity;
      for (let i = 5; i <= raceLaps - 5; i++) {
        const t1 = stintTime(compounds[0], i);
        const t2 = stintTime(compounds[1], raceLaps - i);
        if (t1 !== null && t2 !== null) {
          const total = t1 + t2 + PIT_LOSS;
          if (total < bestTime) bestTime = total;
        }
      }
      return bestTime === Infinity ? null : bestTime;
    }

    if (nStints === 3) {
      let bestTime = Infinity;
      for (let i = 5; i <= raceLaps - 10; i++) {
        for (let j = i + 5; j <= raceLaps - 5; j++) {
          const t1 = stintTime(compounds[0], i);
          const t2 = stintTime(compounds[1], j - i);
          const t3 = stintTime(compounds[2], raceLaps - j);
          if (t1 !== null && t2 !== null && t3 !== null) {
            const total = t1 + t2 + t3 + 2 * PIT_LOSS;
            if (total < bestTime) bestTime = total;
          }
        }
      }
      return bestTime === Infinity ? null : bestTime;
    }

    if (nStints === 4) {
      let bestTime = Infinity;
      for (let i = 5; i <= raceLaps - 15; i++) {
        for (let j = i + 5; j <= raceLaps - 10; j++) {
          for (let k = j + 5; k <= raceLaps - 5; k++) {
            const t1 = stintTime(compounds[0], i);
            const t2 = stintTime(compounds[1], j - i);
            const t3 = stintTime(compounds[2], k - j);
            const t4 = stintTime(compounds[3], raceLaps - k);
            if (t1 !== null && t2 !== null && t3 !== null && t4 !== null) {
              const total = t1 + t2 + t3 + t4 + 3 * PIT_LOSS;
              if (total < bestTime) bestTime = total;
            }
          }
        }
      }
      return bestTime === Infinity ? null : bestTime;
    }

    return null;
  }

  const templatesToTest = [...STRATEGY_TEMPLATES];
  for (const label of Object.keys(historicalStrategies)) {
    if (!templatesToTest.some(t => t.label === label)) {
      const parts = label.split('·')[1];
      if (parts) {
        const chars = parts.split('→').map(s => s.trim());
        const mapping: Record<string, string> = { 'S': 'SOFT', 'M': 'MEDIUM', 'H': 'HARD', 'I': 'INTERMEDIATE', 'W': 'WET' };
        const comps = chars.map(c => mapping[c]).filter(Boolean);
        if (comps.length === chars.length) {
          templatesToTest.push({ label, compounds: comps });
        }
      }
    }
  }

  const results: StrategyResult[] = [];
  for (const tmpl of templatesToTest) {
    const t = simulate(tmpl.compounds);
    if (t !== null) {
      results.push({
        label: tmpl.label,
        time: Math.round(t * 10) / 10,
        delta: 0,
        optimal: false,
        historicalCount: historicalStrategies[tmpl.label] || 0
      });
    }
  }

  if (results.length === 0) return [];

  results.sort((a, b) => a.time - b.time);
  const bestTime = results[0].time;

  for (const r of results) {
    r.delta = Math.round((r.time - bestTime) * 10) / 10;
    r.optimal = r.delta === 0;
  }

  return results;
}

// ─── Main Analysis Function ───────────────────────────────────────────────────

export async function analyseTyreData(
  sessionKey: number,
  sessionLabel: string,
  gpName?: string,
): Promise<TyreAnalysisResult> {

  const [laps, drivers, stints] = await Promise.all([
    fetchSessionLaps(sessionKey),
    fetchSessionDrivers(sessionKey),
    fetchSessionStints(sessionKey),
  ]);

  if (laps.length === 0) {
    return { drivers: {}, stintLengths: {}, strategies: [], sessionLabel };
  }

  // Determine current track name for Supabase lookup
  let currentTrack = gpName || '';
  if (gpName) {
    const sessionRes = await fetchT(`${OPENF1_URL}/sessions?session_key=${sessionKey}`);
    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      if (sessionData && sessionData[0] && sessionData[0].circuit_short_name) {
        currentTrack = sessionData[0].circuit_short_name;
      }
    }
  }

  // Fetch historical strategies from Supabase for the current track
  const historicalStrategies: Record<string, number> = {};
  try {
    const { data: pastStints, error } = await supabase
      .from('track_pit_strategies') // Adjust view name if different
      .select('*')
      .eq('circuit_short_name', currentTrack)
      .eq('session_type', 'Race')
      .order('year', { ascending: false })
      .order('driver_number', { ascending: true })
      .order('stint_number', { ascending: true });

    if (!error && pastStints && pastStints.length > 0) {
      // Find the most recent year we have data for at this track
      const latestYear = pastStints[0].year;
      const recentStints = pastStints.filter(s => s.year === latestYear);

      const driverStints: Record<number, string[]> = {};
      
      for (const s of recentStints) {
        if (!s.compound || s.compound === 'UNKNOWN') continue;
        if (!driverStints[s.driver_number]) driverStints[s.driver_number] = [];
        driverStints[s.driver_number][s.stint_number - 1] = s.compound;
      }
      
      for (const comps of Object.values(driverStints)) {
        // Remove nulls and get short compound letter
        const validComps = comps.filter(Boolean).map(c => c[0].toUpperCase());
        if (validComps.length > 0) {
          const stops = validComps.length - 1;
          const label = `${stops}-stop · ${validComps.join(' → ')}`;
          historicalStrategies[label] = (historicalStrategies[label] || 0) + 1;
        }
      }
    }
  } catch (e) {
    console.warn("Failed to fetch historical strategies from Supabase", e);
  }

  // Merge stints into laps
  for (const lap of laps) {
    const stint = stints.find(s => 
      s.driver_number === lap.driver_number &&
      lap.lap_number >= s.lap_start &&
      lap.lap_number <= s.lap_end
    );
    if (stint) {
      lap.compound = stint.compound;
      lap.stint = stint.stint_number;
    }
  }

  // Build a map from driver number to driver info
  const driverMap = new Map<number, OpenF1Driver>();
  for (const d of drivers) {
    driverMap.set(d.driver_number, d);
  }

  // Get unique driver numbers from the lap data
  const driverNumbers = [...new Set(laps.map(l => l.driver_number))];

  // Extract stints for each driver
  const driverData: Record<string, DriverDegData> = {};
  for (const num of driverNumbers) {
    const info = driverMap.get(num);
    const result = extractStintsForDriver(laps, num, info);
    if (result) {
      driverData[result.name] = result;
    }
  }

  // Compute aggregates
  const stintLengths = computeStintLengths(driverData);

  // Determine race laps for strategy simulation
  let raceLaps = DEFAULT_RACE_LAPS;
  if (gpName) {
    for (const [key, laps] of Object.entries(RACE_LAPS)) {
      if (gpName.toLowerCase().includes(key.toLowerCase())) {
        raceLaps = laps;
        break;
      }
    }
  }

  const strategies = simulateStrategies(driverData, raceLaps, historicalStrategies);

  return { drivers: driverData, stintLengths, strategies, sessionLabel };
}
