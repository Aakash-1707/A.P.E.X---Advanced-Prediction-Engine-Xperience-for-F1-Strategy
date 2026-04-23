import { Moon, Sun, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

type Tab = 'home' | 'telemetry' | 'tyre' | 'predictions' | 'strategy' | 'grid' | 'docs';
type Props = { active: Tab; onChange: (t: Tab) => void };

const tabs: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'grid', label: 'The Grid' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'tyre', label: 'Tyre Analysis' },
  { id: 'predictions', label: 'Predictions' },
  { id: 'strategy', label: 'Strategy' },
  { id: 'docs', label: 'Docs' },
];

export default function Navbar({ active, onChange }: Props) {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="glass border-b border-black/5 dark:border-white/5 bg-white/70 dark:bg-black/50 transition-theme">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <button
            onClick={() => onChange('home')}
            className="flex items-center gap-3 group"
          >
            <div className="w-20 h-20 overflow-hidden">
              <img
                src="/apex-logo.png"
                alt="A.P.E.X logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="font-semibold tracking-[0.22em] text-[14px] text-neutral-900 dark:text-white">A.P.E.X</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400 mt-1">Race Intelligence</span>
            </div>
          </button>

          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={`relative px-4 py-2 text-sm font-medium rounded-full transition-all ${
                  active === t.id
                    ? 'text-neutral-900 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                {active === t.id && (
                  <span className="absolute inset-0 rounded-full bg-neutral-100 dark:bg-white/10 -z-10" />
                )}
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="relative w-14 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 transition-colors flex items-center px-1"
            >
              <span
                className={`w-5 h-5 rounded-full bg-white dark:bg-neutral-950 shadow-sm flex items-center justify-center transition-transform duration-300 ${
                  theme === 'dark' ? 'translate-x-7' : 'translate-x-0'
                }`}
              >
                {theme === 'dark' ? (
                  <Moon className="w-3 h-3 text-neutral-300" />
                ) : (
                  <Sun className="w-3 h-3 text-amber-500" />
                )}
              </span>
            </button>


            <button
              onClick={() => setOpen((v) => !v)}
              className="md:hidden w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center text-neutral-700 dark:text-neutral-300"
            >
              {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {open && (
          <div className="md:hidden border-t border-black/5 dark:border-white/5 px-4 py-3 flex flex-col gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { onChange(t.id); setOpen(false); }}
                className={`text-left px-4 py-2 rounded-lg text-sm ${
                  active === t.id
                    ? 'bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}
