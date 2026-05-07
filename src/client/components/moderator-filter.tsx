'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, User, Users, Check, Loader2 } from 'lucide-react';
import { CommitSnapshot } from '@/lib/types';

interface ModeratorFilterProps {
  snapshots: CommitSnapshot[];
  selectedMod: string | null;
  onSelectMod: (mod: string | null) => void;
}

type Moderator = {
  username: string;
  permissions: string[];
};

export function ModeratorFilter({ snapshots, selectedMod, onSelectMod }: ModeratorFilterProps) {
  const [open, setOpen] = useState(false);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [isLoadingMods, setIsLoadingMods] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch real moderators from API on mount
  useEffect(() => {
    async function fetchModerators() {
      try {
        const response = await fetch('/api/moderators');
        if (response.ok) {
          const data = await response.json();
          setModerators(data);
        }
      } catch (error) {
        console.error('[SubVault] Failed to fetch moderators:', error);
      } finally {
        setIsLoadingMods(false);
      }
    }
    void fetchModerators();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const label = selectedMod ?? 'All Moderators';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`
          inline-flex items-center gap-2 px-3 h-9 rounded-md border text-sm font-medium
          transition-colors shadow-xs whitespace-nowrap
          ${selectedMod
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
            : 'bg-background border-input text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50'
          }
        `}
      >
        {selectedMod ? (
          <User className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Users className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="max-w-36 truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 min-w-48 w-max max-w-64 rounded-md border border-border bg-popover text-popover-foreground shadow-md overflow-hidden">
          {/* All moderators option */}
          <button
            onClick={() => {
              onSelectMod(null);
              setOpen(false);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              {!selectedMod && <Check className="h-3.5 w-3.5 text-primary" />}
            </span>
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">All Moderators</span>
            <span className="ml-auto text-xs text-muted-foreground">{snapshots.length}</span>
          </button>

          {isLoadingMods ? (
            <div className="flex items-center justify-center px-3 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : moderators.length > 0 ? (
            <div className="border-t border-border">
              {moderators.map((mod) => {
                const count = snapshots.filter((s) => s.author === mod.username).length;
                const isSelected = selectedMod === mod.username;
                return (
                  <button
                    key={mod.username}
                    onClick={() => {
                      onSelectMod(mod.username);
                      setOpen(false);
                    }}
                    className={`
                      flex items-center gap-2.5 w-full px-3 py-2 text-sm
                      hover:bg-accent hover:text-accent-foreground transition-colors
                      ${isSelected ? 'bg-accent/50' : ''}
                    `}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    {/* Avatar initial */}
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground uppercase">
                      {mod.username.charAt(0)}
                    </span>
                    <span className="truncate">{mod.username}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-xs text-center text-muted-foreground">
              No moderators found
            </div>
          )}
        </div>
      )}
    </div>
  );
}