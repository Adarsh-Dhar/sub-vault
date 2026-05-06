import { useState, useCallback, useMemo } from 'react';
import { CommitSnapshot } from '@/lib/types';
import { mockSnapshots } from '@/lib/data';

export function useDashboardState() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDiffDrawerOpen, setIsDiffDrawerOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<CommitSnapshot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [snapshots, setSnapshots] = useState<CommitSnapshot[]>(mockSnapshots);

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

  const openCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  const openDiffDrawer = useCallback((snapshot: CommitSnapshot) => {
    setSelectedSnapshot(snapshot);
    setIsDiffDrawerOpen(true);
  }, []);

  const closeDiffDrawer = useCallback(() => {
    setIsDiffDrawerOpen(false);
    setSelectedSnapshot(null);
  }, []);

  const addSnapshot = useCallback(
    (data: { message: string; description: string }) => {
      const newSnapshot: CommitSnapshot = {
        id: String(snapshots.length + 1),
        author: 'Current User',
        hash: Math.random().toString(16).slice(2, 9),
        message: data.message,
        timestamp: new Date(),
        changes: Math.floor(Math.random() * 100) + 10,
        status: 'success',
      };
      setSnapshots((prev) => [newSnapshot, ...prev]);
    },
    [snapshots.length]
  );

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    // State
    isCreateModalOpen,
    isDiffDrawerOpen,
    selectedSnapshot,
    searchQuery,
    snapshots,
    filteredSnapshots,
    // Actions
    openCreateModal,
    closeCreateModal,
    openDiffDrawer,
    closeDiffDrawer,
    addSnapshot,
    deleteSnapshot,
    setSearchQuery,
  };
}
