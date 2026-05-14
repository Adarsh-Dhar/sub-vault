import './index.css';
import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen } from 'lucide-react';

export const Splash = () => {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-linear-to-b from-violet-600 via-violet-500 to-violet-400 px-4">
      <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.28),_transparent_68%)]" />

      <div className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] border border-white/30 bg-white/18 text-white shadow-2xl shadow-violet-950/20 backdrop-blur">
        <BookOpen className="h-12 w-12" />
      </div>

      <div className="relative max-w-xs space-y-3 text-center text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Daily Quiz</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-balance">
          Community Quiz
        </h1>
        <p className="mx-auto max-w-72 text-base text-white/78">
          Fast, visual quiz challenges with a more playful purple finish.
        </p>
      </div>

      <div className="relative w-full max-w-72 rounded-3xl border border-white/20 bg-white/16 p-4 shadow-2xl shadow-violet-950/15 backdrop-blur">
        <button
          className="flex h-13 w-full items-center justify-center rounded-full bg-white text-base font-bold text-violet-700 shadow-lg shadow-violet-950/10 transition-transform active:scale-[0.98] hover:bg-violet-50"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Start Quiz
        </button>
      </div>

      <p className="relative text-center text-xs text-white/60">
        Takes a few moments to open the full quiz experience.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);