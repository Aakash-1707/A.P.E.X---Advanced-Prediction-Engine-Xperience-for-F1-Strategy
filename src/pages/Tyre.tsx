import { useState, useEffect, useRef, useMemo } from 'react';
import { Circle } from 'lucide-react';
import { fetchCalendar, fetchOpenF1Sessions } from '../api/f1';
import { analyseTyreData, TyreAnalysisResult, COMPOUND_COLORS } from '../api/tyre-analysis';
import { getFlagUrl } from '../lib/flags';

type Props = { activeEvent?: number | null };

const COMPOUND_LABELS: Record<string, string> = { SOFT: 'Soft', MEDIUM: 'Medium', HARD: 'Hard', INTERMEDIATE: 'Inter', WET: 'Wet' };
const COMPOUND_ORDER = ['SOFT', 'MEDIUM', 'HARD'];

function MiniChart({ times, slope, intercept, cliffLap, color }: { times: number[]; slope: number; intercept: number; cliffLap: number; color: string }) {
  const w = 280, h = 80, pad = { l: 0, r: 0, t: 4, b: 4 };
  const min = Math.min(...times) - 0.3;
  const max = Math.max(...times) + 0.3;
  const len = times.length;
  if (len < 2) return null;

  const toXY = (i: number, v: number) => ({
    x: pad.l + (i / (len - 1)) * (w - pad.l - pad.r),
    y: pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b),
  });

  const actual = times.map((v, i) => { const p = toXY(i, v); return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');
  const fitted = times.map((_, i) => { const v = intercept + slope * (i + 1); const p = toXY(i, v); return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join(' ');

  const cliffX = pad.l + ((cliffLap - 1) / (len - 1)) * (w - pad.l - pad.r);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
      <path d={actual} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <path d={fitted} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />
      {cliffLap < len && (
        <>
          <line x1={cliffX} y1={0} x2={cliffX} y2={h} stroke="rgba(232,0,45,0.35)" strokeWidth={1} />
          <text x={cliffX + 3} y={10} fill="rgba(232,0,45,0.55)" fontSize={8}>cliff</text>
        </>
      )}
    </svg>
  );
}

export default function Tyre({ activeEvent }: Props) {
  const [races, setRaces] = useState<any[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(activeEvent ?? null);
  const [openF1Sessions, setOpenF1Sessions] = useState<any[]>([]);
  const [session, setSession] = useState('');
  const [compound, setCompound] = useState('SOFT');
  const [sortMode, setSortMode] = useState<'deg' | 'laps' | 'name'>('deg');
  const [analysis, setAnalysis] = useState<TyreAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const gpScrollRef = useRef<HTMLDivElement>(null);

  // Load calendar
  useEffect(() => {
    fetchCalendar().then(data => {
      setRaces(data);
      if (!selectedRound) {
        const next = data.find((r: any) => r.status !== 'completed') ?? data[0];
        if (next) setSelectedRound(next.round);
      }
    });
  }, []);

  useEffect(() => { if (activeEvent) setSelectedRound(activeEvent); }, [activeEvent]);

  const currentRace = races.find(r => r.round === selectedRound) ?? races[0];

  // Fetch sessions when race changes
  useEffect(() => {
    if (!currentRace?.meeting_key) { setOpenF1Sessions([]); return; }
    let cancelled = false;
    setLoadingSessions(true);
    setAnalysis(null);
    fetchOpenF1Sessions(currentRace.meeting_key).then(res => {
      if (cancelled) return;
      setOpenF1Sessions(res.sessions);
      setLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [currentRace?.name]);

  // Filter to practice sessions only
  const practiceSessions = useMemo(() =>
    openF1Sessions.filter(s => /^(Practice|FP)\s?\d?/i.test(s.session_name) || ['Practice 1','Practice 2','Practice 3'].includes(s.session_name)),
    [openF1Sessions]
  );

  // Auto-select best practice session
  useEffect(() => {
    if (practiceSessions.length === 0) { setSession(''); return; }
    const names = practiceSessions.map(s => s.session_name);
    if (!names.includes(session)) {
      // Prefer FP2/Practice 2 for long runs
      setSession(names.find(n => /2/.test(n)) ?? names[names.length - 1]);
    }
  }, [practiceSessions]);

  const activeSessionObj = practiceSessions.find(s => s.session_name === session);

  // Run analysis when session changes
  useEffect(() => {
    if (!activeSessionObj) return;
    let cancelled = false;
    setLoading(true);
    const label = `${currentRace?.name || 'GP'} — ${activeSessionObj.session_name}`;
    analyseTyreData(activeSessionObj.session_key, label, currentRace?.name).then(result => {
      if (cancelled) return;
      setAnalysis(result);
      setLoading(false);
      // Auto-select first available compound
      const available = COMPOUND_ORDER.find(c => Object.values(result.drivers).some(d => d.compounds[c]));
      if (available) setCompound(available);
    });
    return () => { cancelled = true; };
  }, [activeSessionObj?.session_key]);

  // Filter and sort drivers for current compound
  const sortedDrivers = useMemo(() => {
    if (!analysis) return [];
    let drivers = Object.values(analysis.drivers).filter(d => d.compounds[compound]);
    if (sortMode === 'deg') drivers.sort((a, b) => a.compounds[compound].degRate - b.compounds[compound].degRate);
    if (sortMode === 'laps') drivers.sort((a, b) => a.compounds[compound].laps - b.compounds[compound].laps);
    if (sortMode === 'name') drivers.sort((a, b) => a.name.localeCompare(b.name));
    return drivers;
  }, [analysis, compound, sortMode]);

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-12 animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-black/5 dark:border-white/5">
        <div>
          <span className="inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            Practice Long-Run Analysis
          </span>
          <h1 className="text-4xl lg:text-5xl font-light text-neutral-900 dark:text-white mt-4 tracking-tight">Tyre Degradation</h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl text-sm leading-relaxed">
            {currentRace ? `Thermal and mechanical wear projections for Round ${currentRace.round} — ${currentRace.name}. Extracted from practice long-run stints.` : 'Waiting for race selection...'}
          </p>
        </div>
      </div>

      {/* GP Picker */}
      <div>
        <div className="mb-3"><div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">Grand Prix</div></div>
        <div className="relative">
          <button onClick={() => gpScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-md hover:scale-110 transition-all -ml-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button onClick={() => gpScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-md hover:scale-110 transition-all -mr-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <div ref={gpScrollRef} className="flex overflow-x-auto scrollbar-hide gap-2 pb-2 scroll-smooth px-1">
            {races.length === 0 ? (
              <div className="text-xs text-neutral-400 animate-pulse">Loading calendar...</div>
            ) : races.filter(r => r.status !== 'cancelled').map(r => {
              const isSelected = selectedRound === r.round;
              const flagUrl = getFlagUrl(r);
              return (
                <button key={r.round} onClick={() => { setSelectedRound(r.round); setAnalysis(null); }}
                  className={`flex-shrink-0 flex flex-col items-start gap-2 px-4 py-4 rounded-2xl border transition-all duration-200 min-w-[calc(25%-6px)] min-h-[140px] relative overflow-hidden ${isSelected ? 'border-neutral-900 dark:border-white shadow-lg scale-105' : 'border-black/10 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30'}`}>
                  {flagUrl && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${flagUrl})`, opacity: isSelected ? 1 : 0.85 }} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                  <div className="absolute top-2 -left-2 z-10 leading-[0.75] select-none pointer-events-none opacity-50 mix-blend-overlay">
                    <span className="text-[180px] font-black text-white">{String(r.round).padStart(2, '0')}</span>
                  </div>
                  <span className="relative z-20 text-lg font-semibold leading-snug text-white drop-shadow-xl">{r.name}</span>
                  <div className="mt-auto">
                    {r.status === 'completed' && <span className="relative z-10 inline-block px-2 py-1 text-[10px] font-bold text-white bg-black/40 backdrop-blur-md rounded-md uppercase tracking-wider shadow-lg border border-white/20">Completed</span>}
                    {r.status === 'live' && <span className="relative z-10 inline-block px-2 py-1 text-[10px] font-bold text-white bg-red-500 rounded-md uppercase tracking-wider shadow-lg border border-red-400">Live</span>}
                    {r.status === 'upcoming' && <span className="relative z-10 inline-block px-2 py-1 text-[10px] font-bold text-white bg-white/20 backdrop-blur-md rounded-md uppercase tracking-wider shadow-lg border border-white/20">Upcoming</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Session Picker */}
      <div className="p-6 rounded-[24px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
        <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold mb-3">Practice Session</div>
        <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
          {loadingSessions ? (
            <div className="flex gap-2">{[90, 70, 70].map((w, i) => <div key={i} className="h-10 rounded-full bg-neutral-100 dark:bg-white/[0.04] animate-pulse" style={{ width: w }} />)}</div>
          ) : practiceSessions.length === 0 ? (
            <span className="text-xs text-neutral-400 dark:text-neutral-600">No practice session data available for this event.</span>
          ) : practiceSessions.map(s => (
            <button key={s.session_name} onClick={() => setSession(s.session_name)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${session === s.session_name ? 'bg-neutral-900 dark:bg-white text-white dark:text-black shadow-md scale-105' : 'bg-neutral-100/50 dark:bg-white/[0.02] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-white/[0.06]'}`}>
              {s.session_name}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-8 h-8 border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white rounded-full animate-spin" />
          <div className="text-sm text-neutral-500 dark:text-neutral-400 animate-pulse">Analysing long-run stints...</div>
        </div>
      )}

      {/* Results */}
      {analysis && !loading && (
        <>
          {/* Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Optimal Stint Lengths */}
            <div className="p-6 rounded-[24px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
              <div className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-widest mb-5">Optimal Stint Lengths</div>
              <div className="space-y-4">
                {COMPOUND_ORDER.filter(c => analysis.stintLengths[c]).map(c => {
                  const d = analysis.stintLengths[c];
                  const pct = Math.round((d.median / 70) * 100);
                  return (
                    <div key={c}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2">
                          <Circle className="w-2.5 h-2.5" fill={d.color} stroke={d.color} />
                          <span className="text-neutral-900 dark:text-white">{COMPOUND_LABELS[c]}</span>
                        </div>
                        <span className="text-neutral-500 dark:text-neutral-400 text-xs">{d.min}–{d.max} laps</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: d.color, opacity: 0.6 }} />
                      </div>
                    </div>
                  );
                })}
                {Object.keys(analysis.stintLengths).length === 0 && (
                  <div className="text-xs text-neutral-400 py-2">Not enough long-run data to compute stint lengths.</div>
                )}
              </div>
            </div>

            {/* Strategy Recommender */}
            <div className="p-6 rounded-[24px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
              <div className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-widest mb-5">Recommended Strategy</div>
              <div className="space-y-2">
                {analysis.strategies.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/5">
                    <span className="text-sm text-neutral-900 dark:text-white">{s.label}</span>
                    {s.optimal
                      ? <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Optimal</span>
                      : <span className="text-xs text-neutral-500 dark:text-neutral-400">+{s.delta}s</span>
                    }
                  </div>
                ))}
                {analysis.strategies.length === 0 && (
                  <div className="text-xs text-neutral-400 py-2">Not enough data to simulate strategies.</div>
                )}
              </div>
            </div>
          </div>

          {/* Compound Filter + Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {COMPOUND_ORDER.map(c => {
              const hasData = Object.values(analysis.drivers).some(d => d.compounds[c]);
              const active = compound === c;
              return (
                <button key={c} onClick={() => hasData && setCompound(c)} disabled={!hasData}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all ${active ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-black shadow-md' : hasData ? 'border-black/10 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-white/30' : 'border-black/5 dark:border-white/5 text-neutral-300 dark:text-neutral-700 cursor-not-allowed'}`}>
                  <Circle className="w-2.5 h-2.5" fill={COMPOUND_COLORS[c]} stroke={COMPOUND_COLORS[c]} />
                  {COMPOUND_LABELS[c]}
                </button>
              );
            })}
            <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-700 mx-1" />
            {(['deg', 'laps', 'name'] as const).map(s => (
              <button key={s} onClick={() => setSortMode(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${sortMode === s ? 'bg-neutral-200 dark:bg-white/10 text-neutral-900 dark:text-white' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'}`}>
                {s === 'deg' ? 'Deg rate' : s === 'laps' ? 'Laps' : 'Driver'}
              </button>
            ))}
          </div>

          {/* Driver Deg Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedDrivers.length === 0 && (
              <div className="col-span-full text-center py-16 text-neutral-400 text-sm">No long-run data for {COMPOUND_LABELS[compound]} compound in this session.</div>
            )}
            {sortedDrivers.map(driver => {
              const d = driver.compounds[compound];
              const perLapMs = (d.degRate * 1000).toFixed(0);
              const totalLoss = (d.times[d.times.length - 1] - d.times[0]).toFixed(2);
              const badgeCls = d.severity === 'LOW' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : d.severity === 'MED' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20';
              return (
                <div key={driver.name} className="p-5 rounded-[20px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] border-l-[3px] hover:shadow-lg transition-shadow" style={{ borderLeftColor: driver.teamColor }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-base font-semibold text-neutral-900 dark:text-white tracking-wide">{driver.name}</div>
                      <div className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">{driver.team}</div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${badgeCls}`}>{d.severity} DEG</span>
                  </div>

                  <MiniChart times={d.times} slope={d.slope} intercept={d.intercept} cliffLap={d.cliffLap} color={d.color} />

                  <div className="flex border-t border-black/5 dark:border-white/5 pt-3 mt-3">
                    {[
                      { val: `${perLapMs}ms`, lbl: 'per lap' },
                      { val: `${d.laps}`, lbl: 'max laps' },
                      { val: `L${d.cliffLap}`, lbl: 'cliff' },
                      { val: `+${totalLoss}s`, lbl: 'total loss' },
                    ].map((s, i) => (
                      <div key={i} className="flex-1 text-center border-r border-black/5 dark:border-white/5 last:border-r-0">
                        <div className="text-sm font-semibold text-neutral-900 dark:text-white">{s.val}</div>
                        <div className="text-[9px] text-neutral-400 uppercase tracking-wider mt-0.5">{s.lbl}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-right mt-2"><span className="text-[9px] text-neutral-300 dark:text-neutral-700">R²={d.r2}</span></div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !analysis && practiceSessions.length === 0 && !loadingSessions && races.length > 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-neutral-400 dark:text-neutral-500 text-sm">Select a completed Grand Prix to view tyre degradation data.</div>
        </div>
      )}
    </div>
  );
}
