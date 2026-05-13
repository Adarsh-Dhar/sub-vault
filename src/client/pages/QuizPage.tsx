/**
 * QuizPage - Main quiz form where users answer questions
 */

import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { QuizState, QuizResult } from '../../shared/quiz-types';
import { QuizQuestion } from '../components/QuizQuestion';
import { ResultBanner } from '../components/ResultBanner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
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

  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <h1 className="text-3xl font-bold">Quiz</h1>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>
                {answeredCount} of {totalQuestions} answered
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />

                  {/* Cooldown Warning */}
                  {cooldownSeconds > 0 && (
                    <Card className="mb-6 border-yellow-500 bg-yellow-50">
                      <CardContent className="pt-4">
                        <p className="text-sm text-yellow-800">
                          ⏱️ Cooldown active. Try again in {cooldownSeconds}s
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Max Attempts Reached */}
                  {maxAttemptsReached && (
                    <Card className="mb-6 border-red-500 bg-red-50">
                      <CardContent className="pt-4">
                        <p className="text-sm font-semibold text-red-800">
                          🚫 Maximum attempts reached. Contact moderators for assistance.
                        </p>
                      </CardContent>
                    </Card>
                  )}
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-6 pb-8">
          {quizState.questions.map((question, index) => (
            <div key={question.id}>
              <p className="mb-4 text-sm font-semibold text-muted-foreground">
                Question {index + 1} of {totalQuestions}
              </p>
              <QuizQuestion
                question={question}
                onAnswer={(optionIndex) => handleAnswer(question.id, optionIndex)}
                selectedAnswer={answers[question.id]}
              />
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <div className="sticky bottom-0 border-t border-border bg-background py-4">
          <div className="flex gap-3">
            <Button
              onClick={() => navigate('/')}
              variant="outline"
              size="lg"
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || answeredCount !== totalQuestions || cooldownSeconds > 0 || maxAttemptsReached}
              size="lg"
              className="flex-1"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
