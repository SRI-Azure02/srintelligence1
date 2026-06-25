"use client";

import { useState, useRef } from "react";
import {
  X, Plus, GripVertical, Trash2,
  FileText, TrendingUp, Search, CheckSquare,
  Newspaper, MessageSquareQuote, BarChart2, Layers, GitPullRequestArrow,
} from "lucide-react";
import type { ChatMessage } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SectionType =
  | "summary" | "findings" | "chart" | "pull_quote"
  | "analysis" | "recommendations" | "market_intel" | "custom";

export interface BriefSection {
  id: string;
  type: SectionType;
  title: string;
  description: string;
  required?: boolean;
  column: "main" | "sidebar";
}

interface Props {
  messages: ChatMessage[];
  onBuild: (sections: BriefSection[]) => void;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Brand tokens
// ─────────────────────────────────────────────────────────────────────────────

const INK    = "#1A3358";
const ACCENT = "#E26B2C";
const BG     = "#F5F5F5";

const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(%23n)' opacity='1'/></svg>`;
const GRAIN_URL = `url("data:image/svg+xml,${GRAIN_SVG}")`;

// ─────────────────────────────────────────────────────────────────────────────
// Icon map
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_ICON: Record<SectionType, React.ElementType> = {
  summary:          FileText,
  findings:         Search,
  chart:            BarChart2,
  pull_quote:       MessageSquareQuote,
  analysis:         TrendingUp,
  recommendations:  CheckSquare,
  market_intel:     Newspaper,
  custom:           Layers,
};

const SECTION_COLOR: Record<SectionType, string> = {
  summary:          INK,
  findings:         "#0d7490",
  chart:            "#7c3aed",
  pull_quote:       ACCENT,
  analysis:         "#059669",
  recommendations:  ACCENT,
  market_intel:     "#2891DA",
  custom:           "#6b7280",
};

// ─────────────────────────────────────────────────────────────────────────────
// Section planner — derives planned sections from chat messages
// ─────────────────────────────────────────────────────────────────────────────

// Extract drug / brand names from text (Title-Case words 3+ chars, not common stopwords)
const STOP = new Set(["The","And","For","With","From","This","That","Show","Give","What","How","Can","Per","All","Its","Are","Was","Has","Have","Been","Will","Would","When","Which","Their","There","These","About","After","Into","Over","More"]);
function extractProducts(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,})?\b/g) ?? [];
  return [...new Set(matches.filter((w) => !STOP.has(w)))].slice(0, 4);
}

// Extract timeframe keywords from text
function extractTimeframe(text: string): string {
  const m =
    text.match(/\b(H[12]\s*20\d\d|Q[1-4]\s*20\d\d|20\d\d(?:\s*[-–]\s*20\d\d)?|Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i);
  return m ? m[0] : "";
}

// First substantive sentence — skips column lists, SQL output, all-caps variable names
function leadSentence(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^[•\-*#>*]+\s*/, "").trim())
    .filter((l) => l.length > 40)
    // Skip lines that look like column dumps or SQL artefacts
    .filter((l) => !/^Columns?:/i.test(l))
    .filter((l) => !/^\s*(SELECT|FROM|WHERE|JOIN|GROUP|ORDER|LIMIT)\b/i.test(l))
    // Skip lines with 3+ ALL_CAPS_SNAKE tokens (raw column names)
    .filter((l) => (l.match(/\b[A-Z][A-Z_]{3,}\b/g) ?? []).length < 3);
  const sentence = lines[0] ?? "";
  return sentence.length > 130 ? sentence.slice(0, 127) + "…" : sentence;
}

// Extract cohort filters from user text in plain English (no column names)
function extractCohortDesc(userText: string): string {
  const parts: string[] = [];
  // Provider type
  const providerMatch = userText.match(/\b(physician|prescriber|specialist|cardiologist|oncologist|hematologist|neurologist|hcp|provider|territory|rep)\b/i);
  if (providerMatch) parts.push(providerMatch[0].toLowerCase() + "s");
  // Geography
  const geoMatches = userText.match(/\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\s+Hampshire|New\s+Jersey|New\s+Mexico|New\s+York|North\s+Carolina|North\s+Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\s+Island|South\s+Carolina|South\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\s+Virginia|Wisconsin|Wyoming|[A-Z]{2})\b/g);
  if (geoMatches) parts.push(`in ${[...new Set(geoMatches)].slice(0, 3).join(", ")}`);
  // Specialty filter
  const specMatch = userText.match(/\b(specialty|specialt(?:y|ies)|indication|class|tier)\b[^.]{0,40}/i);
  if (specMatch) parts.push(specMatch[0].trim().toLowerCase());
  // Product
  const products = extractProducts(userText);
  if (products.length) parts.push(`prescribing ${products.join(", ")}`);
  return parts.length ? parts.join(" ") : "";
}

// Describe an agent section from its narrative content
function agentDesc(name: string, msg?: ChatMessage, userText?: string): string {
  const narrative = [msg?.content, msg?.mTreeNarrative, msg?.causalNarrative, msg?.clusterNarrative].filter(Boolean).join(" ");
  const lead = narrative ? leadSentence(narrative) : "";

  if (/Forecast/i.test(name)) {
    const model = (msg?.forecastData as Record<string,unknown>)?.model_used as string | undefined;
    const horizon = (msg?.forecastData as Record<string,unknown>)?.forecast_periods as number | undefined;
    const parts: string[] = [];
    if (model) parts.push(`Model: ${model}`);
    if (horizon) parts.push(`${horizon}-period horizon`);
    const base = parts.length ? parts.join(" · ") + ". " : "";
    return lead ? `${base}${lead}` : `${base}Quantitative demand projection with actual vs. forecast trend, model accuracy, and confidence intervals.`;
  }
  if (/Causal/i.test(name)) {
    return lead || "Causal driver analysis ranking factors by their impact on prescription volume, with coefficient estimates and significance levels.";
  }
  if (/Cluster|Segment/i.test(name)) {
    const k = (msg?.segmentData as Record<string,unknown>)?.k as number | undefined;
    const base = k ? `${k}-segment prescriber clustering. ` : "";
    return lead ? `${base}${lead}` : `${base}Prescriber segmentation revealing natural behavioral groupings, with segment profiles and sizing.`;
  }
  if (/MTree|Meta.?Tree/i.test(name)) {
    return lead || "Decision-tree market decomposition with driver sub-segments, share impact by node, and waterfall attribution.";
  }
  if (/Analyst|Analytics/i.test(name)) {
    // Describe the cohort in plain English — no column names
    const cohort = userText ? extractCohortDesc(userText) : "";
    const rowCount = msg?.tableData?.rows.length ?? 0;
    const parts: string[] = [];
    if (cohort) parts.push(`Cohort: ${cohort}.`);
    if (rowCount > 0) parts.push(`${rowCount} records returned.`);
    const base = parts.join(" ");
    return base ? `${base} ${lead || "Tabular breakdown with volume metrics and trend summary."}`.trim()
                : lead || "Structured cohort query with filters applied to the target population, showing volume breakdown and trend metrics.";
  }
  return lead || "Analysis output from the SRI Analytics Engine.";
}

export function planBriefSections(messages: ChatMessage[]): BriefSection[] {
  const userMsgs  = messages.filter((m) => m.role === "user");
  const agentMsgs = messages.filter((m) => m.role === "agent");

  const allUserText = userMsgs.map((m) => m.content).join(" ");
  const products    = extractProducts(allUserText);
  const timeframe   = extractTimeframe(allUserText);
  const productStr  = products.length ? products.join(", ") : "the specified products";
  const periodStr   = timeframe ? ` for ${timeframe}` : "";

  const hasForecast = agentMsgs.some((m) => m.forecastData && Object.keys(m.forecastData).length > 0);
  const hasChart    = agentMsgs.some((m) => (m.chartData?.length ?? 0) > 0 || (m.tableData?.rows.length ?? 0) > 0);

  // Unique agent names + their last message (most complete narrative)
  const seenAgents = new Set<string>();
  const agentEntries: { name: string; msg: ChatMessage }[] = [];
  for (const m of [...agentMsgs].reverse()) {
    const name = m.agentActivity?.routedTo;
    if (name && !seenAgents.has(name)) { seenAgents.add(name); agentEntries.unshift({ name, msg: m }); }
  }

  const sections: BriefSection[] = [];

  // ── Main column ────────────────────────────────────────────────────────────
  const primaryQ = userMsgs[0]?.content?.slice(0, 100) ?? "";
  sections.push({
    id: "summary", type: "summary", column: "main", required: true,
    title: "Executive Summary",
    description: `Synthesises findings from ${agentEntries.length} agent${agentEntries.length !== 1 ? "s" : ""} around the primary question: "${primaryQ}${primaryQ.length >= 100 ? "…" : ""}". Covers business context, analytical approach, and headline result.`,
  });

  if (hasForecast) {
    const forecastMsg = [...agentMsgs].reverse().find((m) => m.forecastData && Object.keys(m.forecastData).length > 0);
    const model   = (forecastMsg?.forecastData as Record<string,unknown>)?.model_used as string | undefined;
    const horizon = (forecastMsg?.forecastData as Record<string,unknown>)?.forecast_periods as number | undefined;
    const parts: string[] = [`Actual vs. forecast chart for ${productStr}${periodStr}`];
    if (model)   parts.push(`model: ${model}`);
    if (horizon) parts.push(`${horizon}-period horizon`);
    sections.push({
      id: "forecast_chart", type: "chart", column: "main",
      title: "Forecast Chart",
      description: parts.join(" · ") + ". Rendered as an area/line overlay with confidence bands.",
    });
  } else if (hasChart) {
    const chartMsg = [...agentMsgs].reverse().find((m) => (m.chartData?.length ?? 0) > 0 || (m.tableData?.rows.length ?? 0) > 0);
    const headers  = chartMsg?.tableData?.headers?.slice(0, 4).join(", ");
    const rowCount = chartMsg?.tableData?.rows.length ?? chartMsg?.chartData?.length ?? 0;
    sections.push({
      id: "analysis_chart", type: "chart", column: "main",
      title: "Analysis Chart",
      description: headers
        ? `Top ${rowCount > 0 ? rowCount + "-row " : ""}breakdown by ${headers} for ${productStr}${periodStr}.`
        : `Volume or share breakdown for ${productStr}${periodStr}, rendered as a horizontal bar chart.`,
    });
  }

  for (const { name, msg } of agentEntries) {
    sections.push({
      id: `analysis_${name.replace(/\s+/g, "_")}`, type: "analysis", column: "main",
      title: name,
      description: agentDesc(name, msg, allUserText),
    });
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────

  // Pull quote — try to surface a real line from the narratives
  const allNarratives = agentMsgs.map((m) => [m.content, m.mTreeNarrative, m.causalNarrative, m.clusterNarrative].filter(Boolean).join(" ")).join(" ");
  const pullLead = leadSentence(allNarratives);
  sections.push({
    id: "pull_quote", type: "pull_quote", column: "sidebar",
    title: "Pull Quote",
    description: pullLead
      ? `The most commercially significant single finding — e.g. "${pullLead}" — set as a large callout.`
      : `The single most commercially significant finding from ${productStr}${periodStr}, set as a large callout to anchor the reader.`,
  });

  sections.push({
    id: "findings", type: "findings", column: "sidebar",
    title: "Key Findings",
    description: `Up to 6 metric-driven findings drawn from ${agentEntries.length} agent result${agentEntries.length !== 1 ? "s" : ""} covering ${productStr}${periodStr}. Each finding includes the specific number or direction, not just the trend.`,
  });

  sections.push({
    id: "recommendations", type: "recommendations", column: "sidebar",
    title: "Recommended Actions",
    description: `3–5 next steps tied directly to the findings for ${productStr}${periodStr} — each with a suggested owner (brand team, field force, analytics) and a measurable success criterion.`,
  });

  sections.push({
    id: "market_intel", type: "market_intel", column: "sidebar",
    title: "Market Intelligence",
    description: `Top 5 news items from the past 30 days matching ${productStr} and related companies, ranked by relevance weight. Source: SRI News Index.`,
  });

  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag state
// ─────────────────────────────────────────────────────────────────────────────

interface DragState {
  id: string;
  sourceCol: "main" | "sidebar" | "excluded";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BriefBuilderModal({ messages, onBuild, onClose }: Props) {
  const initial   = planBriefSections(messages);
  const [main,     setMain]     = useState<BriefSection[]>(initial.filter((s) => s.column === "main"));
  const [sidebar,  setSidebar]  = useState<BriefSection[]>(initial.filter((s) => s.column === "sidebar"));
  const [excluded, setExcluded] = useState<BriefSection[]>([]);
  const [customTitle, setCustomTitle] = useState("");
  const [showAddCustom, setShowAddCustom] = useState(false);

  const dragRef    = useRef<DragState | null>(null);
  const [dragOver, setDragOver] = useState<{ col: "main" | "sidebar" | "excluded"; overId: string | null } | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getList(col: "main" | "sidebar" | "excluded") {
    return col === "main" ? main : col === "sidebar" ? sidebar : excluded;
  }
  function setList(col: "main" | "sidebar" | "excluded", next: BriefSection[]) {
    if (col === "main") setMain(next);
    else if (col === "sidebar") setSidebar(next);
    else setExcluded(next);
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function onDragStart(e: React.DragEvent, id: string, sourceCol: "main" | "sidebar" | "excluded") {
    dragRef.current = { id, sourceCol };
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, col: "main" | "sidebar" | "excluded", overId: string | null) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver({ col, overId });
  }

  function onDrop(e: React.DragEvent, targetCol: "main" | "sidebar" | "excluded", insertBeforeId: string | null) {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag) return;

    const sourceList = [...getList(drag.sourceCol)];
    const targetList = drag.sourceCol === targetCol ? sourceList : [...getList(targetCol)];

    const moving = sourceList.find((s) => s.id === drag.id);
    if (!moving) return;

    // Remove from source
    const newSource = sourceList.filter((s) => s.id !== drag.id);
    // Insert into target
    const updated = { ...moving, column: targetCol === "excluded" ? moving.column : targetCol } as BriefSection;
    let newTarget: BriefSection[];
    if (drag.sourceCol === targetCol) {
      // Reorder within same list
      newTarget = newSource;
    } else {
      newTarget = targetList.filter((s) => s.id !== drag.id);
    }

    if (insertBeforeId) {
      const idx = newTarget.findIndex((s) => s.id === insertBeforeId);
      newTarget.splice(idx >= 0 ? idx : newTarget.length, 0, updated);
    } else {
      newTarget.push(updated);
    }

    if (drag.sourceCol !== targetCol) setList(drag.sourceCol, newSource);
    setList(targetCol, newTarget);
    dragRef.current = null;
    setDragOver(null);
  }

  function onDragEnd() {
    dragRef.current = null;
    setDragOver(null);
  }

  // ── Exclude / restore ─────────────────────────────────────────────────────

  function exclude(id: string) {
    const inMain = main.find((s) => s.id === id);
    const inSide = sidebar.find((s) => s.id === id);
    const sec = inMain ?? inSide;
    if (!sec || sec.required) return;
    setMain((p) => p.filter((s) => s.id !== id));
    setSidebar((p) => p.filter((s) => s.id !== id));
    setExcluded((p) => [...p, sec]);
  }

  function restore(id: string) {
    const sec = excluded.find((s) => s.id === id);
    if (!sec) return;
    setExcluded((p) => p.filter((s) => s.id !== id));
    if (sec.column === "main") setMain((p) => [...p, sec]);
    else setSidebar((p) => [...p, sec]);
  }

  // ── Add custom section ────────────────────────────────────────────────────

  function addCustom() {
    if (!customTitle.trim()) return;
    const sec: BriefSection = {
      id: `custom_${Date.now()}`, type: "custom", column: "main",
      title: customTitle.trim(),
      description: "Custom section — describe the specific analysis or context you'd like included.",
    };
    setMain((p) => [...p, sec]);
    setCustomTitle("");
    setShowAddCustom(false);
  }

  // ── Build ────────────────────────────────────────────────────────────────

  function handleBuild() {
    const all: BriefSection[] = [
      ...main.map((s) => ({ ...s, column: "main" as const })),
      ...sidebar.map((s) => ({ ...s, column: "sidebar" as const })),
    ];
    onBuild(all);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ width: "min(920px, 96vw)", height: "92vh", background: BG }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: BG, borderBottom: `1px solid rgba(26,51,88,0.14)` }}>
          <div>
            <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: 14, fontWeight: 800, color: INK, margin: 0 }}>
              Design Your Brief
            </p>
            <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 11, color: "rgba(26,51,88,0.45)", margin: 0 }}>
              Drag sections to reorder or move between columns. Remove what you don&apos;t need, then build.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleBuild}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full font-semibold transition-opacity hover:opacity-90"
              style={{ background: ACCENT, color: "white", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 12 }}>
              Build Brief →
            </button>
            <button onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-full transition-opacity hover:opacity-70"
              style={{ background: "rgba(26,51,88,0.08)", color: INK }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="relative flex-1 overflow-y-auto" style={{ background: BG }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundRepeat: "repeat", backgroundSize: "200px 200px", opacity: 0.07, pointerEvents: "none" }} />

          <div style={{ position: "relative", zIndex: 1, padding: "20px 24px 32px" }}>

            {/* Masthead */}
            <div style={{ borderTop: `3px double ${INK}`, paddingTop: 5, marginBottom: 18 }}>
              <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 5, paddingBottom: 5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: INK }}>
                  Brief Layout
                </span>
                <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 12, fontWeight: 700, color: INK, letterSpacing: "0.02em" }}>
                  {main.length + sidebar.length} sections planned
                </span>
              </div>
              <div style={{ borderTop: `1px solid ${INK}` }} />
            </div>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, marginBottom: 8 }}>
              <ColLabel>Main Column</ColLabel>
              <ColLabel>Sidebar</ColLabel>
            </div>

            {/* Two-column drop zones */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>

              {/* Main column */}
              <DropZone
                col="main"
                sections={main}
                dragOver={dragOver}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onExclude={exclude}
              />

              {/* Sidebar */}
              <DropZone
                col="sidebar"
                sections={sidebar}
                dragOver={dragOver}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                onExclude={exclude}
              />
            </div>

            {/* Excluded sections */}
            {excluded.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px dashed rgba(26,51,88,0.18)` }}>
                <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(26,51,88,0.35)", marginBottom: 10 }}>
                  Excluded — click to restore
                </p>
                <div className="flex flex-wrap gap-2">
                  {excluded.map((s) => {
                    const Icon = SECTION_ICON[s.type];
                    return (
                      <button key={s.id} onClick={() => restore(s.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors hover:bg-black/5"
                        style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 11, color: "rgba(26,51,88,0.45)", border: "1px dashed rgba(26,51,88,0.2)" }}>
                        <Icon size={11} /> {s.title}
                        <span style={{ color: ACCENT, fontSize: 13, fontWeight: 700, marginLeft: 2 }}>+</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add custom section */}
            <div style={{ marginTop: 16 }}>
              {showAddCustom ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addCustom(); if (e.key === "Escape") setShowAddCustom(false); }}
                    placeholder="Section title…"
                    className="rounded-full px-4 py-1.5 outline-none"
                    style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 12, border: `1px solid rgba(26,51,88,0.25)`, background: "white", color: INK, width: 220 }}
                  />
                  <button onClick={addCustom}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{ background: INK, color: "white", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>
                    Add
                  </button>
                  <button onClick={() => setShowAddCustom(false)}
                    className="px-3 py-1.5 rounded-full text-xs"
                    style={{ color: "rgba(26,51,88,0.5)", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAddCustom(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full transition-all hover:opacity-90"
                  style={{
                    fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
                    fontSize: 13, fontWeight: 700,
                    color: INK,
                    border: `1.5px dashed rgba(26,51,88,0.35)`,
                    background: "white",
                  }}>
                  <Plus size={14} strokeWidth={2.5} /> Add custom section
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DropZone
// ─────────────────────────────────────────────────────────────────────────────

interface DropZoneProps {
  col: "main" | "sidebar";
  sections: BriefSection[];
  dragOver: { col: "main" | "sidebar" | "excluded"; overId: string | null } | null;
  onDragStart: (e: React.DragEvent, id: string, col: "main" | "sidebar" | "excluded") => void;
  onDragOver: (e: React.DragEvent, col: "main" | "sidebar" | "excluded", overId: string | null) => void;
  onDrop: (e: React.DragEvent, col: "main" | "sidebar" | "excluded", insertBeforeId: string | null) => void;
  onDragEnd: () => void;
  onExclude: (id: string) => void;
}

function DropZone({ col, sections, dragOver, onDragStart, onDragOver, onDrop, onDragEnd, onExclude }: DropZoneProps) {
  const activeCol   = dragOver?.col === col;
  const tailInsert  = activeCol && dragOver?.overId === null; // dropping at end of list

  return (
    <div
      onDragOver={(e) => onDragOver(e, col, null)}
      onDrop={(e) => onDrop(e, col, null)}
      style={{
        minHeight: 200, borderRadius: 8,
        border: activeCol ? `2px dashed ${ACCENT}` : `2px dashed rgba(26,51,88,0.14)`,
        padding: "10px",
        background: activeCol ? `rgba(226,107,44,0.02)` : "transparent",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex", flexDirection: "column",
      }}>

      {sections.length === 0 && !activeCol && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 11, color: "rgba(26,51,88,0.25)", fontStyle: "italic" }}>
            Drop sections here
          </span>
        </div>
      )}

      {sections.map((sec) => {
        const insertBefore = activeCol && dragOver?.overId === sec.id;
        return (
          <div key={sec.id}>
            {/* Insertion line — shown above this card when dragging over it */}
            <InsertionLine visible={insertBefore} />

            <div style={{ marginBottom: 8 }}>
              <SectionCard
                section={sec}
                isDragging={false}
                onDragStart={(e) => onDragStart(e, sec.id, col)}
                onDragOver={(e) => { e.stopPropagation(); onDragOver(e, col, sec.id); }}
                onDrop={(e) => { e.stopPropagation(); onDrop(e, col, sec.id); }}
                onDragEnd={onDragEnd}
                onExclude={() => onExclude(sec.id)}
              />
            </div>
          </div>
        );
      })}

      {/* Insertion line at the tail of the list */}
      <InsertionLine visible={tailInsert} />
    </div>
  );
}

// Horizontal insertion line with a leading dot — appears where the card will land
function InsertionLine({ visible }: { visible: boolean }) {
  return (
    <div style={{
      height: visible ? 20 : 0,
      overflow: "hidden",
      transition: "height 0.12s ease",
      display: "flex", alignItems: "center", gap: 4,
      paddingLeft: 2,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: ACCENT, flexShrink: 0,
        transform: visible ? "scale(1)" : "scale(0)",
        transition: "transform 0.1s ease",
      }} />
      <div style={{
        flex: 1, height: 2, borderRadius: 1,
        background: ACCENT, opacity: 0.8,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionCard
// ─────────────────────────────────────────────────────────────────────────────

interface CardProps {
  section: BriefSection;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onExclude: () => void;
}

function SectionCard({ section, onDragStart, onDragOver, onDrop, onDragEnd, onExclude }: CardProps) {
  const Icon  = SECTION_ICON[section.type];
  const color = SECTION_COLOR[section.type];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        background: "white", borderRadius: 6, padding: "10px 12px",
        border: `1px solid rgba(26,51,88,0.1)`,
        boxShadow: "0 1px 3px rgba(26,51,88,0.06)",
        transition: "box-shadow 0.12s",
        cursor: "grab",
      }}>

      {/* Drag handle */}
      <GripVertical size={14} style={{ color: "rgba(26,51,88,0.2)", flexShrink: 0, marginTop: 1 }} />

      {/* Icon */}
      <Icon size={14} style={{ color, flexShrink: 0, marginTop: 1 }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif", fontSize: 12, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.3 }}>
          {section.title}
        </p>
        <p style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: 12, color: "rgba(26,51,88,0.72)", margin: "3px 0 0", lineHeight: 1.55 }}>
          {section.description}
        </p>
      </div>

      {/* Remove button */}
      {!section.required && (
        <button onClick={onExclude}
          className="flex items-center justify-center w-5 h-5 rounded-full transition-colors hover:bg-red-50 shrink-0 mt-0.5"
          style={{ color: "rgba(26,51,88,0.25)" }}
          title="Remove section">
          <Trash2 size={11} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Column label
// ─────────────────────────────────────────────────────────────────────────────

function ColLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
      fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.2em",
      color: "rgba(26,51,88,0.35)", margin: 0,
    }}>
      {children}
    </p>
  );
}
