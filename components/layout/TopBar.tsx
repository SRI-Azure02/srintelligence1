"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Bell, User, LogOut, ChevronDown, X, CheckCircle,
  AlertCircle, Ban, Loader, Search, Layers, TrendingUp,
  FileText, BarChart2, ExternalLink, Trash2,
} from "lucide-react";
import { useNotifications, useUnreadCount } from "@/lib/use-run-store";
import { runStore } from "@/lib/run-store";
import type { RunNotification, RunNodeMeta, NodeRunStatus } from "@/lib/run-store";

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtDuration(startedAt: number, completedAt: number): string {
  const s = (completedAt - startedAt) / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

const AGENT_COLORS: Record<string, string> = {
  "sri-analyst":    "#2891DA",
  "sri-forecast":   "#34c98b",
  "sri-clustering": "#a78bfa",
  "sri-mtree":      "#fb923c",
  "sri-causal":     "#8b5cf6",
  output:           "#64748b",
};

function agentColor(agentType: string) {
  for (const [key, val] of Object.entries(AGENT_COLORS)) {
    if (agentType === key || agentType.startsWith(key.split("-")[1] ?? "")) return val;
  }
  return AGENT_COLORS["sri-forecast"];
}

function AgentIcon({ agentType, size = 12 }: { agentType: string; size?: number }) {
  const props = { size, style: { color: agentColor(agentType), flexShrink: 0 as const } };
  if (agentType === "sri-analyst")                                        return <Search     {...props} />;
  if (["sri-clustering","gmm","kmeans","kmedoids","dbscan","hierarchical","auto-cluster"].includes(agentType)) return <Layers     {...props} />;
  if (agentType === "output")                                             return <FileText   {...props} />;
  if (agentType.startsWith("sri-m"))                                      return <BarChart2  {...props} />;
  return <TrendingUp {...props} />;
}

// ── Inline result renderer (mirrors RunReportPanel in edit page) ──────────────
const ANALYST_RESULT = {
  headers: ["Plan Name", "Claims", "Fill Rate", "Avg OOP"],
  rows: [
    ["BlueCross PPO","12,430","87.2%","$8.40"],
    ["Aetna HMO","8,921","82.1%","$15.20"],
    ["UHC Choice Plus","6,102","79.5%","$22.10"],
    ["Cigna OAP","4,877","84.3%","$11.50"],
    ["Humana Gold","3,214","76.8%","$28.70"],
  ],
};
const CLUSTER_SEGMENTS = [
  { name:"High Performers", plans:["BlueCross PPO","Cigna OAP"], chars:"High fill rate, Low OOP", color:"#2891DA" },
  { name:"At-Risk Payers",  plans:["Aetna HMO","UHC Choice Plus","Humana Gold"], chars:"Lower fill rate, High OOP", color:"#a78bfa" },
];
const FORECAST_METRICS = [
  { label:"Model",       value:"Prophet (auto-selected)" },
  { label:"Horizon",     value:"12 months" },
  { label:"MAPE",        value:"4.8%" },
  { label:"MAE",         value:"312 units" },
];

function getCategory(agentType: string) {
  if (agentType === "sri-analyst") return "analyst";
  if (["sri-clustering","gmm","kmeans","kmedoids","dbscan","hierarchical","auto-cluster"].includes(agentType)) return "clustering";
  if (agentType === "output") return "output";
  return "forecast";
}

function NodeResult({ node, nodeStates }: { node: RunNodeMeta; nodeStates: Record<string, NodeRunStatus> }) {
  const cat = getCategory(node.agentType);
  const color = agentColor(node.agentType);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <AgentIcon agentType={node.agentType} />
        <span className="text-xs font-semibold" style={{ color }}>
          {node.label}
        </span>
      </div>

      {cat === "analyst" && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                {ANALYST_RESULT.headers.map((h) => (
                  <th key={h} className="px-2 py-1.5 text-left font-semibold"
                    style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ANALYST_RESULT.rows.map((row, ri) => (
                <tr key={ri} style={{ borderBottom: ri < ANALYST_RESULT.rows.length - 1 ? "1px solid var(--border)" : "none" }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5" style={{ color: "var(--text-primary)", fontSize: 11 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {cat === "clustering" && (
        <div className="flex flex-col gap-1.5">
          {CLUSTER_SEGMENTS.map((seg, i) => (
            <div key={i} className="rounded-lg p-2.5" style={{ background: `${seg.color}08`, border: `1px solid ${seg.color}30` }}>
              <p className="text-xs font-semibold" style={{ color: seg.color }}>{seg.name}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{seg.plans.join(" · ")}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{seg.chars}</p>
            </div>
          ))}
        </div>
      )}

      {cat === "forecast" && (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {FORECAST_METRICS.map((m, i) => (
            <div key={i} className="flex items-center justify-between px-2.5 py-1.5"
              style={{ borderBottom: i < FORECAST_METRICS.length - 1 ? "1px solid var(--border)" : "none",
                       background: i % 2 === 0 ? "var(--bg-secondary)" : "#fff" }}>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{m.label}</span>
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {cat === "output" && (
        <div className="rounded-lg p-2.5" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>Combined report generated across all segments.</p>
        </div>
      )}
    </div>
  );
}

// ── Notification card ─────────────────────────────────────────────────────────
function NotificationCard({ notif, onDismiss }: { notif: RunNotification; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const STATUS_ICON = {
    done:    <CheckCircle  size={14} style={{ color: "#22c55e",  flexShrink: 0 }} />,
    failed:  <AlertCircle  size={14} style={{ color: "#ef4444",  flexShrink: 0 }} />,
    aborted: <Ban          size={14} style={{ color: "#f59e0b",  flexShrink: 0 }} />,
  };

  const STATUS_LABEL = { done: "Completed", failed: "Failed", aborted: "Aborted" };
  const STATUS_COLOR = { done: "#22c55e",   failed: "#ef4444", aborted: "#f59e0b" };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: notif.read ? "#fff" : "rgba(40,145,218,0.04)" }}
    >
      {/* Card header row */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => {
          runStore.markRead(notif.id);
          setExpanded((v) => !v);
        }}
      >
        <div className="mt-0.5">{STATUS_ICON[notif.status]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {notif.workflowName}
            </span>
            {!notif.read && (
              <span className="shrink-0 rounded-full"
                style={{ width: 6, height: 6, background: "#2891DA", display: "inline-block" }} />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-medium" style={{ color: STATUS_COLOR[notif.status] }}>
              {STATUS_LABEL[notif.status]}
            </span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {fmtDuration(notif.startedAt, notif.completedAt)}
            </span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {timeAgo(notif.completedAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Link
            href={`/workflows/${notif.workflowId}/edit`}
            onClick={(e) => e.stopPropagation()}
            title="Open workflow"
            className="p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <ExternalLink size={11} />
          </Link>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            title="Dismiss"
            className="p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      {/* Expanded results */}
      {expanded && notif.status === "done" && (
        <div
          className="flex flex-col gap-4 px-3 pb-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div className="pt-3 flex flex-col gap-4">
            {notif.nodes.map((node) => (
              <NodeResult key={node.id} node={node} nodeStates={notif.nodeStates} />
            ))}
          </div>
        </div>
      )}

      {expanded && notif.status !== "done" && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            {notif.status === "aborted"
              ? "Run was aborted before completion — no results available."
              : "Run ended with an error — no results available."}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Notifications pane ────────────────────────────────────────────────────────
function NotificationsPane({ onClose }: { onClose: () => void }) {
  const notifications = useNotifications();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 flex flex-col rounded-xl overflow-hidden"
      style={{
        top: "calc(100% + 8px)",
        width: 400,
        maxHeight: "80vh",
        background: "#ffffff",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        zIndex: 100,
      }}
    >
      {/* Pane header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
      >
        <div className="flex items-center gap-2">
          <Bell size={14} style={{ color: "var(--text-secondary)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Notifications
          </span>
          {notifications.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}
            >
              {notifications.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {notifications.length > 0 && (
            <button
              onClick={() => runStore.dismissAll()}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors hover:bg-black/5"
              style={{ color: "var(--text-muted)" }}
            >
              <Trash2 size={11} />
              Clear all
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Bell size={28} style={{ color: "var(--border)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No notifications</p>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)", maxWidth: 240 }}>
              Workflow run results will appear here when runs complete.
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationCard
              key={n.id}
              notif={n}
              onDismiss={() => runStore.dismiss(n.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── UserMenu ──────────────────────────────────────────────────────────────────
function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors hover:bg-black/7"
        style={{ color: "var(--text-secondary)" }}
      >
        <User size={15} />
        <span>{process.env.NEXT_PUBLIC_USER_DISPLAY_NAME ?? "User"}</span>
        <ChevronDown size={13} style={{ opacity: 0.5 }} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-48 rounded-xl overflow-hidden z-50"
          style={{
            background: "#ffffff",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
          }}
        >
          <div className="px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Anonymous</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>anonymous</p>
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-black/5 text-left"
            style={{ color: "var(--danger)" }}
            onClick={() => setOpen(false)}
          >
            <LogOut size={14} />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────
export default function TopBar() {
  const [notifOpen, setNotifOpen] = useState(false);
  const unread = useUnreadCount();

  // Also show any in-progress runs as a pulse on the bell
  // (for this we just check the global store inline)

  return (
    <header
      className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0"
      style={{ background: "#F9F8F4", borderBottom: "1px solid var(--border)" }}
    >
      {/* Logo */}
      <Link href="/chat" className="flex flex-col gap-0" style={{ textDecoration: "none" }}>
        <div
          className="flex items-baseline gap-0 font-bold tracking-tight"
          style={{ fontSize: "28px", lineHeight: 1.15 }}
        >
          <span className="brand-gradient">SRIntelligence</span>
          <sup
            className="brand-gradient"
            style={{ fontSize: "0.5em", fontWeight: 500, verticalAlign: "0.6em", lineHeight: 1, marginLeft: "1px" }}
          >™</sup>
        </div>
        <span
          style={{
            fontSize: "11px", fontWeight: 600, letterSpacing: "0.10em",
            color: "#0f172a", lineHeight: 1, marginTop: "7px",
          }}
        >
          STRATEGIC RESEARCH INSIGHTS, INC.
        </span>
      </Link>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Bell + notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setNotifOpen((v) => !v);
              // Mark all read when pane opens
              if (!notifOpen) runStore.markAllRead();
            }}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/7"
            style={{ color: unread > 0 ? "var(--accent)" : "var(--text-muted)" }}
            title="Notifications"
          >
            <Bell size={16} />
            {/* Unread badge */}
            {unread > 0 && (
              <span
                className="absolute flex items-center justify-center rounded-full text-white font-bold"
                style={{
                  top: 2, right: 2,
                  width: unread > 9 ? 16 : 14,
                  height: 14,
                  background: "#ef4444",
                  fontSize: 9,
                  lineHeight: 1,
                  pointerEvents: "none",
                }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>

          {notifOpen && <NotificationsPane onClose={() => setNotifOpen(false)} />}
        </div>

        <UserMenu />
      </div>
    </header>
  );
}
