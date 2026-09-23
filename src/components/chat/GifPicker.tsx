'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import c from './chat.module.css';

// One GIPHY result mapped by the /api/portal/chat/gifs proxy.
export interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
  width?: number;
  height?: number;
}

type AuthedFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Anchored GIF search popover. Mount it inside a `relative` wrapper in the
 * composer; it positions itself above the trigger. Fetches GIPHY trending GIFs
 * on open, then debounced search (300ms) as the query changes. Tapping a GIF
 * fires `onSelect` and closes. Closes on Esc or an outside click. The parent
 * only renders this when the GIF feature probed as enabled.
 */
export function GifPicker({
  authedFetch,
  onSelect,
  onClose,
}: {
  authedFetch: AuthedFetch;
  onSelect: (gif: GifResult) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Outside-click + Esc to dismiss; focus the search box on open.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    inputRef.current?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Debounced search. Empty query (initial) hits the featured endpoint with no
  // delay; typed queries wait 300ms so we don't fire a request per keystroke.
  useEffect(() => {
    let active = true;
    const trimmed = query.trim();
    const handle = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await authedFetch(
          `/api/portal/chat/gifs?q=${encodeURIComponent(trimmed)}`
        );
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load GIFs');
        if (active) setResults(Array.isArray(json.results) ? json.results : []);
      } catch {
        if (active) setError("Couldn't load GIFs. Try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, trimmed ? 300 : 0);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query, authedFetch]);

  return (
    <div ref={panelRef} role="dialog" aria-label="Search GIFs" className={c.gif}>
      <div className={c.gifSearch}>
        <Search size={16} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GIFs"
          aria-label="Search GIFs"
          enterKeyHint="search"
        />
      </div>

      <div className={c.gifBody}>
        {loading ? (
          <div className={c.gifGrid} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((cell) => (
              <span key={cell} className={s.skel} style={{ aspectRatio: '1', borderRadius: 6 }} />
            ))}
          </div>
        ) : error ? (
          <p className={c.gifNote}>{error}</p>
        ) : results.length === 0 ? (
          <p className={c.gifNote}>No GIFs found.</p>
        ) : (
          <div className={c.gifGrid}>
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => {
                  onSelect(gif);
                  onClose();
                }}
                className={c.gifCell}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gif.previewUrl} alt="GIF" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className={c.gifFoot}>Powered by GIPHY</p>
    </div>
  );
}
