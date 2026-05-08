
import { CommitSnapshot } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { Eye } from 'lucide-react';
import { Button } from './ui/button';

interface SnapshotTableProps {
  snapshots: CommitSnapshot[];
  onViewDiff: (snapshot: CommitSnapshot) => void;
  onViewDetails?: (snapshot: CommitSnapshot) => void;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    case 'warning':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
    case 'error':
      return 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
    default:
      return 'bg-muted text-foreground border-border';
  }
}

export function SnapshotTable({ snapshots, onViewDiff, onViewDetails }: SnapshotTableProps) {
  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto bg-card text-foreground">
        <table className="w-full bg-card text-foreground">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Author</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Commit</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Message</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Changes</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Status</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Time</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Action</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((snapshot) => (
              <tr key={snapshot.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4 text-sm text-foreground">{snapshot.author}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{snapshot.hash}</td>
                <td
                  className="px-6 py-4 text-sm text-primary max-w-xs truncate cursor-pointer hover:underline"
                  onClick={() => onViewDetails?.(snapshot)}
                >
                  {snapshot.message}
                </td>
                <td className="px-6 py-4 text-sm text-foreground font-semibold">{snapshot.changes}</td>
                <td className="px-6 py-4">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(snapshot.status)}`}>
                    {snapshot.status.charAt(0).toUpperCase() + snapshot.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {formatDistanceToNow(snapshot.timestamp, { addSuffix: true })}
                </td>
                <td className="px-6 py-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDiff(snapshot)}
                    className="hover:bg-primary/10 text-primary hover:text-primary"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {snapshots.map((snapshot) => (
          <div
            key={snapshot.id}
            className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="font-semibold text-foreground text-sm">{snapshot.author}</p>
                <p className="text-xs text-muted-foreground font-mono">{snapshot.hash.slice(0, 8)}</p>
              </div>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium border shrink-0 ${getStatusColor(snapshot.status)}`}>
                {snapshot.status.charAt(0).toUpperCase() + snapshot.status.slice(1)}
              </span>
            </div>

            <p
              className="text-sm text-primary mb-2 line-clamp-2 cursor-pointer hover:underline"
              onClick={() => onViewDetails?.(snapshot)}
            >
              {snapshot.message}
            </p>

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{snapshot.changes} changes</span>
                <span>{formatDistanceToNow(snapshot.timestamp, { addSuffix: true })}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewDetails?.(snapshot)}
                className="flex-1"
              >
                Details
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewDiff(snapshot)}
                className="flex-1 flex items-center justify-center gap-2"
              >
                <Eye className="h-4 w-4" />
                Diff
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
