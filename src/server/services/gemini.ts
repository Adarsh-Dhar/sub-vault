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
  questionsCount: number,
  userComments?: string
): Promise<QuizQuestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable not set');
    return [];
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let prompt = `You are creating a challenging subreddit rules quiz. Generate exactly ${questionsCount} ${difficulty}-level multiple-choice questions that test ACTUAL understanding of the rules, not just pattern matching.

Subreddit Rules:
${rules}

IMPORTANT INSTRUCTIONS:
1. **Randomize Correct Answers**: The correct answer must NOT always be in the same position. Vary correct_answer_index across all questions (mix of 0, 1, 2, 3).

2. **Make Questions Non-Obvious**: 
   - Do NOT ask straightforward questions like "What does rule X say?"
   - Instead, present realistic scenarios and edge cases
   - Questions should require users to THINK about rule implications, not just memorize them
   - For example: Instead of "Is spam allowed?" ask "A user posts promotional content disguised as helpful advice. Does this violate the rules?"

3. **Require Prior Research**:
   - Assume users have read the rules carefully
   - Test nuanced understanding and edge cases
   - Include common violations that aren't immediately obvious
   - Make trap answers that seem plausible to people who didn't study

4. **Difficulty Levels**:
   - easy: Basic rule comprehension with one clear violation
   - medium: Situational judgement, multiple rule implications
   - hard: Complex edge cases, rule combinations, intent-based violations

5. **Question Design**:
   - Each option should be plausible (users should have to think)
   - Avoid obviously wrong answers
   - The correct answer should require understanding WHY, not just WHAT
`;

  // Inject User context if available
  if (userComments) {
    prompt += `
6. **User-Specific Context**:
Here are some of the user's recent comments on Reddit:
${userComments}

Analyze these comments and tailor questions to address ANY rules the user might be at risk of violating based on their comment history. For example:
- If they use harsh language, test their understanding of civility/conduct rules
- If they post frequently, test spam/self-promotion rules
- If they engage in arguments, test conflict resolution expectations
- Emphasize the specific rule violations patterns you see in their history

Make 60% of questions target their potential risk areas, and 40% general rules.
`;
  }

  prompt += `
Return ONLY a valid JSON array with this exact structure (no markdown, no explanation, just JSON):
[
  {
    "id": 1,
    "question_text": "Realistic scenario or edge case question?",
    "options": ["Plausible answer A", "Plausible answer B", "Plausible answer C", "Plausible answer D"],
    "correct_answer_index": 2,
    "explanation": "Explanation of why this is correct and what rule(s) apply"
  }
]

CRITICAL REQUIREMENTS:
- Exactly ${questionsCount} questions
- RANDOMIZE correct_answer_index: Do NOT put it at index 0 for every question. Mix indices 0, 1, 2, 3 throughout
- Each question has exactly 4 plausible options
- All options should sound reasonable to someone who didn't study carefully
- Explanations reference specific rules and their intent
- Questions test ${difficulty === 'easy' ? 'basic comprehension' : difficulty === 'medium' ? 'nuanced judgment' : 'complex edge cases'}
- NO obvious or trivial questions`;

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
