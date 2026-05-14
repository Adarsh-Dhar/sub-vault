import { useEffect, useState } from 'react';
import type { RankLevel } from '../../shared/rank-types';
import { LEVEL_BADGES, LEVEL_NAMES } from '../../shared/rank-types';

interface LevelUpOverlayProps {
  level: RankLevel;
  onClose: () => void;
}

export function LevelUpOverlay({ level, onClose }: LevelUpOverlayProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 4000); // Show for 4 seconds

    return () => clearTimeout(timer);
  }, [onClose]);

  if (!isVisible) return null;

  const levelName = LEVEL_NAMES[level];
  const badgeEmoji = LEVEL_BADGES[level];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-none animate-fade-in">
      <div className="bg-white rounded-lg p-12 text-center max-w-md animate-scale-up">
        {/* Confetti effect simulation */}
        <div className="mb-6">
          <div className="text-6xl animate-bounce mb-4">{badgeEmoji}</div>
        </div>

        <h1 className="text-4xl font-bold mb-2">Level Up! 🎉</h1>
        <p className="text-2xl font-semibold text-indigo-600 mb-4">
          {badgeEmoji} {levelName}
        </p>

        <p className="text-slate-600">
          You've reached level {level}! Great job engaging with the community.
        </p>

        {/* Confetti-like decorative elements */}
        <div className="mt-8 flex justify-center gap-2 text-3xl animate-pulse">
          <span>✨</span>
          <span>🎊</span>
          <span>✨</span>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scale-up {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        .animate-fade-in {
          animation: fade-in 0.3s ease-in;
        }

        .animate-scale-up {
          animation: scale-up 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
