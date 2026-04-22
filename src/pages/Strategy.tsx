import { useMemo, useState } from 'react';
import Card from '../components/Card';
import { Circle, Flag, Play } from 'lucide-react';

type Compound = 'S' | 'M' | 'H';
type Stint = { compound: Compound; laps: number };

const compoundColor: Record<Compound, string> = {
  S: 'bg-red-500',
  M: 'bg-amber-500',
  H: 'bg-neutral-400',
};
const compoundLabel: Record<Compound, string> = { S: 'Soft', M: 'Medium', H: 'Hard' };

export default function Strategy({ activeEvent }: { activeEvent?: number | null }) {
  const [totalLaps, setTotalLaps] = useState(56);
  const [stints, setStints] = useState<Stint[]>([
    { compound: 'M', laps: 20 },
    { compound: 'H', laps: 36 },
  ]);

  const used = stints.reduce((a, s) => a + s.laps, 0);
  const expectedTime = useMemo(() => {
    const base = 1.212 * totalLaps;
    const deg = stints.reduce((acc, s) => {
      const factor = s.compound === 'S' ? 0.0042 : s.compound === 'M' ? 0.0029 : 0.0022;
      return acc + s.laps * s.laps * factor;
    }, 0);
    const stops = (stints.length - 1) * 22;
    const minutes = Math.floor((base * 60 + deg * 60 + stops) / 60);
    const seconds = ((base * 60 + deg * 60 + stops) % 60).toFixed(2);
    return `${minutes}:${seconds.padStart(5, '0')}`;
  }, [stints, totalLaps]);

  const updateStint = (i: number, patch: Partial<Stint>) => {
    setStints((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const addStint = () => setStints((prev) => [...prev, { compound: 'H', laps: 10 }]);
  const removeStint = (i: number) => setStints((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-10">
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">Race simulator</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">Strategy</h1>
        {activeEvent && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Round {activeEvent} context active</span>
          </div>
        )}
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-xl">
          Configure stints, tyre compounds, and pit windows. The simulator projects expected race time based on degradation curves.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1">
          <div className="text-sm font-semibold text-neutral-900 dark:text-white mb-4">Configuration</div>

          <label className="block mb-5">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">Race distance</div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={30}
                max={75}
                value={totalLaps}
                onChange={(e) => setTotalLaps(Number(e.target.value))}
                className="flex-1 accent-neutral-900 dark:accent-white"
              />
              <div className="w-14 text-right text-sm text-neutral-900 dark:text-white tabular-nums">{totalLaps} laps</div>
            </div>
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
                        <Circle className={`w-2 h-2 ${compoundColor[c].replace('bg-', 'text-')}`} fill="currentColor" />
                        {compoundLabel[c]}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={5}
                    max={50}
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">Projected race</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Laps covered {used}/{totalLaps} {used !== totalLaps && <span className="text-amber-600 dark:text-amber-400">· mismatch</span>}
              </div>
            </div>
            <button className="px-4 py-2 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black text-xs font-medium flex items-center gap-1.5 hover:scale-[1.02] transition-transform">
              <Play className="w-3 h-3" fill="currentColor" /> Simulate
            </button>
          </div>

          <div className="mb-8">
            <div className="flex items-center justify-between mb-3 text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              <span>Lap 1</span>
              <span>Lap {totalLaps}</span>
            </div>
            <div className="relative h-10 rounded-xl overflow-hidden bg-neutral-100 dark:bg-white/5 flex">
              {stints.map((s, i) => {
                const width = (s.laps / Math.max(used, totalLaps)) * 100;
                return (
                  <div
                    key={i}
                    className={`h-full ${compoundColor[s.compound]} opacity-70 flex items-center justify-center text-[10px] font-medium text-white relative`}
                    style={{ width: `${width}%` }}
                  >
                    {width > 8 && <span>{compoundLabel[s.compound]} · {s.laps}L</span>}
                    {i < stints.length - 1 && (
                      <div className="absolute right-0 top-0 h-full w-0.5 bg-white dark:bg-black" />
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
            {[
              { k: 'Expected race time', v: expectedTime },
              { k: 'Expected avg pace', v: '1:14.8' },
              { k: 'Risk level', v: stints.length > 2 ? 'Medium' : 'Low' },
            ].map((r) => (
              <div key={r.k} className="p-4 rounded-xl bg-neutral-50 dark:bg-white/5">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{r.k}</div>
                <div className="text-xl font-light text-neutral-900 dark:text-white mt-1 tabular-nums">{r.v}</div>
              </div>
            ))}
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
                    <div className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">+22.4s</div>
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
