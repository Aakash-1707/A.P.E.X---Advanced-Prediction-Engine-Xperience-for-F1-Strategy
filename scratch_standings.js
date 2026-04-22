

const OPENF1_URL = 'https://api.openf1.org/v1';
const STANDINGS_YEAR = 2026;

async function fetchT(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

async function pickStandingsYear() {
  try {
    const r = await fetchT(`${OPENF1_URL}/sessions?year=${STANDINGS_YEAR}`);
    if (!r.ok) return null;
    const sessions = await r.json();
    if (!Array.isArray(sessions) || sessions.length === 0) return null;
    return { year: STANDINGS_YEAR, sessions };
  } catch (_) {
    return null;
  }
}

async function fetchDriverRosterForSession(sessionKey) {
  const res = await fetchT(`${OPENF1_URL}/drivers?session_key=${sessionKey}`);
  if (!res.ok) throw new Error('Failed to fetch OpenF1 drivers');
  const drivers = await res.json();

  const seen = new Set();
  return drivers.filter(d => {
    if (seen.has(d.driver_number)) return false;
    seen.add(d.driver_number);
    return true;
  });
}

async function run() {
  const picked = await pickStandingsYear();
  if (!picked) throw new Error('No OpenF1 season with completed races available');

  const latestSession = picked.sessions.reduce((p, c) =>
    new Date(c.date_start) > new Date(p.date_start) ? c : p
  );
  console.log("Latest session:", latestSession.session_key);
  const roster = await fetchDriverRosterForSession(latestSession.session_key);

  const raceSessions = picked.sessions.filter(s =>
    s.session_name === 'Race' || s.session_name === 'Sprint'
  );
  
  console.log("Race sessions:", raceSessions.map(s => s.session_key));

  const keysParam = raceSessions.map(s => `session_key=${s.session_key}`).join('&');

  let results = [];
  let rosterRaw = [];
  
  try {
    const [rRes, rDrv] = await Promise.all([
      fetchT(`${OPENF1_URL}/session_result?${keysParam}`, 15000),
      fetchT(`${OPENF1_URL}/drivers?${keysParam}`, 15000),
    ]);
    if (rRes.ok) results = await rRes.json();
    if (rDrv.ok) rosterRaw = await rDrv.json();
  } catch (e) {
    console.error("Bulk fetch error", e);
  }

  const rosterMap = new Map();
  // Map session_key -> (driver_number -> driver_info)
  for (const r of rosterRaw) {
    if (!rosterMap.has(r.session_key)) {
      rosterMap.set(r.session_key, new Map());
    }
    rosterMap.get(r.session_key).set(r.driver_number, r);
  }

  const pointsByDriver = new Map();
  const pointsByTeam = new Map();

  let totalResultsProcessed = 0;
  for (const row of results) {
    totalResultsProcessed++;
    if (!row || typeof row.driver_number !== 'number') continue;
    const pts = typeof row.points === 'number' ? row.points : 0;

    pointsByDriver.set(
      row.driver_number,
      (pointsByDriver.get(row.driver_number) || 0) + pts
    );

    const sessionRoster = rosterMap.get(row.session_key);
    const drv = sessionRoster ? sessionRoster.get(row.driver_number) : null;
    const team = drv?.team_name;
    
    if (team) {
      const ex = pointsByTeam.get(team) || { points: 0 };
      ex.points += pts;
      pointsByTeam.set(team, ex);
    }
  }
  console.log("Total results processed:", totalResultsProcessed);


  const drivers = roster
    .map(d => ({
      name: d.full_name || `${d.first_name} ${d.last_name}`,
      team: d.team_name || 'Unknown',
      points: pointsByDriver.get(d.driver_number) || 0,
    }))
    .sort((a, b) => b.points - a.points);
    
  console.log("Drivers:", drivers.slice(0, 3));
  
  const constructors = Array.from(pointsByTeam.entries())
    .map(([name, v]) => ({ name, points: v.points }))
    .sort((a, b) => b.points - a.points);
    
  console.log("Constructors:", constructors.slice(0, 3));
}

run().catch(console.error);
