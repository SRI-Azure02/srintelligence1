"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Play, Square, Edit2, Share2, Calendar, RefreshCw,
  Layers, TrendingUp, Activity, Cpu, GitFork, GitPullRequestArrow,
  FileText, Zap, Copy, Check, Trash2,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { WorkflowCard as WorkflowCardType } from "@/lib/types";
import { useActiveRun, useLastRun } from "@/lib/use-run-store";
import { runStore } from "@/lib/run-store";
import ShareModal from "@/components/workflows/ShareModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000)   return "just now";
  if (diff < 3_600_000) { const m = Math.floor(diff / 60_000);    return `${m}m ago`; }
  if (diff < 86_400_000){ const h = Math.floor(diff / 3_600_000); return `${h}h ago`; }
  return `${Math.floor(diff / 86_400_000)}d ago`;
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

  const handleRun = () => {
    const nodes = workflow.agentChain.map((step) => ({
      id:        step.id,
      agentType: step.type,
      label:     step.label,
      prompt:    step.prompt,
    }));
    runStore.startRun(workflow.id, workflow.name, nodes);
  };

  const handleDuplicate = () => {
    onDuplicate?.(workflow.id);
    setDuplicated(true);
    setTimeout(() => setDuplicated(false), 1500);
  };

  // ── Running-state derived values ───────────────────────────────────────────
  const doneCount   = activeRun ? activeRun.nodes.filter((n) => activeRun.nodeStates[n.id] === "done").length : 0;
  const totalCount  = activeRun?.nodes.length ?? 0;
  const currentNode = activeRun?.nodes.find((n) => activeRun.nodeStates[n.id] === "running");
  const pct         = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <>
      <div
        className="rounded-xl p-4 flex flex-col gap-3 transition-all hover:shadow-sm"
        style={{
          background: isRunning ? "rgba(40,145,218,0.03)" : "var(--bg-secondary)",
          border: isRunning ? "1px solid rgba(40,145,218,0.25)" : "1px solid var(--border)",
        }}
      >
        {/* ── Header: always visible ── */}
        <div className="flex items-start gap-2">
          <Zap size={18} className="shrink-0 mt-0.5"
            style={{ color: "var(--accent)", fill: "var(--accent)" }} strokeWidth={1.5} />

          <div className="flex-1 min-w-0 flex flex-col gap-1">
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
                <span className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(40,145,218,0.08)", color: "#2891DA", border: "1px solid rgba(40,145,218,0.25)" }}>
                  <span className="animate-spin shrink-0" style={{
                    display: "block", width: 10, height: 10, borderRadius: "50%",
                    border: "2px solid rgba(40,145,218,0.2)", borderTopColor: "#2891DA",
                  }} />
                  Running…
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: "rgba(5,150,105,0.08)", color: "var(--success)", border: "1px solid rgba(5,150,105,0.2)" }}>
                  Success
                </span>
              )}
            </div>

            {/* Description — hide when running to make room for progress */}
            {!isRunning && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {workflow.description}
              </p>
            )}
          </div>
        </div>

        {/* ── Running body: node pipeline + progress bar ── */}
        {isRunning && activeRun ? (
          <div className="flex flex-col gap-2.5">
            {/* Node icons with state badges */}
            <div className="flex flex-wrap gap-1.5">
              {activeRun.nodes.map((node) => {
                const state     = activeRun.nodeStates[node.id] ?? "pending";
                const Icon      = AGENT_ICONS[node.agentType] ?? TrendingUp;
                const isDone    = state === "done";
                const isActive  = state === "running";
                const isPending = state === "pending";
                return (
                  <span key={node.id} className="relative flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{
                      background: isDone   ? "rgba(34,197,94,0.12)"
                        : isActive ? "rgba(40,145,218,0.12)"
                        : "var(--bg-tertiary)",
                    }}
                    title={node.label}>
                    <Icon size={15} strokeWidth={1.6} style={{
                      color:   isDone   ? "#22c55e"
                        : isActive ? "#2891DA"
                        : "var(--text-muted)",
                      opacity: isPending ? 0.35 : 1,
                    }} />
                    {/* done badge */}
                    {isDone && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                        style={{ background: "#22c55e" }}>
                        <Check size={8} strokeWidth={3} style={{ color: "#fff" }} />
                      </span>
                    )}
                    {/* running spinner */}
                    {isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5">
                        <span className="animate-spin block w-3.5 h-3.5 rounded-full"
                          style={{ border: "1.5px solid rgba(40,145,218,0.2)", borderTopColor: "#2891DA" }} />
                      </span>
                    )}
                  </span>
                );
              })}
            </div>

            {/* Current step label */}
            <p className="text-xs font-medium" style={{ color: "#2891DA" }}>
              {currentNode ? `Running: ${currentNode.label}` : "Finishing up…"}
            </p>

            {/* Progress bar */}
            <div>
              <div className="rounded-full overflow-hidden" style={{ height: 5, background: "rgba(40,145,218,0.1)" }}>
                <div className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, background: "#2891DA" }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{doneCount} of {totalCount} nodes</span>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>{pct}%</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Idle body: chain + meta ── */
          <>
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
          </>
        )}

        {/* ── Actions ── */}
        {isRunning ? (
          /* Running: single full-width Abort button */
          <div className="pt-2" style={{ borderTop: "1px solid rgba(40,145,218,0.15)" }}>
            <button
              onClick={() => runStore.abortRun(workflow.id)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
              style={{ background: "#DC2626", color: "white" }}>
              <Square size={13} fill="white" strokeWidth={0} />
              Abort Run
            </button>
          </div>
        ) : (
          /* Idle: full button set */
          <div className="flex items-stretch gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex gap-2">
              <button
                onClick={handleRun}
                className="flex flex-col items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
                style={{ background: "#2891DA", color: "white", width: 90, minHeight: 72 }}>
                <Play size={15} fill="white" strokeWidth={0} />
                Run
              </button>

              <div className="flex flex-col gap-2">
                <Link
                  href={`/workflows/${workflow.id}/edit`}
                  className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
                  style={{ color: "var(--text-secondary)", border: "1px solid var(--border)", width: 90, minHeight: 32 }}>
                  <Edit2 size={13} />
                  Edit
                </Link>
                {onDelete && (
                  <button
                    onClick={() => onDelete(workflow.id)}
                    className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-red-50 flex-1"
                    style={{ color: "var(--text-muted)", border: "1px solid var(--border)", width: 90, minHeight: 32 }}>
                    <Trash2 size={13} />
                    Delete
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 ml-auto">
              <button
                onClick={handleDuplicate}
                className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
                style={{ color: duplicated ? "var(--accent)" : "var(--text-muted)", border: `1px solid ${duplicated ? "rgba(40,145,218,0.3)" : "var(--border)"}`, width: 110, minHeight: 32 }}>
                <Copy size={13} />
                {duplicated ? "Duplicated!" : "Duplicate"}
              </button>
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border)", width: 110, minHeight: 32 }}>
                <Share2 size={13} />
                Share
              </button>
            </div>
          </div>
        )}
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
