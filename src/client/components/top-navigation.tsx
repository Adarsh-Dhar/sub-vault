
import { Plus, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ThemeToggle } from './theme-toggle';

interface TopNavigationProps {
  onCreateSnapshot: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export function TopNavigation({ onCreateSnapshot, searchQuery = '', onSearchChange }: TopNavigationProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between mb-6">
      <div className="flex-1 relative min-w-0">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Search snapshots..."
          value={searchQuery}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="pl-10 w-full text-sm sm:text-base"
        />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <ThemeToggle />
        <Button
          onClick={onCreateSnapshot}
          className="bg-primary hover:bg-primary/90 text-primary-foreground flex items-center gap-2 text-sm sm:text-base h-10 sm:h-auto whitespace-nowrap"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Create Snapshot</span>
          <span className="sm:hidden">Create</span>
        </Button>
      </div>
    </div>
  );
}
