'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

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
        if (active) setError('Could not load GIFs. Try again.');
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
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Search GIFs"
      className="portal-motion absolute bottom-full left-0 z-30 mb-2 w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 dark:border-border dark:bg-card dark:shadow-black/40"
    >
      <div className="border-b border-slate-200 p-2.5 dark:border-border">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400 dark:text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search GIFs"
            aria-label="Search GIFs"
            className="pl-8"
          />
        </div>
      </div>

      <div className="max-h-[18rem] overflow-auto p-2.5">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400 dark:text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-muted-foreground">{error}</p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-muted-foreground">
            No GIFs found.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => {
                  onSelect(gif);
                  onClose();
                }}
                className="aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-100 transition-transform hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f] dark:border-border dark:bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gif.previewUrl}
                  alt="GIF"
                  loading="lazy"
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="border-t border-slate-100 px-2.5 py-1.5 text-[10px] text-slate-400 dark:border-border dark:text-muted-foreground">
        Powered By GIPHY
      </p>
    </div>
  );
}
