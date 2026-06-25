"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Search, X, RefreshCw, Wifi, WifiOff, Loader2, Plus,
  Trash2, RotateCcw, ChevronDown, Pill, Building2, Check, Square, StopCircle,
} from "lucide-react";
import NewsFeed from "./NewsFeed";
import type { Filters } from "./NewsFeed";
import AddSourceModal from "./AddSourceModal";
import DeleteSourceModal from "./DeleteSourceModal";
import HealthTab from "./HealthTab";

// ── Brand tokens ──────────────────────────────────────────────────────────────

const INK       = "#1A3358";
const ACCENT    = "#E26B2C";
const BURNT_BLUE = "#2E7BA1";
const BG        = "#F5F5F5";

const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
  <filter id='g'>
    <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/>
    <feColorMatrix type='saturate' values='0'/>
  </filter>
  <rect width='200' height='200' filter='url(#g)' opacity='1'/>
</svg>`;
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

// ── Data constants ────────────────────────────────────────────────────────────

interface Props { userId?: string; }

const CATEGORIES = [
  { value: "regulatory", label: "FDA" }, { value: "filings", label: "SEC" },
  { value: "industry_news", label: "Industry" }, { value: "ir", label: "Investor" }, { value: "media", label: "Media" },
];

const ARTICLE_TYPES = [
  { value: "approval", label: "Approval" }, { value: "earnings", label: "Earnings" },
  { value: "pipeline", label: "Pipeline" }, { value: "M&A", label: "M&A" },
  { value: "safety", label: "Safety" }, { value: "trial", label: "Trial" }, { value: "other", label: "Other" },
];

const DAYS_OPTIONS = [
  { value: 7, label: "7d" }, { value: 30, label: "30d" },
  { value: 90, label: "90d" }, { value: 365, label: "1yr" },
];

const SORT_BASE   = [
  { value: "newest", label: "Newest first" }, { value: "oldest", label: "Oldest first" }, { value: "weight", label: "Relevance" },
];
const SORT_SOURCE  = { value: "source",      label: "Source" };
const SORT_DRUG    = { value: "drug_count",  label: "Drug mentions" };
const SORT_DOCTYPE = { value: "doctype",     label: "Document type" };

interface SourceRow {
  SOURCE_ID: string; SOURCE_NAME: string; COMPANY: string | null; CATEGORY: string; FETCH_METHOD: string;
  IS_ACTIVE: boolean; IS_DELETED: boolean; LAST_SCRAPED_AT: string | null; ARTICLE_COUNT: number;
  LATEST_ARTICLE_AT: string | null; ADDED_BY: string | null; DELETED_BY: string | null;
  DELETED_AT: string | null; DELETE_REASON: string | null;
}

interface DrugEntry { DRUG_NAME: string; ARTICLE_COUNT: number; }

interface ScrapeResult {
  summary?: { durationMs: number; sources: number; fetched: number; inserted: number; skipped: number; errors: number };
  message?: string; error?: string;
}

function pillLabel(selected: string[], labels: { value: string; label: string }[], placeholder: string): string {
  if (selected.length === 0) return placeholder;
  if (selected.length === 1) return labels.find((l) => l.value === selected[0])?.label ?? selected[0];
  return placeholder + " (" + selected.length + ")";
}

// ── Shared pill filter button ─────────────────────────────────────────────────

function FilterPill({ active, children, onClear }: { active: boolean; children: React.ReactNode; onClear?: (e: React.MouseEvent) => void }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs cursor-pointer select-none"
      style={active
        ? { background: `rgba(226,107,44,0.10)`, color: ACCENT, border: `1px solid rgba(226,107,44,0.30)`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontWeight: 700 }
        : { border: `1px solid rgba(26,51,88,0.18)`, background: "rgba(26,51,88,0.04)", color: `rgba(26,51,88,0.55)`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontWeight: 600 }
      }
    >
      {children}
      {active && onClear
        ? <button onClick={onClear} className="ml-0.5 opacity-70 hover:opacity-100"><X size={9} /></button>
        : <ChevronDown size={9} className="opacity-60" />
      }
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewsPanel({ userId }: Props) {
  const [tab, setTab] = useState<"feed" | "sources" | "health">("feed");
  const [categories, setCategories] = useState<string[]>([]);
  const [articleTypes, setArticleTypes] = useState<string[]>([]);
  const [companies, setCompanies] = useState<string[]>([]);
  const [drugs, setDrugs] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [daysBack, setDaysBack] = useState(30);
  const [sortBy, setSortBy] = useState("newest");
  const [feedKey, setFeedKey] = useState(0);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [aborted, setAborted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [drugQuery, setDrugQuery] = useState("");
  const [drugOptions, setDrugOptions] = useState<DrugEntry[]>([]);
  const [drugOpen, setDrugOpen] = useState(false);
  const [drugsLoading, setDrugsLoading] = useState(false);
  const drugRef = useRef<HTMLDivElement>(null);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const companyRef = useRef<HTMLDivElement>(null);
  const [docTypeOpen, setDocTypeOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const docTypeRef = useRef<HTMLDivElement>(null);
  const sourceRef  = useRef<HTMLDivElement>(null);
  const timeRef    = useRef<HTMLDivElement>(null);
  const sortRef    = useRef<HTMLDivElement>(null);
  const drugCloseTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companyCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docTypeCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceCloseTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeCloseTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sortCloseTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!drugOpen) return;
    let cancelled = false; setDrugsLoading(true);
    const qs = drugQuery.trim() ? ("?search=" + encodeURIComponent(drugQuery) + "&limit=30") : "?limit=30";
    fetch("/api/news/drugs" + qs).then((r) => r.json()).then((d) => { if (!cancelled) setDrugOptions(d.drugs ?? []); }).catch(() => {}).finally(() => { if (!cancelled) setDrugsLoading(false); });
    return () => { cancelled = true; };
  }, [drugOpen, drugQuery]);

  useEffect(() => {
    if (!companyOpen) return;
    let cancelled = false; setCompaniesLoading(true);
    fetch("/api/news/companies").then((r) => r.json()).then((d) => { if (!cancelled) setCompanyOptions(d.companies ?? []); }).catch(() => {}).finally(() => { if (!cancelled) setCompaniesLoading(false); });
    return () => { cancelled = true; };
  }, [companyOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (drugRef.current && !drugRef.current.contains(e.target as Node)) setDrugOpen(false);
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) setCompanyOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadSources = useCallback(() => {
    setSourcesLoading(true);
    fetch("/api/news/sources").then((r) => r.json()).then((d) => setSources(d.sources ?? [])).catch(() => {}).finally(() => setSourcesLoading(false));
  }, []);

  useEffect(() => { if (tab === "sources") loadSources(); }, [tab, loadSources]);

  const clearSearch = () => { setSearchInput(""); setSearch(""); };
  const toggleDrug        = (d: string) => setDrugs((p)        => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);
  const toggleCompany     = (c: string) => setCompanies((p)    => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
  const toggleCategory    = (c: string) => setCategories((p)   => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
  const toggleArticleType = (t: string) => setArticleTypes((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  const filters: Filters = useMemo(
    () => ({ categories, articleTypes, companies, search, daysBack, drugs, sortBy }),
    [categories, articleTypes, companies, search, daysBack, drugs, sortBy],
  );

  const hasFilters = categories.length > 0 || articleTypes.length > 0 || companies.length > 0 ||
                     drugs.length > 0 || !!searchInput || daysBack !== 30 || sortBy !== "newest";

  const clearAll = () => {
    setCategories([]); setArticleTypes([]); setCompanies([]); setDrugs([]);
    setDrugQuery(""); setCompanyQuery(""); setSearchInput(""); setSearch("");
    setDaysBack(30); setSortBy("newest"); setFeedKey((k) => k + 1);
  };

  const handleScrapeNow = async () => {
    setScraping(true); setScrapeResult(null); setScrapeError(null); setAborted(false);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const res = await fetch("/api/news/trigger?force=true", {
        method: "POST", headers: userId ? { "x-user-id": userId } : {}, signal: controller.signal,
      });
      const data: ScrapeResult = await res.json();
      if (!res.ok) setScrapeError(data.error ?? "Scrape failed");
      else { setScrapeResult(data); setFeedKey((k) => k + 1); }
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") setAborted(true);
      else setScrapeError("Network error");
    } finally { setScraping(false); abortRef.current = null; }
  };

  const handleAbortScrape = () => { abortRef.current?.abort(); };

  const handleRestore = async (sourceId: string) => {
    await fetch("/api/news/sources/" + sourceId, {
      method: "PATCH", headers: userId ? { "x-user-id": userId } : {},
    });
    loadSources();
  };

  const hoverProps = (
    setOpen: (v: boolean) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) => ({
    onMouseEnter: () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setOpen(true);
    },
    onMouseLeave: () => { timerRef.current = setTimeout(() => setOpen(false), 150); },
  });

  // ── Dropdown menu style ───────────────────────────────────────────────────────

  const dropdownStyle: React.CSSProperties = {
    background: "#fff",
    border: `1px solid rgba(26,51,88,0.15)`,
    borderRadius: "10px",
    boxShadow: "0 4px 20px rgba(26,51,88,0.12)",
  };

  const dropdownItemStyle = (active: boolean): React.CSSProperties => ({
    color: active ? ACCENT : `rgba(26,51,88,0.80)`,
    fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
    fontWeight: active ? 700 : 500,
    fontSize: "13px",
  });

  return (
    <div className="relative flex flex-col h-full" style={{ background: BG }}>

      {/* Grain */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundRepeat: "repeat", backgroundSize: "200px 200px", opacity: 0.22, pointerEvents: "none", zIndex: 0 }} />

      {/* ── Masthead ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 px-6 pt-4 pb-0 shrink-0" style={{ background: "transparent" }}>
        <div style={{ borderTop: `3px double ${INK}`, paddingTop: "5px" }}>
          <div style={{ borderTop: `1px solid ${INK}`, paddingTop: "5px", paddingBottom: "5px", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", fontWeight: 800, letterSpacing: "0.38em", textTransform: "uppercase", color: INK }}>
              News
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${INK}` }} />
        </div>

        {/* Tab navigation */}
        <div className="flex items-center pt-2.5">
          <div className="flex items-center gap-6">
          {(["feed", "sources", "health"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
                fontSize: "11px", fontWeight: tab === t ? 800 : 600,
                textTransform: "uppercase", letterSpacing: "0.12em",
                color: tab === t ? ACCENT : `rgba(26,51,88,0.45)`,
                borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                paddingBottom: "8px",
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {t === "feed" ? "Articles" : t === "sources" ? "Sources" : "Health"}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Divider below tabs */}
      <div className="relative z-10 shrink-0 px-6" style={{ borderBottom: `1px solid rgba(26,51,88,0.14)` }} />

      {/* Scrape banner */}
      {(scrapeResult || scrapeError || aborted) && (
        <div className="relative z-10 px-6 py-2 flex items-center justify-between text-xs shrink-0"
          style={{
            background: scrapeError ? "rgba(220,38,38,0.07)" : aborted ? "rgba(217,119,6,0.07)" : "rgba(5,150,105,0.07)",
            borderBottom: `1px solid rgba(26,51,88,0.10)`,
            color: scrapeError ? "#dc2626" : aborted ? "#d97706" : "#059669",
            fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
          }}>
          <span>{scrapeError ? "Scrape error: " + scrapeError : aborted ? "Aborted." : scrapeResult?.message ?? "Done."}</span>
          <button onClick={() => { setScrapeResult(null); setScrapeError(null); setAborted(false); }}><X size={10} /></button>
        </div>
      )}

      {/* ── Feed tab ──────────────────────────────────────────────────────────── */}
      {tab === "feed" && (
        <>
          {/* Filter bar — outer px-6 keeps bg contained; white on inner */}
          <div className="relative z-20 px-6 shrink-0">
          <div className="flex items-center flex-wrap gap-2 px-4 py-2.5"
            style={{ borderBottom: `1px solid rgba(26,51,88,0.10)`, background: "#fff" }}>

            {/* Search */}
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0"
              style={{ border: `1px solid rgba(26,51,88,0.18)`, background: "rgba(26,51,88,0.04)", minWidth: 140 }}>
              <Search size={10} style={{ color: `rgba(26,51,88,0.4)`, flexShrink: 0 }} />
              <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search articles…"
                className="bg-transparent outline-none flex-1 min-w-0"
                style={{ fontSize: "11px", color: INK, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }} />
              {searchInput && <button onClick={clearSearch} style={{ color: `rgba(26,51,88,0.4)`, flexShrink: 0 }}><X size={9} /></button>}
            </div>

            {/* Drug filter */}
            <div ref={drugRef} className="relative shrink-0"
              onMouseEnter={() => { if (drugCloseTimer.current) { clearTimeout(drugCloseTimer.current); drugCloseTimer.current = null; } setDrugOpen(true); }}
              onMouseLeave={() => { drugCloseTimer.current = setTimeout(() => setDrugOpen(false), 150); }}>
              <FilterPill active={drugs.length > 0} onClear={(e) => { e.stopPropagation(); setDrugs([]); setDrugQuery(""); }}>
                <Pill size={10} style={{ flexShrink: 0 }} />
                <span>{drugs.length === 0 ? "Drug" : drugs.length === 1 ? drugs[0] : `Drug (${drugs.length})`}</span>
              </FilterPill>
              {drugOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-56" style={dropdownStyle}>
                  <div className="px-3 py-2" style={{ borderBottom: `1px solid rgba(26,51,88,0.10)` }}>
                    <input autoFocus value={drugQuery} onChange={(e) => setDrugQuery(e.target.value)} placeholder="Search drug…"
                      className="w-full bg-transparent outline-none" style={{ fontSize: "11px", color: INK, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }} />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {drugsLoading ? <div className="flex justify-center py-3"><Loader2 size={12} className="animate-spin" style={{ color: `rgba(26,51,88,0.4)` }} /></div>
                      : drugOptions.length === 0 ? <p className="px-3 py-3" style={{ fontSize: "11px", color: `rgba(26,51,88,0.45)`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>No drug data yet</p>
                      : drugOptions.map((d) => { const sel = drugs.includes(d.DRUG_NAME); return (
                          <button key={d.DRUG_NAME} onClick={() => toggleDrug(d.DRUG_NAME)} className="w-full flex items-center justify-between px-3 py-2 hover:bg-black/5 text-left" style={dropdownItemStyle(sel)}>
                            <div className="flex items-center gap-2">{sel ? <Check size={10} /> : <Square size={10} style={{ opacity: 0.3 }} />}<span>{d.DRUG_NAME}</span></div>
                            <span style={{ color: `rgba(26,51,88,0.35)`, fontSize: "10px" }}>{d.ARTICLE_COUNT.toLocaleString()}</span>
                          </button>); })}
                  </div>
                </div>
              )}
            </div>

            {/* Company filter */}
            <div ref={companyRef} className="relative shrink-0"
              onMouseEnter={() => { if (companyCloseTimer.current) { clearTimeout(companyCloseTimer.current); companyCloseTimer.current = null; } setCompanyOpen(true); }}
              onMouseLeave={() => { companyCloseTimer.current = setTimeout(() => setCompanyOpen(false), 150); }}>
              <FilterPill active={companies.length > 0} onClear={(e) => { e.stopPropagation(); setCompanies([]); setCompanyQuery(""); }}>
                <Building2 size={10} style={{ flexShrink: 0 }} />
                <span>{companies.length === 0 ? "Company" : companies.length === 1 ? companies[0] : `Company (${companies.length})`}</span>
              </FilterPill>
              {companyOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-52" style={dropdownStyle}>
                  <div className="px-3 py-2" style={{ borderBottom: `1px solid rgba(26,51,88,0.10)` }}>
                    <input autoFocus value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} placeholder="Search company…"
                      className="w-full bg-transparent outline-none" style={{ fontSize: "11px", color: INK, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }} />
                  </div>
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {companiesLoading ? <div className="flex justify-center py-3"><Loader2 size={12} className="animate-spin" style={{ color: `rgba(26,51,88,0.4)` }} /></div>
                      : companyOptions.filter((c) => !companyQuery || c.toLowerCase().includes(companyQuery.toLowerCase())).map((c) => { const sel = companies.includes(c); return (
                          <button key={c} onClick={() => toggleCompany(c)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left" style={dropdownItemStyle(sel)}>
                            {sel ? <Check size={10} /> : <Square size={10} style={{ opacity: 0.3 }} />}<span>{c}</span>
                          </button>); })}
                  </div>
                </div>
              )}
            </div>

            {/* Doc type filter */}
            <div ref={docTypeRef} className="relative shrink-0" {...hoverProps(setDocTypeOpen, docTypeCloseTimer)}>
              <FilterPill active={articleTypes.length > 0} onClear={articleTypes.length > 0 ? (e) => { e.stopPropagation(); setArticleTypes([]); } : undefined}>
                <span>{pillLabel(articleTypes, ARTICLE_TYPES, "Doc type")}</span>
              </FilterPill>
              {docTypeOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-36" style={dropdownStyle}>
                  {ARTICLE_TYPES.map((t) => { const sel = articleTypes.includes(t.value); return (
                    <button key={t.value} onClick={() => toggleArticleType(t.value)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left" style={dropdownItemStyle(sel)}>
                      {sel ? <Check size={10} /> : <Square size={10} style={{ opacity: 0.3 }} />}{t.label}
                    </button>); })}
                </div>
              )}
            </div>

            {/* Source/category filter */}
            <div ref={sourceRef} className="relative shrink-0" {...hoverProps(setSourceOpen, sourceCloseTimer)}>
              <FilterPill active={categories.length > 0} onClear={categories.length > 0 ? (e) => { e.stopPropagation(); setCategories([]); } : undefined}>
                <span>{pillLabel(categories, CATEGORIES, "Source")}</span>
              </FilterPill>
              {sourceOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-32" style={dropdownStyle}>
                  {CATEGORIES.map((c) => { const sel = categories.includes(c.value); return (
                    <button key={c.value} onClick={() => toggleCategory(c.value)} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/5 text-left" style={dropdownItemStyle(sel)}>
                      {sel ? <Check size={10} /> : <Square size={10} style={{ opacity: 0.3 }} />}{c.label}
                    </button>); })}
                </div>
              )}
            </div>

            {/* Time range */}
            <div ref={timeRef} className="relative shrink-0" {...hoverProps(setTimeOpen, timeCloseTimer)}>
              <FilterPill active={daysBack !== 30}>
                <span>{DAYS_OPTIONS.find((d) => d.value === daysBack)?.label ?? "30d"}</span>
              </FilterPill>
              {timeOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 w-24" style={dropdownStyle}>
                  {DAYS_OPTIONS.map((d) => (
                    <button key={d.value} onClick={() => { setDaysBack(d.value); setTimeOpen(false); }} className="w-full px-3 py-2 hover:bg-black/5 text-left" style={dropdownItemStyle(daysBack === d.value)}>
                      {d.label}
                    </button>))}
                </div>
              )}
            </div>

            {/* Sort */}
            {(() => {
              const sortOptions = [
                ...SORT_BASE,
                ...(categories.length === 0 ? [SORT_SOURCE] : []),
                ...(drugs.length === 0 ? [SORT_DRUG] : []),
                ...(articleTypes.length === 0 ? [SORT_DOCTYPE] : []),
              ];
              const activeLabel = sortOptions.find((s) => s.value === sortBy)?.label ?? "Newest first";
              return (
                <div ref={sortRef} className="relative shrink-0" {...hoverProps(setSortOpen, sortCloseTimer)}>
                  <FilterPill active={sortBy !== "newest"}>
                    <span>Sort: {activeLabel}</span>
                  </FilterPill>
                  {sortOpen && (
                    <div className="absolute top-full right-0 mt-1 z-30 w-40" style={dropdownStyle}>
                      {sortOptions.map((s) => (
                        <button key={s.value} onClick={() => { setSortBy(s.value); setSortOpen(false); }} className="w-full px-3 py-2 hover:bg-black/5 text-left" style={dropdownItemStyle(sortBy === s.value)}>
                          {s.label}
                        </button>))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Clear all */}
            {hasFilters && (
              <button onClick={clearAll} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs shrink-0"
                style={{ border: "1px solid rgba(220,38,38,0.28)", color: "#dc2626", background: "rgba(220,38,38,0.06)", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontWeight: 700 }}>
                <X size={9} />Clear
              </button>
            )}

            {/* Refresh / Abort — icon only, last in row */}
            {scraping ? (
              <button onClick={handleAbortScrape} className="flex items-center justify-center rounded-full shrink-0"
                style={{ width: 28, height: 28, background: "#dc2626", color: "#fff" }}
                title="Abort scrape">
                <StopCircle size={12} />
              </button>
            ) : (
              <button onClick={handleScrapeNow} className="flex items-center justify-center rounded-full shrink-0"
                style={{ width: 28, height: 28, background: BURNT_BLUE, color: "#fff" }}
                title="Refresh articles">
                <RefreshCw size={12} />
              </button>
            )}
          </div>
          </div>

          <div className="relative z-10 flex-1 overflow-y-auto">
            <NewsFeed key={feedKey} filters={filters} userId={userId} onDrugClick={(d) => { toggleDrug(d); setDrugOpen(false); }} />
          </div>
        </>
      )}

      {tab === "sources" && (
        <div className="relative z-10 flex-1 overflow-y-auto">
          <SourcesTab sources={sources} loading={sourcesLoading} userId={userId} onRefresh={loadSources}
            onAddClick={() => setShowAddModal(true)} onDeleteClick={(id, name) => setDeleteTarget({ id, name })} onRestore={handleRestore} />
        </div>
      )}
      {tab === "health" && <div className="relative z-10 flex-1 overflow-y-auto"><HealthTab /></div>}
      {showAddModal && <AddSourceModal userId={userId} onClose={() => setShowAddModal(false)} onAdded={loadSources} />}
      {deleteTarget && <DeleteSourceModal sourceId={deleteTarget.id} sourceName={deleteTarget.name} userId={userId} onClose={() => setDeleteTarget(null)} onDeleted={loadSources} />}
    </div>
  );
}

// ── Sources tab ───────────────────────────────────────────────────────────────

function SourcesTab({ sources, loading, userId: _userId, onRefresh, onAddClick, onDeleteClick, onRestore }: {
  sources: SourceRow[]; loading: boolean; userId?: string;
  onRefresh: () => void; onAddClick: () => void;
  onDeleteClick: (id: string, name: string) => void; onRestore: (id: string) => void;
}) {
  const [subTab, setSubTab] = useState<"active" | "deleted">("active");
  const isTrue = (v: unknown) => v === true || v === "true";
  const active  = sources.filter((s) => !isTrue(s.IS_DELETED));
  const deleted = sources.filter((s) =>  isTrue(s.IS_DELETED));
  const shown   = subTab === "active" ? active : deleted;

  const formatAgo = (ts: string | null) => {
    if (!ts) return "Never";
    const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (mins < 60) return mins + "m ago";
    if (mins < 1440) return Math.round(mins / 60) + "h ago";
    return Math.round(mins / 1440) + "d ago";
  };

  const catLabel: Record<string, string> = { industry_news: "Industry", ir: "Investor", media: "Media", regulatory: "FDA", filings: "SEC" };

  return (
    <div className="flex flex-col">
      <div className="px-6 sticky top-0 z-10" style={{ background: BG }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "#fff", borderBottom: `1px solid rgba(26,51,88,0.12)` }}>
        <div className="flex items-center gap-6">
          {(["active", "deleted"] as const).map((t) => (
            <button key={t} onClick={() => setSubTab(t)}
              className="flex items-center"
              style={{
                fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
                fontSize: "11px", fontWeight: subTab === t ? 800 : 600,
                textTransform: "uppercase", letterSpacing: "0.10em",
                color: subTab === t ? ACCENT : `rgba(26,51,88,0.4)`,
                borderBottom: subTab === t ? `2px solid ${ACCENT}` : "2px solid transparent",
                padding: "4px 0",
              }}>
              {t === "active" ? `Active (${active.length})` : `Removed (${deleted.length})`}
            </button>
          ))}
        </div>
        {subTab === "active" && (
          <button onClick={onAddClick}
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 28, height: 28, background: ACCENT, color: "#fff" }}
            title="Add source">
            <Plus size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
      </div>

      {shown.length === 0 && (
        <div className="px-6 py-12 text-center">
          <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", color: `rgba(26,51,88,0.4)` }}>
            {subTab === "active" ? "No active sources" : "No removed sources"}
          </p>
        </div>
      )}

      {shown.map((src) => (
        <div key={src.SOURCE_ID} style={{ borderBottom: `1px solid rgba(26,51,88,0.08)` }}>
          <div className="flex items-start gap-3 px-6 py-3">
            <div className="mt-0.5 shrink-0 pt-0.5">
              {isTrue(src.IS_ACTIVE)
                ? <Wifi size={11} style={{ color: "#059669" }} />
                : <WifiOff size={11} style={{ color: `rgba(26,51,88,0.3)` }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "12px", fontWeight: 700, color: INK }}>{src.SOURCE_NAME}</p>
                <span style={{ padding: "1px 7px", borderRadius: "999px", background: "rgba(26,51,88,0.07)", color: `rgba(26,51,88,0.5)`, fontSize: "9px", fontWeight: 700, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {catLabel[src.CATEGORY] ?? src.CATEGORY}
                </span>
                <span style={{ padding: "1px 7px", borderRadius: "999px", background: "rgba(26,51,88,0.07)", color: `rgba(26,51,88,0.5)`, fontSize: "9px", fontWeight: 700, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {src.FETCH_METHOD}
                </span>
              </div>
              {src.COMPANY && <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "11px", color: `rgba(26,51,88,0.45)`, marginTop: "1px" }}>{src.COMPANY}</p>}
              {isTrue(src.IS_DELETED) ? (
                <div className="mt-0.5">
                  {src.DELETED_BY && <p style={{ fontSize: "10px", color: `rgba(26,51,88,0.4)`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>Removed by {src.DELETED_BY}</p>}
                  {src.DELETE_REASON && <p style={{ fontSize: "10px", color: `rgba(26,51,88,0.4)`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>Reason: {src.DELETE_REASON}</p>}
                </div>
              ) : src.ADDED_BY ? (
                <p style={{ fontSize: "10px", color: `rgba(26,51,88,0.4)`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", marginTop: "1px" }}>Added by {src.ADDED_BY}</p>
              ) : null}
            </div>
            <div className="flex items-start gap-2 shrink-0">
              <div className="text-right">
                <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "11px", fontWeight: 700, color: INK, tabularNums: "true" } as React.CSSProperties}>
                  {(src.ARTICLE_COUNT ?? 0).toLocaleString()} articles
                </p>
                <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: `rgba(26,51,88,0.4)` }}>
                  Scraped {formatAgo(src.LAST_SCRAPED_AT)}
                </p>
              </div>
              {isTrue(src.IS_DELETED) ? (
                <button onClick={() => onRestore(src.SOURCE_ID)} className="p-1.5 rounded-full hover:bg-black/5" style={{ color: ACCENT }}><RotateCcw size={12} /></button>
              ) : (
                <button onClick={() => onDeleteClick(src.SOURCE_ID, src.SOURCE_NAME)} className="p-1.5 rounded-full hover:bg-black/5" style={{ color: `rgba(26,51,88,0.35)` }}><Trash2 size={12} /></button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
