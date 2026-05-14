import { Badge } from './ui/badge';
import type { RankLevel } from '../../shared/rank-types';
import { LEVEL_NAMES, LEVEL_BADGES } from '../../shared/rank-types';

type Props = {
  isModerator?: boolean | undefined;
  level?: RankLevel | null;
  loading?: boolean;
};

const LEVEL_COLORS: Record<number, string> = {
  0: 'bg-slate-400/20 text-slate-100',      // Newcomer
  1: 'bg-green-400/20 text-green-100',       // Verified
  2: 'bg-cyan-400/20 text-cyan-100',         // Silver
  3: 'bg-yellow-400/20 text-yellow-100',     // Gold
  4: 'bg-purple-400/20 text-purple-100',     // Platinum
};

export function UserStatusBadge({ isModerator, level = 0, loading }: Props) {
  // Priority: Moderator > Rank
  if (loading) {
    return (
      <Badge className="opacity-80" variant="default" aria-live="polite">
        <span className="animate-pulse">Checking…</span>
      </Badge>
    );
  }

  if (isModerator) {
    return (
      <Badge className="bg-amber-400/20 text-amber-100" variant="default" aria-label="Moderator">
        👑 Moderator
      </Badge>
    );
  }

  const rankLevel = (level ?? 0) as RankLevel;
  const badge = LEVEL_BADGES[rankLevel];
  const name = LEVEL_NAMES[rankLevel];
  const colorClass = LEVEL_COLORS[rankLevel];

  return (
    <Badge className={colorClass} variant="default" aria-label={`${name} rank`}>
      {badge} {name}
    </Badge>
  );
}
