import { useEffect, useRef, useState } from 'react';
import { Thermometer, CloudRain, Flame } from 'lucide-react';
import Card from '../components/Card';
import { qualifyingPredictions, racePredictions, Race } from '../data/mock';
import { fetchCalendar } from '../api/f1';
import { fetchRaceWeather, WeatherData } from '../api/weather';

const COUNTRY_FLAGS: Record<string, string> = {
  'Australia': 'au', 'China': 'cn', 'Japan': 'jp', 'Bahrain': 'bh', 'Saudi Arabia': 'sa',
  'USA': 'us', 'United States': 'us', 'Italy': 'it', 'Monaco': 'mc', 'Spain': 'es',
  'Canada': 'ca', 'Austria': 'at', 'UK': 'gb', 'United Kingdom': 'gb', 'Hungary': 'hu',
  'Belgium': 'be', 'Netherlands': 'nl', 'Azerbaijan': 'az', 'Singapore': 'sg',
  'Mexico': 'mx', 'Brazil': 'br', 'Qatar': 'qa', 'Abu Dhabi': 'ae', 'UAE': 'ae',
};

function PredictionList({ title, items, subtitle }: { title: string; subtitle: string; items: typeof qualifyingPredictions }) {
  return (
    <Card className="p-6">
      <div className="mb-6">
        <div className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</div>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={item.driver + i} className="group">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-neutral-400 dark:text-neutral-500 w-5">{String(i + 1).padStart(2, '0')}</span>
                <span
                  className="text-[10px] font-bold tracking-widest w-10"
                  style={{ color: item.color }}
                >
                  {item.driver}
                </span>
                <span className="text-sm text-neutral-900 dark:text-white">{item.name}</span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 hidden md:inline">· {item.team}</span>
              </div>
              <span className="text-sm font-semibold tabular-nums" style={{ color: item.color }}>{item.prob}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden ml-10">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${item.prob * 2.8}%`,
                  background: `linear-gradient(90deg, ${item.color}55, ${item.color})`,
                  boxShadow: `0 0 12px ${item.color}66`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WeatherCard({
  icon,
  label,
  value,
  suffix,
  accent,
  loading,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  accent: string;
  loading: boolean;
  hint?: string;
}) {
  return (
    <Card className="p-5 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20"
        style={{ background: accent }}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-md" style={{ background: `${accent}22`, color: accent }}>
            {icon}
          </span>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold">
            {label}
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          {loading ? (
            <div className="h-8 w-20 rounded bg-neutral-100 dark:bg-white/5 animate-pulse" />
          ) : (
            <>
              <span className="text-3xl font-light text-neutral-900 dark:text-white tabular-nums">{value}</span>
              {suffix && (
                <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">{suffix}</span>
              )}
            </>
          )}
        </div>
        {hint && !loading && (
          <div className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">{hint}</div>
        )}
      </div>
    </Card>
  );
}

function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function sourceLabel(w: WeatherData | null): string {
  if (!w) return '';
  if (w.source === 'supabase') return 'Live · Supabase telemetry';
  if (w.source === 'openmeteo-forecast') return 'Forecast · Open-Meteo';
  if (w.source === 'openmeteo-climate') return 'Climatology · last year';
  return '';
}

export default function Predictions({ activeEvent }: { activeEvent?: number | null }) {
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(activeEvent ?? null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const gpScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCalendar().then(data => {
      setRaces(data);
      if (selectedRound == null) {
        const next = data.find(r => r.status === 'live') ?? data.find(r => r.status === 'upcoming') ?? data[data.length - 1];
        if (next) setSelectedRound(next.round);
      }
    });
  }, []);

  useEffect(() => {
    if (activeEvent) setSelectedRound(activeEvent);
  }, [activeEvent]);

  const currentRace = races.find(r => r.round === selectedRound) ?? null;

  useEffect(() => {
    if (!currentRace) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    setWeatherLoading(true);
    fetchRaceWeather(currentRace)
      .then(data => {
        if (!cancelled) setWeather(data);
      })
      .finally(() => {
        if (!cancelled) setWeatherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentRace?.round, currentRace?.meeting_key]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in space-y-8">
      <div>
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">ML model · v3.4.2</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">Predictions</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl">
          {currentRace
            ? `Probabilistic forecasts for Round ${currentRace.round} — ${currentRace.name}. Weather sourced live, then Open-Meteo forecast, then climatology.`
            : 'Probabilistic forecasts generated from 12,400 historical sessions.'}
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
                const flagCode = COUNTRY_FLAGS[r.country];
                const flagUrl = flagCode ? `https://flagcdn.com/w320/${flagCode}.png` : null;
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

      {/* Weather cards */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div className="text-[10px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500 font-semibold">
            Conditions {currentRace && <span className="ml-2 text-neutral-500">· {currentRace.location}</span>}
          </div>
          {weather && (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500">{sourceLabel(weather)}</div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <WeatherCard
            icon={<Flame size={14} />}
            label="Track temperature"
            value={formatNumber(weather?.trackTemp ?? null, 1)}
            suffix="°C"
            accent="#ef4444"
            loading={weatherLoading}
            hint={
              weather?.source === 'supabase'
                ? 'Measured at circuit sensors'
                : weather
                  ? 'Estimated from air temp + solar load'
                  : undefined
            }
          />
          <WeatherCard
            icon={<Thermometer size={14} />}
            label="Air temperature"
            value={formatNumber(weather?.airTemp ?? null, 1)}
            suffix="°C"
            accent="#f59e0b"
            loading={weatherLoading}
            hint={
              typeof weather?.humidity === 'number'
                ? `${formatNumber(weather.humidity, 0)}% humidity`
                : undefined
            }
          />
          <WeatherCard
            icon={<CloudRain size={14} />}
            label="Rain probability"
            value={formatNumber(weather?.rainProb ?? null, 0)}
            suffix="%"
            accent="#3b82f6"
            loading={weatherLoading}
            hint={
              typeof weather?.windSpeed === 'number'
                ? `Wind ${formatNumber(weather.windSpeed, 0)} km/h`
                : undefined
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PredictionList
          title="Qualifying"
          subtitle="Pole position probability"
          items={qualifyingPredictions}
        />
        <PredictionList
          title="Race"
          subtitle="Race win probability"
          items={racePredictions}
        />
      </div>
    </div>
  );
}
