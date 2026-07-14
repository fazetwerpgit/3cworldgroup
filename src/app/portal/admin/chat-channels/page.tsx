'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { ChatChannelAudience } from '@/types';
import {
  AdminCatalogCard,
  AdminCatalogList,
  AdminConfirmStrip,
} from '@/components/admin/AdminCatalogList';

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
      setError('');
      const res = await authedFetch('/api/portal/chat/channels/manage');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load chat channels');
      setChannels(json.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat channels');
    } finally {
      setLoading(false);
    }
  }, [user, authedFetch]);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

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

  return (
    <ProtectedRoute roles={['admin']}>
      <AdminCatalogList
        kicker="catalog / chat channels"
        heroAccent="Keep every record"
        heroPlain="ready to reuse."
        intro="Create, rename, and remove channels. Members are added automatically by role."
        heroCount={channels.length}
        heroCountLabel="channels on file"
        search={{ value: query, onChange: setQuery, placeholder: 'Search channels', ariaLabel: 'Search channels' }}
        toolbarExtra={
          <button type="button" className="admin-line-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New channel'}
          </button>
        }
        loading={loading}
        loadingLabel="Loading chat channels…"
        error={error || null}
        success={success || null}
        isEmpty={filtered.length === 0}
        isFilteredEmpty={channels.length > 0}
        emptyTrue={{ title: 'No channels yet.', body: 'Create one to get started.' }}
        emptyFiltered={{
          title: 'No channels match.',
          body: 'Try a broader search.',
          action: (
            <div className="admin-line-starter">
              <button type="button" onClick={() => setQuery('')}>Clear search</button>
            </div>
          ),
        }}
      >
        {creating && (
          <div className="admin-line-editor">
            <div className="admin-line-panel-head">
              <div>
                <div className="admin-line-eyebrow">edit in place</div>
                <h2 style={{ margin: '5px 0 0', fontSize: 19, fontWeight: 900, letterSpacing: '-.05em', textTransform: 'uppercase' }}>
                  New channel.
                </h2>
              </div>
            </div>
            <div className="admin-line-editor-grid" style={{ marginTop: 13 }}>
              <div className="admin-line-field">
                <label htmlFor="channel-name">Name</label>
                <input id="channel-name" maxLength={60} value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Announcements" />
              </div>
              <div className="admin-line-field">
                <label>Audience / choose one</label>
                <div className="admin-line-segmented" role="group" aria-label="Audience">
                  {(Object.keys(audienceCopy) as ChatChannelAudience[]).map((a) => (
                    <button key={a} type="button" aria-pressed={draft.audience === a} onClick={() => setDraft((p) => ({ ...p, audience: a }))}>
                      {audienceCopy[a]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="admin-line-field full">
                <label htmlFor="channel-description">Description</label>
                <input id="channel-description" maxLength={200} value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} placeholder="What this channel is for" />
              </div>
            </div>
            <div className="admin-line-editor-actions">
              <button type="button" className="admin-line-primary" onClick={createChannel} disabled={saving || !draft.name.trim()}>
                {saving ? 'Creating…' : 'Create'}
              </button>
              <button type="button" className="admin-line-clear-button" onClick={() => { setCreating(false); setDraft(emptyDraft); }} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {filtered.map((channel) => (
          <AdminCatalogCard
            key={channel.id}
            eyebrow="chat channels"
            title={channel.name}
            statusLabel={channel.active ? undefined : 'Archived'}
            statusTone="muted"
            preview={channel.description || 'No description'}
            metaLeft={`${audienceCopy[channel.audience]} · ${channel.memberCount} member${channel.memberCount === 1 ? '' : 's'}`}
            metaRight={`#${channel.id}`}
            extra={
              editingId === channel.id ? (
                <div className="admin-line-editor-grid" style={{ marginTop: 8 }}>
                  <div className="admin-line-field">
                    <label htmlFor={`edit-name-${channel.id}`}>Name</label>
                    <input id={`edit-name-${channel.id}`} maxLength={60} value={editDraft.name} onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="admin-line-field">
                    <label>Audience</label>
                    <div className="admin-line-segmented" role="group" aria-label="Audience">
                      {(Object.keys(audienceCopy) as ChatChannelAudience[]).map((a) => (
                        <button key={a} type="button" aria-pressed={editDraft.audience === a} onClick={() => setEditDraft((p) => ({ ...p, audience: a }))}>
                          {audienceCopy[a]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="admin-line-field full">
                    <label htmlFor={`edit-description-${channel.id}`}>Description</label>
                    <input id={`edit-description-${channel.id}`} maxLength={200} value={editDraft.description} onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))} />
                  </div>
                </div>
              ) : undefined
            }
            actions={
              editingId === channel.id ? (
                <>
                  <button type="button" className="admin-line-primary" onClick={() => saveChannel(channel.id)} disabled={savingId === channel.id}>
                    {savingId === channel.id ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="admin-line-action" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="admin-line-action" onClick={() => beginEdit(channel)}>
                    Edit
                  </button>
                  <button type="button" className="admin-line-action" onClick={() => archiveChannel(channel)} disabled={savingId === channel.id}>
                    {channel.active ? 'Archive' : 'Restore'}
                  </button>
                  <button type="button" className="admin-line-action delete" onClick={() => setConfirmDeleteId(channel.id)} disabled={savingId === channel.id}>
                    Delete
                  </button>
                </>
              )
            }
            confirmStrip={
              confirmDeleteId === channel.id ? (
                <AdminConfirmStrip
                  label={`Delete ${channel.name}?`}
                  confirming={savingId === channel.id}
                  onCancel={() => setConfirmDeleteId(null)}
                  onConfirm={() => deleteChannel(channel.id)}
                />
              ) : undefined
            }
          />
        ))}
      </AdminCatalogList>
    </ProtectedRoute>
  );
}
