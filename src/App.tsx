import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Chatbot from './components/Chatbot';
import Home from './pages/Home';
import Telemetry from './pages/Telemetry';
import Tyre from './pages/Tyre';
import Predictions from './pages/Predictions';
import Strategy from './pages/Strategy';
import Grid from './pages/Grid';
import Documentation from './pages/Documentation';

type Tab = 'home' | 'telemetry' | 'tyre' | 'predictions' | 'strategy' | 'grid' | 'docs';

function Footer() {
  return (
    <footer className="max-w-7xl mx-auto px-6 py-10 border-t border-black/5 dark:border-white/5 mt-10">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          A.P.E.X · Advanced Prediction Engine Xperience for Formula 1 Strategy
        </div>
        <div className="text-xs text-neutral-400 dark:text-neutral-500">
          © 2026 · Powered by real-time OpenF1 telemetry data
        </div>
      </div>
    </footer>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  const [activeEvent, setActiveEvent] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-neutral-900 dark:text-white transition-theme">
      <Navbar active={tab} onChange={setTab} />
      <main key={tab} className="animate-fade-in">
        {tab === 'home' && <Home onNavigate={(t) => setTab(t as any)} activeEvent={activeEvent} onEventChange={setActiveEvent} />}
        {tab === 'grid' && <Grid />}
        {tab === 'telemetry' && <Telemetry activeEvent={activeEvent} />}
        {tab === 'tyre' && <Tyre activeEvent={activeEvent} />}
        {tab === 'predictions' && <Predictions activeEvent={activeEvent} />}
        {tab === 'strategy' && <Strategy activeEvent={activeEvent} />}
        {tab === 'docs' && <Documentation />}
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
