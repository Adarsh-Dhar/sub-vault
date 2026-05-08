
import { useEffect, useRef, useState } from 'react';
import { Loader2, RotateCcw, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
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

// ─── Verification result types ────────────────────────────────────────────────

type VerificationSection = {
  section: string;
  additions: number;
  deletions: number;
  status: 'matched' | 'drifted' | 'skipped';
};

type VerificationResult = {
  sectionsChanged: number;
  totalAdditions: number;
  totalDeletions: number;
  sections: VerificationSection[];
  verifiedAt: string;
  verified: boolean;
  notes: string[];
};

type PollingStatus = {
  pollingId: string;
  restoreId: string;
  targetId: string;
  subName: string;
  currentAttempt: number;
  maxAttempts: number;
  isActive: boolean;
  verified: boolean;
  timedOut: boolean;
  lastAttemptAt?: string;
  lastVerification?: VerificationResult | null;
  nextPollAfterMs?: number;
  completedAt?: string;
};

// ─── Verification panel ───────────────────────────────────────────────────────

function VerificationPanel({ result }: { result: VerificationResult }) {
  const [expanded, setExpanded] = useState(false);

  const realDrift = result.sections.filter(s => s.status === 'drifted');

  return (
    <div
      className={`mt-4 rounded-lg border ${
        result.verified
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
          : realDrift.length > 0
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20'
          : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30'
      }`}
    >
      {/* Header */}
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          {result.verified ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : realDrift.length > 0 ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-500" />
          )}
          <span
            className={`text-sm font-semibold ${
              result.verified
                ? 'text-emerald-700 dark:text-emerald-300'
                : realDrift.length > 0
                ? 'text-amber-700 dark:text-amber-300'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {result.verified
              ? 'Restore verified — live state matches snapshot'
              : realDrift.length > 0
              ? `Restore applied — ${realDrift.length} section${realDrift.length !== 1 ? 's' : ''} may need propagation`
              : 'Verification complete'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {result.sectionsChanged > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-white/60 dark:bg-black/20 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              {result.sectionsChanged} section{result.sectionsChanged !== 1 ? 's' : ''} differ
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-inherit px-4 pb-4 pt-3 space-y-3">

          {/* Section breakdown */}
          {result.sections.length > 0 && (
            <div className="space-y-1.5">
              {result.sections.map(s => (
                <div key={s.section} className="flex items-center gap-2 text-xs">
                  {s.status === 'drifted' ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  ) : s.status === 'skipped' ? (
                    <span className="h-3.5 w-3.5 flex items-center justify-center shrink-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    </span>
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  )}
                  <span
                    className={`font-medium ${
                      s.status === 'drifted'
                        ? 'text-amber-700 dark:text-amber-400'
                        : s.status === 'skipped'
                        ? 'text-slate-500'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {s.section}
                  </span>
                  {s.status !== 'matched' && (
                    <span className="text-slate-500">
                      {s.status === 'skipped'
                        ? '— not restored via API'
                        : `+${s.additions} / -${s.deletions} lines differ`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {result.sections.length === 0 && (
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              No differences detected between snapshot and live state.
            </p>
          )}

          {/* Notes */}
          {result.notes.length > 0 && (
            <div className="rounded-md bg-white/50 dark:bg-black/20 border border-inherit p-3 space-y-1">
              {result.notes.map((note, i) => (
                <p key={i} className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {note}
                </p>
              ))}
            </div>
          )}

          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Verified at {new Date(result.verifiedAt).toLocaleTimeString()} by capturing a fresh live snapshot immediately after restore.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SnapshotDetailModal({
  isOpen,
  onClose,
  snapshot,
  isLoading = false,
  error = null,
}: SnapshotDetailModalProps) {
  const [isRestoring, setIsRestoring] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [restoreDone, setRestoreDone] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<PollingStatus | null>(null);
  const pollingIntervalRef = useRef<number | null>(null);
  const pollingInFlightRef = useRef(false);

  const clearPolling = () => {
    if (pollingIntervalRef.current !== null) {
      window.clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    pollingInFlightRef.current = false;
  };

  useEffect(() => () => clearPolling(), []);

  const stopVerification = () => {
    clearPolling();
    setIsVerifying(false);
  };

  const pollVerificationStatus = async (pollingId: string) => {
    if (pollingInFlightRef.current) return;
    pollingInFlightRef.current = true;

    try {
      const res = await fetch(`/api/snapshot/${pollingId}/verify-status`);
      const result = await res.json();

      if (!res.ok && !result?.lastVerification) {
        throw new Error(result?.error ?? `Verification polling failed: ${res.status}`);
      }

      const status = result as PollingStatus;
      setPollingStatus(status);

      if (status.lastVerification) {
        setVerification(status.lastVerification);
      }

      if (status.verified) {
        setRestoreDone(true);
        stopVerification();
        return;
      }

      if (status.timedOut) {
        setRestoreError('Restore verification timed out after 3 minutes.');
        stopVerification();
      }
    } catch (err) {
      console.error('Failed to poll restore verification', err);
      setRestoreError(err instanceof Error ? err.message : 'Verification polling failed unexpectedly');
      stopVerification();
    } finally {
      pollingInFlightRef.current = false;
    }
  };

  const startPolling = (pollingId: string) => {
    clearPolling();
    setIsVerifying(true);
    setPollingStatus({
      pollingId,
      restoreId: '',
      targetId: snapshot?.id ?? pollingId,
      subName: '',
      currentAttempt: 0,
      maxAttempts: 18,
      isActive: true,
      verified: false,
      timedOut: false,
    });

    void pollVerificationStatus(pollingId);
    pollingIntervalRef.current = window.setInterval(() => {
      void pollVerificationStatus(pollingId);
    }, 10_000);
  };

  const handleRestore = async () => {
    if (!snapshot?.id) return;

    setIsRestoring(true);
    setIsVerifying(false);
    setRestoreError(null);
    setVerification(null);
    setRestoreDone(false);
    setPollingStatus(null);
    clearPolling();

    try {
      const res = await fetch(`/api/snapshot/${snapshot.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: snapshot.id }),
      });

      if (!res.ok) {
        throw new Error(`Restore failed: ${res.status}`);
      }

      const result = await res.json();
      if (result.pollingId) {
        setRestoreDone(false);
        setIsRestoring(false);
        startPolling(String(result.pollingId));
        return;
      }

      // Surface any verification result if the server already completed it
      if (result.verification) {
        setVerification(result.verification as VerificationResult);
        setRestoreDone(Boolean(result.verification?.verified));
      }

      setIsRestoring(false);
    } catch (err) {
      console.error('Failed to restore snapshot', err);
      setRestoreError(err instanceof Error ? err.message : 'Restore failed unexpectedly');
    } finally {
      if (!pollingIntervalRef.current) {
        setIsRestoring(false);
      }
    }
  };

  // Reset state when modal closes
  const handleClose = () => {
    clearPolling();
    setRestoreError(null);
    setVerification(null);
    setRestoreDone(false);
    setPollingStatus(null);
    setIsRestoring(false);
    setIsVerifying(false);
    onClose();
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

  const safeStringify = (value: unknown) => {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return '{\n  "error": "Unable to render settings payload"\n}';
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
            <div>Description: <span className="text-slate-900">{identity?.description || 'N/A'}</span></div>
            <div>Public description: <span className="text-slate-900">{identity?.publicDescription || 'N/A'}</span></div>
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
            {safeStringify(settings)}
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
      onClick={handleClose}
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
          <div className="flex min-h-96 flex-col border-b border-slate-200">
            <div className="flex items-start justify-between gap-4 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Snapshot Details</h2>
                <p className="mt-1 text-sm text-slate-600">Loading snapshot data...</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose} type="button">
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center gap-3 p-8 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading snapshot details
            </div>
          </div>
        ) : error ? (
          <div className="flex min-h-96 flex-col border-b border-slate-200">
            <div className="flex items-start justify-between gap-4 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Snapshot Details</h2>
                <p className="mt-1 text-sm text-slate-600">Unable to load the selected snapshot.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose} type="button">
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-red-600">
              {error}
            </div>
          </div>
        ) : !snapshot || !snapshot.data ? (
          <div className="flex min-h-96 flex-col border-b border-slate-200">
            <div className="flex items-start justify-between gap-4 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Snapshot Details</h2>
                <p className="mt-1 text-sm text-slate-600">No snapshot data was returned.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose} type="button">
                Close
              </Button>
            </div>
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-600">
              No data available for this snapshot
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-slate-200 px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 text-left">
                  <h2 className="truncate text-lg font-semibold text-slate-900">
                    {snapshot.message || 'Snapshot'}
                  </h2>
                  <p className="truncate text-sm text-slate-600">
                    {snapshot.author || 'Manual Commit'} • {safeTimeAgo()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!restoreDone ? (
                    <Button
                      onClick={handleRestore}
                      disabled={isRestoring || isVerifying}
                      className="flex items-center gap-2"
                      type="button"
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Verifying restore... Attempt {pollingStatus?.currentAttempt ?? 0}/{pollingStatus?.maxAttempts ?? 18}
                        </>
                      ) : isRestoring ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Restoring & verifying…
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          Restore Snapshot
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Restored
                    </div>
                  )}
                  <Button variant="ghost" size="sm" onClick={handleClose} type="button">
                    Close
                  </Button>
                </div>
              </div>

              {/* Restore error */}
              {restoreError && (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2.5">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{restoreError}</p>
                </div>
              )}

              {/* Restore in-progress note */}
              {(isRestoring || isVerifying) && (
                <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5">
                  <Loader2 className="h-4 w-4 text-blue-500 mt-0.5 shrink-0 animate-spin" />
                  <p className="text-sm text-blue-700">
                    {isVerifying
                      ? `Verifying restore... Attempt ${pollingStatus?.currentAttempt ?? 0}/${pollingStatus?.maxAttempts ?? 18}.`
                      : 'Applying restore… then capturing a fresh live snapshot to verify changes took effect.'}
                  </p>
                </div>
              )}

              {/* Post-restore verification panel */}
              {verification && !isRestoring && !isVerifying && (
                <VerificationPanel result={verification} />
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {snapshot.data ? renderKeyValues(snapshot.data as CommunitySnapshotData) : (
                <div className="flex items-center justify-center p-8 text-center text-sm text-slate-600">
                  No snapshot data available
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}