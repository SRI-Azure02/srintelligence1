"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, CheckCircle, AlertCircle, AlertTriangle, Clock,
  Wifi, WifiOff, Zap, BarChart2, Newspaper,
} from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────────────────────

const INK       = "#1A3358";
const ACCENT    = "#E26B2C";
const BURNT_BLUE = "#2E7BA1";
const BG        = "#F5F5F5";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthSummary {
  activeSources: number;
  totalSources:  number;
  overdueCount:  number;
  articlesTotal: number;
  articles24h:   number;
  lastCronAt:    string | null;
  lastManualAt:  string | null;
}

interface SourceHealth {
  SOURCE_ID:           string;
  SOURCE_NAME:         string;
  CATEGORY:            string;
  COMPANY:             string | null;
  IS_ACTIVE:           boolean;
  SCRAPE_INTERVAL_MIN: number;
  LAST_SCRAPED_AT:     string | null;
  MINS_SINCE_SCRAPE:   number | null;
  IS_OVERDUE:          boolean;
  ARTICLES_24H:        number;
  ARTICLES_7D:         number;
  ARTICLES_TOTAL:      number;
  LAST_RUN_AT:         string | null;
  LAST_RUN_SOURCE:     string | null;
  ERRORS_7D:           number;
  INSERTED_7D:         number;
  RUNS_7D:             number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const isTrue = (v: unknown) => v === true || v === "true";

function isBrokenFeed(src: SourceHealth): boolean {
  return isTrue(src.IS_ACTIVE) && src.RUNS_7D >= 3 && src.INSERTED_7D === 0;
}

function fmtAgo(ts: string | null): string {
  if (!ts) return "Never";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60_000);
  if (mins < 1)    return "Just now";
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function fmtInterval(mins: number): string {
  if (mins < 60)   return `${mins}m`;
  if (mins < 1440) return `${mins / 60}h`;
  return `${mins / 1440}d`;
}

function fmtTime(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const CATEGORY_COLOR: Record<string, string> = {
  regulatory:    "#dc2626",
  filings:       "#1d4ed8",
  industry_news: "#7c3aed",
  ir:            "#0d7490",
  media:         "#6b7280",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, sub, highlight, highlightAmber,
}: {
  label:           string;
  value:           string;
  icon:            React.ReactNode;
  sub?:            string;
  highlight?:      boolean;
  highlightAmber?: boolean;
}) {
  const bg     = highlight ? "rgba(220,38,38,0.06)" : highlightAmber ? "rgba(217,119,6,0.06)" : "rgba(26,51,88,0.04)";
  const border = highlight ? "rgba(220,38,38,0.20)" : highlightAmber ? "rgba(217,119,6,0.20)"  : "rgba(26,51,88,0.10)";
  const color  = highlight ? "#dc2626"              : highlightAmber ? "#d97706"                : INK;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg px-4 py-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: `rgba(26,51,88,0.45)` }}>
          {label}
        </span>
      </div>
      <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "18px", fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: `rgba(26,51,88,0.4)` }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HealthTab() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<"all" | "overdue" | "broken" | "healthy">("all");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/news/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setSummary(d.summary);
        setSources(d.sources ?? []);
      })
      .catch((e) => setError(e.message ?? "Failed to load health data"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const brokenCount = sources.filter(isBrokenFeed).length;

  const shown = sources.filter((s) => {
    if (filter === "overdue") return isTrue(s.IS_OVERDUE);
    if (filter === "broken")  return isBrokenFeed(s);
    if (filter === "healthy") return !isTrue(s.IS_OVERDUE) && isTrue(s.IS_ACTIVE) && !isBrokenFeed(s);
    return true;
  });

  return (
    <div className="flex flex-col">

      {/* Toolbar — outer px-6 contains white bg within content boundaries */}
      <div className="px-6 sticky top-0 z-10" style={{ background: BG }}>
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "#fff", borderBottom: `1px solid rgba(26,51,88,0.12)` }}>
        <div className="flex items-center gap-6">
          {([
            { key: "all",     label: "All" },
            { key: "broken",  label: `Broken${brokenCount > 0 ? ` (${brokenCount})` : ""}` },
            { key: "overdue", label: `Overdue${summary && summary.overdueCount > 0 ? ` (${summary.overdueCount})` : ""}` },
            { key: "healthy", label: "Healthy" },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className="flex items-center"
              style={{
                fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
                fontSize: "11px", fontWeight: filter === key ? 800 : 600,
                textTransform: "uppercase", letterSpacing: "0.10em",
                color: filter === key ? (key === "broken" ? "#d97706" : ACCENT) : `rgba(26,51,88,0.4)`,
                borderBottom: filter === key ? `2px solid ${key === "broken" ? "#d97706" : ACCENT}` : "2px solid transparent",
                padding: "4px 0",
              }}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center justify-center rounded-full shrink-0 disabled:opacity-40"
          style={{ width: 28, height: 28, background: BURNT_BLUE, color: "#fff" }}
          title="Refresh health data">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-lg" style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.18)" }}>
          <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", color: "#dc2626" }}>
            {error.toLowerCase().includes("token") && error.toLowerCase().includes("expired")
              ? "Snowflake access token expired — update SNOWFLAKE_PAT in environment variables and redeploy."
              : error}
          </p>
        </div>
      )}

      {/* Summary cards */}
      {summary && (
        <div className="px-5 py-4 flex flex-col gap-3" style={{ borderBottom: `1px solid rgba(26,51,88,0.10)` }}>

          {/* Row 1: Active Sources · Overdue · Broken Feeds */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Active Sources"
              value={`${summary.activeSources} / ${summary.totalSources}`}
              icon={<Wifi size={12} style={{ color: "#059669" }} />}
            />
            <StatCard
              label="Overdue"
              value={String(summary.overdueCount)}
              icon={<AlertCircle size={12} style={{ color: summary.overdueCount > 0 ? "#dc2626" : `rgba(26,51,88,0.3)` }} />}
              highlight={summary.overdueCount > 0}
            />
            <StatCard
              label="Broken Feeds"
              value={String(brokenCount)}
              icon={<AlertTriangle size={12} style={{ color: brokenCount > 0 ? "#d97706" : `rgba(26,51,88,0.3)` }} />}
              highlightAmber={brokenCount > 0}
            />
          </div>

          {/* Row 2: Total Articles · Articles in 24h */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Total Articles"
              value={summary.articlesTotal.toLocaleString()}
              icon={<Newspaper size={12} style={{ color: `rgba(26,51,88,0.4)` }} />}
            />
            <StatCard
              label="Articles in 24h"
              value={summary.articles24h.toLocaleString()}
              icon={<BarChart2 size={12} style={{ color: ACCENT }} />}
            />
          </div>

          {/* Row 3: Last Scheduled Run · Last Manual Run */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Last Scheduled Run"
              value={fmtAgo(summary.lastCronAt)}
              icon={<Clock size={12} style={{ color: `rgba(26,51,88,0.4)` }} />}
              sub={fmtTime(summary.lastCronAt)}
            />
            <StatCard
              label="Last Manual Run"
              value={fmtAgo(summary.lastManualAt)}
              icon={<Zap size={12} style={{ color: ACCENT }} />}
              sub={fmtTime(summary.lastManualAt)}
            />
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && sources.length === 0 && (
        <div className="flex flex-col">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: `1px solid rgba(26,51,88,0.08)` }}>
              <div className="h-3 w-3 rounded-full animate-pulse" style={{ background: `rgba(26,51,88,0.08)` }} />
              <div className="flex-1 h-3 rounded animate-pulse"   style={{ background: `rgba(26,51,88,0.08)` }} />
              <div className="h-3 w-16 rounded animate-pulse"     style={{ background: `rgba(26,51,88,0.08)` }} />
            </div>
          ))}
        </div>
      )}

      {/* Per-source rows */}
      {shown.map((src) => {
        const catColor = CATEGORY_COLOR[src.CATEGORY] ?? "#6b7280";
        const broken   = isBrokenFeed(src);
        const status   = !isTrue(src.IS_ACTIVE) ? "inactive"
                       : broken                 ? "broken"
                       : isTrue(src.IS_OVERDUE) ? "overdue"
                       : "healthy";

        return (
          <div key={src.SOURCE_ID} className="flex items-start gap-3 px-5 py-3" style={{ borderBottom: `1px solid rgba(26,51,88,0.07)` }}>

            {/* Status icon */}
            <div className="mt-0.5 shrink-0">
              {status === "healthy"  && <CheckCircle   size={12} style={{ color: "#059669" }} />}
              {status === "broken"   && <AlertTriangle size={12} style={{ color: "#d97706" }} />}
              {status === "overdue"  && <AlertCircle   size={12} style={{ color: "#dc2626" }} />}
              {status === "inactive" && <WifiOff       size={12} style={{ color: `rgba(26,51,88,0.3)` }} />}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "13px", fontWeight: 700, color: INK }}>
                  {src.SOURCE_NAME}
                </p>
                <span style={{ padding: "1px 7px", borderRadius: "999px", background: `${catColor}18`, color: catColor, fontSize: "9px", fontWeight: 700, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {src.CATEGORY.replace("_", " ")}
                </span>
                {src.LAST_RUN_SOURCE === "manual" && (
                  <span style={{ padding: "1px 7px", borderRadius: "999px", background: `rgba(226,107,44,0.10)`, color: ACCENT, fontSize: "9px", fontWeight: 700, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    manual
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: `rgba(26,51,88,0.45)` }}>
                  Scraped <strong>{fmtAgo(src.LAST_SCRAPED_AT)}</strong>
                </span>
                <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: `rgba(26,51,88,0.35)` }}>
                  Interval: {fmtInterval(src.SCRAPE_INTERVAL_MIN)}
                </span>
                {src.RUNS_7D > 0 && (
                  <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: `rgba(26,51,88,0.35)` }}>
                    {src.RUNS_7D} runs (7d)
                  </span>
                )}
              </div>
              {broken && (
                <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: "#d97706", marginTop: "2px" }}>
                  No new articles in 7d — verify feed URL
                </p>
              )}
            </div>

            {/* Right stats */}
            <div className="shrink-0 text-right flex flex-col gap-0.5">
              <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "12px", fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>
                {src.ARTICLES_24H} <span style={{ color: `rgba(26,51,88,0.4)`, fontWeight: 400, fontSize: "10px" }}>24h</span>
                {"  "}
                {src.ARTICLES_7D} <span style={{ color: `rgba(26,51,88,0.4)`, fontWeight: 400, fontSize: "10px" }}>7d</span>
              </p>
              {src.ERRORS_7D > 0 ? (
                <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: "#dc2626" }}>
                  {src.ERRORS_7D} error{src.ERRORS_7D !== 1 ? "s" : ""} (7d)
                </p>
              ) : src.RUNS_7D > 0 ? (
                <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", color: "#059669" }}>No errors</p>
              ) : null}
            </div>
          </div>
        );
      })}

      {!loading && shown.length === 0 && !error && (
        <div className="px-5 py-12 text-center">
          <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", color: `rgba(26,51,88,0.4)` }}>
            {filter === "overdue" ? "No overdue sources — all caught up"
           : filter === "broken"  ? "No broken feeds detected"
           : "No sources found"}
          </p>
        </div>
      )}
    </div>
  );
}
