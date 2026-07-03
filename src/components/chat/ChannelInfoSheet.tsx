'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Hash, Lock, Settings2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ChatChannel } from '@/types';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

interface ChannelMember {
  uid: string;
  name: string;
  role: string;
}

interface ChannelInfoSheetProps {
  channel?: ChatChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  // Shared verified-token fetch from the chat page (same one used for messages).
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

/** First letters of first+last name words (mirrors chatInitials in MobileThread). */
function chatInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Channel-info Sheet (Connecteam-style): channel identity, audience, description,
 * member count and the full member list. Members are fetched lazily the first
 * time the sheet opens for a channel. Shared by the mobile thread top bar and the
 * desktop conversation header. Admins get a "Manage channels" shortcut.
 */
export function ChannelInfoSheet({
  channel,
  open,
  onOpenChange,
  isAdmin,
  authedFetch,
}: ChannelInfoSheetProps) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const channelId = channel?.id;

  // Lazy load: only fetch while open and for a known channel. Re-runs when the
  // opened channel changes so switching channels never shows stale members.
  useEffect(() => {
    if (!open || !channelId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      setMembers([]);
      try {
        const response = await authedFetch(`/api/portal/chat/channels/${channelId}/members`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load members');
        if (!cancelled) setMembers(Array.isArray(json.members) ? json.members : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load members');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, channelId, authedFetch]);

  const isLocked = channel?.audience === 'managers';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 dark:border-border p-4">
          <div className="flex items-center gap-2">
            {isLocked ? (
              <Lock className="size-5 shrink-0 text-slate-500 dark:text-muted-foreground" />
            ) : (
              <Hash className="size-5 shrink-0 text-slate-500 dark:text-muted-foreground" />
            )}
            <SheetTitle className="truncate text-lg text-slate-950 dark:text-foreground">
              {channel?.name ?? 'Channel'}
            </SheetTitle>
            {channel && (
              <Badge variant="secondary" className="shrink-0 text-[11px]">
                {audienceCopy[channel.audience]}
              </Badge>
            )}
          </div>
          {channel?.description ? (
            <SheetDescription className="text-slate-600 dark:text-muted-foreground">
              {channel.description}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">Channel details</SheetDescription>
          )}
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
            <Users className="size-4" />
            {loading ? 'Members' : `${members.length} member${members.length === 1 ? '' : 's'}`}
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {loading ? (
              <ul className="space-y-1" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((row) => (
                  <li key={row} className="flex items-center gap-3 px-2 py-2">
                    <span className="size-8 shrink-0 animate-pulse rounded-full bg-slate-200 dark:bg-muted" />
                    <span className="h-3.5 w-32 animate-pulse rounded bg-slate-200 dark:bg-muted" />
                  </li>
                ))}
              </ul>
            ) : error ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                {error}
              </p>
            ) : members.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                No members yet.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {members.map((member) => (
                  <li
                    key={member.uid}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-muted/60"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0A1F44]/10 text-xs font-semibold text-[#0A1F44] dark:bg-white/10 dark:text-white">
                      {chatInitials(member.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-950 dark:text-foreground">
                      {member.name}
                    </span>
                    {member.role && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {member.role}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isAdmin && (
            <div className="border-t border-slate-200 dark:border-border p-4">
              <Button
                asChild
                variant="outline"
                className="w-full border-slate-200 dark:border-border"
              >
                <Link href="/portal/admin/chat-channels" onClick={() => onOpenChange(false)}>
                  <Settings2 className="size-4" />
                  Manage channels
                </Link>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
