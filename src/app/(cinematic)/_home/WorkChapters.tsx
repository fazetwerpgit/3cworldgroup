import Image from "next/image";
import kit from "../../_cinematic/cinematic.module.css";
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
    lede: "You start with a conversation.",
    body:
      "Knock, introduce yourself, and learn what a household needs from internet, TV, or security. The pitch is short; the questions come first.",
  },
  {
    n: "02",
    title: "The right fit",
    lede: "Then you match the need to a product.",
    body:
      "You offer fiber internet, TV service, or home security from the providers 3C represents — on its own or bundled. Good selling means explaining the fit clearly and saying when it is not a fit.",
  },
  {
    n: "03",
    title: "The follow-through",
    lede: "Finally, you confirm the next step.",
    body:
      "Once someone is interested, you explain what happens next and make sure the handoff is clear. The job is to leave the customer with an honest offer and a confirmed next step.",
  },
];

/*
  R8 — three photographs of one neighbourhood at one hour, in the order the
  chapters walk: the curb where the conversation starts, the room where the
  fit is decided, the door where the next step is confirmed. This replaces the
  page's own aerial (which the hero one screen above already carries) on the
  first layer and a contact sheet of three square product shots on the second.
  A stack of product squares was the only picture on the site that was not a
  photograph of somewhere, and it sat in the middle of the page's most
  cinematic moment.
*/
const STAGE = [
  {
    src: "/redesign/cinematic/fiber-pedestal-dusk-1920.webp",
    alt: "A suburban street at dusk with a fiber cabinet and tool bag at the curb",
    position: "56% 58%",
  },
  {
    src: "/redesign/cinematic/tv-room-dusk-1920.webp",
    alt: "A living room at dusk with a wall-mounted television and the neighborhood through the window",
    position: "58% 52%",
  },
  {
    src: "/redesign/v2/photos/security-dusk-1600.webp",
    alt: "A lit front door at dusk with a keypad and door camera beside it",
    position: "60% 50%",
  },
];

export default function WorkChapters() {
  return (
    <div className={styles.workLayout}>
      <div className={styles.stageColumn}>
        <div className={styles.stage} data-chapter-stage data-active-chapter="0">
          {STAGE.map((frame, i) => (
            <figure key={frame.src} className={styles.stageLayer} data-layer={i}>
              <Image
                src={frame.src}
                alt={frame.alt}
                fill
                sizes="(max-width: 900px) 100vw, 44vw"
                className={styles.stageImage}
                style={{ objectPosition: frame.position }}
              />
            </figure>
          ))}

          <span className={styles.stageTicks} aria-hidden="true">
            {CHAPTERS.map((chapter) => (
              <span key={chapter.n} className={styles.stageTick} />
            ))}
          </span>
        </div>
      </div>

      <ol className={styles.chapterList}>
        {CHAPTERS.map((chapter, index) => (
          <li key={chapter.n} className={`${styles.chapter} ${kit.revealRise}`} data-chapter data-reveal>
            {/* Mobile carries its own image inline; the sticky stage is desktop-only. */}
            <div className={styles.chapterArt} aria-hidden="true">
              <Image
                src={STAGE[index].src.replace("-1600.webp", "-800.webp")}
                alt=""
                fill
                sizes="100vw"
                className={styles.stageImage}
                style={{ objectPosition: STAGE[index].position }}
              />
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
