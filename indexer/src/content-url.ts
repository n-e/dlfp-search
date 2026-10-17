import type { ContentType } from "./types.ts";

const supportedHostnames = new Set(["linuxfr.org", "www.linuxfr.org"]);

export function contentTypeFromUrl(value: string): ContentType | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!supportedHostnames.has(url.hostname.toLowerCase())) return null;

  const path = url.pathname;
  if (/^\/news\/[^/]+\/?$/.test(path)) return "news";
  if (/^\/users\/[^/]+\/journaux\/[^/]+\/?$/.test(path)) return "journal";
  if (/^\/forums\/[^/]+\/posts\/[^/]+\/?$/.test(path)) return "forum";
  return null;
}

export function normalizeContentUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}
