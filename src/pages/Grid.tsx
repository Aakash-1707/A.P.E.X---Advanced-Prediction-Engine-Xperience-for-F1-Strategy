import { useState, useEffect } from 'react';
import { Driver, Constructor } from '../data/mock';
import { fetchAllDrivers, fetchAllConstructors } from '../api/f1';

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center px-3 py-1 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-xs font-medium backdrop-blur-sm">
      {children}
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

export default function Grid() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [constructors, setConstructors] = useState<Constructor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadGrid() {
      setLoading(true);
      const [d, c] = await Promise.all([
        fetchAllDrivers(),
        fetchAllConstructors()
      ]);
      if (mounted) {
        setDrivers(d);
        setConstructors(c);
        setLoading(false);
      }
    }
    loadGrid();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="animate-fade-in">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-24 pb-16">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white dark:to-black pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-start gap-6 animate-slide-up">
            <Pill>Season 2026 Roster</Pill>
            <h1 className="text-5xl md:text-7xl font-light tracking-tight text-neutral-900 dark:text-white leading-[1.02]">
              The <span className="font-semibold bg-gradient-to-r from-neutral-400 to-neutral-700 dark:from-neutral-500 dark:to-white bg-clip-text text-transparent">Grid</span>
            </h1>
            <p className="text-lg md:text-xl text-neutral-500 dark:text-neutral-400 max-w-2xl font-light leading-relaxed">
              Explore the complete 2026 Formula 1 lineup of constructors and world-class drivers competing for the unified championship.
            </p>
          </div>
        </div>
      </section>

      {/* Drivers Grid */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Drivers Championship</span>
            <h2 className="text-3xl md:text-4xl font-light text-neutral-900 dark:text-white mt-2">Driver Profiles</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {loading ? (
            Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="h-80 rounded-3xl bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
            ))
          ) : drivers.map((d) => (
            <div key={d.abbr} className="rounded-[2rem] overflow-hidden group h-[340px] flex flex-col relative transition-transform duration-500 hover:scale-[1.02] shadow-xl" style={{ background: `linear-gradient(to bottom, ${d.color}, #080808)` }}>
              
              <div className="absolute top-2 -left-2 z-0 leading-[0.75] select-none pointer-events-none opacity-50 mix-blend-overlay">
                <span className="text-[180px] font-black text-white">
                  {d.pos}
                </span>
              </div>
              
              <div className="absolute top-5 left-5 z-20 flex flex-col gap-0.5">
                <span className="text-3xl font-extrabold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]" style={{ textShadow: `0 0 30px ${d.color}` }}>
                  {d.number || d.pos}
                </span>
                <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{d.points} PTS</span>
              </div>

              <div className="absolute top-5 right-5 z-20">
                <span className="text-5xl font-black italic text-white/20 tracking-tighter drop-shadow-xl">
                  {d.abbr}
                </span>
              </div>

              <div className="absolute inset-0 w-full h-full pt-16 flex items-end justify-center pointer-events-none">
                <img 
                  src={d.image} 
                  alt={d.name} 
                  className="h-[88%] w-auto object-contain object-bottom drop-shadow-2xl transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                  onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                />
              </div>

              <div className="relative z-20 mt-auto p-5 text-left bg-gradient-to-t from-black via-black/80 to-transparent pt-12">
                <h3 className="font-semibold text-xl text-white truncate drop-shadow-md">{d.name}</h3>
                <p className="text-sm font-medium opacity-90 truncate drop-shadow-md mt-0.5" style={{ color: d.color }}>{d.team}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Constructors Grid */}
      <section className="max-w-7xl mx-auto px-6 pb-32">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Constructors Championship</span>
            <h2 className="text-3xl md:text-4xl font-light text-neutral-900 dark:text-white mt-2">Team Rankings</h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {loading ? (
            Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
            ))
          ) : constructors.map((c) => (
            <div key={c.name} className="p-6 flex flex-col justify-between h-[220px] relative overflow-hidden rounded-[2rem] group shadow-xl transition-transform duration-500 hover:scale-[1.02] border-none" style={{ background: `linear-gradient(to bottom, ${c.color}, #080808)` }}>
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
          ))}
        </div>
      </section>
    </div>
  );
}
