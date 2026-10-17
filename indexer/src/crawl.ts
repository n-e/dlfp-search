import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { getText } from "./http.ts";
import { getSupportedSitemapUrls } from "./sitemap.ts";
import type { RawPage } from "./types.ts";

export async function crawlSitemap(
  sitemapUrl: string,
  outputPath: string,
  maxUrls?: number,
): Promise<number> {
  const supportedPages = await getSupportedSitemapUrls(sitemapUrl);
  if (supportedPages.length === 0) {
    throw new Error(`The sitemap contains no supported LinuxFr.org pages: ${sitemapUrl}`);
  }
  const pagesToFetch = maxUrls === undefined
    ? supportedPages
    : [...supportedPages]
      .sort((left, right) => {
        const leftTime = left.lastModifiedAt ? Date.parse(left.lastModifiedAt) : Number.NEGATIVE_INFINITY;
        const rightTime = right.lastModifiedAt ? Date.parse(right.lastModifiedAt) : Number.NEGATIVE_INFINITY;
        return rightTime - leftTime || left.url.localeCompare(right.url);
      })
      .slice(0, maxUrls);

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.partial`;
  await rm(temporaryPath, { force: true });

  const output = createWriteStream(temporaryPath, { encoding: "utf8", flags: "wx" });
  const outputFinished = finished(output);
  let completed = false;

  try {
    console.log(
      maxUrls === undefined
        ? `Found ${supportedPages.length} supported pages; fetching sequentially.`
        : `Found ${supportedPages.length} supported pages; fetching the ${pagesToFetch.length} most recently updated sitemap entries sequentially.`,
    );
    for (const [index, sitemapPage] of pagesToFetch.entries()) {
      const url = sitemapPage.url;
      console.log(`[${index + 1}/${pagesToFetch.length}] GET ${url}`);
      const html = await getText(url, "text/html,application/xhtml+xml;q=0.9", /(?:text\/html|application\/xhtml\+xml)/i);
      const rawPage: RawPage = { url, fetchedAt: new Date().toISOString(), html };
      if (!output.write(`${JSON.stringify(rawPage)}\n`)) await once(output, "drain");
    }

    output.end();
    await outputFinished;
    await rename(temporaryPath, outputPath);
    completed = true;
    console.log(`Saved ${pagesToFetch.length} raw pages to ${outputPath}`);
    return pagesToFetch.length;
  } catch (error) {
    output.destroy(error instanceof Error ? error : new Error(String(error)));
    await outputFinished.catch(() => undefined);
    throw error;
  } finally {
    if (!completed) await rm(temporaryPath, { force: true });
  }
}
