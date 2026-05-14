import { useState, useEffect } from 'react';
import { Loader2, Settings } from 'lucide-react';
import type { QuizSettings } from '../../shared/quiz-types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { useToast } from '../hooks/use-toast';

interface ModSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSettings: QuizSettings | null;
  onSettingsUpdated?: (settings: QuizSettings) => void;
}

export function ModSettingsModal({
  open,
  onOpenChange,
  currentSettings,
  onSettingsUpdated,
}: ModSettingsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<QuizSettings>(
    currentSettings || {
      difficulty: 'medium',
      passing_score: 70,
      questions_count: 5,
      pass_flair_text: 'Verified member',
      veteran_account_age_days: 365,
      veteran_karma_threshold: 10000,
      welcome_dm_enabled: true,
      welcome_dm_links: JSON.stringify([
        { label: 'Community Rules', url: 'https://reddit.com/r/example/wiki/rules' },
        { label: 'FAQ', url: 'https://reddit.com/r/example/wiki/faq' },
      ]),
      retry_cooldown_minutes: 10,
      max_attempts: 5,
    }
  );
  const [linkError, setLinkError] = useState<string | null>(null);

  // Update settings when currentSettings changes
  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings, open]);

  // Validate links JSON when it changes
  useEffect(() => {
    if (!settings.welcome_dm_links) {
      setLinkError(null);
      return;
    }
    try {
      const parsed = JSON.parse(settings.welcome_dm_links);
      if (!Array.isArray(parsed)) {
        setLinkError('Must be a JSON array');
      } else if (parsed.some((item) => !item.label || !item.url)) {
        setLinkError('Each link must have label and url');
      } else {
        setLinkError(null);
      }
    } catch {
      setLinkError('Invalid JSON');
    }
  }, [settings.welcome_dm_links]);

  const handleSave = async () => {
    // Final validation
    if (linkError) {
      toast({
        title: 'Validation Error',
        description: 'Fix the Welcome DM links before saving',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/quiz-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: string };
        toast({
          title: 'Error',
          description: error.error || 'Failed to update settings',
          variant: 'destructive',
        });
        return;
      }

      const updated = await response.json() as QuizSettings;
      setSettings(updated);
      onSettingsUpdated?.(updated);
      
      toast({
        title: 'Success',
        description: `Quiz settings updated!`,
        variant: 'default',
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const glassCardClass = 'space-y-4 rounded-3xl border border-white/20 bg-white/15 p-5 shadow-xl backdrop-blur';
  const fieldClass = 'border-white/30 bg-white/10 text-white placeholder:text-white/55 focus-visible:border-white/45 focus-visible:ring-white/25';
  const hintClass = 'text-xs text-white/65';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl overflow-hidden rounded-4xl border border-white/20 bg-linear-to-b from-violet-600 via-violet-500 to-violet-400 p-0 text-white shadow-2xl sm:max-h-[90vh] sm:overflow-y-auto">
        <div className="px-6 pb-6 pt-6 text-white">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/18 text-white shadow-lg shadow-violet-950/10 backdrop-blur">
                <Settings className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  Quiz Settings
                </DialogTitle>
                <DialogDescription className="text-sm text-white/75">
                  Configure all aspects of the rules quiz system
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium text-white/85">
              <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1 backdrop-blur">
                AI generation
              </span>
              <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1 backdrop-blur">
                Thresholds
              </span>
              <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1 backdrop-blur">
                Rewards
              </span>
              <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1 backdrop-blur">
                Anti-abuse
              </span>
            </div>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-6">
          {/* Section 1: AI Generation Tuning */}
          <div className={glassCardClass}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">AI Generation Tuning</p>
              <p className="mt-1 text-sm text-white/72">Tune how the quiz is built before it reaches the user.</p>
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label htmlFor="difficulty" className="text-white/90">Quiz Difficulty</Label>
              <Select
                value={settings.difficulty}
                onValueChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    difficulty: value as 'easy' | 'medium' | 'hard',
                  }))
                }
                disabled={loading}
              >
                <SelectTrigger id="difficulty" className={fieldClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/25 bg-violet-700/95 text-white backdrop-blur">
                  <SelectItem value="easy" className="text-white focus:bg-white/15 focus:text-white">Easy - Direct rule questions</SelectItem>
                  <SelectItem value="medium" className="text-white focus:bg-white/15 focus:text-white">Medium - Situational judgement</SelectItem>
                  <SelectItem value="hard" className="text-white focus:bg-white/15 focus:text-white">Hard - Complex edge cases</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Questions Count */}
            <div className="space-y-2">
              <Label htmlFor="questions_count" className="text-white/90">Number of Questions</Label>
              <Input
                id="questions_count"
                type="number"
                min="1"
                max="50"
                value={settings.questions_count}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    questions_count: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)),
                  }))
                }
                disabled={loading}
                className={fieldClass}
              />
              <p className={hintClass}>
                Questions per quiz (1-50). 3-5 for casual communities, 8-10 for serious ones.
              </p>
            </div>
          </div>

          {/* Section 2: Bouncer Thresholds */}
          <div className={glassCardClass}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">Bouncer Thresholds</p>
              <p className="mt-1 text-sm text-white/72">Set the rules for who passes, bypasses, and gets locked out.</p>
            </div>

            {/* Passing Score */}
            <div className="space-y-2">
              <Label htmlFor="passing_score" className="text-white/90">Passing Score (%)</Label>
              <Input
                id="passing_score"
                type="number"
                min="0"
                max="100"
                value={settings.passing_score}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    passing_score: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                  }))
                }
                disabled={loading}
                className={fieldClass}
              />
              <p className={hintClass}>
                Minimum percentage required to pass (0-100)
              </p>
            </div>

            {/* Veteran Account Age */}
            <div className="space-y-2">
              <Label htmlFor="veteran_account_age_days" className="text-white/90">Veteran Account Age (days)</Label>
              <Input
                id="veteran_account_age_days"
                type="number"
                min="0"
                max="36500"
                value={settings.veteran_account_age_days}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    veteran_account_age_days: Math.max(0, Math.min(36500, parseInt(e.target.value) || 0)),
                  }))
                }
                disabled={loading}
                className={fieldClass}
              />
              <p className={hintClass}>
                Bypass quiz if account older than X days (0 = disabled)
              </p>
            </div>

            {/* Veteran Karma Threshold */}
            <div className="space-y-2">
              <Label htmlFor="veteran_karma_threshold" className="text-white/90">Veteran Karma Threshold</Label>
              <Input
                id="veteran_karma_threshold"
                type="number"
                min="0"
                max="1000000"
                value={settings.veteran_karma_threshold}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    veteran_karma_threshold: Math.max(0, Math.min(1000000, parseInt(e.target.value) || 0)),
                  }))
                }
                disabled={loading}
                className={fieldClass}
              />
              <p className={hintClass}>
                Bypass quiz if total karma exceeds this (0 = disabled). Uses OR logic with account age.
              </p>
            </div>
          </div>

          {/* Section 3: Rewards & Identity */}
          <div className={glassCardClass}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">Rewards & Identity</p>
              <p className="mt-1 text-sm text-white/72">Control the flair and follow-up messaging after a pass.</p>
            </div>

            {/* Flair Text */}
            <div className="space-y-2">
              <Label htmlFor="pass_flair_text" className="text-white/90">Verified Flair Text</Label>
              <Input
                id="pass_flair_text"
                type="text"
                value={settings.pass_flair_text}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pass_flair_text: e.target.value,
                  }))
                }
                placeholder="e.g., Verified member"
                disabled={loading}
                maxLength={64}
                className={fieldClass}
              />
              <p className={hintClass}>
                Flair assigned when user passes the quiz (max 64 chars)
              </p>
            </div>

            {/* Welcome DM Toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="welcome_dm_enabled"
                checked={settings.welcome_dm_enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    welcome_dm_enabled: checked,
                  }))
                }
                disabled={loading}
              />
              <Label htmlFor="welcome_dm_enabled" className="flex-1 text-white/90">
                Send Welcome DM on Pass
              </Label>
            </div>

            {/* Welcome DM Links */}
            <div className="space-y-2">
              <Label htmlFor="welcome_dm_links" className="text-white/90">Welcome DM Links (JSON)</Label>
              <Textarea
                id="welcome_dm_links"
                value={settings.welcome_dm_links}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    welcome_dm_links: e.target.value,
                  }))
                }
                placeholder={JSON.stringify([
                  { label: 'Community Rules', url: 'https://reddit.com/r/example/wiki' },
                ], null, 2)}
                disabled={loading}
                className={`${fieldClass} font-mono text-xs`}
                rows={4}
              />
              {linkError && (
                <p className="text-xs text-rose-200">Error: {linkError}</p>
              )}
              <p className={hintClass}>
                Array of {'{label, url}'} objects. Sent in welcome DM.
              </p>
            </div>
          </div>

          {/* Section 4: Anti-Abuse Controls */}
          <div className={glassCardClass}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">Anti-Abuse Controls</p>
              <p className="mt-1 text-sm text-white/72">Limit retries and slow down brute-force attempts.</p>
            </div>

            {/* Retry Cooldown */}
            <div className="space-y-2">
              <Label htmlFor="retry_cooldown_minutes" className="text-white/90">Retry Cooldown (minutes)</Label>
              <Input
                id="retry_cooldown_minutes"
                type="number"
                min="0"
                max="1440"
                value={settings.retry_cooldown_minutes}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    retry_cooldown_minutes: Math.max(0, Math.min(1440, parseInt(e.target.value) || 0)),
                  }))
                }
                disabled={loading}
                className={fieldClass}
              />
              <p className={hintClass}>
                Minutes to wait after failed attempt (0 = no cooldown). 10 mins is typical.
              </p>
            </div>

            {/* Max Attempts */}
            <div className="space-y-2">
              <Label htmlFor="max_attempts" className="text-white/90">Maximum Attempts</Label>
              <Input
                id="max_attempts"
                type="number"
                min="0"
                max="100"
                value={settings.max_attempts}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    max_attempts: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                  }))
                }
                disabled={loading}
                className={fieldClass}
              />
              <p className={hintClass}>
                Max quiz attempts allowed per user (0 = unlimited). Helps prevent brute-force.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-white/20 bg-white/10 px-6 py-4 backdrop-blur">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-full border-white/35 bg-white/10 text-white hover:bg-white/20"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || linkError !== null}
            className="gap-2 rounded-full bg-violet-600 text-white shadow-lg shadow-violet-300 hover:bg-violet-700"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
