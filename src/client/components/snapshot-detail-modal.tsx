'use client';

import { useEffect, useRef, useState, Component, ReactNode } from 'react';
import { Loader2, RotateCcw, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { CommunitySnapshotData, SnapshotDetail } from '../lib/types';

// ─── Error Boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error) {
    console.error('[SubVault] Error boundary caught:', error);
  }

  override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback?.(this.state.error!) || (
          <div className="flex items-center justify-center p-8 text-center">
            <div>
              <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900">Something went wrong</p>
              <p className="text-xs text-slate-600 mt-1">Failed to render snapshot details</p>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

// ─── Data validation ──────────────────────────────────────────────────────────

function isValidSnapshotData(data: unknown): data is CommunitySnapshotData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  
  // Check critical required fields
  if (!obj.identity && obj.identity !== null) return false;  // Can be null
  if (!Array.isArray(obj.rules)) return false;
  if (!Array.isArray(obj.removalReasons)) return false;
  if (typeof obj.flairs !== 'object' || !obj.flairs) return false;
  
  const flairs = obj.flairs as Record<string, unknown>;
  if (!Array.isArray(flairs.post) || !Array.isArray(flairs.user)) return false;
  
  if (typeof obj.userManagement !== 'object' || !obj.userManagement) return false;
  if (typeof obj.capturedAt !== 'string') return false;
  if (typeof obj.limitations !== 'object' || !obj.limitations) return false;
  
  return true;
}

// ─── Safe string extraction helper ────────────────────────────────────────────

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    // Handle markdown objects
    if (typeof obj.markdown === 'string') return obj.markdown;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
  }
  return '';
}

interface SnapshotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: SnapshotDetail | null;
  isLoading?: boolean;
  error?: string | null;
}

// ─── Verification result types ────────────────────────────────────────────────
type VerificationSection = { section: string; additions: number; deletions: number; status: 'matched' | 'drifted' | 'skipped'; };
type VerificationResult = { sectionsChanged: number; totalAdditions: number; totalDeletions: number; sections: VerificationSection[]; verifiedAt: string; verified: boolean; notes: string[]; };
type PollingStatus = { pollingId: string; restoreId: string; targetId: string; subName: string; currentAttempt: number; maxAttempts: number; isActive: boolean; verified: boolean; timedOut: boolean; lastAttemptAt?: string; lastVerification?: VerificationResult | null; nextPollAfterMs?: number; completedAt?: string; };

// ─── Verification panel ───────────────────────────────────────────────────────
function VerificationPanel({ result }: { result: VerificationResult }) {
  const [expanded, setExpanded] = useState(false);
  const realDrift = (result?.sections || []).filter(s => s.status === 'drifted');

  return (
    <div className={`mt-4 rounded-lg border ${result.verified ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : realDrift.length > 0 ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30'}`}>
      <button className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-2.5">
          {result.verified ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> : realDrift.length > 0 ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-500" />}
          <span className={`text-sm font-semibold ${result.verified ? 'text-emerald-700 dark:text-emerald-300' : realDrift.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-300'}`}>
            {result.verified ? 'Restore verified — live state matches snapshot' : realDrift.length > 0 ? `Restore applied — ${realDrift.length} section${realDrift.length !== 1 ? 's' : ''} may need propagation` : 'Verification complete'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-inherit px-4 pb-4 pt-3 space-y-3">
          {(result?.sections || []).length > 0 && (
            <div className="space-y-1.5">
              {result.sections.map(s => (
                <div key={s.section} className="flex items-center gap-2 text-xs">
                  {s.status === 'drifted' ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> : s.status === 'skipped' ? <span className="h-3.5 w-3.5 flex items-center justify-center shrink-0"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" /></span> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                  <span className={`font-medium ${s.status === 'drifted' ? 'text-amber-700 dark:text-amber-300' : s.status === 'skipped' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-700 dark:text-emerald-300'}`}>{s.section}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Native Modal ────────────────────────────────────────────────────────
export function SnapshotDetailModal({ isOpen, onClose, snapshot, isLoading, error }: SnapshotDetailModalProps) {
  const [activeTab, setActiveTab] = useState('identity');
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
      if (!res.ok && !result?.lastVerification) throw new Error(result?.error ?? `Polling failed`);
      
      const status = result as PollingStatus;
      setPollingStatus(status);
      if (status.lastVerification) setVerification(status.lastVerification);
      
      if (status.verified) {
        setRestoreDone(true); stopVerification(); return;
      }
      if (status.timedOut) {
        setRestoreError('Restore verification timed out.'); stopVerification();
      }
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Polling failed'); stopVerification();
    } finally {
      pollingInFlightRef.current = false;
    }
  };

  const startPolling = (pollingId: string) => {
    clearPolling(); setIsVerifying(true);
    setPollingStatus({ pollingId, restoreId: '', targetId: snapshot?.id ?? '', subName: '', currentAttempt: 0, maxAttempts: 18, isActive: true, verified: false, timedOut: false });
    void pollVerificationStatus(pollingId);
    pollingIntervalRef.current = window.setInterval(() => void pollVerificationStatus(pollingId), 10_000);
  };

  const handleRestore = async () => {
    if (!snapshot?.id) return;
    setIsRestoring(true); setIsVerifying(false); setRestoreError(null); setVerification(null); setRestoreDone(false); clearPolling();

    try {
      const res = await fetch(`/api/snapshot/${snapshot.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: snapshot.id }),
      });
      if (!res.ok) throw new Error(`Restore failed: ${res.status}`);
      const result = await res.json();
      if (result.pollingId) {
        setIsRestoring(false); startPolling(String(result.pollingId)); return;
      }
      setIsRestoring(false);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed'); setIsRestoring(false);
    }
  };

  const handleClose = () => {
    clearPolling(); setRestoreError(null); setVerification(null); setRestoreDone(false); setPollingStatus(null); setIsRestoring(false); setIsVerifying(false);
    onClose();
  };

  // Replaced date-fns with native JS
  const safeTimeAgo = () => {
    if (!snapshot?.timestamp) return 'Unknown time';
    try {
      const date = new Date(snapshot.timestamp);
      if (Number.isNaN(date.getTime())) return 'Unknown time';
      return date.toLocaleString();
    } catch { return 'Unknown time'; }
  };

  if (!isOpen) return null;

  const isDataValid = snapshot && snapshot.data && isValidSnapshotData(snapshot.data);
  const tabs = ['identity', 'settings', 'rules', 'flairs', 'widgets', 'users', 'automod'];

  return (
    <ErrorBoundary
      fallback={(error) => (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-6" onClick={handleClose}>
          <div 
            className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col relative border border-slate-200 dark:border-slate-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()} 
          >
            <button 
              onClick={handleClose} 
              className="absolute right-4 top-4 p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors z-50"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-12">
              <XCircle className="h-8 w-8 text-red-500 mb-4" />
              <p className="text-red-600 dark:text-red-400 font-medium">Failed to render snapshot details</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{error.message}</p>
            </div>
          </div>
        </div>
      )}
    >
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 sm:p-6" onClick={handleClose}>
        <div 
          className="bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col relative border border-slate-200 dark:border-slate-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()} 
        >
          <button 
            onClick={handleClose} 
            className="absolute right-4 top-4 p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors z-50"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>

          {isLoading || error || !snapshot || !isDataValid ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-12">
              {isLoading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin mb-4 text-slate-600" />
                  <p>Loading snapshot data...</p>
                </>
              ) : error ? (
                <>
                  <AlertTriangle className="h-8 w-8 text-amber-500 mb-4" />
                  <p className="text-amber-600 dark:text-amber-400 font-medium">Error loading snapshot</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">{error}</p>
                </>
              ) : !snapshot ? (
                <>
                  <AlertTriangle className="h-8 w-8 text-amber-500 mb-4" />
                  <p className="text-amber-600 dark:text-amber-400 font-medium">Snapshot not found</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-8 w-8 text-amber-500 mb-4" />
                  <p className="text-amber-600 dark:text-amber-400 font-medium">Invalid snapshot data</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">The snapshot data structure is incomplete or corrupted</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="shrink-0 p-6 pb-4 border-b border-slate-200 dark:border-slate-800 pr-16">
                <div className="flex flex-row items-start justify-between">
                  <div className="min-w-0 text-left">
                    <h2 className="text-xl font-semibold truncate">{snapshot.message || 'Snapshot'}</h2>
                    <p className="truncate mt-1 text-sm text-slate-500">
                      {snapshot.author || 'Manual Commit'} • {safeTimeAgo()}
                    </p>
                  </div>
                  
                  <button 
                    onClick={handleRestore} 
                    disabled={isRestoring || isVerifying || restoreDone} 
                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 text-white dark:text-slate-900 rounded-md text-sm font-medium transition-colors"
                  >
                    {isVerifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying... {pollingStatus?.currentAttempt ?? 0}/18</> :
                     isRestoring ? <><Loader2 className="h-4 w-4 animate-spin" /> Restoring...</> :
                     restoreDone ? <><CheckCircle2 className="h-4 w-4" /> Restored</> :
                     <><RotateCcw className="h-4 w-4" /> Restore Snapshot</>}
                  </button>
                </div>

                {restoreError && (
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-red-500/10 p-3 text-sm text-red-600">
                    <XCircle className="h-4 w-4 shrink-0" /> {restoreError}
                  </div>
                )}
                
                {verification && !isRestoring && !isVerifying && (
                  <VerificationPanel result={verification} />
                )}
              </div>

              <div className="shrink-0 flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
                      activeTab === tab 
                        ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400 bg-white dark:bg-slate-950' 
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {isDataValid && activeTab === 'identity' && <IdentityTab data={snapshot.data!} />}
                {isDataValid && activeTab === 'settings' && <pre className="bg-slate-50 dark:bg-slate-900 p-4 rounded text-xs overflow-auto">{JSON.stringify(snapshot.data?.settings, null, 2)}</pre>}
                {isDataValid && activeTab === 'rules' && <RulesTab data={snapshot.data!} />}
                {isDataValid && activeTab === 'flairs' && <FlairsTab data={snapshot.data!} />}
                {isDataValid && activeTab === 'widgets' && <WidgetsTab data={snapshot.data!} />}
                {isDataValid && activeTab === 'users' && <UserManagementTab data={snapshot.data!} />}
                {isDataValid && activeTab === 'automod' && <pre className="bg-slate-50 dark:bg-slate-900 p-4 rounded text-xs overflow-auto whitespace-pre-wrap">{safeString(snapshot.data?.automoderator) || 'Not configured'}</pre>}
              </div>
            </>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

// ─── Zero-Dependency Sub-Components ───────────────────────────────────────────

function IdentityTab({ data }: { data: CommunitySnapshotData }) {
  const identity = data?.identity;
  if (!identity) return <div className="text-sm text-slate-500">No identity data available</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex gap-2 text-sm"><span className="font-medium text-slate-500 shrink-0">Display Name:</span> {safeString(identity?.displayName) || 'N/A'}</div>
        <div className="flex gap-2 text-sm"><span className="font-medium text-slate-500 shrink-0">Type:</span> {safeString(identity?.subredditType) || 'N/A'}</div>
        <div className="flex gap-2 text-sm"><span className="font-medium text-slate-500 shrink-0">Subscribers:</span> {identity?.subscribers && typeof identity.subscribers === 'number' ? identity.subscribers.toLocaleString() : '0'}</div>
        <div className="flex gap-2 text-sm"><span className="font-medium text-slate-500 shrink-0">Language:</span> {safeString(identity?.lang) || 'N/A'}</div>
      </div>
      <div className="space-y-2 text-sm">
        <span className="font-medium text-slate-500">Description:</span>
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 whitespace-pre-wrap">{safeString(identity?.description) || 'N/A'}</div>
      </div>
    </div>
  );
}

function RulesTab({ data }: { data: CommunitySnapshotData }) {
  const rules = Array.isArray(data?.rules) ? data.rules : [];
  if (rules.length === 0) return <div className="text-sm text-slate-500">No rules configured</div>;
  return (
    <div className="space-y-3">
      {rules.map((rule: any, idx: number) => (
        <div key={idx} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm p-4 rounded-xl">
          <h3 className="text-base font-semibold mb-2">{(rule?.priority ?? idx + 1)}. {safeString(rule?.name || rule?.shortName) || 'Unnamed Rule'}</h3>
          <p className="text-sm text-slate-500 whitespace-pre-wrap">{safeString(rule?.description) || ''}</p>
        </div>
      ))}
    </div>
  );
}

function FlairsTab({ data }: { data: CommunitySnapshotData }) {
  const postFlairs = Array.isArray(data?.flairs?.post) ? data.flairs.post : [];
  const userFlairs = Array.isArray(data?.flairs?.user) ? data.flairs.user : [];
  
  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold mb-3">Post Flairs</h4>
        <div className="flex flex-wrap gap-2">
          {postFlairs.map((f: any, i: number) => <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">{safeString(f?.text) || 'Unnamed'}</span>)}
        </div>
      </div>
      <div>
        <h4 className="text-sm font-semibold mb-3">User Flairs</h4>
        <div className="flex flex-wrap gap-2">
          {userFlairs.map((f: any, i: number) => <span key={i} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">{safeString(f?.text) || 'Unnamed'}</span>)}
        </div>
      </div>
    </div>
  );
}

function WidgetsTab({ data }: { data: CommunitySnapshotData }) {
  const widgets = Array.isArray(data?.widgets) ? data.widgets : [];
  if (widgets.length === 0) return <div className="text-sm text-slate-500">No widgets configured</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {widgets.map((w: any, i: number) => (
        <div key={i} className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm p-4 rounded-xl">
          <div className="text-sm font-mono truncate">{safeString(w?.name)} <br/><span className="text-slate-400 text-xs">{safeString(w?.type)}</span></div>
        </div>
      ))}
    </div>
  );
}

function UserManagementTab({ data }: { data: CommunitySnapshotData }) {
  const um = data?.userManagement ?? { banned: [], muted: [], approved: [], moderators: [] };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Array.isArray(um?.moderators) ? um.moderators.length : 0}</span>
        <span className="text-xs text-slate-500 uppercase tracking-wider mt-1">Moderators</span>
      </div>
      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Array.isArray(um?.banned) ? um.banned.length : 0}</span>
        <span className="text-xs text-slate-500 uppercase tracking-wider mt-1">Banned</span>
      </div>
      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Array.isArray(um?.muted) ? um.muted.length : 0}</span>
        <span className="text-xs text-slate-500 uppercase tracking-wider mt-1">Muted</span>
      </div>
      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{Array.isArray(um?.approved) ? um.approved.length : 0}</span>
        <span className="text-xs text-slate-500 uppercase tracking-wider mt-1">Approved</span>
      </div>
    </div>
  );
}