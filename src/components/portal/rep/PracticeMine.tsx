'use client';

import { useEffect, useState } from 'react';
import { ChartNoAxesColumn, ChevronUp } from 'lucide-react';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { SKILLS, SKILL_LABELS, deliveryLine, skillTrend, type MyPracticeReply } from '@/lib/ask/practiceCoaching';
import s from './rep.module.css';
import p from './rep-page.module.css';
import pr from './rep-practice.module.css';
import { PracticeFeedback } from './PracticeFeedback';

// Beside the Knock button: the owner's practice assignments the rep has open,
// and "My practice": the last 30 days per skill (average and one bar per
// practice) and the practices themselves with their feedback.
// GET /api/portal/ask/practice/mine.

const DUE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Fri, Oct 3" for a YYYY-MM-DD day. */
const dueLabel = (day: string) => DUE.format(new Date(`${day}T12:00:00Z`));

export function PracticeMine() {
  const [mine, setMine] = useState<MyPracticeReply | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/portal/ask/practice/mine', { headers: { Authorization: `Bearer ${token ?? ''}` } });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as MyPracticeReply;
        if (live) setMine(data);
      } catch {
        // No list today: Knock still works.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!mine) return null;
  const trend = skillTrend(mine.sessions);
  const graded = mine.sessions.some((session) => session.skills && !session.redo);

  return (
    <>
      {mine.assignments.length ? (
        <section className={`${s.panel} ${pr.mine}`} aria-labelledby="practice-assigned-h">
          <h2 id="practice-assigned-h" className={s.kicker}>
            Assigned to you
          </h2>
          <ul className={pr.assignments}>
            {mine.assignments.map((assignment) => (
              <li key={assignment.id} className={pr.assignment}>
                <span>
                  {assignment.count} {assignment.count === 1 ? 'practice' : 'practices'} with {assignment.persona} by {dueLabel(assignment.due)}
                </span>
                <strong>
                  {assignment.done >= assignment.count ? 'Done' : `${assignment.done} of ${assignment.count}`}
                </strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mine.sessions.length ? (
        open ? (
          <section className={`${s.panel} ${pr.mine}`} aria-labelledby="practice-mine-h">
            <div className={pr.mineHead}>
              <h2 id="practice-mine-h" className={s.kicker}>
                My practice, last 30 days
              </h2>
              <button type="button" className={s.btnSecondary} onClick={() => setOpen(false)} aria-label="Hide my practice">
                <ChevronUp size={18} aria-hidden="true" />
              </button>
            </div>
            {graded ? (
              <dl className={pr.trend}>
                {SKILLS.map((skill) => (
                  <div key={skill} className={pr.trendRow}>
                    <dt>{SKILL_LABELS[skill]}</dt>
                    <dd className={pr.trendAvg}>{trend[skill].average ?? '–'}</dd>
                    <dd className={pr.bars} aria-label={`${SKILL_LABELS[skill]}, oldest to newest: ${trend[skill].scores.join(', ')}`}>
                      {trend[skill].scores.slice(-30).map((score, index) => (
                        <span key={index} style={{ height: `${score * 10}%` }} />
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={p.hint}>Skill scores show here after your next practice.</p>
            )}
            <ul className={pr.recent}>
              {mine.sessions.map((session) => (
                <li key={session.id}>
                  <details>
                    <summary>
                      <span>
                        {session.redo ? 'Redo · ' : ''}
                        {session.persona || 'Practice'}
                        {session.score !== null ? ` · ${session.score}/10` : ''}
                        {session.result ? ` · ${session.result}` : ''}
                      </span>
                      <span>{WHEN.format(new Date(session.createdAt))}</span>
                    </summary>
                    <div className={pr.recentBody}>
                      <PracticeFeedback text={session.feedback} />
                      {session.delivery ? <p className={pr.delivery}>{deliveryLine(session.delivery)}</p> : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <button type="button" className={`${s.btnSecondary} ${pr.knock}`} onClick={() => setOpen(true)}>
            <ChartNoAxesColumn size={20} aria-hidden="true" />
            My practice
          </button>
        )
      ) : null}
    </>
  );
}
