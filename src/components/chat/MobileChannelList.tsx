'use client';

import { ChevronRight, Hash, Lock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ChatChannel } from '@/types';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

interface MobileChannelListProps {
  channels: ChatChannel[];
  loading: boolean;
  error?: string;
  // Per-channel unread flag (dot-style badge; no counts). Missing/false = read.
  unreadByChannel?: Record<string, boolean>;
  onOpenChannel: (channelId: string) => void;
}

/**
 * Phone list screen (Connecteam-style): no navy band — a compact title then
 * full-width tappable channel rows that push into the full-screen thread.
 * Bottom nav stays visible here. Desktop never renders this (lg:hidden owner).
 */
export function MobileChannelList({
  channels,
  loading,
  error,
  unreadByChannel,
  onOpenChannel,
}: MobileChannelListProps) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="portal-display text-xl font-bold tracking-tight text-slate-950 dark:text-foreground">
        Team Chat
      </h1>

      {error && (
        <Alert className="border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-4 text-sm text-slate-500 dark:text-muted-foreground">
          Loading channels...
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-4 text-sm text-slate-500 dark:text-muted-foreground">
          No live channels yet. Ask an admin to sync chat channels.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 dark:divide-border overflow-hidden rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => onOpenChannel(channel.id)}
              className="flex w-full items-center gap-3 p-4 text-left transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-muted dark:active:bg-muted/80"
            >
              {channel.audience === 'managers' ? (
                <Lock className="size-5 shrink-0 text-slate-500 dark:text-muted-foreground" />
              ) : (
                <Hash className="size-5 shrink-0 text-slate-500 dark:text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate text-slate-950 dark:text-foreground ${
                      unreadByChannel?.[channel.id] ? 'font-semibold' : 'font-medium'
                    }`}
                  >
                    {channel.name}
                  </span>
                  {unreadByChannel?.[channel.id] && (
                    <span
                      aria-label="Unread messages"
                      className="size-2 shrink-0 rounded-full bg-[#8dc63f] ring-2 ring-white dark:ring-[#0e2647]"
                    />
                  )}
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {audienceCopy[channel.audience]}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-muted-foreground">
                  {channel.description}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-slate-400 dark:text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
