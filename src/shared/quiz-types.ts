/**
 * Shared types for the New User Onboarding Quiz system
 */

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type QuizQuestion = {
  id: number;
  question_text: string;
  options: string[];
  correct_answer_index: number;
  explanation: string;
};

export type QuizSubmission = {
  username: string;
  answers: Record<number, number>; // questionId -> optionIndex
};

export type QuizResult = {
  passed: boolean;
  score: number; // 0-100
  total_questions: number;
  correct_answers: number;
  explanation: string;
};

export type QuizState = {
  username: string;
  questions: QuizQuestion[];
  submitted_answers: Record<number, number>; // questionId -> optionIndex
  result: QuizResult | null;
  timestamp: number; // ISO timestamp
};

export type QuizSettings = {
  difficulty: QuizDifficulty;
  passing_score: number; // 0-100
  questions_count: number;
};

export type SettingsResponse = QuizSettings;
