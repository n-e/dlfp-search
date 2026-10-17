# LinuxFr search frontend

Responsive React and TypeScript interface for searching the LinuxFr.org archive.

```sh
pnpm install
pnpm frontend
```

The development server is Vite on port `5173`; the API defaults to `http://localhost:3000`. Set `VITE_API_URL` to change the API origin. Start the backend and Elasticsearch separately. Build the static production bundle with `pnpm frontend:build`.
