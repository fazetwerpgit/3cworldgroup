'use client';

import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import t from './todo.module.css';

// The one row every To do section uses, built on the shared admin row (the
// People and Pipeline lists): the name over one line of what is waiting, the
// action at the end. On a phone the line is "detail · when"; on desktop "when"
// gets its own column so the ages and the buttons line up down the page. A row
// with `onOpen` (applicants) opens its sheet from anywhere but the action.

const NBSP = '\u00a0';
/** "Fiber, Solar · Austin, TX" with each dot held to the word before it. */
const glue = (text: string) => text.replaceAll(' · ', `${NBSP}· `);

export interface TodoListItem {
  key: string;
  name: string;
  detail: string;
  when: string;
  action: ReactNode;
  /** Opens the row's sheet; the label is for screen readers ("Open Keisha's application"). */
  open?: { label: string; onOpen: () => void };
}

export function TodoList({ items }: { items: TodoListItem[] }) {
  return (
    <ul className={`${u.rows} ${t.cols}`}>
      {items.map((item) => (
        <li key={item.key} className={`${u.row} ${item.open ? t.tappable : ''}`}>
          <span className={`${u.cellMain} ${u.personText}`}>
            {item.open ? (
              <button type="button" className={t.open} onClick={item.open.onOpen} aria-label={item.open.label}>
                <span className={u.personName}>
                  <span>{item.name}</span>
                </span>
              </button>
            ) : (
              <span className={u.personName}>
                <span>{item.name}</span>
              </span>
            )}
            {/* Phone: one line. A dot never starts a wrapped line and the age never splits. */}
            <span className={t.sub}>
              {glue(item.detail)}
              {item.when ? (
                <>
                  {NBSP}· <span className={t.nowrap}>{item.when}</span>
                </>
              ) : null}
            </span>
          </span>
          {/* Desktop: what and how long get their own columns. */}
          <span className={`${u.cell} ${t.detail}`}>{item.detail}</span>
          <span className={`${u.cell} ${u.num} ${t.when}`}>{item.when}</span>
          <span className={`${u.cellEnd} ${t.action}`}>{item.action}</span>
        </li>
      ))}
    </ul>
  );
}

/** A folded group under the sections (older applicants, archived, portal alerts): a full-width row that opens. */
export function TodoFold({
  title,
  count,
  hint,
  hidden,
  children,
}: {
  title: string;
  count?: number | null;
  hint?: string;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`${s.panel} ${t.fold}`} hidden={hidden}>
      <summary className={t.foldHead}>
        <span>{title}</span>
        {count ? <span className={`${u.num} ${t.foldCount}`}>{count}</span> : null}
        <ChevronRight size={20} className={`${u.chev} ${t.foldChev}`} aria-hidden="true" />
      </summary>
      {hint ? <p className={`${u.hint} ${t.foldHint}`}>{hint}</p> : null}
      <div className={t.foldBody}>{children}</div>
    </details>
  );
}
