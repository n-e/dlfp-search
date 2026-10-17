import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Client } from "@elastic/elasticsearch";
import type { Config } from "./config.ts";
import { extractDocument } from "./extract.ts";
import type { RawPage, SearchDocument } from "./types.ts";

const indexMappings = {
  properties: {
    url: { type: "keyword" },
    contentType: { type: "keyword" },
    forumName: { type: "keyword" },
    title: {
      type: "text",
      analyzer: "french",
      search_analyzer: "french",
      fields: { keyword: { type: "keyword", ignore_above: 256 } },
    },
    content: { type: "text", analyzer: "french", search_analyzer: "french" },
    author: { type: "keyword" },
    publishedAt: { type: "date", ignore_malformed: true },
    tags: { type: "keyword" },
    fetchedAt: { type: "date" },
  },
} as const;

function makeClient(config: Config): Client {
  if (config.elasticsearchApiKey) {
    return new Client({ node: config.elasticsearchUrl, auth: { apiKey: config.elasticsearchApiKey } });
  }
  if (config.elasticsearchUsername && config.elasticsearchPassword) {
    return new Client({
      node: config.elasticsearchUrl,
      auth: { username: config.elasticsearchUsername, password: config.elasticsearchPassword },
    });
  }
  return new Client({ node: config.elasticsearchUrl });
}

function timestampForIndex(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-").toLowerCase();
}

function isNotFound(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "meta" in error
      && (error as { meta?: { statusCode?: number } }).meta?.statusCode === 404,
  );
}

async function currentAliasIndexes(client: Client, alias: string): Promise<string[]> {
  try {
    const response = await client.indices.getAlias({ name: alias });
    return Object.keys(response);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }
}

async function switchAlias(client: Client, alias: string, index: string): Promise<void> {
  const previousIndexes = await currentAliasIndexes(client, alias);
  const actions = [
    ...previousIndexes.map((previous) => ({ remove: { index: previous, alias } })),
    { add: { index, alias } },
  ];
  await client.indices.updateAliases({ actions });
}

async function indexRawFile(client: Client, rawPath: string, targetIndex: string): Promise<number> {
  const lines = createInterface({ input: createReadStream(rawPath), crlfDelay: Infinity });
  let operations: unknown[] = [];
  let documentCount = 0;

  async function flush(): Promise<void> {
    if (operations.length === 0) return;
    const response = await client.bulk({ operations: operations as never[], refresh: false });
    if (response.errors) {
      const errors = response.items.flatMap((item) => {
        const operation = item.index ?? item.create ?? item.update ?? item.delete;
        return operation?.error ? [operation.error] : [];
      });
      throw new Error(`Elasticsearch rejected ${errors.length} bulk operation(s): ${JSON.stringify(errors.slice(0, 3))}`);
    }
    documentCount += operations.length / 2;
    operations = [];
  }

  for await (const line of lines) {
    if (line.trim().length === 0) continue;
    let raw: RawPage;
    try {
      raw = JSON.parse(line) as RawPage;
    } catch (error) {
      throw new Error(`Invalid NDJSON record ${documentCount + 1} in ${rawPath}`, { cause: error });
    }
    if (!raw.url || !raw.fetchedAt || typeof raw.html !== "string") {
      throw new Error(`NDJSON record ${documentCount + 1} is missing url, fetchedAt, or html`);
    }

    const document: SearchDocument = extractDocument(raw);
    operations.push(
      { index: { _index: targetIndex, _id: document.url } },
      document,
    );
    if (operations.length >= 200) await flush();
  }
  await flush();

  if (documentCount === 0) throw new Error(`No documents found in raw NDJSON file: ${rawPath}`);
  return documentCount;
}

export async function indexRawFileAndSwitchAlias(config: Config, rawPath: string): Promise<void> {
  const client = makeClient(config);
  const alias = config.indexPrefix;
  const index = `${config.indexPrefix}-${timestampForIndex(new Date())}`;
  let created = false;

  try {
    await client.indices.create({
      index,
      mappings: indexMappings,
    });
    created = true;

    const count = await indexRawFile(client, rawPath, index);
    await client.indices.refresh({ index });
    await switchAlias(client, alias, index);
    console.log(`Indexed ${count} documents into ${index}; alias ${alias} now points to it.`);
  } catch (error) {
    if (created) {
      await client.indices.delete({ index }).catch(() => undefined);
    }
    throw error;
  } finally {
    await client.close();
  }
}
