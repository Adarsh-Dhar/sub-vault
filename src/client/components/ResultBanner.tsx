/**
 * ResultBanner - Displays quiz pass/fail result with score
 */

import { CheckCircle2, XCircle } from 'lucide-react';
import type { QuizResult } from '../../shared/quiz-types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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
  const scoreFraction = `${result.correct_answers}/${result.total_questions}`;
  const isPass = result.passed;

  return (
    <Card className={`border-2 ${isPass ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
      <CardHeader>
        <div className="flex items-center gap-4">
          {isPass ? (
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          ) : (
            <XCircle className="h-12 w-12 text-red-600" />
          )}
          <div>
            <CardTitle className={`text-3xl font-bold ${isPass ? 'text-green-700' : 'text-red-700'}`}>
              {isPass ? '🎉 You Passed!' : '❌ You Failed'}
            </CardTitle>
            <p className={`text-lg font-semibold ${isPass ? 'text-green-600' : 'text-red-600'}`}>
              Score: {result.score}% ({scoreFraction})
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg bg-white p-4">
          <p className={`text-base ${isPass ? 'text-green-700' : 'text-red-700'}`}>
            {result.explanation}
          </p>
        </div>

        <div className="flex gap-3">
          {!isPass && onRetry && (
            <Button
              onClick={onRetry}
              variant="default"
              size="lg"
              className="flex-1"
            >
              Try Again
            </Button>
          )}
          {onHome && (
            <Button
              onClick={onHome}
              variant={isPass ? 'default' : 'outline'}
              size="lg"
              className="flex-1"
            >
              {isPass ? 'Go to Home' : 'Return Home'}
            </Button>
          )}
        </div>

        {isPass && (
          <div className="rounded-lg border border-green-300 bg-green-100 p-3 text-sm text-green-800">
            <p>
              Congratulations! You've successfully completed the onboarding quiz.
              Welcome to the community!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
