'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Hash, ImageIcon, Loader2, Lock, Pin, Settings2, UserPlus, Users, X } from 'lucide-react';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ChatAttachment, ChatChannel } from '@/types';

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
  isExtra?: boolean;
}

interface AddableUser {
  uid: string;
  name: string;
  role: string;
}

interface ChannelMedia {
  messageId: string;
  attachment: ChatAttachment;
  authorName: string;
  createdAt: string | null;
}

interface ChannelPin {
  messageId: string;
  text: string;
  attachment: ChatAttachment | null;
  authorName: string;
  createdAt: string | null;
  pinnedAt: string | null;
}

interface ChannelInfoSheetProps {
  channel?: ChatChannel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  // Shared verified-token fetch from the chat page (same one used for messages).
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  // Opens the shared full-screen image viewer (owned by the chat page).
  onOpenImage: (image: LightboxImage) => void;
  // True while that viewer is open. The sheet is a modal Radix Dialog whose own
  // Escape/pointer-outside dismissal would otherwise close it underneath the
  // (portaled) lightbox; these let us suppress the sheet's dismissal at its
  // source so only the lightbox closes first.
  lightboxOpen: boolean;
}

/** Short "Jul 1, 3:04 PM" caption for a media tile's lightbox. */
function formatMediaTime(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  onOpenImage,
  lightboxOpen,
}: ChannelInfoSheetProps) {
  const [members, setMembers] = useState<ChannelMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Admin-only add-people state. `addable` arrives on the members response only when
  // the caller is an admin; `mutatingUid` disables the row being added/removed.
  const [addable, setAddable] = useState<AddableUser[]>([]);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [mutatingUid, setMutatingUid] = useState<string | null>(null);
  // Kept separate from `error` (which owns the member-list state) so a failed add/remove
  // surfaces near the button without blanking the member list.
  const [actionError, setActionError] = useState('');
  // Members | Pinned | Media segmented view. Pinned + Media are each fetched lazily
  // the first time they're shown for a channel (their *Loaded flag gates the fetch).
  const [tab, setTab] = useState<'members' | 'pinned' | 'media'>('members');
  const [media, setMedia] = useState<ChannelMedia[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const [pins, setPins] = useState<ChannelPin[]>([]);
  const [pinsLoading, setPinsLoading] = useState(false);
  const [pinsError, setPinsError] = useState('');
  const [pinsLoaded, setPinsLoaded] = useState(false);

  const channelId = channel?.id;

  // Shared member fetch — used by the lazy-load effect and re-run after every add/remove
  // mutation so the list (and the admin-only addable pick-list) stays authoritative.
  const loadMembers = useCallback(
    async (isCancelled?: () => boolean) => {
      if (!channelId) return;
      setLoading(true);
      setError('');
      try {
        const response = await authedFetch(`/api/portal/chat/channels/${channelId}/members`);
        const json = await response.json();
        if (isCancelled?.()) return;
        if (!response.ok) throw new Error(json.error || 'Failed to load members');
        setMembers(Array.isArray(json.members) ? json.members : []);
        setAddable(Array.isArray(json.addable) ? json.addable : []);
      } catch (err) {
        if (isCancelled?.()) return;
        setError(err instanceof Error ? err.message : 'Failed to load members');
      } finally {
        if (!isCancelled?.()) setLoading(false);
      }
    },
    [authedFetch, channelId]
  );

  // Lazy load: only fetch while open and for a known channel. Re-runs when the
  // opened channel changes so switching channels never shows stale members.
  useEffect(() => {
    if (!open || !channelId) return;
    let cancelled = false;
    setMembers([]);
    setAddable([]);
    void loadMembers(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [open, channelId, loadMembers]);

  // Reset the view + media cache whenever the sheet opens or the channel changes
  // so a freshly-opened sheet always starts on Members with no stale gallery.
  useEffect(() => {
    setTab('members');
    setMedia([]);
    setMediaError('');
    setMediaLoaded(false);
    setPins([]);
    setPinsError('');
    setPinsLoaded(false);
    setShowAddPeople(false);
    setActionError('');
  }, [channelId, open]);

  // Add a user to this channel's extra members, then refetch to reflect the change.
  const addMember = async (uid: string) => {
    if (!channelId) return;
    setMutatingUid(uid);
    setActionError('');
    try {
      const response = await authedFetch(
        `/api/portal/chat/channels/${channelId}/members/manage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        }
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to add member');
      }
      await loadMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setMutatingUid(null);
    }
  };

  // Remove a manually-added member (plain confirm), then refetch.
  const removeMember = async (uid: string, name: string) => {
    if (!channelId) return;
    if (!window.confirm(`Remove ${name} from this channel?`)) return;
    setMutatingUid(uid);
    setActionError('');
    try {
      const response = await authedFetch(
        `/api/portal/chat/channels/${channelId}/members/manage`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        }
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to remove member');
      }
      await loadMembers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setMutatingUid(null);
    }
  };

  // Lazy-fetch the media gallery the first time the Media tab is shown.
  useEffect(() => {
    if (!open || !channelId || tab !== 'media' || mediaLoaded) return;
    let cancelled = false;
    const load = async () => {
      setMediaLoading(true);
      setMediaError('');
      try {
        const response = await authedFetch(`/api/portal/chat/channels/${channelId}/media`);
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load media');
        if (!cancelled) {
          setMedia(Array.isArray(json.media) ? json.media : []);
          setMediaLoaded(true);
        }
      } catch (err) {
        if (!cancelled) setMediaError(err instanceof Error ? err.message : 'Failed to load media');
      } finally {
        if (!cancelled) setMediaLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, channelId, tab, mediaLoaded, authedFetch]);

  // Lazy-fetch the pinned list the first time the Pinned tab is shown (mirrors Media).
  useEffect(() => {
    if (!open || !channelId || tab !== 'pinned' || pinsLoaded) return;
    let cancelled = false;
    const load = async () => {
      setPinsLoading(true);
      setPinsError('');
      try {
        const response = await authedFetch(
          `/api/portal/chat/messages/pin?channelId=${encodeURIComponent(channelId)}`
        );
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load pinned messages');
        if (!cancelled) {
          setPins(Array.isArray(json.pins) ? json.pins : []);
          setPinsLoaded(true);
        }
      } catch (err) {
        if (!cancelled) setPinsError(err instanceof Error ? err.message : 'Failed to load pinned messages');
      } finally {
        if (!cancelled) setPinsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, channelId, tab, pinsLoaded, authedFetch]);

  const isLocked = channel?.audience === 'managers';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="chat-line-info-sheet w-full gap-0 p-0 sm:max-w-md"
        onEscapeKeyDown={(event) => {
          // While the lightbox is up, let it consume Escape — don't close the sheet.
          if (lightboxOpen) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          // Clicks landing on the portaled lightbox must not dismiss the sheet.
          if ((event.target as Element)?.closest?.('[data-chat-lightbox]')) {
            event.preventDefault();
          }
        }}
      >
        <SheetHeader className="chat-line-info-header border-b border-slate-200 dark:border-border p-4 pr-14">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Back to chat"
              className="grid size-10 shrink-0 place-items-center rounded-md text-slate-600 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-muted -ml-2"
            >
              <ChevronLeft className="size-6" />
            </button>
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
          {/* Members | Pinned | Media segmented control (house-style track + raised
              active segment; lime is reserved for primary actions, so the active tab
              stays neutral). */}
          <div className="px-4 pt-3 pb-1">
            <div className="chat-line-info-tabs grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-muted/60">
              {(['members', 'pinned', 'media'] as const).map((key) => {
                const isActive = tab === key;
                const Icon = key === 'members' ? Users : key === 'pinned' ? Pin : ImageIcon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    aria-pressed={isActive}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                      isActive
                        ? 'bg-white text-slate-950 shadow-sm dark:bg-card dark:text-foreground'
                        : 'text-slate-500 hover:text-slate-800 dark:text-muted-foreground dark:hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4" />
                    {key}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === 'members' ? (
            <>
              <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-muted-foreground">
                <Users className="size-4" />
                {loading ? 'Members' : `${members.length} member${members.length === 1 ? '' : 's'}`}
              </div>

              {/* Admin-only: add people. Toggles an inline pick-list of active users not
                  already in the channel. Non-admins never see this (isAdmin gate). */}
              {isAdmin && (
                <div className="px-4 pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddPeople((v) => !v)}
                    aria-expanded={showAddPeople}
                    className="w-full justify-center border-slate-200 dark:border-border"
                  >
                    <UserPlus className="size-4" />
                    Add people
                  </Button>

                  {actionError && (
                    <p className="mt-2 text-center text-xs text-red-600 dark:text-red-400">{actionError}</p>
                  )}

                  {showAddPeople && (
                    <div className="mt-2 rounded-lg border border-slate-200 dark:border-border">
                      {addable.length === 0 ? (
                        <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                          {loading ? 'Loading…' : 'Everyone is already here.'}
                        </p>
                      ) : (
                        <ul className="max-h-56 space-y-0.5 overflow-auto p-1">
                          {addable.map((person) => (
                            <li
                              key={person.uid}
                              className="flex items-center gap-3 rounded-md px-2 py-1.5"
                            >
                              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#0A1F44]/10 text-xs font-semibold text-[#0A1F44] dark:bg-white/10 dark:text-white">
                                {chatInitials(person.name)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-950 dark:text-foreground">
                                {person.name}
                              </span>
                              {person.role && (
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  {person.role}
                                </Badge>
                              )}
                              <button
                                type="button"
                                onClick={() => void addMember(person.uid)}
                                disabled={mutatingUid !== null}
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#8dc63f] px-3 py-1 text-xs font-semibold text-[#0A1F44] transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f] disabled:opacity-50"
                              >
                                {mutatingUid === person.uid ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  'Add'
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}

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
                        {member.isExtra && (
                          <Badge
                            variant="outline"
                            className="shrink-0 border-[#8dc63f]/50 text-[10px] text-[#4f7a12] dark:text-[#a5d65e]"
                          >
                            Added
                          </Badge>
                        )}
                        {member.role && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {member.role}
                          </Badge>
                        )}
                        {isAdmin && member.isExtra && (
                          <button
                            type="button"
                            onClick={() => void removeMember(member.uid, member.name)}
                            disabled={mutatingUid !== null}
                            aria-label={`Remove ${member.name}`}
                            className="grid size-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f] disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                          >
                            {mutatingUid === member.uid ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <X className="size-3.5" />
                            )}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : tab === 'pinned' ? (
            <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
              {pinsLoading ? (
                <ul className="space-y-1" aria-hidden="true">
                  {[0, 1, 2].map((row) => (
                    <li key={row} className="flex items-center gap-3 px-2 py-2">
                      <span className="size-8 shrink-0 animate-pulse rounded bg-slate-200 dark:bg-muted" />
                      <span className="h-3.5 w-40 animate-pulse rounded bg-slate-200 dark:bg-muted" />
                    </li>
                  ))}
                </ul>
              ) : pinsError ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  {pinsError}
                </p>
              ) : pins.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  No pinned messages yet.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {pins.map((pin) => {
                    const snippet = pin.text
                      ? pin.text
                      : pin.attachment
                        ? pin.attachment.type === 'gif'
                          ? 'GIF'
                          : 'Photo'
                        : '';
                    const isImage = pin.attachment?.type === 'image' || pin.attachment?.type === 'gif';
                    const openImage = () => {
                      if (!pin.attachment) return;
                      onOpenImage({
                        url: pin.attachment.url,
                        author: pin.authorName,
                        time: formatMediaTime(pin.createdAt),
                      });
                    };
                    const rowInner = (
                      <>
                        {pin.attachment && isImage ? (
                          <span className="size-9 shrink-0 overflow-hidden rounded bg-[#0A1F44]/5 ring-1 ring-slate-200 dark:bg-white/5 dark:ring-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pin.attachment.url}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          </span>
                        ) : (
                          <span className="grid size-9 shrink-0 place-items-center rounded text-slate-400 dark:text-muted-foreground">
                            <Pin className="size-4" />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-slate-950 dark:text-foreground">
                            {pin.authorName}
                          </span>
                          <span className="block truncate text-xs text-slate-500 dark:text-muted-foreground">
                            {snippet}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-muted-foreground">
                          {formatMediaTime(pin.pinnedAt)}
                        </span>
                      </>
                    );
                    return (
                      <li key={pin.messageId}>
                        {pin.attachment && isImage ? (
                          <button
                            type="button"
                            onClick={openImage}
                            aria-label={`Pinned photo from ${pin.authorName}`}
                            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f] dark:hover:bg-muted/60"
                          >
                            {rowInner}
                          </button>
                        ) : (
                          <div className="flex items-center gap-3 rounded-md px-2 py-2">
                            {rowInner}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
              {mediaLoading ? (
                <div className="grid grid-cols-3 gap-2" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5].map((cell) => (
                    <span
                      key={cell}
                      className="aspect-square animate-pulse rounded-md bg-slate-200 dark:bg-muted"
                    />
                  ))}
                </div>
              ) : mediaError ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  {mediaError}
                </p>
              ) : media.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500 dark:text-muted-foreground">
                  No photos yet.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {media.map((item) => (
                    <button
                      key={item.messageId}
                      type="button"
                      onClick={() =>
                        onOpenImage({
                          url: item.attachment.url,
                          author: item.authorName,
                          time: formatMediaTime(item.createdAt),
                        })
                      }
                      aria-label={`Photo from ${item.authorName}`}
                      className="aspect-square overflow-hidden rounded-md bg-[#0A1F44]/5 ring-1 ring-slate-200 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f] dark:bg-white/5 dark:ring-border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.attachment.url}
                        alt={`Shared by ${item.authorName}`}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
