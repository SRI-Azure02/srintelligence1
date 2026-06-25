"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Newspaper } from "lucide-react";
import ArticleCard, { type NewsArticle } from "./ArticleCard";

export interface Filters {
  categories:   string[];
  articleTypes: string[];
  companies:    string[];
  search:       string;
  daysBack:     number;
  drugs:        string[];
  sortBy:       string;
}

interface Props {
  filters:       Filters;
  userId?:       string;
  onDrugClick?:  (drug: string) => void;
}

const PAGE_SIZE = 30;

export default function NewsFeed({ filters, userId, onDrugClick }: Props) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const buildUrl = useCallback((off: number) => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(off) });
    if (filters.categories.length)   p.set("categories",   filters.categories.join(","));
    if (filters.articleTypes.length) p.set("articleTypes", filters.articleTypes.join(","));
    if (filters.companies.length)    p.set("companies",    filters.companies.join(","));
    if (filters.drugs.length)        p.set("drugs",        filters.drugs.join(","));
    if (filters.search)              p.set("search",       filters.search);
    if (filters.daysBack)            p.set("daysBack",     String(filters.daysBack));
    if (filters.sortBy)              p.set("sortBy",       filters.sortBy);
    return `/api/news?${p.toString()}`;
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    setArticles([]);
    setOffset(0);
    setTotal(0);
    setError(null);
    setLoading(true);

    fetch(buildUrl(0))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setArticles(data.articles ?? []);
        setTotal(data.pagination?.total ?? 0);
        setOffset(PAGE_SIZE);
      })
      .catch((e) => { if (!cancelled) setError(e.message ?? "Failed to load articles"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [buildUrl]);

  const loadMore = () => {
    if (loading || offset >= total) return;
    setLoading(true);
    fetch(buildUrl(offset))
      .then((r) => r.json())
      .then((data) => {
        setArticles((prev) => [...prev, ...(data.articles ?? [])]);
        setOffset((o) => o + PAGE_SIZE);
      })
      .catch((e) => setError(e.message ?? "Failed to load more"))
      .finally(() => setLoading(false));
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
      </div>
    );
  }

  if (!loading && articles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <Newspaper size={24} style={{ color: "rgba(26,51,88,0.2)" }} />
        <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "13px", fontWeight: 700, color: "rgba(26,51,88,0.35)" }}>No articles found</p>
        <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "11px", color: "rgba(26,51,88,0.35)" }}>
          {filters.drugs.length
            ? `No articles mention ${filters.drugs.map((d) => `"${d}"`).join(" or ")} in this time window`
            : "Try broadening the filters or wait for the next scrape"}
        </p>
      </div>
    );
  }

  const sortLabel: Record<string, string> = {
    newest: "newest first", oldest: "oldest first", weight: "relevance",
    source: "source", drug_count: "drug mentions", doctype: "document type",
  };

  return (
    <div className="flex flex-col">
      {total > 0 && (
        <p className="px-6 py-2" style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: "rgba(26,51,88,0.45)", borderBottom: "1px solid rgba(26,51,88,0.08)", letterSpacing: "0.04em" }}>
          <span style={{ fontWeight: 700 }}>{total.toLocaleString()}</span> articles
          {filters.drugs.length > 0 && <> mentioning <strong>{filters.drugs.join(", ")}</strong></>}
          {" · "}{sortLabel[filters.sortBy] ?? "newest first"}
        </p>
      )}

      {articles.map((article) => (
        <ArticleCard
          key={article.ARTICLE_ID}
          article={article}
          userId={userId}
          activeDrugs={filters.drugs}
          onDrugClick={onDrugClick}
        />
      ))}

      {offset < total && (
        <div className="flex justify-center py-5">
          <button
            onClick={loadMore}
            disabled={loading}
            className="flex items-center gap-2 rounded-full transition-opacity disabled:opacity-40"
            style={{ padding: "6px 20px", background: "rgba(26,51,88,0.07)", border: "1px solid rgba(26,51,88,0.15)", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "11px", fontWeight: 700, color: "rgba(26,51,88,0.6)" }}
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : null}
            {loading ? "Loading…" : `Load more · ${total - offset} remaining`}
          </button>
        </div>
      )}

      {loading && articles.length === 0 && (
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2 py-3 px-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex gap-2">
        <div className="h-4 w-14 rounded-full animate-pulse" style={{ background: "var(--bg-tertiary)" }} />
        <div className="h-4 w-20 rounded animate-pulse"      style={{ background: "var(--bg-tertiary)" }} />
        <div className="h-4 w-10 rounded animate-pulse ml-auto" style={{ background: "var(--bg-tertiary)" }} />
      </div>
      <div className="h-4 w-4/5 rounded animate-pulse"  style={{ background: "var(--bg-tertiary)" }} />
      <div className="h-3 w-full rounded animate-pulse" style={{ background: "var(--bg-tertiary)" }} />
      <div className="h-3 w-3/4 rounded animate-pulse" style={{ background: "var(--bg-tertiary)" }} />
    </div>
  );
}
