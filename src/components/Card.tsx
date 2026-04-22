import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
};

export default function Card({ children, className = '', hover = false }: Props) {
  return (
    <div
      className={`rounded-2xl border border-black/5 dark:border-white/5 bg-white dark:bg-neutral-950/60 shadow-soft transition-theme ${
        hover ? 'hover:shadow-glow hover:-translate-y-0.5 transition-all duration-300' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
