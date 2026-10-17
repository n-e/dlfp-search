import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import { getText } from "./http.ts";
import { getSupportedSitemapUrls } from "./sitemap.ts";
import type { RawPage } from "./types.ts";

export async function crawlSitemap(sitemapUrl: string, outputPath: string): Promise<number> {
  const pageUrls = await getSupportedSitemapUrls(sitemapUrl);
  if (pageUrls.length === 0) {
    throw new Error(`The sitemap contains no supported LinuxFr.org pages: ${sitemapUrl}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.partial`;
  await rm(temporaryPath, { force: true });

  const output = createWriteStream(temporaryPath, { encoding: "utf8", flags: "wx" });
  const outputFinished = finished(output);
  let completed = false;

  try {
    console.log(`Found ${pageUrls.length} supported pages; fetching sequentially.`);
    for (const [index, url] of pageUrls.entries()) {
      console.log(`[${index + 1}/${pageUrls.length}] GET ${url}`);
      const html = await getText(url, "text/html,application/xhtml+xml;q=0.9", /(?:text\/html|application\/xhtml\+xml)/i);
      const page: RawPage = { url, fetchedAt: new Date().toISOString(), html };
      if (!output.write(`${JSON.stringify(page)}\n`)) await once(output, "drain");
    }

    output.end();
    await outputFinished;
    await rename(temporaryPath, outputPath);
    completed = true;
    console.log(`Saved ${pageUrls.length} raw pages to ${outputPath}`);
    return pageUrls.length;
  } catch (error) {
    output.destroy(error instanceof Error ? error : new Error(String(error)));
    await outputFinished.catch(() => undefined);
    throw error;
  } finally {
    if (!completed) await rm(temporaryPath, { force: true });
  }
}
