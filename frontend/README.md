# LinuxFr search frontend

Responsive React and TypeScript interface for searching the LinuxFr.org archive.

```sh
pnpm install
pnpm frontend
```

The development server is Vite on port `5173`; the API defaults to `http://localhost:3000`. Set `VITE_API_URL` to change the API origin. Start the backend and Elasticsearch separately. Build the static production bundle with `pnpm frontend:build`.

Search updates 280 ms after typing pauses. The indexer creates Elasticsearch `search_as_you_type` fields for title and body prefixes; run a full indexer pass after deploying that mapping change to populate the new fields. The backend falls back to regular full-text search while an older index is active.
