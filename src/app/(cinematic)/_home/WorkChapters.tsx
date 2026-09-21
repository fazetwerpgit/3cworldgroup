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
      "You offer fiber internet, TV service, or home security from the providers 3C represents, on its own or bundled. Good selling means explaining the fit clearly and saying when it is not a fit.",
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
  chapters walk: the threshold where the conversation starts (a door open a
  hand-width, the owner's note: the eave frame that stood here read as a
  roofline, not a conversation), the room where the fit is decided, the door
  where the next step is confirmed. This replaces the
  page's own aerial (which the hero one screen above already carries) on the
  first layer and a contact sheet of three square product shots on the second.
  A stack of product squares was the only picture on the site that was not a
  photograph of somewhere, and it sat in the middle of the page's most
  cinematic moment.
*/
/*
  One `sizes` string, used by BOTH copies of every photograph — the sticky
  stage's and the one each chapter carries for the narrow layout. They are two
  elements showing the same file, and only ever one of them is displayed, but
  `display: none` does not stop a browser fetching a srcset. If the two
  disagreed about their width the browser would resolve them to two different
  entries in the srcset and pull each photograph down twice: once at 44vw for
  the stage and again at 100vw for the copy nobody can see. Agreeing on one
  string makes the second element a cache hit instead of a download.
*/
const STAGE_SIZES = "(max-width: 900px) 100vw, 44vw";

const STAGE = [
  {
    src: "/redesign/cinematic/home-threshold-dusk-1920.webp",
    alt: "A front door at dusk, open a hand-width, with warm light across the doormat",
    position: "50% 50%",
  },
  {
    src: "/redesign/cinematic/home-room-dusk-1920.webp",
    alt: "A living room seen from the open front door at dusk, lamp on, the lit street through the window",
    position: "50% 50%",
  },
  {
    src: "/redesign/cinematic/security-garage-dusk-1920.webp",
    alt: "A lit front door at dusk with a keypad and door camera beside it",
    position: "60% 50%",
  },
];

export default function WorkChapters() {
  return (
    <div className={styles.workLayout}>
      <div className={styles.stageColumn}>
        {/*
          The sticky thing is this wrapper, not the picture frame, so the
          caption travels with the photograph and is part of what has to fit
          on screen. The stage's own height is the viewport less the header
          less this caption — see `--stage-caption` in the stylesheet.
        */}
        <div className={styles.stageSticky} data-chapter-stage data-active-chapter="0">
          <div className={styles.stage}>
            {STAGE.map((frame, i) => (
              <figure key={frame.src} className={styles.stageLayer} data-layer={i}>
                <Image
                  src={frame.src}
                  alt={frame.alt}
                  fill
                  sizes={STAGE_SIZES}
                  className={styles.stageImage}
                  style={{ objectPosition: frame.position }}
                />
              </figure>
            ))}
          </div>

          {/*
            All three captions are rendered into one grid cell and the active
            one is faded up, which is what keeps the line from changing height
            as the label changes and means the caption is correct before any
            script runs. It is aria-hidden because it says nothing the chapter
            list beside it does not already say out loud, and it is text, not
            a control: there is nothing here to press.
          */}
          <p className={styles.stageCaption} data-stage-caption aria-hidden="true">
            {CHAPTERS.map((chapter, index) => (
              <span key={chapter.n} className={styles.stageCaptionItem} data-caption={index}>
                <span className={styles.stageCaptionIndex}>
                  {chapter.n} / {String(CHAPTERS.length).padStart(2, "0")}
                </span>
                <span className={styles.stageCaptionLabel}>{chapter.title}</span>
              </span>
            ))}
          </p>
        </div>
      </div>

      <ol className={styles.chapterList}>
        {CHAPTERS.map((chapter, index) => (
          <li
            key={chapter.n}
            className={`${styles.chapter} ${kit.revealRise}`}
            data-chapter
            data-reveal
            /*
              These three arrive once and stay. Elsewhere a section replays its
              entrance every time it is scrolled back into view, but a chapter
              is already answering the scroll — the photograph beside it swaps
              and its number lights — and re-fading the copy underneath that
              would be two motions competing over the same movement. The narrow
              layout has no sticky stage at all, and the owner asked for one
              quiet fade there rather than a section that keeps re-introducing
              itself on the way back up.
            */
            data-reveal-once
          >
            {/* The narrow layout carries its own image inline; the sticky stage is desktop-only. */}
            <div className={styles.chapterArt} aria-hidden="true">
              <Image
                src={STAGE[index].src}
                alt=""
                fill
                sizes={STAGE_SIZES}
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
