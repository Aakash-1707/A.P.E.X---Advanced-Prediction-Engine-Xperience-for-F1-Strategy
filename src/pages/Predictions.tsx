import Card from '../components/Card';
import { qualifyingPredictions, racePredictions } from '../data/mock';

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

export default function Predictions({ activeEvent }: { activeEvent?: number | null }) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-10">
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">ML model · v3.4.2</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">Predictions</h1>
        {activeEvent && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Round {activeEvent} context active</span>
          </div>
        )}
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl">
          Probabilistic forecasts generated from 12,400 historical sessions. Models are updated after every session.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Model accuracy', value: '82.6%' },
          { label: 'Confidence', value: 'High' },
          { label: 'Last update', value: '12 min ago' },
        ].map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{s.label}</div>
            <div className="text-2xl font-light text-neutral-900 dark:text-white mt-1">{s.value}</div>
          </Card>
        ))}
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
