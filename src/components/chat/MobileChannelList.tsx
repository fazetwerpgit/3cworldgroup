'use client';

import type { CSSProperties } from 'react';
import { Lock, RotateCw, ShieldAlert, WifiOff } from 'lucide-react';
import { useFirstReveal } from '@/hooks/useFirstReveal';
import { useOnline } from '@/hooks/useOnline';
import type { ChatChannelDoc } from '@/hooks/chat/useChatChannels';
import { formatUnreadCount } from '@/hooks/chat/useChatUnreadCounts';
import s from '@/components/portal/rep/rep.module.css';
import c from './chat.module.css';

/** "9:14 AM" today, "Yesterday", a weekday inside the week, else "Sep 3". */
export function formatChannelTime(date: Date | null | undefined): string {
  if (!date) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfToday - startOfThat) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * The row's second line: "You: ..." / "Ana: ..." over the latest message, or the
 * channel description when there's no preview yet (or its author is blocked).
 */
export function channelPreview(
  channel: ChatChannelDoc,
  currentUserId?: string | null,
  blockedUids?: ReadonlySet<string>
): { who: string | null; text: string } | null {
  const last = channel.lastMessage;
  if (last && last.text && !blockedUids?.has(last.authorId)) {
    const firstName = last.authorName.trim().split(/\s+/)[0] ?? '';
    const who = currentUserId && last.authorId === currentUserId ? 'You' : firstName || null;
    return { who, text: last.text };
  }
  return channel.description ? { who: null, text: channel.description } : null;
}

interface ChannelRowsProps {
  channels: ChatChannelDoc[];
  loading: boolean;
  /** The channel listener failed: say so, never show an empty list as if it were real. */
  error?: string;
  unreadByChannel?: Record<string, boolean>;
  /** Known unread counts (channels without one keep the plain dot). */
  unreadCounts?: Record<string, number>;
  currentUserId?: string | null;
  blockedUids?: ReadonlySet<string>;
  /** Desktop rail only: the open channel gets the current-row treatment. */
  activeChannelId?: string;
  onSelect: (channelId: string) => void;
  /** Resubscribe after a listener failure (falls back to a reload). */
  onRetry?: () => void;
}

/** Channel rows shared by the phone channel screen and the desktop rail. */
export function ChannelRows({
  channels,
  loading,
  error,
  unreadByChannel,
  unreadCounts,
  currentUserId,
  blockedUids,
  activeChannelId,
  onSelect,
  onRetry = () => window.location.reload(),
}: ChannelRowsProps) {
  const reveal = useFirstReveal('3c:reveal:chat-channels', !loading && channels.length > 0);
  const online = useOnline();
  if (loading) {
    return (
      <div aria-hidden="true">
        {[0, 1, 2, 3].map((row) => (
          <div className={c.channelSkel} key={row}>
            <span className={s.skel} style={{ width: 40, height: 40, borderRadius: 6 }} />
            <span>
              <span className={s.skel} style={{ width: '46%', height: 14 }} />
              <span className={s.skel} style={{ width: '78%', height: 12 }} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (error && channels.length === 0) {
    return (
      <div className={s.failed} role="alert">
        Couldn&apos;t load channels
        <button type="button" className={s.retry} onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" /> Try again
        </button>
      </div>
    );
  }
  if (channels.length === 0 && !online) {
    // Offline, an empty list is only an empty cache: never "No channels yet".
    // No reload button: offline that would be a blank page. The live list
    // fills in by itself when the connection is back.
    return (
      <div className={s.failed} role="status">
        <WifiOff size={16} aria-hidden="true" />
        You&apos;re offline. Channels load when you&apos;re back online.
      </div>
    );
  }
  if (channels.length === 0) {
    return <p className={c.empty}>No channels yet. Channels for your role appear here automatically.</p>;
  }
  return (
    <>
      {error ? (
        // The listener died after channels loaded: the list is stale (no new
        // unread dots or times), so say so without taking it away.
        <p className={c.listOffline} role="status">
          <WifiOff size={16} aria-hidden="true" />
          <span>Chat&apos;s offline</span>
          <button type="button" onClick={onRetry} className={c.listOfflineRetry}>
            <RotateCw size={14} aria-hidden="true" /> Try again
          </button>
        </p>
      ) : null}
      <ul className={c.channels} data-reveal={reveal || undefined}>
        {channels.map((channel, index) => {
          const unread = !!unreadByChannel?.[channel.id];
          const count = unread ? unreadCounts?.[channel.id] : undefined;
          const preview = channelPreview(channel, currentUserId, blockedUids);
          return (
            <li key={channel.id} style={{ '--i': index } as CSSProperties}>
              <button
                type="button"
                onClick={() => onSelect(channel.id)}
                aria-current={activeChannelId === channel.id ? 'true' : undefined}
                className={`${c.channel} ${unread ? c.channelUnread : ''} tap-press`}
              >
                <span className={c.channelCopy}>
                  <span className={c.channelName}>
                    {channel.name}
                    {channel.audience === 'managers' ? <Lock size={12} role="img" aria-label="Private" /> : null}
                  </span>
                  {preview ? (
                    <span className={c.channelDesc}>
                      {preview.who ? <span className={c.previewWho}>{preview.who}: </span> : null}
                      {preview.text}
                    </span>
                  ) : null}
                </span>
                <span className={c.channelMeta}>
                  {formatChannelTime(channel.lastMessageAt)}
                  {unread && count ? (
                    <span className={c.unreadCount}>
                      <span aria-hidden="true">{formatUnreadCount(count)}</span>
                      <span className={s.srOnly}>
                        {formatUnreadCount(count)} unread {count === 1 ? 'message' : 'messages'}
                      </span>
                    </span>
                  ) : unread ? (
                    <>
                      <i className={c.unreadDot} aria-hidden="true" />
                      <span className={s.srOnly}>Unread messages</span>
                    </>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The phone's first chat screen: an ordinary page above the tab bar. */
export function MobileChannelList({
  channels,
  loading,
  error,
  unreadByChannel,
  unreadCounts,
  currentUserId,
  blockedUids,
  onOpenChannel,
  onRetry,
}: {
  channels: ChatChannelDoc[];
  loading: boolean;
  error?: string;
  unreadByChannel?: Record<string, boolean>;
  unreadCounts?: Record<string, number>;
  currentUserId?: string | null;
  blockedUids?: ReadonlySet<string>;
  onOpenChannel: (channelId: string) => void;
  onRetry?: () => void;
}) {
  const unreadCount = channels.filter((channel) => unreadByChannel?.[channel.id]).length;
  return (
    <section className={c.listScreen} aria-labelledby="chat-title">
      <div className={c.listHead}>
        <h1 id="chat-title" className={c.title}>
          Team chat
        </h1>
        {/* Channels, not messages: a row's badge counts its messages. */}
        {unreadCount > 0 ? (
          <span className={c.listCount}>
            {unreadCount} unread {unreadCount === 1 ? 'channel' : 'channels'}
          </span>
        ) : null}
      </div>
      <div className={`${s.panel} ${c.listPanel}`}>
        <ChannelRows
          channels={channels}
          loading={loading}
          error={error}
          unreadByChannel={unreadByChannel}
          unreadCounts={unreadCounts}
          currentUserId={currentUserId}
          blockedUids={blockedUids}
          onSelect={onOpenChannel}
          onRetry={onRetry}
        />
      </div>
      <p className={c.guide}>
        <ShieldAlert size={16} aria-hidden="true" />
        Keep customer details out of chat. Never post card numbers or SSNs.
      </p>
    </section>
  );
}
