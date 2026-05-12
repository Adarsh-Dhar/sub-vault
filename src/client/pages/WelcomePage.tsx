/**
 * WelcomePage - Initial splash screen shown to new subscribers
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Settings } from 'lucide-react';
import type { QuizSettings } from '../../shared/quiz-types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
        void navigate('/quiz');
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

  const difficultyLabel = settings?.difficulty || 'Medium';
  const questionsCount = settings?.questions_count || 5;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-primary/5 to-primary/10 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        {/* Welcome Card */}
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-center flex-1">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  📚
                </div>
              </div>
              {init?.isModerator && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsModalOpen(true)}
                  title="Configure quiz settings"
                  className="absolute right-4 top-4"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              )}
            </div>
            <div className="text-center">
              <CardTitle className="text-3xl font-bold">Welcome!</CardTitle>
              <p className="text-lg text-muted-foreground mt-2">
                Let's test your knowledge of our community guidelines
              </p>
              {init?.isModerator && (
                <p className="text-xs text-primary font-medium mt-2">👑 You're a moderator</p>
              )}
              {init?.username && init.username !== 'anonymous' && (
                <p className="text-sm font-medium text-foreground mt-2">Signed in as {init.username}</p>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {initError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {initError}
              </div>
            )}

            {/* Quiz Info Card */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <h3 className="font-semibold text-foreground">Quiz Details</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Difficulty:</span> {difficultyLabel}
                </li>
                <li>
                  <span className="font-medium text-foreground">Questions:</span> {questionsCount}
                </li>
                <li>
                  <span className="font-medium text-foreground">Passing Score:</span> {settings?.passing_score || 70}%
                </li>
              </ul>
            </div>

            {/* Description */}
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                This quick quiz will help us make sure you understand the key rules of our community.
                Take your time and answer each question carefully. You'll see your score and can retake the quiz if needed.
              </p>
            </div>

            {/* Start Button */}
            <Button
              onClick={() => void handleStartQuiz()}
              disabled={loading || initLoading || !init?.username || init.username === 'anonymous'}
              size="lg"
              className="w-full"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Starting Quiz...' : initLoading ? 'Loading Session...' : 'Start Quiz'}
            </Button>

            {/* Info */}
            <p className="text-center text-xs text-muted-foreground">
              This should only take a few minutes to complete
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Settings Modal - Only for Moderators */}
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
