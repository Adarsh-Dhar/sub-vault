'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard-layout';
import { SnapshotTable } from '../components/snapshot-table';
import { TopNavigation } from '../components/top-navigation';
import { DiffViewerDrawer } from '../components/diff-viewer-drawer';
import { Button } from '../components/ui/button';
import { mockSnapshots, mockDiffs } from '../lib/data';
import { CommitSnapshot } from '../lib/types';
import { Link } from 'react-router-dom';

export default function SnapshotsPage() {
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<CommitSnapshot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const snapshots = mockSnapshots;

  const filteredSnapshots = useMemo(() => {
    if (!searchQuery.trim()) return snapshots;
    const query = searchQuery.toLowerCase();
    return snapshots.filter(
      (snapshot: { author: string; message: string; hash: string; }) =>
        snapshot.author.toLowerCase().includes(query) ||
        snapshot.message.toLowerCase().includes(query) ||
        snapshot.hash.toLowerCase().includes(query)
    );
  }, [snapshots, searchQuery]);

  const handleViewDiff = (snapshot: CommitSnapshot) => {
    setSelectedSnapshot(snapshot);
    setIsDiffDrawerOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Page Title */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">All Snapshots</h1>
          <p className="text-muted-foreground mt-2">Manage and browse all your commit snapshots</p>
        </div>

        {/* Top Navigation with Search */}
        <TopNavigation
          onCreateSnapshot={() => {
            // Navigate to create snapshot
            console.log('Create snapshot');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Snapshots Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Snapshot History</h2>
              <p className="text-sm text-gray-600 mt-1">
                {filteredSnapshots.length} of {snapshots.length} total snapshots
              </p>
            </div>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
          <SnapshotTable snapshots={filteredSnapshots} onViewDiff={handleViewDiff} />
        </div>
      </div>

      {/* Diff Viewer Drawer */}
      <DiffViewerDrawer
        isOpen={isDiffDrawerOpen}
        onClose={() => setIsDiffDrawerOpen(false)}
        snapshot={selectedSnapshot}
        diffs={mockDiffs}
      />
    </DashboardLayout>
  );
}
