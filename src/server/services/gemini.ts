/**
 * Gemini API service for generating quiz questions from subreddit rules
 */

import type { QuizQuestion, QuizDifficulty } from '../../shared/quiz-types';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function extractJsonPayload(text: string): string {
  const fencedJsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedJsonMatch?.[1]) {
    return fencedJsonMatch[1].trim();
  }

  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');

  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return text.slice(arrayStart, arrayEnd + 1).trim();
  }

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');

  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  return text.trim();
}

function isQuizQuestion(candidate: unknown): candidate is QuizQuestion {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  const question = candidate as Record<string, unknown>;

  return (
    typeof question.id === 'number' &&
    typeof question.question_text === 'string' &&
    Array.isArray(question.options) &&
    question.options.every((option) => typeof option === 'string') &&
    Number.isInteger(question.correct_answer_index) &&
    typeof question.explanation === 'string'
  );
}

function normalizeQuestions(content: string, questionsCount: number): QuizQuestion[] {
  try {
    const parsed = JSON.parse(extractJsonPayload(content)) as unknown;
    const candidateQuestions = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown[] }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : [];

    return candidateQuestions.filter(isQuizQuestion).slice(0, questionsCount);
  } catch (error) {
    console.error('Failed to parse Gemini quiz response:', error);
    return [];
  }
}

export async function generateQuiz(
  rules: string,
  difficulty: QuizDifficulty,
  questionsCount: number
): Promise<QuizQuestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable not set');
    return [];
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `Given the following subreddit rules, generate exactly ${questionsCount} ${difficulty}-level multiple-choice questions that test users' understanding of these rules. Each question should test understanding of one or more rules.

Subreddit Rules:
${rules}

Return ONLY a valid JSON array with this exact structure (no markdown, no explanation, just JSON):
[
  {
    "id": 1,
    "question_text": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer_index": 0,
    "explanation": "Why this is correct"
  }
]

Make sure:
- Each question has exactly 4 options
- correct_answer_index is 0-3
- Questions are appropriate difficulty level (easy=basic understanding, medium=nuanced rules, hard=edge cases)
- Explanations are concise`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', response.status, error);
      return [];
    }

    const data = (await response.json()) as GeminiResponse;

    if (!data.candidates || data.candidates.length === 0) {
      console.error('No candidates in Gemini response');
      return [];
    }

    const content = data.candidates
      .map((candidate) => candidate.content?.parts?.map((part) => part.text ?? '').join('') ?? '')
      .find((text) => text.trim().length > 0);

    if (!content) {
      console.error('No text content in Gemini response');
      return [];
    }

    return normalizeQuestions(content, questionsCount);
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return [];
  }
}
