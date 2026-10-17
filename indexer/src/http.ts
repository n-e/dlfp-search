import { Agent, interceptors } from "undici";
import { gunzipSync } from "node:zlib";

const dispatcher = new Agent({
  headersTimeout: 30_000,
  bodyTimeout: 60_000,
}).compose([
  interceptors.retry({
    maxRetries: 3,
    minTimeout: 300,
    maxTimeout: 2_000,
    statusCodes: [429, 500, 502, 503, 504],
  }),
  interceptors.redirect({ maxRedirections: 5, throwOnMaxRedirect: true }),
  interceptors.decompress(),
  interceptors.responseError(),
]);

export async function getText(urlValue: string, accept: string, expectedContentType: RegExp): Promise<string> {
  const url = new URL(urlValue);
  const response = await dispatcher.request({
    origin: url.origin,
    path: `${url.pathname}${url.search}`,
    method: "GET",
    headers: {
      accept,
      "user-agent": "DLFP-Search-Indexer/0.1 (+https://github.com/n-e/dlfp-search)",
    },
    maxRedirections: 5,
  });

  const contentType = String(response.headers["content-type"] ?? "");
  if (!expectedContentType.test(contentType)) {
    await response.body.dump();
    throw new Error(`Unexpected content type from ${urlValue}: ${contentType || "missing Content-Type"}`);
  }

  try {
    const bytes = await response.body.bytes();
    const body = url.pathname.endsWith(".gz") ? gunzipSync(bytes) : bytes;
    return Buffer.from(body).toString("utf8");
  } finally {
    response.body.destroy();
  }
}

export async function closeHttpClient(): Promise<void> {
  await dispatcher.close();
}
