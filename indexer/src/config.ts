import { resolve } from "node:path";

export interface Config {
  sitemapUrl: string;
  rawNdjsonPath: string;
  elasticsearchUrl: string;
  indexPrefix: string;
  elasticsearchApiKey?: string;
  elasticsearchUsername?: string;
  elasticsearchPassword?: string;
}

function requiredUrl(name: string, value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("only HTTP and HTTPS URLs are supported");
    }
    return url.toString();
  } catch (error) {
    throw new Error(`${name} must be a valid HTTP(S) URL: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const indexPrefix = env.ELASTICSEARCH_INDEX_PREFIX ?? "linuxfr";
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(indexPrefix)) {
    throw new Error("ELASTICSEARCH_INDEX_PREFIX must be lowercase and use only letters, digits, dots, underscores, and hyphens");
  }

  const apiKey = env.ELASTICSEARCH_API_KEY?.trim() || undefined;
  const username = env.ELASTICSEARCH_USERNAME?.trim() || undefined;
  const password = env.ELASTICSEARCH_PASSWORD || undefined;
  if (!apiKey && Boolean(username) !== Boolean(password)) {
    throw new Error("Set both ELASTICSEARCH_USERNAME and ELASTICSEARCH_PASSWORD for basic authentication");
  }
  if (apiKey && (username || password)) {
    throw new Error("Configure either ELASTICSEARCH_API_KEY or basic authentication, not both");
  }

  return {
    sitemapUrl: requiredUrl(
      "LINUXFR_SITEMAP_URL",
      env.LINUXFR_SITEMAP_URL ?? "https://linuxfr.org/sitemap_index.xml.gz",
    ),
    rawNdjsonPath: resolve(env.RAW_NDJSON_PATH ?? ".data/linuxfr.ndjson"),
    elasticsearchUrl: requiredUrl(
      "ELASTICSEARCH_URL",
      env.ELASTICSEARCH_URL ?? "http://localhost:9200",
    ),
    indexPrefix,
    ...(apiKey ? { elasticsearchApiKey: apiKey } : {}),
    ...(username && password ? { elasticsearchUsername: username, elasticsearchPassword: password } : {}),
  };
}
