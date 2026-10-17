# LinuxFr indexer

The indexer runs TypeScript directly with Node.js's built-in type stripping. It reads LinuxFr.org's sitemap, selects news, journal, and forum post URLs by path, fetches those pages sequentially, writes the raw HTML records to NDJSON, then extracts searchable data into a fresh Elasticsearch index. It changes the configured alias only after all documents have been indexed successfully.

Use Node.js 24.12 or newer. Native TypeScript execution strips types at runtime but does not type-check; use the `typecheck` script for that.

The accepted paths are:

- `/news/<slug>`
- `/users/<username>/journaux/<slug>`
- `/forums/<forum-or-id>/posts/<slug>`

Other sitemap entries, including shared links, are ignored. The indexer does not follow links found in pages.

## Commands

From the repository root:

```sh
pnpm install
pnpm indexer
```

`pnpm indexer` runs the full crawl and indexing process. To run either phase separately:

```sh
pnpm indexer:crawl
pnpm indexer --max-urls 10
pnpm indexer:crawl --max-urls 10
pnpm --filter @dlfp/indexer index-raw .data/linuxfr.ndjson
pnpm indexer:typecheck
```

`--max-urls <count>` limits `run` or `crawl` to the most recently updated matching sitemap entries, ordered by the sitemap's `lastmod` value. Use `crawl` to fetch a recent sample without sending it to Elasticsearch.

The separate `index` command reads an existing NDJSON file and does not fetch LinuxFr.org pages, so extraction can be changed and rerun using the same capture.

Copy `.env.example` values into the environment or set them directly. The defaults use LinuxFr's compressed sitemap index at `https://linuxfr.org/sitemap_index.xml.gz` and Elasticsearch at `http://localhost:9200`. `ELASTICSEARCH_INDEX_PREFIX` is both the concrete index prefix and the stable alias name.

Retries are limited to three attempts for transient transport failures and HTTP 429/5xx responses. A page that still fails stops the crawl; no new index is published.
