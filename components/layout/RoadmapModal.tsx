"use client";

import { useState } from "react";
import { X, Milestone, Sparkles, Presentation, Building2, Users, Bell, Plug, Smartphone, Trophy, Layers, Eye, EyeOff } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = "must" | "high" | "value" | "diff";
type Status   = "planned" | "idea" | "shipped";

interface RoadmapItem {
  id:        number;
  title:     string;
  description: string;
  priority?: Priority;
  status?:   Status;
}

interface RoadmapSection {
  key:   string;
  label: string;
  icon:  React.ReactNode;
  items: RoadmapItem[];
}

// ── Data — all items numbered 1–24, upcoming items merged into categories ─────

const SECTIONS: RoadmapSection[] = [
  {
    key: "core",
    label: "Core Platform",
    icon: <Layers size={13} />,
    items: [
      {
        id: 1,
        title: "Workflow Versioning UI",
        description: "View diffs between workflow versions directly in the timeline hover menu.",
        status: "planned",
        priority: "high",
      },
      {
        id: 2,
        title: "Schedule Wiring",
        description: "Connect the schedule picker to a real cron API with timezone support.",
        status: "planned",
        priority: "high",
      },
    ],
  },
  {
    key: "ai",
    label: "AI Depth & Reasoning",
    icon: <Sparkles size={13} />,
    items: [
      {
        id: 3,
        title: "AI Workflow Builder",
        description: "Describe a workflow in plain English and have the AI generate the node graph automatically.",
        status: "planned",
        priority: "high",
      },
      {
        id: 4,
        title: "Explainable AI + Confidence Scores",
        description: "Every result shows the reasoning chain, key assumptions, and a confidence score with plain-English caveats.",
        priority: "high",
      },
      {
        id: 5,
        title: "Hypothesis Testing Mode",
        description: "State a hypothesis in plain English; the system runs causal analysis, controls for confounders, and returns a structured verdict.",
        priority: "value",
      },
      {
        id: 6,
        title: "Autonomous Insight Discovery",
        description: "Scheduled background job scans key metrics weekly and surfaces anomalies unprompted — before you ask.",
        priority: "diff",
      },
      {
        id: 24,
        title: "Competitive Intelligence & Market Research Triangulation",
        description: "Ingest competitive intelligence reports and market research publications to triangulate insights against internal analytics — automatically surfacing where external sources confirm, contradict, or extend your internal findings.",
        priority: "diff",
      },
    ],
  },
  {
    key: "presentation",
    label: "Presentation & Sharing",
    icon: <Presentation size={13} />,
    items: [
      {
        id: 7,
        title: "Shared Dashboard",
        description: "Compose multiple workflow result artifacts into a pinned, auto-refreshing dashboard grid.",
        status: "planned",
        priority: "high",
      },
      {
        id: 8,
        title: "Story Mode / Narrative Reports",
        description: "One click converts a workflow run into an AI-written executive report. Export to PDF or PowerPoint.",
        priority: "must",
      },
      {
        id: 9,
        title: "Embeddable View-Only Links",
        description: "Share any result via a time-limited, read-only URL — no login required for external stakeholders.",
        priority: "high",
      },
      {
        id: 10,
        title: "Annotation & Commentary Layer",
        description: "Stakeholders leave comment threads on charts or workflow nodes, keeping insights and context together.",
        priority: "value",
      },
    ],
  },
  {
    key: "enterprise",
    label: "Enterprise & Compliance",
    icon: <Building2 size={13} />,
    items: [
      {
        id: 11,
        title: "HIPAA Audit Trail & Data Lineage",
        description: "Immutable log of who queried what, when. Visual lineage graph from source tables to every result.",
        priority: "must",
      },
      {
        id: 12,
        title: "Territory & Rep Access Controls",
        description: "Row-level security tying user identity to territory/district/region — field teams only see their geography.",
        priority: "must",
      },
      {
        id: 13,
        title: "Approval Workflows for Reports",
        description: "Require a reviewer sign-off before a forecast or analysis reaches leadership. Compliance-grade chain of custody.",
        priority: "value",
      },
    ],
  },
  {
    key: "collab",
    label: "Collaboration",
    icon: <Users size={13} />,
    items: [
      {
        id: 14,
        title: "Real-Time Multiplayer Canvas",
        description: "Multiple users editing the same workflow simultaneously with live presence cursors — like Figma for analytics.",
        priority: "high",
      },
      {
        id: 15,
        title: "@Mention & Task Assignment",
        description: "Tag a colleague on a finding; creates a lightweight task loop without leaving the platform.",
        priority: "value",
      },
    ],
  },
  {
    key: "alerts",
    label: "Proactive Intelligence",
    icon: <Bell size={13} />,
    items: [
      {
        id: 16,
        title: "Natural Language Alerts",
        description: "\"Alert me when Brand X share drops below 15%\" — set in plain English, delivered in-app and via email.",
        priority: "high",
      },
      {
        id: 17,
        title: "Forecast Deviation Monitoring",
        description: "Automatically compares actuals against prior forecasts and flags meaningful deviations on every run.",
        priority: "value",
      },
    ],
  },
  {
    key: "integrations",
    label: "Integrations",
    icon: <Plug size={13} />,
    items: [
      {
        id: 18,
        title: "Veeva CRM & IQVIA Connectors",
        description: "Pull call activity, targeting data, and syndicated market data natively — where pharma data already lives.",
        priority: "high",
      },
      {
        id: 19,
        title: "Slack / Teams Push",
        description: "When a workflow completes or an alert fires, push the summary into a Slack channel or Teams chat.",
        priority: "value",
      },
      {
        id: 20,
        title: "Reverse ETL — Push Results to Snowflake",
        description: "Write workflow outputs (segments, forecasts, scores) back as Snowflake tables for downstream systems.",
        priority: "diff",
      },
    ],
  },
  {
    key: "field",
    label: "Accessibility & Field",
    icon: <Smartphone size={13} />,
    items: [
      {
        id: 21,
        title: "Mobile-Responsive Field Dashboards",
        description: "Stripped-down mobile view for field reps: territory Rx trends, target performance, alerts — on a phone.",
        priority: "value",
      },
      {
        id: 22,
        title: "Voice-to-Query",
        description: "Microphone button in chat input — speak a question and it's transcribed, routed, and executed.",
        status: "shipped",
        priority: "diff",
      },
    ],
  },
  {
    key: "benchmarking",
    label: "Benchmarking",
    icon: <Trophy size={13} />,
    items: [
      {
        id: 23,
        title: "Anonymized Peer Benchmarking",
        description: "Opt-in anonymized comparison across the customer base. A network-effect moat no individual vendor can replicate.",
        priority: "diff",
      },
    ],
  },
];

// ── Badge configs ─────────────────────────────────────────────────────────────
const PRIORITY_CFG: Record<Priority, { label: string; bg: string; color: string }> = {
  must:  { label: "Must-have",      bg: "rgba(239,68,68,0.1)",   color: "#dc2626" },
  high:  { label: "High",           bg: "rgba(249,115,22,0.1)",  color: "#ea580c" },
  value: { label: "High value",     bg: "rgba(234,179,8,0.1)",   color: "#ca8a04" },
  diff:  { label: "Differentiator", bg: "rgba(34,197,94,0.1)",   color: "#16a34a" },
};

const STATUS_CFG: Record<Status, { label: string; bg: string; color: string }> = {
  planned: { label: "Planned", bg: "rgba(139,92,246,0.1)", color: "#7c3aed" },
  idea:    { label: "Idea",    bg: "rgba(100,116,139,0.1)", color: "#475569" },
  shipped: { label: "Shipped", bg: "rgba(40,145,218,0.1)", color: "#2891DA" },
};

function PriorityBadge({ p }: { p: Priority }) {
  const cfg = PRIORITY_CFG[p];
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
      style={{ background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const cfg = STATUS_CFG[s];
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
      style={{ background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

// ── Item row ──────────────────────────────────────────────────────────────────
function ItemRow({ item, showBadges }: { item: RoadmapItem; showBadges: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: "1px solid var(--border)" }}>

      {/* Sequential number badge */}
      <div className="flex items-center justify-center w-5 h-5 rounded shrink-0 mt-0.5"
        style={{
          background: "var(--bg-tertiary)",
          fontSize: "10px", fontWeight: 700,
          color: "var(--text-muted)", fontFamily: "monospace",
          minWidth: 20,
        }}>
        {item.id}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-semibold"
          style={{
            color: item.status === "shipped" ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: item.status === "shipped" ? "line-through" : "none",
          }}
        >
          {item.title}
        </p>
        <p
          className="text-xs mt-0.5 leading-relaxed"
          style={{
            color: "var(--text-muted)",
            textDecoration: item.status === "shipped" ? "line-through" : "none",
            opacity: item.status === "shipped" ? 0.6 : 1,
          }}
        >
          {item.description}
        </p>
      </div>

      {/* Badges — hidden unless toggled on */}
      {showBadges && (
        <div className="flex flex-col gap-1 items-end shrink-0">
          {item.status && <StatusBadge s={item.status} />}
          {item.priority && <PriorityBadge p={item.priority} />}
        </div>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ section, showBadges }: { section: RoadmapSection; showBadges: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1 py-2 sticky top-0 z-10"
        style={{ background: "#ffffff", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "var(--text-muted)" }}>{section.icon}</span>
        <p className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.09em" }}>
          {section.label}
        </p>
        <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
          {section.items.length}
        </span>
      </div>
      <div>
        {section.items.map((item) => (
          <ItemRow key={item.id} item={item} showBadges={showBadges} />
        ))}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function RoadmapModal({ onClose }: { onClose: () => void }) {
  const [showBadges, setShowBadges] = useState(false);
  const total = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 560, maxHeight: "86vh", background: "#ffffff", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <Milestone size={15} style={{ color: "var(--accent)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Product Roadmap
            </p>
            <span className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}>
              {total} items
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Eye toggle */}
            <button
              onClick={() => setShowBadges((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/5"
              style={{ color: showBadges ? "var(--accent)" : "var(--text-muted)" }}
              title={showBadges ? "Hide priority badges" : "Show priority badges"}
            >
              {showBadges ? <Eye size={14} /> : <EyeOff size={14} />}
              <span className="text-xs font-medium">
                {showBadges ? "Hide labels" : "Show labels"}
              </span>
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              style={{ color: "var(--text-muted)" }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-5">
          {SECTIONS.map((section) => (
            <Section key={section.key} section={section} showBadges={showBadges} />
          ))}
        </div>

        {/* Footer — legend visible only when badges are shown */}
        <div className="px-5 py-2.5 shrink-0 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)", minHeight: 40 }}>
          {showBadges ? (
            <>
              <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>Priority:</span>
              {(Object.entries(PRIORITY_CFG) as [Priority, typeof PRIORITY_CFG[Priority]][]).map(([key, cfg]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{cfg.label}</span>
                </span>
              ))}
            </>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Click <strong>Show labels</strong> to see priority and status badges.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
