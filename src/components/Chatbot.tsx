import { MessageSquare, X, Send, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

type Message = { role: 'user' | 'bot'; content: string };

const SEED: Message[] = [
  { role: 'bot', content: 'Hi, I\'m A.P.E.X Assistant. Ask me about telemetry, strategy, or race predictions.' },
];

const CANNED: Record<string, string> = {
  default: 'I\'m analyzing session data. Try asking about tyre strategy, qualifying pace, or race predictions.',
  tyre: 'Based on current degradation models, a medium-hard strategy offers the lowest expected time loss at ~22.4s across a full race distance.',
  strategy: 'Optimal pit window: lap 18-22 for a one-stop. Undercut risk is high if VER pits on lap 17.',
  qualifying: 'Current model gives VER 32% pole probability, followed by NOR at 28%. Track evolution favors later runs.',
  race: 'Race win probabilities lean McLaren-heavy this round: NOR 34%, VER 30%, PIA 16%.',
};

function respond(input: string): string {
  const q = input.toLowerCase();
  if (q.includes('tyre') || q.includes('tire')) return CANNED.tyre;
  if (q.includes('strategy') || q.includes('pit')) return CANNED.strategy;
  if (q.includes('quali')) return CANNED.qualifying;
  if (q.includes('race') || q.includes('predict')) return CANNED.race;
  return CANNED.default;
}

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((m) => [...m, { role: 'user', content: trimmed }]);
    setInput('');
    setTimeout(() => {
      setMessages((m) => [...m, { role: 'bot', content: respond(trimmed) }]);
    }, 500);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Open assistant"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black shadow-glow flex items-center justify-center hover:scale-105 transition-transform"
      >
        {open ? <X className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
      </button>

      <div
        className={`fixed bottom-24 right-6 z-50 w-[360px] max-w-[calc(100vw-3rem)] h-[520px] max-h-[calc(100vh-8rem)] transition-all duration-300 origin-bottom-right ${
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="glass h-full rounded-2xl bg-white/80 dark:bg-neutral-950/80 border border-black/5 dark:border-white/10 shadow-glow flex flex-col overflow-hidden transition-theme">
          <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-neutral-900 dark:bg-white flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white dark:text-black" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">A.P.E.X Assistant</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Online · Live data</div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                      : 'bg-neutral-100 text-neutral-800 dark:bg-white/5 dark:text-neutral-200'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2 bg-neutral-100 dark:bg-white/5 rounded-full px-4 py-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask about strategy, tyres..."
                className="flex-1 bg-transparent text-sm outline-none text-neutral-900 dark:text-white placeholder:text-neutral-400"
              />
              <button
                onClick={send}
                className="w-7 h-7 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-black flex items-center justify-center hover:scale-105 transition-transform"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
