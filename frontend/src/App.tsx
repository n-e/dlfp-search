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
}
interface SearchResponse {
  results: SearchResult[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
interface Filters {
  q: string;
  type: string;
  author: string;
  from: string;
  to: string;
}

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const typeLabels: Record<ContentType, string> = { news: "Dépêche", journal: "Journal", forum: "Forum" };
const emptyFilters: Filters = { q: "", type: "", author: "", from: "", to: "" };

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
  const [page, setPage] = useState(Number(new URLSearchParams(window.location.search).get("page") ?? 1) || 1);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(submitted)) if (value.trim()) params.set(key, value.trim());
    params.set("page", String(page));
    params.set("pageSize", "10");
    const search = params.toString();
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      fetch(`${API_URL}/search?${search}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            const body = await response.json().catch(() => null) as { error?: string } | null;
            throw new Error(body?.error ?? `La recherche a échoué (${response.status}).`);
          }
          return response.json() as Promise<SearchResponse>;
        })
        .then(setData)
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError") return;
          setError(reason instanceof Error ? reason.message : "Une erreur inattendue est survenue.");
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
      <header className="topbar">
        <a className="brand" href="/" aria-label="LinuxFr.org, accueil">
          <span className="brand-mark" aria-hidden="true">{`</>`}</span>
          <span>LinuxFr<span className="brand-dot">.</span>org</span>
        </a>
        <div className="topbar-note"><span className="status-dot" /> L’actualité du logiciel libre</div>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> LES ARCHIVES, EN MIEUX</p>
            <h1 id="page-title">Tout LinuxFr,<br /><span>à portée de recherche.</span></h1>
            <p className="intro">Retrouvez une dépêche, un journal ou une discussion dans la mémoire collective du libre.</p>
          </div>
          <div className="hero-ornament" aria-hidden="true">
            <span className="orbit orbit-one" /><span className="orbit orbit-two" />
            <span className="orbit-core">⌕</span><span className="orbit-star">✳</span>
          </div>
        </section>

        <section className="search-panel" aria-label="Recherche et filtres">
          <form onSubmit={submit}>
            <label className="search-label" htmlFor="query">VOTRE RECHERCHE <span className="live-hint">· résultats mis à jour au fil de la saisie</span></label>
            <div className="search-row">
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input id="query" type="search" placeholder="Un sujet, un mot-clé, une idée…" value={filters.q} onChange={(event) => update("q", event.target.value)} />
              <button className="search-button" type="submit">Rechercher <span aria-hidden="true">↗</span></button>
            </div>
            <div className="filters">
              <label className="filter-field type-field"><span>TYPE DE CONTENU</span>
                <select value={filters.type} onChange={(event) => update("type", event.target.value)}>
                  <option value="">Tout le contenu</option><option value="news">Dépêches</option><option value="journal">Journaux</option><option value="forum">Forums</option>
                </select>
              </label>
              <label className="filter-field author-field"><span>AUTEUR</span>
                <input type="text" placeholder="Pseudo LinuxFr" value={filters.author} onChange={(event) => update("author", event.target.value)} />
              </label>
              <label className="filter-field date-field"><span>DEPUIS LE</span>
                <input type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} />
              </label>
              <label className="filter-field date-field"><span>JUSQU’AU</span>
                <input type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} />
              </label>
            </div>
          </form>
        </section>

        <section className="results-section" aria-live="polite">
          <div className="results-heading">
            <div><p className="eyebrow results-eyebrow">EXPLORER LES RÉSULTATS</p>
              <h2>{loading ? "On cherche…" : data ? <>{data.pagination.total.toLocaleString("fr-FR")} <span>résultat{data.pagination.total === 1 ? "" : "s"}</span></> : "Résultats"}</h2>
            </div>
            {data && !loading && <span className="page-indicator">PAGE {page.toString().padStart(2, "0")} <span>/ {Math.max(data.pagination.totalPages, 1).toString().padStart(2, "0")}</span></span>}
          </div>

          {error && <div className="message-card error-card"><span className="message-icon">!</span><div><strong>La recherche n’a pas abouti.</strong><p>{error} Vérifiez que le backend est lancé, puis réessayez.</p></div><button type="button" onClick={() => setSubmitted({ ...submitted })}>Réessayer</button></div>}
          {loading && <div className="loading-card"><span className="spinner" /> Recherche dans les archives…</div>}
          {!loading && !error && data?.results.length === 0 && <div className="message-card empty-card"><span className="message-icon">⌕</span><div><strong>Aucun résultat cette fois.</strong><p>Essayez d’autres mots ou élargissez les filtres.</p></div></div>}

          {!loading && !error && data && data.results.length > 0 && <>
            <div className="result-list">
              {data.results.map((result) => {
                const date = formatDate(result.publishedAt);
                return <article className="result-card" key={result.url}>
                  <div className="result-topline"><span className={`type-badge type-${result.contentType}`}><span className="badge-dot" />{typeLabels[result.contentType]}</span>
                    {date && <time dateTime={result.publishedAt ?? undefined}>{date}</time>}
                  </div>
                  <h3><a href={result.url} target="_blank" rel="noreferrer">{result.title}<span className="external-arrow" aria-hidden="true">↗</span></a></h3>
                  <p className="result-excerpt">{result.content || "Aucun extrait disponible."}</p>
                  <div className="result-meta">
                    {result.author && <span className="author-meta"><span className="meta-avatar">{result.author.slice(0, 1).toUpperCase()}</span>{result.author}</span>}
                    {result.forumName && <span className="forum-meta">Dans <strong>{result.forumName}</strong></span>}
                    {result.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                  </div>
                </article>;
              })}
            </div>
            {data.pagination.totalPages > 1 && <nav className="pagination" aria-label="Pagination">
              <button type="button" className="page-button previous" disabled={page <= 1} onClick={() => goToPage(page - 1)}><span aria-hidden="true">←</span> Précédent</button>
              <span className="pagination-count">Page <strong>{page}</strong> sur {data.pagination.totalPages}</span>
              <button type="button" className="page-button next" disabled={page >= data.pagination.totalPages} onClick={() => goToPage(page + 1)}>Suivant <span aria-hidden="true">→</span></button>
            </nav>}
          </>}
        </section>
      </main>
      <footer className="footer"><a className="footer-brand" href="https://linuxfr.org" target="_blank" rel="noreferrer">LinuxFr.org <span>↗</span></a><span>Le libre se partage, les idées restent.</span><span className="footer-right">Fait avec soin pour la communauté.</span></footer>
    </div>
  );
}

export default App;
