"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import ChatInput from "@/components/chat/ChatInput";

// ── Brand tokens ──────────────────────────────────────────────────────────────

const SRI = {
  ink:    "#1A3358",
  accent: "#E26B2C",
  white:  "#FFFFFF",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewsArticle {
  ARTICLE_ID: string;
  TITLE: string;
  SUMMARY: string;
  SOURCE_NAME: string;
  PUBLISHED_AT: string;
  CANONICAL_URL: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getGreeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}


// ── Paper texture SVGs ────────────────────────────────────────────────────────
// Layer 1: fine grain (high frequency) — the paper fibre texture
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
  <filter id='g'>
    <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/>
    <feColorMatrix type='saturate' values='0'/>
  </filter>
  <rect width='200' height='200' filter='url(#g)' opacity='1'/>
</svg>`;

// Layer 2: low-frequency turbulence — the gentle undulations of micro-crumpled paper
// Lower baseFrequency = larger features = looks like shallow surface wrinkles
const CRUMPLE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'>
  <filter id='c'>
    <feTurbulence type='turbulence' baseFrequency='0.018 0.022' numOctaves='5' seed='7' stitchTiles='stitch'/>
    <feColorMatrix type='saturate' values='0'/>
  </filter>
  <rect width='600' height='600' filter='url(#c)' opacity='1'/>
</svg>`;

const GRAIN_URL   = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;
const CRUMPLE_URL = `url("data:image/svg+xml,${encodeURIComponent(CRUMPLE_SVG)}")`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [greeting, setGreeting] = useState<string | null>(null);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => { setGreeting(getGreeting(new Date().getHours())); }, []);

  useEffect(() => {
    fetch("/api/news?limit=6&sortBy=newest&daysBack=7")
      .then((r) => r.json())
      .then((d) => setNews(d.articles ?? []))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, []);

  const focusPrompt = useCallback(() => {
    (document.querySelector("textarea") as HTMLTextAreaElement | null)?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); focusPrompt(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusPrompt]);

  const handleSubmit = (query: string) => {
    const id = newThreadId();
    sessionStorage.setItem(`pendingQuery:${id}`, query);
    router.push(`/chat/${id}`);
  };

  const handlePlan = (query: string) => {
    const id = newThreadId();
    sessionStorage.setItem(`pendingPlan:${id}`, query);
    router.push(`/chat/${id}`);
  };

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden"
      style={{ background: "#F5F5F5" }}
    >
      {/* Fine grain — paper fibre texture */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundRepeat: "repeat", backgroundSize: "200px 200px", opacity: 0.22, pointerEvents: "none", zIndex: 0 }} />

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-start px-6 gap-4 overflow-auto pt-4 pb-8">

        {/* Newspaper section */}
        <div className="w-full max-w-3xl">

          {/* Greeting */}
          <p className="mb-6 text-center" style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "26px", fontWeight: 600, color: SRI.ink, letterSpacing: "-0.02em", minHeight: "1.6rem" }}>
            {greeting ?? " "}
          </p>

          {/* Masthead — double rule top, single rule bottom */}
          <div style={{ borderTop: `3px double ${SRI.ink}`, paddingTop: "5px" }}>
            <div style={{ borderTop: `1px solid ${SRI.ink}`, paddingTop: "4px", paddingBottom: "4px", textAlign: "center" }}>
              <span
                style={{
                  fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.38em",
                  textTransform: "uppercase",
                  color: SRI.ink,
                }}
              >
                Pharma Intelligence
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${SRI.ink}` }} />
          </div>

          {/* Edition line */}
          <div className="py-1">
            <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "9px", color: SRI.ink, opacity: 0.45 }}>
              Latest dispatches — updated continuously
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${SRI.ink}` }} />

          {newsLoading ? (
            <div className="space-y-3 pt-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse border-b pb-3" style={{ borderColor: `${SRI.ink}18` }}>
                  <div className="h-4 rounded w-3/4 mb-1" style={{ background: `${SRI.ink}14` }} />
                  <div className="h-2.5 rounded w-1/3" style={{ background: `${SRI.ink}0e` }} />
                </div>
              ))}
            </div>
          ) : news.length === 0 ? (
            <p className="text-center text-sm py-8" style={{ color: SRI.ink, opacity: 0.4, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>
              No recent news available.
            </p>
          ) : (
            <div>
              {/* Lead story */}
              {(() => {
                const lead = news[0];
                return (
                  <div
                    className="group cursor-pointer pt-3 pb-5"
                    style={{ borderBottom: `1px solid ${SRI.ink}` }}
                    onClick={() => lead.CANONICAL_URL && window.open(lead.CANONICAL_URL, "_blank")}
                  >
                    <p
                      className="leading-tight mb-4 group-hover:underline"
                      style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "26px", fontWeight: 700, color: SRI.ink, letterSpacing: "-0.01em" }}
                    >
                      {lead.TITLE}
                    </p>
                    {lead.SUMMARY && (
                      <p
                        className="mb-2 leading-snug"
                        style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "14px", color: SRI.ink, opacity: 0.88 }}
                      >
                        {lead.SUMMARY.length > 160 ? lead.SUMMARY.slice(0, 157) + "…" : lead.SUMMARY}
                      </p>
                    )}
                    <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.13em", color: SRI.accent }}>
                      {lead.SOURCE_NAME}&ensp;·&ensp;{timeAgo(lead.PUBLISHED_AT)}
                    </p>
                  </div>
                );
              })()}

              {/* Secondary stories — two-column grid, no column rule */}
              <div className="grid grid-cols-2" style={{ columnGap: 0 }}>
                {news.slice(1).map((article, i) => (
                  <div
                    key={article.ARTICLE_ID}
                    className="group cursor-pointer transition-colors duration-150"
                    style={{
                      paddingTop: "20px",
                      paddingBottom: "20px",
                      paddingLeft: i % 2 === 0 ? "0" : "20px",
                      paddingRight: i % 2 === 0 ? "20px" : "0",
                      borderTop: `1px solid ${SRI.ink}28`,
                    }}
                    onClick={() => article.CANONICAL_URL && window.open(article.CANONICAL_URL, "_blank")}
                  >
                    <p
                      className="leading-snug mb-3 group-hover:underline"
                      style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: "13px", fontWeight: 700, color: SRI.ink }}
                    >
                      {article.TITLE}
                    </p>
                    {article.SUMMARY && (
                      <p
                        className="mb-1 leading-snug"
                        style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "13px", color: SRI.ink, opacity: 0.85 }}
                      >
                        {article.SUMMARY.length > 80 ? article.SUMMARY.slice(0, 77) + "…" : article.SUMMARY}
                      </p>
                    )}
                    <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.11em", color: SRI.accent }}>
                      {article.SOURCE_NAME}&ensp;·&ensp;{timeAgo(article.PUBLISHED_AT)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat prompt — pinned bottom */}
      <div className="relative z-10 pb-6 w-full max-w-3xl mx-auto">
        <ChatInput
          placeholder="Ask your question…"
          onSubmit={handleSubmit}
          onPlan={handlePlan}
          autoFocus
        />
      </div>

    </div>
  );
}
