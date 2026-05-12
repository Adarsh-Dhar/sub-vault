/**
 * QuizPage - Main quiz form where users answer questions
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { QuizState, QuizResult } from '../../shared/quiz-types';
import { QuizQuestion } from '../components/QuizQuestion';
import { ResultBanner } from '../components/ResultBanner';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { useInit } from '../contexts/init-context';
import { useToast } from '../hooks/use-toast';

export default function QuizPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { init, loading: initLoading, error: initError } = useInit();

  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  // Fetch quiz state on mount
  useEffect(() => {
    if (initLoading || !init) {
      return;
    }

    const fetchQuiz = async () => {
      try {
        const response = await fetch(`/api/quiz/${init.username}`);

        if (response.ok) {
          const data = await response.json() as QuizState;
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
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

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
        const error = await response.json() as { message?: string };
        toast({
          title: 'Error',
          description: error.message || 'Failed to submit quiz',
          variant: 'destructive',
        });
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

  const handleRetry = () => {
    setAnswers({});
    setResult(null);
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

    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Loading quiz...</p>
        </div>
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
              disabled={submitting || answeredCount !== totalQuestions}
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
