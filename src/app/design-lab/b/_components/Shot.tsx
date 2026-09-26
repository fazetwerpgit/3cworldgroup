import s from '../sheet.module.css';

export type Mark = 'found' | 'reading' | 'check' | undefined;

/**
 * The rep's uploaded screenshot, drawn as a thumbnail of a carrier confirmation
 * page. Each of the 7 value lines can be marked the way iOS Live Text marks a
 * recognised string: lime = read, amber = check this.
 */
export function Shot({ size = 4, marks = [] }: { size?: number; marks?: Mark[] }) {
  return (
    <div className={s.shot} style={{ fontSize: `${size}px` }} aria-hidden>
      <div className={s.shotTop} />
      <div className={s.shotHead}>
        <i className={s.shotCheck} />
        <i className={s.shotTitle} />
        <i className={s.shotSub} />
      </div>
      <div className={s.shotLines}>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={s.shotLine}>
            <i className={s.shotKey} />
            <i
              className={`${s.shotVal} ${marks[i] ? s[`mark_${marks[i]}`] : ''}`}
              style={{ width: `${[46, 58, 52, 50, 72, 44, 38][i]}%` }}
            />
          </div>
        ))}
      </div>
      <i className={s.shotButton} />
    </div>
  );
}
