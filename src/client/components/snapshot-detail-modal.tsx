'use client';

import { useState } from 'react';
import { SnapshotDetail, CommunitySnapshotData, Rule, Widget } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';

interface SnapshotDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: SnapshotDetail | null;
}

export function SnapshotDetailModal({ isOpen, onClose, snapshot }: SnapshotDetailModalProps) {
  const [activeTab, setActiveTab] = useState('identity');

  if (!snapshot || !snapshot.data) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Snapshot Details</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-center text-muted-foreground">
            No data available for this snapshot
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const data = snapshot.data as CommunitySnapshotData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{snapshot.message}</DialogTitle>
          <DialogDescription>
            {snapshot.author} • {formatDistanceToNow(new Date(snapshot.timestamp), { addSuffix: true })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-hidden">
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full px-6"
          >
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-4">
              <TabsTrigger value="identity" className="text-xs">Identity</TabsTrigger>
              <TabsTrigger value="settings" className="text-xs">Settings</TabsTrigger>
              <TabsTrigger value="rules" className="text-xs">Rules</TabsTrigger>
              <TabsTrigger value="flairs" className="text-xs">Flairs</TabsTrigger>
              <TabsTrigger value="widgets" className="text-xs">Widgets</TabsTrigger>
              <TabsTrigger value="users" className="text-xs">Users</TabsTrigger>
              <TabsTrigger value="automod" className="text-xs">Automod</TabsTrigger>
              <TabsTrigger value="limits" className="text-xs">Limits</TabsTrigger>
            </TabsList>

            {/* Identity Tab */}
            <TabsContent value="identity" className="mt-4 pb-6">
              <IdentityTab data={data} />
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="mt-4 pb-6">
              <SettingsTab data={data} />
            </TabsContent>

            {/* Rules Tab */}
            <TabsContent value="rules" className="mt-4 pb-6">
              <RulesTab data={data} />
            </TabsContent>

            {/* Flairs Tab */}
            <TabsContent value="flairs" className="mt-4 pb-6">
              <FlairsTab data={data} />
            </TabsContent>

            {/* Widgets Tab */}
            <TabsContent value="widgets" className="mt-4 pb-6">
              <WidgetsTab data={data} />
            </TabsContent>

            {/* User Management Tab */}
            <TabsContent value="users" className="mt-4 pb-6">
              <UserManagementTab data={data} />
            </TabsContent>

            {/* Automoderator Tab */}
            <TabsContent value="automod" className="mt-4 pb-6">
              <AutomodTab data={data} />
            </TabsContent>

            {/* Limitations Tab */}
            <TabsContent value="limits" className="mt-4 pb-6">
              <LimitationsTab data={data} />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function IdentityTab({ data }: { data: CommunitySnapshotData }) {
  const identity = data.identity;
  if (!identity) {
    return <div className="text-sm text-muted-foreground">No identity data available</div>;
  }

  return (
    <div className="space-y-4 pr-4">
      <div className="grid grid-cols-2 gap-4">
        <DetailField label="Display Name" value={identity.displayName} />
        <DetailField label="Type" value={identity.subredditType} />
        <DetailField label="Subscribers" value={identity.subscribers.toLocaleString()} />
        <DetailField label="Language" value={identity.lang} />
        <DetailField label="NSFW" value={identity.nsfw ? 'Yes' : 'No'} />
        <DetailField label="Created" value={new Date(identity.createdAt).toLocaleDateString()} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Title</label>
        <div className="p-2 bg-muted rounded text-sm text-foreground line-clamp-2">{identity.title}</div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <div className="p-2 bg-muted rounded text-sm text-foreground max-h-20 overflow-auto line-clamp-4">{identity.description}</div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Public Description</label>
        <div className="p-2 bg-muted rounded text-sm text-foreground max-h-20 overflow-auto line-clamp-4">{identity.publicDescription}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Appearance</label>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Images:</span>
              <Badge variant={identity.allowImages ? 'default' : 'secondary'}>
                {identity.allowImages ? 'Allowed' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Videos:</span>
              <Badge variant={identity.allowVideos ? 'default' : 'secondary'}>
                {identity.allowVideos ? 'Allowed' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Galleries:</span>
              <Badge variant={identity.allowGalleries ? 'default' : 'secondary'}>
                {identity.allowGalleries ? 'Allowed' : 'Disabled'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Polls:</span>
              <Badge variant={identity.allowPolls ? 'default' : 'secondary'}>
                {identity.allowPolls ? 'Allowed' : 'Disabled'}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ data }: { data: CommunitySnapshotData }) {
  const settings = data.settings;
  if (!settings) {
    return <div className="text-sm text-muted-foreground pr-4">No settings data available</div>;
  }

  return (
    <div className="pr-4">
      <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-96 text-foreground">
        {JSON.stringify(settings, null, 2)}
      </pre>
    </div>
  );
}

function RulesTab({ data }: { data: CommunitySnapshotData }) {
  const rules = Array.isArray(data.rules) ? data.rules : [];

  if (rules.length === 0) {
    return <div className="text-sm text-muted-foreground pr-4">No rules configured</div>;
  }

  return (
    <div className="space-y-3 pr-4">
      {rules.map((rule: Rule, idx: number) => (
        <Card key={idx} className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {(rule.priority ?? idx + 1)}. {(rule.name ?? 'Unnamed Rule')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{rule.description ?? ''}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FlairsTab({ data }: { data: CommunitySnapshotData }) {
  const postFlairs = data.flairs?.post ?? [];
  const userFlairs = data.flairs?.user ?? [];

  return (
    <div className="space-y-6 pr-4">
      <div>
        <h4 className="text-sm font-semibold mb-3">Post Flairs ({postFlairs.length})</h4>
        {postFlairs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No post flairs configured</div>
        ) : (
          <div className="space-y-2">
            {postFlairs.map((flair, idx) => (
              <FlairBadge key={idx} flair={flair as Record<string, unknown>} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-3">User Flairs ({userFlairs.length})</h4>
        {userFlairs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No user flairs configured</div>
        ) : (
          <div className="space-y-2">
            {userFlairs.map((flair, idx) => (
              <FlairBadge key={idx} flair={flair as Record<string, unknown>} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FlairBadge({ flair }: { flair: Record<string, unknown> }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
      <span className="text-foreground">{(flair.text as string) || 'Unnamed'}</span>
      {(flair.modOnly as boolean) && <Badge variant="secondary" className="text-xs">Mod Only</Badge>}
      {(flair.textEditable as boolean) && <Badge variant="secondary" className="text-xs">User Editable</Badge>}
    </div>
  );
}

function WidgetsTab({ data }: { data: CommunitySnapshotData }) {
  const widgets = Array.isArray(data.widgets) ? data.widgets : [];

  if (widgets.length === 0) {
    return <div className="text-sm text-muted-foreground pr-4">No widgets configured</div>;
  }

  return (
    <div className="space-y-2 pr-4">
            {widgets.map((widget: Widget, idx: number) => (
        <Card key={idx} className="bg-card">
          <CardContent className="pt-6">
            <div className="text-sm">
              <DetailField label="Name" value={(widget.name as string) || 'Unnamed'} />
              <DetailField label="Type" value={(widget.type as string) || 'Unknown'} />
              <DetailField label="ID" value={(widget.id as string) || 'N/A'} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UserManagementTab({ data }: { data: CommunitySnapshotData }) {
  const um = data.userManagement ?? { banned: [], muted: [], approved: [], moderators: [] };
  const banned = Array.isArray(um.banned) ? um.banned : [];
  const muted = Array.isArray(um.muted) ? um.muted : [];
  const approved = Array.isArray(um.approved) ? um.approved : [];
  const moderators = Array.isArray(um.moderators) ? um.moderators : [];

  return (
    <div className="space-y-6 pr-4">
      <UserList title="Banned Users" users={banned as Record<string, unknown>[]} count={banned.length} />
      <UserList title="Muted Users" users={muted as Record<string, unknown>[]} count={muted.length} />
      <UserList title="Approved Users" users={approved as Record<string, unknown>[]} count={approved.length} />
      <ModeratorsTable moderators={moderators as Record<string, unknown>[]} count={moderators.length} />
    </div>
  );
}

function UserList({ title, users, count }: { title: string; users: Record<string, unknown>[]; count: number }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">{title} ({count})</h4>
      {count === 0 ? (
        <div className="text-sm text-muted-foreground">No {title.toLowerCase()}</div>
      ) : (
        <div className="space-y-1 max-h-40 overflow-auto">
          {users.map((user, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
              <span className="text-foreground font-mono">{(user.username as string) || 'Unknown'}</span>
              {(user.note as string) && (
                <span className="text-xs text-muted-foreground truncate ml-2">
                  {(user.note as string).slice(0, 30)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeratorsTable({ moderators, count }: { moderators: Record<string, unknown>[]; count: number }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">Moderators ({count})</h4>
      {count === 0 ? (
        <div className="text-sm text-muted-foreground">No moderators</div>
      ) : (
        <div className="space-y-1 max-h-40 overflow-auto">
          {moderators.map((mod, idx) => (
            <div key={idx} className="p-2 bg-muted rounded text-sm">
              <div className="font-mono text-foreground">{(mod.username as string) || 'Unknown'}</div>
              {Array.isArray(mod.permissions) && mod.permissions.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {(mod.permissions as string[]).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AutomodTab({ data }: { data: CommunitySnapshotData }) {
  const automod = data.automoderator;

  if (!automod || automod === 'Not configured') {
    return <div className="text-sm text-muted-foreground pr-4">Automoderator not configured</div>;
  }

  return (
    <div className="pr-4">
      <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-96 text-foreground whitespace-pre-wrap wrap-break-word">
        {automod}
      </pre>
    </div>
  );
}

function LimitationsTab({ data }: { data: CommunitySnapshotData }) {
  const limits = data.limitations;

  return (
    <div className="space-y-3 pr-4">
      {Object.entries(limits).map(([key, value]) => (
        <Card key={key} className="bg-card">
          <CardContent className="pt-6">
            <div className="space-y-1">
              <h4 className="text-sm font-semibold capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </h4>
              <p className="text-sm text-muted-foreground">{value as string}</p>
            </div>
          </CardContent>
        </Card>
      ))}
      <div className="p-4 bg-amber-500/10 rounded border border-amber-200 dark:border-amber-800 text-sm text-amber-700 dark:text-amber-400">
        Some community data points are not available through the Devvit API. For comprehensive backups, consider additional manual exports.
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs font-medium text-muted-foreground shrink-0">{label}:</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
