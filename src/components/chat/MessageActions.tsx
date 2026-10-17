'use client';

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Ban, CheckCheck, Copy, Flag, MoreHorizontal, Pencil, Pin, PinOff, Reply, SmilePlus, Trash2, UserCheck, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from '@/lib/chat/moderationShared';
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
  // Opens the "Read by" list for this message. Absent (no row) when the parent
  // can't show it, e.g. a message that hasn't reached the server yet.
  onReadBy?: () => void;
  // Moderation, on someone else's delivered message only (the parent decides):
  // report it with a reason, or block / unblock its author. Each is absent
  // (no row) when it doesn't apply. Report and Block confirm in the sheet first.
  onReport?: (reason: ReportReason) => void;
  onBlock?: () => void;
  onUnblock?: () => void;
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
  if (config.onReadBy) {
    items.push({ key: 'readby', label: 'Read by', icon: CheckCheck, onSelect: config.onReadBy });
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
  if (config.onReport) {
    items.push({ key: 'report', label: 'Report', icon: Flag, onSelect: () => {} });
  }
  if (config.onUnblock) {
    items.push({ key: 'unblock', label: 'Unblock', icon: UserCheck, onSelect: config.onUnblock });
  } else if (config.onBlock) {
    items.push({ key: 'block', label: 'Block', icon: Ban, onSelect: () => {} });
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
  authorName,
  triggerClassName = '',
}: {
  config: MessageActionsConfig;
  authorName?: string;
  triggerClassName?: string;
}) {
  // Report and Block need a reason or a confirmation: they open the sheet at that step.
  const [step, setStep] = useState<ConfirmStep | null>(null);
  const items = buildActions(config);
  if (items.length === 0) return null;
  return (
    <>
      {step ? <ActionSheetBody config={config} authorName={authorName} initialStep={step} onClose={() => setStep(null)} /> : null}
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
              onSelect={item.key === 'report' || item.key === 'block' ? () => setStep(item.key as ConfirmStep) : item.onSelect}
              className={`${c.menuItem} ${item.destructive ? c.menuDanger : ''}`}
            >
              <item.icon aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Sheet steps that ask before an action runs. */
type ConfirmStep = 'delete' | 'report' | 'block';

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
  initialStep = null,
  onClose,
}: {
  config: MessageActionsConfig;
  authorName?: string;
  initialStep?: ConfirmStep | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<ConfirmStep | null>(initialStep);
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
          {step === 'report' ? (
            <>
              <p className={c.sheetConfirm}>
                Report this message?
                <span>An admin reviews every report. {authorName ?? 'The author'} isn&apos;t told who sent it.</span>
              </p>
              <div className={c.sheetList}>
                {REPORT_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={choose(() => {
                      onClose();
                      config.onReport?.(reason);
                    })}
                    className={c.sheetItem}
                  >
                    {REPORT_REASON_LABELS[reason]}
                  </button>
                ))}
                <button type="button" onClick={choose(initialStep ? onClose : () => setStep(null))} className={c.sheetItem}>
                  <X size={20} aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </>
          ) : step === 'block' ? (
            <>
              <p className={c.sheetConfirm}>
                Block {authorName ?? 'this person'}?
                <span>
                  Their messages are hidden for you and you won&apos;t get chat notifications from them. They stay in
                  your channels and aren&apos;t told. Unblock any time from one of their messages.
                </span>
              </p>
              <div className={c.sheetList}>
                <button
                  type="button"
                  onClick={choose(() => {
                    onClose();
                    config.onBlock?.();
                  })}
                  className={`${c.sheetItem} ${c.sheetDanger}`}
                >
                  <Ban size={20} aria-hidden="true" />
                  Block
                </button>
                <button type="button" onClick={choose(initialStep ? onClose : () => setStep(null))} className={c.sheetItem}>
                  <X size={20} aria-hidden="true" />
                  Cancel
                </button>
              </div>
            </>
          ) : step === 'delete' ? (
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
                <button type="button" onClick={choose(() => setStep(null))} className={c.sheetItem}>
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
                      if (item.key === 'delete' || item.key === 'report' || item.key === 'block') {
                        setStep(item.key);
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
