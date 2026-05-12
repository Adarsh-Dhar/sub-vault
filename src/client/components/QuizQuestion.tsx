/**
 * QuizQuestion - Renders a single quiz question with radio options
 */

import { useState } from 'react';
import type { QuizQuestion as QuizQuestionType } from '../../shared/quiz-types';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';

export interface QuizQuestionProps {
  question: QuizQuestionType;
  onAnswer: (optionIndex: number) => void;
  answered?: boolean;
  selectedAnswer?: number | undefined;
}

export function QuizQuestion({
  question,
  onAnswer,
  answered = false,
  selectedAnswer,
}: QuizQuestionProps) {
  const [selected, setSelected] = useState<string>(
    selectedAnswer !== undefined ? selectedAnswer.toString() : ''
  );

  const handleChange = (value: string) => {
    const index = parseInt(value, 10);
    setSelected(value);
    onAnswer(index);
  };

  return (
    <Card className="mb-6 border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">
          {question.question_text}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={selected} onValueChange={handleChange}>
          {question.options.map((option, index) => (
            <div key={index} className="flex items-center space-x-2">
              <RadioGroupItem
                value={index.toString()}
                id={`option-${question.id}-${index}`}
                disabled={answered}
              />
              <Label
                htmlFor={`option-${question.id}-${index}`}
                className="cursor-pointer font-normal text-foreground"
              >
                {option}
              </Label>
              {answered && index === question.correct_answer_index && (
                <span className="ml-2 inline-block rounded-full bg-green-100 px-2 py-1 text-sm font-semibold text-green-800">
                  ✓ Correct
                </span>
              )}
              {answered &&
                selectedAnswer === index &&
                index !== question.correct_answer_index && (
                  <span className="ml-2 inline-block rounded-full bg-red-100 px-2 py-1 text-sm font-semibold text-red-800">
                    ✗ Incorrect
                  </span>
                )}
            </div>
          ))}
        </RadioGroup>

        {answered && (
          <Alert className="mt-4 border-l-4 border-l-blue-500 bg-blue-50">
            <AlertDescription className="text-sm text-blue-900">
              <strong>Explanation:</strong> {question.explanation}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
