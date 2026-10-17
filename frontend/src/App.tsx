import { useEffect, useState, type FormEvent } from "react";

type ContentType = "news" | "journal" | "forum";
interface SearchResult {
  url: string;
  contentType: ContentType;
  forumName: string | null;
  title: string;
  content: string;
  author: string | null;
  publishedAt: string | null;
  tags: string[];
  score: number | null;
  highlights?: { title?: string[]; content?: string[] };
}
interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
interface Filters {
  q: string;
  type: string;
  author: string;
  from: string;
  to: string;
}

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const typeLabels: Record<ContentType, string> = {
  news: "Dépêche",
  journal: "Journal",
  forum: "Forum",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

function getInitialFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    q: params.get("q") ?? "",
    type: params.get("type") ?? "",
    author: params.get("author") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
  };
}

function App() {
  const [filters, setFilters] = useState<Filters>(getInitialFilters);
  const [submitted, setSubmitted] = useState<Filters>(getInitialFilters);
  const [page, setPage] = useState(
    Number(new URLSearchParams(window.location.search).get("page") ?? 1) || 1,
  );
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(submitted))
      if (value.trim()) params.set(key, value.trim());
    params.set("page", String(page));
    params.set("pageSize", "10");
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      search ? `?${search}` : window.location.pathname,
    );
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      fetch(`${API_URL}/search?${search}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(
              body?.error ?? `La recherche a échoué (${response.status}).`,
            );
          }
          return response.json() as Promise<SearchResponse>;
        })
        .then(setData)
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError")
            return;
          setError(
            reason instanceof Error
              ? reason.message
              : "Une erreur inattendue est survenue.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [submitted, page]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    if (key === "q") {
      setSubmitted((current) => ({ ...current, q: value as string }));
      setPage(1);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted({ ...filters });
    setPage(1);
  }

  function goToPage(nextPage: number) {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="site-shell">
      <main>
        <section className="hero" aria-labelledby="page-title">
          <h1 id="page-title">Rechercher dans LinuxFr.org</h1>
          <p>Dépêches, journaux et discussions.</p>
        </section>

        <section className="search-panel" aria-label="Recherche et filtres">
          <form onSubmit={submit}>
            <label className="search-label" htmlFor="query">
              Recherche
            </label>
            <div className="search-row">
              <input
                autoFocus
                id="query"
                type="search"
                placeholder="Mots-clés"
                value={filters.q}
                onChange={(event) => update("q", event.target.value)}
              />
              <button className="search-button" type="submit">
                Rechercher
              </button>
            </div>
            <div className="filters">
              <label className="filter-field type-field">
                <span>Type de contenu</span>
                <select
                  value={filters.type}
                  onChange={(event) => update("type", event.target.value)}
                >
                  <option value="">Tout le contenu</option>
                  <option value="news">Dépêches</option>
                  <option value="journal">Journaux</option>
                  <option value="forum">Forums</option>
                </select>
              </label>
              <label className="filter-field author-field">
                <span>Auteur</span>
                <input
                  type="text"
                  placeholder="Pseudo"
                  value={filters.author}
                  onChange={(event) => update("author", event.target.value)}
                />
              </label>
              <label className="filter-field date-field">
                <span>Depuis le</span>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(event) => update("from", event.target.value)}
                />
              </label>
              <label className="filter-field date-field">
                <span>Jusqu’au</span>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(event) => update("to", event.target.value)}
                />
              </label>
            </div>
          </form>
        </section>

        <section className="results-section" aria-live="polite">
          <div className="results-heading">
            <h2>
              {loading ? (
                "Recherche en cours…"
              ) : data ? (
                <>
                  {data.pagination.total.toLocaleString("fr-FR")} résultat
                  {data.pagination.total === 1 ? "" : "s"}
                </>
              ) : (
                "Résultats"
              )}
            </h2>
            {data && !loading && (
              <span className="page-indicator">
                Page {page} / {Math.max(data.pagination.totalPages, 1)}
              </span>
            )}
          </div>

          {error && (
            <div className="message-card error-card">
              <div>
                <strong>La recherche a échoué</strong>
                <p>
                  {error} Vérifiez que le backend est lancé, puis réessayez.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubmitted({ ...submitted })}
              >
                Réessayer
              </button>
            </div>
          )}
          {loading && (
            <div className="loading-card">
              <span className="spinner" /> Chargement…
            </div>
          )}
          {!loading && !error && data?.results.length === 0 && (
            <div className="message-card empty-card">
              <div>
                <strong>Aucun résultat</strong>
                <p>Essayez d’autres mots ou élargissez les filtres.</p>
              </div>
            </div>
          )}

          {!loading && !error && data && data.results.length > 0 && (
            <>
              <div className="result-list">
                {data.results.map((result) => {
                  const date = formatDate(result.publishedAt);
                  return (
                    <article className="result-card" key={result.url}>
                      <div className="result-topline">
                        <span
                          className={`type-badge type-${result.contentType}`}
                        >
                          <span className="badge-dot" />
                          {typeLabels[result.contentType]}
                        </span>
                        {date && (
                          <time dateTime={result.publishedAt ?? undefined}>
                            {date}
                          </time>
                        )}
                      </div>
                      <h3>
                        <a href={result.url} target="_blank" rel="noreferrer">
                          {result.highlights?.title?.[0] ? (
                            <span
                              dangerouslySetInnerHTML={{
                                __html: result.highlights.title[0],
                              }}
                            />
                          ) : (
                            result.title
                          )}
                          <span className="external-arrow" aria-hidden="true">
                            ↗
                          </span>
                        </a>
                      </h3>
                      <p className="result-excerpt">
                        {result.highlights?.content?.[0] ? (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: result.highlights.content[0],
                            }}
                          />
                        ) : (
                          result.content || "Aucun extrait disponible."
                        )}
                      </p>
                      <div className="result-meta">
                        {result.author && (
                          <span className="author-meta">
                            <span className="meta-avatar">
                              {result.author.slice(0, 1).toUpperCase()}
                            </span>
                            {result.author}
                          </span>
                        )}
                        {result.forumName && (
                          <span className="forum-meta">
                            Dans <strong>{result.forumName}</strong>
                          </span>
                        )}
                        {result.tags.slice(0, 3).map((tag) => (
                          <span className="tag" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
              {data.pagination.totalPages > 1 && (
                <nav className="pagination" aria-label="Pagination">
                  <button
                    type="button"
                    className="page-button previous"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    <span aria-hidden="true">←</span> Précédent
                  </button>
                  <span className="pagination-count">
                    Page <strong>{page}</strong> sur{" "}
                    {data.pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    className="page-button next"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => goToPage(page + 1)}
                  >
                    Suivant <span aria-hidden="true">→</span>
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
