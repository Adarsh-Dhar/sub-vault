import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Settings, ShieldAlert, ShieldCheck, BookOpen, ClipboardList, Target, Clock, ExternalLink, AlertTriangle, Zap } from 'lucide-react';
import type { QuizSettings } from '../../shared/quiz-types';
import { Button } from '../components/ui/button';
import { ModSettingsModal } from '../components/ModSettingsModal';
import { useInit } from '../contexts/init-context';
import { useToast } from '../hooks/use-toast';

export default function WelcomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<QuizSettings | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const { init, loading: initLoading, error: initError } = useInit();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/quiz-settings');
        if (response.ok) {
          const data = (await response.json()) as QuizSettings;
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
      const response = await fetch('/api/quiz/generate', { method: 'POST' });
      if (response.ok) {
        void navigate('/quiz', { state: { freshGenerate: true } });
      } else {
        const error = (await response.json()) as { message?: string };
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
  const retryCooldown = settings?.retry_cooldown_minutes || 10;
  const username = init?.username && init.username !== 'anonymous' ? init.username : 'Guest';
  const initial = username[0]?.toUpperCase() || 'G';
  const isVerified = false;

  return (
    <div className="min-h-screen bg-linear-to-b from-violet-600 via-violet-500 to-violet-400 px-4 pb-28 pt-8">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">

        {/* Top bar: subreddit context + mod settings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-widest text-white/80">
              r/Community · Checkpoint
            </span>
          </div>
          {init?.isModerator && (
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30"
              aria-label="Configure quiz settings"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Identity card */}
        <div className="rounded-3xl border border-white/20 bg-white/15 p-4 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-white/40 bg-white/20 text-sm font-bold text-white">
                {initial}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{username}</p>
                <p className="text-xs text-white/65 font-mono">reddit user</p>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1.5 text-xs font-semibold ${
              isVerified
                ? 'bg-green-400/20 text-green-100'
                : 'bg-red-400/20 text-red-100'
            }`}>
              {isVerified
                ? <><ShieldCheck className="h-3.5 w-3.5" /> Verified</>
                : <><ShieldAlert className="h-3.5 w-3.5" /> Restricted</>
              }
            </div>
          </div>
        </div>

        {initError && (
          <div className="flex items-start gap-2 rounded-3xl border border-white/20 bg-white/15 px-4 py-3 text-xs text-white/90 backdrop-blur">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{initError}</span>
          </div>
        )}

        {/* Mod mandate */}
        <div className="rounded-3xl border border-white/20 bg-white/15 p-4 shadow-xl backdrop-blur">
          <div className="mb-3 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-white">Verification Required</h2>
          </div>
          <p className="text-xs leading-relaxed text-white/85">
            To protect this community from spam and ensure high-quality discussions, the moderation team requires all new contributors to verify their understanding of the subreddit rules before posting.
          </p>
        </div>

        {/* Assessment parameters */}
        <div className="rounded-3xl border border-white/20 bg-white/15 p-4 shadow-xl backdrop-blur">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/70">Assessment Parameters</p>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 border border-white/20">
                <ClipboardList className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">
                  {questionsCount} Randomized Rule Scenarios
                </p>
                <p className="text-[11px] text-white/65">Questions drawn from community guidelines</p>
              </div>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 border border-white/20">
                <Target className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">
                  {passingScore}% Required to Unlock Posting
                </p>
                <p className="text-[11px] text-white/65">Posting privileges granted on pass</p>
              </div>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 border border-white/20">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-white">
                  {retryCooldown}-Minute Lockout on Failure
                </p>
                <p className="text-[11px] text-white/65">Cooldown enforced between attempts</p>
              </div>
            </div>
          </div>
        </div>

        {/* Study prep */}
        <div className="rounded-3xl border border-white/20 bg-white/15 p-4 shadow-xl backdrop-blur">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/70">Before You Begin</p>
          <p className="mb-3 text-xs text-white/80">
            Review the community rules before taking the assessment to improve your chances of passing.
          </p>
          <a
            href="https://www.reddit.com/r/help/wiki/index"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/30"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Read Subreddit Rules
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Bottom sheet with CTA and points */}
        <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-4xl bg-white px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
          <div className="mx-auto mb-4 flex max-w-md items-end justify-between">
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">🏠</span>
              <span className="text-[10px] font-medium text-violet-600">Checkpoint</span>
              <div className="h-1 w-1 rounded-full bg-violet-600" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">📊</span>
              <span className="text-[10px] font-medium text-gray-400">Progress</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">📚</span>
              <span className="text-[10px] font-medium text-gray-400">Resources</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">⚙️</span>
              <span className="text-[10px] font-medium text-gray-400">Settings</span>
            </div>
          </div>
          <Button
            onClick={() => void handleStartQuiz()}
            disabled={loading || initLoading || !init?.username || init.username === 'anonymous'}
            size="lg"
            className="h-13 w-full rounded-full bg-violet-600 text-base font-bold text-white shadow-lg shadow-violet-300 hover:bg-violet-700"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Preparing Assessment…' : initLoading ? 'Loading…' : `Begin Verification · Pass ${passingScore}%`}
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
