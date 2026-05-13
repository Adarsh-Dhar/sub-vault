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
  // AI Generation Tuning
  difficulty: QuizDifficulty;
  questions_count: number;
  
  // Bouncer Thresholds
  passing_score: number; // 0-100
  veteran_account_age_days: number; // 0 = disabled, >0 = minimum days
  veteran_karma_threshold: number; // 0 = disabled, >0 = minimum karma
  
  // Rewards & Identity
  pass_flair_text: string;
  welcome_dm_enabled: boolean;
  welcome_dm_links: string; // JSON stringified array of { label: string; url: string }[]
  
  // Anti-Abuse Controls
  retry_cooldown_minutes: number; // 0 = no cooldown, >0 = minutes locked out after failure
  max_attempts: number; // 0 = unlimited, >0 = hard cap per user
};

export type SettingsResponse = QuizSettings;
