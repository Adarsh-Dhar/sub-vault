import { useEffect, useState } from 'react';
import type { RankProfile, RankLevel, ProgressRequirement, RankThresholdConfig } from '../../shared/rank-types';
import { LEVEL_BADGES, LEVEL_NAMES } from '../../shared/rank-types';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { useToast } from '../hooks/use-toast';
import { ModSettingsModal } from '../components/ModSettingsModal';

interface HubPageProps {
  onNavigate: (page: string) => void;
  onLevelUp?: (newLevel: RankLevel) => void;
}

interface ProgressState {
  current: number;
  target: number;
  percentage: number;
  hubSeconds: { current: number; target: number };
  postsViewed: { current: number; target: number };
  comments: { current: number; target: number };
}

export function HubPage({ onNavigate, onLevelUp }: HubPageProps) {
  const [profile, setProfile] = useState<RankProfile | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayedSeconds, setDisplayedSeconds] = useState(0);
  const { toast } = useToast();

  // Fetch initial profile
  const [isModerator, setIsModerator] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modSettings, setModSettings] = useState<RankThresholdConfig | null>(null);
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/rank/init', {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch profile');
        }

        const data = await response.json();
        if (data.profile) {
          setProfile(data.profile);
          setDisplayedSeconds(data.profile.hubSeconds);
        }
        if (data.progress) {
          setProgress(data.progress);
        }
        // also fetch general init to determine moderator status
        try {
          const initResp = await fetch('/api/init');
          if (initResp.ok) {
            const initData = await initResp.json();
            setIsModerator(Boolean(initData.isModerator));
          }
        } catch (err) {
          console.warn('Failed to fetch moderator status', err);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
        toast({
          description: 'Failed to load your profile',
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [toast]);

  // Heartbeat every 30 seconds
  useEffect(() => {
    if (!profile) return;

    const heartbeat = async () => {
      try {
        const response = await fetch('/api/rank/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          throw new Error('Heartbeat failed');
        }

        const data = await response.json();
        if (data.status === 'success') {
          setDisplayedSeconds(data.hubSeconds);

          // Check for level-up
          if (data.leveledUp) {
            const newProfile = { ...profile, level: data.newLevel };
            setProfile(newProfile);
            onLevelUp?.(data.newLevel);

            // Show level-up toast
            toast({
              description: `🎉 You've reached ${data.flairAssigned}!`,
            });

            // Refresh progress
            const progressResponse = await fetch(`/api/rank/current-user`, {
              method: 'GET',
            });

            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              if (progressData.progress) {
                setProgress(progressData.progress);
              }
            }
          }
        }
      } catch (error) {
        console.error('Heartbeat error:', error);
      }
    };

    const interval = setInterval(heartbeat, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [profile, onLevelUp, toast]);

  // Calculate time display
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Build requirement rows
  const buildRequirements = (): ProgressRequirement[] => {
    if (!progress) return [];

    return [
      {
        label: 'Hub Time',
        icon: '🕐',
        current: progress.hubSeconds.current,
        target: progress.hubSeconds.target,
        unit: 's',
      },
      {
        label: 'Posts Browsed',
        icon: '📄',
        current: progress.postsViewed.current,
        target: progress.postsViewed.target,
        unit: '',
      },
      {
        label: 'Comments',
        icon: '💬',
        current: progress.comments.current,
        target: progress.comments.target,
        unit: '',
      },
    ];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="spinner mb-4" />
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!profile || !progress) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="p-6 max-w-md">
          <p className="text-center mb-4">Unable to load your profile</p>
          <Button onClick={() => onNavigate('hub')} className="w-full">
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const currentBadge = LEVEL_BADGES[profile.level];
  const currentName = LEVEL_NAMES[profile.level];
  const nextBadge = LEVEL_BADGES[Math.min(4, profile.level + 1) as RankLevel];
  const nextName = LEVEL_NAMES[Math.min(4, profile.level + 1) as RankLevel];
  const requirements = buildRequirements();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Community Passport</h1>
          <div className="flex items-center gap-2">
            {isModerator && (
              <Button variant="ghost" size="sm" onClick={async () => {
                setSettingsOpen(true);
                try {
                  const resp = await fetch('/api/rank-settings');
                  if (resp.ok) {
                    const settings = await resp.json();
                    setModSettings(settings as RankThresholdConfig);
                  }
                } catch (err) {
                  console.warn('Failed to load mod settings', err);
                }
              }}>⚙️</Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('profile')}
            >
              Profile
            </Button>
          </div>
      </div>

      {/* Current Level Card */}
      <Card className="p-8 mb-8 text-center bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-indigo-200">
        <div className="text-6xl mb-4 animate-bounce">{currentBadge}</div>
        <h2 className="text-3xl font-bold mb-2">{currentName}</h2>
        <p className="text-slate-600 mb-6">Level {profile.level}</p>

        {profile.level < 4 && (
          <div>
            <p className="text-sm text-slate-600 mb-2">
              Next: {nextBadge} {nextName}
            </p>
            <Progress value={progress.percentage} className="mb-2" />
            <p className="text-xs text-slate-500">{progress.percentage}% Complete</p>
          </div>
        )}

        {profile.level === 4 && (
          <p className="text-lg font-semibold text-indigo-600">You've reached the highest level! 🌟</p>
        )}
      </Card>

      {/* Time Tracker */}
      <Card className="p-6 mb-8 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600 mb-1">Time in Hub (This Session)</p>
            <p className="text-3xl font-bold text-indigo-600">{formatTime(displayedSeconds)}</p>
          </div>
          <div className="text-4xl">⏱️</div>
        </div>
        <p className="text-xs text-slate-500 mt-3">Updates every 30 seconds</p>
      </Card>

      {/* Requirements to Next Level */}
      {profile.level < 4 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4">
            What's needed for {nextBadge} {nextName}?
          </h3>

          <div className="space-y-4">
            {requirements.map((req, idx) => {
              const percentage = Math.min(
                100,
                Math.round((req.current / req.target) * 100)
              );

              return (
                <Card key={idx} className="p-4 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{req.icon}</span>
                      <span className="font-semibold">{req.label}</span>
                    </div>
                    <span className="text-sm text-slate-600">
                      {req.current} / {req.target} {req.unit}
                    </span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                  <p className="text-xs text-slate-500 mt-1">{percentage}%</p>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Feed Button */}
      <Button
        onClick={() => onNavigate('feed')}
        className="w-full mb-4 h-12 text-base"
      >
        📄 Browse Community Posts
      </Button>

      {/* Stats */}
      <Card className="p-4 bg-slate-50 text-center">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-600">Posts</p>
            <p className="text-2xl font-bold">{progress.postsViewed.current}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Comments</p>
            <p className="text-2xl font-bold">{progress.comments.current}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Level</p>
            <p className="text-2xl font-bold">{profile.level}</p>
          </div>
        </div>
      </Card>
        {settingsOpen && (
          <ModSettingsModal
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            currentSettings={modSettings}
            onSettingsUpdated={(s) => setModSettings(s)}
          />
        )}
    </div>
  );
}
