import { LucideIcon } from 'lucide-react';
import { Card } from './ui/card';

interface StatsCardProps {
  icon: LucideIcon;
  title: string;
  value: string | number;
  subtitle?: string;
}

export function StatsCard({ icon: Icon, title, value, subtitle }: StatsCardProps) {
  return (
    <Card className="p-4 sm:p-6 bg-card border border-border">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground mt-2">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>}
        </div>
        <Icon className="h-6 w-6 sm:h-8 sm:w-8 text-primary opacity-80 flex-shrink-0" />
      </div>
    </Card>
  );
}
