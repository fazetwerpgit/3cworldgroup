import { feedbackSections } from '@/lib/ask/practice';
import { SKILLS, SKILL_LABELS, parseSkills } from '@/lib/ask/practiceCoaching';
import pr from './rep-practice.module.css';

/** The coach's four skill scores, in a row. */
export function SkillScoresRow({ text }: { text: string }) {
  const skills = parseSkills(text);
  if (!skills) return null;
  return (
    <dl className={pr.skills}>
      {SKILLS.map((skill) => (
        <div key={skill} className={pr.skill}>
          <dt>{SKILL_LABELS[skill]}</dt>
          <dd>{skills[skill]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The coach's feedback as headed sections and bullets (the rep's card and the owner's Practice tab). */
export function PracticeFeedback({ text }: { text: string }) {
  return (
    <div className={pr.fb}>
      <SkillScoresRow text={text} />
      {feedbackSections(text).map((section, index) => (
        <div key={index} className={pr.fbSection}>
          {section.heading ? <h3 className={pr.fbHead}>{section.heading}</h3> : null}
          {section.text ? (
            <p className={section.heading === 'Try this line' ? pr.fbLine : pr.fbText}>{section.text}</p>
          ) : null}
          {section.bullets.length > 0 ? (
            <ul className={pr.fbList}>
              {section.bullets.map((bullet, i) => (
                <li key={i}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
