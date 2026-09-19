import Image from "next/image";
import styles from "../cinematic-home.module.css";

/**
 * Three moments of the actual job, in the order they happen. The numbers are
 * kept because the order is the information — a rep does not pick one of these
 * three, they walk all three, every door.
 *
 * On desktop the left visual is sticky and crossfades as you read; below 900px
 * the whole apparatus dissolves into image-then-text, with no scroll coupling
 * and no sticky positioning.
 */
const CHAPTERS = [
  {
    n: "01",
    title: "The conversation",
    lede: "You work a neighborhood on foot.",
    body:
      "Knock, introduce yourself, and find out what a household is actually paying for internet and TV — and what it is actually getting. Most of the job is the part where you listen. The pitch is short; the questions are not.",
  },
  {
    n: "02",
    title: "The right fit",
    lede: "Then you match them to something real.",
    body:
      "3C represents established providers, so what you are offering is fiber internet, TV service, and home security people already recognize — on its own or bundled. Knowing which of the three a household needs, and saying so honestly when the answer is none of them, is the skill the job pays for.",
  },
  {
    n: "03",
    title: "The follow-through",
    lede: "And you stay with it until it’s installed and working.",
    body:
      "The sale is not the end of your involvement. You set expectations you can keep, you answer the call when something is unclear, and you leave a street where the next rep is welcome. That is what builds a route worth coming back to.",
  },
];

const STAGE_ALT = [
  "A residential street grid at dusk seen from above, house lights on",
  "Fiber optic strands, a wall-mounted television, and a set of home security devices",
  "A living room with a wall-mounted television, streaming box and remote on a credenza",
];

export default function WorkChapters() {
  return (
    <div className={styles.workLayout}>
      <div className={styles.stageColumn}>
        <div className={styles.stage} data-chapter-stage data-active-chapter="0">
          <figure className={styles.stageLayer} data-layer="0">
            <Image
              src="/redesign/v2/photos/hero-wide-1600.webp"
              alt={STAGE_ALT[0]}
              fill
              sizes="(max-width: 900px) 100vw, 44vw"
              className={styles.stageImage}
            />
          </figure>

          <figure className={styles.stageLayer} data-layer="1">
            <span className={styles.stageTriptych}>
              <Image src="/redesign/v2/photos/fiber-square-800.webp" alt="" width={800} height={800} sizes="15vw" />
              <Image src="/redesign/v2/photos/tv-square-800.webp" alt="" width={800} height={800} sizes="15vw" />
              <Image src="/redesign/v2/photos/security-square-800.webp" alt="" width={800} height={800} sizes="15vw" />
            </span>
            <figcaption className={styles.srOnly}>{STAGE_ALT[1]}</figcaption>
          </figure>

          <figure className={styles.stageLayer} data-layer="2">
            <Image
              src="/redesign/v2/photos/tv-wide-1600.webp"
              alt={STAGE_ALT[2]}
              fill
              sizes="(max-width: 900px) 100vw, 44vw"
              className={styles.stageImage}
            />
          </figure>

          <span className={styles.stageTicks} aria-hidden="true">
            {CHAPTERS.map((chapter) => (
              <span key={chapter.n} className={styles.stageTick} />
            ))}
          </span>
        </div>
      </div>

      <ol className={styles.chapterList}>
        {CHAPTERS.map((chapter, index) => (
          <li key={chapter.n} className={styles.chapter} data-chapter data-reveal>
            {/* Mobile carries its own image inline; the sticky stage is desktop-only. */}
            <div className={styles.chapterArt} aria-hidden="true">
              {index === 1 ? (
                <span className={styles.chapterArtTriptych}>
                  <Image src="/redesign/v2/photos/fiber-square-800.webp" alt="" width={800} height={800} sizes="30vw" />
                  <Image src="/redesign/v2/photos/tv-square-800.webp" alt="" width={800} height={800} sizes="30vw" />
                  <Image src="/redesign/v2/photos/security-square-800.webp" alt="" width={800} height={800} sizes="30vw" />
                </span>
              ) : (
                <Image
                  src={index === 0 ? "/redesign/v2/photos/hero-wide-800.webp" : "/redesign/v2/photos/tv-wide-800.webp"}
                  alt=""
                  fill
                  sizes="100vw"
                  className={styles.stageImage}
                />
              )}
            </div>

            <p className={styles.chapterNumber}>{chapter.n}</p>
            <h3 className={styles.chapterTitle}>{chapter.title}</h3>
            <p className={styles.chapterLede}>{chapter.lede}</p>
            <p className={styles.chapterBody}>{chapter.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
