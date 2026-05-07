'use client';

import { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { CommunitySnapshotData, SnapshotDetail } from '@/lib/types';
import { Button } from './ui/button';

interface SnapshotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: SnapshotDetail | null;
  isLoading?: boolean;
  error?: string | null;
}

export function SnapshotDetailModal({
  isOpen,
  onClose,
  snapshot,
  isLoading = false,
  error = null,
}: SnapshotDetailModalProps) {
  const [isRestoring, setIsRestoring] = useState(false);

  const handleRestore = async () => {
    if (!snapshot?.id) return;

    setIsRestoring(true);
    try {
      const res = await fetch(`/api/snapshot/${snapshot.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: snapshot.id }),
      });

      if (!res.ok) {
        throw new Error(`Restore failed: ${res.status}`);
      }

      onClose();
    } catch (err) {
      console.error('Failed to restore snapshot', err);
    } finally {
      setIsRestoring(false);
    }
  };

  const safeTimeAgo = () => {
    if (!snapshot?.timestamp) return 'Unknown time';
    try {
      const date = new Date(snapshot.timestamp);
      if (Number.isNaN(date.getTime())) return 'Unknown time';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown time';
    }
  };

  const renderKeyValues = (data: CommunitySnapshotData) => {
    const identity = data.identity;
    const settings = data.settings;
    const bannedCount = data.userManagement?.banned?.length ?? 0;
    const mutedCount = data.userManagement?.muted?.length ?? 0;
    const approvedCount = data.userManagement?.approved?.length ?? 0;
    const moderatorCount = data.userManagement?.moderators?.length ?? 0;

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Identity</h3>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <div>Name: <span className="text-slate-900">{identity?.displayName || 'N/A'}</span></div>
            <div>Type: <span className="text-slate-900">{identity?.subredditType || 'N/A'}</span></div>
            <div>Subscribers: <span className="text-slate-900">{typeof identity?.subscribers === 'number' ? identity.subscribers.toLocaleString() : '0'}</span></div>
            <div>Language: <span className="text-slate-900">{identity?.lang || 'N/A'}</span></div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Counts</h3>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <div>Rules: <span className="text-slate-900">{data.rules?.length ?? 0}</span></div>
            <div>Post flairs: <span className="text-slate-900">{data.flairs?.post?.length ?? 0}</span></div>
            <div>User flairs: <span className="text-slate-900">{data.flairs?.user?.length ?? 0}</span></div>
            <div>Users: <span className="text-slate-900">{bannedCount + mutedCount + approvedCount + moderatorCount}</span></div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Settings</h3>
          <pre className="mt-3 max-h-60 overflow-auto rounded bg-white p-3 text-xs text-slate-900 whitespace-pre-wrap wrap-break-word border border-slate-200">
            {JSON.stringify(settings ?? {}, null, 2)}
          </pre>
        </section>

        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Automod</h3>
          <pre className="mt-3 max-h-60 overflow-auto rounded bg-white p-3 text-xs text-slate-900 whitespace-pre-wrap wrap-break-word border border-slate-200">
            {data.automoderator || 'Not configured'}
          </pre>
        </section>
      </div>
    );
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-2xl flex flex-col"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Snapshot details"
      >
        {isLoading ? (
          <div className="flex min-h-70 flex-col">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Loading snapshot data...</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} type="button">
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center gap-3 p-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading snapshot details
            </div>
          </div>
        ) : error ? (
          <div className="flex min-h-70 flex-col">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">Unable to load the selected snapshot.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} type="button">
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-destructive">
              {error}
            </div>
          </div>
        ) : !snapshot || !snapshot.data ? (
          <div className="flex min-h-70 flex-col">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Snapshot Details</h2>
                <p className="mt-1 text-sm text-muted-foreground">No snapshot data was returned.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} type="button">
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              No data available for this snapshot
            </div>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 text-left">
                  <h2 className="truncate text-lg font-semibold text-foreground">
                    {snapshot.message || 'Snapshot'}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {snapshot.author || 'Manual Commit'} • {safeTimeAgo()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleRestore}
                    disabled={isRestoring}
                    className="flex items-center gap-2"
                    type="button"
                  >
                    {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Restore Snapshot
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onClose} type="button">
                    Close
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {renderKeyValues(snapshot.data as CommunitySnapshotData)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
