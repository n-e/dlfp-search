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

export interface SupportedSitemapPage {
  url: string;
  lastModifiedAt?: string;
}

function supportedPagesFromEntries(value: unknown): SupportedSitemapPage[] {
  return entries(value).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || !("loc" in entry)) return [];
    const page = entry as { loc?: unknown; lastmod?: unknown };
    if (typeof page.loc !== "string" || page.loc.trim().length === 0) return [];
    const lastModifiedAt = typeof page.lastmod === "string" && !Number.isNaN(Date.parse(page.lastmod))
      ? page.lastmod.trim()
      : undefined;
    return [{ url: page.loc.trim(), ...(lastModifiedAt ? { lastModifiedAt } : {}) }];
  });
}

function findArray(parsed: Record<string, unknown>, key: "urlset" | "sitemapindex"): unknown {
  const root = parsed[key];
  if (!root || typeof root !== "object") return undefined;
  return (root as Record<string, unknown>)[key === "urlset" ? "url" : "sitemap"];
}

export async function getSupportedSitemapUrls(sitemapUrl: string): Promise<SupportedSitemapPage[]> {
  const visitedSitemaps = new Set<string>();
  const supportedPages = new Map<string, SupportedSitemapPage>();

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

    const pages = supportedPagesFromEntries(findArray(parsed, "urlset"));
    for (const page of pages) {
      if (!contentTypeFromUrl(page.url)) continue;
      const url = normalizeContentUrl(page.url);
      const candidate = { ...page, url };
      const previous = supportedPages.get(url);
      if (!previous || (candidate.lastModifiedAt && (!previous.lastModifiedAt
        || Date.parse(candidate.lastModifiedAt) > Date.parse(previous.lastModifiedAt)))) {
        supportedPages.set(url, candidate);
      }
    }
  }

  await visit(sitemapUrl);
  return [...supportedPages.values()];
}
