import { BookOpen, Cpu, Database, Gauge, Cloud, Bot, Shield, Rocket } from 'lucide-react';
import Card from '../components/Card';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'how-to-use', label: 'How To Use' },
  { id: 'predictions', label: 'Predictions Flow' },
  { id: 'deployment', label: 'Deployment Notes' },
];

function SectionTitle({ icon, title, id }: { icon: React.ReactNode; title: string; id: string }) {
  return (
    <div id={id} className="pt-3 scroll-mt-24">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-neutral-500 dark:text-neutral-400">{icon}</span>
        <h2 className="text-xl md:text-2xl font-semibold text-neutral-900 dark:text-white">{title}</h2>
      </div>
    </div>
  );
}

export default function Documentation() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-12 animate-fade-in">
      <div className="mb-8">
        <span className="text-xs uppercase tracking-widest text-neutral-500 dark:text-neutral-400">README</span>
        <h1 className="text-4xl font-light text-neutral-900 dark:text-white mt-2">A.P.E.X Documentation</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-3 max-w-3xl">
          Advanced Prediction Engine Xperience for Formula 1 strategy analysis. This guide explains core capabilities,
          how to use each module, and how predictions are generated and served in production.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <Card className="p-4 h-fit lg:sticky lg:top-20">
          <div className="text-[10px] uppercase tracking-widest text-neutral-500 dark:text-neutral-400 mb-3">
            On this page
          </div>
          <div className="flex flex-col gap-1.5">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="text-sm rounded-lg px-2.5 py-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors"
              >
                {s.label}
              </a>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <SectionTitle id="overview" icon={<BookOpen size={16} />} title="Overview" />
            <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
              A.P.E.X combines live Formula 1 feeds, historical model outputs, and strategy tooling into a single dashboard.
              It is designed to answer three practical race questions: who is fast, what tyres will do, and what outcomes are
              most likely this weekend.
            </p>
          </Card>

          <Card className="p-6">
            <SectionTitle id="capabilities" icon={<Rocket size={16} />} title="Capabilities" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <div className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Gauge size={15} /> Telemetry</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Session pace, sector trends, and lap-by-lap signals.</p>
              </div>
              <div className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Cpu size={15} /> Predictions</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Precomputed qualifying and race probabilities per GP.</p>
              </div>
              <div className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Cloud size={15} /> Weather-aware context</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Track temp, air temp, rain risk, and wind overlays.</p>
              </div>
              <div className="rounded-xl border border-black/5 dark:border-white/10 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Bot size={15} /> N.I.K.I assistant</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">F1-focused assistant with secure server-side key proxying.</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle id="how-to-use" icon={<Database size={16} />} title="How To Use" />
            <ol className="list-decimal pl-5 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              <li>Open the GP picker and select a race weekend.</li>
              <li>Review weather cards first to understand expected tyre constraints.</li>
              <li>Use the Predictions tab for likely front-runners in quali and race.</li>
              <li>Use Tyre Analysis + Strategy tabs to compare pit-window scenarios.</li>
              <li>Use N.I.K.I for quick context questions (standings, race scenarios, tradeoffs).</li>
            </ol>
          </Card>

          <Card className="p-6">
            <SectionTitle id="predictions" icon={<Cpu size={16} />} title="Predictions Flow" />
            <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              <p><strong>Offline compute:</strong> GitHub Actions runs the ML pipeline and writes outputs to Supabase.</p>
              <p><strong>Storage:</strong> results are upserted into <code>race_predictions</code> and <code>quali_predictions</code>.</p>
              <p><strong>Frontend read:</strong> the app fetches rows by canonical <code>gp_name</code> when you pick a GP.</p>
              <p><strong>Result:</strong> predictions work on any device without local Python services.</p>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle id="deployment" icon={<Shield size={16} />} title="Deployment Notes" />
            <ul className="list-disc pl-5 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              <li>Frontend is deployed on Netlify as a static site.</li>
              <li>Secrets are not shipped to the browser.</li>
              <li>Groq/Gemini keys are used only in Netlify Functions via server env vars.</li>
              <li>Required client env vars: <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
