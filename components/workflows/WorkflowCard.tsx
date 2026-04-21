"use client";

import { useState } from "react";
import Link from "next/link";
import { Play, Square, Edit2, Share2, Calendar, RefreshCw, Layers, TrendingUp, Activity, Cpu, GitFork, GitPullRequestArrow, FileText, Zap, Copy, Check, Trash2, Loader2 } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { WorkflowCard as WorkflowCardType } from "@/lib/types";
import { useActiveRun } from "@/lib/use-run-store";
import { runStore } from "@/lib/run-store";

const AGENT_ICONS: Record<string, LucideIcon> = {
  "sri-forecast":   TrendingUp,
  "sri-clustering": Layers,
  "sri-mtree":      GitFork,
  "sri-causal":     GitPullRequestArrow,
  // sub-types
  prophet:          TrendingUp,
  sarima:           Activity,
  xgboost:          Cpu,
  gmm:              Layers,
  kmeans:           Layers,
  output:           FileText,
};

const AGENT_COLORS: Record<string, string> = {
  "sri-forecast":   "#34c98b",
  "sri-clustering": "#a78bfa",
  "sri-mtree":      "#fb923c",
  "sri-causal":     "#8b5cf6",
  prophet:          "#34c98b",
  sarima:           "#34c98b",
  xgboost:          "#f5a623",
  gmm:              "#a78bfa",
  kmeans:           "#a78bfa",
  output:           "#64748b",
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

interface WorkflowCardProps {
  workflow: WorkflowCardType;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export default function WorkflowCardComponent({ workflow, onDuplicate, onDelete }: WorkflowCardProps) {
  const [shared, setShared] = useState(false);
  const [duplicated, setDuplicated] = useState(false);
  const activeRun = useActiveRun(workflow.id);
  const isRunning = !!activeRun;

  const handleShare = () => {
    const url = `${window.location.origin}/workflows/${workflow.id}/edit`;
    navigator.clipboard.writeText(url).then(() => {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    });
  };

  const handleDuplicate = () => {
    onDuplicate?.(workflow.id);
    setDuplicated(true);
    setTimeout(() => setDuplicated(false), 1500);
  };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 transition-all hover:shadow-sm"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      {/* Header + body: icon pinned left, all content aligned in one column */}
      <div className="flex items-start gap-2">
        <Zap size={18} className="shrink-0 mt-0.5" style={{ color: "var(--accent)", fill: "var(--accent)" }} strokeWidth={1.5} />

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {workflow.name}
            </h3>
            {isRunning ? (
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0"
                style={{ background: "rgba(40,145,218,0.08)", color: "#2891DA", border: "1px solid rgba(40,145,218,0.25)" }}
              >
                <Loader2 size={10} className="animate-spin" />
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

          {/* Description */}
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {workflow.description}
          </p>

          {/* Agent chain */}
          <ChainBadge chain={workflow.agentChain} />

          {/* Meta */}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {workflow.schedule === "auto" ? (
                <><RefreshCw size={11} />Auto — {workflow.scheduleLabel}</>
              ) : (
                <><Calendar size={11} />Manual-Update</>
              )}
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Last run: {workflow.lastRun} · #{workflow.runCount} runs
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-stretch gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>

        {/* Left group: Run Now / Abort (tall) + Edit/Delete stacked */}
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

        {/* Right group: Duplicate + Share stacked, pushed to the right */}
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
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-black/5 flex-1"
            style={{ color: shared ? "var(--success)" : "var(--text-muted)", border: `1px solid ${shared ? "rgba(5,150,105,0.3)" : "var(--border)"}`, width: 110, minHeight: 32 }}
          >
            {shared ? <Check size={13} /> : <Share2 size={13} />}
            {shared ? "Copied!" : "Share"}
          </button>
        </div>

      </div>
    </div>
  );
}
