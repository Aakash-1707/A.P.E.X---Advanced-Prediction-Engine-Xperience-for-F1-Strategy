import { useEffect, useRef, useState } from 'react';
import { Thermometer, CloudRain, Flame, Database } from 'lucide-react';
import Card from '../components/Card';
import { Race } from '../data/mock';
import { fetchCalendar } from '../api/f1';
import { fetchRaceWeather, WeatherData } from '../api/weather';
import { getFlagUrl } from '../lib/flags';
import {
  fetchPredictionsForRace,
  PredictionItem,
  resolvePredictorGpName,
} from '../api/predictions';

function PredictionList({
  title,
  items,
  subtitle,
  loading,
  empty,
  secondaryMetric,
}: {
  title: string;
  subtitle: string;
  items: PredictionItem[];
  loading: boolean;
  empty: string;
  secondaryMetric?: (it: PredictionItem) => string | null;
}) {
  return (
    <Card className="p-6">
      <div className="mb-6">
        <div className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{subtitle}</div>
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-neutral-100 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{empty}</div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const prob = Math.max(0, Math.min(100, Number(item.prob) || 0));
            const barWidth = Math.min(100, prob * 2.8);
            const secondary = secondaryMetric?.(item);
            return (
              <div key={item.driver + i} className="group">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-neutral-400 dark:text-neutral-500 w-5">{String(i + 1).padStart(2, '0')}</span>
                    <span
                      className="text-[10px] font-bold tracking-widest w-10"
                      style={{ color: item.color }}
                    >
                      {item.driver}
                    </span>
                    <span className="text-sm text-neutral-900 dark:text-white truncate">{item.name}</span>
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 hidden md:inline truncate">· {item.team}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {secondary && (
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">{secondary}</span>
                    )}
                    <span className="text-sm font-semibold tabular-nums" style={{ color: item.color }}>
                      {prob.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden ml-10">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${barWidth}%`,
                      background: `linear-gradient(90deg, ${item.color}55, ${item.color})`,
                      boxShadow: `0 0 12px ${item.color}66`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [racePreds, setRacePreds] = useState<PredictionItem[]>([]);
  const [qualiPreds, setQualiPreds] = useState<PredictionItem[]>([]);
  const [predictionsLoading, setPredictionsLoading] = useState(false);
  const [predictionsError, setPredictionsError] = useState<string | null>(null);
  const [requestedRound, setRequestedRound] = useState<number | null>(null);
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

  // Live prediction: only fires when the user explicitly picks a GP
  // (requestedRound), not from the auto-selection on mount.
  const requestedRace =
    requestedRound != null ? races.find(r => r.round === requestedRound) ?? null : null;

  useEffect(() => {
    if (!requestedRace) {
      setRacePreds([]);
      setQualiPreds([]);
      setPredictionsError(null);
      setPredictionsLoading(false);
      return;
    }

    let cancelled = false;
    setRacePreds([]);
    setQualiPreds([]);
    setPredictionsError(null);
    setPredictionsLoading(true);

    fetchPredictionsForRace(requestedRace)
      .then(({ raceItems, qualiItems }) => {
        if (cancelled) return;
        setRacePreds(raceItems);
        setQualiPreds(qualiItems);
      })
      .catch(err => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setPredictionsError(message);
      })
      .finally(() => {
        if (!cancelled) setPredictionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedRace?.round, requestedRace?.country, requestedRace?.name]);

  const predictorGpLabel = requestedRace
    ? resolvePredictorGpName(requestedRace)
    : currentRace
      ? resolvePredictorGpName(currentRace)
      : '';

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in space-y-8">
      <div>
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">APEX V7 · XGBoost + FastF1</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">Predictions</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl">
          {currentRace
            ? `Live ML forecasts for Round ${currentRace.round} — ${currentRace.name}. XGBoost classifiers trained on 2022–2026 data; weather sourced live.`
            : 'Live ML forecasts for every 2026 Grand Prix — qualifying + race probabilities.'}
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
                    onClick={() => {
                      setSelectedRound(r.round);
                      setRequestedRound(r.round);
                    }}
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

      {/* Prediction source banner */}
      <Card className={`p-4 ${predictionsError ? 'border-red-500/30' : ''}`}>
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-neutral-100 dark:bg-white/5 text-neutral-500">
            <Database size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">
              {requestedRace ? `Supabase predictions · ${predictorGpLabel}` : 'Ready to load predictions'}
            </div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 break-all">
              {predictionsError
                ? predictionsError
                : requestedRace
                  ? 'Reading pre-computed APEX V7 outputs from race_predictions and quali_predictions.'
                  : 'Click a Grand Prix in the picker above to load saved predictions.'}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PredictionList
          title="Qualifying"
          subtitle="Pole probability · APEX V7 XGBoost"
          items={qualiPreds}
          loading={predictionsLoading}
          empty={
            !requestedRace
              ? 'Click a Grand Prix above to start'
              : currentRace
                ? `No qualifying prediction yet for ${currentRace.name}.`
                : 'Select a Grand Prix'
          }
          secondaryMetric={(it) => it.q3Hint != null ? `Q3 ${it.q3Hint.toFixed(1)}%` : null}
        />
        <PredictionList
          title="Race"
          subtitle="Win probability · APEX V7 XGBoost"
          items={racePreds}
          loading={predictionsLoading}
          empty={
            !requestedRace
              ? 'Click a Grand Prix above to start'
              : currentRace
                ? `No race prediction yet for ${currentRace.name}.`
                : 'Select a Grand Prix'
          }
          secondaryMetric={(it) => {
            const parts: string[] = [];
            if (it.expectedFinish != null) parts.push(`E${it.expectedFinish.toFixed(0)}`);
            if (it.gridPosition != null) parts.push(`G${it.gridPosition}`);
            return parts.length ? parts.join(' · ') : null;
          }}
        />
      </div>
    </div>
  );
}
