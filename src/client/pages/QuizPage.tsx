import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { QuizState, QuizResult } from '../../shared/quiz-types';
import { ResultBanner } from '../components/ResultBanner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { useInit } from '../contexts/init-context';
import { useToast } from '../hooks/use-toast';
import { debounce } from '../lib/utils-devvit';

/**
 * QuizSkeleton - Animated loading skeleton that mimics quiz layout
 */
function QuizSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* Header skeleton */}
        <div className="space-y-4">
          <div className="h-8 w-24 rounded-md bg-muted animate-pulse" />
          <div className="h-2 w-full rounded-full bg-muted animate-pulse" />
        </div>
        {/* Question card skeletons */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-6 space-y-4">
            <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function QuizPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { init, loading: initLoading, error: initError } = useInit();

  const isFreshGenerate = location.state?.freshGenerate === true;

  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [maxAttemptsReached, setMaxAttemptsReached] = useState(false);
  const [veteranBypassed, setVeteranBypassed] = useState(false);
  const cooldownIntervalRef = useRef<number | null>(null);

  // Fetch quiz state on mount
  useEffect(() => {
    if (initLoading || !init) {
      return;
    }

    const fetchQuiz = async () => {
      try {
        const response = await fetch(`/api/quiz/${init.username}`);

        if (response.ok) {
          const data = (await response.json()) as QuizState & { veteranBypassed?: boolean };
          
          // Handle veteran bypass
          if (data.veteranBypassed) {
            setVeteranBypassed(true);
            setLoading(false);
            toast({
              title: 'Veteran Status Recognized',
              description: 'Your account qualifies for veteran status. Assigning flair...',
              variant: 'default',
            });
            // Navigate to home after delay to show message
            setTimeout(() => navigate('/'), 2000);
            return;
          }

          setQuizState(data);
          // Pre-populate answers if they exist
          if (data.submitted_answers && Object.keys(data.submitted_answers).length > 0) {
            setAnswers(data.submitted_answers);
          }
          if (data.result) {
            setResult(data.result);
          }
        } else if (response.status === 404) {
          toast({
            title: 'Quiz Not Found',
            description: 'Please start a new quiz from the welcome page.',
            variant: 'destructive',
          });
          void navigate('/');
        }
      } catch (error) {
        console.error('Error fetching quiz:', error);
        toast({
          title: 'Error',
          description: 'Failed to load quiz',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchQuiz();
  }, [init, initLoading, navigate, toast]);

  const handleAnswer = (questionId: number, optionIndex: number) => {
    setAnswers((prev) => {
      const next = {
        ...prev,
        [questionId]: optionIndex,
      };
      if (quizState) {
        // Debounced autosave of answers
        debouncedSaveRef.current?.(quizState.username, next);
      }
      return next;
    });
  };

  // Autosave helpers
  const saveProgress = async (username: string, answersToSave: Record<number, number>) => {
    try {
      await fetch('/api/quiz/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, answers: answersToSave }),
      });
    } catch (err) {
      console.warn('Autosave failed', err);
    }
  };

  const debouncedSaveRef = useRef(
    debounce((username: string, answersToSave: Record<number, number>) => {
      void saveProgress(username, answersToSave);
    }, 1000)
  );

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    if (!quizState) return;

    // Validate all questions answered
    if (Object.keys(answers).length !== quizState.questions.length) {
      toast({
        title: 'Incomplete Quiz',
        description: 'Please answer all questions before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: quizState.username,
          answers,
        }),
      });

      if (response.ok) {
        const resultData = await response.json() as QuizResult;
        setResult(resultData);
        toast({
          title: resultData.passed ? 'Success!' : 'Quiz Submitted',
          description: resultData.explanation,
          variant: resultData.passed ? 'default' : 'destructive',
        });
      } else {
        // Cooldown or max attempts hit
        const errorData = (await response.json()) as {
          message?: string;
          cooldownSeconds?: number;
        };
 
        if (errorData.cooldownSeconds !== undefined) {
          // In cooldown
          setCooldownSeconds(errorData.cooldownSeconds);
          toast({
            title: 'Cooldown Active',
            description: `Please wait ${errorData.cooldownSeconds} seconds before retrying.`,
            variant: 'destructive',
          });
          // Start countdown timer
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          cooldownIntervalRef.current = setInterval(() => {
            setCooldownSeconds((prev) => {
              const next = prev - 1;
              if (next <= 0) {
                if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
                setCooldownSeconds(0);
              }
              return Math.max(0, next);
            });
          }, 1000);
        } else {
          // Max attempts reached
          setMaxAttemptsReached(true);
          toast({
            title: 'Maximum Attempts Reached',
            description: errorData.message || 'You have reached the maximum number of quiz attempts.',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Error submitting quiz:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit quiz',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!quizState) return;
    try {
      // Clear server state first
      await fetch('/api/quiz/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: quizState.username }),
      });
    } catch (error) {
      console.error('Error resetting quiz:', error);
    }
    // Then navigate back to welcome to re-generate
    void navigate('/');
  };

  if (loading) {
    if (initLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-muted-foreground">Loading session...</p>
          </div>
        </div>
      );
    }

    if (veteranBypassed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
          <Card className="w-full max-w-md border-green-500 bg-green-50">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="text-4xl">✨</div>
                <h2 className="text-2xl font-bold text-green-800">Veteran Status!</h2>
                <p className="text-green-700">
                  Your account qualifies for veteran status. You've been granted immediate posting privileges with verified flair.
                </p>
                <p className="text-sm text-green-600">Check your profile for your new flair!</p>
                <Button onClick={() => navigate('/')} className="w-full mt-4">
                  Return Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
        <QuizSkeleton />
        <p className="mt-8 text-center text-muted-foreground">
          {isFreshGenerate ? 'Generating your personalized quiz with AI…' : 'Loading quiz…'}
        </p>
      </div>
    );
  }

  if (!quizState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            {initError && (
              <p className="mb-4 text-center text-sm text-muted-foreground">{initError}</p>
            )}
            <p className="text-center text-destructive">
              Error loading quiz. Please try again.
            </p>
            <Button onClick={() => navigate('/')} className="mt-4 w-full">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show result if quiz is submitted
  if (result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-2xl">
          <ResultBanner
            result={result}
            onRetry={!result.passed ? handleRetry : undefined}
            onHome={() => navigate('/')}
          />
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = quizState.questions.length;
  const progressPercent = (answeredCount / totalQuestions) * 100;
  const currentQuestionIndex = Math.min(answeredCount, totalQuestions - 1);
  const currentQuestion = quizState.questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-linear-to-b from-violet-600 to-violet-400 px-4 pb-6 pt-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white">
            ←
          </button>
          <p className="text-sm font-semibold text-white">
            Question {currentQuestionIndex + 1}/{totalQuestions}
          </p>
          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white">
            🔖
          </button>
        </div>

        <div className="mb-6">
          <div className="mb-1 h-2 w-full rounded-full bg-white/20">
            <div
              className="h-2 rounded-full bg-amber-400 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-end">
            <span className="text-sm font-bold text-amber-300">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
        </div>

        {cooldownSeconds > 0 && (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/20 p-3">
            <p className="text-center text-sm text-amber-200">⏱️ Cooldown: {cooldownSeconds}s</p>
          </div>
        )}

        {maxAttemptsReached && (
          <div className="mb-4 rounded-xl border border-red-400/40 bg-red-400/20 p-3">
            <p className="text-center text-sm text-red-200">🚫 Max attempts reached</p>
          </div>
        )}

        {currentQuestion && (
          <div className="mb-5 rounded-3xl border border-white/25 bg-white/15 p-5 backdrop-blur">
            <p className="mb-6 text-center text-lg font-bold leading-snug text-white">
              {currentQuestion.question_text}
            </p>
            <div className="space-y-3">
              {currentQuestion.options.map((option, optionIndex) => {
                const letter = ['A', 'B', 'C', 'D'][optionIndex];
                const isSelected = answers[currentQuestion.id] === optionIndex;
                const isAnswered = answers[currentQuestion.id] !== undefined;

                return (
                  <button
                    key={optionIndex}
                    onClick={() => !isAnswered && handleAnswer(currentQuestion.id, optionIndex)}
                    disabled={isAnswered}
                    className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'bg-white text-violet-700 shadow-lg'
                        : 'border-white/20 bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isSelected ? 'bg-violet-600 text-white' : 'bg-white/20 text-white'
                    }`}>
                      {letter}
                    </span>
                    <span className="text-sm">{option}</span>
                    {isSelected && <span className="ml-auto font-bold text-green-500">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-4 gap-2">
          {[
            { label: 'Answers', icon: '50/50' },
            { label: 'Audience', icon: '👥' },
            { label: 'Add time', icon: '⏱' },
            { label: 'Skip', icon: '⏭' },
          ].map((button) => (
            <button
              key={button.label}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/20 bg-white/15 px-1 py-2.5 transition-colors hover:bg-white/25"
            >
              <span className="text-xs font-bold text-white">{button.icon}</span>
              <span className="text-[10px] text-white/70">{button.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={() => void handleSubmit()}
          disabled={submitting || answeredCount !== totalQuestions || cooldownSeconds > 0 || maxAttemptsReached}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-bold text-violet-700 shadow-lg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Submitting...' : answeredCount < totalQuestions ? `Answer all questions (${answeredCount}/${totalQuestions})` : 'Submit Quiz'}
        </button>
      </div>
    </div>
  );
}
