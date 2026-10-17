import { XMLParser, XMLValidator } from "fast-xml-parser";
import { contentTypeFromUrl, normalizeContentUrl } from "./content-url.ts";
import { getText } from "./http.ts";

const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: true,
  removeNSPrefix: true,
});

function entries(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function locationsFromEntries(value: unknown): string[] {
  return entries(value).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !("loc" in entry)) return [];
    const loc = (entry as { loc?: unknown }).loc;
    return typeof loc === "string" && loc.length > 0 ? [loc.trim()] : [];
  });
}

function findArray(parsed: Record<string, unknown>, key: "urlset" | "sitemapindex"): unknown {
  const root = parsed[key];
  if (!root || typeof root !== "object") return undefined;
  return (root as Record<string, unknown>)[key === "urlset" ? "url" : "sitemap"];
}

export async function getSupportedSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const visitedSitemaps = new Set<string>();
  const supportedPages = new Set<string>();

  async function visit(urlValue: string): Promise<void> {
    const sitemap = new URL(urlValue);
    if (sitemap.hostname !== "linuxfr.org" && sitemap.hostname !== "www.linuxfr.org") {
      throw new Error(`Refusing sitemap hosted outside LinuxFr.org: ${urlValue}`);
    }

    const normalizedSitemap = sitemap.toString();
    if (visitedSitemaps.has(normalizedSitemap)) return;
    visitedSitemaps.add(normalizedSitemap);

    const xml = await getText(
      normalizedSitemap,
      "application/xml, text/xml;q=0.9, */*;q=0.1",
      /(?:application|text)\/(?:xml|[^;]+\+xml)|application\/octet-stream/i,
    );
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new Error(`Invalid XML in sitemap ${normalizedSitemap}: ${JSON.stringify(validation)}`);
    }

    const parsed = parser.parse(xml) as Record<string, unknown>;
    const nestedSitemaps = locationsFromEntries(findArray(parsed, "sitemapindex"));
    if (nestedSitemaps.length > 0 || parsed.sitemapindex !== undefined) {
      for (const nestedSitemap of nestedSitemaps) await visit(nestedSitemap);
      return;
    }

    const pageUrls = locationsFromEntries(findArray(parsed, "urlset"));
    for (const pageUrl of pageUrls) {
      if (contentTypeFromUrl(pageUrl)) supportedPages.add(normalizeContentUrl(pageUrl));
    }
  }

  await visit(sitemapUrl);
  return [...supportedPages];
}
