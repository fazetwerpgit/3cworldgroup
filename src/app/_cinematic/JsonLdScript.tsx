import { serializeJsonLd, type JsonLd } from "./jsonLd";

/** One `application/ld+json` block. Server-rendered, so crawlers read it without running scripts. */
export default function JsonLdScript({ data }: { data: JsonLd }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />;
}
