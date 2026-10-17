import { load } from "cheerio";
import { contentTypeFromUrl } from "./content-url.ts";
import type { RawPage, SearchDocument } from "./types.ts";

const removableSelectors = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
  "form",
  "aside",
  "iframe",
  "svg",
  "#comments",
  ".comments",
  ".comment",
  ".comment-list",
  ".toolbar",
  ".page-toolbar",
  ".share",
  ".actions",
  ".related",
  ".pagination",
  ".votes",
  ".tag_list",
  ".tags",
  ".metadata",
].join(", ");

function firstText($: ReturnType<typeof load>, selectors: string[]): string | null {
  for (const selector of selectors) {
    const text = $(selector).first().text().replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return null;
}

function cleanDate(value: string | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function extractDocument(page: RawPage): SearchDocument {
  const contentType = contentTypeFromUrl(page.url);
  if (!contentType) throw new Error(`Raw record has an unsupported content URL: ${page.url}`);

  const $ = load(page.html);
  const root = $("main").first().length ? $("main").first() : $("body");
  const title = firstText($, ["main h1", "h1"])
    ?? $('meta[property="og:title"]').attr("content")?.trim()
    ?? firstText($, ["title"])
    ?? page.url;

  const author = firstText($, [
    "main [rel=author]",
    "main .author a",
    "main .posted_by a",
    "main .byline a",
    "main a[href^='/users/']",
  ]);
  const publishedAt = cleanDate(
    root.find("time[datetime]").first().attr("datetime")
      ?? $('meta[property="article:published_time"]').attr("content"),
  );
  const tags = root.find('a[href*="/tags/"]').toArray()
    .map((element) => $(element).text().replace(/\s+/g, " ").trim())
    .filter((tag): tag is string => tag.length > 0);

  const article = root.find("article").first().length ? root.find("article").first() : root;
  article.find(removableSelectors).remove();
  article.find("h1, time[datetime], [rel=author], .author, .posted_by, .byline").remove();
  const content = article.text().replace(/\s+/g, " ").trim();

  return {
    url: page.url,
    contentType,
    title,
    content,
    author,
    publishedAt,
    tags: [...new Set(tags)],
    fetchedAt: page.fetchedAt,
  };
}
