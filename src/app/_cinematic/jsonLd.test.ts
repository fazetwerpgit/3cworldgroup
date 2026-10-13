import { describe, expect, it } from "vitest";
import { SITE_JSON_LD, serializeJsonLd } from "./jsonLd";
import { SOCIAL_LINKS } from "./nav";

describe("serializeJsonLd", () => {
  it("escapes < so a value cannot close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});

describe("SITE_JSON_LD", () => {
  it("names the organization with an absolute logo and the footer's social profiles", () => {
    const graph = SITE_JSON_LD["@graph"] as Array<Record<string, unknown>>;
    const organization = graph.find((node) => node["@type"] === "Organization");
    expect(organization).toMatchObject({
      name: "3C World Group",
      url: "https://www.3cworldgroup.com",
      logo: "https://www.3cworldgroup.com/logo.png",
      sameAs: Object.values(SOCIAL_LINKS),
    });
    expect(graph.some((node) => node["@type"] === "WebSite")).toBe(true);
  });
});
