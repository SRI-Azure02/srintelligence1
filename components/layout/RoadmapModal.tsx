"use client";

import { X, Milestone, Wrench, Clock, Sparkles, Presentation, Building2, Users, Bell, Plug, Smartphone, Trophy } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Priority = "must" | "high" | "value" | "diff";
type Status   = "in-progress" | "planned" | "idea";

interface RoadmapItem {
  id:          number;
  title:       string;
  description: string;
  priority?:   Priority;
  status?:     Status;
}

interface RoadmapSection {
  key:   string;
  label: string;
  icon:  React.ReactNode;
  items: RoadmapItem[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const UPCOMING: RoadmapItem[] = [
  {
    id: 12,
    title: "Workflow Versioning UI",
    description: "View diffs between workflow versions directly in the timeline hover menu.",
    status: "planned",
    priority: "high",
  },
  {
    id: 0,
    title: "Schedule Wiring",
    description: "Connect the schedule picker to a real cron API with timezone support.",
    status: "planned",
    priority: "high",
  },
  {
    id: 13,
    title: "AI Workflow Builder",
    description: "Describe a workflow in plain English and have the AI generate the node graph automatically.",
    status: "planned",
    priority: "high",
  },
  {
    id: 14,
    title: "Shared Dashboard",
    description: "Compose multiple workflow result artifacts into a pinned, auto-refreshing dashboard grid.",
    status: "planned",
    priority: "high",
  },
];

const SECTIONS: RoadmapSection[] = [
  {
    key: "ai",
    label: "AI Depth & Reasoning",
    icon: <Sparkles size={13} />,
    items: [
      {
        id: 15,
        title: "Explainable AI + Confidence Scores",
        description: "Every result shows the reasoning chain, key assumptions, and a confidence score with plain-English caveats.",
        priority: "high",
      },
      {
        id: 16,
        title: "Hypothesis Testing Mode",
        description: "State a hypothesis in plain English; the system runs causal analysis, controls for confounders, and returns a structured verdict.",
        priority: "value",
      },
      {
        id: 17,
        title: "Autonomous Insight Discovery",
        description: "Scheduled background job scans key metrics weekly and surfaces anomalies unprompted — before you ask.",
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
        id: 18,
        title: "Story Mode / Narrative Reports",
        description: "One click converts a workflow run into an AI-written executive report. Export to PDF or PowerPoint.",
        priority: "must",
      },
      {
        id: 19,
        title: "Embeddable View-Only Links",
        description: "Share any result via a time-limited, read-only URL — no login required for external stakeholders.",
        priority: "high",
      },
      {
        id: 20,
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
        id: 21,
        title: "HIPAA Audit Trail & Data Lineage",
        description: "Immutable log of who queried what, when. Visual lineage graph from source tables to every result.",
        priority: "must",
      },
      {
        id: 22,
        title: "Territory & Rep Access Controls",
        description: "Row-level security tying user identity to territory/district/region — field teams only see their geography.",
        priority: "must",
      },
      {
        id: 23,
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
        id: 24,
        title: "Real-Time Multiplayer Canvas",
        description: "Multiple users editing the same workflow simultaneously with live presence cursors — like Figma for analytics.",
        priority: "high",
      },
      {
        id: 25,
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
        id: 26,
        title: "Natural Language Alerts",
        description: "\"Alert me when Brand X share drops below 15%\" — set in plain English, delivered in-app and via email.",
        priority: "high",
      },
      {
        id: 27,
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
        id: 28,
        title: "Veeva CRM & IQVIA Connectors",
        description: "Pull call activity, targeting data, and syndicated market data natively — where pharma data already lives.",
        priority: "high",
      },
      {
        id: 29,
        title: "Slack / Teams Push",
        description: "When a workflow completes or an alert fires, push the summary into a Slack channel or Teams chat.",
        priority: "value",
      },
      {
        id: 30,
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
        id: 31,
        title: "Mobile-Responsive Field Dashboards",
        description: "Stripped-down mobile view for field reps: territory Rx trends, target performance, alerts — on a phone.",
        priority: "value",
      },
      {
        id: 32,
        title: "Voice-to-Query",
        description: "Microphone button in chat input — speak a question and it's transcribed, routed, and executed.",
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
        id: 33,
        title: "Anonymized Peer Benchmarking",
        description: "Opt-in anonymized comparison across the customer base. A network-effect moat no individual vendor can replicate.",
        priority: "diff",
      },
    ],
  },
];

// ── Priority badge ─────────────────────────────────────────────────────────────
const PRIORITY_CFG: Record<Priority, { label: string; bg: string; color: string }> = {
  must:  { label: "Must-have",    bg: "rgba(239,68,68,0.1)",   color: "#dc2626" },
  high:  { label: "High",         bg: "rgba(249,115,22,0.1)",  color: "#ea580c" },
  value: { label: "High value",   bg: "rgba(234,179,8,0.1)",   color: "#ca8a04" },
  diff:  { label: "Differentiator", bg: "rgba(34,197,94,0.1)", color: "#16a34a" },
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

const STATUS_CFG: Record<Status, { label: string; bg: string; color: string }> = {
  "in-progress": { label: "In progress", bg: "rgba(40,145,218,0.1)", color: "#2891DA" },
  planned:       { label: "Planned",     bg: "rgba(139,92,246,0.1)", color: "#7c3aed" },
  idea:          { label: "Idea",        bg: "rgba(100,116,139,0.1)", color: "#475569" },
};

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
function ItemRow({ item, showStatus }: { item: RoadmapItem; showStatus?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-center w-6 h-6 rounded shrink-0 mt-0.5"
        style={{ background: "var(--bg-tertiary)", fontSize: "10px", fontWeight: 700,
          color: "var(--text-muted)", fontFamily: "monospace" }}>
        {item.id === 0 ? "—" : item.id}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.title}</p>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{item.description}</p>
      </div>
      <div className="flex flex-col gap-1 items-end shrink-0">
        {showStatus && item.status && <StatusBadge s={item.status} />}
        {item.priority && <PriorityBadge p={item.priority} />}
      </div>
    </div>
  );
}

// ── Section accordion ─────────────────────────────────────────────────────────
function Section({ section }: { section: RoadmapSection }) {
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
        {section.items.map((item) => <ItemRow key={item.id} item={item} />)}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function RoadmapModal({ onClose }: { onClose: () => void }) {
  const total = UPCOMING.length + SECTIONS.reduce((s, sec) => s + sec.items.length, 0);

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
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-5">

          {/* Upcoming / In-dev */}
          <div>
            <div className="flex items-center gap-2 px-1 py-2 sticky top-0 z-10"
              style={{ background: "#ffffff", borderBottom: "1px solid var(--border)" }}>
              <Wrench size={13} style={{ color: "var(--text-muted)" }} />
              <p className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.09em" }}>
                Upcoming
              </p>
              <span className="text-xs ml-auto" style={{ color: "var(--text-muted)" }}>
                {UPCOMING.length}
              </span>
            </div>
            {UPCOMING.map((item) => <ItemRow key={item.id} item={item} showStatus />)}
          </div>

          {/* Suggested feature sections */}
          {SECTIONS.map((section) => (
            <Section key={section.key} section={section} />
          ))}
        </div>

        {/* Footer — priority legend */}
        <div className="px-5 py-2.5 shrink-0 flex items-center gap-3 flex-wrap"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
          <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>Priority:</span>
          {(Object.entries(PRIORITY_CFG) as [Priority, typeof PRIORITY_CFG[Priority]][]).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: cfg.color }} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{cfg.label}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
