# Specifications

This is a search engine for https://linuxfr.org. It will be able to search journals, news and forum posts. The UI will have full-text search and be able to filter by facets such as the date, the content type (news, journal, etc.) or the author.

This monorepo will be split in 3 projects :

- The indexer, that will be run in a cronjob
- The frontend, that will be a plain react app
- The backend, that will be a node.js API server

The data will be stored in elasticsearch, in an index such as $PREFIX-$ISO_TIMESTAMP, and aliased to $PREFIX. Each time the indexer runs, it will create a new index and then change the alias. For simplicity the indexer will reindex the whole site each time it runs. It will use a concurrency of 1. The indexing will be split in 2 phases : crawl the site and save the data to a ndjson file that contains the raw data (url, timestamp it was fetched, html content), and a second step that extracts the content and saves it to elasticsearch. This way we will be able to improve the extraction without downloading each time. The indexer will read the sitemap, and then get the pages from the sitemap. It should not crawl.