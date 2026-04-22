import { useState, useEffect, useRef } from 'react';
import { ArrowUpRight, MapPin, Calendar, Clock, Trophy } from 'lucide-react';
import Card from '../components/Card';
import { Driver, Constructor, Race, teamColors } from '../data/mock';
import { fetchCalendar, fetchDriversChampionship, fetchConstructorsChampionship } from '../api/f1';
function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'live' | 'done' | 'up' | 'cancelled' }) {
  const tones = {
    default: 'bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400',
    live: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/30',
    done: 'bg-neutral-100 dark:bg-white/5 text-neutral-400 dark:text-neutral-500',
    up: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30',
    cancelled: 'bg-neutral-500/10 text-neutral-500 dark:text-neutral-500 ring-1 ring-neutral-500/30 line-through decoration-neutral-500/50',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${tones[tone]}`}>
      {tone === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      {children}
    </span>
  );
}

function DriverCard({ d, featured }: { d: Driver; featured?: boolean }) {
  const clipCorner = 'polygon(40px 0, 100% 0, 100% 100%, 0 100%, 0 40px)';

  return (
    <div
      className={`relative group flex flex-col justify-end overflow-hidden transition-transform duration-500 hover:scale-[1.03] ${featured ? 'z-20 md:-mt-8 shadow-[0_0_40px_rgba(0,0,0,0.5)]' : 'z-10 shadow-2xl'} w-full max-w-[320px] mx-auto`}
      style={{
        height: featured ? '420px' : '360px',
        clipPath: clipCorner,
        background: `linear-gradient(to bottom, ${d.color}, #080808)`
      }}
    >
      {/* Background Graphic - The Position Number */}
      <div className="absolute top-2 left-6 leading-[0.75] select-none pointer-events-none z-0 overflow-visible">
        <span className="text-[200px] font-black text-white drop-shadow-xl saturate-150">
          {d.pos}
        </span>
      </div>

      {/* Driver Image */}
      <div className="absolute inset-0 w-full h-full pt-10 flex items-end justify-center z-10 pointer-events-none drop-shadow-2xl">
        <img
          src={d.image}
          alt={d.name}
          className="h-[95%] w-auto object-contain object-bottom transition-transform duration-700 ease-out group-hover:scale-105"
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        />
      </div>

      {/* Bottom Info Bar Overlay */}
      <div className="relative z-20 w-full px-5 py-4 flex items-end justify-between bg-gradient-to-t from-black via-black/90 to-transparent pt-12">
        <div className="flex flex-col items-start min-w-0 pr-3">
          <span className="text-xl md:text-2xl font-black text-white uppercase tracking-widest truncate pb-1 drop-shadow-md">
            {d.name.split(' ').pop()}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-300">
            {d.team}
          </span>
        </div>

        <div className="flex flex-col items-end text-right shrink-0 bg-black/60 px-3 py-1.5 border border-white/5 shadow-inner backdrop-blur-sm" style={{ borderBottomColor: d.color, borderBottomWidth: '4px' }}>
          <span className="text-xl font-bold text-white leading-none">{d.points}</span>
          <span className="text-[9px] uppercase tracking-[0.2em] font-medium text-neutral-400 mt-1">PTS</span>
        </div>
      </div>
    </div>
  );
}

function resolveTeamLogo(name: string) {
  const n = name.toUpperCase();
  if (n.includes('CADILLAC')) return 'CADILLAC';
  if (n.includes('AUDI') || n.includes('SAUBER') || n.includes('KICK')) return 'AUDI';
  if (n.includes('ASTON')) return 'ASTON';
  if (n.includes('ALPHA') || (n.includes('RB') && !n.includes('RED'))) return 'RACINGBULLS';
  if (n.includes('RED BULL')) return 'REDBULL';
  if (n.includes('HAAS')) return 'HAAS';
  if (n.includes('WILLIAMS')) return 'WILLIAMS';
  if (n.includes('ALPINE')) return 'ALPINE';
  if (n.includes('FERRARI')) return 'FERRARI';
  if (n.includes('MCLAREN')) return 'MCLAREN';
  if (n.includes('MERCEDES')) return 'MERCEDES';
  return n.replace(/ /g, '_');
}

type Props = {
  onNavigate?: (tab: string) => void;
  activeEvent?: number | null;
  onEventChange?: (eventId: number) => void;
};

export default function Home({ onNavigate }: Props = {}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
  const scrollRight = () => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' });

  const [driversData, setDriversData] = useState<Driver[]>([]);
  const [constructorsData, setConstructorsData] = useState<Constructor[]>([]);
  const [racesData, setRacesData] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      setLoading(true);
      const [d, c, r] = await Promise.all([
        fetchDriversChampionship(),
        fetchConstructorsChampionship(),
        fetchCalendar()
      ]);
      if (mounted) {
        setDriversData(d);
        setConstructorsData(c);
        setRacesData(r);
        setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="animate-fade-in">
      <section className="relative overflow-hidden">
        <div className="aurora" />
        <div className="absolute inset-0 noise" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-black pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-32">
          <div className="flex flex-col items-start gap-6 animate-slide-up">
            <Pill>Season 2026</Pill>
            <h1 className="text-6xl md:text-8xl font-light tracking-tight text-neutral-900 dark:text-white leading-[1.02]">
              Project <span className="font-semibold bg-gradient-to-r from-[#FF8000] via-[#E8002D] to-[#1E5BC6] bg-clip-text text-transparent">A.P.E.X</span>
            </h1>
            <p className="text-lg md:text-xl text-neutral-500 dark:text-neutral-400 font-light max-w-2xl mt-6 leading-relaxed">
              <strong>Advanced Prediction Engine Xperience</strong> for Formula 1 Strategy. Precision telemetry, tyre modeling, and race intelligence — reimagined.
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => onNavigate?.('telemetry')} className="px-5 py-2.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black text-sm font-medium hover:scale-[1.02] transition-transform">
                Explore Telemetry
              </button>
              <button className="px-5 py-2.5 rounded-full border border-black/10 dark:border-white/10 text-neutral-900 dark:text-white text-sm font-medium flex items-center gap-1 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                Read documentation <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4 text-neutral-400" />
              <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Drivers Championship</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-light text-neutral-900 dark:text-white">Top of the field</h2>
          </div>
          <button
            onClick={() => onNavigate?.('grid')}
            className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
          >
            Full standings <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {loading ? (
            <div className="col-span-3 text-center text-neutral-500 py-10 animate-pulse">Loading driver standings...</div>
          ) : driversData.length >= 3 ? (
            <>
              <div className="order-2 md:order-1"><DriverCard d={driversData[1]} /></div>
              <div className="order-1 md:order-2"><DriverCard d={driversData[0]} featured /></div>
              <div className="order-3"><DriverCard d={driversData[2]} /></div>
            </>
          ) : (
            <div className="col-span-3 text-center text-neutral-500 py-10">Data unavailable</div>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Constructors Championship</span>
            <h2 className="text-3xl md:text-4xl font-light text-neutral-900 dark:text-white mt-2">Team rankings</h2>
          </div>
          <button
            onClick={() => onNavigate?.('grid')}
            className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            Full standings <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-3 text-center text-neutral-500 py-10 animate-pulse">Loading constructor rankings...</div>
          ) : constructorsData.map((c) => {
            const color = teamColors[c.name] ?? '#6b7280';
            return (
              <div key={c.name} className="p-6 flex flex-col justify-between h-[220px] relative overflow-hidden rounded-[2rem] group shadow-xl transition-transform duration-500 hover:scale-[1.02] border-none" style={{ background: `linear-gradient(to bottom, ${color}, #080808)` }}>
                <div className="flex justify-between items-start z-10 relative mb-4">
                  {/* Team color block natively adapts */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-xl shadow-lg ring-1 ring-white/20 bg-white/10 backdrop-blur-md">
                    {c.pos}
                  </div>

                  {/* Team Logo Badge */}
                  <div className="w-14 h-14 flex justify-end items-start drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
                    <img src={`/teams/${resolveTeamLogo(c.name)}.png`} alt={`${c.name} Logo`} className="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-110 drop-shadow-2xl" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  </div>
                </div>

                <div className="z-10 relative flex-1 flex flex-col justify-center">
                  <h3 className="font-bold text-xl md:text-2xl text-white truncate drop-shadow-md">{c.name}</h3>
                  <span className="text-xs tracking-widest uppercase font-medium text-white/50 mt-0.5">Constructor</span>
                </div>

                <div className="z-10 relative pt-4 mt-auto border-t border-white/10 flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-light text-white leading-none tracking-tight drop-shadow-md">{c.points}</div>
                    <div className="text-[10px] text-white/50 uppercase tracking-widest mt-1">Total points</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">2026 Calendar</span>
            <h2 className="text-3xl md:text-4xl font-light text-neutral-900 dark:text-white mt-2">Upcoming races</h2>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button onClick={scrollLeft} className="w-10 h-10 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button onClick={scrollRight} className="w-10 h-10 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex gap-4 overflow-x-auto scrollbar-hide pb-4 -mx-6 px-6 scroll-smooth">
          {loading ? (
            <div className="w-full text-center text-neutral-500 py-10 animate-pulse">Loading upcoming races...</div>
          ) : racesData.map((r) => (
            <Card key={r.round} hover className="p-5 min-w-[280px] flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono">R{String(r.round).padStart(2, '0')}</span>
                {r.status === 'live' && <Pill tone="live">Live</Pill>}
                {r.status === 'completed' && <Pill tone="done">Completed</Pill>}
                {r.status === 'upcoming' && <Pill>Upcoming</Pill>}
                {r.status === 'cancelled' && <Pill tone="cancelled">Cancelled</Pill>}
              </div>
              <div className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">{r.name}</div>
              <div className="flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
                <MapPin className="w-3 h-3" /> {r.location}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 pt-4 border-t border-black/5 dark:border-white/5">
                <div>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500"><Calendar className="w-3 h-3" /> Date</div>
                  <div className="text-sm text-neutral-900 dark:text-white mt-1">{r.date}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500"><Clock className="w-3 h-3" /> Time</div>
                  <div className="text-sm text-neutral-900 dark:text-white mt-1">{r.time}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
