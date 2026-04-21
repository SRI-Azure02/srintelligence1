"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, User, LogOut, ChevronDown, X, CheckCircle,
  AlertCircle, Ban, Search, Layers, TrendingUp,
  FileText, BarChart2, ExternalLink, Trash2, CheckCheck, Keyboard,
} from "lucide-react";
import { useNotifications, useUnreadCount } from "@/lib/use-run-store";
import { runStore } from "@/lib/run-store";
import type { RunNotification, RunNodeMeta, StoredArtifact } from "@/lib/run-store";
import KeyboardShortcutsModal from "@/components/layout/KeyboardShortcutsModal";

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return `${s}s ago`;
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
  if (agentType === "sri-analyst")                                                                    return <Search    {...props} />;
  if (["sri-clustering","gmm","kmeans","kmedoids","dbscan","hierarchical","auto-cluster"].includes(agentType)) return <Layers    {...props} />;
  if (agentType === "output")                                                                         return <FileText  {...props} />;
  if (agentType.startsWith("sri-m"))                                                                  return <BarChart2 {...props} />;
  return <TrendingUp {...props} />;
}

// ── Inline result summary (uses real nodeArtifacts) ───────────────────────────
function NodeResultSummary({ node, artifact }: { node: RunNodeMeta; artifact?: StoredArtifact }) {
  const color = agentColor(node.agentType);
  const data = artifact?.data as Record<string, unknown> | null | undefined;

  // Try to extract a meaningful summary from the artifact
  const rowCount = (() => {
    if (!data) return null;
    const results = data.results as { rows?: unknown[] } | undefined;
    if (Array.isArray(results?.rows)) return results!.rows.length;
    if (Array.isArray(data.rows)) return (data.rows as unknown[]).length;
    if (typeof data.count === "number") return data.count;
    return null;
  })();

  const clusterCount = (() => {
    if (!data) return null;
    const segs = data.segments ?? data.clusters;
    if (Array.isArray(segs)) return segs.length;
    return null;
  })();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <AgentIcon agentType={node.agentType} />
        <span className="text-xs font-semibold" style={{ color }}>{node.label}</span>
      </div>

      {artifact ? (
        <div className="rounded-lg px-2.5 py-2 text-xs flex flex-col gap-0.5"
          style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
          <div className="flex items-center gap-1">
            <span className="flex items-center justify-center rounded-full"
              style={{ width: 14, height: 14, background: "#22c55e" }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <span style={{ color: "#22c55e", fontWeight: 600 }}>Success</span>
          </div>
          {rowCount !== null && (
            <span style={{ color: "var(--text-secondary)" }}>{rowCount} rows returned</span>
          )}
          {clusterCount !== null && (
            <span style={{ color: "var(--text-secondary)" }}>{clusterCount} segments identified</span>
          )}
          {artifact.narrative && (
            <span className="line-clamp-2 mt-0.5" style={{ color: "var(--text-muted)", lineHeight: 1.4 }}>
              {artifact.narrative}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No result captured for this step.
        </p>
      )}
    </div>
  );
}

// ── Notification card ─────────────────────────────────────────────────────────
function NotificationCard({ notif, onDismiss }: { notif: RunNotification; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const STATUS_ICON = {
    done:    <CheckCircle size={14} style={{ color: "#22c55e",  flexShrink: 0 }} />,
    failed:  <AlertCircle size={14} style={{ color: "#ef4444",  flexShrink: 0 }} />,
    aborted: <Ban         size={14} style={{ color: "#f59e0b",  flexShrink: 0 }} />,
  };
  const STATUS_LABEL = { done: "Completed", failed: "Failed",  aborted: "Aborted" };
  const STATUS_COLOR = { done: "#22c55e",   failed: "#ef4444", aborted: "#f59e0b" };

  // Only show agent nodes (skip output) in expanded view
  const resultNodes = notif.nodes.filter((n) => n.agentType !== "output");

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)", background: notif.read ? "#fff" : "rgba(40,145,218,0.04)" }}
    >
      {/* Header row */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => { runStore.markRead(notif.id); setExpanded((v) => !v); }}
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
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

      {/* Expanded: real node results */}
      {expanded && notif.status === "done" && resultNodes.length > 0 && (
        <div className="flex flex-col gap-3 px-3 pb-3 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          {resultNodes.map((node) => (
            <NodeResultSummary
              key={node.id}
              node={node}
              artifact={notif.nodeArtifacts?.[node.id]}
            />
          ))}
        </div>
      )}

      {expanded && notif.status !== "done" && (
        <div className="px-3 pb-3 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
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
type FilterTab = "all" | "done" | "aborted";

function NotificationsPane({ onClose }: { onClose: () => void }) {
  const notifications = useNotifications();
  const [filter, setFilter] = useState<FilterTab>("all");
  const ref = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = notifications.filter((n) => {
    if (filter === "done")    return n.status === "done";
    if (filter === "aborted") return n.status === "aborted" || n.status === "failed";
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",     label: "All" },
    { key: "done",    label: "Completed" },
    { key: "aborted", label: "Aborted" },
  ];

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
      {/* Header */}
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
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
              {notifications.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => runStore.markAllRead()}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors hover:bg-black/5"
              style={{ color: "var(--text-muted)" }}
              title="Mark all as read"
            >
              <CheckCheck size={11} />
              Mark read
            </button>
          )}
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
          <button onClick={onClose} className="p-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}>
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      {notifications.length > 0 && (
        <div className="flex gap-1 px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          {tabs.map((t) => {
            const count = notifications.filter((n) => {
              if (t.key === "done")    return n.status === "done";
              if (t.key === "aborted") return n.status === "aborted" || n.status === "failed";
              return true;
            }).length;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                style={
                  filter === t.key
                    ? { background: "#2891DA", color: "#fff" }
                    : { background: "transparent", color: "var(--text-muted)" }
                }
              >
                {t.label}
                <span className="text-xs opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Bell size={28} style={{ color: "var(--border)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {notifications.length === 0 ? "No notifications" : "No notifications in this filter"}
            </p>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)", maxWidth: 240 }}>
              {notifications.length === 0
                ? "Workflow run results will appear here when runs complete."
                : "Try switching to \"All\" to see all notifications."}
            </p>
          </div>
        ) : (
          filtered.map((n) => (
            <NotificationCard key={n.id} notif={n} onDismiss={() => runStore.dismiss(n.id)} />
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
          style={{ background: "#ffffff", border: "1px solid var(--border)", boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}
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
  const [notifOpen,       setNotifOpen]       = useState(false);
  const [showShortcuts,   setShowShortcuts]   = useState(false);
  const unread  = useUnreadCount();
  const router  = useRouter();

  // g-mode state (for G → C/W/D navigation sequences)
  const gModeRef      = useRef(false);
  const gModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag    = active?.tagName;
      // Never fire shortcuts when typing in inputs / contenteditable
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;

      // Escape — close any open overlay
      if (e.key === "Escape") {
        setShowShortcuts(false);
        setNotifOpen(false);
        return;
      }

      // When in g-mode, consume the next key as a navigation target
      if (gModeRef.current) {
        gModeRef.current = false;
        if (gModeTimerRef.current) clearTimeout(gModeTimerRef.current);
        e.preventDefault();
        const k = e.key.toLowerCase();
        if (k === "c") router.push("/chat");
        if (k === "w") router.push("/workflows");
        if (k === "d") router.push("/data-explore");
        return;
      }

      // g — enter g-mode
      if (e.key === "g") {
        // Only if no modifier keys
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        gModeRef.current = true;
        gModeTimerRef.current = setTimeout(() => { gModeRef.current = false; }, 1500);
        return;
      }

      // ? — toggle shortcuts modal
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [router]);

  return (
    <>
      <header
        className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0"
        style={{ background: "#F9F8F4", borderBottom: "1px solid var(--border)" }}
      >
        {/* Logo */}
        <Link href="/chat" className="flex flex-col gap-0" style={{ textDecoration: "none" }}>
          <div className="flex items-baseline gap-0 font-bold tracking-tight" style={{ fontSize: "28px", lineHeight: 1.15 }}>
            <span className="brand-gradient">SRIntelligence</span>
            <sup className="brand-gradient"
              style={{ fontSize: "0.5em", fontWeight: 500, verticalAlign: "0.6em", lineHeight: 1, marginLeft: "1px" }}>™</sup>
          </div>
          <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.10em", color: "#0f172a", lineHeight: 1, marginTop: "7px" }}>
            STRATEGIC RESEARCH INSIGHTS, INC.
          </span>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-1">

          {/* Keyboard shortcuts hint button */}
          <button
            onClick={() => setShowShortcuts((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors hover:bg-black/7"
            style={{ color: "var(--text-muted)" }}
            title="Keyboard shortcuts (?)"
          >
            <Keyboard size={14} />
            <kbd
              className="text-xs font-mono leading-none"
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "1px 4px",
                color: "var(--text-muted)",
                boxShadow: "0 1px 0 var(--border)",
              }}
            >
              ?
            </kbd>
          </button>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => {
                setNotifOpen((v) => !v);
                if (!notifOpen) runStore.markAllRead();
              }}
              className="p-1.5 rounded-lg transition-colors hover:bg-black/7"
              style={{ color: unread > 0 ? "var(--accent)" : "var(--text-muted)" }}
              title="Notifications"
            >
              <Bell size={16} />
              {unread > 0 && (
                <span
                  className="absolute flex items-center justify-center rounded-full text-white font-bold"
                  style={{
                    top: 2, right: 2,
                    width: unread > 9 ? 16 : 14, height: 14,
                    background: "#ef4444", fontSize: 9, lineHeight: 1, pointerEvents: "none",
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

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}
    </>
  );
}
