import './index.css';
import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen } from 'lucide-react';

export const Splash = () => {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-b from-violet-600 via-violet-500 to-violet-400 px-4">
      {/* Top glow */}
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_65%)] pointer-events-none" />

      {/* Icon */}
      <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/30 bg-white/20 text-white shadow-2xl shadow-violet-950/20 backdrop-blur-sm">
        <BookOpen className="h-12 w-12" />
      </div>

      {/* Heading */}
      <div className="relative max-w-xs space-y-2 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Community Rank</p>
        <h1 className="text-4xl font-extrabold tracking-tight">
          Community Passport
        </h1>
        <p className="mx-auto max-w-64 text-sm text-white/75 leading-relaxed">
          Fast, visual rank tracking — earn your way through the community.
        </p>
      </div>

      {/* CTA card */}
      <div className="relative w-full max-w-xs rounded-3xl border border-white/20 bg-white/15 p-4 shadow-2xl shadow-violet-950/15 backdrop-blur-sm">
        <button
          className="flex h-12 w-full items-center justify-center rounded-full bg-white text-base font-bold text-violet-700 shadow-lg shadow-violet-950/10 transition-all active:scale-[0.98] hover:bg-violet-50"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Open Hub
        </button>
      </div>

      <p className="relative text-center text-xs text-white/55">
        Takes a moment to open the full rank experience.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);