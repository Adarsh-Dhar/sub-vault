/* eslint-disable @typescript-eslint/no-floating-promises */
'use client';
import { useState, useMemo, useEffect } from 'react';
import { BarChart3, GitCommit, Activity } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard-layout';
import { TopNavigation } from '../components/top-navigation';
import { StatsCard } from '../components/stats-card';
import { SnapshotTable } from '../components/snapshot-table';
import { CreateSnapshotModal } from '../components/create-snapshot-modal';
import { DiffViewerDrawer } from '../components/diff-viewer-drawer';

// Only keep metrics and diffs; REMOVE mockSnapshots
import { mockMetrics, mockDiffs } from '../lib/data'; 
import { CommitSnapshot } from '../lib/types';

export default function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<CommitSnapshot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Empty state for live database
  const [snapshots, setSnapshots] = useState<CommitSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real data on mount
  useEffect(() => {
    async function fetchSnapshots() {
      try {
        // This matches your Hono route: app.route('/api/snapshot')
        const response = await fetch('/api/snapshot'); 
        if (response.ok) {
          const data = await response.json();
          // Convert date strings to Date objects for the UI
          const formattedData = data.map((snap: { timestamp: string | number | Date; }) => ({
            ...snap,
            timestamp: new Date(snap.timestamp)
          }));
          setSnapshots(formattedData);
        }
      } catch (error) {
        console.error('Failed to load snapshots', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSnapshots();
  }, []);

  const filteredSnapshots = useMemo(() => {
    if (!searchQuery.trim()) return snapshots;
    const query = searchQuery.toLowerCase();
    return snapshots.filter(
      (snapshot) =>
        snapshot.author.toLowerCase().includes(query) ||
        snapshot.message.toLowerCase().includes(query) ||
        snapshot.hash.toLowerCase().includes(query)
    );
  }, [snapshots, searchQuery]);

  const handleViewDiff = (snapshot: CommitSnapshot) => {
    setSelectedSnapshot(snapshot);
    setIsDiffDrawerOpen(true);
  };

  const handleCreateSnapshot = (data: { message: string; description?: string }) => {
    const timestamp = Date.now();
    const id = `manual_${timestamp}`;
    const hash = String(timestamp).slice(-7);

    const newSnapshot: CommitSnapshot = {
      id,
      author: 'Manual Commit',
      hash,
      message: data.message,
      timestamp: new Date(timestamp),
      changes: 0,
      status: 'success',
    };

    console.log('[SubVault] Manual snapshot created', newSnapshot);
    setSnapshots((prev) => [newSnapshot, ...prev]);
    setIsCreateModalOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 sm:space-y-8">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm sm:text-base text-muted-foreground mt-2">Monitor and manage your commit snapshots</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          <StatsCard
            icon={BarChart3}
            title="Total Snapshots"
            value={snapshots.length} // Live dynamic value
            subtitle="All time"
          />
          <StatsCard
            icon={Activity}
            title="Active Subscriptions"
            value={mockMetrics.activeSubscriptions}
            subtitle="Currently tracking"
          />
          <StatsCard
            icon={GitCommit}
            title="Success Rate"
            value={`${mockMetrics.successRate}%`}
            subtitle="Last 30 days"
          />
        </div>

        <TopNavigation
          onCreateSnapshot={() => setIsCreateModalOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-border">
            <h3 className="text-base sm:text-lg font-semibold text-foreground">Recent Snapshots</h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {isLoading ? "Loading backups..." : `${filteredSnapshots.length} of ${snapshots.length} snapshots`}
            </p>
          </div>
          <SnapshotTable snapshots={filteredSnapshots} onViewDiff={handleViewDiff} />
        </div>
      </div>

      <CreateSnapshotModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateSnapshot}
      />
      <DiffViewerDrawer
        isOpen={isDiffDrawerOpen}
        onClose={() => setIsDiffDrawerOpen(false)}
        snapshot={selectedSnapshot}
        diffs={mockDiffs}
      />
    </DashboardLayout>
  );
}