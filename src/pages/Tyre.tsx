import Card from '../components/Card';
import LineChart from '../components/LineChart';
import { tyreData } from '../data/mock';
import { Circle } from 'lucide-react';

const compounds = [
  { key: 'soft' as const, name: 'Soft', tone: 'text-red-500 dark:text-red-400', border: 'border-red-500/30', pace: 'Fastest', life: '18-22 laps', deg: 'High' },
  { key: 'medium' as const, name: 'Medium', tone: 'text-amber-500 dark:text-amber-400', border: 'border-amber-500/30', pace: 'Balanced', life: '28-34 laps', deg: 'Moderate' },
  { key: 'hard' as const, name: 'Hard', tone: 'text-neutral-400 dark:text-neutral-500', border: 'border-neutral-500/30', pace: 'Consistent', life: '40-48 laps', deg: 'Low' },
];

export default function Tyre({ activeEvent }: { activeEvent?: number | null }) {
  const pad = (arr: { lap: number; wear: number }[], len: number) => {
    const data = arr.map((x) => x.wear);
    while (data.length < len) data.push(NaN as unknown as number);
    return data.map((v) => (isNaN(v) ? 0 : v));
  };
  const maxLen = 45;

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-10">
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Compound modeling</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">Tyre Degradation</h1>
        {activeEvent && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Round {activeEvent} context active</span>
          </div>
        )}
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl">
          Thermal and mechanical wear projections across compound families. Data derived from practice long-runs and race simulations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {compounds.map((c) => (
          <Card key={c.key} hover className={`p-6 border-t-2 ${c.border}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Circle className={`w-3 h-3 ${c.tone}`} fill="currentColor" />
                <span className="text-lg font-semibold text-neutral-900 dark:text-white">{c.name}</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">C{c.key === 'soft' ? '5' : c.key === 'medium' ? '3' : '1'}</span>
            </div>
            <div className="space-y-3">
              {[
                { k: 'Pace', v: c.pace },
                { k: 'Life', v: c.life },
                { k: 'Degradation', v: c.deg },
              ].map((r) => (
                <div key={r.k} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">{r.k}</span>
                  <span className="text-neutral-900 dark:text-white font-medium">{r.v}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-white">Wear curve comparison</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">% wear over stint length</div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><Circle className="w-2 h-2 text-red-500" fill="currentColor" /><span className="text-neutral-500 dark:text-neutral-400">Soft</span></div>
            <div className="flex items-center gap-1.5"><Circle className="w-2 h-2 text-amber-500" fill="currentColor" /><span className="text-neutral-500 dark:text-neutral-400">Medium</span></div>
            <div className="flex items-center gap-1.5"><Circle className="w-2 h-2 text-neutral-400" fill="currentColor" /><span className="text-neutral-500 dark:text-neutral-400">Hard</span></div>
          </div>
        </div>
        <LineChart
          series={[
            { data: pad(tyreData.soft, maxLen), label: 'Soft', color: '#ef4444' },
            { data: pad(tyreData.medium, maxLen), label: 'Medium', color: '#f59e0b' },
            { data: pad(tyreData.hard, maxLen), label: 'Hard', color: '#a3a3a3' },
          ]}
          height={300}
          yMax={100}
          yMin={0}
          xLabel="Lap"
          yLabel="Wear %"
        />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <Card className="p-6">
          <div className="text-sm font-semibold text-neutral-900 dark:text-white mb-4">Optimal stint lengths</div>
          <div className="space-y-4">
            {compounds.map((c) => (
              <div key={c.key}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <Circle className={`w-2.5 h-2.5 ${c.tone}`} fill="currentColor" />
                    <span className="text-neutral-900 dark:text-white">{c.name}</span>
                  </div>
                  <span className="text-neutral-500 dark:text-neutral-400 text-xs">{c.life}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-white/5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.key === 'soft' ? 'bg-red-500/60' : c.key === 'medium' ? 'bg-amber-500/60' : 'bg-neutral-400/60'}`}
                    style={{ width: c.key === 'soft' ? '35%' : c.key === 'medium' ? '62%' : '90%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="text-sm font-semibold text-neutral-900 dark:text-white mb-4">Recommended strategy</div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/5">
              <span className="text-neutral-900 dark:text-white">1-stop · M → H</span>
              <span className="text-emerald-600 dark:text-emerald-400 text-xs">Optimal</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/5">
              <span className="text-neutral-900 dark:text-white">2-stop · S → M → H</span>
              <span className="text-neutral-500 dark:text-neutral-400 text-xs">+4.2s</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-white/5">
              <span className="text-neutral-900 dark:text-white">1-stop · H → M</span>
              <span className="text-neutral-500 dark:text-neutral-400 text-xs">+1.8s</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
