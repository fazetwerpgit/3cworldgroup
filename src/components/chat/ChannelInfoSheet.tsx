'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ImageIcon, Loader2, Lock, Pin, Settings2, UserPlus, Users, X } from 'lucide-react';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import { getInitials } from '@/lib/chat/authorColor';
import { ChatAttachment, ChatChannel } from '@/types';
import c from './chat.module.css';

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
  avatarUrl?: string;
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
  // True while that viewer is open over the sheet: Escape then closes only the
  // lightbox, never the sheet underneath it.
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

/** Member row avatar: photo when available, else the initials chip, with a
 *  fail-soft fallback (never a broken-image icon) if the photo fails to load. */
function MemberAvatarChip({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!avatarUrl && !failed;
  return (
    <span className={`${c.avatar} ${c.avatarMd}`} aria-hidden="true">
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" onError={() => setFailed(true)} />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

/**
 * Channel details on the D sheet (bottom sheet on phones, centred dialog on
 * desktop, portaled through BodyLayer): identity, audience, description and
 * Members | Pinned | Photos. Each list is fetched lazily the first time it is
 * shown for a channel. Shared by the phone thread header and the desktop
 * conversation header. Admins get add/remove people and "Manage channels".
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

  // Esc closes the sheet, except while the lightbox is up: it consumes Escape
  // in the capture phase and stops it, so this bubble listener only sees the
  // ones meant for the sheet. Focus lands on the close button when it opens.
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !lightboxOpen) {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, lightboxOpen, onOpenChange]);

  if (!open) return null;

  const skeletonRows = (count: number, square = false) => (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, row) => (
        <div key={row} className={c.skelRow}>
          <span className={s.skel} style={{ width: 36, height: 36, borderRadius: square ? 6 : '50%' }} />
          <span className={s.skel} style={{ width: `${40 + ((row * 17) % 30)}%`, height: 14 }} />
        </div>
      ))}
    </div>
  );

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false);
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="chat-info-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={c.infoHead}>
            <h2 id="chat-info-title" className={c.infoTitle}>
              {channel?.name ?? 'Channel'}
              {isLocked ? <Lock size={12} aria-hidden="true" /> : null}
            </h2>
            {channel && <span className={c.chip}>{audienceCopy[channel.audience]}</span>}
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={() => onOpenChange(false)}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          {channel?.description ? <p className={c.infoDesc}>{channel.description}</p> : null}

          {/* Members | Pinned | Media segmented control. */}
          <div className={c.segs} role="group" aria-label="Channel details">
            {(['members', 'pinned', 'media'] as const).map((key) => {
              const Icon = key === 'members' ? Users : key === 'pinned' ? Pin : ImageIcon;
              return (
                <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={c.seg}>
                  <Icon size={16} aria-hidden="true" />
                  {key === 'members' ? 'Members' : key === 'pinned' ? 'Pinned' : 'Photos'}
                </button>
              );
            })}
          </div>

          <div className={`${s.sheetBody} ${c.infoBody}`}>
            {tab === 'members' ? (
              <>
                <p className={c.infoLabel}>
                  {loading ? 'Members' : `${members.length} member${members.length === 1 ? '' : 's'}`}
                </p>

                {/* Admin-only: add people. Toggles an inline pick-list of active users not
                    already in the channel. Non-admins never see this (isAdmin gate). */}
                {isAdmin && (
                  <div className={c.infoActions}>
                    <button
                      type="button"
                      className={`${s.btnSecondary} ${s.btnBlock}`}
                      onClick={() => setShowAddPeople((v) => !v)}
                      aria-expanded={showAddPeople}
                    >
                      <UserPlus size={18} aria-hidden="true" />
                      Add people
                    </button>
                    {actionError && <p className={c.actionError} role="alert">{actionError}</p>}
                    {showAddPeople && (
                      <div className={c.addList}>
                        {addable.length === 0 ? (
                          <p className={c.empty}>{loading ? 'Loading…' : 'Everyone is already here.'}</p>
                        ) : (
                          <ul className={c.people}>
                            {addable.map((person) => (
                              <li key={person.uid}>
                                <div className={c.person}>
                                  <MemberAvatarChip name={person.name} />
                                  <span className={c.personName}>
                                    {person.name}
                                    {person.role && <span className={c.personSub}>{person.role}</span>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void addMember(person.uid)}
                                    disabled={mutatingUid !== null}
                                    className={c.addBtn}
                                  >
                                    {mutatingUid === person.uid ? <Loader2 size={16} className={c.spin} aria-label="Adding" /> : 'Add'}
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {loading ? (
                  skeletonRows(5)
                ) : error ? (
                  <p className={c.empty} role="alert">Couldn&apos;t load members. {error}</p>
                ) : members.length === 0 ? (
                  <p className={c.empty}>No members yet.</p>
                ) : (
                  <ul className={c.people}>
                    {members.map((member) => (
                      <li key={member.uid}>
                        <div className={c.person}>
                          <MemberAvatarChip name={member.name} avatarUrl={member.avatarUrl} />
                          <span className={c.personName}>
                            {member.name}
                            {/* Role labels (tiers, manager titles, IBO) stay admin-only. */}
                            {isAdmin && member.role && <span className={c.personSub}>{member.role}</span>}
                          </span>
                          {isAdmin && member.isExtra && <span className={`${c.chip} ${c.chipLime}`}>Added</span>}
                          {isAdmin && member.isExtra && (
                            <button
                              type="button"
                              onClick={() => void removeMember(member.uid, member.name)}
                              disabled={mutatingUid !== null}
                              aria-label={`Remove ${member.name}`}
                              className={c.iconBtn}
                            >
                              {mutatingUid === member.uid ? <Loader2 size={16} className={c.spin} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : tab === 'pinned' ? (
              pinsLoading ? (
                skeletonRows(3, true)
              ) : pinsError ? (
                <p className={c.empty} role="alert">Couldn&apos;t load pinned messages. {pinsError}</p>
              ) : pins.length === 0 ? (
                <p className={c.empty}>Nothing pinned yet. Managers can pin a message from its menu.</p>
              ) : (
                <ul className={c.people}>
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
                        <span className={c.pinThumb}>
                          {pin.attachment && isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={pin.attachment.url} alt="" loading="lazy" />
                          ) : (
                            <Pin size={16} aria-hidden="true" />
                          )}
                        </span>
                        <span className={c.personName}>
                          {pin.authorName}
                          <span className={c.personSub}>{snippet}</span>
                        </span>
                        <span className={c.personTime}>{formatMediaTime(pin.pinnedAt)}</span>
                      </>
                    );
                    return (
                      <li key={pin.messageId}>
                        {pin.attachment && isImage ? (
                          <button type="button" onClick={openImage} aria-label={`Pinned photo from ${pin.authorName}`} className={c.person}>
                            {rowInner}
                          </button>
                        ) : (
                          <div className={c.person}>{rowInner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : mediaLoading ? (
              <div className={c.mediaGrid} aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((cell) => (
                  <span key={cell} className={s.skel} style={{ aspectRatio: '1', borderRadius: 6 }} />
                ))}
              </div>
            ) : mediaError ? (
              <p className={c.empty} role="alert">Couldn&apos;t load photos. {mediaError}</p>
            ) : media.length === 0 ? (
              <p className={c.empty}>No photos yet.</p>
            ) : (
              <div className={c.mediaGrid}>
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
                    className={c.mediaCell}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.attachment.url} alt={`Shared by ${item.authorName}`} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className={c.infoFoot}>
              <Link
                href="/portal/admin/settings?tab=chat-channels"
                className={`${s.btnSecondary} ${s.btnBlock}`}
                onClick={() => onOpenChange(false)}
              >
                <Settings2 size={18} aria-hidden="true" />
                Manage channels
              </Link>
            </div>
          )}
        </section>
      </div>
    </BodyLayer>
  );
}
