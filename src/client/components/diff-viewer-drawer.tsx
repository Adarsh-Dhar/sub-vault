"use client";
import { useEffect, useState } from "react";
import {
  X, Plus, Minus, AlertCircle, GitCommit,
  Eye, EyeOff, ChevronRight, Loader2
} from "lucide-react";
import { Button } from "./ui/button";
import type { CommitSnapshot } from "../lib/types";
import { computeSnapshotDiff, SnapshotDiff } from "../../shared/snapshot-diff";

// ─── Types ────────────────────────────────────────────────────────────────────

type SnapEntry = {
  id: string;
  message: string;
  createdAt: string;
  data: Record<string, unknown>;
};

type RawPayload = {
  current: SnapEntry | null;
  previous: SnapEntry | null;
};

// ─── Main component ───────────────────────────────────────────────────────────

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
  const [payload, setPayload] = useState<RawPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!isOpen || !snapshot) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setDiffs(null);
      setPayload(null);
      setShowPreview(false);

      try {
        const res = await fetch(`/api/snapshot/${snapshot?.id}/diff`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const raw: RawPayload = await res.json();
        if (cancelled) return;

        setPayload(raw);
        const computed = computeSnapshotDiff(
          raw.previous?.data ?? null,
          raw.current?.data ?? null
        );
        setDiffs(computed);
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [isOpen, snapshot]);

  if (!isOpen || !snapshot) return null;

  const totalAdditions = diffs?.reduce((s, d) => s + d.additions, 0) ?? 0;
  const totalDeletions = diffs?.reduce((s, d) => s + d.deletions, 0) ?? 0;
  const hasPrevious = !!payload?.previous;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-background border-l border-border shadow-2xl flex flex-col">

        {/* ── Header ── */}
        <div className="border-b border-border px-5 py-4 bg-card shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1.5">
                <GitCommit className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs font-mono text-muted-foreground">{snapshot.hash}</span>
              </div>
              <h2 className="text-sm font-semibold text-foreground leading-snug pr-2">
                {snapshot.message}
              </h2>
              {diffs && diffs.length > 0 && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <Plus className="h-2.5 w-2.5" />{totalAdditions} added
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                    <Minus className="h-2.5 w-2.5" />{totalDeletions} removed
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {diffs.length} section{diffs.length !== 1 ? "s" : ""} changed
                  </span>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 hover:bg-muted h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Action row — read-only now */}
          {!loading && !error && hasPrevious && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(v => !v)}
                className="flex items-center gap-1.5 text-xs h-8"
              >
                {showPreview
                  ? <EyeOff className="h-3.5 w-3.5" />
                  : <Eye className="h-3.5 w-3.5" />}
                {showPreview ? "Hide Previous State" : "Preview Previous State"}
              </Button>
            </div>
          )}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-auto">

          {/* Previous state preview panel */}
          {showPreview && payload?.previous && (
            <div className="border-b border-border bg-amber-50/60 dark:bg-amber-950/10 px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                  Previous State
                </p>
                <span className="text-xs text-muted-foreground truncate">— {payload.previous.message}</span>
              </div>
              <PreviousStatePreview data={payload.previous.data} />
            </div>
          )}

          <div className="p-5 space-y-3">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Comparing snapshots…</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to load diff</p>
                  <p className="text-xs text-red-500/70 mt-0.5">{error}</p>
                </div>
              </div>
            )}

            {/* No diffs */}
            {!loading && !error && diffs?.length === 0 && (
              <div className="flex flex-col items-center justify-center py-14 gap-2 text-center">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                  <GitCommit className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">No changes detected</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  This snapshot is identical to the one before it.
                </p>
              </div>
            )}

            {/* First snapshot — nothing to compare */}
            {!loading && !error && !hasPrevious && diffs !== null && (
              <div className="p-4 rounded-xl bg-muted/40 border border-border text-center">
                <p className="text-sm text-muted-foreground">
                  This is the first snapshot — no previous state to compare against.
                </p>
              </div>
            )}

            {/* Diff sections */}
            {!loading && !error && diffs && diffs.map((diff, idx) => (
              <SectionDiff key={idx} diff={diff} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section diff card ────────────────────────────────────────────────────────

function SectionDiff({ diff }: { diff: SnapshotDiff }) {
  const [expanded, setExpanded] = useState(true);
  const changes = parseChanges(diff.lines);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-foreground">{diff.section}</span>
          <div className="flex items-center gap-1">
            {diff.additions > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                <Plus className="h-2.5 w-2.5" />{diff.additions}
              </span>
            )}
            {diff.deletions > 0 && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                <Minus className="h-2.5 w-2.5" />{diff.deletions}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-150 ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {changes.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground italic">Unable to parse structured changes.</p>
          ) : (
            changes.map((c, i) => <ChangeEntry key={i} change={c} />)
          )}
        </div>
      )}
    </div>
  );
}

// ─── Change entry ─────────────────────────────────────────────────────────────

type Change =
  | { type: "modified"; field: string; before: string; after: string }
  | { type: "added";    label: string; value: string }
  | { type: "removed";  label: string; value: string };

function ChangeEntry({ change }: { change: Change }) {
  if (change.type === "modified") {
    return (
      <div className="px-4 py-3.5 space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          {change.field}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg px-3 py-2.5 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
            <p className="text-[10px] font-bold text-red-400 dark:text-red-500 mb-1 uppercase tracking-wider">Before</p>
            <p className="text-sm text-red-800 dark:text-red-300 wrap-break-word leading-relaxed">{change.before}</p>
          </div>
          <div className="rounded-lg px-3 py-2.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
            <p className="text-[10px] font-bold text-emerald-500 dark:text-emerald-400 mb-1 uppercase tracking-wider">After</p>
            <p className="text-sm text-emerald-800 dark:text-emerald-300 wrap-break-word leading-relaxed">{change.after}</p>
          </div>
        </div>
      </div>
    );
  }

  if (change.type === "added") {
    return (
      <div className="px-4 py-3 flex items-start gap-3 bg-emerald-50/40 dark:bg-emerald-950/10">
        <span className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center">
          <Plus className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />
        </span>
        <div className="min-w-0">
          {change.label && (
            <p className="text-[10px] font-semibold text-emerald-600/70 dark:text-emerald-500 uppercase tracking-wider mb-0.5">{change.label}</p>
          )}
          <p className="text-sm text-emerald-800 dark:text-emerald-300 wrap-break-word leading-relaxed">{change.value}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex items-start gap-3 bg-red-50/40 dark:bg-red-950/10">
      <span className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-red-100 dark:bg-red-900/60 flex items-center justify-center">
        <Minus className="h-2.5 w-2.5 text-red-500 dark:text-red-400" />
      </span>
      <div className="min-w-0">
        {change.label && (
          <p className="text-[10px] font-semibold text-red-500/70 uppercase tracking-wider mb-0.5">{change.label}</p>
        )}
        <p className="text-sm text-red-800/70 dark:text-red-400/70 wrap-break-word leading-relaxed line-through">{change.value}</p>
      </div>
    </div>
  );
}

// ─── Previous state preview ───────────────────────────────────────────────────

const PREVIEW_SECTIONS: Array<{
  key: string;
  label: string;
  render: (v: unknown) => string | null;
}> = [
  {
    key: "identity",
    label: "Community",
    render: (v) => {
      if (!v || typeof v !== "object") return null;
      const id = v as Record<string, unknown>;
      const parts: string[] = [];
      if (id.displayName) parts.push(`Name: ${id.displayName}`);
      if (id.title) parts.push(`Title: ${id.title}`);
      if (id.subscribers != null) parts.push(`Subscribers: ${Number(id.subscribers).toLocaleString()}`);
      if (id.subredditType) parts.push(`Type: ${id.subredditType}`);
      if (typeof id.nsfw === "boolean") parts.push(`NSFW: ${id.nsfw ? "Yes" : "No"}`);
      return parts.join("  ·  ") || null;
    },
  },
  {
    key: "rules",
    label: "Rules",
    render: (v) => {
      if (!Array.isArray(v) || v.length === 0) return "No rules";
      return v.map((r, i) => `${i + 1}. ${r.name ?? r.shortName ?? "Rule"}`).join("  ·  ");
    },
  },
  {
    key: "automoderator",
    label: "AutoModerator",
    render: (v) => {
      if (!v || v === "Not configured") return "Not configured";
      return `${String(v).split("\n").length} lines configured`;
    },
  },
  {
    key: "flairs",
    label: "Flairs",
    render: (v) => {
      if (!v || typeof v !== "object") return null;
      const f = v as Record<string, unknown[]>;
      const post = Array.isArray(f.post) ? f.post.length : 0;
      const user = Array.isArray(f.user) ? f.user.length : 0;
      return `${post} post flairs  ·  ${user} user flairs`;
    },
  },
  {
    key: "userManagement",
    label: "Users",
    render: (v) => {
      if (!v || typeof v !== "object") return null;
      const um = v as Record<string, unknown[]>;
      const parts: string[] = [];
      if (Array.isArray(um.moderators) && um.moderators.length) parts.push(`${um.moderators.length} mods`);
      if (Array.isArray(um.banned) && um.banned.length) parts.push(`${um.banned.length} banned`);
      if (Array.isArray(um.muted) && um.muted.length) parts.push(`${um.muted.length} muted`);
      return parts.join("  ·  ") || "No user data";
    },
  },
];

function PreviousStatePreview({ data }: { data: Record<string, unknown> }) {
  const rows = PREVIEW_SECTIONS
    .map(s => ({ label: s.label, value: s.render(data[s.key]) }))
    .filter(r => r.value !== null);

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No readable data in previous snapshot.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-start gap-3 text-xs">
          <span className="font-semibold text-amber-700 dark:text-amber-400 shrink-0 w-24">{label}</span>
          <span className="text-foreground/80 leading-relaxed">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Diff line parser ─────────────────────────────────────────────────────────

function parseChanges(lines: SnapshotDiff["lines"]): Change[] {
  const removed = lines.filter(l => l.kind === "removed").map(l => l.text.trim()).filter(Boolean);
  const added   = lines.filter(l => l.kind === "added").map(l => l.text.trim()).filter(Boolean);

  const KV   = /^"([^"]+)":\s*(.+?),?$/;
  const SKIP = new Set(["{", "}", "[", "]", "..."]);

  const removedMap = new Map<string, string>();
  for (const line of removed) {
    const m = line.match(KV);
    if (m) removedMap.set(m[1]!, stripQ(m[2]!));
  }

  const changes: Change[] = [];
  const paired = new Set<string>();

  for (const line of added) {
    if (SKIP.has(line)) continue;
    const m = line.match(KV);
    if (m) {
      const key   = m[1]!;
      const after = stripQ(m[2]!);
      if (removedMap.has(key)) {
        const before = removedMap.get(key)!;
        if (before !== after) {
          changes.push({ type: "modified", field: humanize(key), before: fmtVal(before), after: fmtVal(after) });
        }
        paired.add(key);
      } else {
        changes.push({ type: "added", label: humanize(key), value: fmtVal(after) });
      }
    } else {
      changes.push({ type: "added", label: "", value: fmtLine(line) });
    }
  }

  for (const line of removed) {
    if (SKIP.has(line)) continue;
    const m = line.match(KV);
    if (m && paired.has(m[1]!)) continue;
    if (m) {
      changes.push({ type: "removed", label: humanize(m[1]!), value: fmtVal(stripQ(m[2]!)) });
    } else {
      changes.push({ type: "removed", label: "", value: fmtLine(line) });
    }
  }

  // Fallback
  if (changes.length === 0) {
    const b = removed.filter(l => !SKIP.has(l)).join("\n");
    const a = added.filter(l => !SKIP.has(l)).join("\n");
    if (b || a) changes.push({ type: "modified", field: "Content", before: b || "—", after: a || "—" });
  }

  return changes;
}

function stripQ(v: string): string {
  return v.replace(/^"|"$/g, "").replace(/,$/, "").trim();
}

function fmtVal(v: string): string {
  if (!v || v === "null") return "—";
  if (v === "true")  return "Yes";
  if (v === "false") return "No";
  return v.replace(/\\n/g, " ").replace(/\\"/g, '"').trim() || "—";
}

function fmtLine(line: string): string {
  const m = line.match(/^"[^"]+":\s*(.+?),?$/);
  return m ? fmtVal(stripQ(m[1]!)) : line;
}

function humanize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}