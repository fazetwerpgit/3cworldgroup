'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { Archive, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { ChatChannelAudience } from '@/types';
import rep from '@/components/portal/rep/rep.module.css';
import {
  AdminHead,
  AdminSearch,
  Banner,
  ConfirmStrip,
  EmptyState,
  LoadFailed,
  Seg,
  SkeletonRows,
  StatusDot,
  cx,
} from '@/components/portal/admin-ops/AdminKit';
import s from '@/components/portal/admin-ops/admin-ops.module.css';

type ManagedChannel = {
  id: string;
  name: string;
  description: string;
  audience: ChatChannelAudience;
  order: number;
  active: boolean;
  memberCount: number;
};

type ChannelDraft = {
  name: string;
  description: string;
  audience: ChatChannelAudience;
};

const audienceCopy: Record<ChatChannelAudience, string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

const emptyDraft: ChannelDraft = { name: '', description: '', audience: 'all' };

export default function AdminChatChannelsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<ManagedChannel[]>([]);
  const [draft, setDraft] = useState<ChannelDraft>(emptyDraft);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ChannelDraft>(emptyDraft);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');

  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` },
    });
  }, []);

  const loadChannels = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/portal/chat/channels/manage');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load chat channels');
      setChannels(json.channels || []);
      setLoadFailed(false);
    } catch {
      // Load failures show "Couldn't load · Retry" in the list; `error` is for actions.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const retry = () => {
    setLoading(true);
    loadChannels();
  };

  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess((current) => (current === message ? '' : current)), 3000);
  };

  const createChannel = async () => {
    try {
      setError('');
      setSuccess('');
      setSaving(true);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create channel');
      setDraft(emptyDraft);
      setCreating(false);
      await loadChannels();
      showSuccess('Channel created. Members were added automatically by role.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (channel: ManagedChannel) => {
    setEditingId(channel.id);
    setConfirmDeleteId(null);
    setEditDraft({ name: channel.name, description: channel.description, audience: channel.audience });
  };

  const saveChannel = async (id: string) => {
    try {
      setError('');
      setSuccess('');
      setSavingId(id);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update channel');
      setEditingId(null);
      await loadChannels();
      showSuccess('Channel updated. Membership was refreshed automatically.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setSavingId(null);
    }
  };

  const archiveChannel = async (channel: ManagedChannel) => {
    try {
      setError('');
      setSuccess('');
      setSavingId(channel.id);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: channel.id, active: !channel.active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update channel');
      await loadChannels();
      showSuccess(channel.active ? 'Channel archived.' : 'Channel restored.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel');
    } finally {
      setSavingId(null);
    }
  };

  const deleteChannel = async (id: string) => {
    try {
      setError('');
      setSuccess('');
      setSavingId(id);
      const res = await authedFetch('/api/portal/chat/channels/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete channel');
      setConfirmDeleteId(null);
      await loadChannels();
      showSuccess(`Channel deleted. ${json.deletedMessages || 0} message${json.deletedMessages === 1 ? '' : 's'} removed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete channel');
    } finally {
      setSavingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [channels, query]);

  const audienceOptions = (Object.keys(audienceCopy) as ChatChannelAudience[]).map((a) => ({
    value: a,
    label: audienceCopy[a],
  }));
  const activeCount = channels.filter((c) => c.active).length;

  let list: React.ReactNode;
  if (loading) list = <SkeletonRows rows={5} />;
  else if (loadFailed) list = <LoadFailed what="channels" onRetry={retry} />;
  else if (filtered.length === 0)
    list =
      channels.length > 0 ? (
        <EmptyState
          title="No channels match"
          body="Try a broader search."
          action={
            <button type="button" className={s.btn} onClick={() => setQuery('')}>
              Clear search
            </button>
          }
        />
      ) : (
        <EmptyState title="No channels yet" body="Create one to get started." />
      );
  else
    list = (
      <>
        <div className={s.cHead} aria-hidden="true">
          <span>Channel</span>
          <span>Audience</span>
          <span>Members</span>
          <span>Status</span>
          <span />
        </div>
        <ul className={s.qList}>
          {filtered.map((channel) => {
            const editing = editingId === channel.id;
            const busy = savingId === channel.id;
            return (
              <li key={channel.id} className={cx(s.cRow, editing && s.cRowEditing, !channel.active && s.cArchived)}>
                <div className={s.cName}>
                  <span className={s.cTitle}>{channel.name}</span>
                  <span className={s.cDesc}>{channel.description || 'No description'}</span>
                </div>
                <div className={s.cMeta}>
                  <span className={s.cAudience}>{audienceCopy[channel.audience]}</span>
                  <span className={s.cMembers}>
                    {channel.memberCount.toLocaleString('en-US')} member{channel.memberCount === 1 ? '' : 's'}
                  </span>
                </div>
                <span className={s.cStatus}>
                  <StatusDot tone={channel.active ? 'done' : 'muted'}>{channel.active ? 'Active' : 'Archived'}</StatusDot>
                </span>
                <div className={s.cActions}>
                  {editing ? (
                    <>
                      <button type="button" className={s.btnLime} onClick={() => saveChannel(channel.id)} disabled={busy}>
                        {busy ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" className={s.btn} onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className={s.btn} onClick={() => beginEdit(channel)}>
                        <Pencil size={16} aria-hidden="true" />
                        Edit
                      </button>
                      <button type="button" className={s.btn} onClick={() => archiveChannel(channel)} disabled={busy}>
                        {channel.active ? <Archive size={16} aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
                        {channel.active ? 'Archive' : 'Restore'}
                      </button>
                      <button
                        type="button"
                        className={s.btnDanger}
                        onClick={() => setConfirmDeleteId(channel.id)}
                        disabled={busy}
                        aria-label={`Delete ${channel.name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
                {editing ? (
                  <div className={cx(s.cEditor, s.editorInRow)}>
                    <div className={s.formGrid}>
                      <div className={s.field}>
                        <label className={s.label} htmlFor={`edit-name-${channel.id}`}>
                          Name
                        </label>
                        <input
                          id={`edit-name-${channel.id}`}
                          className={s.input}
                          maxLength={60}
                          value={editDraft.name}
                          onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div className={s.field}>
                        <span className={s.label}>Audience</span>
                        <Seg
                          label="Audience"
                          wrap
                          value={editDraft.audience}
                          onChange={(a) => setEditDraft((p) => ({ ...p, audience: a }))}
                          options={audienceOptions}
                        />
                      </div>
                      <div className={cx(s.field, s.wide)}>
                        <label className={s.label} htmlFor={`edit-description-${channel.id}`}>
                          Description
                        </label>
                        <input
                          id={`edit-description-${channel.id}`}
                          className={s.input}
                          maxLength={200}
                          value={editDraft.description}
                          onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {confirmDeleteId === channel.id ? (
                  <ConfirmStrip
                    label={`Delete ${channel.name}?`}
                    sub="Its messages are deleted too. This can't be undone."
                    confirming={busy}
                    onCancel={() => setConfirmDeleteId(null)}
                    onConfirm={() => deleteChannel(channel.id)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      </>
    );

  return (
    <ProtectedRoute roles={['admin']}>
      <div className={s.page}>
        <AdminHead
          kicker="Admin"
          title="Chat Channels"
          lede="Members are added automatically by role."
          count={loading || loadFailed ? null : activeCount}
          countLabel="active"
        />

        <div className={s.toolbar}>
          <AdminSearch value={query} onChange={setQuery} placeholder="Search channels" label="Search channels" />
          <div className={s.toolbarRow}>
            <button
              type="button"
              className={cx(creating ? s.btn : s.btnLime, s.grow)}
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
            >
              {creating ? null : <Plus size={18} aria-hidden="true" />}
              {creating ? 'Cancel' : 'New channel'}
            </button>
          </div>
        </div>

        {error ? <Banner tone="error">{error}</Banner> : null}
        {success ? <Banner tone="ok">{success}</Banner> : null}

        {creating ? (
          <section className={rep.panel} aria-labelledby="new-channel-title">
            <div className={rep.panelHead}>
              <h2 id="new-channel-title" className={rep.kicker}>
                New channel
              </h2>
            </div>
            <div className={s.editor}>
              <div className={s.formGrid}>
                <div className={s.field}>
                  <label className={s.label} htmlFor="channel-name">
                    Name
                  </label>
                  <input
                    id="channel-name"
                    className={s.input}
                    maxLength={60}
                    value={draft.name}
                    onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Announcements"
                  />
                </div>
                <div className={s.field}>
                  <span className={s.label}>Audience</span>
                  <Seg
                    label="Audience"
                    wrap
                    value={draft.audience}
                    onChange={(a) => setDraft((p) => ({ ...p, audience: a }))}
                    options={audienceOptions}
                  />
                </div>
                <div className={cx(s.field, s.wide)}>
                  <label className={s.label} htmlFor="channel-description">
                    Description
                  </label>
                  <input
                    id="channel-description"
                    className={s.input}
                    maxLength={200}
                    value={draft.description}
                    onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What this channel is for"
                  />
                </div>
              </div>
              <div className={s.editorActions}>
                <button type="button" className={s.btnLime} onClick={createChannel} disabled={saving || !draft.name.trim()}>
                  {saving ? 'Creating…' : 'Create channel'}
                </button>
                <button
                  type="button"
                  className={s.btn}
                  onClick={() => {
                    setCreating(false);
                    setDraft(emptyDraft);
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <section className={cx(rep.panel, s.listPanel)} aria-label="Channels">
          {list}
        </section>
      </div>
    </ProtectedRoute>
  );
}
