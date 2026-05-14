import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from './ui/badge';

type Props = {
  isModerator?: boolean | undefined;
  isVerified?: boolean | null;
  loading?: boolean;
};

export function UserStatusBadge({ isModerator, isVerified, loading }: Props) {
  // Priority: Moderator > Verified > Not verified
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
        <ShieldAlert className="h-3.5 w-3.5" /> Moderator
      </Badge>
    );
  }

  if (isVerified) {
    return (
      <Badge className="bg-green-400/20 text-green-100" variant="default" aria-label="Verified user">
        <ShieldCheck className="h-3.5 w-3.5" /> Verified
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-400/20 text-red-100" variant="default" aria-label="Restricted user">
      <ShieldAlert className="h-3.5 w-3.5" /> Restricted
    </Badge>
  );
}
