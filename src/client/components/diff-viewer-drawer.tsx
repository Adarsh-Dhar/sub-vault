'use client';

import { CommitSnapshot, Diff } from '@/lib/types';
import { X } from 'lucide-react';
import { Button } from './ui/button';

interface DiffViewerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: CommitSnapshot | null;
  diffs: Diff[];
}

export function DiffViewerDrawer({ isOpen, onClose, snapshot, diffs }: DiffViewerDrawerProps) {
  if (!isOpen || !snapshot) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-lg flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{snapshot.message}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Commit: <span className="font-mono">{snapshot.hash}</span>
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="hover:bg-gray-100">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {diffs.map((diff, idx) => (
            <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{diff.file}</p>
                  <div className="flex gap-4 mt-1 text-xs">
                    <span className="text-green-600 font-medium">+{diff.additions}</span>
                    <span className="text-red-600 font-medium">-{diff.deletions}</span>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${
                  diff.type === 'add'
                    ? 'bg-green-100 text-green-700'
                    : diff.type === 'remove'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                }`}>
                  {diff.type.charAt(0).toUpperCase() + diff.type.slice(1)}
                </span>
              </div>

              {/* Code Diff */}
              {diff.content && (
                <div className="bg-gray-900 text-sm font-mono overflow-x-auto">
                  {diff.content.split('\n').map((line, lineIdx) => {
                    const isAddition = line.startsWith('+');
                    const isDeletion = line.startsWith('-');

                    return (
                      <div
                        key={lineIdx}
                        className={`px-4 py-1 flex items-start gap-2 ${
                          isAddition
                            ? 'bg-green-950 text-green-200'
                            : isDeletion
                              ? 'bg-red-950 text-red-200'
                              : 'bg-gray-900 text-gray-300'
                        }`}
                      >
                        <span className="shrink-0 w-6 text-gray-500">
                          {isAddition ? '+' : isDeletion ? '-' : ' '}
                        </span>
                        <span className="flex-1 wrap-break-word">{line.slice(1)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onClose}>
            Accept Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
