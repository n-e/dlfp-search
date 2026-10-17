import { resolve } from "node:path";
import { loadConfig } from "./config.ts";
import { crawlSitemap } from "./crawl.ts";
import { closeHttpClient } from "./http.ts";
import { indexRawFileAndSwitchAlias } from "./index-elasticsearch.ts";

function usage(): never {
  console.error(`Usage:
  indexer run
  indexer crawl
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

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") usage();

  const config = loadConfig();
  if (command === "crawl") {
    if (args.length > 0) usage();
    await crawlSitemap(config.sitemapUrl, config.rawNdjsonPath);
    return;
  }

  if (command === "index") {
    if (args.length !== 1 || !args[0]) usage();
    await indexRawFileAndSwitchAlias(config, resolve(args[0]));
    return;
  }

  if (command === "run") {
    if (args.length > 0) usage();
    await crawlSitemap(config.sitemapUrl, config.rawNdjsonPath);
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
