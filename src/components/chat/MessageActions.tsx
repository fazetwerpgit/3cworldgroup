'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { Copy, MoreHorizontal, Pencil, Pin, PinOff, Reply, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// The permissions/handlers a message row hands to its action affordances. Reply is
// always available; Copy only when there's text to copy; Edit for the author only;
// Delete for the author or a moderator (the parent computes these — this component
// never re-derives role logic, it just renders what it's told).
export interface MessageActionsConfig {
  hasText: boolean;
  canEdit: boolean;
  canDelete: boolean;
  // Pin eligibility is broader than delete (managers too — see the pin route);
  // isPinned drives the Pin/Unpin label. The parent computes both.
  canPin: boolean;
  isPinned: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

interface ActionItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
}

// The single ordered action list, shared by the desktop dropdown and the mobile
// sheet so the two affordances can never drift apart.
function buildActions(config: MessageActionsConfig): ActionItem[] {
  const items: ActionItem[] = [
    { key: 'reply', label: 'Reply', icon: Reply, onSelect: config.onReply },
  ];
  if (config.hasText) {
    items.push({ key: 'copy', label: 'Copy text', icon: Copy, onSelect: config.onCopy });
  }
  if (config.canPin) {
    items.push(
      config.isPinned
        ? { key: 'unpin', label: 'Unpin', icon: PinOff, onSelect: config.onTogglePin }
        : { key: 'pin', label: 'Pin', icon: Pin, onSelect: config.onTogglePin }
    );
  }
  if (config.canEdit) {
    items.push({ key: 'edit', label: 'Edit', icon: Pencil, onSelect: config.onEdit });
  }
  if (config.canDelete) {
    items.push({ key: 'delete', label: 'Delete', icon: Trash2, onSelect: config.onDelete, destructive: true });
  }
  return items;
}

/**
 * Desktop (lg+) message actions: a ghost "..." button that reveals on row hover
 * and opens a themed dropdown. The Radix content portals to <body>, which now
 * carries the theme class (Task 1), so dark mode is correct. Mobile uses the
 * long-press sheet below instead (this trigger is hidden by the caller's markup).
 */
export function MessageActions({
  config,
  triggerClassName = '',
}: {
  config: MessageActionsConfig;
  triggerClassName?: string;
}) {
  const items = buildActions(config);
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message actions"
          className={`grid size-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8dc63f] dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground ${triggerClassName}`}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            variant={item.destructive ? 'destructive' : 'default'}
            onSelect={item.onSelect}
          >
            <item.icon className="size-4" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Mobile (<lg) message actions: a bottom action sheet opened by a long-press on a
 * bubble (the parent owns the long-press timer and the open message). Portaled to
 * <body>, closes on backdrop tap or Esc. Rounded top, safe-area padding.
 */
export function MessageActionSheet({
  open,
  config,
  authorName,
  onClose,
}: {
  open: boolean;
  config: MessageActionsConfig | null;
  authorName?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !config || typeof document === 'undefined') return null;
  const items = buildActions(config);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Message actions"
      onClick={onClose}
      className="portal-motion fixed inset-0 z-[130] flex flex-col justify-end bg-black/50 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="rounded-t-2xl border-t border-slate-200 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl dark:border-border dark:bg-card"
      >
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-slate-200 dark:bg-border" />
        {authorName && (
          <p className="truncate px-4 py-1.5 text-xs font-medium text-slate-400 dark:text-muted-foreground">
            {authorName}
          </p>
        )}
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm ${
              item.destructive
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-700 dark:text-slate-200'
            } hover:bg-slate-50 dark:hover:bg-muted`}
          >
            <item.icon className="size-5 shrink-0" />
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
