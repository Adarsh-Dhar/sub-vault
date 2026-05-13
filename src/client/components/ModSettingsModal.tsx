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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Quiz Settings
          </DialogTitle>
          <DialogDescription>
            Configure all aspects of the rules quiz system
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Section 1: AI Generation Tuning */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h3 className="font-semibold text-base">AI Generation Tuning</h3>

            {/* Difficulty */}
            <div className="space-y-2">
              <Label htmlFor="difficulty">Quiz Difficulty</Label>
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
                <SelectTrigger id="difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy - Direct rule questions</SelectItem>
                  <SelectItem value="medium">Medium - Situational judgement</SelectItem>
                  <SelectItem value="hard">Hard - Complex edge cases</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Questions Count */}
            <div className="space-y-2">
              <Label htmlFor="questions_count">Number of Questions</Label>
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
              />
              <p className="text-xs text-muted-foreground">
                Questions per quiz (1-50). 3-5 for casual communities, 8-10 for serious ones.
              </p>
            </div>
          </div>

          {/* Section 2: Bouncer Thresholds */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h3 className="font-semibold text-base">Bouncer Thresholds</h3>

            {/* Passing Score */}
            <div className="space-y-2">
              <Label htmlFor="passing_score">Passing Score (%)</Label>
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
              />
              <p className="text-xs text-muted-foreground">
                Minimum percentage required to pass (0-100)
              </p>
            </div>

            {/* Veteran Account Age */}
            <div className="space-y-2">
              <Label htmlFor="veteran_account_age_days">Veteran Account Age (days)</Label>
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
              />
              <p className="text-xs text-muted-foreground">
                Bypass quiz if account older than X days (0 = disabled)
              </p>
            </div>

            {/* Veteran Karma Threshold */}
            <div className="space-y-2">
              <Label htmlFor="veteran_karma_threshold">Veteran Karma Threshold</Label>
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
              />
              <p className="text-xs text-muted-foreground">
                Bypass quiz if total karma exceeds this (0 = disabled). Uses OR logic with account age.
              </p>
            </div>
          </div>

          {/* Section 3: Rewards & Identity */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h3 className="font-semibold text-base">Rewards & Identity</h3>

            {/* Flair Text */}
            <div className="space-y-2">
              <Label htmlFor="pass_flair_text">Verified Flair Text</Label>
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
              />
              <p className="text-xs text-muted-foreground">
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
              <Label htmlFor="welcome_dm_enabled" className="flex-1">
                Send Welcome DM on Pass
              </Label>
            </div>

            {/* Welcome DM Links */}
            <div className="space-y-2">
              <Label htmlFor="welcome_dm_links">Welcome DM Links (JSON)</Label>
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
                className="font-mono text-xs"
                rows={4}
              />
              {linkError && (
                <p className="text-xs text-red-500">Error: {linkError}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Array of {'{label, url}'} objects. Sent in welcome DM.
              </p>
            </div>
          </div>

          {/* Section 4: Anti-Abuse Controls */}
          <div className="space-y-4 rounded-lg border border-border p-4">
            <h3 className="font-semibold text-base">Anti-Abuse Controls</h3>

            {/* Retry Cooldown */}
            <div className="space-y-2">
              <Label htmlFor="retry_cooldown_minutes">Retry Cooldown (minutes)</Label>
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
              />
              <p className="text-xs text-muted-foreground">
                Minutes to wait after failed attempt (0 = no cooldown). 10 mins is typical.
              </p>
            </div>

            {/* Max Attempts */}
            <div className="space-y-2">
              <Label htmlFor="max_attempts">Maximum Attempts</Label>
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
              />
              <p className="text-xs text-muted-foreground">
                Max quiz attempts allowed per user (0 = unlimited). Helps prevent brute-force.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || linkError !== null}
            className="gap-2"
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
