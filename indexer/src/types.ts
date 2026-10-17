export type ContentType = "news" | "journal" | "forum";

export interface RawPage {
  url: string;
  fetchedAt: string;
  html: string;
}

export interface SearchDocument {
  url: string;
  contentType: ContentType;
  title: string;
  content: string;
  author: string | null;
  publishedAt: string | null;
  tags: string[];
  fetchedAt: string;
}
