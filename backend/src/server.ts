import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Client } from "@elastic/elasticsearch";

type ContentType = "news" | "journal" | "forum";

interface SearchDocument {
  url: string;
  contentType: ContentType;
  forumName: string | null;
  title: string;
  content: string;
  author: string | null;
  publishedAt: string | null;
  tags: string[];
  fetchedAt: string;
}

interface SearchParams {
  q: string;
  type?: ContentType;
  author?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

class RequestError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const port = positiveInteger(process.env.PORT ?? "3000", "PORT", 65_535);
const host = process.env.HOST ?? "0.0.0.0";
const index = process.env.ELASTICSEARCH_INDEX_PREFIX ?? "linuxfr";
const elasticsearchUrl = process.env.ELASTICSEARCH_URL ?? "http://localhost:9200";
const corsOrigin = process.env.CORS_ORIGIN ?? "*";

const clientOptions: ConstructorParameters<typeof Client>[0] = { node: elasticsearchUrl };
if (process.env.ELASTICSEARCH_API_KEY) {
  clientOptions.auth = { apiKey: process.env.ELASTICSEARCH_API_KEY };
} else if (process.env.ELASTICSEARCH_USERNAME && process.env.ELASTICSEARCH_PASSWORD) {
  clientOptions.auth = {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD,
  };
}
const elasticsearch = new Client(clientOptions);

function positiveInteger(value: string, name: string, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${name} must be between 1 and ${maximum}`);
  }
  return parsed;
}

function oneParam(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new RequestError(400, `Only one '${name}' parameter is allowed`);
  return values[0];
}

function parseSearchParams(url: URL): SearchParams {
  const allowed = new Set(["q", "type", "author", "from", "to", "page", "pageSize"]);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw new RequestError(400, `Unknown query parameter '${key}'`);
  }

  const q = (oneParam(url, "q") ?? "").trim();
  if (q.length > 500) throw new RequestError(400, "'q' must be 500 characters or fewer");

  const typeValue = oneParam(url, "type");
  if (typeValue && !["news", "journal", "forum"].includes(typeValue)) {
    throw new RequestError(400, "'type' must be news, journal, or forum");
  }
  const author = oneParam(url, "author")?.trim();
  if (author && author.length > 200) throw new RequestError(400, "'author' must be 200 characters or fewer");

  const from = oneParam(url, "from");
  const to = oneParam(url, "to");
  for (const [name, date] of [["from", from], ["to", to]] as const) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)))) {
      throw new RequestError(400, `'${name}' must be a date in YYYY-MM-DD format`);
    }
  }
  if (from && to && from > to) throw new RequestError(400, "'from' must be on or before 'to'");

  let page = 1;
  let pageSize = 20;
  try {
    const pageValue = oneParam(url, "page");
    const pageSizeValue = oneParam(url, "pageSize");
    if (pageValue) page = positiveInteger(pageValue, "page", 10_000);
    if (pageSizeValue) pageSize = positiveInteger(pageSizeValue, "pageSize", 100);
  } catch (error) {
    throw new RequestError(400, error instanceof Error ? error.message : String(error));
  }
  if ((page - 1) * pageSize > 10_000) throw new RequestError(400, "Requested result offset exceeds 10,000");

  return {
    q,
    ...(typeValue ? { type: typeValue as ContentType } : {}),
    ...(author ? { author } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    pageSize,
  };
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": corsOrigin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function search(params: SearchParams) {
  const filters: Record<string, unknown>[] = [];
  if (params.type) filters.push({ term: { contentType: params.type } });
  if (params.author) filters.push({ term: { author: params.author } });
  if (params.from || params.to) {
    filters.push({
      range: {
        publishedAt: {
          ...(params.from ? { gte: `${params.from}T00:00:00.000Z` } : {}),
          ...(params.to ? { lte: `${params.to}T23:59:59.999Z` } : {}),
        },
      },
    });
  }

  const response = await elasticsearch.search<SearchDocument>({
    index,
    from: (params.page - 1) * params.pageSize,
    size: params.pageSize,
    track_total_hits: true,
    query: {
      bool: {
        ...(params.q ? { must: [{ multi_match: { query: params.q, fields: ["title^3", "content"], type: "best_fields" } }] } : {}),
        filter: filters,
      },
    },
    sort: [{ _score: { order: "desc" } }, { publishedAt: { order: "desc", missing: "_last" } }],
  });

  const total = typeof response.hits.total === "number" ? response.hits.total : response.hits.total?.value ?? 0;
  return {
    results: response.hits.hits.flatMap((hit) => hit._source ? [{ ...hit._source, score: hit._score }] : []),
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.ceil(total / params.pageSize),
    },
  };
}

const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": corsOrigin,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    }).end();
    return;
  }

  let url: URL;
  try {
    url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  } catch {
    sendJson(response, 400, { error: "Invalid request URL" });
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }
  if (url.pathname === "/health") {
    try {
      await elasticsearch.ping();
      sendJson(response, 200, { status: "ok", elasticsearch: "ok" });
    } catch {
      sendJson(response, 503, { status: "error", elasticsearch: "unavailable" });
    }
    return;
  }
  if (url.pathname !== "/search") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    sendJson(response, 200, await search(parseSearchParams(url)));
  } catch (error) {
    if (error instanceof RequestError) {
      sendJson(response, error.statusCode, { error: error.message });
    } else {
      console.error("Search request failed", error);
      sendJson(response, 503, { error: "Search service is unavailable" });
    }
  }
});

server.listen(port, host, () => {
  console.log(`DLFP search API listening on http://${host}:${port} (index alias: ${index})`);
});

async function shutdown(): Promise<void> {
  server.close();
  await elasticsearch.close();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
