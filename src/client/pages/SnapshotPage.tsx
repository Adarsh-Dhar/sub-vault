/* eslint-disable @typescript-eslint/no-floating-promises */
import { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { DashboardLayout } from '../components/dashboard-layout';
import { SnapshotTable } from '../components/snapshot-table';
import { TopNavigation } from '../components/top-navigation';
import { DiffViewerDrawer } from '../components/diff-viewer-drawer';
import { SnapshotDetailModal } from '../components/snapshot-detail-modal';
import { Button } from '../components/ui/button';

// data imports removed (use real API)
import { CommitSnapshot, SnapshotDetail } from '../lib/types';
import { Link } from 'react-router-dom';

export default function SnapshotsPage() {
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<CommitSnapshot | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<SnapshotDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [snapshots, setSnapshots] = useState<CommitSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch real data on mount
  useEffect(() => {
    async function fetchSnapshots() {
      try {
        const response = await fetch('/api/snapshot'); 
        if (response.ok) {
          const data = await response.json();
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
    console.log('[SubVault] Viewing diff for snapshot ID:', snapshot.id);
    setSelectedSnapshot(snapshot);
    setIsDiffDrawerOpen(true);
  };

  const handleViewDetails = async (snapshot: CommitSnapshot) => {
    setDetailError(null);
    setIsDetailLoading(true);
    setSelectedDetail(null);
    setIsDetailModalOpen(true);

    try {
      console.log('[SubVault] Fetching details for snapshot ID:', snapshot.id);
      const response = await fetch(`/api/snapshot/${snapshot.id}`);
      console.log('[SubVault] Fetching details :', response);
      if (response.ok) {
        const data = await response.json();
        const detailSnapshot: SnapshotDetail = {
          ...data,
          timestamp: new Date(data.timestamp),
        };
        setSelectedDetail(detailSnapshot);
      } else {
        setDetailError(`Failed to fetch snapshot details (${response.status})`);
        console.error('Failed to fetch snapshot details', response.status);
      }
    } catch (error) {
      setDetailError('Failed to load snapshot details');
      console.error('Failed to load snapshot details', error);
    } finally {
      setIsDetailLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-foreground">All Snapshots</h1>
          <p className="text-muted-foreground mt-2">Manage and browse all your commit snapshots</p>
        </div>

        <TopNavigation
          onCreateSnapshot={() => {
            console.log('Create snapshot');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Snapshot History</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isLoading ? "Loading backups..." : `${filteredSnapshots.length} of ${snapshots.length} total snapshots`}
              </p>
            </div>
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
          <SnapshotTable
            snapshots={filteredSnapshots}
            onViewDiff={handleViewDiff}
            onViewDetails={handleViewDetails}
          />
        </div>
      </div>

      <DiffViewerDrawer
        isOpen={isDiffDrawerOpen}
        onClose={() => setIsDiffDrawerOpen(false)}
        snapshot={selectedSnapshot}
      />
      <SnapshotDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedDetail(null);
          setDetailError(null);
          setIsDetailLoading(false);
        }}
        snapshot={selectedDetail}
        isLoading={isDetailLoading}
        error={detailError}
      />
    </DashboardLayout>
  );
}