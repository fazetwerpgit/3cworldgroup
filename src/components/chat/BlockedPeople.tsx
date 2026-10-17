'use client';

import { useCallback, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { MemberAvatarChip } from './ChannelInfoSheet';
import c from './chat.module.css';

interface BlockedPerson {
  uid: string;
  name: string;
}

interface BlockedPeopleProps {
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  /**
   * Unblocks through the chat page's safety hook (DELETE /api/portal/chat/blocks)
   * so the page's blocked set updates and that person's messages show again.
   * Throws with a readable message when the call fails.
   */
  onUnblock: (uid: string) => Promise<void>;
}

/**
 * "Blocked people" disclosure on the channel info sheet: the reader's own block
 * list (GET /api/portal/chat/blocks), fetched each time it is expanded, with an
 * Unblock button per person. Blocks are per person, not per channel, so the
 * list is the same in every channel.
 */
export function BlockedPeople({ authedFetch, onUnblock }: BlockedPeopleProps) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [mutatingUid, setMutatingUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authedFetch('/api/portal/chat/blocks');
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to load blocked people');
      const list: unknown = json.blocked;
      setPeople(
        Array.isArray(list)
          ? list.filter(
              (entry): entry is BlockedPerson =>
                !!entry && typeof entry.uid === 'string' && typeof entry.name === 'string'
            )
          : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load blocked people');
    } finally {
      setLoading(false);
    }
  }, [authedFetch]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setActionError('');
    if (next) void load();
  };

  const unblock = async (person: BlockedPerson) => {
    setMutatingUid(person.uid);
    setActionError('');
    try {
      await onUnblock(person.uid);
      setPeople((prev) => prev.filter((entry) => entry.uid !== person.uid));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not unblock. Try again.');
    } finally {
      setMutatingUid(null);
    }
  };

  return (
    <div className={c.blockedWrap}>
      <button
        type="button"
        className={c.blockedToggle}
        onClick={toggle}
        aria-expanded={open}
        aria-controls="chat-blocked-people"
      >
        Blocked people
        <ChevronDown size={16} aria-hidden="true" className={open ? c.blockedChevronOpen : undefined} />
      </button>
      {open && (
        <div id="chat-blocked-people" className={c.blockedList}>
          {actionError && (
            <p className={c.actionError} role="alert">
              {actionError}
            </p>
          )}
          {loading ? (
            <p className={c.empty}>Loading…</p>
          ) : error ? (
            <p className={c.empty} role="alert">
              Couldn&apos;t load blocked people. {error}
            </p>
          ) : people.length === 0 ? (
            <p className={c.empty}>You haven&apos;t blocked anyone.</p>
          ) : (
            <ul className={c.people}>
              {people.map((person) => (
                <li key={person.uid}>
                  <div className={c.person}>
                    <MemberAvatarChip name={person.name} />
                    <span className={c.personName}>{person.name}</span>
                    <button
                      type="button"
                      onClick={() => void unblock(person)}
                      disabled={mutatingUid !== null}
                      aria-label={`Unblock ${person.name}`}
                      className={c.addBtn}
                    >
                      {mutatingUid === person.uid ? (
                        <Loader2 size={16} className={c.spin} aria-label="Unblocking" />
                      ) : (
                        'Unblock'
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
