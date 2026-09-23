'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Copy, MoreHorizontal, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import c from './chat.module.css';

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
  onAddReaction?: () => void;
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
 * Desktop message actions: a quiet "..." button that reveals on row hover and
 * opens a dropdown. Radix portals the content to <body>, outside the D token
 * layer, so its classes carry the D colours themselves. Phones use the
 * long-press sheet below instead.
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
        <button type="button" aria-label="Message actions" className={`${c.iconBtn} ${triggerClassName}`.trim()}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={c.menu}>
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            variant={item.destructive ? 'destructive' : 'default'}
            onSelect={item.onSelect}
            className={`${c.menuItem} ${item.destructive ? c.menuDanger : ''}`}
          >
            <item.icon aria-hidden="true" />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// A tap that lands this soon after the sheet opens came from the long-press
// that opened it (its release), not from a choice, so it's ignored.
export const SHEET_TAP_GUARD_MS = 350;

/**
 * Phone message actions: the D bottom sheet, opened by a long-press on a bubble
 * (the parent owns the long-press timer and the open message). Portaled to
 * <body> through BodyLayer; closes on backdrop tap, Cancel or Esc. Delete asks
 * once more before it runs.
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
  if (!open || !config) return null;
  // Mounted per opening, so the confirm step and the tap guard start fresh.
  return <ActionSheetBody config={config} authorName={authorName} onClose={onClose} />;
}

function ActionSheetBody({
  config,
  authorName,
  onClose,
}: {
  config: MessageActionsConfig;
  authorName?: string;
  onClose: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), SHEET_TAP_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (run: () => void) => () => {
    if (armed) run();
  };

  const items = buildActions(config);

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && armed) onClose();
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-label="Message actions">
          <div className={s.sheetHandle} aria-hidden="true" />
          {confirmingDelete ? (
            <>
              <p className={c.sheetConfirm}>Delete this message? This can&apos;t be undone.</p>
              <div className={c.sheetList}>
                <button
                  type="button"
                  onClick={choose(() => {
                    onClose();
                    config.onDelete();
                  })}
                  className={`${c.sheetItem} ${c.sheetDanger}`}
                >
                  <Trash2 size={20} aria-hidden="true" />
                  Delete message
                </button>
                <button type="button" onClick={choose(() => setConfirmingDelete(false))} className={c.sheetItem}>
                  <X size={20} aria-hidden="true" />
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <>
              {authorName && <p className={c.sheetWho}>{authorName}</p>}
              <div className={c.sheetList}>
                {config.onAddReaction && (
                  <button
                    type="button"
                    onClick={choose(() => {
                      onClose();
                      config.onAddReaction?.();
                    })}
                    className={c.sheetItem}
                  >
                    <SmilePlus size={20} aria-hidden="true" />
                    React
                  </button>
                )}
                {items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={choose(() => {
                      if (item.key === 'delete') {
                        setConfirmingDelete(true);
                        return;
                      }
                      onClose();
                      item.onSelect();
                    })}
                    className={`${c.sheetItem} ${item.destructive ? c.sheetDanger : ''}`}
                  >
                    <item.icon size={20} aria-hidden="true" />
                    {item.label}
                  </button>
                ))}
                <button type="button" onClick={choose(onClose)} className={c.sheetItem}>
                  <X size={20} aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </BodyLayer>
  );
}
