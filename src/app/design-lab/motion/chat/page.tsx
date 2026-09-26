'use client';

import { useState } from 'react';
import { ChannelRows } from '@/components/chat/MobileChannelList';
import { Collapse } from '@/components/portal/Collapse';
import { useLiveAppended } from '@/hooks/chat/useLiveAppended';
import type { ChatChannelDoc } from '@/hooks/chat/useChatChannels';
import s from '@/components/portal/rep/rep.module.css';
import c from '@/components/chat/chat.module.css';

// Temporary harness (untracked, never committed): chat list reveal, live append, Collapse.
const CH: ChatChannelDoc[] = ['All Company', 'Wins', 'Managers', 'T-Fiber', 'Training', 'Help'].map((name, i) => ({
  id: `c${i}`,
  name,
  description: 'Channel description here',
  audience: i === 2 ? 'managers' : 'all',
  order: i,
  active: true,
  lastMessageAt: new Date(2026, 8, 22, 9 + i),
}));

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [msgs, setMsgs] = useState<{ id: string; own: boolean }[]>([
    { id: 'm1', own: false },
    { id: 'm2', own: true },
  ]);
  const [open, setOpen] = useState(false);
  const live = useLiveAppended(
    msgs.map((m) => m.id),
    !loading,
    'c0'
  );
  return (
    <div className={s.root} style={{ padding: 16, minHeight: '100vh' }}>
      <button id="load" type="button" onClick={() => setLoading(false)}>load</button>
      <button id="send" type="button" onClick={() => setMsgs((m) => [...m, { id: `m${m.length + 1}`, own: true }])}>send</button>
      <button id="recv" type="button" onClick={() => setMsgs((m) => [...m, { id: `m${m.length + 1}`, own: false }])}>recv</button>
      <button id="toggle" type="button" onClick={() => setOpen((o) => !o)}>toggle</button>
      <div className={s.panel} style={{ marginTop: 12 }}>
        <ChannelRows channels={CH} loading={loading} onSelect={() => {}} />
      </div>
      <div id="thread" style={{ marginTop: 12 }}>
        {msgs.map((m) => (
          <div key={m.id} data-id={m.id} className={live.has(m.id) ? (m.own ? c.liveOwn : c.liveIn) : ''} style={{ padding: 8, background: '#1b2433', marginBottom: 4, color: '#fff' }}>
            {m.id} {m.own ? 'own' : 'in'}
          </div>
        ))}
      </div>
      <Collapse open={open} className={s.panel}>
        <div id="collapsed" style={{ padding: 16, color: '#fff' }}>Collapse body<br />line two<br />line three</div>
      </Collapse>
      <p style={{ color: '#fff' }}>after</p>
    </div>
  );
}
