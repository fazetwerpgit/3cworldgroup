'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface LightboxImage {
  url: string;
  author?: string;
  time?: string;
  /** Overrides the default "Shared by <author>" alt text for non-chat callers. */
  alt?: string;
}

/**
 * Full-screen image viewer portaled to <body> (the dark class now reaches body,
 * so bg-black/90 + white chrome are theme-correct out of the box). Closes on
 * backdrop click, the X button, or Esc. Focus lands on the close button and Tab
 * is trapped there (the only interactive control), so keyboard users can't fall
 * out of the overlay onto the page beneath.
 *
 * When opened over a modal Radix Sheet (the channel-info Media gallery), that
 * layer sets pointer-events:none on <body> and registers its own document-level
 * Escape handler. So the root forces pointer-events-auto to stay clickable, and
 * the Escape listener runs in the CAPTURE phase and stopPropagation()s — closing
 * ONLY the lightbox and leaving the sheet open and interactive behind it. Pass a
 * STABLE onClose (useCallback) so this effect isn't torn down every parent render.
 */
export function ChatLightbox({
  image,
  onClose,
}: {
  image: LightboxImage | null;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!image) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Swallow before Radix's bubble-phase document listener sees it, so a
        // gallery lightbox closes without also dismissing the sheet behind it.
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Tab') {
        // Only one focusable control — keep focus pinned to it.
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [image, onClose]);

  if (!image || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-chat-lightbox
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      className="chat-line-lightbox portal-motion pointer-events-auto fixed inset-0 z-[120] flex flex-col bg-black/90 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm"
    >
      <div className="flex justify-end">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close image"
          className="chat-line-lightbox-close grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f]"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.url}
          alt={image.alt ?? (image.author ? `Shared by ${image.author}` : 'Shared image')}
          onClick={(event) => event.stopPropagation()}
          className="chat-line-lightbox-image max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
      {(image.author || image.time) && (
        <div
          onClick={(event) => event.stopPropagation()}
          className="chat-line-lightbox-caption pt-3 text-center text-sm text-white/80"
        >
          {image.author && <span className="font-semibold text-white">{image.author}</span>}
          {image.author && image.time && <span className="px-1.5 text-white/40">·</span>}
          {image.time && <span className="tabular-nums">{image.time}</span>}
        </div>
      )}
    </div>,
    document.body
  );
}
