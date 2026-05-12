import { useState, useEffect } from 'react';
import { Loader2, Settings } from 'lucide-react';
import type { QuizSettings } from '../../shared/quiz-types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
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
    }
  );

  // Update settings when currentSettings changes
  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings, open]);

  const handleSave = async () => {
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
        description: `Quiz settings updated! Passing score: ${updated.passing_score}%`,
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
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Quiz Settings
          </DialogTitle>
          <DialogDescription>
            Configure quiz parameters for your subreddit
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Passing Score */}
          <div className="space-y-2">
            <Label htmlFor="passing_score">Passing Score Threshold (%)</Label>
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
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
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
              Questions per quiz (1-50)
            </p>
          </div>

          {/* Flair Text */}
          <div className="space-y-2">
            <Label htmlFor="pass_flair_text">Flair Text on Pass</Label>
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
            />
            <p className="text-xs text-muted-foreground">
              Flair assigned when user passes
            </p>
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
            disabled={loading}
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
