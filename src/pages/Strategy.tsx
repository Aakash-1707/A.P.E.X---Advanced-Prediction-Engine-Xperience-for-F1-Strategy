import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/Card';
import { Circle, Flag, Trophy, Zap } from 'lucide-react';
import { Race } from '../data/mock';
import { fetchCalendar } from '../api/f1';
import { getFlagUrl } from '../lib/flags';

type Compound = 'S' | 'M' | 'H';
type Stint = { compound: Compound; laps: number };

// 2026 calendar circuit profile: typical race length and a representative clean lap.
// Lap times are rough baselines used only to rank strategies against each other.
const CIRCUIT_INFO: Record<string, { laps: number; baseLap: number }> = {
  'Sakhir': { laps: 57, baseLap: 90 },
  'Jeddah': { laps: 50, baseLap: 87 },
  'Melbourne': { laps: 58, baseLap: 77 },
  'Suzuka': { laps: 53, baseLap: 90 },
  'Shanghai': { laps: 56, baseLap: 92 },
  'Miami': { laps: 57, baseLap: 88 },
  'Imola': { laps: 63, baseLap: 75 },
  'Monaco': { laps: 78, baseLap: 72 },
  'Montréal': { laps: 70, baseLap: 74 },
  'Montreal': { laps: 70, baseLap: 74 },
  'Catalunya': { laps: 66, baseLap: 76 },
  'Barcelona-Catalunya': { laps: 66, baseLap: 76 },
  'Spielberg': { laps: 71, baseLap: 65 },
  'Red Bull Ring': { laps: 71, baseLap: 65 },
  'Silverstone': { laps: 52, baseLap: 86 },
  'Hungaroring': { laps: 70, baseLap: 76 },
  'Spa-Francorchamps': { laps: 44, baseLap: 106 },
  'Zandvoort': { laps: 72, baseLap: 71 },
  'Monza': { laps: 53, baseLap: 81 },
  'Baku': { laps: 51, baseLap: 103 },
  'Singapore': { laps: 62, baseLap: 92 },
  'Marina Bay': { laps: 62, baseLap: 92 },
  'COTA': { laps: 56, baseLap: 94 },
  'Austin': { laps: 56, baseLap: 94 },
  'Mexico City': { laps: 71, baseLap: 77 },
  'Interlagos': { laps: 71, baseLap: 71 },
  'São Paulo': { laps: 71, baseLap: 71 },
  'Las Vegas': { laps: 50, baseLap: 94 },
  'Losail': { laps: 57, baseLap: 84 },
  'Yas Marina': { laps: 58, baseLap: 85 },
};

const COUNTRY_CIRCUIT: Record<string, { laps: number; baseLap: number }> = {
  'Bahrain':       { laps: 57, baseLap: 90 },
  'Saudi Arabia':  { laps: 50, baseLap: 87 },
  'Australia':     { laps: 58, baseLap: 77 },
  'Japan':         { laps: 53, baseLap: 90 },
  'China':         { laps: 56, baseLap: 92 },
  'USA':           { laps: 56, baseLap: 94 },
  'United States': { laps: 56, baseLap: 94 },
  'Italy':         { laps: 53, baseLap: 81 },
  'Monaco':        { laps: 78, baseLap: 72 },
  'Spain':         { laps: 66, baseLap: 76 },
  'Canada':        { laps: 70, baseLap: 74 },
  'Austria':       { laps: 71, baseLap: 65 },
  'UK':            { laps: 52, baseLap: 86 },
  'United Kingdom':{ laps: 52, baseLap: 86 },
  'Hungary':       { laps: 70, baseLap: 76 },
  'Belgium':       { laps: 44, baseLap: 106 },
  'Netherlands':   { laps: 72, baseLap: 71 },
  'Azerbaijan':    { laps: 51, baseLap: 103 },
  'Singapore':     { laps: 62, baseLap: 92 },
  'Mexico':        { laps: 71, baseLap: 77 },
  'Brazil':        { laps: 71, baseLap: 71 },
  'Qatar':         { laps: 57, baseLap: 84 },
  'Abu Dhabi':     { laps: 58, baseLap: 85 },
  'UAE':           { laps: 58, baseLap: 85 },
};

function getCircuitInfo(race: Race | null): { laps: number; baseLap: number } {
  if (!race) return { laps: 56, baseLap: 85 };
  const byCircuit = CIRCUIT_INFO[race.location?.trim() ?? ''];
  if (byCircuit) return byCircuit;
  return COUNTRY_CIRCUIT[race.country] ?? { laps: 56, baseLap: 85 };
}

const compoundHex: Record<Compound, string> = {
  S: '#EF4444',
  M: '#F59E0B',
  H: '#D4D4D4',
};
const compoundLabel: Record<Compound, string> = { S: 'Soft', M: 'Medium', H: 'Hard' };

// Per-lap degradation, seconds per lap^2. Softer rubber deg faster.
const DEG: Record<Compound, number> = { S: 0.050, M: 0.030, H: 0.020 };
const PIT_LOSS = 22; // seconds lost per pit stop

function stintTime(stint: Stint, baseLap: number): number {
  // Σ_i (base + deg*(i-1)) for i=1..n  =>  n*base + deg*n*(n-1)/2
  const n = stint.laps;
  return n * baseLap + (DEG[stint.compound] * n * (n - 1)) / 2;
}

function totalTime(stints: Stint[], baseLap: number): number {
  const run = stints.reduce((t, s) => t + stintTime(s, baseLap), 0);
  return run + (stints.length - 1) * PIT_LOSS;
}

function formatRaceTime(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toFixed(1);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${s.padStart(4, '0')}`;
  return `${m}:${s.padStart(4, '0')}`;
}

// Rough optimal stint splits (softer tyres run shorter stints).
function buildStrategy(stops: number, totalLaps: number): Stint[] {
  if (stops === 1) {
    const m = Math.round(totalLaps * 0.42);
    return [
      { compound: 'M', laps: m },
      { compound: 'H', laps: totalLaps - m },
    ];
  }
  if (stops === 2) {
    const s1 = Math.round(totalLaps * 0.28);
    const s2 = Math.round(totalLaps * 0.34);
    return [
      { compound: 'S', laps: s1 },
      { compound: 'M', laps: s2 },
      { compound: 'H', laps: totalLaps - s1 - s2 },
    ];
  }
  const s1 = Math.round(totalLaps * 0.22);
  const s2 = Math.round(totalLaps * 0.24);
  const s3 = Math.round(totalLaps * 0.26);
  return [
    { compound: 'S', laps: s1 },
    { compound: 'S', laps: s2 },
    { compound: 'M', laps: s3 },
    { compound: 'H', laps: totalLaps - s1 - s2 - s3 },
  ];
}

export default function Strategy({ activeEvent }: { activeEvent?: number | null }) {
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(activeEvent ?? null);
  const gpScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCalendar().then(data => {
      setRaces(data);
      if (selectedRound == null) {
        const next =
          data.find(r => r.status === 'live') ??
          data.find(r => r.status === 'upcoming') ??
          data[data.length - 1];
        if (next) setSelectedRound(next.round);
      }
    });
  }, []);

  useEffect(() => {
    if (activeEvent) setSelectedRound(activeEvent);
  }, [activeEvent]);

  const currentRace = races.find(r => r.round === selectedRound) ?? null;
  const circuit = getCircuitInfo(currentRace);

  const [totalLaps, setTotalLaps] = useState(circuit.laps);
  const [stints, setStints] = useState<Stint[]>(() => buildStrategy(2, circuit.laps));

  // When the circuit changes, reset lap count and seed the builder with the 2-stop plan.
  useEffect(() => {
    setTotalLaps(circuit.laps);
    setStints(buildStrategy(2, circuit.laps));
  }, [circuit.laps]);

  const strategies = useMemo(() => {
    return [1, 2, 3].map(stops => {
      const stintArr = buildStrategy(stops, totalLaps);
      return { stops, stints: stintArr, time: totalTime(stintArr, circuit.baseLap) };
    });
  }, [totalLaps, circuit.baseLap]);

  const fastest = strategies.reduce((a, b) => (b.time < a.time ? b : a));

  const used = stints.reduce((a, s) => a + s.laps, 0);
  const customTime = useMemo(() => totalTime(stints, circuit.baseLap), [stints, circuit.baseLap]);
  const customDelta = customTime - fastest.time;

  const updateStint = (i: number, patch: Partial<Stint>) => {
    setStints(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const addStint = () => setStints(prev => [...prev, { compound: 'H', laps: 10 }]);
  const removeStint = (i: number) => setStints(prev => prev.filter((_, idx) => idx !== i));
  const applyStrategy = (s: Stint[]) => setStints(s.map(x => ({ ...x })));

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in space-y-8">
      <div>
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Race simulator · v1.2</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">Strategy</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl">
          {currentRace
            ? `Tyre strategy compare for ${currentRace.name} — ${circuit.laps} laps around ${currentRace.location}.`
            : 'Auto-generated one/two/three-stop strategies, ranked fastest-first. Tap one to tweak it below.'}
        </p>
      </div>

      {/* GP Picker */}
      <div>
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">Grand Prix</div>
        </div>
        <div className="relative">
          <button
            onClick={() => gpScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-md hover:scale-110 transition-all -ml-3"
            aria-label="Scroll left"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button
            onClick={() => gpScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-md hover:scale-110 transition-all -mr-3"
            aria-label="Scroll right"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>

          <div ref={gpScrollRef} className="flex overflow-x-auto scrollbar-hide gap-2 pb-2 scroll-smooth px-1">
            {races.length === 0 ? (
              <div className="text-xs text-neutral-400 animate-pulse py-10">Loading calendar…</div>
            ) : (
              races.filter(r => r.status !== 'cancelled').map(r => {
                const isSelected = selectedRound === r.round;
                const flagUrl = getFlagUrl(r);
                return (
                  <button
                    key={r.round}
                    onClick={() => setSelectedRound(r.round)}
                    className={`flex-shrink-0 flex flex-col items-start gap-2 px-4 py-4 rounded-2xl border transition-all duration-200 min-w-[calc(25%-6px)] min-h-[140px] relative overflow-hidden ${
                      isSelected
                        ? 'border-neutral-900 dark:border-white shadow-lg scale-105'
                        : 'border-black/10 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30'
                    }`}
                  >
                    {flagUrl && (
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${flagUrl})`, opacity: isSelected ? 1 : 0.85 }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                    <div className="absolute top-2 -left-2 z-10 leading-[0.75] select-none pointer-events-none opacity-50 mix-blend-overlay">
                      <span className="text-[180px] font-black text-white">{String(r.round).padStart(2, '0')}</span>
                    </div>
                    <span className="relative z-20 text-lg font-semibold leading-snug text-white drop-shadow-xl">{r.name}</span>
                    <div className="relative z-20 mt-auto">
                      {r.status === 'live' && <span className="inline-block px-2 py-1 text-[10px] font-bold text-white bg-red-500 rounded-md uppercase tracking-wider shadow-lg border border-red-400">Live</span>}
                      {r.status === 'completed' && <span className="inline-block px-2 py-1 text-[10px] font-bold text-white bg-black/40 backdrop-blur-md rounded-md uppercase tracking-wider shadow-lg border border-white/20">Completed</span>}
                      {r.status === 'upcoming' && <span className="inline-block px-2 py-1 text-[10px] font-bold text-white bg-white/20 backdrop-blur-md rounded-md uppercase tracking-wider shadow-lg border border-white/20">Upcoming</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Strategy compare */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">
            Strategy compare
            {currentRace && (
              <span className="ml-2 text-neutral-500 normal-case tracking-normal">
                · {totalLaps} laps · base lap {circuit.baseLap.toFixed(1)}s
              </span>
            )}
          </div>
          <div className="text-[10px] text-neutral-400 dark:text-neutral-500">Click a card to load it into the builder</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {strategies.map(s => {
            const isFastest = s.stops === fastest.stops;
            const delta = s.time - fastest.time;
            return (
              <button
                key={s.stops}
                onClick={() => applyStrategy(s.stints)}
                className={`group relative text-left p-5 rounded-2xl border transition-all overflow-hidden ${
                  isFastest
                    ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent shadow-lg'
                    : 'border-black/10 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30 hover:shadow-md'
                }`}
              >
                {isFastest && (
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                    <Trophy className="w-3 h-3" />
                    Fastest
                  </div>
                )}
                <div
                  aria-hidden
                  className={`absolute -right-8 -top-8 w-28 h-28 rounded-full blur-3xl transition-opacity ${isFastest ? 'opacity-60' : 'opacity-0 group-hover:opacity-30'}`}
                  style={{ background: isFastest ? '#10b98155' : '#ffffff22' }}
                />
                <div className="relative">
                  <div className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400 font-semibold">
                    {s.stops}-stop
                  </div>
                  <div className="mt-2 text-3xl font-light text-neutral-900 dark:text-white tabular-nums">
                    {formatRaceTime(s.time)}
                  </div>
                  <div className="mt-1 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    {isFastest ? 'Baseline' : `+${delta.toFixed(1)}s slower`}
                  </div>
                  <div className="mt-4 h-9 rounded-lg overflow-hidden flex shadow-inner">
                    {s.stints.map((st, i) => {
                      const w = (st.laps / totalLaps) * 100;
                      return (
                        <div
                          key={i}
                          className="h-full flex items-center justify-center text-[10px] font-bold relative"
                          style={{ width: `${w}%`, background: compoundHex[st.compound], color: st.compound === 'H' ? '#111' : '#fff' }}
                        >
                          {w > 12 && <span>{st.compound}·{st.laps}L</span>}
                          {i < s.stints.length - 1 && (
                            <div className="absolute right-0 top-0 h-full w-[2px] bg-white/90 dark:bg-black/90" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span className="font-medium">{s.stints.map(x => x.compound).join(' → ')}</span>
                    <span>·</span>
                    <span>{s.stops}× pit ({s.stops * PIT_LOSS}s)</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom builder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Configuration</div>
            <Zap className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />
          </div>

          <label className="block mb-5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">Race distance</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={80}
                value={totalLaps}
                onChange={(e) => setTotalLaps(Number(e.target.value))}
                className="flex-1 accent-neutral-900 dark:accent-white"
              />
              <div className="w-14 text-right text-sm text-neutral-900 dark:text-white tabular-nums">{totalLaps} laps</div>
            </div>
            {currentRace && totalLaps !== circuit.laps && (
              <button
                onClick={() => setTotalLaps(circuit.laps)}
                className="mt-2 text-[10px] text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
              >
                Reset to {currentRace.location} default ({circuit.laps}L)
              </button>
            )}
          </label>

          <div className="space-y-3 mt-6">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Stints</div>
            {stints.map((s, i) => (
              <div key={i} className="p-3 rounded-xl bg-neutral-50 dark:bg-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Stint {i + 1}</span>
                  {stints.length > 1 && (
                    <button onClick={() => removeStint(i)} className="text-xs text-neutral-400 hover:text-red-500 transition-colors">
                      Remove
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {(['S', 'M', 'H'] as Compound[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => updateStint(i, { compound: c })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all border ${
                        s.compound === c
                          ? 'bg-white dark:bg-neutral-900 border-black/10 dark:border-white/10 text-neutral-900 dark:text-white'
                          : 'bg-transparent border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Circle className="w-2 h-2" style={{ color: compoundHex[c] }} fill="currentColor" />
                        {compoundLabel[c]}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={3}
                    max={60}
                    value={s.laps}
                    onChange={(e) => updateStint(i, { laps: Number(e.target.value) })}
                    className="flex-1 accent-neutral-900 dark:accent-white"
                  />
                  <div className="w-10 text-right text-xs text-neutral-900 dark:text-white tabular-nums">{s.laps}L</div>
                </div>
              </div>
            ))}
            <button
              onClick={addStint}
              className="w-full py-2 rounded-xl border border-dashed border-black/10 dark:border-white/10 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
            >
              + Add stint
            </button>
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="mb-6">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Projected race</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Laps covered {used}/{totalLaps}{' '}
              {used !== totalLaps && <span className="text-amber-600 dark:text-amber-400">· mismatch</span>}
            </div>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <span>Lap 1</span>
              <span>Lap {totalLaps}</span>
            </div>
            <div className="relative h-10 rounded-xl overflow-hidden bg-neutral-100 dark:bg-white/5 flex">
              {stints.map((s, i) => {
                const denom = Math.max(used, totalLaps);
                const width = (s.laps / denom) * 100;
                return (
                  <div
                    key={i}
                    className="h-full flex items-center justify-center text-[10px] font-bold relative"
                    style={{
                      width: `${width}%`,
                      background: compoundHex[s.compound],
                      color: s.compound === 'H' ? '#111' : '#fff',
                      opacity: 0.9,
                    }}
                  >
                    {width > 8 && (
                      <span>
                        {compoundLabel[s.compound]} · {s.laps}L
                      </span>
                    )}
                    {i < stints.length - 1 && (
                      <div className="absolute right-0 top-0 h-full w-[2px] bg-white dark:bg-black" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-neutral-500 dark:text-neutral-400">
              <Flag className="w-3 h-3" />
              <span>{stints.length - 1} pit stop{stints.length - 1 !== 1 ? 's' : ''} · ~22s per stop</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Projected race time</div>
              <div className="text-xl font-light text-neutral-900 dark:text-white mt-1 tabular-nums">{formatRaceTime(customTime)}</div>
              <div className={`text-[10px] mt-1 tabular-nums ${customDelta <= 0.5 ? 'text-emerald-500' : 'text-amber-500'}`}>
                {customDelta <= 0.5 ? 'At the optimal pace' : `+${customDelta.toFixed(1)}s vs fastest`}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Expected avg lap</div>
              <div className="text-xl font-light text-neutral-900 dark:text-white mt-1 tabular-nums">
                {used > 0 ? formatAvgLap(customTime / used) : '—'}
              </div>
              <div className="text-[10px] mt-1 text-neutral-500 dark:text-neutral-400">Including pit losses</div>
            </div>
            <div className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Risk level</div>
              <div className="text-xl font-light text-neutral-900 dark:text-white mt-1">
                {riskLabel(stints)}
              </div>
              <div className="text-[10px] mt-1 text-neutral-500 dark:text-neutral-400">
                {stints.length > 3 ? 'Many pit exposures' : 'Typical exposure'}
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-3">Pit stop timeline</div>
            <div className="space-y-3">
              {stints.slice(0, -1).map((_, i) => {
                const lap = stints.slice(0, i + 1).reduce((a, s) => a + s.laps, 0);
                return (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-xl border border-black/5 dark:border-white/5">
                    <div className="w-8 h-8 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black flex items-center justify-center text-xs font-semibold">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-neutral-900 dark:text-white">Pit stop · Lap {lap}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">Switch to {compoundLabel[stints[i + 1].compound]} compound</div>
                    </div>
                    <div className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">+{PIT_LOSS.toFixed(1)}s</div>
                  </div>
                );
              })}
              {stints.length === 1 && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400 italic">No pit stops — single stint race.</div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function formatAvgLap(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

function riskLabel(stints: Stint[]): string {
  if (stints.length <= 1) return 'High';
  if (stints.length === 2) return 'Low';
  if (stints.length === 3) return 'Medium';
  return 'High';
}
