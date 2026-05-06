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
    <Card className="p-6 bg-card border border-border">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground/70 mt-1">{subtitle}</p>}
        </div>
        <Icon className="h-8 w-8 text-primary opacity-80" />
      </div>
    </Card>
  );
}
