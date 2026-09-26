import { feedbackSections } from '@/lib/ask/practice';
import pr from './rep-practice.module.css';

/** The coach's feedback as headed sections and bullets (the rep's card and the owner's Practice tab). */
export function PracticeFeedback({ text }: { text: string }) {
  return (
    <div className={pr.fb}>
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
