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

function forumNameFromUrl(urlValue: string): string | null {
  const forumSegment = new URL(urlValue).pathname.split("/")[2];
  if (!forumSegment) return null;
  try {
    return decodeURIComponent(forumSegment);
  } catch {
    return forumSegment;
  }
}

function forumPostTitle($: ReturnType<typeof load>, urlValue: string): string | null {
  const pageUrl = new URL(urlValue);
  const pagePath = pageUrl.pathname.replace(/\/$/, "");
  const article = $("main article").first();
  const heading = article.find("header h1").first();
  const links = heading.find("a");

  for (const element of links.toArray()) {
    const href = $(element).attr("href");
    if (!href) continue;
    if (new URL(href, pageUrl).pathname.replace(/\/$/, "") === pagePath) {
      const title = $(element).text().replace(/\s+/g, " ").trim();
      if (title) return title;
    }
  }

  if (links.length > 1) {
    const title = links.last().text().replace(/\s+/g, " ").trim();
    if (title) return title;
  }
  return null;
}

export function extractDocument(page: RawPage): SearchDocument {
  const contentType = contentTypeFromUrl(page.url);
  if (!contentType) throw new Error(`Raw record has an unsupported content URL: ${page.url}`);

  const $ = load(page.html);
  const root = $("main").first().length ? $("main").first() : $("body");
  const article = root.find("article").first().length ? root.find("article").first() : root;
  const forumName = contentType === "forum" ? forumNameFromUrl(page.url) : null;
  const title = (contentType === "forum" ? forumPostTitle($, page.url) : null)
    ?? firstText($, ["main h1", "h1"])
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

  const entryContent = article.find(".entry-content").first();
  const body = entryContent.length > 0 ? entryContent : article;
  body.find(removableSelectors).remove();
  body.find("header, footer, h1, time[datetime], [rel=author], .author, .posted_by, .posted_by_spanblock, .byline, .figures, .score").remove();
  body.find("h2, h3").each((_, heading) => {
    const headingElement = $(heading);
    if (headingElement.text().replace(/\s+/g, " ").trim().toLocaleLowerCase("fr") === "aller plus loin") {
      headingElement.add(headingElement.nextUntil("h2, h3")).remove();
    }
  });
  const content = body.text().replace(/\s+/g, " ").trim();

  return {
    url: page.url,
    contentType,
    forumName,
    title,
    content,
    author,
    publishedAt,
    tags: [...new Set(tags)],
    fetchedAt: page.fetchedAt,
  };
}
