"use client";

import { useState } from "react";
import { X, Plus, Loader2 } from "lucide-react";

interface Props {
  userId?: string;
  onClose:  () => void;
  onAdded:  () => void;
}

const CATEGORIES = [
  { value: "industry_news", label: "Industry News" },
  { value: "ir",            label: "Investor Relations" },
  { value: "media",         label: "Media / Newsroom" },
  { value: "regulatory",    label: "Regulatory (FDA)" },
  { value: "filings",       label: "Filings (SEC)" },
];

const INTERVALS = [
  { value: 60,   label: "Every hour"    },
  { value: 120,  label: "Every 2 hours" },
  { value: 240,  label: "Every 4 hours" },
  { value: 480,  label: "Every 8 hours" },
  { value: 1440, label: "Once a day"    },
];

export default function AddSourceModal({ userId, onClose, onAdded }: Props) {
  const [sourceName,   setSourceName]   = useState("");
  const [baseUrl,      setBaseUrl]      = useState("");
  const [category,     setCategory]     = useState("media");
  const [company,      setCompany]      = useState("");
  const [targetDrugs,  setTargetDrugs]  = useState("");
  const [fetchMethod,  setFetchMethod]  = useState<"rss" | "html">("html");
  const [rssUrl,       setRssUrl]       = useState("");
  const [listingUrl,   setListingUrl]   = useState("");
  const [intervalMin,  setIntervalMin]  = useState(240);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/news/sources", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({
          sourceName,
          baseUrl,
          category,
          company:      company || undefined,
          targetDrugs:  targetDrugs.trim() || undefined,
          fetchMethod,
          rssUrl:       fetchMethod === "rss"  ? rssUrl      : undefined,
          listingUrl:   fetchMethod === "html" ? listingUrl  : undefined,
          intervalMin,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add source");
        return;
      }
      onAdded();
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = sourceName.trim() && baseUrl.trim()
    && (fetchMethod === "rss" ? rssUrl.trim() : listingUrl.trim());

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Plus size={14} style={{ color: "var(--accent)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Add News Source
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">

            {/* Source name */}
            <Field label="Source Name" required>
              <input
                type="text"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="e.g. STAT News"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  "--tw-ring-color": "var(--accent)",
                } as React.CSSProperties}
              />
            </Field>

            {/* Base URL */}
            <Field label="Website URL" required>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://statnews.com"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              />
            </Field>

            {/* Category + Company */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" required>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Company (optional)">
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Pfizer"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                />
              </Field>
            </div>

            {/* Drug focus */}
            <Field label="Drug Focus (optional)">
              <input
                type="text"
                value={targetDrugs}
                onChange={(e) => setTargetDrugs(e.target.value)}
                placeholder="e.g. semaglutide, tirzepatide"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{
                  border:     "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color:      "var(--text-primary)",
                }}
              />
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Comma-separated drug names. Helps the AI prioritise extraction from this source.
              </p>
            </Field>

            {/* Fetch method toggle */}
            <Field label="Feed Type" required>
              <div className="flex rounded-full overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {(["rss", "html"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setFetchMethod(m)}
                    className="flex-1 py-2 text-sm font-medium transition-colors"
                    style={fetchMethod === m
                      ? { background: "var(--accent)", color: "#fff" }
                      : { background: "var(--bg-secondary)", color: "var(--text-muted)" }}
                  >
                    {m === "rss" ? "RSS Feed" : "Web Page"}
                  </button>
                ))}
              </div>
            </Field>

            {/* Method-specific URL */}
            {fetchMethod === "rss" ? (
              <Field label="RSS Feed URL" required>
                <input
                  type="url"
                  value={rssUrl}
                  onChange={(e) => setRssUrl(e.target.value)}
                  placeholder="https://statnews.com/feed/"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Direct URL to the RSS or Atom feed
                </p>
              </Field>
            ) : (
              <Field label="News Listing Page URL" required>
                <input
                  type="url"
                  value={listingUrl}
                  onChange={(e) => setListingUrl(e.target.value)}
                  placeholder="https://statnews.com/news"
                  className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  URL of the page listing news articles
                </p>
              </Field>
            )}

            {/* Scrape interval */}
            <Field label="Scrape Interval">
              <select
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              >
                {INTERVALS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </Field>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", color: "var(--danger)" }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 flex items-center justify-end gap-2 shrink-0"
            style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors hover:bg-black/5"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--accent)" }}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {submitting ? "Adding…" : "Add Source"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}
