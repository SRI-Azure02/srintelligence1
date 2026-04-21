"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Play, Square, Edit2, Share2, Calendar, RefreshCw,
  Layers, TrendingUp, Activity, Cpu, GitFork, GitPullRequestArrow,
  FileText, Zap, Copy, Check, Trash2, X, Search, UserCheck,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { WorkflowCard as WorkflowCardType } from "@/lib/types";
import { useActiveRun, useLastRun } from "@/lib/use-run-store";
import { runStore } from "@/lib/run-store";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)   return "just now";
  if (diff < 3_600_000) { const m = Math.floor(diff / 60_000);    return `${m}m ago`; }
  if (diff < 86_400_000){ const h = Math.floor(diff / 3_600_000); return `${h}h ago`; }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Mock user roster (swap for a real /api/users endpoint when available) ─────
interface MockUser { id: string; name: string; username: string; role: string; }
const MOCK_USERS: MockUser[] = [
  { id: "u1",  name: "Alice Johnson",    username: "alice.johnson",    role: "Analyst" },
  { id: "u2",  name: "Bob Martinez",     username: "bob.martinez",     role: "Data Scientist" },
  { id: "u3",  name: "Carol Singh",      username: "carol.singh",      role: "Manager" },
  { id: "u4",  name: "David Chen",       username: "david.chen",       role: "Analyst" },
  { id: "u5",  name: "Emma Williams",    username: "emma.williams",    role: "Engineer" },
  { id: "u6",  name: "Frank Okafor",     username: "frank.okafor",     role: "Director" },
  { id: "u7",  name: "Grace Kim",        username: "grace.kim",        role: "Analyst" },
  { id: "u8",  name: "Henry Patel",      username: "henry.patel",      role: "Data Scientist" },
];

// ── Share Modal ───────────────────────────────────────────────────────────────

type SharePermission = "view" | "edit";

function ShareModal({
  workflowId,
  workflowName,
  onClose,
}: {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}) {
  const [query,      setQuery]      = useState("");
  const [selected,   setSelected]   = useState<MockUser | null>(null);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = query.trim()
    ? MOCK_USERS.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.username.toLowerCase().includes(query.toLowerCase()),
      )
    : MOCK_USERS;

  const handleSelect = (u: MockUser) => {
    setSelected(u);
    setQuery(u.name);
    setError(null);
  };

  const handleSend = useCallback(async () => {
    if (!selected) { setError("Please select a user."); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": "current-user" },
        body: JSON.stringify({ sharedWithUserId: selected.id, permission }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSent(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share.");
    } finally {
      setSending(false);
    }
  }, [selected, permission, workflowId, onClose]);

  const showDropdown = query.trim().length > 0 && !selected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 400, background: "#ffffff", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Share Workflow
            </p>
            <p className="text-xs mt-0.5 truncate max-w-[300px]" style={{ color: "var(--text-muted)" }}>
              {workflowName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">

          {/* User search */}
          <div className="relative">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Share with
            </label>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setError(null); }}
                placeholder="Search by name or username…"
                className="w-full text-xs rounded-lg pl-8 pr-3 py-2 outline-none"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div
                className="absolute left-0 right-0 z-10 rounded-lg overflow-hidden mt-1 shadow-lg"
                style={{ background: "#ffffff", border: "1px solid var(--border)", maxHeight: 200, overflowY: "auto" }}
              >
                {filtered.length === 0 ? (
                  <p className="text-xs px-3 py-2.5" style={{ color: "var(--text-muted)" }}>
                    No users found
                  </p>
                ) : (
                  filtered.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleSelect(u)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/4"
                    >
                      {/* Avatar initial */}
                      <span
                        className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
                        style={{ width: 28, height: 28, background: "rgba(40,145,218,0.12)", color: "#2891DA" }}
                      >
                        {u.name[0]}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                          {u.name}
                        </span>
                        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                          @{u.username} · {u.role}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected user chip */}
          {selected && (
            <div
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: "rgba(40,145,218,0.07)", border: "1px solid rgba(40,145,218,0.2)" }}
            >
              <UserCheck size={13} style={{ color: "#2891DA", flexShrink: 0 }} />
              <span className="text-xs font-medium flex-1" style={{ color: "#2891DA" }}>
                {selected.name}
                <span className="font-normal ml-1" style={{ color: "var(--text-muted)" }}>
                  @{selected.username}
                </span>
              </span>
              <button
                onClick={() => { setSelected(null); setQuery(""); }}
                className="p-0.5 rounded hover:bg-black/8 transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={11} />
              </button>
            </div>
          )}

          {/* Permission selector */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Permission
            </label>
            <div className="flex gap-2">
              {(["view", "edit"] as SharePermission[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPermission(p)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors"
                  style={
                    permission === p
                      ? { background: "#2891DA", color: "#fff", border: "1px solid #2891DA" }
                      : { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }
                  }
                >
                  {p === "view" ? "View only" : "Can edit"}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent || !selected}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: sent ? "#22c55e" : "#2891DA",
              color: "#fff",
              opacity: (!selected || sending) ? 0.6 : 1,
              cursor: (!selected || sending) ? "default" : "pointer",
            }}
          >
            {sent ? (
              <><Check size={12} /> Shared!</>
            ) : sending ? (
              <><span className="animate-spin" style={{ display: "block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> Sharing…</>
            ) : (
              <><Share2 size={12} /> Share</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent icon maps ───────────────────────────────────────────────────────────

const AGENT_ICONS: Record<string, LucideIcon> = {
  "sri-forecast":   TrendingUp,
  "sri-clustering": Layers,
  "sri-mtree":      GitFork,
  "sri-causal":     GitPullRequestArrow,
  prophet:          TrendingUp,
  sarima:           Activity,
  xgboost:          Cpu,
  gmm:              Layers,
  kmeans:           Layers,
  output:           FileText,
};

function ChainBadge({ chain }: { chain: WorkflowCardType["agentChain"] }) {
  return (
    <div className="flex items-center gap-1.5">
      {chain.map((step, i) => {
        const Icon = AGENT_ICONS[step.type] ?? TrendingUp;
        return (
          <span key={step.id} className="flex items-center gap-1.5">
            <span
              className="flex items-center justify-center w-6 h-6 rounded"
              style={{ background: "var(--bg-tertiary)" }}
              title={step.label}
            >
              <Icon size={13} style={{ color: "#111111" }} strokeWidth={1.5} />
            </span>
            {i < chain.length - 1 && (
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>→</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface WorkflowCardProps {
  workflow: WorkflowCardType;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function WorkflowCardComponent({ workflow, onDuplicate, onDelete }: WorkflowCardProps) {
  const [showShare,  setShowShare]  = useState(false);
  const [duplicated, setDuplicated] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const el = titleRef.current;
    if (el) setIsTruncated(el.scrollWidth > el.clientWidth);
  });

  const activeRun = useActiveRun(workflow.id);
  const lastRun   = useLastRun(workflow.id);
  const isRunning = !!activeRun;

  const displayLastRun  = lastRun ? fmtRelativeTime(lastRun.completedAt) : workflow.lastRun;
  const displayRunCount = lastRun && lastRun.status !== "aborted"
    ? workflow.runCount + 1
    : workflow.runCount;

  const handleDuplicate = () => {
    onDuplicate?.(workflow.id);
    setDuplicated(true);
    setTimeout(() => setDuplicated(false), 1500);
  };

  return (
    <>
      <div
        className="rounded-xl p-4 flex flex-col gap-3 transition-all hover:shadow-sm"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        {/* Header + body */}
        <div className="flex items-start gap-2">
          <Zap size={18} className="shrink-0 mt-0.5" style={{ color: "var(--accent)", fill: "var(--accent)" }} strokeWidth={1.5} />

          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <h3
                ref={titleRef}
                className="text-sm font-semibold truncate min-w-0"
                style={{ color: "var(--text-primary)" }}
                title={isTruncated ? workflow.name : undefined}
              >
                {workflow.name}
              </h3>
              {isRunning ? (
                <span
                  className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(40,145,218,0.08)", color: "#2891DA", border: "1px solid rgba(40,145,218,0.25)" }}
                >
                  <span className="animate-spin shrink-0" style={{
                    display: "block", width: 10, height: 10, borderRadius: "50%",
                    border: "2px solid rgba(40,145,218,0.2)", borderTopColor: "#2891DA",
                  }} />
                  Running…
                </span>
              ) : (
                <span
                  className="text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(5,150,105,0.08)", color: "var(--success)", border: "1px solid rgba(5,150,105,0.2)" }}
                >
                  Success
                </span>
              )}
            </div>

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {workflow.description}
            </p>

            <ChainBadge chain={workflow.agentChain} />

            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {workflow.schedule === "auto" ? (
                  <><RefreshCw size={11} />Auto — {workflow.scheduleLabel}</>
                ) : (
                  <><Calendar size={11} />Manual-Update</>
                )}
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Last run: {displayLastRun} · #{displayRunCount} runs
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-stretch gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>

          <div className="flex gap-2">
            {isRunning ? (
              <button
                onClick={() => runStore.abortRun(workflow.id)}
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                style={{ background: "#DC2626", color: "white", width: 90, minHeight: 72 }}
                title="Abort running workflow"
              >
                <Square size={15} fill="white" />
                Abort
              </button>
            ) : (
              <Link
                href={`/workflows/${workflow.id}/edit`}
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                style={{ background: "#2891DA", color: "white", width: 90, minHeight: 72 }}
              >
                <Play size={15} fill="white" />
                Run Now
              </Link>
            )}

            <div className="flex flex-col gap-2">
              <Link
                href={`/workflows/${workflow.id}/edit`}
                className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", width: 90, minHeight: 32 }}
              >
                <Edit2 size={13} />
                Edit
              </Link>
              {onDelete && (
                <button
                  onClick={() => onDelete(workflow.id)}
                  className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-red-50 flex-1"
                  style={{ color: "var(--text-muted)", border: "1px solid var(--border)", width: 90, minHeight: 32 }}
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </div>
          </div>

          {/* Right group */}
          <div className="flex flex-col gap-2 ml-auto">
            <button
              onClick={handleDuplicate}
              className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
              style={{ color: duplicated ? "var(--accent)" : "var(--text-muted)", border: `1px solid ${duplicated ? "rgba(40,145,218,0.3)" : "var(--border)"}`, width: 110, minHeight: 32 }}
            >
              <Copy size={13} />
              {duplicated ? "Duplicated!" : "Duplicate"}
            </button>
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
              style={{ color: "var(--text-muted)", border: "1px solid var(--border)", width: 110, minHeight: 32 }}
            >
              <Share2 size={13} />
              Share
            </button>
          </div>

        </div>
      </div>

      {showShare && (
        <ShareModal
          workflowId={workflow.id}
          workflowName={workflow.name}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
