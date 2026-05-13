import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Settings, Trophy, Zap } from 'lucide-react';
import type { QuizSettings } from '../../shared/quiz-types';
import { Button } from '../components/ui/button';
import { ModSettingsModal } from '../components/ModSettingsModal';
import { useInit } from '../contexts/init-context';
import { useToast } from '../hooks/use-toast';

const CATEGORIES = [
  { label: 'Football', emoji: '⚽' },
  { label: 'Science', emoji: '🔬' },
  { label: 'Fashion', emoji: '👗' },
  { label: 'Movie', emoji: '🎬' },
  { label: 'Music', emoji: '🎵' },
];

const MORE_GAMES = [
  { title: 'Language Quiz', count: 15, players: '24.7K', emoji: '⚔️' },
  { title: 'Exam Quiz', count: 12, players: '12.5K', emoji: '🔮' },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<QuizSettings | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const { init, loading: initLoading, error: initError } = useInit();

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/quiz-settings');
        if (response.ok) {
          const data = await response.json() as QuizSettings;
          setSettings(data);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      }
    };

    void fetchSettings();
  }, []);

  const handleStartQuiz = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/quiz/generate', {
        method: 'POST',
      });

      if (response.ok) {
        void navigate('/quiz', { state: { freshGenerate: true } });
      } else {
        const error = await response.json() as { message?: string };
        toast({
          title: 'Error',
          description: error.message || 'Failed to start quiz',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error starting quiz:', error);
      toast({
        title: 'Error',
        description: 'Failed to connect to server',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const questionsCount = settings?.questions_count || 5;
  const passingScore = settings?.passing_score || 70;
  const username = init?.username && init.username !== 'anonymous' ? init.username : 'Guest';
  const initial = username[0]?.toUpperCase() || 'G';

  return (
    <div className="min-h-screen bg-linear-to-b from-violet-600 via-violet-500 to-violet-400 px-4 pb-28 pt-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/60 bg-white/30 text-lg font-bold text-white shadow-lg">
              {initial}
            </div>
            <div>
              <p className="text-xs text-white/70">Welcome back</p>
              <div className="flex items-center gap-2">
                <p className="text-base font-bold leading-tight text-white">{username}</p>
                {init?.isModerator && (
                  <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Expert</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5">
              <Zap className="h-4 w-4 fill-amber-300 text-amber-300" />
              <span className="text-sm font-bold text-white">1200</span>
            </div>
            {init?.isModerator && (
              <button
                onClick={() => setSettingsModalOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"
                aria-label="Configure quiz settings"
              >
                <Settings className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
        </div>

        {initError && (
          <div className="rounded-2xl border border-white/20 bg-white/15 px-4 py-3 text-sm text-white">
            {initError}
          </div>
        )}

        <div className="rounded-3xl border border-white/20 bg-white/15 p-4 shadow-xl backdrop-blur">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl">
                ⚓
              </div>
              <div>
                <p className="text-sm font-bold text-white">Daily Task</p>
                <p className="text-xs text-white/65">{questionsCount} Questions</p>
              </div>
            </div>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20" aria-label="Daily task group">
              <span className="text-xs text-white">👥</span>
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-white/20">
              <div className="h-1.5 rounded-full bg-amber-400" style={{ width: '65%' }} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">Progress</span>
              <span className="text-white/80">{Math.round(questionsCount * 0.65)}/{questionsCount}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-bold text-white">Quiz</p>
            <button className="text-xs text-white/70">View All</button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {CATEGORIES.map((category) => (
              <div key={category.label} className="flex shrink-0 flex-col items-center gap-1.5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-2xl">
                  {category.emoji}
                </div>
                <p className="text-[11px] font-medium text-white/80">{category.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-base font-bold text-white">More Games</p>
            <button className="text-xs text-white/70">View All</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MORE_GAMES.map((game) => (
              <div key={game.title} className="rounded-3xl border border-white/20 bg-white/15 p-3 backdrop-blur">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-2xl">
                  {game.emoji}
                </div>
                <p className="text-sm font-semibold text-white">{game.title}</p>
                <p className="text-xs text-white/60">{game.count} Questions</p>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-amber-400" />
                    <span className="text-xs text-white/70">{game.players}</span>
                  </div>
                  <button className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400">
                    <Zap className="h-3.5 w-3.5 text-amber-900" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-[2rem] bg-white px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
          <div className="mx-auto mb-4 flex max-w-md items-end justify-around">
            {[
              { icon: '🏠', label: 'Explore', active: true },
              { icon: '🏆', label: 'Leaderboard' },
              { icon: '🔖', label: 'Bookmarks' },
              { icon: '⚙️', label: 'Settings' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-1">
                <span className="text-xl">{item.icon}</span>
                <span className={`text-[10px] font-medium ${item.active ? 'text-violet-600' : 'text-gray-400'}`}>
                  {item.label}
                </span>
                {item.active && <div className="h-1 w-1 rounded-full bg-violet-600" />}
              </div>
            ))}
          </div>
          <Button
            onClick={() => void handleStartQuiz()}
            disabled={loading || initLoading || !init?.username || init.username === 'anonymous'}
            size="lg"
            className="h-13 w-full rounded-full bg-violet-600 text-base font-bold text-white shadow-lg shadow-violet-300 hover:bg-violet-700"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Starting...' : initLoading ? 'Loading...' : `Start Quiz · Pass ${passingScore}%`}
          </Button>
        </div>
      </div>

      {init?.isModerator && (
        <ModSettingsModal
          open={settingsModalOpen}
          onOpenChange={setSettingsModalOpen}
          currentSettings={settings}
          onSettingsUpdated={setSettings}
        />
      )}
    </div>
  );
}
