import { useEffect } from 'react';
import type { QuizResult } from '../../shared/quiz-types';
import { Button } from './ui/button';

export interface ResultBannerProps {
  result: QuizResult;
  onRetry?: (() => void) | undefined;
  onHome?: (() => void | Promise<void>) | undefined;
}

export function ResultBanner({
  result,
  onRetry,
  onHome,
}: ResultBannerProps) {
  const isPass = result.passed;

  // Flash document title on pass
  useEffect(() => {
    if (isPass) {
      const original = document.title;
      document.title = '🎉 You passed!';
      const t = setTimeout(() => {
        document.title = original;
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [isPass]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-violet-600 to-violet-400 px-4 py-10">
      <div className="mb-4 rounded-xl border border-white/30 bg-white/20 px-5 py-1.5">
        <p className="text-sm font-semibold text-white">
          Correct Answer {result.correct_answers}/{result.total_questions}
        </p>
      </div>

      <div className="mb-6 flex w-full max-w-xs flex-col items-center rounded-3xl bg-white p-6 shadow-2xl">
        <div className="relative mb-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-violet-400 bg-violet-200 text-4xl">
            {isPass ? '🏆' : '😔'}
          </div>
          {isPass && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-violet-600 px-3 py-0.5 text-[10px] font-bold text-white">
              Top Player
            </div>
          )}
        </div>

        <div className="mb-2 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-gray-500">Rank</p>
          <p className="text-5xl font-extrabold leading-none text-violet-700">{result.score}</p>
        </div>

        <div className="mb-4 flex gap-1">
          {[1, 2, 3].map((index) => (
            <div
              key={index}
              className={`h-8 w-2 rounded-full ${index === 2 ? 'h-10 bg-violet-600' : 'bg-violet-300'}`}
            />
          ))}
        </div>

        <h2 className="text-center text-lg font-bold text-gray-800">
          {isPass ? "Congratulations, you've completed this quiz!" : 'Keep practicing!'}
        </h2>
        <p className="mt-1 text-center text-xs text-gray-400">
          {isPass
            ? "Let's keep testing your knowledge by playing more quizzes!"
            : result.explanation}
        </p>
      </div>

      {isPass && (
        <div className="mb-4 w-full max-w-xs rounded-2xl border border-white/30 bg-white/20 p-4 text-center">
          <p className="text-sm font-semibold text-white">🔓 Posting privileges unlocked!</p>
          <p className="mt-1 text-xs text-white/70">Your flair has been updated to verified status.</p>
        </div>
      )}

      <div className="flex w-full max-w-xs gap-3">
        {!isPass && onRetry && (
          <Button onClick={onRetry} className="h-12 flex-1 rounded-full bg-white font-bold text-violet-700 hover:bg-violet-50">
            Try Again
          </Button>
        )}
        <Button
          onClick={onHome}
          className="h-12 flex-1 rounded-full bg-amber-400 font-bold text-amber-900 hover:bg-amber-500"
        >
          Explore More
        </Button>
      </div>
    </div>
  );
}
