import { Race } from '../data/mock';
import { fetchT } from './f1';
import { supabase } from '../lib/supabase';

const OPENMETEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPENMETEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

const WEATHER_CACHE_TTL = 30 * 60 * 1000;

export interface WeatherData {
  trackTemp: number | null;
  airTemp: number | null;
  rainProb: number | null;
  humidity: number | null;
  windSpeed: number | null;
  rainfall: boolean;
  source: 'supabase' | 'openmeteo-forecast' | 'openmeteo-climate' | 'fallback';
  confidence: 'live' | 'forecast' | 'climatology';
  asOf: string;
}

// ── Circuit coordinates ───────────────────────────────────────────────
// Matched on (a) exact GP name, then (b) fuzzy by country.
// Coordinates are the actual circuit location, not the nearest city,
// so track-surface temps reflect the real micro-climate at the venue.
const CIRCUIT_COORDS: Record<string, [number, number]> = {
  'Australian Grand Prix':       [-37.8497, 144.9680],
  'Chinese Grand Prix':          [ 31.3389, 121.2200],
  'Japanese Grand Prix':         [ 34.8431, 136.5406],
  'Bahrain Grand Prix':          [ 26.0325,  50.5106],
  'Saudi Arabian Grand Prix':    [ 21.6319,  39.1044],
  'Miami Grand Prix':            [ 25.9581, -80.2389],
  'Emilia Romagna Grand Prix':   [ 44.3439,  11.7167],
  'Monaco Grand Prix':           [ 43.7347,   7.4206],
  'Spanish Grand Prix':          [ 41.5700,   2.2611],
  'Canadian Grand Prix':         [ 45.5000, -73.5228],
  'Austrian Grand Prix':         [ 47.2197,  14.7647],
  'British Grand Prix':          [ 52.0786,  -1.0169],
  'Belgian Grand Prix':          [ 50.4372,   5.9714],
  'Hungarian Grand Prix':        [ 47.5789,  19.2486],
  'Dutch Grand Prix':            [ 52.3888,   4.5409],
  'Italian Grand Prix':          [ 45.6156,   9.2811],
  'Azerbaijan Grand Prix':       [ 40.3725,  49.8533],
  'Singapore Grand Prix':        [  1.2914, 103.8642],
  'United States Grand Prix':    [ 30.1328, -97.6411],
  'Mexico City Grand Prix':      [ 19.4042, -99.0907],
  'Mexican Grand Prix':          [ 19.4042, -99.0907],
  'Brazilian Grand Prix':        [-23.7036, -46.6997],
  'São Paulo Grand Prix':        [-23.7036, -46.6997],
  'Sao Paulo Grand Prix':        [-23.7036, -46.6997],
  'Las Vegas Grand Prix':        [ 36.1147, -115.1728],
  'Qatar Grand Prix':            [ 25.4900,  51.4542],
  'Abu Dhabi Grand Prix':        [ 24.4672,  54.6031],
};

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Australia':      [-37.8497, 144.9680],
  'China':          [ 31.3389, 121.2200],
  'Japan':          [ 34.8431, 136.5406],
  'Bahrain':        [ 26.0325,  50.5106],
  'Saudi Arabia':   [ 21.6319,  39.1044],
  'Monaco':         [ 43.7347,   7.4206],
  'Spain':          [ 41.5700,   2.2611],
  'Canada':         [ 45.5000, -73.5228],
  'Austria':        [ 47.2197,  14.7647],
  'United Kingdom': [ 52.0786,  -1.0169],
  'UK':             [ 52.0786,  -1.0169],
  'Belgium':        [ 50.4372,   5.9714],
  'Hungary':        [ 47.5789,  19.2486],
  'Netherlands':    [ 52.3888,   4.5409],
  'Italy':          [ 45.6156,   9.2811],
  'Azerbaijan':     [ 40.3725,  49.8533],
  'Singapore':      [  1.2914, 103.8642],
  'Mexico':         [ 19.4042, -99.0907],
  'Brazil':         [-23.7036, -46.6997],
  'Qatar':          [ 25.4900,  51.4542],
  'UAE':            [ 24.4672,  54.6031],
  'Abu Dhabi':      [ 24.4672,  54.6031],
};

export function getCircuitCoords(race: Race): [number, number] | null {
  if (CIRCUIT_COORDS[race.name]) return CIRCUIT_COORDS[race.name];

  const lower = race.name.toLowerCase();
  for (const [key, coords] of Object.entries(CIRCUIT_COORDS)) {
    const keyLower = key.toLowerCase();
    if (lower.includes(keyLower.replace(' grand prix', ''))) return coords;
  }

  if (COUNTRY_COORDS[race.country]) return COUNTRY_COORDS[race.country];
  return null;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < WEATHER_CACHE_TTL) return data as T;
  } catch (_) {}
  return null;
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (_) {}
}

// ── Supabase `weather` table (the canonical live/historical source) ───
// Table schema (OpenF1-compatible, imported via pipeline):
//   date timestamptz, session_key int4, meeting_key int4,
//   air_temperature float8, track_temperature float8, rainfall float8,
//   humidity float8, wind_speed float8, wind_direction int4, pressure float8
async function fetchSupabaseWeather(meetingKey: number): Promise<WeatherData | null> {
  const { data, error } = await supabase
    .from('weather')
    .select('air_temperature, track_temperature, rainfall, humidity, wind_speed, date')
    .eq('meeting_key', meetingKey);

  if (error) {
    console.warn('[weather] supabase query failed:', error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Average across every sample in the meeting so the cards reflect the
  // typical conditions across FP1–Race, not one transient spike.
  const avg = (key: keyof typeof data[number]) => {
    const vals = data
      .map((r: any) => r[key])
      .filter((v: any) => typeof v === 'number' && !Number.isNaN(v));
    if (vals.length === 0) return null;
    return vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
  };

  // Rainfall is stored as float (OpenF1 uses 0/1; some pipelines store mm).
  // Rain probability = share of samples where any precipitation was recorded.
  const rainCount = data.filter((r: any) =>
    typeof r.rainfall === 'number' && r.rainfall > 0
  ).length;
  const rainShare = rainCount / data.length;

  const latestDate = data.reduce((acc: string | null, r: any) => {
    if (!r.date) return acc;
    return !acc || new Date(r.date) > new Date(acc) ? r.date : acc;
  }, null);

  return {
    trackTemp: avg('track_temperature'),
    airTemp: avg('air_temperature'),
    rainProb: Math.round(rainShare * 100),
    humidity: avg('humidity'),
    windSpeed: avg('wind_speed'),
    rainfall: rainShare > 0.2,
    source: 'supabase',
    confidence: 'live',
    asOf: latestDate ?? new Date().toISOString(),
  };
}

// ── Open-Meteo forecast (up to 16 days ahead) ─────────────────────────
async function fetchOpenMeteoForecast(
  lat: number,
  lng: number,
  raceDate: Date
): Promise<WeatherData | null> {
  const dateStr = raceDate.toISOString().slice(0, 10);
  const url =
    `${OPENMETEO_FORECAST_URL}?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,precipitation_probability_max,windspeed_10m_max,relative_humidity_2m_mean` +
    `&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

  const res = await fetchT(url, 8000);
  if (!res.ok) return null;
  const json = await res.json();
  const d = json?.daily;
  if (!d || !Array.isArray(d.time) || d.time.length === 0) return null;

  const airTemp = d.temperature_2m_max?.[0] ?? null;
  const rainProb = d.precipitation_probability_max?.[0] ?? null;
  const windSpeed = d.windspeed_10m_max?.[0] ?? null;
  const humidity = d.relative_humidity_2m_mean?.[0] ?? null;

  // Track temperature is not directly forecastable — estimate from air
  // temp using a +10 °C asphalt-solar-gain heuristic (daytime race).
  // Night races (Singapore, Bahrain, Qatar, Saudi, Vegas) use +3 °C.
  const nightRaceHint = raceDate.getUTCHours() >= 12;
  const trackOffset = nightRaceHint ? 10 : 3;
  const trackTemp = typeof airTemp === 'number' ? airTemp + trackOffset : null;

  return {
    trackTemp,
    airTemp,
    rainProb,
    humidity,
    windSpeed,
    rainfall: typeof rainProb === 'number' && rainProb > 50,
    source: 'openmeteo-forecast',
    confidence: 'forecast',
    asOf: new Date().toISOString(),
  };
}

// ── Open-Meteo archive (use last year's weather as climatology when
//    the race is more than ~16 days out and no forecast exists yet) ──
async function fetchOpenMeteoClimatology(
  lat: number,
  lng: number,
  raceDate: Date
): Promise<WeatherData | null> {
  const lastYear = new Date(raceDate);
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  const dateStr = lastYear.toISOString().slice(0, 10);

  const url =
    `${OPENMETEO_ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
    `&daily=temperature_2m_max,precipitation_sum,windspeed_10m_max,relative_humidity_2m_mean` +
    `&start_date=${dateStr}&end_date=${dateStr}&timezone=auto`;

  const res = await fetchT(url, 8000);
  if (!res.ok) return null;
  const json = await res.json();
  const d = json?.daily;
  if (!d || !Array.isArray(d.time) || d.time.length === 0) return null;

  const airTemp = d.temperature_2m_max?.[0] ?? null;
  const precip = d.precipitation_sum?.[0] ?? 0;
  const windSpeed = d.windspeed_10m_max?.[0] ?? null;
  const humidity = d.relative_humidity_2m_mean?.[0] ?? null;

  // Convert rainfall mm to a rough probability: any measurable rain
  // last year → high expectation this year; trace/dry → low.
  const rainProb = precip > 5 ? 70 : precip > 1 ? 35 : precip > 0.1 ? 15 : 5;
  const trackTemp = typeof airTemp === 'number' ? airTemp + 10 : null;

  return {
    trackTemp,
    airTemp,
    rainProb,
    humidity,
    windSpeed,
    rainfall: precip > 1,
    source: 'openmeteo-climate',
    confidence: 'climatology',
    asOf: new Date().toISOString(),
  };
}

// ── Public entry: resolves the best available weather source ──────────
export async function fetchRaceWeather(race: Race): Promise<WeatherData | null> {
  const cacheKey = `f1_weather_v2_${race.round}_${race.meeting_key ?? race.name}`;
  const cached = readCache<WeatherData>(cacheKey);
  if (cached) return cached;

  // 1. Supabase `weather` table — primary source for any race the pipeline
  //    has already ingested (includes completed, live, and any historical GP)
  if (race.meeting_key) {
    try {
      const sb = await fetchSupabaseWeather(race.meeting_key);
      if (sb) {
        writeCache(cacheKey, sb);
        return sb;
      }
    } catch (_) {}
  }

  const coords = getCircuitCoords(race);
  if (!coords) return null;
  const [lat, lng] = coords;

  // Parse race date — prefer ISO from calendar, fall back to "Mon DD" + year.
  let raceDate: Date | null = null;
  if (race.date_iso) raceDate = new Date(race.date_iso);
  if (!raceDate || Number.isNaN(raceDate.getTime())) {
    const fallback = new Date(`${race.date} ${new Date().getFullYear()}`);
    raceDate = Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  }

  const daysAway = (raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

  // 2. Within forecast window (-2 to +16 days) → Open-Meteo forecast
  if (daysAway >= -2 && daysAway <= 16) {
    try {
      const forecast = await fetchOpenMeteoForecast(lat, lng, raceDate);
      if (forecast) {
        writeCache(cacheKey, forecast);
        return forecast;
      }
    } catch (_) {}
  }

  // 3. Too far out → climatology from same date last year
  try {
    const clim = await fetchOpenMeteoClimatology(lat, lng, raceDate);
    if (clim) {
      writeCache(cacheKey, clim);
      return clim;
    }
  } catch (_) {}

  return null;
}
