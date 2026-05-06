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
import { SnapshotDetailModal } from '../components/snapshot-detail-modal';

import { mockMetrics } from '../lib/data';
import { CommitSnapshot, SnapshotDetail } from '../lib/types';

export default function Dashboard() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<CommitSnapshot | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<SnapshotDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [snapshots, setSnapshots] = useState<CommitSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSnapshots() {
      try {
        const response = await fetch('/api/snapshot');
        if (response.ok) {
          const data = await response.json();
          const formattedData = data.map((snap: { timestamp: string | number | Date }) => ({
            ...snap,
            timestamp: new Date(snap.timestamp),
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

  const handleViewDetails = async (snapshot: CommitSnapshot) => {
    try {
      const response = await fetch(`/api/snapshot/${snapshot.id}`);
      if (response.ok) {
        const data = await response.json();
          console.log('[SubVault] Snapshot detail fetched (client):', data);
        const detailSnapshot: SnapshotDetail = {
          ...data,
          timestamp: new Date(data.timestamp),
        };
        setSelectedDetail(detailSnapshot);
        setIsDetailModalOpen(true);
      } else {
        console.error('[SubVault] Failed to fetch snapshot details:', response.status);
      }
    } catch (error) {
      console.error('[SubVault] Error fetching snapshot details:', error);
    }
  };

  const handleCreateSnapshot = async (data: { message: string; description?: string }) => {
    try {
      const response = await fetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: data.message, description: data.description ?? '' }),
      });

      if (!response.ok) {
        console.error('[SubVault] Failed to save snapshot, status:', response.status);
        return;
      }

      const saved = await response.json();
      const newSnapshot: CommitSnapshot = {
        ...saved,
        timestamp: new Date(saved.timestamp),
      };

      console.log('[SubVault] Manual snapshot persisted', newSnapshot);
      setSnapshots((prev) => [newSnapshot, ...prev]);
    } catch (error) {
      console.error('[SubVault] Error creating snapshot:', error);
    } finally {
      setIsCreateModalOpen(false);
    }
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
            value={snapshots.length}
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
              {isLoading
                ? 'Loading backups...'
                : `${filteredSnapshots.length} of ${snapshots.length} snapshots`}
            </p>
          </div>
          <SnapshotTable snapshots={filteredSnapshots} onViewDiff={handleViewDiff} onViewDetails={handleViewDetails} />
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
      />
      <SnapshotDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        snapshot={selectedDetail}
      />
    </DashboardLayout>
  );
}