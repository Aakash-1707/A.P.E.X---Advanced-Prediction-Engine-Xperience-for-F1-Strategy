import { useState, useMemo, useEffect, useRef } from 'react';
import LineChart from '../components/LineChart';
import { drivers } from '../data/mock';
import { Activity, Gauge, Zap, TrendingUp, Play, Pause, Map as MapIcon } from 'lucide-react';
import { fetchCalendar, fetchAllDrivers, fetchOpenF1Sessions } from '../api/f1';
import { fetchTelemetryFromDB } from '../api/supabase-telemetry';

type Props = { activeEvent?: number | null };

const SPRINT_ROUNDS = [2, 6, 11, 19, 21, 23];

const COUNTRY_FLAGS: Record<string, string> = {
  'Australia': 'au',
  'China': 'cn',
  'Japan': 'jp',
  'Bahrain': 'bh',
  'Saudi Arabia': 'sa',
  'USA': 'us',
  'United States': 'us',
  'Italy': 'it',
  'Monaco': 'mc',
  'Spain': 'es',
  'Canada': 'ca',
  'Austria': 'at',
  'UK': 'gb',
  'United Kingdom': 'gb',
  'Hungary': 'hu',
  'Belgium': 'be',
  'Netherlands': 'nl',
  'Azerbaijan': 'az',
  'Singapore': 'sg',
  'Mexico': 'mx',
  'Brazil': 'br',
  'Qatar': 'qa',
  'Abu Dhabi': 'ae',
  'UAE': 'ae',
};

// Cache bounding boxes per grand prix so the track doesn't jump around when switching sessions or drivers
const trackBoundsCache = new Map<string, { minX: number, maxX: number, minY: number, maxY: number }>();

function TrackMap({ tick, normA, normB, colorA, colorB, meetingKey }: { tick: number; normA: any; normB: any; colorA: string; colorB: string, meetingKey?: number }) {
  const { svgPath, viewBox, hasData } = useMemo(() => {
    const sources = [normA, normB].filter(n => n && Array.isArray(n.x) && n.duration > 0);
    if (sources.length === 0) {
      return { svgPath: '', viewBox: '0 0 800 600', hasData: false };
    }

    const allX: number[] = [];
    const allY: number[] = [];
    for (const src of sources) {
      for (let i = 0; i < src.x.length; i++) {
        const x = src.x[i];
        const y = src.y[i];
        if (x !== 0 || y !== 0) { allX.push(x); allY.push(y); }
      }
    }

    if (allX.length < 10) return { svgPath: '', viewBox: '0 0 800 600', hasData: false };

    const cleanX = allX.slice().sort((a, b) => a - b);
    const cleanY = allY.slice().sort((a, b) => a - b);

    // Use 1st and 99th percentiles to determine the core track bounds.
    // This prevents a single anomalous GPS point (e.g. from the pits or a glitch) 
    // from artificially expanding the viewBox and making the track look tiny.
    const p1X = cleanX[Math.floor(cleanX.length * 0.01)] ?? 0;
    const p99X = cleanX[Math.floor(cleanX.length * 0.99)] ?? 0;
    const p1Y = cleanY[Math.floor(cleanY.length * 0.01)] ?? 0;
    const p99Y = cleanY[Math.floor(cleanY.length * 0.99)] ?? 0;

    let minX = p1X;
    let maxX = p99X;
    let minY = p1Y;
    let maxY = p99Y;

    // Use cached bounds for this GP if they exist to prevent jumping and shrinking.
    // By locking the bounds on the first valid lap, we ensure the zoom level 
    // stays exactly the same, and anomalous wider laps won't permanently shrink the map.
    const cacheKey = meetingKey ? String(meetingKey) : 'unknown';
    const cached = trackBoundsCache.get(cacheKey);
    if (cached) {
      minX = cached.minX;
      maxX = cached.maxX;
      minY = cached.minY;
      maxY = cached.maxY;
    } else {
      trackBoundsCache.set(cacheKey, { minX, maxX, minY, maxY });
    }

    // Ensure there's a reasonable minimum width/height so pad math doesn't break
    if (maxX - minX < 100) { maxX += 100; minX -= 100; }
    if (maxY - minY < 100) { maxY += 100; minY -= 100; }

    // 15% padding gives it a bit more breathing room
    const padX = (maxX - minX) * 0.15;
    const padY = (maxY - minY) * 0.15;
    const vb = `${minX - padX} ${minY - padY} ${(maxX - minX) + padX * 2} ${(maxY - minY) + padY * 2}`;

    const outlineSrc = sources.reduce((p, c) => c.x.length > p.x.length ? c : p);
    const pathPts: string[] = [];
    for (let i = 0; i < outlineSrc.x.length; i++) {
      const x = outlineSrc.x[i];
      const y = outlineSrc.y[i];
      if (x === 0 && y === 0) continue;
      pathPts.push(`${x},${y}`);
    }

    return { svgPath: pathPts.join(' '), viewBox: vb, hasData: true };
  }, [normA, normB, meetingKey]);

  if (!hasData) {
    return (
       <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center relative bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-white/5 dark:to-transparent rounded-2xl overflow-hidden p-6 shadow-inner text-center">
          <div className="text-neutral-400 dark:text-neutral-500 mb-2">No valid lap data available for this session.</div>
          <div className="text-[10px] uppercase tracking-widest text-neutral-300 dark:text-neutral-600">Waiting for track action...</div>
       </div>
    );
  }

  const ax = normA?.x?.[tick] ?? 0;
  const ay = normA?.y?.[tick] ?? 0;
  const bx = normB?.x?.[tick] ?? 0;
  const by = normB?.y?.[tick] ?? 0;

  const vWidth = parseFloat(viewBox.split(' ')[2]) || 800;
  const vHeight = parseFloat(viewBox.split(' ')[3]) || 600;
  
  // Normalize scale based on 21:9 aspect ratio to ensure uniform stroke sizes across all tracks
  const scaleRef = Math.max(vWidth / (21/9), vHeight);
  const strokeW = scaleRef * 0.015;
  const dotR = scaleRef * 0.035;

  const vbParts = viewBox.split(' ').map(parseFloat);
  const vbCy = vbParts[1] + vbParts[3] / 2;
  
  // Mirrored vertically only based on user feedback.
  const flipTransform = `translate(0 ${2 * vbCy}) scale(1 -1)`;

  return (
    <div className="w-full h-full min-h-[400px] flex items-center justify-center relative bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-white/5 dark:to-transparent rounded-2xl overflow-hidden p-6 shadow-inner">
      <svg viewBox={viewBox} className="w-full h-full drop-shadow-md text-neutral-900 dark:text-white" preserveAspectRatio="xMidYMid meet">
        <g transform={flipTransform}>
          <polyline
            points={svgPath}
            stroke="currentColor"
            strokeWidth={strokeW}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-40 dark:opacity-20"
          />
          {(bx !== 0 || by !== 0) && (
            <circle cx={bx} cy={by} r={dotR} fill={colorB} stroke="white" strokeWidth={strokeW * 0.5} className="transition-all duration-75" />
          )}
          {(ax !== 0 || ay !== 0) && (
            <circle cx={ax} cy={ay} r={dotR} fill={colorA} stroke="white" strokeWidth={strokeW * 0.5} className="transition-all duration-75" />
          )}
        </g>
      </svg>
    </div>
  );
}

function Panel({ title, icon: Icon, children, compact, className = '' }: { title: string; icon?: any; children: React.ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={`flex flex-col ${compact ? 'p-5' : 'p-6'} rounded-[24px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] ${className}`}>
      <div className="flex items-center gap-3 mb-5">
        {Icon && <Icon className="w-5 h-5 text-neutral-400" />}
        <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-widest">{title}</h3>
      </div>
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function DriverDropdown({ value, driverList, onChange, disabledAbbr }: {
  value: string;
  driverList: any[];
  onChange: (abbr: string) => void;
  disabledAbbr?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = driverList.find(d => d.abbr === value) ?? driverList[0];

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  if (!selected) return null;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-neutral-100/50 dark:bg-white/[0.02] hover:bg-neutral-200/50 dark:hover:bg-white/[0.06] transition-all"
      >
        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
        <img
          src={selected.image}
          alt={selected.name}
          className="w-10 h-10 object-cover object-top rounded-xl bg-neutral-200 dark:bg-white/10 flex-shrink-0"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="flex-1 text-left min-w-0">
          <div className="text-[10px] font-mono font-bold text-neutral-400">#{selected.number}</div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{selected.name}</div>
          <div className="text-[10px] text-neutral-400 truncate">{selected.team}</div>
        </div>
        <svg className={`w-4 h-4 text-neutral-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white dark:bg-neutral-950 border border-black/8 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden">
          <div className="max-h-72 overflow-y-auto">
            {driverList.map(d => (
              <button
                key={d.abbr}
                disabled={d.abbr === disabledAbbr}
                onClick={() => { onChange(d.abbr); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-white/5 ${d.abbr === value ? 'bg-neutral-100 dark:bg-white/10' : ''} ${d.abbr === disabledAbbr ? 'opacity-30 cursor-not-allowed hidden' : ''}`}
              >
                <div className="w-1 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <img
                  src={d.image}
                  alt={d.name}
                  className="w-9 h-9 object-cover object-top rounded-lg bg-neutral-200 dark:bg-white/10 flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="flex-1 text-left min-w-0">
                  <div className="text-[10px] font-mono text-neutral-400">#{d.number}</div>
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{d.name}</div>
                </div>
                <span className="text-[10px] font-black tracking-widest flex-shrink-0" style={{ color: d.color }}>{d.abbr}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Telemetry({ activeEvent }: Props) {
  const [driverA, setDriverA] = useState('VER');
  const [driverB, setDriverB] = useState('NOR');
  const gpScrollRef = useRef<HTMLDivElement>(null);
  
  // Race weekend state — first populated from the external activeEvent prop, then internally controlled
  const [races, setRaces] = useState<any[]>([]);
  const [allDrivers, setAllDrivers] = useState<any[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(activeEvent ?? null);

  useEffect(() => {
    fetchCalendar().then(data => {
      setRaces(data);
      if (!selectedRound) {
        const next = data.find((r: any) => r.status !== 'completed') ?? data[0];
        if (next) setSelectedRound(next.round);
      }
    });
    fetchAllDrivers().then(setAllDrivers);
  }, []);

  // Keep in sync if parent changes context
  useEffect(() => {
    if (activeEvent) setSelectedRound(activeEvent);
  }, [activeEvent]);

  // Derived event configuration
  const currentRace = races.find(r => r.round === selectedRound) ?? races[0];
  const isSprint = currentRace ? SPRINT_ROUNDS.includes(currentRace.round) : false;
  
  const [openF1Sessions, setOpenF1Sessions] = useState<any[]>([]);
  const [session, setSession] = useState('Qualifying');
  const [playing, setPlaying] = useState(false);
  const [, setIsLoadingTelemetry] = useState(false);
  const [tick, setTick] = useState(0);

  const [telyA, setTelyA] = useState<any>(null);
  const [telyB, setTelyB] = useState<any>(null);
  const [telyMeetingKey, setTelyMeetingKey] = useState<number | undefined>(undefined);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // When the race changes: clear stale sessions + telemetry immediately, then
  // fetch all candidate years in parallel (not sequential) so the wait is only
  // as long as the slowest single call, not the sum of all calls.
  useEffect(() => {
    if (!currentRace) return;
    let cancelled = false;
    setOpenF1Sessions([]);
    setTelyA(null);
    setTelyB(null);
    setIsLoadingSessions(true);
    if (!currentRace.meeting_key) {
      setIsLoadingSessions(false);
      return;
    }
    fetchOpenF1Sessions(currentRace.meeting_key).then(res => {
      if (cancelled) return;
      setOpenF1Sessions(res.sessions);
      setIsLoadingSessions(false);
    });
    return () => { cancelled = true; };
  }, [currentRace?.name]);

  // Only show real session options — placeholder strings like 'FP1' don't have
  // a matching session object so activeSessionObj would be undefined and
  // telemetry would never fire. Show nothing until real sessions arrive.
  const sessionOptions = openF1Sessions.map(s => s.session_name);

  const activeSessionObj = openF1Sessions.find(s => s.session_name === session);

  // Snap session to a valid option whenever the session list changes.
  useEffect(() => {
    if (sessionOptions.length === 0) return;
    if (!sessionOptions.includes(session)) {
      // Prefer Qualifying, fall back to the last (Race) option.
      const preferred = sessionOptions.find(o => o === 'Qualifying') ?? sessionOptions[sessionOptions.length - 1];
      setSession(preferred);
    }
  }, [sessionOptions, session]);

  // Resolve driver numbers once — primitive values make the telemetry effect
  // dependency stable (no spurious re-runs when allDrivers array ref changes).
  const driverANum = useMemo(() => {
    const d = allDrivers.find(d => d.abbr === driverA);
    return d?.number != null ? Number(d.number) : null;
  }, [allDrivers, driverA]);

  const driverBNum = useMemo(() => {
    const d = allDrivers.find(d => d.abbr === driverB);
    return d?.number != null ? Number(d.number) : null;
  }, [allDrivers, driverB]);

  // Hydrate Fastest Lap Telemetry whenever driver or session changes.
  // Depends on primitive values (session_key, driverANum, driverBNum) so it
  // only re-runs when something meaningful actually changed.
  useEffect(() => {
    if (!activeSessionObj || driverANum == null || driverBNum == null) return;

    let aborted = false;
    setIsLoadingTelemetry(true);

    Promise.all([
      fetchTelemetryFromDB(activeSessionObj.session_key, driverANum),
      fetchTelemetryFromDB(activeSessionObj.session_key, driverBNum),
    ]).then(([resA, resB]) => {
      if (aborted) return;
      setTelyA(resA);
      setTelyB(resB);
      setTelyMeetingKey(currentRace?.meeting_key);
      setTick(0);
      setIsLoadingTelemetry(false);
    });

    return () => { aborted = true; };
  }, [activeSessionObj?.session_key, driverANum, driverBNum]);

  // Normalize Telemetry to 300 points for synced playback
  const { normA, normB } = useMemo(() => {
    const TARGET_POINTS = 300;
    
    const normalize = (data: any) => {
      const out = { speed: Array(TARGET_POINTS).fill(0), throttle: Array(TARGET_POINTS).fill(0), brake: Array(TARGET_POINTS).fill(0), rpm: Array(TARGET_POINTS).fill(0), gear: Array(TARGET_POINTS).fill(0), x: Array(TARGET_POINTS).fill(0), y: Array(TARGET_POINTS).fill(0), duration: 0 };
      if (!data || !Array.isArray(data.carData) || data.carData.length === 0) return out;
      
      out.duration = data.lap?.lap_duration || 0;
      const start = new Date(data.carData[0].date).getTime();
      const duration = new Date(data.carData[data.carData.length - 1].date).getTime() - start;

      let cIdx = 0; let lIdx = 0;

      for (let i = 0; i < TARGET_POINTS; i++) {
         const targetTime = start + (duration * (i / (TARGET_POINTS - 1)));
         
         while (cIdx < data.carData.length - 2 && new Date(data.carData[cIdx + 1].date).getTime() <= targetTime) cIdx++;
         while (data.locData && lIdx < data.locData.length - 2 && new Date(data.locData[lIdx + 1].date).getTime() <= targetTime) lIdx++;

         const cp = data.carData[cIdx];
         const lp = data.locData && data.locData.length > 0 ? data.locData[lIdx] : { x: 0, y: 0 };

         out.speed[i] = cp.speed || 0;
         out.throttle[i] = cp.throttle || 0;
         out.brake[i] = cp.brake || 0;
         out.rpm[i] = cp.rpm || 0;
         out.gear[i] = cp.n_gear || 0;
         out.x[i] = lp.x || 0;
         out.y[i] = lp.y || 0;
      }
      return out;
    };

    return { normA: normalize(telyA), normB: normalize(telyB) };
  }, [telyA, telyB]);

  // Animation Loop overrides
  const MAX_TICK = 299; // 300 points
  useEffect(() => {
    let timer: any;
    if (playing) {
      timer = setInterval(() => {
        setTick(t => {
          if (t >= MAX_TICK) { setPlaying(false); return MAX_TICK; }
          return t + 1;
        });
      }, 30);
    }
    return () => clearInterval(timer);
  }, [playing]);

  const driverPool = allDrivers.length > 0 ? allDrivers : drivers;
  const drvAVar = driverPool.find(d => d.abbr === driverA);
  const drvBVar = driverPool.find(d => d.abbr === driverB);

  const colorA = drvAVar?.color || '#1E5BC6';
  const colorB = drvBVar?.color || '#FF8000';

  const progressA = tick / (MAX_TICK || 1);

  const speedA = normA.speed;
  const speedB = normB.speed;
  const throttleA = normA.throttle;
  const throttleB = normB.throttle;
  const brakeA = normA.brake;
  const brakeB = normB.brake;
  const rpmA = normA.rpm;
  const rpmB = normB.rpm;

  const safeTick = Math.min(tick, MAX_TICK);
  const liveSpeedA = speedA[safeTick] || 0;
  const liveSpeedB = speedB[safeTick] || 0;
  const liveThrottleA = throttleA[safeTick] || 0;
  const liveThrottleB = throttleB[safeTick] || 0;
  const liveBrakeA = brakeA[safeTick] || 0;
  const liveBrakeB = brakeB[safeTick] || 0;
  const liveGearA = normA.gear[safeTick] || 0;
  const liveGearB = normB.gear[safeTick] || 0;

  const lapDurA = normA.duration > 0 ? normA.duration.toFixed(3) : '1:12.483';
  const gapDif = (normA.duration > 0 && normB.duration > 0) ? (normB.duration - normA.duration).toFixed(3) : '+0.217';

  const ReadoutBlock = ({ title, valA, valB, max, unit, cA, cB }: any) => (
    <div className="p-4 bg-white dark:bg-[#131313] rounded-[16px] border border-black/5 dark:border-white/5 shadow-sm">
      <div className="text-[10px] uppercase font-bold text-neutral-400 dark:text-neutral-500 tracking-wider mb-4">{title}</div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <div className="text-[11px] font-black w-8" style={{ color: cA }}>{driverA}</div>
          <div className="text-xl font-mono text-neutral-900 dark:text-white w-20 flex items-baseline gap-1 leading-none">
            {valA} <span className="text-[10px] text-neutral-400">{unit}</span>
          </div>
          {max > 0 ? (
            <div className="flex-1 h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
               <div className="h-full rounded-full transition-all duration-[30ms] ease-linear" style={{ width: `${Math.min(100, (valA/max)*100)}%`, backgroundColor: cA }} />
            </div>
          ) : (
            <div className="flex-1 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800" />
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[11px] font-black w-8" style={{ color: cB }}>{driverB}</div>
          <div className="text-xl font-mono text-neutral-900 dark:text-white w-20 flex items-baseline gap-1 leading-none">
            {valB} <span className="text-[10px] text-neutral-400">{unit}</span>
          </div>
          {max > 0 ? (
            <div className="flex-1 h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
               <div className="h-full rounded-full transition-all duration-[30ms] ease-linear" style={{ width: `${Math.min(100, (valB/max)*100)}%`, backgroundColor: cB }} />
            </div>
          ) : (
            <div className="flex-1 border-t-2 border-dashed border-neutral-200 dark:border-neutral-800" />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-12 animate-fade-in space-y-8">
      
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-black/5 dark:border-white/5">
        <div>
          <Pill tone={isSprint ? 'orange' : 'teal'}>
            {isSprint ? 'Sprint Weekend Format' : 'Standard Format'}
          </Pill>
          <h1 className="text-4xl lg:text-5xl font-light text-neutral-900 dark:text-white mt-4 tracking-tight">
            Advanced Telemetry
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl text-sm leading-relaxed">
            {currentRace 
              ? `Real-time synchronization for Round ${currentRace.round} — ${currentRace.name}. Comparing granular telemetry mechanics.`
              : 'Waiting for race selection context from the database layer.'}
          </p>
        </div>
      </div>

      {/* Grand Prix Picker */}
      <div>
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">Grand Prix</div>
        </div>
        <div className="relative">
          {/* Left arrow */}
          <button
            onClick={() => gpScrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-md hover:scale-110 transition-all -ml-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          {/* Right arrow */}
          <button
            onClick={() => gpScrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white shadow-md hover:scale-110 transition-all -mr-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
          <div ref={gpScrollRef} className="flex overflow-x-auto scrollbar-hide gap-2 pb-2 scroll-smooth px-1">
          {races.length === 0 ? (
            <div className="text-xs text-neutral-400 animate-pulse">Loading calendar...</div>
          ) : races.filter(r => r.status !== 'cancelled').map(r => {
            const isSelected = selectedRound === r.round;
            const flagCode = COUNTRY_FLAGS[r.country];
            const flagUrl = flagCode ? `https://flagcdn.com/w320/${flagCode}.png` : null;
            return (
              <button
                key={r.round}
                onClick={() => { setSelectedRound(r.round); setTick(0); setPlaying(false); }}
                className={`flex-shrink-0 flex flex-col items-start gap-2 px-4 py-4 rounded-2xl border transition-all duration-200 min-w-[calc(25%-6px)] min-h-[140px] relative overflow-hidden ${
                  isSelected
                    ? 'border-neutral-900 dark:border-white shadow-lg scale-105'
                    : 'border-black/10 dark:border-white/10 hover:border-neutral-400 dark:hover:border-white/30'
                }`}
              >
                {/* Flag background */}
                {flagUrl && (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${flagUrl})`, opacity: isSelected ? 1 : 0.85 }}
                  />
                )}
                {/* Minimal bottom gradient for text legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                {/* Round watermark — Grid page style */}
                <div className="absolute top-2 -left-2 z-10 leading-[0.75] select-none pointer-events-none opacity-50 mix-blend-overlay">
                  <span className="text-[180px] font-black text-white">
                    {String(r.round).padStart(2,'0')}
                  </span>
                </div>
                {/* Content */}
                <span className="relative z-20 text-lg font-semibold leading-snug text-white drop-shadow-xl">{r.name}</span>
                <div className="mt-auto">
                  {r.status === 'live' && <span className="relative z-10 inline-block px-2 py-1 text-[10px] font-bold text-white bg-red-500 rounded-md uppercase tracking-wider shadow-lg border border-red-400">Live</span>}
                  {r.status === 'completed' && <span className="relative z-10 inline-block px-2 py-1 text-[10px] font-bold text-white bg-black/40 backdrop-blur-md rounded-md uppercase tracking-wider shadow-lg border border-white/20">Completed</span>}
                  {r.status === 'upcoming' && <span className="relative z-10 inline-block px-2 py-1 text-[10px] font-bold text-white bg-white/20 backdrop-blur-md rounded-md uppercase tracking-wider shadow-lg border border-white/20">Upcoming</span>}
                </div>
              </button>
            );
          })}
          </div>
        </div>
      </div>

      {/* Session + Driver Picker Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        {/* Session Selection */}
        <div className="flex flex-col gap-3 p-6 rounded-[24px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">Session</div>
          <div className="flex flex-wrap gap-2 min-h-[40px] items-center">
            {isLoadingSessions ? (
              <div className="flex gap-2">
                {[90, 70, 70, 100, 60].map((w, i) => (
                  <div key={i} className="h-10 rounded-full bg-neutral-100 dark:bg-white/[0.04] animate-pulse" style={{ width: w }} />
                ))}
              </div>
            ) : sessionOptions.length === 0 ? (
              <span className="text-xs text-neutral-400 dark:text-neutral-600">No session data available for this event.</span>
            ) : sessionOptions.map(opt => (
              <button
                key={opt}
                onClick={() => setSession(opt)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${session === opt ? 'bg-neutral-900 dark:bg-white text-white dark:text-black shadow-md scale-105' : 'bg-neutral-100/50 dark:bg-white/[0.02] text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-white/[0.06]'}`}
              >
                {opt}
                {opt === 'Qualifying' && <span className="ml-2 opacity-50 font-normal">Q3</span>}
                {opt === 'Sprint Qualifying' && <span className="ml-2 opacity-50 font-normal">fastest</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Driver Comparison Picker */}
        <div className="flex flex-col gap-3 p-6 rounded-[24px] bg-white dark:bg-neutral-900 border border-black/[0.04] dark:border-white/[0.04] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">Compare Drivers</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-black text-neutral-400">Driver A</span>
              <DriverDropdown value={driverA} driverList={allDrivers.length > 0 ? allDrivers : drivers} onChange={setDriverA} disabledAbbr={driverB} />
            </div>
            <div className="flex items-center justify-center flex-shrink-0 pt-4">
              <span className="text-xs font-black italic text-neutral-400 dark:text-neutral-500 tracking-tight">vs</span>
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[10px] uppercase font-black text-neutral-400">Driver B</span>
              <DriverDropdown value={driverB} driverList={allDrivers.length > 0 ? allDrivers : drivers} onChange={setDriverB} disabledAbbr={driverA} />
            </div>
          </div>
        </div>

      </div>

      {/* Top Section: Live Readouts (Left) and Master Map (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mt-6 items-stretch">
        
        {/* Left Panel: Live Readout (spanning 4 columns) */}
        <div className="xl:col-span-4 flex flex-col h-full">
          <Panel title="Live Readout" icon={Activity} compact className="flex-1 h-full">
            <div className="flex flex-col gap-3 h-full justify-center">
              <ReadoutBlock title="Speed" valA={Math.round(liveSpeedA)} valB={Math.round(liveSpeedB)} max={350} unit="km/h" cA={colorA} cB={colorB} />
              <ReadoutBlock title="Throttle" valA={Math.round(liveThrottleA)} valB={Math.round(liveThrottleB)} max={100} unit="%" cA={colorA} cB={colorB} />
              <ReadoutBlock title="Brake" valA={Math.round(liveBrakeA)} valB={Math.round(liveBrakeB)} max={100} unit="%" cA={colorA} cB={colorB} />
              <ReadoutBlock title="Gear" valA={Math.round(liveGearA)} valB={Math.round(liveGearB)} max={8} unit="" cA={colorA} cB={colorB} />
            </div>
          </Panel>
        </div>

        {/* Right Panel: Master Map Tile (spanning 8 columns) */}
        <div className="xl:col-span-8 flex flex-col h-full">
          <Panel title="GPS Track Map & Live Status" icon={MapIcon} compact className="flex-1 h-full">
            <div className="flex flex-col h-full">
              
              {/* Map Canvas */}
              <div className="w-full aspect-[21/9] flex items-center justify-center relative bg-neutral-100/30 dark:bg-white/[0.02] rounded-[16px] mb-5 border border-black/5 dark:border-white/5 shadow-inner overflow-hidden">
                 <TrackMap tick={safeTick} normA={normA} normB={normB} colorA={colorA} colorB={colorB} meetingKey={telyMeetingKey} />
              </div>

              {/* Playback Control */}
              <div className="flex items-center gap-4 bg-neutral-100 dark:bg-white/5 p-3 rounded-[16px] relative overflow-hidden group mb-3 shadow-sm border border-black/5 dark:border-white/5">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                <button 
                  onClick={() => {
                    if (tick >= MAX_TICK) setTick(0);
                    setPlaying(!playing);
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${playing ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white shadow-md'}`}
                >
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                </button>
                <div className="flex-1 pr-2">
                  <div className="flex justify-between text-[10px] text-neutral-500 font-mono mb-1.5 uppercase">
                    <span>Start</span>
                    <span>Lap End</span>
                  </div>
                  <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden relative">
                     <div className="h-full bg-neutral-900 dark:bg-white absolute left-0 top-0 transition-all ease-linear" style={{ width: `${progressA * 100}%` }} />
                  </div>
                </div>
              </div>

              {/* Driver Deltas (Side by Side) */}
              <div className="grid grid-cols-2 gap-3 mt-auto">
                 <div className="p-4 rounded-[14px] bg-neutral-100/50 dark:bg-white/[0.02] border-l-4 shadow-sm border border-black/5 dark:border-white/5 flex flex-col justify-center" style={{ borderLeftColor: colorA }}>
                   <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider">Fastest Lap</div>
                   <div className="text-xl font-light text-neutral-900 dark:text-white mt-0.5">{driverA}</div>
                   <div className="text-xs font-mono text-neutral-400 mt-1">{lapDurA}s</div>
                 </div>
                 <div className="p-4 rounded-[14px] bg-neutral-100/50 dark:bg-white/[0.02] border-l-4 shadow-sm border border-black/5 dark:border-white/5 flex flex-col justify-center" style={{ borderLeftColor: colorB }}>
                   <div className="text-[9px] uppercase font-bold text-neutral-500 tracking-wider">Comparison</div>
                   <div className="text-xl font-light text-neutral-900 dark:text-white mt-0.5">{driverB}</div>
                   <div className={`text-xs font-mono mt-1 ${parseFloat(gapDif) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                     {parseFloat(gapDif) > 0 ? '+' : ''}{gapDif}s
                   </div>
                 </div>
              </div>

            </div>
          </Panel>
        </div>

      </div>

      {/* Bottom Section: 4 Charts in a 2x2 Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <Panel title="Velocity Profile (km/h)" icon={Gauge} compact>
          <LineChart series={[
            { data: speedA, label: driverA, color: colorA },
            { data: speedB, label: driverB, color: colorB }
          ]} height={220} />
        </Panel>
        
        <Panel title="Throttle Application (%)" icon={Activity} compact>
          <LineChart series={[
            { data: throttleA, label: driverA, color: colorA },
            { data: throttleB, label: driverB, color: colorB }
          ]} height={220} yMax={100} yMin={0} />
        </Panel>
        
        <Panel title="Brake Pressure (%)" icon={TrendingUp} compact>
          <LineChart series={[
            { data: brakeA, label: driverA, color: colorA },
            { data: brakeB, label: driverB, color: colorB }
          ]} height={220} yMax={100} yMin={0} />
        </Panel>

        <Panel title="Engine RPM" icon={Zap} compact>
           <LineChart series={[
             { data: rpmA, label: driverA, color: colorA },
             { data: rpmB, label: driverB, color: colorB }
           ]} height={220} />
        </Panel>
      </div>
    </div>
  );
}

// Inline Pill logic so Telemetry doesn't require importing external components that change
function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'live' | 'done' | 'neutral' | 'orange' | 'teal' }) {
  const tones = {
    live: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    done: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-500/20',
    neutral: 'bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 border-black/5 dark:border-white/10',
    orange: 'bg-[#FF8000]/10 text-[#FF8000] border-[#FF8000]/20',
    teal: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  };

  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md border ${tones[tone]}`}>
      {children}
    </span>
  );
}
