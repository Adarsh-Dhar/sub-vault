"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import type { CommitSnapshot } from "../lib/types";
import { computeSnapshotDiff, SnapshotDiff } from "../../shared/snapshot-diff";

export function DiffViewerDrawer({
  isOpen,
  onClose,
  snapshot,
}: {
  isOpen: boolean;
  onClose: () => void;
  snapshot: CommitSnapshot | null;
}) {
  const [diffs, setDiffs] = useState<SnapshotDiff[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawContext, setRawContext] = useState<{ previous: unknown | null; current: unknown | null } | null>(null);

  useEffect(() => {
    if (!isOpen || !snapshot) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDiffs(null);
      try {
        const res = await fetch(`/api/snapshot/${snapshot.id}/diff`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const payload = await res.json();
        // server returns { current, previous }
        const current = payload.current?.data ?? null;
        const previous = payload.previous?.data ?? null;

        setRawContext({ previous, current });

        const computed = computeSnapshotDiff(previous, current);
        if (!cancelled) setDiffs(computed);
      } catch (err: any) {
        if (!cancelled) setError(String(err?.message ?? err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, snapshot]);

  if (!isOpen || !snapshot) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-lg flex flex-col">
        <div className="border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{snapshot.message}</h2>
            <p className="text-sm text-gray-600 mt-1">Commit: <span className="font-mono">{snapshot.hash}</span></p>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-100">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {loading && <div className="text-sm text-muted-foreground">Loading diffs…</div>}
          {error && <div className="text-sm text-red-600">Error loading diffs: {error}</div>}

          {!loading && !error && diffs && diffs.length === 0 && (
            <div>
              <div className="text-sm text-muted-foreground">No compacted section diffs available.</div>
              {snapshot.changes > 0 && rawContext && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <h3 className="text-sm font-medium text-gray-800 mb-2">Previous (raw)</h3>
                    <pre className="text-xs font-mono text-gray-700 max-h-64 overflow-auto">{JSON.stringify(rawContext.previous ?? {}, null, 2)}</pre>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-3 bg-white">
                    <h3 className="text-sm font-medium text-gray-800 mb-2">Current (raw)</h3>
                    <pre className="text-xs font-mono text-gray-700 max-h-64 overflow-auto">{JSON.stringify(rawContext.current ?? {}, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && !error && diffs && diffs.map((sec, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{sec.section}</p>
                  <div className="flex gap-4 mt-1 text-xs">
                    <span className="text-green-600 font-medium">+{sec.additions}</span>
                    <span className="text-red-600 font-medium">-{sec.deletions}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 text-sm font-mono overflow-x-auto">
                {sec.lines.map((line, lineIdx) => {
                  const isAddition = line.kind === 'added';
                  const isDeletion = line.kind === 'removed';
                  const text = line.text;
                  return (
                    <div
                      key={lineIdx}
                      className={`px-4 py-1 flex items-start gap-2 ${
                        isAddition
                          ? "bg-green-950 text-green-200"
                          : isDeletion
                          ? "bg-red-950 text-red-200"
                          : "bg-gray-900 text-gray-300"
                      }`}
                    >
                      <span className="shrink-0 w-6 text-gray-500">{isAddition ? "+" : isDeletion ? "-" : " "}</span>
                      <span className="flex-1 wrap-break-word">{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onClose}>Accept Changes</Button>
        </div>
      </div>
    </div>
  );
}