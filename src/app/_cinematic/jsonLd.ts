import { SITE_URL, SOCIAL_LINKS } from "./nav";

// Structured data for search engines: who the site belongs to (Organization)
// and the site itself (WebSite), as one @graph so the two can point at each
// other by @id. Rendered once per public page by the cinematic layout.

type JsonLdValue = string | number | boolean | null | JsonLdValue[] | { [key: string]: JsonLdValue };
export type JsonLd = { [key: string]: JsonLdValue };

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

export const SITE_JSON_LD: JsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "3C World Group",
      url: SITE_URL,
      // The square brand mark the footer shows (550x516), as a PNG for the crawlers.
      logo: `${SITE_URL}/logo.png`,
      sameAs: Object.values(SOCIAL_LINKS),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "3C World Group",
      url: SITE_URL,
      publisher: { "@id": ORGANIZATION_ID },
    },
  ],
};

/**
 * JSON for an inline <script>. JSON.stringify leaves `<` alone, so a value
 * holding `</script>` would close the tag early; as `<` it is the same
 * character to a JSON parser and inert to the HTML one.
 */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
