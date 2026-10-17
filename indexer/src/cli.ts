import { resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { crawlSitemap } from "./crawl.ts";
import { closeHttpClient } from "./http.ts";
import { indexRawFileAndSwitchAlias } from "./index-elasticsearch.ts";

function usage(): never {
  console.error(`Usage:
  indexer run [--max-urls <count>]
  indexer crawl [--max-urls <count>]
  indexer index <raw-ndjson-file>

Environment:
  LINUXFR_SITEMAP_URL             Sitemap URL (default: https://linuxfr.org/sitemap_index.xml.gz)
  RAW_NDJSON_PATH                 Output file for crawl/run (default: .data/linuxfr.ndjson)
  ELASTICSEARCH_URL               Elasticsearch node (default: http://localhost:9200)
  ELASTICSEARCH_INDEX_PREFIX      Index prefix and alias (default: linuxfr)
  ELASTICSEARCH_API_KEY           Optional Elasticsearch API key
  ELASTICSEARCH_USERNAME/PASSWORD Optional Elasticsearch basic authentication`);
  process.exit(2);
}

function parseMaxUrls(args: string[]): number | undefined {
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== "--max-urls" || !/^\d+$/.test(args[1] ?? "")) usage();

  const maxUrls = Number(args[1]);
  if (!Number.isSafeInteger(maxUrls) || maxUrls < 1) usage();
  return maxUrls;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") usage();

  const config = loadConfig();
  if (command === "crawl") {
    const maxUrls = parseMaxUrls(args);
    await crawlSitemap(config.sitemapUrl, config.rawNdjsonPath, maxUrls);
    return;
  }

  if (command === "index") {
    if (args.length !== 1 || !args[0]) usage();
    await indexRawFileAndSwitchAlias(config, resolve(args[0]));
    return;
  }

  if (command === "run") {
    const maxUrls = parseMaxUrls(args);
    await crawlSitemap(config.sitemapUrl, config.rawNdjsonPath, maxUrls);
    await indexRawFileAndSwitchAlias(config, config.rawNdjsonPath);
    return;
  }

  usage();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeHttpClient();
  });
