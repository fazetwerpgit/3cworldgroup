'use client';

import { Lock } from 'lucide-react';
import { ChatChannel } from '@/types';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'ALL',
  field: 'FIELD',
  managers: 'MGRS',
  platform: 'ADMIN',
};

interface MobileChannelListProps {
  channels: ChatChannel[];
  loading: boolean;
  error?: string;
  unreadByChannel?: Record<string, boolean>;
  onOpenChannel: (channelId: string) => void;
}

export function MobileChannelList({
  channels,
  loading,
  error,
  unreadByChannel,
  onOpenChannel,
}: MobileChannelListProps) {
  return (
    <section className="chat-line-mobile-channel-screen">
      <p className="chat-line-mobile-kicker">The Line / mobile channel switcher</p>
      <h1 className="chat-line-mobile-title portal-metallic-num">Team Chat</h1>
      <p className="chat-line-mobile-intro">Numbered signals, one calm floor. Select a channel to enter.</p>

      {error && <p className="chat-line-mobile-error" role="alert">{error}</p>}

      {loading ? (
        <div className="chat-line-mobile-channel-list" aria-hidden="true">
          {[0, 1, 2, 3].map((row) => <div className="chat-line-mobile-channel-skeleton" key={row}><span /><span /><span /></div>)}
        </div>
      ) : channels.length === 0 ? (
        <p className="chat-line-mobile-empty">No live channels yet. Ask an admin to sync chat channels.</p>
      ) : (
        <div className="chat-line-mobile-channel-list">
          {channels.map((channel, index) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => onOpenChannel(channel.id)}
              className={`chat-line-mobile-channel ${index === 0 ? 'is-active' : ''}`}
            >
              <span className="chat-line-mobile-number">{String(index + 1).padStart(2, '0')}</span>
              <span className="chat-line-mobile-tick" />
              <span className="chat-line-mobile-copy">
                <strong>{channel.name}{channel.audience === 'managers' && <Lock aria-hidden="true" />}</strong>
                <small>{channel.description}</small>
              </span>
              <span className="chat-line-mobile-audience">{audienceCopy[channel.audience]}{unreadByChannel?.[channel.id] && <i aria-label="Unread messages" />}</span>
            </button>
          ))}
        </div>
      )}

      <p className="chat-line-mobile-pii">No customer PII — never card numbers or SSNs.</p>
    </section>
  );
}
