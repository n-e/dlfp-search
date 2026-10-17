# LinuxFr search backend

The backend is a small HTTP API over the Elasticsearch alias populated by the indexer. It runs on Node.js 24.12 or newer.

```sh
pnpm install
pnpm --filter @dlfp/backend start
```

By default it listens on `0.0.0.0:3000` and queries Elasticsearch at `http://localhost:9200` using the `linuxfr` alias.

## Docker

From the repository root, build and run the combined frontend and API image:

```sh
docker build -t linuxfr-search .
docker run --rm -p 3000:3000 -e ELASTICSEARCH_URL=http://host.docker.internal:9200 linuxfr-search
```

The backend serves the built frontend at `/` and keeps the API at `/search` and `/health`. Set `ELASTICSEARCH_URL` to the Elasticsearch address reachable from the container (for example, `http://es:9200` on a Docker Compose network).

The image also includes the indexer and its production dependencies. Run it as a one-off container with the same Elasticsearch setting:

```sh
docker run --rm -e ELASTICSEARCH_URL=http://host.docker.internal:9200 linuxfr-search node indexer/src/cli.ts run --max-urls 10
```

To keep the raw NDJSON capture after the container exits, mount a host directory at `/app/.data`.

## Endpoints

- `GET /health` checks that Elasticsearch responds.
- `GET /search` searches titles and content, boosting title matches. With no `q`, it returns the newest matching documents.

Search parameters are `q`, `type` (`news`, `journal`, or `forum`), `author`, `from` and `to` (`YYYY-MM-DD`), `page` (default `1`), and `pageSize` (default `20`, maximum `100`). Date bounds include the full day. Unknown parameters and invalid values return `400`.

Successful search responses have a `results` array containing indexed fields, Elasticsearch `_score`, and a `highlights` object with HTML-escaped title and content fragments wrapped in `<mark>` tags, plus `pagination` with `page`, `pageSize`, `total`, and `totalPages`. Results sort by relevance and then publication date.

## Configuration

- `PORT` (default `3000`)
- `HOST` (default `0.0.0.0`)
- `ELASTICSEARCH_URL` (default `http://localhost:9200`)
- `ELASTICSEARCH_INDEX_PREFIX` (default `linuxfr`; this is the indexer alias)
- `ELASTICSEARCH_API_KEY` or `ELASTICSEARCH_USERNAME` and `ELASTICSEARCH_PASSWORD`
- `CORS_ORIGIN` (default `*`)
