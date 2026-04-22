import { MessageSquare, X, Send, Sparkles } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

import { askNiki, ChatMessage } from '../lib/niki';

const SEED: ChatMessage[] = [
  { role: 'model', parts: [{ text: 'Hi, I\'m N.I.K.I (Natural Interface for Knowledge & Information). Ask me about telemetry, strategy, or race predictions.' }] },
];

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(SEED);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string>('Online · Live data');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, status]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    
    const newUserMsg: ChatMessage = { role: 'user', parts: [{ text: trimmed }] };
    setMessages((m) => [...m, newUserMsg]);
    setInput('');
    setIsLoading(true);
    setStatus("N.I.K.I is typing...");

    try {
      // Pass all previous messages except the seed message (or include the seed, up to you)
      // Including the seed is fine, it establishes personality in context.
      const responseText = await askNiki(messages, trimmed, (s) => setStatus(s));
      setMessages((m) => [...m, { role: 'model', parts: [{ text: responseText }] }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'model', parts: [{ text: 'Connection failed. Check your API key.' }] }]);
    } finally {
      setIsLoading(false);
      setStatus("Online · Live data");
    }
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
          <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-neutral-900 dark:bg-white flex items-center justify-center overflow-hidden shrink-0">
              <img src="/niki.jpg" alt="NIKI" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-white">N.I.K.I</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{status}</div>
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
                  {m.parts[0].text}
                </div>
              </div>
            ))}
            {isLoading && (
               <div className="flex justify-start">
                  <div className="bg-neutral-100 text-neutral-800 dark:bg-white/5 dark:text-neutral-200 rounded-2xl px-3.5 py-2 text-sm italic">
                    typing...
                  </div>
               </div>
            )}
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
