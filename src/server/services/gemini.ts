/**
 * Gemini API service for generating quiz questions from subreddit rules
 */

import type { QuizQuestion, QuizDifficulty } from '../../shared/quiz-types';

type GeminiResponse = {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
};

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

  const model = 'gemini-pro';
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

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
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

    const content = data.candidates[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('No text content in Gemini response');
      return [];
    }

    // Parse the JSON response
    const questions = JSON.parse(content) as QuizQuestion[];

    // Validate structure
    if (!Array.isArray(questions)) {
      console.error('Gemini response is not an array');
      return [];
    }

    // Ensure we have the right number of questions
    return questions.slice(0, questionsCount);
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    return [];
  }
}
