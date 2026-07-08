/**
 * Server-side 2026 championship standings from OpenF1.
 * Avoids browser timeouts / rate limits from 30+ client requests.
 */

const OPENF1_URL = 'https://api.openf1.org/v1';
const STANDINGS_YEAR = 2026;

const TEAM_COLORS = {
  mclaren: '#FF8000',
  ferrari: '#E8002D',
  mercedes: '#00B2A9',
  'red bull': '#1E5BC6',
  'aston martin': '#229971',
  alpine: '#2293D1',
  williams: '#1868DB',
  'racing bulls': '#6692FF',
  haas: '#B6BABD',
  audi: '#52E252',
  cadillac: '#C0C0C0',
};

function teamColor(name) {
  const n = String(name || '').toLowerCase();
  for (const [key, color] of Object.entries(TEAM_COLORS)) {
    if (n.includes(key)) return color;
  }
  return '#6b7280';
}

function parsePoints(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function completedScoringSessions(sessions) {
  const now = Date.now();
  return sessions.filter((s) => {
    if (s.session_name !== 'Race' && s.session_name !== 'Sprint') return false;
    if (!s.date_end) return false;
    return new Date(s.date_end).getTime() < now;
  });
}

async function fetchJson(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function computeStandings() {
  const sessions = await fetchJson(`${OPENF1_URL}/sessions?year=${STANDINGS_YEAR}`);
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error('No 2026 sessions on OpenF1');
  }

  const raceSessions = completedScoringSessions(sessions);
  if (raceSessions.length === 0) {
    throw new Error('No completed Race/Sprint sessions yet');
  }

  const latestSession = sessions.reduce((p, c) =>
    new Date(c.date_start) > new Date(p.date_start) ? c : p
  );

  const keysParam = raceSessions.map((s) => `session_key=${s.session_key}`).join('&');
  const [results, rosterRaw, latestRoster] = await Promise.all([
    fetchJson(`${OPENF1_URL}/session_result?${keysParam}`),
    fetchJson(`${OPENF1_URL}/drivers?${keysParam}`),
    fetchJson(`${OPENF1_URL}/drivers?session_key=${latestSession.session_key}`),
  ]);

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('OpenF1 returned no session results');
  }

  const rosterBySession = new Map();
  for (const r of rosterRaw) {
    if (!rosterBySession.has(r.session_key)) rosterBySession.set(r.session_key, new Map());
    const m = rosterBySession.get(r.session_key);
    if (!m.has(r.driver_number)) m.set(r.driver_number, r);
  }

  const pointsByDriver = new Map();
  const pointsByTeam = new Map();

  for (const row of results) {
    const driverNumber = Number(row?.driver_number);
    if (!Number.isFinite(driverNumber)) continue;
    const pts = parsePoints(row.points);
    pointsByDriver.set(driverNumber, (pointsByDriver.get(driverNumber) || 0) + pts);

    const drv = rosterBySession.get(row.session_key)?.get(driverNumber);
    const team = drv?.team_name;
    if (team) {
      const ex = pointsByTeam.get(team) || { points: 0, color: teamColor(team) };
      ex.points += pts;
      pointsByTeam.set(team, ex);
    }
  }

  const seen = new Set();
  const roster = latestRoster.filter((d) => {
    if (seen.has(d.driver_number)) return false;
    seen.add(d.driver_number);
    return true;
  });

  const drivers = roster
    .map((d) => {
      const team = d.team_name || 'Unknown';
      const color = d.team_colour ? `#${d.team_colour}` : teamColor(team);
      return {
        pos: 0,
        name: d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim(),
        team,
        points: pointsByDriver.get(d.driver_number) || 0,
        abbr: d.name_acronym || '',
        number: d.driver_number,
        color,
      };
    })
    .sort((a, b) => b.points - a.points)
    .map((d, i) => ({ ...d, pos: i + 1 }));

  const total = drivers.reduce((s, d) => s + d.points, 0);
  if (total === 0) {
    throw new Error('Standings summed to zero');
  }

  const constructors = Array.from(pointsByTeam.entries())
    .map(([name, v]) => ({ pos: 0, name, points: v.points, color: v.color }))
    .sort((a, b) => b.points - a.points)
    .map((c, i) => ({ ...c, pos: i + 1 }));

  return { drivers, constructors, source: 'openf1', completedRaceCount: raceSessions.length };
}

// In-memory cache inside the warm lambda (~5 min).
let cache = null;

export const handler = async () => {
  const headers = {
    'content-type': 'application/json',
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*',
  };

  try {
    if (cache && Date.now() < cache.expires) {
      return { statusCode: 200, headers, body: JSON.stringify(cache.data) };
    }

    const data = await computeStandings();
    cache = { data, expires: Date.now() + 5 * 60 * 1000 };
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: String(err?.message || err) }),
    };
  }
};
