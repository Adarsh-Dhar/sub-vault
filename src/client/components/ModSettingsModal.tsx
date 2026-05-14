import { useState, useEffect } from 'react';
import { Loader2, Settings, X } from 'lucide-react';
import type { RankThresholdConfig } from '../../shared/rank-types';
import { DEFAULT_THRESHOLDS, LEVEL_NAMES } from '../../shared/rank-types';
import { useToast } from '../hooks/use-toast';

interface ModSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentSettings: RankThresholdConfig | null;
  onSettingsUpdated?: (settings: RankThresholdConfig) => void;
}

export function ModSettingsModal({
  open,
  onOpenChange,
  currentSettings,
  onSettingsUpdated,
}: ModSettingsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<RankThresholdConfig>(
    currentSettings || DEFAULT_THRESHOLDS
  );

  useEffect(() => {
    if (currentSettings) setSettings(currentSettings);
  }, [currentSettings, open]);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/rank-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const error = await response.json() as { error?: string };
        toast({ title: 'Error', description: error.error || 'Failed to update settings', variant: 'destructive' });
        return;
      }
      const updated = await response.json() as RankThresholdConfig;
      setSettings(updated);
      onSettingsUpdated?.(updated);
      toast({ title: 'Saved', description: 'Rank settings updated!', variant: 'default' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_THRESHOLDS);
  };

  if (!open) return null;

  // Base input styling
  const inputCls =
    'box-border block w-full min-w-0 rounded-xl border border-white/25 bg-white/10 ' +
    'px-3 py-2.5 text-sm text-white placeholder:text-white/40 ' +
    'focus:outline-none focus:border-white/55 focus:ring-2 focus:ring-white/15 ' +
    'disabled:opacity-50 transition-colors';

  const labelCls = 'block text-sm font-medium text-white/90 mb-1.5';
  const hintCls = 'mt-1.5 text-xs text-white/55 leading-relaxed';

  const formatSeconds = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m${remainingSeconds ? ` ${remainingSeconds}s` : ''}`;
    }

    if (minutes > 0) {
      return `${minutes}m${remainingSeconds ? ` ${remainingSeconds}s` : ''}`;
    }

    return `${seconds}s`;
  };

  const Divider = () => <div className="my-3.5 h-px bg-white/10" />;

  const Section = ({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-white/75">{title}</p>
      <p className="mt-0.5 mb-3.5 text-xs text-white/55">{subtitle}</p>
      {children}
    </div>
  );

  const LevelSection = ({ levelIndex }: { levelIndex: number }) => {
    const levelName = LEVEL_NAMES[levelIndex as 0 | 1 | 2 | 3 | 4];
    const levelReqs = settings[levelIndex as 0 | 1 | 2 | 3 | 4];

    return (
      <Section title={`Level ${levelIndex}: ${levelName}`} subtitle="Thresholds for progression">
        {/* Hub Time */}
        <div>
          <label htmlFor={`hub-${levelIndex}`} className={labelCls}>Hub Time (seconds)</label>
          <input
            id={`hub-${levelIndex}`}
            type="number"
            min="0"
            max="86400"
            step="30"
            value={levelReqs.hubSeconds}
            onChange={(e) => {
              const newSettings = { ...settings };
              newSettings[levelIndex as 0 | 1 | 2 | 3 | 4] = { ...levelReqs, hubSeconds: Number(e.target.value) };
              setSettings(newSettings);
            }}
            disabled={loading}
            className={inputCls}
          />
          <p className={hintCls}>Time spent in community hub, stored in seconds. Current value: {formatSeconds(levelReqs.hubSeconds)}.</p>
        </div>

        <Divider />

        {/* Posts Viewed */}
        <div>
          <label htmlFor={`posts-${levelIndex}`} className={labelCls}>Posts Viewed</label>
          <input
            id={`posts-${levelIndex}`}
            type="number"
            min="0"
            value={levelReqs.postsViewed}
            onChange={(e) => {
              const newSettings = { ...settings };
              newSettings[levelIndex as 0 | 1 | 2 | 3 | 4] = { ...levelReqs, postsViewed: Number(e.target.value) };
              setSettings(newSettings);
            }}
            disabled={loading}
            className={inputCls}
          />
          <p className={hintCls}>Number of posts browsed</p>
        </div>

        <Divider />

        {/* Comments */}
        <div>
          <label htmlFor={`comments-${levelIndex}`} className={labelCls}>Comments Count</label>
          <input
            id={`comments-${levelIndex}`}
            type="number"
            min="0"
            value={levelReqs.comments}
            onChange={(e) => {
              const newSettings = { ...settings };
              newSettings[levelIndex as 0 | 1 | 2 | 3 | 4] = { ...levelReqs, comments: Number(e.target.value) };
              setSettings(newSettings);
            }}
            disabled={loading}
            className={inputCls}
          />
          <p className={hintCls}>Number of comments made</p>
        </div>
      </Section>
    );
  };

  return (
    /* ── Backdrop ─────────────────────────────────────────── */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      {/*
        ── Sheet container ────────────────────────────────────
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rank Settings"
        className="relative box-border flex w-full flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl bg-linear-to-b from-violet-600 via-violet-500 to-violet-400 shadow-2xl"
        style={{ maxWidth: 'min(480px, 100vw)', maxHeight: '92dvh' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Drag handle – mobile only */}
        <div className="flex justify-center pt-3 pb-0.5 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-white/30" />
        </div>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-white/15 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <Settings style={{ width: 18, height: 18 }} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white leading-tight truncate">Rank Settings</h2>
              <p className="text-xs text-white/60 truncate">Configure progression thresholds</p>
            </div>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:bg-white/35 transition-colors"
            aria-label="Close settings"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}>
          <div className="space-y-3.5 px-5 py-4">

            {/* Capability pills */}
            <div className="flex flex-wrap gap-1.5">
              {['Levels', 'Thresholds', 'Requirements', 'Social'].map((tag) => (
                <span key={tag} className="rounded-full border border-white/20 bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white/80">
                  {tag}
                </span>
              ))}
            </div>

            {/* Level sections */}
            {[0, 1, 2, 3, 4].map((levelIndex) => (
              <div key={levelIndex}>
                <LevelSection levelIndex={levelIndex} />
              </div>
            ))}

          </div>
        </div>

        {/* ── Footer / Action buttons ───────────────────────────– */}
        <div className="flex shrink-0 gap-2 border-t border-white/15 bg-white/5 px-5 py-4">
          <button
            onClick={handleReset}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-50 transition-colors"
          >
            Reset to Default
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 rounded-xl bg-white/90 px-4 py-2.5 text-sm font-semibold text-violet-600 hover:bg-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} />}
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

