/**
 * Supabase telemetry queries — single `telemetry` table
 *
 * Schema (all columns):
 *   session_label  TEXT
 *   session_key    INTEGER
 *   driver_number  INTEGER
 *   lap_number     INTEGER
 *   lap_duration_s FLOAT
 *   timestamp      TIMESTAMPTZ   ← per-sample time
 *   x, y, z        FLOAT         ← GPS
 *   speed          INTEGER
 *   throttle       INTEGER
 *   brake          INTEGER
 *   rpm            INTEGER
 *   n_gear         INTEGER
 *   drs            INTEGER
 *
 * One row = one telemetry sample for a given (session_key, driver_number, lap).
 * The Python ingest script stores only the fastest lap, so every
 * (session_key, driver_number) combination is already the fastest lap.
 */

import { supabase } from '../lib/supabase';

export interface TelemetryResult {
  lap: {
    lap_duration: number;
    date_start: string;
    lap_number: number | null;
  };
  carData: {
    date: string;
    speed: number;
    throttle: number;
    brake: number;
    rpm: number;
    n_gear: number;
    drs: number;
  }[];
  locData: {
    date: string;
    x: number;
    y: number;
    z: number;
  }[];
}

/**
 * Fetch all telemetry samples for a driver in a session from the single
 * `telemetry` table, then shape them into what Telemetry.tsx expects.
 */
export async function fetchTelemetryFromDB(
  sessionKey: number,
  driverNumber: number
): Promise<TelemetryResult | null> {
  // PostgREST/Supabase caps a single query at 1000 rows by default. A full
  // race lap of 10 Hz GPS + telemetry easily exceeds that, which caused
  // driver readouts to truncate or appear empty past the first ~1/3 of the
  // lap. Paginate with .range() until we've pulled every row.
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('telemetry')
      .select('timestamp, lap_duration_s, lap_number, speed, throttle, brake, rpm, n_gear, drs, x, y, z')
      .eq('session_key', sessionKey)
      .eq('driver_number', driverNumber)
      .order('timestamp', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      console.warn(
        `[Supabase] Error fetching telemetry for session=${sessionKey} driver=${driverNumber}:`,
        error.message
      );
      return null;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  if (rows.length === 0) {
    console.warn(
      `[Supabase] No telemetry rows for session=${sessionKey} driver=${driverNumber}`
    );
    return null;
  }

  // The imported CSVs can contain many laps per (session, driver). If we
  // trace every GPS sample as one polyline, we end up drawing multiple
  // overlapping laps + pit lane detours, which is what was making the track
  // outline look garbled and inconsistent.
  //
  // Pick the single fastest clean lap (lowest lap_duration_s with a sane
  // number of samples) and return only those rows.
  const byLap = new Map<number, any[]>();
  for (const r of rows) {
    const key = r.lap_number ?? -1;
    if (!byLap.has(key)) byLap.set(key, []);
    byLap.get(key)!.push(r);
  }

  let best: any[] | null = null;
  let bestDur = Infinity;
  for (const lapRows of byLap.values()) {
    // A clean flying lap will have at least ~50 samples; skip outliers.
    if (lapRows.length < 20) continue;
    const dur = lapRows[0].lap_duration_s;
    if (typeof dur !== 'number' || dur <= 0) continue;
    if (dur < bestDur) { bestDur = dur; best = lapRows; }
  }

  // Fallback: if we couldn't identify a "fastest" lap (e.g. lap_duration_s
  // is null everywhere), just pick the lap with the most samples.
  if (!best) {
    for (const lapRows of byLap.values()) {
      if (!best || lapRows.length > best.length) best = lapRows;
    }
  }

  const data = (best ?? rows).slice().sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const first = data[0];

  const lap = {
    lap_duration: first.lap_duration_s ?? 0,
    date_start:   first.timestamp,
    lap_number:   first.lap_number ?? null,
  };

  // Car telemetry — one entry per sample
  const carData = data.map(r => ({
    date:     r.timestamp,
    speed:    r.speed    ?? 0,
    throttle: r.throttle ?? 0,
    brake:    r.brake    ?? 0,
    rpm:      r.rpm      ?? 0,
    n_gear:   r.n_gear   ?? 0,
    drs:      r.drs      ?? 0,
  }));

  // GPS location — same rows, different columns
  const locData = data.map(r => ({
    date: r.timestamp,
    x:    r.x ?? 0,
    y:    r.y ?? 0,
    z:    r.z ?? 0,
  }));

  return { lap, carData, locData };
}
