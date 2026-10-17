# Specifications

## Product

Build a search engine for [LinuxFr.org](https://linuxfr.org). It will provide full-text search and filters for date, content type, and author.

Index these content types:

- News (dépêches)
- Journals
- Forum posts

Do not index shared links or other LinuxFr.org page types.

## Monorepo and stack

The repository is a pnpm workspace with three TypeScript projects, each in its own top-level folder:

- `indexer` — scheduled as a cron job
- `frontend` — plain React application
- `backend` — Node.js API server

Use TypeScript throughout all three projects.

## Sitemap and URL selection

The indexer reads the LinuxFr.org sitemap and uses URL path shapes to select pages. It must fetch only matching pages listed in the sitemap; it must not discover pages by crawling links from page content.

Recognize these URL shapes:

- News: `/news/<slug>`
- Journals: `/users/<username>/journaux/<slug>`
- Forum posts: `/forums/<forum-or-id>/posts/<slug>`

Skip sitemap URLs that do not match one of these shapes, including links such as `/users/<username>/liens/<slug>`.

## Indexing

Store indexed data in Elasticsearch. Use a versioned index named like `$PREFIX-$ISO_TIMESTAMP` and an alias named `$PREFIX`. Every indexer run reindexes all selected sitemap pages into a new index, then switches the alias to that index after indexing succeeds.

Keep indexing sequential with concurrency 1 and no added delay between requests. The indexer only requests URLs selected from the sitemap, so it does not need to check `robots.txt`.

Split indexing into two phases:

1. Fetch the selected pages and save their raw data to an NDJSON file. Each record contains the URL, fetch timestamp, and HTML content.
2. Extract searchable fields from the saved HTML and write the documents to Elasticsearch.

Keeping the raw HTML allows extraction to be improved and rerun without downloading the pages again.

Use a small bounded retry through an Undici retry interceptor for fetch requests. If a fetch still fails after retries, fail the run; do not silently skip the page or switch the alias to an incomplete index.

Use Elasticsearch's French analyzer for a reasonable initial French stemming configuration. Search tuning can be improved later.
